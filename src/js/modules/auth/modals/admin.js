async function showMaintenanceModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box maintenance-modal-box">
            <button id="close-modal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            <h2 class="auth-title"><i class="fas fa-hard-hat"></i> 维护模式管理</h2>
            <div id="maintenance-loading" class="maintenance-modal-loading">
                <div class="loading-spinner"></div>
            </div>
            <div id="maintenance-content" class="maintenance-modal-content">
                <div class="form-group">
                    <label>当前状态</label>
                    <div id="current-status" class="maintenance-status-display"></div>
                </div>
                <div class="form-group">
                    <label for="prompt-input">维护提示信息</label>
                    <textarea id="prompt-input" class="form-control" rows="3" placeholder="输入维护期间显示给用户的提示信息"></textarea>
                </div>
                <div class="maintenance-actions">
                    <button id="toggle-maintenance-btn" class="primary-btn"></button>
                    <button id="update-msg-btn" class="secondary-btn">
                        <i class="fas fa-save"></i> 仅更新信息
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => closeAuthModal(modal);
    const loadingDiv = modal.querySelector('#maintenance-loading');
    const contentDiv = modal.querySelector('#maintenance-content');
    const statusDiv = modal.querySelector('#current-status');
    const msgInput = modal.querySelector('#prompt-input');
    const toggleBtn = modal.querySelector('#toggle-maintenance-btn');
    const updateMsgBtn = modal.querySelector('#update-msg-btn');
    let currentStatus = false;
    try {
        const response = await fetch(API_ENDPOINTS.maintenance, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (data.success) {
            currentStatus = (data.real_maintenance !== undefined) ? data.real_maintenance : data.maintenance;
            msgInput.value = data.message || '';
            updateStatusDisplay();
        }
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';
    } catch (error) {
        loadingDiv.innerHTML = '<p class="maintenance-error"><i class="fas fa-exclamation-circle"></i> 加载失败，请重试</p>';
        console.error('加载维护状态失败:', error);
    }
    function updateStatusDisplay() {
        if (currentStatus) {
            statusDiv.className = 'maintenance-status-display status-on';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle status-icon-warning"></i> <strong class="status-text-warning">维护模式已开启</strong><br><small>普通用户将无法访问网站</small>';
            toggleBtn.innerHTML = '<i class="fas fa-play"></i> 关闭维护';
            toggleBtn.className = 'success-btn';
        } else {
            statusDiv.className = 'maintenance-status-display status-off';
            statusDiv.innerHTML = '<i class="fas fa-check-circle status-icon-success"></i> <strong class="status-text-success">网站正常运行中</strong><br><small>用户可以正常访问</small>';
            toggleBtn.innerHTML = '<i class="fas fa-pause"></i> 开启维护';
            toggleBtn.className = 'primary-btn';
        }
    }
    async function setMaintenance(enabled, message) {
        const btn = enabled !== currentStatus ? toggleBtn : updateMsgBtn;
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
        try {
            const response = await fetch(API_ENDPOINTS.maintenance, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    maintenance: enabled,
                    message: message
                })
            });
            const data = await response.json();
            if (data.success) {
                currentStatus = enabled;
                updateStatusDisplay();
                showNotification(data.message, 'success');
            } else {
                showNotification(data.error || '操作失败', 'error');
            }
        } catch (error) {
            showNotification('请求失败: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            updateStatusDisplay();
        }
    }
    toggleBtn.onclick = async () => {
        const newStatus = !currentStatus;
        const action = newStatus ? '开启' : '关闭';
        const confirmed = await showConfirmation({
            title: `${action}维护模式`,
            message: newStatus
                ? '开启后，普通用户将无法访问网站，只能看到维护提示页面。<br><br>确定要开启维护吗？'
                : '关闭后，网站将恢复正常访问。<br><br>确定要关闭维护模式吗？',
            confirmText: `确认${action}`
        });
        if (confirmed) {
            await setMaintenance(newStatus, msgInput.value.trim());
        }
    };
    updateMsgBtn.onclick = async () => {
        const message = msgInput.value.trim();
        if (!message) {
            showNotification('请输入维护提示信息', 'warning');
            return;
        }
        await setMaintenance(currentStatus, message);
    };
}
async function showAdminLogsModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal admin-logs-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <div class="admin-modal-header">
                <h2 class="auth-title">系统操作日志</h2>
                <button id="close-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="logs-container" class="admin-scrollable-container">
                <div class="loading-spinner"></div>
            </div>
            <div id="logs-pagination" class="pagination-controls logs-pagination"></div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.onclick = () => closeAuthModal(modal);
    let currentPage = 1;
    let allLogsCache = [];
    const LOGS_PER_PAGE = 20;
    const loadLogs = async (page) => {
        const container = modal.querySelector('#logs-container');
        const pagination = modal.querySelector('#logs-pagination');
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            if (allLogsCache.length === 0) {
                const res = await fetch(`${API_BASE}/api/admin-logs`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                allLogsCache = data.data || [];
            }
            if (allLogsCache.length === 0) {
                container.innerHTML = '<div class="admin-empty-state">暂无日志</div>';
                pagination.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(allLogsCache.length / LOGS_PER_PAGE);
            const startIndex = (page - 1) * LOGS_PER_PAGE;
            const endIndex = startIndex + LOGS_PER_PAGE;
            const logsToShow = allLogsCache.slice(startIndex, endIndex);
            container.innerHTML = logsToShow.map(log => {
                let detailsHtml = '';
                try {
                    const details = JSON.parse(log.details);
                    const originalContent = details.snapshot_content || details.content;
                    if (originalContent) {
                        detailsHtml += `<div class="admin-log-details"><strong>原始内容:</strong> ${escapeHtml(originalContent)}</div>`;
                    }
                    if (details.resource_path) {
                        detailsHtml += `<div class="admin-log-resource-path">资源路径: ${escapeHtml(details.resource_path)}</div>`;
                    }
                    if (details.nickname) {
                        detailsHtml += `<div class="admin-log-user-info">用户昵称: ${escapeHtml(details.nickname)} (ID: ${details.user_id || 'N/A'})</div>`;
                    }
                } catch (e) {
                    detailsHtml = `<div class="admin-log-user-info">${escapeHtml(log.details)}</div>`;
                }
                const actionClassMap = {
                    'ai_delete': 'action-delete',
                    'ai_ban_user': 'action-ban',
                    'ai_reject': 'action-reject',
                    'ai_hide': 'action-hide',
                    'ai_resolve': 'action-resolve'
                };
                const actionClass = actionClassMap[log.action] || 'action-default';
                const utcDate = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
                const date = new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
                return `
                    <div class="admin-log-entry">
                        <div class="admin-log-entry-header">
                            <span class="admin-log-action ${actionClass}">${log.action}</span>
                            <span class="admin-log-timestamp">${date}</span>
                        </div>
                        <div class="admin-log-reason">${escapeHtml(log.reason)}</div>
                        ${detailsHtml}
                    </div>
                `;
            }).join('');
            let paginationHtml = '';
            if (page > 1) paginationHtml += `<button class="pagination-button" id="logs-prev-page"><i class="fas fa-chevron-left"></i> <span class="pagination-btn-text">上一页</span></button>`;
            paginationHtml += `<span class="pagination-info">${page} / ${totalPages}</span>`;
            if (page < totalPages) paginationHtml += `<button class="pagination-button" id="logs-next-page"><span class="pagination-btn-text">下一页</span> <i class="fas fa-chevron-right"></i></button>`;
            pagination.innerHTML = paginationHtml;
            const nextBtn = pagination.querySelector('#logs-next-page');
            const prevBtn = pagination.querySelector('#logs-prev-page');
            if (nextBtn) nextBtn.onclick = () => loadLogs(page + 1);
            if (prevBtn) prevBtn.onclick = () => loadLogs(page - 1);
        } catch (e) {
            container.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
        }
    };
    loadLogs(currentPage);
}
async function showAdminManagementModal(initialTab = 'roles') {
    const modal = document.createElement('div');
    modal.className = 'auth-modal banned-users-modal';
    modal.innerHTML = `
        <div class="auth-box">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-user-shield u-margin-right-small"></i>用户管理</h2>
                <button id="close-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="admin-tabs">
                <button class="admin-tab${initialTab === 'roles' ? ' active' : ''}" data-tab="roles"><i class="fas fa-user-shield"></i> 权限管理</button>
                <button class="admin-tab${initialTab === 'banned' ? ' active' : ''}" data-tab="banned"><i class="fas fa-user-lock"></i> 封禁用户</button>
            </div>
            <div id="admin-tab-content" class="admin-tab-content"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-modal').onclick = () => closeAuthModal(modal);
    const tabContent = modal.querySelector('#admin-tab-content');
    const tabs = modal.querySelectorAll('.admin-tab');
    let loadedTabs = {};
    function switchTab(tabName) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        if (tabName === 'roles') {
            loadRolesTab();
        } else if (tabName === 'banned') {
            loadBannedTab();
        }
    }
    tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    function loadRolesTab() {
        tabContent.innerHTML = `
            <div class="role-search-bar">
                <div class="input-with-icon" style="flex:1;">
                    <i class="fas fa-search"></i>
                    <input type="text" id="user-search-input" class="form-control" placeholder="输入邮箱前缀搜索用户..." style="padding-left:2.5rem;">
                </div>
                <button id="user-search-btn" class="primary-btn"><i class="fas fa-search"></i> 搜索</button>
            </div>
            <div id="search-results" style="max-height:200px;overflow-y:auto;display:none;border:1px solid var(--border-color);border-radius:8px;padding:10px;"></div>
            <div style="margin:1rem 0;border-top:1px dashed var(--border-color);"></div>
            <h3 style="font-size:1rem;margin-bottom:0.8rem;color:var(--text-secondary);"><i class="fas fa-users-cog"></i> 管理员列表</h3>
            <div id="admin-list-container" style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:10px;">
                <div class="loading-spinner"></div>
            </div>
        `;
        const searchInput = tabContent.querySelector('#user-search-input');
        const searchBtn = tabContent.querySelector('#user-search-btn');
        const searchResults = tabContent.querySelector('#search-results');
        const adminListContainer = tabContent.querySelector('#admin-list-container');

        const loadAdmins = async () => {
            adminListContainer.innerHTML = '<div class="loading-spinner"></div>';
            try {
                const res = await fetch(`${API_ENDPOINTS.userRole}?action=admins`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                renderUserList(adminListContainer, data.users || [], true);
            } catch (e) {
                adminListContainer.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
            }
        };

        function renderUserList(container, users, showDemote) {
            if (!users || users.length === 0) {
                container.innerHTML = '<div class="admin-empty-state-padded"><div class="admin-empty-state-icon"><i class="fas fa-search"></i></div>未找到用户</div>';
                return;
            }
            container.innerHTML = users.map(user => {
                const roleLabel = user.role === 'super_admin'
                    ? '<span class="status-badge resolved"><i class="fas fa-crown"></i> 超级管理员</span>'
                    : user.role === 'admin'
                        ? '<span class="status-badge auditing"><i class="fas fa-user-shield"></i> 管理员</span>'
                        : '<span class="status-badge"><i class="fas fa-user"></i> 普通用户</span>';
                const bannedLabel = user.is_banned
                    ? ' <span class="status-badge rejected" style="font-size:0.75rem;"><i class="fas fa-ban"></i> 封禁</span>'
                    : '';
                const actionBtn = user.role === 'super_admin' ? '' : showDemote && user.role === 'admin'
                    ? `<button class="secondary-btn small demote-btn" data-user-id="${user.id}" data-nickname="${escapeHtml(user.nickname || user.email)}"><i class="fas fa-arrow-down"></i> 降权</button>`
                    : `<button class="primary-btn small promote-btn" data-user-id="${user.id}" data-nickname="${escapeHtml(user.nickname || user.email)}"><i class="fas fa-arrow-up"></i> 升权</button>`;
                return `
                    <div class="role-user-item">
                        <div class="banned-user-info">
                            <div class="banned-user-nickname">${escapeHtml(user.nickname || '未设置昵称')} ${roleLabel}${bannedLabel}</div>
                            <div class="banned-user-email">${escapeHtml(user.email)}${user.school_id ? ` · ${escapeHtml(user.school_id)}` : ''}</div>
                        </div>
                        <div class="banned-user-action">${actionBtn}</div>
                    </div>
                `;
            }).join('');
            container.querySelectorAll('.promote-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = btn.dataset.userId;
                    const nickname = btn.dataset.nickname;
                    const confirmed = await showConfirmation({
                        title: '确认升权',
                        message: `确定将 <strong>${nickname}</strong> 提升为管理员吗？`,
                        confirmText: '确认升权',
                        confirmClass: 'confirm-btn-primary'
                    });
                    if (!confirmed) return;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const res = await fetch(API_ENDPOINTS.userRole, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ user_id: parseInt(userId), action: 'promote' })
                        });
                        const result = await res.json();
                        if (result.success) {
                            showNotification('已提升为管理员', 'success');
                            loadAdmins();
                            searchResults.style.display = 'none';
                            searchInput.value = '';
                        } else {
                            throw new Error(result.error || '操作失败');
                        }
                    } catch (err) {
                        showNotification(err.message, 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-arrow-up"></i> 升权';
                    }
                });
            });
            container.querySelectorAll('.demote-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = btn.dataset.userId;
                    const nickname = btn.dataset.nickname;
                    const confirmed = await showConfirmation({
                        title: '确认降权',
                        message: `确定将管理员 <strong>${nickname}</strong> 降为普通用户吗？`,
                        confirmText: '确认降权',
                        confirmClass: 'danger'
                    });
                    if (!confirmed) return;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const res = await fetch(API_ENDPOINTS.userRole, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ user_id: parseInt(userId), action: 'demote' })
                        });
                        const result = await res.json();
                        if (result.success) {
                            showNotification('已降为普通用户', 'success');
                            loadAdmins();
                            searchResults.style.display = 'none';
                            searchInput.value = '';
                        } else {
                            throw new Error(result.error || '操作失败');
                        }
                    } catch (err) {
                        showNotification(err.message, 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-arrow-down"></i> 降权';
                    }
                });
            });
        }

        const doSearch = async () => {
            const keyword = searchInput.value.trim();
            if (keyword.length < 4) {
                showNotification('请输入至少4个字符的邮箱前缀', 'warning');
                return;
            }
            searchResults.style.display = 'block';
            searchResults.innerHTML = '<div class="loading-spinner"></div>';
            try {
                const res = await fetch(`${API_ENDPOINTS.userRole}?action=search&keyword=${encodeURIComponent(keyword)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                renderUserList(searchResults, data.users || [], true);
            } catch (e) {
                searchResults.innerHTML = `<div class="admin-error-state">搜索失败: ${e.message}</div>`;
            }
        };

        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch();
        });
        loadAdmins();
    }
    function loadBannedTab() {
        tabContent.innerHTML = '<div id="banned-users-container" class="admin-scrollable-container"><div class="loading-spinner"></div></div>';
        const container = tabContent.querySelector('#banned-users-container');
        const loadBannedUsers = async () => {
            container.innerHTML = '<div class="loading-spinner"></div>';
            try {
                const res = await fetch(`${API_ENDPOINTS.adminManagement}?action=banned_users`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                if (!data.users || data.users.length === 0) {
                    container.innerHTML = '<div class="admin-empty-state-padded"><div class="admin-empty-state-icon"><i class="fas fa-check-circle"></i></div>暂无被封禁的用户</div>';
                    return;
                }
                container.innerHTML = data.users.map(user => {
                    const nickname = user.nickname || '未设置昵称';
                    const email = escapeHtml(user.email);
                    const utcDate = user.created_at && (user.created_at.endsWith('Z') ? user.created_at : user.created_at + 'Z');
                    const createdAt = utcDate ? new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未知';
                    return `
                        <div class="banned-user-item">
                            <div class="banned-user-info">
                                <div class="banned-user-nickname">${escapeHtml(nickname)}</div>
                                <div class="banned-user-email">${email}</div>
                                <div class="banned-user-date">注册于: ${createdAt}</div>
                            </div>
                            <div class="banned-user-action">
                                <button class="primary-btn small unban-btn" data-user-id="${user.id}">
                                    <i class="fas fa-user-check"></i> 解封
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
                container.querySelectorAll('.unban-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const userId = btn.dataset.userId;
                        const userItem = btn.closest('.banned-user-item');
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        try {
                            const res = await fetch(API_ENDPOINTS.adminManagement, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ action: 'unban', user_id: parseInt(userId) })
                            });
                            const data = await res.json();
                            if (data.success) {
                                userItem.style.transition = 'opacity 0.3s, transform 0.3s';
                                userItem.style.opacity = '0';
                                userItem.style.transform = 'translateX(20px)';
                                setTimeout(() => {
                                    userItem.remove();
                                    if (container.querySelectorAll('.banned-user-item').length === 0) {
                                        container.innerHTML = '<div class="admin-empty-state-padded"><div class="admin-empty-state-icon"><i class="fas fa-check-circle"></i></div>暂无被封禁的用户</div>';
                                    }
                                }, 300);
                                showNotification('用户已解封', 'success');
                            } else {
                                throw new Error(data.error || '解封失败');
                            }
                        } catch (err) {
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fas fa-user-check"></i> 解封';
                            showNotification('解封失败: ' + err.message, 'error');
                        }
                    });
                });
            } catch (e) {
                container.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
            }
        };
        loadBannedUsers();
    }
    switchTab(initialTab);
}
async function showAdminRequestsModal(mode = 'all') {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'admin-requests-modal';
    const isSuperAdminUser = currentUser && currentUser.role === 'super_admin';
    const title = mode === 'mine' ? '我的审批请求' : '审批请求管理';
    const statusFilter = `
        <div class="custom-select-container" id="request-status-dropdown">
            <button class="custom-select-trigger secondary-btn" type="button">
                <span class="selected-text">${mode === 'mine' ? '全部' : '待审批'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="custom-select-options dropdown-menu">
                <div class="dropdown-item" data-value="all">全部</div>
                <div class="dropdown-item" data-value="pending">待审批</div>
                <div class="dropdown-item" data-value="approved">已批准</div>
                <div class="dropdown-item" data-value="rejected">已拒绝</div>
            </div>
            <input type="hidden" id="request-status-filter" value="${mode === 'mine' ? 'all' : 'pending'}">
        </div>
    `;
    modal.innerHTML = `
        <div class="auth-box">
            <button id="close-requests-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            <h2 class="auth-title"><i class="fas fa-clipboard-check"></i> ${title}</h2>
            <div class="requests-header">
                ${statusFilter}
                <button id="refresh-requests-btn" class="secondary-btn">
                    <i class="fas fa-sync-alt"></i> 刷新
                </button>
            </div>
            <div id="requests-batch-toolbar" class="requests-batch-toolbar">
                <div class="batch-check-group">
                    <input type="checkbox" id="select-all-requests">
                    <label for="select-all-requests">全选</label>
                    <span id="batch-selected-count" class="batch-count"></span>
                </div>
                <div class="batch-actions">
                    <button id="batch-approve-btn" class="batch-action-btn approve"><i class="fas fa-check"></i> 批准</button>
                    <button id="batch-reject-btn" class="batch-action-btn reject"><i class="fas fa-times"></i> 拒绝</button>
                </div>
            </div>
            <div id="requests-list" class="requests-list"></div>
        </div>
    `;
    document.body.appendChild(modal);
    const dropdown = modal.querySelector('#request-status-dropdown');
    if (dropdown) {
        const trigger = dropdown.querySelector('.custom-select-trigger');
        const optionsMenu = dropdown.querySelector('.custom-select-options');
        const hiddenInput = dropdown.querySelector('#request-status-filter');
        const options = dropdown.querySelectorAll('.dropdown-item');
        const arrow = trigger.querySelector('.fa-chevron-down');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = optionsMenu.classList.contains('show');
            document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                if (m !== optionsMenu) m.classList.remove('show');
            });
            if (!isOpen) {
                const rect = trigger.getBoundingClientRect();
                optionsMenu.style.position = 'fixed';
                optionsMenu.style.top = (rect.bottom + 4) + 'px';
                optionsMenu.style.left = rect.left + 'px';
                optionsMenu.style.width = rect.width + 'px';
                optionsMenu.style.zIndex = '10001';
                optionsMenu.classList.add('show');
                arrow.style.transform = 'rotate(180deg)';
                trigger.classList.add('active');
            } else {
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
            }
        });
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.dataset.value;
                const text = opt.textContent;
                hiddenInput.value = value;
                trigger.querySelector('.selected-text').textContent = text;
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
                loadRequests();
            });
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !optionsMenu.contains(e.target)) {
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
            }
        });
    }
    const closeModal = () => closeAuthModal(modal);
    modal.querySelector('#close-requests-modal').addEventListener('click', closeModal);
    const batchToolbar = modal.querySelector('#requests-batch-toolbar');
    const selectAllCheckbox = modal.querySelector('#select-all-requests');
    const selectedCountSpan = modal.querySelector('#batch-selected-count');
    const batchApproveBtn = modal.querySelector('#batch-approve-btn');
    const batchRejectBtn = modal.querySelector('#batch-reject-btn');
    let selectedRequestIds = new Set();
    const updateBatchToolbar = () => {
        const checkboxes = modal.querySelectorAll('.request-checkbox');
        const checkedCount = selectedRequestIds.size;
        if (checkboxes.length > 0 && modal.querySelector('#request-status-filter').value === 'pending') {
            batchToolbar.classList.add('visible');
        } else {
            batchToolbar.classList.remove('visible');
            selectedRequestIds.clear();
        }
        if (checkedCount > 0) {
            selectedCountSpan.textContent = `已选 ${checkedCount} 项`;
            batchApproveBtn.disabled = false;
            batchRejectBtn.disabled = false;
        } else {
            selectedCountSpan.textContent = '';
            batchApproveBtn.disabled = true;
            batchRejectBtn.disabled = true;
        }
        if (checkboxes.length > 0) {
            selectAllCheckbox.checked = checkedCount === checkboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    };
    selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = modal.querySelectorAll('.request-checkbox');
        const isChecked = selectAllCheckbox.checked;
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
            const id = cb.value;
            if (isChecked) selectedRequestIds.add(id);
            else selectedRequestIds.delete(id);
        });
        updateBatchToolbar();
    });
    const loadRequests = async () => {
        const listContainer = modal.querySelector('#requests-list');
        listContainer.innerHTML = '<div class="loading-spinner"></div>';
        selectedRequestIds.clear();
        updateBatchToolbar();
        const statusSelect = modal.querySelector('#request-status-filter');
        const status = statusSelect ? statusSelect.value : 'all';
        const mineParam = mode === 'mine' ? '&mine=true' : '';
        try {
            const response = await fetch(`${API_ENDPOINTS.adminManagement}?status=${status}${mineParam}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!data.success || !data.data || data.data.length === 0) {
                listContainer.innerHTML = '<p class="empty-state-small">暂无审批请求</p>';
                batchToolbar.classList.remove('visible');
                return;
            }
            listContainer.innerHTML = data.data.map(req => {
                const requestData = JSON.parse(req.request_data);
                const typeLabels = {
                    'delete_file': '删除文件',
                    'delete_folder': '删除文件夹',
                    'ban_user': '封禁用户',
                    'unban_user': '解封用户'
                };
                const statusLabels = {
                    'pending': '<span class="status-badge auditing"><i class="fas fa-clock"></i> 待审批</span>',
                    'approved': '<span class="status-badge resolved"><i class="fas fa-check"></i> 已批准</span>',
                    'rejected': '<span class="status-badge rejected"><i class="fas fa-times"></i> 已拒绝</span>',
                    'cancelled': '<span class="status-badge"><i class="fas fa-ban"></i> 已取消</span>'
                };
                const fileList = requestData.fileNames
                    ? requestData.fileNames.slice(0, 5).map(n => `<li>${escapeHtml(n)}</li>`).join('')
                    : '';
                const moreFiles = requestData.count > 5 ? `<li>...还有 ${requestData.count - 5} 个</li>` : '';
                let detailsHtml = '';
                if (req.request_type === 'ban_user' || req.request_type === 'unban_user') {
                    detailsHtml = `
                        <div class="ban-user-details">
                            <div><strong>用户昵称：</strong>${escapeHtml(requestData.nickname || '未知')}</div>
                            ${requestData.content_preview ? `<div><strong>留言预览：</strong>${escapeHtml(requestData.content_preview)}${requestData.content_preview.length >= 100 ? '...' : ''}</div>` : ''}
                            ${requestData.source ? `<div><strong>来源：</strong>${requestData.source === 'banned_users_list' ? '封禁用户列表' : '留言板'}</div>` : ''}
                        </div>
                    `;
                } else {
                    detailsHtml = `<ul class="file-list-preview">${fileList}${moreFiles}</ul>`;
                }
                const actionButtons = isSuperAdminUser && req.status === 'pending' ? `
                    <div class="request-actions">
                        <button class="primary-btn approve-btn" data-id="${req.id}">
                            <i class="fas fa-check"></i> 批准
                        </button>
                        <button class="secondary-btn reject-btn" data-id="${req.id}">
                            <i class="fas fa-times"></i> 拒绝
                        </button>
                    </div>
                ` : '';
                const statusSelect = modal.querySelector('#request-status-filter');
                const currentFilter = statusSelect ? statusSelect.value : 'all';
                const showCheckbox = isSuperAdminUser && req.status === 'pending' && currentFilter === 'pending';
                const checkboxHtml = showCheckbox
                    ? `<div class="request-select"><input type="checkbox" class="request-checkbox" value="${req.id}"></div>`
                    : '';
                return `
                    <div class="request-item ${showCheckbox ? 'has-checkbox' : ''}" data-id="${req.id}">
                        ${checkboxHtml}
                        <div class="request-content-wrapper">
                            <div class="request-header">
                                <span class="request-type">${typeLabels[req.request_type] || req.request_type}</span>
                                ${statusLabels[req.status] || ''}
                            </div>
                            <div class="request-meta">
                                <span><i class="fas fa-user"></i> ${escapeHtml(req.requester_nickname || req.requester_email)}</span>
                                <span><i class="fas fa-clock"></i> ${formatDateLocal(req.created_at)}</span>
                            </div>
                            <div class="request-details">
                                ${detailsHtml}
                            </div>
                            ${req.review_note ? `<div class="review-note"><i class="fas fa-comment"></i> ${escapeHtml(req.review_note)}</div>` : ''}
                            ${req.reviewer_nickname ? `<div class="reviewer-info"><i class="fas fa-user-check"></i> 由 ${escapeHtml(req.reviewer_nickname)} 处理</div>` : ''}
                            ${actionButtons}
                        </div>
                    </div>
                `;
            }).join('');
            listContainer.querySelectorAll('.request-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) selectedRequestIds.add(e.target.value);
                    else selectedRequestIds.delete(e.target.value);
                    updateBatchToolbar();
                });
            });
            listContainer.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (typeof showConfirmation === 'function') {
                        const confirmed = await showConfirmation({
                            title: '确认批准',
                            message: '你确定要批准此请求吗？',
                            confirmText: '批准',
                            confirmClass: 'confirm-btn-primary'
                        });
                        if (!confirmed) return;
                    } else if (!confirm('确定要批准此请求吗？')) {
                        return;
                    }
                    await handleRequestAction(btn.dataset.id, 'approve', loadRequests);
                });
            });
            listContainer.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    let note = null;
                    try {
                        if (typeof window.showRejectPrompt === 'function') {
                            note = await window.showRejectPrompt({
                                title: '拒绝请求',
                                placeholder: '请输入拒绝原因（可选）',
                                confirmText: '拒绝',
                                showPresets: false
                            });
                        } else {
                            note = prompt('请输入拒绝原因（可选）:');
                        }
                    } catch (e) { return; }
                    if (note !== null) {
                        await handleRequestAction(btn.dataset.id, 'reject', loadRequests, note);
                    }
                });
            });
            updateBatchToolbar();
        } catch (e) {
            console.error('加载审批请求失败:', e);
            listContainer.innerHTML = '<p class="error-message">加载失败，请稍后重试</p>';
        }
    };
    batchApproveBtn.addEventListener('click', async () => {
        if (selectedRequestIds.size === 0) return;
        if (typeof showConfirmation === 'function') {
            const confirmed = await showConfirmation({
                title: '确认批量批准',
                message: `你确定要批准选中的 <span style="color:var(--primary-color);font-weight:bold;">${selectedRequestIds.size}</span> 个请求吗？`,
                confirmText: '批准',
                confirmClass: 'confirm-btn-primary'
            });
            if (!confirmed) return;
        } else if (!confirm(`确定要批准这 ${selectedRequestIds.size} 个请求吗？`)) {
            return;
        }
        await handleBatchAction(Array.from(selectedRequestIds), 'approve', loadRequests);
    });
    batchRejectBtn.addEventListener('click', async () => {
        if (selectedRequestIds.size === 0) return;
        let note = null;
        if (typeof window.showRejectPrompt === 'function') {
            try {
                note = await window.showRejectPrompt({
                    title: '批量拒绝请求',
                    placeholder: '请输入拒绝所有选中请求的原因（可选）',
                    confirmText: '批量拒绝',
                    showPresets: false
                });
            } catch (e) {
                return;
            }
        } else {
            note = prompt('请输入拒绝所有选中请求的原因（可选）：');
            if (note === null) return;
        }
        await handleBatchAction(Array.from(selectedRequestIds), 'reject', loadRequests, note);
    });
    modal.querySelector('#refresh-requests-btn').addEventListener('click', loadRequests);
    const statusSelect = modal.querySelector('#request-status-filter');
    if (statusSelect) {
        statusSelect.addEventListener('change', loadRequests);
    }
    await loadRequests();
}

