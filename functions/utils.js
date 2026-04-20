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
    })
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
}
export async function rerankResults(env, query, documents, topN = 20) {
  if (!env.SILICONFLOW_API_KEY) {
    console.warn('未配置 SILICONFLOW_API_KEY，跳过重排');
    return null;
  }
  if (!documents || documents.length === 0) return [];
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
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Reranker API Error: ${response.status} - ${errorText}`);
      return null;
    }
    const result = await response.json();
    return result.results || null;
  } catch (error) {
    console.error('重排请求失败:', error);
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
  const response = await fetch(SILICONFLOW_CHAT_URL, {
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
