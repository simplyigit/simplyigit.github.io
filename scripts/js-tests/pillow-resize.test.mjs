// pillow-resize.js must match Pillow byte for byte: the model was trained on Pillow's resize.
// Run: node --test scripts/js-tests/   (fixtures: python scripts/js-tests/make_pillow_fixtures.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import { pillowResizeBilinear, normalizeToTensor } from '../../assets/js/modules/pillow-resize.js';
import fixtures from './pillow-fixtures.json' with { type: 'json' };

// RGBA bytes, generated the same way as in make_pillow_fixtures.py
function pixels(pattern, w, h) {
    const out = new Uint8Array(w * h * 4);
    let x = 2463534242;
    for (let i = 0; i < w * h; i++) {
        if (pattern === 'noise') {
            for (let c = 0; c < 3; c++) {
                // xorshift32
                x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
                out[i * 4 + c] = x & 255;
            }
        } else {
            const px = i % w, py = Math.floor(i / w);
            out[i * 4] = Math.floor(px * 255 / (w - 1));
            out[i * 4 + 1] = Math.floor(py * 255 / (h - 1));
            out[i * 4 + 2] = Math.floor((px + py) * 255 / (w + h - 2));
        }
        out[i * 4 + 3] = 255;
    }
    return out;
}

function fnv1a(bytes) {
    let h = 0x811c9dc5;
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h;
}

for (const c of fixtures.cases) {
    test(`resize ${c.pattern} ${c.srcW}x${c.srcH} -> ${c.outW}x${c.outH} matches Pillow ${fixtures.pillow}`, () => {
        const out = pillowResizeBilinear(pixels(c.pattern, c.srcW, c.srcH), c.srcW, c.srcH, c.outW, c.outH);
        assert.equal(out.length, c.outW * c.outH * 3);
        assert.deepEqual([...out.slice(0, 12)], c.head);
        assert.equal(fnv1a(out), c.fnv1a);
    });
}

test('normalizeToTensor: NCHW planes with ImageNet mean and std', () => {
    const rgb = new Uint8Array([255, 0, 128, 0, 255, 64]); // two pixels
    const t = normalizeToTensor(rgb, 2, 1);
    const expected = [
        (1 - 0.485) / 0.229, (0 - 0.485) / 0.229,
        (0 - 0.456) / 0.224, (1 - 0.456) / 0.224,
        (128 / 255 - 0.406) / 0.225, (64 / 255 - 0.406) / 0.225,
    ];
    assert.equal(t.length, 6);
    expected.forEach((v, i) => assert.ok(Math.abs(t[i] - v) < 1e-6, `value ${i}: ${t[i]} vs ${v}`));
});
