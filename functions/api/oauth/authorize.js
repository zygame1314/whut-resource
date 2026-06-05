import { verifyToken, addCorsHeaders, signToken, getUserFromRequest, verifyPasswordHash, logAdminAction } from '../../utils.js';

const VALID_SCOPES = ['openid', 'profile', 'email'];
const AUTH_CODE_EXPIRY = 10 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

function generateRandomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, b => chars[b % chars.length]).join('');
}

async function generateToken(length = 48) {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', randomBytes);
    return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('').slice(0, length * 2);
}

function validateScopes(requestedScopes) {
    if (!requestedScopes) return ['openid', 'profile', 'email'];
    const scopes = requestedScopes.split(' ').filter(Boolean);
    const valid = scopes.filter(s => VALID_SCOPES.includes(s));
    return valid.length > 0 ? valid : ['openid', 'profile', 'email'];
}

function validateRedirectUri(clientRedirectUris, requestedUri) {
    const allowed = clientRedirectUris.split(',').map(u => u.trim());
    return allowed.includes(requestedUri);
}

async function verifyPkce(codeVerifier, codeChallenge, method) {
    if (!codeChallenge || !codeVerifier) return true;
    const encoder = new TextEncoder();
    if (method === 'S256') {
        const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
        const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return computed === codeChallenge;
    }
    return codeVerifier === codeChallenge;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const contentType = request.headers.get('Content-Type') || '';
        let params;
        if (contentType.includes('application/json')) {
            params = await request.json();
        } else {
            const formData = await request.formData();
            params = Object.fromEntries(formData.entries());
        }

        const { client_id, redirect_uri, scope, response_type, state, code_challenge, code_challenge_method, decision } = params;

        if (!client_id || !redirect_uri) {
            return new Response(JSON.stringify({ success: false, error: 'client_id 和 redirect_uri 不能为空' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (response_type && response_type !== 'code') {
            return new Response(JSON.stringify({ success: false, error: '仅支持 response_type=code' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1').bind(client_id).first();
        if (!client) {
            return new Response(JSON.stringify({ success: false, error: '无效的客户端ID或客户端已禁用' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (!validateRedirectUri(client.redirect_uris, redirect_uri)) {
            return new Response(JSON.stringify({ success: false, error: 'redirect_uri 不在允许列表中' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const user = await getUserFromRequest(request, env);
        if (!user) {
            return new Response(JSON.stringify({ success: false, error: '未登录，请先登录', requireLogin: true }),
                { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const validatedScopes = validateScopes(scope);

        if (!decision) {
            return new Response(JSON.stringify({
                success: true,
                requireConsent: true,
                client: {
                    name: client.client_name,
                    description: client.description,
                    logo_url: client.logo_url
                },
                user: {
                    id: user.id,
                    nickname: user.nickname,
                    email: user.email
                },
                scope: validatedScopes.join(' ')
            }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (decision === 'deny') {
            return new Response(JSON.stringify({ success: false, error: '用户拒绝授权', error_code: 'access_denied' }),
                { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const authCode = generateRandomString(32);
        const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRY).toISOString();

        await env.DB.prepare(
            'INSERT INTO oauth_authorization_codes (code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(authCode, client_id, user.id, redirect_uri, validatedScopes.join(' '), code_challenge || null, code_challenge_method || null, expiresAt).run();

        await logAdminAction(env, user.id, 'oauth_authorize', 'oauth_client', client_id, `用户 ${user.nickname || user.email} 授权客户端 ${client.client_name}(${client_id})，scope: ${validatedScopes.join(' ')}`, JSON.stringify({ user_id: user.id, nickname: user.nickname, email: user.email, client_name: client.client_name, client_id, scope: validatedScopes.join(' ') }));

        return new Response(JSON.stringify({
            success: true,
            code: authCode,
            state: state || '',
            redirect_uri: redirect_uri
        }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } catch (e) {
        console.error('OAuth authorize error:', e);
        return new Response(JSON.stringify({ success: false, error: '授权请求处理失败: ' + e.message }),
            { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}