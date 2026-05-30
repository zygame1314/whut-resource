function startTutorial() {
    const announcementViewModal = document.getElementById('announcement-view-modal');
    if (announcementViewModal) announcementViewModal.classList.remove('visible');
    window._tutorialActive = true;
    const isAuthenticated = !!localStorage.getItem('authToken');
    const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
            classes: 'shepherd-custom-theme',
            scrollTo: { behavior: 'smooth', block: 'center' },
            cancelIcon: {
                enabled: true
            }
        }
    });

    function fileActionStepHooks(selector) {
        return {
            beforeShowPromise() {
                return new Promise(resolve => {
                    const el = document.querySelector(selector);
                    if (el) {
                        const li = el.closest('li');
                        const fileActions = el.closest('.file-actions');
                        if (fileActions) fileActions.classList.add('tutorial-highlight');
                        if (li) li.classList.add('actions-visible');
                    }
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                });
            },
            when: {
                hide() {
                    const el = document.querySelector(selector);
                    if (el) {
                        const li = el.closest('li');
                        const fileActions = el.closest('.file-actions');
                        if (fileActions) fileActions.classList.remove('tutorial-highlight');
                        if (li) li.classList.remove('actions-visible');
                    }
                }
            }
        };
    }

    const _origRemoveNavActive = () => {
        const navActions = document.querySelector('.nav-actions');
        if (navActions) navActions.classList.remove('active');
    };
    if (!window._tutorialNavGuardInstalled) {
        window._tutorialNavGuardInstalled = true;
        window._tutorialKeepNavOpen = false;
        let navObserver = null;
        window._setTutorialKeepNavOpen = function (keepOpen) {
            window._tutorialKeepNavOpen = keepOpen;
            const navActions = document.querySelector('.nav-actions');
            if (!navActions) return;
            if (keepOpen) {
                navActions.classList.add('active');
                if (!navObserver) {
                    navObserver = new MutationObserver(() => {
                        if (window._tutorialKeepNavOpen && !navActions.classList.contains('active')) {
                            navActions.classList.add('active');
                        }
                    });
                    navObserver.observe(navActions, { attributes: true, attributeFilter: ['class'] });
                }
            } else {
                if (navObserver) {
                    navObserver.disconnect();
                    navObserver = null;
                }
                navActions.classList.remove('active');
            }
        };
    }

    let steps = [];

    const navActions = document.querySelector('.nav-actions');
    if (navActions && navActions.classList.contains('active')) {
        navActions.classList.remove('active');
    }

    steps.push({
        id: 'intro',
        title: '欢迎来到武理资源共享平台！',
        text: '这是一个互动教程，将引导你了解平台的主要功能。<br>你可以随时点击上方的 <i class="fas fa-question-circle"></i> 图标重新开始哦。',
        attachTo: {
            element: '.hero-section',
            on: 'bottom'
        }
    });

    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const isMobileNav = mobileMenuToggle && getComputedStyle(mobileMenuToggle).display !== 'none';

    if (!isAuthenticated) {
        if (isMobileNav) {
            steps.push({
                id: 'auth',
                title: '第一步：登录/注册',
                text: '在移动端，登录、注册、主题切换等功能都收纳在"更多"菜单里了。<br>请使用 @whut.edu.cn 邮箱登录以解锁全部功能！',
                attachTo: {
                    element: '#mobile-menu-toggle',
                    on: 'left'
                }
            });
        } else {
            steps.push({
                id: 'auth',
                title: '第一步：登录/注册',
                text: '要访问热门文件夹、最近上传以及下载文件，你需要使用 @whut.edu.cn 邮箱进行登录。<br>这是为了保护我们的资源！',
                attachTo: {
                    element: '#auth-section',
                    on: 'bottom'
                }
            });
        }
    } else {
        const themeStep = {
            id: 'theme-toggle',
            title: '个性化主题',
            text: '点击这里可以在明亮和暗黑模式之间自由切换，<br>选择你最喜欢的阅读体验！',
            attachTo: {
                element: '#theme-toggle',
                on: 'bottom'
            }
        };
        if (isMobileNav) {
            themeStep.beforeShowPromise = function () {
                return new Promise(resolve => {
                    window._setTutorialKeepNavOpen(true);
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                });
            };
            themeStep.when = {
                hide() {
                    window._setTutorialKeepNavOpen(false);
                }
            };
        }
        steps.push(themeStep);
        const quotaEl = document.querySelector('.user-info .quota');
        if (quotaEl) {
            const hasHover = window.matchMedia('(hover: hover)').matches;
            const quotaTriggerText = !hasHover
                ? '点击这里的配额文字，<br>即可弹出配额详情弹窗。'
                : '鼠标悬浮在配额文字上，<br>即可查看配额详情弹窗；也可以点击触发。';
            const quotaStep = {
                id: 'quota-popup',
                title: '下载配额',
                text: `${quotaTriggerText}<br>弹窗内还可以开关<strong>「下载通知」</strong>，开启后会实时显示其他同学的下载动态。`,
                attachTo: {
                    element: '.user-info .quota',
                    on: 'bottom'
                }
            };
            if (isMobileNav) {
                quotaStep.beforeShowPromise = function () {
                    return new Promise(resolve => {
                        window._setTutorialKeepNavOpen(true);
                        requestAnimationFrame(() => requestAnimationFrame(resolve));
                    });
                };
                quotaStep.when = {
                    hide() {
                        window._setTutorialKeepNavOpen(false);
                    }
                };
            }
            steps.push(quotaStep);
        }
        steps.push({
            id: 'search',
            title: '文件搜索',
            text: '你可以在这里输入关键词，<br>快速搜索你需要的任何文件或资料。',
            attachTo: {
                element: '.search-box',
                on: 'bottom'
            }
        });
        steps.push({
            id: 'ai-search',
            title: 'AI 智能搜索',
            text: '开启这个开关，即可体验基于语义的 AI 搜索！<br>即使记不清文件名，描述内容也能找到相关资料。',
            attachTo: {
                element: '.ai-search-toggle',
                on: 'bottom'
            }
        });
        steps.push({
            id: 'view-options',
            title: '切换视图',
            text: '习惯网格视图还是列表视图？<br>点击这里按照你的喜好切换文件显示方式。',
            attachTo: {
                element: '.view-options',
                on: 'bottom'
            }
        });
        steps.push({
            id: 'recent-uploads',
            title: '最新动态',
            text: '这里展示了最近更新的资源，<br>方便你快速获取最新资料。',
            attachTo: {
                element: '#recent-uploads-section',
                on: 'bottom'
            }
        });
        const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
        const isMobile = mobileSidebarToggle && getComputedStyle(mobileSidebarToggle).display !== 'none';
        if (isMobile) {
            steps.push({
                id: 'folder-nav-mobile',
                title: '文件夹导航',
                text: '这是文件夹导航树，你可以点击文件夹名称展开或折叠，<br>点击右侧的箭头按钮进入文件夹。<br><br>点击导航栏的菜单按钮可随时打开或关闭此侧边栏。',
                attachTo: {
                    element: '#folder-tree',
                    on: 'bottom'
                },
                beforeShowPromise: function () {
                    return new Promise(resolve => {
                        document.body.classList.add('mobile-sidebar-visible');
                        setTimeout(resolve, 350);
                    });
                },
                when: {
                    hide() {
                        document.body.classList.remove('mobile-sidebar-visible');
                    }
                }
            });
        } else {
            steps.push({
                id: 'folder-nav',
                title: '文件夹导航',
                text: '左侧是文件夹导航树，你可以点击文件夹名称展开或折叠，<br>点击右侧的箭头按钮进入文件夹。',
                attachTo: {
                    element: '#folder-tree',
                    on: 'right'
                }
            });
            steps.push({
                id: 'knowledge-graph',
                title: '知识图谱',
                text: '探索可视化知识网络！<br>点击这里查看文件之间的关联，发现更多有趣的知识连接。',
                attachTo: {
                    element: '#open-graph-btn',
                    on: 'right'
                }
            });
        }
        steps.push({
            id: 'guestbook',
            title: '留言板',
            text: '有什么想说的？<br>在这里分享你的看法，或者向管理员反馈问题。',
            attachTo: {
                element: '.guestbook-header-section',
                on: 'bottom'
            }
        });
        const uploadBtn = document.getElementById('upload-btn-link');
        if (uploadBtn && uploadBtn.style.display !== 'none') {
            steps.push({
                id: 'upload-button',
                title: '上传你的资料！',
                text: '管理员可以点击这里上传文件。<br>支持拖放上传哦！',
                attachTo: {
                    element: '#upload-btn-link',
                    on: 'top'
                }
            });
            steps.push({
                id: 'upload-path',
                title: '上传到哪里？',
                text: '面包屑导航显示了你当前所在的目录。上传的文件会传到这个位置，<br>当然，你也可以在上传页面选择其他文件夹！',
                attachTo: {
                    element: '#breadcrumb-nav',
                    on: 'bottom'
                }
            });
        }
        steps.push({
            id: 'storage-limit',
            title: '关于存储容量',
            text: '我们有大约 10GB 的免费存储空间，这个进度条会显示使用情况。<br>超出后站长要自掏腰包了... 请大家珍惜空间！',
            attachTo: {
                element: '.size-progress-container',
                on: 'bottom'
            }
        });
        {
            const hasHoverNotif = window.matchMedia('(hover: hover)').matches;
            const notifTriggerText = !hasHoverNotif
                ? '点击配额文字 → 弹窗中找到「下载通知」开关'
                : '悬浮/点击配额文字 → 弹窗中找到「下载通知」开关';
            steps.push({
                id: 'download-notification',
                title: '实时下载通知',
                text: '就像这样！开启后，页面右下角会实时弹出其他同学的下载动态。<br>开启方式：' + notifTriggerText + ' 即可开启或关闭。',
                attachTo: {
                    element: '.download-log-item:last-child',
                    on: 'top'
                },
                beforeShowPromise: function () {
                    return new Promise(resolve => {
                        if (typeof window._showTutorialDownloadToast === 'function') {
                            window._showTutorialDownloadToast();
                        }
                        setTimeout(resolve, 350);
                    });
                },
                when: {
                    hide() {
                        if (typeof window._removeTutorialDownloadToast === 'function') {
                            window._removeTutorialDownloadToast();
                        }
                    }
                }
            });
        }
        if (document.querySelector('.download-button')) {
            steps.push({
                id: 'download',
                title: '下载文件',
                text: '点击"下载"按钮，即可将文件保存到你的本地设备。',
                attachTo: {
                    element: '.download-button',
                    on: 'bottom'
                },
                ...fileActionStepHooks('.download-button')
            });
        }
        const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        if (isTouchDevice) {
            steps.push({
                id: 'mobile-actions',
                title: '移动端操作提示',
                text: '在移动端，文件的操作菜单（下载、删除、重命名等）<br>通过点击文件条目右侧的<strong>「⋮」折叠按钮</strong>展开哦！',
                attachTo: {
                    element: '.mobile-actions-toggle',
                    on: 'top'
                }
            });
        }
        steps.push({
            id: 'selection-mode',
            title: '批量操作',
            text: '需要同时处理多个文件？<br>点击"批量选择"按钮，即可进入多选模式，进行批量下载、移动或删除。',
            attachTo: {
                element: '#selection-mode-btn',
                on: 'bottom'
            }
        });
        if (document.querySelector('.delete-button')) {
            steps.push({
                id: 'admin-delete',
                title: '管理员功能：删除',
                text: '你拥有删除文件或文件夹的权限。<br><strong>请谨慎操作，此操作不可逆！</strong>',
                attachTo: {
                    element: '.delete-button',
                    on: 'bottom'
                },
                ...fileActionStepHooks('.delete-button')
            });
        }
        if (document.querySelector('.rename-button')) {
            steps.push({
                id: 'admin-rename',
                title: '管理员功能：重命名和移动',
                text: '你还可以对文件或文件夹进行重命名和移动操作，<br>以更好地组织文件结构。',
                attachTo: {
                    element: '.rename-button',
                    on: 'bottom'
                },
                ...fileActionStepHooks('.rename-button')
            });
        }
        if (document.querySelector('.edit-desc-button')) {
            steps.push({
                id: 'admin-edit-description',
                title: '管理员功能：编辑属性',
                text: '点击此按钮可以为文件夹编辑描述或公告，<br>支持 Markdown 格式，方便你为文件夹添加说明。',
                attachTo: {
                    element: '.edit-desc-button',
                    on: 'bottom'
                },
                ...fileActionStepHooks('.edit-desc-button')
            });
        }
        steps.push({
            id: 'finish',
            title: '教程结束！',
            text: '你已了解所有基本功能！开始探索吧！<br>如果需要，可以再次点击帮助按钮回顾。<br>祝你使用愉快！'
        });
    }

    const total = steps.length;

    function animateOut(el, callback) {
        if (!el) { if (callback) callback(); return; }
        const content = el.querySelector('.shepherd-content');
        if (!content) { if (callback) callback(); return; }
        content.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease';
        content.style.transform = 'scale(0.96) translateY(8px)';
        content.style.opacity = '0';
        el.style.transition = 'opacity 0.2s ease 0.03s';
        el.style.opacity = '0';
        setTimeout(() => {
            if (callback) callback();
        }, 230);
    }

    const originalNext = tour.next.bind(tour);
    const originalBack = tour.back.bind(tour);
    const originalCancel = tour.cancel.bind(tour);
    let animating = false;

    tour.next = function () {
        if (animating) return;
        animating = true;
        const el = tour.getCurrentStep()?.el;
        animateOut(el, () => { animating = false; originalNext(); });
    };
    tour.back = function () {
        if (animating) return;
        animating = true;
        const el = tour.getCurrentStep()?.el;
        animateOut(el, () => { animating = false; originalBack(); });
    };
    tour.cancel = function () {
        if (animating) return;
        animating = true;
        const el = tour.getCurrentStep()?.el;
        const overlay = document.querySelector('.shepherd-modal-overlay-container.shepherd-modal-is-visible');
        animateOut(el, () => {});
        if (overlay) {
            overlay.style.transition = 'opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease';
            overlay.style.opacity = '0';
            overlay.style.backdropFilter = 'blur(0)';
            overlay.style.webkitBackdropFilter = 'blur(0)';
        }
        setTimeout(() => {
            if (overlay) {
                overlay.style.transition = '';
                overlay.style.opacity = '';
                overlay.style.backdropFilter = '';
                overlay.style.webkitBackdropFilter = '';
            }
            animating = false;
            originalCancel();
        }, 320);
    };

    steps.forEach((step, index) => {
        const isFirst = index === 0;
        const isLast = index === total - 1;

        const buttons = [];
        if (!isFirst && !isLast) {
            buttons.push({
                action() { return this.back(); },
                secondary: true,
                text: '上一步'
            });
        }
        if (isLast) {
            buttons.push({
                action() { return this.cancel(); },
                text: '完成'
            });
        } else if (isFirst) {
            buttons.push({
                action() { return this.next(); },
                text: '开始教程'
            });
        } else {
            buttons.push({
                action() { return this.next(); },
                text: '下一步'
            });
        }
        step.buttons = buttons;

        const existingWhen = step.when || {};
        const existingShow = existingWhen.show;
        const existingBeforeShowPromise = step.beforeShowPromise;
        step.beforeShowPromise = function () {
            return new Promise(resolve => {
                const el = this?.el;
                if (el) {
                    const content = el.querySelector('.shepherd-content');
                    if (content) {
                        content.style.transition = 'none';
                        content.style.transform = 'scale(0.96) translateY(8px)';
                        content.style.opacity = '0';
                    }
                }
                if (existingBeforeShowPromise) {
                    existingBeforeShowPromise.call(this).then(resolve);
                } else {
                    resolve();
                }
            });
        };
        step.when = {
            ...existingWhen,
            show() {
                if (existingShow) existingShow.call(this);
                const currentStep = tour.getCurrentStep();
                if (!currentStep || !currentStep.el) return;
                const el = currentStep.el;
                const content = el.querySelector('.shepherd-content');
                if (content) {
                    requestAnimationFrame(() => {
                        content.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease';
                        content.style.transform = 'scale(1) translateY(0)';
                        content.style.opacity = '1';
                    });
                }
                const footer = el.querySelector('.shepherd-footer');
                if (footer && !footer.querySelector('.shepherd-progress')) {
                    const progressEl = document.createElement('div');
                    progressEl.className = 'shepherd-progress';
                    const barEl = document.createElement('div');
                    barEl.className = 'shepherd-progress-bar';
                    for (let i = 0; i < total; i++) {
                        const dot = document.createElement('span');
                        dot.className = 'shepherd-progress-dot';
                        if (i < index) dot.classList.add('completed');
                        if (i === index) dot.classList.add('active');
                        barEl.appendChild(dot);
                    }
                    progressEl.appendChild(barEl);
                    footer.insertBefore(progressEl, footer.firstChild);
                }
            }
        };
    });

    tour.on('cancel', () => {
        document.querySelectorAll('li.actions-visible').forEach(li => li.classList.remove('actions-visible'));
        window._setTutorialKeepNavOpen(false);
        window._tutorialActive = false;
        if (typeof window._removeTutorialDownloadToast === 'function') {
            window._removeTutorialDownloadToast();
        }
        document.body.classList.remove('mobile-sidebar-visible');
    });
    tour.addSteps(steps);
    tour.start();
}