import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin } from '../utils.js';
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        const user = await getUser(request, env);
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        switch (request.method) {
            case 'GET':
                return await handleGet(request, env, user);
            case 'POST':
                return await handlePost(request, env, user);
            case 'PUT':
                return await handlePut(request, env, user);
            default:
                return new Response('方法不被允许', { status: 405, headers: addCorsHeaders() });
        }
    } catch (e) {
        console.error('Admin requests error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
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
async function handleGet(request, env, user) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    if (action === 'pending_count') {
        let query = `SELECT COUNT(*) as count FROM admin_requests WHERE status = 'pending'`;
        const params = [];
        if (!isSuperAdmin(user)) {
            query += ` AND requested_by = ?`;
            params.push(user.id);
        }
        const result = await env.DB.prepare(query).bind(...params).first();
        return new Response(JSON.stringify({
            success: true,
            count: result?.count || 0
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'messages') {
        const requestId = url.searchParams.get('request_id');
        if (!requestId) {
            return new Response(JSON.stringify({ error: '缺少 request_id' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const adminRequest = await env.DB.prepare(
            'SELECT requested_by FROM admin_requests WHERE id = ?'
        ).bind(requestId).first();
        if (!adminRequest) {
            return new Response(JSON.stringify({ error: '请求不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (!isSuperAdmin(user) && adminRequest.requested_by !== user.id) {
            return new Response(JSON.stringify({ error: '无权查看此请求的消息' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const messages = await env.DB.prepare(`
            SELECT m.*, u.nickname, u.email, u.role
            FROM admin_messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.request_id = ?
            ORDER BY m.created_at ASC
        `).bind(requestId).all();
        return new Response(JSON.stringify({
            success: true,
            data: messages.results || []
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const status = url.searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);
    let query = `
        SELECT r.*, 
               requester.nickname as requester_nickname, 
               requester.email as requester_email,
               reviewer.nickname as reviewer_nickname,
               reviewer.email as reviewer_email
        FROM admin_requests r
        LEFT JOIN users requester ON r.requested_by = requester.id
        LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
    `;
    const params = [];
    const conditions = [];
    if (status !== 'all') {
        conditions.push('r.status = ?');
        params.push(status);
    }
    if (!isSuperAdmin(user) || url.searchParams.get('mine') === 'true') {
        conditions.push('r.requested_by = ?');
        params.push(user.id);
    }
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY r.created_at DESC LIMIT ?';
    params.push(limit);
    const requests = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify({
        success: true,
        data: requests.results || []
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePost(request, env, user) {
    const body = await request.json();
    const { action } = body;
    if (action === 'add_message') {
        const { request_id, content } = body;
        if (!request_id || !content?.trim()) {
            return new Response(JSON.stringify({ error: '缺少必要参数' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const existingRequest = await env.DB.prepare(
            'SELECT id, requested_by FROM admin_requests WHERE id = ?'
        ).bind(request_id).first();
        if (!existingRequest) {
            return new Response(JSON.stringify({ error: '请求不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (!isSuperAdmin(user) && existingRequest.requested_by !== user.id) {
            return new Response(JSON.stringify({ error: '无权对此请求发表消息' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        await env.DB.prepare(`
            INSERT INTO admin_messages (request_id, sender_id, content)
            VALUES (?, ?, ?)
        `).bind(request_id, user.id, content.trim()).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const { request_type, request_data } = body;
    if (!request_type || !request_data) {
        return new Response(JSON.stringify({ error: '缺少必要参数' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const validTypes = ['delete_file', 'delete_folder', 'ban_user', 'unban_user'];
    if (!validTypes.includes(request_type)) {
        return new Response(JSON.stringify({ error: '无效的请求类型' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (isSuperAdmin(user)) {
        return new Response(JSON.stringify({
            success: true,
            direct_execute: true,
            message: '超级管理员可直接执行此操作'
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    try {
        await env.DB.prepare("DELETE FROM admin_requests WHERE created_at < datetime('now', '-7 days')").run();
    } catch (cleanupErr) {
        console.error('自动清理旧请求失败:', cleanupErr);
    }
    const result = await env.DB.prepare(`
        INSERT INTO admin_requests (request_type, request_data, requested_by, status)
        VALUES (?, ?, ?, 'pending')
    `).bind(request_type, JSON.stringify(request_data), user.id).run();
    return new Response(JSON.stringify({
        success: true,
        request_id: result.meta.last_row_id,
        message: '已提交审批请求，等待超级管理员处理'
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePut(request, env, user) {
    if (!isSuperAdmin(user)) {
        return new Response(JSON.stringify({ error: '只有超级管理员可以审批请求' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const body = await request.json();
    const { request_id, action, review_note } = body;
    if (!request_id || !['approve', 'reject'].includes(action)) {
        return new Response(JSON.stringify({ error: '缺少必要参数' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const adminRequest = await env.DB.prepare(
        'SELECT * FROM admin_requests WHERE id = ? AND status = ?'
    ).bind(request_id, 'pending').first();
    if (!adminRequest) {
        return new Response(JSON.stringify({ error: '请求不存在或已处理' }), {
            status: 404,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await env.DB.prepare(`
        UPDATE admin_requests 
        SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).bind(newStatus, user.id, review_note || null, request_id).run();
    let executeResult = null;
    if (action === 'approve') {
        try {
            executeResult = await executeApprovedRequest(adminRequest, env);
        } catch (e) {
            console.error('执行审批操作失败:', e);
            await env.DB.prepare(`
                UPDATE admin_requests SET status = 'pending', reviewed_by = NULL, review_note = NULL, reviewed_at = NULL
                WHERE id = ?
            `).bind(request_id).run();
            return new Response(JSON.stringify({
                success: false,
                error: `执行操作失败: ${e.message}`
            }), { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
    }
    return new Response(JSON.stringify({
        success: true,
        status: newStatus,
        executeResult,
        message: action === 'approve' ? '请求已批准并执行' : '请求已拒绝'
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function executeApprovedRequest(adminRequest, env) {
    const requestData = JSON.parse(adminRequest.request_data);
    switch (adminRequest.request_type) {
        case 'delete_file':
        case 'delete_folder':
            // 文件删除不再由后端自动执行，改由前端并发调用 files.js
            // 这里只返回 keys 供前端使用
            return {
                action_required: 'delete_files_frontend',
                keys: requestData.keys || [requestData.key],
                is_folder: adminRequest.request_type === 'delete_folder'
            };
        case 'ban_user':
            return await executeBanUser(requestData, env);
        case 'unban_user':
            return await executeUnbanUser(requestData, env);
        default:
            throw new Error(`未知的请求类型: ${adminRequest.request_type}`);
    }
}

async function executeBanUser(data, env) {
    const { user_id, guestbook_id } = data;
    let targetUserId = user_id;
    if (guestbook_id && !targetUserId) {
        const guestbook = await env.DB.prepare(
            'SELECT user_id FROM guestbook WHERE id = ?'
        ).bind(guestbook_id).first();
        if (guestbook) {
            targetUserId = guestbook.user_id;
        }
    }
    if (!targetUserId) {
        throw new Error('未找到目标用户');
    }
    const targetUser = await env.DB.prepare(
        'SELECT role FROM users WHERE id = ?'
    ).bind(targetUserId).first();
    if (targetUser && (targetUser.role === 'admin' || targetUser.role === 'super_admin')) {
        throw new Error('无法封禁管理员');
    }
    await env.DB.prepare(
        'UPDATE users SET is_banned = TRUE WHERE id = ?'
    ).bind(targetUserId).run();
    return { banned_user_id: targetUserId };
}

async function executeUnbanUser(data, env) {
    const { user_id } = data;
    if (!user_id) {
        throw new Error('未指定用户ID');
    }
    await env.DB.prepare(
        'UPDATE users SET is_banned = FALSE WHERE id = ?'
    ).bind(user_id).run();
    return { unbanned_user_id: user_id };
}
export async function onRequestOptions() {
    return new Response(null, { headers: addCorsHeaders() });
}
