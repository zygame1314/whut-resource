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
                document.getElementById('maintenance-toggle-btn').addEventListener('click', showMaintenanceModal);
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
