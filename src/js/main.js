console.log(`%c${[
    '                                                            ',
    '                                                            ',
    ' ▄▄▄▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄  ▄▄   ▄▄ ▄▄▄▄▄ ▄██ ████▄ ▄██ ██  ██ ',
    '   ▄█▀ ▀███▀ ██ ▄▄ ██▀██ ██▀▄▀██ ██▄▄   ██  ▄▄██  ██ ▀█████ ',
    ' ▄██▄▄   █   ▀███▀ ██▀██ ██   ██ ██▄▄▄  ██ ▄▄▄█▀  ██     ██ ',
    '                                                            ',
    '     Developed by zygame1314',
    ' 既然你发现了这里，说明你也是个爱折腾的人。',
    ' 愿代码与你同在！',
    ''
].join('\n')}`, "font-family: 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace; color: #007BFF;");
document.addEventListener('authSuccess', async () => {
    console.log("验证成功，开始加载根目录文件列表...");
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    if (idParam) {
        try {
            const token = localStorage.getItem('authToken');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const response = await fetch(`${FILES_API_URL}?action=getById&id=${encodeURIComponent(idParam)}`, { headers });
            const result = await response.json();
            if (result.success && result.file) {
                const file = result.file;
                const isDirectory = file.is_directory === 1 || file.is_directory === true;
                if (isDirectory) {
                    urlParams.set('path', file.key);
                    urlParams.delete('id');
                } else {
                    urlParams.set('path', file.parent_path || '');
                    urlParams.set('highlight', file.key);
                    urlParams.delete('id');
                }
                window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
            } else {
                if (typeof showNotification === 'function') {
                    showNotification('分享链中的资源不存在或已被删除', 'error');
                }
                urlParams.delete('id');
                window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
            }
        } catch (e) {
            console.error('通过ID解析分享链失败:', e);
        }
    }
    const pathParam = urlParams.get('path');
    const highlightParam = urlParams.get('highlight');
    if (highlightParam) {
        highlightKey = highlightParam;
    }
    fetchAndDisplayFiles(pathParam || '', '', 1, !!(pathParam || highlightParam));
    fetchFileStats();
    fetchAndBuildFolderTree();
    fetchAndRenderHotFolders();
    fetchAndRenderRecentUploads();
    if (typeof checkAdminPermission === 'function') {
        checkAdminPermission();
    }
    const uploadBtnLink = document.getElementById('upload-btn-link');
    if (uploadBtnLink) {
        uploadBtnLink.style.display = 'inline-flex';
    }
    if (!localStorage.getItem('hasSeenTutorial')) {
        setTimeout(async () => {
            if (typeof showConfirmation === 'function') {
                const shouldStart = await showConfirmation({
                    title: '👋 欢迎来到武理资源共享平台',
                    message: '检测到你可能是初次访问，建议你查看新手教程以了解如何全功能使用本站。<br><br>是否立即开启教程？',
                    confirmText: '🚀 开启教程',
                    cancelText: '暂不需要'
                });
                localStorage.setItem('hasSeenTutorial', 'true');
                if (shouldStart && typeof startTutorial === 'function') {
                    startTutorial();
                }
            }
        }, 1500);
    }
});
document.addEventListener('authRestored', () => {
    console.log("恢复验证状态，开始加载根目录文件列表...");
    fetchAndDisplayFiles('', '', 1, false);
    fetchFileStats();
    fetchAndBuildFolderTree();
    fetchAndRenderHotFolders();
    fetchAndRenderRecentUploads();
    const uploadBtnLink = document.getElementById('upload-btn-link');
    if (uploadBtnLink) {
        uploadBtnLink.style.display = 'inline-flex';
    }
});
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const initialPrefix = urlParams.get('path') || '';
    const initialSearch = urlParams.get('search') || '';
    const initialPage = parseInt(urlParams.get('page') || '1');
    window.history.replaceState({ prefix: initialPrefix, searchTerm: initialSearch, page: initialPage }, '', window.location.href);
    createParticleBackground();
    if (fileListElement) {
        fileListElement.innerHTML = `
            <li class="empty-state clickable" title="点击登录">
                <i class="fas fa-user-shield u-font-large-icon"></i>
                请先完成验证以查看文件
            </li>
        `;
        fileListElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    updateBreadcrumb('');
    currentPrefix = '';
    renderPaginationControls(null);
    const tutorialBtn = document.getElementById('tutorial-btn');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', () => {
            if (typeof startTutorial === 'function') {
                startTutorial();
            } else {
                console.error('教程函数未找到');
                showNotification('无法加载教程，请刷新页面重试。', 'error');
            }
        });
    }
    if (fileListElement) {
        fileListElement.addEventListener('click', (event) => {
            const targetLi = event.target.closest('li.empty-state');
            if (targetLi && targetLi.textContent.includes('请先完成验证以查看文件')) {
                console.log('点击空状态，尝试显示认证模态');
                if (typeof showAuthModal === 'function') {
                    showAuthModal('login');
                } else if (typeof window.showAuthModal === 'function') {
                    window.showAuthModal('login');
                } else {
                    console.error('showAuthModal 未定义');
                    if (typeof showNotification === 'function') {
                        showNotification('无法打开登录窗口，请刷新页面重试', 'error');
                    }
                }
            }
        });
    }
    const selectionModeBtn = document.getElementById('selection-mode-btn');
    if (selectionModeBtn) {
        selectionModeBtn.addEventListener('click', toggleSelectionMode);
    }
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', handleBatchDelete);
    }
    const batchDownloadBtn = document.getElementById('batch-download-btn');
    if (batchDownloadBtn) {
        batchDownloadBtn.addEventListener('click', handleBatchDownload);
    }
    const batchMoveBtn = document.getElementById('batch-move-btn');
    if (batchMoveBtn) {
        batchMoveBtn.addEventListener('click', handleBatchMove);
    }
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', handleSelectAll);
    }
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            viewButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            if (fileListContainer) {
                fileListContainer.classList.toggle('grid-view', currentView === 'grid');
                document.querySelectorAll('.boost-panel').forEach(p => p.remove());
                document.querySelectorAll('.boost-modal-overlay').forEach(o => o.remove());
                document.querySelectorAll('.boost-btn.active').forEach(b => b.classList.remove('active'));
            }
        });
    });
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            if (currentRawData) {
                applyLocalSortAndFilter();
            } else {
                fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', 1);
            }
        });
    });
    const sortTrigger = document.getElementById('sort-trigger');
    const sortOptions = document.getElementById('sort-options');
    const sortLabel = document.getElementById('sort-label');
    if (sortTrigger && sortOptions) {
        sortTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = sortOptions.classList.contains('show');
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                if (menu !== sortOptions) menu.classList.remove('show');
            });
            document.querySelectorAll('.custom-select-trigger.active').forEach(trigger => {
                if (trigger !== sortTrigger) trigger.classList.remove('active');
            });
            sortOptions.classList.toggle('show', !isOpen);
            sortTrigger.classList.toggle('active', !isOpen);
        });
        sortOptions.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;
            e.stopPropagation();
            const value = item.dataset.value;
            const text = item.textContent;
            currentSortOption = value;
            sortLabel.textContent = text;
            sortOptions.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            sortOptions.classList.remove('show');
            sortTrigger.classList.remove('active');
            currentPage = 1;
            if (currentRawData) {
                applyLocalSortAndFilter();
            } else {
                fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', 1);
            }
        });
        document.addEventListener('click', (e) => {
            if (!sortTrigger.contains(e.target) && !sortOptions.contains(e.target)) {
                sortOptions.classList.remove('show');
                sortTrigger.classList.remove('active');
            }
        });
    }
    const folderSearchInput = document.getElementById('folder-search-input');
    const clearFolderSearchBtn = document.getElementById('clear-folder-search');
    if (folderSearchInput) {
        let folderSearchTimeout = null;
        const updateClearBtn = () => {
            if (clearFolderSearchBtn) {
                clearFolderSearchBtn.style.display = folderSearchInput.value.length > 0 ? 'flex' : 'none';
            }
        };
        folderSearchInput.addEventListener('input', (e) => {
            updateClearBtn();
            if (folderSearchTimeout) {
                clearTimeout(folderSearchTimeout);
            }
            folderSearchTimeout = setTimeout(() => {
                const newTerm = e.target.value.trim();
                if (newTerm === currentFolderSearchTerm) return;
                currentFolderSearchTerm = newTerm;
                currentPage = 1;
                if (currentRawData) {
                    applyLocalSortAndFilter();
                }
            }, 600);
        });
        folderSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                folderSearchInput.value = '';
                currentFolderSearchTerm = '';
                updateClearBtn();
                if (currentRawData) {
                    currentPage = 1;
                    applyLocalSortAndFilter();
                }
            }
        });
        if (clearFolderSearchBtn) {
            clearFolderSearchBtn.addEventListener('click', () => {
                folderSearchInput.value = '';
                currentFolderSearchTerm = '';
                updateClearBtn();
                folderSearchInput.focus();
                if (currentRawData) {
                    currentPage = 1;
                    applyLocalSortAndFilter();
                }
            });
        }
    }
    if (closePreviewBtn && previewModal) {
        const closeAndCleanup = () => {
            previewModal.classList.remove('visible');
            document.body.style.overflow = '';
            previewIframe.src = '';
            const existingImageWrapper = previewModal.querySelector('.preview-image-wrapper');
            if (existingImageWrapper) {
                existingImageWrapper.remove();
            }
            const existingVideoWrapper = previewModal.querySelector('.preview-video-wrapper');
            if (existingVideoWrapper) {
                const video = existingVideoWrapper.querySelector('video');
                if (video) {
                    video.onerror = null;
                    video.pause();
                    video.src = '';
                }
                existingVideoWrapper.remove();
            }
            const existingTextWrapper = previewModal.querySelector('.preview-text-wrapper');
            if (existingTextWrapper) {
                existingTextWrapper.remove();
            }
        };
        closePreviewBtn.addEventListener('click', closeAndCleanup);
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                closeAndCleanup();
            }
        });
    }
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.getElementById('folder-tree-container');
    if (mobileSidebarToggle && sidebar) {
        const overlay = document.createElement('div');
        overlay.className = 'mobile-sidebar-overlay';
        document.body.appendChild(overlay);
        const setIcon = (isOpen) => {
            const icon = mobileSidebarToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-times', isOpen);
                icon.classList.toggle('fa-bars', !isOpen);
            }
        };
        const closeSidebar = () => {
            document.body.classList.remove('mobile-sidebar-visible');
            setIcon(false);
        };
        const toggleSidebar = () => {
            const isOpen = document.body.classList.contains('mobile-sidebar-visible');
            if (isOpen) {
                closeSidebar();
            } else {
                document.body.classList.add('mobile-sidebar-visible');
                setIcon(true);
            }
        };
        mobileSidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
        overlay.addEventListener('click', closeSidebar);
        sidebar.addEventListener('click', (e) => {
            if (e.target.closest('.go-to-folder-btn') || e.target.closest('.hot-folder-item')) {
                closeSidebar();
            }
        });
    }
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
    }
});
if (searchButton && searchInput) {
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const performSearch = () => {
        const searchTerm = searchInput.value.trim();
        const aiSearchToggle = document.getElementById('ai-search-toggle');
        const isAISearch = aiSearchToggle && aiSearchToggle.checked;
        if (searchTerm && searchTerm.length < 1 && !isAISearch) {
            return;
        }
        fetchAndDisplayFiles(searchTerm ? '' : currentPrefix, searchTerm, 1);
    };
    const updateClearButton = () => {
        if (clearSearchBtn) {
            clearSearchBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
        }
    };
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        } else if (event.key === 'Escape') {
            searchInput.value = '';
            updateClearButton();
            if (isShowingSearchResults) {
                fetchAndDisplayFiles(currentPrefix);
            }
        }
    });
    searchInput.addEventListener('input', updateClearButton);
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            updateClearButton();
            searchInput.focus();
            if (isShowingSearchResults) {
                fetchAndDisplayFiles(currentPrefix);
            }
        });
    }
}
if (themeToggle) {
    const updateThemeIcon = (isDark) => {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
    };
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        updateThemeIcon(true);
    } else {
        updateThemeIcon(false);
    }
    themeToggle.addEventListener('click', () => {
        const isCurrentDark = document.body.getAttribute('data-theme') === 'dark';
        if (isCurrentDark) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            updateThemeIcon(false);
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            updateThemeIcon(true);
        }
        createParticleBackground();
    });
}
window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (state) {
        console.log("从历史记录恢复状态:", state);
        fetchAndDisplayFiles(state.prefix || '', state.searchTerm || '', state.page || 1, false, false);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const path = urlParams.get('path') || '';
        const search = urlParams.get('search') || '';
        const page = parseInt(urlParams.get('page') || '1');
        console.log("从 URL 恢复状态:", { path, search, page });
        fetchAndDisplayFiles(path, search, page, false, false);
    }
});
const uploadBtnFloating = document.querySelector('.upload-btn-floating');
const backToTopBtn = document.getElementById('back-to-top');
if (uploadBtnFloating || backToTopBtn) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            if (uploadBtnFloating) uploadBtnFloating.classList.add('scrolled');
            if (backToTopBtn) backToTopBtn.classList.add('visible');
        } else {
            if (uploadBtnFloating) uploadBtnFloating.classList.remove('scrolled');
            if (backToTopBtn) backToTopBtn.classList.remove('visible');
        }
    });
}
if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}
(function () {
    const searchBox = document.querySelector('.search-box');
    if (!searchBox) return;
    const aiSearchToggle = document.getElementById('ai-search-toggle');
    const searchInputEl = document.getElementById('search-input');
    if (!aiSearchToggle || !searchInputEl) return;
    const aiPlaceholders = [
        'AI 帮你找：高数大物、思修毛概期末真题 📝',
        '考证竞赛必备：英语竞赛 NECCS、数学竞赛 CMC 🏆',
        '保研神器：保研简历模版、面试 PPT、个人陈述、毕设资料 📚',
        '硬核专业课：流体力学、电路原理、信号与系统、材料力学 ⚙️',
        '代码参考：Python、Java、常见数据结构源代码 💻',
        '政策不迷路：2025 转专业政策、各学院培养方案 🗺️'
    ];
    const defaultPlaceholder = '输入关键词...';
    const aiShortPlaceholder = 'AI 智能搜索...';
    const SMALL_SCREEN_BREAKPOINT = 1200;
    let placeholderInterval = null;
    let currentPlaceholderIndex = 0;
    function isSmallScreen() {
        return window.innerWidth < SMALL_SCREEN_BREAKPOINT;
    }
    function startPlaceholderCarousel() {
        if (placeholderInterval) return;
        if (isSmallScreen()) {
            searchInputEl.placeholder = aiShortPlaceholder;
            return;
        }
        currentPlaceholderIndex = 0;
        searchInputEl.placeholder = aiPlaceholders[currentPlaceholderIndex];
        placeholderInterval = setInterval(() => {
            if (searchInputEl.value.trim() !== '') return;
            if (isSmallScreen()) {
                stopPlaceholderCarousel();
                searchInputEl.placeholder = aiShortPlaceholder;
                searchBox.classList.add('ai-mode-active');
                return;
            }
            searchInputEl.classList.add('placeholder-fade-out');
            searchInputEl.classList.remove('placeholder-fade-in');
            setTimeout(() => {
                currentPlaceholderIndex = (currentPlaceholderIndex + 1) % aiPlaceholders.length;
                searchInputEl.placeholder = aiPlaceholders[currentPlaceholderIndex];
                searchInputEl.classList.remove('placeholder-fade-out');
                searchInputEl.classList.add('placeholder-fade-in');
            }, 300);
        }, 4000);
    }
    function stopPlaceholderCarousel() {
        if (placeholderInterval) {
            clearInterval(placeholderInterval);
            placeholderInterval = null;
        }
        searchInputEl.classList.remove('placeholder-fade-out', 'placeholder-fade-in');
        searchInputEl.placeholder = defaultPlaceholder;
    }
    function toggleAIMode(isEnabled) {
        if (isEnabled) {
            searchBox.classList.add('ai-mode-active');
            startPlaceholderCarousel();
        } else {
            searchBox.classList.remove('ai-mode-active');
            stopPlaceholderCarousel();
        }
    }
    aiSearchToggle.addEventListener('change', (e) => {
        toggleAIMode(e.target.checked);
    });
    if (aiSearchToggle.checked) {
        toggleAIMode(true);
    }
    searchInputEl.addEventListener('focus', () => {
        if (aiSearchToggle.checked && searchInputEl.value.trim() === '') {
            searchInputEl.classList.remove('placeholder-fade-out');
            searchInputEl.classList.add('placeholder-fade-in');
        }
    });
    window.addEventListener('resize', () => {
        if (aiSearchToggle.checked) {
            if (isSmallScreen() && placeholderInterval) {
                stopPlaceholderCarousel();
                searchInputEl.placeholder = aiShortPlaceholder;
                searchBox.classList.add('ai-mode-active');
            } else if (!isSmallScreen() && !placeholderInterval) {
                startPlaceholderCarousel();
            }
        }
    });
})();
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const modalOpen = document.querySelector('.confirmation-modal-overlay');
        const searchFocus = document.activeElement === document.getElementById('search-input');
        if (!modalOpen && !searchFocus && isSelectionMode) {
            e.preventDefault();
            handleSelectAll();
        }
    }
});
document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#"]');
    if (anchor) {
        const href = anchor.getAttribute('href');
        if (href.startsWith('#fn') || href.startsWith('#user-content-fn') || href.startsWith('#footnote-')) {
            e.preventDefault();
            const targetId = decodeURIComponent(href.slice(1));
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetEl.classList.add('highlight-flash');
                setTimeout(() => targetEl.classList.remove('highlight-flash'), 2000);
            }
        }
    }
    if (!e.target.closest('.file-actions') && !e.target.closest('.mobile-actions-toggle')) {
        const visibleItems = document.querySelectorAll('.file-list-item.actions-visible');
        if (visibleItems.length > 0) {
            visibleItems.forEach(item => {
                item.classList.remove('actions-visible');
            });
        }
    }
});
