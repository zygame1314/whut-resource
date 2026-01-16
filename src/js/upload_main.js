document.addEventListener('DOMContentLoaded', () => {
    createParticleBackground();
    initUploadPathSelector();
    initLinkUpload();
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files);
            }
        });
    }
    let isDragging = false;
    if (fileDropZone) {
        fileDropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
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
                                Object.defineProperty(file, '_webkitRelativePath', {
                                    value: path + file.name,
                                    writable: true
                                });
                                file.originalRelativePath = path + file.name;
                                allFiles.push(file);
                                resolve();
                            });
                        });
                    } else if (item.isDirectory) {
                        const dirReader = item.createReader();
                        const entries = await new Promise(resolve => {
                            dirReader.readEntries((ents) => resolve(ents), (err) => resolve([]));
                        });
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
