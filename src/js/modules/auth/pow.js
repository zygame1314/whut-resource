const POW_BENCHMARK_MS = 300;
const POW_TARGET_TIME_MS = 2000;

let _mouseMoved = false;
let _mousePositions = [];
let _clickTimings = [];
let _lastMouseDownTime = 0;

document.addEventListener('mousemove', () => { _mouseMoved = true; }, { once: true, passive: true });
document.addEventListener('touchmove', () => { _mouseMoved = true; }, { once: true, passive: true });
document.addEventListener('mousemove', (e) => {
    if (_mousePositions.length < 20) _mousePositions.push({ x: e.clientX, y: e.clientY, t: Date.now() });
}, { passive: true });

function collectBrowserProof() {
    const proof = {};

    proof.wd = navigator.webdriver === true;

    try {
        const canvas = document.createElement('canvas');
        canvas.width = 50; canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('BWV', 2, 2);
        proof.cg = canvas.toDataURL().length;
    } catch (_) { proof.cg = 0; }

    proof.gl = (function () {
        try {
            const c = document.createElement('canvas');
            const g = c.getContext('webgl') || c.getContext('experimental-webgl');
            if (!g) return 0;
            const d = g.getExtension('WEBGL_debug_renderer_info');
            return d ? 1 : 2;
        } catch (_) { return 0; }
    })();

    proof.mm = _mouseMoved;
    proof.mc = Math.min(_mousePositions.length, 20);

    if (_clickTimings.length >= 2) {
        const gap = _clickTimings[_clickTimings.length - 1] - _clickTimings[0];
        proof.ct = gap;
    }

    proof.np = navigator.plugins ? navigator.plugins.length : 0;
    proof.wb = typeof window.__nightmare !== 'undefined' || typeof window.callPhantom !== 'undefined' || typeof window._phantom !== 'undefined';
    proof.hr = window.innerWidth > 0 && window.innerHeight > 0;

    proof.ts = Date.now();

    return proof;
}

function validateBrowserProof(proof) {
    if (!proof) return { valid: false, score: 0, reason: '无验证数据' };
    let score = 0;
    const reasons = [];

    if (proof.wd) { reasons.push('webdriver'); }
    else { score += 30; }

    if (proof.wb) { reasons.push('headless'); }
    else { score += 20; }

    if (proof.cg > 1000) { score += 15; }
    else { reasons.push('canvas异常'); }

    if (proof.gl === 2) { score += 10; }
    else if (proof.gl === 1) { score += 5; }

    if (proof.mm) { score += 10; }
    else { reasons.push('无鼠标移动'); }

    if (proof.mc > 2) { score += 5; }

    if (proof.ct && proof.ct > 0 && proof.ct < 5000) { score += 5; }

    if (proof.hr) { score += 5; }
    else { reasons.push('窗口异常'); }

    return { valid: score >= 50, score, reasons: reasons.length > 0 ? reasons : undefined };
}

const DEVICE_RANKS = [
    { hz: 0, name: '电子垃圾', icon: 'fa-trash-can' },
    { hz: 5000, name: '小霸王', icon: 'fa-gamepad' },
    { hz: 10000, name: '树莓派', icon: 'fa-microchip' },
    { hz: 20000, name: '入门手机', icon: 'fa-mobile-screen' },
    { hz: 40000, name: '旗舰手机', icon: 'fa-mobile' },
    { hz: 70000, name: '办公笔记本', icon: 'fa-laptop' },
    { hz: 120000, name: '游戏电脑', icon: 'fa-laptop-code' },
    { hz: 250000, name: '超频主机', icon: 'fa-fire' },
    { hz: 500000, name: '天河二号', icon: 'fa-building' },
    { hz: Infinity, name: '神威·太湖之光', icon: 'fa-mountain-sun' },
];

function getDeviceRank(hashRate) {
    if (!hashRate || hashRate <= 0) return DEVICE_RANKS[0];
    for (let i = 1; i < DEVICE_RANKS.length; i++) {
        if (hashRate < DEVICE_RANKS[i].hz) {
            return DEVICE_RANKS[i - 1];
        }
    }
    return DEVICE_RANKS[DEVICE_RANKS.length - 1];
}

function bitsFromHashRate(hashRate) {
    if (!hashRate || hashRate <= 0) return 14;
    const targetHashes = (POW_TARGET_TIME_MS / 1000) * hashRate;
    const bits = Math.floor(Math.log2(targetHashes));
    return Math.max(bits, 15);
}

const POW_WORKER_CODE = `
async function sha256Hex(message) {
    var msgBuffer = new TextEncoder().encode(message);
    var hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
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
    if (e.data.type === 'benchmark') {
        var durationMs = e.data.durationMs || 300;
        var sample = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : 'b8c3f7a1e2d4';
        var count = 0;
        var start = performance.now();
        while (performance.now() - start < durationMs) {
            await sha256Hex(sample + ':' + count);
            count++;
        }
        var elapsed = performance.now() - start;
        var hashRate = Math.round(count / (elapsed / 1000));
        self.postMessage({ type: 'benchmark', hashRate: hashRate });
        return;
    }

    if (e.data.type === 'solve') {
        var challenge = e.data.challenge;
        var bits = e.data.bits;
        var nonce = 0;
        while (true) {
            var hash = await sha256Hex(challenge + ':' + nonce);
            if (checkPowHash(hash, bits)) {
                self.postMessage({ type: 'solve', nonce: nonce, hash: hash.substring(0, 12), phase: 'done' });
                return;
            }
            nonce++;
            if (nonce % 2000 === 0) {
                self.postMessage({ type: 'solve', nonce: nonce, hash: hash.substring(0, 12), phase: 'computing' });
            }
        }
    }
};
`;

