async function previewFile(fileKey, fileName, fileSize) {
    const extension = fileName.split('.').pop().toLowerCase();
    const officeExtensions = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];
    const pdfExtensions = ['pdf'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const txtExtensions = ['txt'];
    const archiveExtensions = ['zip', 'tar', 'gz', 'tgz'];
    const isVideo = videoExtensions.includes(extension);
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const isAudio = audioExtensions.includes(extension);
    const isArchive = archiveExtensions.includes(extension) || fileName.toLowerCase().endsWith('.tar.gz');
    if (!isVideo && !isAudio && fileSize > 10 * 1024 * 1024) {
        if (txtExtensions.includes(extension)) {
            showNotification('文件过大，不支持在线预览。', 'info');
            return;
        }
    }
    if (isArchive && fileSize > 200 * 1024 * 1024) {
        showNotification('压缩包超过200MB，不支持在线预览。', 'info');
        return;
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
    const existingZipWrapper = previewModal.querySelector('.preview-zip-wrapper');
    if (existingZipWrapper) existingZipWrapper.remove();
    try {
        const isOfficePreview = officeExtensions.includes(extension);
        const isPdfPreview = pdfExtensions.includes(extension);
        const isImagePreview = imageExtensions.includes(extension);
        const isVideoPreview = videoExtensions.includes(extension);
        const isAudioPreview = audioExtensions.includes(extension);
        const isTxtPreview = txtExtensions.includes(extension);
        const isArchivePreview = isArchive;
        if (isOfficePreview || isPdfPreview || isImagePreview || isVideoPreview || isAudioPreview || isTxtPreview || isArchivePreview) {
            const apiUrl = new URL(API_ENDPOINTS.preview, window.location.origin);
            apiUrl.searchParams.append('key', fileKey);
            if (isOfficePreview) {
                apiUrl.searchParams.append('office', 'true');
            }
            if (isPdfPreview || isImagePreview || isVideoPreview || isAudioPreview || isArchivePreview) {
                apiUrl.searchParams.append('inline', 'true');
            }
            if (isTxtPreview) {
                apiUrl.searchParams.append('type', 'text');
            }
            if (isArchivePreview) {
                apiUrl.searchParams.append('type', 'zip');
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
                if (extension === 'md') {
                    textPreviewWrapper.classList.add('markdown-body');
                } else {
                    textPreviewWrapper.classList.add('hljs');
                }
                textPreviewWrapper.style.opacity = '0';
                textPreviewWrapper.style.transition = 'opacity 0.3s ease';
                textPreviewWrapper.style.display = 'block';
                if (extension === 'md' && typeof renderMarkdown === 'function') {
                    const mdContent = document.createElement('div');
                    mdContent.className = 'preview-markdown';
                    mdContent.style.padding = '20px';
                    mdContent.style.lineHeight = '1.6';
                    mdContent.innerHTML = renderMarkdown(data.content);
                    textPreviewWrapper.appendChild(mdContent);
                } else {
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
                }
                previewIframe.parentElement.appendChild(textPreviewWrapper);
                hideLoader();
                requestAnimationFrame(() => {
                    textPreviewWrapper.style.opacity = '1';
                });
            } else if (isArchivePreview) {
                const previewUrl = data.url;
                const archiveType = getArchiveType(fileName);
                let archiveData;
                if (archiveType === 'zip') {
                    archiveData = await parseZipViaRange(previewUrl);
                } else {
                    const archiveResponse = await fetch(previewUrl);
                    if (!archiveResponse.ok) {
                        throw new Error('无法下载压缩包文件');
                    }
                    const archiveBuffer = await archiveResponse.arrayBuffer();
                    archiveData = await parseArchive(archiveBuffer, fileName);
                }
                const archivePreviewWrapper = document.createElement('div');
                archivePreviewWrapper.className = 'preview-zip-wrapper';
                archivePreviewWrapper.style.opacity = '0';
                archivePreviewWrapper.style.transition = 'opacity 0.3s ease';

                const archiveHeader = document.createElement('div');
                archiveHeader.className = 'preview-zip-header';
                const archiveIcon = document.createElement('i');
                archiveIcon.className = archiveType === 'tar' ? 'fas fa-box-open' : 'fas fa-file-archive';
                const archiveTitle = document.createElement('span');
                archiveTitle.textContent = fileName;
                const archiveInfo = document.createElement('span');
                archiveInfo.className = 'preview-zip-info';
                const fileCount = archiveData.filter(e => !e.dir).length;
                archiveInfo.textContent = `${fileCount} 个文件`;
                archiveHeader.appendChild(archiveIcon);
                archiveHeader.appendChild(archiveTitle);
                archiveHeader.appendChild(archiveInfo);
                archivePreviewWrapper.appendChild(archiveHeader);

                const archiveTree = buildArchiveTree(archiveData);
                const archiveTreeContainer = document.createElement('div');
                archiveTreeContainer.className = 'preview-zip-tree';
                archiveTreeContainer.appendChild(archiveTree);
                archivePreviewWrapper.appendChild(archiveTreeContainer);

                previewIframe.parentElement.appendChild(archivePreviewWrapper);
                hideLoader();
                requestAnimationFrame(() => {
                    archivePreviewWrapper.style.opacity = '1';
                });
            }
            else {
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

function getArchiveType(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
    if (lower.endsWith('.tar')) return 'tar';
    if (lower.endsWith('.zip')) return 'zip';
    const ext = lower.split('.').pop();
    if (ext === 'gz') return 'tar.gz';
    return 'zip';
}

function findEocd(buffer, searchSize, fileSize) {
    const bytes = new Uint8Array(buffer);
    const eocdSignature = 0x06054b50;
    const minEOCD = 22;
    const searchEnd = bytes.length;
    const searchStart = Math.max(0, searchEnd - searchSize - 64);
    for (let i = searchEnd - minEOCD; i >= searchStart; i--) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
            const view = new DataView(buffer, i);
            const commentLen = view.getUint16(20, true);
            if (i + minEOCD + commentLen === bytes.length || i + minEOCD + commentLen <= bytes.length) {
                const cdOffset = view.getUint32(16, true);
                const cdSize = view.getUint32(12, true);
                const entryCount = view.getUint16(10, true);
                return { eocdOffset: i, cdOffset, cdSize, entryCount, fileSize };
            }
        }
    }
    return null;
}

function parseCentralDirectory(buffer, cdOffset, cdSize, entryCount) {
    const view = new DataView(buffer);
    const entries = [];
    let offset = cdOffset;
    for (let i = 0; i < entryCount && offset + 46 <= buffer.byteLength; i++) {
        const sig = view.getUint32(offset, true);
        if (sig !== 0x02014b50) break;
        const compressionMethod = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const uncompressedSize = view.getUint32(offset + 24, true);
        const nameLen = view.getUint16(offset + 28, true);
        const extraLen = view.getUint16(offset + 30, true);
        const commentLen = view.getUint16(offset + 32, true);
        const externalAttrs = view.getUint32(offset + 38, true);
        const nameBytes = new Uint8Array(buffer, offset + 46, nameLen);
        let name = '';
        for (let j = 0; j < nameLen; j++) {
            name += String.fromCharCode(nameBytes[j]);
        }
        const isDir = name.endsWith('/') || ((externalAttrs >> 16) & 0x10) !== 0;
        entries.push({
            path: name,
            dir: isDir,
            size: uncompressedSize
        });
        offset += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

async function parseZipViaRange(url) {
    const HEAD_SIZE = 64 * 1024;
    const headResponse = await fetch(url, {
        headers: { 'Range': `bytes=0-${HEAD_SIZE - 1}` }
    });
    if (!headResponse.ok && headResponse.status !== 206) {
        throw new Error('无法获取压缩包文件头部');
    }
    const contentRange = headResponse.headers.get('Content-Range');
    let fileSize = 0;
    if (contentRange) {
        const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
        if (match) fileSize = parseInt(match[1], 10);
    }
    if (!fileSize) {
        const totalLen = headResponse.headers.get('Content-Length');
        if (headResponse.status === 206 && totalLen) {
            fileSize = parseInt(totalLen, 10);
        }
    }
    if (!fileSize) {
        const fullResp = await fetch(url);
        if (!fullResp.ok) throw new Error('无法下载压缩包文件');
        const buf = await fullResp.arrayBuffer();
        if (typeof JSZip === 'undefined') throw new Error('JSZip 未加载，请刷新页面重试');
        const zip = await JSZip.loadAsync(buf);
        const entries = [];
        Object.keys(zip.files).forEach(path => {
            const file = zip.files[path];
            entries.push({ path, dir: file.dir, size: file._data ? file._data.uncompressedSize || 0 : 0 });
        });
        return entries;
    }

    const tailSize = Math.min(64 * 1024, fileSize);
    const tailResponse = await fetch(url, {
        headers: { 'Range': `bytes=${fileSize - tailSize}-${fileSize - 1}` }
    });
    if (!tailResponse.ok && tailResponse.status !== 206) {
        throw new Error('无法获取压缩包目录');
    }
    const tailBuffer = await tailResponse.arrayBuffer();
    const eocd = findEocd(tailBuffer, tailSize, fileSize);
    if (!eocd) {
        throw new Error('无法解析压缩包目录，请尝试下载后查看');
    }

    const cdEnd = Math.min(eocd.cdOffset + eocd.cdSize, fileSize);
    const cdStart = eocd.cdOffset;
    let cdBuffer;
    if (cdStart >= fileSize - tailSize && cdEnd <= fileSize) {
        const offsetInTail = cdStart - (fileSize - tailSize);
        cdBuffer = tailBuffer.slice(offsetInTail, offsetInTail + eocd.cdSize);
    } else {
        const cdResponse = await fetch(url, {
            headers: { 'Range': `bytes=${cdStart}-${cdEnd - 1}` }
        });
        if (!cdResponse.ok && cdResponse.status !== 206) {
            throw new Error('无法获取压缩包目录数据');
        }
        cdBuffer = await cdResponse.arrayBuffer();
    }
    return parseCentralDirectory(cdBuffer, 0, eocd.cdSize, eocd.entryCount);
}

async function decompressGzip(buffer) {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buffer));
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    let totalLen = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result.buffer;
}

function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const entries = [];
    let offset = 0;
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        const nameBytes = header.subarray(0, 100);
        let name = '';
        for (let i = 0; i < nameBytes.length; i++) {
            if (nameBytes[i] === 0) break;
            name += String.fromCharCode(nameBytes[i]);
        }
        if (!name) break;
        const prefixBytes = header.subarray(345, 500);
        let prefix = '';
        for (let i = 0; i < prefixBytes.length; i++) {
            if (prefixBytes[i] === 0) break;
            prefix += String.fromCharCode(prefixBytes[i]);
        }
        if (prefix) name = prefix + name;
        const sizeField = header.subarray(124, 136);
        let sizeStr = '';
        for (let i = 0; i < sizeField.length; i++) {
            if (sizeField[i] === 0 || sizeField[i] === 32) break;
            sizeStr += String.fromCharCode(sizeField[i]);
        }
        const size = parseInt(sizeStr, 8) || 0;
        const typeFlag = String.fromCharCode(header[156]);
        const isDir = typeFlag === '5' || name.endsWith('/');
        offset += 512;
        const dataBlocks = Math.ceil(size / 512);
        offset += dataBlocks * 512;
        entries.push({ path: name, size, dir: isDir });
    }
    return entries;
}

async function parseArchive(buffer, fileName) {
    const type = getArchiveType(fileName);
    if (type === 'zip') {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip 未加载，请刷新页面重试');
        }
        const zip = await JSZip.loadAsync(buffer);
        const entries = [];
        Object.keys(zip.files).forEach(path => {
            const file = zip.files[path];
            entries.push({
                path,
                dir: file.dir,
                size: file._data ? file._data.uncompressedSize || 0 : 0
            });
        });
        return entries;
    }
    if (type === 'tar') {
        return parseTar(buffer);
    }
    if (type === 'tar.gz') {
        const decompressed = await decompressGzip(buffer);
        return parseTar(decompressed);
    }
    throw new Error('不支持的压缩包格式');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function buildArchiveTree(entries) {
    const root = { name: '', children: {}, isDir: true };
    entries.forEach(entry => {
        const path = entry.path.replace(/\\/g, '/');
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) return;
        let current = root;
        parts.forEach((part, idx) => {
            const isLast = idx === parts.length - 1;
            const isDir = entry.dir || !isLast;
            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    children: {},
                    isDir: isDir,
                    size: isDir ? 0 : entry.size
                };
            }
            current = current.children[part];
        });
    });

    function getIconClass(name, isDir) {
        if (isDir) return 'fas fa-folder';
        const ext = name.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': 'fas fa-file-pdf', 'doc': 'fas fa-file-word', 'docx': 'fas fa-file-word',
            'xls': 'fas fa-file-excel', 'xlsx': 'fas fa-file-excel', 'csv': 'fas fa-file-csv',
            'ppt': 'fas fa-file-powerpoint', 'pptx': 'fas fa-file-powerpoint',
            'zip': 'fas fa-file-archive', 'rar': 'fas fa-file-archive', '7z': 'fas fa-file-archive',
            'gz': 'fas fa-file-archive', 'tar': 'fas fa-file-archive',
            'jpg': 'fas fa-file-image', 'jpeg': 'fas fa-file-image', 'png': 'fas fa-file-image',
            'gif': 'fas fa-file-image', 'bmp': 'fas fa-file-image', 'svg': 'fas fa-file-image',
            'webp': 'fas fa-file-image', 'ico': 'fas fa-file-image',
            'mp4': 'fas fa-file-video', 'avi': 'fas fa-file-video', 'mkv': 'fas fa-file-video',
            'mov': 'fas fa-file-video', 'wmv': 'fas fa-file-video', 'webm': 'fas fa-file-video',
            'mp3': 'fas fa-file-audio', 'wav': 'fas fa-file-audio', 'flac': 'fas fa-file-audio',
            'ogg': 'fas fa-file-audio', 'm4a': 'fas fa-file-audio', 'aac': 'fas fa-file-audio',
            'js': 'fas fa-file-code', 'ts': 'fas fa-file-code', 'py': 'fas fa-file-code',
            'java': 'fas fa-file-code', 'c': 'fas fa-file-code', 'cpp': 'fas fa-file-code',
            'h': 'fas fa-file-code', 'go': 'fas fa-file-code', 'rs': 'fas fa-file-code',
            'html': 'fas fa-file-code', 'css': 'fas fa-file-code', 'json': 'fas fa-file-code',
            'xml': 'fas fa-file-code', 'sh': 'fas fa-file-code', 'bat': 'fas fa-file-code',
            'sql': 'fas fa-file-code',
            'txt': 'fas fa-file-alt', 'md': 'fas fa-file-alt', 'log': 'fas fa-file-alt',
            'rtf': 'fas fa-file-alt',
            'exe': 'fas fa-cog', 'dll': 'fas fa-cog', 'so': 'fas fa-cog', 'dylib': 'fas fa-cog',
        };
        return iconMap[ext] || 'fas fa-file';
    }

    function renderNode(node, parentEl, depth) {
        const keys = Object.keys(node.children).sort((a, b) => {
            const aDir = node.children[a].isDir;
            const bDir = node.children[b].isDir;
            if (aDir !== bDir) return aDir ? -1 : 1;
            return a.localeCompare(b);
        });

        keys.forEach(key => {
            const child = node.children[key];
            const item = document.createElement('div');
            item.className = 'zip-item';

            const row = document.createElement('div');
            row.className = 'zip-item-row';
            row.style.paddingLeft = (depth * 20 + 8) + 'px';

            const icon = document.createElement('i');
            icon.className = getIconClass(child.name, child.isDir);

            const name = document.createElement('span');
            name.className = 'zip-item-name';
            name.textContent = child.name;

            row.appendChild(icon);
            row.appendChild(name);

            if (!child.isDir && child.size) {
                const sizeSpan = document.createElement('span');
                sizeSpan.className = 'zip-item-size';
                sizeSpan.textContent = formatFileSize(child.size);
                row.appendChild(sizeSpan);
            }

            item.appendChild(row);

            if (child.isDir && Object.keys(child.children).length > 0) {
                const childContainer = document.createElement('div');
                childContainer.className = 'zip-item-children zip-item-collapsed';
                renderNode(child, childContainer, depth + 1);
                item.appendChild(childContainer);

                row.addEventListener('click', () => {
                    icon.className = childContainer.classList.contains('zip-item-collapsed')
                        ? 'fas fa-folder-open'
                        : getIconClass(child.name, child.isDir);
                    childContainer.classList.toggle('zip-item-collapsed');
                    row.classList.toggle('zip-folder-open');
                });
                row.classList.add('zip-folder-row');
            } else if (child.isDir) {
                row.classList.add('zip-folder-row');
                row.addEventListener('click', () => {});
            }

            parentEl.appendChild(item);
        });
    }

    const treeRoot = document.createElement('div');
    treeRoot.className = 'zip-tree-root';
    renderNode(root, treeRoot, 0);
    return treeRoot;
}
