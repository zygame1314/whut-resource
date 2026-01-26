async function syncFiles() {
    const confirmed = await showConfirmation({
        title: 'R2文件同步',
        message: '此操作将全量遍历 R2 存储桶并与数据库比对。<br><br><span style="color: #ff4444; font-weight: bold;">⚠️ 警告：全量同步会消耗大量数据库写入额度！</span><br>请勿频繁使用，仅在数据出现严重不一致（如文件丢失、无法删除）时执行。<br><br>过程分为三个阶段：<br>1. 初始化<br>2. 分批比对<br>3. 清理无效记录<br><br>确定要开始吗？',
        confirmText: '明白，开始同步'
    });
    if (!confirmed) return;
    const btn = document.getElementById('sync-btn');
    const originalIcon = btn.innerHTML;
    const updateStatus = (text, iconClass = 'fa-spin fa-spinner') => {
        btn.innerHTML = `<i class="fas ${iconClass}"></i> ${text}`;
    };
    btn.disabled = true;
    updateStatus('初始化...');
    try {
        const initResp = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'init' })
        });
        const initData = await initResp.json();
        if (!initData.success) throw new Error(initData.error || '初始化失败');
        const sessionId = initData.sessionId;
        let cursor = null;
        let truncated = true;
        let totalProcessed = 0;
        let totalDirs = 0;
        while (truncated) {
            updateStatus(`同步中 (${totalProcessed})...`);
            const processResp = await fetch(`${API_BASE}/api/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'process', sessionId, cursor })
            });
            const processData = await processResp.json();
            if (!processData.success) throw new Error(processData.error || '同步过程中断');
            cursor = processData.cursor;
            truncated = processData.truncated;
            totalProcessed += (processData.processed || 0);
            totalDirs += (processData.dirsProcessed || 0);
        }
        updateStatus('正在验证目录结构...');
        const repairResp = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'repair' })
        });
        const repairData = await repairResp.json();
        const repairedCount = repairData.repaired || 0;
        updateStatus('正在清理无效记录...');
        const cleanupResp = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cleanup', sessionId })
        });
        const cleanupData = await cleanupResp.json();
        if (!cleanupData.success) throw new Error(cleanupData.error || '清理阶段失败');
        showNotification(`同步完成！<br>处理文件: ${totalProcessed}<br>修复目录: ${repairedCount}<br>清理记录: ${cleanupData.deletedFiles || 0}`, 'success');
        btn.innerHTML = '<i class="fas fa-check"></i> 完成';
        setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
        console.error('Sync failed:', e);
        showNotification('同步中断: ' + e.message, 'error');
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}
async function syncVectorIndex() {
    const confirmed = await showConfirmation({
        title: '向量索引同步',
        message: '此操作将为所有文件重建 AI 搜索索引。<br><br>首次使用或有大量历史文件时需要执行此操作。<br>新上传的文件会自动添加索引，无需手动同步。<br><br>确定要开始同步吗？',
        confirmText: '开始同步'
    });
    if (!confirmed) return;
    const btn = document.getElementById('vector-sync-btn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    let offset = 0;
    let totalProcessed = 0;
    let totalFiles = 0;
    try {
        while (true) {
            const response = await fetch(`${API_ENDPOINTS.reindex}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ offset })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || '同步失败');
            }
            totalFiles = result.total;
            totalProcessed = result.indexed;
            btn.innerHTML = `<i class="fas fa-brain"></i> ${totalProcessed}/${totalFiles}`;
            if (result.completed) {
                showNotification(`向量索引同步完成！共处理 ${totalProcessed} 个文件。`, 'success');
                break;
            }
            offset = result.nextOffset;
        }
    } catch (e) {
        showNotification('向量索引同步出错: ' + e.message, 'error');
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}
async function fetchPendingRequestsCount() {
    try {
        const response = await fetch(`${API_ENDPOINTS.adminRequests}?action=pending_count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const count = data.count || 0;
            const displayCount = count > 99 ? '99+' : count;
            const badges = [
                document.getElementById('pending-requests-badge'),
                document.getElementById('my-requests-badge')
            ];
            badges.forEach(badge => {
                if (badge) {
                    if (count > 0) {
                        badge.textContent = displayCount;
                        badge.classList.remove('u-hidden');
                    } else {
                        badge.classList.add('u-hidden');
                    }
                }
            });
        }
    } catch (e) {
        console.error('获取待审批数量失败:', e);
    }
}
async function handleBatchAction(ids, action, refreshCallback, reviewNote = '') {
    const token = localStorage.getItem('authToken');
    const total = ids.length;
    showNotification(`正在${action === 'approve' ? '批准' : '拒绝'} ${total} 个请求...`, 'info', 0);
    try {
        const response = await fetch(API_ENDPOINTS.adminRequests, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                request_ids: ids.map(id => parseInt(id)),
                action: action,
                review_note: reviewNote
            })
        });
        const data = await response.json();
        const successCount = data.count || 0;
        const failCount = data.failCount || 0;
        const allFrontendDeleteKeys = (data.executeResult && data.executeResult.keys) ? data.executeResult.keys : [];
        if (allFrontendDeleteKeys.length > 0 && typeof window.executeBatchDelete === 'function') {
            showNotification(`审批完成，正清理 ${allFrontendDeleteKeys.length} 个关联文件...`, 'info');
            try {
                const results = await window.executeBatchDelete(allFrontendDeleteKeys);
                const deleteFailures = results.filter(r => r.status === 'error');
                const deleteSuccess = results.filter(r => r.status === 'success' || r.status === 'pending').length;
                let msg = `批量处理完成: 审批成功 ${successCount}`;
                if (failCount > 0) msg += `, 审批失败 ${failCount}`;
                if (deleteFailures.length > 0) {
                    msg += `<br>文件清理: ${deleteSuccess} 成功, ${deleteFailures.length} 失败`;
                    showNotification(msg, 'warning');
                } else {
                    msg += `<br>文件清理: ${deleteSuccess} 个已完成`;
                    showNotification(msg, 'success');
                }
            } catch (e) {
                showNotification(`批量处理完成，但文件清理出错: ${e.message}`, 'warning');
            }
        } else {
            if (data.success) {
                showNotification(`批量处理完成: ${successCount} 成功${failCount > 0 ? `, ${failCount} 失败` : ''}`, failCount > 0 ? 'warning' : 'success');
            } else {
                showNotification(data.message || '操作失败', 'error');
            }
        }
    } catch (e) {
        console.error('Batch action error:', e);
        showNotification('批量操作请求失败: ' + e.message, 'error');
    }
    fetchPendingRequestsCount();
    if (refreshCallback) refreshCallback();
}
async function handleRequestAction(requestId, action, refreshCallback, reviewNote = '') {
    try {
        const response = await fetch(API_ENDPOINTS.adminRequests, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                request_id: parseInt(requestId),
                action: action,
                review_note: reviewNote
            })
        });
        const data = await response.json();
        if (data.success) {
            showNotification(data.message || (action === 'approve' ? '已批准' : '已拒绝'), 'success');
            if (data.executeResult && data.executeResult.action_required === 'delete_files_frontend') {
                if (typeof window.executeBatchDelete === 'function') {
                    showNotification('正在执行文件删除操作...', 'info');
                    const deleteKeys = data.executeResult.keys;
                    window.executeBatchDelete(deleteKeys).then(results => {
                        const failed = results.filter(r => r.status === 'error');
                        if (failed.length > 0) {
                            const errorMsg = failed.map(f => `${f.key}: ${f.error}`).join('\n');
                            console.error('部分文件删除失败:', errorMsg);
                            showNotification(`审批通过，但有 ${failed.length} 个文件删除失败，请查看控制台`, 'warning');
                        } else {
                            showNotification('关联文件清理完成', 'success');
                        }
                    }).catch(err => {
                        console.error('前端删除执行出错:', err);
                        showNotification('文件删除过程出错: ' + err.message, 'error');
                    });
                } else {
                    showNotification('警告: 前端删除组件未加载，请手动删除文件', 'warning');
                }
            }
            fetchPendingRequestsCount();
            if (refreshCallback) refreshCallback();
        } else {
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (e) {
        console.error('处理审批请求失败:', e);
        showNotification('操作失败: ' + e.message, 'error');
    }
}
