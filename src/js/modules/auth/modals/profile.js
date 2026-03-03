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
                    <div class="input-with-icon">
                        <i class="fas fa-signature"></i>
                        <input type="text" id="new-nickname" required class="form-control" placeholder="请输入新昵称" value="${escapeHtml(currentUser.nickname || '')}" maxlength="20">
                    </div>
                </div>
                <button type="submit" class="primary-btn full-width">确认修改</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => modal.remove();
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
function showForgotPasswordModal(prefillEmail = '') {
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
                        <div class="input-with-icon">
                            <i class="fas fa-envelope"></i>
                            <input type="email" id="reset-email" required class="form-control" placeholder="请输入注册时使用的邮箱" value="${escapeHtml(prefillEmail)}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>新密码</label>
                        <div class="input-with-icon password-input-wrapper">
                            <i class="fas fa-lock"></i>
                            <input type="password" id="reset-new-password" required class="form-control" placeholder="请输入新密码（至少6位）" minlength="6">
                            <button type="button" class="password-toggle" data-target="reset-new-password" title="显示/隐藏密码">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>确认新密码</label>
                        <div class="input-with-icon password-input-wrapper">
                            <i class="fas fa-shield-alt"></i>
                            <input type="password" id="reset-new-password-confirm" required class="form-control" placeholder="请再次输入新密码" minlength="6">
                            <button type="button" class="password-toggle" data-target="reset-new-password-confirm" title="显示/隐藏密码">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <div id="hcaptcha-reset-widget" class="h-captcha" data-sitekey="${HCAPTCHA_SITEKEY}"></div>
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
    backToLoginLink.onclick = (e) => {
        e.preventDefault();
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
        }
        modal.remove();
        showAuthModal('login');
    };
    let hcaptchaWidgetId;
    if (window.hcaptcha) {
        hcaptchaWidgetId = hcaptcha.render('hcaptcha-reset-widget', {
            sitekey: HCAPTCHA_SITEKEY
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
        if (window.hcaptcha) {
            cfToken = hcaptcha.getResponse(hcaptchaWidgetId);
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
                checkResetVerifyBtn.onclick = () => {
                    startEmailStatusPolling(checkResetVerifyBtn, {
                        action: 'check-reset-status',
                        payload: { email: currentEmail },
                        mainCountdownTimer: countdownTimer,
                        onSuccess: () => {
                            step2Div.style.display = 'none';
                            step3Div.style.display = 'block';
                            showNotification('密码重置成功！', 'success');
                        },
                        onExpired: () => {
                            modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请重新获取';
                            checkResetVerifyBtn.style.display = 'none';
                        }
                    });
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
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
        }
        step2Div.style.display = 'none';
        step1Div.style.display = 'block';
        const getCodeBtn = modal.querySelector('#get-reset-code-btn');
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
                    <div class="input-with-icon password-input-wrapper">
                        <i class="fas fa-key"></i>
                        <input type="password" id="old-password" required class="form-control" placeholder="请输入旧密码">
                        <button type="button" class="password-toggle" data-target="old-password" title="显示/隐藏密码">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="form-group">
                    <label>新密码</label>
                    <div class="input-with-icon password-input-wrapper">
                        <i class="fas fa-lock"></i>
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
function showChangeEmailModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            <h2 class="auth-title">修改邮箱</h2>
            <div id="change-email-step-1">
                <form id="change-email-form-step1">
                    <div class="form-group">
                        <label>新邮箱 (@whut.edu.cn)</label>
                        <div class="input-with-icon">
                            <i class="fas fa-envelope"></i>
                            <input type="email" id="new-email-input" required class="form-control" placeholder="请输入你的新学校邮箱">
                        </div>
                    </div>
                    <div class="form-group">
                        <div id="hcaptcha-change-email-widget" class="h-captcha" data-sitekey="${HCAPTCHA_SITEKEY}"></div>
                    </div>
                    <button type="submit" id="get-change-code-btn" class="primary-btn full-width">获取验证码</button>
                </form>
            </div>
            <div id="change-email-step-2" style="display: none;">
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
                        <div class="verify-code" id="display-change-code">Change-XXXXXX</div>
                        <button type="button" id="copy-change-code-btn" class="secondary-btn verify-action-btn">
                            <i class="fas fa-copy"></i> 复制验证码
                        </button>
                    </div>
                    <div class="verify-steps" style="font-size: 0.9rem;">
                        <h4><i class="fas fa-envelope-open-text"></i> 操作步骤</h4>
                        <ol>
                            <li>登录你的【新邮箱】 <strong id="display-change-new-email">xxx@whut.edu.cn</strong></li>
                            <li>新建一封邮件</li>
                            <li>收件人填写：<span class="copy-target"><strong id="display-change-bot-email">email-bot@haoli.site</strong><button type="button" id="copy-change-bot-btn" class="icon-btn" title="复制"><i class="fas fa-copy"></i></button></span></li>
                            <li>邮件主题填写上方的验证码 <code>Change-XXXXXX</code></li>
                            <li>发送邮件，系统将自动核对并解绑旧邮箱</li>
                        </ol>
                    </div>
                    <div class="verify-status" id="change-verify-status">
                        <i class="fas fa-envelope"></i> 发送邮件后，请点击下方按钮验证
                        <div class="verify-timer">剩余时间：<span id="change-countdown">30:00</span></div>
                    </div>
                    <button type="button" id="check-change-verify-btn" class="primary-btn full-width verify-action-btn">
                        <i class="fas fa-check-circle"></i> 我已发送邮件
                    </button>
                    <button type="button" id="back-to-change-step1" class="secondary-btn full-width verify-action-btn">
                        <i class="fas fa-arrow-left"></i> 返回修改地址
                    </button>
                </div>
            </div>
            <div id="change-email-step-3" style="display: none;">
                <div class="success-display">
                    <i class="fas fa-check-circle"></i>
                    <h3>邮箱换绑成功！</h3>
                    <p>你的账号邮箱已成功更新。为保证账户安全，请使用新邮箱重新登录。</p>
                    <button type="button" id="relogin-after-change-btn" class="primary-btn full-width">
                        <i class="fas fa-sign-in-alt"></i> 重新登录
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => {
        if (window.changePollingTimer) clearInterval(window.changePollingTimer);
        modal.remove();
    };
    let hcaptchaWidgetId;
    if (window.hcaptcha) {
        hcaptchaWidgetId = hcaptcha.render('hcaptcha-change-email-widget', {
            sitekey: HCAPTCHA_SITEKEY
        });
    }
    const step1Form = modal.querySelector('#change-email-form-step1');
    const step1Div = modal.querySelector('#change-email-step-1');
    const step2Div = modal.querySelector('#change-email-step-2');
    const step3Div = modal.querySelector('#change-email-step-3');
    const backBtn = modal.querySelector('#back-to-change-step1');
    const reloginBtn = modal.querySelector('#relogin-after-change-btn');
    let targetNewEmail = '';
    step1Form.onsubmit = async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('new-email-input').value.trim();
        const emailRegex = /^[^\s@]+@whut\.edu\.cn$/;
        if (!newEmail || !emailRegex.test(newEmail)) {
            showNotification('请输入有效的学校邮箱地址', 'error');
            return;
        }
        if (newEmail === currentUser.email) {
            showNotification('新邮箱不能与旧邮箱相同', 'error');
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
        const getCodeBtn = modal.querySelector('#get-change-code-btn');
        getCodeBtn.disabled = true;
        getCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
        try {
            const res = await fetch(AUTH_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: 'prepare-change-email',
                    newEmail,
                    cfToken
                })
            });
            const data = await res.json();
            if (data.success) {
                targetNewEmail = newEmail;
                step1Div.style.display = 'none';
                step2Div.style.display = 'block';
                modal.querySelector('#display-change-code').textContent = data.verifyCode;
                modal.querySelector('#display-change-new-email').textContent = newEmail;
                modal.querySelector('#display-change-bot-email').textContent = data.botEmail;
                modal.querySelector('.verify-steps ol li:nth-child(4) code').textContent = data.verifyCode;
                modal.querySelector('#copy-change-code-btn').onclick = () => {
                    navigator.clipboard.writeText(data.verifyCode);
                    showNotification('验证码已复制', 'success');
                };
                modal.querySelector('#copy-change-bot-btn').onclick = () => {
                    navigator.clipboard.writeText(data.botEmail);
                    showNotification('收信地址已复制', 'success');
                };
                let remainingSeconds = data.expiresIn * 60;
                const countdownEl = modal.querySelector('#change-countdown');
                const countdownTimer = setInterval(() => {
                    remainingSeconds--;
                    const mins = Math.floor(remainingSeconds / 60);
                    const secs = remainingSeconds % 60;
                    countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    if (remainingSeconds <= 0) {
                        clearInterval(countdownTimer);
                        modal.querySelector('#change-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请重新获取';
                    }
                }, 1000);
                const checkBtn = modal.querySelector('#check-change-verify-btn');
                checkBtn.onclick = () => {
                    startEmailStatusPolling(checkBtn, {
                        action: 'check-email-change-status',
                        mainCountdownTimer: countdownTimer,
                        onSuccess: () => {
                            step2Div.style.display = 'none';
                            step3Div.style.display = 'block';
                            showNotification('邮箱更新成功！', 'success');
                        },
                        onExpired: () => {
                            modal.querySelector('#change-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请重新获取';
                            checkBtn.style.display = 'none';
                        }
                    });
                };
            } else {
                showNotification(data.error, 'error');
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
                if (window.hcaptcha) hcaptcha.reset(hcaptchaWidgetId);
            }
        } catch (err) {
            showNotification('请求失败: ' + err.message, 'error');
            getCodeBtn.disabled = false;
        }
    };
    backBtn.onclick = () => {
        step2Div.style.display = 'none';
        step1Div.style.display = 'block';
        if (window.hcaptcha) hcaptcha.reset(hcaptchaWidgetId);
    };
    reloginBtn.onclick = () => {
        logout();
        modal.remove();
        showAuthModal('login');
    };
}
