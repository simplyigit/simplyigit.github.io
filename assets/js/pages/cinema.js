import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

document.addEventListener("DOMContentLoaded", () => {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");

    if (favContainer || recentContainer || watchlistContainer) {
        fetch("/api/movies?v=4.0").then(res => res.json()).then(json => {
            if (!json.success || !json.data) return;
            const { favorite_films: favorites, recent_activity: recent, watchlist } = json.data;

            if (favContainer) {
                favContainer.innerHTML = favorites.map((film, index) => `
                    <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-fav-card fade-in delay-${(index % 4) + 1}">
                        <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-fav-poster">
                        <div class="movie-fav-overlay"><span class="movie-fav-title">${film.title}</span></div>
                    </a>`).join('');
            }
            if (recentContainer) {
                recentContainer.innerHTML = recent.slice(0, 7).map((film, index) => {
                    let badges = "";
                    if (film.is_favorite) badges += '<span class="movie-badge fav">♥</span>';
                    if (film.is_rewatch) badges += '<span class="movie-badge rewatch">↺</span>';
                    return `
                        <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-watchlist-card movie-recent-item fade-in" style="transition-delay: ${index * 0.05}s">
                            <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-watchlist-poster" title="${film.title}">
                            <div class="movie-card-info-overlay">
                                ${film.rating ? `<div class="movie-rating-stars">${film.rating}</div>` : ""}
                                <div class="movie-badges">${badges}</div>
                            </div>
                        </a>`;
                }).join('');
            }
            if (watchlistContainer) {
                watchlistContainer.innerHTML = watchlist.slice(0, 7).map((film, index) => `
                    <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-watchlist-card fade-in" style="transition-delay: ${index * 0.05}s">
                        <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-watchlist-poster" title="${film.title}">
                    </a>`).join('');
            }
            document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
        });
    }
});
