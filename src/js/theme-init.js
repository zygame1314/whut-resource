(function () {
    var t = localStorage.getItem('theme');
    var auto = localStorage.getItem('autoTheme');
    if (!t || auto === 'true') {
        var h = new Date().getHours();
        t = (h >= 18 || h < 6) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
})();