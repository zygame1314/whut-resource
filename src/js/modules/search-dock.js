// --- Module: search-dock.js ---
// 搜索框滚动跟随：当搜索框自然滚到顶栏下缘时原地吸附跟随，滚回顶部时原地还原，全程无跳变。
(function () {
    const container = document.querySelector('.search-container.standalone');
    if (!container) return;

    const NAV_OFFSET = 71; // 顶栏高度（70px 内容 + 1px 边框）
    const SPACER_ID = 'search-dock-spacer';

    let spacer = document.getElementById(SPACER_ID);
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = SPACER_ID;
        spacer.style.display = 'none';
        container.parentNode.insertBefore(spacer, container.nextSibling);
    }

    let docked = false;

    // 搜索框在文档流中的原始位置：未吸附时取容器自身，吸附后容器已脱离流，改由等高占位元素提供
    function flowTop() {
        const el = docked ? spacer : container;
        return el.getBoundingClientRect().top + window.scrollY;
    }

    function dock() {
        // 复制外边距，保证占位后下方内容不因外边距折叠变化而跳动
        const cs = getComputedStyle(container);
        spacer.style.marginTop = cs.marginTop;
        spacer.style.marginBottom = cs.marginBottom;
        spacer.style.display = 'block';
        spacer.style.height = container.offsetHeight + 'px';
        docked = true;
        container.classList.add('docked');
    }

    function undock() {
        docked = false;
        container.classList.remove('docked');
        spacer.style.display = 'none';
    }

    function update() {
        // 搜索框顶边触及顶栏下缘时吸附；回到该位置之上时还原
        const shouldDock = window.scrollY >= flowTop() - NAV_OFFSET;
        if (shouldDock === docked) return;
        if (shouldDock) dock();
        else undock();
    }

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            update();
            ticking = false;
        });
    }, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
})();