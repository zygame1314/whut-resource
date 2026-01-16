let uploadType = 'file';
let selectedFiles = [];
const uploadForm = document.getElementById('upload-form');
const uploadTypeFileBtn = document.getElementById('upload-type-file');
const uploadTypeLinkBtn = document.getElementById('upload-type-link');
const linkUploadZone = document.getElementById('link-upload-zone');
const watermarkOption = document.getElementById('watermark-option');
const watermarkToggle = document.getElementById('watermark-toggle');
function switchUploadType(type) {
    uploadType = type;
    if (type === 'file') {
        uploadTypeFileBtn.classList.add('active');
        uploadTypeLinkBtn.classList.remove('active');
        fileDropZone.style.display = 'flex';
        if (selectedFiles.length > 0) {
            fileDropZone.style.display = 'none';
            selectedFileInfo.style.display = 'flex';
        }
        linkUploadZone.style.display = 'none';
        watermarkOption.style.display = selectedFiles.some(f => f.name.toLowerCase().endsWith('.pdf')) ? 'flex' : 'none';
        uploadPathSelector.style.display = 'block';
    } else {
        uploadTypeLinkBtn.classList.add('active');
        uploadTypeFileBtn.classList.remove('active');
        fileDropZone.style.display = 'none';
        selectedFileInfo.style.display = 'none';
        linkUploadZone.style.display = 'block';
        watermarkOption.style.display = 'none';
        uploadPathSelector.style.display = 'block';
    }
}
async function handleFileSelect(files) {
    const validFiles = [];
    for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) {
            showNotification(validation.message, 'error');
            continue;
        }
        validFiles.push(file);
    }
    if (validFiles.length > 0) {
        selectedFiles = validFiles;
        showSelectedFile(selectedFiles);
        const hasPDF = selectedFiles.some(f => f.name.toLowerCase().endsWith('.pdf'));
        watermarkOption.style.display = hasPDF ? 'flex' : 'none';
    }
}
async function handleUpload(event) {
    event.preventDefault();
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification('请先登录后再上传', 'error');
        return;
    }
    if (uploadType === 'link') {
        await uploadLink();
        return;
    }
    if (selectedFiles.length === 0) {
        showNotification('请选择要上传的文件', 'warning');
        return;
    }
    const submitBtn = document.getElementById('upload-submit-btn');
    submitBtn.disabled = true;
    resetProgress();
    let targetPath = '';
    if (typeof currentSelectedPath !== 'undefined') {
        targetPath = currentSelectedPath;
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        targetPath = urlParams.get('path') || '';
    }
    if (targetPath && !targetPath.endsWith('/')) targetPath += '/';
    let successCount = 0;
    let failCount = 0;
    const totalFiles = selectedFiles.length;
    try {
        for (let i = 0; i < totalFiles; i++) {
            const file = selectedFiles[i];
            updateProgress(((i) / totalFiles) * 100, `正在处理第 ${i + 1}/${totalFiles} 个文件: ${file.name}`);
            let fileToUpload = file;
            const ext = file.name.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) && file.size > 2 * 1024 * 1024) {
                try {
                    const blob = await compressImage(file);
                    fileToUpload = new File([blob], file.name, { type: file.type });
                } catch (e) {
                    console.warn('Image compression failed, using original', e);
                }
            }
            if (ext === 'pdf' && watermarkToggle && watermarkToggle.checked) {
                try {
                    const blob = await addWatermarkToPDF(file);
                    fileToUpload = new File([blob], file.name, { type: 'application/pdf' });
                } catch (e) {
                    console.warn('PDF watermark failed', e);
                }
            }
            const formData = new FormData();
            formData.append('file', fileToUpload);
            const relativeName = file.originalRelativePath || file.name;
            const key = targetPath + relativeName;
            formData.append('key', key);
            updateProgress(((i + 0.5) / totalFiles) * 100, `正在上传: ${file.name}`);
            const response = await fetch(API_ENDPOINTS.files, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await response.json();
            if (response.ok && result.success) {
                successCount++;
            } else {
                failCount++;
                console.error(`Upload failed for ${file.name}:`, result.error);
                showNotification(`文件 ${file.name} 上传失败: ${result.error}`, 'error');
            }
        }
        updateProgress(100, '上传完成');
        let msg = `成功上传 ${successCount} 个文件`;
        if (failCount > 0) msg += `，失败 ${failCount} 个`;
        showNotification(msg, failCount === 0 ? 'success' : 'warning');
        if (successCount > 0) {
            setTimeout(() => {
                clearSelectedFile();
                selectedFiles = [];
            }, 1000);
        }
    } catch (error) {
        console.error('Batch upload error:', error);
        showNotification(`上传出错: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
}
document.addEventListener('DOMContentLoaded', () => {
    createParticleBackground();
    initUploadPathSelector();
    initLinkUpload();
    if (uploadTypeFileBtn) {
        uploadTypeFileBtn.addEventListener('click', () => switchUploadType('file'));
    }
    if (uploadTypeLinkBtn) {
        uploadTypeLinkBtn.addEventListener('click', () => switchUploadType('link'));
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleFileSelect(Array.from(e.target.files));
        });
    }
    if (fileDropZone) {
        fileDropZone.addEventListener('click', () => fileInput.click());
        fileDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDropZone.classList.add('drag-over');
        });
        fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('drag-over'));
        fileDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            fileDropZone.classList.remove('drag-over');
            const items = e.dataTransfer.items;
            if (items && items.length > 0) {
                const allFiles = [];
                const traverseFileTree = async (item, path) => {
                    path = path || "";
                    if (item.isFile) {
                        return new Promise((resolve) => {
                            item.file(file => {
                                Object.defineProperty(file, 'originalRelativePath', {
                                    value: path + file.name,
                                    writable: false
                                });
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
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleFileSelect(Array.from(e.dataTransfer.files));
                    }
                }
            } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileSelect(Array.from(e.dataTransfer.files));
            }
        });
    }
    const removeBtn = document.getElementById('remove-file-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            selectedFiles = [];
            clearSelectedFile();
        });
    }
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUpload);
    }
    switchUploadType('file');
});
