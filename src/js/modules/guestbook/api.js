async function guestbookFetchPage(cursor) {
    const token = localStorage.getItem('authToken');
    const params = new URLSearchParams();
    params.set('limit', GUESTBOOK_PER_PAGE.toString());
    if (currentGuestbookSort !== 'time') params.set('sort', currentGuestbookSort);
    if (currentGuestbookFilter !== 'all') params.set('filter', currentGuestbookFilter);
    if (currentGuestbookStatus !== 'all') params.set('status', currentGuestbookStatus);
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(`${GUESTBOOK_API_URL}?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch guestbook messages');
    const data = await response.json();
    return {
        messages: data.data || [],
        nextCursor: data.nextCursor || null,
        hasMore: data.hasMore || false
    };
}
async function guestbookLoadInitial() {
    if (!guestbookSection) return;
    const token = localStorage.getItem('authToken');
    if (!token) {
        if (guestbookForm) guestbookForm.style.display = 'none';
        const loginPrompt = document.getElementById('guestbook-login-prompt');
        if (loginPrompt) loginPrompt.style.display = 'block';
        if (guestbookList) guestbookList.innerHTML = '';
        if (guestbookPagination) guestbookPagination.style.display = 'none';
        return;
    }
    const gbLoader = '<div class="guestbook-loading"><div class="guestbook-loading-icon"><i class="fas fa-comment-dots"></i></div><div class="guestbook-loading-dots"><span></span><span></span><span></span></div><div class="guestbook-loading-text">加载留言中...</div></div>';
    if (guestbookList) guestbookList.innerHTML = gbLoader;
    try {
        const page = await guestbookFetchPage(null);
        guestbookCursorStack = [page];
        guestbookPageIndex = 0;
        renderGuestbook(page.messages);
        renderGuestbookPagination(page.hasMore, guestbookPageIndex > 0);
        if (guestbookForm) guestbookForm.style.display = 'block';
        const loginPrompt = document.getElementById('guestbook-login-prompt');
        if (loginPrompt) loginPrompt.style.display = 'none';
    } catch (error) {
        console.error('Error fetching guestbook:', error);
        if (guestbookList) guestbookList.innerHTML = '<p class="error-message">加载留言失败，请稍后重试</p>';
    }
}
function guestbookGoNext() {
    const currentPage = guestbookCursorStack[guestbookPageIndex];
    if (!currentPage || !currentPage.nextCursor) return;
    if (guestbookPageIndex + 1 < guestbookCursorStack.length) {
        guestbookPageIndex++;
        const page = guestbookCursorStack[guestbookPageIndex];
        renderGuestbook(page.messages);
        renderGuestbookPagination(page.hasMore, true);
        return;
    }
    if (guestbookList) guestbookList.innerHTML = '<div class="guestbook-loading"><div class="guestbook-loading-icon"><i class="fas fa-comment-dots"></i></div><div class="guestbook-loading-dots"><span></span><span></span><span></span></div><div class="guestbook-loading-text">加载留言中...</div></div>';
    guestbookFetchPage(currentPage.nextCursor).then(page => {
        guestbookCursorStack.push(page);
        if (guestbookCursorStack.length > MAX_CURSOR_STACK_PAGES) {
            guestbookCursorStack.shift();
        }
        guestbookPageIndex = Math.min(guestbookPageIndex + 1, guestbookCursorStack.length - 1);
        renderGuestbook(page.messages);
        renderGuestbookPagination(page.hasMore, true);
    }).catch(error => {
        console.error('Error fetching next page:', error);
        if (guestbookList) guestbookList.innerHTML = '<p class="error-message">加载下一页失败</p>';
    });
}
function guestbookGoPrev() {
    if (guestbookPageIndex <= 0) return;
    guestbookPageIndex--;
    const page = guestbookCursorStack[guestbookPageIndex];
    renderGuestbook(page.messages);
    renderGuestbookPagination(page.hasMore, guestbookPageIndex > 0);
}
async function handleGuestbookSubmit(e) {
    e.preventDefault();
    const content = guestbookContentInput.value.trim();
    if (!content) return;
    if (submitGuestbookBtn) {
        submitGuestbookBtn.disabled = true;
        submitGuestbookBtn.classList.add('btn-sending');
        submitGuestbookBtn.innerHTML = '<span class="send-label">发布中</span><span class="send-dot"></span><span class="send-dot"></span><span class="send-dot"></span>';
    }
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content })
        });
        const d = await response.json();
        if (response.ok) {
            const result = d;
            guestbookContentInput.value = '';
            const isAdmin = isGuestbookAdmin(window.currentUser);
            const isSuperAdmin = isGuestbookSuperAdmin(window.currentUser);
            showNotification(isAdmin ? '留言发布成功！' : '留言已提交，请耐心等待审核', 'success');
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
            const page = guestbookCursorStack[0];
            if (page && page.messages) {
                let insertIdx = 0;
                for (let i = 0; i < page.messages.length; i++) {
                    if (!page.messages[i].is_pinned) { insertIdx = i; break; }
                    insertIdx = i + 1;
                }
                page.messages.splice(insertIdx, 0, newMessage);
                if (page.messages.length > GUESTBOOK_PER_PAGE) {
                    page.messages.pop();
                }
                if (guestbookPageIndex === 0) {
                    renderGuestbook(page.messages);
                    renderGuestbookPagination(page.hasMore, false);
                }
            }
        } else {
            showNotification(d.error || '发布失败', 'error');
        }
    } catch (error) {
        console.error('Error posting guestbook:', error);
        showNotification('发布出错，请检查网络', 'error');
    } finally {
        if (submitGuestbookBtn) {
            submitGuestbookBtn.disabled = false;
            submitGuestbookBtn.classList.remove('btn-sending');
            submitGuestbookBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 提交';
        }
    }
}
async function handleGuestbookAction(id, action, btnElement) {
    if (isGbActionPending(id, action)) return;
    setGbActionPending(id, action);
    try {
        const token = localStorage.getItem('authToken');
        if (!token) { showNotification('请先登录', 'warning'); return; }
        if (btnElement && (action === 'like' || action === 'unlike')) {
            const icon = btnElement.querySelector('i');
            const countSpan = btnElement.querySelector('span');
            let count = parseInt(countSpan.textContent);
            if (action === 'like') {
                btnElement.classList.add('active');
                icon.classList.remove('far'); icon.classList.add('fas');
                countSpan.textContent = count + 1;
                btnElement.setAttribute('onclick', `unlikeGuestbook(${id}, this)`);
            } else {
                btnElement.classList.remove('active');
                icon.classList.remove('fas'); icon.classList.add('far');
                countSpan.textContent = Math.max(0, count - 1);
                btnElement.setAttribute('onclick', `likeGuestbook(${id}, this)`);
            }
        }
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id, action })
        });
        if (!response.ok) {
            if (btnElement && (action === 'like' || action === 'unlike')) {
                refreshGuestbook();
                showNotification('操作失败', 'error');
            } else {
                const d = await response.json();
                showNotification(d.error || '操作失败', 'error');
            }
        } else {
            if (action === 'like' || action === 'unlike') {
                const likes = getViewLikes(id);
                updateGuestbookCache(id, { likes: action === 'like' ? likes + 1 : Math.max(0, likes - 1), has_liked: action === 'like' });
            } else if (action === 'ban_user' || action === 'unban_user') {
                const d = await response.json();
                if (d.pending_approval) {
                    showNotification(d.message || '已提交请求，等待审批', 'info');
                } else {
                    updateGuestbookCache(id, { is_banned: action === 'ban_user' });
                    showNotification(action === 'ban_user' ? '用户已封禁' : '用户已解封', 'success');
                }
            } else if (action === 'reject') {
                updateGuestbookCache(id, { status: 'rejected', is_hidden: 1 });
                showNotification('留言已驳回', 'success');
            } else {
                let updates = {};
                switch (action) {
                    case 'hide': updates = { is_hidden: 1 }; break;
                    case 'unhide': updates = { is_hidden: 0 }; break;
                    case 'pin': updates = { is_pinned: 1 }; break;
                    case 'unpin': updates = { is_pinned: 0 }; break;
                    case 'resolve': updates = { status: 'resolved', reject_reason: null }; break;
                    case 'unresolve': updates = { status: 'unresolved', reject_reason: null }; break;
                    case 'unreject': updates = { status: 'unresolved', reject_reason: null, is_hidden: 0 }; break;
                }
                if (Object.keys(updates).length > 0) {
                    updateGuestbookCache(id, updates);
                }
                showNotification('操作成功', 'success');
            }
        }
    } catch (error) {
        console.error('Error handling guestbook action:', error);
        showNotification('操作出错', 'error');
        if (btnElement && (action === 'like' || action === 'unlike')) refreshGuestbook();
    } finally {
        clearGbActionPending(id, action);
    }
}
async function handleDeleteGuestbook(id) {
    if (isGbActionPending(id, 'delete')) return;
    const confirmed = await showConfirmation({ title: '删除留言', message: '确定要删除这条留言吗？', confirmText: '删除', confirmClass: 'confirm-btn-danger' });
    if (!confirmed) return;
    setGbActionPending(id, 'delete');
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${GUESTBOOK_API_URL}?id=${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
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
    } finally {
        clearGbActionPending(id, 'delete');
    }
}
async function handleReplySubmit(parentId, content) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content, parent_id: parentId })
        });
        if (response.ok) {
            const d = await response.json();
            const isAdmin = isGuestbookAdmin(window.currentUser);
            const isSuperAdmin = isGuestbookSuperAdmin(window.currentUser);
            showNotification('回复发布成功！', 'success');
            const newReply = {
                id: d.id,
                user_id: window.currentUser.id,
                nickname: window.currentUser.nickname || '匿名用户',
                content: content,
                parent_id: parentId,
                likes: 0,
                has_liked: false,
                is_hidden: 0,
                status: 'unresolved',
                reject_reason: null,
                resolve_note: null,
                created_at: new Date().toISOString(),
                role: window.currentUser.role,
                isAdmin: isAdmin,
                isSuperAdmin: isSuperAdmin
            };
            for (const page of guestbookCursorStack) {
                if (!page.messages) continue;
                const parent = page.messages.find(m => m.id === parentId);
                if (parent) {
                    if (!parent.replies) parent.replies = [];
                    parent.replies.push(newReply);
                    break;
                }
            }
            if (guestbookPageIndex >= 0) {
                const currentPage = guestbookCursorStack[guestbookPageIndex];
                if (currentPage && currentPage.messages) {
                    renderGuestbook(currentPage.messages);
                    renderGuestbookPagination(currentPage.hasMore, guestbookPageIndex > 0);
                }
            }
        } else {
            const d = await response.json();
            showNotification(d.error || '回复失败', 'error');
        }
    } catch (error) {
        console.error('Error posting reply:', error);
        showNotification('回复出错，请检查网络', 'error');
    }
}
function getViewLikes(id) {
    for (const page of guestbookCursorStack) {
        if (!page.messages) continue;
        for (const m of page.messages) {
            if (m.id === id) return m.likes || 0;
            if (m.replies) {
                const r = m.replies.find(r => r.id === id);
                if (r) return r.likes || 0;
            }
        }
    }
    return 0;
}
