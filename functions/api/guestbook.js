import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin } from '../utils.js';
import { processWithAIAgent } from './guestbook-ai.js';
const CLEANUP_DAYS = 7;
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        if (request.method === 'GET') {
            return await handleGet(request, env);
        } else if (request.method === 'POST') {
            return await handlePost(request, env, context);
        } else if (request.method === 'DELETE') {
            return await handleDelete(request, env);
        } else if (request.method === 'PUT') {
            return await handlePut(request, env, context);
        } else {
            return new Response('方法不允许', { status: 405, headers: addCorsHeaders() });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: addCorsHeaders() });
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
async function handleGet(request, env) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    if (action === 'banned_users') {
        const user = await getUser(request, env);
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
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
    if (action === 'stats') {
        const user = await getUser(request, env);
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('INSERT OR IGNORE INTO guestbook_stats (id, total_messages_all_time, current_messages_count) SELECT 1, COUNT(*), COUNT(*) FROM guestbook').run();
        const stats = await env.DB.prepare('SELECT * FROM guestbook_stats WHERE id = 1').first();
        return new Response(JSON.stringify({
            success: true,
            stats: {
                total_messages_all_time: stats.total_messages_all_time,
                last_cleanup_at: stats.last_cleanup_at,
                last_cleanup_count: stats.last_cleanup_count,
                current_messages_count: stats.current_messages_count
            }
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'unban_user') {
        const user = await getUser(request, env);
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const userId = url.searchParams.get('user_id');
        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少用户ID' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (isSuperAdmin(user)) {
            await env.DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(parseInt(userId)).run();
            return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        } else {
            const targetUser = await env.DB.prepare('SELECT nickname FROM users WHERE id = ?').bind(parseInt(userId)).first();
            const requestData = {
                user_id: parseInt(userId),
                nickname: targetUser ? targetUser.nickname : '未知用户',
                source: 'banned_users_list'
            };
            await env.DB.prepare(`
                INSERT INTO admin_requests (request_type, request_data, requested_by, status)
                VALUES (?, ?, ?, 'pending')
            `).bind('unban_user', JSON.stringify(requestData), user.id).run();
            return new Response(JSON.stringify({
                success: true,
                pending_approval: true,
                message: '已提交解封请求，等待超级管理员审批'
            }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
    }
    const MAX_LIMIT = 500;
    const user = await getUser(request, env);
    const currentUserId = user ? user.id : null;
    const isAdminUser = isAdmin(user);
    const orderByClause = 'ORDER BY g.is_pinned DESC, g.created_at DESC';
    let query;
    let params = [];
    let results;
    const adminSelect = `SELECT g.*, u.nickname, u.email, u.is_banned, u.role,
        CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
        FROM guestbook g
        LEFT JOIN users u ON g.user_id = u.id
        LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?`;
    const userSelect = `SELECT g.*, u.nickname, u.email, u.role,
        CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
        FROM guestbook g
        LEFT JOIN users u ON g.user_id = u.id
        LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?`;
    if (isAdminUser) {
        query = `${adminSelect} ${orderByClause} LIMIT ?`;
        params = [currentUserId, MAX_LIMIT];
        const q = await env.DB.prepare(query).bind(...params).all();
        results = q.results;
    } else {
        if (currentUserId) {
            query = `${userSelect} WHERE (g.is_hidden = FALSE OR g.user_id = ?) ${orderByClause} LIMIT ?`;
            params = [currentUserId, currentUserId, MAX_LIMIT];
            const q = await env.DB.prepare(query).bind(...params).all();
            results = q.results;
        } else {
            query = `${userSelect} WHERE g.is_hidden = FALSE ${orderByClause} LIMIT ?`;
            params = [null, MAX_LIMIT];
            const q = await env.DB.prepare(query).bind(...params).all();
            results = q.results;
        }
    }
    const sanitizedResults = results.map(msg => {
        if (msg.role === 'admin' || msg.role === 'super_admin') {
            msg.isAdmin = true;
            msg.isSuperAdmin = msg.role === 'super_admin';
        }
        if (!isAdminUser && msg.email) {
            const [name, domain] = msg.email.split('@');
            msg.email = `${name.substring(0, 2)}***@${domain}`;
        }
        return msg;
    });
    return new Response(JSON.stringify({
        data: sanitizedResults,
        totalItems: sanitizedResults.length
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePost(request, env, context) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (user.is_banned) {
        return new Response(JSON.stringify({ error: '你已被禁止发帖。' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 10240) {
        return new Response(JSON.stringify({ error: '请求体过大' }), { status: 413, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const todayStart = new Date().toISOString().split('T')[0] + ' 00:00:00';
    const postCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM guestbook WHERE user_id = ? AND created_at >= ?').bind(user.id, todayStart).first();
    if (!isAdmin(user) && postCountResult.count >= 10) {
        return new Response(JSON.stringify({ error: '每日限制已达到（每天10条帖子）。' }), { status: 429, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const { content } = await request.json();
    if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (content.length > 500) {
        return new Response(JSON.stringify({ error: '内容过长（最多500字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const result = await env.DB.prepare(
        'INSERT INTO guestbook (user_id, content, is_hidden) VALUES (?, ?, 1)'
    ).bind(user.id, content.trim()).run();
    const newId = result.meta.last_row_id;
    if (context && context.waitUntil) {
        context.waitUntil((async () => {
            try {
                const newEntry = await env.DB.prepare(
                    'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                ).bind(newId).first();
                if (newEntry && !isAdmin(newEntry)) {
                    const aiResult = await processWithAIAgent(newEntry, env, true);
                    if (aiResult && aiResult.success && (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                        await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(newId).run();
                    }
                }
            } catch (err) {
                console.error('自动AI处理失败:', err);
            }
        })());
        context.waitUntil(checkAndCleanup(env));
    }
    return new Response(JSON.stringify({ success: true, id: newId }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handleDelete(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response(JSON.stringify({ error: '缺少ID' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const entry = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
    if (!entry) {
        return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (!isAdmin(user) && entry.user_id !== user.id) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePut(request, env, context) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 10240) {
        return new Response(JSON.stringify({ error: '请求体过大' }), { status: 413, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const body = await request.json();
    const id = body.id;
    const action = body.action;
    if (!id || !action) {
        return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'edit') {
        const content = body.content || '';
        if (!content || content.trim().length === 0) {
            return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (content.length > 500) {
            return new Response(JSON.stringify({ error: '内容过长（最多500字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const guestbookEntry = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
        if (!guestbookEntry) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isAdmin(user) && guestbookEntry.user_id !== user.id) {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (isAdmin(user)) {
            await env.DB.prepare('UPDATE guestbook SET content = ? WHERE id = ?').bind(content.trim(), id).run();
        } else {
            await env.DB.prepare('UPDATE guestbook SET content = ?, status = ?, reject_reason = NULL, is_hidden = 1 WHERE id = ?').bind(content.trim(), 'unresolved', id).run();
        }
        if (context && context.waitUntil) {
            context.waitUntil((async () => {
                try {
                    const updatedEntry = await env.DB.prepare(
                        'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                    ).bind(id).first();
                    if (updatedEntry && !isAdmin(user)) {
                        const aiResult = await processWithAIAgent(updatedEntry, env, true);
                        if (aiResult && aiResult.success && (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                            await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(id).run();
                        }
                    }
                } catch (err) {
                    console.error('自动AI处理失败:', err);
                }
            })());
        }
        return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'like') {
        const existingLike = await env.DB.prepare('SELECT * FROM guestbook_likes WHERE user_id = ? AND guestbook_id = ?').bind(user.id, id).first();
        if (existingLike) {
            return new Response(JSON.stringify({ success: true, message: '已经点赞' }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.batch([
            env.DB.prepare('INSERT INTO guestbook_likes (user_id, guestbook_id) VALUES (?, ?)').bind(user.id, id),
            env.DB.prepare('UPDATE guestbook SET likes = likes + 1 WHERE id = ?').bind(id)
        ]);
    } else if (action === 'unlike') {
        const existingLike = await env.DB.prepare('SELECT * FROM guestbook_likes WHERE user_id = ? AND guestbook_id = ?').bind(user.id, id).first();
        if (!existingLike) {
            return new Response(JSON.stringify({ success: true, message: '尚未点赞' }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.batch([
            env.DB.prepare('DELETE FROM guestbook_likes WHERE user_id = ? AND guestbook_id = ?').bind(user.id, id),
            env.DB.prepare('UPDATE guestbook SET likes = MAX(0, likes - 1) WHERE id = ?').bind(id)
        ]);
    } else if (action === 'hide' || action === 'unhide') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const isHidden = action === 'hide';
        await env.DB.prepare('UPDATE guestbook SET is_hidden = ? WHERE id = ?').bind(isHidden ? 1 : 0, id).run();
    } else if (action === 'pin' || action === 'unpin') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const isPinned = action === 'pin';
        await env.DB.prepare('UPDATE guestbook SET is_pinned = ? WHERE id = ?').bind(isPinned ? 1 : 0, id).run();
    } else if (action === 'resolve' || action === 'unresolve') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const status = action === 'resolve' ? 'resolved' : 'unresolved';
        const resolveNote = action === 'resolve' ? (body.resolve_note || null) : null;
        const isHidden = action === 'resolve' ? 0 : null;
        if (isHidden !== null) {
            await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ?, is_hidden = ? WHERE id = ?').bind(status, resolveNote, isHidden, id).run();
        } else {
            await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ? WHERE id = ?').bind(status, resolveNote, id).run();
        }
    } else if (action === 'reject') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const rejectReason = body.reject_reason || '';
        if (!rejectReason || rejectReason.trim().length === 0) {
            return new Response(JSON.stringify({ error: '请填写驳回原因' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (rejectReason.length > 200) {
            return new Response(JSON.stringify({ error: '驳回原因过长（最多200字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?').bind('rejected', rejectReason.trim(), id).run();
    } else if (action === 'unreject') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, is_hidden = 0 WHERE id = ?').bind('unresolved', id).run();
    } else if (action === 'ban_user') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const guestbookEntry = await env.DB.prepare('SELECT user_id, content FROM guestbook WHERE id = ?').bind(id).first();
        if (!guestbookEntry) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const targetUser = await env.DB.prepare('SELECT role, nickname FROM users WHERE id = ?').bind(guestbookEntry.user_id).first();
        if (targetUser && (targetUser.role === 'admin' || targetUser.role === 'super_admin')) {
            return new Response(JSON.stringify({ error: '不能封禁管理员' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (isSuperAdmin(user)) {
            await env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(guestbookEntry.user_id).run();
        } else {
            const requestData = {
                guestbook_id: id,
                user_id: guestbookEntry.user_id,
                nickname: targetUser ? targetUser.nickname : '未知用户',
                content_preview: guestbookEntry.content?.substring(0, 100)
            };
            await env.DB.prepare(`
                INSERT INTO admin_requests (request_type, request_data, requested_by, status)
                VALUES (?, ?, ?, 'pending')
            `).bind('ban_user', JSON.stringify(requestData), user.id).run();
            return new Response(JSON.stringify({
                success: true,
                pending_approval: true,
                message: '已提交封禁请求，等待超级管理员审批'
            }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
    } else if (action === 'unban_user') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const guestbookEntry = await env.DB.prepare('SELECT user_id, content FROM guestbook WHERE id = ?').bind(id).first();
        if (guestbookEntry) {
            if (isSuperAdmin(user)) {
                await env.DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(guestbookEntry.user_id).run();
            } else {
                const targetUser = await env.DB.prepare('SELECT nickname FROM users WHERE id = ?').bind(guestbookEntry.user_id).first();
                const requestData = {
                    guestbook_id: id,
                    user_id: guestbookEntry.user_id,
                    nickname: targetUser ? targetUser.nickname : '未知用户',
                    content_preview: guestbookEntry.content?.substring(0, 100)
                };
                await env.DB.prepare(`
                    INSERT INTO admin_requests (request_type, request_data, requested_by, status)
                    VALUES (?, ?, ?, 'pending')
                `).bind('unban_user', JSON.stringify(requestData), user.id).run();
                return new Response(JSON.stringify({
                    success: true,
                    pending_approval: true,
                    message: '已提交解封请求，等待超级管理员审批'
                }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } else {
        return new Response(JSON.stringify({ error: '无效操作' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function checkAndCleanup(env) {
    try {
        const stats = await env.DB.prepare('SELECT last_cleanup_at FROM guestbook_stats WHERE id = 1').first();
        const lastCleanup = stats && stats.last_cleanup_at ? new Date(stats.last_cleanup_at + 'Z').getTime() : 0;
        const now = Date.now();
        if (now - lastCleanup < 86400000 && lastCleanup !== 0) {
            return;
        }
        const result = await env.DB.prepare(`DELETE FROM guestbook WHERE created_at < datetime('now', '-${CLEANUP_DAYS} days') AND is_pinned = 0`).run();
        const deletedCount = result.meta.changes;
        await env.DB.prepare(`
            UPDATE guestbook_stats 
            SET last_cleanup_at = datetime('now'), last_cleanup_count = ? 
            WHERE id = 1
        `).bind(deletedCount).run();
        if (deletedCount > 0) {
            console.log(`Auto cleanup: deleted ${deletedCount} messages older than ${CLEANUP_DAYS} days.`);
        }
    } catch (err) {
        console.error('Auto cleanup failed:', err);
    }
}