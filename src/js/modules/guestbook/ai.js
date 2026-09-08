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
                guestbook_id: id
            })
        });
        removeLoading();
        if (!response.ok) {
            const data = await response.json();
            showNotification(data.error || 'AI 处理失败', 'error');
            return;
        }
        const result = await response.json();
        showNotification(result?.message || 'AI 审核已提交，结果将自动生效', 'success');
    } catch (error) {
        removeLoading();
        console.error('AI 处理错误:', error);
        showNotification('AI 处理出错', 'error');
    } finally {
        isAiProcessing = false;
    }
};
