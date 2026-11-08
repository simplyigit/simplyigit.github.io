import { initAmbientMesh, initGlobalReveal, initGlassParallax, smoothMorph, morphText, toTransitionSlug, escapeHtml } from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';

// Shared card markup for Tracks and Artists: #1 is a full-width hero card, the rest are compact grid cards.
// Text arguments are raw and escaped here; `titleHtml`, `extraHtml` and `footerHtml` must already be safe HTML.
function musicCardHtml({ index, href, title, titleHtml, subtitle, ariaLabel, artUrl, badge, meta, rgb, variant, backdropUrl, vtName, nameInPill = false, extraHtml = '', footerHtml = '' }) {
    const hero = index === 0;
    const art = escapeHtml(artUrl || "");

    const styles = [];
    if (hero && !backdropUrl) styles.push(`--track-art: url('${art}')`);
    if (Array.isArray(rgb) && rgb.length === 3) {
        const [r, g, b] = rgb;
        styles.push(`--track-color-rgb: ${r}, ${g}, ${b}`, `--track-color-glow: rgba(${r}, ${g}, ${b}, ${hero ? 0.6 : 0.45})`);
        if (hero) styles.push(`border-color: rgba(${r}, ${g}, ${b}, 0.3)`);
    }
    if (vtName) styles.push(`view-transition-name: ${vtName}`);

    const classes = ['spotify-track-card', hero ? 'top-track-banner' : 'grid-track', variant && `is-${variant}`, backdropUrl && 'has-backdrop'].filter(Boolean).join(' ');
    const backdrop = backdropUrl
        ? `<div class="banner-backdrop" aria-hidden="true"><img src="${escapeHtml(backdropUrl)}" alt="" decoding="async"></div>`
        : hero ? `<div class="banner-bg-blur"></div>` : '';
    // Only the visible tab's hero is above the fold on load
    const imgAttrs = index === 0 && variant === 'track' ? 'fetchpriority="high"' : 'decoding="async"';

    return `
            <a href="${escapeHtml(href || "#")}" target="_blank" rel="noopener noreferrer" class="${classes}" style="${styles.join('; ')}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ''}>
                ${backdrop}
                <div class="case-art-wrapper">
                    <img src="${art}" alt="${escapeHtml(title)}" class="spotify-track-img" ${imgAttrs}>
                </div>
                <div class="case-info">
                    ${nameInPill ? '' : `<div class="track-text-stack">
                        <span class="case-title">${titleHtml || escapeHtml(title)}</span>
                        ${subtitle ? `<span class="case-artist">${escapeHtml(subtitle)}</span>` : ''}
                    </div>`}
                    ${extraHtml}
                    ${nameInPill ? namePillHtml(badge, title, meta) : `<div class="track-stats-pill"><span class="stats-badge">${escapeHtml(badge)}</span><span class="stats-plays">${escapeHtml(meta)}</span></div>`}
                    ${footerHtml}
                </div>
            </a>`;
}

// "5 Seconds of Summer" -> "5SOS": long names of three or more words go by their initials in the pill.
// Two-word names keep their full name (initials like "SM" wouldn't be recognisable).
function pillName(name) {
    const full = String(name || '').trim();
    const words = full.split(/\s+/);
    return words.length >= 3 && full.length > 12 ? words.map(w => [...w][0].toUpperCase()).join('') : full;
}

// Artist pills carry the name: "#1 | Name | 175 plays" on the #1 card, "#2 | Name" on the rest (no meta)
function namePillHtml(badge, name, meta) {
    const shown = pillName(name);
    const nameHtml = shown === String(name || '').trim()
        ? escapeHtml(shown)
        : `<span aria-hidden="true">${escapeHtml(shown)}</span><span class="visually-hidden">${escapeHtml(name)}</span>`;
    return `<div class="track-stats-pill has-name"><span class="stats-badge">${escapeHtml(badge)}</span><span class="stats-name" title="${escapeHtml(name)}">${nameHtml}</span>${meta ? `<span class="stats-plays">${escapeHtml(meta)}</span>` : ''}</div>`;
}

function playsLabel(count) {
    return `${Number(count).toLocaleString()} plays`;
}

