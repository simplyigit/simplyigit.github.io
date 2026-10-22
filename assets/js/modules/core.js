// Core shared utilities and global observers
export const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

export function initGlobalReveal() {
    // When arriving via a cross-document view transition, the page crossfade already provides the
    // entrance. Hiding above-the-fold elements again would make them blink out mid-crossfade (Safari).
    const arrivedViaTransition = document.documentElement.classList.contains('vt-nav');
    const vh = window.innerHeight || document.documentElement.clientHeight;

    document.querySelectorAll('.glass-card:not(.fade-in), .section-title:not(.fade-in), .hero p:not(.fade-in), .social-tube:not(.fade-in)').forEach(el => {
        if (arrivedViaTransition) {
            const r = el.getBoundingClientRect();
            if (r.top < vh && r.bottom > 0) return;
        }
        el.classList.add('reveal');
        observer.observe(el);
    });
}

export function safeImg(url, width = 0) {
    if (!url) return '';
    if ((url.includes('a.ltrbxd.com') || url.includes('i.gr-assets.com')) && !url.includes('wsrv.nl')) {
        const wParam = width > 0 ? `&w=${width}` : '';
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}${wParam}&output=webp`;
    }
    return url;
}

export function initAmbientMesh() {
    // Inject hardware-accelerated ambient meshes
    if (!document.getElementById('ambient-mesh')) {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="ambient-mesh">
                <div class="orb orb-1"></div>
                <div class="orb orb-2"></div>
                <div class="orb orb-3"></div>
            </div>
        `);
    }

    let scrollPercent = 0;
    let ticking = false;
    let winHeight = window.innerHeight || 1080;

    const ambientMesh = document.getElementById('ambient-mesh');

    // Orbs drift with scroll only (no mouse-follow)
    const updateMesh = () => {
        if (!ambientMesh || document.hidden) {
            ticking = false;
            return;
        }

        const y1 = 20 + (scrollPercent * 40);
        const x1 = 20;
        const y2 = 80 - (scrollPercent * 50);
        const x2 = 80;
        const y3 = 50 + (scrollPercent * 30);
        const x3 = 50 + (scrollPercent * 20);

        ambientMesh.style.setProperty('--bg-y1', `${y1}vh`);
        ambientMesh.style.setProperty('--bg-x1', `${x1}vw`);
        ambientMesh.style.setProperty('--bg-y2', `${y2}vh`);
        ambientMesh.style.setProperty('--bg-x2', `${x2}vw`);
        ambientMesh.style.setProperty('--bg-y3', `${y3}vh`);
        ambientMesh.style.setProperty('--bg-x3', `${x3}vw`);
        
        ticking = false;
    };

    window.addEventListener('resize', () => {
        winHeight = window.innerHeight || 1080;
    }, { passive: true });

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - winHeight;
        scrollPercent = maxScroll > 0 ? scrolled / maxScroll : 0;
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    }, { passive: true });

    initFocusPause();
}

let focusPauseInitialized = false;

// Toggles html.page-inactive when the tab is hidden or the window loses focus,
// which pauses all looping CSS animations (see styles.css).
export function initFocusPause() {
    if (focusPauseInitialized) return;
    focusPauseInitialized = true;

    const root = document.documentElement;
    const sync = () => {
        const inactive = document.hidden || !document.hasFocus();
        root.classList.toggle('page-inactive', inactive);
    };

    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    window.addEventListener('pageshow', sync);
    sync();
}

export function initGlassParallax() {
    // Only apply 3D cursor tilt on devices with hover and a fine pointer
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const cards = document.querySelectorAll('.glass-card:not(.list-card)');
    cards.forEach(card => {
        if (card.dataset.parallaxInitialized) return;
        card.dataset.parallaxInitialized = "true";

        let rect = null;

        card.addEventListener('mouseenter', () => {
            rect = card.getBoundingClientRect();
        });

        card.addEventListener('mousemove', e => {
            if (!rect) rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty("--mouse-x", `${x}px`);
            card.style.setProperty("--mouse-y", `${y}px`);

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -4;
            const rotateY = ((x - centerX) / centerX) * 4;

            card.style.transition = 'none';
            card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            rect = null;
            card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease';
        });
    });
}

