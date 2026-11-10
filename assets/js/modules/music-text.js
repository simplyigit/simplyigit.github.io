// Display forms of track and artist names, shared by the homepage cassette and the music page
import { escapeHtml } from './core.js';

// "Another You (feat. Sadie Jean)" -> "Another You": the artist is already on the card
export function displaySongTitle(title) {
    return String(title || '')
        .replace(/\s*[\(\[](?:feat|ft|with)\.?[^\)\]]*[\)\]]/gi, '')
        .replace(/\s*[\(\[][^\)\]]*\b(?:demo|remaster(?:ed)?|version|edit|mix|live|acoustic|deluxe)\b[^\)\]]*[\)\]]\s*$/i, '')
        .replace(/\s+-\s+.*\b(?:remaster(?:ed)?|version|edit|mix|live|demo)\b.*$/i, '')
        .trim() || title;
}

// "5 Seconds of Summer" -> "5SOS": long names of three or more words go by their initials.
// Two-word names keep their full name (initials like "SM" wouldn't be recognisable).
export function shortArtistName(name) {
    const full = String(name || '').trim();
    const words = full.split(/\s+/);
    return words.length >= 3 && full.length > 12 ? words.map(w => [...w][0].toUpperCase()).join('') : full;
}

// Safe HTML for an artist name: the short form on screen, the full name for screen readers
export function shortArtistNameHtml(name) {
    const full = String(name || '').trim();
    const shown = shortArtistName(full);
    return shown === full
        ? escapeHtml(shown)
        : `<span aria-hidden="true">${escapeHtml(shown)}</span><span class="visually-hidden">${escapeHtml(full)}</span>`;
}
