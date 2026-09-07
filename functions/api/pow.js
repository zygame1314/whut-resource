const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const MIN_BITS = 16;
const MAX_BITS = 21;
const TARGET_WORK_SECONDS = 5;
const HIGH_RISK_MIN_BITS = 18;
const ASSUMED_ATTACKER_SERIAL_HPS = 3_000_000;
const MIN_VERIFY_MS = 1500;
const IP_RATE_WINDOW_MS = 5 * 60 * 1000;
const IP_RATE_BASE_COUNT = 3;
const IP_RATE_BITS_STEP = 1;
const CHECKPOINT_INTERVAL = 2048;
const VERIFY_RANDOM_WINDOWS = 2;
const ASN_PENALTY_BITS = 6;
const BOT_SCORE_PENALTY_BITS = 4;
const BOT_SCORE_THRESHOLD = 30;

const DATA_CENTER_ASN = new Set([
  16509, 14618, 15169, 396982, 8075, 8068, 14061, 63949, 16276, 24940,
  20473, 31898, 12876, 45102, 132203, 13335, 54113, 199524, 9009,
  197540, 42652, 61159, 8107, 32934, 54113, 36459, 16509
]);

function bitsFromHashRate(hashRate) {
  if (!hashRate || hashRate <= 0) return MIN_BITS;
  const targetHashes = TARGET_WORK_SECONDS * hashRate;
  const bits = Math.floor(Math.log2(targetHashes));
  return Math.max(Math.min(bits, MAX_BITS), MIN_BITS);
}

async function sha256Hex(data) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += HEX_TABLE[u8[i]];
  return s;
}
const HEX_TABLE = (() => { const t = []; for (let i = 0; i < 256; i++) t.push(i.toString(16).padStart(2, '0')); return t; })();

async function hmacSha256Hex(key, message) {
  const keyData = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  const u8 = new Uint8Array(sig);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += HEX_TABLE[u8[i]];
  return s;
}

async function keyedHex(key, message) {
  if (key) return hmacSha256Hex(key, message);
  return sha256Hex(message);
}

async function bpHashHex(bp, env) {
  const stable = JSON.stringify(bp);
  const h = await keyedHex(env && env.POW_HMAC_KEY, stable);
  return h.slice(0, 16);
}

async function bindHashHex(action, bindHex, env) {
  return keyedHex(env && env.POW_HMAC_KEY, `${action || ''}|${bindHex || ''}`);
}

const BIND_FIELDS = {
  'prepare-register': b => [b.emailPrefix, b.password],
  'prepare-reset': b => [b.email, b.newPassword],
  'prepare-change-email': b => [b.newEmail]
};

function computePowBind(action, body) {
  const extract = BIND_FIELDS[action];
  if (!extract) return '';
  const fields = extract(body || {});
  return sha256Hex([action, ...fields.map(f => f == null ? '' : String(f))].join('|'));
}

