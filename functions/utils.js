export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (salt || "default-salt"));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyPasswordHash(password, hash, salt) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}
export async function signToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
export async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!isValid) return null;
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
export function addCorsHeaders(headers = {}) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma',
    'Access-Control-Max-Age': '86400',
  };
}
export function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'super_admin');
}
export function isSuperAdmin(user) {
  return user && user.role === 'super_admin';
}
const EMBEDDING_MODEL = 'Qwen/Qwen3-Embedding-0.6B';
const EMBEDDING_DIMENSIONS = 256;
const SILICONFLOW_EMBEDDING_URL = 'https://api.siliconflow.cn/v1/embeddings';
const RERANKER_MODEL = 'BAAI/bge-reranker-v2-m3';
const SILICONFLOW_RERANK_URL = 'https://api.siliconflow.cn/v1/rerank';
export async function generateEmbeddings(env, texts) {
  if (!texts || texts.length === 0) return [];
  const apiKey = env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error('未配置 SILICONFLOW_API_KEY');
  return await retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(SILICONFLOW_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          encoding_format: 'float',
          dimensions: EMBEDDING_DIMENSIONS
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SiliconFlow Embedding API Error: ${response.status} - ${errorText}`);
      }
      const result = await response.json();
      if (!result?.data || result.data.length !== texts.length) {
        throw new Error('嵌入生成失败或数量不匹配');
      }
      return result.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);
    } finally {
      clearTimeout(timeoutId);
    }
  }, 3, 1000);
}
export async function rerankResults(env, query, documents, topN = 20) {
  if (!env.SILICONFLOW_API_KEY) {
    console.warn('未配置 SILICONFLOW_API_KEY，跳过重排');
    return null;
  }
  if (!documents || documents.length === 0) return [];
  try {
    return await retryWithBackoff(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(SILICONFLOW_RERANK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`
          },
          body: JSON.stringify({
            model: RERANKER_MODEL,
            query: query,
            documents: documents,
            top_n: topN,
            return_documents: false
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Reranker API Error: ${response.status} - ${errorText}`);
        }
        const result = await response.json();
        return result.results || null;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 2, 1000);
  } catch (error) {
    console.error('重排请求失败（已重试）:', error);
    return null;
  }
}
const SILICONFLOW_CHAT_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_CHAT_MODEL = 'Qwen/Qwen3-8B';
export async function fetchSiliconFlowChat(env, { messages, tools = null, toolChoice = 'auto', temperature = 0.1, model = DEFAULT_CHAT_MODEL, maxTokens = null, enableThinking = false }) {
  if (!env.SILICONFLOW_API_KEY) {
    throw new Error('未配置 SILICONFLOW_API_KEY');
  }
  const body = {
    model: model,
    messages: messages,
    temperature: temperature,
    stream: false,
    enable_thinking: enableThinking
  };
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }
  return await retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(SILICONFLOW_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SiliconFlow API Error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      return validateAIResponse(data, '[SiliconFlow] ');
    } finally {
      clearTimeout(timeoutId);
    }
  }, 3, 1000);
}
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`操作失败，${Math.round(delay)}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export function validateAIResponse(data, context = '') {
  if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error(`${context}AI 返回数据结构异常: ${JSON.stringify(data).substring(0, 200)}`);
  }
  const choice = data.choices[0];
  if (choice.finish_reason === 'length') {
    throw new Error(`${context}AI 输出被截断 (finish_reason=length)，可能内容不完整`);
  }
  const message = choice.message;
  if (!message) {
    throw new Error(`${context}AI 未返回有效消息`);
  }
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasContent = message.content && message.content.trim().length > 0;
  if (!hasToolCalls && !hasContent) {
    throw new Error(`${context}AI 返回内容为空`);
  }
  if (hasToolCalls) {
    for (let i = 0; i < message.tool_calls.length; i++) {
      const tc = message.tool_calls[i];
      if (!tc.function || !tc.function.name) {
        throw new Error(`${context}AI tool_call[${i}] 缺少函数名`);
      }
      if (tc.function.arguments) {
        try {
          JSON.parse(tc.function.arguments);
        } catch (e) {
          throw new Error(`${context}AI tool_call[${i}] arguments JSON 解析失败: ${tc.function.arguments.substring(0, 100)}`);
        }
      }
    }
  }
  return data;
}
export async function recordVectorSyncFailure(env, operation, fileId, fileData, errorMessage) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO vector_sync_failures (operation, file_id, file_data, error_message) VALUES (?, ?, ?, ?)'
    ).bind(
      operation,
      fileId || null,
      fileData ? JSON.stringify(fileData) : null,
      errorMessage || ''
    ).run();
  } catch (dbError) {
    console.error('记录向量同步失败信息出错:', dbError);
  }
}
