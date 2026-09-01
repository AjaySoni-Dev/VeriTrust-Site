/* Z Sphere — Light Theme & High-Performance Motion Controller */
(function () {
    'use strict';

    // Enforce light theme across the application
    document.documentElement.setAttribute('data-theme', 'light');

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let headerRaf = null;
    function syncHeader() {
        if (headerRaf) return;
        headerRaf = requestAnimationFrame(() => {
            const header = document.querySelector('.site-header');
            if (header) {
                header.classList.toggle('scrolled', window.scrollY > 12);
            }
            headerRaf = null;
        });
    }

    function initHeroPointer() {
        if (reducedMotion) return;
        const hero = document.querySelector('.hero');
        if (!hero) return;

        let pointerRaf = null;
        hero.addEventListener('pointermove', (event) => {
            if (pointerRaf) return;
            pointerRaf = requestAnimationFrame(() => {
                const rect = hero.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                hero.style.setProperty('--hero-x', `${Math.max(0, Math.min(100, x)).toFixed(1)}%`);
                hero.style.setProperty('--hero-y', `${Math.max(0, Math.min(100, y)).toFixed(1)}%`);
                pointerRaf = null;
            });
        }, { passive: true });

        hero.addEventListener('pointerleave', () => {
            if (pointerRaf) cancelAnimationFrame(pointerRaf);
            hero.style.setProperty('--hero-x', '50%');
            hero.style.setProperty('--hero-y', '0%');
            pointerRaf = null;
        }, { passive: true });
    }

    function init() {
        // Defensive cleanup of any stale theme toggle buttons
        document.querySelectorAll('.theme-toggle-btn').forEach((btn) => btn.remove());

        syncHeader();
        initHeroPointer();

        window.addEventListener('scroll', syncHeader, { passive: true });

        if (window.ZSphereUI && typeof window.ZSphereUI.initRevealObserver === 'function') {
            window.ZSphereUI.initRevealObserver();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
