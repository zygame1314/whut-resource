export default {
    async email(message, env, ctx) {
        const from = message.from;
        console.log(`[Email Worker] 收到邮件，发件人: ${from}`);
        const whutEmailRegex = /^([a-zA-Z0-9._-]+)@whut\.edu\.cn$/i;
        const match = from.match(whutEmailRegex);
        if (!match) {
            console.log(`[Email Worker] 发件人不是有效的 @whut.edu.cn 邮箱: ${from}`);
            return;
        }
        const emailPrefix = match[1];
        const senderEmail = `${emailPrefix}@whut.edu.cn`.toLowerCase();
        console.log(`[Email Worker] 有效的学校邮箱: ${senderEmail}`);
        const subject = message.headers.get('subject') || '';
        let body = '';
        try {
            const rawEmail = await new Response(message.raw).text();
            body = rawEmail;
        } catch (e) {
            console.log('[Email Worker] 无法读取邮件正文:', e);
        }
        const verifyCodeRegex = /Verify-([A-Za-z0-9]{6})/i;
        const resetCodeRegex = /Reset-([A-Za-z0-9]{6})/i;
        const changeCodeRegex = /Change-([A-Za-z0-9]{6})/i;
        let codeType = null;
        let codeValue = null;
        let codeMatch = subject.match(verifyCodeRegex);
        if (codeMatch) {
            codeType = 'verify';
            codeValue = codeMatch[1].toUpperCase();
        } else if ((codeMatch = subject.match(resetCodeRegex))) {
            codeType = 'reset';
            codeValue = codeMatch[1].toUpperCase();
        } else if ((codeMatch = subject.match(changeCodeRegex))) {
            codeType = 'change';
            codeValue = codeMatch[1].toUpperCase();
        }
        if (!codeType) {
            codeMatch = body.match(verifyCodeRegex);
            if (codeMatch) {
                codeType = 'verify';
                codeValue = codeMatch[1].toUpperCase();
            } else if ((codeMatch = body.match(resetCodeRegex))) {
                codeType = 'reset';
                codeValue = codeMatch[1].toUpperCase();
            } else if ((codeMatch = body.match(changeCodeRegex))) {
                codeType = 'change';
                codeValue = codeMatch[1].toUpperCase();
            }
        }
        if (!codeType || !codeValue) {
            console.log('[Email Worker] 未找到有效的验证码');
            return;
        }
        try {
            if (codeType === 'verify') {
                await this.handleRegistration(env, senderEmail, emailPrefix, codeValue);
            } else if (codeType === 'reset') {
                await this.handlePasswordReset(env, senderEmail, codeValue);
            } else if (codeType === 'change') {
                await this.handleEmailChange(env, senderEmail, codeValue);
            }
        } catch (e) {
            console.error('[Email Worker] 处理失败:', e);
        }
    },
    async handleRegistration(env, senderEmail, studentId, codeValue) {
        const fullCode = `Verify-${codeValue}`;
        const pending = await env.DB.prepare(
            'SELECT * FROM pending_registrations WHERE verify_code = ? AND student_id = ? AND expires_at > ?'
        ).bind(fullCode, studentId, new Date().toISOString()).first();
        if (!pending) {
            console.log(`[Email Worker] 未找到匹配的待激活注册，验证码: ${fullCode}, 前缀: ${studentId}`);
            return;
        }
        console.log(`[Email Worker] 找到待激活注册，ID: ${pending.id}`);
        const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(senderEmail).first();
        if (existingUser) {
            console.log(`[Email Worker] 用户已存在: ${senderEmail}`);
            await env.DB.prepare('DELETE FROM pending_registrations WHERE id = ?').bind(pending.id).run();
            return;
        }
        await env.DB.prepare(
            'INSERT INTO users (email, nickname, password_hash, role) VALUES (?, ?, ?, ?)'
        ).bind(senderEmail, pending.nickname || studentId, pending.password_hash, 'user').run();
        console.log(`[Email Worker] 用户创建成功: ${senderEmail}`);
        await env.DB.prepare('DELETE FROM pending_registrations WHERE id = ?').bind(pending.id).run();
        await env.DB.prepare('DELETE FROM pending_registrations WHERE expires_at < ?')
            .bind(new Date().toISOString()).run();
        console.log('[Email Worker] 注册激活完成');
    },
    async handlePasswordReset(env, senderEmail, codeValue) {
        const fullCode = `Reset-${codeValue}`;
        const pending = await env.DB.prepare(
            'SELECT * FROM pending_resets WHERE verify_code = ? AND email = ? AND expires_at > ?'
        ).bind(fullCode, senderEmail, new Date().toISOString()).first();
        if (!pending) {
            console.log(`[Email Worker] 未找到匹配的密码重置请求，验证码: ${fullCode}, 邮箱: ${senderEmail}`);
            return;
        }
        console.log(`[Email Worker] 找到待处理的密码重置请求，ID: ${pending.id}`);
        const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(senderEmail).first();
        if (!user) {
            console.log(`[Email Worker] 用户不存在: ${senderEmail}`);
            await env.DB.prepare('DELETE FROM pending_resets WHERE id = ?').bind(pending.id).run();
            return;
        }
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .bind(pending.new_password_hash, user.id)
            .run();
        console.log(`[Email Worker] 密码重置成功: ${senderEmail}`);
        await env.DB.prepare('DELETE FROM pending_resets WHERE id = ?').bind(pending.id).run();
        await env.DB.prepare('DELETE FROM pending_resets WHERE expires_at < ?')
            .bind(new Date().toISOString()).run();
        console.log('[Email Worker] 密码重置完成');
    },
    async handleEmailChange(env, senderEmail, codeValue) {
        const fullCode = `Change-${codeValue}`;
        const pending = await env.DB.prepare(
            'SELECT * FROM pending_email_changes WHERE verify_code = ? AND new_email = ? AND expires_at > ?'
        ).bind(fullCode, senderEmail, new Date().toISOString()).first();
        if (!pending) {
            console.log(`[Email Worker] 未找到匹配的换绑请求，验证码: ${fullCode}, 新邮箱: ${senderEmail}`);
            return;
        }
        const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(senderEmail).first();
        if (existingUser) {
            console.log(`[Email Worker] 该新邮箱已被占用: ${senderEmail}`);
            await env.DB.prepare('DELETE FROM pending_email_changes WHERE id = ?').bind(pending.id).run();
            return;
        }
        const updates = ['email = ?'];
        const binds = [senderEmail];
        const newPrefix = senderEmail.split('@')[0];
        if (/^\d{10,}$/.test(newPrefix)) {
            updates.push('student_id = ?');
            binds.push(newPrefix);
        }
        binds.push(pending.user_id);
        await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
        console.log(`[Email Worker] 邮箱换绑成功: 用户ID ${pending.user_id} -> ${senderEmail}`);
        await env.DB.prepare('DELETE FROM pending_email_changes WHERE id = ?').bind(pending.id).run();
        await env.DB.prepare('DELETE FROM pending_email_changes WHERE expires_at < ?')
            .bind(new Date().toISOString()).run();
    }
};