// Client-side persistent cache utility (Stale-While-Revalidate + Cross-Page Sync)
// Every section lives in one entry: the homepage writes all three, each subpage updates its own slice.
// Bump the version whenever the stored shape changes: older entries are then never read, and removed.
const DASHBOARD_KEY = "simplyigit_dashboard_cache_v2";
const OLD_KEYS = ["simplyigit_dashboard_cache", "simplyigit_cache_spotify", "simplyigit_cache_movies", "simplyigit_cache_books"];
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

let oldKeysRemoved = false;

function writeDashboard(dash) {
    try {
        localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dash));
        if (!oldKeysRemoved) {
            OLD_KEYS.forEach(key => localStorage.removeItem(key));
            oldKeysRemoved = true;
        }
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
}

export function getCachedData(key, fallback = null) {
    return readDashboard()?.[KEY_MAP[key]] || fallback;
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
