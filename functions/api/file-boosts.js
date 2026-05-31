import { verifyToken, addCorsHeaders, isAdmin, fetchSiliconFlowChat, logAdminAction } from '../utils.js';
const MAX_CONTENT_LENGTH = 200;
const DAILY_LIMIT = 5;
const MODERATION_PROMPT = `你是大学资源分享网站的评论审核助手。审核用户对文件资源的简短评论（最多200字）。
【审核规则】
0. 昵称审查：若用户昵称含违规内容（辱骂/色情/反动/恶意推广/攻击性/不雅词汇/侮辱性）→ NICKNAME_REJECT:违规原因
1. 严重违规（辱骂/人身攻击/色情/暴恐/反动/违法/政治敏感）→ REJECT:违规内容
2. 广告/推广/引流/有偿交易 → REJECT:广告或交易信息
3. 泄露个人联系方式（手机号/QQ号/微信号/邮箱等）→ REJECT:泄露个人信息
4. 无意义刷屏（纯符号/重复字符/乱码/无实质内容）→ REJECT:无意义内容
5. 恶意诱导（藏头诗/隐晦辱骂/翻译脏话等）→ REJECT:恶意诱导
6. 正常评论（课程反馈/资源建议/感谢/提问/讨论等）→ PASS
【输出格式】
- 昵称违规：NICKNAME_REJECT:简短原因（不超过15字）
- 评论违规：REJECT:简短原因（不超过15字）
- 通过审核：PASS
严禁输出其他内容，只输出 PASS 或 REJECT:原因 或 NICKNAME_REJECT:原因`;
async function moderateContent(content, nickname, env) {
    if (!env.SILICONFLOW_API_KEY) {
        console.warn('未配置 SILICONFLOW_API_KEY，跳过AI审核');
        return { pass: true };
    }
    try {
        const userMessage = nickname ? `用户昵称：${nickname}\n评论内容：${content}` : content;
        const data = await fetchSiliconFlowChat(env, {
            messages: [
                { role: 'system', content: MODERATION_PROMPT },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.1,
            maxTokens: 50
        });
        let result = data.choices?.[0]?.message?.content?.trim() || '';
        result = result.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (result.startsWith('NICKNAME_REJECT:')) {
            const reason = result.substring(16).trim();
            return { pass: false, reason: reason || '昵称不合规', isNicknameViolation: true };
        }
        if (result.startsWith('REJECT:')) {
            const reason = result.substring(7).trim();
            return { pass: false, reason: reason || '内容不合规' };
        }
        return { pass: true };
    } catch (error) {
        console.error('AI审核失败，放行:', error);
        return { pass: true };
    }
}
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
        const cursor = url.searchParams.get('cursor');
        let query = `
            SELECT fb.id, fb.file_key, fb.user_id, fb.content, fb.created_at, u.nickname
            FROM file_boosts fb
            LEFT JOIN users u ON fb.user_id = u.id
            WHERE fb.file_key = ?
        `;
        const params = [fileKey];
        if (cursor) {
            query += ' AND fb.created_at < ?';
            params.push(cursor);
        }
        query += ' ORDER BY fb.created_at DESC LIMIT ?';
        params.push(limit + 1);
        const { results } = await DB.prepare(query).bind(...params).all();
        const hasMore = results.length > limit;
        const boosts = hasMore ? results.slice(0, limit) : results;
        const nextCursor = hasMore && boosts.length > 0 ? boosts[boosts.length - 1].created_at : null;
        return new Response(JSON.stringify({
            success: true,
            boosts,
            nextCursor,
            hasMore
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
        const todayStart = new Date(new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0] + 'T00:00:00Z').getTime() - 8 * 3600000;
        const todayStartISO = new Date(todayStart).toISOString();
        const dailyCount = await DB.prepare(
            'SELECT COUNT(*) as count FROM file_boosts WHERE user_id = ? AND file_key = ? AND created_at >= ?'
        ).bind(user.id, key, todayStartISO).first();
        if (dailyCount && dailyCount.count >= DAILY_LIMIT) {
            return new Response(JSON.stringify({ success: false, error: `每天最多发送${DAILY_LIMIT}条评论` }), {
                status: 429,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
            });
        }
        const dbUser = await DB.prepare('SELECT nickname, email FROM users WHERE id = ?').bind(user.id).first();
        const emailPrefix = dbUser?.email ? dbUser.email.split('@')[0] : '';
        const userNickname = dbUser?.nickname || emailPrefix || '匿名用户';
        if (!isAdmin(user)) {
            const moderation = await moderateContent(trimmedContent, userNickname, env);
            if (!moderation.pass) {
                const errorPrefix = moderation.isNicknameViolation ? '昵称未通过审核' : '评论未通过审核';
                return new Response(JSON.stringify({ success: false, error: `${errorPrefix}：${moderation.reason}` }), {
                    status: 451,
                    headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
                });
            }
        }
        const result = await DB.prepare(
            'INSERT INTO file_boosts (file_key, user_id, content) VALUES (?, ?, ?)'
        ).bind(key, user.id, trimmedContent).run();
        const boostId = result.meta.last_row_id;
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
        if (boost.user_id !== user.id && isAdmin(user)) {
            await logAdminAction(env, user.id, 'delete_boost', 'file_boost', id, '管理员删除评论', JSON.stringify({ file_key: boost.file_key }));
        }
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
