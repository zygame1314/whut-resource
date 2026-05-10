import { signToken, verifyToken, addCorsHeaders } from '../utils.js';
function bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function base64urlToBuffer(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}
function decodeCBOR(buffer) {
    const data = new Uint8Array(buffer);
    let offset = 0;
    function read() {
        if (offset >= data.length) throw new Error('CBOR truncated');
        const initial = data[offset++];
        const majorType = initial >> 5;
        let info = initial & 0x1f;
        let value;
        if (info < 24) {
            value = info;
        } else if (info === 24) {
            value = data[offset++];
        } else if (info === 25) {
            value = (data[offset] << 8) | data[offset + 1];
            offset += 2;
        } else if (info === 26) {
            value = ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
            offset += 4;
        } else if (info === 27) {
            const hi = ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
            const lo = ((data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7]) >>> 0;
            value = hi * 0x100000000 + lo;
            offset += 8;
        } else {
            throw new Error('CBOR unsupported info: ' + info);
        }
        switch (majorType) {
            case 0: return value;
            case 1: return -1 - value;
            case 2: { const bytes = data.slice(offset, offset + value); offset += value; return bytes; }
            case 3: { const bytes = data.slice(offset, offset + value); offset += value; return new TextDecoder().decode(bytes); }
            case 4: { const arr = []; for (let i = 0; i < value; i++) arr.push(read()); return arr; }
            case 5: { const map = {}; for (let i = 0; i < value; i++) { const k = read(); map[k] = read(); } return map; }
            case 6: return read();
            case 7: {
                if (info === 20) return false;
                if (info === 21) return true;
                if (info === 22) return null;
                if (info === 23) return undefined;
                return value;
            }
        }
    }
    return read();
}
function derToRaw(derBuffer) {
    const bytes = new Uint8Array(derBuffer);
    let i = 0;
    if (bytes[i++] !== 0x30) throw new Error('Invalid DER: no SEQUENCE');
    i++;
    if (bytes[i++] !== 0x02) throw new Error('Invalid DER: no r INTEGER');
    let rLen = bytes[i++];
    let r = bytes.slice(i, i + rLen); i += rLen;
    if (bytes[i++] !== 0x02) throw new Error('Invalid DER: no s INTEGER');
    let sLen = bytes[i++];
    let s = bytes.slice(i, i + sLen);
    while (r.length > 1 && r[0] === 0) r = r.slice(1);
    while (s.length > 1 && s[0] === 0) s = s.slice(1);
    const raw = new Uint8Array(64);
    raw.set(r, 32 - r.length);
    raw.set(s, 64 - s.length);
    return raw.buffer;
}
function parseAuthData(buffer) {
    const data = new Uint8Array(buffer);
    let offset = 0;
    const rpIdHash = data.slice(0, 32); offset += 32;
    const flags = data[offset++];
    const signCount = ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
    offset += 4;
    let credentialId = null;
    let publicKeyObj = null;
    if (flags & 0x40) {
        offset += 16;
        const credIdLen = (data[offset] << 8) | data[offset + 1]; offset += 2;
        credentialId = data.slice(offset, offset + credIdLen); offset += credIdLen;
        publicKeyObj = decodeCBOR(data.slice(offset).buffer);
    }
    return { rpIdHash, flags, userPresent: !!(flags & 0x01), userVerified: !!(flags & 0x04), signCount, credentialId, publicKeyObj };
}
function generateChallenge() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bufferToBase64url(bytes.buffer);
}
export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { action } = body;
        if (!env.DB) {
            return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), { status: 500, headers: addCorsHeaders() });
        }
        const rpId = env.WEBAUTHN_RP_ID || 'resource.haoli.site';
        const rpName = env.WEBAUTHN_RP_NAME || 'WHUT Resource';
        const secret = env.JWT_SECRET || 'secret';
        const authRequired = ['register-options', 'register-verify', 'list', 'delete', 'rename'];
        let userId = null;
        if (authRequired.includes(action)) {
            const authHeader = request.headers.get('Authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return new Response(JSON.stringify({ success: false, error: '未授权' }), { status: 401, headers: addCorsHeaders() });
            }
            const payload = await verifyToken(authHeader.split(' ')[1], secret);
            if (!payload) {
                return new Response(JSON.stringify({ success: false, error: '令牌无效' }), { status: 401, headers: addCorsHeaders() });
            }
            userId = payload.id;
        }
        if (action === 'register-options') {
            const user = await env.DB.prepare('SELECT id, email, nickname FROM users WHERE id = ?').bind(userId).first();
            if (!user) return new Response(JSON.stringify({ success: false, error: '用户不存在' }), { status: 404, headers: addCorsHeaders() });
            const challenge = generateChallenge();
            const challengeToken = await signToken({ challenge, type: 'register', userId: user.id, exp: Date.now() + 300000 }, secret);
            return new Response(JSON.stringify({
                success: true,
                options: {
                    rp: { name: rpName, id: rpId },
                    user: { id: bufferToBase64url(new TextEncoder().encode(String(user.id)).buffer), name: user.email, displayName: user.nickname || user.email },
                    challenge,
                    pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
                    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
                    timeout: 60000,
                    attestation: 'none'
                },
                challengeToken
            }), { status: 200, headers: addCorsHeaders() });
        }
        if (action === 'register-verify') {
            const { challengeToken, credential, deviceName } = body;
            if (!challengeToken || !credential) return new Response(JSON.stringify({ success: false, error: '参数不完整' }), { status: 400, headers: addCorsHeaders() });
            const cPayload = await verifyToken(challengeToken, secret);
            if (!cPayload || cPayload.type !== 'register' || cPayload.userId !== userId || Date.now() > cPayload.exp) {
                return new Response(JSON.stringify({ success: false, error: '挑战已过期或无效' }), { status: 400, headers: addCorsHeaders() });
            }
            const clientData = JSON.parse(new TextDecoder().decode(new Uint8Array(base64urlToBuffer(credential.response.clientDataJSON))));
            if (clientData.type !== 'webauthn.create' || clientData.challenge !== cPayload.challenge) {
                return new Response(JSON.stringify({ success: false, error: '挑战验证失败' }), { status: 400, headers: addCorsHeaders() });
            }
            const attObj = decodeCBOR(base64urlToBuffer(credential.response.attestationObject));
            const authData = parseAuthData(attObj.authData);
            if (!authData.credentialId || !authData.publicKeyObj) {
                return new Response(JSON.stringify({ success: false, error: '无效的认证数据' }), { status: 400, headers: addCorsHeaders() });
            }
            const credIdB64 = bufferToBase64url(authData.credentialId.buffer);
            const x = new Uint8Array(authData.publicKeyObj[-2]);
            const y = new Uint8Array(authData.publicKeyObj[-3]);
            const pubKeyB64 = bufferToBase64url(x.buffer) + '.' + bufferToBase64url(y.buffer);
            try {
                await env.DB.prepare('INSERT INTO user_passkeys (user_id, credential_id, public_key, sign_count, device_name) VALUES (?, ?, ?, ?, ?)')
                    .bind(userId, credIdB64, pubKeyB64, authData.signCount, deviceName || 'Passkey').run();
            } catch (e) {
                if (e.message && e.message.includes('UNIQUE')) return new Response(JSON.stringify({ success: false, error: '该通行密钥已注册' }), { status: 400, headers: addCorsHeaders() });
                throw e;
            }
            return new Response(JSON.stringify({ success: true, message: '通行密钥设置成功' }), { status: 200, headers: addCorsHeaders() });
        }
        if (action === 'login-options') {
            const challenge = generateChallenge();
            const challengeToken = await signToken({ challenge, type: 'login', exp: Date.now() + 300000 }, secret);
            return new Response(JSON.stringify({
                success: true,
                options: { rpId, challenge, timeout: 60000, userVerification: 'preferred' },
                challengeToken
            }), { status: 200, headers: addCorsHeaders() });
        }
        if (action === 'login-verify') {
            const { challengeToken, credential } = body;
            if (!challengeToken || !credential) return new Response(JSON.stringify({ success: false, error: '参数不完整' }), { status: 400, headers: addCorsHeaders() });
            const cPayload = await verifyToken(challengeToken, secret);
            if (!cPayload || cPayload.type !== 'login' || Date.now() > cPayload.exp) {
                return new Response(JSON.stringify({ success: false, error: '挑战已过期或无效' }), { status: 400, headers: addCorsHeaders() });
            }
            const clientData = JSON.parse(new TextDecoder().decode(new Uint8Array(base64urlToBuffer(credential.response.clientDataJSON))));
            if (clientData.type !== 'webauthn.get' || clientData.challenge !== cPayload.challenge) {
                return new Response(JSON.stringify({ success: false, error: '挑战验证失败' }), { status: 400, headers: addCorsHeaders() });
            }
            const passkey = await env.DB.prepare(
                'SELECT p.*, u.id as uid, u.email, u.nickname, u.role, u.school_id, u.quota_limit, u.quota_used, u.last_download_date FROM user_passkeys p JOIN users u ON p.user_id = u.id WHERE p.credential_id = ?'
            ).bind(credential.id).first();
            if (!passkey) return new Response(JSON.stringify({ success: false, error: '未找到该通行密钥' }), { status: 404, headers: addCorsHeaders() });
            const authDataBytes = new Uint8Array(base64urlToBuffer(credential.response.authenticatorData));
            const authData = parseAuthData(credential.response.authenticatorData);
            const expectedRpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
            if (!authData.rpIdHash.every((v, i) => v === expectedRpIdHash[i])) {
                return new Response(JSON.stringify({ success: false, error: 'RP ID 不匹配' }), { status: 400, headers: addCorsHeaders() });
            }
            const [xB64, yB64] = passkey.public_key.split('.');
            const xBytes = new Uint8Array(base64urlToBuffer(xB64));
            const yBytes = new Uint8Array(base64urlToBuffer(yB64));
            const uncompressed = new Uint8Array(65);
            uncompressed[0] = 0x04;
            uncompressed.set(xBytes, 1);
            uncompressed.set(yBytes, 33);
            const cryptoKey = await crypto.subtle.importKey('raw', uncompressed.buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', base64urlToBuffer(credential.response.clientDataJSON)));
            const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
            signedData.set(authDataBytes, 0);
            signedData.set(clientDataHash, authDataBytes.length);
            const rawSig = derToRaw(base64urlToBuffer(credential.response.signature));
            const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, rawSig, signedData.buffer);
            if (!valid) return new Response(JSON.stringify({ success: false, error: '签名验证失败' }), { status: 400, headers: addCorsHeaders() });
            await env.DB.prepare('UPDATE user_passkeys SET sign_count = MAX(sign_count, ?), last_used_at = CURRENT_TIMESTAMP WHERE credential_id = ?')
                .bind(authData.signCount, credential.id).run();
            const authToken = await signToken({ id: passkey.uid, email: passkey.email, role: passkey.role, exp: Date.now() + 86400000 * 7 }, secret);
            const today = new Date().toISOString().split('T')[0];
            const quota_used = passkey.last_download_date !== today ? 0 : passkey.quota_used;
            return new Response(JSON.stringify({
                success: true, token: authToken,
                user: { email: passkey.email, nickname: passkey.nickname, role: passkey.role, school_id: passkey.school_id, quota_limit: passkey.quota_limit, quota_used, quota_remaining: passkey.quota_limit - quota_used }
            }), { status: 200, headers: addCorsHeaders() });
        }
        if (action === 'list') {
            const passkeys = await env.DB.prepare('SELECT id, device_name, sign_count, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
            return new Response(JSON.stringify({ success: true, passkeys: passkeys.results || [] }), { status: 200, headers: addCorsHeaders() });
        }
        if (action === 'delete') {
            const { passkeyId } = body;
            if (!passkeyId) return new Response(JSON.stringify({ success: false, error: '缺少 passkeyId' }), { status: 400, headers: addCorsHeaders() });
            const result = await env.DB.prepare('DELETE FROM user_passkeys WHERE id = ? AND user_id = ?').bind(passkeyId, userId).run();
            const deleted = result.success && (result.meta?.changes || 0) > 0;
            return new Response(JSON.stringify(deleted ? { success: true, message: '已删除' } : { success: false, error: '未找到' }), { status: deleted ? 200 : 404, headers: addCorsHeaders() });
        }
        if (action === 'rename') {
            const { passkeyId, newName } = body;
            if (!passkeyId) return new Response(JSON.stringify({ success: false, error: '缺少 passkeyId' }), { status: 400, headers: addCorsHeaders() });
            if (!newName || !newName.trim()) return new Response(JSON.stringify({ success: false, error: '名称不能为空' }), { status: 400, headers: addCorsHeaders() });
            if (newName.length > 50) return new Response(JSON.stringify({ success: false, error: '名称过长（最多50字符）' }), { status: 400, headers: addCorsHeaders() });
            const result = await env.DB.prepare('UPDATE user_passkeys SET device_name = ? WHERE id = ? AND user_id = ?').bind(newName.trim(), passkeyId, userId).run();
            const updated = result.success && (result.meta?.changes || 0) > 0;
            return new Response(JSON.stringify(updated ? { success: true, message: '已更新' } : { success: false, error: '未找到' }), { status: updated ? 200 : 404, headers: addCorsHeaders() });
        }
        return new Response(JSON.stringify({ success: false, error: '无效操作' }), { status: 400, headers: addCorsHeaders() });
    } catch (e) {
        console.error('[Passkey API] error:', e);
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: addCorsHeaders() });
    }
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: addCorsHeaders() });
}
