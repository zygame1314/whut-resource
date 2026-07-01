async function fetchAndRenderHotFolders() {
    const token = localStorage.getItem('authToken');
    if (!token || !hotFoldersListElement) return;
    const skeletonHTML = `
        <div class="sidebar-skeleton-hot">
            <div class="skeleton-hot-item">
                <div class="skeleton-hot-left"><div class="skeleton-folder-icon"></div><div class="skeleton-text medium"></div></div>
                <div class="skeleton-hot-right"><div class="skeleton-fire-icon"></div><div class="skeleton-count"></div></div>
            </div>
            <div class="skeleton-hot-item">
                <div class="skeleton-hot-left"><div class="skeleton-folder-icon"></div><div class="skeleton-text short"></div></div>
                <div class="skeleton-hot-right"><div class="skeleton-fire-icon"></div><div class="skeleton-count"></div></div>
            </div>
            <div class="skeleton-hot-item">
                <div class="skeleton-hot-left"><div class="skeleton-folder-icon"></div><div class="skeleton-text"></div></div>
                <div class="skeleton-hot-right"><div class="skeleton-fire-icon"></div><div class="skeleton-count"></div></div>
            </div>
        </div>`;
    hotFoldersListElement.innerHTML = skeletonHTML;
    try {
        const result = await fetchCached(`${FILES_API_URL}?action=getHotFolders`, 'getHotFolders', 3600000, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (result.success && result.hotFolders) {
            if (result.hotFolders.length === 0) {
                hotFoldersListElement.innerHTML = '<p class="empty-state-small">暂无热门文件夹。</p>';
                return;
            }
            hotFoldersListElement.innerHTML = '';
            const ul = document.createElement('ul');
            ul.className = 'hot-folders-list';
            result.hotFolders.forEach(folder => {
                const li = document.createElement('li');
                li.className = 'hot-folder-item';
                const truncateMiddle = (str, len = 12) => {
                    if (!str || str.length <= len) return str;
                    return str.slice(0, Math.ceil(len / 2)) + '...' + str.slice(-Math.floor(len / 2));
                };
                let displayHtml = folder.name;
                if (folder.display_path) {
                    const parts = folder.display_path.split('/');
                    const truncatedParts = parts.map(part => {
                        if (part === '...') return part;
                        return truncateMiddle(part, 14);
                    });
                    displayHtml = truncatedParts.join('/');
                    displayHtml = displayHtml.replace('.../', '<span class="path-prefix">.../</span>');
                }
                li.innerHTML = `
                    <span class="hot-folder-name" title="${folder.path}">
                       <i class="fas fa-folder"></i>
                       ${displayHtml}
                    </span>
                    <span class="hot-folder-downloads">
                        <i class="fas fa-fire"></i> ${folder.total_downloads}
                    </span>
                `;
                let pressTimer = null;
                let isLongPress = false;
                li.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        showNotification(`完整路径: ${folder.path || '根目录'}`, 'info');
                    }, 500);
                }, { passive: true });
                li.addEventListener('touchmove', () => {
                    clearTimeout(pressTimer);
                }, { passive: true });
                li.addEventListener('touchend', () => {
                    clearTimeout(pressTimer);
                });
                li.addEventListener('touchcancel', () => {
                    clearTimeout(pressTimer);
                });
                li.addEventListener('contextmenu', (e) => {
                    if (isLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });
                li.addEventListener('click', (e) => {
                    if (isLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    fetchAndDisplayFiles(folder.path);
                    const folderLinks = document.querySelectorAll('.folder-tree-item');
                    folderLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.querySelector('.folder-name').textContent === folder.name) {
                            link.classList.add('active');
                        }
                    });
                });
                ul.appendChild(li);
            });
            hotFoldersListElement.appendChild(ul);
        } else {
            hotFoldersListElement.innerHTML = '<p class="empty-state-small">无法加载热门文件夹。</p>';
            console.error('获取热门文件夹失败:', result.error);
            showNotification(`获取热门文件夹失败: ${result.error}`, 'error');
        }
    } catch (error) {
        hotFoldersListElement.innerHTML = '<p class="empty-state-small">加载热门文件夹时出错。</p>';
        console.error('请求热门文件夹出错:', error);
        showNotification(`请求热门文件夹出错: ${error.message}`, 'error');
    }
}
async function fetchAndRenderDownloadHistory(targetElement) {
    const container = targetElement || downloadHistoryListElement;
    if (!container) return;
    const token = localStorage.getItem('authToken');
    if (!token) {
        container.innerHTML = '<p class="empty-state-small">登录后查看下载历史</p>';
        return;
    }
    container.innerHTML = `
        <div class="sidebar-skeleton-dl">
            <div class="skeleton-dl-item">
                <div class="skeleton-dl-icon"></div>
                <div class="skeleton-dl-text medium"></div>
                <div class="skeleton-dl-time"></div>
            </div>
            <div class="skeleton-dl-item">
                <div class="skeleton-dl-icon"></div>
                <div class="skeleton-dl-text short"></div>
                <div class="skeleton-dl-time"></div>
            </div>
            <div class="skeleton-dl-item">
                <div class="skeleton-dl-icon"></div>
                <div class="skeleton-dl-text"></div>
                <div class="skeleton-dl-time"></div>
            </div>
        </div>`;
    try {
        const response = await fetch(`${FILES_API_URL}?action=downloadHistory&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success && result.files) {
            if (result.files.length === 0) {
                container.innerHTML = '<p class="empty-state-small">暂无下载记录</p>';
                return;
            }
            container.innerHTML = '';
            const ul = document.createElement('ul');
            ul.className = 'download-history-list download-history-modal-list';
            result.files.forEach(file => {
                const li = document.createElement('li');
                li.className = 'download-history-item';
                const isLink = file.is_link === 1 || file.is_link === true;
                const iconClass = isLink ? 'fas fa-link' : getFileIcon(file.name, false);
                const parentPath = typeof file.parent_path === 'string' ? file.parent_path : '';
                const normalizedPath = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath;
                const truncateMiddle = (str, len = 12) => {
                    if (!str || str.length <= len) return str;
                    return str.slice(0, Math.ceil(len / 2)) + '...' + str.slice(-Math.floor(len / 2));
                };
                const displayPath = normalizedPath ? truncateMiddle(normalizedPath.split('/').pop(), 14) : '根目录';
                const timeStr = formatHistoryTime(file.downloaded_at);
                li.innerHTML = `
                    <span class="download-history-name" title="${escapeHtml(file.name)}">
                       <i class="${iconClass}"></i>
                       ${escapeHtml(file.name)}
                    </span>
                    <span class="download-history-meta">
                        <span class="download-history-path" title="${escapeHtml(parentPath || '根目录')}"><i class="fas fa-folder-open"></i> ${escapeHtml(displayPath)}</span>
                        <span class="download-history-time">${timeStr}</span>
                    </span>
                `;
                let pressTimer = null;
                let isLongPress = false;
                li.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        showNotification(`完整路径: ${parentPath || '根目录'}`, 'info');
                    }, 500);
                }, { passive: true });
                li.addEventListener('touchmove', () => { clearTimeout(pressTimer); }, { passive: true });
                li.addEventListener('touchend', () => { clearTimeout(pressTimer); });
                li.addEventListener('touchcancel', () => { clearTimeout(pressTimer); });
                li.addEventListener('contextmenu', (e) => {
                    if (isLongPress) { e.preventDefault(); e.stopPropagation(); }
                });
                li.addEventListener('click', (e) => {
                    if (isLongPress) { e.preventDefault(); e.stopPropagation(); return; }
                    if (isLink && file.link_url) {
                        if (typeof openLink === 'function') {
                            openLink(file.key, file.link_url);
                        } else {
                            window.open(file.link_url, '_blank');
                        }
                    } else {
                        if (searchInput) searchInput.value = '';
                        fetchAndDisplayFiles(parentPath || '');
                        if (window._currentDownloadHistoryModal) {
                            closeAuthModal(window._currentDownloadHistoryModal);
                            window._currentDownloadHistoryModal = null;
                        }
                    }
                });
                ul.appendChild(li);
            });
            container.appendChild(ul);
        } else {
            container.innerHTML = '<p class="empty-state-small">无法加载下载历史。</p>';
            console.error('获取下载历史失败:', result.error);
        }
    } catch (error) {
        container.innerHTML = '<p class="empty-state-small">加载下载历史时出错。</p>';
        console.error('请求下载历史出错:', error);
    }
}

let downloadHistoryModal = null;
window.showDownloadHistoryModal = function () {
    if (downloadHistoryModal) {
        closeAuthModal(downloadHistoryModal);
        downloadHistoryModal = null;
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'download-history-modal';
    downloadHistoryModal = modal;
    window._currentDownloadHistoryModal = modal;
    modal.innerHTML = `
        <div class="auth-box" style="max-width:520px;">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-history u-margin-right-small"></i>下载历史</h2>
                <button id="close-download-history-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="download-history-modal-hint">
                <i class="fas fa-hand-pointer"></i> 点击条目定位到所在目录
            </div>
            <div id="download-history-modal-content" class="admin-scrollable-container"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-download-history-modal').addEventListener('click', () => {
        closeAuthModal(modal);
        downloadHistoryModal = null;
        window._currentDownloadHistoryModal = null;
    });
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) {
            closeAuthModal(modal);
            downloadHistoryModal = null;
            window._currentDownloadHistoryModal = null;
        }
    });
    fetchAndRenderDownloadHistory(modal.querySelector('#download-history-modal-content'));
};

