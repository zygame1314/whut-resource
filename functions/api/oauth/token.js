import { addCorsHeaders, signToken, verifyPasswordHash } from '../../utils.js';

const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

async function generateToken(length = 48) {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', randomBytes);
    return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('').slice(0, length * 2);
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

        if (Math.random() < 0.1) {
            const now = new Date().toISOString();
            env.DB.prepare('DELETE FROM oauth_authorization_codes WHERE expires_at < ?').bind(now).run();
            env.DB.prepare('DELETE FROM oauth_access_tokens WHERE expires_at < ?').bind(now).run();
        }

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

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}