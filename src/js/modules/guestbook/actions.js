window.changeGuestbookPage = function (direction) {
    const scrollTarget = document.querySelector('.guestbook-toolbar') || guestbookSection;
    if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (direction === 'next') guestbookGoNext();
    else if (direction === 'prev') guestbookGoPrev();
};
window.changeGuestbookSort = function (sortType) {
    if (currentGuestbookSort === sortType) return;
    currentGuestbookSort = sortType;
    document.querySelectorAll('.guestbook-sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === sortType);
    });
    refreshGuestbook();
};
window.changeGuestbookFilter = function (filter) {
    if (currentGuestbookFilter === filter) return;
    currentGuestbookFilter = filter;
    document.querySelectorAll('.guestbook-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    refreshGuestbook();
};
window.changeGuestbookStatus = function (status) {
    if (currentGuestbookStatus === status) return;
    currentGuestbookStatus = status;
    document.querySelectorAll('.guestbook-status-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    refreshGuestbook();
};
window.likeGuestbook = function (id, btnElement) {
    handleGuestbookAction(id, 'like', btnElement);
};
window.unlikeGuestbook = function (id, btnElement) {
    handleGuestbookAction(id, 'unlike', btnElement);
};
window.deleteGuestbook = function (id) {
    handleDeleteGuestbook(id);
};
window.toggleGuestbookVisibility = function (id, currentHiddenState) {
    const action = currentHiddenState ? 'unhide' : 'hide';
    handleGuestbookAction(id, action);
};
window.confirmBanUser = async function (id) {
    const confirmed = await showConfirmation({
        title: '封禁用户',
        message: '确定要封禁发布这条留言的用户吗？该用户将无法再使用网站功能。',
        confirmText: '封禁',
        confirmClass: 'confirm-btn-danger'
    });
    if (confirmed) {
        handleGuestbookAction(id, 'ban_user');
    }
};
window.confirmUnbanUser = async function (id) {
    const confirmed = await showConfirmation({
        title: '解封用户',
        message: '确定要解封这位用户吗？该用户将恢复使用网站功能的权限。',
        confirmText: '解封',
        confirmClass: 'confirm-btn-primary'
    });
    if (confirmed) {
        handleGuestbookAction(id, 'unban_user');
    }
};
window.rejectGuestbook = async function (id) {
    if (isGbActionPending(id, 'reject')) return;
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
    setGbActionPending(id, 'reject');
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
    } finally {
        clearGbActionPending(id, 'reject');
    }
};
window.resolveGuestbook = async function (id) {
    if (isGbActionPending(id, 'resolve')) return;
    let resolvePath = null;
    try {
        resolvePath = await showResolvePrompt();
    } catch (e) {
        return;
    }
    if (resolvePath === null) return;
    resolvePath = resolvePath ? resolvePath.trim() : null;
    setGbActionPending(id, 'resolve');
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
    } finally {
        clearGbActionPending(id, 'resolve');
    }
};
window.showReplyForm = function (parentId) {
    const formContainer = document.getElementById(`reply-form-${parentId}`);
    if (!formContainer) return;
    if (formContainer.style.display === 'block' && !formContainer.classList.contains('closing')) {
        hideReplyFormAnimated(formContainer);
        return;
    }
    document.querySelectorAll('.reply-form-container').forEach(el => {
        if (el.id !== `reply-form-${parentId}`) {
            hideReplyFormAnimated(el);
        }
    });
    formContainer.classList.remove('closing');
    formContainer.style.display = 'block';
    formContainer.style.animation = 'slideDown 0.25s ease forwards';
    const input = document.getElementById(`reply-input-${parentId}`);
    if (input) input.focus();
};
function hideReplyFormAnimated(el) {
    if (!el || el.classList.contains('closing')) return;
    el.classList.add('closing');
    el.style.animation = 'slideUp 0.2s ease forwards';
    const input = el.querySelector('textarea');
    if (input) input.value = '';
    el.addEventListener('animationend', function handler() {
        el.removeEventListener('animationend', handler);
        el.style.display = 'none';
        el.style.animation = '';
        el.classList.remove('closing');
    });
}
window.hideReplyForm = function (parentId) {
    const formContainer = document.getElementById(`reply-form-${parentId}`);
    if (formContainer) hideReplyFormAnimated(formContainer);
};
window.submitReply = async function (parentId) {
    const input = document.getElementById(`reply-input-${parentId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) {
        showNotification('回复内容不能为空', 'warning');
        return;
    }
    if (content.length > 500) {
        showNotification('回复内容过长（最多500字符）', 'warning');
        return;
    }
    const submitBtn = input.closest('.reply-form-wrapper').querySelector('.primary-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-sending');
        submitBtn.innerHTML = '<span class="send-label">发送中</span><span class="send-dot"></span><span class="send-dot"></span><span class="send-dot"></span>';
    }
    try {
        await handleReplySubmit(parentId, content);
        hideReplyForm(parentId);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-sending');
            submitBtn.innerHTML = '发送回复';
        }
    }
};

function updatePinnedCarousel() {
    const track = document.getElementById('guestbook-pinned-track');
    if (!track) return;
    track.style.transform = `translateX(-${pinnedCarouselIndex * 100}%)`;
    const dots = document.getElementById('guestbook-pinned-dots');
    if (dots) {
        dots.querySelectorAll('.guestbook-pinned-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === pinnedCarouselIndex);
        });
    }
}

function startPinnedCarousel() {
    stopPinnedCarousel();
    if (pinnedGuestbookMessages.length <= 1) return;
    pinnedCarouselTimer = setInterval(() => {
        pinnedCarouselIndex = (pinnedCarouselIndex + 1) % pinnedGuestbookMessages.length;
        updatePinnedCarousel();
    }, 5000);
}

function stopPinnedCarousel() {
    if (pinnedCarouselTimer) {
        clearInterval(pinnedCarouselTimer);
        pinnedCarouselTimer = null;
    }
}

window.pinnedCarouselPrev = function () {
    if (pinnedGuestbookMessages.length <= 1) return;
    pinnedCarouselIndex = (pinnedCarouselIndex - 1 + pinnedGuestbookMessages.length) % pinnedGuestbookMessages.length;
    updatePinnedCarousel();
    stopPinnedCarousel();
    startPinnedCarousel();
};

window.pinnedCarouselNext = function () {
    if (pinnedGuestbookMessages.length <= 1) return;
    pinnedCarouselIndex = (pinnedCarouselIndex + 1) % pinnedGuestbookMessages.length;
    updatePinnedCarousel();
    stopPinnedCarousel();
    startPinnedCarousel();
};

window.pinnedCarouselGoTo = function (index) {
    pinnedCarouselIndex = index;
    updatePinnedCarousel();
    stopPinnedCarousel();
    startPinnedCarousel();
};
