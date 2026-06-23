import { addCorsHeaders } from '../utils.js';

export async function onRequestGet(context) {
    const { request } = context;
    try {
        const origin = new URL(request.url).origin;
        const config = {
            issuer: origin,
            authorization_endpoint: `${origin}/api/oauth/authorize`,
            token_endpoint: `${origin}/api/oauth/token`,
            userinfo_endpoint: `${origin}/api/oauth/userinfo`,
            jwks_uri: `${origin}/.well-known/jwks.json`,
            id_token_signing_alg_values_supported: ['RS256'],
            scopes_supported: ['openid', 'profile', 'email'],
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code'],
            code_challenge_methods_supported: ['S256', 'plain'],
            subject_types_supported: ['public']
        };
        return new Response(JSON.stringify(config), {
            status: 200,
            headers: addCorsHeaders({
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600'
            })
        });
    } catch (e) {
        console.error('OIDC discovery error:', e);
        return new Response(JSON.stringify({ error: 'server_error', error_description: e.message }),
            { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}