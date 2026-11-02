import { initAmbientMesh, initGlobalReveal, initGlassParallax, smoothMorph, morphText, toTransitionSlug, escapeHtml } from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';

function renderAlbums(container, albumList) {
    if (!container || !Array.isArray(albumList)) return;
    container.innerHTML = albumList.map((album, idx) => {
        const title = escapeHtml(album.title);
        const coverSrc = escapeHtml(album.optimized_cover_url || album.cover_url || "");
        const [r, g, b] = album.prominent_color || [255, 255, 255];
        const bgSrc = escapeHtml(album.bg_url || album.banner_url || "");
        const typoSrc = escapeHtml(album.typo_url || "");
        const fallbackBannerSrc = escapeHtml(album.banner_url || "");
        const spotifyUrl = escapeHtml(album.spotify_url || (album.spotify_id ? `https://open.spotify.com/album/${album.spotify_id}` : `https://open.spotify.com/search/${encodeURIComponent(album.title + ' ' + album.artist)}`));

        const bannerContent = typoSrc ? `
            <div class="album-banner-bg-wrap">
                <img src="${bgSrc}" alt="${title} backdrop" class="album-banner-bg" loading="lazy" fetchpriority="low" decoding="async">
            </div>
            <div class="album-banner-vignette"></div>
            <div class="album-banner-typo-wrap">
                <img src="${typoSrc}" alt="${title} title" class="album-banner-typo" loading="lazy" fetchpriority="low" decoding="async">
            </div>
        ` : `
            <div class="album-banner-bg-wrap">
                <img src="${fallbackBannerSrc}" alt="${title} banner" class="album-banner-bg" loading="lazy" fetchpriority="low" decoding="async">
            </div>
        `;

        return `
            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-album-card" style="--album-glow: rgba(${r}, ${g}, ${b}, 0.45); --album-rgb: ${r}, ${g}, ${b}; --stagger-idx: ${idx};" aria-label="${title} by ${escapeHtml(album.artist)}">
                <div class="album-cover-slot">
                    <img src="${coverSrc}" alt="${title} cover" class="album-cover-img" loading="lazy" fetchpriority="low" decoding="async">
                    <div class="album-cover-gloss" aria-hidden="true"></div>
                </div>
                <div class="album-vinyl-disc" aria-hidden="true">
                    <div class="vinyl-sheen"></div>
                    <div class="vinyl-label" style="background-image: url('${coverSrc}');">
                        <div class="vinyl-hole"></div>
                    </div>
                </div>
                <div class="album-banner-slot">
                    ${bannerContent}
                    <div class="album-banner-sheen"></div>
                    <div class="album-hover-pill">
                        <div class="album-eq"><span></span><span></span><span></span></div>
                        <span>Spotify</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
                    </div>
                </div>
            </a>`;
    }).join('');

    initAlbumInteractivity(container);
}

function initAlbumInteractivity(container) {
    if (!container) return;
    const cards = container.querySelectorAll('.spotify-album-card');
    cards.forEach(card => {
        if (card.dataset.interactivityInitialized) return;
        card.dataset.interactivityInitialized = "true";

        let rect = null;

        card.addEventListener('mouseenter', () => {
            rect = card.getBoundingClientRect();
        });

        card.addEventListener('mousemove', (e) => {
            if (!rect) rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const px = ((x / rect.width) - 0.5) * 2;
            const py = ((y / rect.height) - 0.5) * 2;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
            card.style.setProperty('--parallax-x', px.toFixed(3));
            card.style.setProperty('--parallax-y', py.toFixed(3));
        });

        card.addEventListener('mouseleave', () => {
            rect = null;
            card.style.setProperty('--parallax-x', '0');
            card.style.setProperty('--parallax-y', '0');
            card.style.setProperty('--mouse-x', '-500px');
            card.style.setProperty('--mouse-y', '-500px');
        });
    });
}

// Fall back to a Spotify search when the sync couldn't resolve the artist's page
function artistSpotifyUrl(artist) {
    if (artist.spotify_url) return artist.spotify_url;
    if (artist.spotify_id) return `https://open.spotify.com/artist/${artist.spotify_id}`;
    return artist.name ? `https://open.spotify.com/search/${encodeURIComponent(artist.name)}` : "#";
}

