import { verifyToken, addCorsHeaders, isAdmin, logAdminAction } from '../utils.js';
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        const user = await getUser(request, env);
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (request.method === 'GET') {
            return await handleGetLogs(request, env);
        } else if (request.method === 'DELETE') {
            return await handleCleanupLogs(request, env);
        } else {
            return new Response('方法不被允许', { status: 405, headers: addCorsHeaders() });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}
async function getUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!payload) return null;
    return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
}
async function handleGetLogs(request, env) {
    const MAX_LIMIT = 500;
    const logs = await env.DB.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT ?').bind(MAX_LIMIT).all();
    return new Response(JSON.stringify({
        success: true,
        data: logs.results,
        totalItems: logs.results.length
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handleCleanupLogs(request, env) {
    const result = await env.DB.prepare("DELETE FROM admin_logs WHERE created_at < date('now', '-3 days')").run();
    await logAdminAction(env, 'cleanup_logs', 'system', null, '清理审计日志', JSON.stringify({ deleted_count: result.meta.changes }));
    return new Response(JSON.stringify({
        success: true,
        message: `清理完成。删除了 ${result.meta.changes} 条旧日志。`,
        deleted: result.meta.changes
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
