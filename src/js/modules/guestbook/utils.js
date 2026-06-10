function isGuestbookAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}
function isGuestbookSuperAdmin(user) {
    return user && user.role === 'super_admin';
}
function isGbActionPending(id, action) {
    return guestbookActionPending.has(`${id}_${action}`);
}
function setGbActionPending(id, action) {
    guestbookActionPending.add(`${id}_${action}`);
}
function clearGbActionPending(id, action) {
    guestbookActionPending.delete(`${id}_${action}`);
}
function getAvatarColor(name) {
    const colors = [
        'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
        'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
        'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #ff6a88 0%, #ff99ac 100%)',
        'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)',
        'linear-gradient(135deg, #f093fb 0%, #4facfe 100%)',
        'linear-gradient(135deg, #f83600 0%, #f9d423 100%)',
        'linear-gradient(135deg, #b224ef 0%, #7579ff 100%)',
        'linear-gradient(135deg, #42e695 0%, #3bb2b8 100%)',
        'linear-gradient(135deg, #f5a623 0%, #f76b1c 100%)',
        'linear-gradient(135deg, #7367f0 0%, #ce9ffc 100%)',
        'linear-gradient(135deg, #48c6ef 0%, #6f86d6 100%)',
        'linear-gradient(135deg, #fe5196 0%, #f77062 100%)',
        'linear-gradient(135deg, #02aab0 0%, #00cdac 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
    return colors[Math.abs(hash) % colors.length];
}
function getAvatarChars(name) {
    if (!name) return '?';
    if (name.length === 1) return name.toUpperCase();
    return name.substring(0, 2).toUpperCase();
}
window.navigateToPath = function (path) {
    const fileExplorer = document.getElementById('breadcrumb-nav');
    if (fileExplorer) fileExplorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof fetchAndDisplayFiles === 'function') {
        let cleanPath = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        fetchAndDisplayFiles(cleanPath ? cleanPath + '/' : '/');
        showNotification(`正在跳转到目录：${cleanPath || '根目录'}`, 'info');
    } else {
        showNotification('无法导航到目录', 'error');
    }
};
function refreshGuestbook() {
    guestbookCursorStack = [];
    guestbookPageIndex = -1;
    guestbookLoadInitial();
}
function updateGuestbookCache(id, updates) {
    for (const page of guestbookCursorStack) {
        if (!page.messages) continue;
        const mi = page.messages.findIndex(m => m.id === id);
        if (mi !== -1) { page.messages[mi] = { ...page.messages[mi], ...updates }; break; }
        for (const m of page.messages) {
            if (m.replies) {
                const ri = m.replies.findIndex(r => r.id === id);
                if (ri !== -1) { m.replies[ri] = { ...m.replies[ri], ...updates }; return; }
            }
        }
    }
    const cur = guestbookCursorStack[guestbookPageIndex];
    if (cur && cur.messages) renderGuestbook(cur.messages);
}
function removeFromGuestbookCache(id) {
    let found = false;
    for (const page of guestbookCursorStack) {
        if (!page.messages) continue;
        const mi = page.messages.findIndex(m => m.id === id);
        if (mi !== -1) { page.messages.splice(mi, 1); found = true; break; }
        for (const m of page.messages) {
            if (m.replies) {
                const ri = m.replies.findIndex(r => r.id === id);
                if (ri !== -1) { m.replies.splice(ri, 1); found = true; break; }
            }
        }
        if (found) break;
    }
    const cur = guestbookCursorStack[guestbookPageIndex];
    if (cur && cur.messages) renderGuestbook(cur.messages);
}
