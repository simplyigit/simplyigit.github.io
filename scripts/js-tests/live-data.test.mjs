import test from 'node:test';
import assert from 'node:assert/strict';

function setupDomStub({ vtNav = false } = {}) {
    globalThis.document = {
        documentElement: {
            classList: { contains: (cls) => cls === 'vt-nav' && vtNav },
        },
        getElementById: () => null,
    };
}

const { loadLiveData } = await import('../../assets/js/modules/live-data.js');

test('loadLiveData rejects empty {} success payloads, preserves cache, and falls back to snapshot', async () => {
    setupDomStub({ vtNav: false });
    const snapshotData = { top_tracks_last_month: [{ title: 'Snapshot Track', artist: 'Artist' }] };
    const cachedData = { top_tracks_last_month: [{ title: 'Cached Track', artist: 'Artist' }] };
    const saved = [];
    const rendered = [];

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        if (url === '/api/spotify') {
            return { ok: true, json: async () => ({ success: true, data: {} }) };
        }
        if (url === '/data/spotify.json') {
            return { ok: true, json: async () => ({ success: true, data: snapshotData }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
        await loadLiveData({
            prefetch: Promise.resolve({ success: true, data: {} }),
            api: '/api/spotify',
            snapshot: '/data/spotify.json',
            readCache: () => cachedData,
            saveCache: (d) => saved.push(d),
            loadSeed: async () => ({ top_tracks_last_month: [{ title: 'Seed', artist: 'Seed' }] }),
            render: (d) => rendered.push(d),
        });
    } finally {
        globalThis.fetch = origFetch;
    }

    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], snapshotData);
    assert.deepEqual(rendered, [snapshotData]);
});

test('loadLiveData preserves existing cache when both API and snapshot return empty {}', async () => {
    setupDomStub({ vtNav: false });
    const cachedData = { top_tracks_last_month: [{ title: 'Cached Track', artist: 'Artist' }] };
    const saved = [];
    const rendered = [];

    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: {} }) });

    try {
        await loadLiveData({
            prefetch: Promise.resolve({ success: true, data: {} }),
            api: '/api/spotify',
            snapshot: '/data/spotify.json',
            readCache: () => cachedData,
            saveCache: (d) => saved.push(d),
            loadSeed: async () => ({ top_tracks_last_month: [{ title: 'Seed', artist: 'Seed' }] }),
            render: (d) => rendered.push(d),
        });
    } finally {
        globalThis.fetch = origFetch;
    }

    assert.equal(saved.length, 0);
    assert.deepEqual(rendered, [cachedData]);
});

test('loadLiveData custom isValid rejects non-empty object missing required array', async () => {
    setupDomStub({ vtNav: false });
    const saved = [];
    const rendered = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: { unexpected: 1 } }) });

    try {
        await loadLiveData({
            prefetch: null,
            api: '/api/spotify',
            snapshot: '/data/spotify.json',
            isValid: (d) => Array.isArray(d?.top_tracks_last_month) && d.top_tracks_last_month.length > 0,
            readCache: () => ({ top_tracks_last_month: [{ title: 'Good', artist: 'A' }] }),
            saveCache: (d) => saved.push(d),
            loadSeed: async () => null,
            render: (d) => rendered.push(d),
        });
    } finally {
        globalThis.fetch = origFetch;
    }

    assert.equal(saved.length, 0);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].top_tracks_last_month[0].title, 'Good');
});
