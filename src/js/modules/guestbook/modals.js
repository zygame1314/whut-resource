window.showRejectPrompt = function (options = {}) {
    const title = options.title || '驳回留言';
    const placeholder = options.placeholder || '请填写驳回原因（最多200字符）';
    const confirmText = options.confirmText || '驳回';
    const showPresets = options.showPresets !== undefined ? options.showPresets : true;
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        const presetsHtml = showPresets ? REJECT_PRESETS.map((preset, index) =>
            `<button class="reject-preset-btn" data-index="${index}">${preset}</button>`
        ).join('') : '';
        const presetsContainerHtml = showPresets ? `
            <p>选择预设原因或自定义输入：</p>
            <div class="reject-presets">
                ${presetsHtml}
            </div>
        ` : '';
        modalOverlay.innerHTML = `
            <div class="confirmation-modal reject-modal">
                <h3><i class="fas fa-times-circle"></i> ${title}</h3>
                ${presetsContainerHtml}
                <div class="prompt-input-container">
                    <textarea id="reject-reason-input" placeholder="${placeholder}" rows="3" maxlength="200"></textarea>
                    <div class="char-counter"><span id="reject-char-count">0</span>/200</div>
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">取消</button>
                    <button class="confirm-btn confirm-btn-danger">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const textarea = modalOverlay.querySelector('#reject-reason-input');
        const charCount = modalOverlay.querySelector('#reject-char-count');
        const presetBtns = modalOverlay.querySelectorAll('.reject-preset-btn');
        textarea.focus();
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
        if (showPresets) {
            presetBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const preset = REJECT_PRESETS[parseInt(btn.dataset.index)];
                    textarea.value = preset;
                    charCount.textContent = preset.length;
                    presetBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                if (value !== null) {
                    resolve(value);
                } else {
                    reject(new Error('User cancelled'));
                }
            }, { once: true });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => closeModal(textarea.value));
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal(null);
            }
        });
    });
}
async function showResolvePrompt() {
    function buildDirectoryTree(dirs) {
        const tree = {};
        dirs.forEach(dir => {
            const parts = dir.split('/');
            let current = tree;
            parts.forEach(part => {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            });
        });
        return tree;
    }
    function renderPathTreeNode(name, children, path, isRoot = false) {
        const fullPath = isRoot ? '' : path;
        const hasChildren = Object.keys(children).length > 0;
        const li = document.createElement('li');
        li.className = 'path-tree-node';
        const nodeContent = document.createElement('div');
        nodeContent.className = 'path-tree-item';
        nodeContent.dataset.path = fullPath;
        nodeContent.innerHTML = `
            <i class="fas fa-chevron-right path-toggle-icon ${hasChildren ? '' : 'invisible'}"></i>
            <i class="fas ${isRoot ? 'fa-home' : 'fa-folder'} path-folder-icon"></i>
            <span class="path-folder-name">${escapeHtml(name)}</span>
        `;
        li.appendChild(nodeContent);
        if (hasChildren) {
            const sublist = document.createElement('ul');
            sublist.className = 'path-tree-list';
            sublist.style.display = isRoot ? 'block' : 'none';
            const sortedKeys = Object.keys(children).sort();
            sortedKeys.forEach(key => {
                const childPath = isRoot ? key : path + '/' + key;
                sublist.appendChild(renderPathTreeNode(key, children[key], childPath, false));
            });
            li.appendChild(sublist);
        }
        return li;
    }
    return new Promise((resolve, reject) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'confirmation-modal-overlay';
        let selectedPath = '';
        let directories = [];
        const pathSelectorHtml = `
            <div class="resolve-path-selector">
                <label class="resolve-label"><i class="fas fa-folder-open"></i> 资源目录（可选）</label>
                <div class="path-dropdown-wrapper">
                    <button type="button" id="resolve-path-btn" class="path-dropdown-btn">
                        <span class="selected-path">点击选择目录</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div id="resolve-path-dropdown" class="path-dropdown-menu">
                        <div class="path-dropdown-header">
                            <span>选择资源目录</span>
                            <button type="button" id="clear-path-btn" class="clear-path-btn" title="清除选择"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="path-search-wrapper">
                            <input type="text" id="resolve-path-search" class="path-search-input" placeholder="搜索目录...">
                        </div>
                        <div id="resolve-path-tree-container" class="path-tree-container">
                            <div class="path-tree-loading">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        modalOverlay.innerHTML = `
            <div class="confirmation-modal resolve-modal">
                <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> 标记为已解决</h3>
                <p>可选填写资源目录和备注信息</p>
                ${pathSelectorHtml}
                <div class="prompt-input-container">
                    <label class="resolve-label"><i class="fas fa-comment"></i> 备注（可选）</label>
                    <textarea id="resolve-note-input" placeholder="如：这是去年的资料、祝考试顺利等" rows="2"></textarea>
                </div>
                <div class="confirmation-buttons">
                    <button class="confirm-btn-cancel">取消</button>
                    <button class="confirm-btn confirm-btn-primary">确认解决</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const noteInput = modalOverlay.querySelector('#resolve-note-input');
        const pathBtn = modalOverlay.querySelector('#resolve-path-btn');
        const pathDropdown = modalOverlay.querySelector('#resolve-path-dropdown');
        const pathTreeContainer = modalOverlay.querySelector('#resolve-path-tree-container');
        const clearPathBtn = modalOverlay.querySelector('#clear-path-btn');
        const searchInput = modalOverlay.querySelector('#resolve-path-search');
        function populateTree(dirs) {
            if (!pathTreeContainer) return;
            pathTreeContainer.innerHTML = '';
            if (dirs.length === 0) return;
            const tree = buildDirectoryTree(dirs);
            const ul = document.createElement('ul');
            ul.className = 'path-tree-list root';
            ul.appendChild(renderPathTreeNode('根目录', tree, '', true));
            pathTreeContainer.appendChild(ul);
        }
        if (pathTreeContainer) {
            pathTreeContainer.addEventListener('click', (e) => {
                const toggleIcon = e.target.closest('.path-toggle-icon');
                const folderIcon = e.target.closest('.path-folder-icon');
                const treeItem = e.target.closest('.path-tree-item');
                let actAsToggle = false;
                let targetToggleIcon = toggleIcon;
                if (toggleIcon && !toggleIcon.classList.contains('invisible')) {
                    actAsToggle = true;
                } else if (folderIcon) {
                    const parentItem = folderIcon.closest('.path-tree-item');
                    if (parentItem) {
                        const siblingToggle = parentItem.querySelector('.path-toggle-icon');
                        if (siblingToggle && !siblingToggle.classList.contains('invisible')) {
                            actAsToggle = true;
                            targetToggleIcon = siblingToggle;
                        }
                    }
                }
                if (actAsToggle && targetToggleIcon) {
                    e.stopPropagation();
                    const parentLi = targetToggleIcon.closest('.path-tree-node');
                    const sublist = parentLi.querySelector(':scope > .path-tree-list');
                    if (sublist) {
                        const isExpanded = sublist.style.display !== 'none';
                        sublist.style.display = isExpanded ? 'none' : 'block';
                        targetToggleIcon.style.transform = isExpanded ? '' : 'rotate(90deg)';
                        targetToggleIcon.classList.toggle('expanded', !isExpanded);
                    }
                } else if (treeItem) {
                    pathTreeContainer.querySelectorAll('.path-tree-item').forEach(item => {
                        item.classList.remove('selected');
                    });
                    treeItem.classList.add('selected');
                    selectedPath = treeItem.dataset.path;
                    pathBtn.querySelector('.selected-path').textContent = selectedPath || '根目录';
                    pathDropdown.classList.remove('open');
                    pathBtn.classList.remove('open');
                }
            });
        }
         (async () => {
             const token = localStorage.getItem('authToken');
             try {
                 const result = await fetchCached(`${API_ENDPOINTS.files}?action=listAllDirs`, 'listAllDirs', 3600000, {
                     headers: { 'Authorization': `Bearer ${token}` }
                 });
                 if (result.success && result.directories) {
                     directories = result.directories.map(d => d.endsWith('/') ? d.slice(0, -1) : d);
                 }
             } catch (e) {
                 console.warn('获取目录列表失败:', e);
             }
            if (directories.length > 0) {
                populateTree(directories);
            } else if (pathTreeContainer) {
                pathTreeContainer.innerHTML = '<div class="path-tree-empty" style="padding:8px;color:var(--text-secondary);">暂无目录</div>';
            }
        })();
        if (searchInput) {
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            searchInput.addEventListener('input', (e) => {
                if (typeof filterTreeByKeyword === 'function') {
                    filterTreeByKeyword(pathTreeContainer, e.target.value, {
                        nodeSelector: '.path-tree-node',
                        itemSelector: '.path-tree-item',
                        nameSelector: '.path-folder-name',
                        listSelector: '.path-tree-list',
                        toggleSelector: '.path-toggle-icon',
                        useTransform: true
                    });
                }
            });
        }
        if (clearPathBtn) {
            clearPathBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedPath = '';
                pathBtn.querySelector('.selected-path').textContent = '点击选择目录';
                pathTreeContainer?.querySelectorAll('.path-tree-item').forEach(item => {
                    item.classList.remove('selected');
                });
                pathDropdown.classList.remove('open');
                pathBtn.classList.remove('open');
            });
        }
        if (pathBtn && pathDropdown) {
            pathBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pathDropdown.classList.toggle('open');
                pathBtn.classList.toggle('open');
                if (pathDropdown.classList.contains('open') && searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            });
        }
        noteInput.focus();
        const closeModal = (value) => {
            modalOverlay.classList.add('closing');
            modalOverlay.addEventListener('animationend', () => {
                if (modalOverlay.parentNode) {
                    document.body.removeChild(modalOverlay);
                }
                if (value !== null) {
                    resolve(value);
                } else {
                    reject(new Error('User cancelled'));
                }
            }, { once: true });
        };
        modalOverlay.querySelector('.confirm-btn').addEventListener('click', () => {
            const path = selectedPath.trim();
            const note = noteInput.value.trim();
            if (path || note) {
                closeModal(JSON.stringify({ path: path || null, note: note || null }));
            } else {
                closeModal('');
            }
        });
        modalOverlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => closeModal(null));
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                closeModal(null);
            }
        });
        modalOverlay.addEventListener('click', (e) => {
            if (pathDropdown && !pathDropdown.contains(e.target) && !pathBtn?.contains(e.target)) {
                pathDropdown.classList.remove('open');
                pathBtn?.classList.remove('open');
            }
        });
    });
}
window.editGuestbook = async function (id, encodedContent = '') {
    let decoded = '';
    try {
        decoded = decodeURIComponent(atob(encodedContent));
    } catch (e) {
        decoded = encodedContent;
    }
    let newContent = '';
    try {
        if (typeof showPrompt === 'function') {
            newContent = await showPrompt({ title: '编辑留言', message: '修改留言内容：', initialValue: decoded, placeholder: '请输入留言内容', useTextarea: true, rows: 5 });
        } else {
            newContent = prompt('编辑留言：', decoded);
        }
    } catch (e) {
        return;
    }
    if (newContent === null) return;
    newContent = newContent.trim();
    if (!newContent) {
        showNotification('内容不能为空', 'warning');
        return;
    }
    if (newContent.length > 500) {
        showNotification('内容过长（最多500字符）', 'warning');
        return;
    }
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(GUESTBOOK_API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, action: 'edit', content: newContent })
        });
        if (response.ok) {
            showNotification('编辑成功', 'success');
            const isAdmin = isGuestbookAdmin(window.currentUser);
            updateGuestbookCache(id, {
                content: newContent,
                status: 'unresolved',
                reject_reason: null,
                is_hidden: isAdmin ? 0 : 1
            });
        } else {
            const data = await response.json();
            showNotification(data.error || '编辑失败', 'error');
        }
    } catch (error) {
        console.error('Edit guestbook error:', error);
        showNotification('编辑出错', 'error');
    }
};
