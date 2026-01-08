(function () {
    const CONTAINER_ID = 'download-log-container';
    let socket;
    let reconnectInterval = 1000;
    const MAX_RECONNECT_INTERVAL = 30000;
    function init() {
        if (!document.getElementById(CONTAINER_ID)) {
            const container = document.createElement('div');
            container.id = CONTAINER_ID;
            container.className = 'download-log-container';
            document.body.appendChild(container);
        }
        connect();
    }
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            console.log('Connected to download log');
            reconnectInterval = 1000;
        };
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'download') {
                    showDownloadToast(data.filename);
                } else if (data.type === 'welcome') {
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        socket.onclose = () => {
            console.log('Download log disconnected. Reconnecting in', reconnectInterval, 'ms');
            setTimeout(connect, reconnectInterval);
            reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT_INTERVAL);
        };
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            socket.close();
        };
    }
    function showDownloadToast(filename) {
        const container = document.getElementById(CONTAINER_ID);
        if (!container) return;
        const item = document.createElement('div');
        item.className = 'download-log-item';
        const messages = [
            '一位同学正在下载',
            '有人发现了宝藏',
            '知识 +1',
            '不再孤单',
            '并在努力学习',
            '加油！'
        ];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        item.innerHTML = `
            <i class="fas fa-download"></i>
            <div>
                <span class="filename" title="${filename}">${filename}</span>
                <div style="font-size: 0.8em; opacity: 0.8;">${randomMsg}</div>
            </div>
        `;
        container.appendChild(item);
        setTimeout(() => {
            if (item.parentNode) {
                item.parentNode.removeChild(item);
            }
        }, 5000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
