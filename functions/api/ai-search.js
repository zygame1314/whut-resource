const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL_SEARCH = 'llama3.1-8b';
const SEARCH_PROMPT = `你是一个大学课程资源搜索助手。必须将用户的【搜索词】转化为【标准课程名】。
    规则：
    1. 修正缩写：大物→大学物理、高数→高等数学、毛概→毛泽东思想、线代→线性代数、马原→马克思主义、近代史→中国近现代史、思修→思想道德、概率论→概率论
    2. 生成关键词：
       - 返回2-3个最相关的搜索词
       - 必须保留课程后缀（A/B、(一)、1）
       - 每个关键词必须≥2个字符
       - 用空格分隔
    3. 严禁废话，只返回关键词字符串
    示例：
    输入："搜一下大物期末" -> 输出："大学物理 期末试卷"
    输入："求高数下" -> 输出："高等数学(下) 高等数学A"`;
export async function onRequestGet({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    if (!query || query.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: '缺少搜索关键词' }), {
            status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const DB = env.DB;
    const cerebrasKey = env.CEREBRAS_API_KEY;
    try {
        let finalKeywords = query;
        try {
            const llmResponse = await fetch(CEREBRAS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cerebrasKey}` },
                body: JSON.stringify({
                    model: MODEL_SEARCH,
                    messages: [
                        { role: 'system', content: SEARCH_PROMPT },
                        { role: 'user', content: query }
                    ],
                    temperature: 0.1,
                    max_tokens: 1024
                })
            });
            if (llmResponse.ok) {
                const llmData = await llmResponse.json();
                const content = llmData.choices?.[0]?.message?.content?.trim();
                if (content) finalKeywords = content;
            }
        } catch (e) {
            console.error('LLM 扩展关键词失败，使用原始查询:', e);
        }
        let results = [];
        const searchTerms = finalKeywords.split(/\s+/).filter(k => k.length >= 2);
        if (searchTerms.length > 0) {
            const ftsTerms = searchTerms.filter(k => k.length >= 3);
            if (ftsTerms.length > 0) {
                const ftsQuery = ftsTerms.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
                try {
                    const ftsResult = await DB.prepare(`
                        SELECT f.id, f.name, f.key, f.parent_path, f.is_directory 
                        FROM files f
                        JOIN files_fts ON f.id = files_fts.rowid
                        WHERE files_fts MATCH ?
                        ORDER BY rank
                        LIMIT 20
                    `).bind(ftsQuery).all();
                    results = ftsResult.results || [];
                } catch (e) { console.error('FTS 搜索失败', e); }
            }
            if (results.length === 0) {
                for (const term of searchTerms) {
                    const likeResult = await DB.prepare(`
                        SELECT id, name, key, parent_path, is_directory 
                        FROM files 
                        WHERE name LIKE ? 
                        ORDER BY is_directory DESC, name ASC
                        LIMIT 15
                    `).bind(`%${term}%`).all();
                    results.push(...(likeResult.results || []));
                }
            }
        }
        const seen = new Set();
        const uniqueResults = [];
        for (const r of results) {
            if (!seen.has(r.id)) {
                seen.add(r.id);
                uniqueResults.push(r);
            }
        }
        const directories = uniqueResults.filter(f => f.is_directory).slice(0, 20);
        const files = uniqueResults.filter(f => !f.is_directory).slice(0, 30);
        return new Response(JSON.stringify({
            success: true,
            files: files,
            directories: directories,
            keywords: finalKeywords,
            totalItems: uniqueResults.length,
            isAISearch: true
        }), {
            status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (error) {
        console.error('AI 搜索出错:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
