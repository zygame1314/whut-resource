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
            if (isGuestbookAdmin(window.currentUser)) {
                fetchAndDisplayGuestbookStats(token);
            }
        }
        let processedData = [...guestbookCache.data];
        if (currentGuestbookFilter === 'mine' && window.currentUser) {
            processedData = processedData.filter(msg => {
                if (msg.user_id === window.currentUser.id) return true;
                if (msg.replies && msg.replies.some(r => r.user_id === window.currentUser.id)) return true;
                return false;
            });
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
    if (!isGuestbookAdmin(window.currentUser)) return;
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
            const isAdmin = isGuestbookAdmin(window.currentUser);
            showNotification(isAdmin ? '留言发布成功！' : '留言已提交，请耐心等待审核', 'success');
            const isSuperAdmin = isGuestbookSuperAdmin(window.currentUser);
            const newMessage = {
                id: result.id,
                user_id: window.currentUser.id,
                nickname: window.currentUser.nickname || '匿名用户',
                content: content,
                parent_id: null,
                likes: 0,
                has_liked: false,
                is_hidden: isAdmin ? 0 : 1,
                is_pinned: 0,
                status: 'unresolved',
                reject_reason: null,
                resolve_note: null,
                created_at: new Date().toISOString(),
                role: window.currentUser.role,
                isAdmin: isAdmin,
                isSuperAdmin: isSuperAdmin,
                replies: []
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
                btnElement.classList.add('active');
                icon.classList.remove('far');
                icon.classList.add('fas');
                countSpan.textContent = count + 1;
                btnElement.setAttribute('onclick', `unlikeGuestbook(${id}, this)`);
            } else {
                btnElement.classList.remove('active');
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
                let found = false;
                const msg = guestbookCache.data.find(m => m.id === id);
                if (msg) {
                    msg.likes = action === 'like' ? msg.likes + 1 : Math.max(0, msg.likes - 1);
                    msg.has_liked = action === 'like';
                    found = true;
                }
                if (!found) {
                    for (const parent of guestbookCache.data) {
                        if (parent.replies) {
                            const reply = parent.replies.find(r => r.id === id);
                            if (reply) {
                                reply.likes = action === 'like' ? reply.likes + 1 : Math.max(0, reply.likes - 1);
                                reply.has_liked = action === 'like';
                                break;
                            }
                        }
                    }
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
                updateGuestbookCache(id, { status: 'unresolved', reject_reason: null, is_hidden: 0 });
                showNotification('留言已取消驳回', 'success');
            } else if (action === 'ban_user' || action === 'unban_user') {
                const data = await response.json();
                if (data.pending_approval) {
                    showNotification(data.message || '已提交封禁请求，等待超级管理员审批', 'info');
                } else {
                    updateGuestbookCache(id, { is_banned: action === 'ban_user' });
                    showNotification(action === 'ban_user' ? '用户已封禁' : '用户已解封', 'success');
                }
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
async function handleReplySubmit(parentId, content) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content, parent_id: parentId })
        });
        if (response.ok) {
            const result = await response.json();
            const isAdmin = isGuestbookAdmin(window.currentUser);
            const isSuperAdmin = isGuestbookSuperAdmin(window.currentUser);
            const newReply = {
                id: result.id,
                user_id: window.currentUser.id,
                nickname: window.currentUser.nickname || '匿名用户',
                content: content,
                parent_id: parentId,
                likes: 0,
                has_liked: false,
                is_hidden: isAdmin ? 0 : 1,
                status: 'unresolved',
                reject_reason: null,
                resolve_note: null,
                created_at: new Date().toISOString(),
                role: window.currentUser.role,
                isAdmin: isAdmin,
                isSuperAdmin: isSuperAdmin
            };
            const parent = guestbookCache.data.find(m => m.id === parentId);
            if (parent) {
                if (!parent.replies) parent.replies = [];
                parent.replies.push(newReply);
                fetchAndDisplayGuestbook(currentGuestbookPage);
            }
            showNotification(isAdmin ? '回复发布成功！' : '回复发布成功！审核后将显示', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error || '回复失败', 'error');
        }
    } catch (error) {
        console.error('Error posting reply:', error);
        showNotification('回复出错，请检查网络', 'error');
    }
}
