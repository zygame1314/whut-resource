let selectedFiles = [];
let currentUploadType = 'file';
let currentUploadPath = '';
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const fileDropZone = document.getElementById('file-drop-zone');
const selectedFileInfo = document.getElementById('selected-file-info');
const removeFileBtn = document.getElementById('remove-file-btn');
const uploadSubmitBtn = document.getElementById('upload-submit-btn');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressPercentage = document.getElementById('progress-percentage');
const progressStatus = document.getElementById('progress-status');
const uploadTypeFileBtn = document.getElementById('upload-type-file');
const uploadTypeLinkBtn = document.getElementById('upload-type-link');
const linkUploadZone = document.getElementById('link-upload-zone');
const watermarkOption = document.getElementById('watermark-option');
const watermarkToggle = document.getElementById('watermark-toggle');
function createParticleBackground() {
    const particlesContainer = document.getElementById('particles-background');
    if (!particlesContainer) return;
    particlesContainer.innerHTML = '';
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(46, 139, 87, ${Math.random() * 0.3 + 0.1});
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 15 + 15}s linear infinite;
        `;
        particlesContainer.appendChild(particle);
    }
}
function showSelectedFile(files) {
    selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;
    let totalSize = 0;
    selectedFiles.forEach(file => totalSize += file.size);
    const getRelPath = file => file._webkitRelativePath || file.webkitRelativePath || file.originalRelativePath || '';
    let displayName = '';
    let fileCountText = '';
    let isFolder = false;
    const hasFolderPath = selectedFiles.some(f => getRelPath(f) && getRelPath(f).includes('/'));
    if (hasFolderPath) {
        isFolder = true;
        const firstPath = getRelPath(selectedFiles[0]);
        displayName = firstPath.split('/')[0];
        fileCountText = `(${selectedFiles.length}个文件)`;
    } else if (selectedFiles.length > 1) {
        isFolder = false;
        displayName = `${selectedFiles.length} 个文件`;
        fileCountText = '';
    } else {
        isFolder = false;
        displayName = selectedFiles[0].name;
        fileCountText = '';
    }
    const iconClass = isFolder ? 'fas fa-folder' : (selectedFiles.length > 1 ? 'fas fa-copy' : getFileIcon(selectedFiles[0].name));
    const iconEl = selectedFileInfo.querySelector('.file-icon-preview i') || selectedFileInfo.querySelector('.file-icon-preview');
    if (iconEl) iconEl.className = iconClass;
    const nameEl = selectedFileInfo.querySelector('.file-name');
    if (nameEl) nameEl.textContent = `${displayName} ${fileCountText}`.trim();
    const sizeEl = selectedFileInfo.querySelector('.file-size');
    if (sizeEl) sizeEl.textContent = formatBytes(totalSize);
    selectedFileInfo.style.display = 'block';
    if (fileDropZone) fileDropZone.style.display = 'none';
    selectedFileInfo.style.opacity = '0';
    selectedFileInfo.style.transform = 'translateY(10px)';
    setTimeout(() => {
        selectedFileInfo.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        selectedFileInfo.style.opacity = '1';
        selectedFileInfo.style.transform = 'translateY(0)';
    }, 50);
}
function clearSelectedFile() {
    selectedFiles = [];
    if (fileInput) fileInput.value = '';
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (currentUploadType === 'file' && fileDropZone) {
        fileDropZone.style.display = 'flex';
    }
    resetProgress();
}
function resetProgress() {
    if (uploadProgress) uploadProgress.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressStatus) progressStatus.textContent = '准备上传...';
}
function updateProgress(percentage, status) {
    if (uploadProgress) uploadProgress.style.display = 'block';
    if (progressFill) progressFill.style.width = percentage + '%';
    if (progressPercentage) progressPercentage.textContent = Math.round(percentage) + '%';
    if (progressStatus) progressStatus.textContent = status;
}
function showUploadStatus(message, type = 'info') {
    if (!uploadStatus) return;
    uploadStatus.innerHTML = `
        <div class="status-message status-${type}">
            <i class="${type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    if (type === 'success') {
        setTimeout(() => {
            uploadStatus.innerHTML = '';
        }, 5000);
    }
}
function switchUploadType(type) {
    currentUploadType = type;
    if (type === 'file') {
        if (uploadTypeFileBtn) uploadTypeFileBtn.classList.add('active');
        if (uploadTypeLinkBtn) uploadTypeLinkBtn.classList.remove('active');
        if (fileDropZone) fileDropZone.style.display = 'flex';
        if (linkUploadZone) linkUploadZone.style.display = 'none';
        if (uploadSubmitBtn) uploadSubmitBtn.innerHTML = '<i class="fas fa-upload"></i><span>开始上传</span>';
    } else {
        if (uploadTypeFileBtn) uploadTypeFileBtn.classList.remove('active');
        if (uploadTypeLinkBtn) uploadTypeLinkBtn.classList.add('active');
        if (fileDropZone) fileDropZone.style.display = 'none';
        if (selectedFileInfo) selectedFileInfo.style.display = 'none';
        if (linkUploadZone) linkUploadZone.style.display = 'block';
        if (uploadSubmitBtn) uploadSubmitBtn.innerHTML = '<i class="fas fa-plus"></i><span>添加链接</span>';
        clearSelectedFile();
    }
}
function showNoPermissionUI() {
    const uploadCard = document.querySelector('.upload-card');
    if (uploadCard) {
        uploadCard.innerHTML = `
            <div class="no-permission-container">
                <div class="no-permission-icon">
                    <i class="fas fa-lock"></i>
                </div>
                <h2 class="no-permission-title">暂无上传权限</h2>
                <p class="no-permission-desc">
                    抱歉，目前只有管理员可以上传文件。<br>
                    如果你有优质的学习资料想要分享，请联系管理员。
                </p>
                <div class="no-permission-actions">
                    <a href="index.html" class="primary-btn">
                        <i class="fas fa-home"></i>
                        <span>返回首页</span>
                    </a>
                    <a href="mailto:Proudly_embers@qq.com" class="secondary-btn">
                        <i class="fas fa-envelope"></i>
                        <span>联系管理员</span>
                    </a>
                </div>
            </div>
        `;
    }
}
