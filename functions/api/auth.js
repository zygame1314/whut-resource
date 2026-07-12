import { hashPassword, verifyPasswordHash, signToken, verifyToken, addCorsHeaders, isAdmin, fetchSiliconFlowChat, getUserFromRequest, checkRateLimit, getUserRateLimitKey } from '../utils.js';
import { verifyWHUTCredentials, refreshSsoCaptcha, verifySsoSmsCode } from './sso-utils.js';
import { verifyPowSolution } from './pow.js';
const NICKNAME_MODERATION_PROMPT = `你是严格的昵称审核助手。逐条检查以下规则，命中任意一条即 REJECT。

【必须拒绝的类型】
1. 辱骂/色情/暴恐/违法/政治敏感 -> REJECT:违规内容
2. 广告/推广/引流/营销/带货/代理/加群/关注 -> REJECT:含广告引流
3. 冒充官方/管理员/系统/客服/老师/学校/通知/公告 -> REJECT:冒充身份
4. 含QQ/微信/手机号/网址/链接/联系方式/加我/私聊 -> REJECT:含联系方式
5. 诱导点击/钓鱼/诈骗/中奖/免费领/兼职/刷单/贷款 -> REJECT:涉嫌欺诈诱导
6. 含特殊符号伪装官方标签如【】《》「」[ ]等+官方/通知/系统等词 -> REJECT:伪装官方标识
7. 攻击/侮辱/歧视/人身攻击/地域黑/性别歧视 -> REJECT:含攻击性内容
8. 含不雅/低俗/擦边/性暗示/谐音脏话 -> REJECT:含不雅内容
9. 名称过短无意义(如单个字母/数字)或纯乱码 -> REJECT:无效昵称
10. 模仿系统消息/弹窗提示/紧急通知等欺骗性内容 -> REJECT:伪装系统消息

【通过条件】
仅当昵称是正常、无害、无误导性的普通用户名时 -> PASS

【输出格式】只输出一行：
PASS
或
REJECT:原因（不超过15字）
严禁输出其他任何内容。`;
async function moderateNickname(nickname, env) {
  if (!env.SILICONFLOW_API_KEY) {
    console.warn('未配置 SILICONFLOW_API_KEY，跳过昵称审核');
    return { pass: true };
  }
  try {
    const data = await fetchSiliconFlowChat(env, {
      messages: [
        { role: 'system', content: NICKNAME_MODERATION_PROMPT },
        { role: 'user', content: nickname }
      ],
      temperature: 0.1,
      maxTokens: 30
    });
    let result = data.choices?.[0]?.message?.content?.trim() || '';
    result = result.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (result.startsWith('REJECT:')) {
      const reason = result.substring(7).trim();
      return { pass: false, reason: reason || '昵称不合规' };
    }
    return { pass: true };
  } catch (error) {
    console.error('昵称审核失败，放行:', error);
    return { pass: true };
  }
}
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
export async function onRequestPost({ request, env, waitUntil }) {
  const ctx = { waitUntil };
  try {
    const body = await request.json();
    const { action, email, password } = body;
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), { status: 500, headers: addCorsHeaders() });
    }
    if (action === 'prepare-register') {
      const { powChallenge, powNonce, powBits, nickname } = body;
      if (powChallenge && powNonce !== undefined && powBits) {
        const powResult = await verifyPowSolution(powChallenge, powNonce, powBits, env, ctx);
        if (!powResult.valid) {
          return new Response(JSON.stringify({ success: false, error: powResult.error || 'PoW 验证失败' }), { status: 403, headers: addCorsHeaders() });
        }
      } else {
        return new Response(JSON.stringify({ success: false, error: '请完成人机验证' }), { status: 400, headers: addCorsHeaders() });
      }
      const emailPrefix = body.emailPrefix || body.studentId;
      if (!emailPrefix) {
        return new Response(JSON.stringify({ success: false, error: '请输入邮箱前缀。' }), { status: 400, headers: addCorsHeaders() });
      }
      const email = `${emailPrefix}@whut.edu.cn`;
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '用户已存在。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ success: false, error: '密码至少需要6个字符。' }), { status: 400, headers: addCorsHeaders() });
      }
      const lastPending = await env.DB.prepare('SELECT created_at FROM pending_registrations WHERE email_prefix = ? ORDER BY created_at DESC LIMIT 1').bind(emailPrefix).first();
      if (lastPending) {
        const lastTime = new Date(lastPending.created_at).getTime();
        const now = Date.now();
        if (now - lastTime < 60 * 1000) {
          return new Response(JSON.stringify({ success: false, error: '请求过于频繁，请 60 秒后再试。' }), { status: 429, headers: addCorsHeaders() });
        }
      }
      const now = Date.now();
      const nowISO = new Date(now).toISOString();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      await Promise.all([
        env.DB.prepare('DELETE FROM pending_registrations WHERE expires_at < ?').bind(nowISO).run(),
        env.DB.prepare('DELETE FROM downloads WHERE downloaded_at < ?').bind(thirtyDaysAgo).run()
      ]);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let randomCode = '';
      for (let i = 0; i < 6; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const verifyCode = `Verify-${randomCode}`;
      const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
      const passwordHash = await hashPassword(password, env.SALT);
      let sanitizedNickname = nickname ? nickname.trim() : emailPrefix;
      if (sanitizedNickname.length > 20) {
        sanitizedNickname = sanitizedNickname.substring(0, 20);
      }
      if (sanitizedNickname.length === 0) {
        sanitizedNickname = emailPrefix;
      }
      if (nickname && nickname.trim()) {
        const nicknameModeration = await moderateNickname(sanitizedNickname, env);
        if (!nicknameModeration.pass) {
          return new Response(JSON.stringify({ success: false, error: `昵称未通过审核：${nicknameModeration.reason}` }), { status: 451, headers: addCorsHeaders() });
        }
      }
      await env.DB.prepare('DELETE FROM pending_registrations WHERE email_prefix = ?').bind(emailPrefix).run();
      await env.DB.prepare('INSERT INTO pending_registrations (email_prefix, password_hash, nickname, verify_code, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(emailPrefix, passwordHash, sanitizedNickname, verifyCode, expiresAt)
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
      const emailPrefix = body.emailPrefix || body.studentId;
      if (!emailPrefix) {
        return new Response(JSON.stringify({ success: false, error: '无效的邮箱前缀' }), { status: 400, headers: addCorsHeaders() });
      }
      const email = `${emailPrefix}@whut.edu.cn`;
      const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (user) {
        return new Response(JSON.stringify({ success: true, activated: true, message: '账户已激活，请登录。' }), { status: 200, headers: addCorsHeaders() });
      }
      const pending = await env.DB.prepare('SELECT expires_at, wrong_sender FROM pending_registrations WHERE email_prefix = ? AND expires_at > ?')
        .bind(emailPrefix, new Date().toISOString()).first();
      if (pending) {
        const result = { success: true, activated: false, pending: true };
        if (pending.wrong_sender) {
          result.wrongSender = pending.wrong_sender;
        }
        return new Response(JSON.stringify(result), { status: 200, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, activated: false, pending: false, expired: true }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'prepare-reset') {
      const { powChallenge, powNonce, powBits, newPassword } = body;
      if (powChallenge && powNonce !== undefined && powBits) {
        const powResult = await verifyPowSolution(powChallenge, powNonce, powBits, env, ctx);
        if (!powResult.valid) {
          return new Response(JSON.stringify({ success: false, error: powResult.error || 'PoW 验证失败' }), { status: 403, headers: addCorsHeaders() });
        }
      } else {
        return new Response(JSON.stringify({ success: false, error: '请完成人机验证' }), { status: 400, headers: addCorsHeaders() });
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
      const resetNow = Date.now();
      const expiresAt = new Date(resetNow + 30 * 60 * 1000).toISOString();
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
      const pending = await env.DB.prepare('SELECT expires_at, wrong_sender FROM pending_resets WHERE email = ? AND expires_at > ?')
        .bind(email, new Date().toISOString()).first();
      if (pending) {
        const result = { success: true, completed: false, pending: true };
        if (pending.wrong_sender) {
          result.wrongSender = pending.wrong_sender;
        }
        return new Response(JSON.stringify(result), { status: 200, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, completed: true, pending: false, message: '请求已处理或已过期。' }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'prepare-change-email') {
      const { newEmail, powChallenge, powNonce, powBits } = body;
      const user = await getUserFromRequest(request, env);
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
      }
      if (powChallenge && powNonce !== undefined && powBits) {
        const powResult = await verifyPowSolution(powChallenge, powNonce, powBits, env, ctx);
        if (!powResult.valid) {
          return new Response(JSON.stringify({ success: false, error: powResult.error || 'PoW 验证失败' }), { status: 403, headers: addCorsHeaders() });
        }
      } else {
        return new Response(JSON.stringify({ success: false, error: '请完成人机验证' }), { status: 400, headers: addCorsHeaders() });
      }
      const emailRegex = /^[^\s@]+@whut\.edu\.cn$/;
      if (!newEmail || !emailRegex.test(newEmail)) {
        return new Response(JSON.stringify({ success: false, error: '请输入有效的学校邮箱地址。' }), { status: 400, headers: addCorsHeaders() });
      }
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(newEmail).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '该邮箱已被占用。' }), { status: 400, headers: addCorsHeaders() });
      }
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let randomCode = '';
      for (let i = 0; i < 6; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const verifyCode = `Change-${randomCode}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM pending_email_changes WHERE user_id = ?').bind(user.id).run();
      await env.DB.prepare('INSERT INTO pending_email_changes (user_id, new_email, verify_code, expires_at) VALUES (?, ?, ?, ?)')
        .bind(user.id, newEmail, verifyCode, expiresAt)
        .run();
      const botEmail = env.BOT_EMAIL || 'email-bot@haoli.site';
      return new Response(JSON.stringify({
        success: true,
        verifyCode,
        botEmail,
        expiresAt,
        message: '请使用你的学校邮箱发送验证码到指定地址。'
      }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'check-email-change-status') {
      const user = await getUserFromRequest(request, env);
      if (!user) return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
      const pending = await env.DB.prepare('SELECT id, wrong_sender FROM pending_email_changes WHERE user_id = ? AND expires_at > ?')
        .bind(user.id, new Date().toISOString()).first();
      if (pending) {
        const result = { success: true, completed: false, pending: true };
        if (pending.wrong_sender) {
          result.wrongSender = pending.wrong_sender;
        }
        return new Response(JSON.stringify(result), { status: 200, headers: addCorsHeaders() });
      }
      return new Response(JSON.stringify({ success: true, completed: true, message: '邮箱换绑完成或请求已过期。' }), { status: 200, headers: addCorsHeaders() });
    }
    if (action === 'change-nickname') {
      const { newNickname } = body;
      const currentUser = await getUserFromRequest(request, env);
      if (!currentUser) {
        return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
      }
      if (!checkRateLimit(getUserRateLimitKey(currentUser, 'change-nickname'), 5)) {
        return new Response(JSON.stringify({ success: false, error: '修改昵称过于频繁，请稍后再试' }), { status: 429, headers: { ...addCorsHeaders(), 'Retry-After': '60' } });
      }
      if (!newNickname || newNickname.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: '昵称不能为空。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (newNickname.length > 20) {
        return new Response(JSON.stringify({ success: false, error: '昵称过长（最多20字符）。' }), { status: 400, headers: addCorsHeaders() });
      }
      if (!isAdmin(currentUser)) {
        const nicknameModeration = await moderateNickname(newNickname, env);
        if (!nicknameModeration.pass) {
          return new Response(JSON.stringify({ success: false, error: `昵称未通过审核：${nicknameModeration.reason}` }), { status: 451, headers: addCorsHeaders() });
        }
      }
      await env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?')
        .bind(newNickname, currentUser.id)
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
    if (action === 'sso-refresh-captcha') {
      const { ssoCookies } = body;
      if (!ssoCookies) {
        return new Response(JSON.stringify({ success: false, error: '缺少会话信息' }), { status: 400, headers: addCorsHeaders() });
      }
      const result = await refreshSsoCaptcha(ssoCookies);
      return new Response(JSON.stringify(result), { status: result.success ? 200 : 500, headers: addCorsHeaders() });
    }
    if (action === 'whut-login') {
      const { studentId: inputId, password, powChallenge, powNonce, powBits, ssoCode, ssoCookies, ssoSmsCode } = body;
      if (!inputId || !password) {
        return new Response(JSON.stringify({ success: false, error: '学号/卡号和密码不能为空。' }), { status: 400, headers: addCorsHeaders() });
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const now = new Date().toISOString();
      if (Math.random() < 0.02) env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(now).run().catch(() => { });
      const ipAttempt = await env.DB.prepare(
        'SELECT fail_count FROM login_attempts WHERE identifier = ? AND attempt_type = ? AND expires_at > ?'
      ).bind(ip, 'ip', now).first();
      const idAttempt = await env.DB.prepare(
        'SELECT fail_count FROM login_attempts WHERE identifier = ? AND attempt_type = ? AND expires_at > ?'
      ).bind(inputId, 'email', now).first();
      const ipFailCount = ipAttempt?.fail_count || 0;
      const idFailCount = idAttempt?.fail_count || 0;
      const maxFailCount = Math.max(ipFailCount, idFailCount);
      const requireCaptcha = maxFailCount >= 3;
      const requiredBits = requireCaptcha ? Math.min(15 + Math.floor((maxFailCount - 3) / 2), 22) : 0;
      const isSmsVerification = ssoSmsCode && ssoCookies;
      if (requireCaptcha && !isSmsVerification) {
        if (powChallenge && powNonce !== undefined && powBits) {
          if (powBits < requiredBits) {
            return new Response(JSON.stringify({
              success: false,
              error: `人机验证难度不足，需要 ${requiredBits} 位难度`,
              requireCaptcha: true,
              requiredBits
            }), { status: 403, headers: addCorsHeaders() });
          }
          const powResult = await verifyPowSolution(powChallenge, powNonce, powBits, env, ctx);
          if (!powResult.valid) {
            return new Response(JSON.stringify({
              success: false,
              error: powResult.error || 'PoW 验证失败',
              requireCaptcha: true
            }), { status: 403, headers: addCorsHeaders() });
          }
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: '登录失败次数过多，请完成人机验证',
            requireCaptcha: true,
            requiredBits
          }), { status: 403, headers: addCorsHeaders() });
        }
      }
      let ssoResult;
      let isNewSsoUser = false;
      let rawDefaultPassword = '';
      try {
        if (ssoSmsCode && ssoCookies) {
          ssoResult = await verifySsoSmsCode(ssoSmsCode, ssoCookies, body.ssoSmsHtml);
        } else {
          ssoResult = await verifyWHUTCredentials(inputId, password, ssoCode, ssoCookies);
        }
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'SSO 服务连接出错: ' + e.message }), { status: 500, headers: addCorsHeaders() });
      }
      if (!ssoResult.success || !ssoResult.sno) {
        if (ssoResult.smsRequired) {
          return new Response(JSON.stringify({
            success: false,
            smsRequired: true,
            ssoCookies: ssoResult.cookies,
            ssoSmsHtml: ssoResult.html,
            error: ssoResult.error || '请输入短信验证码'
          }), { status: 403, headers: addCorsHeaders() });
        }
        await Promise.all([
          recordLoginAttempt(env.DB, ip, 'ip'),
          recordLoginAttempt(env.DB, inputId, 'email')
        ]);
        const newMaxFail = Math.max(ipFailCount + 1, idFailCount + 1);
        return new Response(JSON.stringify({
          success: false,
          error: ssoResult.error || '无法同步学校资料，请确认为学号登录并稍后重试。',
          requireCaptcha: newMaxFail >= 3,
          ssoCaptchaRequired: ssoResult.captchaRequired,
          ssoCaptchaImage: ssoResult.captchaImage,
          ssoCookies: ssoResult.cookies,
          debugSnippet: ssoResult.debug?.bodySnippet
        }), { status: 403, headers: addCorsHeaders() });
      }
      try {
        const studentId = ssoResult.sno;
        const cardId = ssoResult.cardId;
        const ssoEmail = cardId ? `${cardId}@whut.edu.cn` : `${studentId}@whut.edu.cn`;
        let user = await env.DB.prepare('SELECT * FROM users WHERE school_id = ? OR email = ?')
          .bind(studentId, ssoEmail).first();
        if (user) {
          if (ssoResult.sno && user.school_id !== ssoResult.sno) {
            await env.DB.prepare('UPDATE users SET school_id = ? WHERE id = ?').bind(ssoResult.sno, user.id).run();
            user.school_id = ssoResult.sno;
          }
        }
        if (!user) {
          rawDefaultPassword = Math.random().toString(36).slice(2, 12);
          const defaultPasswordHash = await hashPassword(rawDefaultPassword, env.SALT);
          const finalNickname = ssoResult.nickname || `学生_${studentId}`;
          const collision = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(ssoEmail).first();
          if (collision) {
            return new Response(JSON.stringify({ success: false, error: '该邮箱已被注册，请尝试使用账号密码登录。' }), { status: 409, headers: addCorsHeaders() });
          }
          await env.DB.prepare('INSERT INTO users (email, nickname, password_hash, role, school_id) VALUES (?, ?, ?, ?, ?)')
            .bind(ssoEmail, finalNickname, defaultPasswordHash, 'user', studentId)
            .run();
          isNewSsoUser = true;
          user = await env.DB.prepare('SELECT * FROM users WHERE school_id = ?').bind(studentId).first();
        } else {
          const updates = [];
          const binds = [];
          if (cardId && user.email === `${studentId}@whut.edu.cn`) {
            const emailOccupied = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(ssoEmail, user.id).first();
            if (!emailOccupied) {
              updates.push('email = ?');
              binds.push(ssoEmail);
              user.email = ssoEmail;
            }
          }
          const isNumericNickname = user.nickname && /^\d+$/.test(user.nickname);
          if (ssoResult.nickname && (
            !user.nickname ||
            user.nickname === `学生_${studentId}` ||
            user.nickname === studentId ||
            user.nickname === cardId ||
            (isNumericNickname && user.nickname.length >= 6)
          )) {
            updates.push('nickname = ?');
            binds.push(ssoResult.nickname);
            user.nickname = ssoResult.nickname;
          }
          if (updates.length > 0) {
            binds.push(user.id);
            await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
          }
        }
        const token = await signToken({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 * 7 }, env.JWT_SECRET || 'secret');
        const today = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
        if (user.last_download_date !== today) {
          user.quota_used = 0;
        }
        await Promise.all([
          env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ? AND attempt_type = ?').bind(ip, 'ip').run(),
          env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ? AND attempt_type = ?').bind(studentId, 'email').run()
        ]);
        const responseData = {
          success: true,
          token,
          needsActivation: isNewSsoUser,
          user: {
            id: user.id,
            email: user.email,
            nickname: user.nickname,
            role: user.role,
            school_id: user.school_id,
            quota_limit: user.quota_limit,
            quota_used: user.quota_used,
            quota_remaining: user.quota_limit - user.quota_used
          }
        };
        if (isNewSsoUser) {
          responseData.initialPassword = rawDefaultPassword;
        }
        return new Response(JSON.stringify(responseData), { status: 200, headers: addCorsHeaders() });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'SSO 登录集成维护中: ' + e.message }), { status: 500, headers: addCorsHeaders() });
      }
    }
    if (action === 'login') {
      const { powChallenge, powNonce, powBits } = body;
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const now = new Date().toISOString();
      if (Math.random() < 0.02) env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(now).run().catch(() => { });
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
      const requiredBits = requireCaptcha ? Math.min(15 + Math.floor((maxFailCount - 3) / 2), 22) : 0;
      if (requireCaptcha) {
        if (powChallenge && powNonce !== undefined && powBits) {
          if (powBits < requiredBits) {
            return new Response(JSON.stringify({
              success: false,
              error: `人机验证难度不足，需要 ${requiredBits} 位难度`,
              requireCaptcha: true,
              requiredBits
            }), { status: 403, headers: addCorsHeaders() });
          }
          const powResult = await verifyPowSolution(powChallenge, powNonce, powBits, env, ctx);
          if (!powResult.valid) {
            return new Response(JSON.stringify({
              success: false,
              error: powResult.error || 'PoW 验证失败',
              requireCaptcha: true
            }), { status: 403, headers: addCorsHeaders() });
          }
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: '登录失败次数过多，请完成人机验证',
            requireCaptcha: true,
            requiredBits
          }), { status: 403, headers: addCorsHeaders() });
        }
      }
      let user = null;
      let finalEmail = email;
      const identifierStr = email ? email.split('@')[0] : '';
      if (/^\d+$/.test(identifierStr)) {
        user = await env.DB.prepare('SELECT * FROM users WHERE school_id = ?').bind(identifierStr).first();
      }
      if (!user) {
        user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(finalEmail).first();
      }
      if (!user) {
        await Promise.all([recordLoginAttempt(env.DB, ip, 'ip'), recordLoginAttempt(env.DB, email, 'email')]);
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
      await Promise.all([
        env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ? AND attempt_type = ?').bind(ip, 'ip').run(),
        env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ? AND attempt_type = ?').bind(email, 'email').run()
      ]);
      const token = await signToken({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 * 7 }, env.JWT_SECRET || 'secret');
      const today = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
      if (user.last_download_date !== today) {
        user.quota_used = 0;
      }
      const quota_remaining = user.quota_limit - user.quota_used;
      return new Response(JSON.stringify({ success: true, token, user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role, quota_limit: user.quota_limit, quota_used: user.quota_used, quota_remaining } }), { status: 200, headers: addCorsHeaders() });
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
    const today = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
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
