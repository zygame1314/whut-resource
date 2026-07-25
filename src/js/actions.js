async function downloadFile(fileKey, downloadBtn) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法下载：未获取到验证令牌。请重新登录。", 'error');
        return;
    }
    if (!window.DownloadManager) {
        await downloadFileLegacy(fileKey, downloadBtn);
        return;
    }
    const filename = fileKey.includes('/') ? fileKey.substring(fileKey.lastIndexOf('/') + 1) : fileKey;
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
        if (!response.ok || !result.success || !result.url) {
            throw new Error(result.error || '获取下载链接失败');
        }
        window.DownloadManager.addTask([{
            key: fileKey,
            filename: filename,
            urlPath: new URL(result.url).pathname + new URL(result.url).search
        }], {
            name: filename
        });
        showNotification('已添加到下载队列', 'success');
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
async function downloadFileLegacy(fileKey, downloadBtn) {
    const token = localStorage.getItem('authToken');
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
            if (typeof refreshQuotaFromServer === 'function') {
                setTimeout(refreshQuotaFromServer, 1000);
            }
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
        if (typeof searchCache !== 'undefined') searchCache.clear();
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
            let domain = '外部链接';
            try {
                const urlObj = new URL(linkUrl);
                domain = urlObj.hostname;
            } catch (e) { }
            const safetyStatusId = 'link-safety-' + Date.now();
            const pageInfoId = 'link-page-info-' + Date.now();
            const visualId = 'link-visual-' + Date.now();
            const confirmed = await showConfirmation({
                title: '外链安全提醒',
                message: `
                    <div class="link-confirm-modern">
                        <div id="${visualId}" class="link-confirm-visual">
                            <i class="fas fa-external-link-alt"></i>
                        </div>
                        <h3 class="link-confirm-headline">即将访问外部网站</h3>
                        <p class="link-confirm-description">你即将离开本站，前往第三方页面。本站不对外部链接的内容、安全性或合法性负责，请在访问前自行甄别风险。</p>
                        <div id="${safetyStatusId}" class="link-safety-status checking">
                            <i class="fas fa-circle-notch"></i>
                            <span>正在检测链接安全性...</span>
                        </div>
                        <div class="link-confirm-card">
                            <div class="link-favicon" id="${pageInfoId}-favicon">
                                <i class="fas fa-globe"></i>
                            </div>
                            <div class="link-info">
                                <div class="link-title" id="${pageInfoId}-title">${domain}</div>
                                <div class="link-description" id="${pageInfoId}-desc" style="display:none;"></div>
                                <div class="link-full-url" title="${linkUrl.replace(/"/g, '&quot;')}">${linkUrl.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                            </div>
                        </div>
                        <div class="link-confirm-note">
                            <i class="fas fa-shield-alt"></i>
                            <span>由 Google Safe Browsing 提供安全检测</span>
                        </div>
                    </div>
                `,
                confirmText: '继续访问',
                confirmClass: 'confirm-btn-primary',
                cancelText: '取消',
                onShow: async () => {
                    try {
                        const token = localStorage.getItem('authToken');
                        const response = await fetch(API_ENDPOINTS.urlSafety, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ url: linkUrl }),
                        });
                        const result = await response.json();
                        const statusEl = document.getElementById(safetyStatusId);
                        const visualEl = document.getElementById(visualId);
                        if (statusEl && result.success) {
                            statusEl.classList.remove('checking');
                            if (result.status === 'safe') {
                                statusEl.classList.add('safe');
                                statusEl.innerHTML = '<i class="fas fa-check-circle"></i><span>未检测到已知威胁</span>';
                            } else if (result.status === 'dangerous') {
                                statusEl.classList.add('dangerous');
                                const threatLabels = result.threats.map(t => t.label).join('、');
                                statusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>警告：该链接检测到安全风险</span><div class="link-threat-list">类型：${threatLabels}</div>`;
                                if (visualEl) {
                                    visualEl.classList.add('dangerous');
                                    visualEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                                }
                            } else {
                                statusEl.classList.add('unknown');
                                statusEl.innerHTML = '<i class="fas fa-question-circle"></i><span>无法确定安全性</span>';
                            }
                        }
                        if (result.pageInfo) {
                            const info = result.pageInfo;
                            const faviconEl = document.getElementById(`${pageInfoId}-favicon`);
                            const titleEl = document.getElementById(`${pageInfoId}-title`);
                            const descEl = document.getElementById(`${pageInfoId}-desc`);
                            if (info.favicon && faviconEl) {
                                const img = document.createElement('img');
                                img.src = info.favicon;
                                img.alt = 'favicon';
                                img.referrerPolicy = 'no-referrer';
                                img.onerror = () => {
                                };
                                img.onload = () => {
                                    faviconEl.innerHTML = '';
                                    faviconEl.appendChild(img);
                                };
                            }
                            if (info.title && titleEl) {
                                titleEl.textContent = info.title;
                                titleEl.classList.add('has-title');
                            }
                            if (info.description && descEl) {
                                descEl.textContent = info.description;
                                descEl.style.display = 'block';
                            }
                            if (info.contentType && !info.title) {
                                if (titleEl) titleEl.textContent = `文件类型: ${info.contentType}`;
                            }
                        }
                    } catch (e) {
                        console.warn('安全检测失败:', e);
                        const statusEl = document.getElementById(safetyStatusId);
                        if (statusEl) {
                            statusEl.classList.remove('checking');
                            statusEl.classList.add('unknown');
                            statusEl.innerHTML = '<i class="fas fa-question-circle"></i><span>安全检测暂不可用</span>';
                        }
                    }
                }
            });
            if (!confirmed) {
                showNotification('跳转已取消', 'info');
                return;
            }
            if (fileKey) {
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
            if (typeof searchCache !== 'undefined') searchCache.clear();
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
    } else if (item.id) {
        shareLink = `${window.location.origin}${window.location.pathname}?id=${item.id}`;
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
        if (typeof searchCache !== 'undefined') searchCache.clear();
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
    const nameCheck = validateItemName(newName);
    if (!nameCheck.valid) {
        showNotification(nameCheck.error, 'error');
        return;
    }
    const safeNewName = nameCheck.value;
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
                newName: safeNewName
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '重命名失败，请稍后重试。');
        }
        showNotification(`成功重命名为 "${safeNewName}"`, 'success');
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        if (directoryCache[parentPrefix]) delete directoryCache[parentPrefix];
        if (typeof searchCache !== 'undefined') searchCache.clear();
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
async function editDescription(key, currentName, currentDescription) {
    let newDescription;
    try {
        newDescription = await showPrompt({
            title: '编辑属性',
            message: `为文件夹 "${currentName}" 输入新描述:`,
            initialValue: currentDescription || '',
            placeholder: '输入文件夹描述或公告（留空以清除），支持较长文本、换行。',
            confirmText: '保存',
            useTextarea: true,
            rows: 12,
            showPreview: true
        });
    } catch (error) {
        showNotification('操作已取消', 'info');
        return;
    }
    if (newDescription === (currentDescription || '')) {
        showNotification('描述未改变。', 'info');
        return;
    }
    const performUpdate = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error("需要进行验证。");
        }
        const response = await fetch(`${FILES_API_URL}?action=updateDescription`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                key: key,
                description: newDescription
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || '更新失败，请稍后重试。');
        }
        showNotification(`成功更新描述`, 'success');
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        if (typeof searchCache !== 'undefined') searchCache.clear();
        fetchAndDisplayFiles(currentPrefix, '', currentPage);
    };
    try {
        await performUpdate();
    } catch (error) {
        if (error.message !== '用户取消验证') {
            showNotification(`操作失败: ${error.message}`, 'error');
        } else {
            showNotification('操作已取消', 'info');
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
        const pathSelectorHtml = `
            <div class="picker-path-selector">
                <label class="resolve-label"><i class="fas fa-folder-open"></i> 目标目录</label>
                <div class="path-dropdown-wrapper">
                    <button type="button" id="picker-path-btn" class="path-dropdown-btn">
                        <span class="selected-path">点击选择目录</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div id="picker-path-dropdown" class="path-dropdown-menu">
                        <div class="path-dropdown-header">
                            <span>选择目标目录</span>
                            <button type="button" id="picker-clear-path-btn" class="clear-path-btn" title="清除选择"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="path-search-wrapper">
                            <input type="text" id="picker-path-search" class="path-search-input" placeholder="搜索目录...">
                        </div>
                        <div id="picker-path-tree-container" class="path-tree-container">
                            <div class="path-tree-loading">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        modalOverlay.innerHTML = `
            <div class="confirmation-modal directory-picker-modal">
                <div class="modal-header">
                    <h3 class="modal-title">选择目标文件夹</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <p class="modal-subtitle">将 ${itemsToMove.length} 个项目移动到:</p>
                ${pathSelectorHtml}
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">取消</button>
                    <button class="confirm-btn" disabled>移动到这里</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const treeContainer = modalOverlay.querySelector('#picker-path-tree-container');
        const confirmBtn = modalOverlay.querySelector('.confirm-btn');
        const pathBtn = modalOverlay.querySelector('#picker-path-btn');
        const pathDropdown = modalOverlay.querySelector('#picker-path-dropdown');
        const clearPathBtn = modalOverlay.querySelector('#picker-clear-path-btn');
        const searchInput = modalOverlay.querySelector('#picker-path-search');
        const updatePathBtnLabel = () => {
            const btn = pathBtn.querySelector('.selected-path');
            if (!btn) return;
            btn.textContent = selectedPath ? selectedPath : '点击选择目录';
        };
        let selectedPath = null;
        let pickerTree = null;
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
        if (pathBtn && pathDropdown) {
            pathBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pathDropdown.classList.toggle('open');
                pathBtn.classList.toggle('open');
                if (pathDropdown.classList.contains('open') && searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            });
        }
        if (searchInput) {
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            searchInput.addEventListener('input', (e) => {
                try {
                    if (pickerTree) pickerTree.ensureAllRendered();
                    filterTreeByKeyword(treeContainer, e.target.value, {
                        nodeSelector: '.path-tree-node',
                        itemSelector: '.path-tree-item',
                        nameSelector: '.path-folder-name',
                        listSelector: '.path-tree-list',
                        toggleSelector: '.path-toggle-icon',
                        useTransform: true
                    });
                } catch (ex) { }
            });
        }
        if (clearPathBtn) {
            clearPathBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedPath = null;
                updatePathBtnLabel();
                treeContainer?.querySelectorAll('.path-tree-item').forEach(item => {
                    item.classList.remove('selected');
                });
                pathDropdown.classList.remove('open');
                pathBtn.classList.remove('open');
                confirmBtn.disabled = true;
                confirmBtn.textContent = '移动到这里';
            });
        }
        modalOverlay.addEventListener('click', (e) => {
            if (pathDropdown && !pathDropdown.contains(e.target) && !pathBtn?.contains(e.target)) {
                pathDropdown.classList.remove('open');
                pathBtn?.classList.remove('open');
            }
        });
        try {
            const result = await fetchCached(`${FILES_API_URL}?action=listAllDirs`, 'listAllDirs', 3600000, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (result.success) {
                pickerTree = new LazyFolderTree({
                    container: treeContainer,
                    rootLabel: '根目录',
                    rootIconClass: 'fas fa-home path-folder-icon',
                    folderIconClass: 'fas fa-folder path-folder-icon',
                    toggleClassName: 'path-toggle-icon',
                    nameClassName: 'path-folder-name',
                    nodeClassName: 'path-tree-node',
                    itemClassName: 'path-tree-item',
                    listClassName: 'path-tree-list',
                    selectionMode: true,
                    useTransformToggle: true,
                    onSelect: function (nodeContent, path, e) {
                        const isInvalidMove = itemsToMove.some(itemKey => path.startsWith(itemKey + '/'));
                        if (isInvalidMove) {
                            showNotification('不能将文件夹移动到其自身或其子文件夹中。', 'error');
                            return;
                        }
                        if (selectedPath !== null) {
                            const prevSelected = treeContainer.querySelector('.path-tree-item.selected');
                            if (prevSelected) prevSelected.classList.remove('selected');
                        }
                        nodeContent.classList.add('selected');
                        selectedPath = path;
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = `移动到 "${nodeContent.querySelector('.path-folder-name').textContent}"`;
                        updatePathBtnLabel();
                    }
                });
                pickerTree.render(result.directories);
            } else {
                throw new Error(result.error || '无法加载文件夹列表');
            }
        } catch (error) {
            if (treeContainer) treeContainer.innerHTML = `<p class="u-text-secondary-small">${error.message}</p>`;
        }
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
async function toggleReaction(fileKey, btnElement) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录。", 'error');
        return null;
    }
    if (btnElement) btnElement.disabled = true;
    try {
        const response = await fetch(`${FILES_API_URL}?action=toggleReaction`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                key: fileKey
            }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            return result;
        } else {
            showNotification(result.error || '操作失败', 'error');
            return null;
        }
    } catch (error) {
        console.error('Reaction error:', error);
        showNotification('操作失败', 'error');
        return null;
    } finally {
        if (btnElement) btnElement.disabled = false;
    }
}
async function toggleFavorite(fileKey, btnElement) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录后再收藏。", 'error');
        return null;
    }
    if (btnElement) btnElement.disabled = true;
    try {
        const response = await fetch(`${FILES_API_URL}?action=toggleFavorite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                key: fileKey
            }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            window.filesApiCache.invalidate('favorites');
            return result;
        } else {
            showNotification(result.error || '收藏操作失败', 'error');
            return null;
        }
    } catch (error) {
        console.error('Favorite error:', error);
        showNotification('收藏操作失败', 'error');
        return null;
    } finally {
        if (btnElement) btnElement.disabled = false;
    }
}
async function toggleSubscribe(folderKey, btnElement) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录后再订阅。", 'error');
        return null;
    }
    if (btnElement) btnElement.disabled = true;
    try {
        const response = await fetch(`${FILES_API_URL}?action=toggleSubscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ key: folderKey }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            return result;
        } else {
            showNotification(result.error || '订阅操作失败', 'error');
            return null;
        }
    } catch (error) {
        console.error('Subscribe error:', error);
        showNotification('订阅操作失败', 'error');
        return null;
    } finally {
        if (btnElement) btnElement.disabled = false;
    }
}
async function fetchBoosts(fileKey, limit = 20, cursor = null) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录。", 'error');
        return null;
    }
    try {
        const BOOSTS_API_URL = API_ENDPOINTS.boosts;
        let url = `${BOOSTS_API_URL}?key=${encodeURIComponent(fileKey)}&limit=${limit}`;
        if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await response.json();
        if (response.ok && result.success) {
            return result;
        } else {
            showNotification(result.error || '获取评论失败', 'error');
            return null;
        }
    } catch (error) {
        console.error('Fetch boosts error:', error);
        showNotification('获取评论失败', 'error');
        return null;
    }
}
async function sendBoostAction(fileKey, content) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录。", 'error');
        return null;
    }
    try {
        const BOOSTS_API_URL = API_ENDPOINTS.boosts;
        const response = await fetch(BOOSTS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ key: fileKey, content }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            return result;
        } else {
            return { success: false, error: result.error || '发送失败' };
        }
    } catch (error) {
        console.error('Send boost error:', error);
        return { success: false, error: '发送失败' };
    }
}
async function deleteBoostAction(boostId) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("请先登录。", 'error');
        return null;
    }
    try {
        const BOOSTS_API_URL = API_ENDPOINTS.boosts;
        const response = await fetch(BOOSTS_API_URL, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ id: boostId }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            return result;
        } else {
            showNotification(result.error || '删除失败', 'error');
            return null;
        }
    } catch (error) {
        console.error('Delete boost error:', error);
        showNotification('删除失败', 'error');
        return null;
    }
}
document.addEventListener('click', (e) => {
    const link = e.target.closest('a.external-link');
    if (link) {
        const href = link.getAttribute('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
            e.preventDefault();
            e.stopPropagation();
            const itemElement = link.closest('.file-list-item');
            const fileKey = itemElement ? itemElement.dataset.key : null;
            if (typeof openLink === 'function') {
                openLink(fileKey, href, link);
            } else {
                window.open(href, '_blank', 'noopener,noreferrer');
            }
        }
    }
}, true);
