import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

const FALLBACK_FAVORITE_ALBUMS = [
    {
        title: "Purple Rain",
        artist: "Prince and The Revolution",
        cover_url: "https://coverartarchive.org/release-group/b93a7c47-a6d4-33f2-9034-53fdd991f4ba/front-500",
        optimized_cover_url: "https://wsrv.nl/?url=https%3A//coverartarchive.org/release-group/b93a7c47-a6d4-33f2-9034-53fdd991f4ba/front-500&w=500&output=webp",
        spotify_url: "https://open.spotify.com/album/7nXJ5k4XgRj5OLZv9EK8j0",
        prominent_color: [120, 95, 106]
    },
    {
        title: "Angel Face (Club Deluxe)",
        artist: "Stephen Sanchez",
        cover_url: "https://coverartarchive.org/release/b53c56ef-d530-476e-962b-014296986cb8/38792987419-500.jpg",
        optimized_cover_url: "https://wsrv.nl/?url=https%3A//coverartarchive.org/release/b53c56ef-d530-476e-962b-014296986cb8/38792987419-500.jpg&w=500&output=webp",
        spotify_url: "https://open.spotify.com/album/3fD6ZQKymy2oP1t6c8NEOc",
        prominent_color: [213, 86, 69]
    },
    {
        title: "5SOS5 (Deluxe)",
        artist: "5 Seconds of Summer",
        cover_url: "https://coverartarchive.org/release-group/9cfe783c-18f2-47bb-a88f-4f45bceb7eda/front-500",
        optimized_cover_url: "https://wsrv.nl/?url=https%3A//coverartarchive.org/release-group/9cfe783c-18f2-47bb-a88f-4f45bceb7eda/front-500&w=500&output=webp",
        spotify_url: "https://open.spotify.com/album/4eLuy62wLqY14LqX8o6rM2",
        prominent_color: [247, 221, 207]
    },
    {
        title: "Fine Line",
        artist: "Harry Styles",
        cover_url: "https://coverartarchive.org/release-group/b9990da8-7953-4e64-aea5-065ca9cd3cb7/front-500",
        optimized_cover_url: "https://wsrv.nl/?url=https%3A//coverartarchive.org/release-group/b9990da8-7953-4e64-aea5-065ca9cd3cb7/front-500&w=500&output=webp",
        spotify_url: "https://open.spotify.com/album/7xV2TzoaVc0ycW7fwBwAml",
        prominent_color: [115, 194, 214]
    },
    {
        title: "4TH WALL",
        artist: "Ruel",
        cover_url: "https://coverartarchive.org/release-group/97226a36-4394-4188-b29e-3a8210d33173/front-500",
        optimized_cover_url: "https://wsrv.nl/?url=https%3A//coverartarchive.org/release-group/97226a36-4394-4188-b29e-3a8210d33173/front-500&w=500&output=webp",
        spotify_url: "https://open.spotify.com/album/6SW7IIrlj6LoWxDPinGeQp",
        prominent_color: [74, 78, 88]
    }
];

