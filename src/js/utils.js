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
        '7z': 'fas fa-file-archive',
        'exe': 'fas fa-window-maximize',
        'msi': 'fas fa-box-open',
        'apk': 'fas fa-android',
        'dmg': 'fas fa-compact-disc',
        'c': 'fas fa-file-code',
        'cpp': 'fas fa-file-code',
        'h': 'fas fa-file-code',
        'py': 'fab fa-python',
        'java': 'fab fa-java',
        'js': 'fab fa-js',
        'html': 'fab fa-html5',
        'css': 'fab fa-css3-alt',
        'js': 'fab fa-js',
        'html': 'fab fa-html5',
        'css': 'fab fa-css3-alt',
        'json': 'fas fa-file-code',
        'md': 'fab fa-markdown',
        'epub': 'fas fa-book',
        'mobi': 'fas fa-book',
        'azw3': 'fas fa-book',
        'dwg': 'fas fa-drafting-compass',
        'dxf': 'fas fa-drafting-compass',
        'm': 'fas fa-file-code',
        'go': 'fas fa-file-code',
        'php': 'fab fa-php'
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
        'mov': 'video',
        'mkv': 'video',
        'mp3': 'audio',
        'wav': 'audio',
        'flac': 'audio',
        'zip': 'archive',
        'rar': 'archive',
        '7z': 'archive',
        'tar': 'archive',
        'gz': 'archive',
        'exe': 'app',
        'msi': 'app',
        'apk': 'app',
        'dmg': 'app',
        'c': 'code',
        'cpp': 'code',
        'h': 'code',
        'py': 'code',
        'java': 'code',
        'js': 'code',
        'html': 'code',
        'css': 'code',
        'json': 'code',
        'css': 'code',
        'json': 'code',
        'md': 'code',
        'm': 'code',
        'go': 'code',
        'php': 'code',
        'epub': 'book',
        'mobi': 'book',
        'azw3': 'book',
        'dwg': 'cad',
        'dxf': 'cad'
    };
    return typeMap[ext] || 'default';
}
function getLinkIcon() {
    return 'fas fa-external-link-alt';
}
function sortData(data, sortOption) {
    if (!data) return data;
    const sortedData = {
        directories: [...(data.directories || [])],
        files: [...(data.files || [])]
    };
    const [field, direction] = sortOption.split('-');
    const dirMultiplier = direction === 'asc' ? 1 : -1;
    const compareFunction = (a, b) => {
        if (field === 'name') {
            const isLinkA = a.is_link === 1 || a.is_link === true;
            const isLinkB = b.is_link === 1 || b.is_link === true;
            if (isLinkA !== isLinkB) {
                return isLinkA ? -1 : 1;
            }
        }
        let valA, valB;
        switch (field) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                return valA.localeCompare(valB, 'zh-CN') * dirMultiplier;
            case 'date':
                valA = new Date(a.uploaded || 0).getTime();
                valB = new Date(b.uploaded || 0).getTime();
                break;
            case 'size':
                valA = a.size || 0;
                valB = b.size || 0;
                break;
            case 'downloads':
                valA = a.downloads || 0;
                valB = b.downloads || 0;
                break;
            case 'likes':
                valA = a.likes || 0;
                valB = b.likes || 0;
                break;
            default:
                return 0;
        }
        if (valA < valB) return -1 * dirMultiplier;
        if (valA > valB) return 1 * dirMultiplier;
        return 0;
    };
    sortedData.directories.sort(compareFunction);
    sortedData.files.sort(compareFunction);
    return sortedData;
}
function filterByFolderSearch(data, searchTerm) {
    if (!data || !searchTerm || searchTerm.trim() === '') {
        return data;
    }
    const lowerTerm = searchTerm.toLowerCase().trim();
    return {
        directories: (data.directories || []).filter(dir =>
            (dir.name || '').toLowerCase().includes(lowerTerm)
        ),
        files: (data.files || []).filter(file =>
            (file.name || '').toLowerCase().includes(lowerTerm)
        )
    };
}
function filterTreeByKeyword(container, keyword, options = {}) {
    const {
        nodeSelector = '.path-tree-node',
        itemSelector = '.path-tree-item',
        nameSelector = '.path-folder-name',
        listSelector = '.path-tree-list',
        toggleSelector = '.path-toggle-icon',
        useTransform = true
    } = options;
    const term = keyword.toLowerCase().trim();
    const allNodes = container.querySelectorAll(nodeSelector);
    if (!term) {
        allNodes.forEach(node => {
            node.style.display = '';
            const sublist = node.querySelector(':scope > ' + listSelector);
            if (sublist) sublist.style.display = 'none';
            const toggle = node.querySelector(toggleSelector);
            if (toggle && useTransform) toggle.style.transform = '';
            if (toggle) toggle.classList.remove('expanded');
        });
        const rootList = container.querySelector(':scope > ' + listSelector);
        if (rootList) rootList.style.display = 'block';
        return;
    }
    allNodes.forEach(node => {
        node.style.display = 'none';
    });
    allNodes.forEach(node => {
        const nameEl = node.querySelector(nameSelector);
        const name = nameEl ? nameEl.textContent.toLowerCase() : '';
        if (name.includes(term)) {
            node.style.display = 'block';
            let parent = node.parentElement;
            while (parent && parent !== container) {
                if (parent.matches(listSelector)) {
                    parent.style.display = 'block';
                }
                if (parent.matches(nodeSelector)) {
                    parent.style.display = 'block';
                    const toggle = parent.querySelector(toggleSelector);
                    if (toggle) {
                        if (useTransform) toggle.style.transform = 'rotate(90deg)';
                        toggle.classList.add('expanded');
                    }
                }
                parent = parent.parentElement;
            }
        }
    });
}
