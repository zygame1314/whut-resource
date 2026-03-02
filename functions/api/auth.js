import { hashPassword, verifyPasswordHash, signToken, verifyToken, addCorsHeaders } from '../utils.js';
import { verifyWHUTCredentials } from './sso-utils.js';
async function recordLoginAttempt(db, identifier, type) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const existing = await db.prepare(
    'SELECT id, fail_count FROM login_attempts WHERE identifier = ? AND attempt_type = ?'
  ).bind(identifier, type).first();
  if (existing) {
    await db.prepare(
      'UPDATE login_attempts SET fail_count = fail_count + 1, last_attempt_at = ?, expires_at = ? WHERE id = ?'
    ).bind(now, expiresAt, existing.id).run();
  } else {
    await db.prepare(
      'INSERT INTO login_attempts (identifier, attempt_type, fail_count, last_attempt_at, expires_at) VALUES (?, ?, 1, ?, ?)'
    ).bind(identifier, type, now, expiresAt).run();
  }
}
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, password } = body;
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), { status: 500, headers: addCorsHeaders() });
    }
    if (action === 'prepare-register') {
      const { cfToken, nickname } = body;
      if (env.HCAPTCHA_SECRET_KEY) {
        if (!cfToken) {
          return new Response(JSON.stringify({ success: false, error: '请完成人机验证' }), { status: 400, headers: addCorsHeaders() });
        }
        const ip = request.headers.get('CF-Connecting-IP');
        const formData = new FormData();
        formData.append('secret', env.HCAPTCHA_SECRET_KEY);
        formData.append('response', cfToken);
        formData.append('remoteip', ip);
        const url = 'https://hcaptcha.com/siteverify';
        const result = await fetch(url, {
          body: formData,
          method: 'POST',
        });
        const outcome = await result.json();
        if (!outcome.success) {
          console.error('hCaptcha 验证失败:', outcome);
          return new Response(JSON.stringify({ success: false, error: '人机验证失败，请刷新页面重试' }), { status: 403, headers: addCorsHeaders() });
        }
      }
      const studentId = body.studentId;
      if (!studentId) {
        return new Response(JSON.stringify({ success: false, error: '请输入邮箱前缀。' }), { status: 400, headers: addCorsHeaders() });
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
      if (!studentId) {
        return new Response(JSON.stringify({ success: false, error: '无效的邮箱前缀' }), { status: 400, headers: addCorsHeaders() });
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
      if (env.HCAPTCHA_SECRET_KEY) {
        if (!cfToken) {
          return new Response(JSON.stringify({ success: false, error: '请完成人机验证' }), { status: 400, headers: addCorsHeaders() });
        }
        const ip = request.headers.get('CF-Connecting-IP');
        const formData = new FormData();
        formData.append('secret', env.HCAPTCHA_SECRET_KEY);
        formData.append('response', cfToken);
        formData.append('remoteip', ip);
        const url = 'https://hcaptcha.com/siteverify';
        const result = await fetch(url, {
          body: formData,
          method: 'POST',
        });
        const outcome = await result.json();
        if (!outcome.success) {
          console.error('hCaptcha 验证失败:', outcome);
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
    if (action === 'whut-login') {
      const { studentId, password } = body;
      if (!studentId || !password) {
        return new Response(JSON.stringify({ success: false, error: '学号和密码不能为空。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (studentId.length === 6) {
        return new Response(JSON.stringify({
          success: false,
          error: '6 位卡号用户请点击“注册/忘记密码”，通过邮箱发送验证码注册账号。',
          type: 'old-card'
        }), { status: 400, headers: addCorsHeaders() });
      }
      if (studentId.length !== 10) {
        return new Response(JSON.stringify({ success: false, error: '请输入正确的 10 位学号。' }), { status: 400, headers: addCorsHeaders() });
      }
      const email = `${studentId}@whut.edu.cn`;
      let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      let ssoResult;
      try {
        ssoResult = await verifyWHUTCredentials(studentId, password);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'SSO 服务连接出错: ' + e.message }), { status: 500, headers: addCorsHeaders() });
      }
      if (!ssoResult.success) {
        return new Response(JSON.stringify({ success: false, error: ssoResult.error || '智慧理工大登录失败，学号或密码错误。' }), { status: 401, headers: addCorsHeaders() });
      }
      try {
        if (!user) {
          const defaultPasswordHash = await hashPassword(Math.random().toString(36), env.SALT);
          await env.DB.prepare('INSERT INTO users (email, nickname, password_hash, role) VALUES (?, ?, ?, ?)')
            .bind(email, `学生_${studentId}`, defaultPasswordHash, 'user')
            .run();
          user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        }
        const token = await signToken({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 * 7 }, env.JWT_SECRET || 'secret');
        const today = new Date().toISOString().split('T')[0];
        if (user.last_download_date !== today) {
          user.quota_used = 0;
        }
        return new Response(JSON.stringify({
          success: true,
          token,
          user: {
            email: user.email,
            nickname: user.nickname,
            role: user.role,
            quota_limit: user.quota_limit,
            quota_used: user.quota_used,
            quota_remaining: user.quota_limit - user.quota_used
          }
        }), { status: 200, headers: addCorsHeaders() });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'SSO 登录集成维护中: ' + e.message }), { status: 500, headers: addCorsHeaders() });
      }
    }
    if (action === 'login') {
      const { cfToken } = body;
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const now = new Date().toISOString();
      await env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(now).run();
      const ipAttempt = await env.DB.prepare(
        'SELECT fail_count FROM login_attempts WHERE identifier = ? AND attempt_type = ? AND expires_at > ?'
      ).bind(ip, 'ip', now).first();
      const emailAttempt = await env.DB.prepare(
        'SELECT fail_count FROM login_attempts WHERE identifier = ? AND attempt_type = ? AND expires_at > ?'
      ).bind(email, 'email', now).first();
      const ipFailCount = ipAttempt?.fail_count || 0;
      const emailFailCount = emailAttempt?.fail_count || 0;
      const maxFailCount = Math.max(ipFailCount, emailFailCount);
      const requireCaptcha = maxFailCount >= 3;
      if (requireCaptcha) {
        if (!cfToken) {
          return new Response(JSON.stringify({
            success: false,
            error: '登录失败次数过多，请完成人机验证',
            requireCaptcha: true
          }), { status: 403, headers: addCorsHeaders() });
        }
        if (env.HCAPTCHA_SECRET_KEY) {
          const formData = new FormData();
          formData.append('secret', env.HCAPTCHA_SECRET_KEY);
          formData.append('response', cfToken);
          formData.append('remoteip', ip);
          const url = 'https://hcaptcha.com/siteverify';
          const result = await fetch(url, {
            body: formData,
            method: 'POST',
          });
          const outcome = await result.json();
          if (!outcome.success) {
            console.error('hCaptcha 验证失败:', outcome);
            return new Response(JSON.stringify({
              success: false,
              error: '人机验证失败，请刷新页面重试',
              requireCaptcha: true
            }), { status: 403, headers: addCorsHeaders() });
          }
        }
      }
      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!user) {
        await recordLoginAttempt(env.DB, ip, 'ip');
        await recordLoginAttempt(env.DB, email, 'email');
        const newMaxFail = Math.max(ipFailCount + 1, emailFailCount + 1);
        return new Response(JSON.stringify({
          success: false,
          error: '用户名或密码错误。',
          requireCaptcha: newMaxFail >= 3
        }), { status: 401, headers: addCorsHeaders() });
      }
      const isValid = await verifyPasswordHash(password, user.password_hash, env.SALT);
      if (!isValid) {
        await recordLoginAttempt(env.DB, ip, 'ip');
        await recordLoginAttempt(env.DB, email, 'email');
        const newMaxFail = Math.max(ipFailCount + 1, emailFailCount + 1);
        return new Response(JSON.stringify({
          success: false,
          error: '用户名或密码错误。',
          requireCaptcha: newMaxFail >= 3
        }), { status: 401, headers: addCorsHeaders() });
      }
      await env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ? AND attempt_type = ?').bind(ip, 'ip').run();
      await env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ? AND attempt_type = ?').bind(email, 'email').run();
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
