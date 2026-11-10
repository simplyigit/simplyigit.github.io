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

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape third-party text (titles, names, links) before interpolating it into innerHTML
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

const PROXIED_IMAGE_HOSTS = ['a.ltrbxd.com', 'i.gr-assets.com'];

// Letterboxd/Goodreads covers go through wsrv.nl (resized WebP; also dodges ISP blocks on their CDNs)
export function safeImg(url, width = 0) {
    if (!url) return '';
    // Cached data from older API responses holds bare "wsrv.nl/?url=..." wrappers: unwrap and size them
    if (url.startsWith('https://wsrv.nl/')) {
        let inner = null;
        try { inner = new URL(url).searchParams.get('url'); } catch {}
        if (!inner || !PROXIED_IMAGE_HOSTS.some(host => inner.includes(host))) return url;
        url = inner;
    }
    if (PROXIED_IMAGE_HOSTS.some(host => url.includes(host))) {
        const wParam = width > 0 ? `&w=${width}` : '';
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}${wParam}&output=webp`;
    }
    return url;
}

// The mesh's orbs per layout, as fractions of the canvas: centre, radius, strength and resting
// colour over #020813. An orb with a `slot` takes that tint's hue (setAmbientTint) at its own
// `lightness`, optionally turned by `hueShift` degrees.
const MESH_LAYOUTS = {
    // Every page: blue top-left, purple bottom-right, teal centre. The page's one tint ("music":
    // the music page's first cover) recolours the last two.
    default: [
        { x: 0.20, y: 0.22, r: 0.38, a: 0.40, color: [3, 26, 57] },
        { x: 0.80, y: 0.78, r: 0.34, a: 0.35, color: [43, 5, 73], slot: 'music', lightness: 0.15 },
        { x: 0.50, y: 0.50, r: 0.42, a: 0.20, color: [1, 65, 65], slot: 'music', lightness: 0.12, hueShift: 30 }
    ],
    // Homepage: one glow per library object, where the objects sit: the book's cover colour
    // bottom-left, the #1 track's in the middle, the latest film's bottom-right
    library: [
        { x: 0.14, y: 0.80, r: 0.36, a: 0.38, color: [3, 26, 57], slot: 'book', lightness: 0.15 },
        { x: 0.50, y: 0.56, r: 0.40, a: 0.24, color: [1, 65, 65], slot: 'music', lightness: 0.13 },
        { x: 0.86, y: 0.80, r: 0.36, a: 0.38, color: [43, 5, 73], slot: 'cinema', lightness: 0.15 }
    ]
};
const MESH_TINTS_KEY = 'simplyigit_mesh_tints';

function isRgb(color) {
    return Array.isArray(color) && color.length === 3 && color.every(c => Number.isFinite(Number(c)));
}

function hslToRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const channel = (n) => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [channel(0), channel(8), channel(4)];
}

// Hue (degrees) and saturation of a colour, or null for greys, which have no usable hue
function hueOf(rgb) {
    if (!isRgb(rgb)) return null;
    const [r, g, b] = rgb.map(c => Math.max(0, Math.min(255, Number(c))) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta < 0.04) return null;
    const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    const lightness = (max + min) / 2;
    return { hue: (hue * 60 + 360) % 360, saturation: delta / (1 - Math.abs(2 * lightness - 1)) };
}

// A cover's dominant colour at the mesh's own depth: its hue, deeply saturated and dark.
// Null for greys, so the orb keeps its resting colour.
function meshTint(rgb, lightness, hueShift = 0) {
    const source = hueOf(rgb);
    if (!source) return null;
    const depth = 0.55 + 0.35 * Math.min(1, source.saturation / 0.5);
    const color = hslToRgb((source.hue + hueShift) % 360, depth, lightness);
    // Yellows and greens are far brighter than purple at the same lightness: cap their luma
    const luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
    return luma > 40 ? color.map(c => Math.round(c * 40 / luma)) : color;
}

// A brighter take on the same hue, for the faint glow inside the homepage's library cards
export function glowColor(rgb) {
    const source = hueOf(rgb);
    return source ? hslToRgb(source.hue, Math.max(0.45, Math.min(0.85, source.saturation)), 0.55) : null;
}

function meshOrbColors(layout, tints) {
    return MESH_LAYOUTS[layout].map(orb => (orb.slot && meshTint(tints[orb.slot], orb.lightness, orb.hueShift)) || orb.color);
}

function readStoredTints() {
    try {
        const stored = JSON.parse(localStorage.getItem(MESH_TINTS_KEY));
        return stored && typeof stored === 'object' ? stored : {};
    } catch {
        return {};
    }
}

// A single floating-point, triangular-dithered canvas (no 8-bit banding) of a layout's orbs
function paintMeshCanvas(layout, colors) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ambient-mesh-canvas';
    const W = 540, H = 360;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    const img = ctx.createImageData(W, H);
    const data = img.data;
    const orbs = MESH_LAYOUTS[layout];
    const count = orbs.length;
    // Gaussian falloff per orb, separable into a row and a column profile
    const gx = orbs.map(o => {
        const arr = new Float32Array(W);
        for (let x = 0; x < W; x++) {
            const d = (x - o.x * W) / (o.r * W);
            arr[x] = o.a * Math.exp(-d * d * 1.35);
        }
        return arr;
    });
    const gy = orbs.map(o => {
        const arr = new Float32Array(H);
        for (let y = 0; y < H; y++) {
            const d = (y - o.y * H) / (o.r * H);
            arr[y] = Math.exp(-d * d * 1.35);
        }
        return arr;
    });

    let seed = 2463534242, idx = 0;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            // Floating-point blend of each orb in turn over #020813 (2, 8, 19)
            let R = 2.0, G = 8.0, B = 19.0;
            for (let i = 0; i < count; i++) {
                const w = gx[i][x] * gy[i][y];
                const color = colors[i];
                R = R * (1 - w) + color[0] * w;
                G = G * (1 - w) + color[1] * w;
                B = B * (1 - w) + color[2] * w;
            }

            // Triangular PDF dither in [-0.95, +0.95] LSB before 8-bit quantization
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            const u1 = (seed >>> 0) * 2.3283064365386963e-10;
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            const u2 = (seed >>> 0) * 2.3283064365386963e-10;
            const dither = (u1 - u2) * 0.95;

            data[idx]     = R + dither + 0.5;
            data[idx + 1] = G + dither + 0.5;
            data[idx + 2] = B + dither + 0.5;
            data[idx + 3] = 255;
            idx += 4;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

// The live mesh: its container and layout, the canvas on show (and the colours it was painted
// with), and the tints asked for so far
let mesh = null;

// `layout` picks the orbs (MESH_LAYOUTS). `tinted` pages (home, music) start from the tints the
// last visit applied, so the mesh doesn't flash back to its resting colours on every navigation.
export function initAmbientMesh({ layout = 'default', tinted = false } = {}) {
    if (!document.getElementById('ambient-mesh')) {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="ambient-mesh">
                <div class="orb orb-1"></div>
                <div class="orb orb-2"></div>
                <div class="orb orb-3"></div>
            </div>
        `);
    }

    const ambientMesh = document.getElementById('ambient-mesh');

    if (ambientMesh && !mesh) {
        const tints = tinted ? readStoredTints() : {};
        const colors = meshOrbColors(layout, tints);
        const canvas = paintMeshCanvas(layout, colors);
        if (canvas) {
            ambientMesh.appendChild(canvas);
            ambientMesh.classList.add('canvas-ready');
            mesh = { container: ambientMesh, layout, canvas, paintedKey: colors.join('|'), tints, repaintQueued: false };
        }
    }

    let scrollPercent = 0;
    let ticking = false;
    let winHeight = window.innerHeight || 1080;

    // Smooth vertical drift on scroll via a single GPU layer translate3d
    const updateMesh = () => {
        if (!ambientMesh || document.hidden) {
            ticking = false;
            return;
        }
        if (mesh) {
            const shiftVh = (0.5 - scrollPercent) * 18;
            mesh.canvas.style.transform = `translate3d(0, ${shiftVh.toFixed(2)}vh, 0)`;
        }
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

// Repaints the mesh with the tints asked for and crossfades to it
function repaintMesh() {
    mesh.repaintQueued = false;
    const colors = meshOrbColors(mesh.layout, mesh.tints);
    const key = colors.join('|');
    if (key === mesh.paintedKey) return;

    const next = paintMeshCanvas(mesh.layout, colors);
    if (!next) return;
    const previous = mesh.canvas;
    next.style.transform = previous.style.transform;
    mesh.canvas = next;
    mesh.paintedKey = key;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        previous.replaceWith(next);
        return;
    }
    // The canvas is opaque: fade the new one in over the old, then drop the old
    next.classList.add('is-entering');
    mesh.container.appendChild(next);
    void next.offsetWidth;
    next.classList.remove('is-entering');
    setTimeout(() => previous.remove(), 1000);
}

