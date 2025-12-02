const GUESTBOOK_API_URL = '/api/guestbook';
const guestbookSection = document.getElementById('guestbook-section');
const guestbookList = document.getElementById('guestbook-list');
const guestbookForm = document.getElementById('guestbook-form');
const guestbookContentInput = document.getElementById('guestbook-content');
const submitGuestbookBtn = document.getElementById('submit-guestbook-btn');
const guestbookPagination = document.getElementById('guestbook-pagination');
let currentGuestbookPage = 1;
let totalGuestbookPages = 1;
let currentGuestbookSort = 'time';
const GUESTBOOK_PER_PAGE = 5;
document.addEventListener('DOMContentLoaded', () => {
    initGuestbook();
});
window.changeGuestbookPage = function(page) {
    if (page < 1 || page > totalGuestbookPages) return;
    fetchAndDisplayGuestbook(page);
};
window.changeGuestbookSort = function(sortType) {
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
window.likeGuestbook = function(id, btnElement) {
    handleGuestbookAction(id, 'like', btnElement);
};
window.deleteGuestbook = function(id) {
    handleDeleteGuestbook(id);
};
window.toggleGuestbookVisibility = function(id, currentHiddenState) {
    const action = currentHiddenState ? 'unhide' : 'hide';
    handleGuestbookAction(id, action);
};
window.confirmBanUser = async function(id) {
    let confirmed = false;
    if (typeof showConfirmation === 'function') {
        confirmed = await showConfirmation({
            title: '封禁用户',
            message: '确定要封禁发布这条留言的用户吗？该用户将无法再发布留言。',
            confirmText: '封禁',
            confirmClass: 'confirm-btn-danger'
        });
    } else {
        confirmed = confirm('确定要封禁发布这条留言的用户吗？该用户将无法再发布留言。');
    }
    if (confirmed) {
        handleGuestbookAction(id, 'ban_user');
    }
};

window.confirmUnbanUser = async function(id) {
    let confirmed = false;
    if (typeof showConfirmation === 'function') {
        confirmed = await showConfirmation({
            title: '解封用户',
            message: '确定要解封这位用户吗？该用户将恢复发布留言的权限。',
            confirmText: '解封',
            confirmClass: 'confirm-btn-primary'
        });
    } else {
        confirmed = confirm('确定要解封这位用户吗？该用户将恢复发布留言的权限。');
    }
    if (confirmed) {
        handleGuestbookAction(id, 'unban_user');
    }
};
function initGuestbook() {
    if (guestbookForm) {
        guestbookForm.addEventListener('submit', handleGuestbookSubmit);
    }
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
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        if (guestbookList) {
            guestbookList.innerHTML = '<div class="loading-spinner"></div>';
        }
        const response = await fetch(`${GUESTBOOK_API_URL}?page=${page}&limit=${GUESTBOOK_PER_PAGE}&sort=${currentGuestbookSort}`, { headers });
        if (!response.ok) throw new Error('Failed to fetch guestbook messages');
        const data = await response.json();
        const messages = data.data;
        const pagination = data.pagination;
        currentGuestbookPage = pagination.page;
        totalGuestbookPages = pagination.totalPages;
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
            const statusAction = msg.status === 'resolved' ? 'unresolve' : 'resolve';
            adminControls = `
                <div class="guestbook-admin-controls">
                    <button class="icon-btn small ${pinClass}" onclick="handleGuestbookAction(${msg.id}, '${pinAction}')" title="${pinTitle}">
                        <i class="${pinIcon}"></i>
                    </button>
                    <button class="icon-btn small ${statusClass}" onclick="handleGuestbookAction(${msg.id}, '${statusAction}')" title="${statusTitle}">
                        <i class="${statusIcon}"></i>
                    </button>
                    <button class="icon-btn small ${visibilityClass}" onclick="toggleGuestbookVisibility(${msg.id}, ${msg.is_hidden})" title="${visibilityTitle}">
                        <i class="${visibilityIcon}"></i>
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
        const nickname = msg.nickname || '匿名用户';
        const avatarChar = nickname.charAt(0).toUpperCase();
        const avatarColor = getAvatarColor(nickname);
        let statusBadge = '';
        if (msg.status === 'resolved') {
            statusBadge = '<span class="status-badge resolved"><i class="fas fa-check"></i> 已解决</span>';
        } else {
            statusBadge = '<span class="status-badge unresolved">未解决</span>';
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
                        ${adminControls}
                    </div>
                    <div class="guestbook-content">${escapeHtml(msg.content)}</div>
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
        <span class="pagination-info">${currentGuestbookPage} / ${totalGuestbookPages}</span>
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
            guestbookContentInput.value = '';
            showNotification('留言发布成功！', 'success');
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
                 fetchAndDisplayGuestbook(currentGuestbookPage);
                 showNotification('操作失败', 'error');
             } else {
                 const data = await response.json();
                 showNotification(data.error || '操作失败', 'error');
             }
        } else {
            if (action === 'hide' || action === 'unhide' || action === 'pin' || action === 'unpin' || action === 'resolve' || action === 'unresolve' || action === 'ban_user' || action === 'unban_user') {
                showNotification('操作成功', 'success');
                fetchAndDisplayGuestbook(currentGuestbookPage);
            }
        }
    } catch (error) {
        console.error('Error handling guestbook action:', error);
        showNotification('操作出错', 'error');
         if (btnElement && (action === 'like' || action === 'unlike')) {
             fetchAndDisplayGuestbook(currentGuestbookPage);
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
            fetchAndDisplayGuestbook(currentGuestbookPage);
        } else {
            showNotification('删除失败', 'error');
        }
    } catch (error) {
        console.error('Error deleting guestbook:', error);
        showNotification('删除出错', 'error');
    }
}