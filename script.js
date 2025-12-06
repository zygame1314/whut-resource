console.log(`%c${[
'                                                            ',
'                                                            ',
' ▄▄▄▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄  ▄▄   ▄▄ ▄▄▄▄▄ ▄██ ████▄ ▄██ ██  ██ ',
'   ▄█▀ ▀███▀ ██ ▄▄ ██▀██ ██▀▄▀██ ██▄▄   ██  ▄▄██  ██ ▀█████ ',
' ▄██▄▄   █   ▀███▀ ██▀██ ██   ██ ██▄▄▄  ██ ▄▄▄█▀  ██     ██ ',
'                                                            ',
'     Developed by zygame1314',
' 既然你发现了这里，说明你也是个爱折腾的人。',
' 愿代码与你同在！',
''
].join('\n')}`, "font-family: 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace; color: #007BFF;");
const fileListElement = document.getElementById('file-list');
const breadcrumbListElement = document.getElementById('breadcrumb-list');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const themeToggle = document.getElementById('theme-toggle');
const fileCountElement = document.getElementById('file-count');
const totalSizeElement = document.getElementById('total-size');
const viewButtons = document.querySelectorAll('.view-btn');
const filterButtons = document.querySelectorAll('.filter-btn');
const fileListContainer = document.querySelector('.file-list-container');
const previewModal = document.getElementById('preview-modal');
const previewTitle = document.getElementById('preview-title');
const previewIframe = document.getElementById('preview-iframe');
const closePreviewBtn = document.getElementById('close-preview');
const FILES_API_URL = `/api/files`;
const DOWNLOAD_API_BASE_URL = `/api/download`;
const folderTreeElement = document.getElementById('folder-tree');
const hotFoldersListElement = document.getElementById('hot-folders-list');
const recentUploadsSection = document.getElementById('recent-uploads-section');
const recentUploadsListElement = document.getElementById('recent-uploads-list');
const refreshRecentUploadsBtn = document.getElementById('refresh-recent-uploads');
async function fetchAndRenderHotFolders() {
    const token = localStorage.getItem('authToken');
    if (!token || !hotFoldersListElement) return;
    hotFoldersListElement.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';
    try {
        const response = await fetch(`${FILES_API_URL}?action=getHotFolders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success && result.hotFolders) {
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
                li.innerHTML = `
                    <span class="hot-folder-name" title="${folder.name}">
                       <i class="fas fa-folder"></i>
                       ${folder.name}
                    </span>
                    <span class="hot-folder-downloads">
                        <i class="fas fa-fire"></i> ${folder.total_downloads}
                    </span>
                `;
                li.addEventListener('click', () => {
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
async function fetchAndRenderRecentUploads(showToast = false) {
    if (!recentUploadsListElement) return;
    const token = localStorage.getItem('authToken');
    if (!token) {
        recentUploadsListElement.innerHTML = '<li class="empty-state-small">请先完成验证以查看最近上传</li>';
        return;
    }
    if (showToast) {
        showNotification('正在刷新最近上传列表...', 'info');
    }
    recentUploadsListElement.innerHTML = `
        <li class="loading-item">
            <div class="loading-spinner"></div>
            <span>正在加载最近上传...</span>
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
            const folderName = normalizedPath ? normalizedPath.split('/').filter(Boolean).pop() || '根目录' : '根目录';
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
                            ${folderName}
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
                    openLinkBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            const token = localStorage.getItem('authToken');
                            if (token) {
                                await fetch(`${FILES_API_URL}?action=recordLinkClick&key=${encodeURIComponent(file.key)}`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                            }
                        } catch (err) {
                            console.warn('记录链接点击失败:', err);
                        }
                        window.open(file.link_url, '_blank');
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
                pathChip.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
    folderTreeElement.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';
    try {
        const response = await fetch(`${FILES_API_URL}?action=listAllDirs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.success) {
            const tree = buildTree(result.directories);
            renderFolderTree(tree, folderTreeElement);
        } else {
            folderTreeElement.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">无法加载文件夹树。</p>';
            console.error('获取文件夹树失败:', result.error);
            showNotification(`获取文件夹树失败: ${result.error}`, 'error');
        }
    } catch (error) {
        folderTreeElement.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">加载文件夹树时出错。</p>';
        console.error('请求文件夹树出错:', error);
        showNotification(`请求文件夹树出错: ${error.message}`, 'error');
    }
}
function buildTree(paths) {
    const tree = {};
    paths.forEach(path => {
        let currentLevel = tree;
        const parts = path.split('/').filter(p => p);
        parts.forEach(part => {
            if (!currentLevel[part]) {
                currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
        });
    });
    return tree;
}
function renderFolderTree(tree, container) {
    container.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'folder-tree-list';
    Object.keys(tree).sort().forEach(key => {
        const node = tree[key];
        const li = renderFolderNode(key, node, '');
        ul.appendChild(li);
    });
    container.appendChild(ul);
}
function renderFolderNode(name, node, currentPath) {
    const li = document.createElement('li');
    li.className = 'folder-tree-node';
    const fullPath = currentPath ? `${currentPath}${name}/` : `${name}/`;
    const hasChildren = Object.keys(node).length > 0;
    const nodeContent = document.createElement('div');
    nodeContent.className = 'folder-tree-item';
    nodeContent.innerHTML = `
        <span class="folder-item-main">
            <i class="fas fa-chevron-right folder-toggle-icon ${hasChildren ? '' : 'hidden'}"></i>
            <i class="fas fa-folder folder-icon"></i>
            <span class="folder-name" title="${name}">${name}</span>
        </span>
        <button class="go-to-folder-btn" title="进入文件夹">
            <i class="fas fa-arrow-right"></i>
        </button>
    `;
    nodeContent.addEventListener('click', () => {
        if (hasChildren) {
            const sublist = li.querySelector('.folder-tree-list');
            if (sublist) {
                sublist.style.display = sublist.style.display === 'none' ? 'block' : 'none';
                li.querySelector('.folder-toggle-icon').classList.toggle('expanded');
            }
        }
    });
    const goToBtn = nodeContent.querySelector('.go-to-folder-btn');
    goToBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchAndDisplayFiles(fullPath);
        document.querySelectorAll('.folder-tree-item.active').forEach(item => item.classList.remove('active'));
        nodeContent.classList.add('active');
    });
    li.appendChild(nodeContent);
    if (hasChildren) {
        const sublist = document.createElement('ul');
        sublist.className = 'folder-tree-list';
        sublist.style.display = 'none';
        Object.keys(node).sort().forEach(key => {
            const childNode = renderFolderNode(key, node[key], fullPath);
            sublist.appendChild(childNode);
        });
        li.appendChild(sublist);
    }
    return li;
}
let currentPrefix = '';
let currentView = 'list';
let currentFilter = 'all';
const directoryCache = {};
let isShowingSearchResults = false;
let isSelectionMode = false;
let selectedItems = new Set();
let selectedDirectoryKeys = new Set();
let currentPage = 1;
let totalPages = 1;
let itemsPerPage = 20;
let currentTotalItems = 0;
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}
function updateThemeIcon(theme) {
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}
function createParticleBackground() {
    const particlesContainer = document.getElementById('particles-background');
    if (!particlesContainer) return;
    const existingParticles = particlesContainer.querySelectorAll('.particle');
    existingParticles.forEach(p => p.remove());
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(46, 139, 87, ${Math.random() * 0.5 + 0.1});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 10 + 10}s linear infinite;
        `;
        particlesContainer.appendChild(particle);
    }
}
function formatBytes(bytes, decimals = 2) {
    if (bytes == null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    return (isNaN(size) ? 0 : size) + ' ' + sizes[i];
}
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) {
        return Math.floor(interval) + " 年前";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
        return Math.floor(interval) + " 个月前";
    }
    interval = seconds / 86400;
    if (interval > 1) {
        return Math.floor(interval) + " 天前";
    }
    interval = seconds / 3600;
    if (interval > 1) {
        return Math.floor(interval) + " 小时前";
    }
    interval = seconds / 60;
    if (interval > 1) {
        return Math.floor(interval) + " 分钟前";
    }
    return "刚刚";
}
function getFileIcon(fileName, isDirectory = false) {
    if (isDirectory) return 'fas fa-folder';
    const ext = fileName.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fas fa-file-pdf',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint',
        'txt': 'fas fa-file-alt',
        'jpg': 'fas fa-file-image',
        'jpeg': 'fas fa-file-image',
        'png': 'fas fa-file-image',
        'gif': 'fas fa-file-image',
        'webp': 'fas fa-file-image',
        'mp4': 'fas fa-file-video',
        'avi': 'fas fa-file-video',
        'mov': 'fas fa-file-video',
        'mp3': 'fas fa-file-audio',
        'wav': 'fas fa-file-audio',
        'zip': 'fas fa-file-archive',
        'rar': 'fas fa-file-archive',
        '7z': 'fas fa-file-archive'
    };
    return iconMap[ext] || 'fas fa-file';
}
function getFileType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const typeMap = {
        'pdf': 'pdf',
        'doc': 'doc',
        'docx': 'doc',
        'xls': 'excel',
        'xlsx': 'excel',
        'ppt': 'ppt',
        'pptx': 'ppt',
        'txt': 'text',
        'jpg': 'image',
        'jpeg': 'image',
        'png': 'image',
        'webp': 'image',
        'gif': 'image',
        'mp4': 'video',
        'avi': 'video',
        'mov': 'video'
    };
    return typeMap[ext] || 'default';
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
async function openLink(fileKey, linkUrl, openBtn) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录后再访问链接。", 'error');
        return;
    }
    let originalBtnContent = '';
    if (openBtn) {
        originalBtnContent = openBtn.innerHTML;
        openBtn.disabled = true;
        openBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    try {
        if (linkUrl) {
            try {
                await fetch(`${FILES_API_URL}?action=recordLinkClick&key=${encodeURIComponent(fileKey)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
            } catch (e) {
                console.warn('记录链接点击失败:', e);
            }
            window.open(linkUrl, '_blank', 'noopener,noreferrer');
            showNotification('链接已在新标签页中打开', 'success');
        } else {
            showNotification('链接地址无效', 'error');
        }
    } catch (error) {
        console.error(`打开链接 ${fileKey} 出错:`, error);
        showNotification(`打开链接出错: ${error.message}`, 'error');
    } finally {
        if (openBtn) {
            openBtn.disabled = false;
            openBtn.innerHTML = originalBtnContent || '<i class="fas fa-external-link-alt"></i> 打开链接';
        }
    }
}
async function downloadFile(fileKey, downloadBtn) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法下载：未获取到验证令牌。请重新登录。", 'error');
        return;
    }
    let originalBtnContent = '';
    if (downloadBtn) {
        originalBtnContent = downloadBtn.innerHTML;
        downloadBtn.disabled = true;
        downloadBtn.classList.add('downloading');
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="download-progress-text">准备下载...</span>';
    }
    try {
        const previewApiUrl = `/api/preview?key=${encodeURIComponent(fileKey)}&expiresIn=86400`;
        const response = await fetch(previewApiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        const result = await response.json();
        if (response.ok && result.success && result.url) {
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = result.url;
            a.download = fileKey.includes('/') ? fileKey.substring(fileKey.lastIndexOf('/') + 1) : fileKey;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification('已开始下载，请查看右上角下载进度。', 'success');
        } else {
            throw new Error(result.error || '获取下载链接失败');
        }
    } catch (error) {
        console.error(`下载 ${fileKey} 请求出错:`, error);
        showNotification(`下载错误: ${error.message}`, 'error');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('downloading');
            if (originalBtnContent) {
                downloadBtn.innerHTML = originalBtnContent;
            } else {
                downloadBtn.innerHTML = '<i class="fas fa-download"></i> 下载';
            }
        }
    }
}
async function deleteFile(key, isDirectory) {
    const performDelete = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error("无法删除：未获取到验证令牌。请重新登录。");
        }
        const response = await fetch(`${FILES_API_URL}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                key: key
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '删除失败，请稍后重试');
        }
        showNotification(`${isDirectory ? '文件夹' : '文件'} "${key}" 已删除`, 'success');
        const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        if (directoryCache[parentPrefix]) delete directoryCache[parentPrefix];
        fetchAndDisplayFiles(currentPrefix, '', currentPage);
    };
    try {
        const confirmed = await showConfirmation({
            title: '确认删除',
            message: `你确定要永久删除 "${key}" 吗？<br><b>此操作不可逆！</b>`,
            confirmText: '永久删除',
            confirmClass: 'confirm-btn-danger'
        });
        if (!confirmed) {
            showNotification('删除操作已取消', 'info');
            return;
        }
        await performDelete();
    } catch (error) {
        if (error.message !== '用户取消验证' && error.message !== 'User cancelled') {
            showNotification(`删除操作失败: ${error.message}`, 'error');
        } else {
            showNotification('删除操作已取消', 'info');
        }
        console.log('删除操作处理完毕:', error.message);
    }
}
async function previewFile(fileKey, fileName, fileSize) {
    const extension = fileName.split('.').pop().toLowerCase();
    const officeExtensions = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];
    const pdfExtensions = ['pdf'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const txtExtensions = ['txt'];
    const isVideo = videoExtensions.includes(extension);
    if (!isVideo && fileSize > 300 * 1024 * 1024) {
        showNotification('文件超过300MB，不支持预览。', 'info');
        return;
    }
    if (isVideo && fileSize > 300 * 1024 * 1024) {
        showNotification('视频文件超过300MB，不支持在线播放。', 'info');
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法预览：未获取到验证令牌。", 'error');
        return;
    }
    const previewLoader = previewModal.querySelector('.preview-loader');
    previewTitle.textContent = `预览: ${fileName}`;
    previewModal.classList.add('visible');
    previewLoader.style.display = 'flex';
    previewIframe.style.display = 'none';
    const existingImageWrapper = previewModal.querySelector('.preview-image-wrapper');
    if (existingImageWrapper) existingImageWrapper.remove();
    const existingVideoWrapper = previewModal.querySelector('.preview-video-wrapper');
    if (existingVideoWrapper) existingVideoWrapper.remove();
    const existingTextWrapper = previewModal.querySelector('.preview-text-wrapper');
    if (existingTextWrapper) existingTextWrapper.remove();
    try {
        const isOfficePreview = officeExtensions.includes(extension);
        const isPdfPreview = pdfExtensions.includes(extension);
        const isImagePreview = imageExtensions.includes(extension);
        const isVideoPreview = videoExtensions.includes(extension);
        const isTxtPreview = txtExtensions.includes(extension);
        if (isOfficePreview || isPdfPreview || isImagePreview || isVideoPreview || isTxtPreview) {
            const apiUrl = new URL(`/api/preview`, window.location.origin);
            apiUrl.searchParams.append('key', fileKey);
            if (isOfficePreview) {
                apiUrl.searchParams.append('office', 'true');
            }
            if (isPdfPreview || isImagePreview || isVideoPreview) {
                apiUrl.searchParams.append('inline', 'true');
            }
            if (isTxtPreview) {
                apiUrl.searchParams.append('type', 'text');
            }
            const response = await fetch(apiUrl.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '无法获取文件预览链接');
            }
            const hideLoader = () => {
                previewLoader.style.display = 'none';
                previewLoader.style.pointerEvents = 'none';
            };
            if (isTxtPreview) {
                const textPreviewWrapper = document.createElement('div');
                textPreviewWrapper.className = 'preview-text-wrapper';
                textPreviewWrapper.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: var(--background-primary); color: var(--text-primary); overflow: auto;';
                const pre = document.createElement('pre');
                pre.className = 'preview-text';
                pre.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; padding: 20px; margin: 0; font-family: var(--font-mono); font-size: 0.9rem;';
                pre.textContent = data.content;
                textPreviewWrapper.appendChild(pre);
                previewIframe.parentElement.appendChild(textPreviewWrapper);
                hideLoader();
            } else {
                const previewUrl = data.url;
                if (isImagePreview) {
                    const previewContent = previewIframe.parentElement;
                    const imageWrapper = document.createElement('div');
                    imageWrapper.className = 'preview-image-wrapper';
                    imageWrapper.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: var(--background-primary);';
                    const img = document.createElement('img');
                    img.src = previewUrl;
                    img.className = 'preview-image';
                    img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; display: none;';
                    img.onload = () => {
                        hideLoader();
                        img.style.display = 'block';
                    };
                    img.onerror = () => {
                        hideLoader();
                        showNotification('图片加载失败', 'error');
                    };
                    imageWrapper.appendChild(img);
                    previewContent.appendChild(imageWrapper);
                } else if (isVideoPreview) {
                    const previewContent = previewIframe.parentElement;
                    const videoWrapper = document.createElement('div');
                    videoWrapper.className = 'preview-video-wrapper';
                    videoWrapper.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: var(--background-primary);';
                    const video = document.createElement('video');
                    video.src = previewUrl;
                    video.className = 'preview-video';
                    video.controls = true;
                    video.autoplay = false;
                    video.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
                    video.onloadeddata = hideLoader;
                    video.onerror = (e) => {
                        hideLoader();
                        showNotification('视频加载失败', 'error');
                        console.error('视频加载错误:', e);
                    };
                    videoWrapper.appendChild(video);
                    previewContent.appendChild(videoWrapper);
                } else {
                    previewIframe.onload = hideLoader;
                    previewIframe.onerror = () => {
                        hideLoader();
                        showNotification('预览加载失败', 'error');
                    };
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    if (isOfficePreview) {
                        const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewUrl)}`;
                        if (isMobile) {
                            window.open(officeViewerUrl, '_blank');
                            previewModal.classList.remove('visible');
                            previewLoader.style.display = 'none';
                            return;
                        } else {
                            previewIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
                            previewIframe.src = officeViewerUrl;
                        }
                    } else {
                        if (isMobile) {
                            window.open(previewUrl, '_blank');
                            previewModal.classList.remove('visible');
                            previewLoader.style.display = 'none';
                            return;
                        }
                        previewIframe.removeAttribute('sandbox');
                        previewIframe.src = previewUrl;
                    }
                    previewIframe.style.display = 'block';
                }
            }
        } else {
            showNotification('该文件类型不支持预览。', 'info');
            previewModal.classList.remove('visible');
            return;
        }
    } catch (error) {
        console.error("预览文件时出错:", error);
        showNotification(`预览失败: ${error.message}`, 'error');
        previewLoader.style.display = 'none';
        previewModal.classList.remove('visible');
    }
}
function showConfirmation({
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    confirmClass = ''
}) {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">${cancelText}</button>
                    <button class="confirm-btn ${confirmClass}">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const closeModal = (result) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                resolve(result);
            }, {
                once: true
            });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => closeModal(true));
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(false));
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal(false);
            }
        });
    });
}
function showPrompt({
    title,
    message,
    initialValue = '',
    placeholder = '',
    confirmText = '确认',
    cancelText = '取消'
}) {
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="prompt-input-container">
                    <input type="text" id="prompt-input" placeholder="${placeholder}" value="${initialValue}">
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">${cancelText}</button>
                    <button class="confirm-btn">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const input = modalOverlay.querySelector('#prompt-input');
        input.focus();
        input.select();
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                if (value !== null) {
                    resolve(value);
                } else {
                    reject(new Error('User cancelled'));
                }
            }, {
                once: true
            });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => closeModal(input.value));
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                closeModal(input.value);
            } else if (e.key === 'Escape') {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal(null);
            }
        });
    });
}
function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#3498DB'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateX(calc(100% + 20px));
        transition: transform 0.4s ease, opacity 0.4s ease;
        max-width: 500px;
        font-weight: 500;
        opacity: 0;
        cursor: pointer;
    `;
    const icon = type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';
    notification.innerHTML = `<i class="${icon}" style="margin-right: 0.5rem;"></i>${message}`;
    container.appendChild(notification);
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    const removeNotification = () => {
        notification.style.transform = 'translateX(calc(100% + 20px))';
        notification.style.opacity = '0';
        notification.addEventListener('transitionend', () => {
            notification.remove();
            if (container.children.length === 0 && container.parentNode) {
                container.remove();
            }
        });
    };
    const timeoutId = setTimeout(removeNotification, 3000);
    notification.addEventListener('click', () => {
        clearTimeout(timeoutId);
        removeNotification();
    });
}
function updateBreadcrumb(prefix, isSearch = false, searchTerm = '') {
    if (!breadcrumbListElement) return;
    breadcrumbListElement.innerHTML = '';
    if (isSearch) {
        const searchItem = document.createElement('li');
        searchItem.className = 'breadcrumb-item';
        searchItem.setAttribute('aria-current', 'page');
        searchItem.innerHTML = `<i class="fas fa-search" style="margin-right: 0.5rem;"></i>搜索结果: "${searchTerm}"`;
        breadcrumbListElement.appendChild(searchItem);
        return;
    }
    const rootLi = document.createElement('li');
    rootLi.classList.add('breadcrumb-item');
    const rootLink = document.createElement('a');
    rootLink.href = '#';
    rootLink.textContent = '根目录';
    rootLink.onclick = (e) => {
        e.preventDefault();
        fetchAndDisplayFiles('');
    };
    rootLi.appendChild(rootLink);
    breadcrumbListElement.appendChild(rootLi);
    if (prefix) {
        const parts = prefix.endsWith('/') ? prefix.slice(0, -1).split('/') : prefix.split('/');
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += part + '/';
            const li = document.createElement('li');
            li.classList.add('breadcrumb-item');
            if (index === parts.length - 1) {
                li.textContent = part;
                li.setAttribute('aria-current', 'page');
            } else {
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = part;
                const pathOnClick = currentPath;
                link.onclick = (e) => {
                    e.preventDefault();
                    fetchAndDisplayFiles(pathOnClick);
                };
                li.appendChild(link);
            }
            breadcrumbListElement.appendChild(li);
        });
    }
}
function getLinkIcon() {
    return 'fas fa-external-link-alt';
}
function createFileListItem(item, isDirectory, isGlobalSearch = false) {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.dataset.key = item.key;
    const isLink = item.is_link === true || item.is_link === 1;
    li.dataset.itemType = isDirectory ? 'directory' : (isLink ? 'link' : 'file');
    item.isDirectory = !!isDirectory;
    item.isLink = isLink;
    if (isLink) {
        li.classList.add('link-item');
    }
    li.style.opacity = '0';
    li.style.animation = 'fadeIn 0.3s ease-out forwards';
    const fileType = isDirectory ? 'folder' : (isLink ? 'link' : getFileType(item.name));
    const iconClass = isLink ? getLinkIcon() : getFileIcon(item.name, isDirectory);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-checkbox';
    checkbox.dataset.key = item.key;
    checkbox.onchange = (e) => handleItemSelection(e.target, item);
    const fileItemDiv = document.createElement('div');
    fileItemDiv.className = 'file-item';
    let metaContent = '';
    if (isDirectory) {
        metaContent = '<div class="file-meta">文件夹</div>';
    } else if (isLink) {
        metaContent = `<div class="file-meta"><i class="fas fa-link"></i> 外部链接 • ${formatDate(item.uploaded)} • <i class="fas fa-mouse-pointer"></i> ${item.downloads || 0}</div>`;
    } else {
        metaContent = `<div class="file-meta">${formatBytes(item.size)} • ${formatDate(item.uploaded)} • <i class="fas fa-download"></i> ${item.downloads || 0}</div>`;
    }
    fileItemDiv.innerHTML = `
        <div class="file-icon ${fileType}">
            <i class="${iconClass}"></i>
        </div>
        <div class="file-info">
            <div class="file-name">${item.name}${isLink ? ' <span class="link-badge"><i class="fas fa-external-link-alt"></i></span>' : ''}</div>
            ${isGlobalSearch && typeof item.parent_path === 'string' ? `<div class="file-path clickable">${item.parent_path || '根目录'}</div>` : ''}
            ${metaContent}
        </div>
    `;
    const fileActionsDiv = document.createElement('div');
    fileActionsDiv.className = 'file-actions';
    let previewButtonHTML = '';
    let downloadButtonHTML = '';
    if (!isDirectory && !isLink) {
        const isVideo = fileType === 'video';
        const sizeLimit = isVideo ? 300 * 1024 * 1024 : 300 * 1024 * 1024;
        const previewDisabled = item.size > sizeLimit;
        const disabledTitle = isVideo ? '视频文件超过300MB，不支持在线播放' : '文件超过300MB，不支持预览';
        if (previewDisabled) {
            previewButtonHTML = `<button class="preview-button" disabled title="${disabledTitle}">
                                   <i class="fas fa-eye-slash"></i>
                                   预览
                               </button>`;
        } else {
            previewButtonHTML = `<button class="preview-button">
                                   <i class="fas fa-eye"></i>
                                   预览
                               </button>`;
        }
        downloadButtonHTML = `<button class="download-button">
                <i class="fas fa-download"></i>
                下载
            </button>`;
    } else if (isLink) {
        downloadButtonHTML = `<button class="open-link-button">
                <i class="fas fa-external-link-alt"></i>
                打开链接
            </button>`;
    }
    fileActionsDiv.innerHTML = `
        ${!isDirectory ? `
            ${previewButtonHTML}
            ${downloadButtonHTML}
        ` : ''}
        ${(typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') ? `
        <button class="rename-button" title="重命名">
          <i class="fas fa-pencil-alt"></i>
        </button>
        <button class="move-button" title="移动到...">
           <i class="fas fa-folder-tree"></i>
        </button>
        <button class="delete-button" title="删除">
            <i class="fas fa-trash"></i>
        </button>
        ` : ''}
    `;
    li.appendChild(checkbox);
    li.appendChild(fileItemDiv);
    li.appendChild(fileActionsDiv);
    const pathElement = li.querySelector('.file-path.clickable');
    if (pathElement) {
        pathElement.addEventListener('click', (e) => {
            e.stopPropagation();
            if (searchInput) searchInput.value = '';
            fetchAndDisplayFiles(item.parent_path);
        });
    }
    if (!isDirectory && !isLink) {
        const previewBtn = fileActionsDiv.querySelector('.preview-button');
        if (previewBtn && !previewBtn.disabled) {
            previewBtn.onclick = () => previewFile(item.key, item.name, item.size);
        }
        const downloadBtn = fileActionsDiv.querySelector('.download-button');
        if (downloadBtn) {
            downloadBtn.onclick = () => downloadFile(item.key, downloadBtn);
        }
    }
    if (isLink) {
        const openLinkBtn = fileActionsDiv.querySelector('.open-link-button');
        if (openLinkBtn) {
            openLinkBtn.onclick = (e) => {
                e.stopPropagation();
                openLink(item.key, item.link_url, openLinkBtn);
            };
        }
        fileItemDiv.style.cursor = 'pointer';
        fileItemDiv.onclick = (e) => {
            if (!isSelectionMode) {
                openLink(item.key, item.link_url);
            }
        };
    }
    const deleteBtn = fileActionsDiv.querySelector('.delete-button');
    if (deleteBtn) {
        deleteBtn.onclick = () => deleteFile(item.key, isDirectory);
    }
    const renameBtn = fileActionsDiv.querySelector('.rename-button');
    if (renameBtn) {
        renameBtn.onclick = () => renameFile(item.key, item.name, isDirectory);
    }
    const moveBtn = fileActionsDiv.querySelector('.move-button');
    if (moveBtn) {
        moveBtn.onclick = () => moveItem(item.key, item.name, isDirectory);
    }
    if (isDirectory) {
        fileItemDiv.style.cursor = 'pointer';
        fileItemDiv.onclick = (e) => {
            if (!isSelectionMode) {
                if (searchInput) searchInput.value = '';
                fetchAndDisplayFiles(item.key);
            }
        };
    }
    li.onclick = (e) => {
        if (isSelectionMode && e.target.type !== 'checkbox') {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    };
    return li;
}
function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    fileListElement.classList.toggle('selection-mode', isSelectionMode);
    const selectionModeBtn = document.getElementById('selection-mode-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const btnSpan = selectionModeBtn.querySelector('span');
    selectionModeBtn.classList.toggle('active', isSelectionMode);
    if (isSelectionMode) {
        if (btnSpan) btnSpan.textContent = '退出选择';
        if (selectAllBtn) selectAllBtn.style.display = 'inline-flex';
    } else {
        if (btnSpan) btnSpan.textContent = '批量选择';
        if (selectAllBtn) {
            selectAllBtn.style.display = 'none';
            const selectAllSpan = selectAllBtn.querySelector('span');
            if (selectAllSpan) selectAllSpan.textContent = '全选';
        }
        selectedItems.clear();
        selectedDirectoryKeys.clear();
        document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.file-list-item.selected').forEach(item => item.classList.remove('selected'));
    }
    updateSelectionToolbar();
}
function handleItemSelection(checkbox, item) {
    const listItem = checkbox.closest('.file-list-item');
    const isDirectory = !!item.isDirectory;
    if (checkbox.checked) {
        selectedItems.add(item.key);
        if (isDirectory) {
            selectedDirectoryKeys.add(item.key);
        }
        listItem.classList.add('selected');
    } else {
        selectedItems.delete(item.key);
        if (isDirectory) {
            selectedDirectoryKeys.delete(item.key);
        }
        listItem.classList.remove('selected');
    }
    updateSelectionToolbar();
}
function updateSelectAllButtonState() {
    const selectAllBtn = document.getElementById('select-all-btn');
    if (!selectAllBtn || !isSelectionMode) return;
    const checkboxes = document.querySelectorAll('.file-list-item:not(.back-item) .file-checkbox');
    const totalVisibleItems = checkboxes.length;
    const selectedCount = selectedItems.size;
    const btnSpan = selectAllBtn.querySelector('span');
    if (!btnSpan) return;
    if (totalVisibleItems > 0 && selectedCount === totalVisibleItems) {
        btnSpan.textContent = '取消全选';
    } else {
        btnSpan.textContent = '全选';
    }
}
function updateSelectionToolbar() {
    const toolbar = document.getElementById('selection-toolbar');
    const countSpan = document.getElementById('selection-count');
    const selectedCount = selectedItems.size;
    const batchMoveBtn = document.getElementById('batch-move-btn');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
    if (isSelectionMode && selectedCount > 0) {
        toolbar.classList.add('visible');
        countSpan.textContent = `已选择 ${selectedCount} 项`;
        if (batchMoveBtn) batchMoveBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        if (batchDeleteBtn) batchDeleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    } else {
        toolbar.classList.remove('visible');
        if (batchMoveBtn) batchMoveBtn.style.display = 'none';
        if (batchDeleteBtn) batchDeleteBtn.style.display = 'none';
    }
    updateSelectAllButtonState();
}
function handleSelectAll() {
    const checkboxes = document.querySelectorAll('.file-list-item:not(.back-item) .file-checkbox');
    const allVisibleItems = Array.from(checkboxes).map(cb => cb.closest('.file-list-item'));
    const areAllSelected = selectedItems.size === allVisibleItems.length && allVisibleItems.length > 0;
    if (areAllSelected) {
        allVisibleItems.forEach(item => {
            const checkbox = item.querySelector('.file-checkbox');
            if (checkbox && checkbox.checked) {
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    } else {
        allVisibleItems.forEach(item => {
            const checkbox = item.querySelector('.file-checkbox');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
}
async function handleBatchDelete() {
    const keysToDelete = Array.from(selectedItems);
    if (keysToDelete.length === 0) {
        showNotification('没有选择任何项目', 'info');
        return;
    }
    const performBatchDelete = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error("无法删除：未获取到验证令牌。请重新登录。");
        }
        const response = await fetch(`${FILES_API_URL}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                keys: keysToDelete
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '批量删除失败，请稍后重试');
        }
        showNotification(`成功删除了 ${keysToDelete.length} 个项目`, 'success');
        keysToDelete.forEach(key => {
            const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
            if (directoryCache[parentPrefix]) {
                delete directoryCache[parentPrefix];
            }
        });
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        selectedItems.clear();
        selectedDirectoryKeys.clear();
        fetchAndDisplayFiles(currentPrefix, '', 1).then(() => {
            if (isSelectionMode) toggleSelectionMode();
        });
    };
    try {
        const confirmed = await showConfirmation({
            title: '确认批量删除',
            message: `你确定要永久删除选中的 ${keysToDelete.length} 个项目吗？<br><b>此操作不可逆！</b>`,
            confirmText: '永久删除',
            confirmClass: 'confirm-btn-danger'
        });
        if (!confirmed) {
            showNotification('批量删除操作已取消', 'info');
            return;
        }
        await performBatchDelete();
    } catch (error) {
        if (error.message !== '用户取消验证' && error.message !== 'User cancelled') {
            showNotification(`批量删除操作失败: ${error.message}`, 'error');
        } else {
            showNotification('批量删除操作已取消', 'info');
        }
        console.log('批量删除操作处理完毕:', error.message);
    }
}
async function handleBatchDownload() {
    const selectedKeys = Array.from(selectedItems);
    if (selectedKeys.length === 0) {
        showNotification('没有选择任何项目', 'info');
        return;
    }
    const directoryKeys = selectedKeys.filter(key => selectedDirectoryKeys.has(key));
    const fileKeys = selectedKeys.filter(key => !selectedDirectoryKeys.has(key));
    if (fileKeys.length === 0) {
        showNotification('批量下载暂不支持文件夹，请选择文件后重试。', 'warning');
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法下载：未获取到验证令牌。请重新登录。", 'error');
        return;
    }
    const downloadBtn = document.getElementById('batch-download-btn');
    if (!downloadBtn) {
        showNotification('未找到批量下载按钮，请刷新页面后重试。', 'error');
        return;
    }
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="download-progress-text">获取链接...</span>';
    if (directoryKeys.length > 0) {
        showNotification(`已跳过 ${directoryKeys.length} 个文件夹，暂不支持批量下载。`, 'info');
    }
    showNotification(`正在为 ${fileKeys.length} 个项目生成下载链接...`, 'info');
    try {
        const response = await fetch(`/api/batch-download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                keys: fileKeys
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP error ${response.status}`);
        }
        const filesToDownload = result.files;
        const totalFiles = filesToDownload.length;
        let downloadedCount = 0;
        let failedCount = 0;
        showNotification(`获取到 ${totalFiles} 个下载链接，开始下载...`, 'success');
        const progressSpan = downloadBtn.querySelector('.download-progress-text');
        downloadBtn.querySelector('i').className = 'fas fa-download';
        if (progressSpan) {
            progressSpan.textContent = `下载中 (0/${totalFiles})`;
        }
        const downloadFileWithDelay = async (file, index) => {
            const iconElement = downloadBtn.querySelector('i');
            try {
                if (iconElement) iconElement.className = 'fas fa-spinner fa-spin';
                const downloadUrl = `${file.urlPath}`;
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = file.filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    if (document.body.contains(a)) {
                        document.body.removeChild(a);
                    }
                }, 5000);
                downloadedCount++;
            } catch (e) {
                console.error(`下载文件 ${file.filename} 失败:`, e);
                failedCount++;
            }
            if (iconElement) iconElement.className = 'fas fa-download';
            if (progressSpan) {
                progressSpan.textContent = `已触发 (${downloadedCount}/${totalFiles})`;
            }
            return new Promise(resolve => setTimeout(resolve, 1500));
        };
        for (let i = 0; i < filesToDownload.length; i++) {
            await downloadFileWithDelay(filesToDownload[i], i);
        }
        if (failedCount > 0) {
            showNotification(`批量下载完成。成功 ${downloadedCount} 个，失败 ${failedCount} 个。`, 'warning');
        } else {
            showNotification(`所有 ${totalFiles} 个文件已成功开始下载。`, 'success');
        }
        if (isSelectionMode) {
            toggleSelectionMode();
        }
    } catch (error) {
        console.error(`批量下载失败:`, error);
        showNotification(`批量下载失败: ${error.message}`, 'error');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> 批量下载';
    }
}
async function handleBatchMove() {
    const keysToMove = Array.from(selectedItems);
    if (keysToMove.length === 0) {
        showNotification('没有选择任何项目', 'info');
        return;
    }
    let destinationPath;
    try {
        destinationPath = await showDirectoryPicker(keysToMove);
    } catch (error) {
        showNotification('移动操作已取消', 'info');
        return;
    }
    const performBatchMove = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error("无法移动：未获取到验证令牌。请重新登录。");
        }
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        for (const key of keysToMove) {
            try {
                const response = await fetch(`${FILES_API_URL}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        sourceKey: key,
                        destinationPath: destinationPath
                    }),
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    errorCount++;
                    errors.push(`- ${key.split('/').pop()}: ${result.error || '未知错误'}`);
                } else {
                    successCount++;
                }
            } catch (e) {
                errorCount++;
                errors.push(`- ${key.split('/').pop()}: ${e.message}`);
            }
        }
        if (errorCount > 0) {
            const errorMessage = `移动完成，${successCount}个成功, ${errorCount}个失败。<br>${errors.join('<br>')}`;
            showNotification(errorMessage, 'error');
        } else {
            showNotification(`成功移动了 ${successCount} 个项目`, 'success');
        }
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        if (directoryCache[destinationPath]) delete directoryCache[destinationPath];
        selectedItems.clear();
        selectedDirectoryKeys.clear();
        fetchAndDisplayFiles(currentPrefix, '', 1).then(() => {
            if (isSelectionMode) toggleSelectionMode();
        });
    };
    try {
        await performBatchMove();
    } catch (error) {
        if (error.message !== '用户取消验证' && error.message !== 'User cancelled') {
            showNotification(`批量移动操作失败: ${error.message}`, 'error');
        } else {
            showNotification('批量移动操作已取消', 'info');
        }
    }
}
function renderFileList(prefix, data, isGlobalSearch = false, localSearchTerm = '', paginationData = null) {
    fileListElement.innerHTML = '';
    const lowerLocalSearchTerm = localSearchTerm.trim().toLowerCase();
    if (isGlobalSearch) {
        isShowingSearchResults = true;
        updateBreadcrumb('', true, localSearchTerm);
    } else {
        isShowingSearchResults = false;
        updateBreadcrumb(prefix);
        if (prefix !== '') {
            let lastSlashIndex = prefix.endsWith('/') ? prefix.lastIndexOf('/', prefix.length - 2) : prefix.lastIndexOf('/');
            const parentPrefix = lastSlashIndex >= 0 ? prefix.substring(0, lastSlashIndex + 1) : '';
            const backLi = document.createElement('li');
            backLi.className = 'file-list-item back-item';
            backLi.innerHTML = `
                <div class="file-item">
                    <div class="file-icon folder">
                        <i class="fas fa-arrow-left"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">返回上一级</div>
                        <div class="file-meta">上级目录</div>
                    </div>
                </div>
            `;
            backLi.style.cursor = 'pointer';
            backLi.onclick = (e) => {
                e.preventDefault();
                if (searchInput) searchInput.value = '';
                fetchAndDisplayFiles(parentPrefix);
            };
            fileListElement.appendChild(backLi);
        }
    }
    let displayedDirectories = [];
    if (data.directories && data.directories.length > 0) {
        let filteredDirectories = data.directories;
        if (!isGlobalSearch && lowerLocalSearchTerm) {
            filteredDirectories = filteredDirectories.filter(dir =>
                dir.name.toLowerCase().includes(lowerLocalSearchTerm)
            );
        }
        displayedDirectories = filteredDirectories;
        displayedDirectories.forEach((dir, index) => {
            setTimeout(() => {
                const li = createFileListItem(dir, true, isGlobalSearch);
                fileListElement.appendChild(li);
            }, index * 50);
        });
    }
    let displayedFiles = [];
    if (data.files && data.files.length > 0) {
        let filteredFiles = data.files;
        if (!isGlobalSearch && lowerLocalSearchTerm) {
            filteredFiles = filteredFiles.filter(file =>
                file.name.toLowerCase().includes(lowerLocalSearchTerm)
            );
        }
        if (currentFilter !== 'all') {
            filteredFiles = filteredFiles.filter(file => {
                if (file.isDirectory) return true;
                const fileType = getFileType(file.name);
                return fileType === currentFilter;
            });
        }
        displayedFiles = filteredFiles;
        displayedFiles.forEach((file, index) => {
            if (!file.isDirectoryPlaceholder) {
                setTimeout(() => {
                    const li = createFileListItem(file, !!file.isDirectory, isGlobalSearch);
                    fileListElement.appendChild(li);
                }, (displayedDirectories.length + index) * 50);
            }
        });
    }
    const hasDisplayedContent = displayedDirectories.length > 0 || displayedFiles.length > 0;
    if (!hasDisplayedContent) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-state';
        emptyLi.style.cssText = `
            text-align: center;
            padding: 3rem;
            color: var(--text-secondary);
            font-style: italic;
        `;
        let emptyMessage = '';
        if (isGlobalSearch) {
            emptyMessage = `<i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                           找不到包含 "${localSearchTerm}" 的文件或文件夹`;
        } else if (lowerLocalSearchTerm) {
            emptyMessage = `<i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                           在当前目录中找不到包含 "${localSearchTerm}" 的文件或文件夹`;
        } else {
            emptyMessage = `<i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                           此目录为空`;
        }
        emptyLi.innerHTML = emptyMessage;
        fileListElement.appendChild(emptyLi);
    }
    renderPaginationControls(paginationData);
}
function renderPaginationControls(paginationData) {
    let controlsContainer = document.getElementById('pagination-controls');
    if (!controlsContainer) {
        if (!fileListElement) {
            return;
        }
        console.warn('Pagination controls container not found. Creating one.');
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'pagination-controls';
        controlsContainer.className = 'pagination-controls';
        controlsContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; padding: 1rem; gap: 0.5rem;';
        if (fileListElement.parentNode) {
            fileListElement.parentNode.insertBefore(controlsContainer, fileListElement.nextSibling);
        } else {
            document.body.appendChild(controlsContainer);
        }
    }
    controlsContainer.innerHTML = '';
    if (!paginationData || paginationData.totalPages <= 1) {
        controlsContainer.style.display = 'none';
        return;
    }
    controlsContainer.style.display = 'flex';
    const { currentPage, totalPages, totalItems } = paginationData;
    const scrollToFileList = () => {
        const fileListContainer = document.querySelector('.file-list-container');
        if (fileListContainer) {
            fileListContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> 上一页';
    prevButton.className = 'pagination-button';
    prevButton.disabled = currentPage <= 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage - 1);
        }
    };
    controlsContainer.appendChild(prevButton);
    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页 (共 ${totalItems} 项)`;
    controlsContainer.appendChild(pageInfo);
    const nextButton = document.createElement('button');
    nextButton.innerHTML = '下一页 <i class="fas fa-chevron-right"></i>';
    nextButton.className = 'pagination-button';
    nextButton.disabled = currentPage >= totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage + 1);
        }
    };
    controlsContainer.appendChild(nextButton);
}
async function fetchAndDisplayFiles(prefix = '', searchTerm = '', page = 1) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        fileListElement.innerHTML = `
            <li class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-secondary); cursor: pointer;" title="点击登录">
                <i class="fas fa-user-shield" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                请先完成验证以查看文件
            </li>
        `;
        updateBreadcrumb('');
        isShowingSearchResults = false;
        renderPaginationControls(null);
        return;
    }
    const isGlobal = searchTerm.trim() !== '';
    if (!isGlobal) {
        currentPrefix = prefix;
    }
    if (prefix !== currentPrefix || (isGlobal && !isShowingSearchResults) || page === undefined) {
        currentPage = 1;
    } else {
        currentPage = page;
    }
    if (fileListElement.offsetHeight > 0) {
        fileListElement.style.minHeight = `${fileListElement.offsetHeight}px`;
    }
    fileListElement.innerHTML = `
        <li class="loading-item">
            <div class="loading-spinner"></div>
            <span>正在加载文件列表...<br>(第 ${currentPage} 页)</span>
        </li>
    `;
    renderPaginationControls(null);
    let urlParams = new URLSearchParams();
    if (isGlobal) {
        console.log(`发起全局搜索: "${searchTerm}", page: ${currentPage}`);
        urlParams.append('search', searchTerm.trim());
        isShowingSearchResults = true;
    } else {
        console.log(`加载目录: "${prefix || '根目录'}", page: ${currentPage}`);
        urlParams.append('prefix', prefix);
        isShowingSearchResults = false;
    }
    urlParams.append('page', currentPage.toString());
    urlParams.append('limit', itemsPerPage.toString());
    const url = `${FILES_API_URL}?${urlParams.toString()}`;
    try {
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
            const receivedData = {
                files: result.files || [],
                directories: result.directories || [],
            };
            if (result.files) {
                receivedData.files.forEach((file, index) => {
                    if (result.files[index] && result.files[index].isDirectoryPlaceholder !== undefined) {
                        file.isDirectoryPlaceholder = result.files[index].isDirectoryPlaceholder;
                    } else {
                        file.isDirectoryPlaceholder = false;
                    }
                });
            }
            const paginationData = {
                currentPage: result.currentPage,
                totalPages: result.totalPages,
                totalItems: result.totalItems,
                limit: result.limit
            };
            currentTotalItems = result.totalItems;
            totalPages = result.totalPages;
            const currentLocalSearch = searchInput ? searchInput.value.trim() : '';
            renderFileList(isGlobal ? '' : prefix, receivedData, isGlobal, isGlobal ? searchTerm.trim() : '', paginationData);
        } else {
            const errorMessage = result?.error || `HTTP 错误 ${response.status}`;
            console.error("获取文件列表失败:", errorMessage, result);
            showNotification(`获取文件列表失败: ${errorMessage}`, 'error');
            renderPaginationControls(null);
            fileListElement.innerHTML = `
                <li class="empty-state" style="text-align: center; padding: 3rem; color: var(--accent-color);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    获取文件列表失败: ${errorMessage}
                </li>
            `;
            updateBreadcrumb(isGlobal ? '' : prefix, isGlobal, searchTerm.trim());
        }
    } catch (error) {
        console.error("获取文件列表请求出错:", error);
        showNotification(`获取文件列表请求出错: ${error.message}`, 'error');
        fileListElement.innerHTML = `
            <li class="empty-state" style="text-align: center; padding: 3rem; color: var(--accent-color);">
                <i class="fas fa-wifi" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                获取文件列表请求出错: ${error.message}
            </li>
        `;
        updateBreadcrumb(isGlobal ? '' : prefix, isGlobal, searchTerm.trim());
        renderPaginationControls(null);
    }
    fileListElement.style.minHeight = '';
    updateUploadButtonLink();
    updateSelectAllButtonState();
}
document.addEventListener('authSuccess', () => {
    console.log("验证成功 (authSuccess event received)，开始加载根目录文件列表...");
    fetchAndDisplayFiles('', '', 1);
    fetchFileStats();
    fetchAndBuildFolderTree();
    fetchAndRenderHotFolders();
    fetchAndRenderRecentUploads();
    const uploadBtnLink = document.getElementById('upload-btn-link');
    if (uploadBtnLink) {
        uploadBtnLink.style.display = 'inline-flex';
    }
});
document.addEventListener('authRestored', () => {
    console.log("从 localStorage 恢复验证状态 (authRestored event received)，开始加载根目录文件列表...");
    fetchAndDisplayFiles('', '', 1);
    fetchFileStats();
    fetchAndBuildFolderTree();
    fetchAndRenderHotFolders();
    fetchAndRenderRecentUploads();
    const uploadBtnLink = document.getElementById('upload-btn-link');
    if (uploadBtnLink) {
        uploadBtnLink.style.display = 'inline-flex';
    }
});
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    createParticleBackground();
    if (fileListElement) {
        fileListElement.innerHTML = `
            <li class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-secondary); cursor: pointer;" title="点击登录">
                <i class="fas fa-user-shield" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                请先完成验证以查看文件
            </li>
        `;
    }
    updateBreadcrumb('');
    currentPrefix = '';
    renderPaginationControls(null);
    fetchAndRenderRecentUploads();
    fetchFileStats();
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    const tutorialBtn = document.getElementById('tutorial-btn');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', () => {
            if (typeof startTutorial === 'function') {
                startTutorial();
            } else {
                console.error('Tutorial function not found.');
                showNotification('无法加载教程，请刷新页面重试。', 'error');
            }
        });
    }
    if (fileListElement) {
        fileListElement.addEventListener('click', (event) => {
            const targetLi = event.target.closest('li.empty-state');
            if (targetLi && targetLi.textContent.includes('请先完成验证以查看文件')) {
                console.log('Empty state clicked, attempting to show auth modal');
                if (typeof showAuthModal === 'function') {
                    showAuthModal('login');
                } else if (typeof window.showAuthModal === 'function') {
                    window.showAuthModal('login');
                } else {
                    console.error('showAuthModal is not defined');
                    if (typeof showNotification === 'function') {
                        showNotification('无法打开登录窗口，请刷新页面重试', 'error');
                    }
                }
            }
        });
    }
    const selectionModeBtn = document.getElementById('selection-mode-btn');
    if (selectionModeBtn) {
        selectionModeBtn.addEventListener('click', toggleSelectionMode);
    }
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', handleBatchDelete);
    }
    const batchDownloadBtn = document.getElementById('batch-download-btn');
    if (batchDownloadBtn) {
        batchDownloadBtn.addEventListener('click', handleBatchDownload);
    }
    const batchMoveBtn = document.getElementById('batch-move-btn');
    if (batchMoveBtn) {
        batchMoveBtn.addEventListener('click', handleBatchMove);
    }
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', handleSelectAll);
    }
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            viewButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            if (fileListContainer) {
                fileListContainer.classList.toggle('grid-view', currentView === 'grid');
            }
        });
    });
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage);
        });
    });
    if (closePreviewBtn && previewModal) {
        const closeAndCleanup = () => {
            previewModal.classList.remove('visible');
            document.body.style.overflow = '';
            previewIframe.src = '';
            const existingImageWrapper = previewModal.querySelector('.preview-image-wrapper');
            if (existingImageWrapper) {
                existingImageWrapper.remove();
            }
            const existingVideoWrapper = previewModal.querySelector('.preview-video-wrapper');
            if (existingVideoWrapper) {
                const video = existingVideoWrapper.querySelector('video');
                if (video) {
                    video.onerror = null;
                    video.pause();
                    video.src = '';
                }
                existingVideoWrapper.remove();
            }
            const existingTextWrapper = previewModal.querySelector('.preview-text-wrapper');
            if (existingTextWrapper) {
                existingTextWrapper.remove();
            }
        };
        closePreviewBtn.addEventListener('click', closeAndCleanup);
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                closeAndCleanup();
            }
        });
    }
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.getElementById('folder-tree-container');
    if (mobileSidebarToggle && sidebar) {
        const overlay = document.createElement('div');
        overlay.className = 'mobile-sidebar-overlay';
        document.body.appendChild(overlay);
        const setIcon = (isOpen) => {
            const icon = mobileSidebarToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-times', isOpen);
                icon.classList.toggle('fa-bars', !isOpen);
            }
        };
        const closeSidebar = () => {
            document.body.classList.remove('mobile-sidebar-visible');
            setIcon(false);
        };
        const toggleSidebar = () => {
            const isOpen = document.body.classList.contains('mobile-sidebar-visible');
            if (isOpen) {
                closeSidebar();
            } else {
                document.body.classList.add('mobile-sidebar-visible');
                setIcon(true);
            }
        };
        mobileSidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
        overlay.addEventListener('click', closeSidebar);
        sidebar.addEventListener('click', (e) => {
            if (e.target.closest('.go-to-folder-btn') || e.target.closest('.hot-folder-item')) {
                closeSidebar();
            }
        });
    }
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navActions = document.querySelector('.nav-actions');
    if (mobileMenuToggle && navActions) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navActions.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (navActions.classList.contains('active') && !navActions.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                navActions.classList.remove('active');
            }
        });
    }
});
if (searchButton && searchInput) {
    const performSearch = () => {
        const searchTerm = searchInput.value.trim();
        fetchAndDisplayFiles(searchTerm ? '' : currentPrefix, searchTerm, 1);
    };
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm === '' && isShowingSearchResults) {
            fetchAndDisplayFiles(currentPrefix, '', 1);
        }
    });
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
async function moveItem(key, currentName, isDirectory) {
    let destinationPath;
    try {
        destinationPath = await showDirectoryPicker([key]);
    } catch (error) {
        showNotification('移动操作已取消', 'info');
        return;
    }
    const performMove = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error("需要进行验证。");
        }
        const response = await fetch(`${FILES_API_URL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                sourceKey: key,
                destinationPath: destinationPath
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '移动失败，请稍后重试。');
        }
        showNotification(`成功将 "${currentName}" 移动到 "${destinationPath || '根目录'}"`, 'success');
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        if (directoryCache[parentPrefix]) delete directoryCache[parentPrefix];
        if (directoryCache[destinationPath]) delete directoryCache[destinationPath];
        fetchAndDisplayFiles(currentPrefix, '', currentPage);
    };
    try {
        await performMove();
    } catch (error) {
        if (error.message !== '用户取消验证') {
            showNotification(`移动操作失败: ${error.message}`, 'error');
        } else {
            showNotification('移动操作已取消', 'info');
        }
    }
}
async function renameFile(key, currentName, isDirectory) {
    let newName;
    try {
        newName = await showPrompt({
            title: '重命名',
            message: `为 "${currentName}" 输入新名称:`,
            initialValue: currentName,
            confirmText: '重命名'
        });
    } catch (error) {
        showNotification('重命名操作已取消', 'info');
        return;
    }
    if (!newName || newName.trim() === "" || newName === currentName) {
        showNotification('名称无效或未改变，已取消操作。', 'info');
        return;
    }
    const performRename = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error("需要进行验证。");
        }
        const response = await fetch(`${FILES_API_URL}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                key: key,
                newName: newName
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '重命名失败，请稍后重试。');
        }
        showNotification(`成功重命名为 "${newName}"`, 'success');
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        if (directoryCache[parentPrefix]) delete directoryCache[parentPrefix];
        fetchAndDisplayFiles(currentPrefix, '', currentPage);
    };
    try {
        await performRename();
    } catch (error) {
        if (error.message !== '用户取消验证') {
            showNotification(`重命名操作失败: ${error.message}`, 'error');
        } else {
            showNotification('重命名操作已取消', 'info');
        }
    }
}
function showDirectoryPicker(itemsToMove = []) {
    return new Promise(async (resolve, reject) => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return reject(new Error("需要验证"));
        }
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal directory-picker-modal">
                <div class="modal-header">
                    <h3 class="modal-title">选择目标文件夹</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <p class="modal-subtitle">将 ${itemsToMove.length} 个项目移动到:</p>
                <div id="directory-picker-tree" class="directory-picker-tree">
                    <div class="loading-spinner"></div>
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">取消</button>
                    <button class="confirm-btn" disabled>移动到这里</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const treeContainer = modalOverlay.querySelector('#directory-picker-tree');
        const confirmBtn = modalOverlay.querySelector('.confirm-btn');
        let selectedPath = null;
        const renderTree = (tree, container) => {
            const ul = document.createElement('ul');
            ul.className = 'folder-tree-list';
            const rootNode = renderNode('根目录', tree, '', true, true);
            ul.appendChild(rootNode);
            container.innerHTML = '';
            container.appendChild(ul);
        };
        const renderNode = (name, node, path, isRoot = false, isLast = false) => {
            const li = document.createElement('li');
            li.className = 'folder-tree-node';
            if (isLast) {
                li.classList.add('is-last');
            }
            const fullPath = isRoot ? '' : `${path}${name}/`;
            const children = isRoot ? node : node;
            const hasChildren = Object.keys(children).length > 0;
            const nodeContent = document.createElement('div');
            nodeContent.className = 'folder-tree-item';
            nodeContent.dataset.path = fullPath;
            nodeContent.innerHTML = `
                <i class="fas fa-chevron-right folder-toggle-icon ${hasChildren ? '' : 'hidden'}"></i>
                <i class="fas fa-folder folder-icon"></i>
                <span class="folder-name">${name}</span>
            `;
            li.appendChild(nodeContent);
            if (hasChildren) {
                const sublist = document.createElement('ul');
                sublist.className = 'folder-tree-list';
                sublist.style.display = isRoot ? 'block' : 'none';
                const childKeys = Object.keys(children).sort();
                childKeys.forEach((key, index) => {
                    const isLastInSublist = index === childKeys.length - 1;
                    sublist.appendChild(renderNode(key, children[key], fullPath, false, isLastInSublist));
                });
                li.appendChild(sublist);
            }
            return li;
        };
        treeContainer.addEventListener('click', (e) => {
            const itemTarget = e.target.closest('.folder-tree-item');
            if (!itemTarget) return;
            const liNode = itemTarget.parentElement;
            const sublist = liNode.querySelector('.folder-tree-list');
            if (e.target.closest('.folder-toggle-icon') && sublist) {
                e.stopPropagation();
                const isExpanded = sublist.style.display === 'block';
                sublist.style.display = isExpanded ? 'none' : 'block';
                itemTarget.querySelector('.folder-toggle-icon').classList.toggle('expanded', !isExpanded);
            } else {
                const path = itemTarget.dataset.path;
                const isInvalidMove = itemsToMove.some(itemKey => path.startsWith(itemKey + '/'));
                if (isInvalidMove) {
                    showNotification('不能将文件夹移动到其自身或其子文件夹中。', 'error');
                    return;
                }
                if (selectedPath !== null) {
                    const prevSelected = treeContainer.querySelector(`.folder-tree-item.active`);
                    if (prevSelected) prevSelected.classList.remove('active');
                }
                itemTarget.classList.add('active');
                selectedPath = path;
                confirmBtn.disabled = false;
                confirmBtn.textContent = `移动到 "${itemTarget.querySelector('.folder-name').textContent}"`;
            }
        });
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) document.body.removeChild(modalOverlay);
                if (value !== null) resolve(value);
                else reject(new Error('User cancelled'));
            }, { once: true });
        };
        confirmBtn.addEventListener('click', () => closeModal(selectedPath));
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        modalOverlay.querySelector('.close-btn').addEventListener('click', () => closeModal(null));
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal(null);
        });
        try {
            const response = await fetch(`${FILES_API_URL}?action=listAllDirs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (response.ok && result.success) {
                const tree = buildTree(result.directories);
                renderTree(tree, treeContainer);
            } else {
                throw new Error(result.error || '无法加载文件夹列表');
            }
        } catch (error) {
            treeContainer.innerHTML = `<p style="color: var(--text-secondary);">${error.message}</p>`;
        }
    });
}
