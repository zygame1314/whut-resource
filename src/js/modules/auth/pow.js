const POW_API_URL = '/api/pow';

async function powSha256Hex(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function detectDeviceType() {
    const ua = navigator.userAgent;
    if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile';
    return 'desktop';
}

async function fetchPowChallenge() {
    const deviceType = detectDeviceType();
    const res = await fetch(POW_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', deviceType })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '获取 PoW 挑战失败');
    return {
        challenge: data.challenge,
        difficulty: data.difficulty,
        expiresIn: data.expiresIn
    };
}

async function solvePow(challenge, difficulty, onProgress) {
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;
    const batchSize = 500;
    while (true) {
        const hash = await powSha256Hex(`${challenge}:${nonce}`);
        if (hash.startsWith(prefix)) {
            if (onProgress) onProgress(nonce);
            return nonce;
        }
        nonce++;
        if (nonce % batchSize === 0) {
            if (onProgress) onProgress(nonce);
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

async function solvePowChallenge(onProgress) {
    const { challenge, difficulty } = await fetchPowChallenge();
    const nonce = await solvePow(challenge, difficulty, onProgress);
    return { powChallenge: challenge, powNonce: nonce, powDifficulty: difficulty };
}