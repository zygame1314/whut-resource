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
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    try {
        const previewApiUrl = `${API_ENDPOINTS.preview}?key=${encodeURIComponent(fileKey)}&expiresIn=86400`;
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
            showNotification('已开始下载。', 'success');
        } else {
            throw new Error(result.error || '获取下载链接失败');
        }
    } catch (error) {
        console.error(`下载 ${fileKey} 请求出错:`, error);
        const errorMsg = error.message.replace('预览', '下载');
        showNotification(`下载错误: ${errorMsg}`, 'error');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('downloading');
            downloadBtn.innerHTML = originalBtnContent || '<i class="fas fa-download"></i>';
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
        if (result.pending_approval) {
            showNotification(result.message || '已提交删除请求，等待超级管理员审批', 'info');
            return;
        }
        showNotification(`${isDirectory ? '文件夹' : '文件'} "${key}" 已删除`, 'success');
        const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        if (directoryCache[parentPrefix]) delete directoryCache[parentPrefix];
        fetchAndDisplayFiles(currentPrefix, '', currentPage);
    };
    try {
        const displayName = key.endsWith('/') ? key.slice(0, -1).split('/').pop() : key.split('/').pop();
        if (isDirectory) {
            const firstConfirm = await showConfirmation({
                title: '⚠️ 删除文件夹',
                message: `你确定要永久删除文件夹 "<b>${displayName}</b>" 及其<b>所有内容</b>吗？<br><br><span style="color: var(--accent-color);">⚠️ 这将删除该文件夹内的所有文件和子文件夹！<br>此操作不可逆！</span>`,
                confirmText: '继续删除',
                confirmClass: 'confirm-btn-danger'
            });
            if (!firstConfirm) {
                showNotification('删除操作已取消', 'info');
                return;
            }
            let inputName;
            try {
                inputName = await showPrompt({
                    title: '🔐 二次确认删除',
                    message: `请输入文件夹名称 "<b>${displayName}</b>" 以确认删除：`,
                    placeholder: '输入文件夹名称',
                    confirmText: '永久删除',
                    cancelText: '取消'
                });
            } catch (e) {
                showNotification('删除操作已取消', 'info');
                return;
            }
            if (inputName !== displayName) {
                showNotification('文件夹名称不匹配，删除操作已取消', 'warning');
                return;
            }
            await performDelete();
        } else {
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
        }
    } catch (error) {
        if (error.message !== '用户取消验证' && error.message !== 'User cancelled') {
            showNotification(`删除操作失败: ${error.message}`, 'error');
        } else {
            showNotification('删除操作已取消', 'info');
        }
        console.log('删除操作处理完毕:', error.message);
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
async function editLinkUrl(fileKey, currentUrl) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法编辑：未获取到验证令牌。请重新登录。", 'error');
        return;
    }
    let newUrl;
    try {
        newUrl = await showPrompt({
            title: '编辑链接地址',
            message: '请输入新的链接地址：',
            initialValue: currentUrl || '',
            placeholder: 'https://',
            confirmText: '保存',
            cancelText: '取消'
        });
    } catch (e) {
        return;
    }
    newUrl = newUrl.trim();
    if (!newUrl) {
        showNotification('链接地址不能为空', 'warning');
        return;
    }
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
        showNotification('链接地址必须以http://或https://开头', 'warning');
        return;
    }
    try {
        const apiUrl = `${FILES_API_URL}?action=updateLinkUrl&key=${encodeURIComponent(fileKey)}&newUrl=${encodeURIComponent(newUrl)}`;
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showNotification('链接地址已更新', 'success');
            if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
            fetchAndDisplayFiles(currentPrefix, '', currentPage);
        } else {
            showNotification(result.error || '更新链接失败', 'error');
        }
    } catch (error) {
        console.error(`编辑链接 ${fileKey} 出错:`, error);
        showNotification(`编辑链接出错: ${error.message}`, 'error');
    }
}
async function shareFile(item) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录后再分享。", 'error');
        return;
    }
    const isDirectory = !!item.isDirectory;
    const isLink = !!item.isLink;
    let shareLink = '';
    let name = item.name;
    let size = isDirectory ? '文件夹' : (isLink ? '外部链接' : formatBytes(item.size));
    if (isLink) {
        shareLink = item.link_url;
    } else {
        const parentPath = item.parent_path || '';
        const urlParams = new URLSearchParams();
        urlParams.set('path', parentPath);
        if (!isDirectory) {
            urlParams.set('highlight', item.key);
        } else {
            urlParams.set('path', item.key);
        }
        shareLink = `${window.location.origin}${window.location.pathname}?${urlParams.toString()}`;
    }
    const shareText = [
        '📁 文件分享',
        `📄 名称: ${name}`,
        `📏 大小: ${size}`,
        `🔗 链接: ${shareLink}`
    ].join('\n');
    try {
        await navigator.clipboard.writeText(shareText);
        showNotification('分享链已复制到剪贴板！', 'success');
    } catch (err) {
        console.error('复制失败:', err);
        showNotification('复制失败，请手动复制链接', 'error');
        prompt('复制以下内容:', shareText);
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
                <div class="directory-picker-search-wrapper">
                    <input type="text" class="directory-picker-search-input" placeholder="搜索目录...">
                </div>
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
        modalOverlay.addEventListener('mousedown', (e) => {
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
                const searchInput = modalOverlay.querySelector('.directory-picker-search-input');
                if (searchInput) {
                    searchInput.addEventListener('click', (e) => e.stopPropagation());
                    searchInput.addEventListener('input', (e) => {
                        try { filterTreeByKeyword(treeContainer, e.target.value); } catch (ex) { }
                    });
                }
            } else {
                throw new Error(result.error || '无法加载文件夹列表');
            }
        } catch (error) {
            treeContainer.innerHTML = `<p class="u-text-secondary-small">${error.message}</p>`;
        }
    });
}
function filterTreeByKeyword(container, keyword) {
    const items = container.querySelectorAll('.folder-tree-item');
    const term = keyword.toLowerCase();
    items.forEach(item => {
        const name = item.querySelector('.folder-name').textContent.toLowerCase();
    });
}
window.executeBatchDelete = async (keys) => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        throw new Error("无法删除：未获取到验证令牌。请重新登录。");
    }
    if (!keys || keys.length === 0) return [];
    const deleteOneItem = async (key) => {
        try {
            const response = await fetch(`${FILES_API_URL}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ key: key }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                return { status: 'error', key, error: result.error || '未知错误' };
            } else if (result.pending_approval) {
                return { status: 'pending', key };
            } else {
                return { status: 'success', key };
            }
        } catch (e) {
            return { status: 'error', key, error: e.message };
        }
    };
    const CONCURRENCY = 3;
    const results = [];
    for (let i = 0; i < keys.length; i += CONCURRENCY) {
        const batch = keys.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(deleteOneItem));
        results.push(...batchResults);
    }
    return results;
};
