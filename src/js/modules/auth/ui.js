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
function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const uploadLink = document.getElementById('upload-btn-link');
    const path = window.location.pathname;
    const isMainPage = path === '/' || path.endsWith('/index.html') || path.endsWith('/');
    if (currentUser) {
        const quotaDisplay = isAdmin(currentUser)
            ? '无限'
            : `${currentUser.quota_used || 0} / ${currentUser.quota_limit || 0} 次`;
        if (authSection) {
            const requestButton = (isSuperAdmin(currentUser) && isMainPage) ? `
                <button id="admin-requests-btn" class="secondary-btn" title="审批请求">
                    <i class="fas fa-clipboard-check"></i> 审批
                    <span id="pending-requests-badge" class="badge u-hidden">0</span>
                </button>
            ` : '';
            let dropdownItems = '';
            if (isSuperAdmin(currentUser)) {
                dropdownItems += `
                    <button id="maintenance-toggle-btn" class="dropdown-item"><i class="fas fa-hard-hat"></i> 维护模式</button>
                    <button id="sync-btn" class="dropdown-item"><i class="fas fa-sync"></i> 同步R2文件</button>
                    <button id="vector-sync-btn" class="dropdown-item"><i class="fas fa-brain"></i> 同步向量索引</button>
                    <button id="banned-users-btn" class="dropdown-item"><i class="fas fa-user-lock"></i> 封禁用户管理</button>
                    <div class="dropdown-divider"></div>
                `;
            }
            if (isAdmin(currentUser)) {
                dropdownItems += `
                    <button id="admin-logs-btn" class="dropdown-item"><i class="fas fa-history"></i> 系统操作日志</button>
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
                <button id="change-email-btn" class="dropdown-item"><i class="fas fa-envelope"></i> 修改邮箱</button>
                <button id="manage-passkeys-btn" class="dropdown-item"><i class="fas fa-fingerprint"></i> 通行密钥管理</button>
            `;
            let dropdownHtml = '';
            if (isMainPage) {
                dropdownHtml = `
                <div class="dropdown-container">
                    <button id="admin-tools-toggle" class="secondary-btn" title="工具菜单">
                        <i class="fas fa-tools"></i> 管理 <i class="fas fa-chevron-down u-font-small u-margin-left-small"></i>
                    </button>
                    <div id="admin-tools-menu" class="dropdown-menu">
                        ${dropdownItems}
                    </div>
                </div>`;
            }
            authSection.innerHTML = `
                <span class="user-info">
                    <i class="fas fa-user"></i>
                    <span class="user-info-name" title="${escapeHtml(currentUser.nickname || currentUser.email)}">${escapeHtml(currentUser.nickname || currentUser.email)}</span>
                    <span class="quota" title="今日配额：已用 / 总限额&#10;• 每次下载或预览扣除 1 次&#10;• 文件下载在30秒内重复操作不扣次数&#10;• 每日北京时间 00:00 自动重置">(${quotaDisplay})</span>
                </span>
                ${requestButton}
                ${dropdownHtml}
                <button id="logout-btn" class="secondary-btn"><i class="fas fa-sign-out-alt"></i> 退出</button>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            if (isMainPage) {
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
                const changeNicknameBtn = document.getElementById('change-nickname-btn');
                if (changeNicknameBtn) changeNicknameBtn.addEventListener('click', showChangeNicknameModal);
                const changePwdBtn = document.getElementById('change-pwd-btn');
                if (changePwdBtn) changePwdBtn.addEventListener('click', showChangePasswordModal);
                const changeEmailBtn = document.getElementById('change-email-btn');
                if (changeEmailBtn) changeEmailBtn.addEventListener('click', showChangeEmailModal);
                const managePasskeysBtn = document.getElementById('manage-passkeys-btn');
                if (managePasskeysBtn) managePasskeysBtn.addEventListener('click', showPasskeyManageModal);
                if (isAdmin(currentUser)) {
                    const adminLogsBtn = document.getElementById('admin-logs-btn');
                    if (adminLogsBtn) adminLogsBtn.addEventListener('click', showAdminLogsModal);
                    const myRequestsBtn = document.getElementById('my-requests-btn');
                    if (myRequestsBtn) {
                        myRequestsBtn.addEventListener('click', () => showAdminRequestsModal('mine'));
                    }
                }
                if (isSuperAdmin(currentUser)) {
                    const syncBtn = document.getElementById('sync-btn');
                    if (syncBtn) syncBtn.addEventListener('click', syncFiles);
                    const vectorSyncBtn = document.getElementById('vector-sync-btn');
                    if (vectorSyncBtn) vectorSyncBtn.addEventListener('click', syncVectorIndex);
                    const bannedUsersBtn = document.getElementById('banned-users-btn');
                    if (bannedUsersBtn) bannedUsersBtn.addEventListener('click', showBannedUsersModal);
                    const maintenanceBtn = document.getElementById('maintenance-toggle-btn');
                    if (maintenanceBtn) maintenanceBtn.addEventListener('click', showMaintenanceModal);
                    const reqBtn = document.getElementById('admin-requests-btn');
                    if (reqBtn) reqBtn.addEventListener('click', () => showAdminRequestsModal('all'));
                }
                if (isAdmin(currentUser)) {
                    fetchPendingRequestsCount();
                }
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
            if (isMainPage) {
                authSection.innerHTML = `
                    <button id="login-btn" class="primary-btn"><i class="fas fa-sign-in-alt"></i> 登录</button>
                    <button id="register-btn" class="secondary-btn"><i class="fas fa-user-plus"></i> 注册</button>
                `;
                document.getElementById('login-btn').addEventListener('click', () => showAuthModal('login'));
                document.getElementById('register-btn').addEventListener('click', () => showAuthModal('register'));
            } else {
                authSection.innerHTML = '';
            }
        }
        if (uploadLink) uploadLink.style.display = 'none';
    }
}
