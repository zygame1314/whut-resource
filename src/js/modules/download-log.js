(function () {
    const CONTAINER_ID = 'download-log-container';
    const PREF_KEY = 'hideDownloadLog';
    let socket;
    let reconnectInterval = 1000;
    let heartbeatTimer;
    let visibilityDisconnectTimer;
    let isPageVisible = !document.hidden;
    let intentionalClose = false;
    let wasEverConnected = false;
    const MAX_RECONNECT_INTERVAL = 30000;
    const HEARTBEAT_INTERVAL = 30000;
    const VISIBILITY_DISCONNECT_DELAY = 60000;
    const isMobile = window.innerWidth <= 768;
    const MAX_VISIBLE_TOASTS = isMobile ? 1 : 3;
    const TOAST_DURATION = isMobile ? 3000 : 5000;
    const MAX_QUEUE_SIZE = 20;
    const messageQueue = [];
    const activeToasts = new Map();
    let isProcessingQueue = false;
    function isEnabled() {
        return localStorage.getItem(PREF_KEY) !== 'true';
    }
    function ensureContainer() {
        if (!document.getElementById(CONTAINER_ID)) {
            const container = document.createElement('div');
            container.id = CONTAINER_ID;
            container.className = 'download-log-container';
            document.body.appendChild(container);
        }
    }
    function init() {
        if (!isEnabled()) return;
        ensureContainer();
        initVisibilityHandler();
        connect();
    }
    window.toggleDownloadLog = function (enabled) {
        if (enabled) {
            localStorage.removeItem(PREF_KEY);
            ensureContainer();
            if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
                reconnectInterval = 1000;
                connect();
            }
        } else {
            localStorage.setItem(PREF_KEY, 'true');
            activeToasts.forEach((_, filename) => {
                const toastData = activeToasts.get(filename);
                if (toastData && toastData.element && toastData.element.parentNode) {
                    toastData.element.parentNode.removeChild(toastData.element);
                }
            });
            activeToasts.clear();
            messageQueue.length = 0;
            if (socket) {
                if (socket.readyState === WebSocket.OPEN) {
                    intentionalClose = true;
                    socket.close();
                } else if (socket.readyState === WebSocket.CONNECTING) {
                    intentionalClose = true;
                    socket.close();
                }
            }
        }
    };
    window.isDownloadLogEnabled = isEnabled;
    function initVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            isPageVisible = !document.hidden;
            if (isPageVisible) {
                onPageVisible();
            } else {
                onPageHidden();
            }
        });
        window.addEventListener('beforeunload', () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                intentionalClose = true;
                socket.send(JSON.stringify({ type: 'disconnect' }));
            }
        });
    }
    function onPageVisible() {
        if (visibilityDisconnectTimer) {
            clearTimeout(visibilityDisconnectTimer);
            visibilityDisconnectTimer = null;
        }
        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
            console.log('页面可见，正在重新连接下载日志...');
            reconnectInterval = 1000;
            connect();
        } else if (socket.readyState === WebSocket.OPEN && !heartbeatTimer) {
            startHeartbeat();
        }
    }
    function onPageHidden() {
        stopHeartbeat();
        visibilityDisconnectTimer = setTimeout(() => {
            if (!isPageVisible && socket && socket.readyState === WebSocket.OPEN) {
                console.log('页面长时间不可见，断开下载日志连接以节省资源');
                intentionalClose = true;
                socket.close();
            }
        }, VISIBILITY_DISCONNECT_DELAY);
    }
    function startHeartbeat() {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN && isPageVisible) {
                socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, HEARTBEAT_INTERVAL);
    }
    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }
    function connect() {
        if (!isPageVisible) {
            return;
        }
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }
        const maintenanceOverlay = document.getElementById('maintenance-overlay');
        if (maintenanceOverlay && getComputedStyle(maintenanceOverlay).display !== 'none') {
            console.log('维护模式开启中，暂停下载日志连接');
            return;
        }
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            return;
        }
        wasEverConnected = false;
        const wsUrl = `${API_ENDPOINTS.downloadLog}?token=${encodeURIComponent(authToken)}`;
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            console.log('已成功连接到下载日志');
            reconnectInterval = 1000;
            wasEverConnected = true;
            intentionalClose = false;
            startHeartbeat();
        };
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'download') {
                    queueDownloadToast(data.filename);
                } else if (data.type === 'online_count') {
                    document.dispatchEvent(new CustomEvent('siteOnlineCount', { detail: { count: data.count } }));
                } else if (data.type === 'welcome' || data.type === 'pong') {
                }
            } catch (e) {
                console.error('解析 WebSocket 消息出错:', e);
            }
        };
        socket.onclose = () => {
            stopHeartbeat();
            if (intentionalClose || !isPageVisible) {
                intentionalClose = false;
                return;
            }
            const maintenanceOverlay = document.getElementById('maintenance-overlay');
            if (maintenanceOverlay && getComputedStyle(maintenanceOverlay).display !== 'none') {
                console.log('检测到维护模式，停止自动重连');
                return;
            }
            if (!wasEverConnected) {
                console.log('WebSocket 建立失败（鉴权或网络问题），停止重连');
                return;
            }
            console.log('下载日志链接已断开。', reconnectInterval, 'ms 后尝试重连');
            setTimeout(connect, reconnectInterval);
            reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT_INTERVAL);
        };
        socket.onerror = (error) => {
            if (intentionalClose) return;
            console.error('WebSocket 发生错误:', error);
            socket.close();
        };
    }
    function queueDownloadToast(filename) {
        if (!isEnabled()) return;
        if (activeToasts.has(filename)) {
            const toastData = activeToasts.get(filename);
            toastData.count++;
            updateToastCount(toastData);
            return;
        }
        const existingInQueue = messageQueue.find(m => m.filename === filename);
        if (existingInQueue) {
            existingInQueue.count++;
            return;
        }
        messageQueue.push({
            filename,
            count: 1,
            timestamp: Date.now()
        });
        if (messageQueue.length > MAX_QUEUE_SIZE) {
            messageQueue.shift();
        }
        processQueue();
    }
    function processQueue() {
        if (isProcessingQueue) return;
        isProcessingQueue = true;
        const tryShowNext = () => {
            if (activeToasts.size >= MAX_VISIBLE_TOASTS) {
                isProcessingQueue = false;
                return;
            }
            if (messageQueue.length === 0) {
                isProcessingQueue = false;
                return;
            }
            const message = messageQueue.shift();
            showDownloadToast(message.filename, message.count);
            if (activeToasts.size < MAX_VISIBLE_TOASTS && messageQueue.length > 0) {
                setTimeout(tryShowNext, 300);
            } else {
                isProcessingQueue = false;
            }
        };
        tryShowNext();
    }
    function updateToastCount(toastData) {
        const countBadge = toastData.element.querySelector('.download-count');
        if (countBadge) {
            countBadge.textContent = `×${toastData.count}`;
            countBadge.style.display = 'inline';
            countBadge.classList.remove('count-bump');
            void countBadge.offsetWidth;
            countBadge.classList.add('count-bump');
        }
    }
    function showDownloadToast(filename, initialCount = 1, persist = false) {
        const container = document.getElementById(CONTAINER_ID);
        if (!container) return;
        const item = document.createElement('div');
        item.className = 'download-log-item';
        const messages = [
            '一位同学正在获取这份知识',
            '有人发现了这份宝藏资源',
            '学习路上，你并不孤单',
            '满绩路上又多了一位同行者',
            '点滴积累，终成江海',
            '加油，未来的栋梁！',
            '知识 +1，能力 +∞'
        ];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        const countDisplay = initialCount > 1 ? `×${initialCount}` : '';
        const countStyle = initialCount > 1 ? '' : 'display: none;';
        item.innerHTML = `
            <i class="fas fa-download"></i>
            <div class="download-log-content">
                <div class="download-log-title">
                    <span class="filename" title="${filename}">${filename}</span>
                    <span class="download-count" style="${countStyle}">${countDisplay}</span>
                </div>
                <div class="download-log-subtitle">${randomMsg}</div>
            </div>
        `;
        container.appendChild(item);
        const toastData = {
            element: item,
            count: initialCount,
            filename,
            persist
        };
        activeToasts.set(filename, toastData);
        if (!persist) {
            setTimeout(() => {
                removeToast(filename);
            }, TOAST_DURATION);
        }
    }
    window._showTutorialDownloadToast = function () {
        ensureContainer();
        showDownloadToast('教程.pdf', 1, true);
    };
    window._removeTutorialDownloadToast = function () {
        removeToast('教程.pdf');
    };
    function removeToast(filename) {
        const toastData = activeToasts.get(filename);
        if (toastData && toastData.element.parentNode) {
            toastData.element.classList.add('download-log-item-exit');
            setTimeout(() => {
                if (toastData.element.parentNode) {
                    toastData.element.parentNode.removeChild(toastData.element);
                }
                activeToasts.delete(filename);
                processQueue();
            }, 300);
        } else {
            activeToasts.delete(filename);
            processQueue();
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    document.addEventListener('authSuccess', function () {
        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
            reconnectInterval = 1000;
            connect();
        }
    });
})();
