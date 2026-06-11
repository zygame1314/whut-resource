const POW_BENCHMARK_MS = 300;
const POW_TARGET_TIME_MS = 2000;

async function powSha256Hex(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function powBenchmark(durationMs) {
    const sample = crypto.randomUUID().replace(/-/g, '');
    let count = 0;
    const start = performance.now();
    while (performance.now() - start < durationMs) {
        await powSha256Hex(`${sample}:${count}`);
        count++;
    }
    const elapsed = performance.now() - start;
    return Math.round(count / (elapsed / 1000));
}

function bitsFromHashRate(hashRate) {
    if (!hashRate || hashRate <= 0) return 18;
    const targetHashes = (POW_TARGET_TIME_MS / 1000) * hashRate;
    const bits = Math.floor(Math.log2(targetHashes));
    return Math.max(bits, 14);
}

const POW_WORKER_CODE = `
async function sha256Hex(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function checkPowHash(hash, bits) {
    var fullHexChars = Math.floor(bits / 4);
    var remainingBits = bits % 4;
    for (var i = 0; i < fullHexChars; i++) {
        if (hash[i] !== '0') return false;
    }
    if (remainingBits > 0) {
        var val = parseInt(hash[fullHexChars], 16);
        if (val >> (4 - remainingBits) !== 0) return false;
    }
    return true;
}

self.onmessage = async function(e) {
    var challenge = e.data.challenge;
    var bits = e.data.bits;
    var nonce = 0;
    while (true) {
        var hash = await sha256Hex(challenge + ':' + nonce);
        if (checkPowHash(hash, bits)) {
            self.postMessage({ nonce: nonce, hash: hash.substring(0, 12), phase: 'done' });
            return;
        }
        nonce++;
        if (nonce % 2000 === 0) {
            self.postMessage({ nonce: nonce, hash: hash.substring(0, 12), phase: 'computing' });
        }
    }
};
`;

function createPowWorker() {
    const blob = new Blob([POW_WORKER_CODE], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

function solvePowInWorker(challenge, bits, onProgress) {
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = createPowWorker();
        } catch (e) {
            reject(e);
            return;
        }
        worker.onmessage = (e) => {
            const msg = e.data;
            if (onProgress) onProgress(msg);
            if (msg.phase === 'done') {
                worker.terminate();
                resolve(msg.nonce);
            }
        };
        worker.onerror = (e) => {
            worker.terminate();
            reject(new Error(e.message || 'Worker error'));
        };
        worker.postMessage({ challenge, bits });
    });
}

async function fetchPowChallenge(hashRate) {
    const powApiUrl = (typeof API_ENDPOINTS !== 'undefined' && API_ENDPOINTS.pow) ? API_ENDPOINTS.pow : '/api/pow';
    const res = await fetch(powApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', hashRate })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '获取 PoW 挑战失败');
    return {
        challenge: data.challenge,
        bits: data.bits,
        expiresIn: data.expiresIn
    };
}

async function solvePowChallenge(onProgress) {
    if (onProgress) onProgress({ nonce: 0, hash: '', phase: 'benchmark', challenge: '' });
    const hashRate = await powBenchmark(POW_BENCHMARK_MS);
    const clientBits = bitsFromHashRate(hashRate);
    if (onProgress) onProgress({ nonce: 0, hash: '', phase: 'fetching', challenge: '' });
    const { challenge, bits } = await fetchPowChallenge(hashRate);
    const finalBits = Math.max(bits, clientBits);
    if (onProgress) onProgress({ nonce: 0, hash: '', phase: 'solving', challenge });
    const nonce = await solvePowInWorker(challenge, finalBits, onProgress);
    return { powChallenge: challenge, powNonce: nonce, powBits: finalBits };
}

function updatePowUI(powEl, progress) {
    if (!powEl) return;
    const ring = powEl.querySelector('.pow-ring-progress');
    const nonceEl = powEl.querySelector('.pow-nonce');
    const hashEl = powEl.querySelector('.pow-hash-value') || powEl.querySelector('.pow-hash');
    const labelEl = powEl.querySelector('.pow-label');
    const iconEl = powEl.querySelector('.pow-icon');
    const checkEl = powEl.querySelector('.pow-check');

    const phase = progress.phase || 'computing';
    const nonce = progress.nonce || 0;
    const hash = progress.hash || '';

    powEl.classList.remove('pow-idle');
    powEl.classList.toggle('pow-done', phase === 'done');
    powEl.classList.toggle('pow-working', phase === 'benchmark' || phase === 'fetching' || phase === 'solving' || phase === 'computing');

    if (ring) {
        const circumference = 2 * Math.PI * 18;
        let pct = 0;
        if (phase === 'benchmark') pct = 5;
        else if (phase === 'fetching') pct = 10;
        else if (phase === 'solving') pct = 25;
        else if (phase === 'computing') pct = 25 + Math.min(nonce / 150000, 1) * 75;
        else if (phase === 'done') pct = 100;
        ring.style.strokeDashoffset = circumference * (1 - pct / 100);
        ring.classList.toggle('pow-ring-done', phase === 'done');
    }
    if (nonceEl) nonceEl.textContent = nonce.toLocaleString();
    if (hashEl) hashEl.textContent = hash || '--------';
    if (labelEl) {
        const labels = { idle: '点击完成人机验证', benchmark: '正在评估设备性能...', fetching: '正在获取挑战...', solving: '正在计算人机验证...', computing: '正在计算...', done: '验证完成' };
        labelEl.textContent = labels[phase] || '正在计算...';
    }
    if (iconEl) iconEl.style.display = phase === 'done' ? 'none' : '';
    if (checkEl) checkEl.style.display = phase === 'done' ? '' : 'none';
}

function initPowCard(powEl, onSolved) {
    if (!powEl) return;
    let solved = false;
    let solving = false;
    let result = null;
    powEl.classList.add('pow-idle');
    powEl.style.cursor = 'pointer';

    powEl.onclick = async () => {
        if (solved || solving) return;
        solving = true;
        powEl.style.cursor = 'default';
        try {
            result = await solvePowChallenge((p) => updatePowUI(powEl, p));
            solved = true;
            setTimeout(() => { if (onSolved) onSolved(result); }, 600);
        } catch (e) {
            solving = false;
            powEl.style.cursor = 'pointer';
            powEl.classList.remove('pow-working');
            powEl.classList.add('pow-idle');
            updatePowUI(powEl, { phase: 'idle', nonce: 0, hash: '' });
            if (onSolved) onSolved(null, e);
        }
    };

    return {
        getResult: () => result,
        isSolved: () => solved,
        isSolving: () => solving,
        el: powEl
    };
}