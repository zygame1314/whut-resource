const API_BASE = 'https://resource.haoli.site';
const API_ENDPOINTS = {
    auth: `${API_BASE}/api/auth`,
    upload: `${API_BASE}/api/upload`,
    files: `${API_BASE}/api/files`,
    download: `${API_BASE}/api/download`,
    preview: `${API_BASE}/api/preview`,
    sync: `${API_BASE}/api/sync`,
    guestbook: `${API_BASE}/api/guestbook`,
    guestbookAi: `${API_BASE}/api/guestbook-ai`,
    boosts: `${API_BASE}/api/file-boosts`,
    announcements: `${API_BASE}/api/announcements`,
    batchDownload: `${API_BASE}/api/batch-download`,
    aiSearch: `${API_BASE}/api/ai-search`,
    reindex: `${API_BASE}/api/reindex`,
    pathRecommend: `${API_BASE}/api/path-recommend`,
    adminRequests: `${API_BASE}/api/admin-requests`,
    downloadLog: `${API_BASE.replace(/^http/, 'ws')}/api/ws`,
    maintenance: `${API_BASE}/api/maintenance`,
    urlSafety: `${API_BASE}/api/url-safety`,
    passkey: `${API_BASE}/api/passkey`
};
const HCAPTCHA_SITEKEY = '1c847708-56b8-4c60-96ec-3968456c4442';
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
window.showNotification = function (message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    const icon = icons[type] || icons.info;
    notification.innerHTML = `<i class="${icon}" style="margin-right: 0.5rem;"></i>${message}`;
    container.appendChild(notification);
    notification.offsetHeight;
    notification.style.transform = 'translateX(0)';
    notification.style.opacity = '1';
    const removeNotification = () => {
        notification.style.transform = 'translateX(calc(100% + 20px))';
        notification.style.opacity = '0';
        notification.addEventListener('transitionend', () => {
            notification.remove();
            if (container.children.length === 0 && container.parentNode) {
                container.remove();
            }
        });
    };
    const timeoutId = setTimeout(removeNotification, 3000);
    notification.addEventListener('click', () => {
        clearTimeout(timeoutId);
        removeNotification();
    });
};
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker 注册成功:', reg.scope))
            .catch(err => console.log('Service Worker 注册失败:', err));
    });
}