function renderArtists(container, artistList) {
    if (!container) return;
    const list = Array.isArray(artistList) ? artistList.filter(a => a && typeof a === 'object') : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="empty-note">No top artists recorded.</p>`;
        return;
    }
    const seenSlugs = new Set();
    container.innerHTML = list.map((artist, idx) => {
        let vtName = toTransitionSlug('artist', artist.name || `idx-${idx}`);
        if (seenSlugs.has(vtName)) vtName = `${vtName}-${idx}`;
        seenSlugs.add(vtName);
        const name = escapeHtml(artist.name);
        return `
        <a href="${escapeHtml(artistSpotifyUrl(artist))}" target="_blank" rel="noopener noreferrer" class="spotify-artist-item" style="${vtName ? `view-transition-name: ${vtName};` : ''}">
            <div class="artist-img-wrapper">
                <img src="${escapeHtml(artist.image_url || "")}" alt="${name}" class="spotify-artist-img" decoding="async">
                <div class="artist-playcount-overlay">
                    <span class="artist-playcount-value">${Number(artist.playcount).toLocaleString()}</span>
                    <span class="artist-playcount-label">Plays</span>
                </div>
            </div>
            <span class="spotify-artist-name">${name}</span>
        </a>`;
    }).join('');
}

function renderTracks(container, trackList) {
    if (!container) return;
    const list = Array.isArray(trackList) ? trackList : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="empty-note">No top tracks recorded.</p>`;
        return;
    }
    const seenSlugs = new Set();
    container.innerHTML = list.map((track, index) => {
        const isTopCard = index === 0;
        let vtName = toTransitionSlug('track', `${track.title}-${track.artist}`);
        if (seenSlugs.has(vtName)) vtName = `${vtName}-${index}`;
        seenSlugs.add(vtName);

        const title = escapeHtml(track.title);
        const coverUrl = escapeHtml(track.cover_url || "");
        const rankTag = !isTopCard ? `<span class="stats-badge">#${index + 1}</span>` : `<span class="stats-badge">#1 THIS MONTH</span>`;
        let lyricHtml = '';
        if (isTopCard && track.ai_lyrics) {
            const lyrics = [track.ai_lyrics.lyric1, track.ai_lyrics.lyric2, track.ai_lyrics.lyric3].filter(Boolean);
            if (lyrics.length > 0) {
                const randomLyric = lyrics[Math.floor(Math.random() * lyrics.length)];
                lyricHtml = `<div class="track-ai-lyric">"${escapeHtml(randomLyric)}"</div>`;
            }
        }

        const inlineStyles = [
            isTopCard ? `--track-art: url('${coverUrl}')` : '',
            vtName ? `view-transition-name: ${vtName}` : ''
        ].filter(Boolean).join('; ');

        return `
            <a id="track-card-${index}" href="${escapeHtml(track.spotify_url || "#")}" target="_blank" rel="noopener noreferrer" class="spotify-track-card ${isTopCard ? 'top-track-banner' : 'grid-track'}" style="${inlineStyles}">
                ${isTopCard ? `<div class="banner-bg-blur"></div>` : ''}
                <div class="case-art-wrapper">
                    <img src="${coverUrl}" alt="${title}" class="spotify-track-img" ${isTopCard ? 'fetchpriority="high"' : 'decoding="async"'}>
                </div>
                <div class="case-info">
                    <div class="track-text-stack">
                        <span class="case-title">${title}</span>
                        <span class="case-artist">${escapeHtml(track.artist)}</span>
                    </div>
                    ${lyricHtml}
                    <div class="track-stats-pill">${rankTag}<span class="stats-plays">${Number(track.playcount).toLocaleString()} plays</span></div>
                </div>
            </a>`;
    }).join('');

    // Re-apply prominent colors from data
    list.forEach((track, index) => {
        if (track.prominent_color) {
            const [R, G, B] = track.prominent_color;
            const isTopCard = index === 0;
            const card = document.getElementById(`track-card-${index}`);
            if (card) {
                card.style.setProperty('--track-color-rgb', `${R}, ${G}, ${B}`);
                card.style.setProperty('--track-color-glow', `rgba(${R}, ${G}, ${B}, ${isTopCard ? 0.6 : 0.45})`);
                if (isTopCard) card.style.borderColor = `rgba(${R}, ${G}, ${B}, 0.3)`;
            }
        }
    });
}

