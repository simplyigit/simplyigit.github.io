import { initAmbientMesh, setAmbientTint, initGlobalReveal, initGlassParallax, initLibraryKeys, smoothMorph, morphText, toTransitionSlug, escapeHtml, safeUrl, safeCssUrl, safeRgb } from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';
import { displaySongTitle, shortArtistNameHtml } from '../modules/music-text.js';
import { togglePreview, stopPreview } from '../modules/preview-player.js';
import '../modules/genie-morph.js';

// The tab on show, and each tab's mesh tint: the dominant colour of its first cover or portrait
let activeTab = 'tracks';
const tabTints = {};
const PLAYS_FMT = new Intl.NumberFormat();

function sizedBannerUrl(url) {
    if (!url || !url.startsWith('https://wsrv.nl/')) return url;
    return url.replace(/([?&])w=\d+/, '$1w=900');
}

// Only the Tracks tint is remembered: the homepage uses the same one (the #1 track), so going
// back and forth keeps the background still
function applyTabTint() {
    if (activeTab in tabTints) setAmbientTint(tabTints[activeTab], { persist: activeTab === 'tracks' });
}

// Shared card markup for Tracks and Artists: #1 is a full-width hero card, the rest are compact grid cards.
// Text arguments are raw and escaped here; `titleHtml`, `extraHtml` and `footerHtml` must already be safe HTML.
// `fullTitle` is the tooltip when `title` is a shortened form; `placeholderUrl` is a smaller copy of the
// art shown until the full-size image has loaded.
function musicCardHtml({ index, href, title, fullTitle, titleHtml, subtitle, ariaLabel, artUrl, placeholderUrl, badge, meta, rgb, variant, backdropUrl, vtName, nameInPill = false, interactiveCard = false, extraHtml = '', footerHtml = '' }) {
    const hero = index === 0;
    const safeHref = safeUrl(href) || '#';
    const art = safeUrl(artUrl);
    const placeholderCss = placeholderUrl && placeholderUrl !== artUrl ? safeCssUrl(placeholderUrl) : '';
    const placeholder = placeholderCss
        ? ` style="background: ${escapeHtml(placeholderCss)} center / cover"`
        : '';
    const tooltip = fullTitle && fullTitle !== title ? ` title="${escapeHtml(fullTitle)}"` : '';

    const styles = [];
    const small = safeUrl(placeholderUrl);
    // Under blur(60px) brightness(0.12) the 300px copy looks the same as the 640px one, and it is already loading
    const artCss = hero && !backdropUrl ? safeCssUrl(small || art) : '';
    if (artCss) styles.push(`--track-art: ${artCss}`);
    const cleanRgb = safeRgb(rgb);
    if (cleanRgb) {
        const [r, g, b] = cleanRgb;
        styles.push(`--track-color-rgb: ${r}, ${g}, ${b}`, `--track-color-glow: rgba(${r}, ${g}, ${b}, ${hero ? 0.6 : 0.45})`);
        if (hero) styles.push(`border-color: rgba(${r}, ${g}, ${b}, 0.3)`);
    }
    if (vtName) styles.push(`view-transition-name: ${vtName}`);

    const cleanBackdrop = safeUrl(backdropUrl);
    const classes = ['spotify-track-card', hero ? 'top-track-banner' : 'grid-track', variant && `is-${variant}`, cleanBackdrop && 'has-backdrop', interactiveCard && 'has-interactive-children'].filter(Boolean).join(' ');
    const backdrop = cleanBackdrop
        ? `<div class="banner-backdrop" aria-hidden="true"><img src="${escapeHtml(cleanBackdrop)}" alt="" loading="lazy" decoding="async"></div>`
        : hero ? `<div class="banner-bg-blur"></div>` : '';
    // Only the visible tab's hero is above the fold on load (crossorigin so WebGL Genie reuses the cached bitmap at 0ms)
    const imgAttrs = index === 0 && variant === 'track' ? 'fetchpriority="high" crossorigin="anonymous"' : 'loading="lazy" decoding="async"';
    // Small screens (and 1x displays) get the 300px copy, which is sharp at the hero's size there
    const srcset = hero && small && small !== art
        ? ` srcset="${escapeHtml(small)} 300w, ${escapeHtml(art)} 640w" sizes="${HERO_ART_SIZES_ATTR}"`
        : '';

    const inner = `
                ${backdrop}
                ${interactiveCard ? `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="artist-card-link" aria-label="${escapeHtml(ariaLabel || title)}"></a>` : ''}
                <div class="case-art-wrapper"${placeholder}>
                    <img src="${escapeHtml(art)}"${srcset} alt="${escapeHtml(title)}" class="spotify-track-img" ${imgAttrs}>
                </div>
                <div class="case-info">
                    ${nameInPill ? '' : `<div class="track-text-stack">
                        <span class="case-title"${tooltip}>${titleHtml || escapeHtml(title)}</span>
                        ${subtitle ? `<span class="case-artist" title="${escapeHtml(subtitle)}">${shortArtistNameHtml(subtitle)}</span>` : ''}
                    </div>`}
                    ${extraHtml}
                    ${nameInPill ? namePillHtml(badge, title, meta) : `<div class="track-stats-pill"><span class="stats-badge">${escapeHtml(badge)}</span><span class="stats-plays">${escapeHtml(meta)}</span></div>`}
                    ${footerHtml}
                </div>`;

    if (interactiveCard) {
        return `
            <div class="${classes}" style="${escapeHtml(styles.join('; '))}">${inner}
            </div>`;
    }

    return `
            <a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="${classes}" style="${escapeHtml(styles.join('; '))}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ''}>${inner}
            </a>`;
}

// Artist pills carry the name (long ones by their initials, see shortArtistName):
// "#1 | Name | 175 plays" on the #1 card, "#2 | Name" on the rest (no meta)
function namePillHtml(badge, name, meta) {
    return `<div class="track-stats-pill has-name"><span class="stats-badge">${escapeHtml(badge)}</span><span class="stats-name" title="${escapeHtml(name)}">${shortArtistNameHtml(name)}</span>${meta ? `<span class="stats-plays">${escapeHtml(meta)}</span>` : ''}</div>`;
}

function playsLabel(count) {
    return `${PLAYS_FMT.format(Number(count))} plays`;
}

