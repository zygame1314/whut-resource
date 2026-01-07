import { verifyToken, addCorsHeaders, isAdmin } from '../utils.js';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'qwen-3-32b';
const NVIDIA_MODEL = 'qwen/qwq-32b';
const GROQ_MODEL = 'qwen/qwen3-32b';
const KEYWORD_PROMPT = `你是一个大学课程目录推荐助手。用户上传了一些文件名，你需要提取出文件所属的课程全称。
    规则：
    1. 识别并扩展缩写：
       - 大物→大学物理
       - 高数→高等数学
       - 毛概→毛泽东思想
       - 线代→线性代数
       - 马原→马克思主义
    2. 生成搜索词：返回1-3个最相关的关键词，用于在数据库中搜索目录。
    3. 只返回关键词，用空格分隔。`;
const PICK_PROMPT = `你是文件归档助手。根据用户要上传的文件，从搜索结果中选择最合适的目录。
    规则：
    1. 只返回目录编号（如 "3"）
    2. 如果有多个相关目录，选择最具体的那个（如有"试卷"子目录就选它）
    3. 如果都不合适，返回 "0"`;
export async function onRequestPost({ request, env }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const token = authHeader.substring(7);
        const user = await verifyToken(token, env.JWT_SECRET || 'secret');
        if (!isAdmin(user)) {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const { fileNames } = await request.json();
        if (!fileNames || !fileNames.length) {
            return new Response(JSON.stringify({ error: '文件名为空' }), { status: 400, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
        const validFileNames = fileNames.slice(0, 5).filter(n => typeof n === 'string' && n.trim().length > 0);
        const cerebrasKey = env.CEREBRAS_API_KEY;
        const AI = env.AI;
        const VECTORIZE = env.VECTORIZE;
        let keywords = validFileNames.join(' ');
        try {
            try {
                const keywordResponse = await fetchAIChatCompletion(
                    [{ role: 'system', content: KEYWORD_PROMPT }, { role: 'user', content: `文件名：${validFileNames.join(', ')}` }],
                    null,
                    env
                );
                let content = keywordResponse.choices?.[0]?.message?.content?.trim();
                if (content) {
                    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    keywords = content;
                }
            } catch (e) {
                console.error('LLM 关键词提取失败:', e);
            }
        } catch (e) {
            console.error('LLM 关键词提取失败:', e);
        }
        let directories = [];
        try {
            const embeddingResponse = await AI.run('@cf/baai/bge-m3', {
                text: [keywords.trim()]
            });
            const queryVector = embeddingResponse?.data?.[0];
            if (queryVector) {
                const vectorResults = await VECTORIZE.query(queryVector, {
                    topK: 20,
                    returnMetadata: 'all'
                });
                if (vectorResults && vectorResults.matches) {
                    const validMatches = vectorResults.matches
                        .filter(m => m.score >= 0.45);
                    const fileIds = validMatches.map(m => parseInt(m.id));
                    if (fileIds.length > 0) {
                        const placeholders = fileIds.map(() => '?').join(',');
                        const results = await env.DB.prepare(
                            `SELECT key FROM files WHERE id IN (${placeholders}) AND is_directory = TRUE LIMIT 20`
                        ).bind(...fileIds).all();
                        directories = (results.results || []).map(r => r.key);
                    }
                }
            }
        } catch (e) {
            console.error('向量搜索失败:', e);
        }
        if (directories.length === 0) {
            return new Response(JSON.stringify({ success: true, path: '', message: '未找到匹配的目录' }), {
                status: 200, headers: addCorsHeaders({ 'Content-Type': 'application/json' })
            });
        }
        const numberedList = directories.map((dir, i) => `${i + 1}. ${dir}`).join('\n');
        const pickData = await fetchAIChatCompletion(
            [{ role: 'system', content: PICK_PROMPT }, { role: 'user', content: `文件：${validFileNames.join(', ')}\n\n搜索到的目录：\n${numberedList}\n\n请返回最佳目录的编号：` }],
            null,
            env
        );
        let pickContent = pickData.choices?.[0]?.message?.content?.trim() || '';
        if (pickContent) {
            pickContent = pickContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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
async function fetchAIChatCompletion(messages, tools, env, toolChoice = 'auto', temperature = 0.1) {
    const callProvider = async (url, key, model, providerName) => {
        const body = {
            model: model,
            messages: messages,
            temperature: temperature
        };
        if (tools) {
            body.tools = tools;
            body.tool_choice = toolChoice;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${providerName} API Error: ${response.status} - ${errorText}`);
        }
        return await response.json();
    };
    if (env.CEREBRAS_API_KEY) {
        try {
            return await callProvider(CEREBRAS_API_URL, env.CEREBRAS_API_KEY, MODEL, 'Cerebras');
        } catch (error) {
            console.error('Cerebras API 失败:', error.message);
            if (!env.NVIDIA_API_KEY) throw error;
        }
    }
    if (env.NVIDIA_API_KEY) {
        try {
            return await callProvider(NVIDIA_API_URL, env.NVIDIA_API_KEY, NVIDIA_MODEL, 'NVIDIA');
        } catch (error) {
            if (!env.GROQ_API_KEY) throw error;
        }
    }
    if (env.GROQ_API_KEY) {
        try {
            return await callProvider(GROQ_API_URL, env.GROQ_API_KEY, GROQ_MODEL, 'Groq');
        } catch (error) {
            throw new Error(`所有 API 失败: ${error.message}`);
        }
    }
    throw new Error('未配置 API Key');
}