// Tints the mesh orbs of `slot` ("music", and on the homepage "book" and "cinema") with the hue of
// `rgb`, a cover's dominant colour. `persist` remembers it for the next tinted page; pass false for
// passing states (a tab). Calls in the same frame share one repaint.
export function setAmbientTint(rgb, { slot = 'music', persist = true } = {}) {
    const tint = isRgb(rgb) ? rgb.map(Number) : null;
    if (persist) {
        try {
            const stored = readStoredTints();
            if (tint) stored[slot] = tint;
            else delete stored[slot];
            localStorage.setItem(MESH_TINTS_KEY, JSON.stringify(stored));
        } catch {}
    }
    if (!mesh) return;
    mesh.tints[slot] = tint;
    if (mesh.repaintQueued) return;
    mesh.repaintQueued = true;
    requestAnimationFrame(repaintMesh);
}

// The colour of an image, for covers the sync hasn't given a prominent_color: the average of its
// pixels weighted by their saturation, so a colourful subject outweighs a grey backdrop.
// Resolves to null if the image can't be read (it must be served with CORS headers).
export function imageColor(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onerror = () => resolve(null);
        img.onload = () => {
            try {
                const size = 32;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, size, size);
                const { data } = ctx.getImageData(0, 0, size, size);
                let r = 0, g = 0, b = 0, total = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const max = Math.max(data[i], data[i + 1], data[i + 2]);
                    const min = Math.min(data[i], data[i + 1], data[i + 2]);
                    const weight = 0.05 + (max ? (max - min) / max : 0);
                    r += data[i] * weight;
                    g += data[i + 1] * weight;
                    b += data[i + 2] * weight;
                    total += weight;
                }
                resolve([Math.round(r / total), Math.round(g / total), Math.round(b / total)]);
            } catch {
                resolve(null);
            }
        };
        img.src = url;
    });
}

