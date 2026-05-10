function decodeRFC2047(str) {
    if (!str) return str;
    return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, encoded) => {
        try {
            let bytes;
            if (encoding === 'B' || encoding === 'b') {
                const raw = atob(encoded);
                bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            } else if (encoding === 'Q' || encoding === 'q') {
                const expanded = encoded.replace(/_/g, ' ');
                const arr = [];
                for (let i = 0; i < expanded.length; i++) {
                    if (expanded[i] === '=' && i + 2 < expanded.length) {
                        arr.push(parseInt(expanded.slice(i + 1, i + 3), 16));
                        i += 2;
                    } else {
                        arr.push(expanded.charCodeAt(i));
                    }
                }
                bytes = new Uint8Array(arr);
            } else {
                return _;
            }
            const normalized = charset.toLowerCase().replace(/^x-/,'').replace(/^gb2312$/,'gbk');
            return new TextDecoder(normalized).decode(bytes);
        } catch (_) {
            return _;
        }
    });
}
function decodeQuotedPrintable(str) {
    return str
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function findBoundary(rawEmail) {
    const m = rawEmail.match(/boundary=["']?([^"'\s;]+)["']?/i);
    return m ? m[1] : null;
}
function splitParts(rawEmail, boundary) {
    const sep = '--' + boundary;
    const parts = [];
    let current = '';
    let inPart = false;
    const lines = rawEmail.split(/\r?\n/);
    for (const line of lines) {
        if (line === sep || line === sep + '--') {
            if (inPart && current) parts.push(current);
            current = '';
            inPart = true;
        } else if (inPart) {
            current += line + '\n';
        }
    }
    if (inPart && current) parts.push(current);
    return parts;
}
function decodePartBody(part) {
    const headerEnd = part.indexOf('\n\n');
    if (headerEnd === -1) return '';
    const headers = part.slice(0, headerEnd);
    let body = part.slice(headerEnd + 2).trim();
    if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
        try { body = atob(body.replace(/\s/g, '')); } catch (_) {}
    } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) {
        body = decodeQuotedPrintable(body);
    }
    return body;
}
function extractPlainText(rawEmail) {
    try {
        const boundary = findBoundary(rawEmail);
        if (!boundary) {
            const bodyMatch = rawEmail.match(/\r?\n\r?\n([\s\S]*)/);
            if (!bodyMatch) return '';
            let text = bodyMatch[1].trim();
            if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(rawEmail)) {
                text = decodeQuotedPrintable(text);
            }
            return text;
        }
        const parts = splitParts(rawEmail, boundary);
        for (const part of parts) {
            if (/Content-Type:\s*text\/plain/i.test(part)) {
                return decodePartBody(part);
            }
        }
        for (const part of parts) {
            if (/Content-Type:\s*text\/html/i.test(part)) {
                const html = decodePartBody(part);
                return html
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
                    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
                    .replace(/&#(\d+);/gi, (_, n) => String.fromCharCode(+n))
                    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
                    .replace(/\s+/g, ' ').trim();
            }
        }
        for (const part of parts) {
            if (/Content-Type:\s*multipart\//i.test(part)) {
                const innerBoundary = findBoundary(part);
                if (innerBoundary) {
                    const innerParts = splitParts(part, innerBoundary);
                    for (const ip of innerParts) {
                        if (/Content-Type:\s*text\/plain/i.test(ip)) return decodePartBody(ip);
                    }
                    for (const ip of innerParts) {
                        if (/Content-Type:\s*text\/html/i.test(ip)) {
                            return decodePartBody(ip).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.log('[Email Worker] extractPlainText 出错:', e);
    }
    return '';
}
function extractHeaders(rawEmail) {
    const m = rawEmail.match(/^([\s\S]*?)\r?\n\r?\n/);
    return m ? m[1] : '';
}
export default {
    async email(message, env, ctx) {
        try {
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
            const rawSubject = message.headers.get('subject') || '';
            const subject = decodeRFC2047(rawSubject);
            let rawEmail = '';
            let plainBody = '';
            let rawHeaders = '';
            try {
                rawEmail = await new Response(message.raw).text();
                plainBody = extractPlainText(rawEmail);
                rawHeaders = extractHeaders(rawEmail);
            } catch (e) {
                console.log('[Email Worker] 无法读取邮件内容:', e);
            }
            console.log(`[Email Worker] 原始主题: "${rawSubject}"`);
            console.log(`[Email Worker] 解码主题: "${subject}"`);
            console.log(`[Email Worker] 纯文本正文(${plainBody.length}): "${plainBody.slice(0, 200)}"`);
            const verifyCodeRegex = /Verify-([A-Za-z0-9]{6})/i;
            const resetCodeRegex = /Reset-([A-Za-z0-9]{6})/i;
            const changeCodeRegex = /Change-([A-Za-z0-9]{6})/i;
            let codeType = null;
            let codeValue = null;
            const searchTargets = [
                { name: 'subject', value: subject },
                { name: 'plainBody', value: plainBody },
                { name: 'rawHeaders', value: rawHeaders },
                { name: 'rawEmail', value: rawEmail }
            ];
            for (const { name, value: target } of searchTargets) {
                if (!target) continue;
                let codeMatch = target.match(verifyCodeRegex);
                if (codeMatch) { codeType = 'verify'; codeValue = codeMatch[1].toUpperCase(); console.log(`[Email Worker] 从 ${name} 匹配到 verify: ${codeValue}`); break; }
                codeMatch = target.match(resetCodeRegex);
                if (codeMatch) { codeType = 'reset'; codeValue = codeMatch[1].toUpperCase(); console.log(`[Email Worker] 从 ${name} 匹配到 reset: ${codeValue}`); break; }
                codeMatch = target.match(changeCodeRegex);
                if (codeMatch) { codeType = 'change'; codeValue = codeMatch[1].toUpperCase(); console.log(`[Email Worker] 从 ${name} 匹配到 change: ${codeValue}`); break; }
            }
            if (!codeType) {
                const bareTargets = [subject, plainBody];
                const candidates = new Set();
                for (const target of bareTargets) {
                    if (!target) continue;
                    const re = /\b([A-Za-z0-9]{6})\b/g;
                    let m;
                    while ((m = re.exec(target)) !== null) {
                        candidates.add(m[1].toUpperCase());
                    }
                }
                console.log(`[Email Worker] 裸验证码候选: ${[...candidates].join(', ') || '(无)'}`);
                const now = new Date().toISOString();
                for (const code of candidates) {
                    if (codeType) break;
                    const pending = await env.DB.prepare(
                        'SELECT id FROM pending_registrations WHERE verify_code = ? AND email_prefix = ? AND expires_at > ?'
                    ).bind(`Verify-${code}`, emailPrefix, now).first();
                    if (pending) { codeType = 'verify'; codeValue = code; break; }
                    const resetPending = await env.DB.prepare(
                        'SELECT id FROM pending_resets WHERE verify_code = ? AND email = ? AND expires_at > ?'
                    ).bind(`Reset-${code}`, senderEmail, now).first();
                    if (resetPending) { codeType = 'reset'; codeValue = code; break; }
                    const changePending = await env.DB.prepare(
                        'SELECT id FROM pending_email_changes WHERE verify_code = ? AND new_email = ? AND expires_at > ?'
                    ).bind(`Change-${code}`, senderEmail, now).first();
                    if (changePending) { codeType = 'change'; codeValue = code; break; }
                }
            }
            if (!codeType || !codeValue) {
                console.log('[Email Worker] 未找到有效的验证码');
                return;
            }
            console.log(`[Email Worker] 最终匹配: 类型=${codeType}, 验证码=${codeValue}`);
            if (codeType === 'verify') {
                await this.handleRegistration(env, senderEmail, emailPrefix, codeValue);
            } else if (codeType === 'reset') {
                await this.handlePasswordReset(env, senderEmail, codeValue);
            } else if (codeType === 'change') {
                await this.handleEmailChange(env, senderEmail, codeValue);
            }
            ctx.waitUntil(Promise.all([
                env.DB.prepare('DELETE FROM pending_registrations WHERE expires_at < ?').bind(new Date().toISOString()).run().catch(() => {}),
                env.DB.prepare('DELETE FROM pending_resets WHERE expires_at < ?').bind(new Date().toISOString()).run().catch(() => {}),
                env.DB.prepare('DELETE FROM pending_email_changes WHERE expires_at < ?').bind(new Date().toISOString()).run().catch(() => {})
            ]));
        } catch (e) {
            console.error('[Email Worker] 顶层未捕获异常:', e);
        }
    },
    async handleRegistration(env, senderEmail, emailPrefix, codeValue) {
        const fullCode = `Verify-${codeValue}`;
        const now = new Date().toISOString();
        const pending = await env.DB.prepare(
            'SELECT * FROM pending_registrations WHERE verify_code = ? AND email_prefix = ? AND expires_at > ?'
        ).bind(fullCode, emailPrefix, now).first();
        if (!pending) {
            console.log(`[Email Worker] 未找到匹配的待激活注册，验证码: ${fullCode}, 前缀: ${emailPrefix}`);
            return;
        }
        console.log(`[Email Worker] 找到待激活注册，ID: ${pending.id}`);
        const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(senderEmail).first();
        if (existingUser) {
            console.log(`[Email Worker] 用户已存在: ${senderEmail}`);
            await env.DB.prepare('DELETE FROM pending_registrations WHERE id = ?').bind(pending.id).run();
            return;
        }
        try {
            await env.DB.prepare(
                'INSERT INTO users (email, nickname, password_hash, role) VALUES (?, ?, ?, ?)'
            ).bind(senderEmail, pending.nickname || emailPrefix, pending.password_hash, 'user').run();
            console.log(`[Email Worker] 用户创建成功: ${senderEmail}`);
        } catch (e) {
            if (e.message && e.message.includes('UNIQUE')) {
                console.log(`[Email Worker] 用户已存在(并发): ${senderEmail}`);
            } else {
                throw e;
            }
        }
        await env.DB.prepare('DELETE FROM pending_registrations WHERE id = ?').bind(pending.id).run();
        console.log('[Email Worker] 注册激活完成');
    },
    async handlePasswordReset(env, senderEmail, codeValue) {
        const fullCode = `Reset-${codeValue}`;
        const now = new Date().toISOString();
        const pending = await env.DB.prepare(
            'SELECT * FROM pending_resets WHERE verify_code = ? AND email = ? AND expires_at > ?'
        ).bind(fullCode, senderEmail, now).first();
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
            .bind(pending.new_password_hash, user.id).run();
        console.log(`[Email Worker] 密码重置成功: ${senderEmail}`);
        await env.DB.prepare('DELETE FROM pending_resets WHERE id = ?').bind(pending.id).run();
        console.log('[Email Worker] 密码重置完成');
    },
    async handleEmailChange(env, senderEmail, codeValue) {
        const fullCode = `Change-${codeValue}`;
        const now = new Date().toISOString();
        const pending = await env.DB.prepare(
            'SELECT * FROM pending_email_changes WHERE verify_code = ? AND new_email = ? AND expires_at > ?'
        ).bind(fullCode, senderEmail, now).first();
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
            updates.push('school_id = ?');
            binds.push(newPrefix);
        }
        binds.push(pending.user_id);
        await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
        console.log(`[Email Worker] 邮箱换绑成功: 用户ID ${pending.user_id} -> ${senderEmail}`);
        await env.DB.prepare('DELETE FROM pending_email_changes WHERE id = ?').bind(pending.id).run();
    }
};
