function initGuestbook() {
    if (guestbookForm) guestbookForm.addEventListener('submit', handleGuestbookSubmit);
    if (guestbookContentInput) {
        const charCurrent = document.getElementById('char-current');
        if (charCurrent) {
            const updateCharCount = () => { charCurrent.textContent = guestbookContentInput.value.length; };
            guestbookContentInput.addEventListener('input', updateCharCount);
            updateCharCount();
        }
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        refreshGuestbook();
    } else if (guestbookList) {
        guestbookList.innerHTML = '<div class="guestbook-loading"><div class="guestbook-loading-icon"><i class="fas fa-comment-dots"></i></div><div class="guestbook-loading-dots"><span></span><span></span><span></span></div><div class="guestbook-loading-text">加载留言中...</div></div>';
    }
    if (guestbookList) {
        guestbookList.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                const replyInput = e.target.closest('.reply-form-wrapper')?.querySelector('textarea');
                if (replyInput && e.target === replyInput) {
                    e.preventDefault();
                    const formContainer = e.target.closest('.reply-form-container');
                    if (formContainer) {
                        const parentId = parseInt(formContainer.id.replace('reply-form-', ''));
                        if (parentId) submitReply(parentId);
                    }
                }
            }
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
    initGuestbook();
    document.addEventListener('authSuccess', () => {
        refreshGuestbook();
        initTodoPanel();
        if (typeof initDownloadHistoryPanel === 'function') initDownloadHistoryPanel();
        if (typeof initFavoritesPanel === 'function') initFavoritesPanel();
    });
    document.addEventListener('siteGuestbookUpdate', (e) => {
        const d = e.detail;
        if (!d || !d.guestbookId) return;
        if (typeof updateGuestbookCache !== 'function') return;
        if (d.action === 'delete') {
            removeFromGuestbookCache(d.guestbookId);
        } else if (d.action === 'reply_added' || d.action === 'new_message') {
            if (d.action === 'reply_added' && recentLocalReply(d.guestbookId)) return;
            refreshGuestbook();
        } else {
            const updates = {};
            if (d.status != null) updates.status = d.status;
            if (d.is_hidden != null) updates.is_hidden = d.is_hidden;
            if (d.is_pinned != null) {
                refreshGuestbook();
                return;
            }
            if (Object.keys(updates).length > 0) updateGuestbookCache(d.guestbookId, updates);
        }
    });
});

const _localReplyLog = new Map();
function recentLocalReply(parentId) {
    const t = _localReplyLog.get(parentId);
    return t && (Date.now() - t < 5000);
}