function initDownloadHistoryPanel() {
    const entry = document.getElementById('download-history-entry');
    if (!entry) return;
    const token = localStorage.getItem('authToken');
    entry.style.display = token ? 'flex' : 'none';
}
async function fetchAndRenderFavorites(targetElement) {
    const container = targetElement;
    if (!container) return;
    const token = localStorage.getItem('authToken');
    if (!token) {
        container.innerHTML = '<p class="empty-state-small">登录后查看收藏</p>';
        return;
    }
    container.innerHTML = `
        <div class="sidebar-skeleton-dl">
            <div class="skeleton-dl-item">
                <div class="skeleton-dl-icon"></div>
                <div class="skeleton-dl-text medium"></div>
                <div class="skeleton-dl-time"></div>
            </div>
            <div class="skeleton-dl-item">
                <div class="skeleton-dl-icon"></div>
                <div class="skeleton-dl-text short"></div>
                <div class="skeleton-dl-time"></div>
            </div>
            <div class="skeleton-dl-item">
                <div class="skeleton-dl-icon"></div>
                <div class="skeleton-dl-text"></div>
                <div class="skeleton-dl-time"></div>
            </div>
        </div>`;
    try {
        const response = await fetch(`${FILES_API_URL}?action=favorites&limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success && result.files) {
            if (result.files.length === 0) {
                container.innerHTML = '<p class="empty-state-small">还没有收藏，点击文件旁的星标添加收藏</p>';
                return;
            }
            container.innerHTML = '';
            const ul = document.createElement('ul');
            ul.className = 'download-history-list download-history-modal-list';
            result.files.forEach(file => {
                const li = document.createElement('li');
                li.className = 'download-history-item favorites-item';
                const isLink = file.is_link === 1 || file.is_link === true;
                const isDirectory = file.is_directory === 1 || file.is_directory === true;
                const iconClass = isLink ? 'fas fa-link' : (isDirectory ? 'fas fa-folder' : getFileIcon(file.name, false));
                const parentPath = typeof file.parent_path === 'string' ? file.parent_path : '';
                const normalizedPath = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath;
                const truncateMiddle = (str, len = 12) => {
                    if (!str || str.length <= len) return str;
                    return str.slice(0, Math.ceil(len / 2)) + '...' + str.slice(-Math.floor(len / 2));
                };
                const displayPath = normalizedPath ? truncateMiddle(normalizedPath.split('/').pop(), 14) : '根目录';
                const timeStr = formatHistoryTime(file.favorited_at);
                li.innerHTML = `
                    <span class="download-history-name" title="${escapeHtml(file.name)}">
                       <i class="${iconClass}"></i>
                       ${escapeHtml(file.name)}
                    </span>
                    <span class="download-history-meta">
                        <span class="download-history-path" title="${escapeHtml(parentPath || '根目录')}"><i class="fas fa-folder-open"></i> ${escapeHtml(displayPath)}</span>
                        <span class="download-history-time">${timeStr}</span>
                    </span>
                `;
                let pressTimer = null;
                let isLongPress = false;
                li.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        showNotification(`完整路径: ${parentPath || '根目录'}`, 'info');
                    }, 500);
                }, { passive: true });
                li.addEventListener('touchmove', () => { clearTimeout(pressTimer); }, { passive: true });
                li.addEventListener('touchend', () => { clearTimeout(pressTimer); });
                li.addEventListener('touchcancel', () => { clearTimeout(pressTimer); });
                li.addEventListener('contextmenu', (e) => {
                    if (isLongPress) { e.preventDefault(); e.stopPropagation(); }
                });
                li.addEventListener('click', async (e) => {
                    if (isLongPress) { e.preventDefault(); e.stopPropagation(); return; }
                    if (isLink && file.link_url) {
                        if (typeof openLink === 'function') {
                            openLink(file.key, file.link_url);
                        } else {
                            window.open(file.link_url, '_blank');
                        }
                    } else {
                        if (searchInput) searchInput.value = '';
                        if (window._currentFavoritesModal) {
                            closeAuthModal(window._currentFavoritesModal);
                        }
                        favoritesModal = null;
                        window._currentFavoritesModal = null;
                        if (typeof directoryCache !== 'undefined') {
                            delete directoryCache[parentPath || ''];
                        }
                        fetchAndDisplayFiles(parentPath || '');
                    }
                });
                const unfavBtn = document.createElement('button');
                unfavBtn.className = 'favorites-unfav-btn';
                unfavBtn.title = '取消收藏';
                unfavBtn.innerHTML = '<i class="fas fa-star"></i>';
                unfavBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const res = await toggleFavorite(file.key, unfavBtn);
                    if (res) {
                        li.classList.add('favorites-item-removing');
                        setTimeout(() => {
                            li.remove();
                            if (ul.children.length === 0) {
                                container.innerHTML = '<p class="empty-state-small">还没有收藏，点击文件旁的星标添加收藏</p>';
                            }
                        }, 250);
                    }
                });
                li.appendChild(unfavBtn);
                ul.appendChild(li);
            });
            container.appendChild(ul);
        } else {
            container.innerHTML = '<p class="empty-state-small">无法加载收藏列表。</p>';
            console.error('获取收藏列表失败:', result.error);
        }
    } catch (error) {
        container.innerHTML = '<p class="empty-state-small">加载收藏列表时出错。</p>';
        console.error('请求收藏列表出错:', error);
    }
}
let favoritesModal = null;
window.showFavoritesModal = function () {
    if (favoritesModal) {
        closeAuthModal(favoritesModal);
        favoritesModal = null;
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'favorites-modal';
    favoritesModal = modal;
    window._currentFavoritesModal = modal;
    modal.innerHTML = `
        <div class="auth-box" style="max-width:520px;">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-star u-margin-right-small"></i>我的收藏</h2>
                <button id="close-favorites-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="download-history-modal-hint">
                <i class="fas fa-hand-pointer"></i> 点击条目定位到所在目录
            </div>
            <div id="favorites-modal-content" class="admin-scrollable-container"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-favorites-modal').addEventListener('click', () => {
        closeAuthModal(modal);
        favoritesModal = null;
        window._currentFavoritesModal = null;
    });
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) {
            closeAuthModal(modal);
            favoritesModal = null;
            window._currentFavoritesModal = null;
        }
    });
    fetchAndRenderFavorites(modal.querySelector('#favorites-modal-content'));
};
function initFavoritesPanel() {
    const entry = document.getElementById('favorites-entry');
    if (!entry) return;
    const token = localStorage.getItem('authToken');
    entry.style.display = token ? 'flex' : 'none';
}
function initSubscriptionsPanel() {
    const entry = document.getElementById('subscriptions-entry');
    if (!entry) return;
    const token = localStorage.getItem('authToken');
    entry.style.display = token ? 'flex' : 'none';
}
async function fetchAndRenderSubscriptions(container) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        container.innerHTML = '<p class="empty-state-small">请先登录后查看订阅</p>';
        return;
    }
    container.innerHTML = `
        <div class="skeleton-dl-list">
            <div class="skeleton-dl-item"><div class="skeleton-dl-icon"></div><div class="skeleton-dl-text"></div><div class="skeleton-dl-time"></div></div>
            <div class="skeleton-dl-item"><div class="skeleton-dl-icon"></div><div class="skeleton-dl-text"></div><div class="skeleton-dl-time"></div></div>
            <div class="skeleton-dl-item"><div class="skeleton-dl-icon"></div><div class="skeleton-dl-text"></div><div class="skeleton-dl-time"></div></div>
        </div>`;
    try {
        const response = await fetch(`${FILES_API_URL}?action=subscriptions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success && result.subscriptions) {
            if (result.subscriptions.length === 0) {
                container.innerHTML = '<p class="empty-state-small">还没有订阅，在文件夹旁点击铃铛按钮即可订阅更新</p>';
                return;
            }
            container.innerHTML = '';
            const ul = document.createElement('ul');
            ul.className = 'download-history-list download-history-modal-list';
            result.subscriptions.forEach(sub => {
                const folderKey = sub.folder_key || '';
                const parentPath = folderKey.endsWith('/') ? folderKey.slice(0, -1) : folderKey;
                const folderName = parentPath.split('/').pop() || folderKey || '根目录';
                const hasUpdate = sub.has_update === 1 || sub.has_update === true;
                const truncateMiddle = (str, len = 16) => {
                    if (!str || str.length <= len) return str;
                    return str.slice(0, Math.ceil(len / 2)) + '...' + str.slice(-Math.floor(len / 2));
                };
                const displayPath = parentPath.includes('/') ? truncateMiddle(parentPath.slice(0, parentPath.lastIndexOf('/')).split('/').pop() || parentPath, 14) : '根目录';
                const li = document.createElement('li');
                li.className = 'download-history-item subscriptions-item' + (hasUpdate ? ' has-update' : '');
                li.innerHTML = `
                    <span class="download-history-name" title="${escapeHtml(folderKey)}">
                       <i class="fas fa-folder"></i>
                       ${escapeHtml(folderName)}
                       ${hasUpdate ? '<span class="sub-update-badge"><i class="fas fa-circle" style="font-size:0.5rem;"></i>有更新</span>' : ''}
                    </span>
                    <span class="download-history-meta">
                        <span class="download-history-path" title="${escapeHtml(parentPath)}"><i class="fas fa-folder-open"></i> ${escapeHtml(displayPath)}</span>
                    </span>
                `;
                li.addEventListener('click', (e) => {
                    if (searchInput) searchInput.value = '';
                    if (window._currentSubscriptionsModal) {
                        closeAuthModal(window._currentSubscriptionsModal);
                    }
                    subscriptionsModal = null;
                    window._currentSubscriptionsModal = null;
                    if (typeof directoryCache !== 'undefined') {
                        delete directoryCache[folderKey];
                    }
                    fetchAndDisplayFiles(folderKey, '', 1, true);
                });
                const unsubBtn = document.createElement('button');
                unsubBtn.className = 'subscriptions-unsub-btn';
                unsubBtn.title = '取消订阅';
                unsubBtn.innerHTML = '<i class="fas fa-bell-slash"></i>';
                unsubBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const res = await toggleSubscribe(folderKey, unsubBtn);
                    if (res && res.success !== false) {
                        if (typeof directoryCache !== 'undefined') {
                            for (const p in directoryCache) {
                                const entry = directoryCache[p];
                                if (!entry || !entry.data) continue;
                                const updateArr = (arr) => {
                                    if (!arr) return;
                                    for (const f of arr) {
                                        if (f && f.key === folderKey) f.is_subscribed = 0;
                                    }
                                };
                                updateArr(entry.data.directories);
                                updateArr(entry.data.files);
                            }
                        }
                        li.classList.add('subscriptions-item-removing');
                        setTimeout(() => {
                            li.remove();
                            if (ul.children.length === 0) {
                                container.innerHTML = '<p class="empty-state-small">还没有订阅，在文件夹旁点击铃铛按钮即可订阅更新</p>';
                            }
                        }, 250);
                    }
                });
                li.appendChild(unsubBtn);
                ul.appendChild(li);
            });
            container.appendChild(ul);
        } else {
            container.innerHTML = '<p class="empty-state-small">无法加载订阅列表。</p>';
            console.error('获取订阅列表失败:', result.error);
        }
    } catch (error) {
        container.innerHTML = '<p class="empty-state-small">加载订阅列表时出错。</p>';
        console.error('请求订阅列表出错:', error);
    }
}
let subscriptionsModal = null;
window.showSubscriptionsModal = function () {
    if (subscriptionsModal) {
        closeAuthModal(subscriptionsModal);
        subscriptionsModal = null;
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'subscriptions-modal';
    subscriptionsModal = modal;
    window._currentSubscriptionsModal = modal;
    modal.innerHTML = `
        <div class="auth-box" style="max-width:520px;">
            <div class="admin-modal-header">
                <h2 class="auth-title"><i class="fas fa-bell u-margin-right-small"></i>我的订阅</h2>
                <button id="close-subscriptions-modal" class="close-modal-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="download-history-modal-hint">
                <i class="fas fa-hand-pointer"></i> 点击条目定位到文件夹
            </div>
            <div id="subscriptions-modal-content" class="admin-scrollable-container"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-subscriptions-modal').addEventListener('click', () => {
        closeAuthModal(modal);
        subscriptionsModal = null;
        window._currentSubscriptionsModal = null;
    });
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) {
            closeAuthModal(modal);
            subscriptionsModal = null;
            window._currentSubscriptionsModal = null;
        }
    });
    fetchAndRenderSubscriptions(modal.querySelector('#subscriptions-modal-content'));
};
function formatHistoryTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay}天前`;
    return date.toLocaleDateString('zh-CN');
}
async function fetchAndRenderRecentUploads(showToast = false) {
    if (!recentUploadsListElement) return;
    const token = localStorage.getItem('authToken');
    if (!token) {
        if (showToast) {
            showNotification('请先登录后再查看最近上传', 'warning');
        }
        return;
    }
    if (showToast) {
        showNotification('正在刷新最近上传列表...', 'info');
    }
    recentUploadsListElement.innerHTML = `
        <li class="loading-item">
            <div class="creative-loader">
                <div class="creative-loader-scene">
                    <div class="creative-loader-glow"></div>
                    <div class="creative-loader-folder"><i class="fas fa-clock-rotate-left"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-alt"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-pdf"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-word"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-image"></i></div>
                </div>
                <div class="creative-loader-text">正在加载最近上传<span class="creative-loader-dots"></span></div>
            </div>
        </li>
    `;
    if (refreshRecentUploadsBtn) {
        refreshRecentUploadsBtn.disabled = true;
        const refreshIcon = refreshRecentUploadsBtn.querySelector('i');
        if (refreshIcon) refreshIcon.classList.add('fa-spin');
    }
    try {
        const url = new URL(FILES_API_URL, window.location.origin);
        url.searchParams.set('action', 'recentUploads');
        url.searchParams.set('limit', '6');
        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }
        const files = Array.isArray(result.files) ? result.files : [];
        if (files.length === 0) {
            recentUploadsListElement.innerHTML = '<li class="empty-state-small">近期暂无新文件上传</li>';
            return;
        }
        const fragment = document.createDocumentFragment();
        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'recent-upload-item';
            const isLink = file.is_link === 1 || file.is_link === true;
            const iconClass = isLink ? 'fas fa-link' : getFileIcon(file.name, false);
            const parentPath = typeof file.parent_path === 'string' ? file.parent_path : '';
            const normalizedPath = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath;
            const truncateMiddle = (str, len = 12) => {
                if (!str || str.length <= len) return str;
                return str.slice(0, Math.ceil(len / 2)) + '...' + str.slice(-Math.floor(len / 2));
            };
            const parts = normalizedPath ? normalizedPath.split('/').filter(Boolean) : [];
            let displayPath = '根目录';
            if (parts.length > 0) {
                let current = parts.pop();
                current = truncateMiddle(current, 14);
                if (parts.length > 0) {
                    let parent = parts.pop();
                    parent = truncateMiddle(parent, 14);
                    displayPath = `${parent}/${current}`;
                    if (parts.length > 0) {
                        displayPath = `.../${displayPath}`;
                    }
                } else {
                    displayPath = current;
                }
            }
            const folderLabel = parentPath && parentPath !== '' ? parentPath : '根目录';
            const downloadsLabel = typeof file.downloads === 'number' ? file.downloads : 0;
            const sizeDisplay = isLink ? '外部链接' : formatBytes(file.size);
            li.innerHTML = `
                <div class="recent-upload-info">
                    <div class="recent-upload-name" title="${file.name}">
                        <i class="${iconClass}"></i>
                        <span>${file.name}</span>
                    </div>
                    <div class="recent-upload-meta">
                        <span><i class="fas ${isLink ? 'fa-link' : 'fa-database'}"></i> ${sizeDisplay}</span>
                        <span><i class="fas fa-clock"></i> ${formatDate(file.uploaded)}</span>
                        <span><i class="fas ${isLink ? 'fa-mouse-pointer' : 'fa-download'}"></i> ${downloadsLabel}</span>
                    </div>
                    <div class="recent-upload-meta">
                        <span class="recent-upload-path" title="${folderLabel}">
                            <i class="fas fa-folder-open"></i>
                            <span>${displayPath.replace('.../', '<span class="path-prefix">.../</span>')}</span>
                        </span>
                    </div>
                </div>
                <div class="recent-upload-actions">
                    ${isLink ? `
                    <button class="recent-action-btn recent-open-link-btn" title="打开链接">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                    ` : `
                    <button class="recent-action-btn recent-preview-btn" title="预览文件">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="recent-action-btn recent-download-btn" title="下载文件">
                        <i class="fas fa-download"></i>
                    </button>
                    `}
                    <button class="recent-action-btn recent-open-btn" title="定位到所在目录">
                        <i class="fas fa-location-arrow"></i>
                    </button>
                </div>
            `;
            if (isLink) {
                const openLinkBtn = li.querySelector('.recent-open-link-btn');
                if (openLinkBtn) {
                    openLinkBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof openLink === 'function') {
                            openLink(file.key, file.link_url, openLinkBtn);
                        } else {
                            console.warn('未找到 openLink 函数，将直接打开链接');
                            window.open(file.link_url, '_blank');
                        }
                    });
                }
            } else {
                const previewBtn = li.querySelector('.recent-preview-btn');
                if (previewBtn) {
                    previewBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        previewFile(file.key, file.name, file.size);
                    });
                }
                const downloadBtn = li.querySelector('.recent-download-btn');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        downloadFile(file.key, downloadBtn);
                    });
                }
            }
            const openBtn = li.querySelector('.recent-open-btn');
            if (openBtn) {
                openBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (searchInput) searchInput.value = '';
                    fetchAndDisplayFiles(parentPath || '');
                });
            }
            const pathChip = li.querySelector('.recent-upload-path');
            if (pathChip) {
                let pressTimer = null;
                let isLongPress = false;
                const fullPath = parentPath || '根目录';
                pathChip.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        showNotification(`完整路径: ${fullPath}`, 'info');
                    }, 500);
                }, { passive: true });
                pathChip.addEventListener('touchmove', () => {
                    clearTimeout(pressTimer);
                }, { passive: true });
                pathChip.addEventListener('touchend', () => {
                    clearTimeout(pressTimer);
                });
                pathChip.addEventListener('touchcancel', () => {
                    clearTimeout(pressTimer);
                });
                pathChip.addEventListener('contextmenu', (e) => {
                    if (isLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });
                pathChip.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isLongPress) {
                        return;
                    }
                    if (searchInput) searchInput.value = '';
                    fetchAndDisplayFiles(parentPath || '');
                });
            }
            fragment.appendChild(li);
        });
        recentUploadsListElement.innerHTML = '';
        recentUploadsListElement.appendChild(fragment);
    } catch (error) {
        console.error('加载最近上传失败:', error);
        showNotification(`加载最近上传失败: ${error.message}`, 'error');
        recentUploadsListElement.innerHTML = '';
        const errorLi = document.createElement('li');
        errorLi.className = 'empty-state-small';
        errorLi.textContent = `加载最近上传失败：${error.message}`;
        recentUploadsListElement.appendChild(errorLi);
    } finally {
        if (refreshRecentUploadsBtn) {
            refreshRecentUploadsBtn.disabled = false;
            const refreshIcon = refreshRecentUploadsBtn.querySelector('i');
            if (refreshIcon) refreshIcon.classList.remove('fa-spin');
        }
    }
}
if (refreshRecentUploadsBtn) {
    refreshRecentUploadsBtn.addEventListener('click', () => fetchAndRenderRecentUploads(true));
}
async function fetchAndBuildFolderTree() {
    const token = localStorage.getItem('authToken');
    if (!token || !folderTreeElement) return;
    const skeletonHTML = `
        <div class="sidebar-skeleton">
            <div class="sidebar-skeleton-item"><div class="skeleton-icon"></div><div class="skeleton-text"></div></div>
            <div class="sidebar-skeleton-item indent-1"><div class="skeleton-icon"></div><div class="skeleton-text medium"></div></div>
            <div class="sidebar-skeleton-item indent-1"><div class="skeleton-icon"></div><div class="skeleton-text short"></div></div>
            <div class="sidebar-skeleton-item indent-2"><div class="skeleton-icon"></div><div class="skeleton-text medium"></div></div>
            <div class="sidebar-skeleton-item"><div class="skeleton-icon"></div><div class="skeleton-text short"></div></div>
            <div class="sidebar-skeleton-item indent-1"><div class="skeleton-icon"></div><div class="skeleton-text"></div></div>
        </div>`;
    folderTreeElement.innerHTML = skeletonHTML;
    try {
        const result = await fetchCached(`${FILES_API_URL}?action=listAllDirs`, 'listAllDirs', 3600000, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (result.success) {
            const tree = buildTree(result.directories);
            tree._sourceDirectories = result.directories;
            renderFolderTree(tree, folderTreeElement);
        } else {
            folderTreeElement.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">无法加载文件夹树。</p>';
            showNotification(`获取文件夹树失败: ${result.error}`, 'error');
        }
    } catch (error) {
        folderTreeElement.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">加载文件夹树时出错。</p>';
        console.error('请求文件夹树出错:', error);
        showNotification(`请求文件夹树出错: ${error.message}`, 'error');
    }
}
async function fetchFileStats() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        if (fileCountElement) fileCountElement.textContent = '验证后可用';
        return;
    }
    try {
        const response = await fetch(`${FILES_API_URL}?action=stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success) {
            const { fileCount } = result.stats;
            let { totalSize } = result.stats;
            if (fileCountElement) {
                fileCountElement.textContent = `${fileCount} 个文件`;
            }
            if (totalSizeElement) {
                totalSizeElement.textContent = formatBytes(totalSize);
                const divider = document.querySelector('.stat-divider');
                if (divider) divider.style.display = 'inline';
            }
            const progressBar = document.getElementById('size-progress-bar');
            const progressText = document.getElementById('size-progress-text');
            const maxSize = 10 * 1024 * 1024 * 1024;
            const percentage = Math.min((totalSize / maxSize) * 100, 100);
            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
                if (percentage > 90) {
                    progressBar.style.background = 'var(--accent-gradient)';
                } else if (percentage > 70) {
                    progressBar.style.background = 'var(--warning-gradient)';
                } else {
                    progressBar.style.background = 'var(--primary-gradient)';
                }
            }
            if (progressText) {
                progressText.textContent = `${formatBytes(totalSize)} / 10 GB`;
            }
        } else {
            if (fileCountElement) fileCountElement.textContent = '统计失败';
            console.error('获取统计信息失败:', result.error);
            showNotification(`获取统计信息失败: ${result.error}`, 'error');
        }
    } catch (error) {
        if (fileCountElement) fileCountElement.textContent = '统计出错';
        console.error('请求统计信息出错:', error);
        showNotification(`请求统计信息出错: ${error.message}`, 'error');
    }
}
async function loadMoreFiles() {
    if (!currentHasMore || !currentCursor || isLoadingMore) return;
    isLoadingMore = true;
    renderLoadMoreButton(true);
    const token = localStorage.getItem('authToken');
    if (!token) { isLoadingMore = false; return; }
    try {
        const urlParams = new URLSearchParams();
        urlParams.append('prefix', currentPrefix);
        urlParams.append('c_is_dir', currentCursor.is_dir);
        urlParams.append('c_is_link', currentCursor.is_link);
        urlParams.append('c_name', currentCursor.name);
        urlParams.append('c_key', currentCursor.key);
        const url = `${FILES_API_URL}?${urlParams.toString()}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await response.json();
        if (response.ok && result.success) {
            const newFiles = result.files || [];
            const newDirs = result.directories || [];
            currentRawData.directories.push(...newDirs);
            currentRawData.files.push(...newFiles);
            const totalRaw = currentRawData.directories.length + currentRawData.files.length;
            if (totalRaw > 500) {
                const toTrim = totalRaw - 500;
                let trimmed = 0;
                while (trimmed < toTrim && currentRawData.directories.length > 0) {
                    currentRawData.directories.shift();
                    trimmed++;
                }
                while (trimmed < toTrim && currentRawData.files.length > 0) {
                    currentRawData.files.shift();
                    trimmed++;
                }
                currentPage = Math.max(1, currentPage - Math.ceil(toTrim / itemsPerPage));
            }
            currentCursor = result.cursor || null;
            currentHasMore = result.hasMore || false;
            if (directoryCache[currentPrefix]) {
                directoryCache[currentPrefix].data.directories.push(...newDirs);
                directoryCache[currentPrefix].data.files.push(...newFiles);
                const cacheTotal = directoryCache[currentPrefix].data.directories.length + directoryCache[currentPrefix].data.files.length;
                if (cacheTotal > 500) {
                    const cacheTrim = cacheTotal - 500;
                    let cTrimmed = 0;
                    while (cTrimmed < cacheTrim && directoryCache[currentPrefix].data.directories.length > 0) {
                        directoryCache[currentPrefix].data.directories.shift();
                        cTrimmed++;
                    }
                    while (cTrimmed < cacheTrim && directoryCache[currentPrefix].data.files.length > 0) {
                        directoryCache[currentPrefix].data.files.shift();
                        cTrimmed++;
                    }
                }
                directoryCache[currentPrefix].cursor = currentCursor;
                directoryCache[currentPrefix].hasMore = currentHasMore;
            }
            applyLocalSortAndFilter();
        } else {
            throw new Error(result?.error || '加载更多失败');
        }
    } catch (error) {
        console.error('加载更多文件失败:', error);
        showNotification(`加载更多失败: ${error.message}`, 'error');
    }
    isLoadingMore = false;
    renderLoadMoreButton(false);
}
function renderLoadMoreButton(loading) {
    const existing = document.getElementById('load-more-container');
    if (existing) existing.remove();
    if (!currentHasMore && !loading) return;
    if (!loading && (!currentHasMore || currentPage < totalPages)) return;
    const container = document.createElement('div');
    container.id = 'load-more-container';
    container.className = 'load-more-container';
    container.innerHTML = loading
        ? `<button class="load-more-button loading" disabled><i class="fas fa-spinner fa-pulse"></i> 加载中...</button>`
        : `<button class="load-more-button" id="load-more-btn"><i class="fas fa-chevron-down"></i> 加载更多内容</button>`;
    const paginationEl = document.getElementById('pagination-controls');
    if (paginationEl && paginationEl.parentNode) {
        paginationEl.parentNode.insertBefore(container, paginationEl);
    } else if (fileListElement && fileListElement.parentNode) {
        fileListElement.parentNode.appendChild(container);
    }
    if (!loading) {
        const btn = container.querySelector('#load-more-btn');
        if (btn) btn.onclick = loadMoreFiles;
    }
}
function applyLocalSortAndFilter() {
    if (!currentRawData) return;
    let processedData = sortData(currentRawData, currentSortOption);
    processedData = filterByFolderSearch(processedData, currentFolderSearchTerm);
    processedData = filterByFileType(processedData, currentFilter);
    reRenderWithData(
        processedData,
        isShowingSearchResults,
        isShowingSearchResults ? (searchInput ? searchInput.value.trim() : '') : ''
    );
}
function paginateSearchResults(allDirs, allFiles, page, perPage) {
    const allItems = [
        ...allDirs.map(d => ({ ...d, _sortIsDir: true, _sortIsLink: d.is_link === 1 || d.is_link === true })),
        ...allFiles.map(f => ({ ...f, _sortIsDir: false, _sortIsLink: f.is_link === 1 || f.is_link === true }))
    ];
    const totalItems = allItems.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const pageItems = allItems.slice(startIndex, endIndex);
    const dirsOnPage = pageItems.filter(i => i._sortIsDir);
    const linksOnPage = pageItems.filter(i => !i._sortIsDir && i._sortIsLink);
    const filesOnPage = pageItems.filter(i => !i._sortIsDir && !i._sortIsLink);
    const displayedData = {
        directories: dirsOnPage,
        files: [...linksOnPage, ...filesOnPage]
    };
    return { displayedData, totalItems };
}
function reRenderWithData(data, isGlobalSearch, searchTerm) {
    const allDirs = data.directories || [];
    const allFiles = data.files || [];
    const totalItems = allDirs.length + allFiles.length;
    const newTotalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > newTotalPages) {
        currentPage = newTotalPages;
    }
    let displayedData;
    if (isGlobalSearch) {
        const result = paginateSearchResults(allDirs, allFiles, currentPage, itemsPerPage);
        displayedData = result.displayedData;
    } else {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        displayedData = { files: [], directories: [] };
        if (startIndex < allDirs.length) {
            const dirEnd = Math.min(endIndex, allDirs.length);
            displayedData.directories = allDirs.slice(startIndex, dirEnd);
        }
        if (endIndex > allDirs.length) {
            const fileStart = Math.max(0, startIndex - allDirs.length);
            const fileEnd = endIndex - allDirs.length;
            displayedData.files = allFiles.slice(fileStart, fileEnd);
        }
    }
    const paginationData = {
        currentPage: currentPage,
        totalPages: newTotalPages,
        totalItems: totalItems,
        limit: itemsPerPage
    };
    currentTotalItems = totalItems;
    totalPages = newTotalPages;
    currentFetchedData = displayedData;
    currentPaginationData = paginationData;
    const aiSearchToggle = document.getElementById('ai-search-toggle');
    const useAISearch = aiSearchToggle && aiSearchToggle.checked && isGlobalSearch;
    renderFileList(
        isGlobalSearch ? '' : currentPrefix,
        displayedData,
        isGlobalSearch,
        searchTerm,
        paginationData,
        useAISearch
    );
    updateUploadButtonLink();
    updateSelectAllButtonState();
    renderLoadMoreButton(false);
}
function updateUploadButtonLink() {
    const uploadBtn = document.getElementById('upload-btn-link');
    if (uploadBtn) {
        let uploadUrl = 'upload.html';
        if (currentPrefix) {
            uploadUrl += `?path=${encodeURIComponent(currentPrefix)}`;
        }
        uploadBtn.href = uploadUrl;
    }
}
async function fetchAndDisplayFiles(prefix = '', searchTerm = '', page = 1, shouldScroll = true, shouldPushState = true) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        fileListElement.innerHTML = `
            <li class="empty-state clickable" title="点击登录">
                <i class="fas fa-user-shield" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                请先完成验证以查看文件
            </li>
        `;
        updateBreadcrumb('');
        isShowingSearchResults = false;
        renderPaginationControls(null);
        return;
    }
    if (shouldPushState) {
        const url = new URL(window.location);
        if (prefix) {
            url.searchParams.set('path', prefix);
        } else {
            url.searchParams.delete('path');
        }
        if (searchTerm.trim()) {
            url.searchParams.set('search', searchTerm.trim());
        } else {
            url.searchParams.delete('search');
        }
        if (page > 1) {
            url.searchParams.set('page', page);
        } else {
            url.searchParams.delete('page');
        }
        const stateData = { prefix, searchTerm: searchTerm.trim(), page };
        const currentUrlParams = new URLSearchParams(window.location.search);
        const currentPath = currentUrlParams.get('path') || '';
        const currentSearch = currentUrlParams.get('search') || '';
        const currentPageParam = parseInt(currentUrlParams.get('page') || '1');
        if (currentPath === prefix && currentSearch === searchTerm.trim() && currentPageParam === page) {
            window.history.replaceState(stateData, '', url.toString());
        } else {
            window.history.pushState(stateData, '', url.toString());
        }
    }
    const isGlobal = searchTerm.trim() !== '';
    if (isGlobal) {
        const blockedExtensions = new Set([
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md',
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
            'mp4', 'webm', 'mov', 'avi', 'mkv',
            'mp3', 'wav', 'flac', 'm4a',
            'zip', 'rar', '7z', 'tar', 'gz',
            'exe', 'msi', 'apk', 'ipa', 'dmg', 'iso'
        ]);
        const cleanTerm = searchTerm.trim().toLowerCase().replace(/^\./, '');
        if (blockedExtensions.has(cleanTerm)) {
            isShowingSearchResults = true;
            fileListElement.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-filter u-font-large-icon opacity-medium"></i>
                    关键词 "${searchTerm}" 太过宽泛<br>
                    <span class="u-text-secondary-small">
                        请勿直接搜索文件后缀名，建议搭配文件名关键词使用
                    </span>
                </li>
            `;
            updateBreadcrumb('', true, searchTerm.trim());
            renderPaginationControls(null);
            return;
        }
    }
    if (!isGlobal) {
        currentPrefix = prefix;
        currentFolderSearchTerm = '';
        highlightCurrentFolder(prefix);
        const folderSearchInput = document.getElementById('folder-search-input');
        const clearFolderSearchBtn = document.getElementById('clear-folder-search');
        if (folderSearchInput) {
            folderSearchInput.value = '';
        }
        if (clearFolderSearchBtn) {
            clearFolderSearchBtn.style.display = 'none';
        }
    }
    if (prefix !== currentPrefix || (isGlobal && !isShowingSearchResults) || page === undefined) {
        currentPage = 1;
    } else {
        currentPage = page;
    }
    const fileExplorer = document.getElementById('breadcrumb-nav');
    if (fileExplorer && shouldScroll) {
        const headerOffset = 80;
        const elementPosition = fileExplorer.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
            top: offsetPosition,
            behavior: "smooth"
        });
    }
    const aiSearchToggle = document.getElementById('ai-search-toggle');
    const useAISearch = aiSearchToggle && aiSearchToggle.checked && isGlobal;
    const loadingMessage = useAISearch ? 'AI 正在分析语义' : '正在加载文件列表';
    fileListElement.innerHTML = `
        <li class="loading-item">
            <div class="creative-loader">
                <div class="creative-loader-scene">
                    <div class="creative-loader-glow"></div>
                    <div class="creative-loader-folder"><i class="fas fa-folder-open"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-alt"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-pdf"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-word"></i></div>
                    <div class="creative-loader-file"><i class="fas fa-file-image"></i></div>
                </div>
                <div class="creative-loader-text">${loadingMessage}<span class="creative-loader-dots"></span><br>(第 ${currentPage} 页)</div>
            </div>
        </li>
    `;
    renderPaginationControls(null);
    try {
        let result;
        if (useAISearch) {
            const aiCacheKey = `ai_search:${searchTerm.trim()}`;
            let receivedData = { files: [], directories: [] };
            let paginationData = {};
            let result;
            if (searchCache.has(aiCacheKey)) {
                console.log(`命中 AI 搜索缓存: "${searchTerm}"`);
                const cachedResult = searchCache.get(aiCacheKey);
                if (cachedResult.files.length === 0 && cachedResult.message) {
                    fileListElement.innerHTML = `
                        <li class="empty-state">
                            <i class="fas fa-robot u-font-large-icon opacity-low"></i>
                            ${cachedResult.message}
                        </li>
                    `;
                    updateBreadcrumb('', true, searchTerm.trim());
                    renderPaginationControls(null);
                    fileListElement.style.minHeight = '';
                    updateUploadButtonLink();
                    updateSelectAllButtonState();
                    return;
                }
                const allDirs = cachedResult.directories || [];
                const allFiles = cachedResult.files || [];
                currentRawData = {
                    directories: [...allDirs],
                    files: [...allFiles]
                };
                const sortedData = sortData(currentRawData, currentSortOption);
                const paginateResult = paginateSearchResults(sortedData.directories, sortedData.files, currentPage, itemsPerPage);
                receivedData = paginateResult.displayedData;
                paginationData = {
                    currentPage: currentPage,
                    totalPages: Math.ceil(cachedResult.totalItems / itemsPerPage),
                    totalItems: cachedResult.totalItems,
                    limit: itemsPerPage
                };
                currentTotalItems = cachedResult.totalItems;
                totalPages = paginationData.totalPages;
                currentFetchedData = receivedData;
                currentPaginationData = paginationData;
                renderFileList('', receivedData, true, searchTerm.trim(), paginationData, true);
            } else {
                console.log(`发起 AI 搜索(未缓存): "${searchTerm}"`);
                const aiSearchUrl = `${API_ENDPOINTS.aiSearch}?query=${encodeURIComponent(searchTerm.trim())}&topK=50`;
                const response = await fetch(aiSearchUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                try {
                    result = await response.json();
                } catch (jsonError) {
                    console.error("JSON 解析错误:", jsonError);
                    result = { success: false, error: `无法解析响应: ${response.statusText}` };
                }
                if (response.ok && result.success) {
                    isShowingSearchResults = true;
                    if (result.files?.length === 0 && result.message) {
                        searchCache.set(aiCacheKey, {
                            files: [],
                            totalItems: 0,
                            message: result.message,
                            timestamp: Date.now()
                        });
                        fileListElement.innerHTML = `
                            <li class="empty-state">
                                <i class="fas fa-robot u-font-large-icon opacity-low"></i>
                                ${result.message}
                            </li>
                        `;
                        updateBreadcrumb('', true, searchTerm.trim());
                        renderPaginationControls(null);
                        fileListElement.style.minHeight = '';
                        updateUploadButtonLink();
                        updateSelectAllButtonState();
                        return;
                    }
                    const allFiles = result.files || [];
                    const allDirectories = result.directories || [];
                    const totalFound = result.totalItems || allFiles.length;
                    searchCache.set(aiCacheKey, {
                        files: allFiles,
                        directories: allDirectories,
                        totalItems: totalFound,
                        timestamp: Date.now()
                    });
                    console.log(`AI 搜索结果已缓存: "${searchTerm}", 共 ${totalFound} 条`);
                    currentRawData = {
                        directories: [...allDirectories],
                        files: [...allFiles]
                    };
                    const sortedData = sortData(currentRawData, currentSortOption);
                    const paginateResult = paginateSearchResults(sortedData.directories, sortedData.files, currentPage, itemsPerPage);
                    receivedData = paginateResult.displayedData;
                    paginationData = {
                        currentPage: currentPage,
                        totalPages: Math.ceil(totalFound / itemsPerPage),
                        totalItems: totalFound,
                        limit: itemsPerPage
                    };
                    currentTotalItems = totalFound;
                    totalPages = paginationData.totalPages;
                    currentFetchedData = receivedData;
                    currentPaginationData = paginationData;
                    renderFileList('', receivedData, true, searchTerm.trim(), paginationData, true);
                } else {
                    throw new Error(result?.error || `HTTP 错误 ${response.status}`);
                }
            }
        } else {
            let receivedData = { files: [], directories: [] };
            let paginationData = {};
            let isCacheHit = false;
            if (isGlobal && searchTerm && searchTerm.length > 0) {
                if (searchCache.has(searchTerm)) {
                    console.log(`命中搜索缓存: "${searchTerm}"`);
                    const cachedResult = searchCache.get(searchTerm);
                    if (cachedResult.files.length === 0 && cachedResult.message) {
                        fileListElement.innerHTML = `
                            <li class="empty-state">
                                <i class="fas fa-search u-font-large-icon opacity-low"></i>
                                ${cachedResult.message}
                            </li>
                        `;
                        updateBreadcrumb(isGlobal ? '' : prefix, isGlobal, searchTerm.trim());
                        renderPaginationControls(null);
                        return;
                    }
                    currentRawData = {
                        directories: [...(cachedResult.directories || [])],
                        files: [...cachedResult.files]
                    };
                    const sortedData = sortData(currentRawData, currentSortOption);
                    const paginateResult = paginateSearchResults(sortedData.directories, sortedData.files, currentPage, itemsPerPage);
                    receivedData = paginateResult.displayedData;
                    paginationData = {
                        currentPage: currentPage,
                        totalPages: Math.ceil(cachedResult.totalItems / itemsPerPage),
                        totalItems: cachedResult.totalItems,
                        limit: itemsPerPage
                    };
                    currentTotalItems = cachedResult.totalItems;
                    totalPages = paginationData.totalPages;
                    isCacheHit = true;
                    currentFetchedData = receivedData;
                    currentPaginationData = paginationData;
                    renderFileList('', receivedData, true, searchTerm.trim(), paginationData, false);
                    fileListElement.style.minHeight = '';
                    updateUploadButtonLink();
                    updateSelectAllButtonState();
                    return;
                } else {
                    console.log(`发起全局搜索(未缓存): "${searchTerm}", fetching all items...`);
                    const urlParams = new URLSearchParams();
                    urlParams.append('search', searchTerm.trim());
                    const url = `${FILES_API_URL}?${urlParams.toString()}`;
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    });
                    let result;
                    try {
                        result = await response.json();
                    } catch (jsonError) {
                        console.error("JSON 解析错误:", jsonError);
                        result = { success: false, error: `无法解析响应: ${response.statusText}` };
                    }
                    if (response.ok && result.success) {
                        if (result.files?.length === 0 && result.message) {
                            searchCache.set(searchTerm, {
                                files: [],
                                totalItems: 0,
                                message: result.message,
                                timestamp: Date.now()
                            });
                            fileListElement.innerHTML = `
                                    <li class="empty-state">
                                        <i class="fas fa-search u-font-large-icon opacity-low"></i>
                                        ${result.message}
                                    </li>
                                `;
                            updateBreadcrumb(isGlobal ? '' : prefix, isGlobal, searchTerm.trim());
                            renderPaginationControls(null);
                            fileListElement.style.minHeight = '';
                            updateUploadButtonLink();
                            updateSelectAllButtonState();
                            return;
                        }
                        const allFiles = result.files || [];
                        const allDirectories = result.directories || [];
                        const totalFound = result.totalItems || allFiles.length;
                        searchCache.set(searchTerm, {
                            files: allFiles,
                            directories: allDirectories,
                            totalItems: totalFound,
                            timestamp: Date.now()
                        });
                        console.log(`搜索结果已缓存: "${searchTerm}", 共 ${totalFound} 条`);
                        currentRawData = {
                            directories: [...allDirectories],
                            files: [...allFiles]
                        };
                        const sortedData = sortData(currentRawData, currentSortOption);
                        const paginateResult = paginateSearchResults(sortedData.directories, sortedData.files, currentPage, itemsPerPage);
                        receivedData = paginateResult.displayedData;
                        paginationData = {
                            currentPage: currentPage,
                            totalPages: Math.ceil(totalFound / itemsPerPage),
                            totalItems: totalFound,
                            limit: itemsPerPage
                        };
                        currentTotalItems = totalFound;
                        totalPages = paginationData.totalPages;
                        isCacheHit = true;
                        currentFetchedData = receivedData;
                        currentPaginationData = paginationData;
                        renderFileList('', receivedData, true, searchTerm.trim(), paginationData, false);
                        fileListElement.style.minHeight = '';
                        updateUploadButtonLink();
                        updateSelectAllButtonState();
                        return;
                    } else {
                        throw new Error(result?.error || `HTTP 错误 ${response.status}`);
                    }
                }
            }
            if (!isCacheHit) {
                if (!isGlobal) {
                    if (directoryCache[prefix] && directoryCache[prefix].timestamp > Date.now() - 300000) {
                        console.log(`命中目录缓存: "${prefix || '根目录'}"`);
                        receivedData = directoryCache[prefix].data;
                        currentCursor = directoryCache[prefix].cursor || null;
                        currentHasMore = directoryCache[prefix].hasMore || false;
                        isCacheHit = true;
                    } else {
                        console.log(`加载目录: "${prefix || '根目录'}"`);
                        let urlParams = new URLSearchParams();
                        urlParams.append('prefix', prefix);
                        isShowingSearchResults = false;
                        const url = `${FILES_API_URL}?${urlParams.toString()}`;
                        const response = await fetch(url, {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${token}` },
                        });
                        try {
                            result = await response.json();
                        } catch (jsonError) {
                            throw new Error(`无法解析响应`);
                        }
                        if (response.ok && result.success) {
                            receivedData = {
                                files: result.files || [],
                                directories: result.directories || [],
                                currentFolder: result.currentFolder || null
                            };
                            currentCursor = result.cursor || null;
                            currentHasMore = result.hasMore || false;
                            directoryCache[prefix] = {
                                data: receivedData,
                                cursor: result.cursor || null,
                                hasMore: result.hasMore || false,
                                timestamp: Date.now()
                            };
                        } else {
                            throw new Error(result?.error || `HTTP 错误 ${response.status}`);
                        }
                    }
                    currentRawData = {
                        directories: [...(receivedData.directories || [])],
                        files: [...(receivedData.files || [])]
                    };
                    let processedData = sortData(currentRawData, currentSortOption);
                    processedData = filterByFolderSearch(processedData, currentFolderSearchTerm);
                    const allDirs = processedData.directories || [];
                    const allFiles = processedData.files || [];
                    const totalFilesAndDirs = allDirs.length + allFiles.length;
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const displayedData = { files: [], directories: [] };
                    if (startIndex < allDirs.length) {
                        const dirEnd = Math.min(endIndex, allDirs.length);
                        displayedData.directories = allDirs.slice(startIndex, dirEnd);
                    }
                    if (endIndex > allDirs.length) {
                        const fileStart = Math.max(0, startIndex - allDirs.length);
                        const fileEnd = endIndex - allDirs.length;
                        displayedData.files = allFiles.slice(fileStart, fileEnd);
                    }
                    paginationData = {
                        currentPage: currentPage,
                        totalPages: Math.ceil(totalFilesAndDirs / itemsPerPage) || 1,
                        totalItems: totalFilesAndDirs,
                        limit: itemsPerPage
                    };
                    currentTotalItems = totalFilesAndDirs;
                    totalPages = paginationData.totalPages;
                    currentFetchedData = displayedData;
                    currentPaginationData = paginationData;
                    renderFileList(isGlobal ? '' : prefix, displayedData, isGlobal, isGlobal ? searchTerm.trim() : '', paginationData, false, receivedData.currentFolder);
                    fileListElement.style.minHeight = '';
                    updateUploadButtonLink();
                    updateSelectAllButtonState();
                    renderLoadMoreButton(false);
                    return;
                }
            }
            currentFetchedData = receivedData;
            currentPaginationData = paginationData;
            const allDirs = receivedData.directories || [];
            const allFiles = receivedData.files || [];
            const totalItems = allDirs.length + allFiles.length;
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const slicedData = { files: [], directories: [] };
            if (startIndex < allDirs.length) {
                slicedData.directories = allDirs.slice(startIndex, Math.min(endIndex, allDirs.length));
            }
            if (endIndex > allDirs.length) {
                const fileStart = Math.max(0, startIndex - allDirs.length);
                const fileEnd = endIndex - allDirs.length;
                slicedData.files = allFiles.slice(fileStart, fileEnd);
            }
            const finalPagination = {
                currentPage: currentPage,
                totalPages: Math.ceil(totalItems / itemsPerPage) || 1,
                totalItems: totalItems,
                limit: itemsPerPage
            };
            totalPages = finalPagination.totalPages;
            currentPaginationData = finalPagination;
            if (slicedData.files) {
                slicedData.files.forEach((file) => {
                    file.isDirectoryPlaceholder = false;
                });
            }
            renderFileList(isGlobal ? '' : prefix, slicedData, isGlobal, isGlobal ? searchTerm.trim() : '', finalPagination, false, receivedData.currentFolder);
        }
    } catch (error) {
        console.error("获取文件列表请求出错:", error);
        showNotification(`获取文件列表请求出错: ${error.message}`, 'error');
        fileListElement.innerHTML = `
            <li class="empty-state error">
                <i class="fas fa-wifi u-font-large-icon"></i>
                获取文件列表请求出错: ${error.message}
            </li>
        `;
        updateBreadcrumb(isGlobal ? '' : prefix, isGlobal, searchTerm.trim());
        renderPaginationControls(null);
    }
    const fileListContainer = document.querySelector('.file-list-container');
    if (fileListContainer) {
        const rect = fileListContainer.getBoundingClientRect();
        if (rect.top < 80) {
            const offset = 80;
            const targetY = window.scrollY + rect.top - offset;
            window.scrollTo({ top: targetY, behavior: 'auto' });
        }
    }
    fileListElement.style.minHeight = '';
    updateUploadButtonLink();
    updateSelectAllButtonState();
}
