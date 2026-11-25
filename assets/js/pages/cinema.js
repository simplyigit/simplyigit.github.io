import {
    initAmbientMesh,
    initGlobalReveal,
    initGlassParallax,
    initLibraryKeys,
    safeImg,
    safeUrl,
    safeCssUrl,
    toTransitionSlug,
    smoothMorph,
    escapeHtml
} from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';
import '../modules/genie-morph.js';

// Recent Watches and the Watchlist show six films each: they fill the row on wide screens (cinema.css
// .strip-fit), and the homepage VHS only morphs films among the recent six (index.js onCinemaPage)
const ROW_COUNT = 6;

// Strip a trailing ", 2014" / "(2014)" year from Letterboxd titles
function cleanFilmTitle(title) {
    return title ? title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
}

// Title card shown when a film has no poster
function posterPlaceholder(variant, title) {
    return `<div class="poster-bg poster-bg--${variant}"><div class="poster-bg-title">${title}</div></div>`;
}

let marqueeRafId = null;
let marqueeCleanup = null;

function renderStars(rating) {
    if (!rating) return '';
    let starsHtml = '';
    const fullStars = (rating.match(/★/g) || []).length;
    const hasHalf = rating.includes('½');
    
    for (let i = 0; i < fullStars; i++) {
        starsHtml += '<span class="star">★</span>';
    }
    if (hasHalf) {
        starsHtml += '<span class="star-half">★</span>';
    }
    return starsHtml;
}

