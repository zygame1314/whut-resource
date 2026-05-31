import { addCorsHeaders } from '../utils.js';

const cache = { data: null, lastChecked: 0, TTL: 60000 };

export async function onRequestGet({ request, env }) {
    try {
        if (!env.DB) {
            return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), {
                status: 500,
                headers: addCorsHeaders()
            });
        }
        const now = Date.now();
        if (cache.data && (now - cache.lastChecked < cache.TTL)) {
            return new Response(JSON.stringify({ success: true, stats: cache.data }), {
                status: 200,
                headers: addCorsHeaders({ 'Cache-Control': 'public, max-age=60' })
            });
        }
        const stats = await env.DB.prepare(
            'SELECT registered_users FROM system_stats WHERE id = 1'
        ).first();
        const registeredUsers = stats?.registered_users ?? 0;
        const result = { registeredUsers };
        cache.data = result;
        cache.lastChecked = now;
        return new Response(JSON.stringify({ success: true, stats: result }), {
            status: 200,
            headers: addCorsHeaders({ 'Cache-Control': 'public, max-age=60' })
        });
    } catch (e) {
        console.error('获取站点统计出错:', e);
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: addCorsHeaders()
        });
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}