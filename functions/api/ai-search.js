import { addCorsHeaders, hybridSearch, fetchSiliconFlowChat, getUserFromRequest, checkRateLimit, getUserRateLimitKey, resolveConstraintScope, mergeScopeFirst, filterByRelevance, searchByLiteralTerms } from '../utils.js';
const SEARCH_PROMPT = `你是大学课程资源搜索助手，把用户【搜索词】解析成检索计划。
    资源库按 "0.课程资料/<课程名>/<学年学期>/" 组织。

    规则：
    1. keywords：用户真正要找的内容，2-3 个词，用空格分隔。简称保持原样即可（高数、大物、毛概
       都能直接搜到），保留课程后缀（A/B、一/二、1）。
       - 只写"要找什么"，不含时间、年份、老师、章节等限定词
       - 课程名必须整体保留，禁止拆成"政策""资料""答案""文件"这类通用词，
         否则会召回转专业政策、保研政策等完全无关的内容
    2. constraint：用户附加的限定，原样摘录。包括时间（"2024年""这学期""2026第二学期"）、
       老师名、版本号、章节号等。没有则填 ""。
    3. constraintTerms：把 constraint 换成【库里可能真实存在的字面词】，数组，后端拿去直接搜文件名/目录名。
       - 去掉口语修饰："2024年"→["2024"]、"张老师的线代"→["张"]
       - 已有格式原样保留："2025-2026-2"→["2025-2026-2"]
       - 相对说法必须按【当前时间】自己换算成具体学年学期：
         "这学期"→当前学期、"上学期"→上一学期、"去年"→上一学年两个学期都列
       - 学期口径：9月~次年1月为第 1 学期，2月~8月为第 2 学期
       - 拿不准就多给几个候选；实在无法字面表达才填 []
    4. 只输出严格 JSON，无 markdown、无解释：
       {"keywords":"...","constraint":"...","constraintTerms":[],"unrelated":false}
    5. 与学习无关（纯聊天、脏话、娱乐八卦）输出 {"keywords":"","constraint":"","constraintTerms":[],"unrelated":true}；不确定时按相关处理。`;
export async function onRequestGet({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (env.AI_BOT_TOKEN && token === env.AI_BOT_TOKEN) {
            user = { id: 0, role: 'bot', username: 'AI_BOT' };
        } else {
            user = await getUserFromRequest(request, env);
        }
    }
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), {
            status: 401,
            headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
    const rlKey = getUserRateLimitKey(user, 'ai-search');
    if (!checkRateLimit(rlKey, 20)) {
        return new Response(JSON.stringify({ success: false, error: '搜索请求过于频繁，请稍后再试' }), {
            status: 429, headers: { ...addCorsHeaders({ 'Content-Type': 'application/json' }), 'Retry-After': '60' }
        });
    }
    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    const topK = parseInt(url.searchParams.get('topK') || '50');
    if (!query || query.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: '缺少搜索关键词' }), {
            status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    const DB = env.DB;
    const VECTORIZE = env.VECTORIZE;
    if (!DB || !VECTORIZE || !env.SILICONFLOW_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    try {
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        let finalKeywords = query;
        let constraint = '';
        let constraintTerms = [];
        try {
            const llmResponse = await fetchSiliconFlowChat(env, {
                messages: [{ role: 'system', content: SEARCH_PROMPT + `\n当前时间：${now}` }, { role: 'user', content: query }]
            });
            const plan = parseSearchPlan(llmResponse.choices?.[0]?.message?.content);
            if (plan) {
                if (plan.unrelated) {
                    return new Response(JSON.stringify({
                        success: true,
                        files: [],
                        directories: [],
                        keywords: '',
                        message: '未识别到与学习相关的搜索内容'
                    }), {
                        status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
                    });
                }
                if (plan.keywords) finalKeywords = plan.keywords;
                constraint = plan.constraint;
                constraintTerms = plan.constraintTerms;
            }
        } catch (e) {
            console.error('LLM 解析检索计划失败，使用原始查询:', e);
        }
        let scopedPath = '';
        let constraintResolved = true;
        let scopedByName = false;
        let literalHit = null;
        if (constraint && constraintTerms.length > 0) {
            literalHit = await searchByLiteralTerms(DB, finalKeywords, constraintTerms, topK);
            if (literalHit) scopedByName = true;
        }
        let filesWithScores;
        if (literalHit) {
            filesWithScores = literalHit.map(row => ({
                ...row,
                similarity_score: 1,
                relevance: 1,
                scoped: true
            }));
        } else {
            const searchResult = await hybridSearch(DB, VECTORIZE, env, finalKeywords, { topK: topK });
            filesWithScores = filterByRelevance(searchResult.results || []);
            if (constraint) {
                try {
                    const scope = await resolveConstraintScope(env, DB, query, constraint, filesWithScores, now);
                    if (scope) {
                        scopedByName = scope.mode === 'name';
                        scopedPath = scope.path || '';
                        filesWithScores = mergeScopeFirst(scope, filesWithScores);
                    } else {
                        constraintResolved = false;
                    }
                } catch (e) {
                    constraintResolved = false;
                    console.error('限定条件定位失败:', e);
                }
            }
        }
        let constraintNote = '';
        if (constraint) {
            if (!constraintResolved) {
                constraintNote = `未能定位到符合「${constraint}」的资源，以下为仅按关键词命中的内容，请自行核对`;
            } else if (scopedByName) {
                constraintNote = `已按「${constraint}」筛选`;
            } else if (scopedPath) {
                constraintNote = `已限定到「${scopedPath}」`;
            }
        }
        if (filesWithScores.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                constraint,
                constraintResolved,
                scopedPath,
                constraintNote: '',
                message: buildEmptyMessage(constraint),
                totalItems: 0,
                isAISearch: true
            }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const directories = filesWithScores.filter(f => f.is_directory);
        const files = filesWithScores.filter(f => !f.is_directory);
        return new Response(JSON.stringify({
            success: true,
            files: files,
            directories: directories,
            keywords: finalKeywords,
            constraint,
            constraintResolved,
            constraintNote,
            scopedPath,
            totalItems: filesWithScores.length,
            isAISearch: true
        }), {
            status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (error) {
        console.error('AI 搜索出错:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}
function parseSearchPlan(rawContent) {
    const cleaned = stripThink(rawContent);
    if (!cleaned) return null;
    if (cleaned.toUpperCase() === 'NULL') {
        return { keywords: '', constraint: '', constraintTerms: [], unrelated: true };
    }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed;
    try {
        parsed = JSON.parse(match[0]);
    } catch {
        return null;
    }
    const constraintTerms = Array.isArray(parsed.constraintTerms)
        ? parsed.constraintTerms
            .filter(v => typeof v === 'string' && v.trim().length > 0)
            .map(v => v.trim())
        : [];
    return {
        keywords: typeof parsed.keywords === 'string' ? parsed.keywords.trim() : '',
        constraint: typeof parsed.constraint === 'string' ? parsed.constraint.trim() : '',
        constraintTerms,
        unrelated: parsed.unrelated === true
    };
}
function buildEmptyMessage(constraint) {
    if (constraint) return `未找到符合「${constraint}」的资源`;
    return '未找到相关资源';
}
function stripThink(rawContent) {
    if (typeof rawContent !== 'string') return '';
    let text = rawContent;
    const open = '<' + 'think>';
    const close = '<' + '/think>';
    while (text.includes(open) && text.includes(close)) {
        const start = text.indexOf(open);
        const end = text.indexOf(close, start);
        if (end < 0) break;
        text = text.slice(0, start) + text.slice(end + close.length);
    }
    return text.trim();
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
