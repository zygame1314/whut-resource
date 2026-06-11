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
    closeBtn.onclick = () => closeAuthModal(modal);
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
                closeAuthModal(modal);
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
                        <div id="hcaptcha-reset-widget" class="captcha-widget" style="display:none;"></div>
                        <div id="pow-reset-status" class="pow-status" style="display:none;">
                            <i class="fas fa-cog fa-spin"></i> <span class="pow-status-text">正在计算人机验证...</span>
                        </div>
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
                        <div class="verify-step-item">
                            <div class="verify-step-num">1</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">打开学校邮箱</div>
                                <div class="verify-step-detail">使用 <strong id="display-reset-user-email">xxx@whut.edu.cn</strong> 登录邮箱</div>
                                <div class="verify-step-warning"><i class="fas fa-exclamation-triangle"></i> 发件人地址必须与上方完全一致，请勿混淆别名邮箱和学号邮箱</div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">2</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">新建邮件</div>
                                <div class="verify-step-detail">点击「写邮件」或「新建邮件」</div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">3</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">填写收件人</div>
                                <div class="verify-step-detail"><span class="copy-target"><strong id="display-reset-bot-email">email-bot@haoli.site</strong><button type="button" id="copy-reset-bot-btn" class="icon-btn" title="复制"><i class="fas fa-copy"></i></button></span></div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">4</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">邮件主题填验证码</div>
                                <div class="verify-step-detail">将上方的验证码 <code id="display-reset-code-inline">Reset-XXXXXX</code> 粘贴到邮件主题（标题）栏</div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">5</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">发送并等待</div>
                                <div class="verify-step-detail">邮件正文留空即可，发送后点击下方按钮</div>
                            </div>
                        </div>
                    </div>
                    <div class="verify-wrong-sender" id="reset-wrong-sender" style="display:none;"></div>
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
                    <p>密码已更新，已自动登录。</p>
                    <button type="button" id="go-login-after-reset-btn" class="primary-btn full-width">
                        <i class="fas fa-home"></i> 进入首页
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
        closeAuthModal(modal);
    };
    backToLoginLink.onclick = (e) => {
        e.preventDefault();
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
        }
        closeAuthModal(modal, () => showAuthModal('login'));
    };
    const step1Form = modal.querySelector('#reset-form-step1');
    const step1Div = modal.querySelector('#reset-step-1');
    const step2Div = modal.querySelector('#reset-step-2');
    const step3Div = modal.querySelector('#reset-step-3');
    const backBtn = modal.querySelector('#back-to-reset-step1');
    const goLoginBtn = modal.querySelector('#go-login-after-reset-btn');
    let currentEmail = '';
    let currentNewPassword = '';
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
        let powPayload = null;
        const resetPowStatusEl2 = modal.querySelector('#pow-reset-status');
        if (resetPowStatusEl2) { resetPowStatusEl2.style.display = 'flex'; }
        try {
            powPayload = await solvePowChallenge((nonce) => {
                if (resetPowStatusEl2) {
                    resetPowStatusEl2.querySelector('.pow-status-text').textContent = `正在计算人机验证... (${nonce})`;
                }
            });
        } catch (e) {
            showNotification('人机验证计算失败: ' + e.message, 'error');
            if (resetPowStatusEl2) { resetPowStatusEl2.style.display = 'none'; }
            return;
        }
        if (resetPowStatusEl2) { resetPowStatusEl2.style.display = 'none'; }
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
                    powChallenge: powPayload.powChallenge,
                    powNonce: powPayload.powNonce,
                    powDifficulty: powPayload.powDifficulty
                })
            });
            const data = await res.json();
            if (data.success) {
                currentEmail = email;
                currentNewPassword = newPassword;
                step1Div.style.display = 'none';
                step2Div.style.display = 'block';
                modal.querySelector('#display-reset-code').textContent = data.verifyCode;
                modal.querySelector('#display-reset-code-inline').textContent = data.verifyCode;
                modal.querySelector('#display-reset-user-email').textContent = email;
                modal.querySelector('#display-reset-bot-email').textContent = data.botEmail;
                modal.querySelector('#copy-reset-code-btn').onclick = () => {
                    navigator.clipboard.writeText(data.verifyCode);
                    showNotification('验证码已复制', 'success');
                };
                modal.querySelector('#copy-reset-bot-btn').onclick = () => {
                    navigator.clipboard.writeText(data.botEmail);
                    showNotification('收信地址已复制', 'success');
                };
                if (modal._verificationCountdownTimer) {
                    clearInterval(modal._verificationCountdownTimer);
                    modal._verificationCountdownTimer = null;
                }
                let remainingSeconds = data.expiresAt
                    ? Math.max(0, Math.floor((new Date(data.expiresAt) - Date.now()) / 1000))
                    : (data.expiresIn || 30) * 60;
                const countdownEl = modal.querySelector('#reset-countdown');
                modal._verificationCountdownTimer = setInterval(() => {
                    remainingSeconds--;
                    const mins = Math.floor(remainingSeconds / 60);
                    const secs = remainingSeconds % 60;
                    countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    if (remainingSeconds <= 0) {
                        clearInterval(modal._verificationCountdownTimer);
                        modal._verificationCountdownTimer = null;
                        modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                    }
                }, 1000);
                const checkResetVerifyBtn = modal.querySelector('#check-reset-verify-btn');
                checkResetVerifyBtn.onclick = () => {
                    startEmailStatusPolling(checkResetVerifyBtn, {
                        action: 'check-reset-status',
                        payload: { email: currentEmail },
                        mainCountdownTimer: modal._verificationCountdownTimer,
                        onWrongSender: (wrongSender) => {
                            const hintEl = modal.querySelector('#reset-wrong-sender');
                            hintEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 检测到使用 <strong>${escapeHtml(wrongSender)}</strong> 发送了邮件，但需要使用 <strong>${escapeHtml(currentEmail)}</strong> 发送。请用正确的邮箱重新发送验证码。`;
                            hintEl.style.display = 'block';
                        },
                        onSuccess: async () => {
                            modal.querySelector('#reset-wrong-sender').style.display = 'none';
                            step2Div.style.display = 'none';
                            step3Div.style.display = 'block';
                            showNotification('密码重置成功！', 'success');
                            try {
                                const loginRes = await fetch(AUTH_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email: currentEmail, password: currentNewPassword }) });
                                const loginData = await loginRes.json();
                                if (loginData.success) {
                                    token = loginData.token;
                                    localStorage.setItem('authToken', token);
                                    currentUser = loginData.user;
                                    window.currentUser = currentUser;
                                    updateAuthUI();
                                    document.dispatchEvent(new Event('authSuccess'));
                                    if (window.releaseRequests) window.releaseRequests(true);
                                }
                            } catch (_) { }
                        },
                        onExpired: () => {
                            modal.querySelector('#reset-wrong-sender').style.display = 'none';
                            modal.querySelector('#reset-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请重新获取';
                            checkResetVerifyBtn.style.display = 'none';
                        }
                    });
                };
            } else {
                showNotification(data.error, 'error');
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
            }
        } catch (err) {
            showNotification('请求失败: ' + err.message, 'error');
            getCodeBtn.disabled = false;
            getCodeBtn.innerHTML = '获取验证码';
        }
    };
    backBtn.onclick = () => {
        if (window.resetPollingTimer) {
            clearInterval(window.resetPollingTimer);
            window.resetPollingTimer = null;
        }
        if (modal._verificationCountdownTimer) {
            clearInterval(modal._verificationCountdownTimer);
            modal._verificationCountdownTimer = null;
        }
        step2Div.style.display = 'none';
        step1Div.style.display = 'block';
        const getCodeBtn = modal.querySelector('#get-reset-code-btn');
        getCodeBtn.disabled = false;
        getCodeBtn.innerHTML = '获取验证码';
    };
    goLoginBtn.onclick = () => {
        closeAuthModal(modal);
    };
}
function showChangePasswordModal(onClose) {
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
    closeBtn.onclick = () => closeAuthModal(modal, onClose);
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
                closeAuthModal(modal, onClose);
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
                        <div id="hcaptcha-change-email-widget" class="captcha-widget" style="display:none;"></div>
                        <div id="pow-change-email-status" class="pow-status" style="display:none;">
                            <i class="fas fa-cog fa-spin"></i> <span class="pow-status-text">正在计算人机验证...</span>
                        </div>
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
                    <div class="verify-steps">
                        <h4><i class="fas fa-envelope-open-text"></i> 操作步骤</h4>
                        <div class="verify-step-item">
                            <div class="verify-step-num">1</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">打开新邮箱</div>
                                <div class="verify-step-detail">使用 <strong id="display-change-new-email">xxx@whut.edu.cn</strong> 登录邮箱</div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">2</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">新建邮件</div>
                                <div class="verify-step-detail">点击「写邮件」或「新建邮件」</div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">3</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">填写收件人</div>
                                <div class="verify-step-detail"><span class="copy-target"><strong id="display-change-bot-email">email-bot@haoli.site</strong><button type="button" id="copy-change-bot-btn" class="icon-btn" title="复制"><i class="fas fa-copy"></i></button></span></div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">4</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">邮件主题填验证码</div>
                                <div class="verify-step-detail">将上方的验证码 <code id="display-change-code-inline">Change-XXXXXX</code> 粘贴到邮件主题（标题）栏</div>
                            </div>
                        </div>
                        <div class="verify-step-item">
                            <div class="verify-step-num">5</div>
                            <div class="verify-step-body">
                                <div class="verify-step-title">发送并等待</div>
                                <div class="verify-step-detail">邮件正文留空即可，发送后点击下方按钮</div>
                            </div>
                        </div>
                    </div>
                    <div class="verify-wrong-sender" id="change-wrong-sender" style="display:none;"></div>
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
        closeAuthModal(modal);
    };
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
        let powPayload = null;
        const changePowStatusEl = modal.querySelector('#pow-change-email-status');
        if (changePowStatusEl) { changePowStatusEl.style.display = 'flex'; }
        try {
            powPayload = await solvePowChallenge((nonce) => {
                if (changePowStatusEl) {
                    changePowStatusEl.querySelector('.pow-status-text').textContent = `正在计算人机验证... (${nonce})`;
                }
            });
        } catch (e) {
            showNotification('人机验证计算失败: ' + e.message, 'error');
            if (changePowStatusEl) { changePowStatusEl.style.display = 'none'; }
            return;
        }
        if (changePowStatusEl) { changePowStatusEl.style.display = 'none'; }
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
                    powChallenge: powPayload.powChallenge,
                    powNonce: powPayload.powNonce,
                    powDifficulty: powPayload.powDifficulty
                })
            });
            const data = await res.json();
            if (data.success) {
                targetNewEmail = newEmail;
                step1Div.style.display = 'none';
                step2Div.style.display = 'block';
                modal.querySelector('#display-change-code').textContent = data.verifyCode;
                modal.querySelector('#display-change-code-inline').textContent = data.verifyCode;
                modal.querySelector('#display-change-new-email').textContent = newEmail;
                modal.querySelector('#display-change-bot-email').textContent = data.botEmail;
                modal.querySelector('#copy-change-code-btn').onclick = () => {
                    navigator.clipboard.writeText(data.verifyCode);
                    showNotification('验证码已复制', 'success');
                };
                modal.querySelector('#copy-change-bot-btn').onclick = () => {
                    navigator.clipboard.writeText(data.botEmail);
                    showNotification('收信地址已复制', 'success');
                };
                if (modal._verificationCountdownTimer) {
                    clearInterval(modal._verificationCountdownTimer);
                    modal._verificationCountdownTimer = null;
                }
                let remainingSeconds = data.expiresAt
                    ? Math.max(0, Math.floor((new Date(data.expiresAt) - Date.now()) / 1000))
                    : (data.expiresIn || 30) * 60;
                const countdownEl = modal.querySelector('#change-countdown');
                modal._verificationCountdownTimer = setInterval(() => {
                    remainingSeconds--;
                    const mins = Math.floor(remainingSeconds / 60);
                    const secs = remainingSeconds % 60;
                    countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    if (remainingSeconds <= 0) {
                        clearInterval(modal._verificationCountdownTimer);
                        modal._verificationCountdownTimer = null;
                        modal.querySelector('#change-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请重新获取';
                    }
                }, 1000);
                const checkBtn = modal.querySelector('#check-change-verify-btn');
                checkBtn.onclick = () => {
                    startEmailStatusPolling(checkBtn, {
                        action: 'check-email-change-status',
                        mainCountdownTimer: modal._verificationCountdownTimer,
                        onWrongSender: (wrongSender) => {
                            const hintEl = modal.querySelector('#change-wrong-sender');
                            hintEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 检测到使用 <strong>${escapeHtml(wrongSender)}</strong> 发送了邮件，但需要使用 <strong>${escapeHtml(targetNewEmail)}</strong> 发送。请用正确的邮箱重新发送验证码。`;
                            hintEl.style.display = 'block';
                        },
                        onSuccess: () => {
                            modal.querySelector('#change-wrong-sender').style.display = 'none';
                            step2Div.style.display = 'none';
                            step3Div.style.display = 'block';
                            showNotification('邮箱更新成功！', 'success');
                        },
                        onExpired: () => {
                            modal.querySelector('#change-wrong-sender').style.display = 'none';
                            modal.querySelector('#change-verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请重新获取';
                            checkBtn.style.display = 'none';
                        }
                    });
                };
            } else {
                showNotification(data.error, 'error');
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
            }
        } catch (err) {
            showNotification('请求失败: ' + err.message, 'error');
            getCodeBtn.disabled = false;
        }
    };
    backBtn.onclick = () => {
        if (window.changePollingTimer) {
            clearInterval(window.changePollingTimer);
            window.changePollingTimer = null;
        }
        if (modal._verificationCountdownTimer) {
            clearInterval(modal._verificationCountdownTimer);
            modal._verificationCountdownTimer = null;
        }
        step2Div.style.display = 'none';
        step1Div.style.display = 'block';
    };
    reloginBtn.onclick = () => {
        logout();
        closeAuthModal(modal, () => showAuthModal('login'));
    };
}
function showPasskeyManageModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            <h2 class="auth-title"><i class="fas fa-fingerprint"></i> 通行密钥管理</h2>
            <div id="passkey-list-container" style="min-height:100px;">
                <div style="text-align:center;padding:2rem;"><div class="loading-spinner"></div></div>
            </div>
            <div style="margin-top:1rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
                <button type="button" id="add-passkey-btn" class="primary-btn full-width"><i class="fas fa-plus"></i> 添加新通行密钥</button>
            </div>
            <p class="auth-footer" style="font-size:0.85rem; margin-top:0.8rem;">
                <i class="fas fa-info-circle"></i> 通行密钥支持指纹、面容、YubiKey 等方式登录
            </p>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-modal').onclick = () => closeAuthModal(modal);

    async function loadPasskeys() {
        const container = modal.querySelector('#passkey-list-container');
        try {
            const res = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'list' }) });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            const passkeys = data.passkeys || [];
            if (passkeys.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-key" style="font-size:2rem;margin-bottom:0.5rem;display:block;"></i>暂无通行密钥<br><small>添加一个即可使用指纹/面容快速登录</small></div>';
                return;
            }
            container.innerHTML = passkeys.map(pk => `
                <div class="passkey-item" data-id="${pk.id}" style="display:flex;align-items:center;justify-content:space-between;padding:0.8rem;border:1px solid var(--border-color);border-radius:8px;margin-bottom:0.5rem;">
                    <div style="flex:1;">
                        <div style="font-weight:600;"><i class="fas fa-key" style="color:var(--primary-color);margin-right:0.3rem;"></i> <span class="pk-name">${escapeHtml(pk.device_name)}</span></div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">
                            创建: ${formatDateLocal(pk.created_at)}${pk.last_used_at ? ' · 最后使用: ' + formatDateLocal(pk.last_used_at) : ''}
                        </div>
                    </div>
                    <div style="display:flex;gap:0.3rem;margin-left:0.5rem;">
                        <button class="icon-btn pk-rename-btn" title="重命名" data-id="${pk.id}" data-name="${escapeHtml(pk.device_name)}"><i class="fas fa-pen"></i></button>
                        <button class="icon-btn pk-delete-btn" title="删除" data-id="${pk.id}" style="color:var(--color-error,#e74c3c);"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
            container.querySelectorAll('.pk-rename-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const oldName = btn.dataset.name;
                    const newName = await showPrompt({ title: '重命名通行密钥', message: '输入新名称:', initialValue: oldName, placeholder: '设备名称', confirmText: '保存', cancelText: '取消' });
                    if (!newName || newName.trim() === oldName) return;
                    const r = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'rename', passkeyId: parseInt(id), newName: newName.trim() }) });
                    const d = await r.json();
                    if (d.success) { showNotification('已重命名', 'success'); loadPasskeys(); }
                    else showNotification(d.error || '重命名失败', 'error');
                };
            });
            container.querySelectorAll('.pk-delete-btn').forEach(btn => {
                btn.onclick = async () => {
                    const confirmed = await showConfirmation({ title: '删除通行密钥', message: '确定删除此通行密钥？<br>删除后将无法使用该密钥登录。', confirmText: '删除', confirmClass: 'danger' });
                    if (!confirmed) return;
                    const id = btn.dataset.id;
                    const r = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'delete', passkeyId: parseInt(id) }) });
                    const d = await r.json();
                    if (d.success) { showNotification('已删除', 'success'); loadPasskeys(); }
                    else showNotification(d.error || '删除失败', 'error');
                };
            });
        } catch (e) {
            container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--color-error);">加载失败: ${e.message}</div>`;
        }
    }

    loadPasskeys();

    modal.querySelector('#add-passkey-btn').onclick = async () => {
        const btn = modal.querySelector('#add-passkey-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 请验证身份...';
        try {
            const b64ToAb = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
            const abToB64 = (ab) => btoa(String.fromCharCode(...new Uint8Array(ab))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const optRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'register-options' }) });
            const optData = await optRes.json();
            if (!optData.success) throw new Error(optData.error);
            const opts = optData.options;
            const cred = await navigator.credentials.create({
                publicKey: {
                    rp: opts.rp,
                    user: { id: new Uint8Array(b64ToAb(opts.user.id)), name: opts.user.name, displayName: opts.user.displayName },
                    challenge: new Uint8Array(b64ToAb(opts.challenge)),
                    pubKeyCredParams: opts.pubKeyCredParams,
                    authenticatorSelection: opts.authenticatorSelection,
                    timeout: opts.timeout,
                    attestation: opts.attestation
                }
            });
            const verifyRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'register-verify', challengeToken: optData.challengeToken, credential: { id: cred.id, rawId: abToB64(cred.rawId), response: { attestationObject: abToB64(cred.response.attestationObject), clientDataJSON: abToB64(cred.response.clientDataJSON) }, type: cred.type }, deviceName: getDeviceName() }) });
            const verifyData = await verifyRes.json();
            if (verifyData.success) { showNotification('通行密钥添加成功！', 'success'); loadPasskeys(); }
            else throw new Error(verifyData.error);
        } catch (e) {
            if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') showNotification('添加失败: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> 添加新通行密钥';
        }
    };
}
