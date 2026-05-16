const ANNOUNCEMENTS_API_URL = API_ENDPOINTS.announcements;
const announcementSection = document.getElementById('announcement-section');
const announcementContent = document.getElementById('announcement-content');
const manageAnnouncementsBtn = document.getElementById('manage-announcements-btn');
const announcementModal = document.getElementById('announcement-modal');
const closeAnnouncementModalBtn = document.getElementById('close-announcement-modal');
const announcementList = document.getElementById('announcement-list');
const addAnnouncementBtn = document.getElementById('add-announcement-btn');
const announcementForm = document.getElementById('announcement-form');
const formTitle = document.getElementById('form-title');
const announcementIdInput = document.getElementById('announcement-id');
const announcementTitleInput = document.getElementById('announcement-title');
const announcementTextInput = document.getElementById('announcement-text');
const announcementPublishedInput = document.getElementById('announcement-published');
const saveAnnouncementBtn = document.getElementById('save-announcement-btn');
const cancelAnnouncementBtn = document.getElementById('cancel-announcement-btn');
const editModeBtn = document.getElementById('edit-mode-btn');
const previewModeBtn = document.getElementById('preview-mode-btn');
const editArea = document.getElementById('edit-area');
const previewArea = document.getElementById('preview-area');
const announcementViewModal = document.getElementById('announcement-view-modal');
const closeAnnouncementViewModalBtn = document.getElementById('close-announcement-view-modal');
const announcementViewTitle = document.getElementById('announcement-view-title');
const announcementViewContent = document.getElementById('announcement-view-content');
const announcementViewConfirmBtn = document.getElementById('announcement-view-confirm');
const announcementViewPrevBtn = document.getElementById('announcement-view-prev');
const announcementViewNextBtn = document.getElementById('announcement-view-next');
const announcementViewJumpInput = document.getElementById('announcement-view-jump-input');
const announcementViewTotal = document.getElementById('announcement-view-total');
const announcementHideWrap = document.getElementById('announcement-hide-wrap');
const announcementHide7daysInput = document.getElementById('announcement-hide-7days');
let allAnnouncements = [];
let allAnnouncementsCache = [];
let currentAnnouncementPage = 1;
let totalAnnouncementPages = 1;
let currentAnnouncementItemIndex = 0;
let isAnnouncementPageSwitching = false;
let isAnnouncementItemSwitching = false;
const ANNOUNCEMENTS_PER_PAGE = 5;
const ANNOUNCEMENT_IDLE_RESUME_DELAY = 9000;
const ANNOUNCEMENT_AUTO_SCROLL_INTERVAL = 45;
const ANNOUNCEMENT_AUTO_SCROLL_STEP = 1;
const ANNOUNCEMENT_AFTER_SCROLL_PAUSE = 2000;
const ANNOUNCEMENT_POPUP_HIDE_DAYS = 7;
const ANNOUNCEMENT_POPUP_HIDE_UNTIL_KEY = 'announcementPopupHideUntil';
const ANNOUNCEMENT_POPUP_LAST_SIGNATURE_KEY = 'announcementPopupLastSignature';
let announcementAutoSwitchTimer = null;
let announcementAutoScrollTimer = null;
let announcementAutoResumeTimer = null;
let announcementInteractionBound = false;
let isAnnouncementInteractionActive = false;
let hasTriedEntryPopup = false;
let currentViewedAnnouncement = null;
let announcementReachedBottomAt = 0;
let isAnnouncementScrollingBackUp = false;
let announcementItemAnimId = 0;
let fetchAnnouncementsRequestId = 0;
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayAnnouncements(currentAnnouncementPage);
    initAnnouncementManager();
});
document.addEventListener('authSuccess', () => {
    fetchAndDisplayAnnouncements(currentAnnouncementPage);
});
async function fetchAndDisplayAnnouncements(page = 1) {
    const requestId = ++fetchAnnouncementsRequestId;
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return;
        }
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        if (allAnnouncementsCache.length === 0 || page === 1) {
            const response = await fetch(`${ANNOUNCEMENTS_API_URL}`, { headers });
            if (!response.ok) throw new Error('Failed to fetch announcements');
            const data = await response.json();
            if (requestId !== fetchAnnouncementsRequestId) return;
            allAnnouncementsCache = data.data || [];
        }
        const startIndex = (page - 1) * ANNOUNCEMENTS_PER_PAGE;
        const endIndex = startIndex + ANNOUNCEMENTS_PER_PAGE;
        const announcements = allAnnouncementsCache.slice(startIndex, endIndex);
        if (requestId !== fetchAnnouncementsRequestId) return;
        allAnnouncements = announcements;
        currentAnnouncementItemIndex = 0;
        announcementReachedBottomAt = 0;
        currentAnnouncementPage = page;
        totalAnnouncementPages = Math.ceil(allAnnouncementsCache.length / ANNOUNCEMENTS_PER_PAGE) || 1;
        renderAnnouncements(announcements);
        setupAnnouncementAutomation();
        maybeShowEntryAnnouncementPopup();
        checkAdminPermission();
    } catch (error) {
        console.error('Error fetching announcements:', error);
        announcementSection.style.display = 'none';
    }
}
function renderAnnouncements(announcements) {
    if (!announcements || announcements.length === 0) {
        announcementSection.style.display = 'none';
        stopAnnouncementAutomation();
        return;
    }
    if (announcements.length === 0) {
        announcementSection.style.display = 'none';
        stopAnnouncementAutomation();
    } else {
        announcementSection.style.display = 'block';
        const hasMultipleAnnouncements = announcements.length > 1;
        let html = announcements.map((a, index) => `
            <div class="announcement-item" data-announcement-index="${index}" ${index === currentAnnouncementItemIndex ? '' : 'style="display:none;"'}>
                <span class="announcement-title">${escapeHtml(a.title)}</span>
                <div class="announcement-text markdown-body">${typeof renderMarkdown === 'function' ? renderMarkdown(a.content) : DOMPurify.sanitize(marked.parse(a.content, { breaks: true }))}</div>
                <div class="announcement-meta">
                    <span><i class="far fa-clock"></i> 发布时间：${formatAnnouncementDateLocal(a.created_at)}</span>
                    <button class="announcement-detail-btn" onclick="openAnnouncementDetail(${a.id})">
                        <i class="fas fa-up-right-and-down-left-from-center"></i> 查看详情
                    </button>
                </div>
            </div>
        `).join('');
        if (hasMultipleAnnouncements) {
            html += `
                <div class="announcement-mini-nav" aria-label="公告切换">
                    <button class="secondary-btn announcement-mini-btn" onclick="changeAnnouncementItem(-1)" aria-label="上一条公告">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <div id="announcement-dots" class="announcement-dots" role="tablist" aria-label="公告条目列表">
                        ${announcements.map((_, index) => `<button class="announcement-dot ${index === currentAnnouncementItemIndex ? 'active' : ''}" onclick="jumpAnnouncementItem(${index})" aria-label="第${index + 1}条公告"></button>`).join('')}
                    </div>
                    <button class="secondary-btn announcement-mini-btn" onclick="changeAnnouncementItem(1)" aria-label="下一条公告">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
        if (totalAnnouncementPages > 1) {
            html += `
                <div class="announcement-page-mini-nav" aria-label="公告分页">
                    <button class="secondary-btn announcement-mini-btn" onclick="changeAnnouncementPage(${currentAnnouncementPage - 1})" ${currentAnnouncementPage === 1 ? 'disabled' : ''} aria-label="上一页公告">
                        <i class="fas fa-angle-left"></i>
                    </button>
                    <span class="announcement-page-indicator">${currentAnnouncementPage} / ${totalAnnouncementPages}</span>
                    <button class="secondary-btn announcement-mini-btn" onclick="changeAnnouncementPage(${currentAnnouncementPage + 1})" ${currentAnnouncementPage === totalAnnouncementPages ? 'disabled' : ''} aria-label="下一页公告">
                        <i class="fas fa-angle-right"></i>
                    </button>
                </div>
            `;
        }
        announcementContent.innerHTML = html;
        updateAnnouncementItemView();
    }
}
function updateAnnouncementItemView(direction = 0) {
    const items = announcementContent ? announcementContent.querySelectorAll('.announcement-item[data-announcement-index]') : [];
    if (!items.length) return;
    if (currentAnnouncementItemIndex < 0 || currentAnnouncementItemIndex >= items.length) {
        currentAnnouncementItemIndex = 0;
    }
    const dots = announcementContent ? announcementContent.querySelectorAll('.announcement-dot') : [];
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentAnnouncementItemIndex);
    });
    if (isAnnouncementItemSwitching) {
        announcementItemAnimId++;
        items.forEach(item => {
            item.classList.remove('slide-out-left', 'slide-in-right', 'slide-out-right', 'slide-in-left');
        });
        items.forEach((item, index) => {
            item.style.display = index === currentAnnouncementItemIndex ? 'block' : 'none';
        });
        isAnnouncementItemSwitching = false;
        return;
    }
    if (direction === 0) {
        items.forEach((item, index) => {
            item.style.display = index === currentAnnouncementItemIndex ? 'block' : 'none';
        });
        return;
    }
    announcementItemAnimId++;
    const currentAnimId = announcementItemAnimId;
    isAnnouncementItemSwitching = true;
    const visibleItems = [...items].filter(item => item.style.display !== 'none');
    const currentItem = visibleItems[0];
    const nextItem = items[currentAnnouncementItemIndex];
    if (!currentItem || !nextItem || currentItem === nextItem) {
        items.forEach((item, index) => {
            item.style.display = index === currentAnnouncementItemIndex ? 'block' : 'none';
        });
        isAnnouncementItemSwitching = false;
        return;
    }
    const outClass = direction > 0 ? 'slide-out-left' : 'slide-out-right';
    const inClass = direction > 0 ? 'slide-in-right' : 'slide-in-left';
    currentItem.classList.add(outClass);
    setTimeout(() => {
        if (announcementItemAnimId !== currentAnimId) return;
        currentItem.style.display = 'none';
        currentItem.classList.remove(outClass);
        nextItem.style.display = 'block';
        nextItem.classList.add(inClass);
        setTimeout(() => {
            if (announcementItemAnimId !== currentAnimId) return;
            nextItem.classList.remove(inClass);
            isAnnouncementItemSwitching = false;
        }, 250);
    }, 250);
}
function changeAnnouncementItemInternal(direction, options = {}) {
    const { fromAuto = false } = options;
    const itemCount = allAnnouncements.length;
    if (itemCount <= 1) return false;
    if (!fromAuto) {
        markAnnouncementInteracted();
    }
    currentAnnouncementItemIndex = (currentAnnouncementItemIndex + direction + itemCount) % itemCount;
    updateAnnouncementItemView(direction);
    resetAnnouncementScrollProgress(true);
    return direction > 0 && currentAnnouncementItemIndex === 0;
}
window.changeAnnouncementItem = function (direction) {
    changeAnnouncementItemInternal(direction, { fromAuto: false });
};
window.jumpAnnouncementItem = function (targetIndex) {
    const itemCount = allAnnouncements.length;
    if (itemCount <= 1) return;
    if (targetIndex < 0 || targetIndex >= itemCount) return;
    markAnnouncementInteracted();
    const direction = targetIndex > currentAnnouncementItemIndex ? 1 : -1;
    currentAnnouncementItemIndex = targetIndex;
    updateAnnouncementItemView(direction);
    resetAnnouncementScrollProgress(true);
};
window.openAnnouncementDetail = function (id) {
    const announcement = allAnnouncementsCache.find(a => a.id == id) || allAnnouncements.find(a => a.id == id);
    if (!announcement) return;
    openAnnouncementViewModal(announcement, { fromEntry: false });
};
async function changeAnnouncementPageInternal(page, options = {}) {
    const { fromAuto = false } = options;
    if (page < 1 || page > totalAnnouncementPages) return;
    if (isAnnouncementPageSwitching) return;
    isAnnouncementPageSwitching = true;
    if (!fromAuto) {
        markAnnouncementInteracted();
    }
    try {
        announcementContent.classList.add('page-fade-out');
        await new Promise(resolve => setTimeout(resolve, 200));
        announcementContent.classList.remove('page-fade-out');
        announcementContent.style.opacity = '0';
        await fetchAndDisplayAnnouncements(page);
        announcementContent.style.opacity = '';
        announcementContent.classList.add('page-fade-in');
        await new Promise(resolve => setTimeout(resolve, 250));
        announcementContent.classList.remove('page-fade-in');
    } finally {
        isAnnouncementPageSwitching = false;
    }
}
window.changeAnnouncementPage = function (page) {
    changeAnnouncementPageInternal(page, { fromAuto: false });
};
function checkAdminPermission() {
    if (window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin')) {
        if (manageAnnouncementsBtn) {
            manageAnnouncementsBtn.style.display = 'flex';
        }
        if (announcementSection.style.display === 'none') {
            announcementSection.style.display = 'block';
            announcementContent.innerHTML = '<p class="text-muted" style="text-align:center; padding: 1rem;">暂无已发布公告。</p>';
        }
    }
}
function initAnnouncementManager() {
    if (manageAnnouncementsBtn) {
        manageAnnouncementsBtn.addEventListener('click', openAnnouncementModal);
    }
    if (closeAnnouncementModalBtn) {
        closeAnnouncementModalBtn.addEventListener('click', () => {
            announcementModal.classList.remove('visible');
        });
    }
    if (addAnnouncementBtn) {
        addAnnouncementBtn.addEventListener('click', () => {
            showAnnouncementForm();
        });
    }
    if (cancelAnnouncementBtn) {
        cancelAnnouncementBtn.addEventListener('click', () => {
            hideAnnouncementForm();
        });
    }
    if (saveAnnouncementBtn) {
        saveAnnouncementBtn.addEventListener('click', saveAnnouncement);
    }
    if (editModeBtn && previewModeBtn) {
        editModeBtn.addEventListener('click', () => switchTab('edit'));
        previewModeBtn.addEventListener('click', () => switchTab('preview'));
    }
    if (closeAnnouncementViewModalBtn) {
        closeAnnouncementViewModalBtn.addEventListener('click', handleAnnouncementViewConfirm);
    }
    if (announcementViewConfirmBtn) {
        announcementViewConfirmBtn.addEventListener('click', handleAnnouncementViewConfirm);
    }
    if (announcementViewPrevBtn) {
        announcementViewPrevBtn.addEventListener('click', () => switchAnnouncementInView(-1));
    }
    if (announcementViewNextBtn) {
        announcementViewNextBtn.addEventListener('click', () => switchAnnouncementInView(1));
    }
    if (announcementViewJumpInput) {
        announcementViewJumpInput.addEventListener('change', handleAnnouncementViewJumpChange);
        announcementViewJumpInput.addEventListener('blur', handleAnnouncementViewJumpChange);
        announcementViewJumpInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleAnnouncementViewJumpChange();
                announcementViewJumpInput.blur();
            }
        });
    }
    if (announcementViewModal) {
        announcementViewModal.addEventListener('click', (event) => {
            if (event.target === announcementViewModal) {
                handleAnnouncementViewConfirm();
            }
        });
    }
    document.addEventListener('keydown', handleAnnouncementViewKeydown);
    bindAnnouncementInteractionEvents();
}
function maybeShowEntryAnnouncementPopup() {
    if (hasTriedEntryPopup) return;
    hasTriedEntryPopup = true;
    const latestAnnouncement = getLatestAnnouncement();
    if (!latestAnnouncement) return;
    const signature = getAnnouncementSignature(latestAnnouncement);
    const hideUntil = Number(localStorage.getItem(ANNOUNCEMENT_POPUP_HIDE_UNTIL_KEY) || 0);
    const lastSignature = localStorage.getItem(ANNOUNCEMENT_POPUP_LAST_SIGNATURE_KEY) || '';
    const now = Date.now();
    const shouldShowForNewAnnouncement = signature && signature !== lastSignature;
    const shouldShowByTime = now >= hideUntil;
    if (shouldShowForNewAnnouncement || shouldShowByTime) {
        openAnnouncementViewModal(latestAnnouncement, { fromEntry: true });
    }
}
function getLatestAnnouncement() {
    if (!allAnnouncementsCache.length) return null;
    return [...allAnnouncementsCache].sort((left, right) => {
        const leftTime = parseAnnouncementDate(left.created_at).getTime();
        const rightTime = parseAnnouncementDate(right.created_at).getTime();
        return rightTime - leftTime;
    })[0] || allAnnouncementsCache[0];
}
function getAnnouncementSignature(announcement) {
    if (!announcement) return '';
    return `${announcement.id || ''}-${announcement.created_at || ''}-${announcement.updated_at || ''}`;
}
function openAnnouncementViewModal(announcement, options = {}) {
    const { fromEntry = false, preserveHideChoice = false } = options;
    if (!announcementViewModal || !announcementViewContent || !announcementViewTitle) return;
    currentViewedAnnouncement = announcement;
    const titleText = fromEntry ? '网站公告' : '公告详情';
    announcementViewTitle.textContent = titleText;
    const bodyHtml = typeof renderMarkdown === 'function'
        ? renderMarkdown(announcement.content || '')
        : DOMPurify.sanitize(marked.parse(announcement.content || '', { breaks: true }));
    announcementViewContent.innerHTML = `
        <h3 class="announcement-title">${escapeHtml(announcement.title || '未命名公告')}</h3>
        <div class="announcement-meta" style="margin-bottom: 0.75rem;">
            <span><i class="far fa-clock"></i> 发布时间：${formatAnnouncementDateLocal(announcement.created_at)}</span>
        </div>
        <div class="announcement-text markdown-body" style="max-height: none;">
            ${bodyHtml}
        </div>
    `;
    if (announcementHideWrap) {
        announcementHideWrap.style.display = fromEntry ? 'inline-flex' : 'none';
    }
    if (announcementHide7daysInput && !preserveHideChoice) {
        announcementHide7daysInput.checked = false;
    }
    updateAnnouncementViewNavState();
    announcementViewModal.dataset.fromEntry = fromEntry ? '1' : '0';
    announcementViewModal.classList.add('visible');
    markAnnouncementInteracted();
}
function switchAnnouncementInView(direction) {
    if (!currentViewedAnnouncement || !Array.isArray(allAnnouncementsCache) || allAnnouncementsCache.length <= 1) return;
    const currentIndex = allAnnouncementsCache.findIndex(item => item.id == currentViewedAnnouncement.id);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + allAnnouncementsCache.length) % allAnnouncementsCache.length;
    const fromEntry = announcementViewModal && announcementViewModal.dataset.fromEntry === '1';
    const hideChecked = !!(announcementHide7daysInput && announcementHide7daysInput.checked);
    openAnnouncementViewModal(allAnnouncementsCache[nextIndex], { fromEntry, preserveHideChoice: hideChecked });
}
function updateAnnouncementViewNavState() {
    const canSwitch = Array.isArray(allAnnouncementsCache) && allAnnouncementsCache.length > 1;
    const total = Array.isArray(allAnnouncementsCache) ? allAnnouncementsCache.length : 0;
    const currentIndex = total > 0 && currentViewedAnnouncement
        ? allAnnouncementsCache.findIndex(item => item.id == currentViewedAnnouncement.id)
        : -1;
    if (announcementViewPrevBtn) {
        announcementViewPrevBtn.disabled = !canSwitch;
    }
    if (announcementViewNextBtn) {
        announcementViewNextBtn.disabled = !canSwitch;
    }
    const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 1;
    const displayTotal = total > 0 ? total : 1;
    if (announcementViewJumpInput) {
        announcementViewJumpInput.max = String(displayTotal);
        announcementViewJumpInput.value = String(displayIndex);
    }
    if (announcementViewTotal) {
        announcementViewTotal.textContent = String(displayTotal);
    }
}
function handleAnnouncementViewJumpChange() {
    if (!announcementViewJumpInput || !Array.isArray(allAnnouncementsCache) || allAnnouncementsCache.length === 0) return;
    const total = allAnnouncementsCache.length;
    const parsed = Number.parseInt(announcementViewJumpInput.value, 10);
    const nextIndex = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 1), total) - 1;
    const targetAnnouncement = allAnnouncementsCache[nextIndex];
    if (!targetAnnouncement) return;
    const fromEntry = announcementViewModal && announcementViewModal.dataset.fromEntry === '1';
    const hideChecked = !!(announcementHide7daysInput && announcementHide7daysInput.checked);
    openAnnouncementViewModal(targetAnnouncement, { fromEntry, preserveHideChoice: hideChecked });
}
function handleAnnouncementViewKeydown(event) {
    if (!announcementViewModal || !announcementViewModal.classList.contains('visible')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        handleAnnouncementViewConfirm();
        return;
    }
    const targetTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    const isInputLike = targetTag === 'input' || targetTag === 'textarea' || (event.target && event.target.isContentEditable);
    if (isInputLike) return;
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        switchAnnouncementInView(-1);
        return;
    }
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        switchAnnouncementInView(1);
    }
}
function handleAnnouncementViewConfirm() {
    if (announcementViewModal && announcementViewModal.dataset.fromEntry === '1' && currentViewedAnnouncement) {
        const signature = getAnnouncementSignature(currentViewedAnnouncement);
        localStorage.setItem(ANNOUNCEMENT_POPUP_LAST_SIGNATURE_KEY, signature);
        if (announcementHide7daysInput && announcementHide7daysInput.checked) {
            const hideUntil = Date.now() + ANNOUNCEMENT_POPUP_HIDE_DAYS * 24 * 60 * 60 * 1000;
            localStorage.setItem(ANNOUNCEMENT_POPUP_HIDE_UNTIL_KEY, String(hideUntil));
        } else {
            localStorage.removeItem(ANNOUNCEMENT_POPUP_HIDE_UNTIL_KEY);
        }
    }
    closeAnnouncementViewModal();
}
function closeAnnouncementViewModal() {
    if (!announcementViewModal) return;
    announcementViewModal.classList.remove('visible');
}
function bindAnnouncementInteractionEvents() {
    if (announcementInteractionBound || !announcementSection) return;
    announcementInteractionBound = true;
    const interactionEvents = ['mouseenter', 'mousemove', 'wheel', 'touchstart', 'pointerdown', 'focusin', 'keydown'];
    interactionEvents.forEach(eventName => {
        announcementSection.addEventListener(eventName, markAnnouncementInteracted, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAnnouncementAutomation();
            return;
        }
        if (!isAnnouncementInteractionActive) {
            setupAnnouncementAutomation();
        }
    });
}
function markAnnouncementInteracted() {
    isAnnouncementInteractionActive = true;
    stopAnnouncementAutomation();
    if (announcementAutoResumeTimer) {
        clearTimeout(announcementAutoResumeTimer);
    }
    announcementAutoResumeTimer = setTimeout(() => {
        isAnnouncementInteractionActive = false;
        setupAnnouncementAutomation();
    }, ANNOUNCEMENT_IDLE_RESUME_DELAY);
}
function setupAnnouncementAutomation() {
    stopAnnouncementAutomation();
    if (!canRunAnnouncementAutomation()) return;
    startAnnouncementAutoScroll();
}
function stopAnnouncementAutomation() {
    if (announcementAutoSwitchTimer) {
        clearInterval(announcementAutoSwitchTimer);
        announcementAutoSwitchTimer = null;
    }
    stopAnnouncementAutoScroll();
}
function canRunAnnouncementAutomation() {
    if (!announcementSection || announcementSection.style.display === 'none') return false;
    if (!announcementContent || !announcementContent.children.length) return false;
    if (document.hidden) return false;
    if (announcementModal && announcementModal.classList.contains('visible')) return false;
    if (announcementViewModal && announcementViewModal.classList.contains('visible')) return false;
    return !isAnnouncementInteractionActive;
}
function startAnnouncementAutoScroll() {
    if (announcementAutoScrollTimer) return;
    announcementAutoScrollTimer = setInterval(() => {
        if (!canRunAnnouncementAutomation()) return;
        const currentItem = announcementContent.querySelector(`.announcement-item[data-announcement-index="${currentAnnouncementItemIndex}"]`);
        if (!currentItem) return;
        const textBlock = currentItem.querySelector('.announcement-text');
        if (!textBlock) return;
        const hasOverflow = textBlock.scrollHeight > textBlock.clientHeight + 2;
        if (isAnnouncementScrollingBackUp) {
            if (hasOverflow && textBlock.scrollTop > 0) {
                textBlock.scrollTop = Math.max(textBlock.scrollTop - ANNOUNCEMENT_AUTO_SCROLL_STEP, 0);
                return;
            }
            isAnnouncementScrollingBackUp = false;
            advanceAnnouncementAfterScrollPause();
            return;
        }
        if (hasOverflow) {
            const atBottom = textBlock.scrollTop + textBlock.clientHeight >= textBlock.scrollHeight - 2;
            if (!atBottom) {
                textBlock.scrollTop = Math.min(textBlock.scrollTop + ANNOUNCEMENT_AUTO_SCROLL_STEP, textBlock.scrollHeight - textBlock.clientHeight);
                announcementReachedBottomAt = 0;
                return;
            }
        }
        if (!announcementReachedBottomAt) {
            announcementReachedBottomAt = Date.now();
            return;
        }
        if (Date.now() - announcementReachedBottomAt >= ANNOUNCEMENT_AFTER_SCROLL_PAUSE) {
            announcementReachedBottomAt = 0;
            if (hasOverflow) {
                isAnnouncementScrollingBackUp = true;
            } else {
                advanceAnnouncementAfterScrollPause();
            }
        }
    }, ANNOUNCEMENT_AUTO_SCROLL_INTERVAL);
}
function stopAnnouncementAutoScroll() {
    if (announcementAutoScrollTimer) {
        clearInterval(announcementAutoScrollTimer);
        announcementAutoScrollTimer = null;
    }
    announcementReachedBottomAt = 0;
    isAnnouncementScrollingBackUp = false;
}
function resetAnnouncementScrollProgress(resetScrollTop = false) {
    announcementReachedBottomAt = 0;
    isAnnouncementScrollingBackUp = false;
    if (!resetScrollTop || !announcementContent) return;
    const currentItem = announcementContent.querySelector(`.announcement-item[data-announcement-index="${currentAnnouncementItemIndex}"]`);
    if (!currentItem) return;
    const textBlock = currentItem.querySelector('.announcement-text');
    if (textBlock) {
        textBlock.scrollTop = 0;
    }
}
function advanceAnnouncementAfterScrollPause() {
    if (isAnnouncementPageSwitching) return;
    if (allAnnouncements.length > 1) {
        const wrapped = changeAnnouncementItemInternal(1, { fromAuto: true });
        if (wrapped && totalAnnouncementPages > 1) {
            const nextPage = currentAnnouncementPage >= totalAnnouncementPages ? 1 : currentAnnouncementPage + 1;
            changeAnnouncementPageInternal(nextPage, { fromAuto: true });
        }
        return;
    }
    if (totalAnnouncementPages > 1) {
        const nextPage = currentAnnouncementPage >= totalAnnouncementPages ? 1 : currentAnnouncementPage + 1;
        changeAnnouncementPageInternal(nextPage, { fromAuto: true });
    }
}
function switchTab(mode) {
    if (mode === 'edit') {
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');
        editArea.style.display = 'block';
        previewArea.style.display = 'none';
    } else {
        editModeBtn.classList.remove('active');
        previewModeBtn.classList.add('active');
        editArea.style.display = 'none';
        previewArea.style.display = 'block';
        const content = announcementTextInput.value;
        if (!content) {
            previewArea.innerHTML = '<p class="text-muted">无内容可预览</p>';
        } else {
            previewArea.innerHTML = typeof renderMarkdown === 'function' ? renderMarkdown(content) : DOMPurify.sanitize(marked.parse(content, { breaks: true }));
            previewArea.classList.add('markdown-body');
        }
    }
}
function openAnnouncementModal() {
    announcementModal.classList.add('visible');
    renderAdminAnnouncementList();
    hideAnnouncementForm();
}
function renderAdminAnnouncementList() {
    let html = allAnnouncements.map(a => `
        <div class="admin-announcement-item">
            <div class="admin-announcement-info">
                <h4>${escapeHtml(a.title)} <span class="admin-announcement-status ${a.is_published ? 'status-published' : 'status-draft'}">${a.is_published ? '已发布' : '草稿'}</span></h4>
                <small>${formatAnnouncementDateLocal(a.created_at)}</small>
            </div>
            <div class="admin-announcement-actions">
                <button class="secondary-btn" onclick="editAnnouncement(${a.id})">编辑</button>
                <button class="secondary-btn" onclick="deleteAnnouncement(${a.id})" style="color: var(--accent-color); border-color: var(--accent-color);">删除</button>
            </div>
        </div>
    `).join('');
    if (totalAnnouncementPages > 1) {
        html += `
            <div class="pagination-controls" style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem; align-items: center;">
                <button class="secondary-btn" onclick="changeAnnouncementPage(${currentAnnouncementPage - 1})" ${currentAnnouncementPage === 1 ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                    <i class="fas fa-chevron-left"></i> <span class="pagination-btn-text">上一页</span>
                </button>
                <div style="display:flex; align-items:center;">
                    <input type="number" min="1" max="${totalAnnouncementPages}" value="${currentAnnouncementPage}" 
                        class="pagination-jump-input" 
                        onchange="let val = parseInt(this.value); if(val >= 1 && val <= ${totalAnnouncementPages}) changeAnnouncementPage(val); else this.value = ${currentAnnouncementPage}"
                        onkeydown="if(event.key === 'Enter') this.blur()"
                    >
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">/ ${totalAnnouncementPages}</span>
                </div>
                <button class="secondary-btn" onclick="changeAnnouncementPage(${currentAnnouncementPage + 1})" ${currentAnnouncementPage === totalAnnouncementPages ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                    <span class="pagination-btn-text">下一页</span> <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
    announcementList.innerHTML = html;
}
function editAnnouncement(id) {
    const announcement = allAnnouncements.find(a => a.id == id);
    if (announcement) {
        showAnnouncementForm(announcement);
    }
}
function showAnnouncementForm(announcement = null) {
    announcementForm.style.display = 'block';
    addAnnouncementBtn.style.display = 'none';
    announcementList.style.display = 'none';
    if (announcement) {
        formTitle.textContent = '编辑公告';
        announcementIdInput.value = announcement.id;
        announcementTitleInput.value = announcement.title;
        announcementTextInput.value = announcement.content;
        announcementPublishedInput.checked = !!announcement.is_published;
    } else {
        formTitle.textContent = '发布公告';
        announcementIdInput.value = '';
        announcementTitleInput.value = '';
        announcementTextInput.value = '';
        announcementPublishedInput.checked = true;
    }
    switchTab('edit');
}
function hideAnnouncementForm() {
    announcementForm.style.display = 'none';
    addAnnouncementBtn.style.display = 'block';
    announcementList.style.display = 'block';
}
window.deleteAnnouncement = async function (id) {
    let confirmed = false;
    if (typeof showConfirmation === 'function') {
        confirmed = await showConfirmation({
            title: '删除公告',
            message: '确定要删除这条公告吗？',
            confirmText: '删除',
            confirmClass: 'confirm-btn-danger'
        });
    } else {
        confirmed = confirm('确定要删除这条公告吗？');
    }
    if (!confirmed) return;
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ANNOUNCEMENTS_API_URL}?id=${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            allAnnouncementsCache = [];
            await fetchAndDisplayAnnouncements(1);
            renderAdminAnnouncementList();
        } else {
            alert('删除失败');
        }
    } catch (error) {
        console.error('Error deleting announcement:', error);
        alert('删除出错');
    }
};
async function saveAnnouncement() {
    const id = announcementIdInput.value;
    const title = announcementTitleInput.value.trim();
    const content = announcementTextInput.value.trim();
    const isPublished = announcementPublishedInput.checked;
    if (!title || !content) {
        alert('标题和内容不能为空');
        return;
    }
    const method = id ? 'PUT' : 'POST';
    const body = { title, content, is_published: isPublished };
    if (id) body.id = id;
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(ANNOUNCEMENTS_API_URL, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            allAnnouncementsCache = [];
            announcementModal.classList.remove('visible');
            await fetchAndDisplayAnnouncements(1);
        } else {
            alert('保存失败');
        }
    } catch (error) {
        console.error('Error saving announcement:', error);
        alert('保存出错');
    }
}
function formatAnnouncementDateLocal(dateString) {
    if (!dateString) return '';
    const date = parseAnnouncementDate(dateString);
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai'
    });
    const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
        if (part.type !== 'literal') {
            accumulator[part.type] = part.value;
        }
        return accumulator;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
function parseAnnouncementDate(dateString) {
    if (!dateString) return new Date();
    if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
        return new Date(dateString.replace(' ', 'T') + 'Z');
    }
    return new Date(dateString);
}
