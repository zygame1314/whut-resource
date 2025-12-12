import { verifyToken } from '../utils.js';
const addCorsHeaders = (headers = {}) => {
  const allowedOrigin = '*';
  return {
    ...headers,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
};
async function generateToken(key, secret, userId, expiration = 86400) {
  const expires = Date.now() + expiration * 1000;
  const tokenPayload = `${key}:${expires}:${userId}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureData = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(tokenPayload));
  const token = btoa(String.fromCharCode(...new Uint8Array(signatureData))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { token, expires };
}
export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
  }
  const authHeader = request.headers.get('Authorization');
  let user = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    user = await verifyToken(token, env.JWT_SECRET || 'secret');
  }
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: '未授权' }), {
      status: 401,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const userInfo = await env.DB.prepare('SELECT is_banned FROM users WHERE id = ?').bind(user.id).first();
  if (userInfo && userInfo.is_banned) {
    return new Response(JSON.stringify({ success: false, error: '你的账号已被封禁，无法下载文件。' }), {
      status: 403,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const R2_BUCKET = env.R2_bucket;
  if (!R2_BUCKET) {
    return new Response(JSON.stringify({ success: false, error: '服务器配置错误（R2绑定）。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const { keys } = payload;
  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return new Response(JSON.stringify({ success: false, error: '缺少或无效的keys数组。' }), {
      status: 400,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const DB = env.DB;
  if (!DB) {
    return new Response(JSON.stringify({ success: false, error: '服务器配置错误（D1绑定）。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  for (const key of keys) {
    if (key.endsWith('/')) {
      return new Response(JSON.stringify({ success: false, error: '不支持下载文件夹，请选择具体文件进行下载。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
  }
  const allFileKeysToProcess = new Set(keys);
  if (allFileKeysToProcess.size === 0 && keys.length > 0) {
    return new Response(JSON.stringify({ success: false, error: '选择的项目中没有可下载的文件。' }), {
      status: 404,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  try {
    const secret = env.PREVIEW_SECRET || 'default-secret';
    const signedUrls = [];
    for (const fileKey of allFileKeysToProcess) {
      const { token, expires } = await generateToken(fileKey, secret, user.id);
      const urlPath = `/api/download/${encodeURIComponent(fileKey)}?token=${token}&expires=${expires}&user=${user.id}`;
      signedUrls.push({
        key: fileKey,
        filename: fileKey.split('/').pop(),
        urlPath: urlPath
      });
    }
    if (signedUrls.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '没有有效的文件可供下载。' }), {
        status: 404,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    return new Response(JSON.stringify({ success: true, files: signedUrls }), {
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('生成签名URL时出错:', error);
    return new Response(JSON.stringify({ success: false, error: '生成下载链接失败。请稍后重试或联系管理员。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
  }
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: addCorsHeaders({ 'Content-Type': 'application/json', 'Allow': 'POST, OPTIONS' }),
  });
}