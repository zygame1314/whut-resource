async function checkAuth() {
    if (!token) {
        updateAuthUI();
        if (window.releaseRequests) window.releaseRequests(true);
        return;
    }
    try {
        const response = await fetch(AUTH_API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            window.currentUser = currentUser;
            document.dispatchEvent(new Event('authSuccess'));
            checkMaintenanceMode();
        } else {
            logout();
            if (window.releaseRequests) window.releaseRequests(true);
        }
    } catch (e) {
        console.error("认证检查失败", e);
        logout();
        if (window.releaseRequests) window.releaseRequests(true);
    }
}
async function checkMaintenanceMode(force = false) {
    if (!force && window._maintenanceChecked) return;
    if (!token || !currentUser) {
        if (window.releaseRequests) window.releaseRequests(true);
        return;
    }
    window._maintenanceChecked = true;
    try {
        const response = await fetch(API_ENDPOINTS.maintenance, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            if (window.releaseRequests) window.releaseRequests(true);
            return;
        }
        const data = await response.json();
        if (data.success && data.maintenance === true) {
            showMaintenanceOverlay(data.message);
        } else {
            if (window.releaseRequests) window.releaseRequests(true);
        }
    } catch (error) {
        console.warn('维护状态检查出错:', error.message);
        if (window.releaseRequests) window.releaseRequests(true);
    }
}
function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    updateAuthUI();
    window.location.reload();
}
