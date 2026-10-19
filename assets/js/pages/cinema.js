import { initAmbientMesh, initGlobalReveal, initGlassParallax, safeImg } from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { SEED_MOVIES } from '../modules/seed-data.js';

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

function renderCinemaData(data) {
    if (!data) return;
    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");

    const { favorite_films: favorites, recent_activity: recent, watchlist } = data;
    const favList = Array.isArray(favorites) ? favorites : [];
    const recList = Array.isArray(recent) ? recent : [];
    const watchList = Array.isArray(watchlist) ? watchlist : [];

    if (favContainer && favList.length > 0) {
        if (marqueeCleanup) marqueeCleanup();
        let html = '';
        const duplicatedFavorites = [...favList, ...favList]; // Duplicate for infinite scroll
        duplicatedFavorites.forEach((film, idx) => {
            const className = 'landscape';
            const imgUrl = safeImg(film.backdrop_url || film.cover_url, 800);
            const cTitle = film.title ? film.title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
            const safeTitle = cTitle.replace(/"/g, '&quot;');
            const priorityAttr = idx < 2 ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
            const ariaHiddenAttr = idx >= favList.length ? 'aria-hidden="true" tabindex="-1"' : '';
            
            html += `
                <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="filmstrip-card fade-in ${className}" ${ariaHiddenAttr} aria-label="${safeTitle}">
                    <div class="filmstrip-card-inner">
                        ${imgUrl ? `<img src="${imgUrl}" alt="${safeTitle}" ${priorityAttr}>` : `<div class="poster-bg" style="background: linear-gradient(160deg, #060d1a 0%, #1a2a3a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${cTitle}</div></div>`}
                        <div class="poster-overlay filmstrip-overlay">
                            <div class="overlay-title">${cTitle}</div>
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

            position -= currentSpeed;

            if (halfWidth > 0 && Math.abs(position) >= halfWidth) {
                position += halfWidth;
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

    if (recentContainer && recList.length > 0) {
        recentContainer.innerHTML = recList.slice(0, 7).map((film, index) => {
            const stars = film.rating ? `<div class="overlay-rating" aria-label="Rated ${film.rating}">${renderStars(film.rating)}</div>` : '';
            const cTitle = film.title ? film.title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
            const safeTitle = cTitle.replace(/"/g, '&quot;');
            const imgUrl = safeImg(film.cover_url, 240);
            return `
                <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="strip-card fade-in" style="transition-delay: ${index * 0.05}s" aria-label="${safeTitle}${film.rating ? ` (${film.rating})` : ''}">
                    ${imgUrl ? `<img src="${imgUrl}" alt="${safeTitle}" loading="lazy" decoding="async">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #1a0606 0%, #2a0a0a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${cTitle}</div></div>`}
                    <div class="poster-overlay">
                        <div class="overlay-title">${cTitle}</div>
                        ${stars}
                    </div>
                </a>`;
        }).join('');
    }

    if (watchlistContainer && watchList.length > 0) {
        watchlistContainer.innerHTML = watchList.slice(0, 7).map((film, index) => {
            const cTitle = film.title ? film.title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
            const safeTitle = cTitle.replace(/"/g, '&quot;');
            const imgUrl = safeImg(film.cover_url, 240);
            return `
            <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="watchlist-card fade-in" style="transition-delay: ${index * 0.05}s" aria-label="${safeTitle}">
                ${imgUrl ? `<img src="${imgUrl}" alt="${safeTitle}" loading="lazy" decoding="async">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #081428 0%, #0a1e3a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${cTitle}</div></div>`}
                <div class="poster-overlay">
                    <div class="overlay-title">${cTitle}</div>
                </div>
                <div class="watchlist-badge" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
                    </svg>
                </div>
            </a>`;
        }).join('');
    }
}

function initCinema() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");

    if (favContainer || recentContainer || watchlistContainer) {
        // Instant 0ms render from cache or bundled seed data
        const cached = getCachedData("simplyigit_cache_movies", SEED_MOVIES);
        let renderedCinemaSig = '';

        const getCinemaSig = (data) => {
            if (!data) return '';
            const rec = (data.recent_activity || []).map(m => m.title).join('|');
            const fav = (data.favorite_films || []).map(m => m.title).join('|');
            const wat = (data.watchlist || []).map(m => m.title).join('|');
            return `${rec}##${fav}##${wat}`;
        };

        if (cached) {
            renderedCinemaSig = getCinemaSig(cached);
            renderCinemaData(cached);
        }

        // Edge-cached /api/movies (<20ms SWR) with static snapshot fallback
        const fetchMoviesData = async () => {
            try {
                const res = await fetch("/api/movies");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) return json.data;
                }
            } catch {}
            try {
                const res = await fetch("/data/movies.json");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) return json.data;
                }
            } catch {}
            return null;
        };

        fetchMoviesData().then(data => {
            if (!data) return;
            setCachedData("simplyigit_cache_movies", data);
            const newSig = getCinemaSig(data);
            if (newSig && newSig !== renderedCinemaSig) {
                renderedCinemaSig = newSig;
                renderCinemaData(data);
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCinema);
} else {
    initCinema();
}

