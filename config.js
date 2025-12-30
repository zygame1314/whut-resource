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
    announcements: `${API_BASE}/api/announcements`,
    batchDownload: `${API_BASE}/api/batch-download`,
    aiSearch: `${API_BASE}/api/ai-search`,
    reindex: `${API_BASE}/api/reindex`,
    pathRecommend: `${API_BASE}/api/path-recommend`
};
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
