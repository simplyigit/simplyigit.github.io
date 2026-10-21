// Client-side persistent cache utility (Stale-While-Revalidate + Cross-Page Sync)
const DASHBOARD_KEY = "simplyigit_dashboard_cache";
const KEY_MAP = {
    simplyigit_cache_spotify: "spotify",
    simplyigit_cache_movies: "movies",
    simplyigit_cache_books: "books"
};

export function getCachedData(key, fallback = null) {
    try {
        const item = localStorage.getItem(key);
        let parsed = item ? JSON.parse(item) : null;

        // Also check if dashboard cache has newer synced data for this section
        const dashField = KEY_MAP[key];
        if (dashField) {
            const dashRaw = localStorage.getItem(DASHBOARD_KEY);
            if (dashRaw) {
                const dash = JSON.parse(dashRaw);
                const sectionData = dash?.[dashField]?.data || dash?.[dashField];
                if (sectionData && (!parsed || dash?._ts > (parsed?._ts || 0))) {
                    return sectionData;
                }
            }
        }

        if (parsed) return parsed;
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
    return fallback;
}

export function setCachedData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));

        // Keep unified dashboard cache in sync when a subpage updates its slice
        const dashField = KEY_MAP[key];
        if (dashField && data) {
            const dashRaw = localStorage.getItem(DASHBOARD_KEY);
            const dash = dashRaw ? JSON.parse(dashRaw) : {};
            dash[dashField] = data;
            dash._ts = Date.now();
            localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dash));
        }
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
}

export function setDashboardCachedData(fresh) {
    if (!fresh) return;
    try {
        const payload = { ...fresh, _ts: Date.now() };
        localStorage.setItem(DASHBOARD_KEY, JSON.stringify(payload));
        if (fresh.spotify) {
            localStorage.setItem("simplyigit_cache_spotify", JSON.stringify(fresh.spotify.data || fresh.spotify));
        }
        if (fresh.movies) {
            localStorage.setItem("simplyigit_cache_movies", JSON.stringify(fresh.movies.data || fresh.movies));
        }
        if (fresh.books) {
            localStorage.setItem("simplyigit_cache_books", JSON.stringify(fresh.books.data || fresh.books));
        }
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
}
