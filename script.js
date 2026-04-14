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

    const updateMesh = (mouseXPercent = 0.5, mouseYPercent = 0.5) => {
        // Blend scroll math and mouse parallax
        const y1 = 20 + (scrollPercent * 40) + ((mouseYPercent - 0.5) * 10);
        const x1 = 20 + ((mouseXPercent - 0.5) * 10);

        const y2 = 80 - (scrollPercent * 50) + ((mouseYPercent - 0.5) * -15);
        const x2 = 80 + ((mouseXPercent - 0.5) * -15);

        const y3 = 50 + (scrollPercent * 30) + ((mouseYPercent - 0.5) * 8);
        const x3 = 50 + (scrollPercent * 20) + ((mouseXPercent - 0.5) * 12);

        document.body.style.setProperty('--bg-y1', `${y1}%`);
        document.body.style.setProperty('--bg-x1', `${x1}%`);

        document.body.style.setProperty('--bg-y2', `${y2}%`);
        document.body.style.setProperty('--bg-x2', `${x2}%`);

        document.body.style.setProperty('--bg-y3', `${y3}%`);
        document.body.style.setProperty('--bg-x3', `${x3}%`);
    };

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

        if (maxScroll > 0) {
            scrollPercent = scrolled / maxScroll;
        } else {
            scrollPercent = 0;
        }
        updateMesh();
    });

    window.addEventListener('mousemove', (e) => {
        const mouseXPercent = e.clientX / window.innerWidth;
        const mouseYPercent = e.clientY / window.innerHeight;
        updateMesh(mouseXPercent, mouseYPercent);
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
            // Remove transition: 'none' to keep the entry smooth
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

    // Spotify Data Fetching
    const artistsContainer = document.getElementById("spotify-artists-container");
    const tracksContainer = document.getElementById("spotify-tracks-container");
    const cassetteArtistName = document.getElementById("cassette-artist-name");
    const cassetteSongTitle = document.getElementById("cassette-song-title");
    const cassetteBody = document.getElementById("cassette-body");
    const spoolLeft = document.getElementById("spool-left");
    const spoolRight = document.getElementById("spool-right");

    // Set spool sizes based on day of month
    if (spoolLeft && spoolRight) {
        const now = new Date();
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const progress = dayOfMonth / daysInMonth; // 0 at start, 1 at end

        const minSize = 28; // Hub + minimal tape
        const maxSize = 56; // Full spool
        const leftSize = minSize + (1 - progress) * (maxSize - minSize);
        const rightSize = minSize + progress * (maxSize - minSize);

        spoolLeft.style.setProperty('--spool-size', `${leftSize}px`);
        spoolRight.style.setProperty('--spool-size', `${rightSize}px`);
    }

    if (artistsContainer || tracksContainer || cassetteArtistName || cassetteSongTitle) {
        fetch("/api/spotify?v=3.5")
            .then(res => res.json())
            .then(json => {
                if (!json.success || !json.data) {
                    if(artistsContainer) artistsContainer.innerHTML = `<p style="color: #ff6b6b; font-size: 0.85rem">Spotify Edge DB Error: ${json.error || "Unknown Failure"}</p>`;
                    if(cassetteArtistName) cassetteArtistName.innerHTML = `<p style="color: #ff6b6b; font-size: 0.7rem">Failed</p>`;
                    return;
                }

                const data = json.data;
                const artists = data.top_artists_last_month || [];
                const tracks = data.top_tracks_last_month || [];

                // Render Artists
                if(artistsContainer) {
                    artistsContainer.innerHTML = "";
                    if (artists.length === 0) {
                        artistsContainer.innerHTML = `<p style="color: var(--text-secondary);">No artists found.</p>`;
                    } else {
                        artists.forEach((artist, index) => {
                            const delayClass = `delay-${(index % 3) + 1}`;
                            const html = `
                                <a href="${artist.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-artist-item fade-in ${delayClass}" style="text-decoration: none;">
                                    <img src="${artist.image_url || ""}" alt="${artist.name}" class="spotify-artist-img">
                                    <span class="spotify-artist-name">${artist.name}</span>
                                </a>
                            `;
                            artistsContainer.insertAdjacentHTML("beforeend", html);
                        });
                    }
                }

                // Render Tracks
                if(tracksContainer) {
                    tracksContainer.innerHTML = "";
                    if (tracks.length === 0) {
                        tracksContainer.innerHTML = `<p style="color: var(--text-secondary);">No tracks found.</p>`;
                    } else {
                        tracks.forEach((track, index) => {
                            const delayClass = `delay-${(index % 4) + 1}`;
                            const html = `
                                <a href="${track.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-track-card fade-in ${delayClass}" style="text-decoration: none;">
                                    <img src="${track.cover_url || ""}" alt="${track.title}" class="spotify-track-img">
                                    <div class="spotify-track-info">
                                        <span class="spotify-track-title">${track.title}</span>
                                        <span class="spotify-track-artist">${track.artist}</span>
                                    </div>
                                </a>
                            `;
                            tracksContainer.insertAdjacentHTML("beforeend", html);
                        });
                    }
                }

                // Render Cassette (index page)
                if((cassetteArtistName || cassetteSongTitle) && tracks.length > 0) {
                    const topTrack = tracks[0];

                    if(cassetteArtistName) {
                        cassetteArtistName.innerHTML = `<span class="fade-in" title="${topTrack.artist}">${topTrack.artist}</span>`;
                    }
                    if(cassetteSongTitle) {
                        cassetteSongTitle.innerHTML = `<span class="cassette-song-title-text fade-in" title="${topTrack.title}">${topTrack.title}</span>`;
                    }

                    // Set cover art across entire cassette body
                    if(cassetteBody && topTrack.cover_url) {
                        cassetteBody.style.setProperty('--cassette-art', `url(${topTrack.cover_url})`);
                        cassetteBody.classList.add('has-art');
                    }
                }

                // Re-trigger intersection observer for newly injected elements
                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));

                // Re-trigger 3D tilt bindings for new glass cards
                document.querySelectorAll(".glass-card").forEach(card => {
                    card.addEventListener("mousemove", e => handleOnMouseMove(e));
                    card.addEventListener("mouseleave", () => {
                        card.style.transform = "perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)";
                        card.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease";
                    });
                    card.addEventListener("mouseenter", () => {
                        card.style.transition = "none";
                    });
                });
            })
            .catch(err => {
                console.error("Spotify API Error:", err);
                artistsContainer.innerHTML = `<p style="color: #ff6b6b;">Failed to connect to /api/spotify.</p>`;
            });
    }

    // Goodreads Data Fetching
    const booksContainer = document.getElementById("goodreads-books-container");
    const indexBooksContainer = document.getElementById("index-books-container");

    if (booksContainer || indexBooksContainer) {
        fetch("/api/books?v=3.5")
            .then(res => res.json())
            .then(json => {
                const books = json.data || [];

                if (booksContainer) {
                    booksContainer.innerHTML = "";
                    if (books.length === 0) {
                        booksContainer.innerHTML = `<p style="color: rgba(230,223,204,0.6); font-family: 'Playfair Display', serif; font-style: italic;">No books found on the shelf.</p>`;
                    } else {
                        books.forEach((book, index) => {
                            const delayClass = `delay-${(index % 4) + 1}`;
                            const html = `
                                <a href="${book.link || "#"}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in ${delayClass}" style="text-decoration: none;">
                                    <img src="${book.cover_url || ""}" alt="${book.title}" class="classical-book-cover">
                                    <div class="classical-book-info">
                                        <span class="classical-book-title">${book.title}</span>
                                        <span class="classical-book-author">${book.author}</span>
                                    </div>
                                </a>
                            `;
                            booksContainer.insertAdjacentHTML("beforeend", html);
                        });
                    }
                }

                if (indexBooksContainer) {
                    indexBooksContainer.innerHTML = "";
                    if (books.length === 0) {
                        indexBooksContainer.innerHTML = `<p style="color: var(--text-secondary);">Empty.</p>`;
                    } else {
                        // Fan out 3 books with subtle overlap
                        books.slice(0, 3).forEach((book, index) => {
                            const delayClass = `delay-${(index % 4) + 1}`;
                            const rotateOffset = (index - 1) * 6; // -6deg, 0deg, 6deg
                            const translateY = Math.abs(rotateOffset) * 0.5;
                            const html = `
                                <img src="${book.cover_url || ""}" alt="${book.title}" title="${book.title}" class="index-book-cover fade-in ${delayClass}" style="width: 40px; height: 60px; object-fit: cover; box-shadow: -3px 2px 10px rgba(0,0,0,0.5); cursor: pointer; border-radius: 3px; margin-left: ${index === 0 ? '0' : '-14px'}; transform: rotate(${rotateOffset}deg) translateY(${translateY}px); z-index: ${index}; transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), z-index 0s;" onmouseenter="this.style.transform='scale(1.18) translateY(-8px) rotate(0deg)'; this.style.zIndex='10';" onmouseleave="this.style.transform='rotate(${rotateOffset}deg) translateY(${translateY}px)'; this.style.zIndex='${index}';" onclick="event.preventDefault(); window.open('${book.link || "#"}', '_blank');">
                            `;
                            indexBooksContainer.insertAdjacentHTML("beforeend", html);
                        });
                    }
                }

                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
            })
            .catch(err => {
                console.error("Goodreads API Error:", err);
                booksContainer.innerHTML = `<p style="color: #ff6b6b; font-family: 'Playfair Display', serif;">Failed to connect to /api/books.</p>`;
            });
    }


    // Letterboxd Data Fetching
    const favContainer = document.getElementById("movies-favorites-container");
    const recentContainer = document.getElementById("movies-recent-container");
    const watchlistContainer = document.getElementById("movies-watchlist-container");
    const indexMoviesContainer = document.getElementById("index-movies-container");

    if (favContainer || recentContainer || watchlistContainer || indexMoviesContainer) {
        fetch("/api/movies?v=3.5")
            .then(res => res.json())
            .then(json => {
                if (!json.success || !json.data) {
                    if(favContainer) favContainer.innerHTML = `<p style="color: #ff6b6b;">Failed to load Letterboxd.</p>`;
                    return;
                }

                const data = json.data;
                const favorites = data.favorite_films || [];
                const recent = data.recent_activity || [];
                const watchlist = data.watchlist || [];

                // 1. Render Favorites
                if(favContainer) {
                    favContainer.innerHTML = "";
                    if (favorites.length === 0) {
                        favContainer.innerHTML = `<p style="color: var(--text-secondary);">No favorites found.</p>`;
                    } else {
                        favorites.forEach((film, index) => {
                            const delayClass = `delay-${(index % 4) + 1}`;
                            const html = `
                                <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-fav-card fade-in ${delayClass}" style="text-decoration: none;">
                                    <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-fav-poster">
                                    <div class="movie-fav-overlay">
                                        <span class="movie-fav-title">${film.title}</span>
                                    </div>
                                </a>
                            `;
                            favContainer.insertAdjacentHTML("beforeend", html);
                        });
                    }
                }

                // 2. Render Recent Activity
                if(recentContainer) {
                    recentContainer.innerHTML = "";
                    recent.forEach((film, index) => {
                        const html = `
                            <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-watchlist-card fade-in" style="transition-delay: ${index * 0.05}s">
                                <img src="${film.cover_url || ""}" alt="${film.title_and_rating}" class="movie-watchlist-poster" title="${film.title_and_rating}">
                            </a>
                        `;
                        recentContainer.insertAdjacentHTML("beforeend", html);
                    });
                }

                // 3. Render Watchlist
                if(watchlistContainer) {
                    watchlistContainer.innerHTML = "";
                    watchlist.forEach((film, index) => {
                        const html = `
                            <a href="${film.link || "#"}" target="_blank" rel="noopener noreferrer" class="movie-watchlist-card fade-in" style="transition-delay: ${index * 0.05}s">
                                <img src="${film.cover_url || ""}" alt="${film.title}" class="movie-watchlist-poster" title="${film.title}">
                            </a>
                        `;
                        watchlistContainer.insertAdjacentHTML("beforeend", html);
                    });
                }

                // 4. Render Index Movies Block
                if(indexMoviesContainer) {
                    indexMoviesContainer.innerHTML = "";
                    if (recent.length === 0) {
                        indexMoviesContainer.innerHTML = `<p style="color: var(--text-secondary);">Empty.</p>`;
                    } else {
                        // Fan out 3 movies with subtle overlap matching books
                        recent.slice(0, 3).forEach((film, index) => {
                            const delayClass = `delay-${(index % 4) + 1}`;
                            const rotateOffset = (index - 1) * 6; // -6deg, 0deg, 6deg
                            const translateY = Math.abs(rotateOffset) * 0.5;
                            const filmTitle = (film.title_and_rating || film.title || "").replace(/ - ★.*$/, '');
                            const html = `
                                <img src="${film.cover_url || ""}" alt="${filmTitle}" title="${filmTitle}" class="index-movie-cover fade-in ${delayClass}" style="width: 40px; height: 60px; object-fit: cover; box-shadow: -3px 2px 10px rgba(0,0,0,0.5); cursor: pointer; border-radius: 3px; margin-left: ${index === 0 ? '0' : '-14px'}; transform: rotate(${rotateOffset}deg) translateY(${translateY}px); z-index: ${index}; transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), z-index 0s;" onmouseenter="this.style.transform='scale(1.18) translateY(-8px) rotate(0deg)'; this.style.zIndex='10';" onmouseleave="this.style.transform='rotate(${rotateOffset}deg) translateY(${translateY}px)'; this.style.zIndex='${index}';" onclick="event.preventDefault(); window.open('${film.link || "#"}', '_blank');">
                            `;
                            indexMoviesContainer.insertAdjacentHTML("beforeend", html);
                        });
                    }
                }

                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
            })
            .catch(err => {
                console.error("Letterboxd API Error:", err);
                if(favContainer) favContainer.innerHTML = `<p style="color: #ff6b6b;">Failed to connect to /api/movies.</p>`;
            });
    }

});
