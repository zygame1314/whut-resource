(function () {
    const STORAGE_FIRST_VISIT = 'donationFirstVisit';
    const STORAGE_VISIT_COUNT = 'donationVisitCount';
    const STORAGE_HIDE_UNTIL = 'donationHideUntil';
    const MIN_DAYS = 3;
    const MIN_VISITS = 5;
    const HIDE_DAYS = 30;

    function getNow() { return Date.now(); }
    function daysMs(days) { return days * 24 * 60 * 60 * 1000; }

    function trackVisit() {
        let firstVisit = Number(localStorage.getItem(STORAGE_FIRST_VISIT) || 0);
        if (!firstVisit) {
            firstVisit = getNow();
            localStorage.setItem(STORAGE_FIRST_VISIT, String(firstVisit));
        }
        let count = Number(localStorage.getItem(STORAGE_VISIT_COUNT) || 0);
        count++;
        localStorage.setItem(STORAGE_VISIT_COUNT, String(count));
        return { firstVisit, count };
    }

    function shouldShow(firstVisit, count) {
        const hideUntil = Number(localStorage.getItem(STORAGE_HIDE_UNTIL) || 0);
        if (getNow() < hideUntil) return false;
        const daysPassed = (getNow() - firstVisit) / daysMs(1);
        return daysPassed >= MIN_DAYS && count >= MIN_VISITS;
    }

    function createModal() {
        const overlay = document.createElement('div');
        overlay.className = 'donation-modal-overlay';
        overlay.innerHTML = `
            <div class="donation-modal">
                <button class="donation-close-btn" aria-label="关闭">&times;</button>
                <div class="donation-header">
                    <div class="donation-icon"><i class="fas fa-heart"></i></div>
                    <h3>支持武理资源共享平台</h3>
                    <p class="donation-subtitle">如果这个平台曾帮到你，欢迎请站长喝杯咖啡 ☕</p>
                </div>
                <div class="donation-body">
                    <p class="donation-desc">本站所有文件托管于 Cloudflare R2，运营成本由站长独自承担。你的小小支持是项目长久运营的动力！</p>
                    <div class="donation-qrcodes">
                        <div class="donation-qr-item">
                            <img src="alipay.webp" alt="支付宝收款码" loading="lazy">
                            <span><i class="fab fa-alipay"></i> 支付宝</span>
                        </div>
                        <div class="donation-qr-item">
                            <img src="wechat-pay.webp" alt="微信收款码" loading="lazy">
                            <span><i class="fab fa-weixin"></i> 微信</span>
                        </div>
                    </div>
                </div>
                <div class="donation-footer">
                    <label class="custom-checkbox donation-hide-checkbox">
                        <input type="checkbox" id="donation-hide-checkbox">
                        <span class="checkmark"></span>
                        <span class="label-text">30天内不再提示</span>
                    </label>
                    <button class="donation-thanks-btn">感谢支持</button>
                </div>
            </div>
        `;
        return overlay;
    }

    function closeModal(overlay) {
        const hideCheckbox = overlay.querySelector('#donation-hide-checkbox');
        if (hideCheckbox && hideCheckbox.checked) {
            localStorage.setItem(STORAGE_HIDE_UNTIL, String(getNow() + daysMs(HIDE_DAYS)));
        }
        overlay.classList.add('closing');
        overlay.addEventListener('animationend', () => {
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
            }
        }, { once: true });
    }

    function showDonationPopup() {
        const overlay = createModal();
        document.body.appendChild(overlay);

        overlay.querySelector('.donation-close-btn').addEventListener('click', () => closeModal(overlay));
        overlay.querySelector('.donation-thanks-btn').addEventListener('click', () => closeModal(overlay));
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) closeModal(overlay);
        });
        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onKey);
                closeModal(overlay);
            }
        });
    }

    function init() {
        const { firstVisit, count } = trackVisit();
        if (shouldShow(firstVisit, count)) {
            const show = () => {
                showDonationPopup();
                const overlay = document.querySelector('.donation-modal-overlay');
                if (window.PopupQueue && overlay) {
                    return PopupQueue.waitForDetach(overlay);
                }
            };
            if (window.PopupQueue) {
                PopupQueue.enqueue(show, { priority: 0, delay: 2000 });
            } else if (document.readyState === 'complete') {
                setTimeout(showDonationPopup, 2000);
            } else {
                window.addEventListener('load', () => setTimeout(showDonationPopup, 2000));
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
