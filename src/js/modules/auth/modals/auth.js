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
