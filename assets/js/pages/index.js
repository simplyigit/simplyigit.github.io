import { initAmbientMesh, setAmbientTint, glowColor, imageColor, initGlobalReveal, initGlassParallax, initLibraryKeys, safeImg, smoothMorph, morphText, escapeHtml } from '../modules/core.js';
import { initAvatarDepth } from '../modules/avatar-depth.js';
import { getCachedDashboard, setDashboardCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';
import { displaySongTitle } from '../modules/music-text.js';
import { togglePreview, stopPreview } from '../modules/preview-player.js';

// The project card's picture: a small fully connected network, drawn as SVG so it can animate.
// On hover (always, on touch screens) a signal crosses it and the output node cycles through the
// three verdicts; the motion itself is CSS (home.css). Same 960x716 frame as the image it replaced.
const NN_LAYERS = [
    { x: 127, ys: [161, 260, 360, 459, 562], color: '#c8f1df' },
    { x: 309, ys: [161, 260, 360, 459, 562], color: '#ccd3fb' },
    { x: 490, ys: [161, 260, 360, 459, 562], color: '#dccbf0' },
    { x: 672, ys: [260, 360, 459], color: '#fddfb6' },
    { x: 833, ys: [360], color: '#ff9c92' }
];

function neuralNetSvg() {
    let edges = '', pulses = '', nodes = '';
    NN_LAYERS.forEach((layer, l) => {
        const next = NN_LAYERS[l + 1];
        if (next) {
            layer.ys.forEach(y1 => next.ys.forEach(y2 => {
                const line = `x1="${layer.x}" y1="${y1}" x2="${next.x}" y2="${y2}"`;
                edges += `<line ${line}/>`;
                pulses += `<line ${line} pathLength="1" style="--l: ${l}"/>`;
            }));
        }
        layer.ys.forEach(y => {
            nodes += `<circle cx="${layer.x}" cy="${y}" r="30" fill="${layer.color}" style="--l: ${l}"${next ? '' : ' class="nn-output"'}/>`;
        });
    });
    const live = window.matchMedia('(hover: none)').matches ? ' is-live' : '';
    return `
        <svg class="card-visual-cover nn-art${live}" viewBox="0 0 960 716" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A neural network classifying an image as real, AI-generated or deepfake">
            <defs>
                <linearGradient id="nn-backdrop" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stop-color="#262b40"/>
                    <stop offset="0.5" stop-color="#25222a"/>
                    <stop offset="1" stop-color="#2b2e25"/>
                </linearGradient>
            </defs>
            <rect width="960" height="716" fill="url(#nn-backdrop)"/>
            <g class="nn-edges">${edges}</g>
            <g class="nn-pulses">${pulses}</g>
            <g class="nn-nodes">${nodes}</g>
            <g aria-hidden="true">
                <text class="nn-verdict nn-verdict-real" x="833" y="448" style="--v: 0">REAL</text>
                <text class="nn-verdict nn-verdict-ai" x="833" y="448" style="--v: 1">AI FAKE</text>
                <text class="nn-verdict nn-verdict-df" x="833" y="448" style="--v: 2">DEEPFAKE</text>
            </g>
        </svg>`;
}

// A wide project card hugs its text: the text column narrows to its longest line, so the gap to
// the right of the text equals the card's padding, like the gap to the left of the picture
function fitCardToText(card) {
    const content = card.querySelector('.card-content');
    if (!content) return;
    const fit = () => {
        // Back to the stylesheet's column width, where the text wraps as designed
        content.style.width = '';
        // Stacked layout (phones): the text is centred across the full width
        if (getComputedStyle(card).flexDirection !== 'row') return;
        const left = content.getBoundingClientRect().left;
        const range = document.createRange();
        let longest = 0;
        content.querySelectorAll('h3, p, .tags').forEach(el => {
            range.selectNodeContents(el);
            for (const line of range.getClientRects()) longest = Math.max(longest, line.right - left);
        });
        if (longest > 0) content.style.width = `${Math.ceil(longest)}px`;
    };
    fit();
    // Line breaks move when the web font replaces the fallback: fit again after every font load
    // ("ready" alone can resolve before the stylesheet has even asked for the font)
    document.fonts?.ready.then(fit);
    document.fonts?.addEventListener?.('loadingdone', fit);
    window.addEventListener('resize', fit, { passive: true });
}

const projects = [
    {
        title: "Real, Deepfake or AI",
        description: "A hybrid machine learning pipeline utilizing CNNs and SVM to detect manipulated images.",
        tags: ["ML & DL", "Image Processing"],
        type: "wide",
        customClass: "project-real",
        visualHtml: neuralNetSvg(),
        url: "/projects/real-deepfake-or-ai"
    }
];

function initIndex() {
    // One glow per library object, tinted by its cover once the data is in (showCardColor)
    initAmbientMesh({ layout: 'library', tinted: true });
    initLibraryKeys();

    // Memoji: depth-map parallax, so the head turns toward the pointer
    initAvatarDepth(document.querySelector('.unified-hero-tube .avatar-memoji'), '/images/pp-depth.webp');

    // Projects Injection
    const container = document.getElementById("projects-container");
    if (container) {
        projects.forEach((proj) => {
            const cardWidthClass = proj.type === 'wide' ? 'wide-card' : proj.type === 'full-wide' ? 'full-wide-card' : 'default-card';
            const card = document.createElement("a");
            card.href = proj.url || "#";
            card.className = `glass-card ${cardWidthClass} ${proj.customClass || ''}`;
            const tagsHtml = proj.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
            card.innerHTML = `
                <div class="card-visual">${proj.visualHtml}</div>
                <div class="card-content">
                    <h3>${escapeHtml(proj.title)}</h3>
                    ${proj.description ? `<p>${escapeHtml(proj.description)}</p>` : ''}
                    <div class="tags">${tagsHtml}</div>
                </div>`;
            container.appendChild(card);
            if (proj.type === 'wide') fitCardToText(card);
        });
    }

    // After injection, so the project cards get the reveal and the tilt too
    initGlobalReveal();
    initGlassParallax();


    // Index Data Sync with LocalStorage Cache (Instant Load Pattern)
    const indexBooksContainer = document.getElementById("index-books-container");
    const indexMoviesContainer = document.getElementById("index-movies-container");
    const cassetteArtistName = document.getElementById("cassette-artist-name");
    const cassetteSongTitle = document.getElementById("cassette-song-title");
    const cassetteSlot = document.getElementById("cassette-slot");
    const cassettePlay = document.getElementById("cassette-play");
    const cassettePlayTime = document.getElementById("cassette-play-time");
    let cassettePreviewUrl = '';

    // Each library object lends its cover's colour to the page: a glow in the background mesh
    // (`slot`: book left, music middle, cinema right) and a faint wash over its own card.
    // The colour is the sync's prominent_color, else worked out from the cover image.
    const colorRequests = {};
    async function showCardColor(slot, card, item, imageUrl) {
        const request = colorRequests[slot] = {};
        const known = Array.isArray(item.prominent_color) && item.prominent_color.length === 3;
        const color = known ? item.prominent_color : await imageColor(imageUrl);
        // A newer render of this card has asked since: its colour wins
        if (!color || colorRequests[slot] !== request) return;
        setAmbientTint(color, { slot });
        if (card) {
            card.style.setProperty('--card-art-color', `rgb(${color.join(', ')})`);
            const glow = glowColor(color);
            if (glow) card.style.setProperty('--card-glow-color', `rgb(${glow.join(', ')})`);
            else card.style.removeProperty('--card-glow-color');
        }
    }

    let renderedSpotifySig = '';
    let renderedBooksSig = '';
    let renderedMoviesSig = '';

    if (indexBooksContainer && indexMoviesContainer) {
        loadLiveData({
            prefetch: window.__PREFETCH_DASHBOARD__,
            api: "/api/dashboard",
            snapshot: "/data/dashboard.json",
            readCache: getCachedDashboard,
            saveCache: setDashboardCachedData,
            loadSeed: () => import('../modules/seed-data.js').then(m => ({
                spotify: m.SEED_SPOTIFY,
                movies: m.SEED_MOVIES,
                books: m.SEED_BOOKS
            })),
            // One section at a time: concurrent morphs would fight over the single view transition
            render: async (data) => {
                if (data.spotify) await renderSpotify(data.spotify);
                if (data.books) await renderBooks(data.books);
                if (data.movies) await renderMovies(data.movies);
            }
        });
    }

    function renderSpotify(spotify) {
        if (!spotify) return;
        const data = spotify.data || spotify;
        const topTrack = data.top_tracks_last_month?.[0];
        if (!topTrack) return;

        // The cassette label is ~100px wide: the 300px cover is plenty
        const artUrl = topTrack.cover_url_small || topTrack.cover_url;
        const songTitle = displaySongTitle(topTrack.title);
        const sig = `${topTrack.title}|${topTrack.artist}|${artUrl}|${topTrack.preview_url || ''}`;
        if (sig === renderedSpotifySig) return;
        const isUpdate = renderedSpotifySig !== '';
        renderedSpotifySig = sig;

        const cassetteBody = document.getElementById("cassette-body");
        showCardColor('music', cassetteBody, topTrack, artUrl);

        const applySpotifyDom = () => {
            // The deck key appears only when the sync found a preview for this track
            stopPreview();
            cassettePreviewUrl = topTrack.preview_url || '';
            if (cassettePlay) {
                cassettePlay.hidden = !cassettePreviewUrl;
                cassettePlay.setAttribute('aria-label', `Play a 30-second preview of ${songTitle} by ${topTrack.artist}`);
            }
            if (cassetteArtistName) {
                const artist = escapeHtml(topTrack.artist);
                cassetteArtistName.innerHTML = `<span class="fade-in" title="${artist}">${artist}</span>`;
            }
            if (cassetteSongTitle) {
                const marquee = cassetteSongTitle.querySelector('.cassette-song-marquee');
                if (marquee) {
                    marquee.innerHTML = Array(7).fill(`<span class="cassette-song-title-text">${escapeHtml(songTitle)} &nbsp;&nbsp; • &nbsp;&nbsp; </span>`).join('');
                    const titleLen = songTitle.length;
                    const duration = Math.max(5, Math.min(12, 4 + titleLen * 0.12));
                    marquee.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
                }
            }
            if (cassetteBody && artUrl) {
                cassetteBody.style.setProperty('--cassette-art', `url(${artUrl})`);
                cassetteBody.classList.add('has-art');
            }
        };

        if (isUpdate && cassetteBody) {
            return smoothMorph(cassetteBody, applySpotifyDom, [artUrl]);
        } else {
            applySpotifyDom();
        }
    }

    function getBookAcronym(title) {
        if (!title) return '';
        const words = title.trim().split(/[\s-]+/);
        if (words.length === 1) {
            return words[0].slice(0, 3).toUpperCase();
        }
        return words.map(w => {
            const clean = w.replace(/[^a-zA-Z0-9&]/g, '');
            if (!clean) return '';
            if (clean.toLowerCase() === 'and' || clean === '&') return '&';
            return clean[0].toUpperCase();
        }).join('').slice(0, 5);
    }

    function renderBooks(books) {
        if (!books || !indexBooksContainer) return;
        const data = books.data || books;
        const bookList = Array.isArray(data) ? data : (Array.isArray(data.books) ? data.books : []);
        if (bookList.length === 0) return;

        // Prioritize 'currently-reading' books first, then 'to-read', then 'read'
        const sorted = [...bookList].sort((a, b) => {
            const order = { 'currently-reading': 0, 'to-read': 1, 'read': 2 };
            return (order[a.shelf] ?? 1) - (order[b.shelf] ?? 1);
        });
        const top3 = sorted.slice(0, 3);

        const sig = top3.map(b => `${b.title}|${b.cover_url}|${b.shelf || ''}|${b.num_pages || ''}`).join(';;');
        if (sig === renderedBooksSig) return;
        const isUpdate = renderedBooksSig !== '';
        renderedBooksSig = sig;

        const heroBook = top3[0];
        showCardColor('book', document.querySelector('#book-card .hero-book-body'), heroBook, safeImg(heroBook.cover_url, 240));
        const safeTitle = escapeHtml(heroBook.title);
        const safeAuthor = escapeHtml(heroBook.author);
        const heroCover = safeImg(heroBook.cover_url, 240);
        const isCurrentlyReading = heroBook.shelf === 'currently-reading';
        const statusLabel = isCurrentlyReading ? 'READING' : 'UP NEXT';
        const pageMeta = heroBook.num_pages ? `${heroBook.num_pages} pp.` : (heroBook.year || 'EX LIBRIS');
        const initials = getBookAcronym(heroBook.title);

        const book3 = top3[2] || top3[0];
        const book2 = top3[1] || top3[0];
        const leftCover = safeImg(book3.cover_url, 200);
        const rightCover = safeImg(book2.cover_url, 200);

        const applyBooksDom = () => {
            const statusEl = document.getElementById('book-bay-status');
            if (statusEl) morphText(statusEl, statusLabel);

            const initialsEl = document.getElementById('book-bay-initials') || document.querySelector('.book-bay-counter');
            if (initialsEl && initials) {
                morphText(initialsEl, initials);
            }

            // If 3D book bay already exists, update covers and text in-place so hover state never breaks
            const existingHeroImg = indexBooksContainer.querySelector('.book-cover-art');
            const existingLeftImg = indexBooksContainer.querySelector('.book-shelf-left img');
            const existingRightImg = indexBooksContainer.querySelector('.book-shelf-right img');

            if (existingHeroImg && existingLeftImg && existingRightImg) {
                existingLeftImg.src = leftCover;
                existingLeftImg.alt = book3.title || '';
                existingRightImg.src = rightCover;
                existingRightImg.alt = book2.title || '';
                existingHeroImg.src = heroCover;
                existingHeroImg.alt = heroBook.title || '';

                const headingEl = indexBooksContainer.querySelector('.book-page-heading');
                const bylineEl = indexBooksContainer.querySelector('.book-page-byline');
                const footerSpans = indexBooksContainer.querySelectorAll('.book-page-footer span');
                if (headingEl) headingEl.textContent = heroBook.title || '';
                if (bylineEl) bylineEl.textContent = heroBook.author ? `by ${heroBook.author}` : '';
                if (footerSpans.length >= 2) {
                    footerSpans[0].textContent = statusLabel;
                    footerSpans[1].textContent = pageMeta;
                }
                return;
            }

            indexBooksContainer.innerHTML = `
                <div class="book-shelf-item book-shelf-left">
                    <img src="${escapeHtml(leftCover)}" alt="${escapeHtml(book3.title)}" loading="lazy" decoding="async">
                </div>
                <div class="book-shelf-item book-shelf-right">
                    <img src="${escapeHtml(rightCover)}" alt="${escapeHtml(book2.title)}" loading="lazy" decoding="async">
                </div>

                <div class="book-shelf-item book-shelf-center" id="hero-book-wrapper">
                    <div class="book-3d-obj" id="hero-book-obj">
                        <div class="book-obj-spine"></div>
                        <div class="book-obj-base">
                            <div class="book-pages-edge-right"></div>
                        </div>

                        <div class="book-page-spread-right">
                            <div class="book-ribbon-drape"></div>
                            <div class="book-page-paper">
                                <div class="book-page-header">
                                    <span class="book-page-crest">❦</span>
                                </div>
                                <div class="book-page-body">
                                    <div class="book-page-heading">${safeTitle}</div>
                                    <div class="book-page-byline">${safeAuthor ? `by ${safeAuthor}` : ''}</div>
                                    <div class="book-page-rule"></div>
                                    <div class="book-page-text-lines">
                                        <div class="page-line line-1"></div>
                                        <div class="page-line line-2"></div>
                                        <div class="page-line line-3"></div>
                                    </div>
                                </div>
                                <div class="book-page-footer">
                                    <span>${statusLabel}</span>
                                    <span class="book-page-num">${escapeHtml(pageMeta)}</span>
                                </div>
                            </div>
                        </div>

                        <div class="book-front-cover-assembly">
                            <div class="book-cover-outside">
                                <div class="book-ribbon-tag"></div>
                                <img src="${escapeHtml(heroCover)}" class="book-cover-art" alt="${safeTitle}" decoding="async">
                                <div class="book-cover-emboss-spine"></div>
                                <div class="book-cover-glare"></div>
                            </div>
                            <div class="book-cover-inside">
                                <div class="book-endpaper-vintage">
                                    <div class="bookplate-seal">
                                        <div class="bookplate-tag">EX LIBRIS</div>
                                        <div class="bookplate-monogram">Y</div>
                                        <div class="bookplate-sub">COLLECTION</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        };

        if (isUpdate) {
            return smoothMorph(indexBooksContainer, applyBooksDom, [heroCover, leftCover, rightCover]);
        } else {
            applyBooksDom();
        }
    }

    function renderMovies(movies) {
        if (!movies || !indexMoviesContainer) return;
        const data = movies.data || movies;
        const recent = Array.isArray(data.recent_activity) ? data.recent_activity : (Array.isArray(data) ? data : []);
        if (recent.length === 0) return;

        const list = recent.slice(0, 10);
        // Compare the final image URLs, so raw and already-proxied copies of the same poster match
        const imgUrls = list.map(f => safeImg(f.cover_url, 150));
        const sig = list.map((f, i) => `${f.title}|${imgUrls[i]}`).join(';;');
        if (sig === renderedMoviesSig) return;
        const isUpdate = renderedMoviesSig !== '';
        renderedMoviesSig = sig;

        // The latest watch colours the card
        showCardColor('cinema', document.querySelector('#vhs-card .vhs-body'), list[0], imgUrls[0]);

        const duplicated = list.length >= 4 ? [...list, ...list] : [...list, ...list, ...list, ...list];

        // Films the cinema page lists too (its first 7 recent watches) can morph into their poster there
        const onCinemaPage = (idx) => idx % list.length < 7;

        const applyMoviesDom = () => {
            // Update existing filmstrip items in-place if count matches so VHS marquee never resets
            const existingItems = indexMoviesContainer.querySelectorAll('.vhs-filmstrip-item');
            if (existingItems.length === duplicated.length) {
                duplicated.forEach((film, idx) => {
                    const item = existingItems[idx];
                    const img = item.querySelector('img');
                    const imgUrl = safeImg(film.cover_url, 150);
                    const cleanTitle = film.title || "";
                    item.title = cleanTitle;
                    item.toggleAttribute('data-morph', onCinemaPage(idx));
                    if (img) {
                        img.src = imgUrl;
                        img.alt = cleanTitle;
                    }
                });
                return;
            }

            indexMoviesContainer.innerHTML = `
                <div class="vhs-filmstrip-track">
                    ${duplicated.map((film, idx) => {
                        const imgUrl = safeImg(film.cover_url, 150);
                        const cleanTitle = escapeHtml(film.title);
                        return `
                            <div class="vhs-filmstrip-item" title="${cleanTitle}"${onCinemaPage(idx) ? ' data-morph' : ''}>
                                <img src="${escapeHtml(imgUrl)}" alt="${cleanTitle}" class="vhs-film-cover" loading="lazy" decoding="async">
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        };

        if (isUpdate) {
            return smoothMorph(indexMoviesContainer, applyMoviesDom, imgUrls);
        } else {
            applyMoviesDom();
        }
    }

    // Deck key: play or stop the #1 track's 30-second preview; the tape runs while it plays
    if (cassettePlay && cassetteSlot) {
        cassettePlay.addEventListener('click', () => {
            togglePreview(cassettePlay, cassettePreviewUrl, ({ playing, remaining }) => {
                cassettePlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
                cassetteSlot.classList.toggle('is-playing', playing);
                if (cassettePlayTime) cassettePlayTime.textContent = `0:${String(playing ? remaining : 30).padStart(2, '0')}`;
            });
        });
    }

    // Touch screens have no hover: the book opens while it is on screen, and the tape (which always
    // runs there) gets its tracking glitch as it scrolls into view
    const touchOnly = window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window;
    const bookCard = document.getElementById('book-card');
    if (touchOnly && bookCard) {
        new IntersectionObserver(([entry]) => {
            bookCard.classList.toggle('is-open', entry.isIntersecting);
        }, { threshold: 0.7, rootMargin: '-12% 0px -12% 0px' }).observe(bookCard);
    }

    // Page transitions (vt-nav.js): which element of a library object flies to its page, or lands
    // back from it. `key` names the film or book, so the other page can find the same one.
    const morphElement = (library, key) => {
        if (library === 'music') {
            const el = document.querySelector('.has-art .cassette-cover-art-wrapper');
            return el ? { el, key: '' } : null;
        }
        if (library === 'cinema' && indexMoviesContainer) {
            // The poster nearest the middle of the VHS window: of film `key` when landing,
            // of any film the cinema page also lists when leaving
            const bay = indexMoviesContainer.getBoundingClientRect();
            const middle = (bay.left + bay.right) / 2;
            let best = null;
            indexMoviesContainer.querySelectorAll('.vhs-filmstrip-item[data-morph]').forEach(item => {
                const img = item.querySelector('img');
                if (!img || (key && item.title !== key)) return;
                const box = item.getBoundingClientRect();
                const centre = (box.left + box.right) / 2;
                if (centre < bay.left || centre > bay.right) return;
                const distance = Math.abs(centre - middle);
                if (!best || distance < best.distance) best = { el: img, key: item.title, distance };
            });
            return best;
        }
        if (library === 'reading' && indexBooksContainer) {
            const el = indexBooksContainer.querySelector('.book-shelf-center');
            const title = el?.querySelector('.book-cover-art')?.alt;
            return title && (!key || key === title) ? { el, key: title } : null;
        }
        return null;
    };
    window.__vtMorph = {
        source: (library) => morphElement(library),
        target: (library, key) => morphElement(library, key)?.el
    };

    // VHS Cassette Hover Interaction: Live SP timer and state toggle
    const vhsCard = document.getElementById('vhs-card');
    if (vhsCard) {
        const vhsTimer = vhsCard.querySelector('.vhs-tape-counter');
        let hoverStartTime = null;
        let vhsInterval = null;

        // Tracking glitch as the tape starts (CSS, home.css); the class restarts it on every play
        const glitch = () => {
            vhsCard.classList.remove('is-glitching');
            void vhsCard.offsetWidth;
            vhsCard.classList.add('is-glitching');
        };
        vhsCard.addEventListener('animationend', (e) => {
            if (e.animationName === 'vhsTrackingTear') vhsCard.classList.remove('is-glitching');
        });
        if (touchOnly) {
            const seen = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                seen.disconnect();
                glitch();
            }, { threshold: 0.7 });
            seen.observe(vhsCard);
        }

        const updateTimer = () => {
            if (!hoverStartTime || !vhsTimer) return;
            const elapsed = Math.floor((Date.now() - hoverStartTime) / 1000);
            const h = Math.floor(elapsed / 3600);
            const m = Math.floor((elapsed % 3600) / 60);
            const s = elapsed % 60;
            const pad = (n) => n < 10 ? '0' + n : `${n}`;
            vhsTimer.textContent = `SP ${h}:${pad(m)}:${pad(s)}`;
        };

        // Hover or keyboard focus plays the tape: the reel rolls, the OSD reads PLAY and the counter runs
        const play = () => {
            if (vhsInterval) return;
            hoverStartTime = Date.now();
            vhsCard.classList.add('is-playing');
            glitch();
            if (vhsTimer) vhsTimer.textContent = 'SP 0:00:00';
            vhsInterval = setInterval(updateTimer, 200);
        };

        const stop = () => {
            if (vhsCard.matches(':hover, :focus-visible')) return;
            clearInterval(vhsInterval);
            vhsInterval = null;
            hoverStartTime = null;
            vhsCard.classList.remove('is-playing');
            if (vhsTimer) vhsTimer.textContent = 'SP 0:00:00';
        };

        vhsCard.addEventListener('mouseenter', play);
        vhsCard.addEventListener('focusin', play);
        vhsCard.addEventListener('mouseleave', stop);
        vhsCard.addEventListener('focusout', stop);
        // Back from another page (back/forward cache): the pointer may no longer be over the tape
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) stop();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIndex);
} else {
    initIndex();
}