function renderFavorites(favContainer, favList) {
    if (!favContainer || !Array.isArray(favList) || favList.length === 0) return;
    if (marqueeCleanup) marqueeCleanup();

    let html = '';
    const duplicatedFavorites = [...favList, ...favList]; // Duplicate for infinite scroll
    duplicatedFavorites.forEach((film, idx) => {
        const className = 'landscape';
        const imgUrl = safeImg(film.backdrop_url || film.cover_url, 800);
        const safeTitle = escapeHtml(cleanFilmTitle(film.title));
        const priorityAttr = idx < 2 ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
        const ariaHiddenAttr = idx >= favList.length ? 'aria-hidden="true" tabindex="-1"' : '';
        
        html += `
            <a href="${escapeHtml(safeUrl(film.link) || "#")}" target="_blank" rel="noopener noreferrer" class="filmstrip-card fade-in ${className}" ${ariaHiddenAttr} aria-label="${safeTitle}">
                <div class="filmstrip-card-inner">
                    ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="" ${priorityAttr}>` : posterPlaceholder('fav', safeTitle)}
                    <div class="poster-overlay filmstrip-overlay">
                        <div class="overlay-title">${safeTitle}</div>
                    </div>
                </div>
            </a>`;
    });
    favContainer.innerHTML = html;

    // Speed in px/sec (60 px/s = 1 px/frame at 60Hz), delta-time normalized across refresh rates
    const normalSpeed = 60;
    let currentSpeed = normalSpeed;
    let position = 0;
    let isHovered = false;
    let isRunning = false;
    let lastTime = 0;
    let halfWidth = favContainer.scrollWidth / 2;
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateHalfWidth = () => {
        if (favContainer.scrollWidth > 0) {
            halfWidth = favContainer.scrollWidth / 2;
        }
    };

    window.addEventListener('resize', updateHalfWidth, { passive: true });
    favContainer.querySelectorAll('img').forEach(img => {
        if (img.complete) {
            updateHalfWidth();
        } else {
            img.addEventListener('load', updateHalfWidth, { once: true });
        }
    });

    function startMarqueeLoop() {
        if (!isRunning && !document.hidden && !reducedMotionQuery.matches) {
            isRunning = true;
            lastTime = 0;
            marqueeRafId = requestAnimationFrame(animateMarquee);
        }
    }

    const cards = favContainer.querySelectorAll('.filmstrip-card');
    const onEnter = () => { isHovered = true; startMarqueeLoop(); };
    const onLeave = () => { isHovered = false; startMarqueeLoop(); };
    const onFocusIn = (e) => {
        isHovered = true;
        currentSpeed = 0;
        if (!reducedMotionQuery.matches) {
            const card = e.currentTarget;
            const container = favContainer.parentElement;
            if (container) {
                container.scrollLeft = 0;
                const containerW = container.clientWidth || 0;
                const maxScroll = Math.max(0, favContainer.scrollWidth - containerW);
                const ideal = (containerW / 2) - (card.offsetLeft + card.offsetWidth / 2);
                position = Math.min(0, Math.max(-maxScroll, ideal));
                favContainer.style.transform = `translate3d(${position}px, 0, 0)`;
                requestAnimationFrame(() => { container.scrollLeft = 0; });
            }
        }
        startMarqueeLoop();
    };
    cards.forEach(card => {
        card.addEventListener('mouseenter', onEnter);
        card.addEventListener('mouseleave', onLeave);
        card.addEventListener('focusin', onFocusIn);
        card.addEventListener('focusout', onLeave);
    });

    const onVisibilityOrFocus = () => {
        if (!document.hidden) startMarqueeLoop();
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    window.addEventListener('blur', onVisibilityOrFocus);

    function animateMarquee(now) {
        if (document.hidden || reducedMotionQuery.matches) {
            isRunning = false;
            lastTime = 0;
            marqueeRafId = null;
            return;
        }
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
        lastTime = now;

        const targetSpeed = (isHovered || !document.hasFocus()) ? 0 : normalSpeed;
        if (dt > 0) {
            const alpha = 1 - Math.pow(0.95, dt * 60);
            currentSpeed += (targetSpeed - currentSpeed) * alpha;
        }

        if (targetSpeed === 0 && Math.abs(currentSpeed) < 0.12) {
            currentSpeed = 0;
            isRunning = false;
            lastTime = 0;
            marqueeRafId = null;
            return;
        }

        // Left to right: wrap back one copy as soon as the strip's left edge comes into view
        position += currentSpeed * dt;

        if (halfWidth > 0 && position > 0) {
            position -= halfWidth;
        }

        favContainer.style.transform = `translate3d(${position}px, 0, 0)`;
        marqueeRafId = requestAnimationFrame(animateMarquee);
    }

    startMarqueeLoop();

    marqueeCleanup = () => {
        if (marqueeRafId) cancelAnimationFrame(marqueeRafId);
        isRunning = false;
        lastTime = 0;
        marqueeRafId = null;
        window.removeEventListener('resize', updateHalfWidth);
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
        window.removeEventListener('focus', onVisibilityOrFocus);
        window.removeEventListener('blur', onVisibilityOrFocus);
    };
}

// As the page appears, cards to the right of the morphed slot slide out from under it while its poster flies in.
function dealFromUnder(anchor) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const siblings = [...(anchor.parentElement?.children || [])];
    const anchorIdx = siblings.indexOf(anchor);
    const cards = anchorIdx >= 0 ? siblings.slice(anchorIdx + 1) : [];
    if (cards.length === 0) return;
    const slot = anchor.getBoundingClientRect();
    anchor.style.zIndex = String(cards.length + 1);
    const anims = cards.map((card, i) => {
        const dx = card.getBoundingClientRect().left - slot.left;
        if (dx <= 0) return null;
        card.style.zIndex = String(cards.length - i);
        // Each card is clipped at the slot's right edge, so it only shows once it's out from under the
        // slot (`clear`: the progress where it is all out)
        const clear = Math.min(1, slot.width / dx);
        return card.animate([
            { transform: `translateX(${-dx}px)`, clipPath: 'inset(0 0 0 100%)' },
            { offset: clear, transform: `translateX(${slot.width - dx}px)`, clipPath: 'inset(0 0 0 0)' },
            { transform: 'none', clipPath: 'inset(0 0 0 0)' }
        ], { duration: 640 + i * 40, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'both' });
    }).filter(Boolean);
    if (anims.length === 0) {
        anchor.style.zIndex = '';
        return;
    }
    Promise.allSettled(anims.map(a => a.finished)).then(() => {
        anims.forEach(a => a.cancel());
        [anchor, ...cards].forEach(card => { card.style.zIndex = ''; });
    });
}

function renderRecent(recentContainer, recList) {
    if (!recentContainer || !Array.isArray(recList) || recList.length === 0) return;
    const seenSlugs = new Set();
    recentContainer.innerHTML = recList.slice(0, ROW_COUNT).map((film, index) => {
        // Liked and rewatch marks sit after the stars (U+FE0E keeps the heart a text glyph, not an emoji)
        const marks = (film.is_favorite ? '<span class="overlay-mark mark-liked" title="Liked">♥\uFE0E</span>' : '')
            + (film.is_rewatch ? '<span class="overlay-mark mark-rewatch" title="Rewatch">↺</span>' : '');
        const stars = (film.rating || marks) ? `<div class="overlay-rating">${renderStars(film.rating)}${marks}</div>` : '';
        const labelNotes = [film.rating, film.is_favorite && 'liked', film.is_rewatch && 'rewatch'].filter(Boolean).join(', ');
        const cTitle = cleanFilmTitle(film.title);
        const safeTitle = escapeHtml(cTitle);
        const imgUrl = safeImg(film.cover_url, 240);
        let vtSlug = toTransitionSlug('rec-film', cTitle || `idx-${index}`);
        if (seenSlugs.has(vtSlug)) vtSlug = `${vtSlug}-${index}`;
        seenSlugs.add(vtSlug);

        // data-film / data-thumb: the homepage VHS poster of this film morphs into this card (initCinema)
        return `
            <a href="${escapeHtml(safeUrl(film.link) || "#")}" target="_blank" rel="noopener noreferrer" class="strip-card fade-in" data-film="${escapeHtml(film.title)}" data-thumb="${escapeHtml(safeImg(film.cover_url, 150))}" style="transition-delay: ${index * 0.05}s; view-transition-name: ${vtSlug}" aria-label="${safeTitle}${labelNotes ? ` (${escapeHtml(labelNotes)})` : ''}">
                ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="" crossorigin="anonymous" decoding="async">` : posterPlaceholder('recent', safeTitle)}
                <div class="poster-overlay">
                    <div class="overlay-title">${safeTitle}</div>
                    ${stars}
                </div>
            </a>`;
    }).join('');
}

