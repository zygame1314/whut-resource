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
                    <div class="sso-logo-float">
                        <i class="fas fa-university"></i>
                    </div>
                    <div class="sso-brand-text">
                        <h3>智慧理工大</h3>
                        <p>统一身份认证 (SSO)</p>
                    </div>
                </div>
                <div class="teacher-hint">
                    <i class="fas fa-info-circle"></i>
                    <span>提示：教职工建议直接使用学校邮箱注册登录</span>
                </div>
                <div class="teacher-hint" style="background: rgba(231, 76, 60, 0.08); border-color: rgba(231, 76, 60, 0.2); color: #c0392b;">
                    <i class="fas fa-exclamation-triangle" style="color: #c0392b;"></i>
                    <span>统一认证不稳定，如报错请改用邮箱登录</span>
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
                        <input type="text" id="auth-email" required class="form-control" placeholder="请输入学号或卡号">
                    </div>
                </div>
                ` : `
                <div class="form-group">
                    <label>邮箱或卡号</label>
                    <div class="input-with-icon">
                        <i class="fas fa-envelope"></i>
                        <input type="text" id="auth-email" required class="form-control" placeholder="输入学校邮箱前缀或校园卡号">
                    </div>
                </div>
                `}
                <div class="form-group">
                    <label>密码 (Password)</label>
                    <div class="input-with-icon password-input-wrapper">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="auth-password" required class="form-control" placeholder="${isSso ? '平台查询密码 / 初始密码' : '请输入密码'}">
                        <button type="button" class="password-toggle" data-target="auth-password" title="显示/隐藏密码">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div id="login-captcha-container" class="form-group" style="display: none;">
                    <div id="pow-login-status" class="pow-card">
                        <div class="pow-visual">
                            <svg class="pow-ring-svg" viewBox="0 0 44 44">
                                <circle class="pow-ring-bg" cx="22" cy="22" r="18"/>
                                <circle class="pow-ring-progress" cx="22" cy="22" r="18"/>
                            </svg>
                            <div class="pow-ring-content">
                                <i class="fas fa-shield-alt pow-icon"></i>
                                <i class="fas fa-check pow-check" style="display:none;"></i>
                            </div>
                        </div>
                        <div class="pow-info">
                            <div class="pow-label">点击完成人机验证</div>
                            <div class="pow-rank" style="display:none;"></div>
                            <div class="pow-hash"><span class="pow-hash-label">hash</span> <span class="pow-hash-value">--------</span></div>
                            <div class="pow-nonce-row"><span class="pow-nonce-label">nonce</span> <span class="pow-nonce">0</span></div>
                        </div>
                    </div>
                </div>
                ${isSso ? `
                <div id="sso-captcha-container" class="form-group" style="display: none;">
                    <label>验证码 (Verification Code)</label>
                    <div class="sso-captcha-wrapper">
                        <div class="input-with-icon">
                            <i class="fas fa-barcode"></i>
                            <input type="text" id="sso-captcha-code" class="form-control" placeholder="请输入验证码">
                        </div>
                        <div class="sso-captcha-img-box">
                            <img id="sso-captcha-img" src="" alt="验证码" title="点击刷新">
                        </div>
                    </div>
                </div>
                <div id="sso-sms-container" class="form-group" style="display: none;">
                    <label>短信验证码 (SMS Code)</label>
                    <div class="input-with-icon">
                        <i class="fas fa-sms"></i>
                        <input type="text" id="sso-sms-code" class="form-control" placeholder="请输入手机收到的短信验证码" autocomplete="one-time-code" inputmode="numeric">
                    </div>
                    <div class="form-hint"><i class="fas fa-info-circle"></i> 验证码已发送到你绑定的手机号</div>
                </div>
                ` : ''}
                <button type="submit" class="primary-btn full-width ${isSso ? 'sso-btn' : ''}">
                    ${isSso ? '<i class="fas fa-shield-alt"></i> 安全登录' : title}
                </button>
            </form>
            ${isSso ? `
                <div class="sso-security-hint">
                    <i class="fas fa-lock"></i> 凭据直接发送至学校认证系统，本站不存储密码
                </div>
            ` : ''}
            ${!isSso ? `
            <div style="margin-top:15px">
                <button type="button" id="passkey-login-btn" class="secondary-btn full-width" style="display:none; margin-bottom: 10px;">
                    <i class="fas fa-fingerprint"></i> 使用通行密钥登录
                </button>
                <button type="button" id="switch-sso" class="secondary-btn full-width sso-entry-btn">
                    <i class="fas fa-university"></i> 使用智慧理工大登录
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
            <div class="free-notice">
                <span>本平台完全免费，<strong>从未授权任何付费渠道</strong>。如有人向你收费，请自觉抵制。</span>
            </div>
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
                        <div class="teacher-hint" style="margin-top: 0; margin-bottom: 1.2rem;">
                            <i class="fas fa-info-circle"></i>
                            <span>提示：教职工推荐直接通过学校邮箱注册登录</span>
                        </div>
                        <div class="form-group">
                            <label>邮箱前缀</label>
                            <div class="email-input-group input-with-icon">
                                <i class="fas fa-envelope"></i>
                                <input type="text" id="auth-email" required class="form-control" placeholder="请输入学校邮箱前缀">
                                <span class="email-suffix">@whut.edu.cn</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>昵称（可选）</label>
                            <div class="input-with-icon">
                                <i class="fas fa-signature"></i>
                                <input type="text" id="auth-nickname" class="form-control" placeholder="请输入昵称" maxlength="20">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>密码</label>
                            <div class="input-with-icon password-input-wrapper">
                                <i class="fas fa-lock"></i>
                                <input type="password" id="auth-password" required class="form-control" placeholder="请输入密码（至少6位）" minlength="6">
                                <button type="button" class="password-toggle" data-target="auth-password" title="显示/隐藏密码">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>确认密码</label>
                            <div class="input-with-icon password-input-wrapper">
                                <i class="fas fa-shield-alt"></i>
                                <input type="password" id="auth-password-confirm" required class="form-control" placeholder="请再次输入密码" minlength="6">
                                <button type="button" class="password-toggle" data-target="auth-password-confirm" title="显示/隐藏密码">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <div class="checkbox-group warning">
                                <div class="warning-title"><i class="fas fa-info-circle"></i> 重要说明</div>
                                <label class="warning-check-row">
                                    <input type="checkbox" id="confirm-activation" required>
                                    <span>我已激活学校邮箱，并能使用该邮箱<strong>发送</strong>邮件。</span>
                                </label>
                                <div class="warning-help-link"><a href="https://home.haoli.site/pages/blog-view?id=WHUT%E6%A0%A1%E5%9B%AD%E9%82%AE%E7%AE%B1%E7%94%B3%E8%AF%B7%E5%8F%8A%E7%99%BB%E5%BD%95%E6%8C%87%E5%8D%97" target="_blank" rel="noopener noreferrer"><i class="fas fa-question-circle"></i> 邮箱申请教程</a></div>
                            </div>
                            <div id="hcaptcha-widget" class="captcha-widget" style="display:none;"></div>
                            <div id="pow-register-status" class="pow-card">
                                <div class="pow-visual">
                                    <svg class="pow-ring-svg" viewBox="0 0 44 44">
                                        <circle class="pow-ring-bg" cx="22" cy="22" r="18"/>
                                        <circle class="pow-ring-progress" cx="22" cy="22" r="18"/>
                                    </svg>
                                    <div class="pow-ring-content">
                                        <i class="fas fa-shield-alt pow-icon"></i>
                                        <i class="fas fa-check pow-check" style="display:none;"></i>
                                    </div>
                                </div>
                                <div class="pow-info">
                                    <div class="pow-label">点击完成人机验证</div>
                                    <div class="pow-rank" style="display:none;"></div>
                                    <div class="pow-hash"><span class="pow-hash-label">hash</span> <span class="pow-hash-value">--------</span></div>
                                    <div class="pow-nonce-row"><span class="pow-nonce-label">nonce</span> <span class="pow-nonce">0</span></div>
                                </div>
                            </div>
                        </div>
                        <button type="submit" id="get-code-btn" class="primary-btn full-width">获取验证码</button>
                    </form>
                    <div style="margin-top: 15px; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                        <button type="button" id="switch-sso" class="secondary-btn full-width sso-entry-btn">
                            <i class="fas fa-university"></i> 使用智慧理工大登录
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
                            <div class="verify-step-item">
                                <div class="verify-step-num">1</div>
                                <div class="verify-step-body">
                                    <div class="verify-step-title">打开学校邮箱</div>
                                    <div class="verify-step-detail">使用 <strong id="display-user-email">xxxxxx@whut.edu.cn</strong> 登录邮箱</div>
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
                                    <div class="verify-step-detail"><span class="copy-target"><strong id="display-bot-email">email-bot@haoli.site</strong><button type="button" id="copy-bot-btn" class="icon-btn" title="复制"><i class="fas fa-copy"></i></button></span></div>
                                </div>
                            </div>
                            <div class="verify-step-item">
                                <div class="verify-step-num">4</div>
                                <div class="verify-step-body">
                                    <div class="verify-step-title">邮件主题填验证码</div>
                                    <div class="verify-step-detail">将上方的验证码 <code id="display-verify-code-inline">Verify-XXXXXX</code> 粘贴到邮件主题（标题）栏</div>
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
                        <div class="verify-wrong-sender" id="verify-wrong-sender" style="display:none;"></div>
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
                        <div id="passkey-setup-prompt" style="display:none; margin: 1rem 0; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                            <p style="margin:0 0 0.5rem;"><i class="fas fa-fingerprint" style="color: var(--primary-color);"></i> <strong>设置通行密钥</strong></p>
                            <p style="margin:0 0 0.8rem; font-size:0.9rem; color: var(--text-secondary);">使用指纹、面容或设备密码快速登录，无需每次输入密码。</p>
                            <button type="button" id="setup-passkey-btn" class="secondary-btn full-width">
                                <i class="fas fa-fingerprint"></i> 立即设置
                            </button>
                        </div>
                        <button type="button" id="go-login-btn" class="primary-btn full-width">
                            <i class="fas fa-home"></i> 进入首页
                        </button>
                    </div>
                </div>
                <p class="auth-footer">
                    已有账号? <a href="#" id="switch-mode">去登录</a>
                </p>
                <div class="free-notice">
                    <span>本平台完全免费，<strong>从未授权任何付费渠道</strong>。如有人向你收费，请自觉抵制。</span>
                </div>
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
        closeAuthModal(modal);
    };
    if (switchLink) {
        switchLink.onclick = (e) => {
            e.preventDefault();
            if (window.registerPollingTimer) {
                clearInterval(window.registerPollingTimer);
            }
            closeAuthModal(modal, () => showAuthModal(isLogin ? 'register' : 'login'));
        };
    }
    const switchSsoBtn = modal.querySelector('#switch-sso');
    if (switchSsoBtn) {
        switchSsoBtn.onclick = (e) => {
            e.preventDefault();
            closeAuthModal(modal, () => showAuthModal('sso-login'));
        };
    }
    const switchLoginLink = modal.querySelector('#switch-login');
    if (switchLoginLink) {
        switchLoginLink.onclick = (e) => {
            e.preventDefault();
            closeAuthModal(modal, () => showAuthModal('login'));
        };
    }
    initPasswordToggles(modal);
    let currentSsoCookies = '';
    let currentSsoSmsHtml = '';
    let loginPowCtrl = null;
    if (isLogin || isSso) {
        const form = modal.querySelector('#auth-form');
        const forgotPasswordLink = modal.querySelector('#forgot-password');
        if (forgotPasswordLink) {
            forgotPasswordLink.onclick = (e) => {
                e.preventDefault();
                closeAuthModal(modal, () => showForgotPasswordModal());
            };
        }
        const captchaContainer = modal.querySelector('#login-captcha-container');
        const loginPowEl = modal.querySelector('#pow-login-status');
        if (captchaContainer && captchaContainer.style.display !== 'none' && loginPowEl) {
            loginPowCtrl = initPowCard(loginPowEl);
        }
        form.onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn.classList.contains('loading')) return;
            let ssoPasskeyAvailable = false;
            if (isSso && window.PublicKeyCredential) {
                PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(ok => { ssoPasskeyAvailable = ok; });
            }
            const identifier = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            let powData = null;
            if (loginPowCtrl && captchaContainer && captchaContainer.style.display !== 'none') {
                if (!loginPowCtrl.isSolved() || !loginPowCtrl.meetsRequired()) {
                    if (loginPowCtrl.isSolved() && !loginPowCtrl.meetsRequired()) {
                        loginPowCtrl.reset();
                        showNotification(`人机验证难度不足，需要 ${loginPowCtrl.requiredBits()} 位难度，请重新验证`, 'error', 5000);
                    } else if (!loginPowCtrl.isSolving()) {
                        loginPowEl.click();
                    }
                    if (!loginPowCtrl.isSolved()) {
                        showNotification('请先完成人机验证', 'error');
                        return;
                    }
                }
                powData = loginPowCtrl.getResult();
                if (powData && loginPowCtrl.requiredBits() && powData.powBits < loginPowCtrl.requiredBits()) {
                    loginPowCtrl.reset();
                showNotification(`人机验证难度不足，需要 ${loginPowCtrl.requiredBits()} 位难度，请重新验证`, 'error', 5000);
                return;
                }
            }
            let payload = { password };
            if (powData) {
                payload.powChallenge = powData.powChallenge;
                payload.powNonce = powData.powNonce;
                payload.powBits = powData.powBits;
            }
            if (isSso) {
                payload.action = 'whut-login';
                payload.studentId = identifier;
                payload.ssoCode = modal.querySelector('#sso-captcha-code')?.value || '';
                payload.ssoCookies = currentSsoCookies;
                payload.ssoSmsCode = modal.querySelector('#sso-sms-code')?.value || '';
                payload.ssoSmsHtml = currentSsoSmsHtml;
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
                    window.currentUser = currentUser;
                    if (window.releaseRequests) window.releaseRequests(true);
                    if (isSso && data.needsActivation) {
                        closeAuthModal(modal);
                        const initPwd = data.initialPassword || '';
                        const welcomeModal = document.createElement('div');
                        welcomeModal.className = 'auth-modal';
                        welcomeModal.innerHTML = `
                            <div class="auth-box welcome-box">
                                <h2 class="auth-title"><i class="fas fa-check-circle"></i> 登录成功</h2>
                                <div class="welcome-content">
                                    <p>欢迎回来，<strong>${escapeHtml(currentUser.nickname)}</strong>！你已通过学校统一身份认证登录本站。</p>
                                    <div class="info-card">
                                        <p><i class="fas fa-id-card"></i> 你的学号/工号: <code>${currentUser.school_id}</code></p>
                                        <p><i class="fas fa-envelope"></i> 系统邮箱: <code>${currentUser.email}</code></p>
                                        ${initPwd ? `<p><i class="fas fa-key"></i> 系统初始密码: <code class="initial-password">${escapeHtml(initPwd)}</code><button id="copy-init-pwd-btn" class="copy-btn" title="复制密码"><i class="fas fa-copy"></i></button></p>` : ''}
                                    </div>
                                    <div class="activation-notice">
                                        <h4><i class="fas fa-exclamation-triangle"></i> 请尽快修改初始密码</h4>
                                        ${initPwd ? `<p>上方初始密码为系统随机生成，<strong class="highlight-danger">仅此次显示，之后无法再查看</strong>。请立即修改为你自己容易记住的安全密码，修改时将初始密码作为旧密码输入即可。</p>` : `<p>你的账号已创建，当前使用的是系统生成的随机密码。请立即设置一个自己容易记住的安全密码。</p>`}
                                        <p class="small-text">点击下方按钮直接进入修改密码。</p>
                                    </div>
                                </div>
                                <div class="welcome-actions">
                                    <button id="go-activate-btn" class="primary-btn full-width">立即修改密码</button>
                                    <button id="setup-passkey-sso-btn" class="secondary-btn full-width" style="display:none;"><i class="fas fa-fingerprint"></i> 设置通行密钥</button>
                                    <button id="skip-welcome-btn" class="secondary-btn full-width">暂不修改，直接进入</button>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(welcomeModal);
                        welcomeModal.querySelector('#skip-welcome-btn').onclick = () => {
                             closeAuthModal(welcomeModal);
                             document.dispatchEvent(new Event('authSuccess'));
                        };
                        welcomeModal.querySelector('#go-activate-btn').onclick = () => {
                            closeAuthModal(welcomeModal, () => { showChangePasswordModal(() => { document.dispatchEvent(new Event('authSuccess')); }); });
                        };
                        const copyPwdBtn = welcomeModal.querySelector('#copy-init-pwd-btn');
                        if (copyPwdBtn) {
                            copyPwdBtn.onclick = async () => {
                                try {
                                    await navigator.clipboard.writeText(initPwd);
                                    copyPwdBtn.innerHTML = '<i class="fas fa-check"></i>';
                                    setTimeout(() => { copyPwdBtn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
                                } catch (e) {
                                    showNotification('复制失败，请手动复制', 'error');
                                }
                            };
                        }
                        const ssoPasskeyBtn = welcomeModal.querySelector('#setup-passkey-sso-btn');
                        if (ssoPasskeyBtn && ssoPasskeyAvailable) {
                            ssoPasskeyBtn.style.display = '';
                            ssoPasskeyBtn.onclick = async () => {
                                ssoPasskeyBtn.disabled = true;
                                ssoPasskeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 设置中...';
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
                                    if (verifyData.success) { showNotification('通行密钥设置成功！', 'success'); ssoPasskeyBtn.innerHTML = '<i class="fas fa-check"></i> 已设置'; }
                                    else throw new Error(verifyData.error);
                                } catch (e) {
                                    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') showNotification('设置失败: ' + e.message, 'error');
                                    ssoPasskeyBtn.disabled = false;
                                    ssoPasskeyBtn.innerHTML = '<i class="fas fa-fingerprint"></i> 设置通行密钥';
                                }
                            };
                        }
                    } else {
                        closeAuthModal(modal);
                        document.dispatchEvent(new Event('authSuccess'));
                    }
                } else {
                    if (isSso && data.ssoCaptchaRequired) {
                        const ssoCaptchaContainer = modal.querySelector('#sso-captcha-container');
                        const ssoCaptchaImg = modal.querySelector('#sso-captcha-img');
                        if (ssoCaptchaContainer && ssoCaptchaImg) {
                            ssoCaptchaContainer.style.display = 'block';
                            ssoCaptchaImg.src = data.ssoCaptchaImage;
                            currentSsoCookies = data.ssoCookies;
                            modal.querySelector('#sso-captcha-code').value = '';
                            modal.querySelector('#sso-captcha-code').focus();
                            showNotification(data.error || '请输入验证码以继续', 'error');
                            return;
                        }
                    }
                    if (isSso && data.smsRequired) {
                        const ssoSmsContainer = modal.querySelector('#sso-sms-container');
                        if (ssoSmsContainer) {
                            ssoSmsContainer.style.display = 'block';
                            if (data.ssoCookies) currentSsoCookies = data.ssoCookies;
                            if (data.ssoSmsHtml) currentSsoSmsHtml = data.ssoSmsHtml;
                            const ssoCaptchaContainer = modal.querySelector('#sso-captcha-container');
                            if (ssoCaptchaContainer) ssoCaptchaContainer.style.display = 'none';
                            const loginCaptchaContainer = modal.querySelector('#login-captcha-container');
                            if (loginCaptchaContainer) loginCaptchaContainer.style.display = 'none';
                            modal.querySelector('#sso-sms-code').value = '';
                            modal.querySelector('#sso-sms-code').focus();
                            showNotification(data.error || '请输入短信验证码', 'info');
                            return;
                        }
                    }
                    const needCaptcha = data.requireCaptcha;
                    if (needCaptcha && captchaContainer.style.display === 'none') {
                        captchaContainer.style.display = 'block';
                        if (!loginPowCtrl && loginPowEl) {
                            loginPowCtrl = initPowCard(loginPowEl);
                        }
                        if (loginPowCtrl && data.requiredBits) {
                            loginPowCtrl.reset();
                            loginPowCtrl.setMinBits(data.requiredBits);
                        }
                        showNotification(data.error, 'error');
                    } else if (needCaptcha) {
                        if (loginPowCtrl && data.requiredBits) {
                            loginPowCtrl.reset();
                            loginPowCtrl.setMinBits(data.requiredBits);
                        } else if (loginPowCtrl) {
                            loginPowCtrl.reset();
                        }
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
        if (isSso) {
            const ssoCaptchaImg = modal.querySelector('#sso-captcha-img');
            if (ssoCaptchaImg) {
                ssoCaptchaImg.style.cursor = 'pointer';
                ssoCaptchaImg.onclick = async () => {
                    if (!currentSsoCookies) return;
                    ssoCaptchaImg.style.opacity = '0.5';
                    try {
                        const res = await fetch(AUTH_API_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'sso-refresh-captcha', ssoCookies: currentSsoCookies })
                        });
                        const data = await res.json();
                        if (data.success) {
                            ssoCaptchaImg.src = data.captchaImage;
                            currentSsoCookies = data.cookies;
                            modal.querySelector('#sso-captcha-code').value = '';
                            modal.querySelector('#sso-captcha-code').focus();
                        } else {
                            showNotification(data.error || '刷新验证码失败', 'error');
                        }
                    } catch (err) {
                        showNotification('刷新验证码失败: ' + err.message, 'error');
                    } finally {
                        ssoCaptchaImg.style.opacity = '1';
                    }
                };
            }
        }
        if (!isSso) {
            const passkeyBtn = modal.querySelector('#passkey-login-btn');
            if (passkeyBtn && window.PublicKeyCredential) {
                PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(available => {
                    if (available) passkeyBtn.style.display = '';
                });
                passkeyBtn.onclick = async () => {
                    passkeyBtn.disabled = true;
                    passkeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';
                    try {
                        const optRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login-options' }) });
                        const optData = await optRes.json();
                        if (!optData.success) throw new Error(optData.error);
                        const b64ToAb = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
                        const abToB64 = (ab) => btoa(String.fromCharCode(...new Uint8Array(ab))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                        const cred = await navigator.credentials.get({ publicKey: { ...optData.options, challenge: new Uint8Array(b64ToAb(optData.options.challenge)) } });
                        const verifyRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login-verify', challengeToken: optData.challengeToken, credential: { id: cred.id, rawId: abToB64(cred.rawId), response: { authenticatorData: abToB64(cred.response.authenticatorData), clientDataJSON: abToB64(cred.response.clientDataJSON), signature: abToB64(cred.response.signature) }, type: cred.type } }) });
                        const verifyData = await verifyRes.json();
                        if (verifyData.success) {
                            token = verifyData.token;
                            localStorage.setItem('authToken', token);
                            currentUser = verifyData.user;
                            window.currentUser = currentUser;
                            document.dispatchEvent(new Event('authSuccess'));
                            if (window.releaseRequests) window.releaseRequests(true);
                            closeAuthModal(modal);
                        } else {
                            showNotification(verifyData.error || '通行密钥验证失败', 'error');
                        }
                    } catch (e) {
                        if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') showNotification('通行密钥登录失败: ' + e.message, 'error');
                    } finally {
                        passkeyBtn.disabled = false;
                        passkeyBtn.innerHTML = '<i class="fas fa-fingerprint"></i> 使用通行密钥登录';
                    }
                };
            }
        }
    } else {
        const registerPowEl = modal.querySelector('#pow-register-status');
        const registerPowCtrl = registerPowEl ? initPowCard(registerPowEl, undefined, 'prepare-register') : null;
        const step1Form = modal.querySelector('#register-form-step1');
        const step1Div = modal.querySelector('#register-step-1');
        const step2Div = modal.querySelector('#register-step-2');
        const step3Div = modal.querySelector('#register-step-3');
        const backBtn = modal.querySelector('#back-to-step1');
        const goLoginBtn = modal.querySelector('#go-login-btn');
        let currentEmailPrefix = '';
        step1Form.onsubmit = async (e) => {
            e.preventDefault();
            const rawInput = document.getElementById('auth-email').value.trim();
            const emailPrefix = rawInput.toLowerCase().endsWith('@whut.edu.cn') ? rawInput.slice(0, -12) : rawInput;
            const password = document.getElementById('auth-password').value;
            const nickname = document.getElementById('auth-nickname').value.trim();
            const confirmCheckbox = document.getElementById('confirm-activation');
            if (!emailPrefix) {
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
            let powData = null;
            if (registerPowCtrl) {
                if (!registerPowCtrl.isSolved()) {
                    if (!registerPowCtrl.isSolving()) {
                        registerPowEl.click();
                    }
                    showNotification('请先完成人机验证', 'error');
                    return;
                }
                powData = registerPowCtrl.getResult();
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
                        emailPrefix,
                        password,
                        nickname,
                        powChallenge: powData.powChallenge,
                        powNonce: powData.powNonce,
                        powBits: powData.powBits
                    })
                });
                const data = await res.json();
                if (data.success) {
                    currentEmailPrefix = emailPrefix;
                    step1Div.style.display = 'none';
                    step2Div.style.display = 'block';
                    modal._passkeyAvailable = false;
                    if (window.PublicKeyCredential) {
                        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(ok => {
                            modal._passkeyAvailable = ok;
                        });
                    }
                    modal.querySelector('#display-verify-code').textContent = data.verifyCode;
                    modal.querySelector('#display-user-email').textContent = `${emailPrefix}@whut.edu.cn`;
                    modal.querySelector('#display-bot-email').textContent = data.botEmail;
                    modal.querySelector('#display-verify-code-inline').textContent = data.verifyCode;
                    modal.querySelector('#copy-code-btn').onclick = () => {
                        navigator.clipboard.writeText(data.verifyCode);
                        showNotification('验证码已复制', 'success');
                    };
                    modal.querySelector('#copy-bot-btn').onclick = () => {
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
                    const countdownEl = modal.querySelector('#verify-countdown');
                    modal._verificationCountdownTimer = setInterval(() => {
                        remainingSeconds--;
                        const mins = Math.floor(remainingSeconds / 60);
                        const secs = remainingSeconds % 60;
                        countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} `;
                        if (remainingSeconds <= 0) {
                            clearInterval(modal._verificationCountdownTimer);
                            modal._verificationCountdownTimer = null;
                            modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                        }
                    }, 1000);
                    const checkVerifyBtn = modal.querySelector('#check-verify-btn');
                    checkVerifyBtn.onclick = () => {
                        startEmailStatusPolling(checkVerifyBtn, {
                            action: 'check-register-status',
                            payload: { emailPrefix: currentEmailPrefix },
                            mainCountdownTimer: modal._verificationCountdownTimer,
                            onWrongSender: (wrongSender) => {
                                const hintEl = modal.querySelector('#verify-wrong-sender');
                                hintEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 检测到使用 <strong>${escapeHtml(wrongSender)}</strong> 发送了邮件，但需要使用 <strong>${escapeHtml(currentEmailPrefix)}@whut.edu.cn</strong> 发送。请用正确的邮箱重新发送验证码。`;
                                hintEl.style.display = 'block';
                            },
                            onSuccess: async () => {
                                modal.querySelector('#verify-wrong-sender').style.display = 'none';
                                step2Div.style.display = 'none';
                                step3Div.style.display = 'block';
                                showNotification('账户激活成功！', 'success');
                                try {
                                    const loginRes = await fetch(AUTH_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email: `${currentEmailPrefix}@whut.edu.cn`, password }) });
                                    const loginData = await loginRes.json();
                                    if (loginData.success) {
                                        token = loginData.token;
                                        localStorage.setItem('authToken', token);
                                        currentUser = loginData.user;
                                        window.currentUser = currentUser;
                                        document.dispatchEvent(new Event('authSuccess'));
                                        if (window.releaseRequests) window.releaseRequests(true);
                                    }
                                } catch (_) { }
                                if (token && modal._passkeyAvailable) {
                                    const prompt = modal.querySelector('#passkey-setup-prompt');
                                    if (prompt) prompt.style.display = 'block';
                                }
                            },
                            onExpired: () => {
                                modal.querySelector('#verify-wrong-sender').style.display = 'none';
                                modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                                checkVerifyBtn.style.display = 'none';
                            }
                        });
                    };
                } else {
                    showNotification(data.error, 'error');
                    if (registerPowCtrl) registerPowCtrl.reset();
                    getCodeBtn.disabled = false;
                    getCodeBtn.innerHTML = '获取验证码';
                }
            } catch (err) {
                showNotification('请求失败: ' + err.message, 'error');
                if (registerPowCtrl) registerPowCtrl.reset();
                getCodeBtn.disabled = false;
                getCodeBtn.innerHTML = '获取验证码';
            }
        };
        backBtn.onclick = () => {
            if (window.registerPollingTimer) {
                clearInterval(window.registerPollingTimer);
                window.registerPollingTimer = null;
            }
            if (modal._verificationCountdownTimer) {
                clearInterval(modal._verificationCountdownTimer);
                modal._verificationCountdownTimer = null;
            }
            step2Div.style.display = 'none';
            step1Div.style.display = 'block';
            const getCodeBtn = modal.querySelector('#get-code-btn');
            getCodeBtn.disabled = false;
            getCodeBtn.innerHTML = '获取验证码';
        };
        goLoginBtn.onclick = () => {
            closeAuthModal(modal);
        };
        const setupPasskeyBtn = modal.querySelector('#setup-passkey-btn');
        if (setupPasskeyBtn) {
            setupPasskeyBtn.onclick = async () => {
                setupPasskeyBtn.disabled = true;
                setupPasskeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 设置中...';
                try {
                    if (!token) throw new Error('请先登录');
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
                    if (verifyData.success) {
                        showNotification('通行密钥设置成功！下次可直接使用指纹/面容登录', 'success');
                        setupPasskeyBtn.innerHTML = '<i class="fas fa-check"></i> 已设置';
                    } else {
                        throw new Error(verifyData.error);
                    }
                } catch (e) {
                    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') showNotification('设置失败: ' + e.message, 'error');
                    setupPasskeyBtn.disabled = false;
                    setupPasskeyBtn.innerHTML = '<i class="fas fa-fingerprint"></i> 立即设置';
                }
            };
        }
    }
}
