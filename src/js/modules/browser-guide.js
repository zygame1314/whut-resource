(function () {
    const INAPP_STORAGE_KEY = 'browser_guide_dismissed';

    function detectInAppBrowser() {
        const ua = navigator.userAgent.toLowerCase();
        const isWeChat = /micromessenger/i.test(ua);
        const isQQ = /\bqq\b/i.test(ua) || /mqqbrowser/i.test(ua);
        if (isWeChat) return 'wechat';
        if (isQQ) return 'qq';
        return null;
    }

    function isInAppBrowser() {
        return detectInAppBrowser() !== null;
    }

    function getBrowserType() {
        return detectInAppBrowser();
    }

    function getBrowserName(type) {
        if (type === 'wechat') return '微信';
        if (type === 'qq') return 'QQ';
        return '内置浏览器';
    }

    function isDismissed() {
        const val = localStorage.getItem(INAPP_STORAGE_KEY);
        if (!val) return false;
        try {
            const data = JSON.parse(val);
            return data.type === getBrowserType() && Date.now() < data.expire;
        } catch {
            return false;
        }
    }

    function dismiss() {
        const expire = Date.now() + 7 * 24 * 60 * 60 * 1000;
        localStorage.setItem(INAPP_STORAGE_KEY, JSON.stringify({ type: getBrowserType(), expire }));
        const overlay = document.getElementById('browser-guide-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
        const arrow = document.querySelector('.browser-guide-arrow');
        if (arrow) arrow.remove();
    }

    function copyAndOpen() {
        const url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                onCopySuccess();
            }).catch(() => {
                fallbackCopy(url);
            });
        } else {
            fallbackCopy(url);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            onCopySuccess();
        } catch { }
        document.body.removeChild(ta);
    }

    function onCopySuccess() {
        const btn = document.getElementById('browser-guide-copy-btn');
        if (btn) {
            btn.classList.add('copied');
            btn.innerHTML = '<i class="fas fa-check"></i> 已复制链接';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = '<i class="fas fa-copy"></i> 复制链接到浏览器打开';
            }, 2000);
        }
    }

    function createOverlay() {
        const type = getBrowserType();
        const browserName = getBrowserName(type);

        let steps = '';
        if (type === 'wechat') {
            steps = `
                <div class="browser-guide-step">
                    <span class="browser-guide-step-num">1</span>
                    <span>点击右上角 <strong>⋯</strong> 按钮</span>
                </div>
                <div class="browser-guide-step">
                    <span class="browser-guide-step-num">2</span>
                    <span>选择 <strong>"在浏览器中打开"</strong> 或 <strong>"在默认浏览器中打开"</strong></span>
                </div>`;
        } else if (type === 'qq') {
            steps = `
                <div class="browser-guide-step">
                    <span class="browser-guide-step-num">1</span>
                    <span>点击右上角 <strong>⋯</strong> 或底部 <strong>☰</strong> 菜单</span>
                </div>
                <div class="browser-guide-step">
                    <span class="browser-guide-step-num">2</span>
                    <span>选择 <strong>"在浏览器中打开"</strong></span>
                </div>`;
        }

        const overlay = document.createElement('div');
        overlay.id = 'browser-guide-overlay';
        overlay.className = 'browser-guide-overlay';
        overlay.innerHTML = `
            <div class="browser-guide-arrow">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M 8 40 Q 16 16 36 8" stroke="#FF4757" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M 36 8 L 28 4" stroke="#FF4757" stroke-width="3.5" stroke-linecap="round"/>
                    <path d="M 36 8 L 34 16" stroke="#FF4757" stroke-width="3.5" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="browser-guide-card">
                <div class="browser-guide-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="browser-guide-title">检测到${browserName}内置浏览器</div>
                <div class="browser-guide-desc">
                    当前页面在 <strong>${browserName}</strong> 内置浏览器中运行，可能出现功能异常或无法正常使用。<br>
                    建议在系统浏览器中打开以获得最佳体验。
                </div>
                <div class="browser-guide-steps">
                    <div class="browser-guide-steps-title">如何切换到浏览器打开：</div>
                    ${steps}
                </div>
                <div class="browser-guide-actions">
                    <button id="browser-guide-copy-btn" class="browser-guide-copy-btn" type="button">
                        <i class="fas fa-copy"></i> 复制链接到浏览器打开
                    </button>
                    <button id="browser-guide-dismiss-btn" class="browser-guide-dismiss-btn" type="button">
                        继续使用内置浏览器（可能遇到问题）
                    </button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector('#browser-guide-copy-btn').addEventListener('click', copyAndOpen);
        overlay.querySelector('#browser-guide-dismiss-btn').addEventListener('click', dismiss);

        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }

    if (isInAppBrowser() && !isDismissed()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createOverlay);
        } else {
            createOverlay();
        }
    }
})();