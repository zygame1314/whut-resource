/** DEV MODE - Generated at 21:12:40 */
// --- Module: theme-init.js ---
(function () {
    var VALID = ['light', 'dark', 'sepia', 'ocean', 'forest', 'nord', 'rose'];
    var t = localStorage.getItem('theme');
    var auto = localStorage.getItem('autoTheme');
    if (!t || VALID.indexOf(t) === -1 || auto === 'true') {
        var h = new Date().getHours();
        t = (h >= 18 || h < 6) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
})();

