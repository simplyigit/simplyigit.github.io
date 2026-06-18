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
            
            // Sync all cards to the height of the shortest one
            const cards = Array.from(booksContainer.querySelectorAll('.classical-book-card'));
            const syncHeights = () => {
                if (!cards.length) return;
                // Reset to natural height
                cards.forEach(c => c.style.height = 'auto');
                // Find shortest
                const minHeight = Math.min(...cards.map(c => c.offsetHeight));
                // Apply to all
                cards.forEach(c => c.style.height = `${minHeight}px`);
            };
            
            // Wait for fonts/layout to settle then sync
            setTimeout(syncHeights, 50);
            window.addEventListener('resize', syncHeights);
        });
    }
});
