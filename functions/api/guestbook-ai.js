import { verifyToken, addCorsHeaders, isAdmin, hybridSearch, retryWithBackoff, fetchSiliconFlowChat, validateAIResponse, logAdminAction, cleanupOrphanTodos, deleteGuestbookWithChildren, createNotification, broadcastGuestbookUpdate, resolveConstraintScope, mergeScopeFirst, filterByRelevance, searchByLiteralTerms, applyTimeConstraint, rerankRows, sanitizeConstraintTerms } from '../utils.js';
const AI_API_URL = 'https://cpa.zygame1314-666.top/v1/chat/completions';
const AI_MODEL = 'deepseek-v4.1-flash';
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
            description: '搜索资源库。前提是留言达到最低礼貌线：有称呼/问候/请求语/敬称/感谢任一项。纯疑问式索要（"有XX吗""有没有XX"）和纯祈使式索要（"给我XX""发我XX"）属于不礼貌，禁止搜索，改用 reject_message。每条留言只调用一次，多门课程分别放进 queries，额外限定放进 constraints。',
            parameters: {
                type: 'object',
                properties: {
                    queries: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '课程/资源关键词数组，每个元素一个核心课程名或连续词；多门课程分别放一个元素。只填用户原话里出现或明确同义的课程名，禁止追加用户没提过的上位概念、课程类别或"相关课程"（用户只写"发展对象"，就不能补"党课""思政"）。用户给的不是具体课程（培训/考试/活动/类别/软件名），照原样填，禁止替换成你以为相关的课程。不要把年份/学期/老师写进来（放到 constraints）。'
                    },
                    constraints: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '附加限定，每个元素一个库里可能连续出现的字面词，如 ["2024"]、["张"]。相对时间换算成四位年份，不要拼学年区间（后续会展开）；用户写明的学年学期原样保留。不确定传 []。'
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
const SYSTEM_PROMPT = `你是武汉理工大学资源分享网站（公益站，学长学姐免费分享）的留言板AI，分析留言并决定处理方式。纯文本输出，禁用Markdown。

【语气】不是客服，不惯着人。可口语化、可吐槽、可怼，给用户的 reason/note 也用这口吻，禁止客服套话。
【立场】用户是来求资源的，不是来消费或下命令的。礼貌求助 → 热情帮忙；命令式、简陋、阴阳怪气 → 怼回去并驳回。别怕得罪人。

【判定顺序】先看是否违规，再看是否礼貌，最后才看是不是资源请求。礼貌没过 → 直接 reject_message，不许搜索，也不许改用 keep_pending / mark_resolved 绕过去。

【礼貌最低线】留言里有下面任意一处“人味”，就算达标（有一样就行，不用堆砌）：
- 称呼或问候：你好、您好、哈喽、hi、在吗、学长、学姐、大佬
- 请求语：请、求、求助、麻烦、拜托、劳驾、帮个忙、能不能帮
- 敬称或致谢：您、谢谢、感谢、辛苦了
- 商量语气：能不能、可不可以、能否、方便的话、行不行
反之，整条留言只有资料名、课程名或“有没有”，没有任何尊重对方的表达 → 不达标。注意“想要”“需要”“要”这种平铺直叙的诉求不算礼貌。

【不达标的情形】下面这些通通不算礼貌，不能当放行理由：
- 纯疑问式索要："有XX吗""有没有XX""XX题库有么""谁有XX""在哪找XX""怎么搞到XX"。疑问语气只是在提问，不代表尊重，它问的是“有没有”而不是“请给我”。
- 纯祈使式索要："给我XX""发我XX""把XX发过来""来份XX""整一份XX""传一下XX""快点"
- 名词堆砌："高数题库""发展对象题库 2024"
- 只加一个“有/要/来/给”："有XX题库吗""要高数资料""来份真题"
- 表情、语气词、标点：哈、啊、呀、~、……、！！！

【防止自我说服】不得用下列理由放行：内容确实是资源请求、库里正好有、语气不算太差、对方可能是新生、不想打击积极性、已经写了具体课程名。这些都不构成礼貌。

【输出前自检】在决定调用 search_resources 前，先在心里从用户原话里引用出体现礼貌的那几个字；引用不出来（只能引用课程名、资料名或疑问句）→ 必须 reject_message。

【示例】
- "有发展对象的题库吗？" → 纯疑问式，只问有没有 → reject_message
- "你好，有发展对象的题库吗？" → 有问候 → 达标，可搜索，但仍需严格按匹配规则判定
- "给我发高数真题" → 纯祈使式 → reject_message
- "求高数真题，谢谢" → 有请求语与致谢 → 达标
- "学长，发展对象题库有吗" → 有称呼 → 达标
- "发展对象题库" → 名词堆砌 → reject_message
【管理员】标签的留言不做礼貌判定。

【工具选择】
ban_user：反动/暴恐/违法/昵称带辱骂色情推广。禁止封禁【管理员】标签用户
delete_message：辱骂/色情/恶意诱导（如藏头诗）；【普通用户】自称管理员
reject_message：无关内容、泄联系方式、表述简陋、只发课程名无请求语句、没礼貌的索要（纯疑问式/纯祈使式）、命令式、质疑抱怨
search_resources：达到礼貌最低线的资源请求（参数用法见工具声明）
mark_resolved：感谢祝福等，需 note 回应用户
keep_pending：合理但需人工

有偿求资源、倒卖 → 视情节 delete_message 或 ban_user`;
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
        const { guestbook_id } = body;
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
        if (env.AI_QUEUE) {
            await env.AI_QUEUE.send({ guestbookId: guestbook_id, adminTriggered: true });
            return new Response(JSON.stringify({
                success: true,
                message: 'AI 审核已提交，处理结果将自动生效'
            }), {
                status: 202,
                headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const result = await processWithAIAgent(
            guestbookEntry,
            env
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
export async function processWithAIAgent(guestbookEntry, env) {
    if (!env.AI_API_KEY) {
        throw new Error('未配置 AI_API_KEY');
    }
    const roleTag = (guestbookEntry.role === 'admin' || guestbookEntry.role === 'super_admin') ? '【管理员】' : '【普通用户】';
    const userMessage = `用户身份：${roleTag}
        用户昵称：${guestbookEntry.nickname || '匿名用户'}
        留言内容：${guestbookEntry.content}
        提交时间：${guestbookEntry.created_at}`;
    const toolsToUse = TOOLS;
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
    const systemPromptToUse = basePrompt + `\n\n【自动审核模式】当前为自动审核模式，你的操作将直接生效（而非仅提供建议）。请同时完成内容审核和资源匹配，遇到不确定的情况保持待处理等待人工介入。`;
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
                env
            );
            if (functionName === 'search_resources' && toolResult.searchResults) {
                const queryStr = Array.isArray(functionArgs.queries) ? functionArgs.queries.join('、') : (functionArgs.queries || functionArgs.query || '');
                return await handleSearchResults(
                    guestbookEntry,
                    toolResult.searchResults,
                    env,
                    queryStr,
                    {
                        queryList: toolResult.queryList,
                        perQueryHits: toolResult.perQueryHits,
                        constraint: toolResult.constraint,
                        constraintResolved: toolResult.constraintResolved,
                        constraintPartial: toolResult.constraintPartial,
                        scopedPath: toolResult.scopedPath,
                        scopedByName: toolResult.scopedByName
                    }
                );
            }
            if (functionName === 'keep_pending' && functionArgs.category) {
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
export async function createOrMergeTodo(guestbookEntry, category, note, env) {
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
function stripMarkdown(text) {
    if (!text) return text;
    let s = String(text);
    s = s.replace(/ thinking[\s\S]*?<\/think>/gi, '');
    s = s.replace(/\*\*(.+?)\*\*/g, '$1');
    s = s.replace(/\*(.+?)\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/`{1,3}(.+?)`{1,3}/g, '$1');
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    s = s.replace(/^#{1,6}\s*/gm, '');
    s = s.replace(/^[>\s]*>\s?/gm, '');
    s = s.replace(/^[-*+]\s+/gm, '');
    s = s.replace(/^\s*\d+[.)]\s+/gm, '');
    s = s.replace(/(\r\n|\n){3,}/g, '\n\n');
    return s.trim();
}
async function executeToolCall(functionName, args, guestbookEntry, env) {
    for (const key in args) {
        if (typeof args[key] === 'string') {
            args[key] = stripMarkdown(args[key]);
        }
    }
    switch (functionName) {
        case 'reject_message':
            return await handleReject(guestbookEntry, args.reason, env);
        case 'delete_message':
            return await handleDelete(guestbookEntry, args.reason, env);
        case 'ban_user':
            return await handleBanUser(guestbookEntry, args.reason, env);
        case 'search_resources':
            return await handleSearch(args.queries, env, args.constraints, guestbookEntry.content);
        case 'mark_resolved':
            return await handleResolve(guestbookEntry, args.reply, null, null, env, args.note);
        case 'keep_pending':
            await createOrMergeTodo(guestbookEntry, args.category, args.note, env);
            return {
                success: true,
                action: 'keep_pending',
                message: '留言保持待处理状态',
                note: args.note,
                category: args.category || null
            };
        default:
            return {
                success: false,
                action: 'unknown',
                message: `未知的工具: ${functionName}`
            };
    }
}
async function handleReject(entry, reason, env) {
    await env.DB.prepare(
        'UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?'
    ).bind('rejected', reason, entry.id).run();
    await logAdminAction(env, null, 'ai_reject', 'guestbook', entry.id, reason, JSON.stringify({
        snapshot_content: entry.content,
        nickname: entry.nickname,
        user_id: entry.user_id
    }));
    if (entry.user_id) {
        await createNotification(env, {
            userId: entry.user_id,
            type: 'guestbook_reply',
            title: '你的留言被驳回',
            body: reason || '内容不符合规范',
            link: `#gb-${entry.id}`,
            payload: { guestbookId: entry.id, rejectReason: reason }
        });
    }
    await broadcastGuestbookUpdate(env, entry.id, 'reject', { status: 'rejected', is_hidden: 1, reject_reason: reason, user_id: entry.user_id });
    return {
        success: true,
        action: 'reject',
        message: `留言已驳回: ${reason}`,
        reason: reason
    };
}
async function handleBanUser(guestbookEntry, reason, env) {
    if (guestbookEntry.role === 'admin' || guestbookEntry.role === 'super_admin') {
        return {
            success: false,
            action: 'no_action',
            message: '无法封禁管理员',
            reason: reason
        };
    }
    await env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(guestbookEntry.user_id).run();
    await deleteGuestbookWithChildren(env, guestbookEntry.id);
    await logAdminAction(env, null, 'ai_ban_user', 'user', guestbookEntry.user_id, reason, JSON.stringify({
        snapshot_content: guestbookEntry.content,
        nickname: guestbookEntry.nickname,
        user_id: guestbookEntry.user_id
    }));
    await broadcastGuestbookUpdate(env, guestbookEntry.id, 'delete');
    return {
        success: true,
        action: 'ban_user',
        message: `用户已封禁并删除留言: ${reason}`,
        reason: reason
    };
}
async function handleDelete(entry, reason, env) {
    await deleteGuestbookWithChildren(env, entry.id);
    await logAdminAction(env, null, 'ai_delete', 'guestbook', entry.id, reason, JSON.stringify({
        snapshot_content: entry.content,
        nickname: entry.nickname,
        user_id: entry.user_id
    }));
    await broadcastGuestbookUpdate(env, entry.id, 'delete');
    return {
        success: true,
        action: 'delete',
        message: `留言已删除: ${reason}`,
        reason: reason
    };
}
function normalizeConstraints(constraints) {
    if (!constraints) return '';
    const list = Array.isArray(constraints) ? constraints : [constraints];
    return list
        .filter(c => typeof c === 'string' && c.trim().length > 0)
        .map(c => c.trim())
        .join('；');
}
async function handleSearch(queries, env, constraints = [], userContent = '') {
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
        const terms = sanitizeConstraintTerms(constraints);
        let literalMatched = false;
        let literalPartial = false;
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        for (const q of queryList) {
            let filesWithScores = null;
            if (terms.length > 0) {
                const literal = await searchByLiteralTerms(DB, q, terms, Math.max(perQueryTopK, 20));
                const timeFiltered = applyTimeConstraint(literal, terms.join(' '), userContent || q, now);
                if (timeFiltered) {
                    const ranked = await rerankRows(env, userContent || q, timeFiltered, { topN: Math.max(perQueryTopK, 20) });
                    filesWithScores = ranked.map(row => ({
                        ...row,
                        similarity_score: row.rerank_score ?? 1,
                        relevance: row.relevance ?? 1,
                        scoped: true
                    }));
                    literalMatched = true;
                } else {
                    literalPartial = true;
                }
            }
            if (!filesWithScores) {
                const searchResult = await hybridSearch(DB, VECTORIZE, env, q, { topK: perQueryTopK, vectorTopK: 20, ftsLimit: 20 });
                filesWithScores = filterByRelevance(searchResult.results || []);
            }
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
        let merged = [...seenIds.values()];
        merged.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
        const constraintText = normalizeConstraints(constraints);
        let constraintResolved = true;
        let scopedPath = '';
        let scopedByName = false;
        let scopeApplied = false;
        if (constraintText && merged.length > 0 && !literalMatched) {
            try {
                const scope = await resolveConstraintScope(env, DB, userContent || constraintText, constraintText, merged, now);
                if (scope) {
                    scopedByName = scope.mode === 'name';
                    scopedPath = scope.path || '';
                    merged = mergeScopeFirst(scope, merged);
                    scopeApplied = true;
                } else {
                    constraintResolved = false;
                }
            } catch (e) {
                constraintResolved = false;
                console.error('留言板限定定位失败:', e);
            }
        } else if (literalMatched && constraintText) {
            scopedByName = true;
        }
        const constraintPartial = terms.length > 0 && literalPartial && !scopeApplied;
        const filesWithScores = merged.slice(0, 20);
        if (filesWithScores.length === 0) {
            return {
                success: true,
                action: 'search',
                message: constraintResolved && constraintText
                    ? `未找到符合「${constraintText}」的资源`
                    : '未找到相关资源',
                searchResults: [],
                query: queryList.join('、'),
                queryList,
                perQueryHits,
                constraint: constraintText,
                constraintResolved,
                constraintPartial
            };
        }
        return {
            success: true,
            action: 'search',
            message: `找到 ${filesWithScores.length} 个相关资源`,
            searchResults: filesWithScores,
            query: queryList.join('、'),
            queryList,
            perQueryHits,
            constraint: constraintText,
            constraintResolved,
            constraintPartial,
            scopedPath,
            scopedByName
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
async function handleSearchResults(guestbookEntry, searchResults, env, query = '', searchMeta = {}) {
    const { queryList = [], perQueryHits = {}, constraint = '', constraintResolved = true, constraintPartial = false, scopedPath = '', scopedByName = false } = searchMeta;
    if (!searchResults || searchResults.length === 0) {
        if (env && env.DB) {
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
            pending_categories: queryList.length > 0 ? queryList.map(q => q.trim().substring(0, 100)) : [],
            category: queryList.length > 0 ? queryList[0].trim().substring(0, 100) : (query.trim().substring(0, 100) || '未分类')
        };
    }
    const normalizePath = (p) => p ? p.replace(/\/+/g, '/').replace(/^\/|\/$/, '') : '';
    const filteredResults = filterByRelevance(searchResults, {
        relativeRatio: queryList.length > 1 ? 0 : undefined
    });
    const resourceList = filteredResults.slice(0, 20).map((f, i) => {
        const parentPath = normalizePath(f.parent_path);
        const path = parentPath ? `${parentPath}/${f.name}` : f.name;
        const typeTag = (f.is_directory === 1 || f.is_directory === true) ? '📁目录' : '📄文件';
        const mq = Array.isArray(f.matched_queries) && f.matched_queries.length > 0 ? ` [命中课程: ${f.matched_queries.join('、')}]` : '';
        const scoreTag = f.scoped
            ? '[限定命中]'
            : `相似度: ${(((Number(f.similarity_score) || 0) * 100).toFixed(1))}%`;
        return `${i + 1}. [${typeTag}] ${f.name} (路径: ${path}, ${scoreTag})${mq}`;
    }).join('\n');
    if (filteredResults.length === 0) {
        if (env && env.DB) {
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
            pending_categories: queryList.length > 0 ? queryList.map(q => q.trim().substring(0, 100)) : [],
            category: queryList.length > 0 ? queryList[0].trim().substring(0, 100) : (query.trim().substring(0, 100) || '未分类')
        };
    }
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
    const constraintBlock = constraint
        ? (constraintResolved
            ? `\n【附加限定】${constraint}（${scopedByName ? '已按文件名筛选' : scopedPath ? `已定位到 ${scopedPath}` : '已按限定筛选'}；标 [限定命中] 的条目已确认满足该限定${constraintPartial ? '。其余课程可能没有符合限定的资源，未标注条目必须按路径中的年份/学期逐条核对' : ''}）`
            : `\n【附加限定】${constraint}（库中未找到符合该限定的资源。下列结果不符合该限定，禁止当作满足限定的资源推荐，改填 pending_categories 并在 note 里说明已登记补充）`)
        : '';
    const secondPrompt = `搜索结果：
${resourceList}

用户留言：${guestbookEntry.content}
${hitSummary}${constraintBlock}

【匹配规则】只认同名或同一门课的高度相关资源。禁止靠上位概念、主题、课程类别硬凑（"发展对象"≠"党课"≠"习近平新时代中国特色社会主义思想概论"；"党课"≠"毛概/习概/马原"；"金属工艺学B"≠"汽车制造工艺学"/"金属学及热处理"；"创业学"≠培养方案目录）。宁可判未命中也不硬凑。
【非课程请求】用户要的是培训、考试、活动、类别、证件、软件等非课程对象时，只有库里有同名对象才算命中；没有就全部进 pending_categories 或 keep_pending，【禁止】拿名字相近或主题相关的课程资料替代。
【禁用兜底话术】禁止在 note 里写"可作参考""有助于学习""相关理论学习""供参考""先看这个"之类，把不符的资源包装成命中。note 只能陈述真实命中的课程名与路径，以及哪些没找到。
【限定规则】用户有附加限定时，只有限定一致的资源才算匹配。标 [限定命中] 的条目已由检索确认满足限定；未标注的条目必须自己核对路径/文件名中的年份、学期是否一致，不一致即使课程名完全命中也不得推荐，禁止用"仅供参考"把不符资料当替代品。列表里没出现的目录不代表库里不存在，禁止据此断言"没有""缺失"，只能说"本次检索未命中"。

有满足需求的资源就用 mark_resolved：每门命中课程的资源序号填进 matched_file_indices；未命中的课程填进 pending_categories 自动建待办。全部未命中用 keep_pending。
优先推荐目录（📁，代表资源合集），但目录名必须与请求课程对得上，且学期不符的目录同样不得推荐。${todoHint}`;

    const searchTools = [
        {
            type: 'function',
            function: {
                name: 'mark_resolved',
                description: '找到至少一个匹配资源时使用。多门课程时，命中项填 matched_file_indices，未命中项填 pending_categories（自动建待办），不必整条挂起。',
                parameters: {
                    type: 'object',
                    properties: {
                        note: {
                            type: 'string',
                            description: '给用户的备注（用户可见）。只陈述真实命中的课程/路径和未找到的课程，未命中课程提示已登记待办。禁止写"可作参考""有助于学习""相关理论学习"等话术把不符资源说成命中。'
                        },
                        matched_file_indices: {
                            type: 'array',
                            items: { type: 'integer' },
                            description: '匹配的资源序号数组（填写搜索结果列表中的数字编号，如 [1] 或 [1,3]）。把每门命中课程对应的资源序号都放进来。至少填一个。'
                        },
                        pending_categories: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '未命中的课程名数组（自动建待办）。每项用标准课程名，优先精确匹配已有分类。全部命中则留空。'
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
            { role: 'system', content: '你是资源匹配助手。任务是根据搜索结果判断是否真正满足用户的资源请求，宁缺毋滥：没有同名或同一门课的资源就判未命中，不得用主题相近的课程资料替代。用户请求多门课程时，可对命中部分给资源、未命中部分建待办。' },
            { role: 'user', content: secondPrompt }
        ],
        searchTools,
        env,
        'auto',
        0.2,
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
                searchResults: filteredResults
            };
        }
        if (functionName === 'mark_resolved') {
            if (typeof functionArgs.note === 'string') functionArgs.note = stripMarkdown(functionArgs.note);
            if (typeof functionArgs.reply === 'string') functionArgs.reply = stripMarkdown(functionArgs.reply);
            const indices = Array.isArray(functionArgs.matched_file_indices)
                ? functionArgs.matched_file_indices
                : (functionArgs.matched_file_index != null ? [functionArgs.matched_file_index] : []);
            const normalizePath = (p) => p ? p.replace(/\/+/g, '/').replace(/^\/|\/$/, '') : '';
            const resourcePaths = [];
            const validIndices = new Set();
            for (const rawIdx of indices) {
                const idx = Number(rawIdx);
                if (Number.isInteger(idx) && idx > 0 && idx <= filteredResults.length) {
                    validIndices.add(idx);
                }
            }
            for (const idx of validIndices) {
                const file = filteredResults[idx - 1];
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
            const createdTodos = dedupPending;
            for (const cat of dedupPending) {
                await createOrMergeTodo(guestbookEntry, cat, functionArgs.note || '部分课程未找到资源，待人工补充', env);
            }
            const result = await handleResolve(
                guestbookEntry,
                functionArgs.reply,
                filteredResults,
                dedupPaths,
                env,
                functionArgs.note,
                createdTodos
            );
            if (createdTodos.length > 0) {
                result.pending_categories = createdTodos;
            }
            return result;
        }
        if (functionName === 'keep_pending') {
            if (typeof functionArgs.note === 'string') functionArgs.note = stripMarkdown(functionArgs.note);
            if (functionArgs.category) {
                await createOrMergeTodo(guestbookEntry, functionArgs.category, functionArgs.note, env);
            }
            return {
                success: true,
                action: 'keep_pending',
                message: '资源匹配度不够，保持待处理',
                note: functionArgs.note,
                category: functionArgs.category || null,
                searchResults: filteredResults
            };
        }
    }
    return {
        success: true,
        action: 'search_completed',
        message: '已完成搜索',
        searchResults: filteredResults
    };
}
async function handleResolve(entry, reply, searchResults = null, resourcePaths = null, env = null, note = null, createdTodos = null) {
    const pathsArr = Array.isArray(resourcePaths) ? resourcePaths : (resourcePaths ? [resourcePaths] : []);
    const cleanPaths = [...new Set(pathsArr.filter(p => p && String(p).trim()).map(p => String(p).trim()))];
    const todosArr = Array.isArray(createdTodos) ? createdTodos : [];
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
        await createNotification(env, {
            userId: entry.user_id,
            type: 'guestbook_reply',
            title: '你的留言已被解决',
            body: note || pathsText || '已处理',
            link: `#gb-${entry.id}`,
            payload: { guestbookId: entry.id, resourcePaths: cleanPaths, note: note, pendingCategories: todosArr }
        });
    }
    await broadcastGuestbookUpdate(env, entry.id, 'resolve', { status: 'resolved', is_hidden: 0, resolve_note: resolveValue || null });
    const result = {
        success: true,
        action: 'resolve',
        message: `留言已标记为已解决: ${reply}`,
        reply: reply,
        searchResults: searchResults,
        resource_paths: cleanPaths,
        note: note
    };
    if (todosArr.length > 0) result.created_todos = todosArr;
    return result;
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
    try {
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
    } catch (primaryError) {
        console.warn('主 AI 调用失败，回退到硅基流动小模型:', primaryError?.message || primaryError);
        if (!env.SILICONFLOW_API_KEY) {
            throw primaryError;
        }
        return await retryWithBackoff(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'Qwen/Qwen3-8B',
                        messages: messages,
                        tools: tools,
                        tool_choice: toolChoice,
                        temperature: temperature,
                        stream: false
                    }),
                    signal: controller.signal
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`SiliconFlow API Error: ${response.status} - ${errorText}`);
                }
                const data = await response.json();
                return validateAIResponse(data, '[回退模型] ');
            } finally {
                clearTimeout(timeoutId);
            }
        }, 1, 500);
    }
}
const REPLY_MODERATION_PROMPT = `你是留言板内容审核AI。本站是资源分享平台，求课程资料/真题/课件属正常行为，非广告。
必须结合上下文（原留言+同级回复）判断，不能孤立看回复。单独看无意义但对话中合理的（确认、补充、答疑、感谢、讨论）→ PASS。

【规则】
0. 昵称含辱骂/色情/反动/恶意推广/攻击性/不雅词 → NICKNAME_REJECT:原因
1. 辱骂/人身攻击/色情/暴恐/反动/违法/政治敏感 → REJECT:类型
2. 广告/推广/引流/有偿交易 → REJECT:广告或交易
3. 泄露联系方式（手机/QQ/微信/邮箱）→ REJECT:泄露个人信息
4. 恶意诱导（藏头诗/隐晦辱骂）→ REJECT:恶意诱导
5. 其余 → PASS

【输出】只输出 PASS 或 REJECT:原因(≤15字) 或 NICKNAME_REJECT:原因(≤15字)，严禁其他内容`;

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
        const data = await Promise.race([
            fetchSiliconFlowChat(env, {
                messages: [
                    { role: 'system', content: REPLY_MODERATION_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.1,
                maxTokens: 50
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('回复审核超时')), 12000)
            )
        ]);
        let result = data.choices?.[0]?.message?.content?.trim() || '';
        result = result.replace(/ thinking[\s\S]*?<\/think>/gi, '').trim();
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
        return { pass: false, reason: '内容审核服务暂时不可用，请稍后重试' };
    }
}