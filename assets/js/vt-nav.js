// Loaded as a blocking <head> script on every page, before first paint.
// Marks same-origin navigations that arrive via a cross-document view transition (html.vt-nav),
// so the page skips its own fade-in and doesn't flicker mid-crossfade (Safari).
(function () {
    var d = document.documentElement;
    try {
        var n = performance.getEntriesByType("navigation")[0];
        if ("PageRevealEvent" in window && document.referrer &&
            new URL(document.referrer).origin === location.origin && (!n || n.type !== "reload")) {
            d.classList.add("vt-nav");
        }
    } catch (e) {}
    var done = function () {
        setTimeout(function () { d.classList.remove("vt-nav"); }, 1000);
    };
    addEventListener("pagereveal", function (e) {
        window.__NAV_VT__ = e.viewTransition || null;
        if (e.viewTransition) e.viewTransition.finished.then(done, done);
        else done();
    }, { once: true });
})();
