function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function getFolderDepth(folderKey) {
    if (!folderKey || typeof folderKey !== 'string') return 0;
    const key = folderKey.endsWith('/') ? folderKey.slice(0, -1) : folderKey;
    if (key.length === 0) return 0;
    return key.split('/').filter(Boolean).length;
}
function updateReactionCount(btn, count) {
    const countEl = btn.querySelector('.reaction-count');
    if (count > 0) {
        if (countEl) {
            countEl.textContent = count;
        } else {
            const span = document.createElement('span');
            span.className = 'reaction-count';
            span.textContent = count;
            btn.appendChild(span);
        }
    } else if (countEl) {
        countEl.remove();
    }
}

function updateBreadcrumb(prefix, isSearch = false, searchTerm = '', isAISearch = false) {
    if (!breadcrumbListElement) return;
    breadcrumbListElement.innerHTML = '';
    if (isSearch) {
        const searchItem = document.createElement('li');
        searchItem.className = 'breadcrumb-item';
        searchItem.setAttribute('aria-current', 'page');
        const aiBadge = isAISearch ? '<span class="ai-search-badge"><i class="fas fa-magic"></i> AI</span>' : '';
        searchItem.innerHTML = `<i class="fas fa-search" style="margin-right: 0.5rem;"></i>搜索结果: "${searchTerm}"${aiBadge}`;
        breadcrumbListElement.appendChild(searchItem);
        return;
    }
    const rootLi = document.createElement('li');
    rootLi.classList.add('breadcrumb-item');
    const rootLink = document.createElement('a');
    rootLink.href = '#';
    rootLink.textContent = '根目录';
    rootLink.onclick = (e) => {
        e.preventDefault();
        fetchAndDisplayFiles('');
    };
    rootLi.appendChild(rootLink);
    breadcrumbListElement.appendChild(rootLi);
    if (prefix) {
        const parts = getPathParts(prefix);
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += part + '/';
            const li = document.createElement('li');
            li.classList.add('breadcrumb-item');
            if (index === parts.length - 1) {
                li.textContent = part;
                li.setAttribute('aria-current', 'page');
            } else {
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = part;
                const pathOnClick = currentPath;
                link.onclick = (e) => {
                    e.preventDefault();
                    fetchAndDisplayFiles(pathOnClick);
                };
                li.appendChild(link);
            }
            breadcrumbListElement.appendChild(li);
        });
    }
}
function getPathParts(path) {
    if (!path) return [];
    const raw = path.endsWith('/') ? path.slice(0, -1) : path;
    const parts = [];
    let current = '';
    let balance = 0;
    for (const char of raw) {
        if (char === '(' || char === '（') {
            balance++;
            current += char;
        } else if (char === ')' || char === '）') {
            balance = Math.max(0, balance - 1);
            current += char;
        } else if (char === '/' && balance === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}
function getParentPath(path) {
    if (!path) return '';
    const raw = path.endsWith('/') ? path.slice(0, -1) : path;
    let balance = 0;
    for (let i = raw.length - 1; i >= 0; i--) {
        const char = raw[i];
        if (char === ')' || char === '）') {
            balance++;
        } else if (char === '(' || char === '（') {
            balance = Math.max(0, balance - 1);
        } else if (char === '/' && balance === 0) {
            return raw.substring(0, i + 1);
        }
    }
    return '';
}
function buildTree(paths) {
    const tree = {};
    paths.forEach(path => {
        let currentLevel = tree;
        const parts = getPathParts(path).filter(p => p);
        parts.forEach(part => {
            if (!currentLevel[part]) {
                currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
        });
    });
    return tree;
}

let sidebarTree = null;

function renderFolderTree(tree, container) {
    sidebarTree = new LazyFolderTree({
        container: container,
        scrollWrapper: true,
        showGoToBtn: true,
        onGoTo: function (path, item) {
            fetchAndDisplayFiles(path);
            document.querySelectorAll('.folder-tree-item.active').forEach(item => item.classList.remove('active'));
            item.classList.add('active');
        }
    });
    sidebarTree.render(tree._sourceDirectories || []);
}
function highlightCurrentFolder(prefix) {
    document.querySelectorAll('.folder-tree-item.active').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.folder-tree-list .folder-tree-list').forEach(ul => ul.style.display = 'none');
    document.querySelectorAll('.folder-tree-item[data-expanded="true"]').forEach(item => item.dataset.expanded = 'false');
    document.querySelectorAll('.folder-toggle-icon.expanded').forEach(icon => icon.classList.remove('expanded'));
    if (!prefix) return;
    if (sidebarTree) {
        sidebarTree.expandToPath(prefix);
    }
    const target = document.querySelector(`.folder-tree-item[data-path="${CSS.escape(prefix)}"]`);
    if (!target) return;
    target.classList.add('active');
    let parent = target.closest('.folder-tree-node');
    while (parent) {
        const sublist = parent.querySelector(':scope > .folder-tree-list');
        if (sublist) sublist.style.display = 'block';
        const toggle = parent.querySelector(':scope > .folder-tree-item .folder-toggle-icon');
        const item = parent.querySelector(':scope > .folder-tree-item');
        if (toggle) toggle.classList.add('expanded');
        if (item) item.dataset.expanded = 'true';
        parent = parent.parentElement ? parent.parentElement.closest('.folder-tree-node') : null;
    }
    const scrollContainer = document.querySelector('#folder-tree .folder-tree-scroll-wrapper');
    if (scrollContainer) {
        const indicator = scrollContainer.querySelector('.folder-tree-scroll-indicator');
        const offset = (indicator && indicator.classList.contains('visible')) ? indicator.offsetHeight : 0;
        const targetRect = target.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const relativeTop = targetRect.top - containerRect.top + scrollContainer.scrollTop - offset;
        const targetBottom = relativeTop + target.offsetHeight;
        const viewTop = scrollContainer.scrollTop + offset;
        const viewBottom = scrollContainer.scrollTop + scrollContainer.offsetHeight;
        if (relativeTop < viewTop || targetBottom > viewBottom) {
            scrollContainer.scrollTo({ top: relativeTop - 8, behavior: 'smooth' });
        }
    }
    requestAnimationFrame(() => {
        const scrollContainer = document.querySelector('#folder-tree .folder-tree-scroll-wrapper');
        const scrollIndicator = scrollContainer?.querySelector('.folder-tree-scroll-indicator');
        if (scrollContainer && scrollIndicator) {
            updateFolderTreeScrollIndicator(scrollContainer, scrollIndicator);
        }
    });
}
function updateFolderTreeScrollIndicator(scrollContainer, scrollIndicator) {
    const topNodes = scrollContainer.querySelectorAll(':scope > .folder-tree-list > .folder-tree-node');
    if (!topNodes || topNodes.length === 0) {
        scrollIndicator.classList.remove('visible');
        scrollIndicator.dataset.currentPath = '';
        return;
    }
    const scrollTop = scrollContainer.scrollTop;
    if (scrollTop < 10) {
        scrollIndicator.classList.remove('visible');
        scrollIndicator.dataset.currentPath = '';
        return;
    }
    const containerTop = scrollContainer.getBoundingClientRect().top;
    let currentTopFolder = null;
    for (const node of topNodes) {
        const item = node.querySelector(':scope > .folder-tree-item');
        if (!item) continue;
        const itemRect = item.getBoundingClientRect();
        const itemTop = itemRect.top - containerTop;
        if (itemTop > 0) {
            break;
        }
        const sublist = node.querySelector(':scope > .folder-tree-list');
        if (sublist && sublist.style.display !== 'none') {
            currentTopFolder = item;
        }
    }
    const indicatorText = scrollIndicator.querySelector('.folder-tree-scroll-indicator-text');
    if (!currentTopFolder) {
        scrollIndicator.classList.remove('visible');
        scrollIndicator.dataset.currentPath = '';
    } else {
        const folderName = currentTopFolder.querySelector('.folder-name');
        if (folderName) {
            indicatorText.textContent = folderName.textContent;
            scrollIndicator.classList.add('visible');
            scrollIndicator.dataset.currentPath = currentTopFolder.dataset.path || '';
        }
    }
}
function createFileListItem(item, isDirectory, isGlobalSearch = false) {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.dataset.key = item.key;
    const isLink = item.is_link === true || item.is_link === 1;
    li.dataset.itemType = isDirectory ? 'directory' : (isLink ? 'link' : 'file');
    item.isDirectory = !!isDirectory;
    item.isLink = isLink;
    if (isLink) {
        li.classList.add('link-item');
    }
    const fileType = isDirectory ? 'folder' : (isLink ? 'link' : getFileType(item.name));
    const iconClass = isLink ? getLinkIcon() : getFileIcon(item.name, isDirectory);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-checkbox';
    checkbox.dataset.key = item.key;
    checkbox.onchange = (e) => handleItemSelection(e.target, item);
    if (typeof selectedItems !== 'undefined' && selectedItems.has(item.key)) {
        checkbox.checked = true;
        li.classList.add('selected');
    }
    const fileItemDiv = document.createElement('div');
    fileItemDiv.className = 'file-item';
    let metaContent = '';
    if (isDirectory) {
        const descHtml = item.description ? `<span class="folder-desc-badge clickable-badge" title="点击查看说明"><i class="fas fa-file-alt"></i> 查看说明</span>` : '';
        metaContent = `<div class="file-meta">文件夹${descHtml ? ' • ' + descHtml : ''}</div>`;
    } else if (isLink) {
        metaContent = `<div class="file-meta"><i class="fas fa-link"></i> 外部链接 • ${formatDate(item.uploaded)} • <i class="fas fa-mouse-pointer"></i> ${item.downloads || 0}</div>`;
    } else {
        metaContent = `<div class="file-meta">${formatBytes(item.size)} • ${formatDate(item.uploaded)} • <i class="fas fa-download"></i> ${item.downloads || 0}</div>`;
    }
    fileItemDiv.innerHTML = `
        <div class="file-icon ${fileType}">
            <i class="${iconClass}"></i>
        </div>
        <div class="file-info">
            <div class="file-name">${item.name}${isLink ? ' <span class="link-badge"><i class="fas fa-external-link-alt"></i></span>' : ''}</div>
            ${isGlobalSearch && typeof item.parent_path === 'string' ? `<div class="file-path clickable">${item.parent_path || '根目录'}</div>` : ''}
            ${metaContent}
        </div>
    `;
    const fileActionsDiv = document.createElement('div');
    fileActionsDiv.className = 'file-actions';
    let previewButtonHTML = '';
    let downloadButtonHTML = '';
    if (!isDirectory && !isLink) {
        const isVideo = fileType === 'video';
        const sizeLimit = isVideo ? 300 * 1024 * 1024 : 300 * 1024 * 1024;
        const previewDisabled = item.size > sizeLimit;
        const disabledTitle = isVideo ? '视频文件超过300MB，不支持在线播放' : '文件超过300MB，不支持预览';
        if (previewDisabled) {
            previewButtonHTML = `<button class="preview-button" disabled title="${disabledTitle}">
                                   <i class="fas fa-eye-slash"></i>
                               </button>`;
        } else {
            previewButtonHTML = `<button class="preview-button" title="预览">
                                   <i class="fas fa-eye"></i>
                               </button>`;
        }
        downloadButtonHTML = `<button class="download-button" title="下载">
                <i class="fas fa-download"></i>
            </button>`;
    } else if (isLink) {
        downloadButtonHTML = `<button class="open-link-button" title="打开链接">
                <i class="fas fa-external-link-alt"></i>
            </button>`;
    }
    const shareButtonHTML = `<button class="share-button" title="生成分享链">
            <i class="fas fa-share-alt"></i>
        </button>`;
    const isFavorited = !!(item.is_favorited);
    const favoriteButtonHTML = `<button class="share-button favorite-toggle-btn${isFavorited ? ' active' : ''}" title="${isFavorited ? '取消收藏' : '收藏'}" data-favorited="${isFavorited ? 1 : 0}">
            <i class="${isFavorited ? 'fas' : 'far'} fa-star"></i>
        </button>`;
    const isSubscribed = !!(item.is_subscribed);
    const canSubscribe = isDirectory && (isSubscribed || getFolderDepth(item.key) >= 2);
    const subscribeButtonHTML = canSubscribe ? `<button class="share-button subscribe-toggle-btn${isSubscribed ? ' active' : ''}" title="${isSubscribed ? '取消订阅' : '订阅文件夹更新'}" data-subscribed="${isSubscribed ? 1 : 0}">
            <i class="${isSubscribed ? 'fas' : 'far'} fa-bell"></i>
        </button>` : '';
    const isAdmin = typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
    let reactionButtonsHTML = '';
    if (!isDirectory) {
        const likeCount = item.likes || 0;
        const isLiked = !!(item.is_liked);
        const boostCount = item.boost_count || 0;
        reactionButtonsHTML = `
            <div class="reaction-group">
                <button class="reaction-btn like-btn${isLiked ? ' active' : ''}" title="点赞" data-count="${likeCount}">
                    <i class="fas fa-thumbs-up reaction-icon"></i>
                    ${likeCount > 0 ? `<span class="reaction-count">${likeCount}</span>` : ''}
                </button>
                <button class="reaction-btn boost-btn" title="评论" data-count="${boostCount}">
                    <i class="fas fa-comment-dots reaction-icon"></i>
                    ${boostCount > 0 ? `<span class="reaction-count">${boostCount}</span>` : ''}
                </button>
            </div>
        `;
    }
    fileActionsDiv.innerHTML = `
        ${!isDirectory ? reactionButtonsHTML : ''}
        <div class="file-action-buttons">
            ${isDirectory ? `
                <button class="enter-folder-button" title="进入文件夹">
                    <i class="fas fa-folder-open"></i>
                </button>
            ` : `
                ${previewButtonHTML}
                ${downloadButtonHTML}
            `}
            ${shareButtonHTML}
            ${favoriteButtonHTML}
            ${subscribeButtonHTML}
            ${isAdmin ? `
            ${isLink ? `
            <button class="edit-link-button" title="编辑链接地址">
              <i class="fas fa-link"></i>
            </button>
            ` : ''}
            ${isDirectory ? `
            <button class="edit-desc-button" title="编辑描述">
              <i class="fas fa-quote-left"></i>
            </button>
            ` : ''}
            <button class="rename-button" title="重命名">
              <i class="fas fa-pencil-alt"></i>
            </button>
            <button class="move-button" title="移动到...">
               <i class="fas fa-folder-tree"></i>
            </button>
            <button class="delete-button" title="删除">
                <i class="fas fa-trash"></i>
            </button>
            ` : ''}
        </div>
    `;
    li.appendChild(checkbox);
    li.appendChild(fileItemDiv);
    li.appendChild(fileActionsDiv);
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const descBadge = fileItemDiv.querySelector('.folder-desc-badge.clickable-badge');
    if (descBadge) {
        descBadge.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                let parsedContent = '';
                if (typeof renderMarkdown === 'function') {
                    parsedContent = await renderMarkdown(item.description);
                } else {
                    parsedContent = `<div style="white-space: pre-wrap;">${escapeHtml(item.description)}</div>`;
                }
                showConfirmation({
                    title: `<i class="fas fa-info-circle"></i> ${item.name} - 说明`,
                    message: `<div class="markdown-body" style="text-align: left; font-size: 0.95rem; max-height: 50vh; overflow-y: auto; padding: 15px; background: var(--background-alt); border-radius: 8px; border: 1px solid var(--border-color); user-select: text;">${parsedContent}</div>`,
                    confirmText: '关闭',
                    cancelText: null
                });
            } catch (err) {
                console.error('Markdown rendering error:', err);
                showConfirmation({
                    title: `<i class="fas fa-info-circle"></i> ${item.name} - 说明`,
                    message: `<div style="text-align: left; white-space: pre-wrap; font-size: 0.95rem; max-height: 50vh; overflow-y: auto; padding: 15px; background: var(--background-alt); border-radius: 8px; border: 1px solid var(--border-color); user-select: text;">${escapeHtml(item.description)}</div>`,
                    confirmText: '关闭',
                    cancelText: null
                });
            }
        });
    }
    if (isTouchDevice) {
        const mobileToggle = document.createElement('button');
        mobileToggle.className = 'mobile-actions-toggle';
        mobileToggle.title = '更多操作';
        mobileToggle.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const allVisibleItems = document.querySelectorAll('.file-list-item.actions-visible');
            allVisibleItems.forEach(item => {
                if (item !== li) item.classList.remove('actions-visible');
            });
            li.classList.toggle('actions-visible');
        });
        li.appendChild(mobileToggle);
    }
    const pathElement = li.querySelector('.file-path.clickable');
    if (pathElement) {
        pathElement.addEventListener('click', (e) => {
            e.stopPropagation();
            if (searchInput) searchInput.value = '';
            fetchAndDisplayFiles(item.parent_path);
        });
    }
    if (!isDirectory && !isLink) {
        const previewBtn = fileActionsDiv.querySelector('.preview-button');
        if (previewBtn && !previewBtn.disabled) {
            previewBtn.onclick = (e) => {
                e.stopPropagation();
                previewFile(item.key, item.name, item.size);
            };
        }
        const downloadBtn = fileActionsDiv.querySelector('.download-button');
        if (downloadBtn) {
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                downloadFile(item.key, downloadBtn);
            };
        }
    }
    if (!isDirectory) {
        const likeBtn = fileActionsDiv.querySelector('.like-btn');
        if (likeBtn) {
            const updateCount = (likes) => {
                updateReactionCount(likeBtn, likes);
            };
            likeBtn.onclick = async (e) => {
                e.stopPropagation();
                const wasActive = likeBtn.classList.contains('active');
                const prevLikes = item.likes || 0;
                const optimisticLikes = wasActive ? prevLikes - 1 : prevLikes + 1;
                item.is_liked = wasActive ? 0 : 1;
                item.likes = optimisticLikes;
                updateCount(optimisticLikes);
                likeBtn.classList.toggle('active', !wasActive);
                const result = await toggleReaction(item.key, likeBtn);
                if (result) {
                    item.likes = result.likes;
                    item.is_liked = result.isLiked ? 1 : 0;
                    updateCount(result.likes);
                    likeBtn.classList.toggle('active', !!result.isLiked);
                } else {
                    item.likes = prevLikes;
                    item.is_liked = wasActive ? 1 : 0;
                    updateCount(prevLikes);
                    likeBtn.classList.toggle('active', wasActive);
                }
            };
        }
        const boostBtn = fileActionsDiv.querySelector('.boost-btn');
        if (boostBtn) {
            boostBtn.onclick = (e) => {
                e.stopPropagation();
                toggleBoostPanel(li, item, boostBtn);
            };
        }
    }
    const shareBtn = fileActionsDiv.querySelector('.share-button');
    if (shareBtn) {
        shareBtn.onclick = (e) => {
            e.stopPropagation();
            shareFile(item);
        };
    }
    const favBtn = fileActionsDiv.querySelector('.favorite-toggle-btn');
    if (favBtn) {
        favBtn.onclick = async (e) => {
            e.stopPropagation();
            const wasActive = !!(item.is_favorited);
            const newState = !wasActive;
            const setFavUI = (favorited) => {
                item.is_favorited = favorited ? 1 : 0;
                favBtn.classList.toggle('active', favorited);
                favBtn.title = favorited ? '取消收藏' : '收藏';
                const icon = favBtn.querySelector('i');
                if (icon) icon.className = favorited ? 'fas fa-star' : 'far fa-star';
            };
            setFavUI(newState);
            const result = await toggleFavorite(item.key, favBtn);
            if (result && result.success !== false) {
                setFavUI(!!result.isFavorited);
                if (result.isFavorited) showNotification('已加入收藏', 'success', 1500);
                if (typeof directoryCache !== 'undefined') {
                    const favState = result.isFavorited ? 1 : 0;
                    for (const p in directoryCache) {
                        const entry = directoryCache[p];
                        if (!entry || !entry.data) continue;
                        const updateArr = (arr) => {
                            if (!arr) return;
                            for (const f of arr) {
                                if (f && f.key === item.key) f.is_favorited = favState;
                            }
                        };
                        updateArr(entry.data.directories);
                        updateArr(entry.data.files);
                    }
                }
            } else {
                setFavUI(wasActive);
            }
        };
    }
    const subBtn = fileActionsDiv.querySelector('.subscribe-toggle-btn');
    if (subBtn) {
        subBtn.onclick = async (e) => {
            e.stopPropagation();
            const wasActive = !!(item.is_subscribed);
            const newState = !wasActive;
            const setSubUI = (subscribed) => {
                item.is_subscribed = subscribed ? 1 : 0;
                subBtn.classList.toggle('active', subscribed);
                subBtn.title = subscribed ? '取消订阅' : '订阅文件夹更新';
                const icon = subBtn.querySelector('i');
                if (icon) icon.className = subscribed ? 'fas fa-bell' : 'far fa-bell';
            };
            setSubUI(newState);
            const result = await toggleSubscribe(item.key, subBtn);
            if (result && result.success !== false) {
                setSubUI(!!result.isSubscribed);
                if (result.isSubscribed) showNotification('已订阅，该文件夹有新文件时会通知你', 'success', 2000);
                if (typeof directoryCache !== 'undefined') {
                    const subState = result.isSubscribed ? 1 : 0;
                    for (const p in directoryCache) {
                        const entry = directoryCache[p];
                        if (!entry || !entry.data) continue;
                        const updateArr = (arr) => {
                            if (!arr) return;
                            for (const f of arr) {
                                if (f && f.key === item.key) f.is_subscribed = subState;
                            }
                        };
                        updateArr(entry.data.directories);
                        updateArr(entry.data.files);
                    }
                }
            } else {
                setSubUI(wasActive);
            }
        };
    }
    if (highlightKey && item.key === highlightKey) {
        li.classList.add('highlighted-item');
        setTimeout(() => {
            li.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        setTimeout(() => {
            li.classList.remove('highlighted-item');
        }, 3000);
        highlightKey = null;
    }
    if (isLink) {
        const openLinkBtn = fileActionsDiv.querySelector('.open-link-button');
        if (openLinkBtn) {
            openLinkBtn.onclick = (e) => {
                e.stopPropagation();
                openLink(item.key, item.link_url, openLinkBtn);
            };
        }
        fileItemDiv.style.cursor = 'pointer';
        fileItemDiv.onclick = (e) => {
            if (!isSelectionMode) {
                openLink(item.key, item.link_url);
            }
        };
    }
    const deleteBtn = fileActionsDiv.querySelector('.delete-button');
    if (deleteBtn) {
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteFile(item.key, isDirectory);
        };
    }
    const renameBtn = fileActionsDiv.querySelector('.rename-button');
    if (renameBtn) {
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            renameFile(item.key, item.name, isDirectory);
        };
    }
    const editDescBtn = fileActionsDiv.querySelector('.edit-desc-button');
    if (editDescBtn) {
        editDescBtn.onclick = (e) => {
            e.stopPropagation();
            editDescription(item.key, item.name, item.description);
        };
    }
    const moveBtn = fileActionsDiv.querySelector('.move-button');
    if (moveBtn) {
        moveBtn.onclick = (e) => {
            e.stopPropagation();
            moveItem(item.key, item.name, isDirectory);
        };
    }
    const editLinkBtn = fileActionsDiv.querySelector('.edit-link-button');
    if (editLinkBtn) {
        editLinkBtn.onclick = (e) => {
            e.stopPropagation();
            editLinkUrl(item.key, item.link_url);
        };
    }
    const enterFolderBtn = fileActionsDiv.querySelector('.enter-folder-button');
    if (enterFolderBtn) {
        enterFolderBtn.onclick = (e) => {
            e.stopPropagation();
            if (searchInput) searchInput.value = '';
            fetchAndDisplayFiles(item.key);
        };
    }
    if (isDirectory) {
        fileItemDiv.style.cursor = 'pointer';
        fileItemDiv.onclick = (e) => {
            if (!isSelectionMode) {
                if (searchInput) searchInput.value = '';
                fetchAndDisplayFiles(item.key);
            }
        };
    }
    li.onclick = (e) => {
        if (isSelectionMode && e.target.type !== 'checkbox') {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    };
    return li;
}
function renderFileList(prefix, data, isGlobalSearch = false, localSearchTerm = '', paginationData = null, isAISearch = false, currentFolder = null) {
    fileListElement.innerHTML = '';
    const lowerLocalSearchTerm = localSearchTerm.trim().toLowerCase();
    if (isGlobalSearch) {
        isShowingSearchResults = true;
        updateBreadcrumb('', true, localSearchTerm, isAISearch);
    } else {
        isShowingSearchResults = false;
        updateBreadcrumb(prefix);
        if (currentFolder && currentFolder.description) {
            const descLi = document.createElement('li');
            descLi.className = 'folder-description-card';
            let parsedContent = '';
            if (typeof renderMarkdown === 'function') {
                parsedContent = `<div class="loading-spinner"></div>`;
                renderMarkdown(currentFolder.description).then(html => {
                    const body = descLi.querySelector('.folder-desc-body');
                    if (body) body.innerHTML = html;
                });
            } else {
                parsedContent = `<div style="white-space: pre-wrap;">${escapeHtml(currentFolder.description)}</div>`;
            }
            descLi.innerHTML = `
                <div class="folder-desc-header">
                    <i class="fas fa-info-circle"></i> 说明
                </div>
                <div class="markdown-body folder-desc-body">
                    ${parsedContent}
                </div>
            `;
            fileListElement.appendChild(descLi);
        }
        if (prefix !== '') {
            const parentPrefix = getParentPath(prefix);
            const backLi = document.createElement('li');
            backLi.className = 'file-list-item back-item';
            backLi.innerHTML = `
                <div class="file-item">
                    <div class="file-icon back-folder">
                        <i class="fas fa-arrow-left"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">返回上一级</div>
                        <div class="file-meta">上级目录</div>
                    </div>
                </div>
            `;
            backLi.style.cursor = 'pointer';
            backLi.onclick = (e) => {
                e.preventDefault();
                if (searchInput) searchInput.value = '';
                fetchAndDisplayFiles(parentPrefix);
            };
            fileListElement.appendChild(backLi);
        }
    }
    let displayedDirectories = [];
    if (data.directories && data.directories.length > 0) {
        let filteredDirectories = data.directories;
        if (!isGlobalSearch && lowerLocalSearchTerm) {
            filteredDirectories = filteredDirectories.filter(dir =>
                dir.name.toLowerCase().includes(lowerLocalSearchTerm)
            );
        }
        if (currentFilter !== 'all' && currentFilter !== 'folder') {
            filteredDirectories = [];
        }
        displayedDirectories = filteredDirectories;
        const dirFragment = document.createDocumentFragment();
        displayedDirectories.forEach((dir, index) => {
            const li = createFileListItem(dir, true, isGlobalSearch);
            dirFragment.appendChild(li);
        });
        fileListElement.appendChild(dirFragment);
    }
    let displayedFiles = [];
    if (data.files && data.files.length > 0) {
        let filteredFiles = data.files;
        if (!isGlobalSearch && lowerLocalSearchTerm) {
            filteredFiles = filteredFiles.filter(file =>
                file.name.toLowerCase().includes(lowerLocalSearchTerm)
            );
        }
        if (currentFilter !== 'all') {
            if (currentFilter === 'folder') {
                filteredFiles = [];
            } else {
                filteredFiles = filteredFiles.filter(file => {
                    if (file.isDirectory) return true;
                    if (currentFilter === 'link') {
                        return file.is_link === 1 || file.is_link === true;
                    }
                    const fileType = getFileType(file.name);
                    return fileType === currentFilter;
                });
            }
        }
        displayedFiles = filteredFiles;
        const fileFragment = document.createDocumentFragment();
        displayedFiles.forEach((file, index) => {
            if (!file.isDirectoryPlaceholder) {
                const li = createFileListItem(file, !!file.isDirectory, isGlobalSearch);
                fileFragment.appendChild(li);
            }
        });
        fileListElement.appendChild(fileFragment);
    }
    const hasDisplayedContent = displayedDirectories.length > 0 || displayedFiles.length > 0;
    if (!hasDisplayedContent) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-state';
        let emptyMessage = '';
        if (isGlobalSearch) {
            emptyMessage = `<i class="fas fa-search u-font-large-icon"></i>
        找不到包含 "${localSearchTerm}" 的文件或文件夹`;
        } else if (lowerLocalSearchTerm) {
            emptyMessage = `<i class="fas fa-folder-open u-font-large-icon"></i>
        在当前目录中找不到包含 "${localSearchTerm}" 的文件或文件夹`;
        } else {
            emptyMessage = `<i class="fas fa-folder-open u-font-large-icon"></i>
        此目录为空`;
        }
        emptyLi.innerHTML = emptyMessage;
        fileListElement.appendChild(emptyLi);
    }
    renderPaginationControls(paginationData);
}
function scrollToBreadcrumb() {
    const breadcrumbNav = document.getElementById('breadcrumb-nav');
    if (breadcrumbNav) {
        const headerOffset = 80;
        const elementPosition = breadcrumbNav.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
}
function renderPaginationControls(paginationData) {
    let controlsContainer = document.getElementById('pagination-controls');
    if (!controlsContainer) {
        if (!fileListElement) {
            return;
        }
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'pagination-controls';
        controlsContainer.className = 'pagination-controls';
        if (fileListElement.parentNode) {
            fileListElement.parentNode.insertBefore(controlsContainer, fileListElement.nextSibling);
        } else {
            document.body.appendChild(controlsContainer);
        }
    }
    controlsContainer.innerHTML = '';
    if (!paginationData || paginationData.totalPages <= 1) {
        controlsContainer.style.display = 'none';
        return;
    }
    controlsContainer.style.display = 'flex';
    const { currentPage: page, totalPages, totalItems } = paginationData;
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> <span class="pagination-btn-text">上一页</span>';
    prevButton.className = 'pagination-button';
    prevButton.disabled = page <= 1;
    prevButton.onclick = () => {
        if (page > 1) {
            if (currentRawData) {
                currentPage = page - 1;
                scrollToBreadcrumb();
                applyLocalSortAndFilter();
            } else {
                fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', page - 1);
            }
        }
    };
    controlsContainer.appendChild(prevButton);
    const pageInfoContainer = document.createElement('div');
    pageInfoContainer.className = 'pagination-info-container';
    pageInfoContainer.style.display = 'flex';
    pageInfoContainer.style.alignItems = 'center';
    const pageInput = document.createElement('input');
    pageInput.type = 'number';
    pageInput.min = 1;
    pageInput.max = totalPages;
    pageInput.value = page;
    pageInput.className = 'pagination-jump-input';
    pageInput.title = '输入页码跳转';
    pageInput.onchange = () => {
        let val = parseInt(pageInput.value);
        if (isNaN(val)) val = 1;
        if (val < 1) val = 1;
        if (val > totalPages) val = totalPages;
        if (val !== page) {
            if (currentRawData) {
                currentPage = val;
                scrollToBreadcrumb();
                applyLocalSortAndFilter();
            } else {
                fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', val);
            }
        } else {
            pageInput.value = page;
        }
    };
    pageInput.onkeydown = (e) => {
        if (e.key === 'Enter') pageInput.blur();
    };
    const totalPageSpan = document.createElement('span');
    totalPageSpan.textContent = ` / ${totalPages} 页(共 ${totalItems} 项)`;
    pageInfoContainer.appendChild(document.createTextNode('第 '));
    pageInfoContainer.appendChild(pageInput);
    pageInfoContainer.appendChild(totalPageSpan);
    controlsContainer.appendChild(pageInfoContainer);
    const nextButton = document.createElement('button');
    nextButton.innerHTML = '<span class="pagination-btn-text">下一页</span> <i class="fas fa-chevron-right"></i>';
    nextButton.className = 'pagination-button';
    nextButton.disabled = page >= totalPages;
    nextButton.onclick = () => {
        if (page < totalPages) {
            if (currentRawData) {
                currentPage = page + 1;
                scrollToBreadcrumb();
                applyLocalSortAndFilter();
            } else {
                fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', page + 1);
            }
        }
    };
    controlsContainer.appendChild(nextButton);
}
function toggleBoostPanel(li, item, boostBtn) {
    const closeExisting = () => {
        document.querySelectorAll('.boost-panel').forEach(p => {
            if (p.classList.contains('closing')) return;
            p.classList.add('closing');
            const parentLi = p.closest('.file-list-item');
            if (parentLi) {
                const btn = parentLi.querySelector('.boost-btn');
                if (btn) btn.classList.remove('active');
            }
            setTimeout(() => p.remove(), 250);
        });
    };
    const existingPanel = li.querySelector('.boost-panel');
    if (existingPanel && !existingPanel.classList.contains('closing')) {
        existingPanel.classList.add('closing');
        boostBtn.classList.remove('active');
        setTimeout(() => existingPanel.remove(), 250);
        return;
    }
    closeExisting();
    if (li.classList.contains('actions-visible')) {
        li.classList.remove('actions-visible');
    }
    boostBtn.classList.add('active');
    const panel = document.createElement('div');
    panel.className = 'boost-panel';
    panel.innerHTML = `
        <div class="boost-panel-header">
            <span class="boost-panel-title"><i class="fas fa-comment-dots"></i> 评论</span>
            <span class="boost-panel-count"></span>
            <button class="boost-panel-close" title="关闭评论"><i class="fas fa-times"></i></button>
        </div>
        <div class="boost-list"><div class="boost-load-more"><i class="fas fa-chevron-up"></i> 加载更早的评论</div><div class="boost-loading">加载中...</div></div>
        <div class="boost-input-area">
            <input type="text" class="boost-input" placeholder="说点什么..." maxlength="200" />
            <span class="boost-char-count">0/200</span>
            <button class="boost-send-btn" title="发送"><i class="fas fa-paper-plane"></i></button>
        </div>
    `;
    panel._boostBtn = boostBtn;
    li.appendChild(panel);
    panel.onclick = (e) => e.stopPropagation();
    const boostLoadMore = panel.querySelector('.boost-load-more');
    const boostList = panel.querySelector('.boost-list');
    const boostInput = panel.querySelector('.boost-input');
    const boostSendBtn = panel.querySelector('.boost-send-btn');
    const charCount = panel.querySelector('.boost-char-count');
    const panelCount = panel.querySelector('.boost-panel-count');
    let boostsCursor = null;
    let boostsHasMore = false;
    const updatePanelCount = (total) => {
        if (panelCount) panelCount.textContent = total > 0 ? `${total}条` : '';
    };
    const updateCharCount = () => {
        if (charCount) {
            const len = boostInput.value.length;
            charCount.textContent = `${len}/200`;
            charCount.classList.toggle('near-limit', len > 180);
        }
    };
    boostInput.oninput = updateCharCount;
    const loadBoosts = async (append = false) => {
        try {
            const result = await fetchBoosts(item.key, 20, append ? boostsCursor : null);
            if (result && result.success) {
                if (append) {
                    renderBoostListAppend(boostList, result.boosts, item, boostLoadMore);
                } else {
                    renderBoostList(boostList, result.boosts, item, boostLoadMore);
                }
                boostsCursor = result.nextCursor;
                boostsHasMore = result.hasMore;
                boostLoadMore.classList.toggle('visible', boostsHasMore);
                updatePanelCount(item.boost_count || result.boosts.length);
            } else {
                if (!append) boostList.innerHTML = '<div class="boost-empty">暂无评论，来说点什么吧</div>';
            }
        } catch (e) {
            if (!append) boostList.innerHTML = '<div class="boost-empty">加载失败</div>';
        }
    };
    const sendBoost = async () => {
        const content = boostInput.value.trim();
        if (!content) return;
        boostSendBtn.disabled = true;
        try {
            const result = await sendBoostAction(item.key, content);
            if (result && result.success) {
                boostInput.value = '';
                updateCharCount();
                item.boost_count = result.boost_count;
                updateReactionCount(boostBtn, result.boost_count);
                const newBoost = document.createElement('div');
                newBoost.className = 'boost-bubble boost-self';
                const nickname = result.boost.nickname || '我';
                newBoost.innerHTML = `
                    <div class="boost-bubble-header">
                        <span class="boost-nickname" title="${escapeHtml(nickname)}">${escapeHtml(nickname)}</span>
                        <span class="boost-time">刚刚</span>
                        <button class="boost-delete-btn" title="删除" data-id="${result.boost.id}"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="boost-bubble-content">${escapeHtml(content)}</div>
                `;
                const emptyMsg = boostList.querySelector('.boost-empty');
                if (emptyMsg) emptyMsg.remove();
                boostList.appendChild(newBoost);
                newBoost.querySelector('.boost-delete-btn').onclick = async (e) => {
                    e.stopPropagation();
                    await handleDeleteBoost(e, newBoost, item, boostBtn);
                };
                boostList.scrollTop = boostList.scrollHeight;
                updatePanelCount(item.boost_count);
            } else {
                showNotification(result?.error || '发送失败', 'error');
            }
        } catch (e) {
            showNotification('发送失败', 'error');
        } finally {
            boostSendBtn.disabled = false;
        }
    };
    boostSendBtn.onclick = (e) => { e.stopPropagation(); sendBoost(); };
    boostInput.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBoost(); }
    };
    boostInput.onclick = (e) => e.stopPropagation();
    const closeBtn = panel.querySelector('.boost-panel-close');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            panel.classList.add('closing');
            boostBtn.classList.remove('active');
            setTimeout(() => {
                if (panel.parentNode) panel.remove();
            }, 250);
        };
    }
    boostLoadMore.onclick = async (e) => {
        e.stopPropagation();
        if (boostLoadMore.classList.contains('loading')) return;
        boostLoadMore.classList.add('loading');
        boostLoadMore.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
        await loadBoosts(true);
        boostLoadMore.classList.remove('loading');
        boostLoadMore.innerHTML = '<i class="fas fa-chevron-up"></i> 加载更早的评论';
    };
    loadBoosts();
}
function createBoostBubblesHTML(boosts, currentUserId, isAdminUser) {
    const sorted = [...boosts].reverse();
    return sorted.map(b => {
        const isSelf = currentUserId && b.user_id === currentUserId;
        const bubbleClass = isSelf ? 'boost-bubble boost-self' : 'boost-bubble boost-other';
        const nickname = b.nickname || '匿名用户';
        const timeStr = formatBoostTime(b.created_at);
        const deleteBtn = (isSelf || isAdminUser) ? `<button class="boost-delete-btn" title="删除" data-id="${b.id}"><i class="fas fa-times"></i></button>` : '';
        return `
            <div class="${bubbleClass}" data-boost-id="${b.id}">
                <div class="boost-bubble-header">
                    <span class="boost-nickname" title="${escapeHtml(nickname)}">${escapeHtml(nickname)}</span>
                    <span class="boost-time">${timeStr}</span>
                    ${deleteBtn}
                </div>
                <div class="boost-bubble-content">${escapeHtml(b.content)}</div>
            </div>
        `;
    }).join('');
}
function bindBoostDeleteButtons(container, item) {
    container.querySelectorAll('.boost-delete-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const bubble = btn.closest('.boost-bubble');
            await handleDeleteBoost(e, bubble, item, null);
        };
    });
}
function renderBoostList(container, boosts, item, loadMoreEl) {
    if (!boosts || boosts.length === 0) {
        container.innerHTML = '<div class="boost-empty">暂无评论，来说点什么吧</div>';
        if (loadMoreEl) container.insertBefore(loadMoreEl, container.firstChild);
        return;
    }
    const currentUserId = typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
    const isAdminUser = typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
    container.innerHTML = createBoostBubblesHTML(boosts, currentUserId, isAdminUser);
    if (loadMoreEl) container.insertBefore(loadMoreEl, container.firstChild);
    container.scrollTop = container.scrollHeight;
    bindBoostDeleteButtons(container, item);
}
function renderBoostListAppend(container, boosts, item, loadMoreEl) {
    const emptyMsg = container.querySelector('.boost-empty');
    if (emptyMsg) emptyMsg.remove();
    const currentUserId = typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
    const isAdminUser = typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
    const prevScrollHeight = container.scrollHeight;
    const sorted = [...boosts].reverse();
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sorted.map(b => {
        const isSelf = currentUserId && b.user_id === currentUserId;
        const bubbleClass = isSelf ? 'boost-bubble boost-self' : 'boost-bubble boost-other';
        const nickname = b.nickname || '匿名用户';
        const timeStr = formatBoostTime(b.created_at);
        const deleteBtn = (isSelf || isAdminUser) ? `<button class="boost-delete-btn" title="删除" data-id="${b.id}"><i class="fas fa-times"></i></button>` : '';
        return `
            <div class="${bubbleClass}" data-boost-id="${b.id}">
                <div class="boost-bubble-header">
                    <span class="boost-nickname" title="${escapeHtml(nickname)}">${escapeHtml(nickname)}</span>
                    <span class="boost-time">${timeStr}</span>
                    ${deleteBtn}
                </div>
                <div class="boost-bubble-content">${escapeHtml(b.content)}</div>
            </div>
        `;
    }).join('');
    while (tempDiv.firstChild) fragment.appendChild(tempDiv.firstChild);
    if (loadMoreEl && loadMoreEl.parentNode === container) {
        container.insertBefore(fragment, loadMoreEl);
    } else {
        container.insertBefore(fragment, container.firstChild);
    }
    container.scrollTop += container.scrollHeight - prevScrollHeight;
    bindBoostDeleteButtons(container, item);
}
async function handleDeleteBoost(e, bubbleEl, item, boostBtn) {
    const boostId = parseInt(bubbleEl.querySelector('.boost-delete-btn')?.dataset?.id || bubbleEl.dataset?.boostId);
    if (!boostId) return;
    try {
        const result = await deleteBoostAction(boostId);
        if (result && result.success) {
            const li = bubbleEl.closest('.file-list-item');
            const panel = bubbleEl.closest('.boost-panel');
            bubbleEl.remove();
            if (item) item.boost_count = result.boost_count;
            const btn = boostBtn || (panel?._boostBtn) || (li ? li.querySelector('.boost-btn') : null);
            if (btn) {
                updateReactionCount(btn, result.boost_count);
            }
            const panelCount = panel?.querySelector('.boost-panel-count') || (li ? li.querySelector('.boost-panel-count') : null);
            if (panelCount) panelCount.textContent = result.boost_count > 0 ? `${result.boost_count}条` : '';
            const list = panel?.querySelector('.boost-list') || (li ? li.querySelector('.boost-list') : null);
            if (list && list.children.length === 0) {
                list.innerHTML = '<div class="boost-empty">暂无评论，来说点什么吧</div>';
            }
        } else {
            showNotification(result?.error || '删除失败', 'error');
        }
    } catch (e) {
        showNotification('删除失败', 'error');
    }
}
function formatBoostTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay}天前`;
    return date.toLocaleDateString('zh-CN');
}