// Favourites, not a ranking: every album gets the same card, its cover beside the hand-made banner.
// The typography file is a full-size overlay drawn to line up with its backdrop, so both share one box.
function renderAlbums(container, albumList) {
    if (!container || !Array.isArray(albumList)) return;
    container.innerHTML = albumList.map(album => {
        const spotifyUrl = safeUrl(album.spotify_url) || (album.spotify_id ? `https://open.spotify.com/album/${encodeURIComponent(album.spotify_id)}` : `https://open.spotify.com/search/${encodeURIComponent(album.title + ' ' + album.artist)}`);
        const [r, g, b] = safeRgb(album.prominent_color) || [255, 255, 255];
        const cover = safeUrl(album.optimized_cover_url || album.cover_url);
        const backdrop = safeUrl(album.typo_url ? album.bg_url : album.banner_url);
        const typo = safeUrl(album.typo_url);
        return `
            <a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer" class="spotify-track-card album-card" style="--track-color-rgb: ${r}, ${g}, ${b}; --track-color-glow: rgba(${r}, ${g}, ${b}, 0.45)" aria-label="${escapeHtml(`${album.title} by ${album.artist}`)}">
                <div class="album-cover">
                    <img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">
                </div>
                <div class="album-banner" aria-hidden="true">
                    ${backdrop ? `<img src="${escapeHtml(backdrop)}" alt="" class="album-banner-layer album-banner-bg" loading="lazy" decoding="async">` : ''}
                    ${typo ? `<img src="${escapeHtml(typo)}" alt="" class="album-banner-layer album-banner-typo" loading="lazy" decoding="async">` : ''}
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

// The #1 card's bar uses the same scale as cards 2-5 (all top-5 artists' plays combined), in three parts:
// the top song, then the rest of the artist's plays, then everyone else (the empty track)
function topSongShares(songPlays, artistPlays, totalPlays) {
    if (!totalPlays) return { songShare: 0, artistShare: 0 };
    return {
        songShare: Math.min(100, Math.round((songPlays / totalPlays) * 100)),
        artistShare: Math.min(100, Math.round((artistPlays / totalPlays) * 100))
    };
}

// #1 artist: their most played song this month, with clickable cover art, wrapped progress ring,
// and an optional preview button directly beneath the cover
function artistTopSongHtml(artist, totalPlays, trackList = []) {
    const song = artist.top_track;
    if (!song || !song.title) return '';
    const total = Number(artist.playcount) || 0;
    const plays = Number(song.playcount) || 0;
    const { songShare, artistShare } = topSongShares(plays, total, totalPlays);
    const matchedTrack = (Array.isArray(trackList) ? trackList : []).find(
        t => t?.title?.toLowerCase() === song.title.toLowerCase()
            && t?.artist?.toLowerCase() === (artist.name || '').toLowerCase()
    );
    const songUrl = safeUrl(song.spotify_url || matchedTrack?.spotify_url)
        || `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${artist.name || ''}`)}`;
    const songPreviewUrl = safeUrl(song.preview_url || matchedTrack?.preview_url);
    const shownSong = displaySongTitle(song.title);
    // A 44px thumbnail: the 300px copy is plenty
    const coverUrl = safeUrl(song.cover_url_small || song.cover_url);
    const cover = coverUrl
        ? `<img src="${escapeHtml(coverUrl)}" alt="" class="artist-song-art" loading="lazy" decoding="async">`
        : `<span class="artist-song-art" aria-hidden="true"></span>`;
    const progressRing = songPreviewUrl
        ? `<svg class="artist-song-progress" viewBox="0 0 52 52" aria-hidden="true"><rect class="artist-song-progress-track" x="2" y="2" width="48" height="48" rx="9.5" ry="9.5" pathLength="1"/><rect class="artist-song-progress-bar" x="2" y="2" width="48" height="48" rx="9.5" ry="9.5" pathLength="1"/></svg>`
        : '';
    const previewBtn = songPreviewUrl ? artistPreviewButtonHtml({
        title: song.title,
        artist: artist.name || '',
        spotify_id: matchedTrack?.spotify_id ? `artist-top-${matchedTrack.spotify_id}` : `artist-top-${song.title}|${artist.name || ''}`,
        preview_url: songPreviewUrl
    }, shownSong) : '';
    return `
                    <div class="artist-song${songPreviewUrl ? ' has-preview' : ''}">
                        <span class="artist-song-label">Top song</span>
                        <div class="artist-song-media">
                            <a href="${escapeHtml(songUrl)}" target="_blank" rel="noopener noreferrer" class="artist-song-cover-link" aria-label="${escapeHtml(`Open ${shownSong} by ${artist.name || ''} on Spotify`)}" title="${escapeHtml(`Open ${shownSong} on Spotify`)}">
                                ${cover}
                                ${progressRing}
                                <span class="artist-song-cover-badge" aria-hidden="true">↗</span>
                            </a>
                            ${previewBtn}
                        </div>
                        <span class="artist-song-title">${escapeHtml(shownSong)}</span>
                        <span class="artist-song-plays">${escapeHtml(PLAYS_FMT.format(plays))} / ${escapeHtml(playsLabel(total))}</span>
                        <span class="artist-song-bar" role="img" aria-label="${escapeHtml(shownSong)}: ${plays} of ${escapeHtml(artist.name)}'s ${total} plays, out of ${totalPlays} across my top 5 artists" style="--share: ${songShare}%; --artist-share: ${artistShare}%">${BAR_TRACK_HTML}</span>
                    </div>`;
}

// Compact preview button directly beneath the #1 artist's top song cover (progress ring wraps the cover instead)
function artistPreviewButtonHtml(track, shownTitle) {
    const previewUrl = safeUrl(track.preview_url);
    if (!previewUrl) return '';
    const trackKey = track.spotify_id || `${track.title}|${track.artist}`;
    return `
                            <button type="button" class="preview-btn artist-song-play-btn" data-preview="${escapeHtml(previewUrl)}" data-track-key="${escapeHtml(trackKey)}" aria-pressed="false" aria-label="${escapeHtml(`Play a 30-second preview of ${shownTitle} by ${track.artist}`)}">
                                <svg class="preview-icon icon-play" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 .8v8.4L9.2 5z"/></svg>
                                <svg class="preview-icon icon-pause" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1H4v8H1.5zM6 1h2.5v8H6z"/></svg>
                            </button>`;
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

function renderArtists(container, artistList, trackList = []) {
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
        const hasHeroTopSong = index === 0 && Boolean(artist.top_track?.title);
        return musicCardHtml({
            index,
            variant: 'artist',
            href: artistSpotifyUrl(artist),
            title: artist.name,
            artUrl: artist.image_url,
            // Last.fm's community-picked header photo, else a wide crop of the profile photo
            backdropUrl: sizedBannerUrl(artist.banner_url || artist.image_url),
            badge: `#${index + 1}`,
            // Cards 2-5 are short: their pill holds just rank and name
            meta: index === 0 ? playsLabel(artist.playcount) : '',
            rgb: artist.prominent_color,
            vtName,
            nameInPill: true,
            interactiveCard: hasHeroTopSong,
            footerHtml: index === 0 ? artistTopSongHtml(artist, totalPlays, trackList) : artistPlaysHtml(artist, totalPlays)
        });
    }).join('');
}

// The #1 hero card shows the 640px cover; grid cards are ~120px, so the 300px copy is enough
function trackArtUrl(track, index) {
    return index === 0 ? track.cover_url : (track.cover_url_small || track.cover_url);
}

// Width of the hero cover per breakpoint (.top-track-banner .case-art-wrapper in music.css), widest last
const HERO_ART_WIDTHS = [[480, 88], [768, 96], [900, 170], [Infinity, 240]];
const HERO_ART_SIZES_ATTR = HERO_ART_WIDTHS
    .map(([max, w]) => (max === Infinity ? `${w}px` : `(max-width: ${max}px) ${w}px`)).join(', ');

// The cover the hero's srcset picks on this screen, so a morph pre-decodes that one and not the other
function heroArtUrlForScreen(track) {
    const small = track.cover_url_small;
    if (!small || !track.cover_url) return track.cover_url || small;
    const [, width] = HERO_ART_WIDTHS.find(([max]) => max === Infinity || window.matchMedia(`(max-width: ${max}px)`).matches);
    return width * (window.devicePixelRatio || 1) <= 300 ? small : track.cover_url;
}

// 30-second preview control, on the corner of the track's cover. It sits beside the card rather
// than inside it: the card is a link, and a button can't live inside one.
function previewButtonHtml(track, shownTitle) {
    const previewUrl = safeUrl(track.preview_url);
    if (!previewUrl) return '';
    const trackKey = track.spotify_id || `${track.title}|${track.artist}`;
    return `
            <button type="button" class="preview-btn" data-preview="${escapeHtml(previewUrl)}" data-track-key="${escapeHtml(trackKey)}" aria-pressed="false" aria-label="${escapeHtml(`Play a 30-second preview of ${shownTitle} by ${track.artist}`)}">
                <svg class="preview-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16.5" pathLength="1"/></svg>
                <svg class="preview-icon icon-play" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 .8v8.4L9.2 5z"/></svg>
                <svg class="preview-icon icon-pause" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1H4v8H1.5zM6 1h2.5v8H6z"/></svg>
            </button>`;
}

// One click handler for every preview button in a music tab (Tracks or Artists #1 top song)
function initTrackPreviews(container) {
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.preview-btn');
        if (!btn) return;
        const url = btn.dataset.preview;
        const owner = btn.dataset.trackKey || url;
        togglePreview(owner, url, ({ playing, progress }) => {
            // Look the button up again: a data refresh may have re-rendered the cards meanwhile
            const live = [...container.querySelectorAll('.preview-btn')].find(b => (b.dataset.trackKey || b.dataset.preview) === owner);
            if (!live) return;
            const dash = (1 - progress).toFixed(3);
            live.setAttribute('aria-pressed', playing ? 'true' : 'false');
            live.style.setProperty('--dash', dash);
            const ownerSlot = live.closest('.track-slot, .artist-song-media');
            if (ownerSlot) {
                ownerSlot.classList.toggle('is-playing', playing);
                ownerSlot.style.setProperty('--dash', dash);
            }
        });
    });
}

