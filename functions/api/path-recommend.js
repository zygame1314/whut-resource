import { verifyToken, addCorsHeaders } from '../utils.js';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL = 'gpt-oss-120b';
const SYSTEM_PROMPT = `你是武汉理工大学资源共享平台的文件归档助手。你的任务是根据文件名和搜索到的相似文件路径，推断该文件最适合存放的目录。
    请分析文件名中的关键词（如课程名、年份、类型），并从提供的参考路径中选择一个最匹配的。
    如果参考路径都不合适，或者没有参考路径，你可以尝试根据文件名推断一个标准路径（例如：若文件名含"高等数学"，路径可能是"0.课程资料/基础课/高等数学"）。
    【重要规则】
    1. 必须只返回一个路径字符串，严禁包含任何Markdown标记、代码块符号、解释或无关字符。
    2. 如果有多个相似的参考路径（如"有机化学B"和"有机化学C"），而文件名（如"有机化学"）无法区分，请优先选择其中一个作为父类或者选择最通用的现有路径。绝对不要返回空值。`;
export async function onRequestPost(context) {
    const { request, env } = context;
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
        if (validFileNames.length === 0) {
            return new Response(JSON.stringify({ error: '无效的文件名' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        let candidatePaths = [];
        if (env.AI && env.VECTORIZE) {
            try {
                const searchTargets = validFileNames.slice(0, 3);
                const embeddingResponse = await env.AI.run('@cf/baai/bge-m3', {
                    text: searchTargets
                });
                if (embeddingResponse?.data) {
                    const queryPromises = embeddingResponse.data.map(vector =>
                        env.VECTORIZE.query(vector, { topK: 20, returnMetadata: 'all' })
                    );
                    const results = await Promise.all(queryPromises);
                    const allMatches = results.flatMap(r => r.matches || []);
                    const paths = allMatches
                        .map(m => {
                            const fullPath = m.metadata?.path;
                            if (!fullPath) return null;
                            const lastSlash = fullPath.lastIndexOf('/');
                            return lastSlash > -1 ? fullPath.substring(0, lastSlash) : '';
                        })
                        .filter(p => p && p.length > 0);
                    candidatePaths = [...new Set(paths)];
                }
            } catch (e) {
                console.error('向量搜索失败:', e);
            }
        }
        const cerebrasKey = env.CEREBRAS_API_KEY;
        if (!cerebrasKey) {
            throw new Error('服务器配置错误: 缺少 API Key');
        }
        const userMessage = `文件名列表: ${JSON.stringify(validFileNames)}
            参考路径: ${JSON.stringify(candidatePaths)}
            请推荐一个能包含这些文件的最佳公共存储路径。`;
        const response = await fetch(CEREBRAS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cerebrasKey}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.1,
                max_tokens: 100
            })
        });
        if (!response.ok) {
            throw new Error(`AI API failed: ${response.status}`);
        }
        const aiData = await response.json();
        const suggestedPath = aiData.choices?.[0]?.message?.content?.trim() || '';
        let cleanPath = suggestedPath.replace(/```/g, '').trim();
        if (!cleanPath && candidatePaths.length > 0) {
            const sorted = [...candidatePaths].sort((a, b) => a.length - b.length);
            cleanPath = sorted[0];
        }
        return new Response(JSON.stringify({
            success: true,
            path: cleanPath,
            candidates: candidatePaths
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
