import { verifyToken, addCorsHeaders } from '../utils.js';
const BATCH_SIZE = 50;
export async function onRequestPost({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: '未授权：需要管理员权限' }), {
            status: 401,
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
        const body = await request.json().catch(() => ({}));
        const offset = parseInt(body.offset || '0');
        const forceRebuild = body.forceRebuild || false;
        const countResult = await DB.prepare('SELECT COUNT(*) as total FROM files WHERE is_directory = FALSE').first();
        const totalFiles = countResult?.total || 0;
        if (totalFiles === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: '没有文件需要索引',
                indexed: 0,
                total: 0,
                completed: true
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const filesResult = await DB.prepare(
            'SELECT id, name FROM files WHERE is_directory = FALSE ORDER BY id LIMIT ? OFFSET ?'
        ).bind(BATCH_SIZE, offset).all();
        const files = filesResult.results || [];
        if (files.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: '索引完成',
                indexed: offset,
                total: totalFiles,
                completed: true
            }), {
                status: 200,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const fileNames = files.map(f => f.name);
        const embeddingResponse = await AI.run('@cf/baai/bge-m3', {
            text: fileNames
        });
        if (!embeddingResponse || !embeddingResponse.data || embeddingResponse.data.length !== files.length) {
            throw new Error('AI 嵌入生成失败或数量不匹配');
        }
        const vectors = files.map((file, index) => ({
            id: file.id.toString(),
            values: embeddingResponse.data[index],
            metadata: {
                name: file.name
            }
        }));
        await VECTORIZE.upsert(vectors);
        const processedCount = offset + files.length;
        const isCompleted = processedCount >= totalFiles;
        return new Response(JSON.stringify({
            success: true,
            message: isCompleted ? '索引完成' : '批次处理完成，请继续调用以处理剩余文件',
            indexed: processedCount,
            total: totalFiles,
            completed: isCompleted,
            nextOffset: isCompleted ? null : processedCount
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    } catch (error) {
        console.error('重建索引错误:', error);
        return new Response(JSON.stringify({
            success: false,
            error: '重建索引失败: ' + error.message
        }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestGet({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: '未授权：需要管理员权限' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    const VECTORIZE = env.VECTORIZE;
    if (!DB || !VECTORIZE) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const countResult = await DB.prepare('SELECT COUNT(*) as total FROM files WHERE is_directory = FALSE').first();
        const totalFiles = countResult?.total || 0;
        const indexInfo = await VECTORIZE.describe();
        return new Response(JSON.stringify({
            success: true,
            totalFiles: totalFiles,
            indexInfo: indexInfo
        }), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    } catch (error) {
        console.error('获取索引状态错误:', error);
        return new Response(JSON.stringify({
            success: false,
            error: '获取状态失败: ' + error.message
        }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