let lyricCycleCleanup = null;

function initLyricCycle(container, lyrics) {
    if (lyricCycleCleanup) {
        lyricCycleCleanup();
        lyricCycleCleanup = null;
    }
    if (!container || !Array.isArray(lyrics) || lyrics.length < 2) return;
    const textEl = container.querySelector('.track-ai-lyric-text');
    const dots = [...container.querySelectorAll('.track-lyric-dot')];
    const heroSlot = container.querySelector('.track-slot.is-hero');
    if (!textEl) return;

    let idx = 0;
    let paused = false;
    let switchTimer = 0;

    const showAt = (nextIdx) => {
        idx = (nextIdx + lyrics.length) % lyrics.length;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const apply = () => {
            textEl.textContent = `"${lyrics[idx]}"`;
            dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
        };
        if (reduced) {
            apply();
            return;
        }
        clearTimeout(switchTimer);
        textEl.classList.add('is-switching');
        switchTimer = setTimeout(() => {
            apply();
            textEl.classList.remove('is-switching');
        }, 220);
    };

    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    heroSlot?.addEventListener('mouseenter', onEnter);
    heroSlot?.addEventListener('mouseleave', onLeave);
    heroSlot?.addEventListener('focusin', onEnter);
    heroSlot?.addEventListener('focusout', onLeave);

    const intervalId = setInterval(() => {
        if (paused || document.hidden || activeTab !== 'tracks') return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        showAt(idx + 1);
    }, 6500);

    lyricCycleCleanup = () => {
        clearInterval(intervalId);
        clearTimeout(switchTimer);
        heroSlot?.removeEventListener('mouseenter', onEnter);
        heroSlot?.removeEventListener('mouseleave', onLeave);
        heroSlot?.removeEventListener('focusin', onEnter);
        heroSlot?.removeEventListener('focusout', onLeave);
    };
}

function renderTracks(container, trackList) {
    if (!container) return;
    const list = Array.isArray(trackList) ? trackList : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="empty-note">No top tracks recorded.</p>`;
        return;
    }
    const seenSlugs = new Set();
    let heroLyrics = [];
    container.innerHTML = list.map((track, index) => {
        let vtName = toTransitionSlug('track', `${track.title}-${track.artist}`);
        if (seenSlugs.has(vtName)) vtName = `${vtName}-${index}`;
        seenSlugs.add(vtName);

        let lyricHtml = '';
        if (index === 0 && track.ai_lyrics) {
            const lyrics = [track.ai_lyrics.lyric1, track.ai_lyrics.lyric2, track.ai_lyrics.lyric3].filter(Boolean);
            if (lyrics.length > 0) {
                heroLyrics = lyrics;
                const dotsHtml = lyrics.length > 1
                    ? `<div class="track-lyric-dots" aria-hidden="true">${lyrics.map((_, i) => `<span class="track-lyric-dot${i === 0 ? ' is-active' : ''}"></span>`).join('')}</div>`
                    : '';
                lyricHtml = `<div class="track-ai-lyric${lyrics.length > 1 ? ' is-cycling' : ''}"><span class="track-ai-lyric-stage"><span class="track-ai-lyric-text">"${escapeHtml(lyrics[0])}"</span></span>${dotsHtml}</div>`;
            }
        }

        const shownTitle = displaySongTitle(track.title);
        const card = musicCardHtml({
            index,
            variant: 'track',
            href: track.spotify_url,
            title: shownTitle,
            fullTitle: track.title,
            subtitle: track.artist,
            artUrl: trackArtUrl(track, index),
            // The #1 card's 640px cover takes a moment: start from the 300px copy the homepage cassette used
            placeholderUrl: index === 0 ? track.cover_url_small : '',
            badge: index === 0 ? '#1 THIS MONTH' : `#${index + 1}`,
            meta: playsLabel(track.playcount),
            rgb: track.prominent_color,
            vtName,
            extraHtml: lyricHtml
        });
        const rgb = safeRgb(track.prominent_color);
        return `
            <div class="track-slot${index === 0 ? ' is-hero' : ''}"${rgb ? ` style="--track-color-rgb: ${rgb.join(', ')}"` : ''}>${card}${previewButtonHtml(track, shownTitle)}
            </div>`;
    }).join('');
    initLyricCycle(container, heroLyrics);
}

