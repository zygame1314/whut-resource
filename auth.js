const AUTH_API_URL = `/api/auth`;
let currentUser = null;
let token = localStorage.getItem('authToken');
async function checkAuth() {
    if (!token) {
        updateAuthUI();
        return;
    }
    try {
        const response = await fetch(AUTH_API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            if (typeof fetchAndDisplayFiles === 'function') {
                fetchAndDisplayFiles('');
            }
            if (typeof fetchAndRenderHotFolders === 'function') {
                fetchAndRenderHotFolders();
            }
            if (typeof fetchAndBuildFolderTree === 'function') {
                fetchAndBuildFolderTree();
            }
            if (typeof fetchAndRenderRecentUploads === 'function') {
                fetchAndRenderRecentUploads();
            }
        } else {
            logout();
        }
    } catch (e) {
        console.error("Auth check failed", e);
        logout();
    }
    updateAuthUI();
}
function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    updateAuthUI();
    window.location.reload();
}
function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const uploadLink = document.getElementById('upload-btn-link');
    if (currentUser) {
        if (authSection) {
            authSection.innerHTML = `
                <span class="user-info">
                    <i class="fas fa-user"></i> ${currentUser.email}
                    <span class="quota">(${formatSize(currentUser.quota_used || 0)} / ${formatSize(currentUser.quota_limit || 0)})</span>
                </span>
                ${currentUser.role === 'admin' ? '<button id="sync-btn" class="secondary-btn" title="同步R2文件"><i class="fas fa-sync"></i></button>' : ''}
                <button id="logout-btn" class="secondary-btn"><i class="fas fa-sign-out-alt"></i> 退出</button>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            if (currentUser.role === 'admin') {
                document.getElementById('sync-btn').addEventListener('click', syncFiles);
            }
        }
        if (uploadLink) {
            if (currentUser.role === 'admin') {
                uploadLink.style.display = 'inline-block';
            } else {
                uploadLink.style.display = 'none';
            }
        }
    } else {
        if (authSection) {
            authSection.innerHTML = `
                <button id="login-btn" class="primary-btn"><i class="fas fa-sign-in-alt"></i> 登录</button>
                <button id="register-btn" class="secondary-btn"><i class="fas fa-user-plus"></i> 注册</button>
            `;
            document.getElementById('login-btn').addEventListener('click', () => showAuthModal('login'));
            document.getElementById('register-btn').addEventListener('click', () => showAuthModal('register'));
        }
        if (uploadLink) uploadLink.style.display = 'none';
    }
}
function showAuthModal(mode = 'login') {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    
    const isLogin = mode === 'login';
    const title = isLogin ? '登录' : '注册';
    
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-modal" class="close-modal-btn">&times;</button>
            <h2 class="auth-title">${title}</h2>
            <form id="auth-form">
                <div class="form-group">
                    <label>邮箱 (@whut.edu.cn)</label>
                    <input type="email" id="auth-email" required class="form-control" placeholder="请输入学校邮箱">
                </div>
                ${!isLogin ? `
                <div class="form-group">
                    <label>验证码</label>
                    <div class="input-group">
                        <input type="text" id="auth-code" placeholder="6位验证码" class="form-control">
                        <button type="button" id="send-code-btn" class="send-code-btn">发送验证码</button>
                    </div>
                </div>
                ` : ''}
                <div class="form-group">
                    <label>密码</label>
                    <input type="password" id="auth-password" required class="form-control" placeholder="请输入密码">
                </div>
                <button type="submit" class="primary-btn full-width">${title}</button>
            </form>
            <p class="auth-footer">
                ${isLogin ? '没有账号? <a href="#" id="switch-mode">去注册</a>' : '已有账号? <a href="#" id="switch-mode">去登录</a>'}
            </p>
        </div>
    `;
    document.body.appendChild(modal);
    const form = modal.querySelector('#auth-form');
    const closeBtn = modal.querySelector('#close-modal');
    const switchLink = modal.querySelector('#switch-mode');
    
    if (!isLogin) {
        const sendCodeBtn = modal.querySelector('#send-code-btn');
        sendCodeBtn.onclick = async () => {
            const email = document.getElementById('auth-email').value;
            if (!email || !email.endsWith('@whut.edu.cn')) {
                showNotification('请输入有效的 @whut.edu.cn 邮箱', 'error');
                return;
            }
            sendCodeBtn.disabled = true;
            sendCodeBtn.textContent = '发送中...';
            try {
                const res = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'send-code', email })
                });
                const data = await res.json();
                if (data.success) {
                    showNotification('验证码已发送，请查收邮件', 'success');
                    let countdown = 60;
                    const timer = setInterval(() => {
                        sendCodeBtn.textContent = `${countdown}s`;
                        countdown--;
                        if (countdown < 0) {
                            clearInterval(timer);
                            sendCodeBtn.disabled = false;
                            sendCodeBtn.textContent = '发送验证码';
                        }
                    }, 1000);
                } else {
                    showNotification(data.error, 'error');
                    sendCodeBtn.disabled = false;
                    sendCodeBtn.textContent = '发送验证码';
                }
            } catch (e) {
                showNotification('发送失败: ' + e.message, 'error');
                sendCodeBtn.disabled = false;
                sendCodeBtn.textContent = '发送验证码';
            }
        };
    }

    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
    switchLink.onclick = (e) => {
        e.preventDefault();
        modal.remove();
        showAuthModal(isLogin ? 'register' : 'login');
    };
    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const code = !isLogin ? document.getElementById('auth-code').value : undefined;

        try {
            const res = await fetch(AUTH_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: mode, email, password, code })
            });
            const data = await res.json();
            if (data.success) {
                if (isLogin) {
                    token = data.token;
                    localStorage.setItem('authToken', token);
                    currentUser = data.user;
                    updateAuthUI();
                    modal.remove();
                    window.location.reload();
                } else {
                    showNotification(data.message, 'success');
                    modal.remove();
                    showAuthModal('login');
                }
            } else {
                showNotification(data.error, 'error');
            }
        } catch (err) {
            showNotification('Error: ' + err.message, 'error');
        }
    };
}
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
async function syncFiles() {
    if (!confirm('确定要从 R2 同步文件索引到数据库吗？这可能需要一些时间。')) return;
    const btn = document.getElementById('sync-btn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    let cursor = null;
    let totalSynced = 0;
    let hasMore = true;
    try {
        while (hasMore) {
            const response = await fetch(`/api/sync`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cursor })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }
            totalSynced += (result.syncedCount || 0);
            cursor = result.nextCursor;
            hasMore = !!cursor;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${totalSynced}`;
        }
        showNotification(`同步完成！共同步了 ${totalSynced} 个文件。`, 'success');
        window.location.reload();
    } catch (e) {
        showNotification('同步出错: ' + e.message, 'error');
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}
document.addEventListener('DOMContentLoaded', checkAuth);
