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
        mainCountdownTimer,
        warningMsg = '暂未收到邮件，请检查信息无误后再次点击检查。'
    } = options;
    btn.disabled = true;
    let totalWaitMs = 60000;
    let remainingWaitMs = totalWaitMs;
    let checkCount = 0;
    const maxChecks = 12;
    const checkIntervalMs = 5000;
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
