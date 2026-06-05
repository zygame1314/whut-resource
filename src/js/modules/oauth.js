const OAUTH_API_URL = API_ENDPOINTS.oauth;
const AUTH_API_URL = API_ENDPOINTS.auth;

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let currentUser = null;
let token = localStorage.getItem('authToken');
let oauthParams = {};

async function checkAuth() {
    if (!token) {
        showLoginRequired();
        return false;
    }
    try {
        const response = await fetch(AUTH_API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            return true;
        } else {
            localStorage.removeItem('authToken');
            token = null;
            showLoginRequired();
            return false;
        }
    } catch (e) {
        console.error('Auth check failed:', e);
        showLoginRequired();
        return false;
    }
}

function showLoginRequired() {
    const container = document.getElementById('authorize-container');
    if (!container) return;
    container.innerHTML = `
        <div class="oauth-card">
            <div class="oauth-icon"><i class="fas fa-lock"></i></div>
            <h2>需要登录</h2>
            <p class="oauth-desc">请先登录你的武理资源共享平台账号，以继续授权流程。</p>
            <p class="oauth-desc" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">登录后将会自动继续授权。</p>
            <div class="oauth-actions">
                <button id="login-btn" class="oauth-btn oauth-btn-primary">
                    <i class="fas fa-sign-in-alt"></i> 去登录
                </button>
            </div>
        </div>
    `;
    document.getElementById('login-btn').onclick = () => {
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.href = `index.html?oauth_redirect=${returnUrl}`;
    };
}

function showErrorPage(title, message, errorCode) {
    const container = document.getElementById('authorize-container');
    if (!container) return;
    container.innerHTML = `
        <div class="oauth-card">
            <div class="oauth-icon oauth-icon-error"><i class="fas fa-exclamation-triangle"></i></div>
            <h2>${escapeHtml(title)}</h2>
            <p class="oauth-desc">${escapeHtml(message)}</p>
            ${errorCode ? `<p class="oauth-error-code">错误代码: <code>${escapeHtml(errorCode)}</code></p>` : ''}
            <div class="oauth-actions">
                <button class="oauth-btn oauth-btn-secondary" onclick="history.back()">返回</button>
            </div>
        </div>
    `;
}

function showConsentPage(clientInfo, user, scopeStr) {
    const container = document.getElementById('authorize-container');
    if (!container) return;

    const scopes = scopeStr ? scopeStr.split(' ') : ['openid', 'profile', 'email'];
    const scopeDescriptions = {
        'openid': { icon: 'fas fa-id-badge', text: '确认你的身份标识' },
        'profile': { icon: 'fas fa-user', text: '读取你的昵称和角色信息' },
        'email': { icon: 'fas fa-envelope', text: '读取你的邮箱和学号信息' }
    };
    const scopeList = scopes
        .filter(s => scopeDescriptions[s])
        .map(s => `<li><i class="${scopeDescriptions[s].icon}"></i> ${scopeDescriptions[s].text}</li>`)
        .join('');

    container.innerHTML = `
        <div class="oauth-card">
            <div class="oauth-icon"><i class="fas fa-shield-alt"></i></div>
            <h2>授权确认</h2>
            ${clientInfo.logo_url ? `<img src="${escapeHtml(clientInfo.logo_url)}" alt="${escapeHtml(clientInfo.client_name)}" class="oauth-client-logo" onerror="this.style.display='none'">` : ''}
            <p class="oauth-desc">
                <strong>${escapeHtml(clientInfo.client_name)}</strong> 请求访问你的账号信息：
            </p>
            <div class="oauth-user-info">
                <div class="oauth-user-avatar"><i class="fas fa-user-circle"></i></div>
                <div class="oauth-user-detail">
                    <div class="oauth-user-name">${escapeHtml(user.nickname || user.email)}</div>
                    <div class="oauth-user-email">${escapeHtml(user.email)}</div>
                </div>
            </div>
            <ul class="oauth-scope-list">${scopeList}</ul>
            ${clientInfo.description ? `<p class="oauth-client-desc">${escapeHtml(clientInfo.description)}</p>` : ''}
            <div class="oauth-actions">
                <button id="oauth-approve" class="oauth-btn oauth-btn-primary">
                    <i class="fas fa-check"></i> 允许授权
                </button>
                <button id="oauth-deny" class="oauth-btn oauth-btn-danger">
                    <i class="fas fa-times"></i> 拒绝
                </button>
            </div>
            <p class="oauth-footer-hint"><i class="fas fa-info-circle"></i> 授权后，该应用可在授权范围内访问你的信息。你可以随时在个人设置中撤销授权。</p>
        </div>
    `;

    document.getElementById('oauth-approve').onclick = () => submitAuthorization('approve');
    document.getElementById('oauth-deny').onclick = () => submitAuthorization('deny');
}

