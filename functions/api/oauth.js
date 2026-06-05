import { verifyToken, addCorsHeaders, signToken, getUserFromRequest, hashPassword, verifyPasswordHash, isAdmin, logAdminAction } from '../utils.js';

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

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/oauth', '');

    if (path === '/userinfo' || path === '/userinfo/') {
        return await handleUserinfo(request, env);
    }

    return new Response(JSON.stringify({ error: 'invalid_request', error_description: 'Use POST for token endpoint, GET for authorize/userinfo' }),
        { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/oauth', '');

    if (path === '/token' || path === '/token/') {
        return await handleToken(request, env);
    }

    if (path === '/authorize' || path === '/authorize/') {
        return await handleAuthorize(request, env);
    }

    return new Response(JSON.stringify({ error: 'invalid_request', error_description: 'Unknown OAuth endpoint' }),
        { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
}

async function handleAuthorize(request, env) {
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

        await logAdminAction(env, user.id, 'oauth_authorize', 'oauth_client', null, `用户 ${user.nickname || user.email} 授权客户端 ${client.client_name}(${client_id})，scope: ${validatedScopes.join(' ')}`);

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

async function handleToken(request, env) {
    try {
        const contentType = request.headers.get('Content-Type') || '';
        let params;
        if (contentType.includes('application/json')) {
            params = await request.json();
        } else {
            const formData = await request.formData();
            params = Object.fromEntries(formData.entries());
        }

        const { grant_type, code, redirect_uri, code_verifier, client_id, client_secret } = params;

        if (grant_type !== 'authorization_code') {
            return new Response(JSON.stringify({ error: 'unsupported_grant_type', error_description: '仅支持 authorization_code' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (!code) {
            return new Response(JSON.stringify({ error: 'invalid_request', error_description: '缺少 authorization code' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const authCode = await env.DB.prepare('SELECT * FROM oauth_authorization_codes WHERE code = ?').bind(code).first();
        if (!authCode) {
            return new Response(JSON.stringify({ error: 'invalid_grant', error_description: '授权码无效' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (new Date(authCode.expires_at) < new Date()) {
            await env.DB.prepare('DELETE FROM oauth_authorization_codes WHERE code = ?').bind(code).run();
            return new Response(JSON.stringify({ error: 'invalid_grant', error_description: '授权码已过期' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').bind(authCode.client_id).first();
        if (!client || !client.is_active) {
            return new Response(JSON.stringify({ error: 'invalid_client', error_description: '客户端无效或已禁用' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (redirect_uri && authCode.redirect_uri !== redirect_uri) {
            return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'redirect_uri 不匹配' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (client_id && authCode.client_id !== client_id) {
            return new Response(JSON.stringify({ error: 'invalid_client', error_description: 'client_id 不匹配' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        if (client_secret) {
            const secretValid = await verifyPasswordHash(client_secret, client.client_secret_hash, env.SALT);
            if (!secretValid) {
                return new Response(JSON.stringify({ error: 'invalid_client', error_description: 'client_secret 验证失败' }),
                    { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }

        if (authCode.code_challenge) {
            if (!code_verifier) {
                return new Response(JSON.stringify({ error: 'invalid_request', error_description: '需要 code_verifier (PKCE)' }),
                    { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
            const pkceValid = await verifyPkce(code_verifier, authCode.code_challenge, authCode.code_challenge_method || 'S256');
            if (!pkceValid) {
                return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE 验证失败' }),
                    { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
            }
        }

        const user = await env.DB.prepare('SELECT id, email, nickname, role, school_id FROM users WHERE id = ?').bind(authCode.user_id).first();
        if (!user) {
            return new Response(JSON.stringify({ error: 'invalid_grant', error_description: '用户不存在' }),
                { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }

        const accessToken = await generateToken(48);
        const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY).toISOString();

        await env.DB.prepare(
            'INSERT INTO oauth_access_tokens (access_token, client_id, user_id, scope, expires_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(accessToken, authCode.client_id, user.id, authCode.scope, tokenExpiresAt).run();

        await env.DB.prepare('DELETE FROM oauth_authorization_codes WHERE code = ?').bind(code).run();

        const idToken = await signToken({
            id: user.id,
            email: user.email,
            nickname: user.nickname,
            role: user.role,
            school_id: user.school_id,
            aud: authCode.client_id,
            iss: 'whut-resource',
            exp: Date.now() + ACCESS_TOKEN_EXPIRY
        }, env.JWT_SECRET || 'secret');

        return new Response(JSON.stringify({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_EXPIRY / 1000,
            scope: authCode.scope,
            id_token: idToken
        }), { status: 200, headers: addCorsHeaders({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Content-Type': 'application/json' }) });
    } catch (e) {
        console.error('OAuth token error:', e);
        return new Response(JSON.stringify({ error: 'server_error', error_description: e.message }),
            { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

async function handleUserinfo(request, env) {
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