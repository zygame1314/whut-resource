const uploadStatus = document.getElementById('upload-status');
const progressBar = document.querySelector('.progress-bar');
const progressFill = document.getElementById('progress-fill');
const progressText = document.querySelector('.progress-text');
const progressPercentage = document.getElementById('progress-percentage');
const progressStatus = document.getElementById('progress-status');
const selectedFileInfo = document.getElementById('selected-file-info');
const fileInput = document.getElementById('file-input');
const fileDropZone = document.getElementById('file-drop-zone');
function createParticleBackground() {
    const particlesContainer = document.getElementById('particles-background');
    if (!particlesContainer) return;
    const existingParticles = particlesContainer.querySelectorAll('.particle-base');
    existingParticles.forEach(p => p.remove());
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle-base';
        particle.style.cssText = `
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(46, 139, 87, ${Math.random() * 0.5 + 0.1});
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 10 + 10}s linear infinite;
        `;
        particlesContainer.appendChild(particle);
    }
}
function showSelectedFile(files) {
    if (!files || files.length === 0) return;
    fileDropZone.style.display = 'none';
    selectedFileInfo.style.display = 'flex';
    if (files.length === 1) {
        const file = files[0];
        const iconClass = getFileIcon(file.name);
        selectedFileInfo.querySelector('.file-icon-preview').innerHTML = `<i class="${iconClass}"></i>`;
        selectedFileInfo.querySelector('.file-name').textContent = file.name;
        selectedFileInfo.querySelector('.file-size').textContent = formatBytes(file.size);
    } else {
        selectedFileInfo.querySelector('.file-icon-preview').innerHTML = `<i class="fas fa-layer-group"></i>`;
        selectedFileInfo.querySelector('.file-name').textContent = `已选择 ${files.length} 个文件`;
        let totalSize = 0;
        Array.from(files).forEach(f => totalSize += f.size);
        selectedFileInfo.querySelector('.file-size').textContent = `总大小: ${formatBytes(totalSize)}`;
    }
    if (progressBar) progressBar.style.display = 'none';
    if (progressText) progressText.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    if (progressStatus) progressStatus.textContent = '';
}
function clearSelectedFile() {
    fileInput.value = '';
    selectedFileInfo.style.display = 'none';
    fileDropZone.style.display = 'flex';
    if (progressBar) progressBar.style.display = 'none';
    if (progressText) progressText.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    if (progressStatus) progressStatus.textContent = '';
}
function resetProgress() {
    if (progressBar) progressBar.style.display = 'none';
    if (progressText) progressText.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressStatus) progressStatus.textContent = '准备上传...';
}
function updateProgress(percentage, status) {
    if (progressBar) progressBar.style.display = 'block';
    if (progressText) progressText.style.display = 'flex';
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressPercentage) progressPercentage.textContent = `${Math.round(percentage)}%`;
    if (progressStatus && status) progressStatus.textContent = status;
}
function showUploadStatus(message, type = 'info') {
    if (!uploadStatus) return;
    uploadStatus.textContent = message;
    uploadStatus.className = 'upload-status';
    uploadStatus.classList.add(`status-${type}`);
    uploadStatus.style.display = 'block';
    setTimeout(() => {
        uploadStatus.style.display = 'none';
    }, 5000);
}
function showNoPermissionUI() {
    const heroSection = document.querySelector('.hero-section');
    const uploadContainer = document.querySelector('.upload-container');
    if (heroSection) {
        heroSection.innerHTML = `
            <div class="hero-content">
                <div class="hero-text" style="text-align: center;">
                    <h1 class="main-heading">
                        <i class="fas fa-lock" style="margin-right: 1rem; color: var(--error-color);"></i>
                        <span class="text-gradient">暂无权限</span>
                    </h1>
                    <p class="hero-description">您当前没有上传文件的权限。</p>
                </div>
            </div>
        `;
    }
    if (uploadContainer) {
        uploadContainer.innerHTML = `
            <div class="upload-card">
                <div class="empty-state">
                    <i class="fas fa-user-lock u-font-large-icon"></i>
                    <p>您的账户尚未开通上传权限。</p>
                    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">
                        请联系管理员申请权限，或等待审核通过。
                    </p>
                    <a href="index.html" class="primary-btn" style="margin-top: 1.5rem;">
                        <i class="fas fa-home"></i> 返回首页
                    </a>
                </div>
            </div>
        `;
    }
}
