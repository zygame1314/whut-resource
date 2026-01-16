function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function getFileIcon(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fas fa-file-pdf', 'doc': 'fas fa-file-word', 'docx': 'fas fa-file-word',
        'xls': 'fas fa-file-excel', 'xlsx': 'fas fa-file-excel', 'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint', 'txt': 'fas fa-file-alt', 'jpg': 'fas fa-file-image',
        'jpeg': 'fas fa-file-image', 'png': 'fas fa-file-image', 'gif': 'fas fa-file-image',
        'webp': 'fas fa-file-image', 'mp4': 'fas fa-file-video', 'avi': 'fas fa-file-video',
        'mov': 'fas fa-file-video', 'mp3': 'fas fa-file-audio', 'wav': 'fas fa-file-audio',
        'zip': 'fas fa-file-archive', 'rar': 'fas fa-file-archive'
    };
    return iconMap[ext] || 'fas fa-file';
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
            canvas.toBlob((blob) => {
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
                const originalPath = file.webkitRelativePath || file._webkitRelativePath || file.originalRelativePath;
                if (originalPath) {
                    const pathOnly = originalPath.includes('/') ? originalPath.substring(0, originalPath.lastIndexOf('/') + 1) : '';
                    compressedFile._webkitRelativePath = pathOnly + newFileName;
                    compressedFile.originalRelativePath = pathOnly + newFileName;
                }
                resolve(compressedFile);
            }, 'image/webp', quality);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            console.error(`Error loading image ${file.name}:`, err);
            resolve(file);
        };
    });
}
function validateFile(file) {
    const maxSize = 100 * 1024 * 1024;
    const allowedTypes = [
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/avi',
        'video/quicktime', 'audio/mpeg', 'audio/wav', 'application/zip', 'application/x-rar-compressed'
    ];
    if (file.size > maxSize) {
        return { valid: false, error: `文件大小超过限制（最大 ${formatBytes(maxSize)}）` };
    }
    if (!allowedTypes.includes(file.type) && file.type !== '') {
        console.warn(`文件类型 ${file.type} 可能不被完全支持`);
    }
    return { valid: true };
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
            const xPos = (width - watermarkDims.width) / 2;
            const yPos = (height - watermarkDims.height) / 2;
            page.drawImage(watermarkImage, {
                x: xPos,
                y: yPos,
                width: watermarkDims.width,
                height: watermarkDims.height,
                opacity: 0.5,
            });
        }
        const pdfBytes = await pdfDoc.save();
        const newFile = new File([pdfBytes], file.name, {
            type: 'application/pdf',
            lastModified: Date.now()
        });
        if (file.webkitRelativePath || file._webkitRelativePath || file.originalRelativePath) {
            newFile._webkitRelativePath = file.webkitRelativePath || file._webkitRelativePath || file.originalRelativePath;
            newFile.originalRelativePath = newFile._webkitRelativePath;
        }
        return newFile;
    } catch (error) {
        console.error('添加水印失败:', error);
        showNotification(`添加水印失败: ${error.message}，将上传原文件`, 'error');
        return file;
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
    if (typeof currentUploadType !== 'undefined' && currentUploadType === 'link') {
        if (typeof uploadLink === 'function') {
            await uploadLink();
        } else {
            showNotification('链接上传模块未加载', 'error');
        }
        return;
    }
    if (selectedFiles.length === 0) {
        showNotification('请选择要上传的文件或文件夹', 'error');
        return;
    }
    const CONCURRENT_UPLOADS = 5;
    if (uploadSubmitBtn) {
        uploadSubmitBtn.disabled = true;
        uploadSubmitBtn.innerHTML = `
            <div class="spinner-sm"></div>
            <span>上传中...</span>
        `;
    }
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
        let status;
        if (filesUploaded === totalFiles) {
            status = '所有文件上传完成！';
        } else {
            status = `${formatBytes(totalUploadedSize)} / ${formatBytes(totalSize)}`;
        }
        updateProgress(overallPercentage, status);
    };
    const uploadFile = (file) => {
        const formData = new FormData();
        const relativeName = file._webkitRelativePath || file.webkitRelativePath || file.originalRelativePath || file.name;
        const targetPath = currentUploadPath || '';
        const key = targetPath + relativeName;
        formData.append('file', file, relativeName);
        formData.append('key', key);
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
            xhr.open('POST', API_ENDPOINTS.upload);
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
        if (uploadSubmitBtn) {
            uploadSubmitBtn.disabled = false;
            uploadSubmitBtn.innerHTML = `
                <i class="fas fa-upload"></i>
                <span>开始上传</span>
            `;
        }
    }
}
