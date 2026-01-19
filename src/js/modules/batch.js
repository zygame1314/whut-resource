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
        selectedLinkKeys.clear();
        document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.file-list-item.selected').forEach(item => item.classList.remove('selected'));
    }
    updateSelectionToolbar();
}
function handleItemSelection(checkbox, item) {
    const listItem = checkbox.closest('.file-list-item');
    const isDirectory = !!item.isDirectory;
    const isLink = !!item.isLink;
    if (checkbox.checked) {
        selectedItems.add(item.key);
        if (isDirectory) {
            selectedDirectoryKeys.add(item.key);
        }
        if (isLink) {
            selectedLinkKeys.add(item.key);
        }
        listItem.classList.add('selected');
    } else {
        selectedItems.delete(item.key);
        if (isDirectory) {
            selectedDirectoryKeys.delete(item.key);
        }
        if (isLink) {
            selectedLinkKeys.delete(item.key);
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
    const isAdmin = typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
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
    const directoryKeys = Array.from(selectedDirectoryKeys);
    const hasDirectories = directoryKeys.length > 0;
    const performBatchDelete = async () => {
        try {
            const results = await window.executeBatchDelete(keysToDelete);
            let successCount = 0;
            let errorCount = 0;
            let pendingCount = 0;
            const errors = [];
            for (const r of results) {
                if (r.status === 'success') successCount++;
                else if (r.status === 'pending') pendingCount++;
                else {
                    errorCount++;
                    errors.push(`- ${r.key.split('/').pop()}: ${r.error}`);
                }
            }
            if (pendingCount > 0 && successCount === 0 && errorCount === 0) {
                showNotification(`已提交 ${pendingCount} 个删除请求，等待超级管理员审批`, 'info');
            } else if (errorCount > 0) {
                const errorMessage = `删除完成，${successCount}个成功${pendingCount > 0 ? `，${pendingCount}个待审批` : ''}, ${errorCount}个失败。<br>${errors.join('<br>')}`;
                showNotification(errorMessage, 'error');
            } else {
                let message = `成功删除了 ${successCount} 个项目`;
                if (pendingCount > 0) message += `，${pendingCount} 个已提交审批`;
                showNotification(message, 'success');
            }
        } catch (e) {
            showNotification(e.message, 'error');
        }
        keysToDelete.forEach(key => {
            const parentPrefix = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
            if (directoryCache[parentPrefix]) {
                delete directoryCache[parentPrefix];
            }
        });
        if (directoryCache[currentPrefix]) delete directoryCache[currentPrefix];
        if (typeof searchCache !== 'undefined') searchCache.clear();
        selectedItems.clear();
        selectedDirectoryKeys.clear();
        selectedLinkKeys.clear();
        fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage).then(() => {
            if (isSelectionMode) toggleSelectionMode();
        });
    };
    try {
        let confirmMessage = `你确定要永久删除选中的 ${keysToDelete.length} 个项目吗？<br><b>此操作不可逆！</b>`;
        let confirmTitle = '确认批量删除';
        if (hasDirectories) {
            confirmTitle = '⚠️ 确认批量删除（包含文件夹）';
            confirmMessage = `你确定要永久删除选中的 ${keysToDelete.length} 个项目吗？<br><br>` +
                `<span style="color: var(--accent-color);">⚠️ 其中包含 ${directoryKeys.length} 个文件夹，这将删除文件夹内的所有内容！<br>此操作不可逆！</span>`;
        }
        const confirmed = await showConfirmation({
            title: confirmTitle,
            message: confirmMessage,
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
    const linkKeys = selectedKeys.filter(key => selectedLinkKeys.has(key));
    const fileKeys = selectedKeys.filter(key => !selectedDirectoryKeys.has(key) && !selectedLinkKeys.has(key));
    if (fileKeys.length === 0) {
        if (directoryKeys.length > 0 && linkKeys.length > 0) {
            showNotification('不支持文件夹和外部链接，请选择文件后重试。', 'warning');
        } else if (directoryKeys.length > 0) {
            showNotification('不支持文件夹，请选择文件后重试。', 'warning');
        } else {
            showNotification('不支持外部链接，请选择文件后重试。', 'warning');
        }
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
    const skippedMessages = [];
    if (directoryKeys.length > 0) {
        skippedMessages.push(`${directoryKeys.length} 个文件夹`);
    }
    if (linkKeys.length > 0) {
        skippedMessages.push(`${linkKeys.length} 个外部链接`);
    }
    if (skippedMessages.length > 0) {
        showNotification(`已跳过 ${skippedMessages.join('和')}，不支持批量下载。`, 'info');
    }
    showNotification(`正在为 ${fileKeys.length} 个文件生成下载链接...`, 'info');
    try {
        const response = await fetch(API_ENDPOINTS.batchDownload, {
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
                const downloadUrl = `${API_BASE}${file.urlPath}`;
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
        const CONCURRENCY = 3;
        const moveOneItem = async (key) => {
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
                    return { status: 'error', key, error: result.error || '未知错误' };
                } else {
                    return { status: 'success', key };
                }
            } catch (e) {
                return { status: 'error', key, error: e.message };
            }
        };
        const results = [];
        for (let i = 0; i < keysToMove.length; i += CONCURRENCY) {
            const batch = keysToMove.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(moveOneItem));
            results.push(...batchResults);
        }
        for (const r of results) {
            if (r.status === 'success') successCount++;
            else {
                errorCount++;
                errors.push(`- ${r.key.split('/').pop()}: ${r.error}`);
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
        if (typeof searchCache !== 'undefined') searchCache.clear();
        selectedItems.clear();
        selectedDirectoryKeys.clear();
        selectedLinkKeys.clear();
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
