function formatBytes(bytes, decimals = 2) {
    if (bytes == null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    return (isNaN(size) ? 0 : size) + ' ' + sizes[i];
}
function validateItemName(name, { allowSlash = false, maxLength = 255 } = {}) {
    if (!name || typeof name !== 'string') return { valid: false, error: '名称不能为空。' };
    const trimmed = name.trim();
    if (trimmed.length === 0) return { valid: false, error: '名称不能为空。' };
    if (trimmed.length > maxLength) return { valid: false, error: `名称不能超过 ${maxLength} 个字符。` };
    if (trimmed.includes('..')) return { valid: false, error: '名称不能包含 ".." 。' };
    if (!allowSlash && /[\/\\]/.test(trimmed)) return { valid: false, error: '名称不能包含斜杠 (/ 或 \\) 。' };
    if (/[<>:"|?*\x00-\x1f]/.test(trimmed)) return { valid: false, error: '名称包含非法字符 (< > : " | ? *)。' };
    return { valid: true, value: trimmed };
}
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) {
        return Math.floor(interval) + " 年前";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
        return Math.floor(interval) + " 个月前";
    }
    interval = seconds / 86400;
    if (interval > 1) {
        return Math.floor(interval) + " 天前";
    }
    interval = seconds / 3600;
    if (interval > 1) {
        return Math.floor(interval) + " 小时前";
    }
    interval = seconds / 60;
    if (interval > 1) {
        return Math.floor(interval) + " 分钟前";
    }
    return "刚刚";
}
function getFileIcon(fileName, isDirectory = false) {
    if (isDirectory) return 'fas fa-folder';
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
        'rar': 'fas fa-file-archive',
        '7z': 'fas fa-file-archive',
        'exe': 'fas fa-window-maximize',
        'msi': 'fas fa-box-open',
        'apk': 'fas fa-android',
        'dmg': 'fas fa-compact-disc',
        'c': 'fas fa-file-code',
        'cpp': 'fas fa-file-code',
        'h': 'fas fa-file-code',
        'py': 'fab fa-python',
        'java': 'fab fa-java',
        'js': 'fab fa-js',
        'html': 'fab fa-html5',
        'htm': 'fab fa-html5',
        'css': 'fab fa-css3-alt',
        'js': 'fab fa-js',
        'html': 'fab fa-html5',
        'htm': 'fab fa-html5',
        'css': 'fab fa-css3-alt',
        'json': 'fas fa-file-code',
        'md': 'fab fa-markdown',
        'epub': 'fas fa-book',
        'mobi': 'fas fa-book',
        'azw3': 'fas fa-book',
        'dwg': 'fas fa-drafting-compass',
        'dxf': 'fas fa-drafting-compass',
        'm': 'fas fa-file-code',
        'go': 'fas fa-file-code',
        'php': 'fab fa-php'
    };
    return iconMap[ext] || 'fas fa-file';
}
function getFileType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const typeMap = {
        'pdf': 'pdf',
        'doc': 'doc',
        'docx': 'doc',
        'xls': 'excel',
        'xlsx': 'excel',
        'ppt': 'ppt',
        'pptx': 'ppt',
        'txt': 'text',
        'jpg': 'image',
        'jpeg': 'image',
        'png': 'image',
        'webp': 'image',
        'gif': 'image',
        'mp4': 'video',
        'avi': 'video',
        'mov': 'video',
        'mkv': 'video',
        'mp3': 'audio',
        'wav': 'audio',
        'flac': 'audio',
        'zip': 'archive',
        'rar': 'archive',
        '7z': 'archive',
        'tar': 'archive',
        'gz': 'archive',
        'exe': 'app',
        'msi': 'app',
        'apk': 'app',
        'dmg': 'app',
        'c': 'code',
        'cpp': 'code',
        'h': 'code',
        'py': 'code',
        'java': 'code',
        'js': 'code',
        'html': 'code',
        'htm': 'code',
        'css': 'code',
        'json': 'code',
        'md': 'code',
        'm': 'code',
        'go': 'code',
        'php': 'code',
        'epub': 'book',
        'mobi': 'book',
        'azw3': 'book',
        'dwg': 'cad',
        'dxf': 'cad'
    };
    return typeMap[ext] || 'default';
}
function getLinkIcon() {
    return 'fas fa-external-link-alt';
}
function sortData(data, sortOption) {
    if (!data) return data;
    const sortedData = {
        directories: [...(data.directories || [])],
        files: [...(data.files || [])]
    };
    const [field, direction] = sortOption.split('-');
    const dirMultiplier = direction === 'asc' ? 1 : -1;
    const compareFunction = (a, b) => {
        if (field === 'name') {
            const isLinkA = a.is_link === 1 || a.is_link === true;
            const isLinkB = b.is_link === 1 || b.is_link === true;
            if (isLinkA !== isLinkB) {
                return isLinkA ? -1 : 1;
            }
        }
        let valA, valB;
        switch (field) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                return valA.localeCompare(valB, 'zh-CN') * dirMultiplier;
            case 'date':
                valA = new Date(a.uploaded || 0).getTime();
                valB = new Date(b.uploaded || 0).getTime();
                break;
            case 'size':
                valA = a.size || 0;
                valB = b.size || 0;
                break;
            case 'downloads':
                valA = a.downloads || 0;
                valB = b.downloads || 0;
                break;
            case 'likes':
                valA = a.likes || 0;
                valB = b.likes || 0;
                break;
            default:
                return 0;
        }
        if (valA < valB) return -1 * dirMultiplier;
        if (valA > valB) return 1 * dirMultiplier;
        return 0;
    };
    sortedData.directories.sort(compareFunction);
    sortedData.files.sort(compareFunction);
    return sortedData;
}
function filterByFolderSearch(data, searchTerm) {
    if (!data || !searchTerm || searchTerm.trim() === '') {
        return data;
    }
    const lowerTerm = searchTerm.toLowerCase().trim();
    return {
        directories: (data.directories || []).filter(dir =>
            (dir.name || '').toLowerCase().includes(lowerTerm)
        ),
        files: (data.files || []).filter(file =>
            (file.name || '').toLowerCase().includes(lowerTerm)
        )
    };
}
function filterByFileType(data, filter) {
    if (!filter || filter === 'all') return data;
    let dirs = data.directories || [];
    let files = data.files || [];
    if (filter === 'folder') {
        files = [];
    } else {
        dirs = [];
        files = files.filter(f => {
            if (f.isDirectory) return true;
            if (filter === 'link') return f.is_link === 1 || f.is_link === true;
            return getFileType(f.name) === filter;
        });
    }
    return { directories: dirs, files: files };
}
function filterTreeByKeyword(container, keyword, options = {}) {
    const {
        nodeSelector = '.path-tree-node',
        itemSelector = '.path-tree-item',
        nameSelector = '.path-folder-name',
        listSelector = '.path-tree-list',
        toggleSelector = '.path-toggle-icon',
        useTransform = true
    } = options;
    const term = keyword.toLowerCase().trim();
    const allNodes = container.querySelectorAll(nodeSelector);
    if (!term) {
        allNodes.forEach(node => {
            node.style.display = '';
            const sublist = node.querySelector(':scope > ' + listSelector);
            if (sublist) sublist.style.display = 'none';
            const item = node.querySelector(':scope > ' + itemSelector);
            const toggle = node.querySelector(toggleSelector);
            if (toggle && useTransform) toggle.style.transform = '';
            if (toggle) toggle.classList.remove('expanded');
            if (item && item.dataset && item.dataset.expanded !== undefined) {
                item.dataset.expanded = 'false';
            }
        });
        const rootList = container.querySelector(':scope > ' + listSelector);
        if (rootList) rootList.style.display = 'block';
        return;
    }
    const matchesTerm = (name) => {
        if (!name) return false;
        if (name.includes(term)) return true;
        let i = 0;
        for (let j = 0; j < name.length && i < term.length; j++) {
            if (name[j] === term[i]) i++;
        }
        return i === term.length;
    };
    allNodes.forEach(node => {
        node.style.display = 'none';
    });
    allNodes.forEach(node => {
        const nameEl = node.querySelector(nameSelector);
        const name = nameEl ? nameEl.textContent.toLowerCase() : '';
        if (matchesTerm(name)) {
            node.style.display = 'block';
            let parent = node.parentElement;
            while (parent && parent !== container) {
                if (parent.matches(listSelector)) {
                    parent.style.display = 'block';
                }
                if (parent.matches(nodeSelector)) {
                    parent.style.display = 'block';
                    const toggle = parent.querySelector(toggleSelector);
                    if (toggle) {
                        if (useTransform) toggle.style.transform = 'rotate(90deg)';
                        toggle.classList.add('expanded');
                    }
                }
                parent = parent.parentElement;
            }
        }
    });
}
function activateLazyVideos(container) {
    if (!container) return;
    const shells = container.querySelectorAll('.md-video-shell[data-video-src]');
    const videos = container.querySelectorAll('video[data-src]');
    if (!shells.length && !videos.length) return;

    const buildVideo = (shell) => {
        const src = shell.getAttribute('data-video-src');
        const label = shell.getAttribute('title') || '';
        const video = document.createElement('video');
        video.setAttribute('data-src', src);
        video.controls = true;
        video.setAttribute('preload', 'none');
        video.setAttribute('referrerpolicy', 'no-referrer');
        if (label) video.setAttribute('title', label);
        return video;
    };
    const activate = (video) => {
        video.src = video.getAttribute('data-src');
        video.removeAttribute('data-src');
        if (video.getAttribute('preload') === 'none') {
            video.setAttribute('preload', 'metadata');
        }
    };
    const bindVideo = (video, activate) => {
        activate(video);
        if (!video.autoplay) return;
        const tryPlay = () => {
            const playResult = video.play();
            if (playResult && typeof playResult.catch === 'function') {
                playResult.catch(() => { });
            }
        };
        if (video.readyState >= 2) {
            tryPlay();
        } else {
            video.addEventListener('loadeddata', tryPlay, { once: true });
        }
        if (video.hasAttribute('loop')) {
            video.addEventListener('ended', () => {
                try { video.currentTime = 0; } catch (e) { }
                tryPlay();
            });
            video.addEventListener('pause', () => {
                const duration = video.duration;
                if (!duration || !isFinite(duration)) return;
                if (video.currentTime <= 0.1) {
                    tryPlay();
                    setTimeout(() => {
                        if (video.paused && !video.ended) tryPlay();
                    }, 100);
                }
            });
        }
        video.addEventListener('error', () => {
            if (!video.getAttribute('src') || video.dataset.lazyVideoRetried) return;
            video.dataset.lazyVideoRetried = '1';
            setTimeout(() => { video.load(); }, 300);
        });
    };

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    observer.unobserve(entry.target);
                    const target = entry.target;
                    if (target.classList.contains('md-video-shell')) {
                        const video = buildVideo(target);
                        target.replaceWith(video);
                        bindVideo(video, activate);
                    } else {
                        activate(target);
                    }
                }
            });
        }, { threshold: 0.3 });
        shells.forEach(shell => {
            shell.addEventListener('click', () => {
                if (!shell.isConnected) return;
                const video = buildVideo(shell);
                shell.replaceWith(video);
                bindVideo(video, activate);
            }, { once: true });
            observer.observe(shell);
        });
        videos.forEach(video => observer.observe(video));
    } else {
        shells.forEach(shell => {
            const video = buildVideo(shell);
            shell.replaceWith(video);
            bindVideo(video, activate);
        });
        videos.forEach(activate);
    }
}
async function renderMarkdown(content) {
    if (!content) return '';
    try {
        if (typeof marked === 'undefined' || !marked.__baseLoaded) {
            await window.LazyLoader.loadMarkdownBase();
        }
        if (!marked.customConfigured) {
            marked.customConfigured = true;
            const renderer = new marked.Renderer();
            renderer.link = function (hrefOrToken, title, text) {
                let href, linkTitle, linkText;
                if (hrefOrToken && typeof hrefOrToken === 'object') {
                    href = hrefOrToken.href || '';
                    linkTitle = hrefOrToken.title || '';
                    linkText = hrefOrToken.text || '';
                } else {
                    href = hrefOrToken || '';
                    linkTitle = title || '';
                    linkText = text || '';
                }
                if (!href) return linkText || '';
                let isExternal = false;
                try {
                    const url = new URL(href);
                    isExternal = url.hostname !== window.location.hostname;
                } catch (e) {
                    isExternal = false;
                }
                if (isExternal && typeof openLink === 'function') {
                    return `<a href="${href}" title="${linkTitle}" class="external-link" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
                }
                const titleAttr = linkTitle ? ` title="${linkTitle}"` : '';
                return `<a href="${href}"${titleAttr}>${linkText}</a>`;
            };
            renderer.image = function (hrefOrToken, title, text) {
                let href, imgTitle, imgText;
                if (hrefOrToken && typeof hrefOrToken === 'object') {
                    href = hrefOrToken.href || '';
                    imgTitle = hrefOrToken.title || '';
                    imgText = hrefOrToken.text || '';
                } else {
                    href = hrefOrToken || '';
                    imgTitle = title || '';
                    imgText = text || '';
                }
                const titleAttr = imgTitle ? ` title="${imgTitle}"` : '';
                const videoExtMatch = (href || '').toLowerCase().split('?')[0].split('#')[0].match(/\.(mp4|webm|mov|m4v|ogv)$/);
                if (videoExtMatch) {
                    return `<span class="md-video-shell" data-video-src="${href}"${titleAttr}><span class="md-video-shell-label">视频加载中…</span></span>`;
                }
                return `<img src="${href}" alt="${imgText}"${titleAttr} referrerpolicy="no-referrer">`;
            };
            marked.use({
                breaks: true,
                gfm: true,
                mangle: false,
                headerIds: false,
                renderer: renderer
            });
            const footnoteExt = window.markedFootnote || window.markedFootnotes;
            if (typeof footnoteExt === 'function') {
                marked.use(footnoteExt());
            }
        }
        if (/```/.test(content) && !marked.__highlightConfigured) {
            await window.LazyLoader.loadHighlight();
            if (typeof window.markedHighlight !== 'undefined' && typeof hljs !== 'undefined') {
                const mh = window.markedHighlight.markedHighlight || window.markedHighlight;
                marked.use(mh({
                    langPrefix: 'hljs language-',
                    highlight(code, lang) {
                        if (lang && hljs.getLanguage(lang)) {
                            return hljs.highlight(code, { language: lang }).value;
                        }
                        return hljs.highlightAuto(code).value;
                    }
                }));
                marked.__highlightConfigured = true;
            }
        }
        if (/\$/.test(content) && !marked.__katexConfigured) {
            await window.LazyLoader.loadKatex();
            const katexExt = window.markedKatex || window.markedKatexExtension;
            if (typeof katexExt === 'function') {
                marked.use(katexExt({
                    throwOnError: false,
                    nonStandard: true,
                    katex: window.katex
                }));
                marked.__katexConfigured = true;
            }
        }
        let processed = content.trim()
            .replace(/\[\[([^\]]+)\]\]\(([^)]+)\)/g, '[$1]($2)')
            .replace(/([^\n])\n(\$\$)/g, '$1\n\n$2')
            .replace(/(\$\$)\n([^\n$])/g, '$1\n\n$2')
            .replace(/([^\n])\n([ \t]*([-*_])[ \t]*\3[ \t]*\3[ \t]*)$/gm, '$1\n\n$2');
        let parsed = marked.parse(processed);
        if (typeof DOMPurify !== 'undefined') {
            if (!DOMPurify.__videoLazyHooked) {
                DOMPurify.__videoLazyHooked = true;
                DOMPurify.addHook('afterSanitizeAttributes', (node) => {
                    if (node.tagName === 'VIDEO' && node.getAttribute('src')) {
                        node.setAttribute('data-src', node.getAttribute('src'));
                        node.removeAttribute('src');
                        node.setAttribute('preload', 'none');
                    }
                });
            }
            parsed = DOMPurify.sanitize(parsed, {
                ADD_TAGS: [
                    'details', 'summary', 'iframe', 'hr', 'section', 'sup', 'sub',
                    'a', 'li', 'ol', 'span', 'math', 'style', 'svg', 'path', 'g', 'use',
                    'annotation', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'msubsup',
                    'mfrac', 'msqrt', 'mroot', 'mtd', 'mtr', 'mtable', 'munder', 'mover', 'munderover',
                    'semantics', 'annotation', 'annotation-xml', 'video', 'source'
                ],
                ADD_ATTR: [
                    'target', 'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'class', 'id', 'href',
                    'autoplay', 'muted', 'loop', 'playsinline', 'controls', 'preload', 'poster', 'src', 'type', 'media', 'data-src',
                    'aria-describedby', 'aria-label', 'role', 'aria-hidden', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width',
                    'encoding', 'definitionURL', 'display', 'style', 'referrerpolicy'
                ],
                USE_PROFILES: { html: true, mathMl: true, svg: true }
            });
        }
        return parsed;
    } catch (e) {
        console.error('Markdown rendering error:', e);
        return `<div style="white-space: pre-wrap;">${escapeHtml(content)}</div>`;
    }
}
