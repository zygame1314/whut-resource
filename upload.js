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
const themeToggle = document.getElementById('theme-toggle');
const UPLOAD_API_URL = API_ENDPOINTS.upload;
const CONCURRENT_UPLOADS = 5;
let selectedFiles = [];
let isDragging = false;
let currentUploadType = 'file';
const urlParams = new URLSearchParams(window.location.search);
let uploadPath = urlParams.get('path') || '';
const uploadPathBtn = document.getElementById('upload-path-btn');
const uploadPathDropdown = document.getElementById('upload-path-dropdown');
const pathTreeContainer = document.getElementById('path-tree-container');
const uploadTypeFileBtn = document.getElementById('upload-type-file');
const uploadTypeLinkBtn = document.getElementById('upload-type-link');
const linkUploadZone = document.getElementById('link-upload-zone');
const linkNameInput = document.getElementById('link-name-input');
const linkUrlInput = document.getElementById('link-url-input');
const linkPreview = document.getElementById('link-preview');
const linkPreviewText = document.getElementById('link-preview-text');
const watermarkOption = document.getElementById('watermark-option');
const watermarkToggle = document.getElementById('watermark-toggle');
function switchUploadType(type) {
    currentUploadType = type;
    if (type === 'file') {
        uploadTypeFileBtn.classList.add('active');
        uploadTypeLinkBtn.classList.remove('active');
        fileDropZone.style.display = 'flex';
        linkUploadZone.style.display = 'none';
        uploadSubmitBtn.innerHTML = '<i class="fas fa-upload"></i><span>开始上传</span>';
    } else {
        uploadTypeFileBtn.classList.remove('active');
        uploadTypeLinkBtn.classList.add('active');
        fileDropZone.style.display = 'none';
        selectedFileInfo.style.display = 'none';
        linkUploadZone.style.display = 'block';
        uploadSubmitBtn.innerHTML = '<i class="fas fa-plus"></i><span>添加链接</span>';
        clearSelectedFile();
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
                linkPreview.style.display = 'flex';
                linkPreviewText.textContent = url;
            } else {
                linkPreview.style.display = 'none';
            }
        });
    }
}
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}
async function uploadLink() {
    const linkName = linkNameInput.value.trim();
    const linkUrl = linkUrlInput.value.trim();
    if (!linkName) {
        showNotification('请输入链接名称', 'error');
        linkNameInput.focus();
        return;
    }
    if (!linkUrl) {
        showNotification('请输入链接地址', 'error');
        linkUrlInput.focus();
        return;
    }
    if (!isValidUrl(linkUrl)) {
        showNotification('请输入有效的URL', 'error');
        linkUrlInput.focus();
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification('请先登录', 'error');
        return;
    }
    uploadSubmitBtn.disabled = true;
    uploadSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>正在添加...</span>';
    try {
        const response = await fetch(UPLOAD_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                linkName: linkName,
                linkUrl: linkUrl,
                uploadPath: uploadPath
            })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showNotification('链接添加成功！', 'success');
            linkNameInput.value = '';
            linkUrlInput.value = '';
            linkPreview.style.display = 'none';
        } else {
            showNotification(result.error || '链接添加失败', 'error');
        }
    } catch (error) {
        console.error('链接上传错误:', error);
        showNotification('网络错误，请稍后重试', 'error');
    } finally {
        uploadSubmitBtn.disabled = false;
        uploadSubmitBtn.innerHTML = '<i class="fas fa-plus"></i><span>添加链接</span>';
    }
}
function createParticleBackground() {
    const particlesContainer = document.getElementById('particles-background');
    if (!particlesContainer) return;
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
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function compressImage(file, quality = 0.8) {
    return new Promise((resolve) => {
        if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
            resolve(file);
            return;
        }
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(
                (blob) => {
                    URL.revokeObjectURL(img.src);
                    if (!blob) {
                        console.warn(`Canvas to Blob conversion failed for ${file.name}.`);
                        resolve(file);
                        return;
                    }
                    const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                    const compressedFile = new File([blob], newFileName, {
                        type: 'image/webp',
                        lastModified: Date.now(),
                    });
                    const originalPath = file.webkitRelativePath || file._webkitRelativePath;
                    if (originalPath) {
                        const pathOnly = originalPath.substring(0, originalPath.lastIndexOf('/') + 1);
                        compressedFile._webkitRelativePath = pathOnly + newFileName;
                    }
                    resolve(compressedFile);
                },
                'image/webp',
                quality
            );
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            console.error(`Error loading image ${file.name}:`, err);
            resolve(file);
        };
    });
}
async function addWatermarkToPDF(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return file;
    }
    const match = file.name.match(/【(.+?)】/);
    const watermarkText = match ? (match[1] + "无偿") : "武理资源共享平台";
    try {
        if (typeof PDFLib === 'undefined') {
            console.warn('PDFLib未加载，跳过水印添加');
            return file;
        }
        showNotification(`正在为 "${file.name}" 添加水印...`, 'info');
        const arrayBuffer = await file.arrayBuffer();
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontSize = 40;
        const textWidth = watermarkText.length * fontSize;
        const diagonal = Math.sqrt(2) * textWidth;
        canvas.width = Math.max(400, diagonal + 40);
        canvas.height = Math.max(200, diagonal / 2 + 40);
        ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`;
        ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-45 * Math.PI / 180);
        ctx.fillText(watermarkText, 0, 0);
        const imageUrl = canvas.toDataURL('image/png');
        const imageBytes = await fetch(imageUrl).then(res => res.arrayBuffer());
        const watermarkImage = await pdfDoc.embedPng(imageBytes);
        const watermarkDims = watermarkImage.scale(1);
        for (const page of pages) {
            const { width, height } = page.getSize();
            const horizontalSpacing = width / 2.5;
            const verticalSpacing = height / 2.5;
            for (let x = 0; x < 3; x++) {
                for (let y = 0; y < 3; y++) {
                    const xPos = (x * horizontalSpacing) + horizontalSpacing / 4;
                    const yPos = (y * verticalSpacing) + verticalSpacing / 4;
                    page.drawImage(watermarkImage, {
                        x: xPos - watermarkDims.width / 2,
                        y: yPos - watermarkDims.height / 2,
                        width: watermarkDims.width,
                        height: watermarkDims.height,
                        opacity: 0.5,
                    });
                }
            }
        }
        const pdfBytes = await pdfDoc.save();
        const newFile = new File([pdfBytes], file.name, {
            type: 'application/pdf',
            lastModified: Date.now()
        });
        if (file.webkitRelativePath || file._webkitRelativePath) {
            newFile._webkitRelativePath = file.webkitRelativePath || file._webkitRelativePath;
        }
        return newFile;
    } catch (error) {
        console.error('添加水印失败:', error);
        showNotification(`添加水印失败: ${error.message}，将上传原文件`, 'error');
        return file;
    }
}
function getFileIcon(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fas fa-file-pdf',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint',
        'txt': 'fas fa-file-alt',
        'jpg': 'fas fa-file-image',
        'jpeg': 'fas fa-file-image',
        'png': 'fas fa-file-image',
        'gif': 'fas fa-file-image',
        'webp': 'fas fa-file-image',
        'mp4': 'fas fa-file-video',
        'avi': 'fas fa-file-video',
        'mov': 'fas fa-file-video',
        'mp3': 'fas fa-file-audio',
        'wav': 'fas fa-file-audio',
        'zip': 'fas fa-file-archive',
        'rar': 'fas fa-file-archive'
    };
    return iconMap[ext] || 'fas fa-file';
}
function validateFile(file) {
    const maxSize = 100 * 1024 * 1024;
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/avi',
        'video/quicktime',
        'audio/mpeg',
        'audio/wav',
        'application/zip',
        'application/x-rar-compressed'
    ];
    if (file.size > maxSize) {
        return { valid: false, error: `文件大小超过限制（最大 ${formatBytes(maxSize)}）` };
    }
    if (!allowedTypes.includes(file.type) && file.type !== '') {
        console.warn(`文件类型 ${file.type} 可能不被完全支持`);
    }
    return { valid: true };
}
function showSelectedFile(files) {
    selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;
    let totalSize = 0;
    selectedFiles.forEach(file => totalSize += file.size);
    const getRelPath = file => file._webkitRelativePath || file.webkitRelativePath || '';
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
    selectedFileInfo.querySelector('.file-icon-preview i').className = iconClass;
    selectedFileInfo.querySelector('.file-name').textContent = `${displayName} ${fileCountText}`.trim();
    selectedFileInfo.querySelector('.file-size').textContent = formatBytes(totalSize);
    selectedFileInfo.style.display = 'block';
    fileDropZone.style.display = 'none';
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
    fileInput.value = '';
    selectedFileInfo.style.display = 'none';
    if (currentUploadType === 'file') {
        fileDropZone.style.display = 'flex';
    }
    resetProgress();
}
function resetProgress() {
    uploadProgress.style.display = 'none';
    progressFill.style.width = '0%';
    progressPercentage.textContent = '0%';
    progressStatus.textContent = '准备上传...';
}
function updateProgress(percentage, status) {
    uploadProgress.style.display = 'block';
    progressFill.style.width = percentage + '%';
    progressPercentage.textContent = percentage + '%';
    progressStatus.textContent = status;
}
function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    const icon = type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';
    notification.innerHTML = `<i class="${icon} u-margin-right-small"></i>${message}`;
    container.appendChild(notification);
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    const removeNotification = () => {
        notification.style.transform = 'translateX(calc(100% + 20px))';
        notification.style.opacity = '0';
        notification.addEventListener('transitionend', () => {
            notification.remove();
            if (container.children.length === 0 && container.parentNode) {
                container.remove();
            }
        });
    };
    const timeoutId = setTimeout(removeNotification, 3000);
    notification.addEventListener('click', () => {
        clearTimeout(timeoutId);
        removeNotification();
    });
}
function showUploadStatus(message, type = 'info') {
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
async function handleFileSelect(files) {
    showNotification('正在处理文件，图片将被压缩...', 'info');
    const originalFiles = Array.from(files);
    try {
        const processedFiles = await Promise.all(
            originalFiles.map(file => compressImage(file))
        );
        let allValid = true;
        for (const file of processedFiles) {
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(`${file.name}: ${validation.error}`, 'error');
                allValid = false;
            }
        }
        if (!allValid) {
            clearSelectedFile();
            return;
        }
        showSelectedFile(processedFiles);
        const originalSize = originalFiles.reduce((sum, f) => sum + f.size, 0);
        const compressedSize = processedFiles.reduce((sum, f) => sum + f.size, 0);
        const savedSize = originalSize - compressedSize;
        if (savedSize > 1024) {
            showNotification(`${processedFiles.length} 个文件处理完成，压缩节省 ${formatBytes(savedSize)}`, 'success');
        } else {
            showNotification(`${processedFiles.length} 个文件选择成功`, 'success');
        }
    } catch (error) {
        console.error('文件处理失败:', error);
        showNotification('处理文件时发生错误', 'error');
        clearSelectedFile();
    }
}
async function handleUpload(event) {
    event.preventDefault();
    const isAdmin = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin');
    if (!isAdmin) {
        showNotification('抱歉，只有管理员才能上传文件', 'error');
        return;
    }
    if (currentUploadType === 'link') {
        await uploadLink();
        return;
    }
    if (selectedFiles.length === 0) {
        showNotification('请选择要上传的文件或文件夹', 'error');
        return;
    }
    uploadSubmitBtn.disabled = true;
    uploadSubmitBtn.innerHTML = `
        <div class="spinner-sm"></div>
        <span>上传中...</span>
    `;
    let filesUploaded = 0;
    const totalFiles = selectedFiles.length;
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const fileProgress = new Map();
    const updateTotalProgress = () => {
        let totalUploadedSize = 0;
        for (const file of selectedFiles) {
            totalUploadedSize += (fileProgress.get(file) || 0) * file.size;
        }
        const overallPercentage = totalSize > 0 ? Math.round((totalUploadedSize / totalSize) * 100) : 0;
        const status = filesUploaded === totalFiles ? '所有文件上传完成！' : `上传中 (${filesUploaded}/${totalFiles})...`;
        updateProgress(overallPercentage, status);
    };
    const uploadFile = (file) => {
        const formData = new FormData();
        let fileName = file._webkitRelativePath || file.webkitRelativePath || file.name;
        if (uploadPath) {
            fileName = `${uploadPath}${fileName}`;
        }
        formData.append('file', file, fileName);
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    fileProgress.set(file, e.loaded / e.total);
                    updateTotalProgress();
                }
            });
            xhr.addEventListener('load', () => {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (xhr.status === 200 && result.success) {
                        filesUploaded++;
                        fileProgress.set(file, 1);
                        updateTotalProgress();
                        resolve(result);
                    } else {
                        reject(new Error(result.error || `HTTP ${xhr.status}`));
                    }
                } catch (error) {
                    reject(error);
                }
            });
            xhr.addEventListener('error', () => reject(new Error('网络错误')));
            xhr.open('POST', UPLOAD_API_URL);
            xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('authToken'));
            xhr.send(formData);
        });
    };
    try {
        updateProgress(0, `准备上传 ${totalFiles} 个文件...`);
        const queue = [...selectedFiles];
        const worker = async () => {
            while (queue.length > 0) {
                const file = queue.shift();
                if (file) {
                    try {
                        const enableWatermark = watermarkToggle ? watermarkToggle.checked : true;
                        const fileToUpload = enableWatermark ? await addWatermarkToPDF(file) : file;
                        const result = await uploadFile(fileToUpload);
                        const displayName = file.webkitRelativePath || file._webkitRelativePath || file.name;
                        showNotification(`文件 "${displayName}" 上传成功！`, 'success');
                    } catch (error) {
                        const displayName = file.webkitRelativePath || file._webkitRelativePath || file.name;
                        const errorMsg = error.message || '未知错误';
                        showUploadStatus(`上传文件 "${displayName}" 失败: ${errorMsg}`, 'error');
                        showNotification(`上传失败: ${errorMsg}`, 'error');
                    }
                }
            }
        };
        const workers = [];
        for (let i = 0; i < CONCURRENT_UPLOADS; i++) {
            workers.push(worker());
        }
        await Promise.all(workers);
        updateProgress(100, '所有文件上传完成！');
        showUploadStatus(`${filesUploaded} / ${totalFiles} 个文件上传成功！`, filesUploaded === totalFiles ? 'success' : 'error');
        setTimeout(() => {
            clearSelectedFile();
            resetProgress();
        }, 3000);
    } catch (error) {
        console.error('上传处理出错:', error);
        showUploadStatus(`上传处理出错: ${error.message}`, 'error');
    } finally {
        uploadSubmitBtn.disabled = false;
        uploadSubmitBtn.innerHTML = `
            <i class="fas fa-upload"></i>
            <span>开始上传</span>
        `;
    }
}
async function fetchDirectories() {
    const token = localStorage.getItem('authToken');
    if (!token) return [];
    try {
        const response = await fetch(`${API_ENDPOINTS.files}?action=listAllDirs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success && result.directories) {
            return result.directories;
        }
    } catch (error) {
        console.error('获取目录列表失败:', error);
    }
    return [];
}
function buildDirectoryTree(directories) {
    const tree = {};
    directories.forEach(dir => {
        const cleanPath = dir.endsWith('/') ? dir.slice(0, -1) : dir;
        const parts = cleanPath.split('/');
        let current = tree;
        parts.forEach(part => {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        });
    });
    return tree;
}
function renderPathTreeNode(name, children, path, isRoot = false) {
    const li = document.createElement('li');
    li.className = 'path-tree-node';
    const fullPath = isRoot ? '' : path;
    const hasChildren = Object.keys(children).length > 0;
    const nodeContent = document.createElement('div');
    nodeContent.className = 'path-tree-item';
    nodeContent.dataset.path = fullPath;
    if (fullPath === uploadPath || (fullPath === '' && uploadPath === '')) {
        nodeContent.classList.add('selected');
    }
    nodeContent.innerHTML = `
        <i class="fas fa-chevron-right path-toggle-icon ${hasChildren ? '' : 'invisible'}"></i>
        <i class="fas ${isRoot ? 'fa-home' : 'fa-folder'} path-folder-icon"></i>
        <span class="path-folder-name">${name}</span>
    `;
    li.appendChild(nodeContent);
    if (hasChildren) {
        const sublist = document.createElement('ul');
        sublist.className = 'path-tree-list';
        sublist.style.display = isRoot ? 'block' : 'none';
        const sortedKeys = Object.keys(children).sort();
        sortedKeys.forEach(key => {
            const childPath = isRoot ? key + '/' : path + key + '/';
            sublist.appendChild(renderPathTreeNode(key, children[key], childPath, false));
        });
        li.appendChild(sublist);
    }
    return li;
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
function updateSelectedPathDisplay() {
    if (uploadPathBtn) {
        const displayPath = uploadPath ? '/' + (uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath) : '根目录';
        uploadPathBtn.querySelector('.selected-path').textContent = displayPath;
    }
}
function updateUrlPath() {
    const newUrl = new URL(window.location);
    if (uploadPath) {
        newUrl.searchParams.set('path', uploadPath);
    } else {
        newUrl.searchParams.delete('path');
    }
    window.history.replaceState({}, '', newUrl);
}
async function initUploadPathSelector() {
    const pathSelector = document.getElementById('upload-path-selector');
    if (!pathSelector) return;
    let waitTime = 0;
    while (!window.currentUser && waitTime < 3000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
    }
    const isAdmin = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin');
    if (!isAdmin) {
        showNoPermissionUI();
        return;
    }
    pathSelector.style.display = 'flex';
    if (watermarkOption) {
        watermarkOption.style.display = 'flex';
    }
    updateSelectedPathDisplay();
    const directories = await fetchDirectories();
    const tree = buildDirectoryTree(directories);
    if (pathTreeContainer) {
        const ul = document.createElement('ul');
        ul.className = 'path-tree-list root';
        ul.appendChild(renderPathTreeNode('根目录', tree, '', true));
        pathTreeContainer.innerHTML = '';
        pathTreeContainer.appendChild(ul);
        pathTreeContainer.addEventListener('click', (e) => {
            const toggleIcon = e.target.closest('.path-toggle-icon');
            const treeItem = e.target.closest('.path-tree-item');
            if (toggleIcon && !toggleIcon.classList.contains('invisible')) {
                e.stopPropagation();
                const parentLi = toggleIcon.closest('.path-tree-node');
                const sublist = parentLi.querySelector(':scope > .path-tree-list');
                if (sublist) {
                    const isExpanded = sublist.style.display !== 'none';
                    sublist.style.display = isExpanded ? 'none' : 'block';
                    toggleIcon.style.transform = isExpanded ? '' : 'rotate(90deg)';
                }
            } else if (treeItem) {
                pathTreeContainer.querySelectorAll('.path-tree-item').forEach(item => {
                    item.classList.remove('selected');
                });
                treeItem.classList.add('selected');
                uploadPath = treeItem.dataset.path;
                updateSelectedPathDisplay();
                updateUrlPath();
                if (uploadPathDropdown) {
                    uploadPathDropdown.classList.remove('open');
                    uploadPathBtn.classList.remove('open');
                }
            }
        });
    }
    if (uploadPathBtn && uploadPathDropdown) {
        const btnContainer = uploadPathBtn.parentNode;
        if (btnContainer && !document.getElementById('ai-path-assist-btn')) {
            const aiBtn = document.createElement('button');
            aiBtn.id = 'ai-path-assist-btn';
            aiBtn.className = 'ai-assist-btn';
            aiBtn.innerHTML = '<i class="fas fa-magic"></i><span>AI 推荐位置</span>';
            uploadPathBtn.insertAdjacentElement('afterend', aiBtn);
            aiBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                let fileNamesToAnalyze = [];
                if (currentUploadType === 'link') {
                    const name = linkNameInput.value.trim();
                    if (name) fileNamesToAnalyze.push(name);
                } else {
                    if (selectedFiles.length > 0) {
                        const firstFile = selectedFiles[0];
                        const relPath = firstFile.webkitRelativePath || firstFile._webkitRelativePath;
                        if (relPath && relPath.includes('/')) {
                            const rootFolderName = relPath.split('/')[0];
                            fileNamesToAnalyze.push(rootFolderName);
                        }
                        const meaningfulFiles = selectedFiles.filter(f => {
                            const path = f.webkitRelativePath || f._webkitRelativePath || '';
                            if (path && (/\/\./.test(path) || path.includes('/__pycache__/'))) return false;
                            const name = f.name;
                            if (name.endsWith('.sample')) return false;
                            if (name.endsWith('.pyc')) return false;
                            const noisePattern = /^(?:\.|COMMIT_EDITMSG|FETCH_HEAD|HEAD|ORIG_HEAD|config|description|packed-refs|index|thumbs\.db|desktop\.ini|LICENSE|README)/i;
                            return !noisePattern.test(name);
                        });
                        const sourceFiles = meaningfulFiles.length > 0 ? meaningfulFiles : selectedFiles;
                        const fileSamples = sourceFiles.slice(0, 5).map(f => f.name);
                        fileNamesToAnalyze.push(...fileSamples);
                        fileNamesToAnalyze = [...new Set(fileNamesToAnalyze)];
                    }
                }
                if (fileNamesToAnalyze.length === 0) {
                    showNotification('请先选择文件或输入链接名称', 'info');
                    return;
                }
                if (!window.currentUser || !(window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin')) {
                    showNotification('需要管理员权限', 'error');
                    return;
                }
                const originalText = aiBtn.innerHTML;
                aiBtn.disabled = true;
                aiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>分析中...</span>';
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(API_ENDPOINTS.pathRecommend, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ fileNames: fileNamesToAnalyze })
                    });
                    const result = await response.json();
                    if (result.success && result.path) {
                        let recPath = result.path.replace(/^\/|\/$/g, '');
                        uploadPath = recPath + '/';
                        const treeItem = pathTreeContainer.querySelector(`.path-tree-item[data-path="${uploadPath}"]`);
                        if (treeItem) {
                            pathTreeContainer.querySelectorAll('.path-tree-item').forEach(item => item.classList.remove('selected'));
                            treeItem.classList.add('selected');
                            let currentNode = treeItem.closest('.path-tree-node');
                            while (currentNode) {
                                const parentList = currentNode.parentElement;
                                if (parentList && parentList.classList.contains('path-tree-list')) {
                                    parentList.style.display = 'block';
                                    const parentNode = parentList.parentElement.closest('.path-tree-node');
                                    if (parentNode) {
                                        const toggle = parentNode.querySelector('.path-toggle-icon');
                                        if (toggle) {
                                            toggle.style.transform = 'rotate(90deg)';
                                            toggle.classList.add('expanded');
                                        }
                                        currentNode = parentNode;
                                    } else {
                                        break;
                                    }
                                } else {
                                    break;
                                }
                            }
                            if (uploadPathDropdown && !uploadPathDropdown.classList.contains('open')) {
                                uploadPathDropdown.classList.add('open');
                                uploadPathBtn.classList.add('open');
                            }
                            setTimeout(() => {
                                treeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 300);
                        } else {
                            console.warn('推荐路径在目录树中未找到:', uploadPath);
                        }
                        updateSelectedPathDisplay();
                        updateUrlPath();
                        showNotification(`AI 推荐路径: ${recPath}`, 'success');
                    } else {
                        showNotification('AI 未能推荐合适路径', 'info');
                    }
                } catch (err) {
                    console.error('AI 推荐服务错误:', err);
                    showNotification('AI 推荐服务暂时不可用', 'error');
                } finally {
                    aiBtn.disabled = false;
                    aiBtn.innerHTML = originalText;
                }
            });
        }
        let searchInput = uploadPathDropdown.querySelector('.path-search-input');
        if (!searchInput) {
            const dropdownHeader = uploadPathDropdown.querySelector('.path-dropdown-header');
            if (dropdownHeader) {
                const searchContainer = document.createElement('div');
                searchContainer.className = 'path-search-wrapper';
                searchContainer.innerHTML = '<input type="text" class="path-search-input" placeholder="搜索目录...">';
                dropdownHeader.insertAdjacentElement('afterend', searchContainer);
                searchInput = searchContainer.querySelector('input');
                searchInput.addEventListener('click', (e) => e.stopPropagation());
                searchInput.addEventListener('input', (e) => {
                    if (typeof filterTreeByKeyword === 'function') {
                        filterTreeByKeyword(pathTreeContainer, e.target.value, {
                            nodeSelector: '.path-tree-node',
                            itemSelector: '.path-tree-item',
                            nameSelector: '.path-folder-name',
                            listSelector: '.path-tree-list',
                            toggleSelector: '.path-toggle-icon',
                            useTransform: true
                        });
                    }
                });
            }
        }
        uploadPathBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = uploadPathDropdown.classList.contains('open');
            uploadPathDropdown.classList.toggle('open');
            uploadPathBtn.classList.toggle('open');
            if (!isOpen && searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
            if (!isOpen && uploadPath) {
                const pathParts = uploadPath.split('/').filter(Boolean);
                let currentPath = '';
                pathParts.forEach(part => {
                    currentPath += part + '/';
                    const item = pathTreeContainer.querySelector(`.path-tree-item[data-path="${currentPath}"]`);
                    if (item) {
                        const parentLi = item.closest('.path-tree-node');
                        const parentSublist = parentLi.parentElement;
                        if (parentSublist && parentSublist.style.display === 'none') {
                            parentSublist.style.display = 'block';
                            const parentToggle = parentSublist.previousElementSibling?.querySelector('.path-toggle-icon');
                            if (parentToggle) {
                                parentToggle.style.transform = 'rotate(90deg)';
                            }
                        }
                    }
                });
            }
        });
        document.addEventListener('click', (e) => {
            if (!uploadPathDropdown.contains(e.target) && !uploadPathBtn.contains(e.target)) {
                uploadPathDropdown.classList.remove('open');
                uploadPathBtn.classList.remove('open');
            }
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
    createParticleBackground();
    initUploadPathSelector();
    initLinkUpload();
    if (fileDropZone) {
        fileDropZone.addEventListener('click', () => {
            fileInput.click();
        });
        fileDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) {
                isDragging = true;
                fileDropZone.classList.add('drag-over');
            }
        });
        fileDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!fileDropZone.contains(e.relatedTarget)) {
                isDragging = false;
                fileDropZone.classList.remove('drag-over');
            }
        });
        fileDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDragging = false;
            fileDropZone.classList.remove('drag-over');
            const items = e.dataTransfer.items;
            if (items && items.length > 0) {
                const allFiles = [];
                const traverseFileTree = async (item, path) => {
                    path = path || "";
                    if (item.isFile) {
                        return new Promise((resolve) => {
                            item.file(file => {
                                file._webkitRelativePath = path + file.name;
                                allFiles.push(file);
                                resolve();
                            });
                        });
                    } else if (item.isDirectory) {
                        const dirReader = item.createReader();
                        const entries = await new Promise(resolve => dirReader.readEntries(resolve));
                        for (let i = 0; i < entries.length; i++) {
                            await traverseFileTree(entries[i], path + item.name + "/");
                        }
                    }
                };
                const promises = [];
                for (let i = 0; i < items.length; i++) {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) {
                        promises.push(traverseFileTree(entry));
                    }
                }
                await Promise.all(promises);
                if (allFiles.length > 0) {
                    handleFileSelect(allFiles);
                } else {
                    handleFileSelect(e.dataTransfer.files);
                }
            }
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files);
            }
        });
    }
    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', () => {
            clearSelectedFile();
            showNotification('已清除选中文件', 'info');
        });
    }
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUpload);
    }
});
