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
    document.addEventListener('authSuccess', () => refreshGuestbook());
});
