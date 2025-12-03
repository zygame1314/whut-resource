import { hashPassword, verifyPasswordHash, signToken, verifyToken, addCorsHeaders } from '../utils.js';
import { sendEmail } from '../smtp.js';
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, password } = body;
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), { status: 500, headers: addCorsHeaders() });
    }
    if (action === 'send-code') {
      const { cfToken } = body;
      if (env.TURNSTILE_SECRET_KEY) {
        if (!cfToken) {
          return new Response(JSON.stringify({ success: false, error: '请完成人机验证' }), { status: 400, headers: addCorsHeaders() });
        }
        const ip = request.headers.get('CF-Connecting-IP');
        const formData = new FormData();
        formData.append('secret', env.TURNSTILE_SECRET_KEY);
        formData.append('response', cfToken);
        formData.append('remoteip', ip);
        const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const result = await fetch(url, {
          body: formData,
          method: 'POST',
        });
        const outcome = await result.json();
        if (!outcome.success) {
          return new Response(JSON.stringify({ success: false, error: '人机验证失败，请刷新页面重试' }), { status: 403, headers: addCorsHeaders() });
        }
      }
      const studentIdEmailRegex = /^\d{6}@whut\.edu\.cn$/;
      if (!email || !studentIdEmailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: '为防止重复注册，请使用6位校园卡号邮箱（如 123456@whut.edu.cn）。' }), { status: 400, headers: addCorsHeaders() });
      }
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '用户已存在。' }), { status: 400, headers: addCorsHeaders() });
      }
      const lastCode = await env.DB.prepare('SELECT created_at FROM verification_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1').bind(email).first();
      if (lastCode) {
        const lastSentTime = new Date(lastCode.created_at).getTime();
        const now = Date.now();
        if (now - lastSentTime < 60 * 1000) {
          return new Response(JSON.stringify({ success: false, error: '请求过于频繁，请 60 秒后再试。' }), { status: 429, headers: addCorsHeaders() });
        }
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM verification_codes WHERE expires_at < ?').bind(new Date().toISOString()).run();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM downloads WHERE downloaded_at < ?').bind(thirtyDaysAgo).run();
      await env.DB.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)')
        .bind(email, code, expiresAt)
        .run();
      try {
        await sendEmail(
          env, 
          email, 
          '武理资源共享平台 - 注册验证码', 
          { code: code }
        );
      } catch (e) {
        console.error('邮件发送失败:', e);
        return new Response(JSON.stringify({ success: false, error: '验证码发送失败，请稍后重试。' }), { status: 500, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, message: '验证码已发送。' }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'register') {
      const studentIdEmailRegex = /^\d{6}@whut\.edu\.cn$/;
      if (!email || !studentIdEmailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: '为防止重复注册，请使用6位校园卡号邮箱（如 123456@whut.edu.cn）。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ success: false, error: '密码至少需要6个字符。' }), { status: 400, headers: addCorsHeaders() });
      }
      const { code, nickname } = body;
      if (!code) {
        return new Response(JSON.stringify({ success: false, error: '需要验证码。' }), { status: 400, headers: addCorsHeaders() });
      }
      const validCode = await env.DB.prepare('SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
        .bind(email, code, new Date().toISOString())
        .first();
      if (!validCode) {
        return new Response(JSON.stringify({ success: false, error: '验证码无效或已过期。' }), { status: 400, headers: addCorsHeaders() });
      }
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '用户已存在。' }), { status: 400, headers: addCorsHeaders() });
      }
      const passwordHash = await hashPassword(password, env.SALT);
      const role = 'user';
      await env.DB.prepare('INSERT INTO users (email, nickname, password_hash, role) VALUES (?, ?, ?, ?)')
        .bind(email, nickname || email.split('@')[0], passwordHash, role)
        .run();
      await env.DB.prepare('DELETE FROM verification_codes WHERE email = ?').bind(email).run();
      return new Response(JSON.stringify({ success: true, message: '注册成功。请登录。' }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'change-nickname') {
      const { newNickname } = body;
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
      }
      const token = authHeader.split(' ')[1];
      const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
      if (!payload) {
        return new Response(JSON.stringify({ success: false, error: '无效令牌' }), { status: 401, headers: addCorsHeaders() });
      }
      
      if (!newNickname || newNickname.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: '昵称不能为空。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (newNickname.length > 20) {
        return new Response(JSON.stringify({ success: false, error: '昵称过长（最多20字符）。' }), { status: 400, headers: addCorsHeaders() });
      }

      await env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?')
        .bind(newNickname, payload.id)
        .run();
      
      return new Response(JSON.stringify({ success: true, message: '昵称修改成功。' }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'change-password') {
      const { oldPassword, newPassword } = body;
      if (!oldPassword || !newPassword) {
        return new Response(JSON.stringify({ success: false, error: '需要旧密码和新密码。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ success: false, error: '新密码至少需要6个字符。' }), { status: 400, headers: addCorsHeaders() });
      }
      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '用户不存在。' }), { status: 404, headers: addCorsHeaders() });
      }
      const isValid = await verifyPasswordHash(oldPassword, user.password_hash, env.SALT);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: '旧密码错误。' }), { status: 401, headers: addCorsHeaders() });
      }
      const passwordHash = await hashPassword(newPassword, env.SALT);
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(passwordHash, user.id)
        .run();
      return new Response(JSON.stringify({ success: true, message: '密码修改成功。' }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'login') {
      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '凭据无效。' }), { status: 401, headers: addCorsHeaders() });
      }
      const isValid = await verifyPasswordHash(password, user.password_hash, env.SALT);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: '凭据无效。' }), { status: 401, headers: addCorsHeaders() });
      }
      const token = await signToken({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 * 7 }, env.JWT_SECRET || 'secret');
      const today = new Date().toISOString().split('T')[0];
      if (user.last_download_date !== today) {
        user.quota_used = 0;
      }
      const quota_remaining = user.quota_limit - user.quota_used;
      return new Response(JSON.stringify({ success: true, token, user: { email: user.email, nickname: user.nickname, role: user.role, quota_limit: user.quota_limit, quota_used: user.quota_used, quota_remaining } }), { status: 200, headers: addCorsHeaders() });
    }
    return new Response(JSON.stringify({ success: false, error: '无效操作' }), { status: 400, headers: addCorsHeaders() });
  } catch (e) {
    console.error("认证错误:", e);
    return new Response(JSON.stringify({ success: false, error: e.message, stack: e.stack }), { status: 500, headers: addCorsHeaders() });
  }
}
export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
  }
  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
  if (!payload) {
    return new Response(JSON.stringify({ success: false, error: '令牌无效' }), { status: 401, headers: addCorsHeaders() });
  }
  const user = await env.DB.prepare('SELECT id, email, nickname, role, quota_limit, quota_used, last_download_date FROM users WHERE id = ?').bind(payload.id).first();
  if (user) {
    const today = new Date().toISOString().split('T')[0];
    if (user.last_download_date !== today) {
      user.quota_used = 0;
    }
    user.quota_remaining = user.quota_limit - user.quota_used;
  }
  return new Response(JSON.stringify({ success: true, user }), { status: 200, headers: addCorsHeaders() });
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
