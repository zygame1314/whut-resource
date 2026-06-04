import { verifyToken, addCorsHeaders, isAdmin, isSuperAdmin, logAdminAction } from '../utils.js';
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
        } else if (request.method === 'PUT') {
            return await handlePut(request, env);
        } else if (request.method === 'DELETE') {
            return await handleDelete(request, env);
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
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
    return user;
}
async function handleGet(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '未认证' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const isAdminUser = isAdmin(user);
    const MAX_LIMIT = 200;
    let query = 'SELECT * FROM announcements WHERE is_published = TRUE ORDER BY created_at DESC LIMIT ?';
    if (isAdminUser) {
        query = 'SELECT * FROM announcements ORDER BY created_at DESC LIMIT ?';
    }
    const { results } = await env.DB.prepare(query).bind(MAX_LIMIT).all();
    return new Response(JSON.stringify({
        data: results,
        totalItems: results.length
    }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePost(request, env) {
    const user = await getUser(request, env);
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 102400) {
        return new Response(JSON.stringify({ error: '请求体过大' }), { status: 413, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const { title, content, is_published } = await request.json();
    if (!title || title.trim().length === 0) {
        return new Response(JSON.stringify({ error: '标题不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (title.length > 200) {
        return new Response(JSON.stringify({ error: '标题过长（最多200字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (content.length > 50000) {
        return new Response(JSON.stringify({ error: '内容过长（最多50000字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const result = await env.DB.prepare(
        'INSERT INTO announcements (title, content, is_published, author_id) VALUES (?, ?, ?, ?)'
    ).bind(title.trim(), content.trim(), is_published ? 1 : 0, user.id).run();
    await logAdminAction(env, user.id, 'create_announcement', 'announcement', result.meta.last_row_id, '创建公告', JSON.stringify({ title: title.trim() }));
    return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePut(request, env) {
    const user = await getUser(request, env);
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 102400) {
        return new Response(JSON.stringify({ error: '请求体过大' }), { status: 413, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const { id, title, content, is_published } = await request.json();
    if (!id) {
        return new Response(JSON.stringify({ error: '缺少ID' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const announcement = await env.DB.prepare('SELECT author_id FROM announcements WHERE id = ?').bind(id).first();
    if (!announcement) {
        return new Response(JSON.stringify({ error: '公告不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const author = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(announcement.author_id).first();
    if (author && author.role === 'super_admin' && !isSuperAdmin(user)) {
        return new Response(JSON.stringify({ error: '普通管理员不能修改超级管理员发布的公告' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (!title || title.trim().length === 0) {
        return new Response(JSON.stringify({ error: '标题不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (title.length > 200) {
        return new Response(JSON.stringify({ error: '标题过长（最多200字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (content.length > 50000) {
        return new Response(JSON.stringify({ error: '内容过长（最多50000字符）' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    await env.DB.prepare(
        'UPDATE announcements SET title = ?, content = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(title.trim(), content.trim(), is_published ? 1 : 0, id).run();
    await logAdminAction(env, user.id, 'update_announcement', 'announcement', id, '更新公告', JSON.stringify({ title: title.trim() }));
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handleDelete(request, env) {
    const user = await getUser(request, env);
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response(JSON.stringify({ error: '缺少ID' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const announcement = await env.DB.prepare('SELECT author_id FROM announcements WHERE id = ?').bind(id).first();
    if (!announcement) {
        return new Response(JSON.stringify({ error: '公告不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const author = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(announcement.author_id).first();
    if (author && author.role === 'super_admin' && !isSuperAdmin(user)) {
        return new Response(JSON.stringify({ error: '普通管理员不能删除超级管理员发布的公告' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
    await logAdminAction(env, user.id, 'delete_announcement', 'announcement', id, '删除公告', JSON.stringify({ announcement_id: id }));
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
