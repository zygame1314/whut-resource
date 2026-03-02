function showAuthModal(mode = 'login') {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    const isLogin = mode === 'login';
    const isSso = mode === 'sso-login';
    let title = '登录';
    if (mode === 'register') title = '注册';
    if (isSso) title = '智慧理工大登录';
    if (isLogin || isSso) {
        modal.innerHTML = `
            <div class="auth-box ${isSso ? 'sso-box' : ''}">
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            ${isSso ? `
                <div class="sso-brand">
                    <div class="sso-logo-circle">
                        <i class="fas fa-university"></i>
                    </div>
                    <div class="sso-brand-text">
                        <h3>智慧理工大</h3>
                        <p>统一身份认证 (SSO)</p>
                    </div>
                </div>
            ` : `
                <h2 class="auth-title">${title}</h2>
            `}
            <form id="auth-form">
                ${isSso ? `
                <div class="form-group">
                    <label>学号 (Student ID)</label>
                    <div class="input-with-icon">
                        <i class="fas fa-user-graduate"></i>
                        <input type="text" id="auth-email" required class="form-control" placeholder="请输入学校学号">
                    </div>
                </div>
                ` : `
                <div class="form-group">
                    <label>邮箱或卡号</label>
                    <input type="text" id="auth-email" required class="form-control" placeholder="输入学校邮箱前缀或校园卡号">
                </div>
                `}
                <div class="form-group">
                    <label>密码 (Password)</label>
                    <div class="password-input-wrapper">
                        <input type="password" id="auth-password" required class="form-control" placeholder="${isSso ? '平台查询密码 / 初始密码' : '请输入密码'}">
                        <button type="button" class="password-toggle" data-target="auth-password" title="显示/隐藏密码">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div id="login-captcha-container" class="form-group" style="display: none;">
                    <div id="hcaptcha-login-widget" class="h-captcha"></div>
                </div>
                <button type="submit" class="primary-btn full-width ${isSso ? 'sso-btn' : ''}">
                    ${isSso ? '<i class="fas fa-shield-alt"></i> 安全登录' : title}
                </button>
            </form>
            ${isSso ? `
                <div class="sso-security-hint">
                    <i class="fas fa-lock"></i> 你的凭据直接发送至学校认证系统，本站不存储密码
                </div>
            ` : ''}
            ${!isSso ? `
            <div style="margin-top:15px">
                <button type="button" id="switch-sso" class="secondary-btn full-width sso-entry-btn">
                    <i class="fas fa-university"></i> 直接使用智慧理工大登录
                </button>
            </div>
            ` : ''}
            <p class="auth-footer">
                ${isSso ? `
                <a href="#" id="switch-login">返回普通登录</a>
                ` : `
                没有账号? <a href="#" id="switch-mode">去注册</a> | <a href="#" id="forgot-password">忘记密码?</a>
                `}
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
                            <label>邮箱前缀</label>
                            <div class="email-input-group">
                                <input type="text" id="auth-email" required class="form-control" placeholder="请输入学校邮箱前缀">
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
                            <div id="hcaptcha-widget" class="h-captcha" data-sitekey="${HCAPTCHA_SITEKEY}"></div>
                        </div>
                        <button type="submit" id="get-code-btn" class="primary-btn full-width">获取验证码</button>
                    </form>
                    <div style="margin-top: 15px; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                        <button type="button" id="switch-sso" class="secondary-btn full-width sso-entry-btn">
                            <i class="fas fa-university"></i> 或者直接使用智慧理工大登录
                        </button>
                    </div>
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
                                <li>打开你的学校邮箱 <strong id="display-user-email">xxxxxx@whut.edu.cn</strong><br><small class="verify-warning-text">⚠️ 请确保你发送邮件的发件人地址与上方完全一致</small></li>
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
            </div >
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
    if (switchLink) {
        switchLink.onclick = (e) => {
            e.preventDefault();
            if (window.registerPollingTimer) {
                clearInterval(window.registerPollingTimer);
            }
            modal.remove();
            showAuthModal(isLogin ? 'register' : 'login');
        };
    }
    const switchSsoBtn = modal.querySelector('#switch-sso');
    if (switchSsoBtn) {
        switchSsoBtn.onclick = (e) => {
            e.preventDefault();
            modal.remove();
            showAuthModal('sso-login');
        };
    }
    const switchLoginLink = modal.querySelector('#switch-login');
    if (switchLoginLink) {
        switchLoginLink.onclick = (e) => {
            e.preventDefault();
            modal.remove();
            showAuthModal('login');
        };
    }
    initPasswordToggles(modal);
    let loginCaptchaWidgetId = null;
    if (isLogin || isSso) {
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
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn.classList.contains('loading')) return;
            const identifier = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            const captchaContainer = modal.querySelector('#login-captcha-container');
            let cfToken = '';
            if (captchaContainer && captchaContainer.style.display !== 'none' && window.hcaptcha && loginCaptchaWidgetId) {
                cfToken = hcaptcha.getResponse(loginCaptchaWidgetId);
                if (!cfToken) {
                    showNotification('请先完成人机验证', 'error');
                    return;
                }
            }
            let action = 'login';
            let payload = { password, cfToken: cfToken || undefined };
            if (isSso) {
                payload.action = 'whut-login';
                payload.studentId = identifier;
            } else {
                payload.action = 'login';
                if (!identifier.includes('@')) {
                    payload.email = identifier + '@whut.edu.cn';
                } else {
                    payload.email = identifier;
                }
            }
            submitBtn.classList.add('loading');
            try {
                const res = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    token = data.token;
                    localStorage.setItem('authToken', token);
                    currentUser = data.user;
                    updateAuthUI();
                    if (isSso) {
                        modal.remove();
                        const welcomeModal = document.createElement('div');
                        welcomeModal.className = 'auth-modal';
                        welcomeModal.innerHTML = `
                            <div class="auth-box welcome-box">
                                <h2 class="auth-title"><i class="fas fa-check-circle"></i> 登录成功</h2>
                                <div class="welcome-content">
                                    <p>欢迎回来，<strong>${escapeHtml(currentUser.nickname)}</strong>！</p>
                                    <div class="info-card">
                                        <p><i class="fas fa-id-card"></i> 你的学号: <code>${currentUser.student_id}</code></p>
                                        <p><i class="fas fa-envelope"></i> 系统邮箱: <code>${currentUser.email}</code></p>
                                    </div>
                                    <div class="activation-notice">
                                        <h4><i class="fas fa-unlock-alt"></i> 激活本站独立登录</h4>
                                        <p>你已通过 SSO 成功登录。为了方便以后直接使用邮箱登录（无需跳转 SSO），建议你现在去<strong>激活邮箱并设置一个本站密码</strong>。</p>
                                        <p class="small-text">我们已经为你准备好了重置链接，只需点击下方按钮并发送验证邮件即可。</p>
                                    </div>
                                </div>
                                <div class="welcome-actions">
                                    <button id="go-activate-btn" class="primary-btn full-width">立即去激活/设密</button>
                                    <button id="skip-welcome-btn" class="secondary-btn full-width">暂不激活，直接进入</button>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(welcomeModal);
                        welcomeModal.querySelector('#skip-welcome-btn').onclick = () => {
                            welcomeModal.remove();
                            window.location.reload();
                        };
                        welcomeModal.querySelector('#go-activate-btn').onclick = () => {
                            welcomeModal.remove();
                            showForgotPasswordModal(currentUser.email);
                        };
                    } else {
                        modal.remove();
                        window.location.reload();
                    }
                } else {
                    const needCaptcha = data.requireCaptcha;
                    if (needCaptcha && captchaContainer.style.display === 'none') {
                        captchaContainer.style.display = 'block';
                        if (window.hcaptcha && !loginCaptchaWidgetId) {
                            loginCaptchaWidgetId = hcaptcha.render('hcaptcha-login-widget', {
                                sitekey: HCAPTCHA_SITEKEY
                            });
                        }
                        showNotification(data.error + ' 请完成人机验证后重试', 'error');
                    } else if (needCaptcha && window.hcaptcha && loginCaptchaWidgetId) {
                        hcaptcha.reset(loginCaptchaWidgetId);
                        showNotification(data.error, 'error');
                    } else {
                        showNotification(data.error, 'error');
                    }
                }
            } catch (err) {
                showNotification('Error: ' + err.message, 'error');
            } finally {
                submitBtn.classList.remove('loading');
            }
        };
    } else {
        let hcaptchaWidgetId;
        if (window.hcaptcha) {
            hcaptchaWidgetId = hcaptcha.render('hcaptcha-widget', {
                sitekey: HCAPTCHA_SITEKEY
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
            if (!studentId) {
                showNotification('请输入邮箱前缀', 'error');
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
            let cfToken = '';
            if (window.hcaptcha) {
                cfToken = hcaptcha.getResponse(hcaptchaWidgetId);
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
                    modal.querySelector('#display-user-email').textContent = `${studentId} @whut.edu.cn`;
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
                        countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} `;
                        if (remainingSeconds <= 0) {
                            clearInterval(countdownTimer);
                            modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                        }
                    }, 1000);
                    const checkVerifyBtn = modal.querySelector('#check-verify-btn');
                    checkVerifyBtn.onclick = async () => {
                        checkVerifyBtn.disabled = true;
                        let totalWaitMs = 60000;
                        let remainingWaitMs = totalWaitMs;
                        let checkCount = 0;
                        const maxChecks = 12;
                        const checkIntervalMs = 5000;
                        const updateBtnText = () => {
                            const seconds = Math.ceil(remainingWaitMs / 1000);
                            const textSpan = checkVerifyBtn.querySelector('.wait-text');
                            if (textSpan) {
                                textSpan.textContent = `正在确认收件(${seconds}s)...`;
                            }
                        };
                        checkVerifyBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span class="wait-text">正在确认收件(60s)...</span>`;
                        updateBtnText();
                        let cdTimer = setInterval(() => {
                            remainingWaitMs -= 1000;
                            if (remainingWaitMs <= 0) {
                                clearInterval(cdTimer);
                            } else {
                                updateBtnText();
                            }
                        }, 1000);
                        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                        while (checkCount < maxChecks) {
                            try {
                                const statusRes = await fetch(AUTH_API_URL, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'check-register-status', studentId: currentStudentId })
                                });
                                const statusData = await statusRes.json();
                                if (statusData.success && statusData.activated) {
                                    clearInterval(countdownTimer);
                                    clearInterval(cdTimer);
                                    step2Div.style.display = 'none';
                                    step3Div.style.display = 'block';
                                    showNotification('账户激活成功！', 'success');
                                    return;
                                } else if (statusData.expired) {
                                    clearInterval(countdownTimer);
                                    clearInterval(cdTimer);
                                    modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                                    checkVerifyBtn.style.display = 'none';
                                    return;
                                }
                            } catch (err) {
                                console.error('检查状态失败:', err);
                            }
                            checkCount++;
                            if (checkCount < maxChecks) {
                                await delay(checkIntervalMs);
                            }
                        }
                        clearInterval(cdTimer);
                        showNotification('暂未收到邮件，请检查信息无误后再次点击检查。', 'warning');
                        checkVerifyBtn.disabled = false;
                        checkVerifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> 我已发送邮件';
                    };
                } else {
                    showNotification(data.error, 'error');
                    getCodeBtn.disabled = false;
                    getCodeBtn.innerHTML = '获取验证码';
                    if (window.hcaptcha && hcaptchaWidgetId) {
                        hcaptcha.reset(hcaptchaWidgetId);
                    }
                }
            } catch (err) {
                showNotification('请求失败: ' + err.message, 'error');
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
                if (window.hcaptcha && hcaptchaWidgetId) {
                    hcaptcha.reset(hcaptchaWidgetId);
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
            if (window.hcaptcha && hcaptchaWidgetId) {
                hcaptcha.reset(hcaptchaWidgetId);
            }
        };
        goLoginBtn.onclick = () => {
            modal.remove();
            showAuthModal('login');
        };
    }
}
