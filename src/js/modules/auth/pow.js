const POW_BENCHMARK_MS = 300;
const POW_TARGET_TIME_MS = 4000;
const POW_MIN_VERIFY_MS = 1500;
const POW_ASSUMED_ATTACKER_HPS = 1_000_000;
const POW_VERIFY_MARGIN_MS = 300;

function powMinVerifyMs(bits) {
    const formulaMs = (Math.pow(2, bits) / POW_ASSUMED_ATTACKER_HPS) * 1000;
    return Math.max(formulaMs, POW_MIN_VERIFY_MS) + POW_VERIFY_MARGIN_MS;
}

const DEVICE_RANKS = [
    { hz: 0, name: '电子垃圾', icon: 'fa-trash-can' },
    { hz: 7500, name: '小霸王', icon: 'fa-gamepad' },
    { hz: 15000, name: '树莓派', icon: 'fa-microchip' },
    { hz: 30000, name: '入门手机', icon: 'fa-mobile-screen' },
    { hz: 60000, name: '旗舰手机', icon: 'fa-mobile' },
    { hz: 105000, name: '办公笔记本', icon: 'fa-laptop' },
    { hz: 180000, name: '游戏电脑', icon: 'fa-laptop-code' },
    { hz: 375000, name: '超频主机', icon: 'fa-fire' },
    { hz: 750000, name: '天河二号', icon: 'fa-building' },
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
    if (!hashRate || hashRate <= 0) return 16;
    const targetHashes = (POW_TARGET_TIME_MS / 1000) * hashRate;
    const bits = Math.floor(Math.log2(targetHashes));
    return Math.max(Math.min(bits, 21), 16);
}