function createPowWorker() {
    const blob = new Blob([POW_WORKER_CODE], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

function powBenchmarkInWorker(durationMs) {
    return new Promise((resolve, reject) => {
        let worker;
        try { worker = createPowWorker(); } catch (e) { reject(e); return; }
        worker.onmessage = (e) => {
            if (e.data.type === 'benchmark') {
                worker.terminate();
                resolve(e.data.hashRate);
            }
        };
        worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Worker error')); };
        worker.postMessage({ type: 'benchmark', durationMs });
    });
}

function solvePowInWorker(challenge, bits, onProgress) {
    return new Promise((resolve, reject) => {
        let worker;
        try { worker = createPowWorker(); } catch (e) { reject(e); return; }
        worker.onmessage = (e) => {
            if (e.data.type === 'solve') {
                if (onProgress) onProgress(e.data);
                if (e.data.phase === 'done') {
                    worker.terminate();
                    resolve(e.data.nonce);
                }
            }
        };
        worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Worker error')); };
        worker.postMessage({ type: 'solve', challenge, bits });
    });
}

async function fetchPowChallenge(hashRate, minBits, browserProof) {
    const powApiUrl = (typeof API_ENDPOINTS !== 'undefined' && API_ENDPOINTS.pow) ? API_ENDPOINTS.pow : '/api/pow';
    const res = await fetch(powApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', hashRate, minBits: minBits || 0, bp: browserProof || null })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '获取 PoW 挑战失败');
    return {
        challenge: data.challenge,
        bits: data.bits,
        expiresIn: data.expiresIn
    };
}

async function solvePowChallenge(onProgress, minBits, browserProof) {
    if (onProgress) onProgress({ nonce: 0, hash: '', phase: 'benchmark', challenge: '' });
    const hashRate = await powBenchmarkInWorker(POW_BENCHMARK_MS);
    if (onProgress) onProgress({ nonce: 0, hash: '', phase: 'benchmark_done', challenge: '', hashRate });
    const clientBits = bitsFromHashRate(hashRate);
    if (onProgress) onProgress({ nonce: 0, hash: '', phase: 'fetching', challenge: '' });
    const { challenge, bits } = await fetchPowChallenge(hashRate, minBits, browserProof);
    const finalBits = Math.max(bits, clientBits, minBits || 0);
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
    const rankEl = powEl.querySelector('.pow-rank');

    const phase = progress.phase || 'computing';
    const nonce = progress.nonce || 0;
    const hash = progress.hash || '';

    powEl.classList.remove('pow-idle');
    powEl.classList.toggle('pow-done', phase === 'done');
    powEl.classList.toggle('pow-working', phase === 'benchmark' || phase === 'benchmark_done' || phase === 'fetching' || phase === 'solving' || phase === 'computing');

    if (rankEl && progress.hashRate) {
        const rank = getDeviceRank(progress.hashRate);
        rankEl.innerHTML = `<i class="fas ${rank.icon}"></i> ${rank.name} <span class="pow-rank-hs">${progress.hashRate.toLocaleString()} H/s</span>`;
        rankEl.style.display = '';
    }

    if (ring) {
        const circumference = 2 * Math.PI * 18;
        let pct = 0;
        if (phase === 'benchmark' || phase === 'benchmark_done') pct = 5;
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
        const labels = { idle: '点击完成人机验证', benchmark: '正在评估设备性能...', benchmark_done: '正在评估设备性能...', fetching: '正在获取挑战...', solving: '正在计算人机验证...', computing: '正在计算...', done: '验证完成' };
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
    let minBits = 0;
    let browserProof = null;
    powEl.classList.add('pow-idle');
    powEl.style.cursor = 'pointer';

    powEl.addEventListener('mousedown', () => { _lastMouseDownTime = Date.now(); }, { passive: true });
    powEl.addEventListener('click', () => {
        _clickTimings.push(Date.now());
        if (_clickTimings.length > 10) _clickTimings.shift();
    }, { passive: true });

    powEl.onclick = async () => {
        if (solved || solving) return;
        const clickDelta = _lastMouseDownTime ? Date.now() - _lastMouseDownTime : 0;
        const proof = collectBrowserProof();
        proof.cd = clickDelta;
        const validation = validateBrowserProof(proof);
        if (!validation.valid) {
            showNotification('人机验证环境异常，请使用正常浏览器', 'error');
            return;
        }
        browserProof = proof;
        solving = true;
        powEl.style.cursor = 'default';
        try {
            result = await solvePowChallenge((p) => updatePowUI(powEl, p), minBits, proof);
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
        setMinBits: (b) => { minBits = b; },
        reset: () => { solved = false; solving = false; result = null; browserProof = null; powEl.classList.add('pow-idle'); powEl.classList.remove('pow-done', 'pow-working'); powEl.style.cursor = 'pointer'; updatePowUI(powEl, { phase: 'idle', nonce: 0, hash: '' }); const rankEl = powEl.querySelector('.pow-rank'); if (rankEl) { rankEl.style.display = 'none'; rankEl.innerHTML = ''; } },
        meetsRequired: () => solved && result && result.powBits >= minBits,
        requiredBits: () => minBits,
        el: powEl
    };
}