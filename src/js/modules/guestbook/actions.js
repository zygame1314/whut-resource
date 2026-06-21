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
    cleanupReplyAnimation(formContainer);
    formContainer.style.display = 'block';
    formContainer.offsetHeight;
    formContainer.style.animation = 'slideDown 0.25s ease forwards';
    const input = document.getElementById(`reply-input-${parentId}`);
    if (input) input.focus();
};
function cleanupReplyAnimation(el) {
    if (el._replyAnimHandler) {
        el.removeEventListener('animationend', el._replyAnimHandler);
        el._replyAnimHandler = null;
    }
    el.classList.remove('closing');
    el.style.animation = '';
}
function hideReplyFormAnimated(el) {
    if (!el || el.classList.contains('closing')) return;
    cleanupReplyAnimation(el);
    el.classList.add('closing');
    el.style.animation = 'slideUp 0.2s ease forwards';
    const input = el.querySelector('textarea');
    if (input) input.value = '';
    const handler = function () {
        el.removeEventListener('animationend', handler);
        el._replyAnimHandler = null;
        el.style.display = 'none';
        el.style.animation = '';
        el.classList.remove('closing');
    };
    el._replyAnimHandler = handler;
    el.addEventListener('animationend', handler);
}
window.hideReplyForm = function (parentId) {
    const formContainer = document.getElementById(`reply-form-${parentId}`);
    if (formContainer) hideReplyFormAnimated(formContainer);
};
window.submitReply = async function (parentId) {
    const input = document.getElementById(`reply-input-${parentId}`);
    if (!input) return;
    const submitBtn = input.closest('.reply-form-wrapper').querySelector('.primary-btn');
    if (submitBtn && submitBtn.disabled) return;
    const content = input.value.trim();
    if (!content) {
        showNotification('回复内容不能为空', 'warning');
        return;
    }
    if (content.length > 500) {
        showNotification('回复内容过长（最多500字符）', 'warning');
        return;
    }
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

let _pinnedRestartTimer = null;
let _pinnedScrollPauseTimer = null;
let _pinnedObserver = null;
let _pinnedScrollBound = false;
let _pinnedVisible = false;
function startPinnedCarousel() {
    stopPinnedCarousel();
    if (pinnedGuestbookMessages.length <= 1) return;
    pinnedCarouselTimer = setInterval(() => {
        const nextIndex = (pinnedCarouselIndex + 1) % pinnedGuestbookMessages.length;
        pinnedCarouselIndex = nextIndex;
        updatePinnedCarouselView(1);
    }, 5000);
}

function stopPinnedCarousel() {
    if (pinnedCarouselTimer) {
        clearInterval(pinnedCarouselTimer);
        pinnedCarouselTimer = null;
    }
}

function pausePinnedCarouselForScroll() {
    if (!_pinnedVisible) return;
    stopPinnedCarousel();
    clearTimeout(_pinnedScrollPauseTimer);
    _pinnedScrollPauseTimer = setTimeout(startPinnedCarousel, 1500);
}

function bindPinnedScrollListener() {
    if (_pinnedScrollBound) return;
    _pinnedScrollBound = true;
    window.addEventListener('scroll', pausePinnedCarouselForScroll, { passive: true });
}

function initPinnedCarouselObserver() {
    const pinnedArea = document.getElementById('guestbook-pinned-area');
    if (!pinnedArea || _pinnedObserver) return;
    _pinnedObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            _pinnedVisible = entry.isIntersecting;
            if (entry.isIntersecting) {
                startPinnedCarousel();
                bindPinnedScrollListener();
            } else {
                stopPinnedCarousel();
            }
        }
    }, { threshold: 0.1 });
    _pinnedObserver.observe(pinnedArea);
}

window.pinnedCarouselPrev = function () {
    if (pinnedGuestbookMessages.length <= 1) return;
    pinnedCarouselIndex = (pinnedCarouselIndex - 1 + pinnedGuestbookMessages.length) % pinnedGuestbookMessages.length;
    updatePinnedCarouselView(-1);
    stopPinnedCarousel();
    startPinnedCarousel();
};

window.pinnedCarouselNext = function () {
    if (pinnedGuestbookMessages.length <= 1) return;
    pinnedCarouselIndex = (pinnedCarouselIndex + 1) % pinnedGuestbookMessages.length;
    updatePinnedCarouselView(1);
    stopPinnedCarousel();
    startPinnedCarousel();
};

window.pinnedCarouselGoTo = function (index) {
    if (index === pinnedCarouselIndex) return;
    const direction = index > pinnedCarouselIndex ? 1 : -1;
    pinnedCarouselIndex = index;
    updatePinnedCarouselView(direction);
    stopPinnedCarousel();
    startPinnedCarousel();
};
window.loadMoreReplies = async function (parentId) {
    const { msg } = findParentMessage(parentId);
    if (!msg) return;
    if (!msg.replyMeta || !msg.replyMeta.hasMore) return;
    const cursor = msg.replyMeta.replyCursor;
    const loadMoreBtn = document.querySelector(`#replies-${parentId} .guestbook-replies-load-more`);
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
    }
    try {
        const page = await guestbookFetchMoreReplies(parentId, cursor);
        appendRepliesToCache(parentId, page.replies, page.nextCursor, page.hasMore, page.total);
        appendRepliesToDom(parentId);
    } catch (e) {
        console.error('加载更多回复失败:', e);
        showNotification('加载更多回复失败', 'error');
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> 加载更多回复';
        }
    }
};
