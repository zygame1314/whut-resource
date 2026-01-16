async function previewFile(fileKey, fileName, fileSize) {
    const extension = fileName.split('.').pop().toLowerCase();
    const officeExtensions = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];
    const pdfExtensions = ['pdf'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const txtExtensions = ['txt'];
    const isVideo = videoExtensions.includes(extension);
    if (!isVideo && fileSize > 300 * 1024 * 1024) {
        showNotification('文件超过300MB，不支持预览。', 'info');
        return;
    }
    if (isVideo && fileSize > 300 * 1024 * 1024) {
        showNotification('视频文件超过300MB，不支持在线播放。', 'info');
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法预览：未获取到验证令牌。", 'error');
        return;
    }
    const previewLoader = previewModal.querySelector('.preview-loader');
    previewTitle.textContent = `预览: ${fileName}`;
    previewModal.classList.add('visible');
    previewLoader.style.display = 'flex';
    previewIframe.style.display = 'none';
    const existingImageWrapper = previewModal.querySelector('.preview-image-wrapper');
    if (existingImageWrapper) existingImageWrapper.remove();
    const existingVideoWrapper = previewModal.querySelector('.preview-video-wrapper');
    if (existingVideoWrapper) existingVideoWrapper.remove();
    const existingTextWrapper = previewModal.querySelector('.preview-text-wrapper');
    if (existingTextWrapper) existingTextWrapper.remove();
    try {
        const isOfficePreview = officeExtensions.includes(extension);
        const isPdfPreview = pdfExtensions.includes(extension);
        const isImagePreview = imageExtensions.includes(extension);
        const isVideoPreview = videoExtensions.includes(extension);
        const isTxtPreview = txtExtensions.includes(extension);
        if (isOfficePreview || isPdfPreview || isImagePreview || isVideoPreview || isTxtPreview) {
            const apiUrl = new URL(API_ENDPOINTS.preview, window.location.origin);
            apiUrl.searchParams.append('key', fileKey);
            if (isOfficePreview) {
                apiUrl.searchParams.append('office', 'true');
            }
            if (isPdfPreview || isImagePreview || isVideoPreview) {
                apiUrl.searchParams.append('inline', 'true');
            }
            if (isTxtPreview) {
                apiUrl.searchParams.append('type', 'text');
            }
            const response = await fetch(apiUrl.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '无法获取文件预览链接');
            }
            const hideLoader = () => {
                previewLoader.style.display = 'none';
                previewLoader.style.pointerEvents = 'none';
            };
            if (isTxtPreview) {
                const textPreviewWrapper = document.createElement('div');
                textPreviewWrapper.className = 'preview-text-wrapper';
                const pre = document.createElement('pre');
                pre.className = 'preview-text';
                pre.textContent = data.content;
                textPreviewWrapper.appendChild(pre);
                previewIframe.parentElement.appendChild(textPreviewWrapper);
                hideLoader();
            } else {
                const previewUrl = data.url;
                if (isImagePreview) {
                    const previewContent = previewIframe.parentElement;
                    const imageWrapper = document.createElement('div');
                    imageWrapper.className = 'preview-image-wrapper';
                    const img = document.createElement('img');
                    img.src = previewUrl;
                    img.className = 'preview-image';
                    img.onload = () => {
                        hideLoader();
                        img.style.display = 'block';
                    };
                    img.onerror = () => {
                        hideLoader();
                        showNotification('图片加载失败', 'error');
                    };
                    imageWrapper.appendChild(img);
                    previewContent.appendChild(imageWrapper);
                } else if (isVideoPreview) {
                    const previewContent = previewIframe.parentElement;
                    const videoWrapper = document.createElement('div');
                    videoWrapper.className = 'preview-video-wrapper';
                    const video = document.createElement('video');
                    video.src = previewUrl;
                    video.className = 'preview-video';
                    video.controls = true;
                    video.autoplay = false;
                    video.onloadeddata = hideLoader;
                    video.onerror = (e) => {
                        hideLoader();
                        showNotification('视频加载失败', 'error');
                        console.error('视频加载错误:', e);
                    };
                    videoWrapper.appendChild(video);
                    previewContent.appendChild(videoWrapper);
                } else {
                    previewIframe.onload = hideLoader;
                    previewIframe.onerror = () => {
                        hideLoader();
                        showNotification('预览加载失败', 'error');
                    };
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    if (isOfficePreview) {
                        const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewUrl)}`;
                        if (isMobile) {
                            window.open(officeViewerUrl, '_blank');
                            previewModal.classList.remove('visible');
                            previewLoader.style.display = 'none';
                            return;
                        } else {
                            previewIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
                            previewIframe.src = officeViewerUrl;
                        }
                    } else {
                        if (isMobile) {
                            window.open(previewUrl, '_blank');
                            previewModal.classList.remove('visible');
                            previewLoader.style.display = 'none';
                            return;
                        }
                        previewIframe.removeAttribute('sandbox');
                        previewIframe.src = previewUrl;
                    }
                    previewIframe.style.display = 'block';
                }
            }
        } else {
            showNotification('该文件类型不支持预览。', 'info');
            previewModal.classList.remove('visible');
            return;
        }
    } catch (error) {
        console.error("预览文件时出错:", error);
        showNotification(`预览失败: ${error.message}`, 'error');
        previewLoader.style.display = 'none';
        previewModal.classList.remove('visible');
    }
}
