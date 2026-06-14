const TODOS_API_URL = API_ENDPOINTS.todos;
let todosModal = null;
let todosNextCursor = null;
let todosHasMore = false;
let todosCurrentStatus = 'pending';
let todosLoadingMore = false;

function isGuestbookAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}

async function fetchTodos(status = 'pending', cursor = null) {
    const token = localStorage.getItem('authToken');
    if (!token) return { todos: [], nextCursor: null, hasMore: false };
    try {
        let url = `${TODOS_API_URL}?status=${status}&limit=20`;
        if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return { todos: [], nextCursor: null, hasMore: false };
        const data = await response.json();
        return {
            todos: data.todos || [],
            nextCursor: data.nextCursor || null,
            hasMore: data.hasMore || false
        };
    } catch (e) {
        console.error('获取待办列表失败:', e);
        return { todos: [], nextCursor: null, hasMore: false };
    }
}

window.showTodosModal = async function () {
    if (!isGuestbookAdmin(window.currentUser)) return;
    if (todosModal) {
        closeAuthModal(todosModal);
    }
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'todos-modal';
    todosModal = modal;
    modal.innerHTML = `
        <div class="auth-box" style="max-width:720px;">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-tasks u-margin-right-small"></i>待办事项</h2>
                <div class="admin-logs-toolbar">
                    <div class="custom-select-container" id="todo-status-dropdown">
                        <button class="custom-select-trigger secondary-btn" type="button">
                            <span class="selected-text">待处理</span>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="custom-select-options dropdown-menu">
                            <div class="dropdown-item selected" data-value="pending">待处理</div>
                            <div class="dropdown-item" data-value="resolved">已解决</div>
                            <div class="dropdown-item" data-value="all">全部</div>
                        </div>
                        <input type="hidden" id="todo-status-filter" value="pending">
                    </div>
                    <button id="todo-refresh-btn" class="admin-log-refresh-btn" title="刷新"><i class="fas fa-sync-alt"></i></button>
                </div>
                <button id="close-todos-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="todos-content" class="admin-scrollable-container">
                <div class="loading-spinner"></div>
            </div>
            <div id="todos-pagination" class="pagination-controls" style="margin-top:0.8rem;"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-todos-modal').addEventListener('click', () => {
        closeAuthModal(modal);
        todosModal = null;
    });
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) {
            closeAuthModal(modal);
            todosModal = null;
        }
    });

    const dropdown = modal.querySelector('#todo-status-dropdown');
    const trigger = dropdown.querySelector('.custom-select-trigger');
    const optionsMenu = dropdown.querySelector('.custom-select-options');
    const hiddenInput = dropdown.querySelector('#todo-status-filter');
    const items = dropdown.querySelectorAll('.dropdown-item');
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
            requestAnimationFrame(() => optionsMenu.classList.add('show'));
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
            const value = item.dataset.value;
            const text = item.textContent;
            hiddenInput.value = value;
            trigger.querySelector('.selected-text').textContent = text;
            items.forEach(i => i.classList.toggle('selected', i.dataset.value === value));
            optionsMenu.classList.remove('show');
            arrow.style.transform = 'rotate(0deg)';
            trigger.classList.remove('active');
            loadTodosIntoModal(modal, true);
        });
    });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !optionsMenu.contains(e.target)) {
            optionsMenu.classList.remove('show');
            arrow.style.transform = 'rotate(0deg)';
            trigger.classList.remove('active');
        }
    }, { once: true });

    modal.querySelector('#todo-refresh-btn').addEventListener('click', () => loadTodosIntoModal(modal, true));

    loadTodosIntoModal(modal, true);
};

async function loadTodosIntoModal(modal, reset = false) {
    const container = modal.querySelector('#todos-content');
    const paginationEl = modal.querySelector('#todos-pagination');
    const statusFilter = modal.querySelector('#todo-status-filter');
    const status = statusFilter ? statusFilter.value : 'pending';

    if (reset) {
        todosData = [];
        todosNextCursor = null;
        todosHasMore = false;
        todosCurrentStatus = status;
        container.innerHTML = '<div class="loading-spinner"></div>';
        paginationEl.innerHTML = '';
    } else {
        if (todosLoadingMore || !todosHasMore || status !== todosCurrentStatus) return;
        todosLoadingMore = true;
        const loadMoreBtn = paginationEl.querySelector('.todo-load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>加载中...</span>';
            loadMoreBtn.dataset.loading = 'true';
        }
    }

    try {
        const result = await fetchTodos(status, reset ? null : todosNextCursor);
        if (reset) {
            todosData = result.todos;
        } else {
            todosData = todosData.concat(result.todos);
        }
        todosNextCursor = result.nextCursor;
        todosHasMore = result.hasMore;
        todosCurrentStatus = status;
    } catch (e) {
        if (reset) container.innerHTML = '<div class="admin-error-state">加载失败，请重试</div>';
        todosLoadingMore = false;
        return;
    }

    if (todosData.length === 0) {
        const emptyIcon = status === 'resolved' ? 'fas fa-check-circle' : 'fas fa-clipboard-list';
        const emptyText = status === 'resolved' ? '暂无已解决的待办' : status === 'pending' ? '暂无待处理的待办' : '暂无待办事项';
        container.innerHTML = `<div class="admin-empty-state-padded"><div class="admin-empty-state-icon"><i class="${emptyIcon}"></i></div>${emptyText}</div>`;
        paginationEl.innerHTML = '';
        refreshTodoDotFromData();
        return;
    }

    container.innerHTML = todosData.map((todo, index) => {
        const isResolved = todo.status === 'resolved';
        const msgCount = todo.messages ? todo.messages.length : (todo.guestbook_count || 0);
        const statusBadge = isResolved
            ? '<span class="status-badge resolved"><i class="fas fa-check"></i> 已解决</span>'
            : '<span class="status-badge auditing"><i class="fas fa-clock"></i> 待处理</span>';
        const countBadge = msgCount > 0
            ? `<span class="admin-log-action" data-category="info" style="margin-left:6px;">${msgCount} 条留言</span>`
            : '';
        const utcDate = todo.created_at && (todo.created_at.endsWith('Z') ? todo.created_at : todo.created_at + 'Z');
        const dateStr = utcDate ? new Date(utcDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
        const msgsHtml = (todo.messages && todo.messages.length > 0)
            ? todo.messages.map(m => {
                const nick = escapeHtml(m.nickname || '匿名用户');
                const content = escapeHtml((m.content || '').substring(0, 80));
                const gBadge = m.guestbook_status === 'resolved'
                    ? '<span class="status-badge resolved" style="font-size:0.7rem;padding:1px 5px;"><i class="fas fa-check"></i></span>'
                    : m.guestbook_status === 'rejected'
                        ? '<span class="status-badge rejected" style="font-size:0.7rem;padding:1px 5px;"><i class="fas fa-times"></i></span>'
                        : '<span class="status-badge auditing" style="font-size:0.7rem;padding:1px 5px;"><i class="fas fa-clock"></i></span>';
                return `<div class="admin-log-user-info">${gBadge} <strong>${nick}</strong>: ${content}${m.content && m.content.length > 80 ? '...' : ''}</div>`;
            }).join('')
            : '';
        const descHtml = todo.description ? `<div class="admin-log-details"><strong>备注：</strong>${escapeHtml(todo.description)}</div>` : '';
        const resolvedHtml = isResolved && todo.resolved_at
            ? `<div class="admin-log-user-info"><i class="fas fa-user-check" style="color:var(--success, #52c41a);"></i> 解决于 ${formatDateLocal(todo.resolved_at)}</div>`
            : '';
        const actionBtns = isResolved
            ? `<div class="request-actions">
                    <button class="secondary-btn small todo-reopen-btn" data-todo-id="${todo.id}"><i class="fas fa-undo"></i> 重新打开</button>
                    <button class="secondary-btn small todo-delete-btn" data-todo-id="${todo.id}" style="color:#dc2626;border-color:#dc2626;"><i class="fas fa-trash"></i> 删除</button>
                </div>`
            : `<div class="request-actions">
                    <button class="primary-btn small todo-resolve-btn" data-todo-id="${todo.id}"><i class="fas fa-check"></i> 解决</button>
                    <button class="secondary-btn small todo-delete-btn" data-todo-id="${todo.id}" style="color:#dc2626;border-color:#dc2626;"><i class="fas fa-trash"></i> 删除</button>
                </div>`;
        return `
            <div class="request-item" data-todo-id="${todo.id}" data-index="${index}">
                <div class="request-header" style="flex-wrap:wrap;gap:0.5rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span class="request-type"><i class="fas fa-folder-open" style="color:var(--primary-color);margin-right:4px;"></i>${escapeHtml(todo.category)}</span>
                        ${countBadge}
                        ${statusBadge}
                    </div>
                    <span class="admin-log-timestamp">${dateStr}</span>
                </div>
                ${descHtml}
                ${msgsHtml}
                ${resolvedHtml}
                ${actionBtns}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.todo-resolve-btn').forEach(btn => {
        btn.addEventListener('click', () => resolveTodoFromModal(parseInt(btn.dataset.todoId), modal));
    });
    container.querySelectorAll('.todo-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteTodoFromModal(parseInt(btn.dataset.todoId), modal));
    });
    container.querySelectorAll('.todo-reopen-btn').forEach(btn => {
        btn.addEventListener('click', () => reopenTodoFromModal(parseInt(btn.dataset.todoId), modal));
    });

    todosLoadingMore = false;
    renderTodosPagination(paginationEl, modal);
    refreshTodoDotFromData();
}

