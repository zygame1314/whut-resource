import { verifyToken, addCorsHeaders } from '../utils.js';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL = 'gpt-oss-120b';
const KEYWORD_PROMPT = `你是一个大学课程搜索助手。用户会给你一些文件名，你需要提取或推断出最可能的课程全称用于搜索。
    规则：
    1. 理解大学生常用缩写：大物=大学物理、高数=高等数学、毛概=毛泽东思想和中国特色社会主义理论体系概论、线代=线性代数、马原=马克思主义基本原理、近代史=中国近现代史纲要、思修=思想道德与法治、概率论=概率论与数理统计
    2. 只返回1-3个搜索关键词，用空格分隔，每个关键词至少3个字符
    3. 不要解释，只返回关键词`;
const PICK_PROMPT = `你是文件归档助手。根据用户要上传的文件，从搜索结果中选择最合适的目录。
    规则：
    1. 只返回目录编号（如 "3"）
    2. 如果有多个相关目录，选择最具体的那个（如有"试卷"子目录就选它）
    3. 如果都不合适，返回 "0"`;
export async function onRequestPost({ request, env }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const token = authHeader.substring(7);
        const user = await verifyToken(token, env.JWT_SECRET || 'secret');
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const { fileNames } = await request.json();
        if (!fileNames || !fileNames.length) {
            return new Response(JSON.stringify({ error: '文件名为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const validFileNames = fileNames.slice(0, 5).filter(n => typeof n === 'string' && n.trim().length > 0);
        const cerebrasKey = env.CEREBRAS_API_KEY;
        const keywordResponse = await fetch(CEREBRAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cerebrasKey}` },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: KEYWORD_PROMPT },
                    { role: 'user', content: `文件名：${validFileNames.join(', ')}` }
                ],
                temperature: 0.1,
                max_tokens: 512
            })
        });
        if (!keywordResponse.ok) throw new Error(`关键词提取接口错误: ${keywordResponse.status}`);
        const keywordData = await keywordResponse.json();
        const keywords = keywordData.choices?.[0]?.message?.content?.trim() || validFileNames.join(' ');
        let directories = [];
        try {
            const searchTerms = keywords.split(/\s+/).filter(k => k.length >= 3);
            const ftsQuery = searchTerms.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
            const ftsResult = await env.DB.prepare(`
                SELECT DISTINCT f.key, f.name FROM files f
                JOIN files_fts ON f.id = files_fts.rowid
                WHERE files_fts MATCH ? AND f.is_directory = TRUE
                ORDER BY rank
                LIMIT 20
            `).bind(ftsQuery).all();
            directories = (ftsResult.results || []).map(r => r.key);
        } catch (e) {
            console.error('FTS search failed:', e);
        }
        if (directories.length === 0) {
            const searchTerms = keywords.split(/\s+/).filter(k => k.length >= 3);
            for (const term of searchTerms) {
                const likeResult = await env.DB.prepare(`
                    SELECT key FROM files 
                    WHERE is_directory = TRUE AND key LIKE ? 
                    ORDER BY key 
                    LIMIT 15
                `).bind(`%${term}%`).all();
                directories.push(...(likeResult.results || []).map(r => r.key));
            }
            directories = [...new Set(directories)].slice(0, 20);
        }
        if (directories.length === 0) {
            return new Response(JSON.stringify({ success: true, path: '', message: '未找到匹配的目录' }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const numberedList = directories.map((dir, i) => `${i + 1}. ${dir}`).join('\n');
        const pickResponse = await fetch(CEREBRAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cerebrasKey}` },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: PICK_PROMPT },
                    { role: 'user', content: `文件：${validFileNames.join(', ')}\n\n搜索到的目录：\n${numberedList}\n\n请返回最佳目录的编号：` }
                ],
                temperature: 0.1,
                max_tokens: 256
            })
        });
        if (!pickResponse.ok) throw new Error(`目录推荐接口错误: ${pickResponse.status}`);
        const pickData = await pickResponse.json();
        const pickContent = pickData.choices?.[0]?.message?.content?.trim() || '';
        const match = pickContent.match(/(\d+)/);
        let suggestedPath = '';
        if (match) {
            const id = parseInt(match[1]);
            if (id > 0 && id <= directories.length) {
                suggestedPath = directories[id - 1];
            }
        }
        return new Response(JSON.stringify({
            success: true,
            path: suggestedPath,
            keywords: keywords,
            candidates: directories.length
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (error) {
        console.error('路径推荐错误:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { headers: addCorsHeaders() });
}
