import { initAmbientMesh, initGlobalReveal, initGlassParallax, safeImg, smoothMorph, morphText, awaitFastPrefetch } from '../modules/core.js';
import { setDashboardCachedData } from '../modules/cache.js';
import { SEED_SPOTIFY, SEED_MOVIES, SEED_BOOKS } from '../modules/seed-data.js';

const projects = [
    {
        title: "Real, Deepfake or AI",
        description: "A hybrid machine learning pipeline utilizing CNNs and SVM to detect manipulated images.",
        tags: ["ML & DL", "Image Processing"],
        type: "wide",
        customClass: "project-real",
        visualHtml: '<img src="projects/real-deepfake-or-ai/real-deepfake-or-ai.webp" style="width: 100%; height: 100%; object-fit: cover;" alt="Real, Deepfake or AI" loading="lazy" decoding="async">',
        url: "/projects/real-deepfake-or-ai"
    }
];

function initIndex() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    // Avatar 3D Tracking
    const heroTube = document.querySelector('.unified-hero-tube');
    const avatar = document.querySelector('.avatar-memoji');
    if (heroTube && avatar) {
        let rect = null;
        heroTube.addEventListener('mouseenter', () => {
            rect = heroTube.getBoundingClientRect();
        });
        heroTube.addEventListener('mousemove', (e) => {
            if (!rect) rect = heroTube.getBoundingClientRect();
            const x = e.clientX - rect.left - (rect.width / 2);
            const y = e.clientY - rect.top - (rect.height / 2);
            const rotateX = (y / (rect.height / 2)) * -15;
            const rotateY = (x / (rect.width / 2)) * 15;
            avatar.style.transform = `scale(1.15) perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            avatar.style.transition = 'none';
        });
        heroTube.addEventListener('mouseleave', () => {
            rect = null;
            avatar.style.transform = `scale(1.15) perspective(500px) rotateX(0deg) rotateY(0deg)`;
            avatar.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
        });
    }

    // Floating Emoji Spawner
    const emojis = {
        'fun-aoty': ['🎵', '🎶', '🎸', '🎹', '🎧'],
        'fun-books': ['📖', '📚', '🔖', '🖋️', '☕'],
        'fun-movies': ['🎬', '🍿', '🎞️', '⭐', '🎥']
    };
    document.querySelectorAll('.fun-aoty, .fun-books, .fun-movies').forEach(card => {
        let lastSpawnTime = 0;
        card.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastSpawnTime < 150) return;
            lastSpawnTime = now;
            let classSet = card.classList.contains('fun-aoty') ? emojis['fun-aoty'] :
                           card.classList.contains('fun-books') ? emojis['fun-books'] : emojis['fun-movies'];
            const randomEmoji = classSet[Math.floor(Math.random() * classSet.length)];
            const particle = document.createElement('div');
            particle.textContent = randomEmoji;
            particle.className = 'floating-emoji';
            particle.style.left = `${e.pageX + (Math.random() * 20 - 10)}px`;
            particle.style.top = `${e.pageY + (Math.random() * 20 - 10)}px`;
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 1000);
        });
    });

    // Projects Injection
    const container = document.getElementById("projects-container");
    if (container) {
        projects.forEach((proj) => {
            const cardWidthClass = proj.type === 'wide' ? 'wide-card' : proj.type === 'full-wide' ? 'full-wide-card' : 'default-card';
            const card = document.createElement("a");
            card.href = proj.url || "#";
            card.className = `glass-card ${cardWidthClass} ${proj.customClass || ''}`;
            const tagsHtml = proj.tags.map(tag => `<span class="tag">${tag}</span>`).join("");
            card.innerHTML = `
                <div class="card-visual">${proj.visualHtml}</div>
                <div class="card-content">
                    <h3>${proj.title}</h3>
                    ${proj.description ? `<p>${proj.description}</p>` : ''}
                    <div class="tags">${tagsHtml}</div>
                </div>`;
            container.appendChild(card);
            initGlassParallax(); // Re-init for injected cards
        });
    }


    // Index Data Sync with LocalStorage Cache (Instant Load Pattern)
    const indexBooksContainer = document.getElementById("index-books-container");
    const indexMoviesContainer = document.getElementById("index-movies-container");
    const cassetteArtistName = document.getElementById("cassette-artist-name");
    const cassetteSongTitle = document.getElementById("cassette-song-title");
    let renderedSpotifySig = '';
    let renderedBooksSig = '';
    let renderedMoviesSig = '';

    if (indexBooksContainer && indexMoviesContainer) {
        const CACHE_KEY = 'simplyigit_dashboard_cache';
        
        // 1. Instant 0ms render from LocalStorage Cache or Bundled Seed Data
        let initialData = null;
        try {
            const stored = localStorage.getItem(CACHE_KEY);
            if (stored) initialData = JSON.parse(stored);
        } catch {}

        if (!initialData || !initialData.spotify || !initialData.movies || !initialData.books) {
            initialData = {
                spotify: SEED_SPOTIFY,
                movies: SEED_MOVIES,
                books: SEED_BOOKS
            };
        }

        async function fetchFreshDashboard() {
            if (window.__PREFETCH_DASHBOARD__) {
                try {
                    const pre = await window.__PREFETCH_DASHBOARD__;
                    window.__PREFETCH_DASHBOARD__ = null;
                    if (pre && pre.success && pre.data) return pre.data;
                } catch {}
            }
            try {
                const res = await fetch("/api/dashboard");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) return json.data;
                }
            } catch {}
            try {
                const res = await fetch("/data/dashboard.json");
                if (res.ok) {
                    const json = await res.json();
                    if (json.data) return json.data;
                }
            } catch {}
            return null;
        }

        const freshPromise = fetchFreshDashboard();

        awaitFastPrefetch(freshPromise, 65).then(fastFresh => {
            if (fastFresh) {
                setDashboardCachedData(fastFresh);
                if (fastFresh.spotify) renderSpotify(fastFresh.spotify);
                if (fastFresh.books) renderBooks(fastFresh.books);
                if (fastFresh.movies) renderMovies(fastFresh.movies);
                return;
            }

            // Render cached data immediately if network takes >65ms
            renderSpotify(initialData.spotify);
            renderBooks(initialData.books);
            renderMovies(initialData.movies);

            freshPromise.then(fresh => {
                if (!fresh) return;
                setDashboardCachedData(fresh);
                if (fresh.spotify) renderSpotify(fresh.spotify);
                if (fresh.books) renderBooks(fresh.books);
                if (fresh.movies) renderMovies(fresh.movies);
            });
        });
    }

    function renderSpotify(spotify) {
        if (!spotify) return;
        const data = spotify.data || spotify;
        const topTrack = data.top_tracks_last_month?.[0];
        if (!topTrack) return;

        const sig = `${topTrack.title}|${topTrack.artist}|${topTrack.cover_url}`;
        if (sig === renderedSpotifySig) return;
        const isUpdate = renderedSpotifySig !== '';
        renderedSpotifySig = sig;

        const cassetteBody = document.getElementById("cassette-body");
        const applySpotifyDom = () => {
            if (cassetteArtistName) {
                cassetteArtistName.innerHTML = `<span class="fade-in" title="${topTrack.artist}">${topTrack.artist}</span>`;
            }
            if (cassetteSongTitle) {
                const marquee = cassetteSongTitle.querySelector('.cassette-song-marquee');
                if (marquee) {
                    marquee.innerHTML = Array(7).fill(`<span class="cassette-song-title-text">${topTrack.title} &nbsp;&nbsp; • &nbsp;&nbsp; </span>`).join('');
                    const titleLen = (topTrack.title || "").length;
                    const duration = Math.max(5, Math.min(12, 4 + titleLen * 0.12));
                    marquee.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
                }
            }
            if (cassetteBody && topTrack.cover_url) {
                cassetteBody.style.setProperty('--cassette-art', `url(${topTrack.cover_url})`);
                if (topTrack.prominent_color && Array.isArray(topTrack.prominent_color)) {
                    const [r, g, b] = topTrack.prominent_color;
                    cassetteBody.style.setProperty('--cassette-art-color', `rgb(${r}, ${g}, ${b})`);
                    cassetteBody.classList.add('has-art');
                } else {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = topTrack.cover_url;
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = 1; canvas.height = 1;
                            ctx.drawImage(img, 0, 0, 1, 1);
                            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                            cassetteBody.style.setProperty('--cassette-art-color', `rgb(${r}, ${g}, ${b})`);
                        } catch {}
                        cassetteBody.classList.add('has-art');
                    };
                }
            }
        };

        if (isUpdate && cassetteBody) {
            smoothMorph(cassetteBody, applySpotifyDom, [topTrack.cover_url]);
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
        const safeTitle = (heroBook.title || '').replace(/"/g, '&quot;');
        const safeAuthor = (heroBook.author || '').replace(/"/g, '&quot;');
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
                    <img src="${leftCover}" alt="${(book3.title || '').replace(/"/g, '&quot;')}" loading="lazy" decoding="async">
                </div>
                <div class="book-shelf-item book-shelf-right">
                    <img src="${rightCover}" alt="${(book2.title || '').replace(/"/g, '&quot;')}" loading="lazy" decoding="async">
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
                                    <span class="book-page-num">${pageMeta}</span>
                                </div>
                            </div>
                        </div>

                        <div class="book-front-cover-assembly">
                            <div class="book-cover-outside">
                                <div class="book-ribbon-tag"></div>
                                <img src="${heroCover}" class="book-cover-art" alt="${safeTitle}" decoding="async">
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
            smoothMorph(indexBooksContainer, applyBooksDom, [heroCover, leftCover, rightCover]);
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
        const sig = list.map(f => `${f.title}|${f.cover_url}`).join(';;');
        if (sig === renderedMoviesSig) return;
        const isUpdate = renderedMoviesSig !== '';
        renderedMoviesSig = sig;

        const duplicated = list.length >= 4 ? [...list, ...list] : [...list, ...list, ...list, ...list];
        const imgUrls = list.map(f => safeImg(f.cover_url, 150));

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
                    if (img) {
                        img.src = imgUrl;
                        img.alt = cleanTitle;
                    }
                });
                return;
            }

            indexMoviesContainer.innerHTML = `
                <div class="vhs-filmstrip-track">
                    ${duplicated.map((film) => {
                        const imgUrl = safeImg(film.cover_url, 150);
                        const cleanTitle = (film.title || "").replace(/"/g, '&quot;');
                        return `
                            <div class="vhs-filmstrip-item" title="${cleanTitle}">
                                <img src="${imgUrl}" alt="${cleanTitle}" class="vhs-film-cover" loading="lazy" decoding="async">
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        };

        if (isUpdate) {
            smoothMorph(indexMoviesContainer, applyMoviesDom, imgUrls);
        } else {
            applyMoviesDom();
        }
    }

    // VHS Cassette Hover Interaction: Live SP timer and state toggle
    const vhsCard = document.getElementById('vhs-card');
    if (vhsCard) {
        const vhsTimer = vhsCard.querySelector('.vhs-tape-counter');
        let hoverStartTime = null;
        let vhsInterval = null;

        const updateTimer = () => {
            if (!hoverStartTime || !vhsTimer) return;
            const elapsed = Math.floor((Date.now() - hoverStartTime) / 1000);
            const h = Math.floor(elapsed / 3600);
            const m = Math.floor((elapsed % 3600) / 60);
            const s = elapsed % 60;
            const pad = (n) => n < 10 ? '0' + n : `${n}`;
            vhsTimer.textContent = `SP ${h}:${pad(m)}:${pad(s)}`;
        };

        vhsCard.addEventListener('mouseenter', () => {
            hoverStartTime = Date.now();
            vhsCard.classList.add('is-paused');
            if (vhsTimer) vhsTimer.textContent = 'SP 0:00:00';
            clearInterval(vhsInterval);
            vhsInterval = setInterval(updateTimer, 200);
        });

        vhsCard.addEventListener('mouseleave', () => {
            clearInterval(vhsInterval);
            vhsInterval = null;
            hoverStartTime = null;
            vhsCard.classList.remove('is-paused');
            if (vhsTimer) vhsTimer.textContent = 'SP 0:00:00';
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIndex);
} else {
    initIndex();
}
