const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const MIN_BITS = 15;
const MAX_BITS = 24;

function bitsFromHashRate(hashRate) {
  if (!hashRate || hashRate <= 0) return MIN_BITS;
  const targetHashes = 2 * hashRate;
  const bits = Math.floor(Math.log2(targetHashes));
  return Math.max(Math.min(bits, MAX_BITS), MIN_BITS);
}

async function sha256Hex(data) {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkPowHash(hash, bits) {
  const fullHexChars = Math.floor(bits / 4);
  const remainingBits = bits % 4;
  for (let i = 0; i < fullHexChars; i++) {
    if (hash[i] !== '0') return false;
  }
  if (remainingBits > 0) {
    const val = parseInt(hash[fullHexChars], 16);
    if (val >> (4 - remainingBits) !== 0) return false;
  }
  return true;
}

function shouldCleanup() {
  return Math.random() < 0.02;
}

function validateBrowserProof(bp) {
  if (!bp) return 0;
  let score = 0;
  if (bp.wd) return 0;
  if (bp.wb) return 0;
  if (bp.cg && bp.cg > 1000) score += 30;
  if (bp.gl === 2) score += 20;
  else if (bp.gl === 1) score += 10;
  if (bp.mm) score += 20;
  if (bp.hr) score += 10;
  if (bp.mc && bp.mc > 2) score += 10;
  if (bp.ct && bp.ct > 0 && bp.ct < 5000) score += 10;
  return score;
}

async function lazyCleanup(db) {
  try {
    await db.prepare('DELETE FROM pow_challenges WHERE expires_at < ?').bind(new Date().toISOString()).run();
  } catch (_) {}
}

export async function verifyPowSolution(challenge, nonce, bits, env) {
  if (!challenge || nonce === undefined || nonce === null || !bits) {
    return { valid: false, error: '缺少 PoW 参数' };
  }
  bits = Number(bits);
  if (!Number.isInteger(bits) || bits < 1 || bits > 32) {
    return { valid: false, error: '难度参数无效' };
  }
  nonce = Number(nonce);
  if (!Number.isInteger(nonce) || nonce < 0) {
    return { valid: false, error: 'nonce 参数无效' };
  }
  const record = await env.DB.prepare('SELECT bits, issued_at, expires_at FROM pow_challenges WHERE challenge = ? AND expires_at > ?')
    .bind(challenge, new Date().toISOString()).first();
  if (!record) {
    return { valid: false, error: '挑战不存在或已过期' };
  }
  if (bits < record.bits) {
    return { valid: false, error: '难度低于服务端要求' };
  }
  const elapsedMs = Date.now() - new Date(record.issued_at).getTime();
  const minTimeMs = Math.pow(2, record.bits - 4) * 2;
  if (elapsedMs < minTimeMs) {
    await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
    return { valid: false, error: '验证过快，请重试' };
  }
  await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
  const hash = await sha256Hex(`${challenge}:${nonce}`);
  if (!checkPowHash(hash, bits)) {
    return { valid: false, error: 'PoW 验证失败' };
  }
  return { valid: true };
}

function addCors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }
    const body = await request.json().catch(() => ({}));
    const hashRate = Number(body.hashRate) || 0;
    const minBits = Number(body.minBits) || 0;
    const bp = body.bp || null;
    if (bp) {
      const score = validateBrowserProof(bp);
      if (score < 40) {
        return new Response(JSON.stringify({ success: false, error: '浏览器环境验证失败' }), {
          status: 403, headers: { 'Content-Type': 'application/json', ...addCors() }
        });
      }
    }
    const bits = Math.max(bitsFromHashRate(hashRate), minBits, MIN_BITS);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const nowISO = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRES_MS).toISOString();
    await env.DB.prepare(
      'INSERT INTO pow_challenges (challenge, bits, ip, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(challenge, bits, ip, nowISO, expiresAt).run();
    if (shouldCleanup()) lazyCleanup(env.DB);
    return new Response(JSON.stringify({
      success: true,
      challenge,
      bits,
      expiresIn: CHALLENGE_EXPIRES_MS / 1000
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...addCors() } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...addCors() }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCors() });
}