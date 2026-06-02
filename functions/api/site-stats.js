import { addCorsHeaders } from '../utils.js';

const SITE_LAUNCH_DATE = '2025-12-01';
const GITHUB_REPO = 'zygame1314/whut-resource';
const STATS_CACHE_KEY = 'https://whut-resource-stats.internal/stats';
const STATS_CACHE_TTL = 60;
const COMMIT_CACHE_KEY = 'https://whut-resource-stats.internal/commit';
const COMMIT_CACHE_TTL = 300;

function getUptimeDays() {
    const launch = new Date(SITE_LAUNCH_DATE);
    const now = new Date();
    const diffMs = now - launch;
    return Math.max(0, Math.floor(diffMs / 86400000));
}

async function getEdgeCache(request, cacheKey) {
    try {
        const cache = caches.default;
        const cached = await cache.match(new Request(cacheKey));
        if (cached) {
            const maxAge = parseInt(cached.headers.get('X-Cache-Max-age') || '0');
            const cachedAt = parseInt(cached.headers.get('X-Cached-At') || '0');
            if (Date.now() - cachedAt < maxAge * 1000) {
                return await cached.json();
            }
        }
    } catch (e) { }
    return null;
}

async function setEdgeCache(request, cacheKey, data, ttl) {
    try {
        const cache = caches.default;
        const response = new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'X-Cached-At': String(Date.now()),
                'X-Cache-Max-age': String(ttl),
                'Cache-Control': 'public, max-age=1'
            }
        });
        await cache.put(new Request(cacheKey), response);
    } catch (e) { }
}

async function fetchLastCommitTime(env) {
    const cached = await getEdgeCache(null, COMMIT_CACHE_KEY);
    if (cached) return cached.date || null;

    try {
        const headers = { 'User-Agent': 'whut-resource-site-stats' };
        if (env?.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
        }
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`, { headers });
        if (!res.ok) {
            console.error(`GitHub API 返回 ${res.status}: ${await res.text().catch(() => '')}`);
            return null;
        }
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].commit) {
            const date = data[0].commit.author?.date || data[0].commit.committer?.date || null;
            if (date) {
                await setEdgeCache(null, COMMIT_CACHE_KEY, { date }, COMMIT_CACHE_TTL);
            }
            return date;
        }
    } catch (e) {
        console.error('获取 GitHub 提交时间失败:', e);
    }
    return null;
}

export async function onRequestGet({ request, env }) {
    try {
        if (!env.DB) {
            return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), {
                status: 500,
                headers: addCorsHeaders()
            });
        }
        const cached = await getEdgeCache(request, STATS_CACHE_KEY);
        if (cached) {
            return new Response(JSON.stringify({ success: true, stats: cached }), {
                status: 200,
                headers: addCorsHeaders({ 'Cache-Control': 'public, max-age=60' })
            });
        }
        const stats = await env.DB.prepare(
            'SELECT registered_users FROM system_stats WHERE id = 1'
        ).first();
        const registeredUsers = stats?.registered_users ?? 0;
        const lastCommitTime = await fetchLastCommitTime(env);
        const result = {
            registeredUsers,
            uptimeDays: getUptimeDays(),
            lastCommitTime
        };
        await setEdgeCache(request, STATS_CACHE_KEY, result, STATS_CACHE_TTL);
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