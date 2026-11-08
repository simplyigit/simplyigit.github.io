import { initAmbientMesh, initGlobalReveal, initGlassParallax, smoothMorph, morphText, toTransitionSlug, escapeHtml } from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';

// Shared card markup for all three tabs: #1 is a full-width hero card, the rest are compact grid cards.
// Text arguments are raw and escaped here; `titleHtml` and `extraHtml` must already be safe HTML.
function musicCardHtml({ index, href, title, titleHtml, subtitle, ariaLabel, artUrl, badge, meta, rgb, variant, backdropUrl, vtName, extraHtml = '' }) {
    const isTop = index === 0;
    const art = escapeHtml(artUrl || "");

    const styles = [];
    if (isTop && !backdropUrl) styles.push(`--track-art: url('${art}')`);
    if (Array.isArray(rgb) && rgb.length === 3) {
        const [r, g, b] = rgb;
        styles.push(`--track-color-rgb: ${r}, ${g}, ${b}`, `--track-color-glow: rgba(${r}, ${g}, ${b}, ${isTop ? 0.6 : 0.45})`);
        if (isTop) styles.push(`border-color: rgba(${r}, ${g}, ${b}, 0.3)`);
    }
    if (vtName) styles.push(`view-transition-name: ${vtName}`);

    const classes = ['spotify-track-card', isTop ? 'top-track-banner' : 'grid-track', variant && `is-${variant}`].filter(Boolean).join(' ');
    const backdrop = !isTop ? '' : backdropUrl
        ? `<div class="banner-backdrop" aria-hidden="true"><img src="${escapeHtml(backdropUrl)}" alt="" decoding="async"></div>`
        : `<div class="banner-bg-blur"></div>`;
    // Only the visible tab's hero is above the fold on load
    const imgAttrs = isTop && variant === 'track' ? 'fetchpriority="high"' : 'decoding="async"';

    return `
            <a href="${escapeHtml(href || "#")}" target="_blank" rel="noopener noreferrer" class="${classes}" style="${styles.join('; ')}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ''}>
                ${backdrop}
                <div class="case-art-wrapper">
                    <img src="${art}" alt="${escapeHtml(title)}" class="spotify-track-img" ${imgAttrs}>
                </div>
                <div class="case-info">
                    <div class="track-text-stack">
                        <span class="case-title">${titleHtml || escapeHtml(title)}</span>
                        ${subtitle ? `<span class="case-artist">${escapeHtml(subtitle)}</span>` : ''}
                    </div>
                    ${extraHtml}
                    <div class="track-stats-pill"><span class="stats-badge">${escapeHtml(badge)}</span><span class="stats-plays">${escapeHtml(meta)}</span></div>
                </div>
            </a>`;
}

function playsLabel(count) {
    return `${Number(count).toLocaleString()} plays`;
}

// "Angel Face (Club Deluxe)" -> "Angel Face": edition suffixes only crowd the compact cards
function displayAlbumTitle(title) {
    return String(title || '').replace(/\s*[\(\[][^\)\]]*(?:deluxe|edition|remaster)[^\)\]]*[\)\]]\s*$/i, '') || title;
}

