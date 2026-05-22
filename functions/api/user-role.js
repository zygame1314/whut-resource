import { verifyToken, addCorsHeaders, isSuperAdmin } from '../utils.js';
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        const user = await getUser(request, env);
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要超级管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (request.method === 'GET') {
            return await handleGet(request, env);
        } else if (request.method === 'PUT') {
            return await handlePut(request, env, user);
        } else {
            return new Response('方法不允许', { status: 405, headers: addCorsHeaders() });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
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
    if (action === 'search') {
        const keyword = url.searchParams.get('keyword') || '';
        if (!keyword || keyword.trim().length < 2) {
            return new Response(JSON.stringify({ error: '请输入完整邮箱前缀进行搜索' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const prefix = `${keyword.trim()}%`;
        const { results } = await env.DB.prepare(
            "SELECT id, email, nickname, role, is_banned, created_at FROM users WHERE email LIKE ? AND role != 'super_admin' LIMIT 20"
        ).bind(prefix).all();
        return new Response(JSON.stringify({ success: true, users: results }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'admins') {
        const { results } = await env.DB.prepare(
            "SELECT id, email, nickname, role, is_banned, created_at FROM users WHERE role = 'admin' ORDER BY created_at ASC"
        ).all();
        return new Response(JSON.stringify({ success: true, users: results }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    return new Response(JSON.stringify({ error: '未知操作' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}
async function handlePut(request, env, currentUser) {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 10240) {
        return new Response(JSON.stringify({ error: '请求体过大' }), { status: 413, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const body = await request.json();
    const { user_id, action } = body;
    if (!user_id || !action) {
        return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const targetUser = await env.DB.prepare('SELECT id, email, nickname, role FROM users WHERE id = ?').bind(user_id).first();
    if (!targetUser) {
        return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (targetUser.role === 'super_admin') {
        return new Response(JSON.stringify({ error: '不能修改超级管理员的角色' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    if (action === 'promote') {
        if (targetUser.role === 'admin') {
            return new Response(JSON.stringify({ error: '该用户已是管理员' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user_id).run();
    } else if (action === 'demote') {
        if (targetUser.role === 'user') {
            return new Response(JSON.stringify({ error: '该用户已是普通用户' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(user_id).run();
    } else {
        return new Response(JSON.stringify({ error: '无效操作' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    return new Response(JSON.stringify({ success: true }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}