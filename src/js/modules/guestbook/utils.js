function isGuestbookAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}
function isGuestbookSuperAdmin(user) {
    return user && user.role === 'super_admin';
}
function getAvatarColor(name) {
    const colors = [
        'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
        'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
        'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}
window.navigateToPath = function (path) {
    const fileExplorer = document.getElementById('breadcrumb-nav');
    if (fileExplorer) {
        fileExplorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof fetchAndDisplayFiles === 'function') {
        let cleanPath = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        const normalizedPath = cleanPath ? cleanPath + '/' : '/';
        fetchAndDisplayFiles(normalizedPath);
        showNotification(`正在跳转到目录：${cleanPath || '根目录'}`, 'info');
    } else {
        showNotification('无法导航到目录', 'error');
    }
};
function refreshGuestbook(page = 1) {
    guestbookCache = { data: [] };
    fetchAndDisplayGuestbook(page);
}
function updateGuestbookCache(id, updates) {
    const index = guestbookCache.data.findIndex(msg => msg.id === id);
    if (index !== -1) {
        guestbookCache.data[index] = { ...guestbookCache.data[index], ...updates };
        fetchAndDisplayGuestbook(currentGuestbookPage);
        return;
    }
    for (const parent of guestbookCache.data) {
        if (parent.replies) {
            const replyIdx = parent.replies.findIndex(r => r.id === id);
            if (replyIdx !== -1) {
                parent.replies[replyIdx] = { ...parent.replies[replyIdx], ...updates };
                fetchAndDisplayGuestbook(currentGuestbookPage);
                return;
            }
        }
    }
}
function removeFromGuestbookCache(id) {
    const parentIdx = guestbookCache.data.findIndex(msg => msg.id === id);
    if (parentIdx !== -1) {
        guestbookCache.data.splice(parentIdx, 1);
        fetchAndDisplayGuestbook(currentGuestbookPage);
        return;
    }
    for (const parent of guestbookCache.data) {
        if (parent.replies) {
            const replyIdx = parent.replies.findIndex(r => r.id === id);
            if (replyIdx !== -1) {
                parent.replies.splice(replyIdx, 1);
                fetchAndDisplayGuestbook(currentGuestbookPage);
                return;
            }
        }
    }
}
