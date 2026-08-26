import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

function initReading() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const booksContainer = document.getElementById("goodreads-books-container");
    if (booksContainer) {
        fetch("/api/books?v=4.1")
            .then(res => res.json())
            .then(json => {
                const books = Array.isArray(json.data) ? json.data : [];
                if (books.length > 0) {
                    booksContainer.innerHTML = books.map((book, index) => `
                        <a href="${book.link || "#"}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in delay-${(index % 4) + 1}">
                            <img src="${book.cover_url || ""}" alt="${book.title}" class="classical-book-cover" ${index > 3 ? 'loading="lazy"' : ''}>
                            <div class="classical-book-info">
                                <span class="classical-book-title">${book.title}</span>
                                <span class="classical-book-author">${book.author}</span>
                            </div>
                        </a>`).join('');
                } else {
                    booksContainer.innerHTML = `<p style="color: var(--text-secondary); font-family: 'Playfair Display', serif; font-style: italic;">No books found.</p>`;
                }
                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
            })
            .catch(() => {
                booksContainer.innerHTML = `<p style="color: var(--text-secondary); font-family: 'Playfair Display', serif; font-style: italic;">Failed to load books.</p>`;
            });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReading);
} else {
    initReading();
}

