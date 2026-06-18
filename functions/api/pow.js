const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const MIN_BITS = 18;
const MAX_BITS = 24;
const TARGET_WORK_SECONDS = 5;
const ASSUMED_ATTACKER_HPS = 1_000_000;
const HIGH_RISK_MIN_BITS = 20;

function bitsFromHashRate(hashRate) {
  if (!hashRate || hashRate <= 0) return MIN_BITS;
  const targetHashes = TARGET_WORK_SECONDS * hashRate;
  const bits = Math.floor(Math.log2(targetHashes));
  return Math.max(Math.min(bits, MAX_BITS), MIN_BITS);
}

async function sha256Hex(data) {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key, message) {
  const keyData = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function bpHashHex(bp, env) {
  const stable = JSON.stringify(bp);
  const key = env && env.POW_HMAC_KEY;
  if (key) {
    return (await hmacSha256Hex(key, stable)).slice(0, 16);
  }
  return (await sha256Hex(stable)).slice(0, 16);
}

let _schemaEnsured = false;
async function ensurePowSchema(env) {
  if (_schemaEnsured) return;
  try {
    await env.DB.prepare('SELECT bp_hash FROM pow_challenges LIMIT 1').run();
    _schemaEnsured = true;
  } catch (e) {
    try {
      await env.DB.prepare('ALTER TABLE pow_challenges ADD COLUMN bp_hash TEXT').run();
      _schemaEnsured = true;
    } catch (alterError) {
      console.error('pow schema migrate failed:', alterError && alterError.message ? alterError.message : alterError);
    }
  }
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

const BP_TS_WINDOW_MS = 10 * 60 * 1000;
const BP_PASS_SCORE = 60;

function validateBrowserProof(bp, now) {
  if (!bp) return { score: 0, reasons: ['无验证数据'] };
  const reasons = [];
  let score = 0;

  if (bp.wd) return { score: 0, reasons: ['webdriver'] };
  if (bp.wb) return { score: 0, reasons: ['headless'] };

  const ts = Number(bp.ts);
  if (Number.isFinite(ts) && ts > 0) {
    if (Math.abs((now || Date.now()) - ts) > BP_TS_WINDOW_MS) {
      reasons.push('proof 时效异常');
    } else {
      score += 10;
    }
  }

  if (bp.cg && bp.cg > 1000 && bp.cg < 500000) score += 25;
  else reasons.push('canvas 异常');

  if (bp.gl === 2) score += 20;
  else if (bp.gl === 1) score += 10;
  else reasons.push('webgl 异常');

  if (bp.mm) score += 15;
  else reasons.push('无鼠标移动');

  const mc = Number(bp.mc);
  if (Number.isFinite(mc) && mc > 2 && mc <= 20) {
    if (!bp.mm) {
      reasons.push('鼠标数据矛盾');
    } else {
      score += 10;
    }
  }

  const ct = Number(bp.ct);
  if (Number.isFinite(ct) && ct > 0 && ct < 5000) score += 10;

  if (bp.hr) {
    const w = Number(bp.hrw);
    const h = Number(bp.hrh);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w < 10000 && h < 10000) {
      score += 10;
    } else {
      reasons.push('窗口尺寸异常');
    }
  } else {
    reasons.push('窗口异常');
  }

  const np = Number(bp.np);
  if (Number.isFinite(np)) {
    if (np > 0 && np <= 10) score += 5;
  }

  return { score, reasons };
}

async function lazyCleanup(db) {
  try {
    await db.prepare('DELETE FROM pow_challenges WHERE expires_at < ?').bind(new Date().toISOString()).run();
  } catch (e) {
    console.error('pow cleanup failed:', e && e.message ? e.message : e);
  }
}

function maybeCleanup(db, ctx) {
  if (!shouldCleanup()) return null;
  const p = lazyCleanup(db);
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(p);
    return null;
  }
  return p;
}

export async function verifyPowSolution(challenge, nonce, bits, env, ctx) {
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
  const record = await env.DB.prepare('SELECT bits, issued_at, expires_at, attempts, bp_hash FROM pow_challenges WHERE challenge = ? AND expires_at > ?')
    .bind(challenge, new Date().toISOString()).first();
  if (!record) {
    maybeCleanup(env.DB, ctx);
    return { valid: false, error: '挑战不存在或已过期' };
  }
  const maxAttempts = 5;
  if ((record.attempts || 0) >= maxAttempts) {
    await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
    maybeCleanup(env.DB, ctx);
    return { valid: false, error: '尝试次数过多，请重新获取挑战' };
  }
  if (bits < record.bits) {
    return { valid: false, error: '难度低于服务端要求' };
  }
  const elapsedMs = Date.now() - new Date(record.issued_at).getTime();
  const minTimeMs = (Math.pow(2, record.bits) / ASSUMED_ATTACKER_HPS) * 1000;
  if (elapsedMs < minTimeMs) {
    await env.DB.prepare('UPDATE pow_challenges SET attempts = COALESCE(attempts, 0) + 1 WHERE challenge = ?').bind(challenge).run();
    maybeCleanup(env.DB, ctx);
    return { valid: false, error: '验证过快，请重试' };
  }
  await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
  const bpHash = record.bp_hash || '';
  const hash = await sha256Hex(`${challenge}:${nonce}:${bpHash}`);
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

export async function onRequestPost({ request, env, waitUntil }) {
  const ctx = { waitUntil };
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '数据库未配置' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }
    const body = await request.json().catch(() => ({}));
    const hashRate = Number(body.hashRate) || 0;
    const minBits = Number(body.minBits) || 0;
    const action = body.action || '';
    const bp = body.bp || null;
    let bpHash = '';
    if (bp) {
      const { score, reasons } = validateBrowserProof(bp, Date.now());
      if (score < BP_PASS_SCORE) {
        return new Response(JSON.stringify({ success: false, error: '浏览器环境验证失败', reasons }), {
          status: 403, headers: { 'Content-Type': 'application/json', ...addCors() }
        });
      }
      bpHash = await bpHashHex(bp, env);
    }
    await ensurePowSchema(env);
    const highRisk = ['prepare-register', 'prepare-reset', 'prepare-change-email'].includes(action);
    const floor = highRisk ? HIGH_RISK_MIN_BITS : MIN_BITS;
    const bits = Math.max(bitsFromHashRate(hashRate), minBits, floor);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const nowISO = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRES_MS).toISOString();
    await env.DB.prepare(
      'INSERT INTO pow_challenges (challenge, bits, ip, bp_hash, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(challenge, bits, ip, bpHash, nowISO, expiresAt).run();
    maybeCleanup(env.DB, ctx);
    return new Response(JSON.stringify({
      success: true,
      challenge,
      bits,
      bpHash,
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