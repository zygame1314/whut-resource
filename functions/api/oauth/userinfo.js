import { addCorsHeaders } from '../../utils.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'invalid_token', error_description: '缺少 Access Token' }),
                { status: 401, headers: addCorsHeaders({ 'WWW-Authenticate': 'Bearer error="invalid_token"', 'Content-Type': 'application/json' }) });
        }

        const accessToken = authHeader.substring(7);
        const tokenRecord = await env.DB.prepare('SELECT * FROM oauth_access_tokens WHERE access_token = ?').bind(accessToken).first();
        if (!tokenRecord) {
            return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Access Token 无效' }),
                { status: 401, headers: addCorsHeaders({ 'WWW-Authenticate': 'Bearer error="invalid_token"', 'Content-Type': 'application/json' }) });
        }

        if (new Date(tokenRecord.expires_at) < new Date()) {
            await env.DB.prepare('DELETE FROM oauth_access_tokens WHERE access_token = ?').bind(accessToken).run();
            return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Access Token 已过期' }),
                { status: 401, headers: addCorsHeaders({ 'WWW-Authenticate': 'Bearer error="invalid_token"', 'Content-Type': 'application/json' }) });
        }

        const user = await env.DB.prepare('SELECT id, email, nickname, role, school_id FROM users WHERE id = ?').bind(tokenRecord.user_id).first();
        if (!user) {
            return new Response(JSON.stringify({ error: 'invalid_token', error_description: '用户不存在' }),
                { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const scopes = tokenRecord.scope ? tokenRecord.scope.split(' ') : ['openid', 'profile', 'email'];
        const claims = { sub: String(user.id) };

        if (scopes.includes('profile')) {
            claims.nickname = user.nickname || '';
            claims.role = user.role;
        }
        if (scopes.includes('email')) {
            claims.email = user.email;
            claims.email_verified = true;
            if (user.school_id) {
                claims.school_id = user.school_id;
            }
        }

        claims.updated_at = Math.floor(Date.now() / 1000);

        return new Response(JSON.stringify(claims), {
            status: 200,
            headers: addCorsHeaders({
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Pragma': 'no-cache'
            })
        });
    } catch (e) {
        console.error('OAuth userinfo error:', e);
        return new Response(JSON.stringify({ error: 'server_error', error_description: e.message }),
            { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}