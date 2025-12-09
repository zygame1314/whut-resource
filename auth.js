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
        const quotaDisplay = currentUser.role === 'admin'
            ? '无限'
            : `${currentUser.quota_used || 0} / ${currentUser.quota_limit || 0} 次`;
        if (authSection) {
            authSection.innerHTML = `
                <span class="user-info">
                    <i class="fas fa-user"></i> ${escapeHtmlAuth(currentUser.nickname || currentUser.email)}
                    <span class="quota">(${quotaDisplay})</span>
                </span>
                ${currentUser.role === 'admin' ? `
                    <button id="sync-btn" class="secondary-btn" title="同步R2文件"><i class="fas fa-sync"></i></button>
                    <button id="vector-sync-btn" class="secondary-btn" title="同步向量索引"><i class="fas fa-brain"></i></button>
                    <button id="admin-logs-btn" class="secondary-btn" title="查看AI操作日志"><i class="fas fa-history"></i></button>
                ` : ''}
                <button id="change-nickname-btn" class="secondary-btn" title="修改昵称"><i class="fas fa-id-card"></i></button>
                <button id="change-pwd-btn" class="secondary-btn" title="修改密码"><i class="fas fa-key"></i></button>
                <button id="logout-btn" class="secondary-btn"><i class="fas fa-sign-out-alt"></i> 退出</button>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('change-nickname-btn').addEventListener('click', showChangeNicknameModal);
            document.getElementById('change-pwd-btn').addEventListener('click', showChangePasswordModal);
            if (currentUser.role === 'admin') {
                document.getElementById('sync-btn').addEventListener('click', syncFiles);
                document.getElementById('vector-sync-btn').addEventListener('click', syncVectorIndex);
                document.getElementById('admin-logs-btn').addEventListener('click', showAdminLogsModal);
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
            const confirmed = await showConfirmation({
                title: '⚠️ 最后确认',
                message: `请仔细核对你的邮箱地址：<br><br><strong style="font-size: 1.2em; color: var(--primary-color);">${email}</strong><br><br>这是你<strong class="warning-highlight">最后的机会</strong>确认邮箱是否正确且已激活！<br><br>如果未激活导致发送失败，此邮箱将被<strong class="warning-highlight">永久封禁</strong>，无法再次注册！`,
                confirmText: '确认无误',
                cancelText: '我要修改'
            });
            if (!confirmed) return;
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
async function syncVectorIndex() {
    const confirmed = await showConfirmation({
        title: '向量索引同步',
        message: '此操作将为所有文件重建 AI 搜索索引。<br><br>首次使用或有大量历史文件时需要执行此操作。<br>新上传的文件会自动添加索引，无需手动同步。<br><br>确定要开始同步吗？',
        confirmText: '开始同步'
    });
    if (!confirmed) return;
    const btn = document.getElementById('vector-sync-btn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    let offset = 0;
    let totalProcessed = 0;
    let totalFiles = 0;
    try {
        while (true) {
            const response = await fetch(`${API_ENDPOINTS.reindex}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ offset })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || '同步失败');
            }
            totalFiles = result.total;
            totalProcessed = result.indexed;
            btn.innerHTML = `<i class="fas fa-brain"></i> ${totalProcessed}/${totalFiles}`;
            if (result.completed) {
                showNotification(`向量索引同步完成！共处理 ${totalProcessed} 个文件。`, 'success');
                break;
            }
            offset = result.nextOffset;
        }
    } catch (e) {
        showNotification('向量索引同步出错: ' + e.message, 'error');
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
async function showAdminLogsModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal admin-logs-modal';
    modal.style.cssText = 'display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000;';
    modal.innerHTML = `
        <div class="auth-box" style="width: 90%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 class="auth-title" style="margin: 0;">AI 操作日志</h2>
                <button id="close-modal" class="close-modal-btn" style="position: static;"><i class="fas fa-times"></i></button>
            </div>
            <div id="logs-container" style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
                <div class="loading-spinner"></div>
            </div>
            <div id="logs-pagination" class="pagination-controls" style="margin-top: 1rem; display: flex; justify-content: center;"></div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    let currentPage = 1;
    const loadLogs = async (page) => {
        const container = modal.querySelector('#logs-container');
        const pagination = modal.querySelector('#logs-pagination');
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const res = await fetch(`${API_BASE}/api/admin-logs?page=${page}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            if (data.data.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">暂无日志</div>';
                pagination.innerHTML = '';
                return;
            }
            container.innerHTML = data.data.map(log => {
                let detailsHtml = '';
                try {
                    const details = JSON.parse(log.details);
                    if (details.snapshot_content) {
                        detailsHtml += `<div style="margin-top: 5px; font-size: 0.9em; color: var(--text-secondary); background: var(--bg-secondary); padding: 5px; border-radius: 4px;"><strong>原始内容:</strong> ${escapeHtmlAuth(details.snapshot_content)}</div>`;
                    }
                    if (details.nickname) {
                        detailsHtml += `<div style="font-size: 0.8em; color: var(--text-secondary);">用户昵称: ${escapeHtmlAuth(details.nickname)} (ID: ${details.user_id || 'N/A'})</div>`;
                    }
                } catch (e) {
                    detailsHtml = `<div style="font-size: 0.8em; color: var(--text-secondary);">${escapeHtmlAuth(log.details)}</div>`;
                }
                const actionColors = {
                    'ai_delete': 'var(--error, #ff4d4f)',
                    'ai_ban_user': 'var(--error, #ff4d4f)',
                    'ai_reject': 'var(--warning, #faad14)',
                    'ai_hide': 'var(--warning, #faad14)'
                };
                const color = actionColors[log.action] || 'var(--primary)';
                const date = new Date(log.created_at).toLocaleString('zh-CN');
                return `
                    <div style="border-bottom: 1px solid var(--border-color); padding: 10px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <span style="font-weight: bold; color: ${color};">${log.action}</span>
                            <span style="font-size: 0.8em; color: var(--text-secondary);">${date}</span>
                        </div>
                        <div style="margin: 5px 0;">${escapeHtmlAuth(log.reason)}</div>
                        ${detailsHtml}
                    </div>
                `;
            }).join('');
            const totalPages = data.pagination.totalPages;
            let paginationHtml = '';
            if (page > 1) paginationHtml += `<button class="page-btn" onclick="document.getElementById('logs-next-page').dataset.page = ${page - 1}">上一页</button>`;
            paginationHtml += `<span style="margin: 0 10px;">${page} / ${totalPages}</span>`;
            if (page < totalPages) paginationHtml += `<button class="page-btn" id="logs-next-page" data-page="${page + 1}">下一页</button>`;
            pagination.innerHTML = paginationHtml;
            const nextBtn = pagination.querySelector('#logs-next-page');
            const prevBtn = pagination.querySelector('button:first-child');
            if (nextBtn) nextBtn.onclick = () => loadLogs(page + 1);
            if (prevBtn && prevBtn.textContent === '上一页') prevBtn.onclick = () => loadLogs(page - 1);
        } catch (e) {
            container.innerHTML = `<div style="color: red;">加载失败: ${e.message}</div>`;
        }
    };
    loadLogs(currentPage);
}
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            const iconEl = themeToggle.querySelector('i');
            if (iconEl) {
                iconEl.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        });
    }
    checkAuth();
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navActions = document.querySelector('.nav-actions');
    if (mobileMenuToggle && navActions) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navActions.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (navActions.classList.contains('active') && !navActions.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                navActions.classList.remove('active');
            }
        });
    }
});
