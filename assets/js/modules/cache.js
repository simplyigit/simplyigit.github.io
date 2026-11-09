// Client-side persistent cache utility (Stale-While-Revalidate + Cross-Page Sync)
// Every section lives in one entry: the homepage writes all three, each subpage updates its own slice.
const DASHBOARD_KEY = "simplyigit_dashboard_cache";
const KEY_MAP = {
    simplyigit_cache_spotify: "spotify",
    simplyigit_cache_movies: "movies",
    simplyigit_cache_books: "books"
};

function readDashboard() {
    try {
        return JSON.parse(localStorage.getItem(DASHBOARD_KEY));
    } catch (e) {
        // LocalStorage disabled or corrupt entry
        return null;
    }
}

function writeDashboard(dash) {
    try {
        localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dash));
        // Older versions also kept a separate copy of each section; drop those duplicates
        Object.keys(KEY_MAP).forEach(key => localStorage.removeItem(key));
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
}

export function getCachedData(key, fallback = null) {
    const section = readDashboard()?.[KEY_MAP[key]];
    return section?.data || section || fallback;
}

// Unified homepage cache; only usable once it holds every section
export function getCachedDashboard() {
    const dash = readDashboard();
    return dash?.spotify && dash?.movies && dash?.books ? dash : null;
}

export function setCachedData(key, data) {
    const field = KEY_MAP[key];
    if (!field || !data) return;
    const dash = readDashboard() || {};
    dash[field] = data;
    dash._ts = Date.now();
    writeDashboard(dash);
}

export function setDashboardCachedData(fresh) {
    if (!fresh) return;
    writeDashboard({ ...fresh, _ts: Date.now() });
}
