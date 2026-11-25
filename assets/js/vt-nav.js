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

    // "home", "music", "cinema" or null
    function pageOf(url) {
        try {
            var path = new URL(url, location.href).pathname.replace(/(\/index)?(\.html)?$/, "").replace(/\/+$/, "");
            if (path === "") return "home";
            var m = /^\/library\/(music|cinema)$/.exec(path);
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

    function sourceImageUrl(picked) {
        if (!picked) return "";
        if (picked.imgUrl) return picked.imgUrl;
        var el = picked.el;
        if (!el) return "";
        if (el.tagName === "IMG") return el.currentSrc || el.src || "";
        var img = el.querySelector && el.querySelector("img");
        return (img && (img.currentSrc || img.src)) || (el.dataset && el.dataset.thumb) || "";
    }

    function sourceImageEl(picked) {
        if (!picked) return null;
        if (picked.imgEl && picked.imgEl.complete && picked.imgEl.naturalWidth > 0) return picked.imgEl;
        var el = picked.el;
        if (!el) return null;
        if (el.__corsImg && el.__corsImg.complete && el.__corsImg.naturalWidth > 0) return el.__corsImg;
        var img = el.tagName === "IMG" ? el : (el.querySelector && el.querySelector("img"));
        return (img && img.complete && img.naturalWidth > 0) ? img : null;
    }

    // Capture a tiny local snapshot (~6 KB) on the leaving page so the arriving page's WebGL Genie
    // decodes in ~1ms with zero network round-trip
    function snapshotDataUrl(picked) {
        try {
            var img = sourceImageEl(picked);
            if (!img) return "";
            var size = 200;
            var nw = img.naturalWidth, nh = img.naturalHeight;
            var scale = Math.min(1, size / Math.max(nw, nh));
            var c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(nw * scale));
            c.height = Math.max(1, Math.round(nh * scale));
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            var url = c.toDataURL("image/webp", 0.85);
            // Safari can't encode WebP and hands back a PNG (~80 KB, slow to decode on arrival): use JPEG there
            return url.indexOf("data:image/webp") === 0 ? url : c.toDataURL("image/jpeg", 0.85);
        } catch (e) {
            return "";
        }
    }

    function readMorph() {
        try { return JSON.parse(sessionStorage.getItem(MORPH_KEY)); } catch (e) { return null; }
    }

    // Leaving: capture source box + local image snapshot for the WebGL Genie warp (and .vt-morph as fallback)
    addEventListener("pageswap", function (e) {
        clearMorph();
        try {
            sessionStorage.removeItem(MORPH_KEY);
            if (!e.viewTransition || !e.activation || !window.__vtMorph) return;
            var fromPage = pageOf(location.href);
            var toPage = pageOf(e.activation.entry.url);
            var library = morphLibrary(fromPage, toPage);
            var picked = library && window.__vtMorph.source(library);
            if (!picked || !picked.el) return;
            var r = picked.el.getBoundingClientRect();
            var radius = parseFloat(getComputedStyle(picked.el).borderTopLeftRadius) || 0;
            var imgUrl = sourceImageUrl(picked);
            var dataUrl = snapshotDataUrl(picked);
            // Always keep .vt-morph on the source element so the CSS page-morph fallback works if WebGL is unavailable
            picked.el.classList.add("vt-morph");
            sessionStorage.setItem(MORPH_KEY, JSON.stringify({
                library: library,
                key: picked.key || "",
                dir: fromPage === "home" ? "in" : "out",
                fromRect: { left: r.left, top: r.top, width: r.width, height: r.height },
                fromRadius: radius,
                imgUrl: imgUrl,
                dataUrl: dataUrl
            }));
        } catch (err) {}
    });

    // Arriving (also from the back/forward cache): run WebGL Genie warp on the cover art, else CSS fallback
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
            try { sessionStorage.removeItem(MORPH_KEY); } catch (e) {}
            var target = morph && window.__vtMorph && window.__vtMorph.target(morph.library, morph.key);
            if (target && (morph.dataUrl || morph.imgUrl) && morph.fromRect && window.__runGenieMorph) {
                var started = window.__runGenieMorph({
                    targetEl: target,
                    fromRect: morph.fromRect,
                    fromRadius: morph.fromRadius,
                    imgUrl: morph.imgUrl,
                    dataUrl: morph.dataUrl,
                    dir: morph.dir
                });
                if (started) {
                    // Silence expected AbortError rejections from skipping the native transition
                    if (vt.ready) vt.ready.catch(function () {});
                    if (vt.finished) vt.finished.catch(function () {});
                    vt.skipTransition();
                    window.__NAV_VT__ = null;
                    // Subtle opacity settle via WAAPI (never touches .fade-in's CSS animation, so it can't restart)
                    var c = document.querySelector(".container");
                    if (c && c.animate) c.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
                    setTimeout(function () { d.classList.remove("vt-nav"); }, 1000);
                    return;
                }
            }
            if (target) target.classList.add("vt-morph");
        } catch (err) {}
        vt.finished.then(done, done);
    });
})();