function initMusic() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
    initMusicTabs();

    const artistsContainer = document.getElementById("spotify-artists-container");
    const tracksContainer = document.getElementById("spotify-tracks-container");
    const albumsContainer = document.getElementById("spotify-albums-container");
    if (!artistsContainer && !tracksContainer && !albumsContainer) return;

    let renderedAlbumsSig = '';
    let renderedArtistsSig = '';
    let renderedTracksSig = '';

    // First call paints directly; later calls morph only the sections whose content changed
    const render = (data) => {
        const { top_artists_last_month: artists, top_tracks_last_month: tracks, favorite_albums: albums } = data;

        if (albumsContainer && Array.isArray(albums) && albums.length > 0) {
            const sig = albums.map(a => a.title).join('|');
            if (sig !== renderedAlbumsSig) {
                const isUpdate = renderedAlbumsSig !== '';
                renderedAlbumsSig = sig;
                if (isUpdate) {
                    smoothMorph(albumsContainer, () => renderAlbums(albumsContainer, albums), albums.map(a => a.cover_url).filter(Boolean));
                } else {
                    renderAlbums(albumsContainer, albums);
                }
            }
        }

        if (artistsContainer && Array.isArray(artists) && artists.length > 0) {
            const sig = artists.map(a => a.name).join('|');
            if (sig !== renderedArtistsSig) {
                const isUpdate = renderedArtistsSig !== '';
                renderedArtistsSig = sig;
                if (isUpdate) {
                    smoothMorph(artistsContainer, () => renderArtists(artistsContainer, artists), artists.map(a => a.image_url).filter(Boolean));
                } else {
                    renderArtists(artistsContainer, artists);
                }
            } else {
                // Same artists in same order: morph playcounts in-place without resetting DOM
                const valueEls = artistsContainer.querySelectorAll('.artist-playcount-value');
                artists.forEach((artist, idx) => {
                    if (valueEls[idx]) {
                        morphText(valueEls[idx], Number(artist.playcount).toLocaleString());
                    }
                });
            }
        }

        if (tracksContainer && Array.isArray(tracks) && tracks.length > 0) {
            const sig = tracks.map(t => `${t.title}-${t.artist}`).join('|');
            if (sig !== renderedTracksSig) {
                const isUpdate = renderedTracksSig !== '';
                renderedTracksSig = sig;
                if (isUpdate) {
                    smoothMorph(tracksContainer, () => renderTracks(tracksContainer, tracks), tracks.map(t => t.cover_url).filter(Boolean));
                } else {
                    renderTracks(tracksContainer, tracks);
                }
            } else {
                // Same tracks in same order: morph playcounts in-place without resetting lyrics or DOM
                const playEls = tracksContainer.querySelectorAll('.stats-plays');
                tracks.forEach((track, idx) => {
                    if (playEls[idx]) {
                        morphText(playEls[idx], `${Number(track.playcount).toLocaleString()} plays`);
                    }
                });
            }
        }
    };

    loadLiveData({
        prefetch: window.__PREFETCH_SPOTIFY__,
        api: "/api/spotify",
        snapshot: "/data/spotify.json",
        readCache: () => getCachedData("simplyigit_cache_spotify"),
        saveCache: (data) => setCachedData("simplyigit_cache_spotify", data),
        loadSeed: () => import('../modules/seed-data.js').then(m => m.SEED_SPOTIFY),
        render
    });
}

