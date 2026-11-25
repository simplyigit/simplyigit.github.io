// "Ask the Memoji" prompt palette: native <dialog> modal powered by static curated Q&A JSON
// plus live Spotify / Letterboxd context already loaded on the homepage.
import { escapeHtml, safeUrl } from './core.js';

let qaPromise = null;
let dialogEl = null;
let activeIndex = 0;
let filteredItems = [];
let liveContext = { track: null, film: null };
let onNodCallback = null;

function loadQaData() {
    if (!qaPromise) {
        qaPromise = fetch('/data/memoji-qa.json')
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null);
    }
    return qaPromise;
}

function buildAnswerText(item) {
    if (item.dynamic === 'music' && liveContext.track) {
        const { title, artist, plays } = liveContext.track;
        const countNote = plays ? ` (${plays} plays this month)` : '';
        return `Right now I'm looping "${title}" by ${artist}${countNote}. Jump into Heavy Rotation to hear 30-second previews and see my top tracks, artists, and all-time favorite albums.`;
    }
    if (item.dynamic === 'cinema' && liveContext.film) {
        const { title, rating } = liveContext.film;
        const ratingNote = rating ? ` — rated ${rating}` : '';
        return `My latest watch is ${title}${ratingNote}. Head to Cinema for recent diary logs, short notes, my watchlist, and all-time favorites.`;
    }
    return item.answer || '';
}

function renderLinks(item) {
    const links = Array.isArray(item.links) ? item.links : (item.link ? [item.link] : []);
    if (links.length === 0) return '';
    return `<div class="memoji-answer-links">${links.map(l => {
        const href = safeUrl(l.href);
        if (!href) return '';
        const ext = l.external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeHtml(href)}" class="memoji-answer-link"${ext}>${escapeHtml(l.label)}</a>`;
    }).join('')}</div>`;
}

function ensureDialog() {
    if (dialogEl) return dialogEl;
    const dialog = document.createElement('dialog');
    dialog.id = 'memoji-dialog';
    dialog.className = 'memoji-dialog';
    dialog.setAttribute('aria-labelledby', 'memoji-dialog-title');
    dialog.innerHTML = `
        <div class="memoji-dialog-shell">
            <div class="memoji-dialog-header">
                <div class="memoji-dialog-brand">
                    <img src="/images/pp.webp" alt="" width="28" height="28" class="memoji-dialog-avatar" aria-hidden="true">
                    <span id="memoji-dialog-title" class="memoji-dialog-title">ask yiğit</span>
                </div>
                <button type="button" class="memoji-dialog-close" aria-label="Close palette">
                    <kbd aria-hidden="true">ESC</kbd>
                </button>
            </div>
            <div class="memoji-dialog-search-wrap">
                <span class="memoji-prompt-caret" aria-hidden="true">&gt;</span>
                <input type="search" id="memoji-search" class="memoji-dialog-search"
                    placeholder="Filter prompts (e.g. ml, stack, music, contact)..."
                    autocomplete="off" spellcheck="false" aria-label="Filter prompts">
            </div>
            <ul class="memoji-prompt-list" id="memoji-prompt-list" role="listbox" aria-label="Curated questions"></ul>
            <div class="memoji-answer-pane" id="memoji-answer-pane" aria-live="polite"></div>
        </div>
    `;

    // Light dismiss on backdrop click
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });

    dialog.querySelector('.memoji-dialog-close').addEventListener('click', () => dialog.close());

    const searchInput = dialog.querySelector('#memoji-search');
    const listEl = dialog.querySelector('#memoji-prompt-list');

    const selectIndex = (idx, { nod = false } = {}) => {
        if (filteredItems.length === 0) return;
        activeIndex = (idx + filteredItems.length) % filteredItems.length;
        const buttons = listEl.querySelectorAll('.memoji-prompt-btn');
        buttons.forEach((btn, i) => {
            const active = i === activeIndex;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) btn.scrollIntoView({ block: 'nearest' });
        });
        renderAnswer(filteredItems[activeIndex]);
        if (nod && onNodCallback) onNodCallback();
    };

    const renderAnswer = (item) => {
        const pane = dialog.querySelector('#memoji-answer-pane');
        if (!item) {
            pane.innerHTML = `<p class="memoji-answer-empty">No matching prompt. Try "ml", "stack", "music", "cinema", or "contact".</p>`;
            return;
        }
        pane.innerHTML = `
            <div class="memoji-answer-kicker">&gt; ${escapeHtml(item.question)}</div>
            <p class="memoji-answer-text">${escapeHtml(buildAnswerText(item))}</p>
            ${renderLinks(item)}
        `;
    };

    const renderList = (allPrompts, query = '') => {
        const q = query.trim().toLowerCase();
        filteredItems = q
            ? allPrompts.filter(item =>
                item.question.toLowerCase().includes(q)
                || (item.answer || '').toLowerCase().includes(q)
                || (item.tags || []).some(t => t.toLowerCase().includes(q))
            )
            : allPrompts;

        if (filteredItems.length === 0) {
            listEl.innerHTML = '';
            renderAnswer(null);
            return;
        }

        listEl.innerHTML = filteredItems.map((item, i) => `
            <li role="presentation">
                <button type="button" role="option" class="memoji-prompt-btn${i === 0 ? ' is-active' : ''}" data-idx="${i}" aria-selected="${i === 0 ? 'true' : 'false'}">
                    <span class="memoji-prompt-bullet" aria-hidden="true">&gt;</span>
                    <span>${escapeHtml(item.question)}</span>
                </button>
            </li>
        `).join('');
        activeIndex = 0;
        renderAnswer(filteredItems[0]);
    };

    listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.memoji-prompt-btn');
        if (!btn) return;
        selectIndex(Number(btn.dataset.idx), { nod: true });
    });

    searchInput.addEventListener('input', async () => {
        const data = await loadQaData();
        renderList(data?.prompts || [], searchInput.value);
    });

    dialog.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectIndex(activeIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectIndex(activeIndex - 1);
        } else if (e.key === 'Enter' && document.activeElement === searchInput) {
            e.preventDefault();
            const firstLink = dialog.querySelector('.memoji-answer-link');
            if (firstLink) firstLink.click();
        }
    });

    dialog.__renderList = renderList;
    document.body.appendChild(dialog);
    dialogEl = dialog;
    return dialog;
}

export function setMemojiLiveContext(partial) {
    liveContext = { ...liveContext, ...partial };
}

export async function openMemojiPalette({ onNod } = {}) {
    onNodCallback = onNod || onNodCallback;
    const dialog = ensureDialog();
    const data = await loadQaData();
    const searchInput = dialog.querySelector('#memoji-search');
    searchInput.value = '';
    dialog.__renderList(data?.prompts || [], '');
    if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }
    if (onNodCallback) onNodCallback();
    requestAnimationFrame(() => searchInput.focus());
}
