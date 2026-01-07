const AUTH_API_URL = API_ENDPOINTS.auth;
let currentUser = null;
let token = localStorage.getItem('authToken');
function initPasswordToggles(container) {
    const toggles = container.querySelectorAll('.password-toggle');
    toggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = container.querySelector(`#${targetId}`);
            if (!input) return;
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
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
            document.dispatchEvent(new Event('authSuccess'));
        } else {
            logout();
        }
    } catch (e) {
        console.error("认证检查失败", e);
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
function isAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}
function isSuperAdmin(user) {
    return user && user.role === 'super_admin';
}
function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const uploadLink = document.getElementById('upload-btn-link');
    if (currentUser) {
        const quotaDisplay = isAdmin(currentUser)
            ? '无限'
            : `${currentUser.quota_used || 0} / ${currentUser.quota_limit || 0} 次`;
        if (authSection) {
            const requestButton = isSuperAdmin(currentUser) ? `
                <button id="admin-requests-btn" class="secondary-btn" title="审批请求">
                    <i class="fas fa-clipboard-check"></i> 审批
                    <span id="pending-requests-badge" class="badge u-hidden">0</span>
                </button>
            ` : '';
            let dropdownItems = '';
            if (isSuperAdmin(currentUser)) {
                dropdownItems += `
                    <button id="sync-btn" class="dropdown-item"><i class="fas fa-sync"></i> 同步R2文件</button>
                    <button id="vector-sync-btn" class="dropdown-item"><i class="fas fa-brain"></i> 同步向量索引</button>
                    <button id="banned-users-btn" class="dropdown-item"><i class="fas fa-user-lock"></i> 封禁用户管理</button>
                    <div class="dropdown-divider"></div>
                `;
            }
            if (isAdmin(currentUser)) {
                dropdownItems += `
                    <button id="admin-logs-btn" class="dropdown-item"><i class="fas fa-history"></i> AI操作日志</button>
                `;
                if (!isSuperAdmin(currentUser)) {
                    dropdownItems += `
                        <button id="my-requests-btn" class="dropdown-item">
                            <i class="fas fa-tasks"></i> 我的审批请求
                            <span id="my-requests-badge" class="badge u-hidden">0</span>
                        </button>
                    `;
                }
                dropdownItems += `
                    <div class="dropdown-divider"></div>
                `;
            }
            dropdownItems += `
                <button id="change-nickname-btn" class="dropdown-item"><i class="fas fa-id-card"></i> 修改昵称</button>
                <button id="change-pwd-btn" class="dropdown-item"><i class="fas fa-key"></i> 修改密码</button>
            `;
            authSection.innerHTML = `
                <span class="user-info">
                    <i class="fas fa-user"></i> ${escapeHtml(currentUser.nickname || currentUser.email)}
                    <span class="quota">(${quotaDisplay})</span>
                </span>
                ${requestButton}
                <div class="dropdown-container">
                    <button id="admin-tools-toggle" class="secondary-btn" title="工具菜单">
                        <i class="fas fa-tools"></i> 管理 <i class="fas fa-chevron-down u-font-small u-margin-left-small"></i>
                    </button>
                    <div id="admin-tools-menu" class="dropdown-menu">
                        ${dropdownItems}
                    </div>
                </div>
                <button id="logout-btn" class="secondary-btn"><i class="fas fa-sign-out-alt"></i> 退出</button>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            const toggleBtn = document.getElementById('admin-tools-toggle');
            const menu = document.getElementById('admin-tools-menu');
            if (toggleBtn && menu) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.toggle('show');
                    toggleBtn.classList.toggle('active');
                });
                document.addEventListener('click', (e) => {
                    if (!menu.contains(e.target) && !toggleBtn.contains(e.target)) {
                        menu.classList.remove('show');
                        toggleBtn.classList.remove('active');
                    }
                });
            }
            document.getElementById('change-nickname-btn').addEventListener('click', showChangeNicknameModal);
            document.getElementById('change-pwd-btn').addEventListener('click', showChangePasswordModal);
            if (isAdmin(currentUser)) {
                document.getElementById('admin-logs-btn').addEventListener('click', showAdminLogsModal);
                const myRequestsBtn = document.getElementById('my-requests-btn');
                if (myRequestsBtn) {
                    myRequestsBtn.addEventListener('click', () => showAdminRequestsModal('mine'));
                }
            }
            if (isSuperAdmin(currentUser)) {
                document.getElementById('sync-btn').addEventListener('click', syncFiles);
                document.getElementById('vector-sync-btn').addEventListener('click', syncVectorIndex);
                document.getElementById('banned-users-btn').addEventListener('click', showBannedUsersModal);
                const reqBtn = document.getElementById('admin-requests-btn');
                if (reqBtn) reqBtn.addEventListener('click', () => showAdminRequestsModal('all'));
            }
            if (isAdmin(currentUser)) {
                fetchPendingRequestsCount();
            }
        }
        if (uploadLink) {
            if (isAdmin(currentUser)) {
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
    if (isLogin) {
        modal.innerHTML = `
            <div class="auth-box">
                <button id="close-modal" class="close-modal-btn">
                    <i class="fas fa-times"></i>
                </button>
                <h2 class="auth-title">${title}</h2>
                <form id="auth-form">
                    <div class="form-group">
                        <label>邮箱</label>
                        <input type="email" id="auth-email" required class="form-control" placeholder="请输入学校邮箱">
                    </div>
                    <div class="form-group">
                        <label>密码</label>
                        <div class="password-input-wrapper">
                            <input type="password" id="auth-password" required class="form-control" placeholder="请输入密码">
                            <button type="button" class="password-toggle" data-target="auth-password" title="显示/隐藏密码">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="primary-btn full-width">${title}</button>
                </form>
                <p class="auth-footer">
                    没有账号? <a href="#" id="switch-mode">去注册</a> | <a href="#" id="forgot-password">忘记密码?</a>
                </p>
            </div>
        `;
    } else {
        modal.innerHTML = `
            <div class="auth-box">
                <button id="close-modal" class="close-modal-btn">
                    <i class="fas fa-times"></i>
                </button>
                <h2 class="auth-title">${title}</h2>
                <div id="register-step-1">
                    <form id="register-form-step1">
                        <div class="form-group">
                            <label>校园卡号</label>
                            <div class="email-input-group">
                                <input type="text" id="auth-email" required class="form-control" placeholder="6位卡号" maxlength="6" pattern="\\d{6}" inputmode="numeric">
                                <span class="email-suffix">@whut.edu.cn</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>昵称（可选）</label>
                            <input type="text" id="auth-nickname" class="form-control" placeholder="请输入昵称" maxlength="20">
                        </div>
                        <div class="form-group">
                            <label>密码</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="auth-password" required class="form-control" placeholder="请输入密码（至少6位）" minlength="6">
                                <button type="button" class="password-toggle" data-target="auth-password" title="显示/隐藏密码">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>确认密码</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="auth-password-confirm" required class="form-control" placeholder="请再次输入密码" minlength="6">
                                <button type="button" class="password-toggle" data-target="auth-password-confirm" title="显示/隐藏密码">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <div class="checkbox-group warning">
                                <label>
                                    <div class="warning-title"><i class="fas fa-info-circle"></i> 重要说明</div>
                                    <div class="warning-check-row">
                                        <input type="checkbox" id="confirm-activation" required>
                                        <span>我已激活学校邮箱，并能使用该邮箱<strong>发送</strong>邮件。</span>
                                    </div>
                                </label>
                            </div>
                            <!-- Cloudflare Turnstile Widget -->
                            <div id="turnstile-widget" class="turnstile-widget-container"></div>
                        </div>
                        <button type="submit" id="get-code-btn" class="primary-btn full-width">获取验证码</button>
                    </form>
                </div>
                <div id="register-step-2" style="display: none;">
                    <div class="verify-instructions">
                        <div class="step-indicator">
                            <span class="step done">1</span>
                            <span class="step-line"></span>
                            <span class="step active">2</span>
                            <span class="step-line"></span>
                            <span class="step">3</span>
                        </div>
                        <div class="verify-code-display">
                            <div class="verify-code-label">你的验证码</div>
                            <div class="verify-code" id="display-verify-code">Verify-XXXXXX</div>
                            <button type="button" id="copy-code-btn" class="secondary-btn verify-action-btn">
                                <i class="fas fa-copy"></i> 复制验证码
                            </button>
                        </div>
                        <div class="verify-steps">
                            <h4><i class="fas fa-envelope-open-text"></i> 操作步骤</h4>
                            <ol>
                                <li>打开你的学校邮箱 <strong id="display-user-email">xxxxxx@whut.edu.cn</strong><br><small class="verify-warning-text">⚠️ 如果你使用的是姓名别名邮箱，请在发件人处切换为6位学号邮箱</small></li>
                                <li>新建一封邮件</li>
                                <li>收件人填写：<span class="copy-target"><strong id="display-bot-email">email-bot@haoli.site</strong><button type="button" id="copy-bot-btn" class="icon-btn" title="复制"><i class="fas fa-copy"></i></button></span>
                                </li>
                                <li>邮件主题填写上方的验证码 <code>Verify-XXXXXX</code></li>
                                <li>发送邮件，等待系统自动激活</li>
                            </ol>
                        </div>
                        <div class="verify-status" id="verify-status">
                            <i class="fas fa-envelope"></i> 发送邮件后，请点击下方按钮验证
                            <div class="verify-timer">剩余时间：<span id="verify-countdown">30:00</span></div>
                        </div>
                        <button type="button" id="check-verify-btn" class="primary-btn full-width verify-action-btn">
                            <i class="fas fa-check-circle"></i> 我已发送邮件
                        </button>
                        <button type="button" id="back-to-step1" class="secondary-btn full-width verify-action-btn">
                            <i class="fas fa-arrow-left"></i> 返回修改信息
                        </button>
                    </div>
                </div>
                <div id="register-step-3" style="display: none;">
                    <div class="success-display">
                        <i class="fas fa-check-circle"></i>
                        <h3>注册成功！</h3>
                        <p>你的账户已激活，现在可以登录了。</p>
                        <button type="button" id="go-login-btn" class="primary-btn full-width">
                            <i class="fas fa-sign-in-alt"></i> 去登录
                        </button>
                    </div>
                </div>
                <p class="auth-footer">
                    已有账号? <a href="#" id="switch-mode">去登录</a>
                </p>
            </div>
        `;
    }
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    const switchLink = modal.querySelector('#switch-mode');
    closeBtn.onclick = () => {
        if (window.registerPollingTimer) {
            clearInterval(window.registerPollingTimer);
        }
        modal.remove();
    };
    modal.onclick = (e) => {
        if (e.target === modal) {
            if (window.registerPollingTimer) {
                clearInterval(window.registerPollingTimer);
            }
            modal.remove();
        }
    };
    switchLink.onclick = (e) => {
        e.preventDefault();
        if (window.registerPollingTimer) {
            clearInterval(window.registerPollingTimer);
        }
        modal.remove();
        showAuthModal(isLogin ? 'register' : 'login');
    };
    initPasswordToggles(modal);
    if (isLogin) {
        const form = modal.querySelector('#auth-form');
        const forgotPasswordLink = modal.querySelector('#forgot-password');
        if (forgotPasswordLink) {
            forgotPasswordLink.onclick = (e) => {
                e.preventDefault();
                modal.remove();
                showForgotPasswordModal();
            };
        }
        form.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            try {
                const res = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', email, password })
                });
                const data = await res.json();
                if (data.success) {
                    token = data.token;
                    localStorage.setItem('authToken', token);
                    currentUser = data.user;
                    updateAuthUI();
                    modal.remove();
                    window.location.reload();
                } else {
                    showNotification(data.error, 'error');
                }
            } catch (err) {
                showNotification('Error: ' + err.message, 'error');
            }
        };
    } else {
        let turnstileWidgetId;
        if (window.turnstile) {
            turnstileWidgetId = turnstile.render('#turnstile-widget', {
                sitekey: '0x4AAAAAABfgqCmMGBV9Nf8U',
                callback: function (token) {
                    console.log('Turnstile success');
                },
            });
        }
        const step1Form = modal.querySelector('#register-form-step1');
        const step1Div = modal.querySelector('#register-step-1');
        const step2Div = modal.querySelector('#register-step-2');
        const step3Div = modal.querySelector('#register-step-3');
        const backBtn = modal.querySelector('#back-to-step1');
        const goLoginBtn = modal.querySelector('#go-login-btn');
        let currentStudentId = '';
        step1Form.onsubmit = async (e) => {
            e.preventDefault();
            const studentId = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            const nickname = document.getElementById('auth-nickname').value.trim();
            const confirmCheckbox = document.getElementById('confirm-activation');
            if (!studentId || !/^\d{6}$/.test(studentId)) {
                showNotification('请输入6位校园卡号', 'error');
                return;
            }
            if (!password || password.length < 6) {
                showNotification('密码至少需要6个字符', 'error');
                return;
            }
            const passwordConfirm = document.getElementById('auth-password-confirm').value;
            if (password !== passwordConfirm) {
                showNotification('两次输入的密码不一致', 'error');
                return;
            }
            if (!confirmCheckbox.checked) {
                showNotification('请先确认你已激活学校邮箱', 'error');
                return;
            }
            const isSimpleId = (id) => {
                if (/^(\d)\1+$/.test(id)) return true;
                const seq = '01234567890123456789';
                const revSeq = '98765432109876543210';
                if (seq.includes(id) || revSeq.includes(id)) return true;
                if (/^(\d{2})\1\1$/.test(id)) return true;
                if (/^(\d{3})\1$/.test(id)) return true;
                if (/^(\d)\1(\d)\2(\d)\3$/.test(id)) return true;
                if (/^(\d)\1\1(\d)\2\2$/.test(id)) return true;
                return ['114514'].includes(id);
            };
            if (isSimpleId(studentId)) {
                showNotification('请不要使用简单卡号注册', 'error');
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
            const getCodeBtn = modal.querySelector('#get-code-btn');
            getCodeBtn.disabled = true;
            getCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
            try {
                const res = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'prepare-register',
                        studentId,
                        password,
                        nickname,
                        cfToken
                    })
                });
                const data = await res.json();
                if (data.success) {
                    currentStudentId = studentId;
                    step1Div.style.display = 'none';
                    step2Div.style.display = 'block';
                    modal.querySelector('#display-verify-code').textContent = data.verifyCode;
                    modal.querySelector('#display-user-email').textContent = `${studentId}@whut.edu.cn`;
                    modal.querySelector('#display-bot-email').textContent = data.botEmail;
                    modal.querySelector('.verify-steps ol li:nth-child(4) code').textContent = data.verifyCode;
                    modal.querySelector('#copy-code-btn').onclick = () => {
                        navigator.clipboard.writeText(data.verifyCode);
                        showNotification('验证码已复制', 'success');
                    };
                    modal.querySelector('#copy-bot-btn').onclick = () => {
                        navigator.clipboard.writeText(data.botEmail);
                        showNotification('收信地址已复制', 'success');
                    };
                    let remainingSeconds = data.expiresIn * 60;
                    const countdownEl = modal.querySelector('#verify-countdown');
                    const countdownTimer = setInterval(() => {
                        remainingSeconds--;
                        const mins = Math.floor(remainingSeconds / 60);
                        const secs = remainingSeconds % 60;
                        countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                        if (remainingSeconds <= 0) {
                            clearInterval(countdownTimer);
                            modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                        }
                    }, 1000);
                    const checkVerifyBtn = modal.querySelector('#check-verify-btn');
                    checkVerifyBtn.onclick = async () => {
                        checkVerifyBtn.disabled = true;
                        checkVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';
                        try {
                            const statusRes = await fetch(AUTH_API_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'check-register-status', studentId: currentStudentId })
                            });
                            const statusData = await statusRes.json();
                            if (statusData.success && statusData.activated) {
                                clearInterval(countdownTimer);
                                step2Div.style.display = 'none';
                                step3Div.style.display = 'block';
                                showNotification('账户激活成功！', 'success');
                            } else if (statusData.expired) {
                                clearInterval(countdownTimer);
                                modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                                checkVerifyBtn.style.display = 'none';
                            } else {
                                showNotification('暂未收到验证邮件，请确认已发送后重试', 'warning');
                                checkVerifyBtn.disabled = false;
                                checkVerifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> 我已发送邮件';
                            }
                        } catch (err) {
                            console.error('检查状态失败:', err);
                            showNotification('检查失败，请稍后重试', 'error');
                            checkVerifyBtn.disabled = false;
                            checkVerifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> 我已发送邮件';
                        }
                    };
                } else {
                    showNotification(data.error, 'error');
                    getCodeBtn.disabled = false;
                    getCodeBtn.innerHTML = '获取验证码';
                    if (window.turnstile && turnstileWidgetId) {
                        turnstile.reset(turnstileWidgetId);
                    }
                }
            } catch (err) {
                showNotification('请求失败: ' + err.message, 'error');
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
                if (window.turnstile && turnstileWidgetId) {
                    turnstile.reset(turnstileWidgetId);
                }
            }
        };
        backBtn.onclick = () => {
            if (window.registerPollingTimer) {
                clearInterval(window.registerPollingTimer);
            }
            step2Div.style.display = 'none';
            step1Div.style.display = 'block';
            const getCodeBtn = modal.querySelector('#get-code-btn');
            getCodeBtn.disabled = false;
            getCodeBtn.innerHTML = '获取验证码';
            if (window.turnstile && turnstileWidgetId) {
                turnstile.reset(turnstileWidgetId);
            }
        };
        goLoginBtn.onclick = () => {
            modal.remove();
            showAuthModal('login');
        };
    }
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
        title: 'R2文件同步',
        message: '此操作将全量同步 R2 存储桶。<br><br>正常上传/删除无需使用此功能。<br>仅在你直接操作过 R2 存储桶（如批量上传/改名）导致数据不一致时才使用。<br><br>确定要执行全量同步吗？这可能需要几十秒甚至更久。',
        confirmText: '开始同步'
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
            throw new Error(result.error || '未知错误');
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
                    <input type="text" id="new-nickname" required class="form-control" placeholder="请输入新昵称" value="${escapeHtml(currentUser.nickname || '')}" maxlength="20">
                </div>
                <button type="submit" class="primary-btn full-width">确认修改</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    modal.onmousedown = (e) => { if (e.target === modal) modal.remove(); };
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
            <div id="reset-step-1">
                <form id="reset-form-step1">
                    <div class="form-group">
                        <label>邮箱 (@whut.edu.cn)</label>
                        <input type="email" id="reset-email" required class="form-control" placeholder="请输入注册时使用的邮箱">
                    </div>
                    <div class="form-group">
                        <label>新密码</label>
                        <div class="password-input-wrapper">
                            <input type="password" id="reset-new-password" required class="form-control" placeholder="请输入新密码（至少6位）" minlength="6">
                            <button type="button" class="password-toggle" data-target="reset-new-password" title="显示/隐藏密码">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>确认新密码</label>
                        <div class="password-input-wrapper">
                            <input type="password" id="reset-new-password-confirm" required class="form-control" placeholder="请再次输入新密码" minlength="6">
                            <button type="button" class="password-toggle" data-target="reset-new-password-confirm" title="显示/隐藏密码">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <!-- Cloudflare Turnstile Widget -->
                        <div id="turnstile-reset-widget"></div>
                    </div>
                    <button type="submit" id="get-reset-code-btn" class="primary-btn full-width">获取验证码</button>
                </form>
            </div>
            <div id="reset-step-2" style="display: none;">
                <div class="verify-instructions">
                    <div class="step-indicator">
                        <span class="step done">1</span>
                        <span class="step-line"></span>
                        <span class="step active">2</span>
                        <span class="step-line"></span>
                        <span class="step">3</span>
                    </div>
                    <div class="verify-code-display">
                        <div class="verify-code-label">你的验证码</div>
                        <div class="verify-code" id="display-reset-code">Reset-XXXXXX</div>
                        <button type="button" id="copy-reset-code-btn" class="secondary-btn verify-action-btn">
                            <i class="fas fa-copy"></i> 复制验证码
                        </button>
                    </div>
                    <div class="verify-steps">
                        <h4><i class="fas fa-envelope-open-text"></i> 操作步骤</h4>
                        <ol>
                            <li>打开你的学校邮箱 <strong id="display-reset-user-email">xxx@whut.edu.cn</strong><br><small class="verify-warning-text">⚠️ 请确保使用注册时的邮箱发送，如有别名请切换</small></li>
                            <li>新建一封邮件</li>
                            <li>收件人填写：<span class="copy-target"><strong id="display-reset-bot-email">email-bot@haoli.site</strong><button type="button" id="copy-reset-bot-btn" class="icon-btn" title="复制"><i class="fas fa-copy"></i></button></span>
                            </li>
                            <li>邮件主题填写上方的验证码 <code>Reset-XXXXXX</code></li>
                            <li>发送邮件，等待系统自动重置密码</li>
                        </ol>
                    </div>
                    <div class="verify-status" id="reset-verify-status">
                        <i class="fas fa-envelope"></i> 发送邮件后，请点击下方按钮验证
                        <div class="verify-timer">剩余时间：<span id="reset-countdown">30:00</span></div>
                    </div>
                    <button type="button" id="check-reset-verify-btn" class="primary-btn full-width verify-action-btn">
                        <i class="fas fa-check-circle"></i> 我已发送邮件
                    </button>
                    <button type="button" id="back-to-reset-step1" class="secondary-btn full-width verify-action-btn">
                        <i class="fas fa-arrow-left"></i> 返回修改信息
                    </button>
                </div>
            </div>
            <div id="reset-step-3" style="display: none;">
                <div class="success-display">
                    <i class="fas fa-check-circle"></i>
                    <h3>密码重置成功！</h3>
                    <p>密码已更新，可以使用新密码登录了。</p>
                    <button type="button" id="go-login-after-reset-btn" class="primary-btn full-width">
                        <i class="fas fa-sign-in-alt"></i> 去登录
                    </button>
                </div>
            </div>
            <p class="auth-footer">
                <a href="#" id="back-to-login">返回登录</a>
            </p>
        </div>
    `;
    document.body.appendChild(modal);
    initPasswordToggles(modal);
    const closeBtn = modal.querySelector('#close-modal');
    const backToLoginLink = modal.querySelector('#back-to-login');
    closeBtn.onclick = () => {
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
        }
        modal.remove();
    };
    modal.onclick = (e) => {
        if (e.target === modal) {
            if (window.resetPollingTimer) {
                clearInterval(window.resetPollingTimer);
            }
            modal.remove();
        }
    };
    backToLoginLink.onclick = (e) => {
        e.preventDefault();
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
        }
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
    const step1Form = modal.querySelector('#reset-form-step1');
    const step1Div = modal.querySelector('#reset-step-1');
    const step2Div = modal.querySelector('#reset-step-2');
    const step3Div = modal.querySelector('#reset-step-3');
    const backBtn = modal.querySelector('#back-to-reset-step1');
    const goLoginBtn = modal.querySelector('#go-login-after-reset-btn');
    let currentEmail = '';
    step1Form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value.trim();
        const newPassword = document.getElementById('reset-new-password').value;
        const emailRegex = /^[^\s@]+@whut\.edu\.cn$/;
        if (!email || !emailRegex.test(email)) {
            showNotification('请输入有效的学校邮箱地址', 'error');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            showNotification('新密码至少需要6个字符', 'error');
            return;
        }
        const newPasswordConfirm = document.getElementById('reset-new-password-confirm').value;
        if (newPassword !== newPasswordConfirm) {
            showNotification('两次输入的密码不一致', 'error');
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
        const getCodeBtn = modal.querySelector('#get-reset-code-btn');
        getCodeBtn.disabled = true;
        getCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
        try {
            const res = await fetch(AUTH_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'prepare-reset',
                    email,
                    newPassword,
                    cfToken
                })
            });
            const data = await res.json();
            if (data.success) {
                currentEmail = email;
                step1Div.style.display = 'none';
                step2Div.style.display = 'block';
                modal.querySelector('#display-reset-code').textContent = data.verifyCode;
                modal.querySelector('#display-reset-user-email').textContent = email;
                modal.querySelector('#display-reset-bot-email').textContent = data.botEmail;
                modal.querySelector('.verify-steps ol li:nth-child(4) code').textContent = data.verifyCode;
                modal.querySelector('#copy-reset-code-btn').onclick = () => {
                    navigator.clipboard.writeText(data.verifyCode);
                    showNotification('验证码已复制', 'success');
                };
                modal.querySelector('#copy-reset-bot-btn').onclick = () => {
                    navigator.clipboard.writeText(data.botEmail);
                    showNotification('收信地址已复制', 'success');
                };
                let remainingSeconds = data.expiresIn * 60;
                const countdownEl = modal.querySelector('#reset-countdown');
                const countdownTimer = setInterval(() => {
                    remainingSeconds--;
                    const mins = Math.floor(remainingSeconds / 60);
                    const secs = remainingSeconds % 60;
                    countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    if (remainingSeconds <= 0) {
                        clearInterval(countdownTimer);
                        modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                    }
                }, 1000);
                const checkResetVerifyBtn = modal.querySelector('#check-reset-verify-btn');
                checkResetVerifyBtn.onclick = async () => {
                    checkResetVerifyBtn.disabled = true;
                    checkResetVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';
                    try {
                        const statusRes = await fetch(AUTH_API_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'check-reset-status', email: currentEmail })
                        });
                        const statusData = await statusRes.json();
                        if (statusData.success && statusData.completed && !statusData.pending) {
                            clearInterval(countdownTimer);
                            step2Div.style.display = 'none';
                            step3Div.style.display = 'block';
                            showNotification('密码重置成功！', 'success');
                        } else if (statusData.expired) {
                            clearInterval(countdownTimer);
                            modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                            checkResetVerifyBtn.style.display = 'none';
                        } else {
                            showNotification('暂未收到验证邮件，请确认已发送后重试', 'warning');
                            checkResetVerifyBtn.disabled = false;
                            checkResetVerifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> 我已发送邮件';
                        }
                    } catch (err) {
                        console.error('检查状态失败:', err);
                        showNotification('检查失败，请稍后重试', 'error');
                        checkResetVerifyBtn.disabled = false;
                        checkResetVerifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> 我已发送邮件';
                    }
                };
            } else {
                showNotification(data.error, 'error');
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
                if (window.turnstile && turnstileWidgetId) {
                    turnstile.reset(turnstileWidgetId);
                }
            }
        } catch (err) {
            showNotification('请求失败: ' + err.message, 'error');
            getCodeBtn.disabled = false;
            getCodeBtn.innerHTML = '获取验证码';
            if (window.turnstile && turnstileWidgetId) {
                turnstile.reset(turnstileWidgetId);
            }
        }
    };
    backBtn.onclick = () => {
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
        }
        step2Div.style.display = 'none';
        step1Div.style.display = 'block';
        const getCodeBtn = modal.querySelector('#get-reset-code-btn');
        getCodeBtn.disabled = false;
        getCodeBtn.innerHTML = '获取验证码';
        if (window.turnstile && turnstileWidgetId) {
            turnstile.reset(turnstileWidgetId);
        }
    };
    goLoginBtn.onclick = () => {
        modal.remove();
        showAuthModal('login');
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
                    <div class="password-input-wrapper">
                        <input type="password" id="old-password" required class="form-control" placeholder="请输入旧密码">
                        <button type="button" class="password-toggle" data-target="old-password" title="显示/隐藏密码">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="form-group">
                    <label>新密码</label>
                    <div class="password-input-wrapper">
                        <input type="password" id="new-password" required class="form-control" placeholder="请输入新密码">
                        <button type="button" class="password-toggle" data-target="new-password" title="显示/隐藏密码">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <button type="submit" class="primary-btn full-width">确认修改</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    initPasswordToggles(modal);
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
    modal.innerHTML = `
        <div class="auth-box">
            <div class="admin-modal-header">
                <h2 class="auth-title">AI 操作日志</h2>
                <button id="close-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="logs-container" class="admin-scrollable-container">
                <div class="loading-spinner"></div>
            </div>
            <div id="logs-pagination" class="pagination-controls logs-pagination"></div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    modal.onmousedown = (e) => { if (e.target === modal) modal.remove(); };
    let currentPage = 1;
    let allLogsCache = [];
    const LOGS_PER_PAGE = 20;
    const loadLogs = async (page) => {
        const container = modal.querySelector('#logs-container');
        const pagination = modal.querySelector('#logs-pagination');
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            if (allLogsCache.length === 0) {
                const res = await fetch(`${API_BASE}/api/admin-logs`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                allLogsCache = data.data || [];
            }
            if (allLogsCache.length === 0) {
                container.innerHTML = '<div class="admin-empty-state">暂无日志</div>';
                pagination.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(allLogsCache.length / LOGS_PER_PAGE);
            const startIndex = (page - 1) * LOGS_PER_PAGE;
            const endIndex = startIndex + LOGS_PER_PAGE;
            const logsToShow = allLogsCache.slice(startIndex, endIndex);
            container.innerHTML = logsToShow.map(log => {
                let detailsHtml = '';
                try {
                    const details = JSON.parse(log.details);
                    const originalContent = details.snapshot_content || details.content;
                    if (originalContent) {
                        detailsHtml += `<div class="admin-log-details"><strong>原始内容:</strong> ${escapeHtml(originalContent)}</div>`;
                    }
                    if (details.resource_path) {
                        detailsHtml += `<div class="admin-log-resource-path">资源路径: ${escapeHtml(details.resource_path)}</div>`;
                    }
                    if (details.nickname) {
                        detailsHtml += `<div class="admin-log-user-info">用户昵称: ${escapeHtml(details.nickname)} (ID: ${details.user_id || 'N/A'})</div>`;
                    }
                } catch (e) {
                    detailsHtml = `<div class="admin-log-user-info">${escapeHtml(log.details)}</div>`;
                }
                const actionClassMap = {
                    'ai_delete': 'action-delete',
                    'ai_ban_user': 'action-ban',
                    'ai_reject': 'action-reject',
                    'ai_hide': 'action-hide',
                    'ai_resolve': 'action-resolve'
                };
                const actionClass = actionClassMap[log.action] || 'action-default';
                const utcDate = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
                const date = new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
                return `
                    <div class="admin-log-entry">
                        <div class="admin-log-entry-header">
                            <span class="admin-log-action ${actionClass}">${log.action}</span>
                            <span class="admin-log-timestamp">${date}</span>
                        </div>
                        <div class="admin-log-reason">${escapeHtml(log.reason)}</div>
                        ${detailsHtml}
                    </div>
                `;
            }).join('');
            let paginationHtml = '';
            if (page > 1) paginationHtml += `<button class="pagination-button" id="logs-prev-page"><i class="fas fa-chevron-left"></i> 上一页</button>`;
            paginationHtml += `<span class="pagination-info">${page} / ${totalPages}</span>`;
            if (page < totalPages) paginationHtml += `<button class="pagination-button" id="logs-next-page">下一页 <i class="fas fa-chevron-right"></i></button>`;
            pagination.innerHTML = paginationHtml;
            const nextBtn = pagination.querySelector('#logs-next-page');
            const prevBtn = pagination.querySelector('#logs-prev-page');
            if (nextBtn) nextBtn.onclick = () => loadLogs(page + 1);
            if (prevBtn) prevBtn.onclick = () => loadLogs(page - 1);
        } catch (e) {
            container.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
        }
    };
    loadLogs(currentPage);
}
async function showBannedUsersModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal banned-users-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-user-lock u-margin-right-small"></i>封禁用户管理</h2>
                <button id="close-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="banned-users-container" class="admin-scrollable-container">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
    modal.onmousedown = (e) => { if (e.target === modal) modal.remove(); };
    const loadBannedUsers = async () => {
        const container = modal.querySelector('#banned-users-container');
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const res = await fetch(`${API_ENDPOINTS.guestbook}?action=banned_users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            if (!data.users || data.users.length === 0) {
                container.innerHTML = '<div class="admin-empty-state-padded"><div class="admin-empty-state-icon"><i class="fas fa-check-circle"></i></div>暂无被封禁的用户</div>';
                return;
            }
            container.innerHTML = data.users.map(user => {
                const nickname = user.nickname || '未设置昵称';
                const email = escapeHtml(user.email);
                const utcDate = user.created_at.endsWith('Z') ? user.created_at : user.created_at + 'Z';
                const createdAt = new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
                return `
                    <div class="banned-user-item">
                        <div class="banned-user-info">
                            <div class="banned-user-nickname">${escapeHtml(nickname)}</div>
                            <div class="banned-user-email">${email}</div>
                            <div class="banned-user-date">注册于: ${createdAt}</div>
                        </div>
                        <div class="banned-user-action">
                            <button class="primary-btn small unban-btn" data-user-id="${user.id}">
                                <i class="fas fa-user-check"></i> 解封
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            container.querySelectorAll('.unban-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const userId = btn.dataset.userId;
                    const userItem = btn.closest('.banned-user-item');
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const res = await fetch(`${API_ENDPOINTS.guestbook}?action=unban_user&user_id=${userId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await res.json();
                        if (data.success) {
                            if (data.pending_approval) {
                                btn.innerHTML = '<i class="fas fa-clock"></i> 待审批';
                                btn.disabled = true;
                                if (typeof showNotification === 'function') {
                                    showNotification(data.message || '已提交解封请求，等待审批', 'success');
                                }
                            } else {
                                userItem.style.transition = 'opacity 0.3s, transform 0.3s';
                                userItem.style.opacity = '0';
                                userItem.style.transform = 'translateX(20px)';
                                setTimeout(() => {
                                    userItem.remove();
                                    if (container.querySelectorAll('.banned-user-item').length === 0) {
                                        container.innerHTML = '<div class="admin-empty-state-padded"><div class="admin-empty-state-icon"><i class="fas fa-check-circle"></i></div>暂无被封禁的用户</div>';
                                    }
                                }, 300);
                                if (typeof showNotification === 'function') {
                                    showNotification('用户已解封', 'success');
                                }
                            }
                        } else {
                            throw new Error(data.error || '解封失败');
                        }
                    } catch (err) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-user-check"></i> 解封';
                        if (typeof showNotification === 'function') {
                            showNotification('解封失败: ' + err.message, 'error');
                        }
                    }
                });
            });
        } catch (e) {
            container.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
        }
    };
    loadBannedUsers();
}
document.addEventListener('DOMContentLoaded', () => {
    function getAutoTheme() {
        const hour = new Date().getHours();
        return (hour >= 18 || hour < 6) ? 'dark' : 'light';
    }
    const userPreference = localStorage.getItem('theme');
    const autoThemeSaved = localStorage.getItem('autoTheme');
    let currentTheme;
    if (userPreference && autoThemeSaved !== 'true') {
        currentTheme = userPreference;
    } else {
        currentTheme = getAutoTheme();
        localStorage.setItem('autoTheme', 'true');
    }
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            localStorage.setItem('autoTheme', 'false');
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
async function fetchPendingRequestsCount() {
    try {
        const response = await fetch(`${API_ENDPOINTS.adminRequests}?action=pending_count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const count = data.count || 0;
            const displayCount = count > 99 ? '99+' : count;
            const badges = [
                document.getElementById('pending-requests-badge'),
                document.getElementById('my-requests-badge')
            ];
            badges.forEach(badge => {
                if (badge) {
                    if (count > 0) {
                        badge.textContent = displayCount;
                        badge.classList.remove('u-hidden');
                    } else {
                        badge.classList.add('u-hidden');
                    }
                }
            });
        }
    } catch (e) {
        console.error('获取待审批数量失败:', e);
    }
}
async function showAdminRequestsModal(mode = 'all') {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'admin-requests-modal';
    const isSuperAdminUser = currentUser && currentUser.role === 'super_admin';
    const title = mode === 'mine' ? '我的审批请求' : '审批请求管理';
    const statusFilter = `
        <div class="custom-select-container" id="request-status-dropdown">
            <button class="custom-select-trigger secondary-btn" type="button">
                <span class="selected-text">${mode === 'mine' ? '全部' : '待审批'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="custom-select-options dropdown-menu">
                <div class="dropdown-item" data-value="all">全部</div>
                <div class="dropdown-item" data-value="pending">待审批</div>
                <div class="dropdown-item" data-value="approved">已批准</div>
                <div class="dropdown-item" data-value="rejected">已拒绝</div>
            </div>
            <input type="hidden" id="request-status-filter" value="${mode === 'mine' ? 'all' : 'pending'}">
        </div>
    `;
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-requests-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            <h2 class="auth-title"><i class="fas fa-clipboard-check"></i> ${title}</h2>
            <div class="requests-header">
                ${statusFilter}
                <button id="refresh-requests-btn" class="secondary-btn">
                    <i class="fas fa-sync-alt"></i> 刷新
                </button>
            </div>
            <div id="requests-batch-toolbar" class="requests-batch-toolbar">
                <div class="batch-check-group">
                    <input type="checkbox" id="select-all-requests">
                    <label for="select-all-requests">全选</label>
                    <span id="batch-selected-count" class="batch-count"></span>
                </div>
                <div class="batch-actions">
                    <button id="batch-approve-btn" class="primary-btn small"><i class="fas fa-check"></i> 批准</button>
                    <button id="batch-reject-btn" class="secondary-btn small"><i class="fas fa-times"></i> 拒绝</button>
                </div>
            </div>
            <div id="requests-list" class="requests-list"></div>
        </div>
    `;
    document.body.appendChild(modal);
    const dropdown = modal.querySelector('#request-status-dropdown');
    if (dropdown) {
        const trigger = dropdown.querySelector('.custom-select-trigger');
        const optionsMenu = dropdown.querySelector('.custom-select-options');
        const hiddenInput = dropdown.querySelector('#request-status-filter');
        const options = dropdown.querySelectorAll('.dropdown-item');
        const arrow = trigger.querySelector('.fa-chevron-down');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = optionsMenu.classList.contains('show');
            document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                if (m !== optionsMenu) m.classList.remove('show');
            });
            if (!isOpen) {
                const rect = trigger.getBoundingClientRect();
                optionsMenu.style.position = 'fixed';
                optionsMenu.style.top = (rect.bottom + 4) + 'px';
                optionsMenu.style.left = rect.left + 'px';
                optionsMenu.style.width = rect.width + 'px';
                optionsMenu.style.zIndex = '10001';
                optionsMenu.classList.add('show');
                arrow.style.transform = 'rotate(180deg)';
                trigger.classList.add('active');
            } else {
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
            }
        });
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.dataset.value;
                const text = opt.textContent;
                hiddenInput.value = value;
                trigger.querySelector('.selected-text').textContent = text;
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
                loadRequests();
            });
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !optionsMenu.contains(e.target)) {
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
            }
        });
    }
    const closeModal = () => {
        modal.classList.add('closing');
        const removeModal = () => {
            if (modal.parentNode) modal.remove();
        };
        modal.addEventListener('animationend', removeModal, { once: true });
        setTimeout(removeModal, 350);
    };
    modal.querySelector('#close-requests-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    const batchToolbar = modal.querySelector('#requests-batch-toolbar');
    const selectAllCheckbox = modal.querySelector('#select-all-requests');
    const selectedCountSpan = modal.querySelector('#batch-selected-count');
    const batchApproveBtn = modal.querySelector('#batch-approve-btn');
    const batchRejectBtn = modal.querySelector('#batch-reject-btn');
    let selectedRequestIds = new Set();
    const updateBatchToolbar = () => {
        const checkboxes = modal.querySelectorAll('.request-checkbox');
        const checkedCount = selectedRequestIds.size;
        if (checkboxes.length > 0 && modal.querySelector('#request-status-filter').value === 'pending') {
            batchToolbar.classList.add('visible');
        } else {
            batchToolbar.classList.remove('visible');
            selectedRequestIds.clear();
        }
        if (checkedCount > 0) {
            selectedCountSpan.textContent = `已选 ${checkedCount} 项`;
            batchApproveBtn.disabled = false;
            batchRejectBtn.disabled = false;
        } else {
            selectedCountSpan.textContent = '';
            batchApproveBtn.disabled = true;
            batchRejectBtn.disabled = true;
        }
        if (checkboxes.length > 0) {
            selectAllCheckbox.checked = checkedCount === checkboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    };
    selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = modal.querySelectorAll('.request-checkbox');
        const isChecked = selectAllCheckbox.checked;
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
            const id = cb.value;
            if (isChecked) selectedRequestIds.add(id);
            else selectedRequestIds.delete(id);
        });
        updateBatchToolbar();
    });
    const loadRequests = async () => {
        const listContainer = modal.querySelector('#requests-list');
        listContainer.innerHTML = '<div class="loading-spinner"></div>';
        selectedRequestIds.clear();
        updateBatchToolbar();
        const statusSelect = modal.querySelector('#request-status-filter');
        const status = statusSelect ? statusSelect.value : 'all';
        const mineParam = mode === 'mine' ? '&mine=true' : '';
        try {
            const response = await fetch(`${API_ENDPOINTS.adminRequests}?status=${status}${mineParam}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!data.success || !data.data || data.data.length === 0) {
                listContainer.innerHTML = '<p class="empty-state-small">暂无审批请求</p>';
                batchToolbar.classList.remove('visible');
                return;
            }
            listContainer.innerHTML = data.data.map(req => {
                const requestData = JSON.parse(req.request_data);
                const typeLabels = {
                    'delete_file': '删除文件',
                    'delete_folder': '删除文件夹',
                    'ban_user': '封禁用户',
                    'unban_user': '解封用户'
                };
                const statusLabels = {
                    'pending': '<span class="status-badge auditing"><i class="fas fa-clock"></i> 待审批</span>',
                    'approved': '<span class="status-badge resolved"><i class="fas fa-check"></i> 已批准</span>',
                    'rejected': '<span class="status-badge rejected"><i class="fas fa-times"></i> 已拒绝</span>',
                    'cancelled': '<span class="status-badge"><i class="fas fa-ban"></i> 已取消</span>'
                };
                const fileList = requestData.fileNames
                    ? requestData.fileNames.slice(0, 5).map(n => `<li>${escapeHtml(n)}</li>`).join('')
                    : '';
                const moreFiles = requestData.count > 5 ? `<li>...还有 ${requestData.count - 5} 个</li>` : '';
                let detailsHtml = '';
                if (req.request_type === 'ban_user' || req.request_type === 'unban_user') {
                    detailsHtml = `
                        <div class="ban-user-details">
                            <div><strong>用户昵称：</strong>${escapeHtml(requestData.nickname || '未知')}</div>
                            ${requestData.content_preview ? `<div><strong>留言预览：</strong>${escapeHtml(requestData.content_preview)}${requestData.content_preview.length >= 100 ? '...' : ''}</div>` : ''}
                            ${requestData.source ? `<div><strong>来源：</strong>${requestData.source === 'banned_users_list' ? '封禁用户列表' : '留言板'}</div>` : ''}
                        </div>
                    `;
                } else {
                    detailsHtml = `<ul class="file-list-preview">${fileList}${moreFiles}</ul>`;
                }
                const actionButtons = isSuperAdminUser && req.status === 'pending' ? `
                    <div class="request-actions">
                        <button class="primary-btn approve-btn" data-id="${req.id}">
                            <i class="fas fa-check"></i> 批准
                        </button>
                        <button class="secondary-btn reject-btn" data-id="${req.id}">
                            <i class="fas fa-times"></i> 拒绝
                        </button>
                    </div>
                ` : '';
                const showCheckbox = isSuperAdminUser && req.status === 'pending';
                const checkboxHtml = showCheckbox
                    ? `<div class="request-select"><input type="checkbox" class="request-checkbox" value="${req.id}"></div>`
                    : '';
                return `
                    <div class="request-item ${showCheckbox ? 'has-checkbox' : ''}" data-id="${req.id}">
                        ${checkboxHtml}
                        <div class="request-content-wrapper">
                            <div class="request-header">
                                <span class="request-type">${typeLabels[req.request_type] || req.request_type}</span>
                                ${statusLabels[req.status] || ''}
                            </div>
                            <div class="request-meta">
                                <span><i class="fas fa-user"></i> ${escapeHtml(req.requester_nickname || req.requester_email)}</span>
                                <span><i class="fas fa-clock"></i> ${formatDateLocal(req.created_at)}</span>
                            </div>
                            <div class="request-details">
                                ${detailsHtml}
                            </div>
                            ${req.review_note ? `<div class="review-note"><i class="fas fa-comment"></i> ${escapeHtml(req.review_note)}</div>` : ''}
                            ${req.reviewer_nickname ? `<div class="reviewer-info"><i class="fas fa-user-check"></i> 由 ${escapeHtml(req.reviewer_nickname)} 处理</div>` : ''}
                            ${actionButtons}
                        </div>
                    </div>
                `;
            }).join('');
            listContainer.querySelectorAll('.request-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) selectedRequestIds.add(e.target.value);
                    else selectedRequestIds.delete(e.target.value);
                    updateBatchToolbar();
                });
            });
            listContainer.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await handleRequestAction(btn.dataset.id, 'approve', loadRequests);
                });
            });
            listContainer.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    let note = null;
                    try {
                        if (typeof window.showRejectPrompt === 'function') {
                            note = await window.showRejectPrompt({ title: '拒绝请求', placeholder: '原因' });
                        } else {
                            note = prompt('请输入拒绝原因（可选）:');
                        }
                    } catch (e) { return; }
                    if (note !== null) {
                        await handleRequestAction(btn.dataset.id, 'reject', loadRequests, note);
                    }
                });
            });
            updateBatchToolbar();
        } catch (e) {
            console.error('加载审批请求失败:', e);
            listContainer.innerHTML = '<p class="error-message">加载失败，请稍后重试</p>';
        }
    };
    batchApproveBtn.addEventListener('click', async () => {
        if (selectedRequestIds.size === 0) return;
        if (typeof showConfirmation === 'function') {
            const confirmed = await showConfirmation({
                title: '确认批量批准',
                message: `您确定要批准选中的 <span style="color:var(--primary-color);font-weight:bold;">${selectedRequestIds.size}</span> 个请求吗？`,
                confirmText: '批准',
                confirmClass: 'confirm-btn-primary'
            });
            if (!confirmed) return;
        } else if (!confirm(`确定要批准这 ${selectedRequestIds.size} 个请求吗？`)) {
            return;
        }
        await handleBatchAction(Array.from(selectedRequestIds), 'approve', loadRequests);
    });
    batchRejectBtn.addEventListener('click', async () => {
        if (selectedRequestIds.size === 0) return;
        let note = null;
        if (typeof window.showRejectPrompt === 'function') {
            try {
                note = await window.showRejectPrompt({
                    title: '批量拒绝请求',
                    placeholder: '请输入拒绝所有选中请求的原因（可选）',
                    confirmText: '批量拒绝',
                    showPresets: false
                });
            } catch (e) {
                return;
            }
        } else {
            note = prompt('请输入拒绝所有选中请求的原因（可选）：');
            if (note === null) return;
        }
        await handleBatchAction(Array.from(selectedRequestIds), 'reject', loadRequests, note);
    });
    modal.querySelector('#refresh-requests-btn').addEventListener('click', loadRequests);
    const statusSelect = modal.querySelector('#request-status-filter');
    if (statusSelect) {
        statusSelect.addEventListener('change', loadRequests);
    }
    await loadRequests();
}
async function handleBatchAction(ids, action, refreshCallback, reviewNote = '') {
    const token = localStorage.getItem('authToken');
    const total = ids.length;
    showNotification(`正在${action === 'approve' ? '批准' : '拒绝'} ${total} 个请求...`, 'info', 0);
    try {
        const response = await fetch(API_ENDPOINTS.adminRequests, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                request_ids: ids.map(id => parseInt(id)),
                action: action,
                review_note: reviewNote
            })
        });
        const data = await response.json();
        const successCount = data.count || 0;
        const failCount = data.failCount || 0;
        const allFrontendDeleteKeys = (data.executeResult && data.executeResult.keys) ? data.executeResult.keys : [];
        if (allFrontendDeleteKeys.length > 0 && typeof window.executeBatchDelete === 'function') {
            showNotification(`审批完成，正清理 ${allFrontendDeleteKeys.length} 个关联文件...`, 'info');
            try {
                const results = await window.executeBatchDelete(allFrontendDeleteKeys);
                const deleteFailures = results.filter(r => r.status === 'error');
                const deleteSuccess = results.filter(r => r.status === 'success' || r.status === 'pending').length;
                let msg = `批量处理完成: 审批成功 ${successCount}`;
                if (failCount > 0) msg += `, 审批失败 ${failCount}`;
                if (deleteFailures.length > 0) {
                    msg += `<br>文件清理: ${deleteSuccess} 成功, ${deleteFailures.length} 失败`;
                    showNotification(msg, 'warning');
                } else {
                    msg += `<br>文件清理: ${deleteSuccess} 个已完成`;
                    showNotification(msg, 'success');
                }
            } catch (e) {
                showNotification(`批量处理完成，但文件清理出错: ${e.message}`, 'warning');
            }
        } else {
            if (data.success) {
                showNotification(`批量处理完成: ${successCount} 成功${failCount > 0 ? `, ${failCount} 失败` : ''}`, failCount > 0 ? 'warning' : 'success');
            } else {
                showNotification(data.message || '操作失败', 'error');
            }
        }
    } catch (e) {
        console.error('Batch action error:', e);
        showNotification('批量操作请求失败: ' + e.message, 'error');
    }
    if (refreshCallback) refreshCallback();
}
async function handleRequestAction(requestId, action, refreshCallback, reviewNote = '') {
    try {
        const response = await fetch(API_ENDPOINTS.adminRequests, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                request_id: parseInt(requestId),
                action: action,
                review_note: reviewNote
            })
        });
        const data = await response.json();
        if (data.success) {
            showNotification(data.message || (action === 'approve' ? '已批准' : '已拒绝'), 'success');
            if (data.executeResult && data.executeResult.action_required === 'delete_files_frontend') {
                if (typeof window.executeBatchDelete === 'function') {
                    showNotification('正在执行文件删除操作...', 'info');
                    const deleteKeys = data.executeResult.keys;
                    window.executeBatchDelete(deleteKeys).then(results => {
                        const failed = results.filter(r => r.status === 'error');
                        if (failed.length > 0) {
                            const errorMsg = failed.map(f => `${f.key}: ${f.error}`).join('\n');
                            console.error('部分文件删除失败:', errorMsg);
                            showNotification(`审批通过，但有 ${failed.length} 个文件删除失败，请查看控制台`, 'warning');
                        } else {
                            showNotification('关联文件清理完成', 'success');
                        }
                    }).catch(err => {
                        console.error('前端删除执行出错:', err);
                        showNotification('文件删除过程出错: ' + err.message, 'error');
                    });
                } else {
                    showNotification('警告: 前端删除组件未加载，请手动删除文件', 'warning');
                }
            }
            fetchPendingRequestsCount();
            if (refreshCallback) refreshCallback();
        } else {
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (e) {
        console.error('处理审批请求失败:', e);
        showNotification('操作失败: ' + e.message, 'error');
    }
}
function formatDateLocal(dateString) {
    if (!dateString) return '';
    let date;
    if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
        date = new Date(dateString.replace(' ', 'T') + 'Z');
    } else {
        date = new Date(dateString);
    }
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
