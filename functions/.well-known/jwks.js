import { addCorsHeaders, getJwks } from '../utils.js';

export async function onRequestGet(context) {
    const { env } = context;
    try {
        const jwks = await getJwks(env);
        return new Response(JSON.stringify(jwks), {
            status: 200,
            headers: addCorsHeaders({
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600'
            })
        });
    } catch (e) {
        console.error('JWKS error:', e);
        return new Response(JSON.stringify({ error: 'server_error', error_description: e.message }),
            { status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}