import { verifyToken, addCorsHeaders } from '../utils.js';
const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const MODEL_NAME = 'Qwen/Qwen3-8B';
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'reject_message',
            description: '驳回留言。当留言内容表述不清、无关、灌水时使用。驳回后留言仍可见，但会显示驳回原因。',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '驳回原因（纯文本，不用markdown）。常用：表述不清、重复提交、灌水信息、无关内容、一条条说、上方公告区已写'
                    }
                },
                required: ['reason']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'hide_message',
            description: '隐藏留言。当留言包含不当内容但不至于删除时使用，如轻微违规、引战言论等。隐藏后普通用户不可见。',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: '隐藏原因（纯文本），供管理员参考'
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
                        description: '删除原因（纯文本），说明为什么需要删除'
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
                        description: '搜索关键词，从用户留言中提取的资源名称或关键词'
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
            description: '标记留言为已解决。当已经找到用户需要的资源时使用。',
            parameters: {
                type: 'object',
                properties: {
                    reply: {
                        type: 'string',
                        description: '回复消息（纯文本，不用markdown），告诉用户资源位置'
                    }
                },
                required: ['reply']
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
const SYSTEM_PROMPT = `你是一个大学资源分享网站的留言板 AI 助手。你的职责是分析用户提交的留言，并决定如何处理。
    重要：所有回复内容必须使用纯文本，不要使用markdown格式（不要用**、#、- 等符号）！
    ## 网站背景
    这是一个大学资源分享网站（武汉理工大学），主要包含课程资料、期末真题、复习资料等。
    ## 处理级别（按严重程度排序）
    ### 级别1：删除（最严重，谨慎使用）
    仅当留言包含以下内容时删除：
    - 辱骂、人身攻击
    - 广告、推销信息
    - 色情、暴力内容
    - 政治敏感言论
    - 其他严重违规内容
    ### 级别2：隐藏（较严重）
    当留言包含以下内容时隐藏：
    - 引战、挑衅言论
    - 轻微不当内容
    - 泄露他人隐私
    - 恶意刷屏
    ### 级别3：驳回（一般情况）
    当留言符合以下情况时驳回：
    - 表述不清：只写课程名没说要什么（如"模拟电路b"、"求工图B"）
    - 一条多求：一条留言请求多门课程资料
    - 灌水信息：纯表情、"顶"、"666"等
    - 无关内容：询问QQ群等（回复"上方公告区已写"）
    ### 级别4：正常处理
    当留言是合格的资源请求时：
    - 明确说明资料类型（期末真题、往年试卷、复习资料等）
    - 单一明确的课程请求
    - 如："求电路原理A的期末往年真题"
    ## 处理流程
    1. 先检查是否需要删除或隐藏（严重违规）
    2. 再检查是否需要驳回（表述不清等）
    3. 如果是合格请求，提取关键词搜索资源
    4. 根据搜索结果决定标记已解决或保持待处理
    ## 案例
    - "傻逼网站" → 删除，辱骂内容
    - "加我微信卖资料" → 删除，广告
    - "这网站真垃圾，不如xxx" → 隐藏，引战
    - "模拟电路b" → 驳回，表述不清
    - "求电路原理A期末真题" → 搜索资源
    请分析留言内容，调用合适的工具处理。记住：返回纯文本，不用markdown！`;
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
        if (!user || user.role !== 'admin') {
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
            'SELECT g.*, u.nickname FROM guestbook g LEFT JOIN users u ON g.user_id = u.id WHERE g.id = ?'
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
async function processWithAIAgent(guestbookEntry, env, autoMode) {
    const SILICONFLOW_API_KEY = env.SILICONFLOW_API_KEY;
    if (!SILICONFLOW_API_KEY) {
        throw new Error('未配置 SILICONFLOW_API_KEY');
    }
    const userMessage = `用户昵称：${guestbookEntry.nickname || '匿名用户'}
留言内容：${guestbookEntry.content}
提交时间：${guestbookEntry.created_at}`;
    const response = await fetch(SILICONFLOW_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 1024
        })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`硅基流动 API 调用失败: ${response.status} - ${errorText}`);
    }
    const aiResponse = await response.json();
    const message = aiResponse.choices?.[0]?.message;
    if (!message) {
        throw new Error('AI 未返回有效响应');
    }
    if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
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
                SILICONFLOW_API_KEY,
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
    switch (functionName) {
        case 'reject_message':
            return await handleReject(guestbookEntry.id, args.reason, env, autoMode);
        case 'hide_message':
            return await handleHide(guestbookEntry.id, args.reason, env, autoMode);
        case 'delete_message':
            return await handleDelete(guestbookEntry.id, args.reason, env, autoMode);
        case 'search_resources':
            return await handleSearch(args.query, env);
        case 'mark_resolved':
            return await handleResolve(guestbookEntry.id, args.reply, env, autoMode);
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
async function handleReject(guestbookId, reason, env, autoMode) {
    if (autoMode) {
        await env.DB.prepare(
            'UPDATE guestbook SET status = ?, reject_reason = ? WHERE id = ?'
        ).bind('rejected', reason, guestbookId).run();
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
async function handleHide(guestbookId, reason, env, autoMode) {
    if (autoMode) {
        await env.DB.prepare(
            'UPDATE guestbook SET is_hidden = 1 WHERE id = ?'
        ).bind(guestbookId).run();
        return {
            success: true,
            action: 'hide',
            message: `留言已隐藏: ${reason}`,
            reason: reason,
            auto_applied: true
        };
    }
    return {
        success: true,
        action: 'hide',
        message: '建议隐藏留言',
        reason: reason,
        auto_applied: false
    };
}
async function handleDelete(guestbookId, reason, env, autoMode) {
    if (autoMode) {
        await env.DB.prepare(
            'DELETE FROM guestbook WHERE id = ?'
        ).bind(guestbookId).run();
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
async function handleSearch(query, env) {
    const AI = env.AI;
    const VECTORIZE = env.VECTORIZE;
    const DB = env.DB;
    if (!AI || !VECTORIZE) {
        return {
            success: false,
            action: 'search',
            message: '向量搜索服务不可用',
            searchResults: null
        };
    }
    try {
        const embeddingResponse = await AI.run('@cf/baai/bge-m3', {
            text: [query.trim()]
        });
        if (!embeddingResponse?.data?.[0]) {
            throw new Error('嵌入生成失败');
        }
        const queryVector = embeddingResponse.data[0];
        const vectorResults = await VECTORIZE.query(queryVector, {
            topK: 10,
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
        const MIN_SCORE = 0.5;
        const validMatches = vectorResults.matches.filter(m => m.score >= MIN_SCORE);
        if (validMatches.length === 0) {
            return {
                success: true,
                action: 'search',
                message: '未找到相关资源（相似度太低）',
                searchResults: [],
                query: query
            };
        }
        const fileIds = validMatches.map(m => parseInt(m.id));
        const placeholders = fileIds.map(() => '?').join(',');
        const filesResult = await DB.prepare(
            `SELECT id, name, key, parent_path, is_directory FROM files WHERE id IN (${placeholders})`
        ).bind(...fileIds).all();
        const scoreMap = {};
        validMatches.forEach(m => {
            scoreMap[m.id] = m.score;
        });
        const filesWithScores = (filesResult.results || []).map(file => ({
            ...file,
            similarity_score: scoreMap[file.id] || 0
        }));
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
async function handleSearchResults(guestbookEntry, searchResults, env, apiKey, autoMode) {
    if (!searchResults || searchResults.length === 0) {
        return {
            success: true,
            action: 'search_no_results',
            message: '未找到匹配的资源，留言保持待处理状态',
            auto_applied: false
        };
    }
    const resourceList = searchResults.slice(0, 5).map((f, i) => {
        const path = f.parent_path ? `${f.parent_path}/${f.name}` : f.name;
        return `${i + 1}. ${f.name} (路径: ${path}, 相似度: ${(f.similarity_score * 100).toFixed(1)}%)`;
    }).join('\n');
    const secondPrompt = `根据用户的留言请求，我已经搜索到了以下相关资源：
        ${resourceList}
        用户原始留言：${guestbookEntry.content}
        请判断：
        1. 如果这些资源能满足用户需求，使用 mark_resolved 工具，生成友好的回复告诉用户资源位置
        2. 如果资源不太匹配，使用 keep_pending 工具，说明需要人工处理的原因`;
    const response = await fetch(SILICONFLOW_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: secondPrompt }
            ],
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 1024
        })
    });
    if (!response.ok) {
        throw new Error(`AI 二次调用失败: ${response.status}`);
    }
    const aiResponse = await response.json();
    const message = aiResponse.choices?.[0]?.message;
    if (message?.tool_calls?.length > 0) {
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        if (functionName === 'mark_resolved') {
            return await handleResolve(
                guestbookEntry.id,
                functionArgs.reply,
                env,
                autoMode,
                searchResults
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
async function handleResolve(guestbookId, reply, env, autoMode, searchResults = null) {
    if (autoMode) {
        await env.DB.prepare(
            'UPDATE guestbook SET status = ? WHERE id = ?'
        ).bind('resolved', guestbookId).run();
        return {
            success: true,
            action: 'resolve',
            message: '留言已标记为已解决',
            reply: reply,
            searchResults: searchResults,
            auto_applied: true
        };
    }
    return {
        success: true,
        action: 'resolve',
        message: '建议标记为已解决',
        reply: reply,
        searchResults: searchResults,
        auto_applied: false
    };
}
export async function onRequestGet(context) {
    const { request, env } = context;
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') {
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
