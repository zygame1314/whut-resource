window.aiProcessGuestbook = async function (id) {
    if (isAiProcessing) {
        showNotification('AI 正在处理中，请稍候...', 'warning');
        return;
    }
    isAiProcessing = true;
    const GUESTBOOK_AI_API_URL = API_ENDPOINTS.guestbookAi;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'confirmation-modal-overlay ai-loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="ai-loading-modal">
            <div class="ai-loading-spinner">
                <i class="fas fa-robot fa-spin"></i>
            </div>
            <h3>AI 正在分析留言</h3>
            <p class="ai-loading-hint">正在进行内容审核与资源匹配...</p>
            <div class="ai-loading-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    const removeLoading = () => {
        loadingOverlay.classList.add('closing');
        loadingOverlay.addEventListener('animationend', () => {
            if (loadingOverlay.parentNode) {
                document.body.removeChild(loadingOverlay);
            }
        }, { once: true });
    };
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                guestbook_id: id,
                auto_mode: false
            })
        });
        removeLoading();
        if (!response.ok) {
            const data = await response.json();
            showNotification(data.error || 'AI 处理失败', 'error');
            return;
        }
        const result = await response.json();
        await showAiResultModal(id, result);
    } catch (error) {
        removeLoading();
        console.error('AI 处理错误:', error);
        showNotification('AI 处理出错', 'error');
    } finally {
        isAiProcessing = false;
    }
};
async function showAiResultModal(guestbookId, result) {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        let actionIcon = 'fa-robot';
        let actionColor = 'var(--primary)';
        let actionTitle = 'AI 分析结果';
        let actionDescription = '';
        let resourcesHtml = '';
        let buttonsHtml = '';
        switch (result.action) {
            case 'reject':
                actionIcon = 'fa-times-circle';
                actionColor = 'var(--error)';
                actionTitle = 'AI 建议驳回';
                actionDescription = `<div class="ai-result-reason"><strong>驳回原因：</strong>${escapeHtml(result.reason)}</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="apply">确认驳回</button>
                `;
                break;
            case 'hide':
                actionIcon = 'fa-eye-slash';
                actionColor = 'var(--warning)';
                actionTitle = 'AI 建议隐藏';
                actionDescription = `<div class="ai-result-reason"><strong>隐藏原因：</strong>${escapeHtml(result.reason)}</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-warning" data-action="hide">确认隐藏</button>
                `;
                break;
            case 'ban_user':
                actionIcon = 'fa-user-slash';
                actionColor = 'var(--error)';
                actionTitle = 'AI 建议封禁用户（严重违规）';
                actionDescription = `<div class="ai-result-reason"><strong>封禁原因：</strong>${escapeHtml(result.reason)}</div>
                    <div class="ai-result-warning">⚠️ 将封禁用户并删除该留言，且无法恢复！</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="ban_and_delete">封禁并删除</button>
                `;
                break;
            case 'delete':
                actionIcon = 'fa-trash-alt';
                actionColor = 'var(--error)';
                actionTitle = 'AI 建议删除（严重违规）';
                actionDescription = `<div class="ai-result-reason"><strong>删除原因：</strong>${escapeHtml(result.reason)}</div>
                    <div class="ai-result-warning">⚠️ 删除后无法恢复，请谨慎操作！</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="delete">确认删除</button>
                `;
                break;
            case 'resolve':
                actionIcon = 'fa-check-circle';
                actionColor = 'var(--success)';
                actionTitle = 'AI 建议标记为已解决';
                if (result.searchResults && result.searchResults.length > 0) {
                    actionDescription = `<div class="ai-result-message">已找到 ${result.searchResults.length} 个相关资源：</div>`;
                    resourcesHtml = renderAiSearchResults(result.searchResults);
                } else {
                    actionDescription = `<div class="ai-result-reply">${escapeHtml(result.reply)}</div>`;
                }
                if (result.resource_path) {
                    actionDescription += `<div class="ai-result-path"><i class="fas fa-folder-open"></i> 资源目录：<strong>${escapeHtml(result.resource_path)}</strong></div>`;
                }
                if (result.note) {
                    actionDescription += `<div class="ai-result-note" style="margin-top:8px; color:var(--text-secondary);"><strong>备注：</strong>${escapeHtml(result.note)}</div>`;
                }
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">取消</button>
                    <button class="confirm-btn confirm-btn-primary" data-action="apply">确认解决</button>
                `;
                break;
            case 'search':
            case 'search_completed':
                actionIcon = 'fa-search';
                actionColor = 'var(--secondary)';
                actionTitle = 'AI 搜索结果';
                if (result.searchResults && result.searchResults.length > 0) {
                    actionDescription = `<div class="ai-result-message">已找到 ${result.searchResults.length} 个相关资源：</div>`;
                    resourcesHtml = renderAiSearchResults(result.searchResults);
                    buttonsHtml = `
                        <button class="confirm-btn-cancel" data-action="cancel">关闭</button>
                        <button class="confirm-btn confirm-btn-primary" data-action="resolve">标记为已解决</button>
                    `;
                } else {
                    actionDescription = `<div class="ai-result-message">${escapeHtml(result.message)}</div>`;
                    buttonsHtml = `<button class="confirm-btn-cancel" data-action="cancel">关闭</button>`;
                }
                break;
            case 'keep_pending':
                actionIcon = 'fa-clock';
                actionColor = 'var(--warning)';
                actionTitle = 'AI 建议人工处理';
                actionDescription = `<div class="ai-result-note"><strong>备注：</strong>${escapeHtml(result.note || '需要管理员人工审核处理')}</div>`;
                if (result.category) {
                    actionDescription += `<div class="ai-result-note" style="margin-top:0.5rem;"><strong>待办分类：</strong>${escapeHtml(result.category)}</div>`;
                }
                buttonsHtml = `<button class="confirm-btn-cancel" data-action="cancel">关闭</button>`;
                break;
            case 'search_no_results':
                actionIcon = 'fa-search-minus';
                actionColor = 'var(--warning)';
                actionTitle = '未找到相关资源';
                actionDescription = `<div class="ai-result-message">${escapeHtml(result.message)}</div>`;
                buttonsHtml = `
                    <button class="confirm-btn-cancel" data-action="cancel">关闭</button>
                    <button class="confirm-btn confirm-btn-danger" data-action="reject">驳回留言</button>
                `;
                break;
            default:
                actionDescription = `<div class="ai-result-message">${escapeHtml(result.message || result.ai_response || '无法确定操作')}</div>`;
                buttonsHtml = `<button class="confirm-btn-cancel" data-action="cancel">关闭</button>`;
        }
        modalOverlay.innerHTML = `
            <div class="confirmation-modal ai-result-modal">
                <div class="ai-result-header" style="color: ${actionColor}">
                    <i class="fas ${actionIcon}"></i>
                    <h3>${actionTitle}</h3>
                </div>
                <div class="ai-result-content">
                    ${actionDescription}
                    ${resourcesHtml}
                </div>
                <div class="confirmation-buttons">
                    ${buttonsHtml}
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const closeModal = () => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                resolve();
            }, { once: true });
        };
        modalOverlay.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                if (action === 'cancel') {
                    closeModal();
                    return;
                }
                if (action === 'apply') {
                    if (result.action === 'reject') {
                        await applyAiAction(guestbookId, 'reject', result.reason, null);
                        closeModal();
                        updateGuestbookCache(guestbookId, { status: 'rejected', reject_reason: result.reason, is_hidden: 1 });
                    } else if (result.action === 'resolve') {
                        let resolveValue = null;
                        if (result.resource_path || result.note) {
                            resolveValue = JSON.stringify({ path: result.resource_path || null, note: result.note || null });
                        }
                        await applyAiAction(guestbookId, 'resolve', null, resolveValue);
                        closeModal();
                        updateGuestbookCache(guestbookId, { status: 'resolved', reject_reason: null, resolve_note: resolveValue, is_hidden: 0 });
                    }
                    return;
                }
                if (action === 'hide') {
                    await applyAiAction(guestbookId, 'hide', null, null);
                    closeModal();
                    updateGuestbookCache(guestbookId, { is_hidden: 1 });
                    return;
                }
                if (action === 'delete') {
                    const confirmed = await showConfirmation({
                        title: '确认删除留言',
                        message: '此操作无法撤销！确定要删除这条留言吗？',
                        confirmText: '确认删除',
                        confirmClass: 'confirm-btn-danger'
                    });
                    if (confirmed) {
                        await applyAiDeleteAction(guestbookId);
                        closeModal();
                        removeFromGuestbookCache(guestbookId);
                    }
                    return;
                }
                if (action === 'ban_and_delete') {
                    const confirmed = await showConfirmation({
                        title: '确认封禁并删除',
                        message: '将永久封禁该用户并删除此留言，确定吗？',
                        confirmText: '封禁并删除',
                        confirmClass: 'confirm-btn-danger'
                    });
                    if (confirmed) {
                        try {
                            await handleGuestbookAction(guestbookId, 'ban_user');
                            const token = localStorage.getItem('authToken');
                            await fetch(`${GUESTBOOK_API_URL}?id=${guestbookId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            showNotification('用户已封禁且留言已删除', 'success');
                            closeModal();
                            removeFromGuestbookCache(guestbookId);
                        } catch (err) {
                            console.error('Ban and delete failed:', err);
                            showNotification('操作部分失败，请重试', 'error');
                        }
                    }
                    return;
                }
                if (action === 'resolve') {
                    await applyAiAction(guestbookId, 'resolve', null, null);
                    closeModal();
                    updateGuestbookCache(guestbookId, { status: 'resolved', reject_reason: null, is_hidden: 0 });
                    return;
                }
                if (action === 'reject') {
                    closeModal();
                    window.rejectGuestbook(guestbookId);
                    return;
                }
            });
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    });
}
function renderAiSearchResults(results) {
    if (!results || results.length === 0) return '';
    const items = results.map(file => {
        const parentPath = file.parent_path ? file.parent_path.replace(/\/+$/, '') : '';
        const path = parentPath ? `${parentPath}/${file.name}` : file.name;
        const score = file.similarity_score ? `${(file.similarity_score * 100).toFixed(0)}%` : '';
        const icon = file.is_directory ? 'fa-folder' : 'fa-file';
        return `
            <div class="ai-search-result-item" title="${escapeHtml(path)}">
                <i class="fas ${icon}"></i>
                <div class="ai-search-result-info">
                    <span class="ai-search-result-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span class="ai-search-result-path" title="${escapeHtml(path)}">${escapeHtml(path)}</span>
                </div>
                ${score ? `<span class="ai-search-result-score">${score}</span>` : ''}
            </div>
        `;
    }).join('');
    return `
        <div class="ai-search-results">
            <div class="ai-search-results-title"><i class="fas fa-list"></i> 匹配的资源：</div>
            ${items}
        </div>
    `;
}
async function applyAiAction(guestbookId, action, reason, resolveNote) {
    try {
        const token = localStorage.getItem('authToken');
        const body = { id: guestbookId, action: action };
        if (action === 'reject' && reason) {
            body.reject_reason = reason;
        }
        if (action === 'resolve' && resolveNote) {
            body.resolve_note = resolveNote;
        }
        const response = await fetch(API_ENDPOINTS.guestbook, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            showNotification('操作成功', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('应用 AI 操作错误:', error);
        showNotification('操作出错', 'error');
    }
}
async function applyAiDeleteAction(guestbookId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_ENDPOINTS.guestbook}?id=${guestbookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            showNotification('留言已删除', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除留言错误:', error);
        showNotification('删除出错', 'error');
    }
}
