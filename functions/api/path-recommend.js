import { addCorsHeaders, isAdmin, hybridSearch, fetchSiliconFlowChat, getUserFromRequest } from '../utils.js';
const KEYWORD_PROMPT = `你是一个大学课程目录推荐助手。用户上传了一些文件名，你需要提取出文件所属的课程名。
    规则：
    1. 从文件名里识别课程名，保留后缀（A/B/C、一/二）。简称保持原样即可，不用展开成全称。
    2. 课程名要整体写，不要拆成"答案""试卷""资料""期末"这类通用词。
    3. 返回 1-3 个最相关的检索词，用空格分隔，不要任何解释。`;
const PICK_PROMPT = `你是文件归档助手。根据用户要上传的文件，从搜索结果中选择最合适的目录。
    规则：
    1. 只返回目录编号（如 "3"）
    2. 如果有多个相关目录，选择最具体的那个（如有"试卷"子目录就选它）
    3. 如果都不合适，返回 "0"`;
const THINK_REGEX = /<think>[\s\S]*?<\/think>/gi;
export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(request, env);
        if (!user || !isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const { fileNames } = await request.json();
        if (!fileNames || !fileNames.length) {
            return new Response(JSON.stringify({ error: '文件名为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const validFileNames = fileNames.slice(0, 5).filter(n => typeof n === 'string' && n.trim().length > 0);
        const DB = env.DB;
        const VECTORIZE = env.VECTORIZE;
        if (!DB || !VECTORIZE || !env.SILICONFLOW_API_KEY) {
            return new Response(JSON.stringify({ error: '服务器配置错误' }), {
                status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        let keywords = validFileNames.join(' ');
        try {
            const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            const keywordResponse = await fetchSiliconFlowChat(env, {
                messages: [{ role: 'system', content: KEYWORD_PROMPT + `\n当前时间：${now}` }, { role: 'user', content: `文件名：${validFileNames.join(', ')}` }]
            });
            let content = keywordResponse.choices?.[0]?.message?.content?.trim();
            if (content) {
                content = content.replace(THINK_REGEX, '').trim();
                keywords = content;
            }
        } catch (e) {
            console.error('LLM 关键词提取失败:', e);
        }
        let directories = [];
        try {
            const searchResult = await hybridSearch(DB, VECTORIZE, env, keywords, { topK: 30, vectorTopK: 20, ftsLimit: 20 });
            const allResults = searchResult.results || [];
            const dirResults = allResults.filter(f => f.is_directory === 1 || f.is_directory === true).slice(0, 20);
            directories = dirResults.map(f => f.key);
        } catch (e) {
            console.error('搜索失败:', e);
        }
        if (directories.length === 0) {
            return new Response(JSON.stringify({ success: true, path: '', message: '未找到匹配的目录' }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const numberedList = directories.map((dir, i) => `${i + 1}. ${dir}`).join('\n');
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const pickData = await fetchSiliconFlowChat(env, {
            messages: [{ role: 'system', content: PICK_PROMPT + `\n当前时间：${now}` }, { role: 'user', content: `文件：${validFileNames.join(', ')}\n\n搜索到的目录：\n${numberedList}\n\n请返回最佳目录的编号：` }]
        });
        let pickContent = pickData.choices?.[0]?.message?.content?.trim() || '';
        if (pickContent) {
            pickContent = pickContent.replace(THINK_REGEX, '').trim();
        }
        const match = pickContent.match(/(\d+)/);
        let suggestedPath = '';
        if (match) {
            const id = parseInt(match[1]);
            if (id > 0 && id <= directories.length) {
                suggestedPath = directories[id - 1];
            }
        }
        return new Response(JSON.stringify({
            success: true,
            path: suggestedPath,
            keywords: keywords,
            candidates: directories.length
        }), {
            status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    } catch (error) {
        console.error('路径推荐错误:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
}
export async function onRequestOptions() {
    return new Response(null, { headers: addCorsHeaders() });
}