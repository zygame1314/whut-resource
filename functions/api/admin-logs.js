import { verifyToken, addCorsHeaders, isAdmin, logAdminAction } from '../utils.js';

const ACTION_LABELS = {
    create_announcement: '创建公告',
    update_announcement: '编辑公告',
    delete_announcement: '删除公告',
    delete_guestbook: '删除留言',
    edit_guestbook: '编辑留言',
    hide: '隐藏留言',
    unhide: '取消隐藏留言',
    pin: '置顶留言',
    unpin: '取消置顶留言',
    resolve: '标记为已解决',
    unresolve: '标记为未解决',
    reject: '驳回留言',
    unreject: '取消驳回留言',
    ban_user: '封禁用户',
    unban_user: '解封用户',
    promote_admin: '提升为管理员',
    demote_admin: '降级为普通用户',
    approve_request: '批准请求',
    reject_request: '拒绝请求',
    update_link_url: '更新链接地址',
    update_description: '更新文件夹描述',
    rename_file: '重命名文件',
    rename_folder: '重命名文件夹',
    move_file: '移动文件',
    move_folder: '移动文件夹',
    delete_folder: '删除文件夹',
    delete_file: '删除文件',
    delete_link: '删除链接',
    create_file: '上传文件',
    create_link: '创建链接',
    delete_boost: '删除评论',
    enable_maintenance: '开启维护模式',
    disable_maintenance: '关闭维护模式',
    cleanup_logs: '清理审计日志',
    sync_init: '同步初始化',
    sync_process: '同步处理',
    sync_cleanup: '同步清理',
    sync_repair: '同步修复目录',
    reindex: '重建索引',
    retry_failed: '重试失败向量',
    clear_failures: '清理失败记录',
    ai_reject: 'AI自动驳回',
    ai_ban_user: 'AI自动封禁',
    ai_delete: 'AI自动删除',
    ai_resolve: 'AI自动解决',
    oauth_authorize: 'OAuth授权',
    oauth_client_create: '创建OAuth客户端',
    oauth_client_delete: '删除OAuth客户端',
    oauth_client_update: '更新OAuth客户端',
    oauth_client_toggle: '切换OAuth客户端状态',
    oauth_client_reset_secret: '重置OAuth客户端密钥',
    oauth_revoke_tokens: '撤销OAuth客户端令牌',
};

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
            return await handleCleanupLogs(request, env, user);
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
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const filter = url.searchParams.get('filter') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    let query = `
        SELECT l.*,
               op.nickname as operator_nickname,
               op.email as operator_email,
               op.role as operator_role
        FROM admin_logs l
        LEFT JOIN users op ON l.operator_id = op.id
    `;
    let conditions = [];
    let params = [];
    if (cursor) {
        conditions.push('l.created_at < ?');
        params.push(cursor);
    }
    if (filter === 'ai_') {
        conditions.push("l.action LIKE 'ai_%'");
    } else if (filter) {
        conditions.push('l.target_type = ?');
        params.push(filter);
    }
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY l.created_at DESC LIMIT ?';
    params.push(limit + 1);
    const { results } = await env.DB.prepare(query).bind(...params).all();
    const hasMore = results.length > limit;
    const data = results.slice(0, limit).map(log => ({
        ...log,
        label: ACTION_LABELS[log.action] || log.action,
        operator: log.operator_id ? {
            id: log.operator_id,
            nickname: log.operator_nickname || '已注销',
            email: log.operator_email || 'N/A',
            role: log.operator_role || 'unknown'
        } : null
    }));
    const nextCursor = hasMore ? data[data.length - 1].created_at : null;
    return new Response(JSON.stringify({
        success: true,
        data,
        nextCursor,
        hasMore
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handleCleanupLogs(request, env, user) {
    const result = await env.DB.prepare("DELETE FROM admin_logs WHERE created_at < date('now', '-3 days')").run();
    await logAdminAction(env, user.id, 'cleanup_logs', 'system', null, '清理审计日志', JSON.stringify({ deleted_count: result.meta.changes }));
    return new Response(JSON.stringify({
        success: true,
        message: `清理完成。删除了 ${result.meta.changes} 条旧日志。`,
        deleted: result.meta.changes
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
