document.addEventListener('DOMContentLoaded', () => {
    var THEMES = [
        { id: 'light', name: '浅色', icon: 'fas fa-sun', preview: ['#FFFFFF', '#007BFF', '#2C3E50'], elements: ['fa-microchip', 'fa-flask', 'fa-cogs', 'fa-code'] },
        { id: 'dark', name: '深色', icon: 'fas fa-moon', preview: ['#1A1A2E', '#007BFF', '#EAEAEA'], elements: ['fa-moon', 'fa-star', 'fa-bolt', 'fa-shield-alt'] },
        { id: 'sepia', name: '护眼', icon: 'fas fa-leaf', preview: ['#F5E6C8', '#8B5A2B', '#4A3728'], elements: ['fa-book', 'fa-feather', 'fa-pen', 'fa-scroll'] },
        { id: 'ocean', name: '海洋', icon: 'fas fa-water', preview: ['#F0F9FF', '#0EA5E9', '#0C4A6E'], elements: ['fa-fish', 'fa-ship', 'fa-anchor', 'fa-water'] },
        { id: 'forest', name: '森林', icon: 'fas fa-tree', preview: ['#F0FDF4', '#16A34A', '#14532D'], elements: ['fa-tree', 'fa-leaf', 'fa-paw', 'fa-bug'] },
        { id: 'nord', name: '极地', icon: 'fas fa-snowflake', preview: ['#ECEFF4', '#5E81AC', '#2E3440'], elements: ['fa-snowflake', 'fa-mountain', 'fa-cloud', 'fa-wind'] },
        { id: 'rose', name: '玫瑰', icon: 'fas fa-heart', preview: ['#FDF2F8', '#EC4899', '#831843'], elements: ['fa-heart', 'fa-spa', 'fa-gift', 'fa-music'] }
    ];
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
                const preview = th.preview ? ('<span class="theme-preview">' +
                    th.preview.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') +
                    '</span>') : '';
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
            themeMenu.classList.toggle('show');
        });
        document.addEventListener('click', function (e) {
            if (themeMenu.classList.contains('show') &&
                !themeMenu.contains(e.target) &&
                !themeToggle.contains(e.target)) {
                themeMenu.classList.remove('show');
            }
        });
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
