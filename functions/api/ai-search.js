import { verifyToken, addCorsHeaders } from '../utils.js';
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
    const topK = parseInt(url.searchParams.get('topK') || '20');
    if (!query || query.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: '缺少搜索关键词' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    const AI = env.AI;
    const VECTORIZE = env.VECTORIZE;
    if (!DB || !AI || !VECTORIZE) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误（缺少 DB/AI/VECTORIZE 绑定）' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const embeddingResponse = await AI.run('@cf/baai/bge-m3', {
            text: [query.trim()]
        });
        if (!embeddingResponse || !embeddingResponse.data || !embeddingResponse.data[0]) {
            throw new Error('AI 嵌入生成失败');
        }
        const queryVector = embeddingResponse.data[0];
        const vectorResults = await VECTORIZE.query(queryVector, {
            topK: topK,
            returnMetadata: 'all'
        });
        if (!vectorResults || !vectorResults.matches || vectorResults.matches.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                message: '未找到相关文件'
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const fileIds = vectorResults.matches.map(m => parseInt(m.id));
        const scoreMap = {};
        vectorResults.matches.forEach(m => {
            scoreMap[m.id] = m.score;
        });
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
            totalItems: filesWithScores.length,
            isAISearch: true
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    } catch (error) {
        console.error('AI 搜索错误:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'AI 搜索失败: ' + error.message
        }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
