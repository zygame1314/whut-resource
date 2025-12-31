import { verifyToken, addCorsHeaders } from '../utils.js';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL = 'gpt-oss-120b';
const CACHE_ID = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SYSTEM_PROMPT = `你是武汉理工大学资源共享平台的文件归档助手。你的任务是根据给定的所有可用目录列表，为用户上传的文件选择一个最匹配的目录。
    核心规则：
    1. 只返回编号：我给你的列表每一行都有一个 ID（例如 "12. 课程资料/..."）。你仔细分析后，仅返回该行的数字 ID（例如 "12"）。
    2. 严禁废话：不要返回路径文字，不要写解释，只要那个数字。
    3. 智能匹配：你需要理解大学课程的常见简称和缩写。例如：
       - "毛概" = "毛泽东思想和中国特色社会主义理论体系概论"
       - "高数" = "高等数学"
       - "大物" = "大学物理"
       - "线代" = "线性代数"
       - "概率论" = "概率论与数理统计"
       - "马原" = "马克思主义基本原理"
       - "近代史" = "中国近现代史纲要"
       - "思修" = "思想道德与法治"
       根据文件名的语义去匹配目录，而不是简单的字符串匹配。
    4. 兜底：如果实在找不到匹配的，返回 "0"（代表无匹配）。`;
export async function onRequestPost({ request, env }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: '未授权' }), {
                status: 401,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const token = authHeader.substring(7);
        const user = await verifyToken(token, env.JWT_SECRET || 'secret');
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const { fileNames } = await request.json();
        if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
            return new Response(JSON.stringify({ error: '文件名列表不能为空' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const validFileNames = fileNames.slice(0, 5).filter(n => typeof n === 'string' && n.trim().length > 0);
        let allDirs = [];
        let cacheHit = false;
        try {
            const cacheRecord = await env.DB.prepare('SELECT data, updated_at FROM system_cache WHERE id = ?').bind(CACHE_ID).first();
            if (cacheRecord && cacheRecord.data) {
                const updatedAt = new Date(cacheRecord.updated_at + 'Z').getTime();
                const now = Date.now();
                if ((now - updatedAt) < CACHE_TTL_MS) {
                    allDirs = JSON.parse(cacheRecord.data);
                    cacheHit = true;
                }
            }
            if (!cacheHit) {
                const res = await env.DB.prepare('SELECT key FROM files WHERE is_directory = TRUE ORDER BY key ASC').all();
                allDirs = (res.results || []).map(r => r.key);
                const jsonStr = JSON.stringify(allDirs);
                await env.DB.prepare(`
                    INSERT OR REPLACE INTO system_cache(id, data, updated_at)
                    VALUES(?, ?, CURRENT_TIMESTAMP)
                `).bind(CACHE_ID, jsonStr).run();
            }
        } catch (e) {
            console.error('缓存/数据库错误:', e);
        }
        if (allDirs.length === 0) {
            const fallbackResult = await env.DB.prepare('SELECT key FROM files WHERE is_directory = TRUE ORDER BY key ASC LIMIT 500').all();
            allDirs = (fallbackResult.results || []).map(r => r.key);
        }
        if (allDirs.length === 0) {
            return new Response(JSON.stringify({ success: true, path: '' }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const maxDirs = 800;
        const dirsToProcess = allDirs.slice(0, maxDirs);
        const numberedList = dirsToProcess.map((dir, index) => `${index + 1}. ${dir} `).join('\n');
        const cerebrasKey = env.CEREBRAS_API_KEY;
        const userMessage = `
            用户上传的文件：${JSON.stringify(validFileNames)}
            可用目录列表：
            ${numberedList}
            请返回最佳路径的【纯数字编号】：`;
        const response = await fetch(CEREBRAS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cerebrasKey} `
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.1,
                max_tokens: 10
            })
        });
        if (!response.ok) {
            throw new Error(`AI API Error: ${response.status} `);
        }
        const aiData = await response.json();
        const content = aiData.choices?.[0]?.message?.content?.trim() || '';

        // === DEBUG LOGS START ===
        console.log('=== AI Path Recommend Debug ===');
        console.log('File names:', validFileNames);
        console.log('Total dirs in list:', dirsToProcess.length);
        console.log('First 5 dirs:', dirsToProcess.slice(0, 5));
        console.log('AI raw response:', content);
        // === DEBUG LOGS END ===

        const match = content.match(/(\d+)/);
        let suggestedPath = '';
        if (match) {
            const id = parseInt(match[1]);
            console.log('Parsed ID:', id);
            if (id > 0 && id <= dirsToProcess.length) {
                suggestedPath = dirsToProcess[id - 1];
                console.log('Matched path:', suggestedPath);
            } else {
                console.log('ID out of range or zero');
            }
        } else {
            console.log('No number found in AI response');
        }
        return new Response(JSON.stringify({
            success: true,
            path: suggestedPath,
            cache_hit: cacheHit
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
