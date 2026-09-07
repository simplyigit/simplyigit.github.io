// Client-side persistent cache utility (Stale-While-Revalidate)
export function getCachedData(key, fallback = null) {
    try {
        const item = localStorage.getItem(key);
        if (item) {
            const parsed = JSON.parse(item);
            if (parsed) return parsed;
        }
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
    return fallback;
}

export function setCachedData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        // LocalStorage disabled or quota exceeded
    }
}
