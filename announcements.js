const ANNOUNCEMENTS_API_URL = '/api/announcements';
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
let allAnnouncements = [];
let currentPage = 1;
let totalPages = 1;
const ITEMS_PER_PAGE = 5;

document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayAnnouncements(currentPage);
    initAnnouncementManager();
});
async function fetchAndDisplayAnnouncements(page = 1) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            announcementSection.style.display = 'none';
            return;
        }
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${ANNOUNCEMENTS_API_URL}?page=${page}&limit=${ITEMS_PER_PAGE}`, { headers });
        if (!response.ok) throw new Error('Failed to fetch announcements');
        
        const data = await response.json();
        const announcements = data.data;
        const pagination = data.pagination;
        
        allAnnouncements = announcements;
        currentPage = pagination.page;
        totalPages = pagination.totalPages;
        
        renderAnnouncements(announcements);
        checkAdminPermission();
    } catch (error) {
        console.error('Error fetching announcements:', error);
    }
}
function renderAnnouncements(announcements) {
    if (!announcements || announcements.length === 0) {
        announcementSection.style.display = 'none';
        return;
    }
    
    // Admin view logic handles draft/published status separately, here we render what API returns
    // For regular view, API already filters published only
    
    if (announcements.length === 0) {
        announcementSection.style.display = 'none';
    } else {
        announcementSection.style.display = 'block';
        
        let html = announcements.map(a => `
            <div class="announcement-item">
                <span class="announcement-title">${escapeHtml(a.title)}</span>
                <div class="announcement-text">${escapeHtml(a.content)}</div>
                <div class="announcement-meta">
                    <span><i class="far fa-clock"></i> ${formatDateLocal(a.created_at)}</span>
                </div>
            </div>
        `).join('');

        // Add pagination controls if multiple pages
        if (totalPages > 1) {
            html += `
                <div class="pagination-controls" style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem; align-items: center;">
                    <button class="secondary-btn" onclick="changeAnnouncementPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                        <i class="fas fa-chevron-left"></i> 上一页
                    </button>
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">${currentPage} / ${totalPages}</span>
                    <button class="secondary-btn" onclick="changeAnnouncementPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                        下一页 <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
        
        announcementContent.innerHTML = html;
    }
}

window.changeAnnouncementPage = function(page) {
    if (page < 1 || page > totalPages) return;
    fetchAndDisplayAnnouncements(page);
};
function checkAdminPermission() {
    if (window.currentUser && window.currentUser.role === 'admin') {
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
                <small>${formatDateLocal(a.created_at)}</small>
            </div>
            <div class="admin-announcement-actions">
                <button class="secondary-btn" onclick="editAnnouncement(${a.id})">编辑</button>
                <button class="secondary-btn" onclick="deleteAnnouncement(${a.id})" style="color: var(--danger-color); border-color: var(--danger-color);">删除</button>
            </div>
        </div>
    `).join('');

    if (totalPages > 1) {
        html += `
            <div class="pagination-controls" style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem; align-items: center;">
                <button class="secondary-btn" onclick="changeAnnouncementPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                    <i class="fas fa-chevron-left"></i> 上一页
                </button>
                <span style="color: var(--text-secondary); font-size: 0.9rem;">${currentPage} / ${totalPages}</span>
                <button class="secondary-btn" onclick="changeAnnouncementPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                    下一页 <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
    
    announcementList.innerHTML = html;
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
}
function hideAnnouncementForm() {
    announcementForm.style.display = 'none';
    addAnnouncementBtn.style.display = 'block';
    announcementList.style.display = 'block';
}
window.editAnnouncement = function(id) {
    const announcement = allAnnouncements.find(a => a.id === id);
    if (announcement) {
        showAnnouncementForm(announcement);
    }
};
window.deleteAnnouncement = async function(id) {
    if (!confirm('确定要删除这条公告吗？')) return;
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${ANNOUNCEMENTS_API_URL}?id=${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            await fetchAndDisplayAnnouncements(currentPage);
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
            await fetchAndDisplayAnnouncements(currentPage);
            openAnnouncementModal();
        } else {
            alert('保存失败');
        }
    } catch (error) {
        console.error('Error saving announcement:', error);
        alert('保存出错');
    }
}
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function formatDateLocal(dateString) {
    if (!dateString) return '';
    let date;
    if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
        date = new Date(dateString.replace(' ', 'T') + 'Z');
    } else {
        date = new Date(dateString);
    }
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Shanghai'
    });
}
