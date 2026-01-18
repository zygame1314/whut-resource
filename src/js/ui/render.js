function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function createParticleBackground() {
    const particlesContainer = document.getElementById('particles-background');
    if (!particlesContainer) return;
    const existingParticles = particlesContainer.querySelectorAll('.particle');
    existingParticles.forEach(p => p.remove());
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle-base';
        particle.style.cssText = `
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(46, 139, 87, ${Math.random() * 0.5 + 0.1});
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 10 + 10}s linear infinite;
        `;
        particlesContainer.appendChild(particle);
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
        const parts = prefix.endsWith('/') ? prefix.slice(0, -1).split('/') : prefix.split('/');
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
function buildTree(paths) {
    const tree = {};
    paths.forEach(path => {
        let currentLevel = tree;
        const parts = path.split('/').filter(p => p);
        parts.forEach(part => {
            if (!currentLevel[part]) {
                currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
        });
    });
    return tree;
}
function renderFolderTree(tree, container) {
    container.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'folder-tree-list';
    Object.keys(tree).sort().forEach(key => {
        const node = tree[key];
        const li = renderFolderNode(key, node, '');
        ul.appendChild(li);
    });
    container.appendChild(ul);
}
function renderFolderNode(name, node, currentPath) {
    const li = document.createElement('li');
    li.className = 'folder-tree-node';
    const fullPath = currentPath ? `${currentPath}${name}/` : `${name}/`;
    const hasChildren = Object.keys(node).length > 0;
    const nodeContent = document.createElement('div');
    nodeContent.className = 'folder-tree-item';
    nodeContent.innerHTML = `
        <span class="folder-item-main">
            <i class="fas fa-chevron-right folder-toggle-icon ${hasChildren ? '' : 'hidden'}"></i>
            <i class="fas fa-folder folder-icon"></i>
            <span class="folder-name" title="${name}">${name}</span>
        </span>
        <button class="go-to-folder-btn" title="进入文件夹">
            <i class="fas fa-arrow-right"></i>
        </button>
    `;
    nodeContent.addEventListener('click', () => {
        if (hasChildren) {
            const sublist = li.querySelector('.folder-tree-list');
            if (sublist) {
                sublist.style.display = sublist.style.display === 'none' ? 'block' : 'none';
                li.querySelector('.folder-toggle-icon').classList.toggle('expanded');
            }
        }
    });
    const goToBtn = nodeContent.querySelector('.go-to-folder-btn');
    goToBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchAndDisplayFiles(fullPath);
        document.querySelectorAll('.folder-tree-item.active').forEach(item => item.classList.remove('active'));
        nodeContent.classList.add('active');
    });
    li.appendChild(nodeContent);
    if (hasChildren) {
        const sublist = document.createElement('ul');
        sublist.className = 'folder-tree-list';
        sublist.style.display = 'none';
        Object.keys(node).sort().forEach(key => {
            const childNode = renderFolderNode(key, node[key], fullPath);
            sublist.appendChild(childNode);
        });
        li.appendChild(sublist);
    }
    return li;
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
    const fileItemDiv = document.createElement('div');
    fileItemDiv.className = 'file-item';
    let metaContent = '';
    if (isDirectory) {
        metaContent = '<div class="file-meta">文件夹</div>';
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
    const isAdmin = typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
    let reactionButtonsHTML = '';
    if (!isDirectory) {
        reactionButtonsHTML = `
            <button class="reaction-btn like-btn" title="有用">
                👍
            </button>
            <button class="reaction-btn dislike-btn" title="无用">
                👎
            </button>
        `;
    }
    fileActionsDiv.innerHTML = `
        ${isDirectory ? `
            <button class="enter-folder-button" title="进入文件夹">
                <i class="fas fa-folder-open"></i>
            </button>
        ` : `
            ${reactionButtonsHTML}
            ${previewButtonHTML}
            ${downloadButtonHTML}
        `}
        ${shareButtonHTML}
        ${isAdmin ? `
        ${isLink ? `
        <button class="edit-link-button" title="编辑链接地址">
          <i class="fas fa-link"></i>
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
    `;
    li.appendChild(checkbox);
    li.appendChild(fileItemDiv);
    li.appendChild(fileActionsDiv);
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
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
            previewBtn.onclick = () => previewFile(item.key, item.name, item.size);
        }
        const downloadBtn = fileActionsDiv.querySelector('.download-button');
        if (downloadBtn) {
            downloadBtn.onclick = () => downloadFile(item.key, downloadBtn);
        }
    }
    if (!isDirectory) {
        const likeBtn = fileActionsDiv.querySelector('.like-btn');
        const dislikeBtn = fileActionsDiv.querySelector('.dislike-btn');
        if (likeBtn && dislikeBtn) {
            if (item.user_reaction === 'like') likeBtn.classList.add('active');
            if (item.user_reaction === 'dislike') dislikeBtn.classList.add('active');
            likeBtn.onclick = async (e) => {
                e.stopPropagation();
                const result = await toggleReaction(item.key, 'like', likeBtn);
                if (result) {
                    if (result.userReaction === 'like') {
                        likeBtn.classList.add('active');
                        dislikeBtn.classList.remove('active');
                    } else {
                        likeBtn.classList.remove('active');
                    }
                }
            };
            dislikeBtn.onclick = async (e) => {
                e.stopPropagation();
                const result = await toggleReaction(item.key, 'dislike', dislikeBtn);
                if (result) {
                    if (result.userReaction === 'dislike') {
                        dislikeBtn.classList.add('active');
                        likeBtn.classList.remove('active');
                    } else {
                        dislikeBtn.classList.remove('active');
                    }
                }
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
        deleteBtn.onclick = () => deleteFile(item.key, isDirectory);
    }
    const renameBtn = fileActionsDiv.querySelector('.rename-button');
    if (renameBtn) {
        renameBtn.onclick = () => renameFile(item.key, item.name, isDirectory);
    }
    const moveBtn = fileActionsDiv.querySelector('.move-button');
    if (moveBtn) {
        moveBtn.onclick = () => moveItem(item.key, item.name, isDirectory);
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
function renderFileList(prefix, data, isGlobalSearch = false, localSearchTerm = '', paginationData = null, isAISearch = false) {
    fileListElement.innerHTML = '';
    const lowerLocalSearchTerm = localSearchTerm.trim().toLowerCase();
    if (isGlobalSearch) {
        isShowingSearchResults = true;
        updateBreadcrumb('', true, localSearchTerm, isAISearch);
    } else {
        isShowingSearchResults = false;
        updateBreadcrumb(prefix);
        if (prefix !== '') {
            let lastSlashIndex = prefix.endsWith('/') ? prefix.lastIndexOf('/', prefix.length - 2) : prefix.lastIndexOf('/');
            const parentPrefix = lastSlashIndex >= 0 ? prefix.substring(0, lastSlashIndex + 1) : '';
            const backLi = document.createElement('li');
            backLi.className = 'file-list-item back-item';
            backLi.innerHTML = `
        < div class="file-item" >
                    <div class="file-icon folder">
                        <i class="fas fa-arrow-left"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">返回上一级</div>
                        <div class="file-meta">上级目录</div>
                    </div>
                </div >
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
            emptyMessage = `< i class="fas fa-search u-font-large-icon" ></i >
        找不到包含 "${localSearchTerm}" 的文件或文件夹`;
        } else if (lowerLocalSearchTerm) {
            emptyMessage = `< i class="fas fa-folder-open u-font-large-icon" ></i >
        在当前目录中找不到包含 "${localSearchTerm}" 的文件或文件夹`;
        } else {
            emptyMessage = `< i class="fas fa-folder-open u-font-large-icon" ></i >
        此目录为空`;
        }
        emptyLi.innerHTML = emptyMessage;
        fileListElement.appendChild(emptyLi);
    }
    renderPaginationControls(paginationData);
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
    const { currentPage, totalPages, totalItems } = paginationData;
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> 上一页';
    prevButton.className = 'pagination-button';
    prevButton.disabled = currentPage <= 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage - 1);
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
    pageInput.value = currentPage;
    pageInput.className = 'pagination-jump-input';
    pageInput.title = '输入页码跳转';
    pageInput.onchange = () => {
        let val = parseInt(pageInput.value);
        if (isNaN(val)) val = 1;
        if (val < 1) val = 1;
        if (val > totalPages) val = totalPages;
        if (val !== currentPage) {
            fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', val);
        } else {
            pageInput.value = currentPage;
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
    nextButton.innerHTML = '下一页 <i class="fas fa-chevron-right"></i>';
    nextButton.className = 'pagination-button';
    nextButton.disabled = currentPage >= totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage + 1);
        }
    };
    controlsContainer.appendChild(nextButton);
}
