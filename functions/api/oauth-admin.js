import { verifyToken, addCorsHeaders, hashPassword, isSuperAdmin, logAdminAction } from '../utils.js';

async function getUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!payload) return null;
    return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
}

function generateClientId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = new Uint8Array(24);
    crypto.getRandomValues(randomBytes);
    return 'whut_' + Array.from(randomBytes, b => chars[b % chars.length]).join('');
}

async function generateClientSecret() {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        const user = await getUser(request, env);
        if (!user) {
            return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ success: false, error: '需要超级管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        if (action === 'list') {
            const clients = await env.DB.prepare(
                'SELECT id, client_id, client_name, redirect_uris, description, logo_url, is_active, created_at, created_by FROM oauth_clients ORDER BY created_at DESC'
            ).all();
            const enrichedClients = await Promise.all((clients.results || []).map(async (c) => {
                if (c.created_by) {
                    const creator = await env.DB.prepare('SELECT nickname, email FROM users WHERE id = ?').bind(c.created_by).first();
                    return { ...c, created_by_name: creator ? (creator.nickname || creator.email) : '未知' };
                }
                return { ...c, created_by_name: '系统' };
            }));
            const activeTokens = await env.DB.prepare('SELECT client_id, COUNT(*) as count FROM oauth_access_tokens WHERE expires_at > ? GROUP BY client_id').bind(new Date().toISOString()).all();
            const tokenMap = {};
            for (const t of (activeTokens.results || [])) {
                tokenMap[t.client_id] = t.count;
            }
            return new Response(JSON.stringify({
                success: true,
                clients: enrichedClients.map(c => ({
                    ...c,
                    active_tokens: tokenMap[c.client_id] || 0
                }))
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'detail' && url.searchParams.get('client_id')) {
            const client = await env.DB.prepare(
                'SELECT id, client_id, client_name, redirect_uris, description, logo_url, is_active, created_at, created_by FROM oauth_clients WHERE client_id = ?'
            ).bind(url.searchParams.get('client_id')).first();
            if (!client) {
                return new Response(JSON.stringify({ success: false, error: '客户端不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const recentAuthCodes = await env.DB.prepare(
                'SELECT ac.code, ac.scope, ac.created_at, ac.expires_at, u.nickname, u.email FROM oauth_authorization_codes ac LEFT JOIN users u ON ac.user_id = u.id WHERE ac.client_id = ? ORDER BY ac.created_at DESC LIMIT 20'
            ).bind(client.client_id).all();
            return new Response(JSON.stringify({
                success: true,
                client,
                recentAuthorizations: recentAuthCodes.results || []
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        return new Response(JSON.stringify({ success: false, error: '未知操作' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } catch (e) {
        console.error('OAuth admin GET error:', e);
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const user = await getUser(request, env);
        if (!user) {
            return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (!isSuperAdmin(user)) {
            return new Response(JSON.stringify({ success: false, error: '需要超级管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const body = await request.json();
        const { action } = body;
        if (action === 'create') {
            const { client_name, redirect_uris, description, logo_url } = body;
            if (!client_name || !redirect_uris) {
                return new Response(JSON.stringify({ success: false, error: '客户端名称和回调地址不能为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const uriList = redirect_uris.split(',').map(u => u.trim()).filter(Boolean);
            for (const uri of uriList) {
                try {
                    new URL(uri);
                } catch {
                    return new Response(JSON.stringify({ success: false, error: `无效的回调地址: ${uri}` }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                }
            }
            const clientId = generateClientId();
            const clientSecret = await generateClientSecret();
            const secretHash = await hashPassword(clientSecret, env.SALT);
            await env.DB.prepare(
                'INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, description, logo_url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(clientId, secretHash, client_name.trim(), uriList.join(','), description || '', logo_url || '', user.id).run();
            await logAdminAction(env, user.id, 'oauth_client_create', 'oauth_client', null, `创建OAuth客户端: ${client_name} (${clientId})`);
            return new Response(JSON.stringify({
                success: true,
                client: { client_id: clientId, client_secret: clientSecret, client_name: client_name.trim(), redirect_uris: uriList.join(','), description: description || '', logo_url: logo_url || '' },
                message: '请妥善保管 client_secret，此为唯一一次展示机会'
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'reset_secret') {
            const { client_id } = body;
            if (!client_id) {
                return new Response(JSON.stringify({ success: false, error: '缺少 client_id' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').bind(client_id).first();
            if (!client) {
                return new Response(JSON.stringify({ success: false, error: '客户端不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const newSecret = await generateClientSecret();
            const secretHash = await hashPassword(newSecret, env.SALT);
            await env.DB.prepare('UPDATE oauth_clients SET client_secret_hash = ? WHERE client_id = ?').bind(secretHash, client_id).run();
            await logAdminAction(env, user.id, 'oauth_client_reset_secret', 'oauth_client', null, `重置OAuth客户端密钥: ${client.client_name} (${client_id})`);
            return new Response(JSON.stringify({
                success: true,
                client_secret: newSecret,
                message: '请妥善保管新的 client_secret，此为唯一一次展示机会'
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'toggle') {
            const { client_id } = body;
            if (!client_id) {
                return new Response(JSON.stringify({ success: false, error: '缺少 client_id' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').bind(client_id).first();
            if (!client) {
                return new Response(JSON.stringify({ success: false, error: '客户端不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const newActive = !client.is_active;
            await env.DB.prepare('UPDATE oauth_clients SET is_active = ? WHERE client_id = ?').bind(newActive ? 1 : 0, client_id).run();
            await logAdminAction(env, user.id, 'oauth_client_toggle', 'oauth_client', null, `${newActive ? '启用' : '禁用'}OAuth客户端: ${client.client_name} (${client_id})`);
            return new Response(JSON.stringify({ success: true, is_active: newActive }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'update') {
            const { client_id, client_name, redirect_uris, description, logo_url } = body;
            if (!client_id) {
                return new Response(JSON.stringify({ success: false, error: '缺少 client_id' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').bind(client_id).first();
            if (!client) {
                return new Response(JSON.stringify({ success: false, error: '客户端不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const updates = [];
            const binds = [];
            if (client_name !== undefined && client_name.trim()) {
                updates.push('client_name = ?');
                binds.push(client_name.trim());
            }
            if (redirect_uris !== undefined) {
                const uriList = redirect_uris.split(',').map(u => u.trim()).filter(Boolean);
                for (const uri of uriList) {
                    try { new URL(uri); } catch {
                        return new Response(JSON.stringify({ success: false, error: `无效的回调地址: ${uri}` }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
                    }
                }
                updates.push('redirect_uris = ?');
                binds.push(uriList.join(','));
            }
            if (description !== undefined) { updates.push('description = ?'); binds.push(description); }
            if (logo_url !== undefined) { updates.push('logo_url = ?'); binds.push(logo_url); }
            if (updates.length === 0) {
                return new Response(JSON.stringify({ success: false, error: '没有需要更新的字段' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            binds.push(client_id);
            await env.DB.prepare(`UPDATE oauth_clients SET ${updates.join(', ')} WHERE client_id = ?`).bind(...binds).run();
            await logAdminAction(env, user.id, 'oauth_client_update', 'oauth_client', null, `更新OAuth客户端: ${client.client_name} (${client_id})`);
            return new Response(JSON.stringify({ success: true, message: '更新成功' }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'delete') {
            const { client_id } = body;
            if (!client_id) {
                return new Response(JSON.stringify({ success: false, error: '缺少 client_id' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').bind(client_id).first();
            if (!client) {
                return new Response(JSON.stringify({ success: false, error: '客户端不存在' }), { status: 404, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            await env.DB.prepare('DELETE FROM oauth_access_tokens WHERE client_id = ?').bind(client_id).run();
            await env.DB.prepare('DELETE FROM oauth_authorization_codes WHERE client_id = ?').bind(client_id).run();
            await env.DB.prepare('DELETE FROM oauth_clients WHERE client_id = ?').bind(client_id).run();
            await logAdminAction(env, user.id, 'oauth_client_delete', 'oauth_client', null, `删除OAuth客户端: ${client.client_name} (${client_id})`);
            return new Response(JSON.stringify({ success: true, message: '客户端已删除' }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'revoke_tokens') {
            const { client_id } = body;
            if (!client_id) {
                return new Response(JSON.stringify({ success: false, error: '缺少 client_id' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const result = await env.DB.prepare('DELETE FROM oauth_access_tokens WHERE client_id = ?').bind(client_id).run();
            await logAdminAction(env, user.id, 'oauth_revoke_tokens', 'oauth_client', null, `撤销OAuth客户端所有令牌: ${client_id}, 影响行数: ${result.meta?.changes || 0}`);
            return new Response(JSON.stringify({ success: true, message: '已撤销该客户端的所有令牌' }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        if (action === 'cleanup') {
            const now = new Date().toISOString();
            const expiredCodes = await env.DB.prepare('DELETE FROM oauth_authorization_codes WHERE expires_at < ?').bind(now).run();
            const expiredTokens = await env.DB.prepare('DELETE FROM oauth_access_tokens WHERE expires_at < ?').bind(now).run();
            return new Response(JSON.stringify({
                success: true,
                message: `清理完成：删除 ${expiredCodes.meta?.changes || 0} 条过期授权码，${expiredTokens.meta?.changes || 0} 条过期令牌`
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        return new Response(JSON.stringify({ success: false, error: '未知操作' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } catch (e) {
        console.error('OAuth admin POST error:', e);
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}