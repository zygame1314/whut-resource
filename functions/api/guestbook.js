import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin, logAdminAction } from '../utils.js';
import { processWithAIAgent, processReplyWithAI, preFilterWithSmallModel } from './guestbook-ai.js';
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
    if (action === 'stats') {
        const user = await getUser(request, env);
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        let stats = await env.DB.prepare('SELECT * FROM guestbook_stats WHERE id = 1').first();
        if (!stats) {
            await env.DB.prepare('INSERT OR IGNORE INTO guestbook_stats (id, total_messages_all_time, current_messages_count) SELECT 1, COUNT(*), COUNT(*) FROM guestbook').run();
            stats = await env.DB.prepare('SELECT * FROM guestbook_stats WHERE id = 1').first();
        }
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
    const MAX_LIMIT = 500;
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const currentUserId = user.id;
    const isAdminUser = isAdmin(user);

    const etagRow = await env.DB.prepare(
        'SELECT MAX(created_at) as max_created, COUNT(*) as cnt, SUM(is_hidden) as hidden_cnt, SUM(is_pinned) as pinned_cnt FROM guestbook'
    ).first();
    const etagSource = `${etagRow?.max_created || ''}_${etagRow?.cnt || 0}_${etagRow?.hidden_cnt || 0}_${etagRow?.pinned_cnt || 0}_${currentUserId}_${isAdminUser}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(etagSource));
    const etag = '"' + Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16) + '"';
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, { status: 304, headers: addCorsHeaders({ 'ETag': etag }) });
    }

    const orderByClause = 'ORDER BY g.is_pinned DESC, g.created_at DESC';
    let query;
    let params = [];
    let results;
    const adminSelect = `SELECT g.*, u.nickname, u.email, u.is_banned, u.role
        FROM guestbook g
        LEFT JOIN users u ON g.user_id = u.id`;
    const userSelect = `SELECT g.*, u.nickname, u.email, u.role
        FROM guestbook g
        LEFT JOIN users u ON g.user_id = u.id`;
    if (isAdminUser) {
        query = `${adminSelect} ${orderByClause} LIMIT ?`;
        params = [MAX_LIMIT];
        const q = await env.DB.prepare(query).bind(...params).all();
        results = q.results;
    } else {
        query = `${userSelect} WHERE (g.is_hidden = FALSE OR g.user_id = ?) ${orderByClause} LIMIT ?`;
        params = [currentUserId, MAX_LIMIT];
        const q = await env.DB.prepare(query).bind(...params).all();
        results = q.results;
    }
    let likedIds = new Set();
    const likeRows = results.map(r => r.id);
    if (likeRows.length > 0) {
        const placeholders = likeRows.map(() => '?').join(',');
        const likeQuery = `SELECT guestbook_id FROM guestbook_likes WHERE user_id = ? AND guestbook_id IN (${placeholders})`;
        const likeResult = await env.DB.prepare(likeQuery).bind(currentUserId, ...likeRows).all();
        likedIds = new Set(likeResult.results.map(r => r.guestbook_id));
    }
    for (const msg of results) {
        msg.has_liked = likedIds.has(msg.id);
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
    const parentMessages = sanitizedResults.filter(msg => !msg.parent_id);
    const replyMap = {};
    for (const msg of sanitizedResults) {
        if (msg.parent_id) {
            if (!replyMap[msg.parent_id]) replyMap[msg.parent_id] = [];
            replyMap[msg.parent_id].push(msg);
        }
    }
    const organizedData = parentMessages.map(parent => ({
        ...parent,
        replies: replyMap[parent.id] || []
    }));
    return new Response(JSON.stringify({
        data: organizedData,
        totalItems: organizedData.length
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json', 'ETag': etag }) });
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
    const result = await env.DB.prepare(
        'INSERT INTO guestbook (user_id, content, parent_id, is_hidden) VALUES (?, ?, ?, 1)'
    ).bind(user.id, content.trim(), parentId).run();
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
                    if (newEntry.parent_id) {
                        const replyResult = await processReplyWithAI(newEntry, env);
                        if (replyResult && replyResult.success && (replyResult.action === 'no_action' || replyResult.action === 'keep_pending' || replyResult.action === 'resolve')) {
                            await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(newId).run();
                        }
                    } else {
                        const preFilterResult = await preFilterWithSmallModel(newEntry, env);
                        if (!preFilterResult.passed) {
                            if (preFilterResult.action === 'ban_user') {
                                if (newEntry.role !== 'admin' && newEntry.role !== 'super_admin') {
                                    await env.DB.batch([
                                        env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(newEntry.user_id),
                                        env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(newId)
                                    ]);
                                }
                            } else {
                                await env.DB.prepare(
                                    'UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?'
                                ).bind('rejected', preFilterResult.reason, newId).run();
                            }
                        } else {
                            const aiResult = await processWithAIAgent(newEntry, env, true);
                            if (aiResult && aiResult.success && (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                                await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(newId).run();
                            }
                        }
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
    if (isAdmin(user) && entry.user_id !== user.id) {
        const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entry.user_id).first();
        if (entryAuthor && entryAuthor.role === 'super_admin' && !isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '普通管理员不能删除超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
    }
    await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
    if (isAdmin(user) && entry.user_id !== user.id) {
        await logAdminAction(env, user.id, 'delete_guestbook', 'guestbook', id, '管理员删除留言', JSON.stringify({ entry_user_id: entry.user_id }));
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
        const guestbookEntry = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
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
                await logAdminAction(env, user.id, 'edit_guestbook', 'guestbook', id, '管理员编辑留言', JSON.stringify({ entry_user_id: guestbookEntry.user_id }));
            }
        } else {
            await env.DB.prepare('UPDATE guestbook SET content = ?, status = ?, reject_reason = NULL, is_hidden = 1 WHERE id = ?').bind(content.trim(), 'unresolved', id).run();
        }
        if (context && context.waitUntil) {
            context.waitUntil((async () => {
                try {
                    const updatedEntry = await env.DB.prepare(
                        'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
                    ).bind(id).first();
                    if (updatedEntry && isAdmin(user)) {
                        await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(id).run();
                    } else if (updatedEntry) {
                        if (updatedEntry.parent_id) {
                            const replyResult = await processReplyWithAI(updatedEntry, env);
                            if (replyResult && replyResult.success && (replyResult.action === 'no_action' || replyResult.action === 'keep_pending' || replyResult.action === 'resolve')) {
                                await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(id).run();
                            }
                        } else {
                            const preFilterResult = await preFilterWithSmallModel(updatedEntry, env);
                            if (!preFilterResult.passed) {
                                if (preFilterResult.action === 'ban_user') {
                                    if (updatedEntry.role !== 'admin' && updatedEntry.role !== 'super_admin') {
                                        await env.DB.batch([
                                            env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(updatedEntry.user_id),
                                            env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id)
                                        ]);
                                    }
                                } else {
                                    await env.DB.prepare(
                                        'UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?'
                                    ).bind('rejected', preFilterResult.reason, id).run();
                                }
                            } else {
                                const aiResult = await processWithAIAgent(updatedEntry, env, true);
                                if (aiResult && aiResult.success && (aiResult.action === 'no_action' || aiResult.action === 'keep_pending' || aiResult.action === 'resolve')) {
                                    await env.DB.prepare('UPDATE guestbook SET is_hidden = 0 WHERE id = ?').bind(id).run();
                                }
                            }
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
        if (!isSuperAdmin(user)) {
            const entryOwner = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
            if (entryOwner) {
                const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entryOwner.user_id).first();
                if (entryAuthor && entryAuthor.role === 'super_admin') {
                    return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                }
            }
        }
        const isHidden = action === 'hide';
        await env.DB.prepare('UPDATE guestbook SET is_hidden = ? WHERE id = ?').bind(isHidden ? 1 : 0, id).run();
        await logAdminAction(env, user.id, action, 'guestbook', id, action === 'hide' ? '隐藏留言' : '取消隐藏留言', JSON.stringify({}));
    } else if (action === 'pin' || action === 'unpin') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryOwner = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
            if (entryOwner) {
                const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entryOwner.user_id).first();
                if (entryAuthor && entryAuthor.role === 'super_admin') {
                    return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                }
            }
        }
        const isPinned = action === 'pin';
        await env.DB.prepare('UPDATE guestbook SET is_pinned = ? WHERE id = ?').bind(isPinned ? 1 : 0, id).run();
        await logAdminAction(env, user.id, action, 'guestbook', id, action === 'pin' ? '置顶留言' : '取消置顶留言', JSON.stringify({}));
    } else if (action === 'resolve' || action === 'unresolve') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryOwner = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
            if (entryOwner) {
                const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entryOwner.user_id).first();
                if (entryAuthor && entryAuthor.role === 'super_admin') {
                    return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                }
            }
        }
        const status = action === 'resolve' ? 'resolved' : 'unresolved';
        const resolveNote = action === 'resolve' ? (body.resolve_note || null) : null;
        const isHidden = action === 'resolve' ? 0 : null;
        if (isHidden !== null) {
            await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ?, is_hidden = ? WHERE id = ?').bind(status, resolveNote, isHidden, id).run();
        } else {
            await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ? WHERE id = ?').bind(status, resolveNote, id).run();
        }
        await logAdminAction(env, user.id, action, 'guestbook', id, action === 'resolve' ? '标记留言为已解决' : '标记留言为未解决', JSON.stringify({ resolve_note: resolveNote }));
    } else if (action === 'reject') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryOwner = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
            if (entryOwner) {
                const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entryOwner.user_id).first();
                if (entryAuthor && entryAuthor.role === 'super_admin') {
                    return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                }
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
        await logAdminAction(env, user.id, 'reject', 'guestbook', id, '驳回留言', JSON.stringify({ reject_reason: rejectReason.trim() }));
    } else if (action === 'unreject') {
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            const entryOwner = await env.DB.prepare('SELECT user_id FROM guestbook WHERE id = ?').bind(id).first();
            if (entryOwner) {
                const entryAuthor = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(entryOwner.user_id).first();
                if (entryAuthor && entryAuthor.role === 'super_admin') {
                    return new Response(JSON.stringify({ error: '普通管理员不能操作超级管理员的留言' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                }
            }
        }
        await env.DB.prepare('UPDATE guestbook SET status = ?, reject_reason = NULL, is_hidden = 0 WHERE id = ?').bind('unresolved', id).run();
        await logAdminAction(env, user.id, 'unreject', 'guestbook', id, '取消驳回留言', JSON.stringify({}));
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
            await logAdminAction(env, user.id, 'ban_user', 'user', guestbookEntry.user_id, '封禁用户', JSON.stringify({ guestbook_id: id, nickname: targetUser ? targetUser.nickname : null }));
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
                await logAdminAction(env, user.id, 'unban_user', 'user', guestbookEntry.user_id, '解封用户', JSON.stringify({ guestbook_id: id }));
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
            console.log(`自动清理：已删除 ${deletedCount} 条超过 ${CLEANUP_DAYS} 天的留言。`);
        }
    } catch (err) {
        console.error('自动清理失败：', err);
    }
}