const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const MIN_BITS = 16;
const MAX_BITS = 24;
const TARGET_WORK_SECONDS = 5;
const ASSUMED_ATTACKER_HPS = 1_000_000;
const HIGH_RISK_MIN_BITS = 18;
const MIN_VERIFY_MS = 1500;
const IP_RATE_WINDOW_MS = 5 * 60 * 1000;
const IP_RATE_BASE_COUNT = 3;
const IP_RATE_BITS_STEP = 1;

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
  } catch (e) {
    try {
      await env.DB.prepare('ALTER TABLE pow_challenges ADD COLUMN bp_hash TEXT').run();
    } catch (alterError) {
      console.error('pow schema migrate failed:', alterError && alterError.message ? alterError.message : alterError);
    }
  }
  try {
    await env.DB.prepare('SELECT colo FROM pow_challenges LIMIT 1').run();
  } catch (e) {
    try {
      await env.DB.prepare('ALTER TABLE pow_challenges ADD COLUMN colo TEXT').run();
    } catch (alterError) {
      console.error('pow schema migrate (colo) failed:', alterError && alterError.message ? alterError.message : alterError);
    }
  }
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pow_challenges_ip_issued ON pow_challenges(ip, issued_at)').run();
  } catch (e) {
  }
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pow_challenges_colo_issued ON pow_challenges(colo, issued_at)').run();
  } catch (e) {
  }
  _schemaEnsured = true;
}

async function ipPenaltyBits(env, ip) {
  if (!ip || ip === 'unknown') return 0;
  try {
    const since = new Date(Date.now() - IP_RATE_WINDOW_MS).toISOString();
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM pow_challenges WHERE ip = ? AND issued_at > ?'
    ).bind(ip, since).first();
    const count = (row && row.cnt) || 0;
    if (count <= IP_RATE_BASE_COUNT) return 0;
    return Math.min((count - IP_RATE_BASE_COUNT) * IP_RATE_BITS_STEP, MAX_BITS - MIN_BITS);
  } catch (e) {
    return 0;
  }
}

const COLO_PROXY_DISTINCT_IPS = 15;
const COLO_PROXY_TOTAL_COUNT = 20;
const COLO_PROXY_PENALTY_BITS = 3;

async function coloPenaltyBits(env, colo) {
  if (!colo) return 0;
  try {
    const since = new Date(Date.now() - IP_RATE_WINDOW_MS).toISOString();
    const row = await env.DB.prepare(
      'SELECT COUNT(DISTINCT ip) AS distinctIps, COUNT(*) AS cnt FROM pow_challenges WHERE colo = ? AND issued_at > ?'
    ).bind(colo, since).first();
    const distinctIps = (row && row.distinctIps) || 0;
    const cnt = (row && row.cnt) || 0;
    if (cnt > COLO_PROXY_TOTAL_COUNT && distinctIps > COLO_PROXY_DISTINCT_IPS) {
      return COLO_PROXY_PENALTY_BITS;
    }
    return 0;
  } catch (e) {
    return 0;
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

const SP_PASS_SCORE = 50;

function collectServerProof(request) {
  const h = request.headers;
  const cf = request.cf || {};
  return {
    ua: h.get('user-agent') || '',
    chua: h.get('sec-ch-ua') || '',
    chuaMobile: h.get('sec-ch-ua-mobile') || '',
    chuaPlatform: h.get('sec-ch-ua-platform') || '',
    secFetchSite: h.get('sec-fetch-site') || '',
    secFetchMode: h.get('sec-fetch-mode') || '',
    secFetchDest: h.get('sec-fetch-dest') || '',
    acceptEncoding: h.get('accept-encoding') || '',
    acceptLang: h.get('accept-language') || '',
    httpVersion: cf.httpVersion || '',
    colo: cf.colo || '',
  };
}

function scoreServerProof(sp) {
  let score = 0;
  const reasons = [];

  if (sp.chua && sp.chuaMobile && sp.chuaPlatform) {
    score += 15;
    if (/Chrome\/\d/.test(sp.ua) && /Chrome/.test(sp.chua)) score += 10;
    else reasons.push('sec-ch-ua 与 UA 不自洽');
  } else {
    reasons.push('缺少 sec-ch-ua 头');
  }

  if (sp.secFetchSite && sp.secFetchMode && sp.secFetchDest) {
    score += 20;
  } else {
    reasons.push('缺少 sec-fetch 头');
  }

  const ae = (sp.acceptEncoding || '').toLowerCase();
  if (ae.includes('br') || ae.includes('zstd')) {
    score += 15;
  } else if (ae.includes('gzip')) {
    score += 5;
    reasons.push('accept-encoding 缺 br');
  } else {
    reasons.push('accept-encoding 异常');
  }

  if (/,/.test(sp.acceptLang) && /q=/.test(sp.acceptLang)) {
    score += 10;
  } else if (sp.acceptLang) {
    score += 3;
  } else {
    reasons.push('缺少 accept-language');
  }

  if (sp.httpVersion === 'HTTP/2' || sp.httpVersion === 'HTTP/3') {
    score += 10;
  } else {
    reasons.push('HTTP/1.1');
  }

  if (/Mozilla\/5[\.\d].*\(.*?(Windows|Macintosh|Linux|Android|iPhone).*?\)/.test(sp.ua)) {
    score += 10;
  } else {
    reasons.push('UA 非浏览器');
  }

  return { score, reasons, valid: score >= SP_PASS_SCORE };
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
  const formulaMs = (Math.pow(2, record.bits) / ASSUMED_ATTACKER_HPS) * 1000;
  const minTimeMs = Math.max(formulaMs, MIN_VERIFY_MS);
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

    const sp = collectServerProof(request);
    const spResult = scoreServerProof(sp);
    if (!spResult.valid) {
      return new Response(JSON.stringify({ success: false, error: '环境验证失败', reasons: spResult.reasons }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }
    const bpHash = await bpHashHex(sp, env);

    await ensurePowSchema(env);
    const highRisk = ['prepare-register', 'prepare-reset', 'prepare-change-email'].includes(action);
    const floor = highRisk ? HIGH_RISK_MIN_BITS : MIN_BITS;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const penalty = await ipPenaltyBits(env, ip);
    const coloPenalty = await coloPenaltyBits(env, sp.colo);
    const bits = Math.min(Math.max(bitsFromHashRate(hashRate), minBits, floor, floor + penalty + coloPenalty), MAX_BITS);
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const nowISO = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRES_MS).toISOString();
    await env.DB.prepare(
      'INSERT INTO pow_challenges (challenge, bits, ip, bp_hash, colo, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(challenge, bits, ip, bpHash, sp.colo, nowISO, expiresAt).run();
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