function initMusicTabs() {
    const tabButtons = document.querySelectorAll(".music-tab-btn");
    const container = document.getElementById("music-panes-container");
    const tracksPane = document.getElementById("music-pane-tracks");
    const artistsPane = document.getElementById("music-pane-artists");
    const albumsPane = document.getElementById("music-pane-albums");
    const periodLabel = document.getElementById("music-period-label");

    if (!tabButtons.length || !container || !tracksPane || !artistsPane || !albumsPane) return;

    const panes = {
        tracks: tracksPane,
        artists: artistsPane,
        albums: albumsPane
    };

    const tabOrder = ["tracks", "artists", "albums"];
    let currentTab = "tracks";
    let isTransitioning = false;

    tabButtons.forEach(b => {
        b.tabIndex = b.getAttribute("data-tab") === currentTab ? 0 : -1;
    });

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            if (targetTab === currentTab || isTransitioning) return;
            switchTab(targetTab);
        });

        // Keyboard navigation: Left / Right arrows
        btn.addEventListener("keydown", e => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const currentIndex = tabOrder.indexOf(currentTab);
                const nextIndex = e.key === "ArrowRight"
                    ? (currentIndex + 1) % tabOrder.length
                    : (currentIndex - 1 + tabOrder.length) % tabOrder.length;
                const nextTab = tabOrder[nextIndex];
                const nextBtn = document.querySelector(`.music-tab-btn[data-tab="${nextTab}"]`);
                if (nextBtn) {
                    nextBtn.focus();
                    switchTab(nextTab);
                }
            }
        });
    });

    function switchTab(newTab) {
        if (newTab === currentTab || isTransitioning) return;
        isTransitioning = true;

        const outgoingPane = panes[currentTab];
        const incomingPane = panes[newTab];
        if (!outgoingPane || !incomingPane) {
            isTransitioning = false;
            return;
        }

        const currentIndex = tabOrder.indexOf(currentTab);
        const targetIndex = tabOrder.indexOf(newTab);
        const direction = targetIndex > currentIndex ? "forward" : "backward";

        // Update tab button states
        tabButtons.forEach(b => {
            const isSelected = b.getAttribute("data-tab") === newTab;
            b.classList.toggle("active", isSelected);
            b.setAttribute("aria-selected", isSelected ? "true" : "false");
            b.tabIndex = isSelected ? 0 : -1;
        });

        // Update unified period badges: tracks and artists share 1m, albums is all-time
        const monthlyBadge = document.getElementById("period-badge-monthly");
        const alltimeBadge = document.getElementById("period-badge-alltime");
        if (monthlyBadge && alltimeBadge) {
            if (newTab === "albums") {
                monthlyBadge.classList.remove("active");
                alltimeBadge.classList.add("active");
            } else {
                monthlyBadge.classList.add("active");
                alltimeBadge.classList.remove("active");
            }
        }

        if (periodLabel) {
            if (newTab === "albums") {
                periodLabel.textContent = "All-time favorite albums.";
            } else {
                periodLabel.textContent = "My most played this month.";
            }
        }

        currentTab = newTab;

        // Check prefers-reduced-motion
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReducedMotion) {
            outgoingPane.style.display = "none";
            outgoingPane.classList.remove("active");
            incomingPane.style.display = "block";
            incomingPane.classList.add("active");
            isTransitioning = false;
            return;
        }

        // Step 1: Measure current container height
        const startHeight = container.offsetHeight;

        // Step 2: Prepare outgoing pane (position absolutely over container)
        outgoingPane.classList.add("is-animating");
        outgoingPane.style.position = "absolute";
        outgoingPane.style.top = "0";
        outgoingPane.style.left = "0";
        outgoingPane.style.width = "100%";
        outgoingPane.style.pointerEvents = "none";
        outgoingPane.style.zIndex = "1";

        // Step 3: Prepare incoming pane (in normal flow to measure height)
        incomingPane.classList.add("is-animating");
        incomingPane.style.display = "block";
        incomingPane.style.position = "relative";
        incomingPane.style.pointerEvents = "auto";
        incomingPane.style.zIndex = "2";

        const targetHeight = incomingPane.offsetHeight;

        // Step 4 & 5: Clean GPU-accelerated directional slide & synchronized height morph
        const duration = 320;
        const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

        // Synchronize container height morph smoothly with pane animations
        const heightAnim = container.animate([
            { height: `${startHeight}px` },
            { height: `${targetHeight}px` }
        ], {
            duration: duration,
            easing: easing,
            fill: "forwards"
        });

        const xDist = 36;
        const outX = direction === "forward" ? -xDist : xDist;
        const inX = direction === "forward" ? xDist : -xDist;

        // Outgoing animation: slides away with subtle scale-down and opacity fade
        const outgoingAnim = outgoingPane.animate([
            {
                opacity: 1,
                transform: "translateX(0px) scale(1)"
            },
            {
                opacity: 0,
                transform: `translateX(${outX}px) scale(0.97)`
            }
        ], {
            duration: 260,
            easing: easing,
            fill: "forwards"
        });

        // Incoming animation: slides in smoothly from opposite direction
        const incomingAnim = incomingPane.animate([
            {
                opacity: 0,
                transform: `translateX(${inX}px) scale(0.97)`
            },
            {
                opacity: 1,
                transform: "translateX(0px) scale(1)"
            }
        ], {
            duration: duration,
            easing: easing,
            fill: "forwards"
        });

        incomingAnim.onfinish = () => {
            // Clean up outgoing
            outgoingPane.style.display = "none";
            outgoingPane.style.position = "";
            outgoingPane.style.top = "";
            outgoingPane.style.left = "";
            outgoingPane.style.width = "";
            outgoingPane.style.pointerEvents = "";
            outgoingPane.style.zIndex = "";
            outgoingPane.classList.remove("active", "is-animating");
            try { outgoingAnim.cancel(); } catch (e) {}

            // Clean up incoming
            incomingPane.style.display = "block";
            incomingPane.style.position = "";
            incomingPane.style.pointerEvents = "";
            incomingPane.style.zIndex = "";
            incomingPane.classList.add("active");
            incomingPane.classList.remove("is-animating");
            try { incomingAnim.cancel(); } catch (e) {}

            // Release container height cleanly
            try { heightAnim.cancel(); } catch (e) {}
            container.style.height = "";

            isTransitioning = false;
        };
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusic);
} else {
    initMusic();
}
