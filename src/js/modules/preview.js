async function previewFile(fileKey, fileName, fileSize) {
    const extension = fileName.split('.').pop().toLowerCase();
    const officeExtensions = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];
    const pdfExtensions = ['pdf'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const txtExtensions = ['txt'];
    const isVideo = videoExtensions.includes(extension);
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const isAudio = audioExtensions.includes(extension);
    if (!isVideo && !isAudio && fileSize > 10 * 1024 * 1024) {
        if (txtExtensions.includes(extension)) {
            showNotification('文件过大，不支持在线预览。', 'info');
            return;
        }
    }
    if (!isVideo && !isAudio && fileSize > 300 * 1024 * 1024) {
        showNotification('文件超过300MB，不支持预览。', 'info');
        return;
    }
    if ((isVideo || isAudio) && fileSize > 300 * 1024 * 1024) {
        showNotification('媒体文件超过300MB，不支持在线播放。', 'info');
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification("无法预览：未获取到验证令牌。", 'error');
        return;
    }
    txtExtensions.push(
        'js', 'css', 'html', 'json', 'xml', 'md', 'py', 'java', 'c', 'cpp', 'h',
        'go', 'rs', 'php', 'sh', 'bat', 'cmd', 'ps1', 'sql', 'ini', 'toml', 'yaml',
        'yml', 'conf', 'log', 'gitignore', 'env'
    );
    const previewLoader = previewModal.querySelector('.preview-loader');
    previewTitle.textContent = `预览: ${fileName}`;
    previewModal.classList.add('visible');
    previewLoader.style.display = 'flex';
    previewIframe.style.display = 'none';
    const existingImageWrapper = previewModal.querySelector('.preview-image-wrapper');
    if (existingImageWrapper) existingImageWrapper.remove();
    const existingVideoWrapper = previewModal.querySelector('.preview-video-wrapper');
    if (existingVideoWrapper) existingVideoWrapper.remove();
    const existingAudioWrapper = previewModal.querySelector('.preview-audio-wrapper');
    if (existingAudioWrapper) existingAudioWrapper.remove();
    const existingTextWrapper = previewModal.querySelector('.preview-text-wrapper');
    if (existingTextWrapper) existingTextWrapper.remove();
    try {
        const isOfficePreview = officeExtensions.includes(extension);
        const isPdfPreview = pdfExtensions.includes(extension);
        const isImagePreview = imageExtensions.includes(extension);
        const isVideoPreview = videoExtensions.includes(extension);
        const isAudioPreview = audioExtensions.includes(extension);
        const isTxtPreview = txtExtensions.includes(extension);
        if (isOfficePreview || isPdfPreview || isImagePreview || isVideoPreview || isAudioPreview || isTxtPreview) {
            const apiUrl = new URL(API_ENDPOINTS.preview, window.location.origin);
            apiUrl.searchParams.append('key', fileKey);
            if (isOfficePreview) {
                apiUrl.searchParams.append('office', 'true');
            }
            if (isPdfPreview || isImagePreview || isVideoPreview || isAudioPreview) {
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
                textPreviewWrapper.className = 'preview-text-wrapper hljs';
                textPreviewWrapper.style.opacity = '0';
                textPreviewWrapper.style.transition = 'opacity 0.3s ease';
                textPreviewWrapper.style.display = 'block';
                const pre = document.createElement('pre');
                pre.className = 'preview-text';
                pre.style.margin = '0';
                pre.style.padding = '20px';
                pre.style.backgroundColor = 'transparent';
                const code = document.createElement('code');
                code.style.display = 'block';
                code.style.backgroundColor = 'transparent';
                if (typeof hljs !== 'undefined') {
                    try {
                        let highlighted;
                        if (hljs.getLanguage(extension)) {
                            code.className = `language-${extension}`;
                            highlighted = hljs.highlight(data.content, { language: extension }).value;
                        } else {
                            const result = hljs.highlightAuto(data.content);
                            code.className = `language-${result.language || 'plaintext'}`;
                            highlighted = result.value;
                        }
                        code.innerHTML = highlighted;
                    } catch (e) {
                        console.warn('Highlight failed:', e);
                        code.textContent = data.content;
                    }
                } else {
                    code.textContent = data.content;
                }
                pre.appendChild(code);
                textPreviewWrapper.appendChild(pre);
                previewIframe.parentElement.appendChild(textPreviewWrapper);
                hideLoader();
                requestAnimationFrame(() => {
                    textPreviewWrapper.style.opacity = '1';
                });
            } else {
                const previewUrl = data.url;
                if (isImagePreview) {
                    const previewContent = previewIframe.parentElement;
                    const imageWrapper = document.createElement('div');
                    imageWrapper.className = 'preview-image-wrapper';
                    imageWrapper.style.opacity = '0';
                    imageWrapper.style.transition = 'opacity 0.3s ease';
                    const img = document.createElement('img');
                    img.src = previewUrl;
                    img.className = 'preview-image';
                    img.onload = () => {
                        hideLoader();
                        img.style.display = 'block';
                        imageWrapper.style.opacity = '1';
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
                    videoWrapper.style.opacity = '0';
                    videoWrapper.style.transition = 'opacity 0.3s ease';
                    const video = document.createElement('video');
                    video.src = previewUrl;
                    video.className = 'preview-video';
                    video.controls = true;
                    video.autoplay = false;
                    const showVideoPlayer = () => {
                        hideLoader();
                        videoWrapper.style.opacity = '1';
                    };
                    video.onloadeddata = showVideoPlayer;
                    video.onerror = (e) => {
                        hideLoader();
                        showNotification('视频加载失败', 'error');
                        console.error('视频加载错误:', e);
                    };
                    setTimeout(showVideoPlayer, 3000);
                    videoWrapper.appendChild(video);
                    previewContent.appendChild(videoWrapper);
                } else if (isAudioPreview) {
                    const previewContent = previewIframe.parentElement;
                    const audioWrapper = document.createElement('div');
                    audioWrapper.className = 'preview-audio-wrapper';
                    audioWrapper.style.opacity = '0';
                    audioWrapper.style.transition = 'opacity 0.3s ease';
                    const audioCard = document.createElement('div');
                    audioCard.className = 'preview-audio-card';
                    const iconWrapper = document.createElement('div');
                    iconWrapper.className = 'preview-audio-icon';
                    iconWrapper.innerHTML = '<i class="fas fa-music"></i>';
                    const infoWrapper = document.createElement('div');
                    infoWrapper.className = 'preview-audio-info';
                    const titleEl = document.createElement('div');
                    titleEl.className = 'preview-audio-title';
                    titleEl.textContent = fileName;
                    titleEl.title = fileName;
                    const hintEl = document.createElement('div');
                    hintEl.className = 'preview-audio-hint';
                    hintEl.textContent = '正在播放音频文件';
                    infoWrapper.appendChild(titleEl);
                    infoWrapper.appendChild(hintEl);
                    const audio = document.createElement('audio');
                    audio.src = previewUrl;
                    audio.className = 'preview-audio';
                    audio.controls = true;
                    audio.autoplay = false;
                    const showAudioPlayer = () => {
                        hideLoader();
                        audioWrapper.style.opacity = '1';
                    };
                    audio.onloadedmetadata = showAudioPlayer;
                    audio.onerror = (e) => {
                        hideLoader();
                        showNotification('音频加载失败', 'error');
                        console.error('音频加载错误:', e);
                    };
                    setTimeout(showAudioPlayer, 2000);
                    audioCard.appendChild(iconWrapper);
                    audioCard.appendChild(infoWrapper);
                    audioCard.appendChild(audio);
                    audioWrapper.appendChild(audioCard);
                    previewContent.appendChild(audioWrapper);
                } else {
                    previewIframe.style.opacity = '0';
                    previewIframe.style.transition = 'opacity 0.3s ease';
                    const showIframe = () => {
                        hideLoader();
                        previewIframe.style.opacity = '1';
                    };
                    previewIframe.onload = showIframe;
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
                    setTimeout(showIframe, 5000);
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
