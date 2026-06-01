import { addCorsHeaders, hybridSearch, fetchSiliconFlowChat, getUserFromRequest } from '../utils.js';
const SEARCH_PROMPT = `你是一个大学课程资源搜索助手。将用户的【搜索词】转化为【搜索关键词】。
    规则：
    1. 缩写对应示例：
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
    2. 学业相关活动示例：
       保研/推免→保研 推免 研究生
       考研→考研 研究生
       四级/CET4→英语 四级 CET4
       六级/CET6→英语 六级 CET6
       竞赛/数模→竞赛 数学建模
       实习/就业→实习 就业 招聘
       毕设/毕业设计→毕业设计 论文
        期末/复习→期末 复习 考试
     校园平台示例：
        小雅→小雅平台 教学平台
        学堂在线→学堂在线 MOOC
        超星/学习通→超星 学习通
        雨课堂→雨课堂
        优慕课→优慕课
        智慧树→智慧树
     3. 生成关键词：
       - 返回2-3个最相关的搜索词
       - 保留课程后缀（A/B、(一)、1）
       - 用空格分隔
    4. 边界处理：
        - 如果无法确定如何转化，或认为原始输入已足够清晰，请直接返回原始搜索词
        - 对于不确定是否与学习相关的词，应返回原始搜索词而非 "NULL"，宁可多搜不可漏搜
        - 只有当用户查询内容明显与学习完全无关且无任何歧义（如纯聊天、脏话、娱乐明星八卦）时，才返回 "NULL"
       - 严禁废话，只返回关键词字符串或 "NULL"`;
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
        let finalKeywords = query;
        try {
            const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            const llmResponse = await fetchSiliconFlowChat(env, {
                messages: [{ role: 'system', content: SEARCH_PROMPT + `\n当前时间：${now}` }, { role: 'user', content: query }]
            });
            let content = llmResponse.choices?.[0]?.message?.content?.trim();
            if (content) {
                content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                const upperContent = content.toUpperCase();
                if (upperContent === 'NULL' || content.includes('无相关') || upperContent.includes('NULL')) {
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
                finalKeywords = content;
            }
        } catch (e) {
            console.error('LLM 扩展关键词失败，使用原始查询:', e);
        }
        const searchResult = await hybridSearch(DB, VECTORIZE, env, finalKeywords, { topK: topK });
        const filesWithScores = searchResult.results;
        if (!filesWithScores || filesWithScores.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                message: '未找到相关资源'
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
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
