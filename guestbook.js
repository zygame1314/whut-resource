const GUESTBOOK_API_URL = API_ENDPOINTS.guestbook;
const guestbookSection = document.getElementById('guestbook-section');
const guestbookList = document.getElementById('guestbook-list');
const guestbookForm = document.getElementById('guestbook-form');
const guestbookContentInput = document.getElementById('guestbook-content');
const submitGuestbookBtn = document.getElementById('submit-guestbook-btn');
const guestbookPagination = document.getElementById('guestbook-pagination');
let currentGuestbookPage = 1;
let totalGuestbookPages = 1;
let currentGuestbookSort = 'time';
let currentGuestbookFilter = 'all';
let currentGuestbookStatus = 'all';
const GUESTBOOK_PER_PAGE = 5;
document.addEventListener('DOMContentLoaded', () => {
    initGuestbook();
    document.addEventListener('authSuccess', () => {
        console.log('Auth success, reloading guestbook...');
        refreshGuestbook(currentGuestbookPage);
    });
});
window.changeGuestbookPage = function (page) {
    if (page < 1 || page > totalGuestbookPages) return;
    if (guestbookSection) {
        guestbookSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    fetchAndDisplayGuestbook(page);
};
window.changeGuestbookSort = function (sortType) {
    if (currentGuestbookSort === sortType) return;
    currentGuestbookSort = sortType;
    currentGuestbookPage = 1;
    document.querySelectorAll('.guestbook-sort-btn').forEach(btn => {
        if (btn.dataset.sort === sortType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    fetchAndDisplayGuestbook(1);
};
window.likeGuestbook = function (id, btnElement) {
    handleGuestbookAction(id, 'like', btnElement);
};
window.deleteGuestbook = function (id) {
    handleDeleteGuestbook(id);
};
window.toggleGuestbookVisibility = function (id, currentHiddenState) {
    const action = currentHiddenState ? 'unhide' : 'hide';
    handleGuestbookAction(id, action);
};
window.confirmBanUser = async function (id) {
    let confirmed = false;
    if (typeof showConfirmation === 'function') {
        confirmed = await showConfirmation({
            title: '封禁用户',
            message: '确定要封禁发布这条留言的用户吗？该用户将无法再使用网站功能。',
            confirmText: '封禁',
            confirmClass: 'confirm-btn-danger'
        });
    } else {
        confirmed = confirm('确定要封禁发布这条留言的用户吗？该用户将无法再使用网站功能。');
    }
    if (confirmed) {
        handleGuestbookAction(id, 'ban_user');
    }
};
window.confirmUnbanUser = async function (id) {
    let confirmed = false;
    if (typeof showConfirmation === 'function') {
        confirmed = await showConfirmation({
            title: '解封用户',
            message: '确定要解封这位用户吗？该用户将恢复使用网站功能的权限。',
            confirmText: '解封',
            confirmClass: 'confirm-btn-primary'
        });
    } else {
        confirmed = confirm('确定要解封这位用户吗？该用户将恢复使用网站功能的权限。');
    }
    if (confirmed) {
        handleGuestbookAction(id, 'unban_user');
    }
};
const REJECT_PRESETS = [
    '无关内容',
    '重复提交',
    '表述不清',
    '无法实现',
];
window.rejectGuestbook = async function (id) {
    let rejectReason = '';
    try {
        rejectReason = await showRejectPrompt();
    } catch (e) {
        return;
    }
    if (rejectReason === null) return;
    rejectReason = rejectReason.trim();
    if (!rejectReason) {
        showNotification('驳回原因不能为空', 'warning');
        return;
    }
    if (rejectReason.length > 200) {
        showNotification('驳回原因过长（最多200字符）', 'warning');
        return;
    }
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, action: 'reject', reject_reason: rejectReason })
        });
        if (response.ok) {
            showNotification('留言已驳回', 'success');
            updateGuestbookCache(id, { status: 'rejected', reject_reason: rejectReason, is_hidden: 1 });
        } else {
            const data = await response.json();
            showNotification(data.error || '驳回失败', 'error');
        }
    } catch (error) {
        console.error('Reject guestbook error:', error);
        showNotification('驳回出错', 'error');
    }
};
function showRejectPrompt() {
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        const presetsHtml = REJECT_PRESETS.map((preset, index) =>
            `<button class="reject-preset-btn" data-index="${index}">${preset}</button>`
        ).join('');
        modalOverlay.innerHTML = `
            <div class="confirmation-modal reject-modal">
                <h3><i class="fas fa-times-circle"></i> 驳回留言</h3>
                <p>选择预设原因或自定义输入：</p>
                <div class="reject-presets">
                    ${presetsHtml}
                </div>
                <div class="prompt-input-container">
                    <textarea id="reject-reason-input" placeholder="请填写驳回原因（最多200字符）" rows="3" maxlength="200"></textarea>
                    <div class="char-counter"><span id="reject-char-count">0</span>/200</div>
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger">驳回</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const textarea = modalOverlay.querySelector('#reject-reason-input');
        const charCount = modalOverlay.querySelector('#reject-char-count');
        const presetBtns = modalOverlay.querySelectorAll('.reject-preset-btn');
        textarea.focus();
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = REJECT_PRESETS[parseInt(btn.dataset.index)];
                textarea.value = preset;
                charCount.textContent = preset.length;
                presetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                if (value !== null) {
                    resolve(value);
                } else {
                    reject(new Error('User cancelled'));
                }
            }, { once: true });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => closeModal(textarea.value));
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal(null);
            }
        });
    });
}
window.resolveGuestbook = async function (id) {
    let resolvePath = null;
    try {
        resolvePath = await showResolvePrompt();
    } catch (e) {
        return;
    }
    if (resolvePath === null) return;
    resolvePath = resolvePath ? resolvePath.trim() : null;
    try {
        const token = localStorage.getItem('authToken');
        const body = { id, action: 'resolve' };
        if (resolvePath) {
            body.resolve_note = resolvePath;
        }
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            showNotification('留言已标记为已解决', 'success');
            updateGuestbookCache(id, { status: 'resolved', reject_reason: null, resolve_note: resolvePath || null, is_hidden: 0 });
        } else {
            const data = await response.json();
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('Resolve guestbook error:', error);
        showNotification('操作出错', 'error');
    }
};
async function showResolvePrompt() {
    const token = localStorage.getItem('authToken');
    let directories = [];
    try {
        const response = await fetch(`${API_ENDPOINTS.files}?action=listAllDirs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success && result.directories) {
            directories = result.directories.map(d => d.endsWith('/') ? d.slice(0, -1) : d);
        }
    } catch (e) {
        console.warn('获取目录列表失败:', e);
    }
    function buildDirectoryTree(dirs) {
        const tree = {};
        dirs.forEach(dir => {
            const parts = dir.split('/');
            let current = tree;
            parts.forEach(part => {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            });
        });
        return tree;
    }
    function renderPathTreeNode(name, children, path, isRoot = false) {
        const fullPath = isRoot ? '' : path;
        const hasChildren = Object.keys(children).length > 0;
        const li = document.createElement('li');
        li.className = 'path-tree-node';
        const nodeContent = document.createElement('div');
        nodeContent.className = 'path-tree-item';
        nodeContent.dataset.path = fullPath;
        nodeContent.innerHTML = `
            <i class="fas fa-chevron-right path-toggle-icon ${hasChildren ? '' : 'invisible'}"></i>
            <i class="fas ${isRoot ? 'fa-home' : 'fa-folder'} path-folder-icon"></i>
            <span class="path-folder-name">${escapeHtml(name)}</span>
        `;
        li.appendChild(nodeContent);
        if (hasChildren) {
            const sublist = document.createElement('ul');
            sublist.className = 'path-tree-list';
            sublist.style.display = isRoot ? 'block' : 'none';
            const sortedKeys = Object.keys(children).sort();
            sortedKeys.forEach(key => {
                const childPath = isRoot ? key : path + '/' + key;
                sublist.appendChild(renderPathTreeNode(key, children[key], childPath, false));
            });
            li.appendChild(sublist);
        }
        return li;
    }
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        let selectedPath = '';
        const tree = buildDirectoryTree(directories);
        const hasDirectories = directories.length > 0;
        const pathSelectorHtml = hasDirectories ? `
            <div class="resolve-path-selector">
                <label class="resolve-label"><i class="fas fa-folder-open"></i> 资源目录（可选）</label>
                <div class="path-dropdown-wrapper">
                    <button type="button" id="resolve-path-btn" class="path-dropdown-btn">
                        <span class="selected-path">点击选择目录</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div id="resolve-path-dropdown" class="path-dropdown-menu">
                        <div class="path-dropdown-header">
                            <span>选择资源目录</span>
                            <button type="button" id="clear-path-btn" class="clear-path-btn" title="清除选择"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="path-search-wrapper">
                            <input type="text" id="resolve-path-search" class="path-search-input" placeholder="搜索目录...">
                        </div>
                        <div id="resolve-path-tree-container" class="path-tree-container"></div>
                    </div>
                </div>
            </div>
        ` : '';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal resolve-modal">
                <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> 标记为已解决</h3>
                <p>可选填写资源目录和备注信息</p>
                ${pathSelectorHtml}
                <div class="prompt-input-container">
                    <label class="resolve-label"><i class="fas fa-comment"></i> 备注（可选）</label>
                    <textarea id="resolve-note-input" placeholder="如：这是去年的资料、祝考试顺利等" rows="2"></textarea>
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">取消</button>
                    <button class="confirm-btn confirm-btn-primary">确认解决</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const noteInput = modalOverlay.querySelector('#resolve-note-input');
        const pathBtn = modalOverlay.querySelector('#resolve-path-btn');
        const pathDropdown = modalOverlay.querySelector('#resolve-path-dropdown');
        const pathTreeContainer = modalOverlay.querySelector('#resolve-path-tree-container');
        const clearPathBtn = modalOverlay.querySelector('#clear-path-btn');
        const searchInput = modalOverlay.querySelector('#resolve-path-search');
        if (pathTreeContainer && hasDirectories) {
            const ul = document.createElement('ul');
            ul.className = 'path-tree-list root';
            ul.appendChild(renderPathTreeNode('根目录', tree, '', true));
            pathTreeContainer.appendChild(ul);
            pathTreeContainer.addEventListener('click', (e) => {
                const toggleIcon = e.target.closest('.path-toggle-icon');
                const treeItem = e.target.closest('.path-tree-item');
                if (toggleIcon && !toggleIcon.classList.contains('invisible')) {
                    e.stopPropagation();
                    const parentLi = toggleIcon.closest('.path-tree-node');
                    const sublist = parentLi.querySelector(':scope > .path-tree-list');
                    if (sublist) {
                        const isExpanded = sublist.style.display !== 'none';
                        sublist.style.display = isExpanded ? 'none' : 'block';
                        toggleIcon.style.transform = isExpanded ? '' : 'rotate(90deg)';
                    }
                } else if (treeItem) {
                    pathTreeContainer.querySelectorAll('.path-tree-item').forEach(item => {
                        item.classList.remove('selected');
                    });
                    treeItem.classList.add('selected');
                    selectedPath = treeItem.dataset.path;
                    pathBtn.querySelector('.selected-path').textContent = selectedPath || '根目录';
                    pathDropdown.classList.remove('open');
                    pathBtn.classList.remove('open');
                }
            });
        }
        if (searchInput) {
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            searchInput.addEventListener('input', (e) => {
                if (typeof filterTreeByKeyword === 'function') {
                    filterTreeByKeyword(pathTreeContainer, e.target.value, {
                        nodeSelector: '.path-tree-node',
                        itemSelector: '.path-tree-item',
                        nameSelector: '.path-folder-name',
                        listSelector: '.path-tree-list',
                        toggleSelector: '.path-toggle-icon',
                        useTransform: true
                    });
                }
            });
        }
        if (clearPathBtn) {
            clearPathBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedPath = '';
                pathBtn.querySelector('.selected-path').textContent = '点击选择目录';
                pathTreeContainer?.querySelectorAll('.path-tree-item').forEach(item => {
                    item.classList.remove('selected');
                });
                pathDropdown.classList.remove('open');
                pathBtn.classList.remove('open');
            });
        }
        if (pathBtn && pathDropdown) {
            pathBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pathDropdown.classList.toggle('open');
                pathBtn.classList.toggle('open');
                if (pathDropdown.classList.contains('open') && searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            });
        }
        noteInput.focus();
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                if (value !== null) {
                    resolve(value);
                } else {
                    reject(new Error('User cancelled'));
                }
            }, { once: true });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => {
            const path = selectedPath.trim();
            const note = noteInput.value.trim();
            if (path || note) {
                closeModal(JSON.stringify({ path: path || null, note: note || null }));
            } else {
                closeModal('');
            }
        });
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('click', (e) => {
            if (pathDropdown && !pathDropdown.contains(e.target) && !pathBtn?.contains(e.target)) {
                pathDropdown.classList.remove('open');
                pathBtn?.classList.remove('open');
            }
        });
    });
}
function initGuestbook() {
    if (guestbookForm) {
        guestbookForm.addEventListener('submit', handleGuestbookSubmit);
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        refreshGuestbook(currentGuestbookPage);
    } else if (guestbookList) {
        guestbookList.innerHTML = '<div class="loading-spinner"></div>';
    }
}
let guestbookCache = { data: [] };
function refreshGuestbook(page = 1) {
    guestbookCache = { data: [] };
    fetchAndDisplayGuestbook(page);
}
function updateGuestbookCache(id, updates) {
    const index = guestbookCache.data.findIndex(msg => msg.id === id);
    if (index !== -1) {
        guestbookCache.data[index] = { ...guestbookCache.data[index], ...updates };
        fetchAndDisplayGuestbook(currentGuestbookPage);
    }
}
function removeFromGuestbookCache(id) {
    guestbookCache.data = guestbookCache.data.filter(msg => msg.id !== id);
    fetchAndDisplayGuestbook(currentGuestbookPage);
}
async function fetchAndDisplayGuestbook(page = 1) {
    if (!guestbookSection) return;
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            if (guestbookForm) guestbookForm.style.display = 'none';
            const loginPrompt = document.getElementById('guestbook-login-prompt');
            if (loginPrompt) loginPrompt.style.display = 'block';
            if (guestbookList) {
                guestbookList.innerHTML = '';
            }
            if (guestbookPagination) {
                guestbookPagination.style.display = 'none';
            }
            return;
        }
        const headers = { 'Authorization': `Bearer ${token}` };
        if (guestbookList) {
            guestbookList.innerHTML = '<div class="loading-spinner"></div>';
        }
        const needRefresh = guestbookCache.data.length === 0;
        if (needRefresh) {
            const response = await fetch(GUESTBOOK_API_URL, { headers });
            if (!response.ok) throw new Error('Failed to fetch guestbook messages');
            const data = await response.json();
            guestbookCache = { data: data.data || [] };
            if (window.currentUser && window.currentUser.role === 'admin') {
                fetchAndDisplayGuestbookStats(token);
            }
        }
        let processedData = [...guestbookCache.data];
        if (currentGuestbookFilter === 'mine' && window.currentUser) {
            processedData = processedData.filter(msg => msg.user_id === window.currentUser.id);
        }
        if (currentGuestbookSort === 'likes') {
            processedData.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
                if (a.likes !== b.likes) return b.likes - a.likes;
                return new Date(b.created_at) - new Date(a.created_at);
            });
        } else {
            processedData.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
                return new Date(b.created_at) - new Date(a.created_at);
            });
        }
        if (currentGuestbookStatus !== 'all') {
            processedData = processedData.filter(msg => msg.status === currentGuestbookStatus);
        }
        const startIndex = (page - 1) * GUESTBOOK_PER_PAGE;
        const endIndex = startIndex + GUESTBOOK_PER_PAGE;
        const messages = processedData.slice(startIndex, endIndex);
        currentGuestbookPage = page;
        totalGuestbookPages = Math.ceil(processedData.length / GUESTBOOK_PER_PAGE) || 1;
        renderGuestbook(messages);
        renderGuestbookPagination();
        if (guestbookForm) guestbookForm.style.display = 'block';
        const loginPrompt = document.getElementById('guestbook-login-prompt');
        if (loginPrompt) loginPrompt.style.display = 'none';
    } catch (error) {
        console.error('Error fetching guestbook:', error);
        if (guestbookList) {
            guestbookList.innerHTML = '<p class="error-message">加载留言失败，请稍后重试</p>';
        }
    }
}
async function fetchAndDisplayGuestbookStats(token) {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;
    try {
        const response = await fetch(`${GUESTBOOK_API_URL}?action=stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.stats) {
                renderGuestbookStats(data.stats);
            }
        }
    } catch (error) {
        console.error('获取留言板统计失败:', error);
    }
}
function renderGuestbookStats(stats) {
    let statsWrapper = document.getElementById('guestbook-stats-wrapper');
    if (!statsWrapper) return;
    let statsContainer = document.getElementById('guestbook-stats-container');
    if (!statsContainer) {
        statsContainer = document.createElement('div');
        statsContainer.id = 'guestbook-stats-container';
        statsContainer.className = 'guestbook-stats-container';
        statsWrapper.appendChild(statsContainer);
    }
    let lastCleanupDate = '从未';
    if (stats.last_cleanup_at) {
        const date = new Date(stats.last_cleanup_at + (stats.last_cleanup_at.endsWith('Z') ? '' : 'Z'));
        lastCleanupDate = date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    statsContainer.innerHTML = `
        <div class="stats-item" title="自建站以来的总留言数">
            <i class="fas fa-history"></i> 
            <span>历史总数: <strong>${stats.total_messages_all_time}</strong></span>
        </div>
        <div class="stats-divider"></div>
        <div class="stats-item" title="当前显示的留言数">
            <i class="fas fa-layer-group"></i> 
            <span>当前存留: <strong>${stats.current_messages_count}</strong></span>
        </div>
        <div class="stats-divider"></div>
        <div class="stats-item" title="最近一次自动清理情况">
            <i class="fas fa-broom"></i> 
            <span>上次清理: <strong>${stats.last_cleanup_count}</strong> 条 <span class="stats-date">(${lastCleanupDate})</span></span>
        </div>
    `;
    statsContainer.style.display = 'flex';
}
function renderGuestbook(messages) {
    if (!guestbookList) return;
    if (!messages || messages.length === 0) {
        guestbookList.innerHTML = '<p class="empty-state-small">暂无留言，快来发布第一条心愿吧！</p>';
        return;
    }
    const isAdmin = window.currentUser && window.currentUser.role === 'admin';
    const currentUserId = window.currentUser ? window.currentUser.id : null;
    guestbookList.innerHTML = messages.map(msg => {
        const isAuthor = currentUserId === msg.user_id;
        const likedClass = msg.has_liked ? 'liked' : '';
        const likeAction = msg.has_liked ? `unlikeGuestbook(${msg.id}, this)` : `likeGuestbook(${msg.id}, this)`;
        const likeIcon = msg.has_liked ? 'fas fa-heart' : 'far fa-heart';
        let adminControls = '';
        let authorControls = '';
        if (isAdmin) {
            const visibilityIcon = msg.is_hidden ? 'fas fa-eye-slash' : 'fas fa-eye';
            const visibilityTitle = msg.is_hidden ? '取消隐藏' : '隐藏留言';
            const visibilityClass = msg.is_hidden ? 'status-hidden' : '';
            const pinIcon = msg.is_pinned ? 'fas fa-thumbtack' : 'fas fa-thumbtack';
            const pinTitle = msg.is_pinned ? '取消置顶' : '置顶留言';
            const pinClass = msg.is_pinned ? 'active' : '';
            const pinAction = msg.is_pinned ? 'unpin' : 'pin';
            const statusIcon = msg.status === 'resolved' ? 'fas fa-check-circle' : 'far fa-check-circle';
            const statusTitle = msg.status === 'resolved' ? '标记为未解决' : '标记为已解决';
            const statusClass = msg.status === 'resolved' ? 'success' : '';
            const rejectIcon = msg.status === 'rejected' ? 'fas fa-times-circle' : 'far fa-times-circle';
            const rejectTitle = msg.status === 'rejected' ? '取消驳回' : '驳回留言';
            const rejectClass = msg.status === 'rejected' ? 'danger' : '';
            const encodedContent = btoa(encodeURIComponent(msg.content));
            adminControls = `
                <div class="guestbook-admin-controls">
                    <button class="icon-btn small ai-btn" onclick="aiProcessGuestbook(${msg.id})" title="AI 分析处理">
                        <i class="fas fa-robot"></i>
                    </button>
                    <button class="icon-btn small ${pinClass}" onclick="handleGuestbookAction(${msg.id}, '${pinAction}')" title="${pinTitle}">
                        <i class="${pinIcon}"></i>
                    </button>
                    <button class="icon-btn small ${statusClass}" onclick="${msg.status === 'resolved' ? `handleGuestbookAction(${msg.id}, 'unresolve')` : `resolveGuestbook(${msg.id})`}" title="${statusTitle}">
                        <i class="${statusIcon}"></i>
                    </button>
                    <button class="icon-btn small ${rejectClass}" onclick="${msg.status === 'rejected' ? `handleGuestbookAction(${msg.id}, 'unreject')` : `rejectGuestbook(${msg.id})`}" title="${rejectTitle}">
                        <i class="${rejectIcon}"></i>
                    </button>
                    <button class="icon-btn small ${visibilityClass}" onclick="toggleGuestbookVisibility(${msg.id}, ${msg.is_hidden})" title="${visibilityTitle}">
                        <i class="${visibilityIcon}"></i>
                    </button>
                    <button class="icon-btn small" onclick="editGuestbook(${msg.id}, '${encodedContent}')" title="编辑留言">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${msg.is_banned ? `
                    <button class="icon-btn small success" onclick="confirmUnbanUser(${msg.id})" title="解封用户">
                        <i class="fas fa-user-check"></i>
                    </button>
                    ` : `
                    <button class="icon-btn small danger" onclick="confirmBanUser(${msg.id})" title="封禁用户">
                        <i class="fas fa-user-slash"></i>
                    </button>
                    `}
                    <button class="icon-btn small danger" onclick="deleteGuestbook(${msg.id})" title="删除留言">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        if (isAuthor && !isAdmin) {
            const encodedContent = btoa(encodeURIComponent(msg.content));
            authorControls = `
                <div class="guestbook-author-controls">
                    <button class="icon-btn small" onclick="editGuestbook(${msg.id}, '${encodedContent}')" title="编辑留言">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-btn small danger" onclick="deleteGuestbook(${msg.id})" title="删除留言">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        const nickname = msg.nickname || '匿名用户';
        const safeNickname = escapeHtml(nickname);
        const avatarChar = safeNickname.charAt(0).toUpperCase();
        const avatarColor = getAvatarColor(nickname);
        let statusBadge = '';
        let rejectReasonHtml = '';
        let resolveNoteHtml = '';
        if (msg.status === 'resolved') {
            statusBadge = '<span class="status-badge resolved"><i class="fas fa-check"></i> 已解决</span>';
            if (msg.resolve_note) {
                resolveNoteHtml = renderResolveNote(msg.resolve_note);
            }
        } else if (msg.status === 'rejected') {
            statusBadge = '<span class="status-badge rejected"><i class="fas fa-times"></i> 已驳回</span>';
            if (msg.reject_reason) {
                rejectReasonHtml = `<div class="reject-reason"><i class="fas fa-comment-slash"></i> 驳回原因：${escapeHtml(msg.reject_reason)}</div>`;
            }
        } else {
            statusBadge = '<span class="status-badge unresolved">未解决</span>';
        }
        if (msg.is_hidden && msg.status !== 'rejected') {
            statusBadge = '<span class="status-badge auditing"><i class="fas fa-hourglass-half"></i> 审核中</span>';
        }
        let pinnedBadge = '';
        if (msg.is_pinned) {
            pinnedBadge = '<span class="pinned-badge"><i class="fas fa-thumbtack"></i> 置顶</span>';
        }
        return `
            <div class="guestbook-item ${msg.is_hidden ? 'is-hidden' : ''} ${msg.is_pinned ? 'is-pinned' : ''}">
                <div class="guestbook-left">
                    <div class="user-avatar-placeholder" style="background: ${avatarColor}">${avatarChar}</div>
                </div>
                <div class="guestbook-main">
                    <div class="guestbook-header">
                        <div class="guestbook-user-info">
                            <div class="user-info-top">
                                <div class="nickname-wrapper">
                                    <span class="nickname">${escapeHtml(msg.nickname || '匿名用户')}</span>
                                    ${msg.isAdmin ? '<span class="admin-badge"><i class="fas fa-shield-alt"></i> 管理员</span>' : ''}
                                </div>
                                <span class="timestamp">${formatDateLocal(msg.created_at)}</span>
                            </div>
                            <div class="user-badges">
                                ${pinnedBadge}
                                ${statusBadge}
                            </div>
                        </div>
                        ${adminControls}${authorControls}
                    </div>
                    <div class="guestbook-content">${escapeHtml(msg.content)}</div>
                    ${rejectReasonHtml}
                    ${resolveNoteHtml}
                    <div class="guestbook-footer">
                        <button class="like-btn ${likedClass}" onclick="${likeAction}">
                            <i class="${likeIcon}"></i> <span>${msg.likes}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
function renderResolveNote(note) {
    if (!note) return '';
    let path = null;
    let remark = null;
    try {
        if (note.trim().startsWith('{')) {
            const obj = JSON.parse(note);
            if (typeof obj === 'object' && obj !== null) {
                path = obj.path;
                remark = obj.note;
            }
        }
    } catch (e) {
    }
    if (path || remark) {
        let html = '';
        if (path) {
            const escapedPath = path.trim().replace(/'/g, "\\'").replace(/"/g, '\\"');
            const safePath = escapeHtml(path);
            html += `<div class="resolve-note"><i class="fas fa-folder-open"></i> 资源位置：<a href="javascript:void(0)" class="resolve-note-link" onclick="navigateToPath('${escapedPath}')" title="点击跳转到该目录">${safePath}</a></div>`;
        }
        if (remark) {
            html += `<div class="resolve-note resolve-note-text"><i class="fas fa-info-circle"></i> 管理员备注：${escapeHtml(remark)}</div>`;
        }
        return html;
    }
    const safeNote = escapeHtml(note);
    const isLikelyPath = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\.()（）\s]+(?:\/[\u4e00-\u9fa5a-zA-Z0-9_\-\.()（）\s]+)*\/?$/.test(note.trim());
    if (isLikelyPath) {
        const escapedPath = note.trim().replace(/'/g, "\\'").replace(/"/g, '\\"');
        return `<div class="resolve-note"><i class="fas fa-folder-open"></i> 资源位置：<a href="javascript:void(0)" class="resolve-note-link" onclick="navigateToPath('${escapedPath}')" title="点击跳转到该目录">${safeNote}</a></div>`;
    } else {
        return `<div class="resolve-note resolve-note-text"><i class="fas fa-info-circle"></i> 管理员备注：${safeNote}</div>`;
    }
}
window.navigateToPath = function (path) {
    const fileExplorer = document.getElementById('file-list');
    if (fileExplorer) {
        fileExplorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof fetchAndDisplayFiles === 'function') {
        let cleanPath = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        const normalizedPath = cleanPath ? cleanPath + '/' : '/';
        fetchAndDisplayFiles(normalizedPath);
        showNotification(`正在跳转到目录：${cleanPath || '根目录'}`, 'info');
    } else {
        showNotification('无法导航到目录', 'error');
    }
};
function getAvatarColor(name) {
    const colors = [
        'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
        'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
        'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}
function renderGuestbookPagination() {
    if (!guestbookPagination) return;
    if (totalGuestbookPages <= 1) {
        guestbookPagination.innerHTML = '';
        guestbookPagination.style.display = 'none';
        return;
    }
    guestbookPagination.style.display = 'flex';
    guestbookPagination.innerHTML = `
        <button class="secondary-btn small" onclick="changeGuestbookPage(${currentGuestbookPage - 1})" ${currentGuestbookPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
        <div style="display:flex; align-items:center;">
            <input type="number" min="1" max="${totalGuestbookPages}" value="${currentGuestbookPage}" 
                class="pagination-jump-input" 
                onchange="let val = parseInt(this.value); if(val >= 1 && val <= ${totalGuestbookPages}) changeGuestbookPage(val); else this.value = ${currentGuestbookPage}"
                onkeydown="if(event.key === 'Enter') this.blur()"
            >
            <span class="pagination-info">/ ${totalGuestbookPages}</span>
        </div>
        <button class="secondary-btn small" onclick="changeGuestbookPage(${currentGuestbookPage + 1})" ${currentGuestbookPage === totalGuestbookPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
}
async function handleGuestbookSubmit(e) {
    e.preventDefault();
    const content = guestbookContentInput.value.trim();
    if (!content) return;
    if (submitGuestbookBtn) {
        submitGuestbookBtn.disabled = true;
        submitGuestbookBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发布中...';
    }
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content })
        });
        if (response.ok) {
            const result = await response.json();
            guestbookContentInput.value = '';
            showNotification('留言发布成功！', 'success');
            const isAdmin = window.currentUser && window.currentUser.role === 'admin';
            const newMessage = {
                id: result.id,
                user_id: window.currentUser.id,
                nickname: window.currentUser.nickname || '匿名用户',
                content: content,
                likes: 0,
                has_liked: false,
                is_hidden: isAdmin ? 0 : 1,
                is_pinned: 0,
                status: 'unresolved',
                reject_reason: null,
                resolve_note: null,
                created_at: new Date().toISOString(),
                role: window.currentUser.role,
                isAdmin: isAdmin
            };
            guestbookCache.data.unshift(newMessage);
            fetchAndDisplayGuestbook(1);
        } else {
            const data = await response.json();
            showNotification(data.error || '发布失败', 'error');
        }
    } catch (error) {
        console.error('Error posting guestbook:', error);
        showNotification('发布出错，请检查网络', 'error');
    } finally {
        if (submitGuestbookBtn) {
            submitGuestbookBtn.disabled = false;
            submitGuestbookBtn.innerHTML = '发布心愿';
        }
    }
}
async function handleGuestbookAction(id, action, btnElement) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            showNotification('请先登录', 'warning');
            return;
        }
        if (btnElement && (action === 'like' || action === 'unlike')) {
            const icon = btnElement.querySelector('i');
            const countSpan = btnElement.querySelector('span');
            let count = parseInt(countSpan.textContent);
            if (action === 'like') {
                btnElement.classList.add('liked');
                icon.classList.remove('far');
                icon.classList.add('fas');
                countSpan.textContent = count + 1;
                btnElement.setAttribute('onclick', `unlikeGuestbook(${id}, this)`);
            } else {
                btnElement.classList.remove('liked');
                icon.classList.remove('fas');
                icon.classList.add('far');
                countSpan.textContent = Math.max(0, count - 1);
                btnElement.setAttribute('onclick', `likeGuestbook(${id}, this)`);
            }
        }
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, action })
        });
        if (!response.ok) {
            if (btnElement && (action === 'like' || action === 'unlike')) {
                refreshGuestbook(currentGuestbookPage);
                showNotification('操作失败', 'error');
            } else {
                const data = await response.json();
                showNotification(data.error || '操作失败', 'error');
            }
        } else {
            if (action === 'like' || action === 'unlike') {
                const msg = guestbookCache.data.find(m => m.id === id);
                if (msg) {
                    msg.likes = action === 'like' ? msg.likes + 1 : Math.max(0, msg.likes - 1);
                    msg.has_liked = action === 'like';
                }
            } else if (action === 'hide') {
                updateGuestbookCache(id, { is_hidden: 1 });
                showNotification('留言已隐藏', 'success');
            } else if (action === 'unhide') {
                updateGuestbookCache(id, { is_hidden: 0 });
                showNotification('留言已取消隐藏', 'success');
            } else if (action === 'pin') {
                updateGuestbookCache(id, { is_pinned: 1 });
                showNotification('留言已置顶', 'success');
            } else if (action === 'unpin') {
                updateGuestbookCache(id, { is_pinned: 0 });
                showNotification('留言已取消置顶', 'success');
            } else if (action === 'resolve' || action === 'unresolve') {
                updateGuestbookCache(id, { status: action === 'resolve' ? 'resolved' : 'unresolved', reject_reason: null });
                showNotification(action === 'resolve' ? '留言已标记为已解决' : '留言已标记为未解决', 'success');
            } else if (action === 'reject') {
                updateGuestbookCache(id, { status: 'rejected', is_hidden: 1 });
                showNotification('留言已驳回', 'success');
            } else if (action === 'unreject') {
                updateGuestbookCache(id, { status: 'unresolved', reject_reason: null });
                showNotification('留言已取消驳回', 'success');
            } else if (action === 'ban_user' || action === 'unban_user') {
                updateGuestbookCache(id, { is_banned: action === 'ban_user' });
                showNotification(action === 'ban_user' ? '用户已封禁' : '用户已解封', 'success');
            }
        }
    } catch (error) {
        console.error('Error handling guestbook action:', error);
        showNotification('操作出错', 'error');
        if (btnElement && (action === 'like' || action === 'unlike')) {
            refreshGuestbook(currentGuestbookPage);
        }
    }
}
async function handleDeleteGuestbook(id) {
    let confirmed = false;
    if (typeof showConfirmation === 'function') {
        confirmed = await showConfirmation({
            title: '删除留言',
            message: '确定要删除这条留言吗？',
            confirmText: '删除',
            confirmClass: 'confirm-btn-danger'
        });
    } else {
        confirmed = confirm('确定要删除这条留言吗？');
    }
    if (!confirmed) return;
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${GUESTBOOK_API_URL}?id=${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            showNotification('留言已删除', 'success');
            removeFromGuestbookCache(id);
        } else {
            showNotification('删除失败', 'error');
        }
    } catch (error) {
        console.error('Error deleting guestbook:', error);
        showNotification('删除出错', 'error');
    }
}
window.unlikeGuestbook = function (id, btnElement) {
    handleGuestbookAction(id, 'unlike', btnElement);
};
window.changeGuestbookFilter = function (filter) {
    if (currentGuestbookFilter === filter) return;
    currentGuestbookFilter = filter;
    currentGuestbookPage = 1;
    document.querySelectorAll('.guestbook-filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) btn.classList.add('active'); else btn.classList.remove('active');
    });
    fetchAndDisplayGuestbook(1);
};
window.changeGuestbookStatus = function (status) {
    if (currentGuestbookStatus === status) return;
    currentGuestbookStatus = status;
    currentGuestbookPage = 1;
    document.querySelectorAll('.guestbook-status-btn').forEach(btn => {
        if (btn.dataset.status === status) btn.classList.add('active'); else btn.classList.remove('active');
    });
    fetchAndDisplayGuestbook(1);
};
window.editGuestbook = async function (id, encodedContent = '') {
    let decoded = '';
    try {
        decoded = decodeURIComponent(atob(encodedContent));
    } catch (e) {
        decoded = encodedContent;
    }
    let newContent = '';
    try {
        if (typeof showPrompt === 'function') {
            newContent = await showPrompt({ title: '编辑留言', message: '修改留言内容：', initialValue: decoded, placeholder: '请输入留言内容', useTextarea: true, rows: 5 });
        } else {
            newContent = prompt('编辑留言：', decoded);
        }
    } catch (e) {
        return;
    }
    if (newContent === null) return;
    newContent = newContent.trim();
    if (!newContent) {
        showNotification('内容不能为空', 'warning');
        return;
    }
    if (newContent.length > 500) {
        showNotification('内容过长（最多500字符）', 'warning');
        return;
    }
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, action: 'edit', content: newContent })
        });
        if (response.ok) {
            showNotification('编辑成功', 'success');
            const isAdmin = window.currentUser && window.currentUser.role === 'admin';
            updateGuestbookCache(id, {
                content: newContent,
                status: 'unresolved',
                reject_reason: null,
                is_hidden: isAdmin ? 0 : 1
            });
        } else {
            const data = await response.json();
            showNotification(data.error || '编辑失败', 'error');
        }
    } catch (error) {
        console.error('Edit guestbook error:', error);
        showNotification('编辑出错', 'error');
    }
};
let isAiProcessing = false;
window.aiProcessGuestbook = async function (id) {
    if (isAiProcessing) {
        showNotification('AI 正在处理中，请稍候...', 'warning');
        return;
    }
    isAiProcessing = true;
    const GUESTBOOK_AI_API_URL = API_ENDPOINTS.guestbookAi;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'confirmation-modal-overlay ai-loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="ai-loading-modal">
            <div class="ai-loading-spinner">
                <i class="fas fa-robot fa-spin"></i>
            </div>
            <h3>AI 正在分析留言</h3>
            <p class="ai-loading-hint">正在进行内容审核与资源匹配...</p>
            <div class="ai-loading-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    const removeLoading = () => {
        loadingOverlay.classList.add('closing');
        loadingOverlay.addEventListener('animationend', () => {
            if (loadingOverlay.parentNode) {
                document.body.removeChild(loadingOverlay);
            }
        }, { once: true });
    };
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                guestbook_id: id,
                auto_mode: false
            })
        });
        removeLoading();
        if (!response.ok) {
            const data = await response.json();
            showNotification(data.error || 'AI 处理失败', 'error');
            return;
        }
        const result = await response.json();
        await showAiResultModal(id, result);
    } catch (error) {
        removeLoading();
        console.error('AI 处理错误:', error);
        showNotification('AI 处理出错', 'error');
    } finally {
        isAiProcessing = false;
    }
};
async function showAiResultModal(guestbookId, result) {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        let actionIcon = 'fa-robot';
        let actionColor = 'var(--primary)';
        let actionTitle = 'AI 分析结果';
        let actionDescription = '';
        let resourcesHtml = '';
        let buttonsHtml = '';
        switch (result.action) {
            case 'reject':
                actionIcon = 'fa-times-circle';
                actionColor = 'var(--error)';
                actionTitle = 'AI 建议驳回';
                actionDescription = `<div class="ai-result-reason"><strong>驳回原因：</strong>${escapeHtml(result.reason)}</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="apply">确认驳回</button>
                `;
                break;
            case 'hide':
                actionIcon = 'fa-eye-slash';
                actionColor = 'var(--warning)';
                actionTitle = 'AI 建议隐藏';
                actionDescription = `<div class="ai-result-reason"><strong>隐藏原因：</strong>${escapeHtml(result.reason)}</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-warning" data-action="hide">确认隐藏</button>
                `;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-warning" data-action="hide">确认隐藏</button>
                `;
                break;
            case 'ban_user':
                actionIcon = 'fa-user-slash';
                actionColor = 'var(--error)';
                actionTitle = 'AI 建议封禁用户（严重违规）';
                actionDescription = `<div class="ai-result-reason"><strong>封禁原因：</strong>${escapeHtml(result.reason)}</div>
                    <div class="ai-result-warning">⚠️ 将封禁用户并删除该留言，且无法恢复！</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="ban_and_delete">封禁并删除</button>
                `;
                break;
            case 'delete':
                actionIcon = 'fa-trash-alt';
                actionColor = 'var(--error)';
                actionTitle = 'AI 建议删除（严重违规）';
                actionDescription = `<div class="ai-result-reason"><strong>删除原因：</strong>${escapeHtml(result.reason)}</div>
                    <div class="ai-result-warning">⚠️ 删除后无法恢复，请谨慎操作！</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="delete">确认删除</button>
                `;
                break;
            case 'resolve':
                actionIcon = 'fa-check-circle';
                actionColor = 'var(--success)';
                actionTitle = 'AI 建议标记为已解决';
                if (result.searchResults && result.searchResults.length > 0) {
                    actionDescription = `<div class="ai-result-message">已找到 ${result.searchResults.length} 个相关资源：</div>`;
                    resourcesHtml = renderAiSearchResults(result.searchResults);
                } else {
                    actionDescription = `<div class="ai-result-reply">${escapeHtml(result.reply)}</div>`;
                }
                if (result.resource_path) {
                    actionDescription += `<div class="ai-result-path"><i class="fas fa-folder-open"></i> 资源目录：<strong>${escapeHtml(result.resource_path)}</strong></div>`;
                }
                if (result.note) {
                    actionDescription += `<div class="ai-result-note" style="margin-top:8px; color:var(--text-secondary);"><strong>备注：</strong>${escapeHtml(result.note)}</div>`;
                }
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-primary" data-action="apply">确认解决</button>
                `;
                break;
            case 'search':
            case 'search_completed':
                actionIcon = 'fa-search';
                actionColor = 'var(--secondary)';
                actionTitle = 'AI 搜索结果';
                if (result.searchResults && result.searchResults.length > 0) {
                    actionDescription = `<div class="ai-result-message">已找到 ${result.searchResults.length} 个相关资源：</div>`;
                    resourcesHtml = renderAiSearchResults(result.searchResults);
                    buttonsHtml = `
                        <button class="confirm-btn-cancel" data-action="cancel">关闭</button>
                        <button class="confirm-btn confirm-btn-primary" data-action="resolve">标记为已解决</button>
                    `;
                } else {
                    actionDescription = `<div class="ai-result-message">${escapeHtml(result.message)}</div>`;
                    buttonsHtml = `<button class="confirm-btn-cancel" data-action="cancel">关闭</button>`;
                }
                break;
            case 'keep_pending':
                actionIcon = 'fa-clock';
                actionColor = 'var(--warning)';
                actionTitle = 'AI 建议人工处理';
                actionDescription = `<div class="ai-result-note"><strong>备注：</strong>${escapeHtml(result.note || '需要管理员人工审核处理')}</div>`;
                buttonsHtml = `<button class="confirm-btn-cancel" data-action="cancel">关闭</button>`;
                break;
            case 'search_no_results':
                actionIcon = 'fa-search-minus';
                actionColor = 'var(--warning)';
                actionTitle = '未找到相关资源';
                actionDescription = `<div class="ai-result-message">${escapeHtml(result.message)}</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">关闭</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="reject">驳回留言</button>
                `;
                break;
            default:
                actionDescription = `<div class="ai-result-message">${escapeHtml(result.message || result.ai_response || '无法确定操作')}</div>`;
                buttonsHtml = `<button class="confirm-btn-cancel" data-action="cancel">关闭</button>`;
        }
        modalOverlay.innerHTML = `
            <div class="confirmation-modal ai-result-modal">
                <div class="ai-result-header" style="color: ${actionColor}">
                    <i class="fas ${actionIcon}"></i>
                    <h3>${actionTitle}</h3>
                </div>
                <div class="ai-result-content">
                    ${actionDescription}
                    ${resourcesHtml}
                </div>
                <div class="confirmation-buttons">
                    ${buttonsHtml}
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const closeModal = () => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                resolve();
            }, { once: true });
        };
        modalOverlay.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                if (action === 'cancel') {
                    closeModal();
                    return;
                }
                if (action === 'apply') {
                    if (result.action === 'reject') {
                        await applyAiAction(guestbookId, 'reject', result.reason, null);
                    } else if (result.action === 'resolve') {
                        let resolveValue = result.resource_path || null;
                        if (result.resource_path || result.note) {
                            resolveValue = JSON.stringify({ path: result.resource_path, note: result.note });
                        }
                        await applyAiAction(guestbookId, 'resolve', null, resolveValue);
                    }
                    closeModal();
                    if (result.action === 'reject') {
                        updateGuestbookCache(guestbookId, { status: 'rejected', reject_reason: result.reason, is_hidden: 1 });
                    } else {
                        updateGuestbookCache(guestbookId, { status: 'resolved', reject_reason: null, resolve_note: resolveValue, is_hidden: 0 });
                    }
                    return;
                }
                if (action === 'hide') {
                    await applyAiAction(guestbookId, 'hide', null, null);
                    closeModal();
                    updateGuestbookCache(guestbookId, { is_hidden: 1 });
                    return;
                }
                if (action === 'delete') {
                    let confirmed = false;
                    if (typeof showConfirmation === 'function') {
                        confirmed = await showConfirmation({
                            title: '确认删除留言',
                            message: '此操作无法撤销！确定要删除这条留言吗？',
                            confirmText: '确认删除',
                            confirmClass: 'confirm-btn-danger'
                        });
                    } else {
                        confirmed = confirm('确定要删除这条留言吗？此操作无法撤销！');
                    }
                    if (confirmed) {
                        await applyAiDeleteAction(guestbookId);
                        closeModal();
                        removeFromGuestbookCache(guestbookId);
                    }
                    return;
                }
                if (action === 'ban_and_delete') {
                    let confirmed = false;
                    if (typeof showConfirmation === 'function') {
                        confirmed = await showConfirmation({
                            title: '确认封禁并删除',
                            message: '将永久封禁该用户并删除此留言，确定吗？',
                            confirmText: '封禁并删除',
                            confirmClass: 'confirm-btn-danger'
                        });
                    } else {
                        confirmed = confirm('将永久封禁该用户并删除此留言，确定吗？');
                    }
                    if (confirmed) {
                        try {
                            await handleGuestbookAction(guestbookId, 'ban_user');
                            const token = localStorage.getItem('authToken');
                            await fetch(`${GUESTBOOK_API_URL}?id=${guestbookId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            showNotification('用户已封禁且留言已删除', 'success');
                            closeModal();
                            removeFromGuestbookCache(guestbookId);
                        } catch (err) {
                            console.error('Ban and delete failed:', err);
                            showNotification('操作部分失败，请重试', 'error');
                        }
                    }
                    return;
                }
                if (action === 'resolve') {
                    await applyAiAction(guestbookId, 'resolve', null, null);
                    closeModal();
                    updateGuestbookCache(guestbookId, { status: 'resolved', reject_reason: null, is_hidden: 0 });
                    return;
                }
                if (action === 'reject') {
                    closeModal();
                    window.rejectGuestbook(guestbookId);
                    return;
                }
            });
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    });
}
function renderAiSearchResults(results) {
    if (!results || results.length === 0) return '';
    const items = results.map(file => {
        const parentPath = file.parent_path ? file.parent_path.replace(/\/+$/, '') : '';
        const path = parentPath ? `${parentPath}/${file.name}` : file.name;
        const score = file.similarity_score ? `${(file.similarity_score * 100).toFixed(0)}%` : '';
        const icon = file.is_directory ? 'fa-folder' : 'fa-file';
        return `
            <div class="ai-search-result-item" title="${escapeHtml(path)}">
                <i class="fas ${icon}"></i>
                <div class="ai-search-result-info">
                    <span class="ai-search-result-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span class="ai-search-result-path" title="${escapeHtml(path)}">${escapeHtml(path)}</span>
                </div>
                ${score ? `<span class="ai-search-result-score">${score}</span>` : ''}
            </div>
        `;
    }).join('');
    return `
        <div class="ai-search-results">
            <div class="ai-search-results-title"><i class="fas fa-list"></i> 匹配的资源：</div>
            ${items}
        </div>
    `;
}
async function applyAiAction(guestbookId, action, reason, resolveNote) {
    try {
        const token = localStorage.getItem('authToken');
        const body = { id: guestbookId, action: action };
        if (action === 'reject' && reason) {
            body.reject_reason = reason;
        }
        if (action === 'resolve' && resolveNote) {
            body.resolve_note = resolveNote;
        }
        const response = await fetch(API_ENDPOINTS.guestbook, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            showNotification('操作成功', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('应用 AI 操作错误:', error);
        showNotification('操作出错', 'error');
    }
}
async function applyAiDeleteAction(guestbookId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_ENDPOINTS.guestbook}?id=${guestbookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            showNotification('留言已删除', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除留言错误:', error);
        showNotification('删除出错', 'error');
    }
}
