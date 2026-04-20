const projects = [
    {
        title: "Real, Deepfake or AI",
        description: "A hybrid machine learning pipeline utilizing CNNs and SVM to detect manipulated images.",
        tags: ["ML & DL", "Image Processing"],
        type: "wide",
        customClass: "project-real",
        visualHtml: '<img src="images/real-deepfake-or-ai.png" style="width: 100%; height: 100%; object-fit: cover;" alt="Real, Deepfake or AI">',
        url: "Projects/real-deepfake-or-ai.html"
    }
];

document.addEventListener("DOMContentLoaded", () => {

    // Inject hardware-accelerated ambient meshes to destroy banding
    document.body.insertAdjacentHTML('afterbegin', `
        <div id="ambient-mesh">
            <div class="orb orb-1"></div>
            <div class="orb orb-2"></div>
            <div class="orb orb-3"></div>
        </div>
    `);

    // Avatar 3D Tracking Logic
    const heroTube = document.querySelector('.unified-hero-tube');
    const avatar = document.querySelector('.avatar-memoji');
    if (heroTube && avatar) {
        heroTube.addEventListener('mousemove', (e) => {
            const rect = heroTube.getBoundingClientRect();
            const x = e.clientX - rect.left - (rect.width / 2);
            const y = e.clientY - rect.top - (rect.height / 2);
            const rotateX = (y / (rect.height / 2)) * -15;
            const rotateY = (x / (rect.width / 2)) * 15;
            avatar.style.transformOrigin = 'center center';
            avatar.style.transform = `scale(1.15) perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            avatar.style.transition = 'none';
        });

        heroTube.addEventListener('mouseleave', () => {
            avatar.style.transform = `scale(1.15) perspective(500px) rotateX(0deg) rotateY(0deg)`;
            avatar.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
        });

        heroTube.addEventListener('mouseenter', () => {
            avatar.style.transition = 'none';
        });
    }

    // Fun Stuff Floating Emoji Spawner
    const emojis = {
        'fun-aoty': ['🎵', '🎶', '🎸', '🎹', '🎧'],
        'fun-books': ['📖', '📚', '🔖', '🖋️', '☕'],
        'fun-movies': ['🎬', '🍿', '🎞️', '⭐', '🎥']
    };

    document.querySelectorAll('.fun-aoty, .fun-books, .fun-movies').forEach(card => {
        let lastSpawnTime = 0;
        card.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastSpawnTime < 150) return; // Throttle spawn rate
            lastSpawnTime = now;

            let classSet = [];
            if (card.classList.contains('fun-aoty')) classSet = emojis['fun-aoty'];
            else if (card.classList.contains('fun-books')) classSet = emojis['fun-books'];
            else if (card.classList.contains('fun-movies')) classSet = emojis['fun-movies'];

            const randomEmoji = classSet[Math.floor(Math.random() * classSet.length)];
            const particle = document.createElement('div');
            particle.textContent = randomEmoji;
            particle.className = 'floating-emoji';
            // Spawning coordinate tracking exact cursor document position
            particle.style.left = `${e.pageX + (Math.random() * 20 - 10)}px`;
            particle.style.top = `${e.pageY + (Math.random() * 20 - 10)}px`;

            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 1000);
        });
    });

    const container = document.getElementById("projects-container");

    if (container) {
        projects.forEach((proj, index) => {
            const delays = ["delay-1", "delay-2", ""];
            const delayClass = delays[index % delays.length];

            const cardWidthClass = proj.type === 'wide' ? 'wide-card' : proj.type === 'full-wide' ? 'full-wide-card' : 'default-card';

            const card = document.createElement("a");
            card.href = proj.url || "#";
            card.className = `glass-card ${cardWidthClass} ${proj.customClass || ''}`;

            const tagsHtml = proj.tags.map(tag => `<span class="tag">${tag}</span>`).join("");

            // Layout depending on card type or provided visualHtml
            let innerHtml = '';

            if (proj.type === 'full-wide') {
                innerHtml = `
                    ${proj.visualHtml}
                    <div class="card-content overlay-content">
                        <h3>${proj.title}</h3>
                        ${proj.description ? `<p>${proj.description}</p>` : ''}
                        <div class="tags">${tagsHtml}</div>
                    </div>
                `;
            } else {
                innerHtml = `
                    <div class="card-visual">
                        ${proj.visualHtml}
                    </div>
                    <div class="card-content">
                        <h3>${proj.title}</h3>
                        ${proj.description ? `<p>${proj.description}</p>` : ''}
                        <div class="tags">${tagsHtml}</div>
                    </div>
                `;
            }

            card.innerHTML = innerHtml;
            container.appendChild(card);
        });
    }

    // Intersection Observer for scroll reveals
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.glass-card, .section-title, .hero p, .social-tube').forEach(el => {
        el.classList.add('reveal');
        observer.observe(el);
    });

    // Scroll-interactive background mesh
    let scrollPercent = 0;
    let ticking = false;
    let currentMouseX = 0.5;
    let currentMouseY = 0.5;

    const updateMesh = () => {
        // Blend scroll math and mouse parallax
        const y1 = 20 + (scrollPercent * 40) + ((currentMouseY - 0.5) * 10);
        const x1 = 20 + ((currentMouseX - 0.5) * 10);

        const y2 = 80 - (scrollPercent * 50) + ((currentMouseY - 0.5) * -15);
        const x2 = 80 + ((currentMouseX - 0.5) * -15);

        const y3 = 50 + (scrollPercent * 30) + ((currentMouseY - 0.5) * 8);
        const x3 = 50 + (scrollPercent * 20) + ((currentMouseX - 0.5) * 12);

        const ambientMesh = document.getElementById('ambient-mesh');
        if (ambientMesh) {
            ambientMesh.style.setProperty('--bg-y1', `${y1}vh`);
            ambientMesh.style.setProperty('--bg-x1', `${x1}vw`);

            ambientMesh.style.setProperty('--bg-y2', `${y2}vh`);
            ambientMesh.style.setProperty('--bg-x2', `${x2}vw`);

            ambientMesh.style.setProperty('--bg-y3', `${y3}vh`);
            ambientMesh.style.setProperty('--bg-x3', `${x3}vw`);
        }
        
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        scrollPercent = maxScroll > 0 ? scrolled / maxScroll : 0;
        
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    });

    window.addEventListener('mousemove', (e) => {
        currentMouseX = e.clientX / window.innerWidth;
        currentMouseY = e.clientY / window.innerHeight;
        
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    });

    // Mouse tracking for glass card glow and 3D parallax tilt
    const handleOnMouseMove = e => {
        const { currentTarget: target } = e;
        const rect = target.getBoundingClientRect(),
            x = e.clientX - rect.left,
            y = e.clientY - rect.top;

        target.style.setProperty("--mouse-x", `${x}px`);
        target.style.setProperty("--mouse-y", `${y}px`);

        // 3D Parallax Calculation
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -4;
        const rotateY = ((x - centerX) / centerX) * 4;

        target.style.transition = 'none'; // CRITICAL: Disable transition during mousemove for zero lag
        target.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    };

    const cards = document.querySelectorAll('.glass-card');
    for (const card of cards) {
        card.addEventListener('mousemove', e => handleOnMouseMove(e));

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease';
        });

        card.addEventListener('mouseenter', () => {
            // No transition: 'none' here, it's handled in handleOnMouseMove to ensure the FIRST move is also instant
        });
    }

    // Typewriter Effect
    const statusText = document.querySelector('.status-text');
    if (statusText) {
        const phrases = ["Machine Learning & Software", "Python Developer", "AI & Robotics Student"];
        let phraseIndex = 0;
        let charIndex = phrases[0].length;
        let isDeleting = true;

        const type = () => {
            const currentPhrase = phrases[phraseIndex];

            if (isDeleting) {
                charIndex--;
            } else {
                charIndex++;
            }

            statusText.textContent = currentPhrase.substring(0, charIndex);

            let typeSpeed = isDeleting ? 40 : 80;

            if (!isDeleting && charIndex === currentPhrase.length) {
                // Pause at the end
                typeSpeed = 2000;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                // Move to next phrase
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                typeSpeed = 500;
            }

            setTimeout(type, typeSpeed);
        };

        // Start typing loop after an initial delay
        setTimeout(type, 2000);
    } // CRITICAL FIX: Properly close the statusText block so sub-page APIs execute!

    // Optimized Index Data Orchestration
    const indexBooksContainer = document.getElementById("index-books-container");
    const indexMoviesContainer = document.getElementById("index-movies-container");
    const cassetteArtistName = document.getElementById("cassette-artist-name");
    const cassetteSongTitle = document.getElementById("cassette-song-title");

    if (indexBooksContainer && indexMoviesContainer && (cassetteArtistName || cassetteSongTitle)) {
        // Initial state: hide containers slightly to reveal them together
        const containers = [indexBooksContainer, indexMoviesContainer, cassetteArtistName, cassetteSongTitle].filter(Boolean);
        
        const fetchSpotify = fetch("/api/spotify?v=4.0").then(res => res.json()).catch(() => ({ success: false }));
        const fetchBooks = fetch("/api/books?v=4.0").then(res => res.json()).catch(() => ({ success: false }));
        const fetchMovies = fetch("/api/movies?v=4.0").then(res => res.json()).catch(() => ({ success: false }));

        Promise.all([fetchSpotify, fetchBooks, fetchMovies]).then(([spotify, books, movies]) => {
            // 1. Process Spotify (Cassette)
            if (spotify.success && spotify.data) {
                const tracks = spotify.data.top_tracks_last_month || [];
                if (tracks.length > 0) {
                    const topTrack = tracks[0];
                    if (cassetteArtistName) {
                        cassetteArtistName.innerHTML = `<span class="fade-in" title="${topTrack.artist}">${topTrack.artist}</span>`;
                    }
                    if (cassetteSongTitle) {
                        const marquee = cassetteSongTitle.querySelector('.cassette-song-marquee');
                        if (marquee) {
                            const trackText = `${topTrack.title} &nbsp;&nbsp; • &nbsp;&nbsp; `;
                            marquee.innerHTML = Array(7).fill(`<span class="cassette-song-title-text fade-in">${trackText}</span>`).join('');
                        }
                    }
                    const cassetteBody = document.getElementById("cassette-body");
                    if (cassetteBody && topTrack.cover_url) {
                        cassetteBody.style.setProperty('--cassette-art', `url(${topTrack.cover_url})`);
                        const img = new Image();
                        img.crossOrigin = "Anonymous";
                        img.src = topTrack.cover_url;
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = 1; canvas.height = 1;
                            ctx.drawImage(img, 0, 0, 1, 1);
                            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                            cassetteBody.style.setProperty('--cassette-art-color', `rgb(${r}, ${g}, ${b})`);
                            cassetteBody.classList.add('has-art');
                        };
                    }
                }
            }

            // 2. Process Books
            if (books.success && books.data) {
                const bookList = books.data || [];
                indexBooksContainer.innerHTML = "";
                if (bookList.length === 0) {
                    indexBooksContainer.innerHTML = `<p style="color: var(--text-secondary);">Empty.</p>`;
                } else {
                    bookList.slice(0, 3).forEach((book, index) => {
                        const rotateOffset = (index - 1) * 6;
                        const translateY = Math.abs(rotateOffset) * 0.5;
                        const html = `
                            <img src="${book.cover_url || ""}" alt="${book.title}" title="${book.title}" class="index-book-cover fade-in" style="width: 40px; height: 60px; object-fit: cover; box-shadow: -3px 2px 10px rgba(0,0,0,0.5); border-radius: 3px; margin-left: ${index === 0 ? '0' : '-14px'}; transform: rotate(${rotateOffset}deg) translateY(${translateY}px); z-index: ${index}; transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), z-index 0s;" onmouseenter="this.style.transform='scale(1.18) translateY(-8px) rotate(0deg)'; this.style.zIndex='10';" onmouseleave="this.style.transform='rotate(${rotateOffset}deg) translateY(${translateY}px)'; this.style.zIndex='${index}';">
                        `;
                        indexBooksContainer.insertAdjacentHTML("beforeend", html);
                    });
                }
            }

            // 3. Process Movies
            if (movies.success && movies.data) {
                const recent = movies.data.recent_activity || [];
                indexMoviesContainer.innerHTML = "";
                if (recent.length === 0) {
                    indexMoviesContainer.innerHTML = `<p style="color: var(--text-secondary);">Empty.</p>`;
                } else {
                    recent.slice(0, 3).forEach((film, index) => {
                        const rotateOffset = (index - 1) * 6;
                        const translateY = Math.abs(rotateOffset) * 0.5;
                        const filmTitle = (film.title_and_rating || film.title || "").replace(/ - ★.*$/, '');
                        const html = `
                            <img src="${film.cover_url || ""}" alt="${filmTitle}" title="${filmTitle}" class="index-movie-cover fade-in" style="width: 40px; height: 60px; object-fit: cover; box-shadow: -3px 2px 10px rgba(0,0,0,0.5); border-radius: 3px; margin-left: ${index === 0 ? '0' : '-14px'}; transform: rotate(${rotateOffset}deg) translateY(${translateY}px); z-index: ${index}; transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), z-index 0s;" onmouseenter="this.style.transform='scale(1.18) translateY(-8px) rotate(0deg)'; this.style.zIndex='10';" onmouseleave="this.style.transform='rotate(${rotateOffset}deg) translateY(${translateY}px)'; this.style.zIndex='${index}';">
                        `;
                        indexMoviesContainer.insertAdjacentHTML("beforeend", html);
                    });
                }
            }

            // Trigger animations
            document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
        });
    }

    // Spotify Page Data Fetching (Separate from index orchestration)
    const artistsContainer = document.getElementById("spotify-artists-container");
    const tracksContainer = document.getElementById("spotify-tracks-container");

    if (artistsContainer || tracksContainer) {
        fetch("/api/spotify?v=4.0")
            .then(res => res.json())
            .then(json => {
                if (!json.success || !json.data) {
                    if(artistsContainer) artistsContainer.innerHTML = `<p style="color: #ff6b6b; font-size: 0.85rem">Spotify Edge DB Error: ${json.error || "Unknown Failure"}</p>`;
                    return;
                }
                const data = json.data;
                const artists = data.top_artists_last_month || [];
                const tracks = data.top_tracks_last_month || [];

                if(artistsContainer) {
                    artistsContainer.innerHTML = artists.length === 0 ? `<p style="color: var(--text-secondary);">No artists found.</p>` : "";
                    artists.forEach((artist, index) => {
                        const html = `
                            <a href="${artist.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-artist-item fade-in delay-${(index % 3) + 1}" style="text-decoration: none;">
                                <div class="artist-img-wrapper">
                                    <img src="${artist.image_url || ""}" alt="${artist.name}" class="spotify-artist-img">
                                    <div class="artist-playcount-overlay">
                                        <span class="artist-playcount-value">${Number(artist.playcount).toLocaleString()}</span>
                                        <span class="artist-playcount-label">Plays</span>
                                    </div>
                                </div>
                                <span class="spotify-artist-name">${artist.name}</span>
                            </a>`;
                        artistsContainer.insertAdjacentHTML("beforeend", html);
                    });
                }

                if(tracksContainer) {
                    tracksContainer.innerHTML = tracks.length === 0 ? `<p style="color: var(--text-secondary);">No tracks found.</p>` : "";
                    tracks.forEach((track, index) => {
                        const cardId = `track-card-${index}`;
                        const isTop = index === 0;
                        const cardClass = isTop ? 'top-track-banner' : 'grid-track';
                        
                        const playsHtml = `${Number(track.playcount).toLocaleString()} plays`;
                        
                        // Tag logic: #1 is handled in CSS/Banner, #2-5 added here
                        const rankTag = !isTop ? `<span class="stats-badge">#${index + 1}</span><div class="stats-pill-divider"></div>` : `<span class="stats-badge">#1 THIS MONTH</span><div class="stats-pill-divider"></div>`;

                        const statsPill = `<div class="track-stats-pill">
                                    ${rankTag}
                                    <span class="stats-plays">${playsHtml}</span>
                                </div>`;

                        let lyricHtml = '';
                        if (isTop && track.ai_lyrics) {
                            const lyrics = [track.ai_lyrics.lyric1, track.ai_lyrics.lyric2, track.ai_lyrics.lyric3].filter(Boolean);
                            if (lyrics.length > 0) {
                                const randomLyric = lyrics[Math.floor(Math.random() * lyrics.length)];
                                lyricHtml = `<div class="track-ai-lyric">"${randomLyric}"</div>`;
                            }
                        }

                        const html = `
                            <a id="${cardId}" href="${track.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-track-card ${cardClass} fade-in delay-${(index % 4) + 1}" style="text-decoration: none; ${isTop ? `--track-art: url('${track.cover_url || ''}')` : ''}">
                                ${isTop ? `<div class="banner-bg-blur"></div>` : ''}
                                <div class="case-art-wrapper">
                                    <img src="${track.cover_url || ""}" alt="${track.title}" class="spotify-track-img">
                                </div>
                                <div class="case-info">
                                    <div class="track-text-stack">
                                        <span class="case-title">${track.title}</span>
                                        <span class="case-artist">${track.artist}</span>
                                    </div>
                                    ${lyricHtml}
                                    ${statsPill}
                                </div>
                            </a>`;
                        tracksContainer.insertAdjacentHTML("beforeend", html);
                        
                        if (track.cover_url) {
                            const img = new Image();
                            img.crossOrigin = "Anonymous";
                            img.src = track.cover_url;
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                canvas.width = 1; canvas.height = 1;
                                ctx.drawImage(img, 0, 0, 1, 1);
                                const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                                // Allow more vibrant colors by increasing perceptual luminance cap
                                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                                const lumaScale = luma > 170 ? 170 / luma : 1;
                                const [R, G, B] = [r, g, b].map(c => Math.round(c * lumaScale));
                                const glowOpacity = isTop ? 0.45 : 0.35;
                                const card = document.getElementById(cardId);
                                if(card) {
                                    card.style.setProperty('--track-color-rgb', `${R}, ${G}, ${B}`);
                                    card.style.setProperty('--track-color-glow', `rgba(${R}, ${G}, ${B}, ${glowOpacity})`);
                                    if(isTop) {
                                        card.style.borderColor = `rgba(${R}, ${G}, ${B}, 0.3)`;
                                    }
                                }
                            };
                        }
                    });
                }
                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
            });
    }

    // Sub-pages: Goodreads and Letterboxd (Full list pages)
    const booksContainer = document.getElementById("goodreads-books-container");
    if (booksContainer) {
        fetch("/api/books?v=4.0").then(res => res.json()).then(json => {
            const books = json.data || [];
            booksContainer.innerHTML = books.length === 0 ? `<p style="color: rgba(230,223,204,0.6); font-family: 'Playfair Display', serif; font-style: italic;">No books found.</p>` : "";
            books.forEach((book, index) => {
                const html = `<a href="${book.link || "#"}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in delay-${(index % 4) + 1}" style="text-decoration: none;"><img src="${book.cover_url || ""}" alt="${book.title}" class="classical-book-cover"><div class="classical-book-info"><span class="classical-book-title">${book.title}</span><span class="classical-book-author">${book.author}</span></div></a>`;
                booksContainer.insertAdjacentHTML("beforeend", html);
            });
            document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
        });
    }

    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");

    if (favContainer || recentContainer || watchlistContainer) {
        fetch("/api/movies?v=4.0").then(res => res.json()).then(json => {
            if (!json.success || !json.data) return;
            const { favorite_films: favorites, recent_activity: recent, watchlist } = json.data;

            if(favContainer) {
                favContainer.innerHTML = favorites.length === 0 ? `<p style="color: var(--text-secondary);">No favorites found.</p>` : "";
                // Favorites are naturally returned newest to oldest or vice-versa, Letterboxd Profile order is usually Top 4.
                favorites.forEach((film, index) => {
                    const html = `
                        <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-fav-card fade-in delay-${(index % 4) + 1}" style="text-decoration: none;">
                            <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-fav-poster">
                            <div class="movie-fav-overlay">
                                <span class="movie-fav-title">${film.title}</span>
                            </div>
                        </a>`;
                    favContainer.insertAdjacentHTML("beforeend", html);
                });
            }

            if(recentContainer) {
                recentContainer.innerHTML = "";
                recent.slice(0, 7).forEach((film, index) => {
                    let badges = "";
                    if (film.is_favorite) badges += '<span class="movie-badge fav">♥</span>';
                    if (film.is_rewatch) badges += '<span class="movie-badge rewatch">↺</span>';
                    
                    const html = `
                        <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-watchlist-card movie-recent-item fade-in" style="transition-delay: ${index * 0.05}s">
                            <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-watchlist-poster" title="${film.title}">
                            <div class="movie-card-info-overlay">
                                ${film.rating ? `<div class="movie-rating-stars">${film.rating}</div>` : ""}
                                <div class="movie-badges">${badges}</div>
                            </div>
                        </a>`;
                    recentContainer.insertAdjacentHTML("beforeend", html);
                });
            }

            if(watchlistContainer) {
                watchlistContainer.innerHTML = "";
                watchlist.slice(0, 7).forEach((film, index) => {
                    const html = `<a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-watchlist-card fade-in" style="transition-delay: ${index * 0.05}s"><img src="${film.cover_url || ""}" alt="${film.title}" class="movie-watchlist-poster" title="${film.title}"></a>`;
                    watchlistContainer.insertAdjacentHTML("beforeend", html);
                });
            }
            document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
        });
    }

});
