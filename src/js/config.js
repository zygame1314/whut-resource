const API_BASE = 'https://resource.haoli.site';
const API_ENDPOINTS = {
    auth: `${API_BASE}/api/auth`,
    upload: `${API_BASE}/api/upload`,
    files: `${API_BASE}/api/files`,
    download: `${API_BASE}/api/download`,
    preview: `${API_BASE}/api/preview`,
    sync: `${API_BASE}/api/sync`,
    guestbook: `${API_BASE}/api/guestbook`,
    guestbookAi:      `${API_BASE}/api/guestbook-ai`,
    todos:             `${API_BASE}/api/todos`,
    boosts: `${API_BASE}/api/file-boosts`,
    announcements: `${API_BASE}/api/announcements`,
    batchDownload: `${API_BASE}/api/batch-download`,
    aiSearch: `${API_BASE}/api/ai-search`,
    reindex: `${API_BASE}/api/reindex`,
    pathRecommend: `${API_BASE}/api/path-recommend`,
    adminManagement: `${API_BASE}/api/admin-management`,
    downloadLog: `${API_BASE.replace(/^http/, 'ws')}/api/ws`,
    maintenance: `${API_BASE}/api/maintenance`,
    urlSafety: `${API_BASE}/api/url-safety`,
    passkey: `${API_BASE}/api/passkey`,
    siteStats: `${API_BASE}/api/site-stats`,
    userRole: `${API_BASE}/api/admin-management`,
    oauth: `${API_BASE}/api/oauth`,
    oauthAuthorize: `${API_BASE}/api/oauth/authorize`,
    oauthToken: `${API_BASE}/api/oauth/token`,
    oauthUserinfo: `${API_BASE}/api/oauth/userinfo`,
    oauthAdmin: `${API_BASE}/api/oauth-admin`,
    pow: `${API_BASE}/api/pow`
};
window.filesApiCache = {
    _cache: {},
    _load(key) {
        try {
            const raw = sessionStorage.getItem('fac_' + key);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (Date.now() - entry.timestamp > entry.maxAge) {
                sessionStorage.removeItem('fac_' + key);
                return null;
            }
            return entry.data;
        } catch (e) {
            return null;
        }
    },
    _save(key, data, maxAge) {
        try {
            sessionStorage.setItem('fac_' + key, JSON.stringify({ data, timestamp: Date.now(), maxAge }));
        } catch (e) {}
    },
    _remove(key) {
        try {
            if (key) sessionStorage.removeItem('fac_' + key);
            else {
                Object.keys(sessionStorage).forEach(k => {
                    if (k.startsWith('fac_')) sessionStorage.removeItem(k);
                });
            }
        } catch (e) {}
    },
    get(key, maxAgeMs) {
        const inMem = this._cache[key];
        if (inMem && Date.now() - inMem.timestamp <= maxAgeMs) return inMem.data;
        const fromSS = this._load(key);
        if (fromSS) {
            this._cache[key] = { data: fromSS, timestamp: JSON.parse(sessionStorage.getItem('fac_' + key)).timestamp };
            return fromSS;
        }
        return null;
    },
    set(key, data) {
        this._cache[key] = { data, timestamp: Date.now() };
        this._save(key, data, 3600000);
    },
    invalidate(key) {
        if (key) {
            delete this._cache[key];
            this._remove(key);
        } else {
            this._cache = {};
            this._remove();
        }
    }
};
async function fetchCached(url, cacheKey, maxAgeMs, options = {}) {
    const cached = window.filesApiCache.get(cacheKey, maxAgeMs);
    if (cached) return cached;
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    window.filesApiCache.set(cacheKey, result);
    return result;
}
window.filterTreeByKeyword = function (container, keyword, options = {}) {
    const {
        nodeSelector = '.folder-tree-node',
        itemSelector = '.folder-tree-item',
        nameSelector = '.folder-name',
        listSelector = '.folder-tree-list',
        toggleSelector = '.folder-toggle-icon',
        expandClass = 'expanded',
        useTransform = false
    } = options;
    const nodes = container.querySelectorAll(nodeSelector);
    const items = container.querySelectorAll(itemSelector);
    const lowerKeyword = keyword.toLowerCase().trim();
    if (!lowerKeyword) {
        nodes.forEach(node => {
            node.style.display = '';
        });
        container.querySelectorAll(listSelector).forEach(list => {
            if (list.parentElement === container) return;
            const parentItem = list.previousElementSibling;
            if (parentItem && !parentItem.classList.contains('active') && !parentItem.classList.contains('selected')) {
                list.style.display = 'none';
                const toggleIcon = parentItem.querySelector(toggleSelector);
                if (toggleIcon) {
                    if (useTransform) {
                        toggleIcon.style.transform = '';
                    } else {
                        toggleIcon.classList.remove(expandClass);
                    }
                }
                if (parentItem.dataset && parentItem.dataset.expanded !== undefined) {
                    parentItem.dataset.expanded = 'false';
                }
            }
        });
        return;
    }
    nodes.forEach(node => {
        node.style.display = 'none';
    });
    items.forEach(item => {
        const nameElement = item.querySelector(nameSelector);
        const text = nameElement ? nameElement.textContent.toLowerCase() : '';
        if (text.includes(lowerKeyword)) {
            let currentNode = item.closest(nodeSelector);
            while (currentNode) {
                currentNode.style.display = '';
                const parentList = currentNode.parentElement;
                if (parentList && parentList.matches(listSelector)) {
                    parentList.style.display = 'block';
                    const parentNode = parentList.closest(nodeSelector);
                    if (parentNode) {
                        const parentItem = parentNode.querySelector(':scope > ' + itemSelector);
                        if (parentItem) {
                            const toggleIcon = parentItem.querySelector(toggleSelector);
                            if (toggleIcon) {
                                if (useTransform) {
                                    toggleIcon.style.transform = 'rotate(90deg)';
                                } else {
                                    toggleIcon.classList.add(expandClass);
                                }
                            }
                        }
                    }
                }
                currentNode = currentNode.parentElement.closest(nodeSelector);
            }
        }
    });
};
window.escapeHtml = function (text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};
window.showNotification = function (message, type = 'info', duration = 3000) {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    const icon = icons[type] || icons.info;
    const titles = {
        success: '成功',
        error: '错误',
        warning: '警告',
        info: '提示'
    };
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.innerHTML = `
        <div class="notification-icon"><i class="${icon}"></i></div>
        <div class="notification-body">
            <div class="notification-title">${titles[type] || titles.info}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" aria-label="关闭" type="button">
            <i class="fas fa-times"></i>
        </button>
        <div class="notification-progress"></div>
    `;
    container.appendChild(notification);
    // 强制重排以应用基础态，再用双 RAF 触发进入动画
    void notification.offsetWidth;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            notification.classList.add('notification-show');
        });
    });
    const progressBar = notification.querySelector('.notification-progress');
    let lastPct = 1;          // 当前进度比例（1 = 满）
    let pauseAt = 0;           // 本段计时起点时间戳
    let elapsedInSlice = 0;    // 本段已用时长
    let rafId = null;
    let timeoutId = null;
    let isRemoved = false;

    const updateProgress = (pct) => {
        lastPct = pct;
        if (progressBar) progressBar.style.transform = `scaleX(${pct})`;
    };

    const tick = (now) => {
        const elapsed = elapsedInSlice + (now - pauseAt);
        const pct = Math.max(0, 1 - elapsed / duration);
        updateProgress(pct);
        if (pct > 0) {
            rafId = requestAnimationFrame(tick);
        } else {
            removeNotification();
        }
    };
    const removeNotification = () => {
        if (isRemoved) return;
        isRemoved = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (rafId) cancelAnimationFrame(rafId);
        notification.classList.remove('notification-show');
        notification.classList.add('notification-leave');
        const onEnd = () => {
            notification.remove();
            if (container.children.length === 0 && container.parentNode) {
                container.remove();
            }
        };
        notification.addEventListener('transitionend', onEnd, { once: true });
        setTimeout(onEnd, 400);
    };
    // 从当前进度继续计时
    const startTimer = () => {
        if (lastPct <= 0) return;
        elapsedInSlice = (1 - lastPct) * duration;
        pauseAt = performance.now();
        rafId = requestAnimationFrame(tick);
        // 仅用 timeout 兜底，进度条由 RAF 驱动
        timeoutId = setTimeout(removeNotification, lastPct * duration);
    };
    const pauseTimer = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (rafId) cancelAnimationFrame(rafId);
        // 累计本段已用时长，并同步当前进度
        elapsedInSlice += (performance.now() - pauseAt);
        updateProgress(Math.max(0, 1 - elapsedInSlice / duration));
    };
    notification.addEventListener('mouseenter', pauseTimer);
    notification.addEventListener('mouseleave', startTimer);
    notification.addEventListener('click', removeNotification);
    notification.querySelector('.notification-close').addEventListener('click', (e) => {
        e.stopPropagation();
        removeNotification();
    });
    startTimer();
};
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker 注册成功:', reg.scope))
            .catch(err => console.log('Service Worker 注册失败:', err));
    });
}
