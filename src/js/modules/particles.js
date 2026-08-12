(function () {
    if (window.__particleBackgroundInitialized) {
        if (typeof window.__particleBackgroundImpl === 'function') {
            window.createParticleBackground = window.__particleBackgroundImpl;
        }
        return;
    }
    window.__particleBackgroundInitialized = true;

    const THEME_CONFIG = {
        light: {
            colors: ['#007BFF', '#4DA3FF', '#FF6B6B'],
            icons: ['fa-book', 'fa-graduation-cap', 'fa-lightbulb'],
            motion: 'float',
            density: 15
        },
        dark: {
            colors: ['#81A1C1', '#88C0D0', '#B48EAD'],
            icons: ['fa-moon', 'fa-star', 'fa-meteor'],
            motion: 'orbit',
            density: 15
        },
        sepia: {
            colors: ['#8B5A2B', '#B5895A', '#C0392B'],
            icons: ['fa-book-open', 'fa-feather-alt', 'fa-scroll'],
            motion: 'drift',
            density: 10
        },
        ocean: {
            colors: ['#0EA5E9', '#38BDF8', '#F97316'],
            icons: ['fa-water', 'fa-fish', 'fa-anchor'],
            motion: 'riseFast',
            density: 10
        },
        forest: {
            colors: ['#16A34A', '#4ADE80', '#EAB308'],
            icons: ['fa-leaf', 'fa-tree', 'fa-seedling'],
            motion: 'fall',
            density: 15
        },
        nord: {
            colors: ['#5E81AC', '#88C0D0', '#D08770'],
            icons: ['fa-snowflake', 'fa-icicles', 'fa-mountain'],
            motion: 'fall',
            density: 15
        },
        rose: {
            colors: ['#FF7B9D', '#FFB3C6', '#FFB347'],
            icons: ['fa-heart', 'fa-magic', 'fa-leaf'],
            motion: 'float',
            density: 15
        },
        cyberpunk: {
            colors: ['#FF00FF', '#00F0FF', '#9D00FF', '#00FF9D'],
            icons: ['fa-bolt', 'fa-microchip', 'fa-terminal', 'fa-robot'],
            motion: 'riseFast',
            density: 20
        }
    };

    let particleElements = [];

    function getThemeName() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function hexToRgba(hex, alpha) {
        const clean = hex.replace('#', '');
        const bigint = parseInt(clean, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function buildParticle(themeCfg) {
        const wrapper = document.createElement('div');
        wrapper.className = 'particle-base';
        const iconEl = document.createElement('i');
        iconEl.className = `fas ${pick(themeCfg.icons)}`;

        const color = pick(themeCfg.colors);
        const size = Math.round(randomRange(10, 22));
        const left = Math.random() * 100;
        const top = Math.random() * 100 - 10;
        const isRiseFast = themeCfg.motion === 'riseFast';
        const duration = isRiseFast ? randomRange(7, 14) : randomRange(14, 28);
        const delay = randomRange(0, duration * -1);
        const drift = isRiseFast ? 0 : randomRange(-70, 70);
        const rotate = randomRange(180, 720) * (Math.random() > 0.5 ? 1 : -1);
        const opacity = randomRange(0.45, 0.9);

        wrapper.style.left = `${left}%`;
        wrapper.style.top = `${top}%`;
        wrapper.style.setProperty('--particle-drift', `${drift}px`);
        wrapper.style.setProperty('--particle-rotate', `${rotate}deg`);
        wrapper.style.setProperty('--particle-peak-opacity', opacity.toFixed(2));

        iconEl.style.color = hexToRgba(color, opacity);
        iconEl.style.fontSize = `${size}px`;
        iconEl.style.textShadow = `0 0 ${Math.round(size * 1.2)}px ${hexToRgba(color, 0.55)}`;

        let motionAnimation = 'particleFloat';
        if (themeCfg.motion === 'drift') motionAnimation = 'particleFloat, particleDrift';
        if (themeCfg.motion === 'fall') motionAnimation = 'particleFall';
        if (isRiseFast) motionAnimation = 'particleRiseFast';
        if (themeCfg.motion === 'orbit') motionAnimation = 'particleOrbit';
        wrapper.style.animation = `${motionAnimation} ${duration}s linear infinite`;
        wrapper.style.animationDelay = `${delay}s`;

        wrapper.appendChild(iconEl);

        return { el: wrapper, x: left, y: top, size, color, opacity };
    }

    function removeAll(container) {
        particleElements = [];
        container.innerHTML = '';
    }

    window.__particleBackgroundImpl = function createParticleBackground() {
        const container = document.getElementById('particles-background');
        if (!container) return;
        removeAll(container);

        const themeName = getThemeName();
        const themeCfg = THEME_CONFIG[themeName] || THEME_CONFIG.light;
        const baseWidth = 1200;
        const areaFactor = Math.max(0.6, Math.min(2.0, (window.innerWidth * window.innerHeight) / (baseWidth * 800)));
        const count = Math.max(10, Math.min(50, Math.round(themeCfg.density * areaFactor)));

        for (let i = 0; i < count; i++) {
            const p = buildParticle(themeCfg);
            particleElements.push(p);
            container.appendChild(p.el);
        }
    };
    window.createParticleBackground = window.__particleBackgroundImpl;
})();

function createParticleBackground() {
    if (typeof window.createParticleBackground === 'function' &&
        window.createParticleBackground !== createParticleBackground) {
        window.createParticleBackground();
    }
}