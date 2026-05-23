import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin } from '../utils.js';
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        const user = await getUser(request, env);
        if (!user) {
            return new Response(JSON.stringify({ error: '未授权' }), {
                status: 401,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (request.method === 'GET') {
            return await handleGet(request, env, user);
        } else if (request.method === 'PUT') {
            return await handlePut(request, env, user);
        } else {
            return new Response('方法不被允许', { status: 405, headers: addCorsHeaders() });
        }
    } catch (e) {
        console.error('Admin management error:', e);
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
    if (action === 'banned_users') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const bannedUsers = await env.DB.prepare(`
            SELECT id, email, nickname, created_at 
            FROM users 
            WHERE is_banned = 1 
            ORDER BY created_at DESC
        `).all();
        return new Response(JSON.stringify({
            success: true,
            users: bannedUsers.results
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'user_search') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const keyword = url.searchParams.get('keyword') || '';
        if (!keyword || keyword.trim().length < 4) {
            return new Response(JSON.stringify({ error: '请输入至少4个字符的邮箱前缀' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const prefix = `${keyword.trim()}*`;
        const { results } = await env.DB.prepare(
            "SELECT id, email, nickname, role, is_banned, created_at FROM users WHERE email GLOB ? AND role != 'super_admin' LIMIT 20"
        ).bind(prefix).all();
        return new Response(JSON.stringify({ success: true, users: results }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (action === 'admins') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const { results } = await env.DB.prepare(
            "SELECT id, email, nickname, role, is_banned, created_at FROM users WHERE role = 'admin' ORDER BY created_at ASC"
        ).all();
        return new Response(JSON.stringify({ success: true, users: results }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (action === 'pending_count') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
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
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
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
        query += " AND r.created_at >= datetime('now', '-7 days')";
    } else {
        query += " WHERE r.created_at >= datetime('now', '-7 days')";
    }
    query += ' ORDER BY r.created_at DESC LIMIT ?';
    params.push(limit);
    const requests = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify({
        success: true,
        data: requests.results || []
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePut(request, env, user) {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 10240) {
        return new Response(JSON.stringify({ error: '请求体过大' }), {
            status: 413,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const body = await request.json();
    const { action } = body;
    if (action === 'promote' || action === 'demote') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const { user_id } = body;
        if (!user_id) {
            return new Response(JSON.stringify({ error: '缺少参数' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const targetUser = await env.DB.prepare('SELECT id, email, nickname, role FROM users WHERE id = ?').bind(user_id).first();
        if (!targetUser) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (targetUser.role === 'super_admin') {
            return new Response(JSON.stringify({ error: '不能修改超级管理员的角色' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (action === 'promote') {
            if (targetUser.role === 'admin') {
                return new Response(JSON.stringify({ error: '该用户已是管理员' }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' })
                });
            }
            await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user_id).run();
        } else if (action === 'demote') {
            if (targetUser.role === 'user') {
                return new Response(JSON.stringify({ error: '该用户已是普通用户' }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' })
                });
            }
            await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(user_id).run();
        }
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (action === 'ban') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const { user_id } = body;
        if (!user_id) {
            return new Response(JSON.stringify({ error: '缺少用户ID' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const targetUser = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(user_id).first();
        if (!targetUser) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
            return new Response(JSON.stringify({ error: '无法封禁管理员' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        await env.DB.prepare('UPDATE users SET is_banned = TRUE WHERE id = ?').bind(user_id).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (action === 'unban') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const { user_id } = body;
        if (!user_id) {
            return new Response(JSON.stringify({ error: '缺少用户ID' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        await env.DB.prepare('UPDATE users SET is_banned = FALSE WHERE id = ?').bind(user_id).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (action === 'approve' || action === 'reject') {
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '只有超级管理员可以审批请求' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        try {
            await env.DB.prepare("DELETE FROM admin_requests WHERE created_at < datetime('now', '-7 days')").run();
        } catch (cleanupErr) {
            console.error('自动清理旧请求失败:', cleanupErr);
        }
        const { request_id, request_ids, review_note } = body;
        let idsToProcess = [];
        if (request_ids && Array.isArray(request_ids)) {
            idsToProcess = request_ids;
        } else if (request_id) {
            idsToProcess = [request_id];
        } else {
            return new Response(JSON.stringify({ error: '缺少请求ID' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        if (idsToProcess.length === 0) {
            return new Response(JSON.stringify({ success: true, count: 0, message: '未选择任何请求' }), {
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        let successCount = 0;
        let failCount = 0;
        let accumulatedKeys = [];
        let errors = [];
        for (const id of idsToProcess) {
            try {
                const adminRequest = await env.DB.prepare(
                    'SELECT * FROM admin_requests WHERE id = ? AND status = ?'
                ).bind(id, 'pending').first();
                if (!adminRequest) {
                    continue;
                }
                const newStatus = action === 'approve' ? 'approved' : 'rejected';
                await env.DB.prepare(`
                    UPDATE admin_requests 
                    SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).bind(newStatus, user.id, review_note || null, id).run();
                if (action === 'approve') {
                    try {
                        const execResult = await executeApprovedRequest(adminRequest, env);
                        if (execResult && execResult.action_required === 'delete_files_frontend') {
                            accumulatedKeys.push(...execResult.keys);
                        }
                    } catch (execErr) {
                        console.error(`Request ${id} execution failed:`, execErr);
                        await env.DB.prepare(`
                            UPDATE admin_requests SET status = 'pending', reviewed_by = NULL, review_note = NULL, reviewed_at = NULL
                            WHERE id = ?
                        `).bind(id).run();
                        throw execErr;
                    }
                }
                successCount++;
            } catch (e) {
                console.error(`Batch process error for ID ${id}:`, e);
                failCount++;
                errors.push(`ID ${id}: ${e.message}`);
            }
        }
        let executeResult = null;
        if (accumulatedKeys.length > 0) {
            executeResult = {
                action_required: 'delete_files_frontend',
                keys: accumulatedKeys
            };
        }
        const message = successCount > 0
            ? (action === 'approve' ? `成功批准 ${successCount} 个请求` : `成功拒绝 ${successCount} 个请求`)
            : `操作失败`;
        return new Response(JSON.stringify({
            success: successCount > 0,
            count: successCount,
            failCount: failCount,
            errors: errors,
            executeResult,
            message: message + (failCount > 0 ? ` (${failCount} 个失败)` : '')
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    return new Response(JSON.stringify({ error: '未知操作' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}
async function executeApprovedRequest(adminRequest, env) {
    const requestData = JSON.parse(adminRequest.request_data);
    switch (adminRequest.request_type) {
        case 'delete_file':
        case 'delete_folder':
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