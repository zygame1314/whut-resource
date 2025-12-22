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
                    <i class="fas fa-user"></i> ${escapeHtml(currentUser.nickname || currentUser.email)}
                    <span class="quota">(${quotaDisplay})</span>
                </span>
                ${currentUser.role === 'admin' ? `
                    <button id="sync-btn" class="secondary-btn" title="同步R2文件"><i class="fas fa-sync"></i></button>
                    <button id="vector-sync-btn" class="secondary-btn" title="同步向量索引"><i class="fas fa-brain"></i></button>
                    <button id="admin-logs-btn" class="secondary-btn" title="查看AI操作日志"><i class="fas fa-history"></i></button>
                    <button id="banned-users-btn" class="secondary-btn" title="封禁用户管理"><i class="fas fa-user-lock"></i></button>
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
                document.getElementById('banned-users-btn').addEventListener('click', showBannedUsersModal);
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
                <!-- 第一步：填写信息 -->
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
                            <div id="turnstile-widget" style="margin-top: 10px;"></div>
                        </div>
                        <button type="submit" id="get-code-btn" class="primary-btn full-width">获取验证码</button>
                    </form>
                </div>
                <!-- 第二步：发送验证邮件 -->
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
                <!-- 第三步：激活成功 -->
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
                            modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--error);"></i> 验证码已过期，请返回重新获取';
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
                                modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--error);"></i> 验证码已过期，请返回重新获取';
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
            <!-- 第一步：填写信息 -->
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
            <!-- 第二步：发送验证邮件 -->
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
            <!-- 第三步：重置成功 -->
            <div id="reset-step-3" style="display: none;">
                <div class="success-display">
                    <i class="fas fa-check-circle"></i>
                    <h3>密码重置成功！</h3>
                    <p>你的密码已更新，现在可以使用新密码登录了。</p>
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
                        modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--error);"></i> 验证码已过期，请返回重新获取';
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
                            modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--error);"></i> 验证码已过期，请返回重新获取';
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
    modal.onmousedown = (e) => { if (e.target === modal) modal.remove(); };
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
                    const originalContent = details.snapshot_content || details.content;
                    if (originalContent) {
                        detailsHtml += `<div style="margin-top: 5px; font-size: 0.9em; color: var(--text-secondary); background: var(--bg-secondary); padding: 5px; border-radius: 4px;"><strong>原始内容:</strong> ${escapeHtml(originalContent)}</div>`;
                    }
                    if (details.resource_path) {
                        detailsHtml += `<div style="font-size: 0.8em; color: var(--success);">资源路径: ${escapeHtml(details.resource_path)}</div>`;
                    }
                    if (details.nickname) {
                        detailsHtml += `<div style="font-size: 0.8em; color: var(--text-secondary);">用户昵称: ${escapeHtml(details.nickname)} (ID: ${details.user_id || 'N/A'})</div>`;
                    }
                } catch (e) {
                    detailsHtml = `<div style="font-size: 0.8em; color: var(--text-secondary);">${escapeHtml(log.details)}</div>`;
                }
                const actionColors = {
                    'ai_delete': 'var(--error, #ff4d4f)',
                    'ai_ban_user': 'var(--error, #ff4d4f)',
                    'ai_reject': 'var(--warning, #faad14)',
                    'ai_hide': 'var(--warning, #faad14)',
                    'ai_resolve': 'var(--success, #52c41a)'
                };
                const color = actionColors[log.action] || 'var(--primary)';
                const utcDate = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
                const date = new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
                return `
                    <div style="border-bottom: 1px solid var(--border-color); padding: 10px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <span style="font-weight: bold; color: ${color};">${log.action}</span>
                            <span style="font-size: 0.8em; color: var(--text-secondary);">${date}</span>
                        </div>
                        <div style="margin: 5px 0;">${escapeHtml(log.reason)}</div>
                        ${detailsHtml}
                    </div>
                `;
            }).join('');
            const totalPages = data.pagination.totalPages;
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
            container.innerHTML = `<div style="color: red;">加载失败: ${e.message}</div>`;
        }
    };
    loadLogs(currentPage);
}
async function showBannedUsersModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal banned-users-modal';
    modal.style.cssText = 'display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000;';
    modal.innerHTML = `
        <div class="auth-box" style="width: 90%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 class="auth-title" style="margin: 0;"><i class="fas fa-user-lock" style="margin-right: 8px;"></i>封禁用户管理</h2>
                <button id="close-modal" class="close-modal-btn" style="position: static;"><i class="fas fa-times"></i></button>
            </div>
            <div id="banned-users-container" style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
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
                container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;"><i class="fas fa-check-circle" style="font-size: 2rem; color: var(--success); margin-bottom: 1rem; display: block;"></i>暂无被封禁的用户</div>';
                return;
            }
            container.innerHTML = data.users.map(user => {
                const nickname = user.nickname || '未设置昵称';
                const email = escapeHtml(user.email);
                const utcDate = user.created_at.endsWith('Z') ? user.created_at : user.created_at + 'Z';
                const createdAt = new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
                return `
                    <div class="banned-user-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color); gap: 10px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: bold; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(nickname)}</div>
                            <div style="font-size: 0.85em; color: var(--text-secondary);">${email}</div>
                            <div style="font-size: 0.75em; color: var(--text-secondary);">注册于: ${createdAt}</div>
                        </div>
                        <button class="primary-btn small unban-btn" data-user-id="${user.id}" style="flex-shrink: 0; white-space: nowrap;">
                            <i class="fas fa-user-check"></i> 解封
                        </button>
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
                            userItem.style.transition = 'opacity 0.3s, transform 0.3s';
                            userItem.style.opacity = '0';
                            userItem.style.transform = 'translateX(20px)';
                            setTimeout(() => {
                                userItem.remove();
                                if (container.querySelectorAll('.banned-user-item').length === 0) {
                                    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;"><i class="fas fa-check-circle" style="font-size: 2rem; color: var(--success); margin-bottom: 1rem; display: block;"></i>暂无被封禁的用户</div>';
                                }
                            }, 300);
                            if (typeof showNotification === 'function') {
                                showNotification('用户已解封', 'success');
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
            container.innerHTML = `<div style="color: var(--error); text-align: center; padding: 1rem;">加载失败: ${e.message}</div>`;
        }
    };
    loadBannedUsers();
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
