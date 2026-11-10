import {
    initAmbientMesh,
    initGlobalReveal,
    initGlassParallax,
    initLibraryKeys,
    safeImg,
    toTransitionSlug,
    smoothMorph,
    morphText,
    escapeHtml
} from '../modules/core.js';
import { getCachedData, setCachedData } from '../modules/cache.js';
import { loadLiveData } from '../modules/live-data.js';

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
        const coverUrl = escapeHtml(safeImg(book.cover_url || '', 300));
        const safeTitle = escapeHtml(book.title);
        const priorityAttr = index < 4 ? 'fetchpriority="high"' : (index < 16 ? 'decoding="async"' : 'loading="lazy" decoding="async"');
        const userStars = renderBookStars(book.rating);
        const metaParts = [];
        if (book.num_pages) metaParts.push(`${escapeHtml(book.num_pages)} pp.`);
        if (book.year) metaParts.push(escapeHtml(book.year));
        if (userStars) {
            metaParts.push(`<span class="classical-book-stars" aria-label="Rated ${escapeHtml(book.rating)} out of 5">${userStars}</span>`);
        } else if (book.average_rating) {
            metaParts.push(`★ ${escapeHtml(book.average_rating)}`);
        }

        let vtSlug = toTransitionSlug('book-card', book.title || `idx-${index}`);
        if (seenSlugs.has(vtSlug)) vtSlug = `${vtSlug}-${index}`;
        seenSlugs.add(vtSlug);

        return `
        <a href="${escapeHtml(book.link || "#")}" target="_blank" rel="noopener noreferrer" class="classical-book-card fade-in delay-${(index % 4) + 1}" data-shelf="${escapeHtml(shelfKey)}" style="view-transition-name: ${vtSlug}">
            <div class="classical-book-top-row">
                <span class="classical-shelf-badge shelf-${escapeHtml(shelfKey)}">${badgeText}</span>
                ${metaParts.length ? `<span class="classical-book-meta">${metaParts.join(' · ')}</span>` : ''}
            </div>
            <img src="${coverUrl}" alt="${safeTitle}" class="classical-book-cover" data-thumb="${escapeHtml(safeImg(book.cover_url || '', 240))}" ${priorityAttr}>
            <div class="classical-book-info">
                <span class="classical-book-title">${safeTitle}</span>
                <span class="classical-book-author">${escapeHtml(book.author)}</span>
            </div>
        </a>`;
    }).join('');
}

function initReading() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
    initLibraryKeys();

    const booksContainer = document.getElementById("goodreads-books-container");

    // Page transitions (vt-nav.js): the homepage's book morphs into its cover here, and back.
    // Leaving, it's the book that flew in (else the first cover on the shelf).
    let morphedBook = '';
    const bookCover = (title) => {
        const covers = [...(booksContainer?.querySelectorAll('.classical-book-cover') || [])];
        return (title && covers.find(cover => cover.alt === title)) || null;
    };
    window.__vtMorph = {
        source: (library) => {
            if (library !== 'reading') return null;
            const el = bookCover(morphedBook) || booksContainer?.querySelector('.classical-book-cover');
            return el ? { el, key: el.alt } : null;
        },
        target: (library, key) => {
            const el = library === 'reading' ? bookCover(key) : null;
            if (!el) return null;
            morphedBook = key;
            // The cover may still be loading: show the smaller copy the homepage already has
            if (el.dataset.thumb) el.style.background = `url("${el.dataset.thumb}") center / cover`;
            return el;
        }
    };
    const shelfHeading = document.getElementById("reading-shelf-heading");
    const tabButtons = [...document.querySelectorAll(".reading-shelf-btn")];
    let currentBooks = [];
    let currentShelf = 'all';

    if (tabButtons.length && booksContainer) {
        const selectShelf = (btn) => {
            const shelf = btn.getAttribute('data-shelf') || 'all';
            if (shelf === currentShelf) return;
            currentShelf = shelf;
            tabButtons.forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', isActive ? 'true' : 'false');
                b.tabIndex = isActive ? 0 : -1;
            });
            booksContainer.setAttribute('aria-labelledby', btn.id);
            if (shelfHeading) {
                morphText(shelfHeading, SHELF_LABELS[shelf] || 'All Shelves');
            }
            smoothMorph(booksContainer, () => renderBooks(booksContainer, currentBooks, currentShelf));
        };

        // Roving tabindex: only the selected tab is a Tab stop; arrow keys move between shelves
        tabButtons.forEach((btn, idx) => {
            btn.tabIndex = btn.classList.contains('active') ? 0 : -1;
            btn.addEventListener('click', () => selectShelf(btn));
            btn.addEventListener('keydown', (e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const step = e.key === 'ArrowRight' ? 1 : -1;
                const next = tabButtons[(idx + step + tabButtons.length) % tabButtons.length];
                next.focus();
                selectShelf(next);
            });
        });
    }

    if (!booksContainer) return;

    const getBooksSig = (list) => list.map(b => `${b.title || ''}|${b.shelf || ''}|${b.num_pages || ''}|${b.rating || ''}`).join(';;');
    let renderedBooksSig = '';

    // First call paints directly; a later call with changed books morphs the grid and counts
    const render = async (books) => {
        currentBooks = books;
        const sig = getBooksSig(books);
        if (sig === renderedBooksSig) return;
        const isUpdate = renderedBooksSig !== '';
        renderedBooksSig = sig;
        updateShelfCounts(books, isUpdate);
        if (isUpdate) {
            const urls = books.map(b => safeImg(b.cover_url || '', 300));
            await smoothMorph(booksContainer, () => renderBooks(booksContainer, books, currentShelf), urls);
        } else {
            renderBooks(booksContainer, books, currentShelf);
        }
    };

    loadLiveData({
        prefetch: window.__PREFETCH_BOOKS__,
        api: "/api/books",
        snapshot: "/data/books.json",
        isValid: (data) => Array.isArray(data) && data.length > 0,
        // Caches written before shelves existed can't drive the shelf tabs; fall back to the seed instead
        readCache: () => {
            const cached = getCachedData("simplyigit_cache_books");
            return Array.isArray(cached) && cached.length > 0 && 'shelf' in cached[0] ? cached : null;
        },
        saveCache: (data) => setCachedData("simplyigit_cache_books", data),
        loadSeed: () => import('../modules/seed-data.js').then(m => m.SEED_BOOKS),
        render
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReading);
} else {
    initReading();
}
