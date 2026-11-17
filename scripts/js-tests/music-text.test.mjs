// Display forms of song titles and artist names (music-text.js)
import test from 'node:test';
import assert from 'node:assert/strict';

// core.js (escapeHtml) sets up an IntersectionObserver on import; Node has none
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const { displaySongTitle, shortArtistName, shortArtistNameHtml } = await import('../../assets/js/modules/music-text.js');

test('displaySongTitle drops features and version tags', () => {
    const cases = [
        ['Another You (feat. Sadie Jean)', 'Another You'],
        ['Song [with Someone]', 'Song'],
        ['Song (ft. X)', 'Song'],
        ['Take My Hand - Joshua Tree Version', 'Take My Hand'],
        ['Here Comes The Sun - Remastered 2009', 'Here Comes The Sun'],
        ['Purple Rain (2015 Paisley Park Remaster)', 'Purple Rain'],
        ['Song (Demo)', 'Song'],
        ['Bad Omens', 'Bad Omens'],
        ['Me Myself & I', 'Me Myself & I'],
        // A title that is only a tag keeps it rather than going blank
        ['(Live)', '(Live)'],
    ];
    for (const [title, expected] of cases) assert.equal(displaySongTitle(title), expected, title);
});

test('shortArtistName uses initials only for long names of three or more words', () => {
    assert.equal(shortArtistName('5 Seconds of Summer'), '5SOS');
    assert.equal(shortArtistName('Prince and The Revolution'), 'PATR');
    assert.equal(shortArtistName('Harry Styles'), 'Harry Styles');
    assert.equal(shortArtistName('The 1975'), 'The 1975');
    assert.equal(shortArtistName('Of The Sun'), 'Of The Sun'); // three words, but only 10 characters
    assert.equal(shortArtistName(''), '');
});

test('shortArtistNameHtml escapes and keeps the full name for screen readers', () => {
    assert.equal(shortArtistNameHtml('Ruel'), 'Ruel');
    assert.equal(shortArtistNameHtml('Tom & Jo'), 'Tom &amp; Jo');
    assert.equal(
        shortArtistNameHtml('Simon & Garfunkel'),
        '<span aria-hidden="true">S&amp;G</span><span class="visually-hidden">Simon &amp; Garfunkel</span>'
    );
    assert.equal(
        shortArtistNameHtml('5 Seconds of Summer'),
        '<span aria-hidden="true">5SOS</span><span class="visually-hidden">5 Seconds of Summer</span>'
    );
});