// Favourites, not a ranking: every album gets the same card, its cover beside the hand-made banner.
// The typography file is a full-size overlay drawn to line up with its backdrop, so both share one box.
function renderAlbums(container, albumList) {
    if (!container || !Array.isArray(albumList)) return;
    container.innerHTML = albumList.map(album => {
        const spotifyUrl = album.spotify_url || (album.spotify_id ? `https://open.spotify.com/album/${album.spotify_id}` : `https://open.spotify.com/search/${encodeURIComponent(album.title + ' ' + album.artist)}`);
        const [r, g, b] = album.prominent_color || [255, 255, 255];
        const backdrop = album.typo_url ? album.bg_url : album.banner_url;
        return `
            <a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer" class="spotify-track-card album-card" style="--track-color-rgb: ${r}, ${g}, ${b}; --track-color-glow: rgba(${r}, ${g}, ${b}, 0.45)" aria-label="${escapeHtml(`${album.title} by ${album.artist}`)}">
                <div class="album-cover">
                    <img src="${escapeHtml(album.optimized_cover_url || album.cover_url || "")}" alt="" decoding="async">
                </div>
                <div class="album-banner" aria-hidden="true">
                    ${backdrop ? `<img src="${escapeHtml(backdrop)}" alt="" class="album-banner-layer album-banner-bg" decoding="async">` : ''}
                    ${album.typo_url ? `<img src="${escapeHtml(album.typo_url)}" alt="" class="album-banner-layer album-banner-typo" decoding="async">` : ''}
                </div>
            </a>`;
    }).join('');

    initAlbumParallax(container);
}

// Pointer position on each album card (-1..1) drives the banner layers' parallax in CSS
function initAlbumParallax(container) {
    if (!window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;
    container.querySelectorAll('.album-card').forEach(card => {
        let frame = 0;
        card.addEventListener('pointermove', e => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const rect = card.getBoundingClientRect();
                card.style.setProperty('--px', (((e.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
                card.style.setProperty('--py', (((e.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
            });
        });
        card.addEventListener('pointerleave', () => {
            cancelAnimationFrame(frame);
            frame = 0;
            card.style.setProperty('--px', '0');
            card.style.setProperty('--py', '0');
        });
    });
}

// Fall back to a Spotify search when the sync couldn't resolve the artist's page
function artistSpotifyUrl(artist) {
    if (artist.spotify_url) return artist.spotify_url;
    if (artist.spotify_id) return `https://open.spotify.com/artist/${artist.spotify_id}`;
    return artist.name ? `https://open.spotify.com/search/${encodeURIComponent(artist.name)}` : "#";
}

// "Another You (feat. Sadie Jean)" -> "Another You": the artist is already on the card
function displaySongTitle(title) {
    return String(title || '')
        .replace(/\s*[\(\[](?:feat|ft|with)\.?[^\)\]]*[\)\]]/gi, '')
        .replace(/\s*[\(\[][^\)\]]*\b(?:demo|remaster(?:ed)?|version|edit|mix|live|acoustic|deluxe)\b[^\)\]]*[\)\]]\s*$/i, '')
        .replace(/\s+-\s+.*\b(?:remaster(?:ed)?|version|edit|mix|live|demo)\b.*$/i, '')
        .trim() || title;
}

// The #1 card's bar uses the same scale as cards 2-5 (all top-5 artists' plays combined), in three parts:
// the top song, then the rest of the artist's plays, then everyone else (the empty track)
function topSongShares(songPlays, artistPlays, totalPlays) {
    if (!totalPlays) return { songShare: 0, artistShare: 0 };
    return {
        songShare: Math.min(100, Math.round((songPlays / totalPlays) * 100)),
        artistShare: Math.min(100, Math.round((artistPlays / totalPlays) * 100))
    };
}

// #1 artist: their most played song this month, with the three-part bar above
function artistTopSongHtml(artist, totalPlays) {
    const song = artist.top_track;
    if (!song || !song.title) return '';
    const total = Number(artist.playcount) || 0;
    const plays = Number(song.playcount) || 0;
    const { songShare, artistShare } = topSongShares(plays, total, totalPlays);
    const cover = song.cover_url
        ? `<img src="${escapeHtml(song.cover_url)}" alt="" class="artist-song-art" decoding="async">`
        : `<span class="artist-song-art" aria-hidden="true"></span>`;
    return `
                    <div class="artist-song">
                        <span class="artist-song-label">Top song</span>
                        ${cover}
                        <span class="artist-song-title">${escapeHtml(displaySongTitle(song.title))}</span>
                        <span class="artist-song-plays">${escapeHtml(plays.toLocaleString())} / ${escapeHtml(playsLabel(total))}</span>
                        <span class="artist-song-bar" role="img" aria-label="${escapeHtml(displaySongTitle(song.title))}: ${plays} of ${escapeHtml(artist.name)}'s ${total} plays, out of ${totalPlays} across my top 5 artists" style="--share: ${songShare}%; --artist-share: ${artistShare}%">${BAR_TRACK_HTML}</span>
                    </div>`;
}

