(function () {
    'use strict';

    const BELL_BTN_ID = 'notification-bell-btn';
    const BADGE_ID = 'notification-badge';
    const PANEL_ID = 'notification-panel';
    const PAGE_SIZE = 20;

    const TYPE_META = {
        folder_update: { icon: 'fas fa-folder-plus', label: '文件夹更新' },
        guestbook_reply: { icon: 'fas fa-comment-dots', label: '留言回复' },
        announcement: { icon: 'fas fa-bullhorn', label: '公告' }
    };

    const state = {
        unread: false,
        items: [],
        nextCursor: null,
        isLoading: false,
        hasMore: true,
        panelOpen: false
    };

    function authed() {
        return !!localStorage.getItem('authToken');
    }

    function authHeaders() {
        const token = localStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }

    function metaFor(type, icon) {
        if (icon) return { icon, label: TYPE_META[type]?.label || '通知' };
        return TYPE_META[type] || { icon: 'fas fa-bell', label: '通知' };
    }

    function ensureBell() {
        if (document.getElementById(BELL_BTN_ID)) return;
        const container = document.querySelector('.nav-icon-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.id = BELL_BTN_ID;
        btn.className = 'icon-btn';
        btn.title = '通知';
        btn.innerHTML = '<i class="fas fa-bell"></i><span id="' + BADGE_ID + '" class="notification-badge u-hidden"></span>';
        container.appendChild(btn);
        btn.addEventListener('click', togglePanel);
    }

    function setBadge(hasUnread) {
        state.unread = !!hasUnread;
        const badge = document.getElementById(BADGE_ID);
        if (badge) {
            badge.classList.toggle('u-hidden', !state.unread);
        }
        const mobileBadge = document.getElementById('mobile-menu-badge');
        if (mobileBadge) {
            mobileBadge.setAttribute('data-notif-unread', state.unread ? 'true' : 'false');
            mobileBadge.classList.toggle('u-hidden', !state.unread);
        }
    }

    function ensurePanel() {
        if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'notification-panel';
        panel.innerHTML = `
            <div class="notification-panel-header">
                <span class="notification-panel-title"><i class="fas fa-bell"></i> 通知中心</span>
                <div class="notification-panel-actions">
                    <button class="notif-mark-all" title="全部标记为已读">全部已读</button>
                    <button class="notif-clear-all" title="清空全部通知">清空</button>
                </div>
            </div>
            <div class="notification-panel-body"></div>
            <div class="notification-panel-footer u-hidden">
                <button class="notif-load-more">加载更多</button>
            </div>
        `;
        document.body.appendChild(panel);
        panel.addEventListener('click', onPanelClick);
        document.addEventListener('click', (e) => {
            if (!state.panelOpen) return;
            const bell = document.getElementById(BELL_BTN_ID);
            if (e.target.closest('#' + PANEL_ID) || (bell && e.target.closest('#' + BELL_BTN_ID))) return;
            closePanel();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.panelOpen) closePanel();
        });
        return panel;
    }

    function togglePanel() {
        if (!authed()) {
            if (typeof showNotification === 'function') showNotification('请先登录后查看通知', 'info');
            if (typeof showAuthModal === 'function') showAuthModal('login');
            return;
        }
        if (state.panelOpen) closePanel();
        else openPanel();
    }

    function openPanel() {
        const panel = ensurePanel();
        state.panelOpen = true;
        panel.classList.add('open');
        renderLoading();
        loadInitial();
    }

    function renderLoading() {
        const body = document.querySelector('.notification-panel-body');
        if (!body) return;
        const item = '<div class="skeleton-dl-item"><div class="skeleton-dl-icon"></div><div class="skeleton-dl-text"></div><div class="skeleton-dl-time"></div></div>';
        body.innerHTML = `<div class="skeleton-dl-list">${item.repeat(5)}</div>`;
    }

    function closePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.classList.remove('open');
        state.panelOpen = false;
    }

    async function loadInitial() {
        state.items = [];
        state.nextCursor = null;
        state.hasMore = true;
        await loadMore();
    }

    async function loadMore() {
        if (state.isLoading || !state.hasMore) return;
        const isFirstPage = !state.nextCursor;
        state.isLoading = true;
        updateLoadMore();
        try {
            let url = `${API_ENDPOINTS.notifications}?limit=${PAGE_SIZE}`;
            if (state.nextCursor) url += `&cursor=${encodeURIComponent(state.nextCursor)}`;
            const res = await fetch(url, { headers: authHeaders() });
            const data = await res.json();
            if (data.success) {
                state.items = state.items.concat(data.notifications || []);
                state.nextCursor = data.next_cursor || null;
                state.hasMore = !!state.nextCursor;
                renderList();
                if (isFirstPage && state.unread) markAllRead();
            }
        } catch (e) { } finally {
            state.isLoading = false;
            updateLoadMore();
        }
    }

    function updateLoadMore() {
        const footer = document.querySelector('.notification-panel-footer');
        if (!footer) return;
        footer.classList.toggle('u-hidden', !state.hasMore);
        const btn = footer.querySelector('.notif-load-more');
        if (btn) btn.textContent = state.isLoading ? '加载中...' : '加载更多';
        btn.disabled = state.isLoading;
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr.replace(' ', 'T') + 'Z');
        if (isNaN(d.getTime())) return '';
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
        if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前';
        return d.toLocaleDateString('zh-CN');
    }

    function renderList() {
        const body = document.querySelector('.notification-panel-body');
        if (!body) return;
        if (state.items.length === 0) {
            body.innerHTML = `<div class="notification-empty"><i class="fas fa-inbox"></i><p>暂无通知</p></div>`;
            return;
        }
        body.innerHTML = state.items.map(n => renderItem(n)).join('');
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function navigateToGuestbook(id) {
        const section = document.getElementById('guestbook-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const highlightEl = () => {
            const el = document.getElementById('gb-' + id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('notification-highlight');
                setTimeout(() => el.classList.remove('notification-highlight'), 2400);
            }
            return !!el;
        };
        if (highlightEl()) return;
        const currentFilterBtn = document.querySelector('.guestbook-filter-btn.active');
        const isMine = currentFilterBtn && currentFilterBtn.dataset.filter === 'mine';
        const switchToMine = () => {
            if (typeof window.changeGuestbookFilter === 'function' && !isMine) {
                window.changeGuestbookFilter('mine');
                if (typeof showNotification === 'function') {
                    showNotification('已切换到「我的留言」以定位该回复', 'info');
                }
            } else if (typeof window.refreshGuestbook === 'function') {
                window.refreshGuestbook();
            }
        };
        switchToMine();
        const check = (left) => {
            if (highlightEl()) return;
            if (left > 0) setTimeout(() => check(left - 1), 500);
        };
        check(10);
    }

    function renderItem(n) {
        const meta = metaFor(n.type, n.icon);
        const unread = !n.is_read;
        const link = n.link ? ` data-link="${escapeHtml(n.link)}"` : '';
        return `
            <div class="notification-item${unread ? ' unread' : ''}" data-id="${n.id}"${link}>
                <div class="notification-item-icon"><i class="${meta.icon}"></i></div>
                <div class="notification-item-content">
                    <div class="notification-item-title">${escapeHtml(n.title)}</div>
                    ${n.body ? `<div class="notification-item-body">${escapeHtml(n.body)}</div>` : ''}
                    <div class="notification-item-meta">
                        <span class="notification-item-type">${meta.label}</span>
                        <span class="notification-item-time">${timeAgo(n.created_at)}</span>
                    </div>
                </div>
                <button class="notification-item-del" title="删除"><i class="fas fa-times"></i></button>
            </div>
        `;
    }

    async function onPanelClick(e) {
        const delBtn = e.target.closest('.notification-item-del');
        if (delBtn) {
            const item = delBtn.closest('.notification-item');
            if (item) await deleteOne(item.dataset.id);
            return;
        }
        const markAll = e.target.closest('.notif-mark-all');
        if (markAll) { await markAllRead(); return; }
        const clearAll = e.target.closest('.notif-clear-all');
        if (clearAll) { await clearAllNotifications(); return; }
        const loadMoreBtn = e.target.closest('.notif-load-more');
        if (loadMoreBtn) { await loadMore(); return; }
        const item = e.target.closest('.notification-item');
        if (item) {
            if (item.dataset.link) {
                const link = item.dataset.link;
                closePanel();
                if (link.startsWith('#gb-')) {
                    navigateToGuestbook(link.slice(4));
                } else if (link.startsWith('?') || link.startsWith('/?')) {
                    const searchStr = link.startsWith('/?') ? link.slice(1) : link;
                    const params = new URLSearchParams(searchStr);
                    const path = params.get('path') || '';
                    const highlight = params.get('highlight');
                    if (typeof fetchAndDisplayFiles === 'function') {
                        if (typeof searchInput !== 'undefined' && searchInput) searchInput.value = '';
                        if (typeof directoryCache !== 'undefined') delete directoryCache[path];
                        if (highlight && typeof highlightKey !== 'undefined') highlightKey = highlight;
                        fetchAndDisplayFiles(path, '', 1, true);
                    } else {
                        window.location.href = link;
                    }
                } else if (link.startsWith('#')) {
                    window.location.hash = link.slice(1);
                } else {
                    window.location.href = link;
                }
            }
            if (item.classList.contains('unread')) await markOneRead(item.dataset.id);
        }
    }

    async function markAllRead() {
        try {
            const res = await fetch(`${API_ENDPOINTS.notifications}?action=mark_read`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ all: true })
            });
            const data = await res.json();
            if (data.success) {
                setBadge(data.has_unread);
                state.items.forEach(i => i.is_read = true);
                renderList();
            }
        } catch (e) { }
    }

    async function markOneRead(id) {
        try {
            const res = await fetch(`${API_ENDPOINTS.notifications}?action=mark_one_read`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ id: parseInt(id) })
            });
            const data = await res.json();
            if (data.success) {
                setBadge(data.has_unread);
                const item = state.items.find(i => String(i.id) === String(id));
                if (item) item.is_read = true;
                renderList();
            }
        } catch (e) { }
    }

    async function deleteOne(id) {
        try {
            const res = await fetch(`${API_ENDPOINTS.notifications}?id=${encodeURIComponent(id)}`, {
                method: 'DELETE', headers: authHeaders()
            });
            const data = await res.json();
            if (data.success) {
                state.items = state.items.filter(i => String(i.id) !== String(id));
                renderList();
                fetchUnreadCount();
            }
        } catch (e) { }
    }

    async function clearAllNotifications() {
        if (typeof showConfirmation === 'function') {
            const ok = await showConfirmation({
                title: '清空全部通知',
                message: '确定要清空所有通知吗？此操作不可恢复。',
                confirmText: '清空',
                cancelText: '取消'
            });
            if (!ok) return;
        }
        try {
            const res = await fetch(`${API_ENDPOINTS.notifications}?all=true`, {
                method: 'DELETE', headers: authHeaders()
            });
            const data = await res.json();
            if (data.success) {
                state.items = [];
                setBadge(false);
                renderList();
            }
        } catch (e) { }
    }

    function handleIncoming(notification) {
        if (!notification) return;
        setBadge(true);
        state.items.unshift(notification);
        if (state.items.length > PAGE_SIZE * 2) state.items = state.items.slice(0, PAGE_SIZE * 2);
        if (state.panelOpen) renderList();
        if (typeof showNotification === 'function') {
            showNotification(notification.title, 'info');
        }
    }

    function init() {
        if (!authed()) return;
        ensureBell();
    }

    document.addEventListener('authSuccess', init);
    document.addEventListener('authRestored', init);
    document.addEventListener('siteNotification', (e) => {
        if (e.detail && e.detail.notification) handleIncoming(e.detail.notification);
    });
    document.addEventListener('siteNotificationUnread', (e) => {
        if (!authed()) return;
        setBadge(e.detail && e.detail.has_unread);
    });
    if (authed()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();