import { verifyToken, addCorsHeaders } from '../utils.js';
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
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
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
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
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
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const userId = url.searchParams.get('user_id');
        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少用户ID' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(parseInt(userId)).run();
        return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const sort = url.searchParams.get('sort') || 'time';
    const filter = url.searchParams.get('filter') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const offset = (page - 1) * limit;
    const user = await getUser(request, env);
    const currentUserId = user ? user.id : null;
    const isAdmin = user && user.role === 'admin';
    const validStatuses = ['unresolved', 'resolved', 'rejected'];
    const statusCondition = validStatuses.includes(status) ? `g.status = '${status}'` : null;
    let total = 0;
    if (filter === 'mine') {
        if (!currentUserId) {
            total = 0;
        } else {
            let countQuery = 'SELECT COUNT(*) as total FROM guestbook g WHERE g.user_id = ?';
            if (statusCondition) {
                countQuery += ` AND ${statusCondition}`;
            }
            const cnt = await env.DB.prepare(countQuery).bind(currentUserId).first();
            total = cnt.total;
        }
    } else {
        if (isAdmin) {
            let countQuery = 'SELECT COUNT(*) as total FROM guestbook g';
            if (statusCondition) {
                countQuery += ` WHERE ${statusCondition}`;
            }
            const cnt = await env.DB.prepare(countQuery).first();
            total = cnt.total;
        } else {
            if (currentUserId) {
                let countQuery = 'SELECT COUNT(*) as total FROM guestbook g WHERE (g.is_hidden = FALSE OR g.user_id = ?)';
                if (statusCondition) {
                    countQuery += ` AND ${statusCondition}`;
                }
                const cnt = await env.DB.prepare(countQuery).bind(currentUserId).first();
                total = cnt.total;
            } else {
                let countQuery = 'SELECT COUNT(*) as total FROM guestbook g WHERE g.is_hidden = FALSE';
                if (statusCondition) {
                    countQuery += ` AND ${statusCondition}`;
                }
                const cnt = await env.DB.prepare(countQuery).first();
                total = cnt.total;
            }
        }
    }
    let orderByClause = 'ORDER BY g.is_pinned DESC, g.created_at DESC';
    if (sort === 'likes') {
        orderByClause = 'ORDER BY g.is_pinned DESC, g.likes DESC, g.created_at DESC';
    }
    let query;
    let results;
    if (filter === 'mine') {
        if (!currentUserId) {
            results = [];
        } else {
            let whereClause = 'WHERE g.user_id = ?';
            if (statusCondition) {
                whereClause += ` AND ${statusCondition}`;
            }
            let idQuery = `SELECT id FROM guestbook g WHERE g.user_id = ? ${statusCondition ? `AND ${statusCondition}` : ''} ${orderByClause} LIMIT ? OFFSET ?`;
            const idResult = await env.DB.prepare(idQuery).bind(currentUserId, limit, offset).all();
            const ids = idResult.results.map(r => r.id);
            if (ids.length === 0) {
                results = [];
            } else {
                const placeholders = ids.map(() => '?').join(',');
                query = `
                    SELECT g.*, u.nickname, u.email, u.role,
                    CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                    FROM guestbook g
                    LEFT JOIN users u ON g.user_id = u.id
                    LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                    WHERE g.id IN (${placeholders})
                    ${orderByClause}
                `;
                const q = await env.DB.prepare(query).bind(currentUserId, ...ids).all();
                results = q.results;
            }
        }
    } else {
        if (isAdmin) {
            let whereClauseSub = statusCondition ? `WHERE ${statusCondition}` : '';
            let idQuery = `SELECT id FROM guestbook g ${whereClauseSub} ${orderByClause} LIMIT ? OFFSET ?`;
            const idResult = await env.DB.prepare(idQuery).bind(limit, offset).all();
            const ids = idResult.results.map(r => r.id);
            if (ids.length === 0) {
                results = [];
            } else {
                const placeholders = ids.map(() => '?').join(',');
                query = `
                    SELECT g.*, u.nickname, u.email, u.is_banned, u.role,
                    CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                    FROM guestbook g
                    LEFT JOIN users u ON g.user_id = u.id
                    LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                    WHERE g.id IN (${placeholders})
                    ${orderByClause}
                `;
                const q = await env.DB.prepare(query).bind(currentUserId, ...ids).all();
                results = q.results;
            }
        } else {
            if (currentUserId) {
                let whereClauseSub = 'WHERE (g.is_hidden = FALSE OR g.user_id = ?)';
                if (statusCondition) {
                    whereClauseSub += ` AND ${statusCondition}`;
                }
                let idQuery = `SELECT id FROM guestbook g ${whereClauseSub} ${orderByClause} LIMIT ? OFFSET ?`;
                const idResult = await env.DB.prepare(idQuery).bind(currentUserId, limit, offset).all();
                const ids = idResult.results.map(r => r.id);
                if (ids.length === 0) {
                    results = [];
                } else {
                    const placeholders = ids.map(() => '?').join(',');
                    query = `
                    SELECT g.*, u.nickname, u.email, u.role,
                    CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                    FROM guestbook g
                    LEFT JOIN users u ON g.user_id = u.id
                    LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                    WHERE g.id IN (${placeholders})
                    ${orderByClause}
                `;
                    const q = await env.DB.prepare(query).bind(currentUserId, ...ids).all();
                    results = q.results;
                }
            } else {
                let whereClauseSub = 'WHERE g.is_hidden = FALSE';
                if (statusCondition) {
                    whereClauseSub += ` AND ${statusCondition}`;
                }
                let idQuery = `SELECT id FROM guestbook g ${whereClauseSub} ${orderByClause} LIMIT ? OFFSET ?`;
                const idResult = await env.DB.prepare(idQuery).bind(limit, offset).all();
                const ids = idResult.results.map(r => r.id);
                if (ids.length === 0) {
                    results = [];
                } else {
                    const placeholders = ids.map(() => '?').join(',');
                    query = `
                    SELECT g.*, u.nickname, u.email, u.role,
                    CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                    FROM guestbook g
                    LEFT JOIN users u ON g.user_id = u.id
                    LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                    WHERE g.id IN (${placeholders})
                    ${orderByClause}
                `;
                    const q = await env.DB.prepare(query).bind(currentUserId, ...ids).all();
                    results = q.results;
                }
            }
        }
    }
    const sanitizedResults = results.map(msg => {
        if (msg.role === 'admin') {
            msg.isAdmin = true;
        }
        if (!isAdmin && msg.email) {
            const [name, domain] = msg.email.split('@');
            msg.email = `${name.substring(0, 2)}***@${domain}`;
        }
        return msg;
    });
    return new Response(JSON.stringify({
        data: sanitizedResults,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
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
    if (user.role !== 'admin' && postCountResult.count >= 10) {
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
        'INSERT INTO guestbook (user_id, content) VALUES (?, ?)'
    ).bind(user.id, content.trim()).run();
    const newId = result.meta.last_row_id;
    if (context && context.waitUntil) {
        context.waitUntil((async () => {
            try {
                const newEntry = await env.DB.prepare(
                    'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                ).bind(newId).first();
                if (newEntry && newEntry.role !== 'admin') {
                    await processWithAIAgent(newEntry, env, true);
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
    if (user.role !== 'admin' && entry.user_id !== user.id) {
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
        if (user.role !== 'admin' && guestbookEntry.user_id !== user.id) {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE guestbook SET content = ?, status = ?, reject_reason = NULL WHERE id = ?').bind(content.trim(), 'unresolved', id).run();
        if (context && context.waitUntil) {
            context.waitUntil((async () => {
                try {
                    const updatedEntry = await env.DB.prepare(
                        'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                    ).bind(id).first();
                    if (updatedEntry && user.role !== 'admin') {
                        await processWithAIAgent(updatedEntry, env, true);
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
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const isHidden = action === 'hide';
        await env.DB.prepare('UPDATE guestbook SET is_hidden = ? WHERE id = ?').bind(isHidden ? 1 : 0, id).run();
    } else if (action === 'pin' || action === 'unpin') {
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const isPinned = action === 'pin';
        await env.DB.prepare('UPDATE guestbook SET is_pinned = ? WHERE id = ?').bind(isPinned ? 1 : 0, id).run();
    } else if (action === 'resolve' || action === 'unresolve') {
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const status = action === 'resolve' ? 'resolved' : 'unresolved';
        const resolveNote = action === 'resolve' ? (body.resolve_note || null) : null;
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ? WHERE id = ?').bind(status, resolveNote, id).run();
    } else if (action === 'reject') {
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const rejectReason = body.reject_reason || '';
        if (!rejectReason || rejectReason.trim().length === 0) {
            return new Response(JSON.stringify({ error: '请填写驳回原因' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (rejectReason.length > 200) {
            return new Response(JSON.stringify({ error: '驳回原因过长（最多200字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = ? WHERE id = ?').bind('rejected', rejectReason.trim(), id).run();
    } else if (action === 'unreject') {
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL WHERE id = ?').bind('unresolved', id).run();
    } else if (action === 'ban_user') {
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const guestbookEntry = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
        if (guestbookEntry) {
            const targetUser = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(guestbookEntry.user_id).first();
            if (targetUser && targetUser.role === 'admin') {
                return new Response(JSON.stringify({ error: '不能封禁管理员' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            await env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(guestbookEntry.user_id).run();
        }
    } else if (action === 'unban_user') {
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const guestbookEntry = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
        if (guestbookEntry) {
            await env.DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(guestbookEntry.user_id).run();
        }
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