function renderAlbums(container, albumList) {
    if (!container || !Array.isArray(albumList)) return;
    container.innerHTML = albumList.map((album, index) => {
        const isTop = index === 0;
        const spotifyUrl = album.spotify_url || (album.spotify_id ? `https://open.spotify.com/album/${album.spotify_id}` : `https://open.spotify.com/search/${encodeURIComponent(album.title + ' ' + album.artist)}`);
        // The hero shows the album's hand-made logo over its backdrop; the logo already carries the artist name
        const logo = isTop && album.logo_url
            ? `<img src="${escapeHtml(album.logo_url)}" alt="" class="album-logo" decoding="async"><span class="visually-hidden">${escapeHtml(album.title)}</span>`
            : '';
        return musicCardHtml({
            index,
            variant: 'album',
            href: spotifyUrl,
            title: isTop ? album.title : displayAlbumTitle(album.title),
            titleHtml: logo,
            subtitle: logo ? '' : album.artist,
            ariaLabel: `${album.title} by ${album.artist}`,
            artUrl: album.optimized_cover_url || album.cover_url,
            backdropUrl: isTop ? (album.bg_url || album.banner_url) : '',
            badge: isTop ? 'ALL-TIME #1' : `#${index + 1}`,
            meta: album.format_tag || album.year || '',
            rgb: album.prominent_color
        });
    }).join('');

    // Logos range from tall (4TH WALL) to wide (FINE LINE): size them to a similar area, not a shared height
    container.querySelectorAll('.album-logo').forEach(logo => {
        const fit = () => {
            const scale = Math.sqrt(2.2 / (logo.naturalWidth / logo.naturalHeight));
            logo.style.setProperty('--logo-scale', Math.min(1.2, Math.max(0.8, scale)).toFixed(3));
        };
        if (logo.complete && logo.naturalWidth) fit();
        else logo.addEventListener('load', fit, { once: true });
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
    container.innerHTML = list.map((artist, index) => {
        let vtName = toTransitionSlug('artist', artist.name || `idx-${index}`);
        if (seenSlugs.has(vtName)) vtName = `${vtName}-${index}`;
        seenSlugs.add(vtName);
        return musicCardHtml({
            index,
            variant: 'artist',
            href: artistSpotifyUrl(artist),
            title: artist.name,
            artUrl: artist.image_url,
            badge: index === 0 ? '#1 THIS MONTH' : `#${index + 1}`,
            meta: playsLabel(artist.playcount),
            rgb: artist.prominent_color,
            vtName
        });
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
        let vtName = toTransitionSlug('track', `${track.title}-${track.artist}`);
        if (seenSlugs.has(vtName)) vtName = `${vtName}-${index}`;
        seenSlugs.add(vtName);

        let lyricHtml = '';
        if (index === 0 && track.ai_lyrics) {
            const lyrics = [track.ai_lyrics.lyric1, track.ai_lyrics.lyric2, track.ai_lyrics.lyric3].filter(Boolean);
            if (lyrics.length > 0) {
                const randomLyric = lyrics[Math.floor(Math.random() * lyrics.length)];
                lyricHtml = `<div class="track-ai-lyric">"${escapeHtml(randomLyric)}"</div>`;
            }
        }

        return musicCardHtml({
            index,
            variant: 'track',
            href: track.spotify_url,
            title: track.title,
            subtitle: track.artist,
            artUrl: track.cover_url,
            badge: index === 0 ? '#1 THIS MONTH' : `#${index + 1}`,
            meta: playsLabel(track.playcount),
            rgb: track.prominent_color,
            vtName,
            extraHtml: lyricHtml
        });
    }).join('');
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
            // logo_url is part of the signature so the hero picks up its logo once a sync adds it
            const sig = albums.map(a => `${a.title}-${a.logo_url || ''}`).join('|');
            if (sig !== renderedAlbumsSig) {
                const isUpdate = renderedAlbumsSig !== '';
                renderedAlbumsSig = sig;
                if (isUpdate) {
                    const heroImages = [albums[0].bg_url || albums[0].banner_url, albums[0].logo_url];
                    smoothMorph(albumsContainer, () => renderAlbums(albumsContainer, albums), [...albums.map(a => a.optimized_cover_url || a.cover_url), ...heroImages].filter(Boolean));
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
                const playEls = artistsContainer.querySelectorAll('.stats-plays');
                artists.forEach((artist, idx) => {
                    if (playEls[idx]) {
                        morphText(playEls[idx], playsLabel(artist.playcount));
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
                        morphText(playEls[idx], playsLabel(track.playcount));
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
                // switchTab ignores presses mid-transition; moving focus anyway would strand it on an unselected tab
                if (isTransitioning) return;
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