let _schemaEnsured = false;
async function ensurePowSchema(env) {
  if (_schemaEnsured) return;
  for (const col of ['bp_hash', 'colo', 'steps', 'interval', 'bind_hash']) {
    try {
      await env.DB.prepare(`SELECT ${col} FROM pow_challenges LIMIT 1`).run();
    } catch (e) {
      try {
        await env.DB.prepare(`ALTER TABLE pow_challenges ADD COLUMN ${col} ${col === 'steps' || col === 'interval' ? 'INTEGER' : 'TEXT'}`).run();
      } catch (alterError) {
        console.error('pow schema migrate failed:', col, alterError && alterError.message ? alterError.message : alterError);
      }
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

function asnPenaltyBits(cf, action) {
  const asn = cf && cf.asn;
  if (!asn) return 0;
  if (DATA_CENTER_ASN.has(asn)) {
    if (['prepare-register', 'prepare-reset', 'prepare-change-email'].includes(action)) return Infinity;
    return ASN_PENALTY_BITS;
  }
  return 0;
}

function botScorePenaltyBits(cf) {
  const score = cf && cf.botManagement && cf.botManagement.score;
  if (typeof score === 'number' && score > 0 && score < BOT_SCORE_THRESHOLD) {
    return BOT_SCORE_PENALTY_BITS;
  }
  return 0;
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

function minVerifyMs(steps) {
  return Math.max((steps / ASSUMED_ATTACKER_SERIAL_HPS) * 1000, MIN_VERIFY_MS);
}

export async function verifyPowSolution(params, env, ctx) {
  const { challenge, bits, checkpoints, bind, action } = params || {};
  if (!challenge || !bits || !checkpoints || typeof checkpoints !== 'string') {
    return { valid: false, error: '缺少 PoW 参数' };
  }
  const normAction = String(action || '');
  const bitsNum = Number(bits);
  if (!Number.isInteger(bitsNum) || bitsNum < 1 || bitsNum > 32) {
    return { valid: false, error: '难度参数无效' };
  }
  if (bind && !/^[0-9a-f]{64}$/.test(String(bind))) {
    return { valid: false, error: '业务绑定参数无效' };
  }
  if (!/^[0-9a-f]+$/.test(checkpoints)) {
    return { valid: false, error: 'checkpoint 数据无效' };
  }
  const record = await env.DB.prepare(
    'SELECT bits, issued_at, expires_at, attempts, bp_hash, bind_hash, steps, interval FROM pow_challenges WHERE challenge = ? AND expires_at > ?'
  ).bind(challenge, new Date().toISOString()).first();
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
  if (bitsNum < record.bits) {
    return { valid: false, error: '难度低于服务端要求' };
  }
  const steps = record.steps;
  const interval = record.interval;
  if (!steps || !interval || steps % interval !== 0 || steps !== Math.pow(2, record.bits)) {
    return { valid: false, error: '挑战数据无效，请重新获取' };
  }
  const elapsedMs = Date.now() - new Date(record.issued_at).getTime();
  if (elapsedMs < minVerifyMs(steps)) {
    await env.DB.prepare('UPDATE pow_challenges SET attempts = COALESCE(attempts, 0) + 1 WHERE challenge = ?').bind(challenge).run();
    maybeCleanup(env.DB, ctx);
    return { valid: false, error: '验证过快，请重试' };
  }
  await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
  const clientBind = bind || '';
  if (record.bind_hash) {
    const computed = await bindHashHex(normAction, clientBind, env);
    if (computed !== record.bind_hash) {
      return { valid: false, error: '表单内容已变更，请重新完成人机验证' };
    }
  }
  const x0 = (await sha256Hex(`${challenge}:${record.bp_hash || ''}:${clientBind}`)).slice(0, 16);
  const windows = steps / interval;
  if (checkpoints.length !== windows * 16) {
    return { valid: false, error: 'checkpoint 数据无效' };
  }
  const cps = [];
  for (let i = 0; i < windows; i++) cps.push(checkpoints.substr(i * 16, 16));
  const targets = new Set([0]);
  while (targets.size < Math.min(1 + VERIFY_RANDOM_WINDOWS, windows)) {
    targets.add(1 + Math.floor(Math.random() * (windows - 1)));
  }
  let cur = x0;
  for (const w of targets) {
    cur = w === 0 ? x0 : cps[w - 1];
    const base = w * interval;
    for (let i = 0; i < interval; i++) {
      cur = (await sha256Hex(cur + ':' + (base + i + 1))).slice(0, 16);
    }
    if (cur !== cps[w]) {
      return { valid: false, error: 'PoW 验证失败' };
    }
  }
  return { valid: true };
}

export { computePowBind };

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
    const action = String(body.action || '');
    const bind = (typeof body.bind === 'string' && /^[0-9a-f]{64}$/.test(body.bind)) ? body.bind : '';

    const isHighRisk = ['prepare-register', 'prepare-reset', 'prepare-change-email'].includes(action);
    if (isHighRisk && !bind) {
      return new Response(JSON.stringify({ success: false, error: '业务绑定参数缺失' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }

    const sp = collectServerProof(request);
    const spResult = scoreServerProof(sp);
    if (!spResult.valid) {
      return new Response(JSON.stringify({ success: false, error: '环境验证失败', reasons: spResult.reasons }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }
    const bpHash = await bpHashHex(sp, env);

    const cf = request.cf || {};
    const asnPenalty = asnPenaltyBits(cf, action);
    if (asnPenalty === Infinity) {
      return new Response(JSON.stringify({ success: false, error: '当前网络环境无法完成验证' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }

    await ensurePowSchema(env);
    const floor = isHighRisk ? HIGH_RISK_MIN_BITS : MIN_BITS;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const penalty = await ipPenaltyBits(env, ip);
    const coloPenalty = await coloPenaltyBits(env, sp.colo);
    const botPenalty = botScorePenaltyBits(cf);
    const bits = Math.min(Math.max(bitsFromHashRate(hashRate), minBits, floor, floor + penalty + coloPenalty + asnPenalty + botPenalty), MAX_BITS);
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const steps = Math.pow(2, bits);
    const interval = CHECKPOINT_INTERVAL;
    const nowISO = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRES_MS).toISOString();
    const bindHash = await bindHashHex(action, bind, env);
    await env.DB.prepare(
      'INSERT INTO pow_challenges (challenge, bits, ip, bp_hash, colo, steps, interval, bind_hash, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(challenge, bits, ip, bpHash, sp.colo, steps, interval, bindHash, nowISO, expiresAt).run();
    maybeCleanup(env.DB, ctx);
    return new Response(JSON.stringify({
      success: true,
      challenge,
      bits,
      steps,
      interval,
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