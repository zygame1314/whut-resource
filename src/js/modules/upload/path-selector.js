const uploadPathBtn = document.getElementById('upload-path-btn');
const uploadPathDropdown = document.getElementById('upload-path-dropdown');
const pathTreeContainer = document.getElementById('path-tree-container');
(function initPathFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialPath = urlParams.get('path');
    if (initialPath) currentUploadPath = initialPath;
})();
function updateSelectedPathDisplay() {
    if (uploadPathBtn) {
        const displayPath = currentUploadPath ? '/' + (currentUploadPath.endsWith('/') ? currentUploadPath.slice(0, -1) : currentUploadPath) : '根目录';
        const span = uploadPathBtn.querySelector('.selected-path');
        if (span) span.textContent = displayPath;
    }
}
function updateUrlPath() {
    const newUrl = new URL(window.location);
    if (currentUploadPath) {
        newUrl.searchParams.set('path', currentUploadPath);
    } else {
        newUrl.searchParams.delete('path');
    }
    window.history.replaceState({}, '', newUrl);
}
async function fetchDirectories() {
    const token = localStorage.getItem('authToken');
    if (!token) return [];
    try {
        const response = await fetch(`${API_ENDPOINTS.files}?action=listAllDirs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success && result.directories) {
            return result.directories;
        }
    } catch (error) {
        console.error('获取目录列表失败:', error);
    }
    return [];
}
function buildDirectoryTree(directories) {
    const tree = {};
    directories.forEach(dir => {
        const cleanPath = dir.endsWith('/') ? dir.slice(0, -1) : dir;
        const parts = cleanPath.split('/');
        let current = tree;
        parts.forEach(part => {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        });
    });
    return tree;
}
function renderPathTreeNode(name, children, path, isRoot = false) {
    const li = document.createElement('li');
    li.className = 'path-tree-node';
    const fullPath = isRoot ? '' : path;
    const hasChildren = Object.keys(children).length > 0;
    const isSelected = fullPath === currentUploadPath || (fullPath === '' && currentUploadPath === '');
    const nodeContent = document.createElement('div');
    nodeContent.className = 'path-tree-item';
    if (isSelected) nodeContent.classList.add('selected');
    nodeContent.dataset.path = fullPath;
    nodeContent.innerHTML = `
        <i class="fas fa-chevron-right path-toggle-icon ${hasChildren ? '' : 'invisible'}"></i>
        <i class="fas ${isRoot ? 'fa-home' : 'fa-folder'} path-folder-icon"></i>
        <span class="path-folder-name">${name}</span>
    `;
    li.appendChild(nodeContent);
    if (hasChildren) {
        const sublist = document.createElement('ul');
        sublist.className = 'path-tree-list';
        sublist.style.display = isRoot ? 'block' : 'none';
        const sortedKeys = Object.keys(children).sort();
        sortedKeys.forEach(key => {
            const childPath = isRoot ? key + '/' : path + key + '/';
            sublist.appendChild(renderPathTreeNode(key, children[key], childPath, false));
        });
        li.appendChild(sublist);
    }
    return li;
}
async function handleAIPathRecommend(e) {
    e.preventDefault();
    e.stopPropagation();
    const aiBtn = document.getElementById('ai-path-assist-btn');
    if (!aiBtn) return;
    let fileNamesToAnalyze = [];
    if (typeof currentUploadType !== 'undefined' && currentUploadType === 'link') {
        const linkNameInput = document.getElementById('link-name-input');
        const name = linkNameInput ? linkNameInput.value.trim() : '';
        if (name) fileNamesToAnalyze.push(name);
    } else {
        if (typeof selectedFiles !== 'undefined' && selectedFiles.length > 0) {
            const firstFile = selectedFiles[0];
            const relPath = firstFile.webkitRelativePath || firstFile._webkitRelativePath || firstFile.originalRelativePath;
            if (relPath && relPath.includes('/')) {
                const rootFolderName = relPath.split('/')[0];
                fileNamesToAnalyze.push(rootFolderName);
            }
            const meaningfulFiles = selectedFiles.filter(f => {
                const path = f.webkitRelativePath || f._webkitRelativePath || '';
                if (path && (/\/\./.test(path) || path.includes('/__pycache__/'))) return false;
                const name = f.name;
                if (name.endsWith('.sample') || name.endsWith('.pyc')) return false;
                const noisePattern = /^(?:\.|COMMIT_EDITMSG|FETCH_HEAD|HEAD|ORIG_HEAD|config|description|packed-refs|index|thumbs\.db|desktop\.ini|LICENSE|README)/i;
                return !noisePattern.test(name);
            });
            const sourceFiles = meaningfulFiles.length > 0 ? meaningfulFiles : selectedFiles;
            const fileSamples = sourceFiles.slice(0, 5).map(f => f.name);
            fileNamesToAnalyze.push(...fileSamples);
            fileNamesToAnalyze = [...new Set(fileNamesToAnalyze)];
        }
    }
    if (fileNamesToAnalyze.length === 0) {
        showNotification('请先选择文件或输入链接名称', 'info');
        return;
    }
    if (!window.currentUser || !(window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin')) {
        showNotification('需要管理员权限', 'error');
        return;
    }
    const originalText = aiBtn.innerHTML;
    aiBtn.disabled = true;
    aiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>分析中...</span>';
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(API_ENDPOINTS.pathRecommend, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ fileNames: fileNamesToAnalyze })
        });
        const result = await response.json();
        if (result.success && result.path) {
            let recPath = result.path.replace(/^\/|\/$/g, '');
            currentUploadPath = recPath + '/';
            const treeItem = pathTreeContainer.querySelector(`.path-tree-item[data-path="${currentUploadPath}"]`);
            if (treeItem) {
                pathTreeContainer.querySelectorAll('.path-tree-item').forEach(item => item.classList.remove('selected'));
                treeItem.classList.add('selected');
                let currentNode = treeItem.closest('.path-tree-node');
                while (currentNode) {
                    const parentList = currentNode.parentElement;
                    if (parentList && parentList.classList.contains('path-tree-list')) {
                        parentList.style.display = 'block';
                        const parentNode = parentList.parentElement.closest('.path-tree-node');
                        if (parentNode) {
                            const toggle = parentNode.querySelector('.path-toggle-icon');
                            if (toggle) {
                                toggle.style.transform = 'rotate(90deg)';
                                toggle.classList.add('expanded');
                            }
                            currentNode = parentNode;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                if (uploadPathDropdown && !uploadPathDropdown.classList.contains('open')) {
                    uploadPathDropdown.classList.add('open');
                    uploadPathBtn.classList.add('open');
                }
                setTimeout(() => {
                    treeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
            updateSelectedPathDisplay();
            updateUrlPath();
            showNotification(`AI 推荐路径: ${recPath}`, 'success');
        } else {
            showNotification('AI 未能推荐合适路径', 'info');
        }
    } catch (err) {
        console.error('AI 推荐服务错误:', err);
        showNotification('AI 推荐服务暂时不可用', 'error');
    } finally {
        aiBtn.disabled = false;
        aiBtn.innerHTML = originalText;
    }
}
async function initUploadPathSelector() {
    const selector = document.getElementById('upload-path-selector');
    if (!selector) return;
    let waitTime = 0;
    while (!window.currentUser && waitTime < 3000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
    }
    const isAdmin = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin');
    if (!isAdmin) {
        showNoPermissionUI();
        return;
    }
    selector.style.display = 'flex';
    const watermarkOption = document.getElementById('watermark-option');
    if (watermarkOption) watermarkOption.style.display = 'flex';
    updateSelectedPathDisplay();
    const directories = await fetchDirectories();
    const tree = buildDirectoryTree(directories);
    if (pathTreeContainer) {
        const ul = document.createElement('ul');
        ul.className = 'path-tree-list root';
        ul.appendChild(renderPathTreeNode('根目录', tree, '', true));
        pathTreeContainer.innerHTML = '';
        pathTreeContainer.appendChild(ul);
        pathTreeContainer.addEventListener('click', (e) => {
            const toggleIcon = e.target.closest('.path-toggle-icon');
            const folderIcon = e.target.closest('.path-folder-icon');
            const treeItem = e.target.closest('.path-tree-item');
            let actAsToggle = false;
            let targetToggleIcon = toggleIcon;
            if (toggleIcon && !toggleIcon.classList.contains('invisible')) {
                actAsToggle = true;
            } else if (folderIcon) {
                const parentItem = folderIcon.closest('.path-tree-item');
                if (parentItem) {
                    const siblingToggle = parentItem.querySelector('.path-toggle-icon');
                    if (siblingToggle && !siblingToggle.classList.contains('invisible')) {
                        actAsToggle = true;
                        targetToggleIcon = siblingToggle;
                    }
                }
            }
            if (actAsToggle && targetToggleIcon) {
                e.stopPropagation();
                const parentLi = targetToggleIcon.closest('.path-tree-node');
                const sublist = parentLi.querySelector(':scope > .path-tree-list');
                if (sublist) {
                    const isExpanded = sublist.style.display !== 'none';
                    sublist.style.display = isExpanded ? 'none' : 'block';
                    targetToggleIcon.style.transform = isExpanded ? '' : 'rotate(90deg)';
                    targetToggleIcon.classList.toggle('expanded', !isExpanded);
                }
            } else if (treeItem) {
                pathTreeContainer.querySelectorAll('.path-tree-item').forEach(item => {
                    item.classList.remove('selected');
                });
                treeItem.classList.add('selected');
                currentUploadPath = treeItem.dataset.path;
                updateSelectedPathDisplay();
                updateUrlPath();
                if (uploadPathDropdown) {
                    uploadPathDropdown.classList.remove('open');
                    uploadPathBtn.classList.remove('open');
                }
            }
        });
    }
    if (uploadPathBtn && uploadPathDropdown) {
        const btnContainer = uploadPathBtn.parentNode;
        if (btnContainer && !document.getElementById('ai-path-assist-btn')) {
            const aiBtn = document.createElement('button');
            aiBtn.id = 'ai-path-assist-btn';
            aiBtn.className = 'ai-assist-btn';
            aiBtn.innerHTML = '<i class="fas fa-magic"></i><span>AI 推荐位置</span>';
            uploadPathBtn.insertAdjacentElement('afterend', aiBtn);
            aiBtn.addEventListener('click', handleAIPathRecommend);
        }
        let searchInput = uploadPathDropdown.querySelector('.path-search-input');
        if (!searchInput) {
            const dropdownHeader = uploadPathDropdown.querySelector('.path-dropdown-header');
            if (dropdownHeader) {
                const searchContainer = document.createElement('div');
                searchContainer.className = 'path-search-wrapper';
                searchContainer.innerHTML = '<input type="text" class="path-search-input" placeholder="搜索目录...">';
                dropdownHeader.insertAdjacentElement('afterend', searchContainer);
                searchInput = searchContainer.querySelector('input');
                searchInput.addEventListener('click', (e) => e.stopPropagation());
                searchInput.addEventListener('input', (e) => {
                    if (typeof filterTreeByKeyword === 'function') {
                        filterTreeByKeyword(pathTreeContainer, e.target.value, {
                            nodeSelector: '.path-tree-node',
                            itemSelector: '.path-tree-item',
                            nameSelector: '.path-folder-name',
                            listSelector: '.path-tree-list',
                            toggleSelector: '.path-toggle-icon',
                            useTransform: true
                        });
                    }
                });
            }
        }
        uploadPathBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = uploadPathDropdown.classList.contains('open');
            uploadPathDropdown.classList.toggle('open');
            uploadPathBtn.classList.toggle('open');
            if (!isOpen && searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        });
        document.addEventListener('click', (e) => {
            if (!uploadPathDropdown.contains(e.target) && !uploadPathBtn.contains(e.target)) {
                uploadPathDropdown.classList.remove('open');
                uploadPathBtn.classList.remove('open');
            }
        });
    }
}
