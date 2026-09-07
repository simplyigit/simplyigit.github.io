import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';
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

function safeImg(url) {
    if (!url) return '';
    if (url.includes('a.ltrbxd.com') && !url.includes('wsrv.nl')) {
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    }
    return url;
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
        duplicatedFavorites.forEach((film) => {
            const className = 'landscape';
            const imgUrl = safeImg(film.backdrop_url || film.cover_url);
            const cTitle = film.title ? film.title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
            
            html += `
                <div class="filmstrip-card fade-in ${className}" onclick="window.open('${film.link || "#"}', '_blank')">
                    <div class="filmstrip-card-inner">
                        ${imgUrl ? `<img src="${imgUrl}" alt="${cTitle}">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #060d1a 0%, #1a2a3a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${cTitle}</div></div>`}
                        <div class="poster-overlay filmstrip-overlay">
                            <div class="overlay-title">${cTitle}</div>
                        </div>
                    </div>
                </div>`;
        });
        favContainer.innerHTML = html;

        let currentSpeed = 1;
        const normalSpeed = 1;
        let position = 0;
        let isHovered = false;
        let halfWidth = favContainer.scrollWidth / 2;

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

        const cards = favContainer.querySelectorAll('.filmstrip-card');
        const onEnter = () => { isHovered = true; };
        const onLeave = () => { isHovered = false; };
        cards.forEach(card => {
            card.addEventListener('mouseenter', onEnter);
            card.addEventListener('mouseleave', onLeave);
        });

        function animateMarquee() {
            if (document.hidden) {
                marqueeRafId = requestAnimationFrame(animateMarquee);
                return;
            }
            const targetSpeed = (isHovered || !document.hasFocus()) ? 0 : normalSpeed;
            currentSpeed += (targetSpeed - currentSpeed) * 0.05;
            position -= currentSpeed;

            if (halfWidth > 0 && Math.abs(position) >= halfWidth) {
                position += halfWidth;
            }

            favContainer.style.transform = `translateX(${position}px)`;
            marqueeRafId = requestAnimationFrame(animateMarquee);
        }

        marqueeRafId = requestAnimationFrame(animateMarquee);

        marqueeCleanup = () => {
            if (marqueeRafId) cancelAnimationFrame(marqueeRafId);
            window.removeEventListener('resize', updateHalfWidth);
        };
    }

    if (recentContainer && recList.length > 0) {
        recentContainer.innerHTML = recList.slice(0, 7).map((film, index) => {
            const stars = film.rating ? `<div class="overlay-rating">${renderStars(film.rating)}</div>` : '';
            const cTitle = film.title ? film.title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
            const imgUrl = safeImg(film.cover_url);
            return `
                <div class="strip-card fade-in" onclick="window.open('${film.link || "#"}', '_blank')" style="transition-delay: ${index * 0.05}s">
                    ${imgUrl ? `<img src="${imgUrl}" alt="${cTitle}" loading="lazy">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #1a0606 0%, #2a0a0a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${cTitle}</div></div>`}
                    <div class="poster-overlay">
                        <div class="overlay-title">${cTitle}</div>
                        ${stars}
                    </div>
                </div>`;
        }).join('');
    }

    if (watchlistContainer && watchList.length > 0) {
        watchlistContainer.innerHTML = watchList.slice(0, 7).map((film, index) => {
            const cTitle = film.title ? film.title.replace(/\s*(?:,\s*\d{4}|\(\d{4}\))$/, '').trim() : '';
            const imgUrl = safeImg(film.cover_url);
            return `
            <div class="watchlist-card fade-in" onclick="window.open('${film.link || "#"}', '_blank')" style="transition-delay: ${index * 0.05}s">
                ${imgUrl ? `<img src="${imgUrl}" alt="${cTitle}" loading="lazy">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #081428 0%, #0a1e3a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${cTitle}</div></div>`}
                <div class="poster-overlay">
                    <div class="overlay-title">${cTitle}</div>
                </div>
                <div class="watchlist-badge">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
                    </svg>
                </div>
            </div>`;
        }).join('');
    }

    document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
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
        if (cached) {
            renderCinemaData(cached);
        }

        // Silent background fetch to keep fresh
        fetch("/api/movies")
            .then(res => res.json())
            .then(json => {
                if (json.success && json.data) {
                    setCachedData("simplyigit_cache_movies", json.data);
                    renderCinemaData(json.data);
                }
            })
            .catch(() => {});
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCinema);
} else {
    initCinema();
}

