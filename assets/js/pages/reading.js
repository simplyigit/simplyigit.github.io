import {
    initAmbientMesh,
    initGlobalReveal,
    initGlassParallax,
    safeImg,
    toTransitionSlug,
    awaitFastPrefetch,
    smoothMorph,
    morphText
} from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { SEED_BOOKS } from '../modules/seed-data.js';

const SHELF_LABELS = {
    'all': 'All Shelves',
    'currently-reading': 'Currently Reading',
    'to-read': 'Want to Read',
    'read': 'Completed Reads'
};

const SHELF_BADGES = {
    'currently-reading': 'READING',
    'to-read': 'TO READ',
    'read': 'READ'
};

function renderBookStars(rating) {
    const r = Number(rating) || 0;
    if (r <= 0) return '';
    return '★'.repeat(Math.min(5, r));
}

function updateShelfCounts(books, animate = false) {
    const list = Array.isArray(books) ? books : [];
    const readingCount = list.filter(b => b.shelf === 'currently-reading').length;
    const toReadCount = list.filter(b => !b.shelf || b.shelf === 'to-read').length;
    const readCount = list.filter(b => b.shelf === 'read').length;

    const elAll = document.getElementById('count-all');
    const elReading = document.getElementById('count-reading');
    const elToRead = document.getElementById('count-toread');
    const elRead = document.getElementById('count-read');

    const applyCount = (el, val) => {
        if (!el) return;
        if (animate) morphText(el, val);
        else el.textContent = String(val);
    };

    applyCount(elAll, list.length);
    applyCount(elReading, readingCount);
    applyCount(elToRead, toReadCount);
    applyCount(elRead, readCount);
}

function renderBooks(container, books, activeShelf = 'all') {
    if (!container) return;
    const list = Array.isArray(books) ? books : [];
    const filtered = activeShelf === 'all'
        ? list
        : list.filter(b => (b.shelf || 'to-read') === activeShelf);

    if (filtered.length === 0) {
        const shelfTitle = SHELF_LABELS[activeShelf] || 'This shelf';
        container.innerHTML = `
            <div class="classical-empty-shelf fade-in">
                <span class="classical-empty-ornament">❦</span>
                <p>No books currently shelved under <strong>${shelfTitle}</strong> on Goodreads.</p>
            </div>`;
        return;
    }

    const seenSlugs = new Set();
    container.innerHTML = filtered.map((book, index) => {
        const shelfKey = book.shelf || 'to-read';
        const badgeText = SHELF_BADGES[shelfKey] || 'TO READ';
        const coverUrl = safeImg(book.cover_url || '', 300);
        const safeTitle = (book.title || '').replace(/"/g, '&quot;');
        const priorityAttr = index < 4 ? 'fetchpriority="high"' : (index < 16 ? 'decoding="async"' : 'loading="lazy" decoding="async"');
        const userStars = renderBookStars(book.rating);
        const metaParts = [];
        if (book.num_pages) metaParts.push(`${book.num_pages} pp.`);
        if (book.year) metaParts.push(book.year);
        if (userStars) {
            metaParts.push(`<span class="classical-book-stars" aria-label="Rated ${book.rating} out of 5">${userStars}</span>`);
        } else if (book.average_rating) {
            metaParts.push(`★ ${book.average_rating}`);
        }

        let vtSlug = toTransitionSlug('book-card', book.title || `idx-${index}`);
        if (seenSlugs.has(vtSlug)) vtSlug = `${vtSlug}-${index}`;
        seenSlugs.add(vtSlug);

        return `
        <a href="${book.link || "#"}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in delay-${(index % 4) + 1}" data-shelf="${shelfKey}" style="view-transition-name: ${vtSlug}">
            <div class="classical-book-top-row">
                <span class="classical-shelf-badge shelf-${shelfKey}">${badgeText}</span>
                ${metaParts.length ? `<span class="classical-book-meta">${metaParts.join(' · ')}</span>` : ''}
            </div>
            <img src="${coverUrl}" alt="${safeTitle}" class="classical-book-cover" ${priorityAttr}>
            <div class="classical-book-info">
                <span class="classical-book-title">${book.title}</span>
                <span class="classical-book-author">${book.author}</span>
            </div>
        </a>`;
    }).join('');
}

async function initReading() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const booksContainer = document.getElementById("goodreads-books-container");
    const shelfHeading = document.getElementById("reading-shelf-heading");
    const tabButtons = document.querySelectorAll(".reading-shelf-btn");
    let currentBooks = [];
    let currentShelf = 'all';

    if (tabButtons.length && booksContainer) {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const shelf = btn.getAttribute('data-shelf') || 'all';
                if (shelf === currentShelf) return;
                currentShelf = shelf;
                tabButtons.forEach(b => {
                    const isActive = b.getAttribute('data-shelf') === shelf;
                    b.classList.toggle('active', isActive);
                    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                if (shelfHeading) {
                    morphText(shelfHeading, SHELF_LABELS[shelf] || 'All Shelves');
                }
                smoothMorph(booksContainer, () => renderBooks(booksContainer, currentBooks, currentShelf));
            });
        });
    }

    if (booksContainer) {
        const getBooksSig = (list) => {
            if (!Array.isArray(list)) return '';
            return list.map(b => `${b.title || ''}|${b.shelf || ''}|${b.num_pages || ''}|${b.rating || ''}`).join(';;');
        };

        let renderedBooksSig = '';

        // Edge-cached /api/books (<20ms SWR) or early <head> prefetch
        const fetchBooksData = async () => {
            try {
                if (window.__PREFETCH_BOOKS__) {
                    const pre = await window.__PREFETCH_BOOKS__;
                    window.__PREFETCH_BOOKS__ = null;
                    if (pre?.success && Array.isArray(pre.data)) return pre.data;
                }
            } catch {}
            try {
                const res = await fetch("/api/books");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) return json.data;
                }
            } catch {}
            try {
                const res = await fetch("/data/books.json");
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) return json.data;
                }
            } catch {}
            return null;
        };

        const fetchPromise = fetchBooksData();
        const fastBooks = await awaitFastPrefetch(fetchPromise, 65);

        if (fastBooks && fastBooks.length > 0) {
            setCachedData("simplyigit_cache_books", fastBooks);
            currentBooks = fastBooks;
            renderedBooksSig = getBooksSig(fastBooks);
            updateShelfCounts(fastBooks, false);
            renderBooks(booksContainer, fastBooks, currentShelf);
            return;
        }

        // Instant fallback render from cache or bundled seed data
        const cached = getCachedData("simplyigit_cache_books", SEED_BOOKS);
        if (cached && cached.length > 0) {
            const useList = (cached[0] && !('shelf' in cached[0]) && SEED_BOOKS?.[0]?.shelf) ? SEED_BOOKS : cached;
            currentBooks = useList;
            renderedBooksSig = getBooksSig(useList);
            updateShelfCounts(useList, false);
            renderBooks(booksContainer, useList, currentShelf);
        }

        fetchPromise.then(async (books) => {
            if (!books || books.length === 0) return;
            setCachedData("simplyigit_cache_books", books);
            currentBooks = books;
            const newSig = getBooksSig(books);
            if (newSig && newSig !== renderedBooksSig) {
                renderedBooksSig = newSig;
                updateShelfCounts(books, true);
                const urls = books.map(b => safeImg(b.cover_url || '', 300));
                await smoothMorph(booksContainer, () => renderBooks(booksContainer, books, currentShelf), urls);
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReading);
} else {
    initReading();
}
