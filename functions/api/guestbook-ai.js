import { verifyToken, addCorsHeaders, isAdmin, generateEmbeddings, rerankResults, retryWithBackoff, fetchSiliconFlowChat, validateAIResponse } from '../utils.js';
const AI_API_URL = 'https://cpa.zygame1314-666.top/v1/chat/completions';
const AI_MODEL = 'gemini-3-flash-preview';
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'reject_message',
            description: '驳回留言。当留言明确无效、违规时使用。此操作会将留言设为隐藏，并向作者显示具体的驳回原因。',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '驳回原因。例如：表述不清、无意义内容、刷屏、非资源请求等。'
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
            description: '封禁用户并删除留言。仅当用户发布极其严重违规内容（如反动、暴恐、违法信息）时使用。此操作会使该账号彻底失效：无法发布留言、无法下载文件。',
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
            description: '搜索资源库。当用户在留言中请求查找特定资源、课程资料、文件时使用此工具。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索关键词。核心规则：必须仅提取核心课程名或关键名词（如"遗传学"），严禁包含"求"、"有没有"、"资料"、"真题"、"复习"等修饰词或长句。'
                    }
                },
                required: ['query']
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
                        description: '管理员审计备注（用户不可见）。供管理员参考的处理说明，如处理依据、分类标记等。'
                    },
                    note: {
                        type: 'string',
                        description: '给用户的备注（用户可见）。直接展示给留言者的文字，必须包含对用户有用的信息。'
                    }
                },
                required: ['note']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'keep_pending',
            description: '保持留言待处理状态。当留言是合理请求但暂时无法自动处理时使用。',
            parameters: {
                type: 'object',
                properties: {
                    note: {
                        type: 'string',
                        description: '备注（纯文本），说明为什么需要人工处理'
                    }
                },
                required: ['note']
            }
        }
    }
];
const AUTO_MODE_TOOLS = TOOLS;
const SYSTEM_PROMPT = `你是武汉理工大学资源分享网站留言板AI助手，分析留言并决定处理方式。所有输出必须是纯文本，禁用Markdown。

安全规则（小模型已预筛违规内容，以下仅作补充）：
- 禁止封禁【管理员】标签用户
- 【管理员】自称管理员正常，【普通用户】自称管理员 -> delete_message(冒充管理员)
- 昵称违规（含辱骂/色情/反动/恶意推广/攻击性/不雅词汇）-> ban_user，无论留言内容如何，昵称违规即封禁

内容识别：
- 网络烂梗(如"一刀999")：非辱骂 -> reject_message(无关内容)
- 隐晦诱导(藏头诗、翻译脏话等)：识别辱骂意图 -> delete_message(恶意诱导攻击)
- 感谢/赞美/祝福 -> mark_resolved(note="不客气，祝学业进步！", reply="感谢类留言")
- 其他非资源请求(闲聊) -> mark_resolved(note="谢谢你的留言！", reply="非资源类互动")
- 留联系方式(QQ/微信等) -> reject_message(请勿在留言板泄露个人信息)
- 有偿/付费请求 -> reject_message(本站资源全部免费，不支持付费交易)
- 极简陋请求(仅"求高数"而无资源类型) -> reject_message(表述过于简陋，请说明具体需要的资源类型)
- 多门课程请求 -> reject_message(请每条留言只请求一门课程的资源，方便匹配)
- 资源补全请求("没答案"、"求补全"、"更多XX") -> keep_pending(note="用户请求资源补充，需管理员确认")，不要搜索

搜索优化：
- 只提取核心课程名，去除修饰词，但必须保留课程后缀(A/B/C、一/二)
- 必须展开缩写：大物→大学物理、高数→高等数学、毛概→毛泽东思想、线代→线性代数、马原→马克思主义、近代史→中国近现代史、思修→思想道德
- 例：search_resources("高等数学 试卷")、search_resources("大学物理")

处理级别：L0封禁[ban_user] L1删除[delete_message] L2驳回[reject_message] L3正常[search_resources/mark_resolved/keep_pending]`;
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
    const basePrompt = SYSTEM_PROMPT + `\n当前时间：${now}`;
    const systemPromptToUse = autoMode
        ? basePrompt + `\n\n【自动审核模式】当前为自动审核模式，内容合规性已由前置模型预筛，你只需处理资源匹配。
            处理规则：
            1. 感谢/祝福 -> mark_resolved(note=给用户的备注, reply=管理员备注)
            2. 资源请求 -> search_resources 搜索，搜索到匹配则 mark_resolved(含 matched_file_index)；未搜到则 keep_pending
            3. 模糊请求或无法判断 -> keep_pending 等待人工处理`
        : basePrompt;
    const aiResponse = await fetchAIChatCompletion(
        [
            { role: 'system', content: systemPromptToUse },
            { role: 'user', content: userMessage }
        ],
        toolsToUse,
        env,
        'auto',
        0.7
    );
    const message = aiResponse.choices?.[0]?.message;
    if (!message) {
        throw new Error('AI 未返回有效响应');
    }
    if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
            functionArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
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
            return await handleSearchResults(
                guestbookEntry,
                toolResult.searchResults,
                env,
                autoMode
            );
        }
        return toolResult;
    }
    return {
        success: true,
        action: 'no_action',
        message: 'AI 未决定采取行动',
        ai_response: message.content
    };
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
            return await handleSearch(args.query, env);
        case 'mark_resolved':
            return await handleResolve(guestbookEntry, args.reply, null, null, env, autoMode, args.note);
        case 'keep_pending':
            return {
                success: true,
                action: 'keep_pending',
                message: '留言保持待处理状态',
                note: args.note,
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
        await logAdminAction(env, 'ai_reject', 'guestbook', entry.id, reason, JSON.stringify({
            content: entry.content,
            nickname: entry.nickname,
            user_id: entry.user_id
        }));
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
        await env.DB.batch([
            env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(guestbookEntry.user_id),
            env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(guestbookEntry.id)
        ]);
        await logAdminAction(env, 'ai_ban_user', 'user', guestbookEntry.user_id, reason, JSON.stringify({
            deleted_guestbook_id: guestbookEntry.id,
            snapshot_content: guestbookEntry.content,
            nickname: guestbookEntry.nickname,
            user_id: guestbookEntry.user_id
        }));
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
        await env.DB.prepare(
            'DELETE FROM guestbook WHERE id = ?'
        ).bind(entry.id).run();
        await logAdminAction(env, 'ai_delete', 'guestbook', entry.id, reason, JSON.stringify({
            snapshot_content: entry.content,
            nickname: entry.nickname,
            user_id: entry.user_id,
            created_at: entry.created_at
        }));
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
async function logAdminAction(env, action, targetType, targetId, reason, details) {
    try {
        await env.DB.prepare(
            'INSERT INTO admin_logs (action, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?)'
        ).bind(action, targetType, targetId, reason, details).run();
        await env.DB.prepare("DELETE FROM admin_logs WHERE created_at < date('now', '-3 days')").run();
    } catch (e) {
        console.error('记录管理员操作失败:', e);
    }
}
async function handleSearch(query, env) {
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
    try {
        const embeddings = await generateEmbeddings(env, [query.trim()]);
        if (!embeddings?.[0]) {
            throw new Error('AI 嵌入生成失败');
        }
        const queryVector = embeddings[0];
        const vectorResults = await VECTORIZE.query(queryVector, {
            topK: 15,
            returnMetadata: 'all'
        });
        if (!vectorResults?.matches || vectorResults.matches.length === 0) {
            return {
                success: true,
                action: 'search',
                message: '未找到相关资源',
                searchResults: [],
                query: query
            };
        }
        const MIN_SCORE = 0.3;
        const validMatches = vectorResults.matches.filter(m => m.score >= MIN_SCORE);
        if (validMatches.length === 0) {
            return {
                success: true,
                action: 'search',
                message: '未找到足够相关的资源',
                searchResults: [],
                query: query
            };
        }
        const fileIds = validMatches.map(m => parseInt(m.id));
        const vectorScoreMap = {};
        validMatches.forEach(m => { vectorScoreMap[m.id] = m.score; });
        const placeholders = fileIds.map(() => '?').join(',');
        const filesResult = await DB.prepare(
            `SELECT id, name, key, parent_path, is_directory FROM files WHERE id IN (${placeholders})`
        ).bind(...fileIds).all();
        let filesWithScores = (filesResult.results || []).map(file => ({
            ...file,
            similarity_score: vectorScoreMap[file.id] || 0
        }));
        const rerankDocs = filesWithScores.map(f => f.key || f.name);
        const rerankResult = await rerankResults(env, query, rerankDocs, 15);
        if (rerankResult) {
            const rerankScoreMap = {};
            rerankResult.forEach(r => {
                const fileId = fileIds[r.index];
                if (fileId) rerankScoreMap[fileId] = r.relevance_score;
            });
            filesWithScores = filesWithScores.map(f => ({
                ...f,
                similarity_score: rerankScoreMap[f.id] ?? f.similarity_score,
                vector_score: vectorScoreMap[f.id] || 0
            }));
        }
        filesWithScores.sort((a, b) => b.similarity_score - a.similarity_score);
        return {
            success: true,
            action: 'search',
            message: `找到 ${filesWithScores.length} 个相关资源`,
            searchResults: filesWithScores,
            query: query
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
async function handleSearchResults(guestbookEntry, searchResults, env, autoMode) {
    if (!searchResults || searchResults.length === 0) {
        return {
            success: true,
            action: 'search_no_results',
            message: '未找到匹配的资源，留言保持待处理状态',
            auto_applied: false
        };
    }
    const normalizePath = (p) => p ? p.replace(/\/+/g, '/').replace(/^\/|\/$/, '') : '';
    const resourceList = searchResults.slice(0, 5).map((f, i) => {
        const parentPath = normalizePath(f.parent_path);
        const path = parentPath ? `${parentPath}/${f.name}` : f.name;
        return `${i + 1}. ${f.name} (路径: ${path}, 相似度: ${(f.similarity_score * 100).toFixed(1)}%)`;
    }).join('\n');
    const secondPrompt = `搜索结果：
${resourceList}
用户留言：${guestbookEntry.content}
匹配规则：核心学科必须一致，严禁版本错配（如求B不能匹配A），年份需注意。仅文件格式差异可忽略。
- 匹配成功 -> mark_resolved(matched_file_index=序号, note=含资源位置的用户备注, reply=管理员备注)
- 不匹配 -> keep_pending(note=不匹配原因)`;
    const searchTools = [
        {
            type: 'function',
            function: {
                name: 'mark_resolved',
                description: '标记留言为已解决。当从搜索结果中找到匹配资源时使用。',
                parameters: {
                    type: 'object',
                    properties: {
                        note: {
                            type: 'string',
                            description: '给用户的备注（用户可见）。告诉用户资源已找到，包含资源位置等有用信息。'
                        },
                        matched_file_index: {
                            type: 'integer',
                            description: '匹配的资源序号（填写搜索结果列表中的数字编号，如 1）'
                        },
                        reply: {
                            type: 'string',
                            description: '管理员审计备注（用户不可见，可选）。供管理员参考的补充说明，如版本差异、匹配依据等。'
                        }
                    },
                    required: ['note', 'matched_file_index']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'keep_pending',
                description: '保持留言待处理状态。当搜索结果都不匹配时使用。',
                parameters: {
                    type: 'object',
                    properties: {
                        note: {
                            type: 'string',
                            description: '备注原因'
                        }
                    },
                    required: ['note']
                }
            }
        }
    ];
    const aiResponse = await fetchAIChatCompletion(
        [
            { role: 'system', content: '你是资源匹配助手。你的任务是根据搜索结果判断是否满足用户的资源请求。' },
            { role: 'user', content: secondPrompt }
        ],
        searchTools,
        env,
        'auto',
        0.7
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
            const idx = functionArgs.matched_file_index;
            let resourcePath = null;
            if (idx && typeof idx === 'number' && idx > 0 && idx <= searchResults.length) {
                const file = searchResults[idx - 1];
                const normalizePath = (p) => p ? p.replace(/\/+/g, '/').replace(/^\/|\/$/, '') : '';
                if (file.is_directory) {
                    const parentPath = normalizePath(file.parent_path);
                    resourcePath = parentPath ? `${parentPath}/${file.name}` : file.name;
                } else {
                    resourcePath = normalizePath(file.parent_path);
                }
            }
            return await handleResolve(
                guestbookEntry,
                functionArgs.reply,
                searchResults,
                resourcePath,
                env,
                autoMode,
                functionArgs.note
            );
        }
        if (functionName === 'keep_pending') {
            return {
                success: true,
                action: 'keep_pending',
                message: '资源匹配度不够，保持待处理',
                note: functionArgs.note,
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
async function handleResolve(entry, reply, searchResults = null, resourcePath = null, env = null, autoMode = false, note = null) {
    if (autoMode && env && entry) {
        let resolveValue = null;
        if (resourcePath || note) {
            resolveValue = JSON.stringify({ path: resourcePath, note: note });
        }
        await env.DB.prepare(
            'UPDATE guestbook SET status = ?, reject_reason = NULL, resolve_note = ? WHERE id = ?'
        ).bind('resolved', resolveValue, entry.id).run();
        await logAdminAction(env, 'ai_resolve', 'guestbook', entry.id, reply, JSON.stringify({
            content: entry.content,
            nickname: entry.nickname,
            user_id: entry.user_id,
            resource_path: resourcePath,
            note: note
        }));
        return {
            success: true,
            action: 'resolve',
            message: `留言已标记为已解决: ${reply}`,
            reply: reply,
            searchResults: searchResults,
            resource_path: resourcePath,
            note: note,
            auto_applied: true
        };
    }
    return {
        success: true,
        action: 'resolve',
        message: '建议标记为已解决',
        reply: reply,
        searchResults: searchResults,
        resource_path: resourcePath,
        note: note,
        auto_applied: false
    };
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
async function fetchAIChatCompletion(messages, tools, env, toolChoice = 'auto', temperature = 0.7) {
    if (!env.AI_API_KEY) {
        throw new Error('未配置 AI_API_KEY');
    }
    return await retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
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
    }, 3, 1000);
}
const REPLY_SYSTEM_PROMPT = `你是武汉理工大学资源分享网站留言板的内容审核AI，判断内容是否合规。
重要背景：本站是资源分享平台，用户请求课程资料、真题、课件等属于正常行为，不是广告或垃圾信息。

判断标准（按优先级）：
1. 昵称含辱骂/色情/反动/恶意推广/攻击性/不雅词汇 -> ban_user，reason 写明昵称违规类型（无论留言内容如何，必须封禁）
2. 含暴恐/反动/色情/违法/辱骂/人身攻击 -> reject，reason 写明违规类型
3. 含广告/刷屏/无意义内容 -> reject，reason 写明原因（注意：求课程资料、求真题等资源请求不是广告，必须approve）
4. 留联系方式(QQ/微信/邮箱/手机号) -> reject，reason: 请勿在留言板泄露个人信息
5. 其他正常内容（包括资源请求、感谢等） -> approve
所有输出必须是纯文本，禁用Markdown。`;

const REPLY_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'approve',
            description: '内容合规，通过审核',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'reject',
            description: '内容违规，驳回留言',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '驳回原因'
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
            description: '内容严重违规（辱骂/色情/反动等），封禁用户并删除留言',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '封禁原因'
                    }
                },
                required: ['reason']
            }
        }
    }
];

export async function processReplyWithAI(replyEntry, env) {
    if (!env.SILICONFLOW_API_KEY) {
        return { success: true, action: 'no_action', message: '未配置回复审核API' };
    }
    const parentEntry = replyEntry.parent_id ? await env.DB.prepare(
        'SELECT g.content, g.status FROM guestbook g WHERE g.id = ?'
    ).bind(replyEntry.parent_id).first() : null;
    const parentContext = parentEntry ? parentEntry.content.substring(0, 200) : '';
    const roleTag = (replyEntry.role === 'admin' || replyEntry.role === 'super_admin') ? '【管理员】' : '【普通用户】';
    const userMessage = `用户身份：${roleTag}
用户昵称：${replyEntry.nickname || '匿名用户'}
${parentContext ? `原留言内容：${parentContext}` : ''}
回复内容：${replyEntry.content}`;

    try {
        const aiResponse = await fetchSiliconFlowChat(env, {
            messages: [
                { role: 'system', content: REPLY_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            tools: REPLY_TOOLS,
            toolChoice: 'auto',
            temperature: 0.3,
            model: 'Qwen/Qwen3-8B'
        });
        const message = aiResponse.choices?.[0]?.message;
        if (!message) {
            return { success: true, action: 'no_action', message: 'AI未返回有效响应' };
        }
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const functionName = toolCall.function.name;
            let functionArgs;
            try {
                functionArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (e) {
                return { success: true, action: 'keep_pending', message: `AI参数解析失败，需人工处理: ${e.message}` };
            }
            if (functionName === 'reject') {
                const reason = (functionArgs.reason || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                await env.DB.prepare(
                    'UPDATE guestbook SET status = ?, reject_reason = ?, is_hidden = 1 WHERE id = ?'
                ).bind('rejected', reason, replyEntry.id).run();
                await logAdminAction(env, 'ai_reject', 'guestbook', replyEntry.id, reason, JSON.stringify({
                    content: replyEntry.content,
                    nickname: replyEntry.nickname,
                    user_id: replyEntry.user_id,
                    parent_id: replyEntry.parent_id
                }));
                return {
                    success: true,
                    action: 'reject',
                    message: `已驳回: ${reason}`,
                    reason: reason
                };
            }
            if (functionName === 'ban_user') {
                const reason = (functionArgs.reason || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                if (replyEntry.role === 'admin' || replyEntry.role === 'super_admin') {
                    return { success: false, action: 'no_action', message: '无法封禁管理员' };
                }
                await env.DB.batch([
                    env.DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(replyEntry.user_id),
                    env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(replyEntry.id)
                ]);
                await logAdminAction(env, 'ai_ban_user', 'user', replyEntry.user_id, reason, JSON.stringify({
                    deleted_guestbook_id: replyEntry.id,
                    content: replyEntry.content,
                    nickname: replyEntry.nickname
                }));
                return {
                    success: true,
                    action: 'ban_user',
                    message: `用户已封禁: ${reason}`,
                    reason: reason
                };
                        }
            return { success: true, action: 'no_action', message: '内容通过审核' };
        }
        return { success: true, action: 'no_action', message: 'AI未决定采取行动', ai_response: message.content };
    } catch (error) {
        console.error('小模型审核失败:', error);
        return { success: true, action: 'keep_pending', message: '审核失败，需人工处理' };
    }
}

export async function preFilterWithSmallModel(entry, env) {
    if (!env.SILICONFLOW_API_KEY) {
        return { passed: true };
    }
    if (entry.role === 'admin' || entry.role === 'super_admin') {
        return { passed: true };
    }
    const roleTag = (entry.role === 'admin' || entry.role === 'super_admin') ? '【管理员】' : '【普通用户】';
    const userMessage = `用户身份：${roleTag}
用户昵称：${entry.nickname || '匿名用户'}
留言内容：${entry.content}`;

    try {
        const aiResponse = await fetchSiliconFlowChat(env, {
            messages: [
                { role: 'system', content: REPLY_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            tools: REPLY_TOOLS,
            toolChoice: 'auto',
            temperature: 0.3,
            model: 'Qwen/Qwen3-8B'
        });
        const message = aiResponse.choices?.[0]?.message;
        if (!message || !message.tool_calls || message.tool_calls.length === 0) {
            return { passed: true };
        }
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
            functionArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
            console.error('小模型预筛参数解析失败:', e);
            return { passed: true };
        }
        if (functionName === 'ban_user') {
            const reason = (functionArgs.reason || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || '昵称违规';
            return {
                passed: false,
                action: 'ban_user',
                reason: reason
            };
        }
        if (functionName === 'reject') {
            const reason = (functionArgs.reason || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || '内容违规';
            return {
                passed: false,
                action: 'reject',
                reason: reason
            };
        }
        return { passed: true };
    } catch (error) {
        console.error('小模型预筛选失败:', error);
        return { passed: true };
    }
}
