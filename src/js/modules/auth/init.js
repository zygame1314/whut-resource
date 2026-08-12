document.addEventListener('DOMContentLoaded', () => {
    var THEMES = [
        { id: 'light', name: '浅色', icon: 'fas fa-sun', elements: ['fa-microchip', 'fa-flask', 'fa-cogs', 'fa-code'] },
        { id: 'dark', name: '深色', icon: 'fas fa-moon', elements: ['fa-moon', 'fa-star', 'fa-bolt', 'fa-shield-alt'] },
        { id: 'sepia', name: '古典', icon: 'fas fa-leaf', elements: ['fa-book', 'fa-feather', 'fa-pen', 'fa-scroll'] },
        { id: 'ocean', name: '海洋', icon: 'fas fa-water', elements: ['fa-fish', 'fa-ship', 'fa-anchor', 'fa-water'] },
        { id: 'forest', name: '森林', icon: 'fas fa-tree', elements: ['fa-tree', 'fa-leaf', 'fa-paw', 'fa-bug'] },
        { id: 'nord', name: '极地', icon: 'fas fa-snowflake', elements: ['fa-snowflake', 'fa-mountain', 'fa-cloud', 'fa-wind'] },
        { id: 'rose', name: '玫瑰', icon: 'fas fa-heart', elements: ['fa-heart', 'fa-spa', 'fa-gift', 'fa-music'] },
        { id: 'cyberpunk', name: '赛博', icon: 'fas fa-bolt', elements: ['fa-bolt', 'fa-microchip', 'fa-terminal', 'fa-robot'] },
        { id: 'terminal', name: '终端', icon: 'fas fa-terminal', elements: ['fa-terminal', 'fa-code', 'fa-bug', 'fa-server'] },
        { id: 'volcano', name: '火山', icon: 'fas fa-volcano', elements: ['fa-fire', 'fa-mountain', 'fa-burn', 'fa-meteor'] }
    ];
    function getThemePreview(id) {
        const root = document.documentElement;
        const prev = root.getAttribute('data-theme');
        root.setAttribute('data-theme', id);
        const cs = getComputedStyle(root);
        const colors = [cs.getPropertyValue('--background').trim(), cs.getPropertyValue('--primary-color').trim(), cs.getPropertyValue('--text-primary').trim()];
        root.setAttribute('data-theme', prev);
        return colors;
    }
    function getAutoTheme() {
        const hour = new Date().getHours();
        return (hour >= 18 || hour < 6) ? 'dark' : 'light';
    }
    function isValidTheme(t) {
        return THEMES.some(function (th) { return th.id === t; });
    }
    function updateElementIcons() {
        const meta = THEMES.find(function (th) { return th.id === currentTheme; });
        if (!meta || !meta.elements) return;
        document.querySelectorAll('.floating-elements .element').forEach(function (el, i) {
            const icon = el.querySelector('i');
            if (icon && meta.elements[i]) {
                icon.className = 'fas ' + meta.elements[i];
            }
        });
    }
    const userPreference = localStorage.getItem('theme');
    const autoThemeSaved = localStorage.getItem('autoTheme');
    let currentTheme;
    if (userPreference && isValidTheme(userPreference) && autoThemeSaved !== 'true') {
        currentTheme = userPreference;
    } else {
        currentTheme = getAutoTheme();
        localStorage.setItem('autoTheme', 'true');
    }
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateElementIcons();

    const themeToggle = document.getElementById('theme-toggle');
    const themeMenu = document.getElementById('theme-menu');
    if (themeToggle && themeMenu) {
        const toggleIcon = themeToggle.querySelector('i');
        function updateToggleIcon() {
            const meta = THEMES.find(function (th) { return th.id === currentTheme; });
            if (toggleIcon && meta) toggleIcon.className = meta.icon;
        }
        updateToggleIcon();

        function renderMenu() {
            themeMenu.innerHTML = '';
            THEMES.forEach(function (th) {
                const item = document.createElement('button');
                item.className = 'theme-menu-item' + (th.id === currentTheme ? ' active' : '');
                item.setAttribute('data-theme-id', th.id);
                const preview = '<span class="theme-preview">' +
                    getThemePreview(th.id).map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') +
                    '</span>';
                item.innerHTML = '<i class="' + th.icon + '"></i><span>' + th.name + '</span>' + preview;
                item.addEventListener('click', function (e) {
                    e.stopPropagation();
                    currentTheme = th.id;
                    document.documentElement.setAttribute('data-theme', th.id);
                    localStorage.setItem('theme', th.id);
                    localStorage.setItem('autoTheme', 'false');
                    updateToggleIcon();
                    updateElementIcons();
                    themeMenu.querySelectorAll('.theme-menu-item').forEach(function (el) {
                        el.classList.toggle('active', el.getAttribute('data-theme-id') === th.id);
                    });
                    themeMenu.classList.remove('show');
                    if (typeof createParticleBackground === 'function') {
                        createParticleBackground();
                    }
                });
                themeMenu.appendChild(item);
            });
        }
        renderMenu();

        themeToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            const willShow = !themeMenu.classList.contains('show');
            themeMenu.classList.toggle('show');
            if (willShow && !themeToggle.dataset.triedOnce) {
                themeToggle.dataset.triedOnce = 'true';
            }
        });
        document.addEventListener('click', function (e) {
            if (themeMenu.classList.contains('show') &&
                !themeMenu.contains(e.target) &&
                !themeToggle.contains(e.target)) {
                themeMenu.classList.remove('show');
            }
        });

        if (!themeToggle.dataset.triedOnce &&
            !localStorage.getItem('themeTriedOnce')) {
            const hint = document.createElement('span');
            hint.className = 'theme-toggle-hint';
            hint.textContent = '点我换肤';
            themeToggle.style.position = 'relative';
            themeToggle.appendChild(hint);
            const removeHint = function () {
                if (hint.parentNode) hint.remove();
                try { localStorage.setItem('themeTriedOnce', 'true'); } catch (e) {}
                themeToggle.dataset.triedOnce = 'true';
            };
            hint.addEventListener('click', function (ev) {
                ev.stopPropagation();
                themeMenu.classList.toggle('show');
                removeHint();
            });
            themeToggle.addEventListener('click', removeHint, { once: true });
            setTimeout(removeHint, 12000);
        }
    }
    checkAuth();
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navActions = document.querySelector('.nav-actions');
    if (mobileMenuToggle && navActions) {
        const syncToggleState = () => {
            mobileMenuToggle.classList.toggle('menu-open', navActions.classList.contains('active'));
        };
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navActions.classList.toggle('active');
            syncToggleState();
        });
        document.addEventListener('click', (e) => {
            if (navActions.classList.contains('active') && !navActions.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                navActions.classList.remove('active');
                syncToggleState();
            }
        });
    }
});
