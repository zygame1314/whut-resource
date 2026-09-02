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
const bakeToggle = document.getElementById('bake-toggle');
const traceToggle = document.getElementById('trace-toggle');

(function initWatermarkSubToggles() {
    if (!watermarkToggle) return;
    const sync = () => {
        document.querySelectorAll('.upload-option-sub[data-master="watermark-toggle"]').forEach(row => {
            row.style.opacity = watermarkToggle.checked ? '1' : '0.4';
            row.style.pointerEvents = watermarkToggle.checked ? 'auto' : 'none';
        });
    };
    watermarkToggle.addEventListener('change', sync);
    sync();
})();

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

function animateHide(el, callback) {
    if (!el) {
        if (callback) callback();
        return;
    }
    el.classList.remove('entering');
    el.classList.add('leaving');
    const onEnd = () => {
        el.style.display = 'none';
        el.classList.remove('leaving');
        if (callback) callback();
    };
    el.removeEventListener('animationend', onEnd);
    el.addEventListener('animationend', onEnd, { once: true });
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
                const h3 = hintText.querySelector('h3');
                if (h3) {
                    h3.parentNode.insertBefore(hint, h3.nextSibling);
                } else {
                    hintText.insertBefore(hint, hintText.firstChild);
                }
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
    if (uploadProgress) {
        uploadProgress.style.display = 'none';
        uploadProgress.classList.remove('stage-processing', 'stage-baking', 'stage-uploading', 'stage-done');
        delete uploadProgress.dataset.stage;
    }
    if (progressFill) progressFill.style.width = '0%';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressStatus) progressStatus.textContent = '准备上传...';
    const speedEl = document.getElementById('progress-speed');
    if (speedEl) speedEl.remove();
    const detailEl = document.getElementById('progress-detail');
    if (detailEl) detailEl.remove();
    const stageBox = document.getElementById('progress-stage-box');
    if (stageBox) stageBox.remove();
    const group = document.getElementById('progress-text-right');
    if (group && progressStatus && progressStatus.parentNode !== group) {
        group.parentNode.insertBefore(progressStatus, group);
        group.remove();
    } else if (group && group.childNodes.length === 0) {
        group.remove();
    }
}

function updateProgress(percentage, status) {
    if (uploadProgress) uploadProgress.style.display = 'block';
    if (progressFill) progressFill.style.width = percentage + '%';
    if (progressPercentage) progressPercentage.textContent = Math.round(percentage) + '%';
    setProgressStatusTexts(status, shortenStatusText(status));
}

function shortenStatusText(text) {
    if (!text) return '';
    let t = text
        .replace(/正在给\s*"([^"]{1,24})[^"]*"\s*加水印/g, '加水印')
        .replace(/正在烘焙\s*"([^"]{1,24})[^"]*"\s*第\s*(\d+)\/(\d+)\s*页/g, '烘焙 $2/$3')
        .replace(/正在准备烘焙\s*"([^"]{1,24})[^"]*"/g, '准备烘焙')
        .replace(/正在给\s*"([^"]{1,24})[^"]*"\s*注入追踪码/g, '注入追踪码')
        .replace(/准备上传\s*(\d+)\s*个文件/g, '准备上传 $1 个文件');
    t = t.replace(/"([^"]{1,24})[^"]*"/g, '"$1…"');
    return t.length > 24 ? t.slice(0, 24) + '…' : t;
}

function setProgressStatusTexts(full, short) {
    if (!progressStatus) return;
    let fullEl = document.getElementById('progress-status-full');
    let shortEl = document.getElementById('progress-status-short');
    if (!fullEl || !shortEl || fullEl.parentNode !== progressStatus) {
        progressStatus.textContent = '';
        fullEl = document.createElement('span');
        fullEl.id = 'progress-status-full';
        fullEl.className = 'status-full';
        shortEl = document.createElement('span');
        shortEl.id = 'progress-status-short';
        shortEl.className = 'status-short';
        progressStatus.appendChild(fullEl);
        progressStatus.appendChild(shortEl);
    }
    fullEl.textContent = full;
    shortEl.textContent = short;
}

const PROGRESS_STAGES = {
    idle: { icon: 'fas fa-hourglass-half', label: '准备中', cls: '' },
    compress: { icon: 'fas fa-images', label: '压缩图片', cls: 'stage-processing' },
    watermark: { icon: 'fas fa-stamp', label: '添加水印', cls: 'stage-processing' },
    bake: { icon: 'fas fa-fire', label: '烘焙水印', cls: 'stage-baking' },
    trace: { icon: 'fas fa-fingerprint', label: '注入追踪码', cls: 'stage-processing' },
    upload: { icon: 'fas fa-cloud-upload-alt', label: '上传中', cls: 'stage-uploading' },
    done: { icon: 'fas fa-check-circle', label: '完成', cls: 'stage-done' }
};

