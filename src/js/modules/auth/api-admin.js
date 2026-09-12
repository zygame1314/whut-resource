async function pollMaintenanceJob(endpoint, jobId, onProgress) {
    while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'jobStatus', jobId })
        });
        const data = await resp.json();
        if (!data.success || !data.job) throw new Error(data.error || '查询任务状态失败');
        const job = data.job;
        if (onProgress) onProgress(job);
        if (job.status === 'completed') return job;
        if (job.status === 'failed') throw new Error(job.message || '任务执行失败');
    }
}
async function syncFiles() {
    const confirmed = await showConfirmation({
        title: 'R2文件同步',
        message: '此操作将全量遍历 R2 存储桶并与数据库比对。<br><br><span style="color: #ff4444; font-weight: bold;">⚠️ 警告：全量同步会消耗大量数据库写入额度！</span><br><br>请勿频繁使用，仅在数据出现严重不一致（如文件丢失、无法删除）时执行。<br><br>任务将在后台异步执行，可关闭页面，稍后回来查看结果。<br><br>确定要开始吗？',
        confirmText: '明白，开始同步'
    });
    if (!confirmed) return;
    const btn = document.getElementById('sync-btn');
    const originalIcon = btn.innerHTML;
    const updateStatus = (text, iconClass = 'fa-spin fa-spinner') => {
        btn.innerHTML = `<i class="fas ${iconClass}"></i> ${text}`;
    };
    btn.disabled = true;
    updateStatus('提交任务...');
    try {
        const startResp = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'startSync' })
        });
        const startData = await startResp.json();
        if (!startData.success) throw new Error(startData.error || '任务提交失败');
        const sessionId = startData.sessionId;
        updateStatus('同步中...');
        await pollMaintenanceJob(`${API_BASE}/api/sync`, startData.jobId, (job) => {
            updateStatus(`同步中 (${job.processed || 0})...`);
        });
        updateStatus('正在验证目录结构...');
        const repairResp = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'repair' })
        });
        const repairData = await repairResp.json();
        const repairedCount = repairData.repaired || 0;
        updateStatus('正在提交清理任务...');
        const cleanupResp = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'startCleanup', sessionId })
        });
        const cleanupData = await cleanupResp.json();
        if (!cleanupData.success) throw new Error(cleanupData.error || '清理任务提交失败');
        const cleanupJob = await pollMaintenanceJob(`${API_BASE}/api/sync`, cleanupData.jobId, (job) => {
            updateStatus(`清理中 (${job.processed || 0})...`);
        });
        showNotification(`同步完成！<br>修复目录: ${repairedCount}<br>清理记录: ${cleanupJob.processed || 0}`, 'success', 6000);
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
        message: '此操作将为所有文件重建 AI 搜索索引。<br><br>首次使用或有大量历史文件时需要执行此操作。<br>新上传的文件会自动添加索引，无需手动同步。<br><br>任务将在后台异步执行，可关闭页面，稍后回来查看结果。<br><br>确定要开始同步吗？',
        confirmText: '开始同步'
    });
    if (!confirmed) return;
    const btn = document.getElementById('vector-sync-btn');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
        const startResp = await fetch(`${API_ENDPOINTS.reindex}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'reindexAsync' })
        });
        const startData = await startResp.json();
        if (!startData.success) throw new Error(startData.error || '任务提交失败');
        const job = await pollMaintenanceJob(`${API_ENDPOINTS.reindex}`, startData.jobId, (j) => {
            btn.innerHTML = `<i class="fas fa-brain"></i> ${j.processed || 0}/${j.total || startData.total || 0}`;
        });
        showNotification(`向量索引同步完成！共处理 ${job.processed || 0} 个文件。`, 'success');
    } catch (e) {
        showNotification('向量索引同步出错: ' + e.message, 'error');
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}
async function fetchPendingRequestsCount() {
    try {
        const response = await fetch(`${API_ENDPOINTS.adminManagement}?action=pending_count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const hasPending = !!data.has_pending;
            const badges = [
                document.getElementById('pending-requests-badge'),
                document.getElementById('my-requests-badge'),
                document.getElementById('toggle-requests-badge')
            ];
            badges.forEach(badge => {
                if (badge) {
                    if (hasPending) {
                        badge.textContent = '';
                        badge.classList.add('badge-dot');
                        badge.classList.remove('u-hidden');
                    } else {
                        badge.classList.add('u-hidden');
                        badge.classList.remove('badge-dot');
                    }
                }
            });
            const mobileBadge = document.getElementById('mobile-menu-badge');
            if (mobileBadge) {
                mobileBadge.setAttribute('data-admin-pending', hasPending ? 'true' : 'false');
            }
        }
    } catch (e) {
        console.error('获取待审批状态失败:', e);
    }
}
async function handleBatchAction(ids, action, refreshCallback, reviewNote = '') {
    const token = localStorage.getItem('authToken');
    const total = ids.length;
    showNotification(`正在${action === 'approve' ? '批准' : '拒绝'} ${total} 个请求...`, 'info');
    try {
        const response = await fetch(API_ENDPOINTS.adminManagement, {
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
        const execResult = data.executeResult || {};
        const serverJobs = Array.isArray(execResult.jobs) ? execResult.jobs : [];
        const allFrontendDeleteKeys = execResult.keys ? execResult.keys : [];
        if (serverJobs.length > 0) {
            const totalItems = serverJobs.reduce((sum, j) => sum + (j.count || 0), 0);
            let msg = `批量处理完成: 审批成功 ${successCount}`;
            if (failCount > 0) msg += `, 审批失败 ${failCount}`;
            msg += `<br>文件删除任务已提交（${totalItems} 项），正在后台异步执行`;
            showNotification(msg, 'success', 6000);
        }
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
                    showNotification(msg, 'warning', 6000);
                } else {
                    msg += `<br>文件清理: ${deleteSuccess} 个已完成`;
                    showNotification(msg, 'success', 6000);
                }
            } catch (e) {
                showNotification(`批量处理完成，但文件清理出错: ${e.message}`, 'warning');
            }
        } else if (serverJobs.length === 0) {
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
        const response = await fetch(API_ENDPOINTS.adminManagement, {
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
            if (data.executeResult && data.executeResult.action_required === 'delete_files_server') {
                const jobs = Array.isArray(data.executeResult.jobs) ? data.executeResult.jobs : [];
                const count = jobs.reduce((sum, j) => sum + (j.count || 0), 0) || data.executeResult.count || (data.executeResult.keys ? data.executeResult.keys.length : 0);
                showNotification(`已提交异步删除任务（${count} 项），正在后台执行`, 'info');
            }
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
