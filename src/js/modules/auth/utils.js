function isAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}
function isSuperAdmin(user) {
    return user && user.role === 'super_admin';
}
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatDateLocal(dateString) {
    if (!dateString) return '';
    let date;
    if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
        date = new Date(dateString.replace(' ', 'T') + 'Z');
    } else {
        date = new Date(dateString);
    }
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
async function startEmailStatusPolling(btn, options) {
    const {
        action,
        payload = {},
        onSuccess,
        onExpired,
        onWrongSender,
        mainCountdownTimer,
        warningMsg = '暂未收到邮件，请检查信息无误后再次点击检查。'
    } = options;
    btn.disabled = true;
    let totalWaitMs = 60000;
    let remainingWaitMs = totalWaitMs;
    let checkCount = 0;
    const maxChecks = 12;
    const checkIntervalMs = 5000;
    let lastWrongSender = null;
    const updateBtnText = () => {
        const seconds = Math.ceil(remainingWaitMs / 1000);
        const textSpan = btn.querySelector('.wait-text');
        if (textSpan) {
            textSpan.textContent = `正在确认收件(${seconds}s)...`;
        } else {
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span class="wait-text">正在确认收件(${seconds}s)...</span>`;
        }
    };
    updateBtnText();
    let cdTimer = setInterval(() => {
        remainingWaitMs -= 1000;
        if (remainingWaitMs <= 0) {
            clearInterval(cdTimer);
        } else {
            updateBtnText();
        }
    }, 1000);
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let isHandled = false;
    try {
        while (checkCount < maxChecks) {
            const fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            };
            if (typeof token !== 'undefined' && token) {
                fetchOptions.headers['Authorization'] = `Bearer ${token}`;
            }
            const statusRes = await fetch(AUTH_API_URL, {
                ...fetchOptions,
                body: JSON.stringify({ action, ...payload })
            });
            const statusData = await statusRes.json();
            const isCompleted = statusData.activated || (statusData.success && statusData.completed && !statusData.pending);
            if (isCompleted) {
                isHandled = true;
                if (mainCountdownTimer) clearInterval(mainCountdownTimer);
                clearInterval(cdTimer);
                if (onSuccess) onSuccess();
                return;
            } else if (statusData.expired) {
                isHandled = true;
                if (mainCountdownTimer) clearInterval(mainCountdownTimer);
                clearInterval(cdTimer);
                if (onExpired) onExpired();
                return;
            } else if (statusData.wrongSender && statusData.wrongSender !== lastWrongSender) {
                lastWrongSender = statusData.wrongSender;
                if (onWrongSender) {
                    onWrongSender(statusData.wrongSender);
                } else {
                    showNotification(`检测到使用 ${statusData.wrongSender} 发送了邮件，但需要用注册时的邮箱发送验证码，请用正确的邮箱重新发送。`, 'warning', 8000);
                }
            }
            checkCount++;
            if (checkCount < maxChecks) {
                await delay(checkIntervalMs);
            }
        }
    } catch (err) {
        console.error('检查状态失败:', err);
    } finally {
        clearInterval(cdTimer);
        if (btn.disabled) {
            if (!isHandled) {
                showNotification(warningMsg, 'warning');
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> 我已发送邮件';
        }
    }
}
function closeAuthModal(modal, onAfterRemove) {
    if (!modal || modal.classList.contains('closing')) return;
    modal.classList.add('closing');
    let removed = false;
    const removeModal = () => {
        if (removed) return;
        removed = true;
        if (modal.parentNode) modal.remove();
        if (typeof onAfterRemove === 'function') onAfterRemove();
    };
    modal.addEventListener('animationend', removeModal, { once: true });
    setTimeout(removeModal, 350);
}
function getDeviceName() {
    const ua = navigator.userAgent;
    const platform = navigator.platform || '';
    let device = '';
    const iphoneMatch = ua.match(/iPhone OS (\d+)[_.](\d+)/);
    if (iphoneMatch) { device = `iPhone (iOS ${iphoneMatch[1]}.${iphoneMatch[2]})`; }
    const ipadMatch = ua.match(/iPad.*OS (\d+)[_.](\d+)/);
    if (ipadMatch) { device = `iPad (iPadOS ${ipadMatch[1]}.${ipadMatch[2]})`; }
    if (!device) {
        const miMatch = ua.match(/Redmi\s?([^;)/]+)/i) || ua.match(/Mi\s?(\d+[^;)/]*)/i) || ua.match(/POCO\s?([^;)/]+)/i);
        const samsungMatch = ua.match(/SM-[A-Z0-9]+/i) || ua.match(/Galaxy\s?([^;)/]+)/i);
        const huaweiMatch = ua.match(/HUAWEI\s?([^;)/]+)/i) || ua.match(/(?:HW-)?(?:ALP|BLA|EML|LYA|MAR|PCT|VOG|WAS|LIO|OCE|NOH|NOP|ABR)-[A-Z0-9]+/i);
        const honorMatch = ua.match(/HONOR\s?([^;)/]+)/i);
        const oppoMatch = ua.match(/(?:OPPO|PDCM)\s?([^;)/]+)/i) || ua.match(/PG[A-Z]{2}\d+/i);
        const vivoMatch = ua.match(/vivo\s?([^;)/]+)/i) || ua.match(/V\d{4}[A-Z]?/i);
        const oneplusMatch = ua.match(/(?:ONEPLUS|KB)\s?([^;)/]+)/i);
        const pixelMatch = ua.match(/Pixel\s?([^;)/]+)/i);
        const androidMatch = ua.match(/Android\s?(\d+[\.\d]*)/i);
        const androidVer = androidMatch ? androidMatch[1] : '';
        if (miMatch) device = `小米 ${miMatch[1] ? miMatch[1].trim() : ''}`;
        else if (samsungMatch) device = `三星 ${samsungMatch[0]}`;
        else if (huaweiMatch) device = `华为 ${huaweiMatch[1] ? huaweiMatch[1].trim() : huaweiMatch[0]}`;
        else if (honorMatch) device = `荣耀 ${honorMatch[1] ? honorMatch[1].trim() : ''}`;
        else if (oneplusMatch) device = `一加 ${oneplusMatch[1] ? oneplusMatch[1].trim() : ''}`;
        else if (oppoMatch) device = `OPPO ${oppoMatch[1] ? oppoMatch[1].trim() : ''}`;
        else if (vivoMatch) device = `vivo ${vivoMatch[1] ? vivoMatch[1].trim() : ''}`;
        else if (pixelMatch) device = `Pixel ${pixelMatch[1]}`;
        else if (androidVer) device = `Android ${androidVer}`;
    }
    if (!device) {
        const macMatch = ua.match(/Mac OS X (\d+)[_.](\d+)/);
        if (macMatch) device = `Mac (macOS ${macMatch[1]}.${macMatch[2]})`;
    }
    if (!device && /Windows/i.test(ua)) {
        const winVer = ua.match(/Windows NT (\d+\.\d+)/);
        const verMap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
        device = `Windows ${winVer ? (verMap[winVer[1]] || winVer[1]) : ''}`;
    }
    if (!device) device = platform || '未知设备';
    let browser = '';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    return browser ? `${device} · ${browser}` : device;
}
function showMaintenanceOverlay(message) {
    let overlay = document.getElementById('maintenance-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    } else {
        overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';
        overlay.className = 'maintenance-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = '<div class="maintenance-box">' +
            '<i class="fas fa-tools maintenance-icon"></i>' +
            '<h1 class="maintenance-title">系统维护中</h1>' +
            '<p id="maintenance-message" class="maintenance-message"></p>' +
            '<div class="maintenance-footer"><span class="loading-dots">正在努力施工</span></div>' +
            '</div>';
        document.body.insertBefore(overlay, document.body.firstChild);
    }
    const msgEl = document.getElementById('maintenance-message');
    if (msgEl) msgEl.textContent = message || '系统正在进行升级维护，请稍候访问...';
    document.body.style.overflow = 'hidden';
    if (window.releaseRequests) window.releaseRequests(false);
    console.warn('%c 维护模式已开启 ', 'background: #ff0000; color: #ffffff; font-size: 14px; padding: 4px;');
}
