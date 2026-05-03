import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

document.addEventListener("DOMContentLoaded", () => {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");

    function renderStars(rating) {
        if (!rating) return '';
        // Letterboxd rating format is like "★★★★½" or "★★★"
        // Let's assume the string might be "4.5" or "★★★★½"
        // Based on sync_data.py, the rating is already the star string, e.g., "★★★★½"
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

    if (favContainer || recentContainer || watchlistContainer) {
        fetch("/api/movies?v=4.0").then(res => res.json()).then(json => {
            if (!json.success || !json.data) return;
            const { favorite_films: favorites, recent_activity: recent, watchlist } = json.data;

            if (favContainer) {
                let html = '';
                const duplicatedFavorites = [...favorites, ...favorites]; // Duplicate for infinite scroll
                duplicatedFavorites.forEach((film, index) => {
                    const className = 'landscape';
                    const imgUrl = film.backdrop_url || film.cover_url;
                    
                    html += `
                        <div class="filmstrip-card fade-in ${className}" onclick="window.open('${film.link || "#"}', '_blank')">
                            <div class="filmstrip-card-inner">
                                ${imgUrl ? `<img src="${imgUrl}" alt="${film.title}">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #060d1a 0%, #1a2a3a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${film.title}</div></div>`}
                                <div class="poster-overlay filmstrip-overlay">
                                    <div class="overlay-title">${film.title}</div>
                                </div>
                            </div>
                        </div>`;
                });
                favContainer.innerHTML = html;

                // JS Marquee for smooth pause/resume easing and to fix teleporting
                let currentSpeed = 1;
                const normalSpeed = 1;
                let position = 0;
                let isHovered = false;

                const cards = favContainer.querySelectorAll('.filmstrip-card');
                cards.forEach(card => {
                    card.addEventListener('mouseenter', () => isHovered = true);
                    card.addEventListener('mouseleave', () => isHovered = false);
                });

                function animateMarquee() {
                    // Ease the speed towards 0 (if hovered) or normalSpeed (if not hovered)
                    const targetSpeed = isHovered ? 0 : normalSpeed;
                    currentSpeed += (targetSpeed - currentSpeed) * 0.05; // 0.05 is the easing factor
                    
                    position -= currentSpeed;

                    // Dynamically get the scroll width. Since we duplicated the array exactly once, 
                    // half of the total scroll width is the exact length of one set.
                    const halfWidth = favContainer.scrollWidth / 2;

                    if (Math.abs(position) >= halfWidth && halfWidth > 0) {
                        position += halfWidth; // Seamless loop back
                    }

                    favContainer.style.transform = `translateX(${position}px)`;
                    requestAnimationFrame(animateMarquee);
                }
                
                // Start animation once elements are rendered
                requestAnimationFrame(animateMarquee);
            }
            if (recentContainer) {
                recentContainer.innerHTML = recent.slice(0, 7).map((film, index) => {
                    const stars = film.rating ? `<div class="overlay-rating">${renderStars(film.rating)}</div>` : '';
                    return `
                        <div class="strip-card fade-in" onclick="window.open('${film.link || "#"}', '_blank')" style="transition-delay: ${index * 0.05}s">
                            ${film.cover_url ? `<img src="${film.cover_url}" alt="${film.title}">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #1a0606 0%, #2a0a0a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${film.title}</div></div>`}
                            <div class="poster-overlay">
                                <div class="overlay-title">${film.title}</div>
                                <div class="overlay-year"></div>
                                ${stars}
                            </div>
                        </div>`;
                }).join('');
            }
            if (watchlistContainer) {
                watchlistContainer.innerHTML = watchlist.slice(0, 7).map((film, index) => `
                    <div class="watchlist-card fade-in" onclick="window.open('${film.link || "#"}', '_blank')" style="transition-delay: ${index * 0.05}s">
                        ${film.cover_url ? `<img src="${film.cover_url}" alt="${film.title}">` : `<div class="poster-bg" style="background: linear-gradient(160deg, #081428 0%, #0a1e3a 100%);"><div style="font-family: 'Playfair Display', Georgia, serif; font-size: 0.7rem; font-style: italic; color: rgba(230,235,241,0.3); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.5); word-break: break-word;">${film.title}</div></div>`}
                        <div class="poster-overlay">
                            <div class="overlay-title">${film.title}</div>
                            <div class="overlay-year"></div>
                        </div>
                        <div class="watchlist-badge">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
                            </svg>
                        </div>
                    </div>`).join('');
            }
            document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
        });
    }
});
