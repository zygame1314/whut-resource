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
        const validFiles = [];
        const ignoredFiles = [];
        for (const file of processedFiles) {
            const validation = validateFile(file);
            if (validation.valid) {
                validFiles.push(file);
            } else {
                ignoredFiles.push({ name: file.name, error: validation.error });
            }
        }
        if (validFiles.length === 0) {
            if (ignoredFiles.length > 0) {
                showNotification(`所有文件均无效: ${ignoredFiles[0].error}`, 'error');
            }
            clearSelectedFile();
            return;
        }
        if (ignoredFiles.length > 0) {
            console.warn('部分文件被忽略:', ignoredFiles);
            showNotification(`${ignoredFiles.length} 个文件被忽略 (如: ${ignoredFiles[0].name} ${ignoredFiles[0].error})`, 'warning');
        }
        showSelectedFile(validFiles);
        if (validFiles.length > 0) {
            showNotification(`${validFiles.length} 个文件选择成功` + (ignoredFiles.length > 0 ? ` (忽略 ${ignoredFiles.length} 个无效文件)` : ''), 'success');
        }
    } catch (error) {
        console.error('文件处理失败:', error);
        showNotification('处理文件时发生错误', 'error');
        clearSelectedFile();
    }
}
let pendingRetryFiles = new Map();
function showUploadResultsPanel(successFiles, failedFiles) {
    const panel = document.getElementById('upload-results-panel');
    const successList = document.getElementById('success-list');
    const failedList = document.getElementById('failed-list');
    const successCount = document.getElementById('success-count');
    const failedCount = document.getElementById('failed-count');
    const summaryText = document.getElementById('results-summary-text');
    const closeBtn = document.getElementById('close-results-btn');
    if (!panel) return;
    pendingRetryFiles.clear();
    failedFiles.forEach((f, idx) => {
        if (f.file) pendingRetryFiles.set(`retry-${idx}`, f.file);
    });
    successCount.textContent = successFiles.length;
    failedCount.textContent = failedFiles.length;
    summaryText.textContent = `共处理 ${successFiles.length + failedFiles.length} 个文件`;
    if (successFiles.length > 0) {
        successList.innerHTML = successFiles.map(f => `
            <li>
                <i class="fas fa-check"></i>
                <span>${f.name}</span>
            </li>
        `).join('');
    } else {
        successList.innerHTML = '<div class="empty-list"><i class="fas fa-inbox"></i><span>暂无成功文件</span></div>';
    }
    if (failedFiles.length > 0) {
        failedList.innerHTML = failedFiles.map((f, idx) => `
            <li data-retry-id="retry-${idx}">
                <i class="fas fa-times"></i>
                <div class="failed-file-info">
                    <span>${f.name}</span>
                    <span class="file-error">${f.error || '未知错误'}</span>
                </div>
                ${f.file ? `<button type="button" class="retry-btn" data-retry-id="retry-${idx}" title="重试上传">
                    <i class="fas fa-redo"></i>
                </button>` : ''}
            </li>
        `).join('');
        failedList.querySelectorAll('.retry-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const retryId = btn.dataset.retryId;
                const file = pendingRetryFiles.get(retryId);
                if (!file) return;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                try {
                    await retrySingleFileUpload(file);
                    const li = btn.closest('li');
                    if (li) {
                        li.classList.add('retry-success');
                        li.innerHTML = `
                            <i class="fas fa-check"></i>
                            <span>${file.name}</span>
                            <span class="retry-success-label">重试成功</span>
                        `;
                    }
                    pendingRetryFiles.delete(retryId);
                    showNotification(`文件 "${file.name}" 重试上传成功！`, 'success');
                } catch (err) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-redo"></i>';
                    showNotification(`重试失败: ${err.message}`, 'error');
                }
            });
        });
    } else {
        failedList.innerHTML = '<div class="empty-list"><i class="fas fa-smile-beam"></i><span>全部成功！</span></div>';
    }
    panel.style.display = 'block';
    if (closeBtn) {
        closeBtn.onclick = () => {
            panel.style.display = 'none';
        };
    }
}
async function retrySingleFileUpload(file) {
    const formData = new FormData();
    const targetPath = currentUploadPath || '';
    const relativeName = file._webkitRelativePath || file.webkitRelativePath || file.originalRelativePath || file.name;
    let fullPath = relativeName;
    if (targetPath) {
        const prefix = targetPath.endsWith('/') ? targetPath : targetPath + '/';
        if (!relativeName.startsWith(prefix)) {
            fullPath = prefix + relativeName;
        }
    }
    const enableWatermark = watermarkToggle ? watermarkToggle.checked : true;
    const processedFile = enableWatermark ? await addWatermarkToPDF(file) : file;
    formData.append('file', processedFile, fullPath);
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
            try {
                const result = JSON.parse(xhr.responseText);
                if (xhr.status === 200 && result.success) {
                    resolve(result);
                } else {
                    const errMsg = result.results?.[0]?.error || result.error || `HTTP ${xhr.status}`;
                    reject(new Error(errMsg));
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
    const CONCURRENT_UPLOADS = 3;
    const BATCH_SIZE_COUNT = 5;
    const BATCH_SIZE_BYTES = 50 * 1024 * 1024;
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
    const allUploadResults = { success: [], failed: [] };
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
    const uploadBatch = (files) => {
        const formData = new FormData();
        const targetPath = currentUploadPath || '';
        files.forEach(file => {
            const relativeName = file._webkitRelativePath || file.webkitRelativePath || file.originalRelativePath || file.name;
            let fullPath = relativeName;
            if (targetPath) {
                const prefix = targetPath.endsWith('/') ? targetPath : targetPath + '/';
                if (!relativeName.startsWith(prefix)) {
                    fullPath = prefix + relativeName;
                }
            }
            formData.append('file', file, fullPath);
        });
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = e.loaded / e.total;
                    files.forEach(f => {
                        fileProgress.set(f, percent);
                    });
                    updateTotalProgress();
                }
            });
            xhr.addEventListener('load', () => {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (xhr.status === 200) {
                        files.forEach(f => fileProgress.set(f, 1));
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
    const createBatches = (files) => {
        const batches = [];
        let currentBatch = [];
        let currentBatchSize = 0;
        for (const file of files) {
            if (currentBatch.length >= BATCH_SIZE_COUNT || (currentBatchSize + file.size > BATCH_SIZE_BYTES && currentBatch.length > 0)) {
                batches.push(currentBatch);
                currentBatch = [];
                currentBatchSize = 0;
            }
            currentBatch.push(file);
            currentBatchSize += file.size;
        }
        if (currentBatch.length > 0) batches.push(currentBatch);
        return batches;
    };
    try {
        updateProgress(0, `准备上传 ${totalFiles} 个文件...`);
        const rawBatches = createBatches(selectedFiles);
        const queue = [...rawBatches];
        const worker = async () => {
            while (queue.length > 0) {
                const batchFiles = queue.shift();
                if (batchFiles && batchFiles.length > 0) {
                    try {
                        const enableWatermark = watermarkToggle ? watermarkToggle.checked : true;
                        const processedFiles = await Promise.all(batchFiles.map(async (file) => {
                            try {
                                return enableWatermark ? await addWatermarkToPDF(file) : file;
                            } catch (e) {
                                console.error(`预处理失败: ${file.name}`, e);
                                return file;
                            }
                        }));
                        const result = await uploadBatch(processedFiles);
                        if (result.results) {
                            result.results.forEach(res => {
                                if (res.success) {
                                    filesUploaded++;
                                    allUploadResults.success.push({ name: res.name });
                                } else {
                                    const originalFile = batchFiles.find(pf => {
                                        const fullPath = pf._webkitRelativePath || pf.webkitRelativePath || pf.originalRelativePath || pf.name;
                                        return fullPath === res.name ||
                                            res.name.endsWith('/' + pf.name) ||
                                            res.name === pf.name ||
                                            fullPath.endsWith(res.name);
                                    });
                                    allUploadResults.failed.push({ name: res.name, error: res.error, file: originalFile || null });
                                }
                            });
                        } else if (result.success) {
                            filesUploaded += processedFiles.length;
                            processedFiles.forEach(f => allUploadResults.success.push({ name: f.name }));
                        }
                        if (processedFiles.length > 0) {
                            const successCountInBatch = result.results ? result.results.filter(r => r.success).length : processedFiles.length;
                            if (successCountInBatch > 0) {
                                const f = processedFiles[0];
                                const displayName = f.webkitRelativePath || f._webkitRelativePath || f.name;
                                if (processedFiles.length > 1) {
                                    showNotification(`本批次 ${successCountInBatch} 个文件上传成功`, 'success');
                                } else {
                                    showNotification(`文件 "${displayName}" 上传成功！`, 'success');
                                }
                            }
                        }
                    } catch (error) {
                        const errorMsg = error.message || '未知错误';
                        showNotification(`一批次 (${batchFiles.length}个) 上传失败: ${errorMsg}`, 'error');
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
        const successRate = totalFiles > 0 ? (filesUploaded / totalFiles) * 100 : 0;
        const statusType = successRate === 100 ? 'success' : (successRate > 0 ? 'warning' : 'error');
        showUploadStatus(`${filesUploaded} / ${totalFiles} 个文件上传成功！`, statusType);
        showUploadResultsPanel(allUploadResults.success, allUploadResults.failed);
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