// --- Zero-Flicker Preload & Smooth Morph Utilities ---

export function toTransitionSlug(prefix, raw) {
    const clean = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 36);
    return clean ? `vt-${prefix}-${clean}` : '';
}

export async function preloadImages(urls = [], timeoutMs = 2200) {
    const unique = [...new Set((urls || []).filter(Boolean))];
    if (unique.length === 0) return;

    const decodeOne = (url) => new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        const done = () => resolve();
        img.onload = () => {
            if (typeof img.decode === 'function') {
                img.decode().then(done).catch(done);
            } else {
                done();
            }
        };
        img.onerror = done;
        img.src = url;
    });

    await Promise.race([
        Promise.all(unique.map(decodeOne)),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
}

export async function awaitFastPrefetch(fetchPromise, maxWaitMs = 65) {
    if (!fetchPromise) return null;
    try {
        const winner = await Promise.race([
            fetchPromise.then(val => ({ resolved: true, val })).catch(() => ({ resolved: true, val: null })),
            new Promise(resolve => setTimeout(() => resolve({ resolved: false, val: null }), maxWaitMs))
        ]);
        return winner.resolved ? winner.val : null;
    } catch {
        return null;
    }
}

let activeViewTransition = false;

export async function smoothMorph(targetEl, updateFn, imageUrls = []) {
    if (!targetEl) {
        updateFn();
        return;
    }

    // 1. Pre-decode all new images offscreen BEFORE touching the DOM
    if (imageUrls && imageUrls.length > 0) {
        await preloadImages(imageUrls);
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    targetEl.classList.add('morph-settled');
    if (reducedMotion || document.hidden) {
        updateFn();
        return;
    }

    // 2. Use View Transitions API when available and not already running a transition
    if (typeof document.startViewTransition === 'function' && !activeViewTransition) {
        activeViewTransition = true;

        // Never interrupt the cross-document page navigation transition (starting a new
        // transition would skip it and cause a full-page snap). Wait for it to finish first.
        const navVT = window.__NAV_VT__ || document.activeViewTransition;
        if (navVT && navVT.finished) {
            try { await navVT.finished; } catch {}
        }
        window.__NAV_VT__ = null;

        const root = document.documentElement;
        root.classList.add('vt-data-morph');
        targetEl.classList.add('vt-morph-scope');
        try {
            const vt = document.startViewTransition(() => {
                updateFn();
            });
            await vt.finished;
        } catch {
            updateFn();
        } finally {
            targetEl.classList.remove('vt-morph-scope');
            root.classList.remove('vt-data-morph');
            activeViewTransition = false;
        }
        return;
    }

    // 3. Compositor blur-scale morph fallback (also used when multiple sections update simultaneously)
    targetEl.classList.remove('data-morph-in');
    targetEl.classList.add('data-morph-out');
    await new Promise(resolve => setTimeout(resolve, 170));
    updateFn();
    void targetEl.offsetWidth;
    targetEl.classList.remove('data-morph-out');
    targetEl.classList.add('data-morph-in');
    setTimeout(() => {
        targetEl.classList.remove('data-morph-in');
    }, 460);
}

export function morphText(el, newText) {
    if (!el || el.textContent === String(newText)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = newText;
        return;
    }
    el.classList.remove('text-morph-in');
    el.classList.add('text-morph-out');
    setTimeout(() => {
        el.textContent = newText;
        el.classList.remove('text-morph-out');
        el.classList.add('text-morph-in');
        setTimeout(() => el.classList.remove('text-morph-in'), 360);
    }, 140);
}

