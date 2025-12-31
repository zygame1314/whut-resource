import { verifyToken, addCorsHeaders } from '../utils.js';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL_SEARCH = 'qwen-3-32b';
const SEARCH_PROMPT = `你是一个大学课程资源搜索助手。必须将用户的【搜索词】转化为【标准课程名】。
    规则：
    1. 修正缩写：大物→大学物理、高数→高等数学、毛概→毛泽东思想、线代→线性代数、马原→马克思主义、近代史→中国近现代史、思修→思想道德、概率论→概率论
    2. 生成关键词：
       - 返回2-3个最相关的搜索词
       - 必须保留课程后缀（A/B、(一)、1）
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
    const topK = parseInt(url.searchParams.get('topK') || '50');
    if (!query || query.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: '缺少搜索关键词' }), {
            status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const DB = env.DB;
    const AI = env.AI;
    const VECTORIZE = env.VECTORIZE;
    const cerebrasKey = env.CEREBRAS_API_KEY;
    if (!DB || !AI || !VECTORIZE) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
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
                let content = llmData.choices?.[0]?.message?.content?.trim();
                if (content) {
                    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    finalKeywords = content;
                }
            }
        } catch (e) {
            console.error('LLM 扩展关键词失败，使用原始查询:', e);
        }
        const embeddingResponse = await AI.run('@cf/baai/bge-m3', {
            text: [finalKeywords.trim()]
        });
        if (!embeddingResponse?.data?.[0]) {
            throw new Error('AI 嵌入生成失败');
        }
        const queryVector = embeddingResponse.data[0];
        const vectorResults = await VECTORIZE.query(queryVector, {
            topK: topK,
            returnMetadata: 'all'
        });
        if (!vectorResults?.matches || vectorResults.matches.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                message: '未找到相关文件'
            }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const MIN_SCORE = 0.45;
        const validMatches = vectorResults.matches.filter(m => m.score >= MIN_SCORE);
        if (validMatches.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                message: '未找到足够相关的资源'
            }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const fileIds = validMatches.map(m => parseInt(m.id));
        const scoreMap = {};
        validMatches.forEach(m => { scoreMap[m.id] = m.score; });
        const placeholders = fileIds.map(() => '?').join(',');
        const filesResult = await DB.prepare(
            `SELECT * FROM files WHERE id IN (${placeholders})`
        ).bind(...fileIds).all();
        const filesWithScores = (filesResult.results || []).map(file => ({
            ...file,
            similarity_score: scoreMap[file.id] || 0
        }));
        filesWithScores.sort((a, b) => b.similarity_score - a.similarity_score);
        const directories = filesWithScores.filter(f => f.is_directory);
        const files = filesWithScores.filter(f => !f.is_directory);
        return new Response(JSON.stringify({
            success: true,
            files: files,
            directories: directories,
            keywords: finalKeywords,
            totalItems: filesWithScores.length,
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
