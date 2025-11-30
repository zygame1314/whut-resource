import { hashPassword, verifyPasswordHash, signToken, verifyToken, addCorsHeaders } from '../utils.js';
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, password } = body;
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), { status: 500, headers: addCorsHeaders() });
    }
    if (action === 'send-code') {
      const studentIdEmailRegex = /^\d+@whut\.edu\.cn$/;
      if (!email || !studentIdEmailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: '为防止重复注册，请使用工号邮箱（如 123456@whut.edu.cn）。' }), { status: 400, headers: addCorsHeaders() });
      }

      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '用户已存在。' }), { status: 400, headers: addCorsHeaders() });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM verification_codes WHERE expires_at < ?').bind(new Date().toISOString()).run();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM downloads WHERE downloaded_at < ?').bind(thirtyDaysAgo).run();
      await env.DB.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)')
        .bind(email, code, expiresAt)
        .run();

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: '武理资源共享平台 <noreply@mails.zygame1314.site>',
          to: email,
          subject: '武理资源共享平台 - 注册验证码',
          html: `<p>您的验证码是: <strong>${code}</strong></p><p>该验证码10分钟内有效。</p>`
        })
      });

      if (!resendRes.ok) {
        const errorText = await resendRes.text();
        console.error('Resend 错误:', errorText);
        return new Response(JSON.stringify({ success: false, error: '发送验证码邮件失败。' }), { status: 500, headers: addCorsHeaders() });
      }

      return new Response(JSON.stringify({ success: true, message: '验证码已发送。' }), { status: 200, headers: addCorsHeaders() });
    }

    if (action === 'register') {
      const studentIdEmailRegex = /^\d+@whut\.edu\.cn$/;
      if (!email || !studentIdEmailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: '为防止重复注册，请使用工号邮箱（如 123456@whut.edu.cn）。' }), { status: 400, headers: addCorsHeaders() });
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
  const user = await env.DB.prepare('SELECT email, nickname, role, quota_limit, quota_used, last_download_date FROM users WHERE id = ?').bind(payload.id).first();
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