function renderWatchlist(watchlistContainer, watchList) {
    if (!watchlistContainer || !Array.isArray(watchList) || watchList.length === 0) return;
    const seenSlugs = new Set();
    watchlistContainer.innerHTML = watchList.slice(0, ROW_COUNT).map((film, index) => {
        const cTitle = cleanFilmTitle(film.title);
        const safeTitle = escapeHtml(cTitle);
        const imgUrl = safeImg(film.cover_url, 240);
        let vtSlug = toTransitionSlug('watch-film', cTitle || `idx-${index}`);
        if (seenSlugs.has(vtSlug)) vtSlug = `${vtSlug}-${index}`;
        seenSlugs.add(vtSlug);

        return `
        <a href="${escapeHtml(safeUrl(film.link) || "#")}" target="_blank" rel="noopener noreferrer" class="watchlist-card fade-in" style="transition-delay: ${index * 0.05}s; view-transition-name: ${vtSlug}" aria-label="${safeTitle}">
            ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="" decoding="async">` : posterPlaceholder('watch', safeTitle)}
            <div class="poster-overlay">
                <div class="overlay-title">${safeTitle}</div>
            </div>
            <div class="watchlist-badge" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
                </svg>
            </div>
        </a>`;
    }).join('');
}

function initCinema() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
    initLibraryKeys();

    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");
    if (!favContainer && !recentContainer && !watchlistContainer) return;

    // Page transitions (vt-nav.js): a poster on the homepage VHS morphs into the same film's card in
    // Recent Watches, and back. Leaving, it's the film that flew in (else the first card).
    let morphedFilm = '';
    const recentCard = (title) => {
        const cards = [...(recentContainer?.querySelectorAll('.strip-card[data-film]') || [])];
        return (title && cards.find(card => card.dataset.film === title)) || null;
    };
    window.__vtMorph = {
        source: (library) => {
            if (library !== 'cinema') return null;
            const card = recentCard(morphedFilm) || recentContainer?.querySelector('.strip-card[data-film]');
            const img = card?.querySelector('img');
            return card ? { el: img || card, key: card.dataset.film } : null;
        },
        target: (library, key) => {
            const card = library === 'cinema' ? recentCard(key) : null;
            if (!card) return null;
            morphedFilm = key;
            const img = card.querySelector('img');
            if (img) {
                img.fetchPriority = 'high';
            } else if (card.dataset.thumb) {
                // The poster may still be loading: show the small copy the homepage already has
                const thumbCss = safeCssUrl(card.dataset.thumb);
                if (thumbCss) card.style.background = `${thumbCss} center / cover`;
            }
            const target = img || card;
            dealFromUnder(card);
            return target;
        }
    };

    const sections = [
        {
            container: favContainer,
            sig: (d) => (d?.favorite_films || []).map(m => m.title).join('|'),
            images: (d) => (d.favorite_films || []).map(f => safeImg(f.backdrop_url || f.cover_url, 800)),
            render: (d) => renderFavorites(favContainer, d.favorite_films)
        },
        {
            container: recentContainer,
            sig: (d) => (d?.recent_activity || []).slice(0, ROW_COUNT).map(m => `${m.title}|${m.rating || ''}|${m.is_favorite ? 'l' : ''}${m.is_rewatch ? 'r' : ''}`).join('|'),
            images: (d) => (d.recent_activity || []).slice(0, ROW_COUNT).map(f => safeImg(f.cover_url, 240)),
            render: (d) => renderRecent(recentContainer, d.recent_activity)
        },
        {
            container: watchlistContainer,
            sig: (d) => (d?.watchlist || []).slice(0, ROW_COUNT).map(m => m.title).join('|'),
            images: (d) => (d.watchlist || []).slice(0, ROW_COUNT).map(f => safeImg(f.cover_url, 240)),
            render: (d) => renderWatchlist(watchlistContainer, d.watchlist)
        }
    ];
    const renderedSigs = sections.map(() => '');

    // First call paints directly; later calls morph ONLY the sections that actually changed, one at a time
    const render = async (data) => {
        for (const [i, section] of sections.entries()) {
            const sig = section.sig(data);
            if (!sig || sig === renderedSigs[i]) continue;
            const isUpdate = renderedSigs[i] !== '';
            renderedSigs[i] = sig;
            if (isUpdate) {
                await smoothMorph(section.container, () => section.render(data), section.images(data));
            } else {
                section.render(data);
            }
        }
    };

    loadLiveData({
        prefetch: window.__PREFETCH_MOVIES__,
        api: "/api/movies",
        snapshot: "/data/movies.json",
        isValid: (d) => (Array.isArray(d?.recent_activity) && d.recent_activity.length > 0)
            || (Array.isArray(d?.favorite_films) && d.favorite_films.length > 0),
        readCache: () => getCachedData("simplyigit_cache_movies"),
        saveCache: (data) => setCachedData("simplyigit_cache_movies", data),
        loadSeed: () => import('../modules/seed-data.js').then(m => m.SEED_MOVIES),
        render
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCinema);
} else {
    initCinema();
}