function renderTodosPagination(paginationEl, modal) {
    if (!todosHasMore) {
        paginationEl.innerHTML = '';
        return;
    }
    paginationEl.innerHTML = `<button class="todo-load-more-btn" data-loading="false"><i class="fas fa-angle-double-down"></i><span>加载更多</span></button>`;
    paginationEl.querySelector('.todo-load-more-btn').addEventListener('click', function() {
        if (this.dataset.loading === 'true') return;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>加载中...</span>';
        this.dataset.loading = 'true';
        loadTodosIntoModal(modal, false);
    });
}

async function resolveTodoFromModal(todoId, modal) {
    const confirmed = await showConfirmation({
        title: '解决待办',
        message: '确定要标记此待办为已解决吗？<br><br>关联的所有留言也将被标记为已解决。',
        confirmText: '确认解决',
        confirmClass: 'confirm-btn-primary'
    });
    if (!confirmed) return;
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(TODOS_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id: todoId, action: 'resolve' })
        });
        const data = await response.json();
        if (response.ok) {
            showNotification('待办已解决，关联留言已标记为已解决', 'success');
            loadTodosIntoModal(modal);
            refreshGuestbook();
        } else {
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (e) {
        console.error('解决待办失败:', e);
        showNotification('操作出错', 'error');
    }
}

