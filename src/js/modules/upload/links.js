const linkNameInput = document.getElementById('link-name-input');
const linkUrlInput = document.getElementById('link-url-input');
const linkPreview = document.getElementById('link-preview');
const linkPreviewText = document.getElementById('link-preview-text');
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}
function initLinkUpload() {
    if (linkUrlInput) {
        linkUrlInput.addEventListener('input', () => {
            const url = linkUrlInput.value.trim();
            if (url && isValidUrl(url)) {
                linkPreview.style.display = 'flex';
                linkPreviewText.textContent = url;
                linkPreviewText.href = url;
            } else {
                linkPreview.style.display = 'none';
            }
        });
    }
}
async function uploadLink() {
    const name = linkNameInput.value.trim();
    const url = linkUrlInput.value.trim();
    if (!name) {
        showNotification('请输入链接名称', 'warning');
        return;
    }
    if (!url) {
        showNotification('请输入链接地址', 'warning');
        return;
    }
    if (!isValidUrl(url)) {
        showNotification('请输入有效的链接地址 (http://或https://)', 'warning');
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) return;
    const submitBtn = document.getElementById('upload-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上传中...';
    }
    try {
        let targetPath = '';
        if (typeof currentSelectedPath !== 'undefined') {
            targetPath = currentSelectedPath;
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            targetPath = urlParams.get('path') || '';
        }
        const finalKey = targetPath ? `${targetPath}${name}` : name;
        const response = await fetch(API_ENDPOINTS.files, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                type: 'link',
                key: finalKey,
                link_url: url
            })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showNotification('链接添加成功！', 'success');
            if (result.pending_approval) {
                showNotification('链接已提交审核', 'info');
            }
            linkNameInput.value = '';
            linkUrlInput.value = '';
            linkPreview.style.display = 'none';
        } else {
            throw new Error(result.error || '添加失败');
        }
    } catch (error) {
        console.error('Link upload error:', error);
        showNotification(`添加链接失败: ${error.message}`, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> 开始上传';
        }
    }
}
