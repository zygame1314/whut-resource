import { addCorsHeaders, hybridSearch, fetchSiliconFlowChat, getUserFromRequest, checkRateLimit, getUserRateLimitKey } from '../utils.js';
const SEARCH_PROMPT = `你是一个大学课程资源搜索助手。将用户的【搜索词】解析为【检索计划】。
    背景：资源库按 "0.课程资料/<课程名>/<学年学期>/" 组织，学期目录的真实写法只能在库里查到，你不需要也不可能猜准。
    你只负责两件事：把"要找什么内容"说清楚，把"有什么限定条件"原样摘出来。

    规则：
    1. keywords：把课程/活动缩写扩展为全称后的语义搜索词，2-3 个，用空格分隔，保留课程后缀（A/B、(一)、1）。
       - keywords 只描述"要找什么内容"，不要包含学期、年份、老师、章节等限定词
       - 缩写对照：
         大物→大学物理、高数→高等数学、线代→线性代数
         概统/概率→概率论与数理统计
         数电→数字电子技术、模电→模拟电子技术
         计组→计算机组成原理、计网→计算机网络
         复变→复变函数
         思修→思想道德与法治
         史纲/近代史→中国近现代史纲要
         马原→马克思主义基本原理
         毛概→毛泽东思想和中国特色社会主义理论体系概论
         习概→习近平新时代中国特色社会主义思想概论
         数分→数学分析、高代→高等代数
         材力→材料力学、理力→理论力学、工图→工程图学、电工→电工与电子技术基础
       - 活动类：保研/推免→保研 推免 研究生、考研→考研 研究生、四级→英语 四级 CET4、六级→英语 六级 CET6、
         竞赛/数模→竞赛 数学建模、实习/就业→实习 就业 招聘、毕设→毕业设计 论文、期末/复习→期末 复习 考试
       - 校园平台：小雅→小雅平台 教学平台、学习通/超星→超星 学习通、学堂在线→学堂在线 MOOC、
         雨课堂→雨课堂、优慕课→优慕课、智慧树→智慧树
    2. constraint：用户明确提出的时间/范围限定，用自然语言原样描述，例如"2026年第二学期"、"这学期"、"上学期"、"最新的一学期"。
       - 不要换算成任何具体格式，不要补全学年，不要假设目录写法
       - 用户没有限定时为空字符串 ""
    3. 输出严格 JSON，不要 markdown 代码块，不要任何解释：
       {"keywords":"...","constraint":"...","unrelated":false}
    4. 边界：与学习无关且无歧义（纯聊天、脏话、娱乐八卦）时输出 {"keywords":"","constraint":"","unrelated":true}；
       不确定是否与学习相关时，宁可按相关处理`;
const PICK_PROMPT = `你是目录筛选助手。用户提出了一个时间/范围限定，你要从【候选目录】中选出最符合该限定的那个。
    规则：
    1. 只能返回候选目录的编号数字，或 0
    2. 判断依据是目录名中真实写着的学期信息，结合当前时间推算"这学期/上学期/第二学期"具体对应哪一个
    3. 用户没有限定、或候选目录均不符合限定要求时，返回 0
    4. 严禁输出解释、标点或其它文字`;
