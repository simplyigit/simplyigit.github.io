import {
    initAmbientMesh,
    initGlobalReveal,
    initGlassParallax,
    safeImg,
    toTransitionSlug,
    smoothMorph,
    escapeHtml
} from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';

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
            <a href="${escapeHtml(film.link || "#")}" target="_blank" rel="noopener noreferrer" class="filmstrip-card fade-in ${className}" ${ariaHiddenAttr} aria-label="${safeTitle}">
                <div class="filmstrip-card-inner">
                    ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${safeTitle}" ${priorityAttr}>` : posterPlaceholder('fav', safeTitle)}
                    <div class="poster-overlay filmstrip-overlay">
                        <div class="overlay-title">${safeTitle}</div>
                    </div>
                </div>
            </a>`;
    });
    favContainer.innerHTML = html;

    let currentSpeed = 1;
    const normalSpeed = 1;
    let position = 0;
    let isHovered = false;
    let isRunning = false;
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
            marqueeRafId = requestAnimationFrame(animateMarquee);
        }
    }

    const cards = favContainer.querySelectorAll('.filmstrip-card');
    const onEnter = () => { isHovered = true; startMarqueeLoop(); };
    const onLeave = () => { isHovered = false; startMarqueeLoop(); };
    cards.forEach(card => {
        card.addEventListener('mouseenter', onEnter);
        card.addEventListener('mouseleave', onLeave);
        card.addEventListener('focusin', onEnter);
        card.addEventListener('focusout', onLeave);
    });

    const onVisibilityOrFocus = () => {
        if (!document.hidden) startMarqueeLoop();
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    window.addEventListener('blur', onVisibilityOrFocus);

    function animateMarquee() {
        if (document.hidden || reducedMotionQuery.matches) {
            isRunning = false;
            marqueeRafId = null;
            return;
        }
        const targetSpeed = (isHovered || !document.hasFocus()) ? 0 : normalSpeed;
        currentSpeed += (targetSpeed - currentSpeed) * 0.05;

        if (targetSpeed === 0 && Math.abs(currentSpeed) < 0.002) {
            currentSpeed = 0;
            isRunning = false;
            marqueeRafId = null;
            return;
        }

        // Left to right: wrap back one copy as soon as the strip's left edge comes into view
        position += currentSpeed;

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
        marqueeRafId = null;
        window.removeEventListener('resize', updateHalfWidth);
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
        window.removeEventListener('focus', onVisibilityOrFocus);
        window.removeEventListener('blur', onVisibilityOrFocus);
    };
}

function renderRecent(recentContainer, recList) {
    if (!recentContainer || !Array.isArray(recList) || recList.length === 0) return;
    const seenSlugs = new Set();
    recentContainer.innerHTML = recList.slice(0, 7).map((film, index) => {
        const stars = film.rating ? `<div class="overlay-rating" aria-label="Rated ${escapeHtml(film.rating)}">${renderStars(film.rating)}</div>` : '';
        const cTitle = cleanFilmTitle(film.title);
        const safeTitle = escapeHtml(cTitle);
        const imgUrl = safeImg(film.cover_url, 240);
        let vtSlug = toTransitionSlug('rec-film', cTitle || `idx-${index}`);
        if (seenSlugs.has(vtSlug)) vtSlug = `${vtSlug}-${index}`;
        seenSlugs.add(vtSlug);

        return `
            <a href="${escapeHtml(film.link || "#")}" target="_blank" rel="noopener noreferrer" class="strip-card fade-in" style="transition-delay: ${index * 0.05}s; view-transition-name: ${vtSlug}" aria-label="${safeTitle}${film.rating ? ` (${escapeHtml(film.rating)})` : ''}">
                ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${safeTitle}" decoding="async">` : posterPlaceholder('recent', safeTitle)}
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
    watchlistContainer.innerHTML = watchList.slice(0, 7).map((film, index) => {
        const cTitle = cleanFilmTitle(film.title);
        const safeTitle = escapeHtml(cTitle);
        const imgUrl = safeImg(film.cover_url, 240);
        let vtSlug = toTransitionSlug('watch-film', cTitle || `idx-${index}`);
        if (seenSlugs.has(vtSlug)) vtSlug = `${vtSlug}-${index}`;
        seenSlugs.add(vtSlug);

        return `
        <a href="${escapeHtml(film.link || "#")}" target="_blank" rel="noopener noreferrer" class="watchlist-card fade-in" style="transition-delay: ${index * 0.05}s; view-transition-name: ${vtSlug}" aria-label="${safeTitle}">
            ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${safeTitle}" decoding="async">` : posterPlaceholder('watch', safeTitle)}
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

    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");
    if (!favContainer && !recentContainer && !watchlistContainer) return;

    const sections = [
        {
            container: favContainer,
            sig: (d) => (d?.favorite_films || []).map(m => m.title).join('|'),
            images: (d) => (d.favorite_films || []).map(f => safeImg(f.backdrop_url || f.cover_url, 800)),
            render: (d) => renderFavorites(favContainer, d.favorite_films)
        },
        {
            container: recentContainer,
            sig: (d) => (d?.recent_activity || []).slice(0, 7).map(m => `${m.title}|${m.rating || ''}`).join('|'),
            images: (d) => (d.recent_activity || []).slice(0, 7).map(f => safeImg(f.cover_url, 240)),
            render: (d) => renderRecent(recentContainer, d.recent_activity)
        },
        {
            container: watchlistContainer,
            sig: (d) => (d?.watchlist || []).slice(0, 7).map(m => m.title).join('|'),
            images: (d) => (d.watchlist || []).slice(0, 7).map(f => safeImg(f.cover_url, 240)),
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

