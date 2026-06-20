document.addEventListener('DOMContentLoaded', () => {
    function getAutoTheme() {
        const hour = new Date().getHours();
        return (hour >= 18 || hour < 6) ? 'dark' : 'light';
    }
    const userPreference = localStorage.getItem('theme');
    const autoThemeSaved = localStorage.getItem('autoTheme');
    let currentTheme;
    if (userPreference && autoThemeSaved !== 'true') {
        currentTheme = userPreference;
    } else {
        currentTheme = getAutoTheme();
        localStorage.setItem('autoTheme', 'true');
    }
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        themeToggle.addEventListener('click', () => {
            const isCurrentDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isCurrentDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            localStorage.setItem('autoTheme', 'false');
            const clickIcon = themeToggle.querySelector('i');
            if (clickIcon) {
                clickIcon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
            if (typeof createParticleBackground === 'function') {
                createParticleBackground();
            }
        });
    }
    checkAuth();
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navActions = document.querySelector('.nav-actions');
    if (mobileMenuToggle && navActions) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navActions.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (navActions.classList.contains('active') && !navActions.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                navActions.classList.remove('active');
            }
        });
    }
});
