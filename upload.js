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
const UPLOAD_API_URL = `/api/upload`;
const CONCURRENT_UPLOADS = 5;
let selectedFiles = [];
let isDragging = false;
const urlParams = new URLSearchParams(window.location.search);
let uploadPath = urlParams.get('path') || '';
const uploadPathSelect = document.getElementById('upload-path-select');
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}
function updateThemeIcon(theme) {
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}
function createParticleBackground() {
    const particlesContainer = document.getElementById('particles-background');
    if (!particlesContainer) return;
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(46, 139, 87, ${Math.random() * 0.3 + 0.1});
            border-radius: 50%;
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
    const maxSize = 300 * 1024 * 1024;
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
    fileDropZone.style.display = 'flex';
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
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#3498DB'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateX(calc(100% + 20px));
        transition: transform 0.4s ease, opacity 0.4s ease;
        max-width: 500px;
        font-weight: 500;
        opacity: 0;
        cursor: pointer;
    `;
    const icon = type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';
    notification.innerHTML = `<i class="${icon}" style="margin-right: 0.5rem;"></i>${message}`;
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
    if (selectedFiles.length === 0) {
        showNotification('请选择要上传的文件或文件夹', 'error');
        return;
    }
    uploadSubmitBtn.disabled = true;
    uploadSubmitBtn.innerHTML = `
        <div style="width: 16px; height: 16px; border: 2px solid white; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
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
                        const result = await uploadFile(file);
                        const displayName = file.webkitRelativePath || file._webkitRelativePath || file.name;
                        showNotification(`文件 "${displayName}" 上传成功！`, 'success');
                    } catch (error) {
                        showUploadStatus(`上传文件 "${file.webkitRelativePath || file.name}" 失败: ${error.message}`, 'error');
                        showNotification(`上传文件 "${file.webkitRelativePath || file.name}" 失败`, 'error');
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
        const response = await fetch('/api/files?action=listAllDirs', {
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
async function initUploadPathSelector() {
    const pathSelector = document.getElementById('upload-path-selector');
    if (!pathSelector || !uploadPathSelect) return;
    let waitTime = 0;
    while (!window.currentUser && waitTime < 3000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
    }
    const isAdmin = window.currentUser && window.currentUser.role === 'admin';
    if (!isAdmin) {
        pathSelector.innerHTML = `
            <div class="upload-path-info" style="display: flex;">
                <i class="fas fa-folder-open"></i>
                <span>文件将上传到: ${uploadPath ? '/' + uploadPath : '根目录'}</span>
            </div>
        `;
        pathSelector.style.display = 'flex';
        return;
    }
    const directories = await fetchDirectories();
    uploadPathSelect.innerHTML = '<option value="">根目录</option>';
    directories.forEach(dir => {
        const option = document.createElement('option');
        const displayPath = dir.endsWith('/') ? dir.slice(0, -1) : dir;
        option.value = dir;
        option.textContent = '/' + displayPath;
        uploadPathSelect.appendChild(option);
    });
    if (uploadPath) {
        const pathWithSlash = uploadPath.endsWith('/') ? uploadPath : uploadPath + '/';
        uploadPathSelect.value = pathWithSlash;
        if (!uploadPathSelect.value) {
            const option = document.createElement('option');
            option.value = pathWithSlash;
            option.textContent = '/' + uploadPath;
            option.selected = true;
            uploadPathSelect.appendChild(option);
        }
    }
    uploadPathSelect.addEventListener('change', () => {
        uploadPath = uploadPathSelect.value;
        const newUrl = new URL(window.location);
        if (uploadPath) {
            newUrl.searchParams.set('path', uploadPath);
        } else {
            newUrl.searchParams.delete('path');
        }
        window.history.replaceState({}, '', newUrl);
    });
    pathSelector.style.display = 'flex';
}
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    createParticleBackground();
    initUploadPathSelector();
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    if (fileDropZone) {
        fileDropZone.addEventListener('click', () => {
            fileInput.click();
        });
        fileDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) {
                isDragging = true;
                fileDropZone.style.borderColor = 'var(--primary-color)';
                fileDropZone.style.backgroundColor = 'rgba(46, 139, 87, 0.1)';
            }
        });
        fileDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!fileDropZone.contains(e.relatedTarget)) {
                isDragging = false;
                fileDropZone.style.borderColor = '';
                fileDropZone.style.backgroundColor = '';
            }
        });
        fileDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDragging = false;
            fileDropZone.style.borderColor = '';
            fileDropZone.style.backgroundColor = '';
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
const style = document.createElement('style');
style.textContent = `
    @keyframes particleFloat {
        0% { transform: translateY(0px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .upload-hero {
        padding: 2rem 1rem;
    }
    .upload-stats {
        display: flex;
        gap: 2rem;
        justify-content: center;
        margin-top: 2rem;
        flex-wrap: wrap;
    }
    .stat-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
    }
    .upload-container {
        max-width: 800px;
        margin: 0 auto;
    }
    .upload-card {
        background: var(--background);
        border-radius: 20px;
        box-shadow: var(--shadow-heavy);
        overflow: hidden;
        margin-bottom: 2rem;
    }
    .upload-header {
        background: var(--background-alt);
        padding: 2rem;
        text-align: center;
        border-bottom: 1px solid var(--border-color);
    }
    .upload-description {
        color: var(--text-secondary);
        margin: 0.5rem 0 0;
    }
    .upload-form {
        padding: 2rem;
    }
    .file-drop-zone {
        border: 2px dashed var(--border-color);
        border-radius: 15px;
        padding: 3rem 2rem;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: var(--background-alt);
        margin-bottom: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 200px;
    }
    .file-drop-zone:hover {
        border-color: var(--primary-light);
        background: rgba(46, 139, 87, 0.05);
    }
    .drop-zone-icon {
        font-size: 3rem;
        color: var(--primary-color);
        margin-bottom: 1rem;
    }
    .drop-zone-text h3 {
        margin: 0 0 0.5rem;
        color: var(--text-primary);
    }
    .drop-zone-text p {
        margin: 0 0 1rem;
        color: var(--text-secondary);
    }
    .browse-text {
        color: var(--primary-color);
        font-weight: 500;
    }
    .file-types {
        font-size: 0.8rem;
        color: var(--text-light);
    }
    .selected-file-info {
        margin-bottom: 2rem;
    }
    .file-preview {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        background: var(--background-alt);
        border-radius: 12px;
        border: 1px solid var(--border-color);
    }
    .file-icon-preview {
        width: 50px;
        height: 50px;
        background: var(--primary-gradient);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 1.5rem;
    }
    .file-details {
        flex: 1;
    }
    .file-details .file-name {
        font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 0.2rem;
    }
    .file-details .file-size {
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    .remove-file-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: var(--accent-color);
        color: white;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .remove-file-btn:hover {
        background: #c0392b;
        transform: scale(1.1);
    }
    .upload-progress {
        margin-bottom: 2rem;
        padding: 1.5rem;
        background: var(--background-alt);
        border-radius: 12px;
        border: 1px solid var(--border-color);
    }
    .progress-bar {
        width: 100%;
        height: 8px;
        background: var(--background-dark);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 1rem;
    }
    .progress-fill {
        height: 100%;
        background: var(--primary-gradient);
        border-radius: 4px;
        transition: width 0.3s ease;
        width: 0%;
    }
    .progress-text {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    .upload-submit-btn {
        width: 100%;
        padding: 1rem 2rem;
        background: var(--primary-gradient);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8rem;
        box-shadow: var(--shadow-light);
    }
    .upload-submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
    }
    .upload-submit-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
    }
    .upload-status {
        margin-top: 1.5rem;
    }
    .status-message {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 1rem;
        border-radius: 10px;
        font-weight: 500;
    }
    .status-success {
        background: rgba(39, 174, 96, 0.1);
        color: var(--success-color);
        border: 1px solid rgba(39, 174, 96, 0.2);
    }
    .status-error {
        background: rgba(231, 76, 60, 0.1);
        color: var(--accent-color);
        border: 1px solid rgba(231, 76, 60, 0.2);
    }
    .status-info {
        background: rgba(52, 152, 219, 0.1);
        color: var(--secondary-color);
        border: 1px solid rgba(52, 152, 219, 0.2);
    }
    .upload-guide {
        background: var(--background);
        border-radius: 15px;
        padding: 2rem;
        box-shadow: var(--shadow-light);
    }
    .upload-guide h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        color: var(--text-primary);
    }
    .upload-guide ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .upload-guide li {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin-bottom: 0.8rem;
        color: var(--text-secondary);
    }
    .upload-guide li i {
        color: var(--success-color);
        width: 16px;
    }
    @media (max-width: 1200px) {
        .upload-stats {
            gap: 1rem;
        }
        .stat-item {
            font-size: 0.8rem;
        }
        .file-drop-zone {
            padding: 2rem 1rem;
            min-height: 150px;
        }
        .drop-zone-icon {
            font-size: 2rem;
        }
        .upload-form {
            padding: 1.5rem;
        }
        .upload-header {
            padding: 1.5rem;
        }
    }
    .upload-path-info {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.8rem 1.2rem;
        background: var(--background);
        border-radius: 12px;
        margin-bottom: 1.5rem;
        color: var(--text-primary);
        font-size: 0.9rem;
        border: 1px solid transparent;
        background-image: linear-gradient(var(--background), var(--background)), var(--primary-gradient);
        background-origin: border-box;
        background-clip: padding-box, border-box;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        transition: all 0.3s ease;
    }
    .upload-path-info:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.08);
    }
    .upload-path-info i {
        color: var(--primary-color);
    }
`;
document.head.appendChild(style);