import { addCorsHeaders, hybridSearch, fetchSiliconFlowChat, getUserFromRequest, checkRateLimit, getUserRateLimitKey, resolveConstraintScope, mergeScopeFirst, filterByRelevance, searchByLiteralTerms } from '../utils.js';
const SEARCH_PROMPT = `把搜索语解析成检索计划，只输出一行 JSON：
{"keywords":"...","constraint":"...","unrelated":false}

keywords：核心课程名或连续词，空格分隔；简称原样保留，禁止拆成"资料""答案"等通用词。
constraint：附加限定，写成库里可能连续出现的字面词。时间只写四位年份（如 2024），用户写明的学年学期原样保留；相对时间换算成四位年份，不要自己拼学年区间。老师只写姓名，不确定留空。

示例（当前 2026 年）：
给我2024年的高数 → {"keywords":"高数","constraint":"2024","unrelated":false}
前年的毛概 → {"keywords":"毛概","constraint":"2024","unrelated":false}
张老师的线代课件 → {"keywords":"线代","constraint":"张","unrelated":false}
今天好烦 → {"keywords":"","constraint":"","unrelated":true}`;
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
    const rawTopK = parseInt(url.searchParams.get('topK') || '50', 10);
    const topK = Math.min(Math.max(Number.isFinite(rawTopK) ? rawTopK : 50, 1), 50);
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
        try {
            const llmResponse = await fetchSiliconFlowChat(env, {
                messages: [{ role: 'system', content: SEARCH_PROMPT + `\n当前时间：${now}` }, { role: 'user', content: query }],
                maxTokens: 120
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
            }
        } catch (e) {
            console.error('LLM 解析检索计划失败，使用原始查询:', e);
        }
        const constraintTerms = constraint
            ? constraint.split(/\s+/).map(t => t.trim()).filter(Boolean)
            : [];
        let scopedPath = '';
        let constraintResolved = true;
        let scopedByName = false;
        let literalHit = null;
        if (constraintTerms.length > 0) {
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
            const allResults = searchResult.results || [];
            filesWithScores = filterByRelevance(allResults);
            if (constraint) {
                try {
                    const scope = await resolveConstraintScope(env, DB, query, constraint, allResults, now);
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
        return { keywords: '', constraint: '', unrelated: true };
    }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed;
    try {
        parsed = JSON.parse(match[0]);
    } catch {
        return null;
    }
    return {
        keywords: typeof parsed.keywords === 'string' ? parsed.keywords.trim() : '',
        constraint: typeof parsed.constraint === 'string' ? parsed.constraint.trim() : '',
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