function renderAlbums(container, albumList) {
    if (!container) return;
    const list = Array.isArray(albumList) && albumList.length > 0 ? albumList : FALLBACK_FAVORITE_ALBUMS;
    container.innerHTML = list.map((album) => {
        const coverSrc = album.optimized_cover_url || album.cover_url || "";
        const [r, g, b] = album.prominent_color || [255, 255, 255];
        return `
            <a href="${album.spotify_url || '#'}" target="_blank" rel="noopener noreferrer" class="spotify-album-item" style="--album-glow: rgba(${r}, ${g}, ${b}, 0.35);">
                <div class="album-art-wrapper">
                    <img src="${coverSrc}" alt="${album.title}" class="spotify-album-img" loading="lazy" decoding="async">
                </div>
                <div class="spotify-album-meta">
                    <span class="spotify-album-title" title="${album.title}">${album.title}</span>
                    <span class="spotify-album-artist" title="${album.artist}">${album.artist}</span>
                </div>
            </a>`;
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

    // Always render fallback albums initially so content is instant
    renderAlbums(albumsContainer, FALLBACK_FAVORITE_ALBUMS);

    if (artistsContainer || tracksContainer || albumsContainer) {
        fetch("/api/spotify?v=4.2")
            .then(res => res.json())
            .then(json => {
                if (!json.success || !json.data) {
                    if (artistsContainer) artistsContainer.innerHTML = `<p style="color: var(--text-secondary);">No Spotify data available.</p>`;
                    return;
                }
                const { top_artists_last_month: artists, top_tracks_last_month: tracks, favorite_albums: albums } = json.data;
                const artistList = Array.isArray(artists) ? artists : [];
                const trackList = Array.isArray(tracks) ? tracks : [];

                if (albumsContainer && Array.isArray(albums) && albums.length > 0) {
                    renderAlbums(albumsContainer, albums);
                }

                if (artistsContainer) {
                    if (artistList.length > 0) {
                        artistsContainer.innerHTML = artistList.map((artist) => `
                            <a href="${artist.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-artist-item">
                                <div class="artist-img-wrapper">
                                    <img src="${artist.image_url || ""}" alt="${artist.name}" class="spotify-artist-img" decoding="async">
                                    <div class="artist-playcount-overlay">
                                        <span class="artist-playcount-value">${Number(artist.playcount).toLocaleString()}</span>
                                        <span class="artist-playcount-label">Plays</span>
                                    </div>
                                </div>
                                <span class="spotify-artist-name">${artist.name}</span>
                            </a>`).join('');
                    } else {
                        artistsContainer.innerHTML = `<p style="color: var(--text-secondary);">No top artists recorded.</p>`;
                    }
                }

                if (tracksContainer) {
                    if (trackList.length > 0) {
                        tracksContainer.innerHTML = trackList.map((track, index) => {
                            const isTopCard = index === 0;
                            const isMobile = window.innerWidth <= 768;
                            const isTopStyle = isTopCard && !isMobile;
                            
                            const rankTag = !isTopCard ? `<span class="stats-badge">#${index + 1}</span>` : `<span class="stats-badge">#1${isMobile ? '' : ' THIS MONTH'}</span>`;
                            let lyricHtml = '';
                            if (isTopStyle && track.ai_lyrics) {
                                const lyrics = [track.ai_lyrics.lyric1, track.ai_lyrics.lyric2, track.ai_lyrics.lyric3].filter(Boolean);
                                if (lyrics.length > 0) {
                                    const randomLyric = lyrics[Math.floor(Math.random() * lyrics.length)];
                                    lyricHtml = `<div class="track-ai-lyric">"${randomLyric}"</div>`;
                                }
                            }

                            return `
                                <a id="track-card-${index}" href="${track.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-track-card ${isTopStyle ? 'top-track-banner' : 'grid-track'}" style="${isTopStyle ? `--track-art: url('${track.cover_url}')` : ''}">
                                    ${isTopStyle ? `<div class="banner-bg-blur"></div>` : ''}
                                    <div class="case-art-wrapper">
                                        <img src="${track.cover_url || ""}" alt="${track.title}" class="spotify-track-img" decoding="async">
                                    </div>
                                    <div class="case-info">
                                        <div class="track-text-stack">
                                            <span class="case-title">${track.title}</span>
                                            <span class="case-artist">${track.artist}</span>
                                        </div>
                                        ${lyricHtml}
                                        <div class="track-stats-pill">${rankTag}<span class="stats-plays">${Number(track.playcount).toLocaleString()} plays</span></div>
                                    </div>
                                </a>`;
                        }).join('');

                        // Re-apply prominent colors from data
                        trackList.forEach((track, index) => {
                            if (track.prominent_color) {
                                const [R, G, B] = track.prominent_color;
                                const isTopStyle = index === 0 && window.innerWidth > 768;
                                const card = document.getElementById(`track-card-${index}`);
                                if (card) {
                                    card.style.setProperty('--track-color-rgb', `${R}, ${G}, ${B}`);
                                    card.style.setProperty('--track-color-glow', `rgba(${R}, ${G}, ${B}, ${isTopStyle ? 0.6 : 0.45})`);
                                    if (isTopStyle) card.style.borderColor = `rgba(${R}, ${G}, ${B}, 0.3)`;
                                }
                            }
                        });
                    } else {
                        tracksContainer.innerHTML = `<p style="color: var(--text-secondary);">No top tracks recorded.</p>`;
                    }
                }
            })
            .catch(() => {
                if (artistsContainer) artistsContainer.innerHTML = `<p style="color: var(--text-secondary);">Failed to load Spotify data.</p>`;
                if (albumsContainer) renderAlbums(albumsContainer, FALLBACK_FAVORITE_ALBUMS);
            });
    }
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
        });

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
