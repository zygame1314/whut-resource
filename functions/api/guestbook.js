import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin, logAdminAction } from '../utils.js';
import { processWithAIAgent, processReplyWithAI } from './guestbook-ai.js';
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
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const currentUserId = user.id;
    const isAdminUser = isAdmin(user);

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 20);
    const sort = url.searchParams.get('sort') || 'time';
    const filter = url.searchParams.get('filter') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const cursorStr = url.searchParams.get('cursor') || null;

    let cursorObj = null;
    if (cursorStr) {
        try { cursorObj = JSON.parse(atob(cursorStr)); } catch (e) { cursorObj = null; }
    }

    const selectFields = isAdminUser
        ? 'g.*, u.nickname, u.email, u.is_banned, u.role'
        : 'g.*, u.nickname, u.email, u.role';

    const conditions = ['g.parent_id IS NULL'];
    const params = [];

    if (!isAdminUser) {
        conditions.push('(g.is_hidden = 0 OR g.user_id = ?)');
        params.push(currentUserId);
    }

    if (status !== 'all') {
        conditions.push('g.status = ?');
        params.push(status);
    }

    if (filter === 'mine') {
        conditions.push('g.user_id = ?');
        params.push(currentUserId);
    }

    let orderClause;
    if (sort === 'likes') {
        orderClause = 'ORDER BY g.is_pinned DESC, g.likes DESC, g.id DESC';
        if (cursorObj) {
            conditions.push('(g.is_pinned < ? OR (g.is_pinned = ? AND g.likes < ?) OR (g.is_pinned = ? AND g.likes = ? AND g.id < ?))');
            params.push(cursorObj.p, cursorObj.p, cursorObj.l, cursorObj.p, cursorObj.l, cursorObj.i);
        }
    } else {
        orderClause = 'ORDER BY g.is_pinned DESC, g.id DESC';
        if (cursorObj) {
            conditions.push('(g.is_pinned < ? OR (g.is_pinned = ? AND g.id < ?))');
            params.push(cursorObj.p, cursorObj.p, cursorObj.i);
        }
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');
    const query = `SELECT ${selectFields} FROM guestbook g LEFT JOIN users u ON g.user_id = u.id ${whereClause} ${orderClause} LIMIT ?`;
    params.push(limit + 1);

    const result = await env.DB.prepare(query).bind(...params).all();
    const rows = result.results;

    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor = null;
    if (hasMore && pageItems.length > 0) {
        const lastItem = pageItems[pageItems.length - 1];
        const cd = sort === 'likes'
            ? { p: lastItem.is_pinned, l: lastItem.likes, i: lastItem.id }
            : { p: lastItem.is_pinned, i: lastItem.id };
        nextCursor = btoa(JSON.stringify(cd));
    }

    let firstCursor = null;
    if (pageItems.length > 0) {
        const firstItem = pageItems[0];
        const cd = sort === 'likes'
            ? { p: firstItem.is_pinned, l: firstItem.likes, i: firstItem.id }
            : { p: firstItem.is_pinned, i: firstItem.id };
        firstCursor = btoa(JSON.stringify(cd));
    }

    let replies = [];
    const parentIds = pageItems.map(m => m.id);
    if (parentIds.length > 0) {
        const ph = parentIds.map(() => '?').join(',');
        const replySelect = isAdminUser
            ? 'SELECT g.*, u.nickname, u.email, u.is_banned, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id'
            : 'SELECT g.*, u.nickname, u.email, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id';
        const replyResult = await env.DB.prepare(`${replySelect} WHERE g.parent_id IN (${ph}) ORDER BY g.created_at ASC`).bind(...parentIds).all();
        replies = replyResult.results;
    }

    let likedIds = new Set();
    const allIds = [...pageItems.map(m => m.id), ...replies.map(r => r.id)];
    if (allIds.length > 0) {
        const ph = allIds.map(() => '?').join(',');
        const likeResult = await env.DB.prepare(`SELECT guestbook_id FROM guestbook_likes WHERE user_id = ? AND guestbook_id IN (${ph})`).bind(currentUserId, ...allIds).all();
        likedIds = new Set(likeResult.results.map(r => r.guestbook_id));
    }

    for (const msg of pageItems) {
        msg.has_liked = likedIds.has(msg.id);
    }
    for (const r of replies) {
        r.has_liked = likedIds.has(r.id);
    }

    const sanitizedParents = pageItems.map(msg => {
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

    const sanitizedReplies = replies.map(r => {
        if (r.role === 'admin' || r.role === 'super_admin') {
            r.isAdmin = true;
            r.isSuperAdmin = r.role === 'super_admin';
        }
        if (!isAdminUser && r.email) {
            const [name, domain] = r.email.split('@');
            r.email = `${name.substring(0, 2)}***@${domain}`;
        }
        return r;
    });

    const replyMap = {};
    for (const r of sanitizedReplies) {
        if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
        replyMap[r.parent_id].push(r);
    }

    const organizedData = sanitizedParents.map(p => ({
        ...p,
        replies: replyMap[p.id] || []
    }));

    return new Response(JSON.stringify({
        data: organizedData,
        nextCursor,
        firstCursor,
        hasMore
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
    const todayStart = new Date(new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0] + 'T00:00:00Z').getTime() - 8 * 3600000;
    const todayStartStr = new Date(todayStart).toISOString().replace('T', ' ').replace('.000Z', '');
    const postCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM guestbook WHERE user_id = ? AND created_at >= ?').bind(user.id, todayStartStr).first();
    if (!isAdmin(user) && postCountResult.count >= 10) {
        return new Response(JSON.stringify({ error: '每日限制已达到（每天10条帖子）。' }), { status: 429, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const body = await request.json();
    const { content, parent_id } = body;
    if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (content.length > 500) {
        return new Response(JSON.stringify({ error: '内容过长（最多500字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const MAX_REPLIES_PER_POST = 50;
    let parentId = null;
    if (parent_id) {
        const parentEntry = await env.DB.prepare('SELECT id, parent_id, is_hidden FROM guestbook WHERE id = ?').bind(parent_id).first();
        if (!parentEntry) {
            return new Response(JSON.stringify({ error: '回复的留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (parentEntry.parent_id) {
            return new Response(JSON.stringify({ error: '不支持多层回复，请直接回复原留言' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (parentEntry.is_hidden && !isAdmin(user)) {
            return new Response(JSON.stringify({ error: '无法回复审核中的留言' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const replyCount = await env.DB.prepare('SELECT COUNT(*) as count FROM guestbook WHERE parent_id = ?').bind(parent_id).first();
        if (!isAdmin(user) && replyCount.count >= MAX_REPLIES_PER_POST) {
            return new Response(JSON.stringify({ error: `该留言回复数已达上限（${MAX_REPLIES_PER_POST}条）` }), { status: 429, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        parentId = parseInt(parent_id);
    }
    const userNickname = user.nickname || (user.email ? user.email.split('@')[0] : '匿名用户');
    if (parentId) {
        if (!isAdmin(user)) {
            const entryForCheck = { parent_id: parentId, content: content.trim(), nickname: userNickname, role: user.role };
            const moderation = await processReplyWithAI(entryForCheck, env);
            if (!moderation.pass) {
                const errorPrefix = moderation.isNicknameViolation ? '昵称未通过审核' : '回复未通过审核';
                return new Response(JSON.stringify({ success: false, error: `${errorPrefix}：${moderation.reason}` }), {
                    status: 451,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
        }
        const result = await env.DB.prepare(
            'INSERT INTO guestbook (user_id, content, parent_id, is_hidden) VALUES (?, ?, ?, 0)'
        ).bind(user.id, content.trim(), parentId).run();
        const newId = result.meta.last_row_id;
        return new Response(JSON.stringify({ success: true, id: newId }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const result = await env.DB.prepare(
        'INSERT INTO guestbook (user_id, content, parent_id, is_hidden) VALUES (?, ?, ?, 1)'
    ).bind(user.id, content.trim(), null).run();
    const newId = result.meta.last_row_id;
    if (context && context.waitUntil) {
        context.waitUntil((async () => {
            try {
                const newEntry = await env.DB.prepare(
                    'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                ).bind(newId).first();
                if (newEntry && isAdmin(newEntry)) {
                    await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(newId).run();
                } else if (newEntry) {
                    const aiResult = await processWithAIAgent(newEntry, env, true);
                    if (aiResult && aiResult.success && (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                        await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(newId).run();
                    }
                }
            } catch (err) {
                console.error('自动AI处理失败:', err);
            }
        })());
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
    const entry = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
    if (!entry) {
        return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (!isAdmin(user) && entry.user_id !== user.id) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (isAdmin(user) && entry.user_id !== user.id) {
        const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entry.user_id).first();
        if (entryAuthor && entryAuthor.role === 'super_admin' && !isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '普通管理员不能删除超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
    }
    await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
    if (isAdmin(user) && entry.user_id !== user.id) {
        await logAdminAction(env, user.id, 'delete_guestbook', 'guestbook', id, '管理员删除留言', JSON.stringify({ snapshot_content: entry.content, nickname: entry.nickname, user_id: entry.user_id }));
    }
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
        const guestbookEntry = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!guestbookEntry) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isAdmin(user) && guestbookEntry.user_id !== user.id) {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (isAdmin(user) && guestbookEntry.user_id !== user.id) {
            const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(guestbookEntry.user_id).first();
            if (entryAuthor && entryAuthor.role === 'super_admin' && !isSuperAdmin(user)) {
                return new Response(JSON.stringify({ error: '普通管理员不能修改超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        if (isAdmin(user)) {
            await env.DB.prepare('UPDATE guestbook SET content = ? WHERE id = ?').bind(content.trim(), id).run();
            if (guestbookEntry.user_id !== user.id) {
                await logAdminAction(env, user.id, 'edit_guestbook', 'guestbook', id, '管理员编辑留言', JSON.stringify({ snapshot_content: guestbookEntry.content, nickname: guestbookEntry.nickname, user_id: guestbookEntry.user_id }));
            }
        } else if (guestbookEntry.parent_id) {
            const entryForCheck = { parent_id: guestbookEntry.parent_id, content: content.trim(), nickname: guestbookEntry.nickname, role: user.role, id: guestbookEntry.id };
            const moderation = await processReplyWithAI(entryForCheck, env);
            if (!moderation.pass) {
                const errorPrefix = moderation.isNicknameViolation ? '昵称未通过审核' : '回复未通过审核';
                return new Response(JSON.stringify({ success: false, error: `${errorPrefix}：${moderation.reason}` }), {
                    status: 451,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
            await env.DB.prepare('UPDATE guestbook SET content = ?, status = ?, reject_reason = NULL, is_hidden = 0 WHERE id = ?').bind(content.trim(), 'unresolved', id).run();
        } else {
            await env.DB.prepare('UPDATE guestbook SET content = ?, status = ?, reject_reason = NULL, is_hidden = 1 WHERE id = ?').bind(content.trim(), 'unresolved', id).run();
        }
        if (context && context.waitUntil && !guestbookEntry.parent_id) {
            context.waitUntil((async () => {
                try {
                    const updatedEntry = await env.DB.prepare(
                        'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                    ).bind(id).first();
                    if (updatedEntry && isAdmin(user)) {
                        await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(id).run();
                    } else if (updatedEntry) {
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
        const gbEntryHide = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!gbEntryHide) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(gbEntryHide.user_id).first();
            if (entryAuthor && entryAuthor.role === 'super_admin') {
                return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        const isHidden = action === 'hide';
        await env.DB.prepare('UPDATE guestbook SET is_hidden = ? WHERE id = ?').bind(isHidden ? 1 : 0, id).run();
        await logAdminAction(env, user.id, action, 'guestbook', id, action === 'hide' ? '隐藏留言' : '取消隐藏留言', JSON.stringify({ snapshot_content: gbEntryHide.content, nickname: gbEntryHide.nickname, user_id: gbEntryHide.user_id }));
    } else if (action === 'pin' || action === 'unpin') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const gbEntryPin = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!gbEntryPin) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(gbEntryPin.user_id).first();
            if (entryAuthor && entryAuthor.role === 'super_admin') {
                return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        const isPinned = action === 'pin';
        await env.DB.prepare('UPDATE guestbook SET is_pinned = ? WHERE id = ?').bind(isPinned ? 1 : 0, id).run();
        await logAdminAction(env, user.id, action, 'guestbook', id, action === 'pin' ? '置顶留言' : '取消置顶留言', JSON.stringify({ snapshot_content: gbEntryPin.content, nickname: gbEntryPin.nickname, user_id: gbEntryPin.user_id }));
    } else if (action === 'resolve' || action === 'unresolve') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const gbEntryResolve = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!gbEntryResolve) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(gbEntryResolve.user_id).first();
            if (entryAuthor && entryAuthor.role === 'super_admin') {
                return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        const status = action === 'resolve' ? 'resolved' : 'unresolved';
        const resolveNote = action === 'resolve' ? (body.resolve_note || null) : null;
        const isHidden = action === 'resolve' ? 0 : null;
        const logDetails = { snapshot_content: gbEntryResolve.content, nickname: gbEntryResolve.nickname, user_id: gbEntryResolve.user_id };
        if (resolveNote) {
            try {
                const parsed = JSON.parse(resolveNote);
                if (parsed.path) logDetails.resource_path = parsed.path;
                if (parsed.note) logDetails.note = parsed.note;
            } catch {
                logDetails.resolve_note = resolveNote;
            }
        }
        if (isHidden !== null) {
            await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ?, is_hidden = ? WHERE id = ?').bind(status, resolveNote, isHidden, id).run();
        } else {
            await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ? WHERE id = ?').bind(status, resolveNote, id).run();
        }
        await logAdminAction(env, user.id, action, 'guestbook', id, action === 'resolve' ? '标记留言为已解决' : '标记留言为未解决', JSON.stringify(logDetails));
    } else if (action === 'reject') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const gbEntryReject = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!gbEntryReject) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(gbEntryReject.user_id).first();
            if (entryAuthor && entryAuthor.role === 'super_admin') {
                return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        const rejectReason = body.reject_reason || '';
        if (!rejectReason || rejectReason.trim().length === 0) {
            return new Response(JSON.stringify({ error: '请填写驳回原因' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (rejectReason.length > 200) {
            return new Response(JSON.stringify({ error: '驳回原因过长（最多200字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?').bind('rejected', rejectReason.trim(), id).run();
        await logAdminAction(env, user.id, 'reject', 'guestbook', id, `驳回留言: ${rejectReason.trim()}`, JSON.stringify({ snapshot_content: gbEntryReject.content, nickname: gbEntryReject.nickname, user_id: gbEntryReject.user_id }));
    } else if (action === 'unreject') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const gbEntryUnreject = await env.DB.prepare('SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!gbEntryUnreject) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(gbEntryUnreject.user_id).first();
            if (entryAuthor && entryAuthor.role === 'super_admin') {
                return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, is_hidden = 0 WHERE id = ?').bind('unresolved', id).run();
        await logAdminAction(env, user.id, 'unreject', 'guestbook', id, '取消驳回留言', JSON.stringify({ snapshot_content: gbEntryUnreject.content, nickname: gbEntryUnreject.nickname, user_id: gbEntryUnreject.user_id }));
    } else if (action === 'ban_user') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const guestbookEntry = await env.DB.prepare('SELECT g.user_id, g.content, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (!guestbookEntry) {
            return new Response(JSON.stringify({ error: '留言不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const targetUser = await env.DB.prepare('SELECT role, nickname FROM users WHERE id = ?').bind(guestbookEntry.user_id).first();
        if (targetUser && (targetUser.role === 'admin' || targetUser.role === 'super_admin')) {
            return new Response(JSON.stringify({ error: '不能封禁管理员' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (isSuperAdmin(user)) {
            await env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(guestbookEntry.user_id).run();
            await logAdminAction(env, user.id, 'ban_user', 'user', guestbookEntry.user_id, '封禁用户', JSON.stringify({ snapshot_content: guestbookEntry.content, nickname: guestbookEntry.nickname || (targetUser ? targetUser.nickname : null), user_id: guestbookEntry.user_id }));
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
        const guestbookEntry = await env.DB.prepare('SELECT g.user_id, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?').bind(id).first();
        if (guestbookEntry) {
            if (isSuperAdmin(user)) {
                await env.DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(guestbookEntry.user_id).run();
                await logAdminAction(env, user.id, 'unban_user', 'user', guestbookEntry.user_id, '解封用户', JSON.stringify({ nickname: guestbookEntry.nickname, user_id: guestbookEntry.user_id }));
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