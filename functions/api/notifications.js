import { verifyToken, addCorsHeaders } from '../utils.js';

const RETENTION_DAYS = 60;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_CACHE_ID = 200;

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    try {
        if (context.waitUntil) context.waitUntil(maybeCleanupOldNotifications(env));
        if (request.method === 'GET') return await handleGet(request, env);
        if (request.method === 'POST') return await handlePost(request, env);
        if (request.method === 'DELETE') return await handleDelete(request, env);
        return new Response(JSON.stringify({ error: '方法不允许' }), {
            status: 405,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (e) {
        console.error('Notifications API 错误:', e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}

async function maybeCleanupOldNotifications(env) {
    if (!env.DB) return;
    try {
        const row = await env.DB.prepare('SELECT updated_at FROM system_cache WHERE id = ?').bind(CLEANUP_CACHE_ID).first();
        const now = Date.now();
        const last = row?.updated_at ? Date.parse(String(row.updated_at).replace(' ', 'T') + 'Z') : 0;
        if (now - last < CLEANUP_INTERVAL_MS) return;
        await env.DB.prepare(
            'INSERT INTO system_cache (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP'
        ).bind(CLEANUP_CACHE_ID, '{}').run();
        const cutoffExpr = `datetime('now', '-${RETENTION_DAYS} days')`;
        await env.DB.prepare(
            `DELETE FROM notifications WHERE created_at < ${cutoffExpr}`
        ).run();
    } catch (e) {
        console.error('通知清理失败:', e);
    }
}

async function getUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!payload) return null;
    return await env.DB.prepare('SELECT id, is_banned FROM users WHERE id = ?').bind(payload.id).first();
}

function parsePayload(notif) {
    if (!notif) return notif;
    if (notif.payload) {
        try { notif.payload = JSON.parse(notif.payload); } catch (e) { notif.payload = null; }
    }
    notif.is_read = notif.is_read === 1 || notif.is_read === true;
    return notif;
}

async function handleGet(request, env) {
    const user = await getUser(request, env);
    if (!user || user.is_banned) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const userId = user.id;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const filter = url.searchParams.get('filter') || 'all';
    const cursorStr = url.searchParams.get('cursor') || null;
    let cursorObj = null;
    if (cursorStr) {
        try { cursorObj = JSON.parse(atob(cursorStr)); } catch (e) { cursorObj = null; }
    }

    let where = 'WHERE user_id = ?';
    const params = [userId];
    if (filter === 'unread') { where += ' AND is_read = FALSE'; }

    if (cursorObj && cursorObj.c && cursorObj.i) {
        where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(cursorObj.c, cursorObj.c, cursorObj.i);
    }

    const { results } = await env.DB.prepare(
        `SELECT id, user_id, type, title, body, link, icon, payload, is_read, created_at
         FROM notifications ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
    ).bind(...params, limit + 1).all();

    const items = (results || []).slice(0, limit).map(parsePayload);
    const hasMore = (results || []).length > limit;
    let nextCursor = null;
    if (hasMore && items.length > 0) {
        const last = items[items.length - 1];
        nextCursor = btoa(JSON.stringify({ c: last.created_at, i: last.id }));
    }
    return new Response(JSON.stringify({ success: true, notifications: items, next_cursor: nextCursor }), {
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}

async function handlePost(request, env) {
    const user = await getUser(request, env);
    if (!user || user.is_banned) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const body = await request.json().catch(() => ({}));

    if (action === 'mark_read') {
        const ids = Array.isArray(body.ids) ? body.ids.filter(Number.isInteger) : [];
        const all = body.all === true;
        if (all) {
            await env.DB.prepare(
                'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE'
            ).bind(user.id).run();
        } else if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            await env.DB.prepare(
                `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id IN (${placeholders})`
            ).bind(user.id, ...ids).run();
        }
        const row = await env.DB.prepare(
            'SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = ? AND is_read = FALSE) as has_unread'
        ).bind(user.id).first();
        return new Response(JSON.stringify({ success: true, has_unread: !!row?.has_unread }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }

    if (action === 'mark_one_read' && body.id) {
        await env.DB.prepare(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id = ?'
        ).bind(user.id, body.id).run();
        const row = await env.DB.prepare(
            'SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = ? AND is_read = FALSE) as has_unread'
        ).bind(user.id).first();
        return new Response(JSON.stringify({ success: true, has_unread: !!row?.has_unread }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }

    return new Response(JSON.stringify({ error: '未知操作' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}

async function handleDelete(request, env) {
    const user = await getUser(request, env);
    if (!user || user.is_banned) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
        await env.DB.prepare('DELETE FROM notifications WHERE user_id = ? AND id = ?').bind(user.id, parseInt(id)).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const all = url.searchParams.get('all') === 'true';
    if (all) {
        await env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    return new Response(JSON.stringify({ error: '缺少参数' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}