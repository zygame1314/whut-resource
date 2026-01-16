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
document.addEventListener('DOMContentLoaded', () => {
    initGuestbook();
    document.addEventListener('authSuccess', () => {
        refreshGuestbook(currentGuestbookPage);
    });
});
