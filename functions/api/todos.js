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
        }
        return new Response(JSON.stringify({ error: '方法不允许' }), {
            status: 405,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (e) {
        console.error('Todos API 错误:', e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}

async function getUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!payload) return null;
    return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
}

async function handleGet(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    if (action === 'pending_exists') {
        const result = await env.DB.prepare(
            "SELECT 1 as has_pending FROM todos WHERE status = 'pending' LIMIT 1"
        ).first();
        return new Response(JSON.stringify({
            success: true,
            has_pending: !!result
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
    const status = url.searchParams.get('status') || 'pending';
    const validStatuses = ['pending', 'resolved', 'all'];
    const statusFilter = validStatuses.includes(status) ? status : 'pending';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const cursorStr = url.searchParams.get('cursor') || null;

    let cursorObj = null;
    if (cursorStr) {
        try { cursorObj = JSON.parse(atob(cursorStr)); } catch (e) { cursorObj = null; }
    }

    let whereClause = '';
    const params = [];

    if (statusFilter !== 'all') {
        whereClause = 'WHERE status = ?';
        params.push(statusFilter);
    }

    if (cursorObj && cursorObj.c && cursorObj.i) {
        if (whereClause) {
            whereClause += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        } else {
            whereClause = 'WHERE (created_at < ? OR (created_at = ? AND id < ?))';
        }
        params.push(cursorObj.c, cursorObj.c, cursorObj.i);
    }

    const query = `SELECT * FROM todos ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ?`;
    params.push(limit + 1);

    const result = await env.DB.prepare(query).bind(...params).all();
    const rows = result.results || [];
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor = null;
    if (hasMore && pageItems.length > 0) {
        const lastItem = pageItems[pageItems.length - 1];
        const cd = { c: lastItem.created_at, i: lastItem.id };
        nextCursor = btoa(JSON.stringify(cd));
    }

    let todosWithMessages = [];
    if (pageItems.length > 0) {
        const todoIds = pageItems.map(t => t.id);
        const ph = todoIds.map(() => '?').join(',');
        const countResult = await env.DB.prepare(
            `SELECT todo_id, COUNT(*) as cnt FROM todo_guestbook WHERE todo_id IN (${ph}) GROUP BY todo_id`
        ).bind(...todoIds).all();
        const countMap = {};
        for (const c of (countResult.results || [])) {
            countMap[c.todo_id] = c.cnt;
        }
        const allMessages = await env.DB.prepare(
            `SELECT tg.todo_id, g.id, g.content, g.status as guestbook_status, g.created_at, u.nickname, u.role FROM todo_guestbook tg JOIN guestbook g ON tg.guestbook_id = g.id LEFT JOIN users u ON g.user_id = u.id WHERE tg.todo_id IN (${ph}) ORDER BY g.created_at ASC`
        ).bind(...todoIds).all();
        const msgMap = {};
        for (const m of (allMessages.results || [])) {
            if (!msgMap[m.todo_id]) msgMap[m.todo_id] = [];
            msgMap[m.todo_id].push(m);
        }
        todosWithMessages = pageItems.map(t => ({
            ...t,
            guestbook_count: countMap[t.id] || 0,
            messages: msgMap[t.id] || []
        }));
    }

    return new Response(JSON.stringify({
        success: true,
        todos: todosWithMessages,
        nextCursor,
        hasMore
    }), {
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}

async function handlePost(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const body = await request.json();
    const { category, description, guestbook_ids } = body;
    if (!category || !category.trim()) {
        return new Response(JSON.stringify({ error: '分类不能为空' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const trimmedCategory = category.trim().substring(0, 100);
    const trimmedDescription = (description || '').trim().substring(0, 500);

    const existing = await env.DB.prepare(
        'SELECT id, status FROM todos WHERE category = ? AND status = ?'
    ).bind(trimmedCategory, 'pending').first();

    let todoId;
    if (existing) {
        todoId = existing.id;
    } else {
        const insertResult = await env.DB.prepare(
            'INSERT INTO todos (category, description, status) VALUES (?, ?, ?)'
        ).bind(trimmedCategory, trimmedDescription || null, 'pending').run();
        todoId = insertResult.meta.last_row_id;
    }

    const linkedIds = [];
    if (guestbook_ids && Array.isArray(guestbook_ids)) {
        for (const gid of guestbook_ids) {
            const exists = await env.DB.prepare(
                'SELECT 1 FROM guestbook WHERE id = ?'
            ).bind(gid).first();
            if (!exists) continue;
            const alreadyLinked = await env.DB.prepare(
                'SELECT 1 FROM todo_guestbook WHERE todo_id = ? AND guestbook_id = ?'
            ).bind(todoId, gid).first();
            if (alreadyLinked) continue;
            await env.DB.prepare(
                'INSERT INTO todo_guestbook (todo_id, guestbook_id) VALUES (?, ?)'
            ).bind(todoId, gid).run();
            linkedIds.push(gid);
        }
    }

    const todo = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(todoId).first();
    const messages = await env.DB.prepare(
        'SELECT g.id, g.content, g.status as guestbook_status, g.created_at, u.nickname, u.role FROM todo_guestbook tg JOIN guestbook g ON tg.guestbook_id = g.id LEFT JOIN users u ON g.user_id = u.id WHERE tg.todo_id = ? ORDER BY g.created_at ASC'
    ).bind(todoId).all();

    return new Response(JSON.stringify({
        success: true,
        todo: { ...todo, messages: messages.results || [], guestbook_count: (messages.results || []).length }
    }), {
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}

async function handlePut(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const body = await request.json();
    const { id, action } = body;
    if (!id || !action) {
        return new Response(JSON.stringify({ error: '缺少参数' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const todo = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
    if (!todo) {
        return new Response(JSON.stringify({ error: '待办不存在' }), {
            status: 404,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }

    if (action === 'resolve') {
        await env.DB.prepare(
            'UPDATE todos SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?'
        ).bind('resolved', user.id, id).run();
        const linkedMessages = await env.DB.prepare(
            'SELECT guestbook_id FROM todo_guestbook WHERE todo_id = ?'
        ).bind(id).all();
        const resolvedIds = [];
        for (const row of (linkedMessages.results || [])) {
            await env.DB.prepare(
                "UPDATE guestbook SET status = 'resolved', reject_reason = NULL, is_hidden = 0 WHERE id = ? AND status != 'resolved'"
            ).bind(row.guestbook_id).run();
            resolvedIds.push(row.guestbook_id);
        }
        await logAdminAction(env, user.id, 'resolve_todo', 'todo', id, `解决待办「${todo.category}」，关联留言: ${resolvedIds.join(', ')}`, null);
        return new Response(JSON.stringify({
            success: true,
            resolved_guestbook_ids: resolvedIds
        }), { headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }

    if (action === 'unresolve') {
        await env.DB.prepare(
            "UPDATE todos SET status = 'pending', resolved_at = NULL, resolved_by = NULL WHERE id = ?"
        ).bind(id).run();
        await logAdminAction(env, user.id, 'unresolve_todo', 'todo', id, `重新打开待办「${todo.category}」`, null);
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }

    if (action === 'add_message') {
        const { guestbook_id } = body;
        if (!guestbook_id) {
            return new Response(JSON.stringify({ error: '缺少留言ID' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const msgExists = await env.DB.prepare('SELECT 1 FROM guestbook WHERE id = ?').bind(guestbook_id).first();
        if (!msgExists) {
            return new Response(JSON.stringify({ error: '留言不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const alreadyLinked = await env.DB.prepare(
            'SELECT 1 FROM todo_guestbook WHERE todo_id = ? AND guestbook_id = ?'
        ).bind(id, guestbook_id).first();
        if (alreadyLinked) {
            return new Response(JSON.stringify({ error: '该留言已关联到此待办' }), {
                status: 409,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        await env.DB.prepare(
            'INSERT INTO todo_guestbook (todo_id, guestbook_id) VALUES (?, ?)'
        ).bind(id, guestbook_id).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }

    if (action === 'remove_message') {
        const { guestbook_id } = body;
        if (!guestbook_id) {
            return new Response(JSON.stringify({ error: '缺少留言ID' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        await env.DB.prepare(
            'DELETE FROM todo_guestbook WHERE todo_id = ? AND guestbook_id = ?'
        ).bind(id, guestbook_id).run();
        return new Response(JSON.stringify({ success: true }), {
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }

    if (action === 'update') {
        const { category: newCategory, description: newDescription } = body;
        if (newCategory !== undefined) {
            const trimmedCat = (newCategory || '').trim().substring(0, 100);
            if (!trimmedCat) {
                return new Response(JSON.stringify({ error: '分类不能为空' }), {
                    status: 400,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' })
                });
            }
            await env.DB.prepare('UPDATE todos SET category = ? WHERE id = ?').bind(trimmedCat, id).run();
        }
        if (newDescription !== undefined) {
            const trimmedDesc = (newDescription || '').trim().substring(0, 500);
            await env.DB.prepare('UPDATE todos SET description = ? WHERE id = ?').bind(trimmedDesc || null, id).run();
        }
        const updatedTodo = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify({ success: true, todo: updatedTodo }), {
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
    if (!user) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response(JSON.stringify({ error: '缺少待办ID' }), {
            status: 400,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const todo = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
    if (!todo) {
        return new Response(JSON.stringify({ error: '待办不存在' }), {
            status: 404,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    await env.DB.prepare('DELETE FROM todo_guestbook WHERE todo_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
    await logAdminAction(env, user.id, 'delete_todo', 'todo', id, `删除待办「${todo.category}」`, null);
    return new Response(JSON.stringify({ success: true }), {
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}