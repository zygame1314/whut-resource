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

function animateShow(el, displayValue) {
    if (!el) return;
    el.style.display = displayValue || 'block';
    el.classList.remove('leaving');
    el.classList.add('entering');
    const onEnd = () => {
        el.classList.remove('entering');
    };
    el.removeEventListener('animationend', onEnd);
    el.addEventListener('animationend', onEnd, { once: true });
}

function animateHide(el) {
    if (!el) return;
    el.classList.remove('entering');
    el.classList.add('leaving');
    const onEnd = () => {
        el.style.display = 'none';
        el.classList.remove('leaving');
    };
    el.removeEventListener('animationend', onEnd);
    el.addEventListener('animationend', onEnd, { once: true });
}

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

function appendSelectedFiles(files) {
    const newFiles = Array.from(files);
    const existingKeys = new Set(
        selectedFiles.map(f => {
            const rel = f._webkitRelativePath || f.webkitRelativePath || f.originalRelativePath || f.name;
            return f.size + '|' + rel;
        })
    );
    let addedCount = 0;
    for (const f of newFiles) {
        const key = f.size + '|' + (f._webkitRelativePath || f.webkitRelativePath || f.originalRelativePath || f.name);
        if (!existingKeys.has(key)) {
            selectedFiles.push(f);
            existingKeys.add(key);
            addedCount++;
        }
    }
    return addedCount;
}

function showSelectedFile(files, append) {
    if (append) {
        appendSelectedFiles(files);
    } else {
        selectedFiles = Array.from(files);
    }
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
    if (fileDropZone) {
        fileDropZone.classList.add('compact');
        const hintText = fileDropZone.querySelector('.drop-zone-text');
        if (hintText) {
            if (!hintText.querySelector('.drop-zone-append-hint')) {
                const hint = document.createElement('span');
                hint.className = 'drop-zone-append-hint';
                hint.textContent = '（继续添加可追加文件）';
                hintText.querySelector('h3') || hintText.insertBefore(hint, hintText.firstChild.nextSibling);
            }
            const h3 = hintText.querySelector('h3');
            if (h3) h3.textContent = '继续添加文件或文件夹';
            const p = hintText.querySelector('p');
            if (p) p.innerHTML = '拖拽或 <span class="browse-text">点击选择</span> 可追加更多文件';
        }
    }
    animateShow(selectedFileInfo, 'block');
    if (fileDropZone && fileDropZone.style.display === 'none') {
        animateShow(fileDropZone, 'flex');
    }
}

function clearSelectedFile() {
    selectedFiles = [];
    if (fileInput) fileInput.value = '';
    if (selectedFileInfo) {
        selectedFileInfo.style.display = 'none';
        selectedFileInfo.classList.remove('entering', 'leaving');
    }
    if (fileDropZone) {
        fileDropZone.classList.remove('compact');
        const h3 = fileDropZone.querySelector('.drop-zone-text h3');
        if (h3) h3.textContent = '拖拽文件或文件夹到此处';
        const p = fileDropZone.querySelector('.drop-zone-text p');
        if (p) p.innerHTML = '或者 <span class="browse-text">点击选择文件或文件夹</span>';
        const hint = fileDropZone.querySelector('.drop-zone-append-hint');
        if (hint) hint.remove();
    }
    if (currentUploadType === 'file' && fileDropZone) {
        animateShow(fileDropZone, 'flex');
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
            const msgEl = uploadStatus.querySelector('.status-message');
            if (msgEl) {
                msgEl.classList.add('fade-out');
                msgEl.addEventListener('transitionend', () => {
                    uploadStatus.innerHTML = '';
                }, { once: true });
            } else {
                uploadStatus.innerHTML = '';
            }
        }, 5000);
    }
}

function switchUploadType(type) {
    currentUploadType = type;
    if (type === 'file') {
        if (uploadTypeFileBtn) uploadTypeFileBtn.classList.add('active');
        if (uploadTypeLinkBtn) uploadTypeLinkBtn.classList.remove('active');
        animateHide(linkUploadZone);
        animateShow(fileDropZone, 'flex');
        if (uploadSubmitBtn) uploadSubmitBtn.innerHTML = '<i class="fas fa-upload"></i><span>开始上传</span>';
    } else {
        if (uploadTypeFileBtn) uploadTypeFileBtn.classList.remove('active');
        if (uploadTypeLinkBtn) uploadTypeLinkBtn.classList.add('active');
        animateHide(fileDropZone);
        if (selectedFileInfo) {
            selectedFileInfo.style.display = 'none';
            selectedFileInfo.classList.remove('entering', 'leaving');
        }
        animateShow(linkUploadZone, 'block');
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