async function submitAuthorization(decision) {
    const approveBtn = document.getElementById('oauth-approve');
    const denyBtn = document.getElementById('oauth-deny');
    if (approveBtn) approveBtn.disabled = true;
    if (denyBtn) denyBtn.disabled = true;
    if (approveBtn) approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';

    try {
        const response = await fetch(`${OAUTH_API_URL}/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                client_id: oauthParams.client_id,
                redirect_uri: oauthParams.redirect_uri,
                scope: oauthParams.scope || 'openid profile email',
                response_type: 'code',
                state: oauthParams.state,
                code_challenge: oauthParams.code_challenge,
                code_challenge_method: oauthParams.code_challenge_method,
                decision: decision
            })
        });

        const data = await response.json();

        if (decision === 'deny') {
            if (data.error_code === 'access_denied' || data.error) {
                let redirectUrl = oauthParams.redirect_uri;
                if (redirectUrl) {
                    const sep = redirectUrl.includes('?') ? '&' : '?';
                    redirectUrl += `${sep}error=access_denied&error_description=${encodeURIComponent(data.error || '用户拒绝授权')}`;
                    if (oauthParams.state) redirectUrl += `&state=${encodeURIComponent(oauthParams.state)}`;
                    window.location.href = redirectUrl;
                } else {
                    showErrorPage('授权已拒绝', '你已拒绝该应用的授权请求。');
                }
            }
            return;
        }

        if (data.success && data.code) {
            let redirectUrl = data.redirect_uri || oauthParams.redirect_uri;
            const sep = redirectUrl.includes('?') ? '&' : '?';
            redirectUrl += `${sep}code=${encodeURIComponent(data.code)}`;
            if (oauthParams.state) redirectUrl += `&state=${encodeURIComponent(oauthParams.state)}`;
            window.location.href = redirectUrl;
        } else if (data.requireLogin) {
            showLoginRequired();
        } else {
            showErrorPage('授权失败', data.error || '授权请求处理失败，请重试。');
        }
    } catch (err) {
        showErrorPage('请求失败', '网络错误: ' + err.message);
    }
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    oauthParams = {
        client_id: urlParams.get('client_id'),
        redirect_uri: urlParams.get('redirect_uri'),
        scope: urlParams.get('scope'),
        response_type: urlParams.get('response_type'),
        state: urlParams.get('state'),
        code_challenge: urlParams.get('code_challenge'),
        code_challenge_method: urlParams.get('code_challenge_method')
    };

    if (!oauthParams.client_id || !oauthParams.redirect_uri) {
        showErrorPage('参数错误', '缺少必要的 OAuth 参数（client_id 和 redirect_uri）。', 'invalid_request');
        return;
    }

    if (oauthParams.response_type && oauthParams.response_type !== 'code') {
        showErrorPage('不支持的响应类型', '仅支持 response_type=code（授权码模式）。', 'unsupported_response_type');
        return;
    }

    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    try {
        const response = await fetch(`${OAUTH_API_URL}/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                client_id: oauthParams.client_id,
                redirect_uri: oauthParams.redirect_uri,
                scope: oauthParams.scope || 'openid profile email',
                response_type: 'code'
            })
        });
        const data = await response.json();

        if (data.success && data.requireConsent) {
            showConsentPage(data.client, data.user, data.scope);
        } else if (data.success && data.code) {
            let redirectUrl = data.redirect_uri || oauthParams.redirect_uri;
            const sep = redirectUrl.includes('?') ? '&' : '?';
            redirectUrl += `${sep}code=${encodeURIComponent(data.code)}`;
            if (oauthParams.state) redirectUrl += `&state=${encodeURIComponent(oauthParams.state)}`;
            window.location.href = redirectUrl;
        } else if (data.error) {
            showErrorPage('授权失败', data.error);
        }
    } catch (err) {
        showErrorPage('请求失败', '网络错误: ' + err.message);
    }
}

document.addEventListener('DOMContentLoaded', init);