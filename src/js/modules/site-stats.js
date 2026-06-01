(function () {
    let registeredCount = 0;

    function updateOnlineCount(count) {
        const el = document.getElementById('online-count');
        if (el) {
            if (!window.currentUser) {
                el.textContent = '--';
                showStats();
                return;
            }
            const num = parseInt(count, 10);
            el.textContent = isNaN(num) ? count : (num > 999 ? (num / 1000).toFixed(1) + 'k' : num);
        }
        showStats();
    }

    function updateRegisteredCount(count) {
        const el = document.getElementById('registered-count');
        if (el) {
            const num = parseInt(count, 10);
            el.textContent = isNaN(num) ? count : (num > 9999 ? (num / 10000).toFixed(1) + 'w' : num > 999 ? (num / 1000).toFixed(1) + 'k' : num);
        }
        registeredCount = count;
        showStats();
    }

    function updateUptimeDays(days) {
        const el = document.getElementById('uptime-days');
        if (el) {
            el.textContent = days;
        }
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return '--';
        var now = new Date();
        var then = new Date(dateStr);
        var diffSec = Math.floor((now - then) / 1000);

        if (diffSec < 60) return '刚刚';
        if (diffSec < 3600) return Math.floor(diffSec / 60) + ' 分钟前';
        if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' 小时前';
        if (diffSec < 2592000) return Math.floor(diffSec / 86400) + ' 天前';

        var y = then.getFullYear();
        var m = String(then.getMonth() + 1).padStart(2, '0');
        var d = String(then.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function updateLastCommitTime(dateStr) {
        var el = document.getElementById('last-update-time');
        if (el) {
            el.textContent = formatRelativeTime(dateStr);
            if (dateStr) {
                el.title = new Date(dateStr).toLocaleString('zh-CN');
            }
        }
    }

    function showStats() {
        const stats = document.getElementById('site-stats');
        if (stats && !stats.classList.contains('visible')) {
            stats.classList.add('visible');
        }
    }

    function fetchSiteStats() {
        fetch(API_ENDPOINTS.siteStats)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success && data.stats) {
                    updateRegisteredCount(data.stats.registeredUsers);
                    if (data.stats.uptimeDays !== undefined) {
                        updateUptimeDays(data.stats.uptimeDays);
                    }
                    if (data.stats.lastCommitTime) {
                        updateLastCommitTime(data.stats.lastCommitTime);
                    }
                }
            })
            .catch(function (err) {
                console.warn('获取站点统计失败:', err.message);
            });
    }

    document.addEventListener('siteOnlineCount', function (e) {
        if (e.detail && e.detail.count !== undefined) {
            updateOnlineCount(e.detail.count);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fetchSiteStats);
    } else {
        fetchSiteStats();
    }

    setInterval(fetchSiteStats, 300000);
})();
