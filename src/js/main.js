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
document.addEventListener('authSuccess', () => {
    console.log("验证成功，开始加载根目录文件列表...");
    const urlParams = new URLSearchParams(window.location.search);
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
            }
        });
    });
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            if (currentFetchedData) {
                const aiSearchToggle = document.getElementById('ai-search-toggle');
                const useAISearch = aiSearchToggle && aiSearchToggle.checked && isShowingSearchResults;
                renderFileList(
                    currentPrefix,
                    currentFetchedData,
                    isShowingSearchResults,
                    isShowingSearchResults ? searchInput.value.trim() : '',
                    currentPaginationData,
                    useAISearch
                );
            } else {
                fetchAndDisplayFiles(currentPrefix, isShowingSearchResults ? searchInput.value.trim() : '', currentPage);
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
});
if (searchButton && searchInput) {
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const performSearch = () => {
        const searchTerm = searchInput.value.trim();
        const aiSearchToggle = document.getElementById('ai-search-toggle');
        const isAISearch = aiSearchToggle && aiSearchToggle.checked;
        if (searchTerm && searchTerm.length < 3 && !isAISearch) {
            showNotification('搜索词太短（至少3个字符）。建议开启 "AI 搜索" 进行模糊查找。', 'info');
            const aiToggleLabel = document.querySelector('.ai-search-toggle-label');
            if (aiToggleLabel) {
                aiToggleLabel.classList.add('highlight-pulse');
                setTimeout(() => aiToggleLabel.classList.remove('highlight-pulse'), 1000);
            }
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
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.checked = true;
    }
    themeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
        createParticleBackground();
    });
}
window.addEventListener('popstate', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const path = urlParams.get('path') || '';
    if (path !== currentPrefix) {
        fetchAndDisplayFiles(path, '', 1, false);
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
        'AI 帮你找：大一高数期末试卷 📝',
        '试试搜索：计算机学院 考研资料 📚',
        '期末汇报神器👉 武理PPT模板、报告册模板 🎨',
        'Python作业写不出？搜：Python参考代码 🐍',
        '竞赛拿奖：CMC数学竞赛、周培源力学竞赛 🏆',
        '选课不迷路：各学院培养方案、选课指南 🗺️'
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
