import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {
    documentElement: { classList: { contains: () => false } },
    getElementById: () => null,
};

const { safeUrl, safeCssUrl, safeRgb, safeImg } = await import('../../assets/js/modules/core.js');

test('safeUrl rejects javascript:, data:, protocol-relative, and allows https: & root-relative paths', () => {
    assert.equal(safeUrl('javascript:alert(1)'), '');
    assert.equal(safeUrl('  JAVASCRIPT:alert(document.domain)  '), '');
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(safeUrl('http://example.com/foo.jpg'), '');
    assert.equal(safeUrl('//evil.example/foo.jpg'), '');
    assert.equal(safeUrl('https://open.spotify.com/track/123'), 'https://open.spotify.com/track/123');
    assert.equal(safeUrl('/library/music#artists'), '/library/music#artists');
});

test('safeCssUrl rejects unsafe schemes and encodes CSS-breaking characters', () => {
    assert.equal(safeCssUrl('javascript:alert(1)'), '');
    const evil = "https://example.com/x.jpg'); outline: 9px solid red; --pwn: ('";
    const css = safeCssUrl(evil);
    assert.ok(css.startsWith('url("https://example.com/'));
    assert.ok(!css.slice(5, -2).includes("'") && !css.slice(5, -2).includes('"') && !css.slice(5, -2).includes(')'));
});

test('safeRgb rejects injected strings and clamps valid RGB triplets', () => {
    assert.equal(safeRgb(['0); outline: 7px solid lime; --x: (0', 0, 0]), null);
    assert.equal(safeRgb([255, 0]), null);
    assert.equal(safeRgb([true, 0, 0]), null);
    assert.deepEqual(safeRgb([-10, 127.6, 300]), [0, 128, 255]);
});

test('safeImg rejects unsafe URLs before wsrv wrapping', () => {
    assert.equal(safeImg('javascript:alert(1)', 200), '');
    assert.ok(safeImg('https://a.ltrbxd.com/poster.jpg', 150).startsWith('https://wsrv.nl/'));
});