function initMusic() {
    // Tinted by the visible tab's first cover once the data is in (applyTabTint)
    initAmbientMesh({ tinted: true });
    initGlobalReveal();
    initGlassParallax();
    initLibraryKeys();

    const artistsContainer = document.getElementById("spotify-artists-container");
    const tracksContainer = document.getElementById("spotify-tracks-container");
    const albumsContainer = document.getElementById("spotify-albums-container");
    if (!artistsContainer && !tracksContainer && !albumsContainer) return;

    if (tracksContainer) initTrackPreviews(tracksContainer);
    if (artistsContainer) initTrackPreviews(artistsContainer);

    // Page transitions (vt-nav.js): the homepage cassette's cover art morphs into the #1 track's art
    // and back, as long as the Tracks tab is the one on show
    const topTrackArt = () => {
        const el = activeTab === 'tracks' && tracksContainer?.querySelector('.top-track-banner .case-art-wrapper');
        return el || null;
    };
    window.__vtMorph = {
        source: (library) => (library === 'music' && topTrackArt() ? { el: topTrackArt(), key: '' } : null),
        target: (library) => (library === 'music' ? topTrackArt() : null)
    };

    let renderedAlbumsSig = '';
    let renderedArtistsSig = '';
    let renderedTracksSig = '';
    let latestData = null;

    const renderPane = async (tabName, data, { morph = false } = {}) => {
        if (!data) return;
        const { top_artists_last_month: artists, top_tracks_last_month: tracks, favorite_albums: albums } = data;

        if (tabName === 'albums' && albumsContainer && Array.isArray(albums) && albums.length > 0) {
            const sig = albums.map(a => a.title).join('|');
            if (sig !== renderedAlbumsSig) {
                const isUpdate = morph && renderedAlbumsSig !== '';
                renderedAlbumsSig = sig;
                if (isUpdate) {
                    const images = albums.flatMap(a => [a.optimized_cover_url || a.cover_url, a.typo_url ? a.bg_url : a.banner_url, a.typo_url]);
                    await smoothMorph(albumsContainer, () => renderAlbums(albumsContainer, albums), images.filter(Boolean));
                } else {
                    renderAlbums(albumsContainer, albums);
                }
            }
            return;
        }

        if (tabName === 'artists' && artistsContainer && Array.isArray(artists) && artists.length > 0) {
            // banner_url and the #1's top song too, so they appear as soon as a sync adds them
            const sig = artists.map(a => `${a.name}-${a.banner_url || ''}-${a.top_track?.title || ''}-${a.top_track?.preview_url || ''}`).join('|');
            if (sig !== renderedArtistsSig) {
                const isUpdate = morph && renderedArtistsSig !== '';
                renderedArtistsSig = sig;
                if (isUpdate) {
                    await smoothMorph(artistsContainer, () => renderArtists(artistsContainer, artists, tracks), artists.flatMap(a => [a.image_url, sizedBannerUrl(a.banner_url), a.top_track?.cover_url_small || a.top_track?.cover_url]).filter(Boolean));
                } else {
                    renderArtists(artistsContainer, artists, tracks);
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
                        morphText(songPlays, `${PLAYS_FMT.format(trackPlays)} / ${playsLabel(total)}`);
                        if (bar) {
                            const { songShare, artistShare } = topSongShares(trackPlays, total, totalPlays);
                            bar.style.setProperty('--share', `${songShare}%`);
                            bar.style.setProperty('--artist-share', `${artistShare}%`);
                        }
                    }
                });
            }
            return;
        }

        if (tabName === 'tracks' && tracksContainer && Array.isArray(tracks) && tracks.length > 0) {
            // preview_url too, so the play buttons appear as soon as a sync adds them
            const sig = tracks.map(t => `${t.title}-${t.artist}-${t.preview_url || ''}`).join('|');
            if (sig !== renderedTracksSig) {
                const isUpdate = morph && renderedTracksSig !== '';
                renderedTracksSig = sig;
                if (isUpdate) {
                    await smoothMorph(tracksContainer, () => renderTracks(tracksContainer, tracks), tracks.map((t, i) => (i === 0 ? heroArtUrlForScreen(t) : trackArtUrl(t, i))).filter(Boolean));
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

    const ensureTabRendered = (tabName) => {
        if (latestData) renderPane(tabName, latestData, { morph: false });
    };

    initMusicTabs({ ensureTabRendered });

    // First call paints directly; later calls morph only the active tab if its content changed
    const render = async (data) => {
        latestData = data;
        const { top_artists_last_month: artists, top_tracks_last_month: tracks, favorite_albums: albums } = data;

        tabTints.tracks = tracks?.[0]?.prominent_color;
        tabTints.artists = artists?.[0]?.prominent_color;
        tabTints.albums = albums?.[0]?.prominent_color;
        applyTabTint();

        await renderPane(activeTab, data, { morph: true });
    };

    loadLiveData({
        prefetch: window.__PREFETCH_SPOTIFY__,
        api: "/api/spotify",
        snapshot: "/data/spotify.json",
        isValid: (d) => Array.isArray(d?.top_tracks_last_month) && d.top_tracks_last_month.length > 0,
        readCache: () => getCachedData("simplyigit_cache_spotify"),
        saveCache: (data) => setCachedData("simplyigit_cache_spotify", data),
        loadSeed: () => import('../modules/seed-data.js').then(m => m.SEED_SPOTIFY),
        render
    });
}

function initMusicTabs({ ensureTabRendered } = {}) {
    const navPill = document.querySelector(".music-nav-pill");
    const tabButtons = document.querySelectorAll(".music-tab-btn");
    const container = document.getElementById("music-panes-container");
    const tracksPane = document.getElementById("music-pane-tracks");
    const artistsPane = document.getElementById("music-pane-artists");
    const albumsPane = document.getElementById("music-pane-albums");

    if (!tabButtons.length || !container || !tracksPane || !artistsPane || !albumsPane) return;

    const panes = {
        tracks: tracksPane,
        artists: artistsPane,
        albums: albumsPane
    };

    const tabOrder = ["tracks", "artists", "albums"];
    let currentTab = "tracks";
    let indicatorAnim = null;
    let transitionToken = 0;
    let activeAnimations = [];
    let activeMorphStage = null;
    let activeMorphItems = [];
    // Elements a transition adds inside the real cards (the album sheens), removed when it ends
    let activeOverlays = [];

    // A card copy for the morph stage: drop its view-transition-name (a duplicate name would abort
    // a live-data view transition landing mid-morph) and any ids
    const cloneForMorph = (card) => {
        const clone = card.cloneNode(true);
        [clone, ...clone.querySelectorAll("[style], [id]")].forEach((el) => {
            el.style.viewTransitionName = "none";
            el.removeAttribute("id");
        });
        return clone;
    };

    // Gliding liquid-glass pill behind the active tab button (moves cleanly across the divider)
    let indicator = null;
    if (navPill) {
        indicator = document.createElement("span");
        indicator.className = "music-tab-indicator";
        indicator.setAttribute("aria-hidden", "true");
        navPill.prepend(indicator);
        navPill.classList.add("has-indicator");
    }

    const measureBtnInPill = (btn) => {
        if (!navPill || !btn) return null;
        const pillRect = navPill.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        return {
            x: btnRect.left - pillRect.left - navPill.clientLeft,
            y: btnRect.top - pillRect.top - navPill.clientTop,
            width: btnRect.width,
            height: btnRect.height
        };
    };

    const positionIndicator = (tabName, { animate = false, crossDivider = false } = {}) => {
        if (!indicator || !navPill) return;
        const targetBtn = navPill.querySelector(`.music-tab-btn[data-tab="${tabName}"]`);
        const to = measureBtnInPill(targetBtn);
        if (!to || to.width === 0) return;

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const fromRect = indicator.getBoundingClientRect();
        const pillRect = navPill.getBoundingClientRect();
        const hasPrev = fromRect.width > 0;

        if (indicatorAnim) {
            try { indicatorAnim.cancel(); } catch {}
            indicatorAnim = null;
        }

        const commitFinal = () => {
            indicator.style.transform = `translate3d(${to.x}px, ${to.y}px, 0)`;
            indicator.style.width = `${to.width}px`;
            indicator.style.height = `${to.height}px`;
        };

        if (!animate || !hasPrev || prefersReducedMotion) {
            commitFinal();
            return;
        }

        const fromX = fromRect.left - pillRect.left - navPill.clientLeft;
        const fromY = fromRect.top - pillRect.top - navPill.clientTop;
        const midX = (fromX + to.x) / 2;
        const midY = (fromY + to.y) / 2;
        const midW = Math.max(fromRect.width, to.width) + (crossDivider ? 10 : 4);

        commitFinal();
        indicatorAnim = indicator.animate([
            {
                transform: `translate3d(${fromX}px, ${fromY}px, 0) scaleY(1)`,
                width: `${fromRect.width}px`,
                height: `${fromRect.height}px`
            },
            {
                offset: 0.42,
                transform: `translate3d(${midX}px, ${midY}px, 0) scaleY(${crossDivider ? 0.92 : 0.96})`,
                width: `${midW}px`,
                height: `${to.height}px`
            },
            {
                transform: `translate3d(${to.x}px, ${to.y}px, 0) scaleY(1)`,
                width: `${to.width}px`,
                height: `${to.height}px`
            }
        ], {
            duration: crossDivider ? 420 : 340,
            easing: "cubic-bezier(0.22, 1.12, 0.36, 1)"
        });
        indicatorAnim.onfinish = () => { indicatorAnim = null; };
    };

    const parseCornerRadius = (raw, w, h) => {
        if (!raw) return 0;
        const token = raw.trim().split(/\s+/)[0];
        const v = parseFloat(token) || 0;
        return token.endsWith("%") ? (v / 100) * Math.min(w, h) : v;
    };

    const readFourRadii = (el, w, h) => {
        const cs = getComputedStyle(el);
        const maxR = Math.min(w, h) / 2;
        return [
            cs.borderTopLeftRadius,
            cs.borderTopRightRadius,
            cs.borderBottomRightRadius,
            cs.borderBottomLeftRadius
        ].map(r => Math.min(maxR, parseCornerRadius(r, w, h)));
    };

    const formatRadii = (r) => `${r[0].toFixed(1)}px ${r[1].toFixed(1)}px ${r[2].toFixed(1)}px ${r[3].toFixed(1)}px`;

    // Measure every card's exact shell + artwork geometry relative to `container`
    const measurePaneCards = (pane) => {
        const origin = container.getBoundingClientRect();
        const cards = Array.from(pane.querySelectorAll(".spotify-track-card"));
        return cards.map((card) => {
            const cr = card.getBoundingClientRect();
            const cs = getComputedStyle(card);
            const cardRadii = readFourRadii(card, cr.width, cr.height);
            const artEl = card.querySelector(".case-art-wrapper, .album-cover");
            const artImg = artEl?.querySelector("img");
            let artRect = null;
            let artRadii = [0, 0, 0, 0];
            let artBoxShadow = "none";
            if (artEl) {
                const ar = artEl.getBoundingClientRect();
                const acs = getComputedStyle(artEl);
                // Morph shell has border: none, so exact card-box offsets match Tracks, Artists, and Albums to 0.0px
                artRect = {
                    left: ar.left - cr.left,
                    top: ar.top - cr.top,
                    width: ar.width,
                    height: ar.height
                };
                // Resolve % radii (e.g. border-radius: 50% on Artist circles) into exact pixel half-sizes
                artRadii = readFourRadii(artEl, ar.width, ar.height);
                artBoxShadow = acs.boxShadow || "none";
                // Flush-left square art (grid tracks, albums) inherits the card's left corners visually
                if (artRadii[0] === 0 && Math.abs(ar.left - cr.left) < 4) {
                    artRadii[0] = cardRadii[0];
                    artRadii[3] = cardRadii[3];
                }
            }
            const isArtist = card.classList.contains("is-artist");
            // Cards with mask-image (e.g. .top-track-banner) clip their own outer box-shadow at rest
            const hasMask = (cs.webkitMaskImage && cs.webkitMaskImage !== "none") || (cs.maskImage && cs.maskImage !== "none");
            const rgb = cs.getPropertyValue("--track-color-rgb").trim();
            return {
                cardEl: card,
                rect: {
                    left: cr.left - origin.left,
                    top: cr.top - origin.top,
                    width: cr.width,
                    height: cr.height
                },
                naturalW: cr.width,
                naturalH: cr.height,
                radii: cardRadii,
                backgroundColor: cs.backgroundColor || "rgba(18, 18, 18, 0.85)",
                borderColor: cs.borderTopColor || "rgba(255, 255, 255, 0.1)",
                outlineShadow: isArtist ? "inset 0 0 0 1px rgba(0, 0, 0, 0.3)" : "inset 0 0 0 0px rgba(0, 0, 0, 0)",
                boxShadow: hasMask ? "none" : (cs.boxShadow || "none"),
                hasMask,
                rgb,
                artRect,
                artRadii,
                artBoxShadow,
                artSrc: artImg ? (artImg.currentSrc || artImg.getAttribute("src") || "") : ""
            };
        });
    };

    // Snapshot mid-flight morph shells so rapid clicks smoothly redirect from their live positions!
    const snapshotActiveMorph = () => {
        const origin = container.getBoundingClientRect();
        return activeMorphItems.map((item) => {
            const cr = item.shell.getBoundingClientRect();
            const cs = getComputedStyle(item.shell);
            const ocs = item.outline ? getComputedStyle(item.outline) : cs;
            let artRect = null;
            let artRadii = [0, 0, 0, 0];
            let artBoxShadow = "none";
            if (item.artBox) {
                const ar = item.artBox.getBoundingClientRect();
                const acs = getComputedStyle(item.artBox);
                artRect = {
                    left: ar.left - cr.left,
                    top: ar.top - cr.top,
                    width: ar.width,
                    height: ar.height
                };
                artRadii = readFourRadii(item.artBox, ar.width, ar.height);
                artBoxShadow = acs.boxShadow || "none";
            }
            return {
                cardEl: item.targetCardEl,
                rect: {
                    left: cr.left - origin.left,
                    top: cr.top - origin.top,
                    width: cr.width,
                    height: cr.height
                },
                naturalW: item.targetNaturalW,
                naturalH: item.targetNaturalH,
                radii: readFourRadii(item.shell, cr.width, cr.height),
                backgroundColor: cs.backgroundColor || "rgba(18, 18, 18, 0.85)",
                borderColor: ocs.borderTopColor || "rgba(255, 255, 255, 0.1)",
                outlineShadow: ocs.boxShadow && ocs.boxShadow !== "none" ? ocs.boxShadow : "inset 0 0 0 0px rgba(0, 0, 0, 0)",
                boxShadow: cs.boxShadow || "0 10px 30px rgba(0, 0, 0, 0.4)",
                artRect,
                artRadii,
                artBoxShadow,
                artSrc: item.targetArtSrc
            };
        });
    };

    const teardownMorph = (activeName) => {
        for (const anim of activeAnimations) {
            try { anim.cancel(); } catch {}
        }
        activeAnimations = [];
        activeOverlays.forEach(el => el.remove());
        activeOverlays = [];
        if (activeMorphStage) {
            activeMorphStage.remove();
            activeMorphStage = null;
        }
        activeMorphItems = [];
        Object.entries(panes).forEach(([name, pane]) => {
            const isVis = name === activeName;
            pane.style.display = isVis ? "block" : "none";
            pane.style.opacity = "";
            pane.style.pointerEvents = "";
            Object.assign(pane.style, { position: "", top: "", left: "", width: "" });
            pane.classList.toggle("active", isVis);
        });
        container.style.height = "";
    };

    // Gently pre-warm a tab's images on hover/focus so the very first morph shows crisp artwork
    const prewarmedTabs = new Set(["tracks"]);
    const prewarmTabImages = (tabName) => {
        if (prewarmedTabs.has(tabName) || !panes[tabName]) return;
        prewarmedTabs.add(tabName);
        ensureTabRendered?.(tabName);
        panes[tabName].querySelectorAll("img[src]").forEach((img) => {
            const url = img.getAttribute("src");
            if (!url) return;
            const warm = new Image();
            warm.decoding = "async";
            warm.src = url;
        });
    };

    // Deep links: /library/music#artists opens on that tab. An empty hash is the default tab;
    // any other hash is left alone.
    const tabFromHash = () => {
        const hash = location.hash.slice(1).toLowerCase();
        if (!hash) return "tracks";
        return tabOrder.includes(hash) ? hash : null;
    };

    tabButtons.forEach(b => {
        b.tabIndex = b.getAttribute("data-tab") === currentTab ? 0 : -1;
    });

    tabButtons.forEach(btn => {
        const targetTab = btn.getAttribute("data-tab");
        btn.addEventListener("pointerenter", () => prewarmTabImages(targetTab), { passive: true });
        btn.addEventListener("focus", () => prewarmTabImages(targetTab));

        btn.addEventListener("click", () => {
            if (targetTab === currentTab) return;
            switchTab(targetTab);
        });

        // Keyboard navigation: Left / Right / Home / End (WAI-ARIA tabs pattern, interruptible mid-morph)
        btn.addEventListener("keydown", e => {
            let nextIndex = null;
            if (e.key === "ArrowRight") {
                nextIndex = (tabOrder.indexOf(currentTab) + 1) % tabOrder.length;
            } else if (e.key === "ArrowLeft") {
                nextIndex = (tabOrder.indexOf(currentTab) - 1 + tabOrder.length) % tabOrder.length;
            } else if (e.key === "Home") {
                nextIndex = 0;
            } else if (e.key === "End") {
                nextIndex = tabOrder.length - 1;
            }
            if (nextIndex !== null) {
                e.preventDefault();
                const nextTab = tabOrder[nextIndex];
                const nextBtn = document.querySelector(`.music-tab-btn[data-tab="${nextTab}"]`);
                if (nextBtn) {
                    nextBtn.focus();
                    switchTab(nextTab);
                }
            }
        });
    });

    // instant: swap the panes without animation (first paint from a deep link)
    // updateHash: false when the hash is what asked for the switch
    function switchTab(newTab, { instant = false, updateHash = true } = {}) {
        if (newTab === currentTab) return;

        ensureTabRendered?.(newTab);
        const prevTab = currentTab;
        const outgoingPane = panes[prevTab];
        const incomingPane = panes[newTab];
        if (!outgoingPane || !incomingPane) return;

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const startHeight = container.getBoundingClientRect().height || container.offsetHeight;

        // Capture source card geometry BEFORE tearing down any in-flight morph or hiding outgoing pane
        let fromCards = [];
        if (!instant && !prefersReducedMotion) {
            fromCards = activeMorphStage && activeMorphItems.length > 0
                ? snapshotActiveMorph()
                : measurePaneCards(outgoingPane);
        }

        if (activeAnimations.length > 0 || activeMorphStage) {
            teardownMorph(prevTab);
        }

        const token = ++transitionToken;
        const crossDivider = (prevTab === "albums") !== (newTab === "albums");

        // Update tab button states
        tabButtons.forEach(b => {
            const isSelected = b.getAttribute("data-tab") === newTab;
            b.classList.toggle("active", isSelected);
            b.setAttribute("aria-selected", isSelected ? "true" : "false");
            b.tabIndex = isSelected ? 0 : -1;
        });

        // Update unified period badges: tracks and artists share Past Month, albums is All-Time
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

        currentTab = newTab;
        activeTab = newTab;
        applyTabTint();
        // replaceState: switching tabs shouldn't pile up history entries. The default tab has no hash.
        if (updateHash) {
            history.replaceState(history.state, '', newTab === tabOrder[0] ? location.pathname + location.search : `#${newTab}`);
        }
        // Stop any active preview when leaving its tab
        stopPreview();

        positionIndicator(newTab, { animate: !instant, crossDivider });

        if (instant || prefersReducedMotion || fromCards.length === 0) {
            teardownMorph(newTab);
            return;
        }

        // To or from Albums: grid cards and full-width banners share no shape, and reshaping one into
        // the other animates layout and paint every frame (it stuttered at about 30fps). Here the panes
        // trade places with transform and opacity only, which the compositor runs on its own.
        if (crossDivider) {
            const toAlbums = newTab === "albums";
            const dir = toAlbums ? 1 : -1;
            const easing = "cubic-bezier(0.16, 1, 0.3, 1)";
            Object.entries(panes).forEach(([name, pane]) => {
                pane.style.display = name === newTab || name === prevTab ? "block" : "none";
                pane.classList.toggle("active", name === newTab);
            });
            // The outgoing pane floats over the container's top while the incoming one sets its height
            Object.assign(outgoingPane.style, { position: "absolute", top: "0", left: "0", width: "100%", pointerEvents: "none" });
            const targetHeight = incomingPane.offsetHeight;

            const anims = [
                container.animate([
                    { height: `${startHeight}px` },
                    { height: `${targetHeight}px` }
                ], { duration: 420, easing }),
                outgoingPane.animate([
                    { opacity: 1, transform: "none" },
                    { opacity: 0, transform: `translate3d(${-28 * dir}px, 0, 0) scale(0.98)` }
                // Fast from the first frame, so the two panes don't double-expose
                ], { duration: 140, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" })
            ];

            incomingPane.querySelectorAll(".spotify-track-card").forEach((card, i) => {
                const delay = 90 + Math.min(i, 6) * 35;
                anims.push(card.animate([
                    { opacity: 0, transform: `translate3d(${40 * dir}px, 0, 0) scale(0.98)` },
                    { opacity: 1, transform: "none" }
                ], { duration: 440, delay, easing, fill: "backwards" }));
                if (!toAlbums) return;

                // Album banners: the photo trails the card, the hand-made title overshoots it, a sheen sweeps across
                const bg = card.querySelector(".album-banner-bg");
                const typo = card.querySelector(".album-banner-typo");
                const banner = card.querySelector(".album-banner");
                if (bg) {
                    anims.push(bg.animate([
                        { transform: "translate3d(34px, 0, 0) scale(1.14)" },
                        { transform: "scale(1.015)" }
                    ], { duration: 520, delay, easing, fill: "backwards" }));
                }
                if (typo) {
                    anims.push(typo.animate([
                        { opacity: 0, transform: "translate3d(52px, 0, 0) scale(1.07)" },
                        { opacity: 1, transform: "scale(1.015)" }
                    ], { duration: 480, delay: delay + 40, easing, fill: "backwards" }));
                }
                if (banner) {
                    const sheen = document.createElement("div");
                    sheen.className = "music-morph-sheen";
                    banner.appendChild(sheen);
                    activeOverlays.push(sheen);
                    anims.push(sheen.animate([
                        { transform: "translate3d(-115%, 0, 0)", opacity: 0 },
                        { offset: 0.25, opacity: 1 },
                        { offset: 0.78, opacity: 0.85 },
                        { transform: "translate3d(120%, 0, 0)", opacity: 0 }
                    ], { duration: 440, delay: delay + 30, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
                }
            });

            activeAnimations = anims;
            Promise.allSettled(anims.map(a => a.finished)).then(() => {
                if (token === transitionToken) teardownMorph(newTab);
            });
            return;
        }

        // Mount incoming pane invisibly to measure its exact target card & artwork geometry
        Object.entries(panes).forEach(([name, pane]) => {
            const isTarget = name === newTab;
            pane.style.display = isTarget ? "block" : "none";
            pane.style.opacity = isTarget ? "0" : "";
            pane.style.pointerEvents = isTarget ? "none" : "";
            pane.classList.toggle("active", isTarget);
        });

        const targetHeight = incomingPane.offsetHeight;
        const toCards = measurePaneCards(incomingPane);
        if (toCards.length === 0) {
            teardownMorph(newTab);
            return;
        }

        // Build the Dynamic Island Morph Stage
        const stage = document.createElement("div");
        stage.className = "music-morph-stage";
        stage.setAttribute("aria-hidden", "true");
        // The cloned cards are links: keep them out of the tab order while they fly
        stage.inert = true;
        container.appendChild(stage);
        activeMorphStage = stage;
        activeMorphItems = [];

        const morphDuration = 420;
        // High-velocity Apple launch with velvety settle
        const morphEase = "cubic-bezier(0.22, 1, 0.36, 1)";
        const pairCount = Math.min(fromCards.length, toCards.length);
        const anims = [];

        // Detect 2-column -> 1-column expansion so bottom-right cards clear their lane before left cards widen
        const expandingToStack = pairCount >= 3
            && Math.abs(fromCards[1].rect.top - fromCards[2].rect.top) < 8
            && toCards[2].rect.top - toCards[1].rect.top > 40;
        const stepStagger = 16;

        anims.push(container.animate([
            { height: `${startHeight}px` },
            { height: `${targetHeight}px` }
        ], {
            duration: morphDuration + (pairCount - 1) * stepStagger,
            easing: morphEase,
            fill: "forwards"
        }));

        for (let i = 0; i < pairCount; i++) {
            const from = fromCards[i];
            const to = toCards[i];
            const orderIdx = expandingToStack ? (pairCount - 1 - i) : i;
            const stagger = Math.min(orderIdx, 4) * stepStagger;

            const shell = document.createElement("div");
            shell.className = "music-morph-card";
            // Higher slots stay cleanly on top with solid opaque occlusion while crossing lanes
            shell.style.zIndex = String(pairCount - i + 4);

            // Outgoing content clone (anchored at its natural dimensions, vertically centered)
            const outLayer = document.createElement("div");
            outLayer.className = "music-morph-layer is-outgoing";
            outLayer.style.width = `${from.naturalW}px`;
            outLayer.style.height = `${from.naturalH}px`;
            outLayer.style.marginTop = `${-Math.round(from.naturalH / 2)}px`;
            const outClone = cloneForMorph(from.cardEl);
            outLayer.appendChild(outClone);
            shell.appendChild(outLayer);

            // Incoming content clone (NO CSS filter so descendant backdrop-filter on artist pills stays 100% live!)
            const inLayer = document.createElement("div");
            inLayer.className = "music-morph-layer";
            inLayer.style.width = `${to.naturalW}px`;
            inLayer.style.height = `${to.naturalH}px`;
            inLayer.style.marginTop = `${-Math.round(to.naturalH / 2)}px`;
            const inClone = cloneForMorph(to.cardEl);
            inLayer.appendChild(inClone);
            shell.appendChild(inLayer);

            // Dedicated floating artwork morph element: outer wrapper holds unclipped back-glow,
            // inner clip rounds the crossfading images cleanly in both Chrome and Safari
            let artBox = null;
            if (from.artRect && to.artRect) {
                artBox = document.createElement("div");
                artBox.className = "music-morph-art";
                const artClip = document.createElement("div");
                artClip.className = "music-morph-art-clip";

                if (from.artSrc) {
                    const outImg = document.createElement("img");
                    outImg.src = from.artSrc;
                    artClip.appendChild(outImg);
                    anims.push(outImg.animate([
                        { opacity: 1, transform: "scale(1)" },
                        { opacity: 0, transform: "scale(1.08)" }
                    ], {
                        duration: 190,
                        delay: stagger,
                        easing: "cubic-bezier(0.4, 0, 1, 1)",
                        fill: "both"
                    }));
                }

                if (to.artSrc) {
                    const inImg = document.createElement("img");
                    inImg.src = to.artSrc;
                    artClip.appendChild(inImg);
                    anims.push(inImg.animate([
                        { opacity: 0, transform: "scale(1.1)" },
                        { opacity: 1, transform: "scale(1)" }
                    ], {
                        duration: 270,
                        delay: stagger + 75,
                        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                        fill: "both"
                    }));
                }

                artBox.appendChild(artClip);
                shell.appendChild(artBox);

                anims.push(artBox.animate([
                    {
                        left: `${from.artRect.left}px`,
                        top: `${from.artRect.top}px`,
                        width: `${from.artRect.width}px`,
                        height: `${from.artRect.height}px`,
                        borderRadius: formatRadii(from.artRadii),
                        boxShadow: from.artBoxShadow
                    },
                    {
                        left: `${to.artRect.left}px`,
                        top: `${to.artRect.top}px`,
                        width: `${to.artRect.width}px`,
                        height: `${to.artRect.height}px`,
                        borderRadius: formatRadii(to.artRadii),
                        boxShadow: to.artBoxShadow
                    }
                ], {
                    duration: morphDuration,
                    delay: stagger,
                    easing: morphEase,
                    fill: "both"
                }));
            }

            // Crisp 1px card outline on top of everything (matches Tracks/Albums border and Artists ::after ring)
            const outline = document.createElement("div");
            outline.className = "music-morph-outline";
            shell.appendChild(outline);
            anims.push(outline.animate([
                { borderColor: from.borderColor, boxShadow: from.outlineShadow },
                { borderColor: to.borderColor, boxShadow: to.outlineShadow }
            ], {
                duration: morphDuration,
                delay: stagger,
                easing: morphEase,
                fill: "both"
            }));

            stage.appendChild(shell);
            activeMorphItems.push({
                shell,
                outline,
                artBox,
                targetCardEl: to.cardEl,
                targetNaturalW: to.naturalW,
                targetNaturalH: to.naturalH,
                targetArtSrc: to.artSrc
            });

            anims.push(shell.animate([
                {
                    left: `${from.rect.left}px`,
                    top: `${from.rect.top}px`,
                    width: `${from.rect.width}px`,
                    height: `${from.rect.height}px`,
                    borderRadius: formatRadii(from.radii),
                    backgroundColor: from.backgroundColor,
                    boxShadow: from.boxShadow
                },
                {
                    left: `${to.rect.left}px`,
                    top: `${to.rect.top}px`,
                    width: `${to.rect.width}px`,
                    height: `${to.rect.height}px`,
                    borderRadius: formatRadii(to.radii),
                    backgroundColor: to.backgroundColor,
                    boxShadow: to.boxShadow
                }
            ], {
                duration: morphDuration,
                delay: stagger,
                easing: morphEase,
                fill: "both"
            }));

            // Crisp non-overlapping Dynamic Island content swap:
            // Outgoing blurs away; incoming uses pure opacity+transform (no CSS filter) so backdrop-filter
            // frosted glass on .track-stats-pill and .bar-glass stays live from the first frame!
            anims.push(outLayer.animate([
                { opacity: 1, filter: "blur(0px)", transform: "translate3d(0, 0, 0) scale(1)" },
                {
                    opacity: 0,
                    filter: "blur(5px)",
                    transform: "translate3d(0, 0, 0) scale(0.96)"
                }
            ], {
                duration: 140,
                delay: stagger,
                easing: "cubic-bezier(0.4, 0, 1, 1)",
                fill: "both"
            }));

            const inLayerAnim = inLayer.animate([
                {
                    opacity: 0,
                    transform: "translateY(4px) scale(0.985)"
                },
                { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" }
            ], {
                duration: 260,
                delay: stagger + 115,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                fill: "both"
            });
            inLayerAnim.onfinish = () => {
                // Release WAAPI fill immediately once landed so no residual stacking/backdrop layer lingers
                try { inLayerAnim.cancel(); } catch {}
            };
            anims.push(inLayerAnim);
        }

        // Extra incoming cards beyond the paired slots cascade up with punchy parallax
        for (let i = pairCount; i < toCards.length; i++) {
            const to = toCards[i];
            const extra = document.createElement("div");
            extra.className = "music-morph-extra";
            extra.style.left = `${to.rect.left}px`;
            extra.style.top = `${to.rect.top}px`;
            extra.style.width = `${to.rect.width}px`;
            extra.style.height = `${to.rect.height}px`;
            extra.appendChild(cloneForMorph(to.cardEl));
            stage.appendChild(extra);

            anims.push(extra.animate([
                { opacity: 0, transform: "translate3d(0, 34px, 0) scale(0.95)" },
                { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" }
            ], {
                duration: 340,
                delay: 90 + Math.min(i - pairCount, 3) * 32,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                fill: "both"
            }));
        }

        // Extra outgoing cards dissolve gently downward
        for (let i = pairCount; i < fromCards.length; i++) {
            const from = fromCards[i];
            const extra = document.createElement("div");
            extra.className = "music-morph-extra";
            extra.style.left = `${from.rect.left}px`;
            extra.style.top = `${from.rect.top}px`;
            extra.style.width = `${from.rect.width}px`;
            extra.style.height = `${from.rect.height}px`;
            extra.appendChild(cloneForMorph(from.cardEl));
            stage.appendChild(extra);

            anims.push(extra.animate([
                { opacity: 1, filter: "blur(0px)", transform: "translateY(0px) scale(1)" },
                { opacity: 0, filter: "blur(6px)", transform: "translateY(18px) scale(0.96)" }
            ], {
                duration: 210,
                easing: "cubic-bezier(0.4, 0, 1, 1)",
                fill: "both"
            }));
        }

        activeAnimations = anims;

        Promise.allSettled(anims.map(a => a.finished)).then(() => {
            if (token !== transitionToken) return;
            // Reveal real DOM pane one frame before dropping the morph stage for zero flash
            incomingPane.style.opacity = "";
            incomingPane.style.pointerEvents = "";
            requestAnimationFrame(() => {
                if (token !== transitionToken) return;
                teardownMorph(newTab);
            });
        });
    }

    function syncTabToHash() {
        const tab = tabFromHash();
        if (tab && tab !== currentTab) switchTab(tab, { updateHash: false });
    }

    // Opened on a deep link: show that tab straight away, before the first paint
    const initialTab = tabFromHash();
    if (initialTab && initialTab !== currentTab) {
        switchTab(initialTab, { instant: true, updateHash: false });
    } else {
        positionIndicator(currentTab, { animate: false });
    }

    // Keep the gliding indicator aligned across responsive resizes and webfont swaps
    if (navPill && typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => {
            if (!indicatorAnim) positionIndicator(currentTab, { animate: false });
        }).observe(navPill);
    }
    document.fonts?.ready.then(() => {
        if (!indicatorAnim) positionIndicator(currentTab, { animate: false });
    });

    // Hash edited by hand, or an in-page link
    window.addEventListener("hashchange", syncTabToHash);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusic);
} else {
    initMusic();
}
