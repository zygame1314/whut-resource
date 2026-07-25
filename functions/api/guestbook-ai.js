import { verifyToken, addCorsHeaders, isAdmin, hybridSearch, retryWithBackoff, fetchSiliconFlowChat, validateAIResponse, logAdminAction, cleanupOrphanTodos, deleteGuestbookWithChildren, createNotification, broadcastGuestbookUpdate } from '../utils.js';
const AI_API_URL = 'https://cpa.zygame1314-666.top/v1/chat/completions';
const AI_MODEL = 'gemma4:31b';
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'reject_message',
            description: '驳回留言。当留言无效、违规或没礼貌时使用。此操作会将留言设为隐藏，并向作者显示具体的驳回原因。',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '驳回原因，语气可以带点情绪，不用端着。'
                    }
                },
                required: ['reason']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_message',
            description: '删除留言。仅当留言包含严重违规内容时使用，如辱骂、广告、色情、政治敏感等。删除后无法恢复！',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '删除原因，说明为什么需要删除'
                    }
                },
                required: ['reason']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'ban_user',
            description: '封禁用户并删除留言。仅当用户发布严重违规内容时使用。此操作会使该账号彻底失效：无法发布留言、无法下载文件。',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '封禁原因，说明为什么需要封禁'
                    }
                },
                required: ['reason']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_resources',
            description: '搜索资源库。当用户在留言中请求查找特定资源、课程资料、文件时使用此工具。支持同时搜索多个关键词（如一条留言请求多门课程，可一次性传入多个核心课程名）。每条留言只需调用一次此工具，把所有需要的课程名都放进 queries 数组。',
            parameters: {
                type: 'object',
                properties: {
                    queries: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '搜索关键词数组，每个元素是一个核心课程名或关键名词（如"遗传学"）。用户请求多门课程时，每门课程名作为一个数组元素。核心规则：必须仅提取核心课程名或关键名词。'
                    }
                },
                required: ['queries']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'mark_resolved',
            description: '标记留言为已解决。用于非资源类请求的直接解决（如感谢回应），或无需提供具体路径的场景。',
            parameters: {
                type: 'object',
                properties: {
                    reply: {
                        type: 'string',
                        description: '管理员审计备注（用户不可见）。必须填写，供管理员参考的处理说明，如处理依据、分类标记、判断理由等。'
                    },
                    note: {
                        type: 'string',
                        description: '给用户的备注（用户可见）。'
                    }
                },
                required: ['reply', 'note']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'keep_pending',
            description: '保持留言待处理状态。当留言是合理请求但暂时无法自动处理时使用。会自动创建或合并到同分类的待办事项。',
            parameters: {
                type: 'object',
                properties: {
                    note: {
                        type: 'string',
                        description: '备注（纯文本），说明为什么需要人工处理。'
                    },
                    category: {
                        type: 'string',
                        description: '待办分类，以课程名为单位。优先精确匹配已有待办分类名，无匹配时使用最通用的标准课程名（如"高等数学"而非"高数"，"大学物理"而非"大物"）。不加"求""资料"等冗余词。'
                    }
                },
                required: ['note', 'category']
            }
        }
    }
];
const AUTO_MODE_TOOLS = TOOLS;
const SYSTEM_PROMPT = `你是武汉理工大学资源分享网站留言板AI助手，分析留言并决定处理方式。所有输出必须是纯文本，禁用Markdown。

【语气人设】你不是客服，正常交流即可，不用拘谨，对没礼貌的留言可以怼回去。

本站是资源分享平台，用户请求课程资料、真题、课件、考试答案等属于正常行为，请积极帮助用户找到资源。

【不可违反的底线】
- 禁止封禁【管理员】标签用户
- 【普通用户】自称管理员 -> delete_message(冒充管理员)
- 昵称含辱骂/色情/反动/恶意推广/攻击性/不雅词汇 -> ban_user(昵称违规即封禁，无论留言内容)
- 含暴恐/反动/色情/严重违法内容 -> ban_user

【工具选择指引】
ban_user: 极其严重违规（反动/暴恐/违法/昵称违规），封禁用户并删除留言
delete_message: 严重违规（辱骂/色情/恶意诱导攻击如藏头诗等）
reject_message: 内容无效或不合规范，驳回并告知原因。适用于：无关内容、泄露联系方式、表述过于简陋无法处理、仅发课程名/文件名而无任何请求语句（如只写"金融学"等）等
ban_user/delete_message 候补：有偿求资源、倒卖资源、付费交易等行为严重违反本站免费分享原则，视情节轻重选择 delete_message 或 ban_user
search_resources: 资源请求类留言，提取核心课程名搜索。常见缩写需展开（大物→大学物理、高数→高等数学、毛概→毛泽东思想、线代→线性代数、马原→马克思主义、近代史→中国近现代史、思修→思想道德），保留课程后缀(A/B/C、一/二)。用户在一条留言中请求多门课程资源时，把每门课程名作为一个元素放进 queries 数组一次性搜索，每条留言只调用一次 search_resources
mark_resolved: 可直接解决的非资源类留言（感谢/祝福/闲聊等），或无需搜索的场景。必须填写reply（管理员审计备注）和note（用户可见备注），reply需说明处理依据
keep_pending: 合理请求但暂时无法自动处理，等待人工介入。category以课程名为单位，优先精确匹配已有待办分类名；无匹配时使用最通用的标准课程名（如"高等数学"而非"高数"，"大学物理"而非"大物"，"线性代数"而非"线代"），不加"求""资料"等冗余词

处理级别：L0封禁[ban_user] L1删除[delete_message] L2驳回[reject_message] L3正常[search_resources/mark_resolved/keep_pending]
注意：仅发课程名/文件名而无任何请求语句属于不礼貌的命令式留言，不应为其搜索资源，应使用reject_message驳回。`;
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: addCorsHeaders() });
    }
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: '方法不允许' }), {
            status: 405,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    try {
        const user = await getUser(request, env);
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), {
                status: 403,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const body = await request.json();
        const { guestbook_id, auto_mode } = body;
        if (!guestbook_id) {
            return new Response(JSON.stringify({ error: '缺少留言ID' }), {
                status: 400,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const guestbookEntry = await env.DB.prepare(
            'SELECT g.*, u.nickname, u.role FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
        ).bind(guestbook_id).first();
        if (!guestbookEntry) {
            return new Response(JSON.stringify({ error: '留言不存在' }), {
                status: 404,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const result = await processWithAIAgent(
            guestbookEntry,
            env,
            auto_mode || false
        );
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (error) {
        console.error('AI Agent 错误:', error);
        return new Response(JSON.stringify({
            error: 'AI 处理失败: ' + error.message
        }), {
            status: 500,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}
async function getUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!payload) return null;
    return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
}
export async function processWithAIAgent(guestbookEntry, env, autoMode) {
    if (!env.AI_API_KEY) {
        throw new Error('未配置 AI_API_KEY');
    }
    const roleTag = (guestbookEntry.role === 'admin' || guestbookEntry.role === 'super_admin') ? '【管理员】' : '【普通用户】';
    const userMessage = `用户身份：${roleTag}
        用户昵称：${guestbookEntry.nickname || '匿名用户'}
        留言内容：${guestbookEntry.content}
        提交时间：${guestbookEntry.created_at}`;
    const toolsToUse = autoMode ? AUTO_MODE_TOOLS : TOOLS;
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    let basePrompt = SYSTEM_PROMPT + `\n当前时间：${now}`;
    try {
        const existingTodos = await env.DB.prepare(
            "SELECT category FROM todos WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10"
        ).all();
        if (existingTodos.results && existingTodos.results.length > 0) {
            const categories = existingTodos.results.map(t => t.category).join('、');
            basePrompt += `\n\n【已有待办分类】${categories}\n使用 keep_pending 时，category 必须优先精确匹配已有分类名（字符完全一致）。若确实无匹配，则使用最通用的标准课程名（如"高等数学"而非"高数"，"大学物理"而非"大物"，"线性代数"而非"线代"），避免同一课程因缩写不同而创建多个待办。`;
        }
    } catch (e) {
        console.error('查询已有待办分类失败:', e);
    }
    const systemPromptToUse = autoMode
        ? basePrompt + `\n\n【自动审核模式】当前为自动审核模式，你的操作将直接生效（而非仅提供建议）。请同时完成内容审核和资源匹配，遇到不确定的情况保持待处理等待人工介入。`
        : basePrompt;
    const messages = [
        { role: 'system', content: systemPromptToUse },
        { role: 'user', content: userMessage }
    ];
    const MAX_NO_ACTION_RETRIES = 1;
    for (let attempt = 0; attempt <= MAX_NO_ACTION_RETRIES; attempt++) {
        const aiResponse = await Promise.race([
            fetchAIChatCompletion(messages, toolsToUse, env, 'auto', 0.7),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('AI处理超时(25s)')), 25000)
            )
        ]);
        const message = aiResponse.choices?.[0]?.message;
        if (!message) {
            if (attempt < MAX_NO_ACTION_RETRIES) {
                console.warn(`AI 未返回有效响应 (${attempt + 1}/${MAX_NO_ACTION_RETRIES})，重试中...`);
                continue;
            }
            throw new Error('AI 未返回有效响应');
        }
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const functionName = toolCall.function.name;
            const validToolNames = toolsToUse.map(t => t.function.name);
            if (!validToolNames.includes(functionName)) {
                if (attempt < MAX_NO_ACTION_RETRIES) {
                    console.warn(`AI 调用了未知工具 ${functionName} (${attempt + 1}/${MAX_NO_ACTION_RETRIES})，重试中...`);
                    continue;
                }
                return {
                    success: false,
                    action: 'no_action',
                    message: `AI 调用了未知工具: ${functionName}`,
                    ai_response: message.content
                };
            }
            let functionArgs;
            try {
                functionArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (e) {
                if (attempt < MAX_NO_ACTION_RETRIES) {
                    console.warn(`AI 返回参数解析失败 (${attempt + 1}/${MAX_NO_ACTION_RETRIES})，重试中...`);
                    continue;
                }
                return {
                    success: false,
                    action: 'no_action',
                    message: `AI 返回参数解析失败: ${e.message}`,
                    ai_response: message.content
                };
            }
            const toolResult = await executeToolCall(
                functionName,
                functionArgs,
                guestbookEntry,
                env,
                autoMode
            );
            if (functionName === 'search_resources' && toolResult.searchResults) {
                const queryStr = Array.isArray(functionArgs.queries) ? functionArgs.queries.join('、') : (functionArgs.queries || functionArgs.query || '');
                return await handleSearchResults(
                    guestbookEntry,
                    toolResult.searchResults,
                    env,
                    autoMode,
                    queryStr,
                    { queryList: toolResult.queryList, perQueryHits: toolResult.perQueryHits }
                );
            }
            if (functionName === 'keep_pending' && autoMode && functionArgs.category) {
                await createOrMergeTodo(guestbookEntry, functionArgs.category, functionArgs.note, env);
            }
            return toolResult;
        }
        if (attempt < MAX_NO_ACTION_RETRIES) {
            console.warn(`AI 未调用工具 (${attempt + 1}/${MAX_NO_ACTION_RETRIES})，重试中...`);
            continue;
        }
    }
    return {
        success: false,
        action: 'no_action',
        message: 'AI 多次未调用工具，需人工处理'
    };
}
async function createOrMergeTodo(guestbookEntry, category, note, env) {
    if (!category || !env || !env.DB) return;
    try {
        const trimmedCategory = category.trim().substring(0, 100);
        const existing = await env.DB.prepare(
            'SELECT id FROM todos WHERE category = ? AND status = ?'
        ).bind(trimmedCategory, 'pending').first();
        let todoId;
        if (existing) {
            todoId = existing.id;
        } else {
            const insertResult = await env.DB.prepare(
                'INSERT INTO todos (category, description, status) VALUES (?, ?, ?)'
            ).bind(trimmedCategory, note ? note.trim().substring(0, 500) : null, 'pending').run();
            todoId = insertResult.meta.last_row_id;
        }
        const alreadyLinked = await env.DB.prepare(
            'SELECT 1 FROM todo_guestbook WHERE todo_id = ? AND guestbook_id = ?'
        ).bind(todoId, guestbookEntry.id).first();
        if (!alreadyLinked) {
            await env.DB.prepare(
                'INSERT INTO todo_guestbook (todo_id, guestbook_id) VALUES (?, ?)'
            ).bind(todoId, guestbookEntry.id).run();
        }
    } catch (e) {
        console.error('创建/合并待办失败:', e);
    }
}
async function executeToolCall(functionName, args, guestbookEntry, env, autoMode) {
    for (const key in args) {
        if (typeof args[key] === 'string') {
            args[key] = args[key].replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        }
    }
    switch (functionName) {
        case 'reject_message':
            return await handleReject(guestbookEntry, args.reason, env, autoMode);
        case 'delete_message':
            return await handleDelete(guestbookEntry, args.reason, env, autoMode);
        case 'ban_user':
            return await handleBanUser(guestbookEntry, args.reason, env, autoMode);
        case 'search_resources':
            return await handleSearch(args.queries, env);
        case 'mark_resolved':
            return await handleResolve(guestbookEntry, args.reply, null, null, env, autoMode, args.note);
        case 'keep_pending':
            return {
                success: true,
                action: 'keep_pending',
                message: '留言保持待处理状态',
                note: args.note,
                category: args.category || null,
                auto_applied: false
            };
        default:
            return {
                success: false,
                action: 'unknown',
                message: `未知的工具: ${functionName}`
            };
    }
}
async function handleReject(entry, reason, env, autoMode) {
    if (autoMode) {
        await env.DB.prepare(
            'UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?'
        ).bind('rejected', reason, entry.id).run();
        await logAdminAction(env, null, 'ai_reject', 'guestbook', entry.id, reason, JSON.stringify({
            snapshot_content: entry.content,
            nickname: entry.nickname,
            user_id: entry.user_id
        }));
        if (entry.user_id) {
            createNotification(env, {
                userId: entry.user_id,
                type: 'guestbook_reply',
                title: '你的留言被驳回',
                body: reason || '内容不符合规范',
                link: `#gb-${entry.id}`,
                payload: { guestbookId: entry.id, rejectReason: reason }
            }).catch(() => {});
        }
        broadcastGuestbookUpdate(env, entry.id, 'reject', { status: 'rejected', is_hidden: 1 });
        return {
            success: true,
            action: 'reject',
            message: `留言已驳回: ${reason}`,
            reason: reason,
            auto_applied: true
        };
    }
    return {
        success: true,
        action: 'reject',
        message: '建议驳回留言',
        reason: reason,
        auto_applied: false
    };
}
async function handleBanUser(guestbookEntry, reason, env, autoMode) {
    if (guestbookEntry.role === 'admin' || guestbookEntry.role === 'super_admin') {
        return {
            success: false,
            action: 'no_action',
            message: '无法封禁管理员',
            reason: reason,
            auto_applied: false
        };
    }
    if (autoMode) {
        await env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(guestbookEntry.user_id).run();
        await deleteGuestbookWithChildren(env, guestbookEntry.id);
        await logAdminAction(env, null, 'ai_ban_user', 'user', guestbookEntry.user_id, reason, JSON.stringify({
            snapshot_content: guestbookEntry.content,
            nickname: guestbookEntry.nickname,
            user_id: guestbookEntry.user_id
        }));
        broadcastGuestbookUpdate(env, guestbookEntry.id, 'delete');
        return {
            success: true,
            action: 'ban_user',
            message: `用户已封禁并删除留言: ${reason}`,
            reason: reason,
            auto_applied: true
        };
    }
    return {
        success: true,
        action: 'ban_user',
        message: '建议封禁用户（并删除留言）',
        reason: reason,
        auto_applied: false
    };
}
async function handleDelete(entry, reason, env, autoMode) {
    if (autoMode) {
        await deleteGuestbookWithChildren(env, entry.id);
        await logAdminAction(env, null, 'ai_delete', 'guestbook', entry.id, reason, JSON.stringify({
            snapshot_content: entry.content,
            nickname: entry.nickname,
            user_id: entry.user_id
        }));
        broadcastGuestbookUpdate(env, entry.id, 'delete');
        return {
            success: true,
            action: 'delete',
            message: `留言已删除: ${reason}`,
            reason: reason,
            auto_applied: true
        };
    }
    return {
        success: true,
        action: 'delete',
        message: '建议删除留言（严重违规）',
        reason: reason,
        auto_applied: false
    };
}
async function handleSearch(queries, env) {
    const VECTORIZE = env.VECTORIZE;
    const DB = env.DB;
    if (!VECTORIZE || !DB || !env.SILICONFLOW_API_KEY) {
        return {
            success: false,
            action: 'search',
            message: '搜索服务配置错误 (AI/VECTORIZE/DB)',
            searchResults: null
        };
    }
    const queryList = Array.isArray(queries) ? queries.filter(q => q && String(q).trim()).map(q => String(q).trim()) : (queries ? [String(queries).trim()] : []);
    if (queryList.length === 0) {
        return {
            success: true,
            action: 'search',
            message: '未提供搜索关键词',
            searchResults: [],
            query: ''
        };
    }
    try {
        const seenIds = new Map();
        const perQueryTopK = queryList.length > 1 ? 10 : 15;
        const perQueryHits = {};
        for (const q of queryList) {
            const searchResult = await hybridSearch(DB, VECTORIZE, env, q, { topK: perQueryTopK, vectorTopK: 20, ftsLimit: 20 });
            const filesWithScores = searchResult.results || [];
            perQueryHits[q] = filesWithScores.length;
            for (const f of filesWithScores) {
                if (f.id != null) {
                    const existing = seenIds.get(f.id);
                    if (existing) {
                        if (!existing.matched_queries.includes(q)) existing.matched_queries.push(q);
                        continue;
                    }
                    seenIds.set(f.id, { ...f, matched_queries: [q] });
                } else {
                    if (!f.matched_queries) f.matched_queries = [];
                    if (!f.matched_queries.includes(q)) f.matched_queries.push(q);
                    seenIds.set(`__noid_${q}_${f.name}_${Math.random()}`, { ...f, matched_queries: [q] });
                }
            }
        }
        const merged = [...seenIds.values()];
        merged.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
        const filesWithScores = merged.slice(0, 20);
        if (filesWithScores.length === 0) {
            return {
                success: true,
                action: 'search',
                message: '未找到相关资源',
                searchResults: [],
                query: queryList.join('、'),
                queryList,
                perQueryHits
            };
        }
        return {
            success: true,
            action: 'search',
            message: `找到 ${filesWithScores.length} 个相关资源`,
            searchResults: filesWithScores,
            query: queryList.join('、'),
            queryList,
            perQueryHits
        };
    } catch (error) {
        console.error('搜索错误:', error);
        return {
            success: false,
            action: 'search',
            message: '搜索失败: ' + error.message,
            searchResults: null
        };
    }
}
async function handleSearchResults(guestbookEntry, searchResults, env, autoMode, query = '', searchMeta = {}) {
    const { queryList = [], perQueryHits = {} } = searchMeta;
    if (!searchResults || searchResults.length === 0) {
        if (autoMode && env && env.DB) {
            if (queryList.length > 0) {
                for (const q of queryList) {
                    const category = q.trim().substring(0, 100) || '未分类';
                    await createOrMergeTodo(guestbookEntry, category, '未找到相关资源', env);
                }
            } else {
                const category = query.trim().substring(0, 100) || (guestbookEntry.content ? guestbookEntry.content.trim().substring(0, 50) : '未分类');
                await createOrMergeTodo(guestbookEntry, category, '未找到相关资源', env);
            }
        }
        return {
            success: true,
            action: 'search_no_results',
            message: '未找到匹配的资源，留言保持待处理状态',
            auto_applied: false
        };
    }
    const normalizePath = (p) => p ? p.replace(/\/+/g, '/').replace(/^\/|\/$/, '') : '';
    const resourceList = searchResults.slice(0, 20).map((f, i) => {
        const parentPath = normalizePath(f.parent_path);
        const path = parentPath ? `${parentPath}/${f.name}` : f.name;
        const typeTag = (f.is_directory === 1 || f.is_directory === true) ? '📁目录' : '📄文件';
        const mq = Array.isArray(f.matched_queries) && f.matched_queries.length > 0 ? ` [命中课程: ${f.matched_queries.join('、')}]` : '';
        return `${i + 1}. [${typeTag}] ${f.name} (路径: ${path}, 相似度: ${(f.similarity_score * 100).toFixed(1)}%)${mq}`;
    }).join('\n');
    let todoCategoriesStr = '';
    try {
        const existingTodos = await env.DB.prepare(
            "SELECT category FROM todos WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10"
        ).all();
        if (existingTodos.results && existingTodos.results.length > 0) {
            todoCategoriesStr = existingTodos.results.map(t => t.category).join('、');
        }
    } catch (e) { console.error('查询已有待办分类失败:', e); }

    const todoHint = todoCategoriesStr
        ? `\n\n【已有待办分类】${todoCategoriesStr}\n使用 pending_categories / keep_pending 的 category 时，必须优先精确匹配已有分类名（字符完全一致）。若确实无匹配，则使用最通用的标准课程名（如"高等数学"而非"高数"，"大学物理"而非"大物"，"线性代数"而非"线代"），避免同一课程因缩写不同而创建多个待办。`
        : '';
    const hitSummary = queryList.length > 0
        ? `\n【用户请求的课程】${queryList.join('、')}\n【各课程命中情况】${queryList.map(q => `${q}: ${perQueryHits[q] > 0 ? '✓找到' : '✗未找到'}(${perQueryHits[q] || 0}个结果)`).join('；')}`
        : '';
    const secondPrompt = `搜索结果：
${resourceList}

用户留言：${guestbookEntry.content}
${hitSummary}

【语气人设】你不是客服，正常交流即可，不用拘谨，对没礼貌的留言可以怼回去。

判断搜索结果中是否有满足用户需求的资源，如果没有就保持未解决，不要硬凑。优先推荐目录（📁），目录代表整个资源合集，对用户更有价值。用户请求多门课程时：
- 把每门命中课程对应的匹配资源序号都填进 matched_file_indices 数组
- 对于【未命中的课程】，填进 pending_categories 数组（会自动建待办给管理员处理）
- 全部未命中时改用 keep_pending
匹配成功请用 mark_resolved，完全不匹配则用 keep_pending。${todoHint}`;

    const searchTools = [
        {
            type: 'function',
            function: {
                name: 'mark_resolved',
                description: '标记留言为已解决。当从搜索结果中找到至少一个匹配资源时使用。支持一次匹配多个资源（用户请求多门课程时，把每门命中的资源序号都填进 matched_file_indices）。未命中的课程填进 pending_categories（会自动建待办给管理员后续处理），这样命中的资源可立即给用户、未命中的进入待办，不必整条挂起。',
                parameters: {
                    type: 'object',
                    properties: {
                        note: {
                            type: 'string',
                            description: '给用户的备注（用户可见）。若存在未命中课程，可简要提示用户部分资源已找到、其余正在补充。'
                        },
                        matched_file_indices: {
                            type: 'array',
                            items: { type: 'integer' },
                            description: '匹配的资源序号数组（填写搜索结果列表中的数字编号，如 [1] 或 [1,3]）。把每门命中课程对应的资源序号都放进来。至少填一个。'
                        },
                        pending_categories: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '未命中的课程名数组（用于建待办给管理员补充资源）。仅当用户请求多门课程且部分未命中时填写。每项为标准课程名，优先精确匹配已有待办分类。全部命中则留空数组或不填。'
                        },
                        reply: {
                            type: 'string',
                            description: '管理员审计备注（用户不可见）。必须填写，说明匹配依据、未命中课程的待办安排等。'
                        }
                    },
                    required: ['note', 'matched_file_indices', 'reply']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'keep_pending',
                description: '保持留言待处理状态。当搜索结果全部都不匹配时使用。会自动创建或合并到同分类的待办事项。',
                parameters: {
                    type: 'object',
                    properties: {
                        note: {
                            type: 'string',
                            description: '备注原因'
                        },
                        category: {
                            type: 'string',
                            description: '待办分类，以课程名为单位。优先精确匹配已有待办分类名，无匹配时使用最通用的标准课程名（如"高等数学"而非"高数"，"大学物理"而非"大物"）。'
                        }
                    },
                    required: ['note', 'category']
                }
            }
        }
    ];
    const aiResponse = await fetchAIChatCompletion(
        [
            { role: 'system', content: '你是资源匹配助手。你的任务是根据搜索结果判断是否满足用户的资源请求。用户请求多门课程时，可对命中部分给资源、未命中部分建待办。' },
            { role: 'user', content: secondPrompt }
        ],
        searchTools,
        env,
        'auto',
        0.7,
        { maxRetries: 0, timeoutMs: 15000 }
    );
    const message = aiResponse.choices?.[0]?.message;
    if (message?.tool_calls?.length > 0) {
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
            functionArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
            return {
                success: true,
                action: 'search_completed',
                message: 'AI参数解析失败，请管理员确认',
                searchResults: searchResults
            };
        }
        if (functionName === 'mark_resolved') {
            const indices = Array.isArray(functionArgs.matched_file_indices)
                ? functionArgs.matched_file_indices
                : (functionArgs.matched_file_index != null ? [functionArgs.matched_file_index] : []);
            const normalizePath = (p) => p ? p.replace(/\/+/g, '/').replace(/^\/|\/$/, '') : '';
            const resourcePaths = [];
            const validIndices = new Set();
            for (const rawIdx of indices) {
                const idx = Number(rawIdx);
                if (Number.isInteger(idx) && idx > 0 && idx <= searchResults.length) {
                    validIndices.add(idx);
                }
            }
            for (const idx of validIndices) {
                const file = searchResults[idx - 1];
                if (file.is_directory) {
                    const parentPath = normalizePath(file.parent_path);
                    resourcePaths.push(parentPath ? `${parentPath}/${file.name}` : file.name);
                } else {
                    resourcePaths.push(normalizePath(file.parent_path));
                }
            }
            const dedupPaths = [...new Set(resourcePaths.filter(p => p))];
            const pendingCategories = Array.isArray(functionArgs.pending_categories)
                ? functionArgs.pending_categories.map(c => String(c).trim()).filter(c => c).map(c => c.substring(0, 100))
                : [];
            const dedupPending = [...new Set(pendingCategories)];
            let createdTodos = [];
            if (autoMode && dedupPending.length > 0) {
                for (const cat of dedupPending) {
                    await createOrMergeTodo(guestbookEntry, cat, functionArgs.note || '部分课程未找到资源，待人工补充', env);
                }
                createdTodos = dedupPending;
            }
            const result = await handleResolve(
                guestbookEntry,
                functionArgs.reply,
                searchResults,
                dedupPaths,
                env,
                autoMode,
                functionArgs.note,
                createdTodos
            );
            if (createdTodos.length > 0) {
                result.pending_categories = createdTodos;
            }
            return result;
        }
        if (functionName === 'keep_pending') {
            if (autoMode && functionArgs.category) {
                await createOrMergeTodo(guestbookEntry, functionArgs.category, functionArgs.note, env);
            }
            return {
                success: true,
                action: 'keep_pending',
                message: '资源匹配度不够，保持待处理',
                note: functionArgs.note,
                category: functionArgs.category || null,
                searchResults: searchResults,
                auto_applied: false
            };
        }
    }
    return {
        success: true,
        action: 'search_completed',
        message: '已完成搜索，请管理员确认',
        searchResults: searchResults,
        auto_applied: false
    };
}
async function handleResolve(entry, reply, searchResults = null, resourcePaths = null, env = null, autoMode = false, note = null, createdTodos = null) {
    const pathsArr = Array.isArray(resourcePaths) ? resourcePaths : (resourcePaths ? [resourcePaths] : []);
    const cleanPaths = [...new Set(pathsArr.filter(p => p && String(p).trim()).map(p => String(p).trim()))];
    const todosArr = Array.isArray(createdTodos) ? createdTodos : [];
    if (autoMode && env && entry) {
        let resolveValue = null;
        if (cleanPaths.length > 0 || note) {
            const noteObj = { paths: cleanPaths, note: note };
            if (todosArr.length > 0) noteObj.partial = true;
            resolveValue = JSON.stringify(noteObj);
        }
        await env.DB.prepare(
            'UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ? WHERE id = ?'
        ).bind('resolved', resolveValue, entry.id).run();
        const auditReason = reply || `AI自动解决: ${note || '无备注'}`;
        const logDetails = {
            snapshot_content: entry.content,
            nickname: entry.nickname,
            user_id: entry.user_id,
            resource_paths: cleanPaths
        };
        if (todosArr.length > 0) logDetails.created_todos = todosArr;
        await logAdminAction(env, null, 'ai_resolve', 'guestbook', entry.id, auditReason, JSON.stringify(logDetails));
        if (entry.user_id) {
            const pathsText = cleanPaths.length > 0 ? cleanPaths.map(p => `资源路径：${p}`).join('；') : '';
            const todoHintText = todosArr.length > 0 ? `（${todosArr.join('、')} 暂未找到，已记录待补充）` : '';
            createNotification(env, {
                userId: entry.user_id,
                type: 'guestbook_reply',
                title: '你的留言已被解决',
                body: note || pathsText || '已处理',
                link: `#gb-${entry.id}`,
                payload: { guestbookId: entry.id, resourcePaths: cleanPaths, note: note, pendingCategories: todosArr }
            }).catch(() => {});
        }
        broadcastGuestbookUpdate(env, entry.id, 'resolve', { status: 'resolved', is_hidden: 0, resolve_note: resolveValue || null });
        const result = {
            success: true,
            action: 'resolve',
            message: `留言已标记为已解决: ${reply}`,
            reply: reply,
            searchResults: searchResults,
            resource_paths: cleanPaths,
            note: note,
            auto_applied: true
        };
        if (todosArr.length > 0) result.created_todos = todosArr;
        return result;
    }
    const suggestResult = {
        success: true,
        action: 'resolve',
        message: '建议标记为已解决',
        reply: reply,
        searchResults: searchResults,
        resource_paths: cleanPaths,
        note: note,
        auto_applied: false
    };
    if (todosArr.length > 0) suggestResult.pending_categories = todosArr;
    return suggestResult;
}
export async function onRequestGet(context) {
    const { request, env } = context;
    const user = await getUser(request, env);
    if (!isAdmin(user)) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
            status: 403,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const pendingMessages = await env.DB.prepare(
        'SELECT id, content FROM guestbook WHERE status = ? ORDER BY created_at DESC LIMIT ?'
    ).bind('unresolved', limit).all();
    return new Response(JSON.stringify({
        success: true,
        pending_count: pendingMessages.results?.length || 0,
        messages: pendingMessages.results || []
    }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' })
    });
}
async function fetchAIChatCompletion(messages, tools, env, toolChoice = 'auto', temperature = 0.7, { maxRetries = 1, timeoutMs = 22000 } = {}) {
    if (!env.AI_API_KEY) {
        throw new Error('未配置 AI_API_KEY');
    }
    return await retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(AI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.AI_API_KEY}`
                },
                body: JSON.stringify({
                    model: AI_MODEL,
                    messages: messages,
                    tools: tools,
                    tool_choice: toolChoice,
                    temperature: temperature
                }),
                signal: controller.signal
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI API Error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            return validateAIResponse(data, '[大模型] ');
        } finally {
            clearTimeout(timeoutId);
        }
    }, maxRetries, 500);
}
const REPLY_MODERATION_PROMPT = `你是武汉理工大学资源分享网站留言板的内容审核AI，判断回复内容是否合规。
重要背景：本站是资源分享平台，用户请求课程资料、真题、课件等属于正常行为，不是广告或垃圾信息。

【核心原则】回复必须结合上下文（原留言及同级回复）综合判断，不能孤立地看回复内容。很多回复单独看可能无意义，但在对话上下文中是完全合理的内容，如：确认信息、补充说明、回答疑问、表达感谢、讨论课程细节等。

【审核规则】
0. 昵称审查：若用户昵称含违规内容（辱骂/色情/反动/恶意推广/攻击性/不雅词汇）→ NICKNAME_REJECT:违规原因
1. 严重违规（辱骂/人身攻击/色情/暴恐/反动/违法/政治敏感）→ REJECT:违规类型
2. 广告/推广/引流/有偿交易 → REJECT:广告或交易信息
3. 泄露个人联系方式（手机号/QQ号/微信号/邮箱等）→ REJECT:泄露个人信息
4. 恶意诱导（藏头诗/隐晦辱骂等）→ REJECT:恶意诱导
5. 结合上下文后有意义的正常内容 → PASS

【输出格式】
- 昵称违规：NICKNAME_REJECT:简短原因（不超过15字）
- 内容违规：REJECT:简短原因（不超过15字）
- 通过审核：PASS
严禁输出其他内容，只输出 PASS 或 REJECT:原因 或 NICKNAME_REJECT:原因`;

export async function processReplyWithAI(replyEntry, env) {
    if (!env.SILICONFLOW_API_KEY) {
        return { pass: true };
    }
    const parentEntry = replyEntry.parent_id ? await env.DB.prepare(
        'SELECT g.content, g.status, g.resolve_note, g.reject_reason FROM guestbook g WHERE g.id = ?'
    ).bind(replyEntry.parent_id).first() : null;
    const parentContext = parentEntry ? parentEntry.content.substring(0, 300) : '';
    const parentStatus = parentEntry ? parentEntry.status : '';
    let resolveContext = '';
    if (parentEntry && parentEntry.resolve_note) {
        try {
            const parsed = JSON.parse(parentEntry.resolve_note);
            const pathsArr = Array.isArray(parsed.paths) ? parsed.paths : (parsed.path ? [parsed.path] : []);
            const noteStr = parsed.note || '';
            const parts = [];
            if (pathsArr.length > 0) parts.push(`资源：${pathsArr.join('、')}`);
            if (noteStr) parts.push(`备注：${noteStr}`);
            resolveContext = parts.join('；');
        } catch {
            resolveContext = parentEntry.resolve_note;
        }
    }
    const rejectContext = parentEntry?.reject_reason || '';
    let siblingReplies = [];
    if (replyEntry.parent_id) {
        const query = replyEntry.id
            ? 'SELECT u.nickname, g.content, g.created_at FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.parent_id = ? AND g.id != ? AND g.is_hidden = 0 ORDER BY g.created_at ASC LIMIT 10'
            : 'SELECT u.nickname, g.content, g.created_at FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.parent_id = ? AND g.is_hidden = 0 ORDER BY g.created_at ASC LIMIT 10';
        const params = replyEntry.id ? [replyEntry.parent_id, replyEntry.id] : [replyEntry.parent_id];
        const siblings = await env.DB.prepare(query).bind(...params).all();
        siblingReplies = siblings.results || [];
    }
    let contextLines = '';
    if (parentContext) {
        contextLines += `原留言内容：${parentContext}`;
        if (parentStatus) contextLines += `\n原留言状态：${parentStatus}`;
        if (resolveContext) contextLines += `\nAI备注：${resolveContext}`;
        if (rejectContext) contextLines += `\n驳回原因：${rejectContext}`;
    }
    if (siblingReplies.length > 0) {
        contextLines += '\n\n对话记录（按时间顺序）：';
        for (const s of siblingReplies) {
            contextLines += `\n- ${s.nickname || '匿名'}：${s.content}`;
        }
    }
    const userMessage = `用户昵称：${replyEntry.nickname || '匿名用户'}
${contextLines ? contextLines + '\n' : ''}
当前回复内容：${replyEntry.content}`;
    try {
        const data = await fetchSiliconFlowChat(env, {
            messages: [
                { role: 'system', content: REPLY_MODERATION_PROMPT },
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
        console.error('回复审核失败，拦截:', error);
        return { pass: false, reason: 'AI审核服务暂时不可用，请稍后重试' };
    }
}