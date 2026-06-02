/** DEV MODE - Generated at 00:06:23 */
// --- Module: modules/page-viewer.js ---
(function () {
    'use strict';

    const PAGE_LIST = [
        { href: 'how_to_upload.html', title: '上传指南', icon: 'fa-cloud-upload-alt' },
        { href: 'download_help.html', title: '下载与预览', icon: 'fa-eye' },
        { href: 'search_tips.html', title: '搜索技巧', icon: 'fa-search' },
        { href: 'sharing_rules.html', title: '分享规范', icon: 'fa-book' },
        { href: 'guestbook_rules.html', title: '留言规范', icon: 'fa-comments' },
        { href: 'about.html', title: '关于小站', icon: 'fa-info-circle' }
    ];

    const PAGE_HREFS = new Set(PAGE_LIST.map(p => p.href));
    const CACHE = {};
    let isViewerOpen = false;
    let currentHref = null;

    function getPageConfig(href) {
        return PAGE_LIST.find(p => p.href === href) || null;
    }

    function createViewerDOM() {
        if (document.getElementById('page-viewer-overlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'page-viewer-overlay';
        overlay.className = 'page-viewer-overlay';

        var panel = document.createElement('div');
        panel.className = 'page-viewer-panel';

        var header = document.createElement('div');
        header.className = 'page-viewer-header';
        header.innerHTML =
            '<h2 class="page-viewer-title" id="page-viewer-title"></h2>' +
            '<div class="page-viewer-nav">' +
                '<a id="page-viewer-full-link" class="page-viewer-nav-btn" href="#" target="_blank" title="在新标签页打开">' +
                    '<i class="fas fa-external-link-alt"></i><span>新窗口</span>' +
                '</a>' +
                '<button class="page-viewer-close" id="page-viewer-close" title="关闭"><i class="fas fa-times"></i></button>' +
            '</div>';

        var body = document.createElement('div');
        body.className = 'page-viewer-body';
        body.id = 'page-viewer-body';

        panel.appendChild(header);
        panel.appendChild(body);

        var footer = document.createElement('div');
        footer.className = 'page-viewer-footer';
        footer.id = 'page-viewer-footer';

        PAGE_LIST.forEach(function (page) {
            var link = document.createElement('a');
            link.className = 'page-viewer-footer-link';
            link.href = page.href;
            link.setAttribute('data-page-href', page.href);
            link.innerHTML = '<i class="fas ' + page.icon + '"></i> ' + page.title;
            link.addEventListener('click', function (e) {
                e.preventDefault();
                openPage(page.href);
            });
            footer.appendChild(link);
        });

        panel.appendChild(footer);

        var backdrop = document.createElement('div');
        backdrop.className = 'page-viewer-backdrop';

        overlay.appendChild(backdrop);
        overlay.appendChild(panel);

        document.body.appendChild(overlay);

        document.getElementById('page-viewer-close').addEventListener('click', closeViewer);
        backdrop.addEventListener('click', closeViewer);
        document.addEventListener('keydown', handleKeyDown);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closeViewer();
            }
        });
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape' && isViewerOpen) {
            closeViewer();
        }
    }

    function updateFooterActiveState(href) {
        var footer = document.getElementById('page-viewer-footer');
        if (!footer) return;
        var links = footer.querySelectorAll('.page-viewer-footer-link');
        links.forEach(function (link) {
            if (link.getAttribute('data-page-href') === href) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    async function openPage(href) {
        var config = getPageConfig(href);
        if (!config) {
            window.location.href = href;
            return;
        }

        createViewerDOM();

        var overlay = document.getElementById('page-viewer-overlay');
        var titleEl = document.getElementById('page-viewer-title');
        var bodyEl = document.getElementById('page-viewer-body');
        var fullLink = document.getElementById('page-viewer-full-link');
        var panel = overlay.querySelector('.page-viewer-panel');

        titleEl.innerHTML = '<i class="fas ' + config.icon + '"></i> ' + config.title;
        fullLink.href = href;

        if (!isViewerOpen) {
            panel.style.transition = 'none';
            panel.style.transform = 'translateX(100%)';
            panel.offsetHeight;
            panel.style.transition = '';
            panel.style.transform = '';

            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            isViewerOpen = true;
        }

        bodyEl.innerHTML =
            '<div class="page-viewer-loader">' +
                '<div class="page-viewer-skeleton-block">' +
                    '<div class="page-viewer-skeleton-icon"></div>' +
                    '<div class="page-viewer-skeleton-lines">' +
                        '<div class="page-viewer-skeleton-line title"></div>' +
                        '<div class="page-viewer-skeleton-line"></div>' +
                        '<div class="page-viewer-skeleton-line short"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="page-viewer-skeleton-block">' +
                    '<div class="page-viewer-skeleton-icon"></div>' +
                    '<div class="page-viewer-skeleton-lines">' +
                        '<div class="page-viewer-skeleton-line title"></div>' +
                        '<div class="page-viewer-skeleton-line medium"></div>' +
                        '<div class="page-viewer-skeleton-line short"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="page-viewer-skeleton-block">' +
                    '<div class="page-viewer-skeleton-icon"></div>' +
                    '<div class="page-viewer-skeleton-lines">' +
                        '<div class="page-viewer-skeleton-line title"></div>' +
                        '<div class="page-viewer-skeleton-line"></div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        updateFooterActiveState(href);

        var previousHref = currentHref;
        currentHref = href;

        if (previousHref !== href) {
            history.pushState({ pageViewer: true, href: href }, '', href);
        }

        try {
            var html = await fetchPage(href);
            var content = extractContent(html);
            bodyEl.replaceChildren(content);
            interceptLinksInViewer(bodyEl);
        } catch (err) {
            bodyEl.innerHTML =
                '<div class="page-viewer-error">' +
                    '<i class="fas fa-exclamation-triangle"></i>' +
                    '<p>加载失败，请稍后重试</p>' +
                    '<a href="' + href + '" target="_blank">在新窗口打开</a>' +
                '</div>';
        }
    }

    async function fetchPage(href) {
        if (CACHE[href]) {
            return CACHE[href];
        }
        var resp = await fetch(href);
        if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
        var html = await resp.text();
        CACHE[href] = html;
        return html;
    }

    function extractContent(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');

        var main = doc.querySelector('main');
        var fragment = document.createDocumentFragment();

        if (main) {
            var content = main.querySelector('.page-content') || main.querySelector('section') || main;
            var cloned = document.importNode(content, true);
            cloned.style.paddingTop = '';
            fragment.appendChild(cloned);
        } else {
            var body = doc.body;
            if (body) {
                fragment.appendChild(document.importNode(body, true));
            }
        }

        return fragment;
    }

    function interceptLinksInViewer(container) {
        var links = container.querySelectorAll('a[href]');
        links.forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href) return;
            var cleanHref = href.split('#')[0].split('?')[0];
            if (PAGE_HREFS.has(cleanHref)) {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    openPage(cleanHref);
                });
            } else if (cleanHref === 'index.html' || cleanHref === '') {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    closeViewerAndGoHome();
                });
            }
        });
    }

    function closeViewerAndGoHome() {
        if (currentHref) {
            var homeUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'index.html';
            var currentUrl = window.location.href;
            if (currentUrl !== homeUrl) {
                history.pushState({}, '', 'index.html');
            }
        }
        closeViewer(true);
    }

    function closeViewer(skipHistory) {
        if (!isViewerOpen) return;
        var overlay = document.getElementById('page-viewer-overlay');
        if (!overlay) return;

        overlay.classList.remove('active');
        document.body.style.overflow = '';
        isViewerOpen = false;

        if (skipHistory !== true) {
            if (currentHref && window.location.pathname.includes(currentHref)) {
                var homePath = window.location.pathname.replace(currentHref, 'index.html');
                history.pushState({}, '', homePath);
            } else {
                history.pushState({}, '', 'index.html');
            }
        }

        currentHref = null;
    }

    function init() {
        createViewerDOM();

        interceptFooterLinks();
        interceptBodyLinks();
        interceptNavBackLinks();

        window.addEventListener('popstate', function (e) {
            if (e.state && e.state.pageViewer && e.state.href) {
                if (!isViewerOpen) {
                    openPage(e.state.href);
                }
            } else {
                if (isViewerOpen) {
                    closeViewer(true);
                }
            }
        });
    }

    function interceptFooterLinks() {
        var footerLinks = document.querySelectorAll('.footer a[href]');
        footerLinks.forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href) return;
            var cleanHref = href.split('#')[0].split('?')[0];
            if (PAGE_HREFS.has(cleanHref)) {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    openPage(cleanHref);
                });
            }
        });
    }

    function interceptBodyLinks() {
        var bodyLinks = document.querySelectorAll('a[href]');
        bodyLinks.forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href) return;
            var cleanHref = href.split('#')[0].split('?')[0];
            if (PAGE_HREFS.has(cleanHref)) {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    openPage(cleanHref);
                });
            }
        });
    }

    function interceptNavBackLinks() {
        var backLinks = document.querySelectorAll('a[href="index.html"]');
        backLinks.forEach(function (link) {
            if (link.closest('.page-viewer-overlay')) return;
            var isOnSubPage = PAGE_HREFS.has(window.location.pathname.split('/').pop());
            if (!isOnSubPage) return;
            link.addEventListener('click', function (e) {
                e.preventDefault();
                window.location.href = 'index.html';
            });
        });
    }

    function cleanup() {
        document.removeEventListener('keydown', handleKeyDown);
        var overlay = document.getElementById('page-viewer-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.PageViewer = {
        open: openPage,
        close: closeViewer,
        cleanup: cleanup,
        PAGE_LIST: PAGE_LIST
    };
})();

