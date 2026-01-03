import { hashPassword, verifyPasswordHash, signToken, verifyToken, addCorsHeaders } from '../utils.js';
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, password } = body;
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), { status: 500, headers: addCorsHeaders() });
    }
    if (action === 'prepare-register') {
      const { cfToken, nickname } = body;
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
      const studentId = body.studentId;
      if (!studentId || !/^\d{6}$/.test(studentId)) {
        return new Response(JSON.stringify({ success: false, error: '请输入6位校园卡号。' }), { status: 400, headers: addCorsHeaders() });
      }
      const isSimpleId = (id) => {
        if (/^(\d)\1+$/.test(id)) return true;
        const seq = '01234567890123456789';
        const revSeq = '98765432109876543210';
        if (seq.includes(id) || revSeq.includes(id)) return true;
        if (/^(\d{2})\1\1$/.test(id)) return true;
        if (/^(\d{3})\1$/.test(id)) return true;
        if (/^(\d)\1(\d)\2(\d)\3$/.test(id)) return true;
        if (/^(\d)\1\1(\d)\2\2$/.test(id)) return true;
        return ['114514'].includes(id);
      };
      if (isSimpleId(studentId)) {
        return new Response(JSON.stringify({ success: false, error: '请不要使用简单卡号注册' }), { status: 400, headers: addCorsHeaders() });
      }
      const email = `${studentId}@whut.edu.cn`;
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '用户已存在。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ success: false, error: '密码至少需要6个字符。' }), { status: 400, headers: addCorsHeaders() });
      }
      const lastPending = await env.DB.prepare('SELECT created_at FROM pending_registrations WHERE student_id = ? ORDER BY created_at DESC LIMIT 1').bind(studentId).first();
      if (lastPending) {
        const lastTime = new Date(lastPending.created_at).getTime();
        const now = Date.now();
        if (now - lastTime < 60 * 1000) {
          return new Response(JSON.stringify({ success: false, error: '请求过于频繁，请 60 秒后再试。' }), { status: 429, headers: addCorsHeaders() });
        }
      }
      await env.DB.prepare('DELETE FROM pending_registrations WHERE expires_at < ?').bind(new Date().toISOString()).run();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM downloads WHERE downloaded_at < ?').bind(thirtyDaysAgo).run();
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let randomCode = '';
      for (let i = 0; i < 6; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const verifyCode = `Verify-${randomCode}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const passwordHash = await hashPassword(password, env.SALT);
      let sanitizedNickname = nickname ? nickname.trim() : studentId;
      if (sanitizedNickname.length > 20) {
        sanitizedNickname = sanitizedNickname.substring(0, 20);
      }
      if (sanitizedNickname.length === 0) {
        sanitizedNickname = studentId;
      }
      await env.DB.prepare('DELETE FROM pending_registrations WHERE student_id = ?').bind(studentId).run();
      await env.DB.prepare('INSERT INTO pending_registrations (student_id, password_hash, nickname, verify_code, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(studentId, passwordHash, sanitizedNickname, verifyCode, expiresAt)
        .run();
      const botEmail = env.BOT_EMAIL || 'email-bot@haoli.site';
      return new Response(JSON.stringify({
        success: true,
        verifyCode,
        botEmail,
        expiresIn: 30,
        message: '请使用你的学校邮箱发送验证码到指定地址。'
      }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'check-register-status') {
      const studentId = body.studentId;
      if (!studentId || !/^\d{6}$/.test(studentId)) {
        return new Response(JSON.stringify({ success: false, error: '无效的学号' }), { status: 400, headers: addCorsHeaders() });
      }
      const email = `${studentId}@whut.edu.cn`;
      const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (user) {
        return new Response(JSON.stringify({ success: true, activated: true, message: '账户已激活，请登录。' }), { status: 200, headers: addCorsHeaders() });
      }
      const pending = await env.DB.prepare('SELECT expires_at FROM pending_registrations WHERE student_id = ? AND expires_at > ?')
        .bind(studentId, new Date().toISOString()).first();
      if (pending) {
        return new Response(JSON.stringify({ success: true, activated: false, pending: true }), { status: 200, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, activated: false, pending: false, expired: true }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'prepare-reset') {
      const { cfToken, newPassword } = body;
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
      const emailRegex = /^[^\s@]+@whut\.edu\.cn$/;
      if (!email || !emailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: '请输入有效的学校邮箱地址。' }), { status: 400, headers: addCorsHeaders() });
      }
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: '该邮箱未注册。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ success: false, error: '新密码至少需要6个字符。' }), { status: 400, headers: addCorsHeaders() });
      }
      const lastPending = await env.DB.prepare('SELECT created_at FROM pending_resets WHERE email = ? ORDER BY created_at DESC LIMIT 1').bind(email).first();
      if (lastPending) {
        const lastTime = new Date(lastPending.created_at).getTime();
        const now = Date.now();
        if (now - lastTime < 60 * 1000) {
          return new Response(JSON.stringify({ success: false, error: '请求过于频繁，请 60 秒后再试。' }), { status: 429, headers: addCorsHeaders() });
        }
      }
      await env.DB.prepare('DELETE FROM pending_resets WHERE expires_at < ?').bind(new Date().toISOString()).run();
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let randomCode = '';
      for (let i = 0; i < 6; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const verifyCode = `Reset-${randomCode}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const newPasswordHash = await hashPassword(newPassword, env.SALT);
      await env.DB.prepare('DELETE FROM pending_resets WHERE email = ?').bind(email).run();
      await env.DB.prepare('INSERT INTO pending_resets (email, new_password_hash, verify_code, expires_at) VALUES (?, ?, ?, ?)')
        .bind(email, newPasswordHash, verifyCode, expiresAt)
        .run();
      const botEmail = env.BOT_EMAIL || 'email-bot@haoli.site';
      return new Response(JSON.stringify({
        success: true,
        verifyCode,
        botEmail,
        expiresIn: 30,
        message: '请使用你的学校邮箱发送验证码到指定地址。'
      }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'check-reset-status') {
      if (!email) {
        return new Response(JSON.stringify({ success: false, error: '需要邮箱地址' }), { status: 400, headers: addCorsHeaders() });
      }
      const pending = await env.DB.prepare('SELECT expires_at FROM pending_resets WHERE email = ? AND expires_at > ?')
        .bind(email, new Date().toISOString()).first();
      if (pending) {
        return new Response(JSON.stringify({ success: true, completed: false, pending: true }), { status: 200, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, completed: true, message: '密码重置完成或请求已过期。' }), { status: 200, headers: addCorsHeaders() });
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
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
          if (payload && payload.id !== user.id) {
            return new Response(JSON.stringify({ success: false, error: '操作被拒绝：无法修改其他用户的密码' }), { status: 403, headers: addCorsHeaders() });
          }
        } catch (e) {
        }
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
        return new Response(JSON.stringify({ success: false, error: '用户名或密码错误。' }), { status: 401, headers: addCorsHeaders() });
      }
      const isValid = await verifyPasswordHash(password, user.password_hash, env.SALT);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: '用户名或密码错误。' }), { status: 401, headers: addCorsHeaders() });
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