async function deleteTodoFromModal(todoId, modal) {
    const confirmed = await showConfirmation({
        title: '删除待办',
        message: '确定要删除此待办吗？仅删除待办记录，不影响关联留言。',
        confirmText: '删除',
        confirmClass: 'confirm-btn-danger'
    });
    if (!confirmed) return;
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${TODOS_API_URL}?id=${todoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            showNotification('待办已删除', 'success');
            loadTodosIntoModal(modal);
        } else {
            showNotification(data.error || '删除失败', 'error');
        }
    } catch (e) {
        console.error('删除待办失败:', e);
        showNotification('操作出错', 'error');
    }
}

async function reopenTodoFromModal(todoId, modal) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(TODOS_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id: todoId, action: 'unresolve' })
        });
        const data = await response.json();
        if (response.ok) {
            showNotification('待办已重新打开', 'success');
            loadTodosIntoModal(modal);
        } else {
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (e) {
        console.error('重新打开待办失败:', e);
        showNotification('操作出错', 'error');
    }
}

function initTodoPanel() {
    const sidebarEntry = document.getElementById('todo-sidebar-entry');
    if (!sidebarEntry) return;
    if (!isGuestbookAdmin(window.currentUser)) {
        sidebarEntry.style.display = 'none';
        return;
    }
    sidebarEntry.style.display = 'flex';
    updateTodoBadge();
}

function refreshTodoDotFromData() {
    const dotEl = document.getElementById('todo-sidebar-dot');
    if (!dotEl) return;
    const hasPending = todosCurrentStatus === 'pending' && todosData.length > 0;
    dotEl.style.display = hasPending ? 'block' : 'none';
}

async function updateTodoBadge() {
    const dotEl = document.getElementById('todo-sidebar-dot');
    const sidebarEntry = document.getElementById('todo-sidebar-entry');
    if (!dotEl || !sidebarEntry) return;
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;
        const response = await fetch(`${TODOS_API_URL}?action=pending_exists`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.has_pending) {
                dotEl.style.display = 'block';
            } else {
                dotEl.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('更新待办计数失败:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTodoPanel();
});