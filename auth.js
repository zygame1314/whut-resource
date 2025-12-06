const AUTH_API_URL = API_ENDPOINTS.auth;
let currentUser = null;
let token = localStorage.getItem('authToken');
function escapeHtmlAuth(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
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
                    <i class="fas fa-user"></i> ${escapeHtmlAuth(currentUser.nickname || currentUser.email)}
                    <span class="quota">(${currentUser.quota_used || 0} / ${currentUser.quota_limit || 0} 次)</span>
                </span>
                ${currentUser.role === 'admin' ? '<button id="sync-btn" class="secondary-btn" title="同步R2文件"><i class="fas fa-sync"></i></button>' : ''}
                <button id="change-nickname-btn" class="secondary-btn" title="修改昵称"><i class="fas fa-id-card"></i></button>
                <button id="change-pwd-btn" class="secondary-btn" title="修改密码"><i class="fas fa-key"></i></button>
                <button id="logout-btn" class="secondary-btn"><i class="fas fa-sign-out-alt"></i> 退出</button>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('change-nickname-btn').addEventListener('click', showChangeNicknameModal);
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
                    <label>${isLogin ? '邮箱' : '校园卡号'}</label>
                    ${isLogin ? `
                    <input type="email" id="auth-email" required class="form-control" placeholder="请输入学校邮箱">
                    ` : `
                    <div class="email-input-group">
                        <input type="text" id="auth-email" required class="form-control" placeholder="6位卡号" maxlength="6" pattern="\\d{6}" inputmode="numeric">
                        <span class="email-suffix">@whut.edu.cn</span>
                    </div>
                    `}
                </div>
                ${!isLogin ? `
                <div class="form-group">
                    <label>昵称</label>
                    <input type="text" id="auth-nickname" class="form-control" placeholder="请输入昵称">
                </div>
                <div class="form-group">
                    <label>验证码</label>
                    <div class="checkbox-group warning">
                        <label>
                            <div class="warning-title"><i class="fas fa-exclamation-triangle"></i> 警告</div>
                            <div class="warning-check-row">
                                <input type="checkbox" id="confirm-activation">
                                <span>我已确认：我已经登录过 whut.edu.cn 邮箱系统并成功激活邮箱。</span>
                            </div>
                            <div class="warning-text">
                                如果不激活，验证码将发送失败。系统将<strong class="warning-highlight">永久封禁</strong>你的账号！
                            </div>
                        </label>
                    </div>
                    <div class="input-group">
                        <input type="text" id="auth-code" placeholder="6位验证码" class="form-control">
                        <button type="button" id="send-code-btn" class="send-code-btn" disabled title="请先勾选确认框">发送验证码</button>
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
                ${isLogin ? '没有账号? <a href="#" id="switch-mode">去注册</a> | <a href="#" id="forgot-password">忘记密码?</a>' : '已有账号? <a href="#" id="switch-mode">去登录</a>'}
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
                callback: function (token) {
                    console.log('Turnstile success');
                },
            });
        }
        const sendCodeBtn = modal.querySelector('#send-code-btn');
        const confirmActivationCheckbox = modal.querySelector('#confirm-activation');
        if (confirmActivationCheckbox) {
            confirmActivationCheckbox.addEventListener('change', () => {
                if (sendCodeBtn.textContent.includes('s') && !sendCodeBtn.textContent.includes('发送')) {
                    return;
                }
                sendCodeBtn.disabled = !confirmActivationCheckbox.checked;
                sendCodeBtn.title = sendCodeBtn.disabled ? "请先勾选确认框" : "";
            });
        }
        sendCodeBtn.onclick = async () => {
            const studentId = document.getElementById('auth-email').value.trim();
            if (!studentId || !/^\d{6}$/.test(studentId)) {
                showNotification('请输入6位校园卡号', 'error');
                return;
            }
            const email = studentId + '@whut.edu.cn';
            const invalidIds = ['123456', '654321', '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '114514'];
            if (invalidIds.includes(studentId)) {
                showNotification('同学，这个卡号要是真的是你的，我当场把服务器吃了。请填写真实卡号！', 'error');
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
                            sendCodeBtn.disabled = confirmActivationCheckbox ? !confirmActivationCheckbox.checked : false;
                            sendCodeBtn.textContent = '发送验证码';
                            if (sendCodeBtn.disabled) sendCodeBtn.title = "请先勾选确认框";
                        }
                    }, 1000);
                } else {
                    showNotification(data.error, 'error');
                    sendCodeBtn.disabled = confirmActivationCheckbox ? !confirmActivationCheckbox.checked : false;
                    sendCodeBtn.textContent = '发送验证码';
                    if (sendCodeBtn.disabled) sendCodeBtn.title = "请先勾选确认框";
                }
            } catch (e) {
                showNotification('发送失败: ' + e.message, 'error');
                sendCodeBtn.disabled = confirmActivationCheckbox ? !confirmActivationCheckbox.checked : false;
                sendCodeBtn.textContent = '发送验证码';
                if (sendCodeBtn.disabled) sendCodeBtn.title = "请先勾选确认框";
            }
        };
    }
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    switchLink.onclick = (e) => {
        e.preventDefault();
        modal.remove();
        showAuthModal(isLogin ? 'register' : 'login');
    };
    if (isLogin) {
        const forgotPasswordLink = modal.querySelector('#forgot-password');
        if (forgotPasswordLink) {
            forgotPasswordLink.onclick = (e) => {
                e.preventDefault();
                modal.remove();
                showForgotPasswordModal();
            };
        }
    }
    form.onsubmit = async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('auth-email').value.trim();
        const email = isLogin ? emailInput : (emailInput + '@whut.edu.cn');
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
        const response = await fetch(`${API_BASE}/api/sync`, {
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
function showChangeNicknameModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            <h2 class="auth-title">修改昵称</h2>
            <form id="change-nickname-form">
                <div class="form-group">
                    <label>新昵称</label>
                    <input type="text" id="new-nickname" required class="form-control" placeholder="请输入新昵称" value="${escapeHtmlAuth(currentUser.nickname || '')}" maxlength="20">
                </div>
                <button type="submit" class="primary-btn full-width">确认修改</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const form = modal.querySelector('#change-nickname-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const newNickname = document.getElementById('new-nickname').value.trim();
        if (!newNickname) {
            showNotification('昵称不能为空', 'error');
            return;
        }
        if (newNickname.length > 20) {
            showNotification('昵称过长', 'error');
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
                    action: 'change-nickname',
                    newNickname
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotification('昵称修改成功', 'success');
                currentUser.nickname = newNickname;
                updateAuthUI();
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
function showForgotPasswordModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            <h2 class="auth-title">找回密码</h2>
            <form id="forgot-pwd-form">
                <div class="form-group">
                    <label>邮箱 (@whut.edu.cn)</label>
                    <input type="email" id="reset-email" required class="form-control" placeholder="请输入注册时使用的邮箱">
                </div>
                <div class="form-group">
                    <label>验证码</label>
                    <div class="input-group">
                        <input type="text" id="reset-code" placeholder="6位验证码" class="form-control">
                        <button type="button" id="send-reset-code-btn" class="send-code-btn">发送验证码</button>
                    </div>
                    <!-- Cloudflare Turnstile Widget -->
                    <div id="turnstile-reset-widget" style="margin-top: 10px;"></div>
                </div>
                <div class="form-group">
                    <label>新密码</label>
                    <input type="password" id="reset-new-password" required class="form-control" placeholder="请输入新密码（至少6位）">
                </div>
                <button type="submit" class="primary-btn full-width">重置密码</button>
            </form>
            <p class="auth-footer">
                <a href="#" id="back-to-login">返回登录</a>
            </p>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const backToLoginLink = modal.querySelector('#back-to-login');
    backToLoginLink.onclick = (e) => {
        e.preventDefault();
        modal.remove();
        showAuthModal('login');
    };
    let turnstileWidgetId;
    if (window.turnstile) {
        turnstileWidgetId = turnstile.render('#turnstile-reset-widget', {
            sitekey: '0x4AAAAAABfgqCmMGBV9Nf8U',
            callback: function (token) {
                console.log('Turnstile success');
            },
        });
    }
    const sendCodeBtn = modal.querySelector('#send-reset-code-btn');
    sendCodeBtn.onclick = async () => {
        const email = document.getElementById('reset-email').value;
        const emailRegex = /^[^\s@]+@whut\.edu\.cn$/;
        if (!email || !emailRegex.test(email)) {
            showNotification('请输入有效的学校邮箱地址', 'error');
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
                body: JSON.stringify({ action: 'send-reset-code', email, cfToken })
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
    const form = modal.querySelector('#forgot-pwd-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const code = document.getElementById('reset-code').value;
        const newPassword = document.getElementById('reset-new-password').value;
        if (newPassword.length < 6) {
            showNotification('新密码至少需要6个字符', 'error');
            return;
        }
        try {
            const res = await fetch(AUTH_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset-password', email, code, password: newPassword })
            });
            const data = await res.json();
            if (data.success) {
                showNotification(data.message, 'success');
                modal.remove();
                showAuthModal('login');
            } else {
                showNotification(data.error, 'error');
            }
        } catch (err) {
            showNotification('重置失败: ' + err.message, 'error');
        }
    };
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