async function powBindHash(action, fields) {
    const parts = [action || ''];
    for (const f of fields) parts.push(String(f == null ? '' : f));
    const msg = parts.join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

const POW_WORKER_CODE = `
var HEX_TABLE = (function() {
    var t = [];
    for (var i = 0; i < 256; i++) t.push(i.toString(16).padStart(2, '0'));
    return t;
})();

function sha256Bytes(data) {
    return crypto.subtle.digest('SHA-256', data);
}

function bytesToHex(buf) {
    var u8 = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < u8.length; i++) s += HEX_TABLE[u8[i]];
    return s;
}

var enc = new TextEncoder();

function hashHex(str) {
    return sha256Bytes(enc.encode(str)).then(bytesToHex);
}

self.onmessage = async function(e) {
    if (e.data.type === 'benchmark') {
        var durationMs = e.data.durationMs || 300;
        var sample = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : 'b8c3f7a1e2d4';
        var count = 0;
        var start = performance.now();
        while (performance.now() - start < durationMs) {
            await hashHex(sample + ':' + count);
            count++;
        }
        var elapsed = performance.now() - start;
        var hashRate = Math.round(count / (elapsed / 1000));
        self.postMessage({ type: 'benchmark', hashRate: hashRate });
        return;
    }

    if (e.data.type === 'solve') {
        var challenge = e.data.challenge;
        var steps = e.data.steps;
        var interval = e.data.interval;
        var bpHash = e.data.bpHash || '';
        var bindHash = e.data.bindHash || '';
        var x0 = await hashHex(challenge + ':' + bpHash + ':' + bindHash);
        x0 = x0.substring(0, 16);
        var cur = x0;
        var checkpoints = [];
        var solveStart = performance.now();
        for (var step = 1; step <= steps; step++) {
            cur = (await hashHex(cur + ':' + step)).substring(0, 16);
            if (step % interval === 0) {
                checkpoints.push(cur);
                self.postMessage({
                    type: 'progress',
                    step: step,
                    hash: cur.substring(0, 12),
                    elapsed: performance.now() - solveStart
                });
            }
        }
        self.postMessage({ type: 'done', step: steps, checkpoints: checkpoints.join(''), hash: cur.substring(0, 12), elapsed: performance.now() - solveStart });
        return;
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

function solveChainInWorker(challenge, steps, interval, bpHash, bindHash, onProgress) {
    return new Promise((resolve, reject) => {
        let worker;
        try { worker = createPowWorker(); } catch (e) { reject(e); return; }
        worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
                if (onProgress) onProgress({ step: e.data.step, hash: e.data.hash, elapsed: e.data.elapsed });
            } else if (e.data.type === 'done') {
                worker.terminate();
                if (onProgress) onProgress({ step: e.data.step, hash: e.data.hash, phase: 'done' });
                resolve({ checkpoints: e.data.checkpoints, elapsed: e.data.elapsed });
            }
        };
        worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Worker error')); };
        worker.postMessage({ type: 'solve', challenge, steps, interval, bpHash, bindHash });
    });
}

async function fetchPowChallenge(hashRate, minBits, action, bindHash) {
    const powApiUrl = (typeof API_ENDPOINTS !== 'undefined' && API_ENDPOINTS.pow) ? API_ENDPOINTS.pow : '/api/pow';
    const res = await fetch(powApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action || 'challenge', hashRate, minBits: minBits || 0, bind: bindHash || '' })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '获取 PoW 挑战失败');
    return {
        challenge: data.challenge,
        bits: data.bits,
        steps: data.steps,
        interval: data.interval,
        bpHash: data.bpHash || '',
        expiresIn: data.expiresIn
    };
}

async function solvePowChallenge(onProgress, minBits, action, bindFields) {
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'benchmark', challenge: '' });
    const hashRate = await powBenchmarkInWorker(POW_BENCHMARK_MS);
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'benchmark_done', challenge: '', hashRate });
    const bindHash = (bindFields && bindFields.length) ? await powBindHash(action, bindFields) : '';
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'fetching', challenge: '' });
    const { challenge, bits, steps, interval, bpHash } = await fetchPowChallenge(hashRate, minBits, action, bindHash);
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'solving', challenge });
    const { checkpoints, elapsed } = await solveChainInWorker(challenge, steps, interval, bpHash, bindHash, (p) => {
        if (onProgress) onProgress({ step: p.step, hash: p.hash, phase: p.phase || 'computing', totalSteps: steps });
    });
    const minWait = powMinVerifyMs(bits);
    if (elapsed < minWait) {
        await new Promise(r => setTimeout(r, minWait - elapsed));
    }
    return { powChallenge: challenge, powCheckpoints: checkpoints, powBits: bits, powBind: bindHash };
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
    const step = progress.step || 0;
    const hash = progress.hash || '';

    powEl.classList.toggle('pow-idle', phase === 'idle');
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
        else if (phase === 'computing' && progress.totalSteps) pct = 25 + Math.min(step / progress.totalSteps, 1) * 75;
        else if (phase === 'done') pct = 100;
        if (phase === 'idle') {
            ring.style.transition = 'none';
            ring.style.strokeDasharray = String(circumference);
            ring.style.strokeDashoffset = String(circumference);
            void ring.offsetWidth;
            ring.style.transition = '';
            ring.classList.remove('pow-ring-done');
        } else {
            ring.style.strokeDashoffset = String(circumference * (1 - pct / 100));
            ring.classList.toggle('pow-ring-done', phase === 'done');
        }
    }
    if (nonceEl) nonceEl.textContent = step.toLocaleString();
    if (hashEl) hashEl.textContent = hash || '--------';
    if (labelEl) {
        const labels = { idle: '点击完成人机验证', benchmark: '正在评估设备性能...', benchmark_done: '正在评估设备性能...', fetching: '正在获取挑战...', solving: '正在计算人机验证...', computing: '正在计算...', done: '验证完成' };
        labelEl.textContent = labels[phase] || '正在计算...';
    }
    if (iconEl) iconEl.style.display = phase === 'done' ? 'none' : '';
    if (checkEl) checkEl.style.display = phase === 'done' ? '' : 'none';
}

function initPowCard(powEl, onSolved, riskAction, getBindFields) {
    if (!powEl) return;
    let solved = false;
    let solving = false;
    let result = null;
    let minBits = 0;
    let action = riskAction || '';
    powEl.classList.add('pow-idle');
    powEl.style.cursor = 'pointer';

    powEl.onclick = async () => {
        if (solved || solving) return;
        solving = true;
        powEl.style.cursor = 'default';
        try {
            const bindFields = typeof getBindFields === 'function' ? getBindFields() : [];
            result = await solvePowChallenge((p) => updatePowUI(powEl, p), minBits, action, bindFields);
            solved = true;
            setTimeout(() => { if (onSolved) onSolved(result); }, 600);
        } catch (e) {
            solving = false;
            powEl.style.cursor = 'pointer';
            powEl.classList.remove('pow-working');
            powEl.classList.add('pow-idle');
            updatePowUI(powEl, { phase: 'idle', step: 0, hash: '' });
            if (typeof showNotification === 'function') {
                showNotification(e && e.message ? e.message : '人机验证失败，请重试', 'error');
            }
            if (onSolved) onSolved(null, e);
        }
    };

    return {
        getResult: () => result,
        isSolved: () => solved,
        isSolving: () => solving,
        setMinBits: (b) => { minBits = b; },
        reset: () => { solved = false; solving = false; result = null; powEl.classList.add('pow-idle'); powEl.classList.remove('pow-done', 'pow-working'); powEl.style.cursor = 'pointer'; updatePowUI(powEl, { phase: 'idle', step: 0, hash: '' }); const rankEl = powEl.querySelector('.pow-rank'); if (rankEl) { rankEl.style.display = 'none'; rankEl.innerHTML = ''; } },
        meetsRequired: () => solved && result && result.powBits >= minBits,
        requiredBits: () => minBits,
        el: powEl
    };
}