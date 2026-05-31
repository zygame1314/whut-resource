import { addCorsHeaders } from '../utils.js';

const SITE_LAUNCH_DATE = '2025-12-01';
const GITHUB_REPO = 'zygame1314/whut-resource';

const cache = { data: null, lastChecked: 0, TTL: 60000 };
const commitCache = { data: null, lastChecked: 0, TTL: 300000 };

function getUptimeDays() {
    const launch = new Date(SITE_LAUNCH_DATE);
    const now = new Date();
    const diffMs = now - launch;
    return Math.max(0, Math.floor(diffMs / 86400000));
}

async function fetchLastCommitTime() {
    const now = Date.now();
    if (commitCache.data && (now - commitCache.lastChecked < commitCache.TTL)) {
        return commitCache.data;
    }
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`, {
            headers: { 'User-Agent': 'whut-resource-site-stats' }
        });
        if (!res.ok) return commitCache.data;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].commit) {
            commitCache.data = data[0].commit.committer.date;
            commitCache.lastChecked = now;
            return commitCache.data;
        }
    } catch (e) {
        console.error('获取 GitHub 提交时间失败:', e);
    }
    return commitCache.data;
}

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
        const lastCommitTime = await fetchLastCommitTime();
        const result = {
            registeredUsers,
            uptimeDays: getUptimeDays(),
            lastCommitTime: lastCommitTime || null
        };
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