function getProgressRightGroup() {
    if (!progressStatus) return null;
    let group = document.getElementById('progress-text-right');
    if (!group || !group.parentNode) {
        const parent = progressStatus.parentNode;
        if (!parent) return null;
        group = document.createElement('span');
        group.id = 'progress-text-right';
        group.className = 'progress-text-right';
        parent.insertBefore(group, progressStatus);
        group.appendChild(progressStatus);
    }
    return group;
}

function setProgressStage(stage, detail) {
    const meta = PROGRESS_STAGES[stage] || PROGRESS_STAGES.idle;
    if (uploadProgress) {
        uploadProgress.dataset.stage = stage;
        Object.values(PROGRESS_STAGES).forEach(m => {
            if (m.cls) uploadProgress.classList.remove(m.cls);
        });
        if (meta.cls) uploadProgress.classList.add(meta.cls);
    }
    let iconEl = document.getElementById('progress-stage-icon');
    let labelEl = document.getElementById('progress-stage-label');
    let stageBox = document.getElementById('progress-stage-box');
    if (!stageBox) {
        const group = getProgressRightGroup();
        if (!group) return;
        stageBox = document.createElement('span');
        stageBox.id = 'progress-stage-box';
        stageBox.className = 'progress-stage';
        stageBox.innerHTML = `<i class="${meta.icon}" id="progress-stage-icon"></i><span id="progress-stage-label"></span>`;
        group.insertBefore(stageBox, group.firstChild);
        iconEl = document.getElementById('progress-stage-icon');
        labelEl = document.getElementById('progress-stage-label');
    }
    if (iconEl) iconEl.className = meta.icon;
    if (labelEl) labelEl.textContent = meta.label;
    if (typeof detail === 'string' && detail) {
        setProgressDetail(detail);
    } else if (detail === null) {
        setProgressDetail('');
    }
}

function setProgressDetail(text) {
    let detailEl = document.getElementById('progress-detail');
    if (!text) {
        if (detailEl) detailEl.remove();
        return;
    }
    if (!uploadProgress) return;
    if (!detailEl || !detailEl.parentNode) {
        const bar = uploadProgress.querySelector('.progress-bar');
        if (!bar || !bar.parentNode) return;
        detailEl = document.createElement('div');
        detailEl.id = 'progress-detail';
        detailEl.className = 'progress-detail';
        bar.parentNode.insertBefore(detailEl, bar);
    }
    detailEl.textContent = text;
}

function setProgressUploadSpeed(bytesPerSec, etaText) {
    const group = getProgressRightGroup();
    if (!group) return;
    let speedEl = document.getElementById('progress-speed');
    if (!bytesPerSec) {
        if (speedEl) speedEl.remove();
        return;
    }
    if (!speedEl || !speedEl.parentNode) {
        speedEl = document.createElement('span');
        speedEl.id = 'progress-speed';
        speedEl.className = 'progress-speed';
        group.appendChild(speedEl);
    }
    const speedText = `${formatBytes(bytesPerSec)}/s`;
    speedEl.textContent = etaText ? `${speedText} · 剩余约 ${etaText}` : speedText;
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
    if (type === currentUploadType) return;
    currentUploadType = type;
    if (type === 'file') {
        if (uploadTypeFileBtn) uploadTypeFileBtn.classList.add('active');
        if (uploadTypeLinkBtn) uploadTypeLinkBtn.classList.remove('active');
        if (watermarkOption) watermarkOption.classList.remove('hidden');
        animateHide(linkUploadZone, () => {
            animateShow(fileDropZone, 'flex');
        });
        if (uploadSubmitBtn) uploadSubmitBtn.innerHTML = '<i class="fas fa-upload"></i><span>开始上传</span>';
    } else {
        if (uploadTypeFileBtn) uploadTypeFileBtn.classList.remove('active');
        if (uploadTypeLinkBtn) uploadTypeLinkBtn.classList.add('active');
        if (watermarkOption) watermarkOption.classList.add('hidden');
        animateHide(fileDropZone, () => {
            if (selectedFileInfo) {
                selectedFileInfo.style.display = 'none';
                selectedFileInfo.classList.remove('entering', 'leaving');
            }
            animateShow(linkUploadZone, 'block');
        });
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
