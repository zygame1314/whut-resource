import { verifyToken } from '../utils.js';
const addCorsHeaders = (headers = {}) => {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
};
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: addCorsHeaders(),
    });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: '方法不允许' }), {
      status: 405,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
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
    return new Response(JSON.stringify({ success: false, error: '你的账号已被封禁，无法访问文件。' }), {
      status: 403,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const R2_BUCKET = env.R2_bucket;
  if (!R2_BUCKET) {
    console.error("服务器配置错误：未找到 R2 绑定 'R2_bucket'。");
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error.' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const isOfficePreview = url.searchParams.get('office') === 'true';
  const isInline = url.searchParams.get('inline') === 'true';
  const previewType = url.searchParams.get('type');
  if (!key) {
    return new Response(JSON.stringify({
      success: false,
      error: '需要文件key。'
    }), {
      status: 400,
      headers: addCorsHeaders({
        'Content-Type': 'application/json'
      }),
    });
  }
  try {
    const object = await R2_BUCKET.get(key);
    if (object === null) {
      return new Response(JSON.stringify({ success: false, error: '文件未找到。' }), {
        status: 404,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    if (previewType === 'text') {
      const userInfo = await env.DB.prepare('SELECT id, quota_limit, quota_used, last_download_date FROM users WHERE id = ?').bind(user.id).first();
      if (!userInfo) {
        return new Response(JSON.stringify({ success: false, error: '用户未找到。' }), { status: 401, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
      }
      const recentDuplicate = await env.DB.prepare(
        `SELECT id FROM downloads
           WHERE user_id = ? AND file_key = ?
             AND downloaded_at > DATETIME('now', '-30 seconds')`
      ).bind(user.id, key).first();
      const shouldCountThisDownload = !recentDuplicate;
      let quotaUpdated = false;
      if (shouldCountThisDownload) {
        const today = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
        if (userInfo.last_download_date !== today) {
          await env.DB.prepare('UPDATE users SET quota_used = 1, last_download_date = ? WHERE id = ?').bind(today, user.id).run();
          quotaUpdated = true;
        } else {
          const result = await env.DB.prepare('UPDATE users SET quota_used = quota_used + 1 WHERE id = ? AND quota_used < quota_limit').bind(user.id).run();
          if (result.success && result.meta.changes > 0) {
            quotaUpdated = true;
          }
        }
        if (!quotaUpdated) {
          return new Response(JSON.stringify({ success: false, error: '今日下载次数已达上限。' }), { status: 403, headers: addCorsHeaders({ 'Content-Type': 'application/json' }) });
        }
      }
      context.waitUntil((async () => {
        try {
          if (shouldCountThisDownload) {
            await env.DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE key = ?').bind(key).run();
          }
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          await env.DB.prepare('INSERT INTO downloads (user_id, file_key, ip_address, size) VALUES (?, ?, ?, ?)')
            .bind(user.id, key, ip, object.size)
            .run();
        } catch (e) {
          console.error("更新统计信息时出错:", e);
        }
      })());
      const textContent = await object.text();
      const updatedQuota = shouldCountThisDownload ? await env.DB.prepare('SELECT quota_used, quota_limit FROM users WHERE id = ?').bind(user.id).first() : null;
      return new Response(JSON.stringify({
        success: true,
        content: textContent,
        quota_deducted: shouldCountThisDownload && quotaUpdated,
        quota_used: updatedQuota ? updatedQuota.quota_used : userInfo.quota_used,
        quota_remaining: updatedQuota ? updatedQuota.quota_limit - updatedQuota.quota_used : userInfo.quota_limit - userInfo.quota_used
      }), {
        status: 200,
        headers: addCorsHeaders({
          'Content-Type': 'application/json'
        }),
      });
    }
    const expiresIn = url.searchParams.get('expiresIn') ? parseInt(url.searchParams.get('expiresIn')) : 300;
    const expires = Date.now() + expiresIn * 1000;
    const tokenPayload = `${key}:${expires}:${user.id}`;
    const secret = env.PREVIEW_SECRET || 'default-secret';
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureData = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(tokenPayload));
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureData))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const customDomain = env.CDN_DOMAIN;
    const baseUrl = customDomain ? `https://${customDomain}` : new URL(request.url).origin;
    let previewUrl;
    if (isOfficePreview) {
      previewUrl = `${baseUrl}/api/download/o/${signature}/${expires}/${user.id}/${encodeURIComponent(key)}`;
    } else {
      previewUrl = `${baseUrl}/api/download/${encodeURIComponent(key)}?token=${signature}&expires=${expires}&user=${user.id}`;
      if (isInline) {
        previewUrl += '&inline=true';
      }
    }
    return new Response(JSON.stringify({ success: true, url: previewUrl }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error(`为键 "${key}" 生成预览URL时出错:`, error);
    return new Response(JSON.stringify({ success: false, error: '生成预览URL失败。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}