// Shared instant-load pipeline for the live data sections (Spotify, Letterboxd, Goodreads)
import { awaitFastPrefetch } from './core.js';

// Fresh data, in order: the <head> prefetch, the edge-cached API, then the static snapshot
async function fetchFresh({ prefetch, api, snapshot, isValid }) {
    const accept = (json) => (json?.success && isValid(json.data) ? json.data : null);

    if (prefetch) {
        const pre = accept(await prefetch.catch(() => null));
        if (pre) return pre;
    }

    // A failed prefetch already hit the API, so go straight to the snapshot
    const urls = prefetch ? [snapshot] : [api, snapshot];
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = accept(await res.json());
                if (data) return data;
            }
        } catch {}
    }
    return null;
}

/**
 * Renders fresh data directly if it arrives within ~65ms. Otherwise renders the cached copy
 * (or, on a first visit, the bundled seed) and then morphs to fresh data when it lands.
 * `render` may be called twice, so page renderers compare signatures to decide between a
 * first paint and a morph.
 */
export async function loadLiveData({ prefetch, api, snapshot, isValid = Boolean, readCache, saveCache, loadSeed, render }) {
    const freshPromise = fetchFresh({ prefetch, api, snapshot, isValid });

    const fast = await awaitFastPrefetch(freshPromise, 65);
    if (fast) {
        saveCache(fast);
        await render(fast);
        return;
    }

    let fallback = readCache();
    if (!fallback) {
        // First visit on a slow network: show whichever lands first, the bundled seed or fresh data
        const seedPromise = loadSeed().catch(() => null);
        const first = await Promise.race([
            seedPromise.then(seed => ({ seed })),
            freshPromise.then(fresh => ({ fresh }))
        ]);
        if (first.fresh) {
            saveCache(first.fresh);
            await render(first.fresh);
            return;
        }
        fallback = first.seed ?? await seedPromise;
    }
    if (fallback) await render(fallback);

    const fresh = await freshPromise;
    if (fresh) {
        saveCache(fresh);
        await render(fresh);
    }
}
