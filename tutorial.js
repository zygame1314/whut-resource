function startTutorial() {
    const isAdmin = typeof getAdminPassword === 'function' && getAdminPassword();
    const isAuthenticated = typeof isUserAuthenticated === 'function' && isUserAuthenticated();

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
        title: '欢迎来到生科树洞！(づ｡◕‿‿◕｡)づ',
        text: '这是一个互动教程，将引导你了解平台的主要功能。你可以随时点击右上角的 <i class="fas fa-question-circle"></i> 图标重新开始哦。',
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
                title: '第一步：验证',
                text: '在移动端，验证、主题切换等功能都收纳在“更多”菜单里了。点开看看吧！',
                attachTo: {
                    element: '#mobile-menu-toggle',
                    on: 'left'
                }
            });
        } else {
            steps.push({
                id: 'auth',
                title: '第一步：验证',
                text: '要访问文件，你首先需要点击这里进行口令验证。这是保护我们共享资源的第一道防线！',
                attachTo: {
                    element: '#login-button',
                    on: 'bottom'
                }
            });
        }
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
    }


    const uploadBtn = document.getElementById('upload-btn-link');
    if (uploadBtn && uploadBtn.style.display !== 'none') {
        steps.push({
            id: 'upload-button',
            title: '上传你的资料！',
            text: '是的，你没看错！所有人都可以上传文件，分享是这个社区的核心精神！(ゝ∀･)',
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

    steps.push({
        id: 'selection-mode',
        title: '批量操作',
        text: '需要同时处理多个文件？点击“批量选择”按钮，即可进入多选模式，进行批量下载、移动或删除。',
        attachTo: {
            element: '#selection-mode-btn',
            on: 'bottom'
        }
    });

    if (isAdmin) {
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

    tour.addSteps(steps);
    tour.start();
}