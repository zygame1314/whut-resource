(function () {
    let registeredCount = 0;

    function updateOnlineCount(count) {
        const el = document.getElementById('online-count');
        if (el) {
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

    function showStats() {
        const stats = document.getElementById('site-stats');
        if (stats && !stats.classList.contains('visible')) {
            stats.classList.add('visible');
        }
    }

    function fetchRegisteredCount() {
        fetch(API_ENDPOINTS.siteStats)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success && data.stats) {
                    updateRegisteredCount(data.stats.registeredUsers);
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
        document.addEventListener('DOMContentLoaded', fetchRegisteredCount);
    } else {
        fetchRegisteredCount();
    }

    setInterval(fetchRegisteredCount, 300000);
})();