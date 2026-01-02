import { verifyToken, addCorsHeaders } from '../../utils.js';
export async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
  }
  const url = new URL(request.url);
  let key;
  let isSignedUrl = false;
  let signature, expires;
  if (Array.isArray(path) && path.length >= 5 && path[0] === 'o') {
    const potentialExpires = parseInt(path[2]);
    if (!isNaN(potentialExpires) && potentialExpires > 1577836800000) {
      signature = path[1];
      expires = potentialExpires;
      const userIdParam = path[3];
      url.searchParams.set('user', userIdParam);
      const keySegments = path.slice(4);
      key = decodeURIComponent(keySegments.join('/'));
      isSignedUrl = true;
    }
  }
  if (!isSignedUrl && Array.isArray(path) && path.length >= 3) {
    const potentialExpires = parseInt(path[1]);
    if (!isNaN(potentialExpires) && potentialExpires > 1577836800000) {
      signature = path[0];
      expires = potentialExpires;
      const keySegments = path.slice(2);
      key = decodeURIComponent(keySegments.join('/'));
      isSignedUrl = true;
    }
  }
  if (!isSignedUrl) {
    const queryToken = url.searchParams.get('token');
    const queryExpires = url.searchParams.get('expires');
    if (queryToken && queryExpires) {
      signature = queryToken;
      expires = parseInt(queryExpires);
      if (Array.isArray(path)) {
        key = decodeURIComponent(path.join('/'));
      } else {
        key = decodeURIComponent(path);
      }
      isSignedUrl = true;
    }
  }
  if (isSignedUrl) {
    const secret = env.PREVIEW_SECRET || 'default-secret';
    const userId = url.searchParams.get('user');
    let tokenPayload;
    if (userId) {
      tokenPayload = `${key}:${expires}:${userId}`;
    } else {
      tokenPayload = `${key}:${expires}`;
    }
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureData = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(tokenPayload));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureData)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    if (signature !== expectedSignature) {
      return new Response(JSON.stringify({ success: false, error: '签名无效。' }), { status: 403, headers: addCorsHeaders() });
    }
    if (Date.now() > expires) {
      return new Response(JSON.stringify({ success: false, error: '链接已过期。' }), { status: 410, headers: addCorsHeaders() });
    }
    if (userId) {
      const user = await env.DB.prepare('SELECT id, role, is_banned, quota_limit, quota_used, last_download_date FROM users WHERE id = ?').bind(userId).first();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '用户未找到。' }), { status: 401, headers: addCorsHeaders() });
      }
      if (user.is_banned) {
        return new Response(JSON.stringify({ success: false, error: '你的账号已被封禁，无法下载文件。' }), { status: 403, headers: addCorsHeaders() });
      }
      const today = new Date().toISOString().split('T')[0];
      const recentDuplicate = await env.DB.prepare(
        `SELECT id FROM downloads
           WHERE user_id = ? AND file_key = ?
             AND downloaded_at > DATETIME('now', '-30 seconds')`
      ).bind(user.id, key).first();
      const shouldCountThisDownload = !recentDuplicate;
      if (shouldCountThisDownload && user.role !== 'admin') {
        let quotaUpdated = false;
        if (user.last_download_date !== today) {
          await env.DB.prepare('UPDATE users SET quota_used = 1, last_download_date = ? WHERE id = ?').bind(today, user.id).run();
          quotaUpdated = true;
        } else {
          const result = await env.DB.prepare('UPDATE users SET quota_used = quota_used + 1 WHERE id = ? AND quota_used < quota_limit').bind(user.id).run();
          if (result.success && result.meta.changes > 0) {
            quotaUpdated = true;
          }
        }
        if (!quotaUpdated) {
          return new Response(JSON.stringify({ success: false, error: '今日下载次数已达上限。' }), { status: 403, headers: addCorsHeaders() });
        }
      }
      const fileInfo = await env.DB.prepare('SELECT size FROM files WHERE key = ?').bind(key).first();
      const fileSize = fileInfo ? fileInfo.size : 0;
      context.waitUntil((async () => {
        try {
          if (shouldCountThisDownload) {
            await env.DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE key = ?').bind(key).run();
          }
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          await env.DB.prepare('INSERT INTO downloads (user_id, file_key, ip_address, size) VALUES (?, ?, ?, ?)')
            .bind(user.id, key, ip, fileSize)
            .run();
        } catch (e) {
          console.error("更新统计信息时出错:", e);
        }
      })());
    }
  } else {
    let token = null;
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = url.searchParams.get('token');
    }
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: '未授权：缺少令牌。' }), { status: 401, headers: addCorsHeaders() });
    }
    const userPayload = await verifyToken(token, env.JWT_SECRET || 'secret');
    if (!userPayload) {
      return new Response(JSON.stringify({ success: false, error: '未授权：令牌无效。' }), { status: 401, headers: addCorsHeaders() });
    }
    const user = await env.DB.prepare('SELECT id, role, is_banned, quota_limit, quota_used, last_download_date FROM users WHERE id = ?').bind(userPayload.id).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: '用户未找到。' }), { status: 401, headers: addCorsHeaders() });
    }
    if (user.is_banned) {
      return new Response(JSON.stringify({ success: false, error: '你的账号已被封禁，无法下载文件。' }), { status: 403, headers: addCorsHeaders() });
    }
    const today = new Date().toISOString().split('T')[0];
    if (Array.isArray(path)) {
      key = decodeURIComponent(path.join('/'));
    } else {
      key = decodeURIComponent(path);
    }
    if (!key) {
      return new Response(JSON.stringify({ success: false, error: '文件路径无效' }), { status: 400, headers: addCorsHeaders() });
    }
    const fileInfo = await env.DB.prepare('SELECT size FROM files WHERE key = ?').bind(key).first();
    if (!fileInfo) {
      return new Response(JSON.stringify({ success: false, error: '索引中未找到文件。' }), { status: 404, headers: addCorsHeaders() });
    }
    if (user.role !== 'admin') {
      let quotaUpdated = false;
      if (user.last_download_date !== today) {
        await env.DB.prepare('UPDATE users SET quota_used = 1, last_download_date = ? WHERE id = ?').bind(today, user.id).run();
        quotaUpdated = true;
      } else {
        const result = await env.DB.prepare('UPDATE users SET quota_used = quota_used + 1 WHERE id = ? AND quota_used < quota_limit').bind(user.id).run();
        if (result.success && result.meta.changes > 0) {
          quotaUpdated = true;
        }
      }
      if (!quotaUpdated) {
        return new Response(JSON.stringify({ success: false, error: '今日下载次数已达上限。' }), { status: 403, headers: addCorsHeaders() });
      }
    }
    context.waitUntil((async () => {
      try {
        await env.DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE key = ?').bind(key).run();
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        await env.DB.prepare('INSERT INTO downloads (user_id, file_key, ip_address, size) VALUES (?, ?, ?, ?)')
          .bind(user.id, key, ip, fileInfo.size)
          .run();
      } catch (e) {
        console.error("更新统计信息时出错:", e);
      }
    })());
  }
  try {
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), {
      method: 'GET',
      headers: new Headers({
        'Accept': request.headers.get('Accept') || '*/*',
      }),
    });
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const responseHeaders = new Headers(cachedResponse.headers);
      const corsHeaders = addCorsHeaders();
      for (const [k, v] of Object.entries(corsHeaders)) {
        responseHeaders.set(k, v);
      }
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers: responseHeaders,
      });
    }
    const object = await env.R2_bucket.get(key);
    if (object === null) {
      return new Response(JSON.stringify({ success: false, error: '存储中未找到文件。' }), {
        status: 404,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    const isInline = url.searchParams.get('inline') === 'true';
    const filename = key.split('/').pop();
    if (isInline) {
      headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    } else {
      headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }
    let cacheMaxAge = 300;
    if (expires) {
      const remainingMs = expires - Date.now();
      if (remainingMs > 0) {
        cacheMaxAge = Math.min(Math.floor(remainingMs / 1000), 3600);
      }
    }
    headers.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    const corsHeaders = addCorsHeaders();
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    const response = new Response(object.body, {
      headers,
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error(`提供文件 "${key}" 时出错:`, error);
    return new Response(JSON.stringify({ success: false, error: '内部服务器错误' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
