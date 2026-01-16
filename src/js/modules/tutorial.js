function startTutorial() {
    const isAuthenticated = !!localStorage.getItem('authToken');
    const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
            classes: 'shepherd-theme-arrows shepherd-custom-theme',
            scrollTo: { behavior: 'smooth', block: 'center' },
            cancelIcon: {
                enabled: true
            },
            buttons: [
                {
                    action() {
                        return this.back();
                    },
                    secondary: true,
                    text: '上一步'
                },
                {
                    action() {
                        return this.next();
                    },
                    text: '下一步'
                }
            ]
        }
    });
    let steps = [];
    steps.push({
        id: 'intro',
        title: '欢迎来到武理资源共享平台！',
        text: '这是一个互动教程，将引导你了解平台的主要功能。你可以随时点击上方的 <i class="fas fa-question-circle"></i> 图标重新开始哦。',
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
                text: '在移动端，登录、注册、主题切换等功能都收纳在“更多”菜单里了。请使用 @whut.edu.cn 邮箱登录以解锁全部功能！',
                attachTo: {
                    element: '#mobile-menu-toggle',
                    on: 'left'
                }
            });
        } else {
            steps.push({
                id: 'auth',
                title: '第一步：登录/注册',
                text: '要访问热门文件夹、最近上传以及下载文件，你需要使用 @whut.edu.cn 邮箱进行登录。这是为了保护我们的共享资源！',
                attachTo: {
                    element: '#auth-section',
                    on: 'bottom'
                }
            });
        }
    } else {
        if (!isMobileNav) {
            steps.push({
                id: 'theme-toggle',
                title: '个性化主题',
                text: '点击这里可以在明亮和暗黑模式之间自由切换，选择你最喜欢的阅读体验！',
                attachTo: {
                    element: '#theme-toggle',
                    on: 'bottom'
                }
            });
        }
        steps.push({
            id: 'search',
            title: '文件搜索',
            text: '你可以在这里输入关键词，快速搜索你需要的任何文件或资料。非常方便！',
            attachTo: {
                element: '.search-box',
                on: 'bottom'
            }
        });
        steps.push({
            id: 'ai-search',
            title: '✨ AI 智能搜索',
            text: '开启这个开关，即可体验基于语义的 AI 搜索！即使记不清文件名，描述内容也能找到相关资料。',
            attachTo: {
                element: '.ai-search-toggle',
                on: 'bottom'
            }
        });
        steps.push({
            id: 'view-options',
            title: '切换视图',
            text: '习惯网格视图还是列表视图？点击这里按照你的喜好切换文件显示方式。',
            attachTo: {
                element: '.view-options',
                on: 'bottom'
            }
        });
        steps.push({
            id: 'recent-uploads',
            title: '最新动态',
            text: '这里展示了最近更新的资源，方便你快速获取最新资料。',
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
                text: '在移动端，文件夹导航是收起来的。点击这个按钮可以随时打开或关闭它！',
                attachTo: {
                    element: '#mobile-sidebar-toggle',
                    on: 'bottom'
                }
            });
        } else {
            steps.push({
                id: 'folder-nav',
                title: '文件夹导航',
                text: '左侧是文件夹导航树，你可以点击文件夹名称展开或折叠，点击右侧的箭头按钮进入文件夹。',
                attachTo: {
                    element: '#folder-tree-container',
                    on: 'right'
                }
            });
            steps.push({
                id: 'knowledge-graph',
                title: '🚀 知识图谱',
                text: '探索可视化知识网络！点击这里查看文件之间的关联，发现更多有趣的知识连接。',
                attachTo: {
                    element: '#open-graph-btn',
                    on: 'right'
                }
            });
        }
        steps.push({
            id: 'guestbook',
            title: '留言板',
            text: '有什么想说的？在这里分享你的看法，或者向管理员反馈问题。',
            attachTo: {
                element: '.guestbook-form-container',
                on: 'bottom'
            }
        });
        const uploadBtn = document.getElementById('upload-btn-link');
        if (uploadBtn && uploadBtn.style.display !== 'none') {
            steps.push({
                id: 'upload-button',
                title: '上传你的资料！',
                text: '管理员可以点击这里上传文件。支持拖放上传哦！',
                attachTo: {
                    element: '#upload-btn-link',
                    on: 'top'
                }
            });
            steps.push({
                id: 'upload-path',
                title: '上传到哪里？',
                text: '看这里！面包屑导航显示了你当前所在的目录。你在这里点击上传，文件就会被传到这个位置哦。所以，上传前请先进入目标文件夹！',
                attachTo: {
                    element: '#breadcrumb-nav',
                    on: 'bottom'
                }
            });
        }
        steps.push({
            id: 'storage-limit',
            title: '关于存储容量 (´･ω･`)',
            text: '我们有大约 10GB 的免费存储空间。这个进度条会显示当前的使用情况。这不是硬性限制，但如果超出了，站长就要自掏腰包了... 所以请大家珍惜空间，上传真正有用的资料哦！',
            attachTo: {
                element: '.size-progress-container',
                on: 'bottom'
            }
        });
        if (document.querySelector('.download-button')) {
            steps.push({
                id: 'download',
                title: '下载文件',
                text: '点击“下载”按钮，即可将文件保存到你的本地设备。',
                attachTo: {
                    element: '.download-button',
                    on: 'bottom'
                }
            });
        }
        const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        if (isTouchDevice) {
            steps.push({
                id: 'mobile-actions',
                title: '📱 移动端操作提示',
                text: '在移动端，文件的操作菜单（下载、删除、重命名等）通过点击文件条目右侧的<strong>「⋮」折叠按钮</strong>展开哦！',
                attachTo: {
                    element: '.file-list',
                    on: 'top'
                }
            });
        }
        steps.push({
            id: 'selection-mode',
            title: '批量操作',
            text: '需要同时处理多个文件？点击“批量选择”按钮，即可进入多选模式，进行批量下载、移动或删除。',
            attachTo: {
                element: '#selection-mode-btn',
                on: 'bottom'
            }
        });
        if (document.querySelector('.delete-button')) {
            steps.push({
                id: 'admin-delete',
                title: '管理员功能：删除',
                text: '你拥有删除文件或文件夹的权限。请谨慎操作，此操作不可逆！',
                attachTo: {
                    element: '.delete-button',
                    on: 'bottom'
                }
            });
        }
        if (document.querySelector('.rename-button')) {
            steps.push({
                id: 'admin-rename',
                title: '管理员功能：重命名和移动',
                text: '你还可以对文件或文件夹进行重命名和移动操作，以更好地组织文件结构。',
                attachTo: {
                    element: '.rename-button',
                    on: 'bottom'
                }
            });
        }
        steps.push({
            id: 'finish',
            title: '教程结束！',
            text: '你已了解所有基本功能！开始探索吧！如果需要，可以再次点击帮助按钮回顾。祝你使用愉快！(ﾉ>ω<)ﾉ',
            buttons: [
                {
                    action() {
                        return this.cancel();
                    },
                    text: '完成'
                }
            ]
        });
    }
    tour.addSteps(steps);
    tour.start();
}