const PICK_MAX_CANDIDATES = 30;
const SCOPE_CHILD_LIMIT = 60;
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
            }
        } catch (e) {
            console.error('LLM 解析检索计划失败，使用原始查询:', e);
        }
        const searchResult = await hybridSearch(DB, VECTORIZE, env, finalKeywords, { topK: topK });
        let filesWithScores = searchResult.results || [];
        let scopedPath = '';
        let constraintResolved = true;
        if (constraint) {
            try {
                const scope = await resolveConstraintScope(env, DB, query, constraint, filesWithScores, now);
                if (scope) {
                    scopedPath = scope.path;
                    filesWithScores = mergeScopeResults(scope, filesWithScores);
                } else {
                    constraintResolved = false;
                }
            } catch (e) {
                constraintResolved = false;
                console.error('限定条件目录定位失败:', e);
            }
        }
        const constraintNote = constraint && !constraintResolved
            ? `未能定位到符合「${constraint}」的目录，以下为其他学期/未限定的相关资源，仅供参考`
            : '';
        if (filesWithScores.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                constraint,
                constraintResolved,
                message: constraintNote || (constraint
                    ? `未找到符合「${constraint}」的相关资源`
                    : '未找到相关资源')
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
async function resolveConstraintScope(env, DB, query, constraint, baseResults, now) {
    const anchorDirs = collectAnchorDirs(baseResults);
    if (anchorDirs.length === 0) return null;
    const candidates = await loadComparableDirs(DB, anchorDirs);
    if (candidates.length < 2) return null;
    const numbered = candidates.map((d, i) => `${i + 1}. ${d.key}`).join('\n');
    const pickResponse = await fetchSiliconFlowChat(env, {
        messages: [
            { role: 'system', content: PICK_PROMPT + `\n当前时间：${now}` },
            { role: 'user', content: `用户需求：${query}\n限定条件：${constraint}\n候选目录：\n${numbered}\n请返回最符合限定条件的目录编号：` }
        ]
    });
    const pickText = stripThink(pickResponse.choices?.[0]?.message?.content);
    const picked = parseInt((pickText.match(/\d+/) || [])[0] || '0', 10);
    if (!(picked > 0 && picked <= candidates.length)) return null;
    const chosen = candidates[picked - 1];
    const fullRows = await DB.prepare(
        `SELECT id, name, key, parent_path, is_directory, is_link, link_url, description, contentType, size, downloads, likes, uploaded
         FROM files
         WHERE key = ? OR key LIKE ?
         ORDER BY is_directory DESC, name
         LIMIT ?`
    ).bind(chosen.key, `${chosen.key}/%`, SCOPE_CHILD_LIMIT + 1).all();
    const rows = fullRows.results || [];
    const directory = rows.find(r => r.key === chosen.key);
    if (!directory) return null;
    return {
        path: chosen.key,
        directory,
        children: rows.filter(r => r.key !== chosen.key)
    };
}
function mergeScopeResults(scope, baseResults) {
    const seen = new Set();
    const merged = [];
    const push = (item, score) => {
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        merged.push({ ...item, similarity_score: score, scoped: true });
    };
    push(scope.directory, 1);
    for (const child of scope.children) {
        push(child, 0.95);
    }
    for (const item of baseResults || []) {
        push(item, item.similarity_score ?? 0);
    }
    return merged;
}
function collectAnchorDirs(baseResults) {
    const anchors = new Map();
    for (const row of baseResults || []) {
        if (!row.is_directory || !row.key) continue;
        if (anchors.size >= 5) break;
        anchors.set(row.key, {
            id: row.id,
            key: row.key,
            name: row.name,
            parent_path: row.parent_path || ''
        });
    }
    return [...anchors.values()];
}
async function loadComparableDirs(DB, anchorDirs) {
    const depthOf = key => (key || '').split('/').filter(Boolean).length;
    const shallowest = [...anchorDirs].sort((a, b) => depthOf(a.key) - depthOf(b.key))[0];
    const children = await loadChildDirs(DB, [shallowest.key]);
    if (children.length > 1) return children.slice(0, PICK_MAX_CANDIDATES);
    const parentSet = [...new Set(anchorDirs.map(d => d.parent_path || ''))].filter(Boolean);
    if (parentSet.length > 0) {
        const siblingRows = await DB.prepare(
            `SELECT id, key, name, parent_path FROM files
             WHERE is_directory = 1 AND parent_path IN (${parentSet.map(() => '?').join(',')})
             ORDER BY key LIMIT 200`
        ).bind(...parentSet).all();
        const siblings = (siblingRows.results || []).filter(r => r.key && r.key.includes('/'));
        if (siblings.length > 1) return siblings.slice(0, PICK_MAX_CANDIDATES);
    }
    return children.slice(0, PICK_MAX_CANDIDATES);
}
async function loadChildDirs(DB, dirKeys) {
    const anchorKeys = new Set(dirKeys);
    const seen = new Set();
    const collected = [];
    for (const key of dirKeys) {
        const rows = await DB.prepare(
            `SELECT id, key, name, parent_path FROM files
             WHERE is_directory = 1 AND key LIKE ?
             ORDER BY key LIMIT 200`
        ).bind(`${key}/%`).all();
        for (const row of rows.results || []) {
            if (!row.key || anchorKeys.has(row.key) || seen.has(row.key)) continue;
            const rest = row.key.slice(key.length + 1);
            if (rest.includes('/')) continue;
            seen.add(row.key);
            collected.push(row);
        }
    }
    return collected;
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
