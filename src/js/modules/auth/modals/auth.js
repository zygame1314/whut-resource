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
                    <span>统一认证不稳定，报错请改用邮箱登录</span>
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
                    <div id="hcaptcha-login-widget" class="captcha-widget"></div>
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
                    <i class="fas fa-lock"></i> 你的凭据直接发送至学校认证系统，本站不存储密码
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
                                <label>
                                    <div class="warning-title"><i class="fas fa-info-circle"></i> 重要说明</div>
                                    <div class="warning-check-row">
                                        <input type="checkbox" id="confirm-activation" required>
                                        <span>我已激活学校邮箱，并能使用该邮箱<strong>发送</strong>邮件。</span>
                                    </div>
                                </label>
                            </div>
                            <div id="hcaptcha-widget" class="captcha-widget"></div>
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
    let loginCaptchaWidgetId = null;
    let currentSsoCookies = '';
    let currentSsoSmsHtml = '';
    if (isLogin || isSso) {
        const form = modal.querySelector('#auth-form');
        const forgotPasswordLink = modal.querySelector('#forgot-password');
        if (forgotPasswordLink) {
            forgotPasswordLink.onclick = (e) => {
                e.preventDefault();
                closeAuthModal(modal, () => showForgotPasswordModal());
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
            if (captchaContainer && captchaContainer.style.display !== 'none' && window.hcaptcha && loginCaptchaWidgetId !== null) {
                cfToken = hcaptcha.getResponse(loginCaptchaWidgetId);
                if (!cfToken) {
                    showNotification('请先完成人机验证', 'error');
                    return;
                }
            }
            let payload = { password, cfToken: cfToken || undefined };
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
                    updateAuthUI();
                    if (isSso && data.needsActivation) {
                        closeAuthModal(modal);
                        const welcomeModal = document.createElement('div');
                        welcomeModal.className = 'auth-modal';
                        welcomeModal.innerHTML = `
                            <div class="auth-box welcome-box">
                                <h2 class="auth-title"><i class="fas fa-check-circle"></i> 登录成功</h2>
                                <div class="welcome-content">
                                    <p>欢迎回来，<strong>${escapeHtml(currentUser.nickname)}</strong>！</p>
                                    <div class="info-card">
                                        <p><i class="fas fa-id-card"></i> 你的学号/工号: <code>${currentUser.school_id}</code></p>
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
                                    <button id="setup-passkey-sso-btn" class="secondary-btn full-width" style="display:none;"><i class="fas fa-fingerprint"></i> 设置通行密钥</button>
                                    <button id="skip-welcome-btn" class="secondary-btn full-width">暂不激活，直接进入</button>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(welcomeModal);
                        welcomeModal.querySelector('#skip-welcome-btn').onclick = () => {
                            closeAuthModal(welcomeModal, () => window.location.reload());
                        };
                        welcomeModal.querySelector('#go-activate-btn').onclick = () => {
                            closeAuthModal(welcomeModal, () => showForgotPasswordModal(currentUser.email));
                        };
                        const ssoPasskeyBtn = welcomeModal.querySelector('#setup-passkey-sso-btn');
                        if (ssoPasskeyBtn && window.PublicKeyCredential) {
                            PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(ok => {
                                if (ok) ssoPasskeyBtn.style.display = '';
                            });
                            ssoPasskeyBtn.onclick = async () => {
                                ssoPasskeyBtn.disabled = true;
                                ssoPasskeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 设置中...';
                                try {
                                    const b64ToAb = (s) => { const b = atob(s.replace(/-/g,'+').replace(/_/g,'/')); const a = new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a.buffer; };
                                    const abToB64 = (ab) => btoa(String.fromCharCode(...new Uint8Array(ab))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
                                    const optRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'register-options' }) });
                                    const optData = await optRes.json();
                                    if (!optData.success) throw new Error(optData.error);
                                    const opts = optData.options;
                                    const cred = await navigator.credentials.create({ publicKey: {
                                        rp: opts.rp,
                                        user: { id: new Uint8Array(b64ToAb(opts.user.id)), name: opts.user.name, displayName: opts.user.displayName },
                                        challenge: new Uint8Array(b64ToAb(opts.challenge)),
                                        pubKeyCredParams: opts.pubKeyCredParams,
                                        authenticatorSelection: opts.authenticatorSelection,
                                        timeout: opts.timeout,
                                        attestation: opts.attestation
                                    }});
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
                        closeAuthModal(modal, () => window.location.reload());
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
                        if (loginCaptchaWidgetId === null) {
                            const tryRender = () => {
                                if (window.hcaptcha) { loginCaptchaWidgetId = hcaptcha.render('hcaptcha-login-widget', { sitekey: HCAPTCHA_SITEKEY }); }
                                else { setTimeout(tryRender, 200); }
                            };
                            tryRender();
                        }
                        showNotification(data.error, 'error');
                    } else if (needCaptcha && window.hcaptcha && loginCaptchaWidgetId !== null) {
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
                        const b64ToAb = (s) => { const b = atob(s.replace(/-/g,'+').replace(/_/g,'/')); const a = new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a.buffer; };
                        const abToB64 = (ab) => btoa(String.fromCharCode(...new Uint8Array(ab))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
                        const cred = await navigator.credentials.get({ publicKey: { ...optData.options, challenge: new Uint8Array(b64ToAb(optData.options.challenge)) } });
                        const verifyRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login-verify', challengeToken: optData.challengeToken, credential: { id: cred.id, rawId: abToB64(cred.rawId), response: { authenticatorData: abToB64(cred.response.authenticatorData), clientDataJSON: abToB64(cred.response.clientDataJSON), signature: abToB64(cred.response.signature) }, type: cred.type } }) });
                        const verifyData = await verifyRes.json();
                        if (verifyData.success) {
                            token = verifyData.token;
                            localStorage.setItem('authToken', token);
                            currentUser = verifyData.user;
                            updateAuthUI();
                            closeAuthModal(modal, () => window.location.reload());
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
        let hcaptchaWidgetId;
        function renderHcaptcha() {
            if (window.hcaptcha) {
                hcaptchaWidgetId = hcaptcha.render('hcaptcha-widget', { sitekey: HCAPTCHA_SITEKEY });
            } else {
                setTimeout(renderHcaptcha, 200);
            }
        }
        renderHcaptcha();
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
                        emailPrefix,
                        password,
                        nickname,
                        cfToken
                    })
                });
                const data = await res.json();
                if (data.success) {
                    currentEmailPrefix = emailPrefix;
                    step1Div.style.display = 'none';
                    step2Div.style.display = 'block';
                    modal.querySelector('#display-verify-code').textContent = data.verifyCode;
                    modal.querySelector('#display-user-email').textContent = `${emailPrefix}@whut.edu.cn`;
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
                    checkVerifyBtn.onclick = () => {
                        startEmailStatusPolling(checkVerifyBtn, {
                            action: 'check-register-status',
                            payload: { emailPrefix: currentEmailPrefix },
                            mainCountdownTimer: countdownTimer,
                            onSuccess: async () => {
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
                                        updateAuthUI();
                                        document.dispatchEvent(new Event('authSuccess'));
                                        if (window.releaseRequests) window.releaseRequests(true);
                                    }
                                } catch (_) {}
                                if (token && window.PublicKeyCredential) {
                                    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(ok => {
                                        if (ok) {
                                            const prompt = modal.querySelector('#passkey-setup-prompt');
                                            if (prompt) prompt.style.display = 'block';
                                        }
                                    });
                                }
                            },
                            onExpired: () => {
                                modal.querySelector('#verify-status').innerHTML = '<i class="fas fa-exclamation-triangle u-color-error"></i> 验证码已过期，请返回重新获取';
                                checkVerifyBtn.style.display = 'none';
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
            closeAuthModal(modal, () => window.location.reload());
        };
        const setupPasskeyBtn = modal.querySelector('#setup-passkey-btn');
        if (setupPasskeyBtn) {
            setupPasskeyBtn.onclick = async () => {
                setupPasskeyBtn.disabled = true;
                setupPasskeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 设置中...';
                try {
                    if (!token) throw new Error('请先登录');
                    const b64ToAb = (s) => { const b = atob(s.replace(/-/g,'+').replace(/_/g,'/')); const a = new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a.buffer; };
                    const abToB64 = (ab) => btoa(String.fromCharCode(...new Uint8Array(ab))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
                    const optRes = await fetch(API_ENDPOINTS.passkey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ action: 'register-options' }) });
                    const optData = await optRes.json();
                    if (!optData.success) throw new Error(optData.error);
                    const opts = optData.options;
                    const cred = await navigator.credentials.create({ publicKey: {
                        rp: opts.rp,
                        user: { id: new Uint8Array(b64ToAb(opts.user.id)), name: opts.user.name, displayName: opts.user.displayName },
                        challenge: new Uint8Array(b64ToAb(opts.challenge)),
                        pubKeyCredParams: opts.pubKeyCredParams,
                        authenticatorSelection: opts.authenticatorSelection,
                        timeout: opts.timeout,
                        attestation: opts.attestation
                    }});
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
