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
                <h2 class="auth-title"><i class="fas fa-clipboard-list u-margin-right-small"></i>操作日志</h2>
                 <div class="admin-logs-toolbar">
                     <div class="custom-select-container" id="log-filter-dropdown">
                         <button class="custom-select-trigger" type="button">
                             <span class="selected-text">全部操作</span>
                             <i class="fas fa-chevron-down"></i>
                         </button>
                         <div class="custom-select-options dropdown-menu">
                             <div class="dropdown-item selected" data-value="">全部操作</div>
                             <div class="dropdown-item" data-value="announcement">公告</div>
                             <div class="dropdown-item" data-value="guestbook">留言</div>
                             <div class="dropdown-item" data-value="user">用户</div>
                              <div class="dropdown-item" data-value="file">文件</div>
                              <div class="dropdown-item" data-value="file_boost">评论</div>
                              <div class="dropdown-item" data-value="admin_request">管理请求</div>
                              <div class="dropdown-item" data-value="system">系统</div>
                             <div class="dropdown-item" data-value="ai_">AI 自动</div>
                         </div>
                         <input type="hidden" id="log-filter-action" value="">
                     </div>
                     <button id="logs-refresh-btn" class="admin-log-refresh-btn" title="刷新"><i class="fas fa-sync-alt"></i></button>
                     ${currentUser && currentUser.role === 'super_admin' ? '<button id="logs-cleanup-btn" class="admin-log-cleanup-btn" title="清理3天前的日志"><i class="fas fa-trash-alt"></i></button>' : ''}
                </div>
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
    let allLogsCursor = null;
    let hasMoreLogs = true;
    let isLoadingMore = false;
    let currentFilter = '';
    const LOGS_PER_PAGE = 20;
    const MAX_LOGS_CACHE = 200;
    const filterDropdown = modal.querySelector('#log-filter-dropdown');
    const filterHiddenInput = modal.querySelector('#log-filter-action');
    const refreshBtn = modal.querySelector('#logs-refresh-btn');
    const applyFilter = (value) => {
        currentFilter = value;
        filterHiddenInput.value = value;
        const triggerText = filterDropdown.querySelector('.selected-text');
        const items = filterDropdown.querySelectorAll('.dropdown-item');
        items.forEach(item => item.classList.toggle('selected', item.dataset.value === value));
        if (triggerText) {
            const selectedItem = filterDropdown.querySelector('.dropdown-item.selected');
            if (selectedItem) triggerText.textContent = selectedItem.textContent;
        }
        currentPage = 1;
        resetAndReload();
    };
    const resetAndReload = async () => {
        allLogsCache = [];
        allLogsCursor = null;
        hasMoreLogs = true;
        currentPage = 1;
        await loadLogs();
        renderLogs();
    };
    if (filterDropdown) {
        const trigger = filterDropdown.querySelector('.custom-select-trigger');
        const optionsMenu = filterDropdown.querySelector('.custom-select-options');
        const items = filterDropdown.querySelectorAll('.dropdown-item');
        const arrow = trigger.querySelector('.fa-chevron-down');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = optionsMenu.classList.contains('show');
            document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                if (m !== optionsMenu) m.classList.remove('show');
            });
            document.querySelectorAll('.custom-select-trigger.active').forEach(t => {
                if (t !== trigger) t.classList.remove('active');
            });
            if (!isOpen) {
                const rect = trigger.getBoundingClientRect();
                optionsMenu.style.position = 'fixed';
                optionsMenu.style.top = (rect.bottom + 4) + 'px';
                optionsMenu.style.left = rect.left + 'px';
                optionsMenu.style.width = rect.width + 'px';
                optionsMenu.style.zIndex = '10001';
                requestAnimationFrame(() => {
                    optionsMenu.classList.add('show');
                });
                arrow.style.transform = 'rotate(180deg)';
                trigger.classList.add('active');
            } else {
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
            }
        });
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                applyFilter(item.dataset.value);
                optionsMenu.classList.remove('show');
                trigger.classList.remove('active');
                arrow.style.transform = 'rotate(0deg)';
            });
        });
        document.addEventListener('click', (e) => {
            if (!filterDropdown.contains(e.target) && !optionsMenu.contains(e.target)) {
                optionsMenu.classList.remove('show');
                arrow.style.transform = 'rotate(0deg)';
                trigger.classList.remove('active');
            }
        });
    }
    refreshBtn.addEventListener('click', resetAndReload);
    const cleanupBtn = modal.querySelector('#logs-cleanup-btn');
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', async () => {
            if (isLoadingMore) return;
            if (currentUser && currentUser.role !== 'super_admin') {
                showNotification('只有超级管理员可以清理审计日志', 'warning');
                return;
            }
            const confirmed = await showConfirmation({
                title: '清理审计日志',
                message: '确定清理3天前的所有审计日志吗？<br><br>此操作不可撤销。',
                confirmText: '确认清理',
                confirmClass: 'danger'
            });
            if (!confirmed) return;
            isLoadingMore = true;
            try {
                const res = await fetch(`${API_BASE}/api/admin-logs`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    showNotification(data.message || '清理成功', 'success');
                } else {
                    showNotification(data.error || '清理失败', 'error');
                }
            } catch (e) {
                showNotification('清理出错', 'error');
            }
            isLoadingMore = false;
            await resetAndReload();
        });
    }
    const renderLogs = () => {
        const container = modal.querySelector('#logs-container');
        const pagination = modal.querySelector('#logs-pagination');
        if (allLogsCache.length === 0) {
            container.innerHTML = '<div class="admin-empty-state">暂无日志</div>';
            pagination.innerHTML = '';
            return;
        }
        const startIndex = (currentPage - 1) * LOGS_PER_PAGE;
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
                    detailsHtml += `<div class="admin-log-user-info">目标用户: ${escapeHtml(details.nickname)} (ID: ${details.user_id || 'N/A'})</div>`;
                }
                if (details.reject_reason) {
                    detailsHtml += `<div class="admin-log-user-info">驳回原因: ${escapeHtml(details.reject_reason)}</div>`;
                }
                if (details.title) {
                    detailsHtml += `<div class="admin-log-user-info">公告标题: ${escapeHtml(details.title)}</div>`;
                }
                if (details.key) {
                    detailsHtml += `<div class="admin-log-user-info">路径: ${escapeHtml(details.key)}</div>`;
                }
                if (details.deleted_count) {
                    detailsHtml += `<div class="admin-log-user-info">删除数量: ${details.deleted_count}</div>`;
                }
                if (details.new_url) {
                    detailsHtml += `<div class="admin-log-user-info">新链接: ${escapeHtml(details.new_url)}</div>`;
                }
                if (details.target_email) {
                    detailsHtml += `<div class="admin-log-user-info">目标邮箱: ${escapeHtml(details.target_email)}</div>`;
                }
                if (details.old_key && details.new_key) {
                    detailsHtml += `<div class="admin-log-user-info">${details.child_count != null ? '文件夹操作' : '重命名/移动'}: ${escapeHtml(details.old_key)} → ${escapeHtml(details.new_key)}</div>`;
                }
                if (details.child_count != null && !details.old_key) {
                    detailsHtml += `<div class="admin-log-user-info">子项数量: ${details.child_count}</div>`;
                }
                if (details.count) {
                    detailsHtml += `<div class="admin-log-user-info">上传文件数: ${details.count}${details.names ? ` (${escapeHtml(details.names)})` : ''}</div>`;
                }
                if (details.url && details.parent_path !== undefined && !details.old_key) {
                    detailsHtml += `<div class="admin-log-user-info">链接地址: ${escapeHtml(details.url)}</div>`;
                }
                if (details.target_id) {
                    detailsHtml += `<div class="admin-log-user-info">目标ID: ${details.target_id}</div>`;
                }
                if (details.entry_id && !details.target_email) {
                    detailsHtml += `<div class="admin-log-user-info">留言ID: ${details.entry_id}</div>`;
                }
                if (details.deleted_files != null) {
                    detailsHtml += `<div class="admin-log-user-info">删除文件: ${details.deleted_files}, 删除目录: ${details.deleted_dirs}, 删除向量: ${details.deleted_vectors}</div>`;
                }
                if (details.processed != null && details.deleted_files == null) {
                    detailsHtml += `<div class="admin-log-user-info">处理: ${details.processed}文件, ${details.dirs || 0}目录</div>`;
                }
                if (details.retried != null) {
                    detailsHtml += `<div class="admin-log-user-info">重试成功: ${details.retried}, 仍失败: ${details.still_failed || details.stillFailed || 0}</div>`;
                }
                if (details.indexed != null) {
                    detailsHtml += `<div class="admin-log-user-info">已索引: ${details.indexed}/${details.total}${details.completed ? ' (完成)' : ''}</div>`;
                }
            } catch (e) {
                detailsHtml = `<div class="admin-log-user-info">${escapeHtml(log.details)}</div>`;
            }
            const actionClass = `action-${(log.action || '').replace(/_/g, '-')}`;
            const utcDate = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
            const date = new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
            const operatorHtml = log.operator
                ? `<span class="admin-log-operator"><i class="fas fa-user-circle"></i> ${escapeHtml(log.operator.nickname)}</span>`
                : `<span class="admin-log-operator operator-ai"><i class="fas fa-robot"></i> 系统自动</span>`;
            const targetInfo = log.target_type && log.target_id
                ? `<span class="admin-log-target">${log.target_type}#${log.target_id}</span>`
                : '';
            return `
                    <div class="admin-log-entry">
                        <div class="admin-log-entry-header">
                            ${operatorHtml}
                            <span class="admin-log-action ${actionClass}">${escapeHtml(log.label || log.action)}</span>
                            ${targetInfo}
                            <span class="admin-log-timestamp">${date}</span>
                        </div>
                        ${log.reason ? `<div class="admin-log-reason"><i class="fas fa-info-circle"></i> ${escapeHtml(log.reason)}</div>` : ''}
                        ${detailsHtml}
                    </div>
                `;
        }).join('');
        const totalLoaded = allLogsCache.length;
        const canGoNext = (currentPage * LOGS_PER_PAGE) < totalLoaded || hasMoreLogs;
        let paginationHtml = '';
        if (currentPage > 1) paginationHtml += `<button class="pagination-button" id="logs-prev-page"><i class="fas fa-chevron-left"></i> <span class="pagination-btn-text">上一页</span></button>`;
        paginationHtml += `<span class="pagination-info">第 ${currentPage} 页${hasMoreLogs ? `（已加载 ${totalLoaded} 条）` : `（共 ${totalLoaded} 条）`}</span>`;
        if (canGoNext) paginationHtml += `<button class="pagination-button" id="logs-next-page"><span class="pagination-btn-text">下一页</span> <i class="fas fa-chevron-right"></i></button>`;
        pagination.innerHTML = paginationHtml;
        const nextBtn = pagination.querySelector('#logs-next-page');
        const prevBtn = pagination.querySelector('#logs-prev-page');
        if (nextBtn) nextBtn.onclick = async () => {
            if (isLoadingMore) return;
            if ((currentPage * LOGS_PER_PAGE) >= totalLoaded && hasMoreLogs) {
                isLoadingMore = true;
                const loaded = await loadLogs();
                isLoadingMore = false;
                if (loaded) { currentPage++; renderLogs(); }
            } else {
                currentPage++;
                renderLogs();
            }
        };
        if (prevBtn) prevBtn.onclick = () => { currentPage--; renderLogs(); };
    };
    const loadLogs = async () => {
        const container = modal.querySelector('#logs-container');
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            let url = `${API_BASE}/api/admin-logs?limit=${LOGS_PER_PAGE}`;
            if (currentFilter) url += `&filter=${encodeURIComponent(currentFilter)}`;
            if (allLogsCursor) url += `&cursor=${encodeURIComponent(allLogsCursor)}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            const newItems = data.data || [];
            allLogsCursor = data.nextCursor;
            hasMoreLogs = data.hasMore;
            allLogsCache = allLogsCache.concat(newItems);
            if (allLogsCache.length > MAX_LOGS_CACHE) {
                const excess = allLogsCache.length - MAX_LOGS_CACHE;
                allLogsCache.splice(0, excess);
                currentPage = Math.max(1, currentPage - Math.ceil(excess / LOGS_PER_PAGE));
            }
            return newItems.length > 0;
        } catch (e) {
            container.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
            return false;
        }
    };
    loadLogs().then(() => renderLogs());
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

        let adminCache = [];
        let adminCursor = null;
        let hasMoreAdmins = true;
        let isLoadingAdmins = false;

        const renderAdminList = () => {
            renderUserList(adminListContainer, adminCache, true);
            const existingMore = adminListContainer.querySelector('.load-more-admins');
            if (existingMore) existingMore.remove();
            if (hasMoreAdmins) {
                const moreBtn = document.createElement('div');
                moreBtn.className = 'load-more-admins';
                moreBtn.innerHTML = '<button class="secondary-btn small" style="width:100%;margin-top:8px;"><i class="fas fa-chevron-down"></i> 加载更多</button>';
                moreBtn.querySelector('button').onclick = () => loadAdmins(false);
                adminListContainer.appendChild(moreBtn);
            }
        };

        const loadAdmins = async (reset = true) => {
            if (isLoadingAdmins) return;
            if (reset) {
                adminCache = [];
                adminCursor = null;
                hasMoreAdmins = true;
                adminListContainer.innerHTML = '<div class="loading-spinner"></div>';
            } else if (!hasMoreAdmins) {
                return;
            }
            isLoadingAdmins = true;
            try {
                let url = `${API_ENDPOINTS.userRole}?action=admins`;
                if (adminCursor) url += `&cursor=${encodeURIComponent(adminCursor)}`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                adminCache = adminCache.concat(data.users || []);
                adminCursor = data.nextCursor;
                hasMoreAdmins = data.hasMore;
                renderAdminList();
            } catch (e) {
                if (reset) adminListContainer.innerHTML = `<div class="admin-error-state">加载失败: ${e.message}</div>`;
            }
            isLoadingAdmins = false;
        };

        function renderUserList(container, users, showDemote) {
            if (!users || users.length === 0) {
                container.innerHTML = '<div class="admin-empty-state" style="padding:1.5rem 1rem;">未找到用户</div>';
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
                const actionBtn = user.role === 'super_admin' ? '' : (() => {
                    let btns = '';
                    if (showDemote && user.role === 'admin') {
                        btns += `<button class="secondary-btn small demote-btn" data-user-id="${user.id}" data-nickname="${escapeHtml(user.nickname || user.email)}"><i class="fas fa-arrow-down"></i> 降权</button>`;
                    } else if (user.role === 'user') {
                        btns += `<button class="primary-btn small promote-btn" data-user-id="${user.id}" data-nickname="${escapeHtml(user.nickname || user.email)}"><i class="fas fa-arrow-up"></i> 升权</button>`;
                    }
                    if (user.is_banned) {
                        btns += `<button class="primary-btn small unban-role-btn" data-user-id="${user.id}" data-nickname="${escapeHtml(user.nickname || user.email)}" style="margin-left:4px;"><i class="fas fa-user-check"></i> 解封</button>`;
                    } else if (user.role === 'user') {
                        btns += `<button class="secondary-btn small ban-role-btn" data-user-id="${user.id}" data-nickname="${escapeHtml(user.nickname || user.email)}" style="margin-left:4px;"><i class="fas fa-ban"></i> 封禁</button>`;
                    }
                    return btns;
                })();
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
            container.querySelectorAll('.ban-role-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = btn.dataset.userId;
                    const nickname = btn.dataset.nickname;
                    const confirmed = await showConfirmation({
                        title: '确认封禁',
                        message: `确定要封禁用户 <strong>${nickname}</strong> 吗？封禁后该用户将无法登录和使用系统。`,
                        confirmText: '确认封禁',
                        confirmClass: 'danger'
                    });
                    if (!confirmed) return;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const res = await fetch(API_ENDPOINTS.adminManagement, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ action: 'ban', user_id: parseInt(userId) })
                        });
                        const result = await res.json();
                        if (result.success) {
                            showNotification('已封禁该用户', 'success');
                            loadAdmins();
                            searchResults.style.display = 'none';
                            searchInput.value = '';
                        } else {
                            throw new Error(result.error || '操作失败');
                        }
                    } catch (err) {
                        showNotification(err.message, 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-ban"></i> 封禁';
                    }
                });
            });
            container.querySelectorAll('.unban-role-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = btn.dataset.userId;
                    const nickname = btn.dataset.nickname;
                    const confirmed = await showConfirmation({
                        title: '确认解封',
                        message: `确定要解封用户 <strong>${nickname}</strong> 吗？`,
                        confirmText: '确认解封',
                        confirmClass: 'confirm-btn-primary'
                    });
                    if (!confirmed) return;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const res = await fetch(API_ENDPOINTS.adminManagement, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ action: 'unban', user_id: parseInt(userId) })
                        });
                        const result = await res.json();
                        if (result.success) {
                            showNotification('已解封该用户', 'success');
                            loadAdmins();
                            searchResults.style.display = 'none';
                            searchInput.value = '';
                        } else {
                            throw new Error(result.error || '操作失败');
                        }
                    } catch (err) {
                        showNotification(err.message, 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-user-check"></i> 解封';
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
                requestAnimationFrame(() => {
                    optionsMenu.classList.add('show');
                });
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
                return `
                    <div class="request-item ${showCheckbox ? 'has-checkbox' : ''}" data-id="${req.id}">
                        <div class="request-content-wrapper">
                            <div class="request-header">
                                ${showCheckbox ? `<div class="request-select"><input type="checkbox" class="request-checkbox" value="${req.id}"></div>` : ''}
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
                    const confirmed = await showConfirmation({
                        title: '确认批准',
                        message: '确定要批准此请求吗？',
                        confirmText: '批准',
                        confirmClass: 'confirm-btn-primary'
                    });
                    if (!confirmed) return;
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
        const confirmed = await showConfirmation({
            title: '批量批准',
            message: `确定要批准选中的 <strong>${selectedRequestIds.size}</strong> 个请求吗？`,
            confirmText: '批准',
            confirmClass: 'confirm-btn-primary'
        });
        if (!confirmed) return;
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

async function showOauthClientsModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-box oauth-manage-box">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-key"></i> SSO 客户端管理</h2>
                <button id="close-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <p class="oauth-manage-desc">管理第三方应用的 OAuth2 接入授权，支持授权码模式（Authorization Code + PKCE）实现 SSO</p>
            <div class="oauth-toolbar">
                <button id="oauth-create-btn" class="primary-btn small"><i class="fas fa-plus"></i> 新建</button>
                <button id="oauth-refresh-btn" class="secondary-btn small"><i class="fas fa-sync"></i> 刷新</button>
                <button id="oauth-cleanup-btn" class="secondary-btn small"><i class="fas fa-broom"></i> 清理过期数据</button>
            </div>
            <div id="oauth-clients-list" class="oauth-clients-list"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-modal').onclick = () => closeAuthModal(modal);
    const listEl = modal.querySelector('#oauth-clients-list');
    async function loadClients() {
        listEl.innerHTML = '<div class="oauth-loading-state"><div class="loading-spinner"></div><p>加载中...</p></div>';
        try {
            const res = await fetch(`${API_ENDPOINTS.oauthAdmin}?action=list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) {
                listEl.innerHTML = `<div class="oauth-error-state"><i class="fas fa-exclamation-circle"></i>${escapeHtml(data.error)}</div>`;
                return;
            }
            if (!data.clients || data.clients.length === 0) {
                listEl.innerHTML = '<div class="oauth-empty-state"><i class="fas fa-plug"></i><p>暂无 OAuth 客户端</p><span>点击"新建"创建第一个 OAuth2 应用</span></div>';
                return;
            }
            listEl.innerHTML = data.clients.map(c => `
                <div class="oauth-client-card">
                    <div class="oauth-client-main">
                        <div class="oauth-client-header">
                            <strong class="oauth-client-name">${escapeHtml(c.client_name)}</strong>
                            <span class="oauth-status-badge ${c.is_active ? 'oauth-status-active' : 'oauth-status-inactive'}">${c.is_active ? '● 启用' : '● 禁用'}</span>
                        </div>
                        <div class="oauth-client-meta">
                            <div class="oauth-meta-row"><i class="fas fa-fingerprint"></i><code class="oauth-code">${escapeHtml(c.client_id)}</code></div>
                            <div class="oauth-meta-row"><i class="fas fa-link"></i><code class="oauth-code oauth-code-uri">${escapeHtml(c.redirect_uris)}</code></div>
                            ${c.description ? `<div class="oauth-meta-row"><i class="fas fa-align-left"></i><span>${escapeHtml(c.description)}</span></div>` : ''}
                            <div class="oauth-meta-row"><i class="fas fa-user-shield"></i><span>${escapeHtml(c.created_by_name || '未知')} · ${new Date(c.created_at).toLocaleString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>
                        </div>
                    </div>
                    <div class="oauth-client-actions">
                        <button class="icon-btn oauth-action-btn" data-action="toggle" data-id="${escapeHtml(c.client_id)}" title="${c.is_active ? '禁用' : '启用'}"><i class="fas fa-${c.is_active ? 'pause' : 'play'}"></i></button>
                        <button class="icon-btn oauth-action-btn" data-action="secret" data-id="${escapeHtml(c.client_id)}" title="重置密钥"><i class="fas fa-key"></i></button>
                        <button class="icon-btn oauth-action-btn" data-action="revoke" data-id="${escapeHtml(c.client_id)}" title="撤销令牌"><i class="fas fa-ban"></i></button>
                        <button class="icon-btn danger oauth-action-btn" data-action="delete" data-id="${escapeHtml(c.client_id)}" title="删除"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
            listEl.querySelectorAll('.oauth-action-btn').forEach(btn => {
                btn.onclick = async () => {
                    const action = btn.dataset.action;
                    const clientId = btn.dataset.id;
                    if (action === 'toggle') {
                        try {
                            const res = await fetch(API_ENDPOINTS.oauthAdmin, {
                                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ action: 'toggle', client_id: clientId })
                            });
                            const d = await res.json();
                            if (d.success) { showNotification(d.is_active ? '客户端已启用' : '客户端已禁用', 'success'); loadClients(); }
                            else showNotification(d.error, 'error');
                        } catch (e) { showNotification('操作失败: ' + e.message, 'error'); }
                    } else if (action === 'secret') {
                        if (!await showConfirmation({ title: '重置密钥', message: '重置密钥后旧密钥将立即失效，所有使用该密钥的应用需要更新配置。<br><br>确认重置？', confirmText: '确认重置', confirmClass: 'danger' })) return;
                        try {
                            const res = await fetch(API_ENDPOINTS.oauthAdmin, {
                                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ action: 'reset_secret', client_id: clientId })
                            });
                            const d = await res.json();
                            if (d.success) {
                                const secModal = document.createElement('div');
                                secModal.className = 'auth-modal';
                                secModal.innerHTML = `<div class="auth-box" style="max-width:520px;"><button id="close-sec-modal" class="close-modal-btn"><i class="fas fa-times"></i></button><h2 class="auth-title"><i class="fas fa-key"></i> 新密钥</h2><div class="oauth-warning-box"><i class="fas fa-exclamation-triangle"></i><p>请立即复制并妥善保管，此密钥仅展示一次！</p></div><div class="oauth-cred-box"><code class="oauth-secret-code">${escapeHtml(d.client_secret)}</code></div><button id="copy-sec-btn" class="primary-btn full-width"><i class="fas fa-copy"></i> 复制密钥</button></div></div>`;
                                document.body.appendChild(secModal);
                                secModal.querySelector('#close-sec-modal').onclick = () => closeAuthModal(secModal);
                                secModal.querySelector('#copy-sec-btn').onclick = () => { navigator.clipboard.writeText(d.client_secret); showNotification('已复制', 'success'); };
                            } else { showNotification(d.error, 'error'); }
                        } catch (e) { showNotification('操作失败: ' + e.message, 'error'); }
                    } else if (action === 'revoke') {
                        if (!await showConfirmation({ title: '撤销令牌', message: '确认撤销该客户端的所有活跃令牌？<br><br>所有已授权用户需要重新登录。', confirmText: '确认撤销', confirmClass: 'danger' })) return;
                        try {
                            const res = await fetch(API_ENDPOINTS.oauthAdmin, {
                                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ action: 'revoke_tokens', client_id: clientId })
                            });
                            const d = await res.json();
                            if (d.success) { showNotification(d.message, 'success'); loadClients(); }
                            else showNotification(d.error, 'error');
                        } catch (e) { showNotification('操作失败: ' + e.message, 'error'); }
                    } else if (action === 'delete') {
                        if (!await showConfirmation({ title: '删除客户端', message: '删除客户端将同时删除其所有授权码和令牌。<br><br>确认删除？', confirmText: '确认删除', confirmClass: 'danger' })) return;
                        try {
                            const res = await fetch(API_ENDPOINTS.oauthAdmin, {
                                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ action: 'delete', client_id: clientId })
                            });
                            const d = await res.json();
                            if (d.success) { showNotification('客户端已删除', 'success'); loadClients(); }
                            else showNotification(d.error, 'error');
                        } catch (e) { showNotification('操作失败: ' + e.message, 'error'); }
                    }
                };
            });
        } catch (e) {
            listEl.innerHTML = `<div class="oauth-error-state"><i class="fas fa-exclamation-circle"></i>加载失败: ${escapeHtml(e.message)}</div>`;
        }
    }
    modal.querySelector('#oauth-refresh-btn').onclick = loadClients;
    modal.querySelector('#oauth-cleanup-btn').onclick = async () => {
        try {
            const res = await fetch(API_ENDPOINTS.oauthAdmin, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'cleanup' })
            });
            const d = await res.json();
            showNotification(d.message || '清理完成', d.success ? 'success' : 'error');
        } catch (e) { showNotification('清理失败: ' + e.message, 'error'); }
    };
    modal.querySelector('#oauth-create-btn').onclick = () => {
        const createModal = document.createElement('div');
        createModal.className = 'auth-modal';
        createModal.innerHTML = `
            <div class="auth-box" style="max-width:520px;">
                <button id="close-create-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
                <h2 class="auth-title"><i class="fas fa-plus"></i> 新建客户端</h2>
                <form id="oauth-create-form">
                    <div class="form-group"><label>客户端名称 <span style="color:var(--accent-color);">*</span></label><div class="input-with-icon"><i class="fas fa-tag"></i><input type="text" id="oauth-client-name" class="form-control" placeholder="如：XX社区、XX助手" required></div></div>
                    <div class="form-group"><label>回调地址 (Redirect URI) <span style="color:var(--accent-color);">*</span></label><textarea id="oauth-redirect-uris" class="form-control" rows="3" placeholder="多个地址用英文逗号分隔&#10;如: https://example.com/callback, http://localhost:3000/auth" required></textarea><div class="oauth-form-hint"><i class="fas fa-info-circle"></i> 第三方应用接收授权码的 URL，支持多个</div></div>
                    <div class="form-group"><label>描述</label><div class="input-with-icon"><i class="fas fa-align-left"></i><input type="text" id="oauth-description" class="form-control" placeholder="应用简介（可选）"></div></div>
                    <div class="form-group"><label>Logo URL</label><div class="input-with-icon"><i class="fas fa-image"></i><input type="url" id="oauth-logo-url" class="form-control" placeholder="https://example.com/logo.png（可选）"></div></div>
                    <button type="submit" class="primary-btn full-width"><i class="fas fa-check"></i> 创建</button>
                </form>
            </div>`;
        document.body.appendChild(createModal);
        createModal.querySelector('#close-create-modal').onclick = () => closeAuthModal(createModal);
        createModal.querySelector('#oauth-create-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = createModal.querySelector('#oauth-client-name').value.trim();
            const uris = createModal.querySelector('#oauth-redirect-uris').value.trim();
            const desc = createModal.querySelector('#oauth-description').value.trim();
            const logo = createModal.querySelector('#oauth-logo-url').value.trim();
            if (!name || !uris) { showNotification('请填写必填项', 'error'); return; }
            const btn = createModal.querySelector('button[type="submit"]');
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 创建中...';
            try {
                const res = await fetch(API_ENDPOINTS.oauthAdmin, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ action: 'create', client_name: name, redirect_uris: uris, description: desc, logo_url: logo })
                });
                const d = await res.json();
                if (d.success) {
                    closeAuthModal(createModal);
                    const resultModal = document.createElement('div');
                    resultModal.className = 'auth-modal';
                    resultModal.innerHTML = `<div class="auth-box" style="max-width:520px;"><button id="close-result" class="close-modal-btn"><i class="fas fa-times"></i></button><div class="oauth-success-header"><div class="oauth-success-icon"><i class="fas fa-check"></i></div><h2 class="oauth-success-title">客户端创建成功</h2></div><div class="oauth-warning-box"><i class="fas fa-exclamation-triangle"></i><p>请立即复制并妥善保管，client_secret 仅此一次展示！</p></div><div class="oauth-cred-result"><div class="oauth-cred-item"><div class="oauth-cred-label">Client ID</div><div class="oauth-cred-value">${escapeHtml(d.client.client_id)}</div></div><div class="oauth-cred-item"><div class="oauth-cred-label">Client Secret</div><div class="oauth-cred-value">${escapeHtml(d.client.client_secret)}</div></div></div><div class="oauth-cred-actions"><button id="copy-oauth-cred-btn" class="primary-btn full-width"><i class="fas fa-copy"></i> 复制凭证</button><button id="close-result2" class="secondary-btn full-width" style="margin-top:0.5rem;">关闭</button></div></div>`;
                    document.body.appendChild(resultModal);
                    resultModal.querySelector('#close-result').onclick = () => closeAuthModal(resultModal);
                    resultModal.querySelector('#close-result2').onclick = () => closeAuthModal(resultModal);
                    resultModal.querySelector('#copy-oauth-cred-btn').onclick = () => {
                        const cred = `Client ID: ${d.client.client_id}\nClient Secret: ${d.client.client_secret}`;
                        navigator.clipboard.writeText(cred);
                        showNotification('已复制到剪贴板', 'success');
                    };
                    loadClients();
                } else {
                    showNotification(d.error, 'error');
                    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 创建';
                }
            } catch (e) {
                showNotification('创建失败: ' + e.message, 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 创建';
            }
        };
    };
    await loadClients();
}

