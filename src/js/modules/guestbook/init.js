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
    if (guestbookList) {
        guestbookList.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                const replyInput = e.target.closest('.reply-form-wrapper')?.querySelector('textarea');
                if (replyInput && e.target === replyInput) {
                    e.preventDefault();
                    const formContainer = e.target.closest('.reply-form-container');
                    if (formContainer) {
                        const parentId = parseInt(formContainer.id.replace('reply-form-', ''));
                        if (parentId) {
                            submitReply(parentId);
                        }
                    }
                }
            }
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
    initGuestbook();
    document.addEventListener('authSuccess', () => {
        refreshGuestbook(currentGuestbookPage);
    });
});
