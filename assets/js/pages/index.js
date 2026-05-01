import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

const projects = [
    {
        title: "Real, Deepfake or AI",
        description: "A hybrid machine learning pipeline utilizing CNNs and SVM to detect manipulated images.",
        tags: ["ML & DL", "Image Processing"],
        type: "wide",
        customClass: "project-real",
        visualHtml: '<img src="projects/real-deepfake-or-ai/real-deepfake-or-ai.png" style="width: 100%; height: 100%; object-fit: cover;" alt="Real, Deepfake or AI">',
        url: "/projects/real-deepfake-or-ai"
    }
];

document.addEventListener("DOMContentLoaded", () => {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    // Avatar 3D Tracking
    const heroTube = document.querySelector('.unified-hero-tube');
    const avatar = document.querySelector('.avatar-memoji');
    if (heroTube && avatar) {
        heroTube.addEventListener('mousemove', (e) => {
            const rect = heroTube.getBoundingClientRect();
            const x = e.clientX - rect.left - (rect.width / 2);
            const y = e.clientY - rect.top - (rect.height / 2);
            const rotateX = (y / (rect.height / 2)) * -15;
            const rotateY = (x / (rect.width / 2)) * 15;
            avatar.style.transform = `scale(1.15) perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            avatar.style.transition = 'none';
        });
        heroTube.addEventListener('mouseleave', () => {
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

    // Typewriter
    const statusText = document.querySelector('.status-text');
    if (statusText) {
        const phrases = ["Machine Learning & Software", "Python Developer", "AI & Robotics Student"];
        let phraseIndex = 0, charIndex = phrases[0].length, isDeleting = true;
        const type = () => {
            const currentPhrase = phrases[phraseIndex];
            if (isDeleting) charIndex--; else charIndex++;
            statusText.textContent = currentPhrase.substring(0, charIndex);
            let typeSpeed = isDeleting ? 40 : 80;
            if (!isDeleting && charIndex === currentPhrase.length) { typeSpeed = 2000; isDeleting = true; }
            else if (isDeleting && charIndex === 0) { isDeleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; typeSpeed = 500; }
            setTimeout(type, typeSpeed);
        };
        setTimeout(type, 2000);
    }

    // Index Data Sync with LocalStorage Cache (Instant Load Pattern)
    const indexBooksContainer = document.getElementById("index-books-container");
    const indexMoviesContainer = document.getElementById("index-movies-container");
    const cassetteArtistName = document.getElementById("cassette-artist-name");
    const cassetteSongTitle = document.getElementById("cassette-song-title");

    if (indexBooksContainer && indexMoviesContainer) {
        const CACHE_KEY = 'simplyigit_dashboard_cache';
        
        // 1. Try to load from cache immediately
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            try {
                const { spotify, books, movies } = JSON.parse(cachedData);
                renderSpotify(spotify);
                renderBooks(books);
                renderMovies(movies);
                console.log("Dashboard rendered from local cache.");
            } catch (e) {
                console.error("Cache parse error", e);
            }
        }

        // 2. Fetch fresh data in the background
        const fetchSpotify = fetch("/api/spotify?v=4.0").then(res => res.json()).catch(() => ({ success: false }));
        const fetchBooks = fetch("/api/books?v=4.0").then(res => res.json()).catch(() => ({ success: false }));
        const fetchMovies = fetch("/api/movies?v=4.0").then(res => res.json()).catch(() => ({ success: false }));

        Promise.all([fetchSpotify, fetchBooks, fetchMovies]).then(([spotify, books, movies]) => {
            // 3. Update UI with fresh data
            renderSpotify(spotify);
            renderBooks(books);
            renderMovies(movies);

            // 4. Save fresh data to cache for next time
            localStorage.setItem(CACHE_KEY, JSON.stringify({ spotify, books, movies }));
        });
    }

    function renderSpotify(spotify) {
        if (!spotify.success || !spotify.data) return;
        const topTrack = spotify.data.top_tracks_last_month?.[0];
        if (topTrack) {
            if (cassetteArtistName) cassetteArtistName.innerHTML = `<span class="fade-in" title="${topTrack.artist}">${topTrack.artist}</span>`;
            if (cassetteSongTitle) {
                const marquee = cassetteSongTitle.querySelector('.cassette-song-marquee');
                if (marquee) marquee.innerHTML = Array(7).fill(`<span class="cassette-song-title-text fade-in">${topTrack.title} &nbsp;&nbsp; • &nbsp;&nbsp; </span>`).join('');
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

    function renderBooks(books) {
        if (!books.success || !books.data) return;
        indexBooksContainer.innerHTML = books.data.slice(0, 3).map((book, index) => {
            const rotate = (index - 1) * 6;
            return `<img src="${book.cover_url || ""}" alt="${book.title}" class="index-book-cover fade-in" style="width: 40px; height: 60px; margin-left: ${index === 0 ? '0' : '-14px'}; transform: rotate(${rotate}deg);">`;
        }).join('');
        document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    }

    function renderMovies(movies) {
        if (!movies.success || !movies.data) return;
        indexMoviesContainer.innerHTML = movies.data.recent_activity.slice(0, 3).map((film, index) => {
            const rotate = (index - 1) * 6;
            return `<img src="${film.cover_url || ""}" alt="${film.title}" class="index-movie-cover fade-in" style="width: 40px; height: 60px; margin-left: ${index === 0 ? '0' : '-14px'}; transform: rotate(${rotate}deg);">`;
        }).join('');
        document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
    }
});
