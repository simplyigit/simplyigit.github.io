import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

function initMusic() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
    initMusicTabs();

    const artistsContainer = document.getElementById("spotify-artists-container");
    const tracksContainer = document.getElementById("spotify-tracks-container");

    if (artistsContainer || tracksContainer) {
        fetch("/api/spotify?v=4.2")
            .then(res => res.json())
            .then(json => {
                if (!json.success || !json.data) {
                    if (artistsContainer) artistsContainer.innerHTML = `<p style="color: var(--text-secondary);">No Spotify data available.</p>`;
                    return;
                }
                const { top_artists_last_month: artists, top_tracks_last_month: tracks } = json.data;
                const artistList = Array.isArray(artists) ? artists : [];
                const trackList = Array.isArray(tracks) ? tracks : [];

                if (artistsContainer) {
                    if (artistList.length > 0) {
                        artistsContainer.innerHTML = artistList.map((artist, index) => `
                            <a href="${artist.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-artist-item fade-in delay-${(index % 3) + 1}">
                                <div class="artist-img-wrapper">
                                    <img src="${artist.image_url || ""}" alt="${artist.name}" class="spotify-artist-img" ${index > 0 ? 'loading="lazy"' : ''}>
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
                                <a id="track-card-${index}" href="${track.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-track-card ${isTopStyle ? 'top-track-banner' : 'grid-track'} fade-in delay-${(index % 4) + 1}" style="${isTopStyle ? `--track-art: url('${track.cover_url}')` : ''}">
                                    ${isTopStyle ? `<div class="banner-bg-blur"></div>` : ''}
                                    <div class="case-art-wrapper">
                                        <img src="${track.cover_url || ""}" alt="${track.title}" class="spotify-track-img" ${index > 1 ? 'loading="lazy"' : ''}>
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
                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
            })
            .catch(() => {
                if (artistsContainer) artistsContainer.innerHTML = `<p style="color: var(--text-secondary);">Failed to load Spotify data.</p>`;
            });
    }
}

function initMusicTabs() {
    const tabButtons = document.querySelectorAll(".music-tab-btn");
    const container = document.getElementById("music-panes-container");
    const tracksPane = document.getElementById("music-pane-tracks");
    const artistsPane = document.getElementById("music-pane-artists");

    if (!tabButtons.length || !container || !tracksPane || !artistsPane) return;

    const panes = {
        tracks: tracksPane,
        artists: artistsPane
    };

    const tabOrder = ["tracks", "artists"];
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

        // Step 4: Morph container height smoothly
        container.style.height = `${startHeight}px`;
        container.style.transition = "height 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
        requestAnimationFrame(() => {
            container.style.height = `${targetHeight}px`;
        });

        // Step 5: High-end directional spatial transition with depth, scale & optics blur
        const xDist = 45;
        const outX = direction === "forward" ? -xDist : xDist;
        const inX = direction === "forward" ? xDist : -xDist;

        // Outgoing animation: slides out with subtle shrinking scale and camera blur
        const outgoingAnim = outgoingPane.animate([
            {
                opacity: 1,
                transform: "translateX(0px) scale(1) translateY(0px)",
                filter: "blur(0px)"
            },
            {
                opacity: 0,
                transform: `translateX(${outX}px) scale(0.95) translateY(-6px)`,
                filter: "blur(6px)"
            }
        ], {
            duration: 320,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "forwards"
        });

        // Incoming animation: sweeps in from opposite direction, expands into crisp focus
        const incomingAnim = incomingPane.animate([
            {
                opacity: 0,
                transform: `translateX(${inX}px) scale(0.95) translateY(6px)`,
                filter: "blur(6px)"
            },
            {
                opacity: 1,
                transform: "translateX(0px) scale(1) translateY(0px)",
                filter: "blur(0px)"
            }
        ], {
            duration: 380,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "forwards"
        });

        // Micro-stagger incoming items for an organic fluid ripple feel
        const childItems = incomingPane.querySelectorAll(".spotify-track-card, .spotify-artist-item");
        childItems.forEach((item, idx) => {
            item.animate([
                {
                    opacity: 0,
                    transform: `translateX(${direction === "forward" ? "20px" : "-20px"}) scale(0.97)`
                },
                {
                    opacity: 1,
                    transform: "translateX(0px) scale(1)"
                }
            ], {
                duration: 340,
                delay: Math.min(idx * 35, 140),
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                fill: "both"
            });
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

            // Release container height
            container.style.height = "auto";
            container.style.transition = "";

            isTransitioning = false;
        };
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusic);
} else {
    initMusic();
}
