import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

document.addEventListener("DOMContentLoaded", () => {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const booksContainer = document.getElementById("goodreads-books-container");
    if (booksContainer) {
        fetch("/api/books?v=4.0").then(res => res.json()).then(json => {
            const books = json.data || [];
            booksContainer.innerHTML = books.map((book, index) => `
                <a href="${book.link || "#"}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in delay-${(index % 4) + 1}">
                    <img src="${book.cover_url || ""}" alt="${book.title}" class="classical-book-cover">
                    <div class="classical-book-info">
                        <span class="classical-book-title">${book.title}</span>
                        <span class="classical-book-author">${book.author}</span>
                    </div>
                </a>`).join('');
            document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
        });
    }
});
