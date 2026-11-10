// Loaded as a blocking <head> script on every page, before first paint.
// 1. Marks same-origin navigations that arrive via a cross-document view transition (html.vt-nav),
//    so the page skips its own fade-in and doesn't flicker mid-crossfade (Safari).
// 2. Morphs a homepage library object into its page and back (cassette art <-> #1 track art,
//    VHS poster <-> the film's poster, book <-> its cover): one element on each side gets the
//    class .vt-morph (view-transition-name: page-morph in base.css). Page scripts say which element
//    through window.__vtMorph = { source(library) -> { el, key }, target(library, key) -> el }.
(function () {
    var d = document.documentElement;
    var MORPH_KEY = "simplyigit_vt_morph";

    try {
        var n = performance.getEntriesByType("navigation")[0];
        // The page this one was reached from: the Navigation API also knows it for back/forward
        // loads, where document.referrer still names whatever first led to this history entry
        var activation = window.navigation && navigation.activation;
        var from = activation ? (activation.from && activation.from.url) : document.referrer;
        if ("PageRevealEvent" in window && from &&
            new URL(from).origin === location.origin && (!n || n.type !== "reload")) {
            d.classList.add("vt-nav");
        }
    } catch (e) {}

    // "home", "music", "cinema", "reading" or null
    function pageOf(url) {
        try {
            var path = new URL(url, location.href).pathname.replace(/(\/index)?(\.html)?$/, "").replace(/\/+$/, "");
            if (path === "") return "home";
            var m = /^\/library\/(music|cinema|reading)$/.exec(path);
            return m ? m[1] : null;
        } catch (e) {
            return null;
        }
    }

    // The library a navigation between `a` and `b` morphs, if it is home <-> that library's page
    function morphLibrary(a, b) {
        if (a === "home" && b && b !== "home") return b;
        if (b === "home" && a && a !== "home") return a;
        return null;
    }

    function clearMorph() {
        var marked = document.querySelectorAll(".vt-morph");
        for (var i = 0; i < marked.length; i++) marked[i].classList.remove("vt-morph");
    }

    function readMorph() {
        try { return JSON.parse(sessionStorage.getItem(MORPH_KEY)); } catch (e) { return null; }
    }

    // Leaving: name the element that flies out, and tell the next page which one it was
    addEventListener("pageswap", function (e) {
        clearMorph();
        try {
            sessionStorage.removeItem(MORPH_KEY);
            if (!e.viewTransition || !e.activation || !window.__vtMorph) return;
            var library = morphLibrary(pageOf(location.href), pageOf(e.activation.entry.url));
            var picked = library && window.__vtMorph.source(library);
            if (!picked || !picked.el) return;
            picked.el.classList.add("vt-morph");
            sessionStorage.setItem(MORPH_KEY, JSON.stringify({ library: library, key: picked.key || "" }));
        } catch (err) {}
    });

    // Arriving (also from the back/forward cache): name the element it lands on
    addEventListener("pagereveal", function (e) {
        var vt = e.viewTransition || null;
        window.__NAV_VT__ = vt;
        clearMorph();
        var done = function () {
            clearMorph();
            setTimeout(function () { d.classList.remove("vt-nav"); }, 1000);
        };
        if (!vt) return done();
        try {
            var morph = readMorph();
            var target = morph && window.__vtMorph && window.__vtMorph.target(morph.library, morph.key);
            if (target) target.classList.add("vt-morph");
        } catch (err) {}
        vt.finished.then(done, done);
    });
})();
