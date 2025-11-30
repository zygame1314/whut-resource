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
        } else if (request.method === 'PUT') {
            return await handlePut(request, env);
        } else if (request.method === 'DELETE') {
            return await handleDelete(request, env);
        } else {
            return new Response('Method Not Allowed', { status: 405, headers: addCorsHeaders() });
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
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const isAdmin = user && user.role === 'admin';

    let query = 'SELECT * FROM announcements WHERE is_published = TRUE ORDER BY created_at DESC';
    if (isAdmin) {
        query = 'SELECT * FROM announcements ORDER BY created_at DESC';
    }

    const { results } = await env.DB.prepare(query).all();
    return new Response(JSON.stringify(results), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePost(request, env) {
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const { title, content, is_published } = await request.json();
    const result = await env.DB.prepare(
        'INSERT INTO announcements (title, content, is_published, author_id) VALUES (?, ?, ?, ?)'
    ).bind(title, content, is_published ? 1 : 0, user.id).run();
    return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePut(request, env) {
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const { id, title, content, is_published } = await request.json();
    await env.DB.prepare(
        'UPDATE announcements SET title = ?, content = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(title, content, is_published ? 1 : 0, id).run();
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handleDelete(request, env) {
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
