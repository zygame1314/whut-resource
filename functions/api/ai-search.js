import { verifyToken, addCorsHeaders } from '../utils.js';
const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const MODEL = 'Qwen/Qwen3-8B';
const SEARCH_PROMPT = `你是一个大学课程资源搜索助手。必须将用户的【搜索词】转化为【搜索关键词】。
    规则：
    1. 严格修正缩写：
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
    2. 识别学业相关活动：
       保研/推免→保研 推免 研究生
       考研→考研 研究生
       四级/CET4→英语 四级 CET4
       六级/CET6→英语 六级 CET6
       竞赛/数模→竞赛 数学建模
       实习/就业→实习 就业 招聘
       毕设/毕业设计→毕业设计 论文
       期末/复习→期末 复习 考试
    3. 生成关键词：
       - 返回2-3个最相关的搜索词
       - 必须保留课程后缀（A/B、(一)、1）
       - 用空格分隔
    4. 边界处理：
       - 只有当用户查询内容明显与【大学学习、课程、考试、学业发展】完全无关时（如"想吃火锅"、"天气"、"今天心情"），才返回 "NULL"
       - 对于任何可能与学业相关的查询，都应尝试返回关键词
       - 严禁废话，只返回关键词字符串或 "NULL"`;
export async function onRequestGet({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (env.AI_BOT_TOKEN && token === env.AI_BOT_TOKEN) {
            user = { id: 0, role: 'bot', username: 'AI_BOT' };
        } else {
            user = await verifyToken(token, env.JWT_SECRET || 'secret');
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
    const AI = env.AI;
    const VECTORIZE = env.VECTORIZE;
    if (!DB || !AI || !VECTORIZE) {
        return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
            status: 500, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
        });
    }
    try {
        let finalKeywords = query;
        try {
            const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            const llmResponse = await fetchAIChatCompletion(
                [{ role: 'system', content: SEARCH_PROMPT + `\n当前时间：${now}` }, { role: 'user', content: query }],
                null,
                env
            );
            let content = llmResponse.choices?.[0]?.message?.content?.trim();
            if (content) {
                content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                if (content === 'NULL' || content.includes('无相关')) {
                    return new Response(JSON.stringify({
                        success: true,
                        files: [],
                        directories: [],
                        keywords: query,
                        message: '未识别到相关课程信息',
                        isAISearch: true
                    }), {
                        status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
                    });
                }
                finalKeywords = content;
            }
        } catch (e) {
            console.error('LLM 扩展关键词失败，使用原始查询:', e);
        }
        const embeddingResponse = await AI.run('@cf/baai/bge-m3', {
            text: [finalKeywords.trim()]
        });
        if (!embeddingResponse?.data?.[0]) {
            throw new Error('AI 嵌入生成失败');
        }
        const queryVector = embeddingResponse.data[0];
        const vectorResults = await VECTORIZE.query(queryVector, {
            topK: topK,
            returnMetadata: 'all'
        });
        if (!vectorResults?.matches || vectorResults.matches.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                message: '未找到相关文件'
            }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const MIN_SCORE = 0.45;
        const validMatches = vectorResults.matches.filter(m => m.score >= MIN_SCORE);
        if (validMatches.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                files: [],
                directories: [],
                keywords: finalKeywords,
                message: '未找到足够相关的资源'
            }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const fileIds = validMatches.map(m => parseInt(m.id));
        const scoreMap = {};
        validMatches.forEach(m => { scoreMap[m.id] = m.score; });
        const placeholders = fileIds.map(() => '?').join(',');
        const filesResult = await DB.prepare(
            `SELECT * FROM files WHERE id IN (${placeholders})`
        ).bind(...fileIds).all();
        const filesWithScores = (filesResult.results || []).map(file => ({
            ...file,
            similarity_score: scoreMap[file.id] || 0
        }));
        filesWithScores.sort((a, b) => b.similarity_score - a.similarity_score);
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
async function fetchAIChatCompletion(messages, tools, env, toolChoice = 'auto', temperature = 0.1) {
    if (!env.SILICONFLOW_API_KEY) {
        throw new Error('未配置 SILICONFLOW_API_KEY');
    }
    const body = {
        model: MODEL,
        messages: messages,
        temperature: temperature,
        stream: false,
        enable_thinking: false
    };
    if (tools) {
        body.tools = tools;
        body.tool_choice = toolChoice;
    }
    const response = await fetch(SILICONFLOW_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SiliconFlow API Error: ${response.status} - ${errorText}`);
    }
    return await response.json();
}
