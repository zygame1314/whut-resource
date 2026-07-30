const uploadPathBtn = document.getElementById('upload-path-btn');
const uploadPathDropdown = document.getElementById('upload-path-dropdown');
const pathTreeContainer = document.getElementById('path-tree-container');
let uploadTree = null;
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
        const result = await fetchCached(`${API_ENDPOINTS.files}?action=listAllDirs`, 'listAllDirs', 3600000, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (result.success && result.directories) {
            return result.directories;
        }
    } catch (error) {
        console.error('获取目录列表失败:', error);
    }
    return [];
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
            if (uploadTree) {
                uploadTree.expandToPath(currentUploadPath);
            }
            const treeItem = pathTreeContainer.querySelector(`.path-tree-item[data-path="${CSS.escape(currentUploadPath)}"]`);
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
const VIRTUAL_DIRS_KEY = 'uploadVirtualDirs';
function getVirtualDirs() {
    try {
        const raw = sessionStorage.getItem(VIRTUAL_DIRS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}
function saveVirtualDirs(dirs) {
    try {
        sessionStorage.setItem(VIRTUAL_DIRS_KEY, JSON.stringify(dirs));
    } catch (e) { }
}
function buildVirtualDirKey(parentPath, folderName) {
    const normalizedParent = (parentPath || '').replace(/^\/+|\/+$/g, '');
    const trimmedName = (folderName || '').trim().replace(/[\/\\<>:"|?*]/g, '').trim();
    if (!trimmedName) return null;
    return normalizedParent ? `${normalizedParent}/${trimmedName}/` : `${trimmedName}/`;
}
function addVirtualDir(parentPath, folderName) {
    const newKey = buildVirtualDirKey(parentPath, folderName);
    if (!newKey) return null;
    const dirs = getVirtualDirs();
    if (dirs.indexOf(newKey) !== -1) return { error: 'exists' };
    dirs.push(newKey);
    saveVirtualDirs(dirs);
    return { key: newKey };
}
function removeVirtualDir(dirKey) {
    const dirs = getVirtualDirs();
    const filtered = dirs.filter(function(d) { return d !== dirKey && !d.startsWith(dirKey); });
    saveVirtualDirs(filtered);
}
function mergeVirtualDirs(realDirs) {
    const virtual = getVirtualDirs();
    if (!virtual.length) return realDirs;
    const set = new Set(realDirs);
    virtual.forEach(function(d) { set.add(d); });
    return Array.from(set);
}
function refreshUploadTree(newDirKey) {
    if (!uploadTree || !pathTreeContainer) return;
    fetchDirectories().then((realDirs) => {
        const allDirs = mergeVirtualDirs(realDirs);
        uploadTree.render(allDirs);
        if (newDirKey) {
            if (uploadTree.expandToPath) uploadTree.expandToPath(newDirKey);
            const treeItem = pathTreeContainer.querySelector('.path-tree-item[data-path="' + CSS.escape(newDirKey) + '"]');
            if (treeItem) {
                pathTreeContainer.querySelectorAll('.path-tree-item').forEach(function(item) {
                    item.classList.remove('selected');
                });
                treeItem.classList.add('selected');
                currentUploadPath = newDirKey;
                updateSelectedPathDisplay();
                updateUrlPath();
                setTimeout(function() {
                    treeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);
            }
        }
    });
}
function showCreateFolderForm(parentPath) {
    const dropdown = uploadPathDropdown;
    if (!dropdown) return;
    let form = dropdown.querySelector('.create-folder-form');
    if (form) {
        form.remove();
        return;
    }
    form = document.createElement('div');
    form.className = 'create-folder-form';
    const parentLabel = parentPath ? parentPath.replace(/\/$/, '') : '根目录';
    form.innerHTML =
        '<div class="create-folder-header">' +
            '<div class="create-folder-label"><i class="fas fa-folder-plus"></i><span>在「' + (parentLabel || '根目录') + '」下新建</span></div>' +
        '</div>' +
        '<div class="create-folder-input-row">' +
            '<input type="text" class="create-folder-input" placeholder="文件夹名称（如：高等数学）" maxlength="255" autocomplete="off">' +
            '<button type="button" class="create-folder-confirm" title="确认"><i class="fas fa-check"></i></button>' +
            '<button type="button" class="create-folder-cancel" title="取消"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="create-folder-hint"><i class="fas fa-info-circle"></i><span>仅在当前页面保留，上传文件后生效</span></div>';
    form.dataset.parentPath = parentPath || '';
    const header = dropdown.querySelector('.path-dropdown-header');
    if (header) {
        header.insertAdjacentElement('afterend', form);
    } else {
        dropdown.insertBefore(form, dropdown.firstChild);
    }
    const input = form.querySelector('.create-folder-input');
    const confirmBtn = form.querySelector('.create-folder-confirm');
    const cancelBtn = form.querySelector('.create-folder-cancel');
    setTimeout(function() { input.focus(); }, 50);
    const submit = () => {
        const name = input.value;
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            showNotification('请输入文件夹名称', 'error');
            return;
        }
        if (/[\/\\<>:"|?*]/.test(trimmedName)) {
            showNotification('文件夹名称包含非法字符', 'error');
            return;
        }
        const effectiveParent = form.dataset.parentPath || parentPath || '';
        const result = addVirtualDir(effectiveParent, trimmedName);
        if (!result) {
            showNotification('文件夹名称无效', 'error');
            return;
        }
        if (result.error === 'exists') {
            showNotification('该文件夹已存在', 'error');
            return;
        }
        form.remove();
        showNotification(`文件夹「${trimmedName}」已添加，上传后将正式创建`, 'success', 4000);
        refreshUploadTree(result.key);
    };
    const stopPropagation = (e) => e.stopPropagation();
    confirmBtn.addEventListener('click', function(e) { e.stopPropagation(); submit(); });
    cancelBtn.addEventListener('click', function(e) { e.stopPropagation(); form.remove(); });
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            form.remove();
        }
    });
    input.addEventListener('click', stopPropagation);
}
async function initUploadPathSelector() {
    const selector = document.getElementById('upload-path-selector');
    if (!selector) return;
    if (!localStorage.getItem('authToken')) {
        showNoPermissionUI();
        return;
    }
    if (!window.currentUser) {
        await new Promise((resolve) => {
            const onAuthSuccess = () => {
                document.removeEventListener('authSuccess', onAuthSuccess);
                clearTimeout(timeout);
                resolve();
            };
            const timeout = setTimeout(() => {
                document.removeEventListener('authSuccess', onAuthSuccess);
                resolve();
            }, 5000);
            document.addEventListener('authSuccess', onAuthSuccess);
        });
    }
    const isAdmin = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin');
    if (!isAdmin) {
        showNoPermissionUI();
        return;
    }
    selector.style.display = 'flex';
    const watermarkOption = document.getElementById('watermark-option');
    if (watermarkOption) watermarkOption.style.display = 'block';
    updateSelectedPathDisplay();
    const directories = await fetchDirectories();
    if (pathTreeContainer) {
        uploadTree = new LazyFolderTree({
            container: pathTreeContainer,
            rootLabel: '根目录',
            rootIconClass: 'fas fa-home path-folder-icon',
            folderIconClass: 'fas fa-folder path-folder-icon',
            toggleClassName: 'path-toggle-icon',
            nameClassName: 'path-folder-name',
            nodeClassName: 'path-tree-node',
            itemClassName: 'path-tree-item',
            listClassName: 'path-tree-list',
            useTransformToggle: true,
            selectionMode: true,
            onSelect: function(nodeContent, path, e) {
                pathTreeContainer.querySelectorAll('.path-tree-item').forEach(function(item) {
                    item.classList.remove('selected');
                });
                nodeContent.classList.add('selected');
                currentUploadPath = path;
                updateSelectedPathDisplay();
                updateUrlPath();
                const form = uploadPathDropdown && uploadPathDropdown.querySelector('.create-folder-form');
                if (form) {
                    const labelSpan = form.querySelector('.create-folder-label span');
                    if (labelSpan) {
                        const parentLabel = path ? path.replace(/\/$/, '') : '根目录';
                        labelSpan.textContent = '在「' + (parentLabel || '根目录') + '」下新建';
                    }
                    form.dataset.parentPath = path || '';
                }
            }
        });
        uploadTree.render(mergeVirtualDirs(directories));
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
                const newFolderBtn = document.createElement('button');
                newFolderBtn.type = 'button';
                newFolderBtn.className = 'path-new-folder-btn';
                newFolderBtn.title = '在当前选中目录下新建文件夹';
                newFolderBtn.innerHTML = '<i class="fas fa-folder-plus"></i><span>新建文件夹</span>';
                dropdownHeader.appendChild(newFolderBtn);
                newFolderBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showCreateFolderForm(currentUploadPath || '');
                });
                const searchContainer = document.createElement('div');
                searchContainer.className = 'path-search-wrapper';
                searchContainer.innerHTML = '<input type="text" class="path-search-input" placeholder="搜索目录...">';
                dropdownHeader.insertAdjacentElement('afterend', searchContainer);
                searchInput = searchContainer.querySelector('input');
                searchInput.addEventListener('click', (e) => e.stopPropagation());
                searchInput.addEventListener('input', (e) => {
                    if (typeof filterTreeByKeyword === 'function') {
                        if (uploadTree) uploadTree.ensureAllRendered();
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