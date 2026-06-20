const linkNameInput = document.getElementById('link-name-input');
const linkUrlInput = document.getElementById('link-url-input');
const linkPreview = document.getElementById('link-preview');
const linkPreviewText = document.getElementById('link-preview-text');
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}
function initLinkUpload() {
    if (uploadTypeFileBtn) {
        uploadTypeFileBtn.addEventListener('click', () => switchUploadType('file'));
    }
    if (uploadTypeLinkBtn) {
        uploadTypeLinkBtn.addEventListener('click', () => switchUploadType('link'));
    }
    if (linkUrlInput) {
        linkUrlInput.addEventListener('input', () => {
            const url = linkUrlInput.value.trim();
            if (url && isValidUrl(url)) {
                if (linkPreview) linkPreview.style.display = 'flex';
                if (linkPreviewText) linkPreviewText.textContent = url;
            } else {
                if (linkPreview) linkPreview.style.display = 'none';
            }
        });
    }
}
async function uploadLink() {
    const linkName = linkNameInput ? linkNameInput.value.trim() : '';
    const linkUrl = linkUrlInput ? linkUrlInput.value.trim() : '';
    if (!linkName) {
        showNotification('请输入链接名称', 'error');
        if (linkNameInput) linkNameInput.focus();
        return;
    }
    const nameCheck = validateItemName(linkName);
    if (!nameCheck.valid) {
        showNotification(nameCheck.error, 'error');
        if (linkNameInput) linkNameInput.focus();
        return;
    }
    if (!linkUrl) {
        showNotification('请输入链接地址', 'error');
        if (linkUrlInput) linkUrlInput.focus();
        return;
    }
    if (!isValidUrl(linkUrl)) {
        showNotification('请输入有效的URL（http://或https://）', 'error');
        if (linkUrlInput) linkUrlInput.focus();
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification('请先登录', 'error');
        return;
    }
    if (uploadSubmitBtn) {
        uploadSubmitBtn.disabled = true;
        uploadSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>正在添加...</span>';
    }
    try {
        let targetPath = currentUploadPath || '';
        const response = await fetch(API_ENDPOINTS.upload, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                linkName: nameCheck.value,
                linkUrl: linkUrl,
                uploadPath: targetPath
            })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showNotification('链接添加成功！', 'success');
            if (result.pending_approval) {
                showNotification('链接已提交审核', 'info');
            }
            if (linkNameInput) linkNameInput.value = '';
            if (linkUrlInput) linkUrlInput.value = '';
            if (linkPreview) linkPreview.style.display = 'none';
        } else {
            showNotification(result.error || '链接添加失败', 'error');
        }
    } catch (error) {
        console.error('链接上传错误:', error);
        showNotification('网络错误，请稍后重试', 'error');
    } finally {
        if (uploadSubmitBtn) {
            uploadSubmitBtn.disabled = false;
            uploadSubmitBtn.innerHTML = '<i class="fas fa-plus"></i><span>添加链接</span>';
        }
    }
}
