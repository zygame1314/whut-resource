import { verifyToken, addCorsHeaders, isAdmin } from '../utils.js';
const MAX_CONTENT_LENGTH = 200;
const DAILY_LIMIT = 5;
export async function onRequestGet({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    if (!DB) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const url = new URL(request.url);
        const fileKey = url.searchParams.get('key');
        if (!fileKey) {
            return new Response(JSON.stringify({ success: false, error: '缺少key参数' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const countResult = await DB.prepare('SELECT COUNT(*) as total FROM file_boosts WHERE file_key = ?').bind(fileKey).first();
        const total = countResult ? countResult.total : 0;
        const { results } = await DB.prepare(`
            SELECT fb.id, fb.file_key, fb.user_id, fb.content, fb.created_at, u.nickname
            FROM file_boosts fb
            LEFT JOIN users u ON fb.user_id = u.id
            WHERE fb.file_key = ?
            ORDER BY fb.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(fileKey, limit, offset).all();
        return new Response(JSON.stringify({
            success: true,
            boosts: results,
            total
        }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } catch (error) {
        console.error('获取boosts失败:', error);
        return new Response(JSON.stringify({ success: false, error: '获取评论失败' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestPost({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    if (!DB) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const body = await request.json();
        const { key, content } = body;
        if (!key || !content || typeof content !== 'string') {
            return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const trimmedContent = content.trim();
        if (trimmedContent.length === 0 || trimmedContent.length > MAX_CONTENT_LENGTH) {
            return new Response(JSON.stringify({ success: false, error: `评论内容需在1-${MAX_CONTENT_LENGTH}字之间` }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const fileRecord = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(key).first();
        if (!fileRecord) {
            return new Response(JSON.stringify({ success: false, error: '文件不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
        const dailyCount = await DB.prepare(
            'SELECT COUNT(*) as count FROM file_boosts WHERE user_id = ? AND file_key = ? AND created_at >= ?'
        ).bind(user.id, key, todayStart).first();
        if (dailyCount && dailyCount.count >= DAILY_LIMIT) {
            return new Response(JSON.stringify({ success: false, error: `每天最多发送${DAILY_LIMIT}条评论` }), {
                status: 429,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const result = await DB.prepare(
            'INSERT INTO file_boosts (file_key, user_id, content) VALUES (?, ?, ?)'
        ).bind(key, user.id, trimmedContent).run();
        const boostId = result.meta.last_row_id;
        const userNickname = user.nickname || user.email_prefix || '匿名用户';
        const stats = await DB.prepare('SELECT boost_count FROM files WHERE key = ?').bind(key).first();
        return new Response(JSON.stringify({
            success: true,
            boost: {
                id: boostId,
                file_key: key,
                content: trimmedContent,
                nickname: userNickname,
                user_id: user.id,
                created_at: new Date().toISOString()
            },
            boost_count: stats ? stats.boost_count : 1
        }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } catch (error) {
        console.error('发送boost失败:', error);
        return new Response(JSON.stringify({ success: false, error: '发送评论失败' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestDelete({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await verifyToken(token, env.JWT_SECRET || 'secret');
    }
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const DB = env.DB;
    if (!DB) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    try {
        const body = await request.json();
        const { id } = body;
        if (!id) {
            return new Response(JSON.stringify({ success: false, error: '缺少id参数' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const boost = await DB.prepare('SELECT * FROM file_boosts WHERE id = ?').bind(id).first();
        if (!boost) {
            return new Response(JSON.stringify({ success: false, error: '评论不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        if (boost.user_id !== user.id && !isAdmin(user)) {
            return new Response(JSON.stringify({ success: false, error: '无权删除此评论' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        await DB.prepare('DELETE FROM file_boosts WHERE id = ?').bind(id).run();
        const stats = await DB.prepare('SELECT boost_count FROM files WHERE key = ?').bind(boost.file_key).first();
        return new Response(JSON.stringify({
            success: true,
            boost_count: stats ? stats.boost_count : 0
        }), { status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
    } catch (error) {
        console.error('删除boost失败:', error);
        return new Response(JSON.stringify({ success: false, error: '删除评论失败' }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
