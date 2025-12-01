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
            window.currentUser = currentUser;
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
            if (typeof fetchFileStats === 'function') {
                fetchFileStats();
            }
            if (typeof checkAdminPermission === 'function') {
                checkAdminPermission();
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
                    <i class="fas fa-user"></i> ${currentUser.nickname || currentUser.email}
                    <span class="quota">(${currentUser.quota_used || 0} / ${currentUser.quota_limit || 0} 次)</span>
                </span>
                ${currentUser.role === 'admin' ? '<button id="sync-btn" class="secondary-btn" title="同步R2文件"><i class="fas fa-sync"></i></button>' : ''}
                <button id="change-pwd-btn" class="secondary-btn" title="修改密码"><i class="fas fa-key"></i></button>
                <button id="logout-btn" class="secondary-btn"><i class="fas fa-sign-out-alt"></i> 退出</button>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('change-pwd-btn').addEventListener('click', showChangePasswordModal);
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
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            <h2 class="auth-title">${title}</h2>
            <form id="auth-form">
                <div class="form-group">
                    <label>邮箱 (@whut.edu.cn)</label>
                    <input type="email" id="auth-email" required class="form-control" placeholder="${isLogin ? '请输入学校邮箱' : '请输入校园卡号邮箱 (如 123456@whut.edu.cn)'}">
                </div>
                ${!isLogin ? `
                <div class="form-group">
                    <label>昵称</label>
                    <input type="text" id="auth-nickname" class="form-control" placeholder="请输入昵称">
                </div>
                <div class="form-group">
                    <label>验证码</label>
                    <div class="input-group">
                        <input type="text" id="auth-code" placeholder="6位验证码" class="form-control">
                        <button type="button" id="send-code-btn" class="send-code-btn">发送验证码</button>
                    </div>
                    <!-- Cloudflare Turnstile Widget -->
                    <div id="turnstile-widget" style="margin-top: 10px;"></div>
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
        let turnstileWidgetId;
        if (window.turnstile) {
            turnstileWidgetId = turnstile.render('#turnstile-widget', {
                sitekey: '0x4AAAAAABfgqCmMGBV9Nf8U',
                callback: function(token) {
                    console.log('Turnstile success');
                },
            });
        }
        const sendCodeBtn = modal.querySelector('#send-code-btn');
        sendCodeBtn.onclick = async () => {
            const email = document.getElementById('auth-email').value;
            const studentIdEmailRegex = /^\d{6}@whut\.edu\.cn$/;
            if (!email || !studentIdEmailRegex.test(email)) {
                showNotification('请使用6位校园卡号邮箱进行注册', 'error');
                return;
            }
            let cfToken = '';
            if (window.turnstile) {
                cfToken = turnstile.getResponse(turnstileWidgetId);
                if (!cfToken) {
                    showNotification('请先完成人机验证', 'error');
                    return;
                }
            }
            sendCodeBtn.disabled = true;
            sendCodeBtn.textContent = '发送中...';
            try {
                const res = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'send-code', email, cfToken })
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
        const nickname = !isLogin ? document.getElementById('auth-nickname').value : undefined;
        try {
            const res = await fetch(AUTH_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: mode, email, password, code, nickname })
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
    const confirmed = await showConfirmation({
        title: '高风险操作确认',
        message: '⚠️ 警告：全量同步非常消耗服务器资源！<br><br>正常上传/删除无需使用此功能。<br>仅在你直接操作过 R2 存储桶（如批量上传/改名）导致数据不一致时才使用。<br><br>确定要执行全量同步吗？这可能需要几十秒甚至更久。',
        confirmText: '我明白，开始同步'
    });
    if (!confirmed) return;
    const btn = document.getElementById('sync-btn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
        const response = await fetch(`/api/sync`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }
        showNotification(result.message, 'success');
        setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
        showNotification('同步出错: ' + e.message, 'error');
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}
function showChangePasswordModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            <h2 class="auth-title">修改密码</h2>
            <form id="change-pwd-form">
                <div class="form-group">
                    <label>旧密码</label>
                    <input type="password" id="old-password" required class="form-control" placeholder="请输入旧密码">
                </div>
                <div class="form-group">
                    <label>新密码</label>
                    <input type="password" id="new-password" required class="form-control" placeholder="请输入新密码">
                </div>
                <button type="submit" class="primary-btn full-width">确认修改</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    const form = modal.querySelector('#change-pwd-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const oldPassword = document.getElementById('old-password').value;
        const newPassword = document.getElementById('new-password').value;
        if (newPassword.length < 6) {
            showNotification('新密码至少需要6个字符', 'error');
            return;
        }
        try {
            const res = await fetch(AUTH_API_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    action: 'change-password', 
                    email: currentUser.email, 
                    oldPassword, 
                    newPassword 
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotification('密码修改成功', 'success');
                modal.remove();
            } else {
                showNotification(data.error || '修改失败', 'error');
            }
        } catch (err) {
            console.error(err);
            showNotification('网络错误', 'error');
        }
    };
}
document.addEventListener('DOMContentLoaded', checkAuth);
