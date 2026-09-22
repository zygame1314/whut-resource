const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const MIN_BITS = 16;
const MAX_BITS = 21;
const HIGH_RISK_MIN_BITS = 18;
const DEVICE_TARGET_WORK_MS = 3000;
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

function bitsFromDevice(hashRate, floor) {
  const rate = Number(hashRate);
  if (!Number.isFinite(rate) || rate <= 0) return floor;
  const targetHashes = (DEVICE_TARGET_WORK_MS / 1000) * rate;
  if (!(targetHashes > 0)) return floor;
  const bits = Math.floor(Math.log2(targetHashes));
  return Math.min(Math.max(bits, floor), MAX_BITS);
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

async function bindHashHex(action, bindHex, env) {
  return keyedHex(env && env.POW_HMAC_KEY, `${action || ''}|${bindHex || ''}`);
}

const BROWSER_ACTIONS = ['prepare-register', 'prepare-reset', 'prepare-change-email', 'login', 'whut-login'];
const ENV_NONCE_BYTES = 12;

function shouldRequireBrowser(action) {
  return BROWSER_ACTIONS.includes(String(action || ''));
}

function randomEnvNonce() {
  const u8 = new Uint8Array(ENV_NONCE_BYTES);
  crypto.getRandomValues(u8);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += HEX_TABLE[u8[i]];
  return s;
}

const ENV_FLAG_CANVAS = 1;
const ENV_FLAG_WEBGL = 2;
const ENV_FLAG_AUDIO = 4;
const ENV_FLAG_FONTS = 8;
const ENV_FLAG_HARDWARE = 16;
const ENV_FLAG_TIMING = 32;
const ENV_REQUIRED_FLAGS = ENV_FLAG_CANVAS | ENV_FLAG_WEBGL | ENV_FLAG_AUDIO | ENV_FLAG_FONTS | ENV_FLAG_HARDWARE | ENV_FLAG_TIMING;

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

const HEX64_RE = /^[0-9a-f]{64}$/;

function evaluateEnvSignals(signals) {
  const flags = { ok: 0, reasons: [] };
  const s = signals && typeof signals === 'object' ? signals : null;
  if (!s) {
    flags.reasons.push('缺少环境数据');
    return flags;
  }
  const canvas = s.canvas;
  if (typeof canvas === 'string' && HEX64_RE.test(canvas) && canvas !== '0'.repeat(64)) {
    flags.ok |= ENV_FLAG_CANVAS;
  } else {
    flags.reasons.push('canvas 信号异常');
  }
  const gl = s.webgl;
  if (gl && typeof gl.vendor === 'string' && gl.vendor.trim() && typeof gl.renderer === 'string' && gl.renderer.trim() && typeof gl.params === 'string' && gl.params.trim()) {
    if (!/swiftshader|llvmpipe|mesa offscreen|headless/i.test(gl.renderer)) {
      flags.ok |= ENV_FLAG_WEBGL;
    } else {
      flags.reasons.push('WebGL 渲染器为软件实现');
    }
  } else {
    flags.reasons.push('缺少 WebGL 信号');
  }
  const audio = s.audio;
  if (typeof audio === 'number' && Number.isFinite(audio) && audio !== 0) {
    flags.ok |= ENV_FLAG_AUDIO;
  } else {
    flags.reasons.push('AudioContext 信号异常');
  }
  const fonts = s.fonts;
  if (typeof fonts === 'number' && Number.isInteger(fonts) && fonts >= 1 && fonts <= 4096) {
    flags.ok |= ENV_FLAG_FONTS;
  } else {
    flags.reasons.push('字体探测结果异常');
  }
  const hw = s.hardware;
  if (hw && typeof hw === 'object' &&
    Number.isInteger(hw.cores) && hw.cores >= 1 && hw.cores <= 256 &&
    Number.isInteger(hw.memory) && hw.memory >= 0 && hw.memory <= 256 &&
    Number.isInteger(hw.tzOffset) && hw.tzOffset >= -900 && hw.tzOffset <= 900 &&
    typeof hw.langs === 'string' && hw.langs.length > 0 &&
    typeof hw.dpr === 'number' && hw.dpr >= 0.25 && hw.dpr <= 8 &&
    typeof hw.touch === 'boolean') {
    flags.ok |= ENV_FLAG_HARDWARE;
  } else {
    flags.reasons.push('硬件/区域信息异常');
  }
  const timing = s.timing;
  if (timing && typeof timing === 'object' &&
    typeof timing.raf === 'number' && Number.isFinite(timing.raf) && timing.raf > 0 && timing.raf <= 200 &&
    typeof timing.hashRate === 'number' && Number.isFinite(timing.hashRate) && timing.hashRate > 0) {
    flags.ok |= ENV_FLAG_TIMING;
  } else {
    flags.reasons.push('时间基准信号异常');
  }
  return flags;
}

async function verifyEnvProof(envProof, record, env) {
  if (!record.env_nonce) return { ok: true, skipped: true };
  if (!envProof || typeof envProof !== 'object') {
    return { ok: false, error: '缺少浏览器环境证明' };
  }
  const nonce = String(envProof.nonce || '');
  if (nonce !== record.env_nonce) {
    return { ok: false, error: '环境证明已过期，请重新验证' };
  }
  const digest = String(envProof.digest || '');
  if (!HEX64_RE.test(digest)) {
    return { ok: false, error: '环境证明格式无效' };
  }
  const signals = envProof.signals;
  const evaluated = evaluateEnvSignals(signals);
  const expected = await sha256Hex(`${nonce}|${canonicalJson(signals)}`);
  if (expected !== digest) {
    return { ok: false, error: '环境证明校验失败' };
  }
  const required = record.env_flags ? record.env_flags : ENV_REQUIRED_FLAGS;
  if ((evaluated.ok & required) !== required) {
    return { ok: false, error: '浏览器环境不完整，请使用标准浏览器访问' };
  }
  return { ok: true, flags: evaluated.ok };
}

const BIND_FIELDS = {
  'prepare-register': b => [b.emailPrefix],
  'prepare-reset': b => [b.email],
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
  for (const col of ['steps', 'interval', 'bind_hash', 'env_nonce', 'env_flags', 'req_action']) {
    try {
      await env.DB.prepare(`SELECT ${col} FROM pow_challenges LIMIT 1`).run();
    } catch (e) {
      try {
        await env.DB.prepare(`ALTER TABLE pow_challenges ADD COLUMN ${col} ${['steps', 'interval', 'env_flags'].includes(col) ? 'INTEGER' : 'TEXT'}`).run();
      } catch (alterError) {
        console.error('pow schema migrate failed:', col, alterError && alterError.message ? alterError.message : alterError);
      }
    }
  }
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pow_challenges_ip_issued ON pow_challenges(ip, issued_at)').run();
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

const ASN_HIGH_RISK_PENALTY_BITS = MAX_BITS - MIN_BITS;

function asnPenaltyBits(cf, action) {
  const asn = cf && cf.asn;
  if (!asn) return 0;
  if (DATA_CENTER_ASN.has(asn)) {
    if (['prepare-register', 'prepare-reset', 'prepare-change-email'].includes(action)) return ASN_HIGH_RISK_PENALTY_BITS;
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

export async function verifyPowSolution(params, env, ctx) {
  const { challenge, checkpoints, bind, action, envProof, minBits } = params || {};
  if (!challenge || !checkpoints || typeof checkpoints !== 'string') {
    return { valid: false, error: '缺少 PoW 参数' };
  }
  const normAction = String(action || '');
  if (bind && !/^[0-9a-f]{64}$/.test(String(bind))) {
    return { valid: false, error: '业务绑定参数无效' };
  }
  if (!/^[0-9a-f]+$/.test(checkpoints)) {
    return { valid: false, error: 'checkpoint 数据无效' };
  }
  const requiredBits = Number(minBits) || 0;
  if (!Number.isInteger(requiredBits) || requiredBits < 0 || requiredBits > 32) {
    return { valid: false, error: '难度参数无效' };
  }
  const record = await env.DB.prepare(
    'SELECT bits, issued_at, expires_at, attempts, bind_hash, steps, interval, env_nonce, env_flags, req_action FROM pow_challenges WHERE challenge = ? AND expires_at > ?'
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
  if (record.req_action && normAction !== record.req_action) {
    return { valid: false, error: '挑战用途不匹配，请重新获取' };
  }
  if (record.bits < requiredBits) {
    return { valid: false, error: '难度低于服务端要求，请重新获取挑战' };
  }
  if (record.env_nonce) {
    const envResult = await verifyEnvProof(envProof, record, env);
    if (!envResult.ok) {
      await env.DB.prepare('UPDATE pow_challenges SET attempts = COALESCE(attempts, 0) + 1 WHERE challenge = ?').bind(challenge).run();
      maybeCleanup(env.DB, ctx);
      return { valid: false, error: envResult.error };
    }
  }
  const steps = record.steps;
  const interval = record.interval;
  if (!steps || !interval || steps % interval !== 0 || steps !== Math.pow(2, record.bits)) {
    return { valid: false, error: '挑战数据无效，请重新获取' };
  }
  const elapsedMs = Date.now() - new Date(record.issued_at).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return { valid: false, error: '挑战数据无效，请重新获取' };
  }
  await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
  const clientBind = bind || '';
  if (record.bind_hash) {
    const computed = await bindHashHex(normAction, clientBind, env);
    if (computed !== record.bind_hash) {
      return { valid: false, error: '表单内容已变更，请重新完成人机验证' };
    }
  }
  const x0 = (await sha256Hex(`${challenge}:${clientBind}`)).slice(0, 16);
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
    const action = String(body.action || '');
    const hashRate = Number(body.hashRate) || 0;
    const escalateBits = Number(body.escalateBits) || 0;
    const bind = (typeof body.bind === 'string' && /^[0-9a-f]{64}$/.test(body.bind)) ? body.bind : '';

    const isHighRisk = ['prepare-register', 'prepare-reset', 'prepare-change-email'].includes(action);
    if (isHighRisk && !bind) {
      return new Response(JSON.stringify({ success: false, error: '业务绑定参数缺失' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }

    const cf = request.cf || {};
    const asnPenalty = asnPenaltyBits(cf, action);

    await ensurePowSchema(env);
    const floor = isHighRisk ? HIGH_RISK_MIN_BITS : MIN_BITS;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const penalty = await ipPenaltyBits(env, ip);
    const botPenalty = botScorePenaltyBits(cf);
    const deviceBits = bitsFromDevice(hashRate, floor);
    const escalateFloor = Number.isInteger(escalateBits) && escalateBits >= MIN_BITS && escalateBits <= MAX_BITS ? escalateBits : 0;
    const bits = Math.min(Math.max(floor, deviceBits, escalateFloor, floor + penalty + asnPenalty + botPenalty), MAX_BITS);
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const steps = Math.pow(2, bits);
    const interval = CHECKPOINT_INTERVAL;
    const nowISO = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRES_MS).toISOString();
    const bindHash = BIND_FIELDS[action] ? await bindHashHex(action, bind, env) : '';
    const requireBrowser = shouldRequireBrowser(action);
    const envNonce = requireBrowser ? randomEnvNonce() : '';
    await env.DB.prepare(
      'INSERT INTO pow_challenges (challenge, bits, ip, steps, interval, bind_hash, issued_at, expires_at, env_nonce, env_flags, req_action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(challenge, bits, ip, steps, interval, bindHash, nowISO, expiresAt, envNonce, requireBrowser ? ENV_REQUIRED_FLAGS : 0, action).run();
    maybeCleanup(env.DB, ctx);
    return new Response(JSON.stringify({
      success: true,
      challenge,
      bits,
      steps,
      interval,
      envNonce: envNonce || undefined,
      requiresBrowser: requireBrowser,
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