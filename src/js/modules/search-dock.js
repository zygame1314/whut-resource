(function () {
    const container = document.querySelector('.search-container.standalone');
    if (!container) return;

    const NAV_OFFSET = 71;
    const SPACER_ID = 'search-dock-spacer';

    let spacer = document.getElementById(SPACER_ID);
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = SPACER_ID;
        spacer.style.display = 'none';
        container.parentNode.insertBefore(spacer, container.nextSibling);
    }

    let docked = false;

    function flowTop() {
        const el = docked ? spacer : container;
        return el.getBoundingClientRect().top + window.scrollY;
    }

    function dock() {
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