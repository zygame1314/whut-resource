import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin, logAdminAction, cleanupAdminLogs } from '../utils.js';
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
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
        const cursor = url.searchParams.get('cursor');
        let query = `
            SELECT id, email, nickname, created_at
            FROM users
            WHERE is_banned = 1
        `;
        const params = [];
        if (cursor) {
            const sepIdx = cursor.lastIndexOf('|');
            if (sepIdx > 0) {
                const cursorCreatedAt = cursor.slice(0, sepIdx);
                const cursorId = parseInt(cursor.slice(sepIdx + 1));
                if (cursorCreatedAt && cursorId) {
                    query += ` AND (created_at < ? OR (created_at = ? AND id < ?))`;
                    params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
                }
            }
        }
        query += ` ORDER BY created_at DESC, id DESC LIMIT ?`;
        params.push(limit + 1);
        const { results } = await env.DB.prepare(query).bind(...params).all();
        const hasMore = results.length > limit;
        const users = hasMore ? results.slice(0, limit) : results;
        let nextCursor = null;
        if (hasMore && users.length > 0) {
            const last = users[users.length - 1];
            nextCursor = `${last.created_at}|${last.id}`;
        }
        return new Response(JSON.stringify({
            success: true,
            users,
            nextCursor,
            hasMore
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'search') {
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
        const kw = keyword.trim().toLowerCase();
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
        const cursor = url.searchParams.get('cursor');
        let query = "SELECT id, email, nickname, role, is_banned, created_at FROM users WHERE email >= ? AND email < ? AND role != 'super_admin'";
        const params = [kw, kw + '\uffff'];
        if (cursor) {
            query += " AND email > ?";
            params.push(cursor);
        }
        query += " ORDER BY email ASC LIMIT ?";
        params.push(limit + 1);
        const { results } = await env.DB.prepare(query).bind(...params).all();
        const hasMore = results.length > limit;
        const users = hasMore ? results.slice(0, limit) : results;
        const nextCursor = hasMore && users.length > 0 ? users[users.length - 1].email : null;
        return new Response(JSON.stringify({ success: true, users, nextCursor, hasMore }), {
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
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
        const cursor = url.searchParams.get('cursor');
        let query = "SELECT id, email, nickname, role, is_banned, created_at FROM users WHERE role = 'admin'";
        const params = [];
        if (cursor) {
            query += " AND id > ?";
            params.push(parseInt(cursor));
        }
        query += " ORDER BY id ASC LIMIT ?";
        params.push(limit + 1);
        const { results } = await env.DB.prepare(query).bind(...params).all();
        const hasMore = results.length > limit;
        const users = hasMore ? results.slice(0, limit) : results;
        const nextCursor = hasMore ? users[users.length - 1].id : null;
        return new Response(JSON.stringify({ success: true, users, nextCursor, hasMore }), {
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
        let query = `SELECT 1 as has_pending FROM admin_requests WHERE status = 'pending'`;
        const params = [];
        if (!isSuperAdmin(user)) {
            query += ` AND requested_by = ?`;
            params.push(user.id);
        }
        query += ` LIMIT 1`;
        const result = await env.DB.prepare(query).bind(...params).first();
        return new Response(JSON.stringify({
            success: true,
            has_pending: !!result
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const status = url.searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 200);
    const cursor = url.searchParams.get('cursor');
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
    conditions.push("r.created_at >= datetime('now', '-7 days')");
    let cursorCreatedAt = null;
    let cursorId = null;
    if (cursor) {
        const sepIdx = cursor.lastIndexOf('|');
        if (sepIdx > 0) {
            cursorCreatedAt = cursor.slice(0, sepIdx);
            cursorId = parseInt(cursor.slice(sepIdx + 1));
        }
    }
    if (cursorCreatedAt && cursorId) {
        conditions.push('(r.created_at < ? OR (r.created_at = ? AND r.id < ?))');
        params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    }
    query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.created_at DESC, r.id DESC LIMIT ?';
    params.push(limit + 1);
    const requests = await env.DB.prepare(query).bind(...params).all();
    const rows = requests.results || [];
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    let nextCursor = null;
    if (hasMore && data.length > 0) {
        const last = data[data.length - 1];
        nextCursor = `${last.created_at}|${last.id}`;
    }
    return new Response(JSON.stringify({
        success: true,
        data,
        nextCursor,
        hasMore
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
            await logAdminAction(env, user.id, 'promote_admin', 'user', user_id, '提升为管理员', JSON.stringify({ nickname: targetUser.nickname, target_email: targetUser.email, user_id: targetUser.id }));
        } else if (action === 'demote') {
            if (targetUser.role === 'user') {
                return new Response(JSON.stringify({ error: '该用户已是普通用户' }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' })
                });
            }
            await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(user_id).run();
            await logAdminAction(env, user.id, 'demote_admin', 'user', user_id, '降级为普通用户', JSON.stringify({ nickname: targetUser.nickname, target_email: targetUser.email, user_id: targetUser.id }));
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
        const targetUser = await env.DB.prepare('SELECT id, email, nickname, role FROM users WHERE id = ?').bind(user_id).first();
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
        await logAdminAction(env, user.id, 'ban_user', 'user', user_id, '封禁用户', JSON.stringify({ nickname: targetUser.nickname, target_email: targetUser.email, user_id: targetUser.id }));
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
        const targetUser = await env.DB.prepare('SELECT id, email, nickname FROM users WHERE id = ?').bind(user_id).first();
        await env.DB.prepare('UPDATE users SET is_banned = FALSE WHERE id = ?').bind(user_id).run();
        await logAdminAction(env, user.id, 'unban_user', 'user', user_id, '解封用户', JSON.stringify({ nickname: targetUser ? targetUser.nickname : null, target_email: targetUser ? targetUser.email : null, user_id: user_id }));
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
            const MAX_REQUEST_IDS = 100;
            let idsToProcess = [];
            if (request_ids && Array.isArray(request_ids)) {
                idsToProcess = request_ids.slice(0, MAX_REQUEST_IDS);
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
            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            const placeholders = idsToProcess.map(() => '?').join(',');
            const fetched = await env.DB.prepare(
                `SELECT * FROM admin_requests WHERE id IN (${placeholders}) AND status = ?`
            ).bind(...idsToProcess, 'pending').all();
            const adminRequests = (fetched.results || []);
            let successCount = 0;
            let failCount = 0;
            let accumulatedKeys = [];
            let errors = [];
            const BATCH_TIME_BUDGET_MS = 25000;
            const startTime = Date.now();
            for (const adminRequest of adminRequests) {
                if (Date.now() - startTime > BATCH_TIME_BUDGET_MS) {
                    errors.push(`处理超时，剩余 ${adminRequests.length - successCount - failCount} 个请求未处理`);
                    break;
                }
                try {
                    const requestDataObj = adminRequest.request_data ? JSON.parse(adminRequest.request_data) : null;
                    const logDetails = { request_type: adminRequest.request_type, review_note: review_note || null };
                    if (requestDataObj) {
                        if (requestDataObj.nickname) logDetails.nickname = requestDataObj.nickname;
                        if (requestDataObj.user_id) logDetails.user_id = requestDataObj.user_id;
                        if (requestDataObj.content_preview) logDetails.snapshot_content = requestDataObj.content_preview;
                        if (requestDataObj.email) logDetails.target_email = requestDataObj.email;
                    }
                    await env.DB.batch([
                        env.DB.prepare(`
                            UPDATE admin_requests 
                            SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).bind(newStatus, user.id, review_note || null, adminRequest.id),
                        env.DB.prepare(
                            'INSERT INTO admin_logs (action, target_type, target_id, reason, details, operator_id) VALUES (?, ?, ?, ?, ?, ?)'
                        ).bind(
                            action === 'approve' ? 'approve_request' : 'reject_request',
                            'admin_request', adminRequest.id,
                            action === 'approve' ? '批准请求' : '拒绝请求',
                            JSON.stringify(logDetails),
                            user.id
                        )
                    ]);
                    if (action === 'approve') {
                        try {
                            const execResult = await executeApprovedRequest(adminRequest, env);
                            if (execResult && execResult.action_required === 'delete_files_frontend') {
                                accumulatedKeys.push(...execResult.keys);
                            }
                        } catch (execErr) {
                            console.error(`Request ${adminRequest.id} execution failed:`, execErr);
                            await env.DB.prepare(`
                                UPDATE admin_requests SET status = 'pending', reviewed_by = NULL, review_note = NULL, reviewed_at = NULL
                                WHERE id = ?
                            `).bind(adminRequest.id).run();
                            await env.DB.prepare(
                                'DELETE FROM admin_logs WHERE target_type = ? AND target_id = ?'
                            ).bind('admin_request', adminRequest.id).run();
                            throw execErr;
                        }
                    }
                    successCount++;
                } catch (e) {
                    console.error(`Batch process error for ID ${adminRequest.id}:`, e);
                    failCount++;
                    errors.push(`ID ${adminRequest.id}: ${e.message}`);
                }
            }
            await cleanupAdminLogs(env);
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