// Bar tracks are two layers under the fills: dark glass, then a light sheen blended (overlay) with the photo
const BAR_TRACK_HTML = '<span class="bar-glass"></span><span class="bar-sheen"></span>';

// Cards 2-5: plays as a bar showing the artist's share of all top-5 artists' plays combined
function artistPlaysHtml(artist, totalPlays) {
    const plays = Number(artist.playcount) || 0;
    const share = totalPlays ? Math.round((plays / totalPlays) * 100) : 0;
    return `<div class="artist-plays" style="--share: ${share}%" title="${share}% of my top-5 artists' plays this month">
                        <span class="artist-plays-bar" aria-hidden="true">${BAR_TRACK_HTML}</span>
                        <span class="artist-plays-count">${escapeHtml(playsLabel(plays))}</span>
                    </div>`;
}

function renderArtists(container, artistList) {
    if (!container) return;
    const list = Array.isArray(artistList) ? artistList.filter(a => a && typeof a === 'object') : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="empty-note">No top artists recorded.</p>`;
        return;
    }
    const totalPlays = list.reduce((sum, a) => sum + (Number(a.playcount) || 0), 0);
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
            // Last.fm's community-picked header photo, else a wide crop of the profile photo
            backdropUrl: artist.banner_url || artist.image_url,
            badge: `#${index + 1}`,
            // Cards 2-5 are short: their pill holds just rank and name
            meta: index === 0 ? playsLabel(artist.playcount) : '',
            rgb: artist.prominent_color,
            vtName,
            nameInPill: true,
            footerHtml: index === 0 ? artistTopSongHtml(artist, totalPlays) : artistPlaysHtml(artist, totalPlays)
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
            const sig = albums.map(a => a.title).join('|');
            if (sig !== renderedAlbumsSig) {
                const isUpdate = renderedAlbumsSig !== '';
                renderedAlbumsSig = sig;
                if (isUpdate) {
                    const images = albums.flatMap(a => [a.optimized_cover_url || a.cover_url, a.typo_url ? a.bg_url : a.banner_url, a.typo_url]);
                    smoothMorph(albumsContainer, () => renderAlbums(albumsContainer, albums), images.filter(Boolean));
                } else {
                    renderAlbums(albumsContainer, albums);
                }
            }
        }

        if (artistsContainer && Array.isArray(artists) && artists.length > 0) {
            // banner_url and the #1's top song too, so they appear as soon as a sync adds them
            const sig = artists.map(a => `${a.name}-${a.banner_url || ''}-${a.top_track?.title || ''}`).join('|');
            if (sig !== renderedArtistsSig) {
                const isUpdate = renderedArtistsSig !== '';
                renderedArtistsSig = sig;
                if (isUpdate) {
                    smoothMorph(artistsContainer, () => renderArtists(artistsContainer, artists), artists.flatMap(a => [a.image_url, a.banner_url, a.top_track?.cover_url]).filter(Boolean));
                } else {
                    renderArtists(artistsContainer, artists);
                }
            } else {
                // Same artists in same order: morph playcounts in-place without resetting DOM
                const cards = artistsContainer.querySelectorAll('.spotify-track-card');
                const totalPlays = artists.reduce((sum, a) => sum + (Number(a.playcount) || 0), 0);
                artists.forEach((artist, idx) => {
                    const plays = cards[idx]?.querySelector('.stats-plays, .artist-plays-count');
                    if (plays) morphText(plays, playsLabel(artist.playcount));
                    const share = cards[idx]?.querySelector('.artist-plays');
                    if (share && totalPlays) share.style.setProperty('--share', `${Math.round((Number(artist.playcount) || 0) / totalPlays * 100)}%`);
                    const songPlays = cards[idx]?.querySelector('.artist-song-plays');
                    const bar = cards[idx]?.querySelector('.artist-song-bar');
                    if (songPlays && artist.top_track) {
                        const total = Number(artist.playcount) || 0;
                        const trackPlays = Number(artist.top_track.playcount) || 0;
                        morphText(songPlays, `${trackPlays.toLocaleString()} / ${playsLabel(total)}`);
                        if (bar) {
                            const { songShare, artistShare } = topSongShares(trackPlays, total, totalPlays);
                            bar.style.setProperty('--share', `${songShare}%`);
                            bar.style.setProperty('--artist-share', `${artistShare}%`);
                        }
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

        // Step 1: Measure current container height; clip while the panes slide and the height morphs
        const startHeight = container.offsetHeight;
        container.classList.add("is-transitioning");

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
            container.classList.remove("is-transitioning");

            isTransitioning = false;
        };
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusic);
} else {
    initMusic();
}
