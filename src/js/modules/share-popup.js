(function () {
    'use strict';
    const STORAGE_DOWNLOAD_COUNT = 'sharePopupDownloadCount';
    const STORAGE_HIDE_UNTIL = 'sharePopupHideUntil';
    const STORAGE_LAST_SHOWN_AT = 'sharePopupLastShownAt';
    const HIDE_DAYS = 30;
    const MIN_INTERVAL_DAYS = 7;
    const FIRST_THRESHOLD = 5;
    const REPEAT_INTERVAL = 10;

    function getNow() { return Date.now(); }
    function daysMs(days) { return days * 24 * 60 * 60 * 1000; }

    function recordDownload(delta = 1) {
        const count = Number(localStorage.getItem(STORAGE_DOWNLOAD_COUNT) || 0) + delta;
        localStorage.setItem(STORAGE_DOWNLOAD_COUNT, String(count));
        return count;
    }

    function shouldShow(count) {
        if (getNow() < Number(localStorage.getItem(STORAGE_HIDE_UNTIL) || 0)) return false;
        const lastShown = Number(localStorage.getItem(STORAGE_LAST_SHOWN_AT) || 0);
        if (lastShown && (getNow() - lastShown) < daysMs(MIN_INTERVAL_DAYS)) return false;
        if (count === FIRST_THRESHOLD) return true;
        if (count > FIRST_THRESHOLD && (count - FIRST_THRESHOLD) % REPEAT_INTERVAL === 0) return true;
        return false;
    }

    function getSiteShareText() {
        return [
            '📚 武理资源共享平台',
            '一个无偿分享 WHUT 学习资料的小站，历年试卷、课件、笔记都有。独乐乐不如众乐乐，欢迎加入，也欢迎共建～',
            '🔗 ' + (window.location.origin + (window.location.pathname === '/' ? '' : window.location.pathname))
        ].join('\n');
    }

    function copySiteLink() {
        const text = getSiteShareText();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function canNativeShare() {
        return isMobile() &&
            typeof navigator !== 'undefined' &&
            typeof navigator.share === 'function';
    }

    async function nativeShare() {
        const url = window.location.origin + (window.location.pathname === '/' ? '' : window.location.pathname);
        const title = '武理资源共享平台';
        const text = '一个无偿共享 WHUT 学习资料的小站，欢迎加入，也欢迎共建';
        try {
            await navigator.share({ title, text, url });
            return true;
        } catch (e) {
            if (e && e.name === 'AbortError') return false;
            console.warn('原生分享失败:', e);
            return false;
        }
    }

    function createModal(downloadCount) {
        const overlay = document.createElement('div');
        overlay.className = 'share-popup-overlay';
        overlay.innerHTML = `
            <div class="share-popup">
                <button class="share-popup-close-btn" aria-label="关闭">&times;</button>
                <div class="share-popup-header">
                    <div class="share-popup-icon"><i class="fas fa-share-alt"></i></div>
                    <h3>独乐乐不如众乐乐</h3>
                    <p class="share-popup-subtitle">你已累计下载 <strong>${downloadCount}</strong> 份资料，收获满满！</p>
                </div>
                <div class="share-popup-body">
                    <p class="share-popup-desc">这里的资源都是校友们无偿贡献的。如果它帮到了你，不妨把站点分享给身边的同学，让更多人能够受益！</p>
                    <button class="share-popup-native-btn" style="display:none;" title="唤起系统分享菜单">
                        <i class="fas fa-share-alt"></i>
                        <span>分享给同学</span>
                    </button>
                    <div class="share-popup-actions">
                        <button class="share-popup-copy-btn" title="复制站点链接和介绍">
                            <i class="fas fa-link"></i>
                            <span>复制链接</span>
                        </button>
                    </div>
                </div>
                <div class="share-popup-footer">
                    <label class="custom-checkbox share-popup-hide-checkbox">
                        <input type="checkbox" id="share-popup-hide-checkbox">
                        <span class="checkmark"></span>
                        <span class="label-text">30天内不再提示</span>
                    </label>
                    <button class="share-popup-dismiss-btn">知道了</button>
                </div>
            </div>
        `;
        return overlay;
    }

    function closeModal(overlay, hideChecked) {
        if (hideChecked) {
            localStorage.setItem(STORAGE_HIDE_UNTIL, String(getNow() + daysMs(HIDE_DAYS)));
        }
        localStorage.setItem(STORAGE_LAST_SHOWN_AT, String(getNow()));
        overlay.classList.add('closing');
        overlay.addEventListener('animationend', () => {
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
            }
        }, { once: true });
    }

    function showSharePopup(downloadCount) {
        const overlay = createModal(downloadCount);
        document.body.appendChild(overlay);

        const close = () => {
            const checkbox = overlay.querySelector('#share-popup-hide-checkbox');
            closeModal(overlay, checkbox && checkbox.checked);
        };

        overlay.querySelector('.share-popup-close-btn').addEventListener('click', close);
        overlay.querySelector('.share-popup-dismiss-btn').addEventListener('click', close);
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onKey);
                close();
            }
        });

        const copyBtn = overlay.querySelector('.share-popup-copy-btn');
        copyBtn.addEventListener('click', async () => {
            const span = copyBtn.querySelector('span');
            const original = span ? span.textContent : '';
            try {
                await copySiteLink();
                if (span) span.textContent = '已复制';
                if (typeof showNotification === 'function') {
                    showNotification('站点链接已复制，快去分享给同学吧！', 'success');
                }
            } catch (err) {
                if (typeof showNotification === 'function') {
                    showNotification('复制失败，请手动复制', 'error');
                }
            } finally {
                setTimeout(() => { if (span) span.textContent = original; }, 2000);
            }
        });

        const nativeBtn = overlay.querySelector('.share-popup-native-btn');
        if (nativeBtn && canNativeShare()) {
            nativeBtn.style.display = '';
            nativeBtn.addEventListener('click', async () => {
                const ok = await nativeShare();
                if (ok && typeof showNotification === 'function') {
                    showNotification('感谢分享，让更多人受益～', 'success');
                }
            });
        }
    }

    function bindDownloadTracking() {
        if (!window.DownloadManager) return;
        let pendingCount = 0;
        window.DownloadManager.on('taskCompleted', ({ task }) => {
            pendingCount++;
            const fileCount = (task && task.files && task.files.length) || 1;
            const count = recordDownload(fileCount);
            if (shouldShow(count) && pendingCount >= 1) {
                pendingCount = 0;
                setTimeout(() => showSharePopup(count), 1500);
            }
        });
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindDownloadTracking);
        } else {
            bindDownloadTracking();
        }
    }

    init();
})();