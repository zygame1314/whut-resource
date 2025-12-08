import { verifyToken, addCorsHeaders } from '../utils.js';
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        if (request.method === 'GET') {
            return await handleGet(request, env);
        } else if (request.method === 'POST') {
            return await handlePost(request, env);
        } else if (request.method === 'DELETE') {
            return await handleDelete(request, env);
        } else if (request.method === 'PUT') {
            return await handlePut(request, env);
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
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const sort = url.searchParams.get('sort') || 'time';
    const filter = url.searchParams.get('filter') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const offset = (page - 1) * limit;
    const user = await getUser(request, env);
    const currentUserId = user ? user.id : null;
    const isAdmin = user && user.role === 'admin';

    // 构建状态筛选条件
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
            query = `
                SELECT g.*, u.nickname, u.email, u.role,
                CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                FROM guestbook g
                LEFT JOIN users u ON g.user_id = u.id
                LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                ${whereClause}
                ${orderByClause}
                LIMIT ? OFFSET ?
            `;
            const q = await env.DB.prepare(query).bind(currentUserId, currentUserId, limit, offset).all();
            results = q.results;
        }
    } else {
        if (isAdmin) {
            let whereClause = statusCondition ? `WHERE ${statusCondition}` : '';
            query = `
                SELECT g.*, u.nickname, u.email, u.is_banned, u.role,
                CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                FROM guestbook g
                LEFT JOIN users u ON g.user_id = u.id
                LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                ${whereClause}
                ${orderByClause}
                LIMIT ? OFFSET ?
            `;
            const q = await env.DB.prepare(query).bind(currentUserId, limit, offset).all();
            results = q.results;
        } else {
            if (currentUserId) {
                let whereClause = 'WHERE (g.is_hidden = FALSE OR g.user_id = ?)';
                if (statusCondition) {
                    whereClause += ` AND ${statusCondition}`;
                }
                query = `
                    SELECT g.*, u.nickname, u.email, u.role,
                    CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                    FROM guestbook g
                    LEFT JOIN users u ON g.user_id = u.id
                    LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                    ${whereClause}
                    ${orderByClause}
                    LIMIT ? OFFSET ?
                `;
                const q = await env.DB.prepare(query).bind(currentUserId, currentUserId, limit, offset).all();
                results = q.results;
            } else {
                let whereClause = 'WHERE g.is_hidden = FALSE';
                if (statusCondition) {
                    whereClause += ` AND ${statusCondition}`;
                }
                query = `
                    SELECT g.*, u.nickname, u.email, u.role,
                    CASE WHEN gl.user_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
                    FROM guestbook g
                    LEFT JOIN users u ON g.user_id = u.id
                    LEFT JOIN guestbook_likes gl ON gl.guestbook_id = g.id AND gl.user_id = ?
                    ${whereClause}
                    ${orderByClause}
                    LIMIT ? OFFSET ?
                `;
                const q = await env.DB.prepare(query).bind(currentUserId, limit, offset).all();
                results = q.results;
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
async function handlePost(request, env) {
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
    if (postCountResult.count >= 10) {
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
    return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
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
async function handlePut(request, env) {
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
        await env.DB.prepare('UPDATE guestbook SET content = ? WHERE id = ?').bind(content.trim(), id).run();
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
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL WHERE id = ?').bind(status, id).run();
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