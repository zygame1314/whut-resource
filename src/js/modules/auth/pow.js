const POW_BENCHMARK_MS = 300;

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

async function powBindHash(action, fields) {
    const parts = [action || ''];
    for (const f of fields) parts.push(String(f == null ? '' : f));
    const msg = parts.join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

const ENV_FONT_CANDIDATES = [
    'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Tahoma',
    'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Segoe UI', 'Calibri', 'Cambria',
    'Helvetica Neue', 'Roboto', 'Ubuntu', 'Noto Sans CJK SC', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', 'SimSun', 'SimHei', 'KaiTi', 'WenQuanYi Micro Hei'
];

function envProbeCanvas(nonce) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.textBaseline = 'top';
        ctx.font = '16px "Arial"';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#069';
        ctx.fillText('WHUT|' + nonce, 2, 15);
        ctx.fillStyle = 'rgba(102,204,0,0.7)';
        ctx.font = '14px "Microsoft YaHei"';
        ctx.fillText('人机验证|' + nonce, 4, 32);
        ctx.globalCompositeOperation = 'multiply';
        ctx.beginPath();
        ctx.arc(140, 30, 25, 0, Math.PI * 2);
        ctx.fill();
        return canvas.toDataURL();
    } catch (e) {
        return null;
    }
}

function envProbeWebGL() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return null;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        const line = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
        const params = [
            gl.getParameter(gl.VERSION),
            gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            gl.getParameter(gl.MAX_TEXTURE_SIZE),
            gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
            gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
            gl.getParameter(gl.MAX_VARYING_VECTORS),
            Array.isArray(line) || line ? Array.from(line).join('/') : '',
            Array.isArray(dims) || dims ? Array.from(dims).join('/') : ''
        ].join(',');
        return {
            vendor: String(vendor == null ? '' : vendor),
            renderer: String(renderer == null ? '' : renderer),
            params
        };
    } catch (e) {
        return null;
    }
}

function envProbeAudio(nonce) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(Number.isFinite(value) ? value : 0);
        };
        try {
            const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!OfflineCtx) { done(0); return; }
            const ctx = new OfflineCtx(1, 44100, 44100);
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = 2000 + (parseInt(nonce.slice(0, 4), 16) % 8000);
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -50;
            comp.knee.value = 40;
            comp.ratio.value = 12;
            comp.attack.value = 0;
            comp.release.value = 0.25;
            osc.connect(comp);
            comp.connect(ctx.destination);
            osc.start(0);
            const finish = (buffer) => {
                try {
                    const data = buffer.getChannelData(0);
                    let sum = 0;
                    const end = Math.min(6000, data.length);
                    for (let i = 4000; i < end; i++) sum += Math.abs(data[i]);
                    done(sum);
                } catch (e) {
                    done(0);
                }
            };
            if (typeof ctx.oncomplete !== 'undefined') {
                ctx.oncomplete = (e) => finish(e.renderedBuffer);
            }
            setTimeout(() => done(0), 2500);
            const pending = ctx.startRendering();
            if (pending && typeof pending.then === 'function') {
                pending.then(finish).catch(() => done(0));
            }
        } catch (e) {
            done(0);
        }
    });
}

function envProbeFonts(nonce) {
    try {
        const bases = ['monospace', 'sans-serif', 'serif'];
        const span = document.createElement('span');
        span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:72px;white-space:nowrap;';
        span.textContent = 'mmmmmmmmmmlliWHUT' + nonce.slice(0, 6) + '资源';
        document.body.appendChild(span);
        const baseline = {};
        for (const b of bases) {
            span.style.fontFamily = b;
            baseline[b] = span.offsetWidth + 'x' + span.offsetHeight;
        }
        let count = 0;
        for (const font of ENV_FONT_CANDIDATES) {
            let detected = false;
            for (const b of bases) {
                span.style.fontFamily = `'${font}',${b}`;
                if (span.offsetWidth + 'x' + span.offsetHeight !== baseline[b]) {
                    detected = true;
                    break;
                }
            }
            if (detected) count++;
        }
        span.remove();
        return count;
    } catch (e) {
        return 0;
    }
}

function envProbeHardware() {
    const nav = navigator || {};
    const cores = Number(nav.hardwareConcurrency);
    const memory = Number(nav.deviceMemory);
    const dpr = Number(window.devicePixelRatio);
    let tzOffset = 0;
    try { tzOffset = -new Date().getTimezoneOffset(); } catch (e) { tzOffset = 0; }
    return {
        cores: Number.isInteger(cores) && cores >= 1 ? cores : 1,
        memory: Number.isInteger(memory) && memory >= 0 ? memory : 0,
        tzOffset: Number.isFinite(tzOffset) ? Math.round(tzOffset) : 0,
        langs: String(nav.language || (nav.languages && nav.languages[0]) || ''),
        dpr: Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
        touch: ('ontouchstart' in window) || Number(nav.maxTouchPoints) > 0
    };
}