let focusPauseInitialized = false;

// Toggles html.page-inactive when the tab is hidden or the window loses focus,
// which pauses all looping CSS animations (see base.css).
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

// Bumped on scroll/resize so each card re-measures itself on its next mousemove
let parallaxLayoutEpoch = 0;
let parallaxLayoutListening = false;

export function initGlassParallax() {
    // Only apply 3D cursor tilt on devices with hover and a fine pointer
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    if (!parallaxLayoutListening) {
        parallaxLayoutListening = true;
        const invalidate = () => { parallaxLayoutEpoch++; };
        window.addEventListener('scroll', invalidate, { passive: true });
        window.addEventListener('resize', invalidate, { passive: true });
    }

    const cards = document.querySelectorAll('.glass-card:not(.list-card)');
    cards.forEach(card => {
        if (card.dataset.parallaxInitialized) return;
        card.dataset.parallaxInitialized = "true";

        let rect = null;
        let rectEpoch = -1;
        // The card may already be tilted and scaled: keep its centre but use its untransformed size
        const measure = () => {
            const box = card.getBoundingClientRect();
            const width = card.offsetWidth, height = card.offsetHeight;
            rect = {
                left: box.left + box.width / 2 - width / 2,
                top: box.top + box.height / 2 - height / 2,
                width,
                height
            };
            rectEpoch = parallaxLayoutEpoch;
        };

        card.addEventListener('mouseenter', measure);

        card.addEventListener('mousemove', e => {
            if (!rect || rectEpoch !== parallaxLayoutEpoch) measure();
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
    // Missing or hidden (e.g. an inactive tab pane): nothing to animate, so update at once without
    // pre-decoding its images or taking the view transition from a visible section
    if (!targetEl || !targetEl.isConnected || targetEl.getClientRects().length === 0) {
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

// --- Footer sync time ---

function relativeTime(elapsedMs) {
    const minutes = Math.floor(elapsedMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

let syncedAtTimer = 0;

// Footer: "Synced 12 min ago", from the sync time (epoch seconds) an API response or snapshot carries
export function showSyncedAt(epochSeconds) {
    const wrap = document.getElementById('footer-sync');
    const timeEl = wrap?.querySelector('time');
    const syncedMs = Number(epochSeconds) * 1000;
    if (!timeEl || !Number.isFinite(syncedMs) || syncedMs <= 0) return;

    const date = new Date(syncedMs);
    timeEl.dateTime = date.toISOString();
    timeEl.title = date.toLocaleString();
    const update = () => {
        timeEl.textContent = `Synced ${relativeTime(Math.max(0, Date.now() - syncedMs))}`;
    };
    update();
    wrap.hidden = false;
    clearInterval(syncedAtTimer);
    syncedAtTimer = setInterval(update, 60000);
}

// --- Keyboard: 1 / 2 / 3 open the library pages, in the order of the library navigation ---

const LIBRARY_KEYS = { '1': '/library/reading', '2': '/library/music', '3': '/library/cinema' };
const LIBRARY_KEY_COOLDOWN_MS = 500;
const LIBRARY_KEY_STAMP = 'simplyigit_key_nav';
let libraryKeysInitialized = false;

export function initLibraryKeys() {
    if (libraryKeysInitialized) return;
    libraryKeysInitialized = true;

    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
        const href = LIBRARY_KEYS[e.key];
        if (!href || location.pathname.replace(/\.html$/, '') === href) return;
        // Cooldown, kept across the page change, so mashing the keys can't cut a transition short
        try {
            const now = Date.now();
            if (now - Number(sessionStorage.getItem(LIBRARY_KEY_STAMP)) < LIBRARY_KEY_COOLDOWN_MS) return;
            sessionStorage.setItem(LIBRARY_KEY_STAMP, String(now));
        } catch {}
        location.href = href;
    });
}
