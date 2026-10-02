import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { SEED_BOOKS } from '../modules/seed-data.js';

function renderBooks(container, books) {
    if (!container || !books || !books.length) return;
    container.innerHTML = books.map((book, index) => `
        <a href="${book.link || "#"}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in delay-${(index % 4) + 1}">
            <img src="${book.cover_url || ""}" alt="${book.title}" class="classical-book-cover" ${index > 3 ? 'loading="lazy"' : ''}>
            <div class="classical-book-info">
                <span class="classical-book-title">${book.title}</span>
                <span class="classical-book-author">${book.author}</span>
            </div>
        </a>`).join('');
    document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
}

function initReading() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const booksContainer = document.getElementById("goodreads-books-container");
    if (booksContainer) {
        // Instant 0ms render from cache or bundled seed data
        const cached = getCachedData("simplyigit_cache_books", SEED_BOOKS);
        let renderedBooksSig = '';

        const getBooksSig = (list) => {
            if (!Array.isArray(list)) return '';
            return list.map(b => b.title || '').join('|');
        };

        if (cached && cached.length > 0) {
            renderedBooksSig = getBooksSig(cached);
            renderBooks(booksContainer, cached);
        }

        // Fast static fetch (<20ms) with seamless API fallback
        const fetchBooksData = async () => {
            try {
                const res = await fetch("/data/books.json");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) return json.data;
                }
            } catch {}
            try {
                const res = await fetch("/api/books");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) return json.data;
                }
            } catch {}
            return null;
        };

        fetchBooksData().then(books => {
            if (!books || books.length === 0) return;
            setCachedData("simplyigit_cache_books", books);
            const newSig = getBooksSig(books);
            if (newSig && newSig !== renderedBooksSig) {
                renderedBooksSig = newSig;
                renderBooks(booksContainer, books);
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReading);
} else {
    initReading();
}

