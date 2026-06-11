const CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;
const MAX_CHALLENGES_PER_IP = 30;
const MIN_DIFFICULTY = 4;
const MAX_DIFFICULTY = 8;

function difficultyFromHashRate(hashRate) {
  if (!hashRate || hashRate <= 0) return MIN_DIFFICULTY;
  const targetHashes = 2 * hashRate;
  let difficulty = 1;
  let expected = 16;
  while (expected * 1.5 < targetHashes && difficulty < MAX_DIFFICULTY) {
    difficulty++;
    expected *= 16;
  }
  return Math.max(difficulty, MIN_DIFFICULTY);
}

async function sha256Hex(data) {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cleanupExpiredChallenges(db) {
  await db.prepare('DELETE FROM pow_challenges WHERE expires_at < ?').bind(new Date().toISOString()).run();
}

export async function verifyPowSolution(challenge, nonce, difficulty, env) {
  if (!challenge || nonce === undefined || nonce === null || !difficulty) {
    return { valid: false, error: '缺少 PoW 参数' };
  }
  difficulty = Number(difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
    return { valid: false, error: '难度参数无效' };
  }
  nonce = Number(nonce);
  if (!Number.isInteger(nonce) || nonce < 0) {
    return { valid: false, error: 'nonce 参数无效' };
  }
  const record = await env.DB.prepare('SELECT difficulty, expires_at FROM pow_challenges WHERE challenge = ?').bind(challenge).first();
  if (!record) {
    return { valid: false, error: '挑战不存在或已过期' };
  }
  if (Date.now() > new Date(record.expires_at).getTime()) {
    await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
    return { valid: false, error: '挑战已过期' };
  }
  if (difficulty < record.difficulty) {
    return { valid: false, error: '难度低于服务端要求' };
  }
  await env.DB.prepare('DELETE FROM pow_challenges WHERE challenge = ?').bind(challenge).run();
  const hash = await sha256Hex(`${challenge}:${nonce}`);
  const prefix = '0'.repeat(difficulty);
  if (!hash.startsWith(prefix)) {
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
    const difficulty = difficultyFromHashRate(hashRate);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRES_MS).toISOString();
    await cleanupExpiredChallenges(env.DB);
    const ipRow = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM pow_challenges WHERE ip = ? AND expires_at > ?'
    ).bind(ip, issuedAt).first();
    if (ipRow && ipRow.cnt >= MAX_CHALLENGES_PER_IP) {
      return new Response(JSON.stringify({ success: false, error: '请求过于频繁，请稍后再试' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...addCors() }
      });
    }
    await env.DB.prepare(
      'INSERT INTO pow_challenges (challenge, difficulty, ip, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(challenge, difficulty, ip, issuedAt, expiresAt).run();
    return new Response(JSON.stringify({
      success: true,
      challenge,
      difficulty,
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