function envProbeRaf() {
    return new Promise((resolve) => {
        try {
            const start = performance.now();
            let done = false;
            const fallback = setTimeout(() => {
                if (done) return;
                done = true;
                resolve(16.7);
            }, 300);
            requestAnimationFrame(() => {
                if (done) return;
                done = true;
                clearTimeout(fallback);
                const delta = performance.now() - start;
                resolve(delta > 0 && delta <= 200 ? delta : 16.7);
            });
        } catch (e) {
            resolve(16.7);
        }
    });
}

async function collectEnvSignals(nonce, hashRate) {
    const canvasRaw = envProbeCanvas(nonce);
    if (!canvasRaw) throw new Error('当前环境不支持 Canvas，请使用标准浏览器访问');
    const webgl = envProbeWebGL();
    if (!webgl) throw new Error('当前环境不支持 WebGL，请使用标准浏览器访问');
    const [audio, raf] = await Promise.all([envProbeAudio(nonce), envProbeRaf()]);
    return {
        canvas: await sha256Hex(canvasRaw),
        webgl,
        audio,
        fonts: envProbeFonts(nonce),
        hardware: envProbeHardware(),
        timing: { raf: raf > 0 && raf <= 200 ? raf : 16.7, hashRate: Math.max(1, Math.round(hashRate) || 1) }
    };
}

async function buildEnvProof(nonce, hashRate) {
    const signals = await collectEnvSignals(nonce, hashRate);
    const digest = await sha256Hex(`${nonce}|${canonicalJson(signals)}`);
    return { nonce, digest, signals };
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
        var bindHash = e.data.bindHash || '';
        var x0 = await hashHex(challenge + ':' + bindHash);
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

function solveChainInWorker(challenge, steps, interval, bindHash, onProgress) {
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
        worker.postMessage({ type: 'solve', challenge, steps, interval, bindHash });
    });
}

async function fetchPowChallenge(hashRate, escalateBits, action, bindHash) {
    const powApiUrl = (typeof API_ENDPOINTS !== 'undefined' && API_ENDPOINTS.pow) ? API_ENDPOINTS.pow : '/api/pow';
    const res = await fetch(powApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: action || 'challenge',
            hashRate: Math.max(0, Math.round(hashRate) || 0),
            escalateBits: escalateBits || 0,
            bind: bindHash || ''
        })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '获取 PoW 挑战失败');
    return {
        challenge: data.challenge,
        bits: data.bits,
        steps: data.steps,
        interval: data.interval,
        envNonce: data.envNonce || '',
        requiresBrowser: !!data.requiresBrowser,
        expiresIn: data.expiresIn
    };
}

async function solvePowChallenge(onProgress, escalateBits, action, bindFields) {
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'benchmark', challenge: '' });
    const hashRate = await powBenchmarkInWorker(POW_BENCHMARK_MS);
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'benchmark_done', challenge: '', hashRate });
    const bindHash = (bindFields && bindFields.length) ? await powBindHash(action, bindFields) : '';
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'fetching', challenge: '' });
    const { challenge, bits, steps, interval, envNonce } = await fetchPowChallenge(hashRate, escalateBits, action, bindHash);
    if (onProgress) onProgress({ step: 0, hash: '', phase: 'solving', challenge });
    const solvePromise = solveChainInWorker(challenge, steps, interval, bindHash, (p) => {
        if (onProgress) onProgress({ step: p.step, hash: p.hash, phase: p.phase || 'computing', totalSteps: steps });
    });
    const envPromise = envNonce ? buildEnvProof(envNonce, hashRate) : Promise.resolve(null);
    const [{ checkpoints }, powEnv] = await Promise.all([solvePromise, envPromise]);
    return { powChallenge: challenge, powCheckpoints: checkpoints, powBits: bits, powBind: bindHash, powEnv: powEnv || undefined };
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
    let escalateBits = 0;
    let action = riskAction || '';
    powEl.classList.add('pow-idle');
    powEl.style.cursor = 'pointer';

    powEl.onclick = async () => {
        if (solved || solving) return;
        solving = true;
        powEl.style.cursor = 'default';
        try {
            const bindFields = typeof getBindFields === 'function' ? getBindFields() : [];
            result = await solvePowChallenge((p) => updatePowUI(powEl, p), escalateBits, action, bindFields);
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
        setEscalateBits: (b) => { escalateBits = Math.max(0, Number(b) || 0); },
        setMinBits: (b) => { escalateBits = Math.max(escalateBits, Number(b) || 0); },
        reset: () => { solved = false; solving = false; result = null; powEl.classList.add('pow-idle'); powEl.classList.remove('pow-done', 'pow-working'); powEl.style.cursor = 'pointer'; updatePowUI(powEl, { phase: 'idle', step: 0, hash: '' }); const rankEl = powEl.querySelector('.pow-rank'); if (rankEl) { rankEl.style.display = 'none'; rankEl.innerHTML = ''; } },
        meetsRequired: () => solved && !!result && result.powBits >= escalateBits,
        requiredBits: () => escalateBits,
        el: powEl
    };
}