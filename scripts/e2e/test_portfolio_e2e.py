"""Browser regression suite: behaviour, layout and accessibility of every page (see conftest.py).

    pytest scripts/e2e/            # needs `pip install playwright` + `python -m playwright install chromium`
"""
import json
import os
import re
import struct
import urllib.error
import urllib.request
import zlib

import pytest

pytest.importorskip("playwright.sync_api")

from conftest import ROOT, VIEWPORTS, unexpected_csp_violations  # noqa: E402

PAGES = {
    "home": "/",
    "music": "/library/music",
    "cinema": "/library/cinema",
    "detector": "/projects/real-deepfake-or-ai",
    "404": "/404",
}


def load_fixture(name):
    with open(os.path.join(ROOT, "data", f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)["data"]


def open_page(page, base_url, path, settle_ms=600):
    page.goto(base_url + path, wait_until="load")
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except Exception:  # noqa: BLE001 - long-polling isn't expected, but a slow stub mustn't fail the test here
        pass
    page.wait_for_timeout(settle_ms)


def scroll_through(page):
    """Scrolls to the bottom in viewport steps (lazy images and reveals) and back to the top."""
    page.evaluate("""async () => {
        const step = Math.max(200, window.innerHeight * 0.8);
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 60));
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(r => setTimeout(r, 250));
        window.scrollTo(0, 0);
    }""")
    page.wait_for_timeout(300)


def assert_clean(page, errors):
    assert errors.page_errors == [], errors.page_errors
    assert errors.unexpected_console() == [], errors.unexpected_console()
    local_failures = [r for r in errors.failed_requests if "127.0.0.1" in r]
    assert local_failures == [], local_failures
    csp = unexpected_csp_violations(page.evaluate("window.__cspViolations"))
    assert csp == [], f"Content-Security-Policy-Report-Only violations: {csp}"


def rect(page, selector):
    box = page.locator(selector).first.bounding_box()
    assert box, f"{selector} has no layout box"
    return box


def noisy_png(width, height):
    """A deterministic RGB PNG with varied pixels (a gradient with a checker pattern)."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            c = 255 if (x // 16 + y // 16) % 2 else 0
            rows += bytes(((x * 255) // width, (y * 255) // height, c))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b""))


# ---------------------------------------------------------------------------------------------
# 1. Cross-site invariants: every page at every viewport
# ---------------------------------------------------------------------------------------------

@pytest.mark.parametrize("viewport", list(VIEWPORTS))
@pytest.mark.parametrize("name", list(PAGES))
def test_page_invariants(new_page, base_url, name, viewport):
    page, errors = new_page(viewport)
    open_page(page, base_url, PAGES[name])
    scroll_through(page)
    page.wait_for_timeout(400)

    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 0, f"{name} @ {viewport}: {overflow}px of horizontal overflow"

    broken = page.evaluate("""() => [...document.images]
        .filter(img => img.getAttribute('src') && img.complete && img.naturalWidth === 0)
        .map(img => img.currentSrc || img.src)""")
    assert broken == [], broken

    assert_clean(page, errors)


def test_retired_reading_page_redirects_home(new_page, base_url):
    req = urllib.request.Request(base_url + "/library/reading", method="HEAD")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    try:
        opener.open(req)
        pytest.fail("/library/reading did not redirect")
    except urllib.error.HTTPError as e:
        assert e.code in (301, 307, 308)
        assert e.headers["Location"] == "/"

    page, _ = new_page()
    page.goto(base_url + "/library/reading")
    assert page.url == base_url + "/"


def test_unknown_url_serves_404_page(new_page, base_url):
    page, _ = new_page()
    resp = page.goto(base_url + "/no-such-page")
    assert resp.status == 404
    assert page.locator("h1").count() == 1


# ---------------------------------------------------------------------------------------------
# 2. Homepage
# ---------------------------------------------------------------------------------------------

BUBBLE_TEXT = "#memoji-bubble-text"


def wait_for_text_change(page, selector, before, timeout=9000):
    page.wait_for_function("([s, t]) => document.querySelector(s)?.textContent !== t", arg=[selector, before],
                           timeout=timeout)


def test_memoji_bubble_cycles_with_live_data_and_pauses_on_hover(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/")
    bubble = page.locator("#memoji-bubble")
    assert bubble.is_visible()
    first = page.text_content(BUBBLE_TEXT)
    wait_for_text_change(page, BUBBLE_TEXT, first)
    page.wait_for_timeout(300)  # the 160 ms text swap
    second = page.text_content(BUBBLE_TEXT)
    # Line 2 is the #1 track from the fixture
    track = load_fixture("dashboard")["spotify"]["top_tracks_last_month"][0]
    assert track["title"] in second

    bubble.hover()
    held = page.text_content(BUBBLE_TEXT)
    page.wait_for_timeout(6500)
    assert page.text_content(BUBBLE_TEXT) == held, "bubble kept cycling while hovered"
    assert_clean(page, errors)


def test_memoji_bubble_is_static_under_reduced_motion(new_page, base_url):
    page, errors = new_page(reduced_motion=True)
    open_page(page, base_url, "/")
    first = page.text_content(BUBBLE_TEXT)
    page.wait_for_timeout(6500)
    assert page.text_content(BUBBLE_TEXT) == first
    assert_clean(page, errors)


def open_palette_with_slash(page):
    page.locator("body").click(position={"x": 5, "y": 5})
    page.keyboard.press("/")
    page.wait_for_selector("#memoji-dialog[open]")
    page.wait_for_function("document.activeElement?.id === 'memoji-search'")


def test_memoji_palette_keyboard_flow(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/")
    open_palette_with_slash(page)
    prompts = page.locator(".memoji-prompt-btn")
    total = prompts.count()
    assert total >= 4

    # Filtering narrows the list (it matches questions, answers and tags)
    page.keyboard.type("repeat")
    page.wait_for_function(f"document.querySelectorAll('.memoji-prompt-btn').length < {total}")
    assert "on repeat" in prompts.first.text_content().lower()
    # The music answer interpolates the live #1 track
    track = load_fixture("dashboard")["spotify"]["top_tracks_last_month"][0]
    assert track["title"] in page.text_content("#memoji-answer-pane")

    # The cinema answer interpolates the latest film
    page.fill("#memoji-search", "watched")
    film = load_fixture("dashboard")["movies"]["recent_activity"][0]
    page.wait_for_function("t => document.querySelector('#memoji-answer-pane').textContent.includes(t)",
                           arg=film["title"].split(",")[0])

    # Arrow keys move the selection and open each answer
    page.fill("#memoji-search", "")
    page.wait_for_function(f"document.querySelectorAll('.memoji-prompt-btn').length === {total}")
    first_answer = page.text_content("#memoji-answer-pane")
    page.keyboard.press("ArrowDown")
    assert page.get_attribute(".memoji-prompt-btn >> nth=1", "aria-selected") == "true"
    assert page.text_content("#memoji-answer-pane") != first_answer

    # Contact: GitHub and LinkedIn only, no e-mail anywhere in the palette
    page.fill("#memoji-search", "contact")
    page.wait_for_selector(".memoji-answer-link")
    hrefs = page.eval_on_selector_all(".memoji-answer-link", "els => els.map(a => a.href)")
    assert len(hrefs) == 2
    assert any("github.com/simplyigit" in h for h in hrefs)
    assert any("linkedin.com" in h for h in hrefs)
    assert page.locator("#memoji-dialog a[href^='mailto:']").count() == 0
    assert not re.search(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", page.text_content("#memoji-dialog"))

    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('#memoji-dialog').open")
    assert_clean(page, errors)


def test_memoji_palette_opens_on_click_and_enter_follows_answer_link(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/")
    page.click("#memoji-trigger")
    page.wait_for_selector("#memoji-dialog[open]")
    page.wait_for_function("document.activeElement?.id === 'memoji-search'")
    page.keyboard.type("onnx")
    page.wait_for_selector(".memoji-answer-link")
    with page.expect_navigation():
        page.keyboard.press("Enter")
    assert page.url.rstrip("/").endswith("/projects/real-deepfake-or-ai")
    assert_clean(page, errors)


def test_memoji_qa_has_no_public_email():
    with open(os.path.join(ROOT, "data", "memoji-qa.json"), encoding="utf-8") as f:
        raw = f.read()
    assert "mailto:" not in raw
    assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", raw)


@pytest.mark.parametrize("viewport", list(VIEWPORTS))
def test_library_objects_do_not_overlap(new_page, base_url, viewport):
    page, errors = new_page(viewport)
    open_page(page, base_url, "/")
    page.locator("#vhs-card").scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    # The #1 fixture track may have no preview; the deck key then stays hidden by design
    boxes = {s: rect(page, s) for s in ("#book-card", "#cassette-slot", "#vhs-card")}
    if page.locator("#cassette-play").is_visible():
        play = rect(page, "#cassette-play")
        slot = boxes["#cassette-slot"]
        assert slot["x"] - 1 <= play["x"] and play["x"] + play["width"] <= slot["x"] + slot["width"] + 1

    def overlap(a, b):
        return (min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]) > 1
                and min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]) > 1)
    names = list(boxes)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            assert not overlap(boxes[a], boxes[b]), f"{a} overlaps {b} at {viewport}"
    # The VHS deck rendered its recent watches
    assert page.locator("#vhs-card img").count() >= 1
    assert_clean(page, errors)


def test_cassette_preview_plays_and_stops(new_page, base_url):
    # The live #1 track may have no iTunes preview (the deck key is then hidden by design), so give it one
    with open(os.path.join(ROOT, "data", "dashboard.json"), encoding="utf-8") as f:
        dashboard = json.load(f)
    dashboard["data"]["spotify"]["top_tracks_last_month"][0]["preview_url"] = "https://audio-ssl.itunes.apple.com/e2e/preview.m4a"
    page, errors = new_page(api_overrides={"dashboard": json.dumps(dashboard)})
    open_page(page, base_url, "/")
    assert page.locator("#cassette-play").is_visible()
    play = rect(page, "#cassette-play")
    slot = rect(page, "#cassette-slot")
    vhs = rect(page, "#vhs-card")
    assert slot["x"] - 1 <= play["x"] and play["x"] + play["width"] <= slot["x"] + slot["width"] + 1
    assert play["x"] + play["width"] <= vhs["x"] or play["y"] + play["height"] <= vhs["y"] or play["y"] >= vhs["y"] + vhs["height"]
    page.click("#cassette-play")
    page.wait_for_function("document.querySelector('#cassette-play').getAttribute('aria-pressed') === 'true'")
    page.click("#cassette-play")
    page.wait_for_function("document.querySelector('#cassette-play').getAttribute('aria-pressed') === 'false'")
    assert_clean(page, errors)


# ---------------------------------------------------------------------------------------------
# 3. Music
# ---------------------------------------------------------------------------------------------

def test_hero_lyric_cycles_without_layout_shift(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/library/music")
    assert page.locator(".lyric-next-btn").count() == 0
    lyric = ".top-track-banner .track-ai-lyric-text"
    page.wait_for_selector(lyric)
    hero = ".top-track-banner"

    def geometry():
        return page.evaluate("""() => {
            const hero = document.querySelector('.top-track-banner');
            const lyric = hero.querySelector('.track-ai-lyric');
            const below = document.querySelector('.spotify-tracks-grid > :nth-child(2)');
            return { hero: hero.getBoundingClientRect().height, lyric: lyric.getBoundingClientRect().height,
                     below: below ? below.getBoundingClientRect().top + window.scrollY : 0 }; }""")

    def same(g, ref):
        # The card and everything after it must not move; the lyric box itself may differ by sub-pixel rounding
        return g["hero"] == ref["hero"] and g["below"] == ref["below"] and abs(g["lyric"] - ref["lyric"]) < 0.05

    start = geometry()
    first = page.text_content(lyric)
    wait_for_text_change(page, lyric, first, timeout=10000)
    page.wait_for_timeout(400)
    assert same(geometry(), start), "the automatic lyric switch moved the layout"

    # One-line and two-line quotes keep the same box (the stage reserves two lines)
    lyrics = [v for v in load_fixture("spotify")["top_tracks_last_month"][0]["ai_lyrics"].values() if v]
    lines = {}
    geometries = {}
    for text in ['"Short."'] + [f'"{t}"' for t in lyrics]:
        page.eval_on_selector(lyric, "(el, t) => { el.textContent = t; }", text)
        page.wait_for_timeout(50)
        lines[text] = page.eval_on_selector(lyric, """el => { const r = document.createRange(); r.selectNodeContents(el);
            return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; }""")
        geometries[text] = geometry()
    # The fixture's lyrics may all fit on one line here: grow a quote word by word until it wraps once
    two_line = page.eval_on_selector(lyric, """el => {
        const count = () => { const r = document.createRange(); r.selectNodeContents(el);
            return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; };
        let words = ['"Every'];
        for (let i = 0; i < 80 && count() < 2; i++) { words.push('word'); el.textContent = words.join(' ') + '"'; }
        return count() === 2 ? el.textContent : null; }""")
    assert two_line, "could not build a two-line quote"
    page.wait_for_timeout(50)
    lines[two_line] = 2
    geometries[two_line] = geometry()
    assert 1 in lines.values(), f"no one-line quote: {lines}"
    for text, g in geometries.items():
        if lines[text] <= 2:
            assert same(g, start), f"{lines[text]}-line quote moved the layout: {g} vs {start}"
    page.mouse.move(1, 1)
    assert page.locator(hero).count() == 1
    assert_clean(page, errors)


def switch_tab(page, tab):
    page.click(f".music-tab-btn[data-tab='{tab}']")
    # Settled: only the new pane is shown and no morph layer is left behind (a stuck overlay times out)
    page.wait_for_function("""t => {
        const shown = ['tracks', 'artists', 'albums'].filter(n => getComputedStyle(document.getElementById('music-pane-' + n)).display !== 'none');
        return shown.length === 1 && shown[0] === t && document.getElementById('music-pane-' + t).classList.contains('active')
            && !document.querySelector('.music-morph-stage, .music-morph-card, .music-morph-sheen, .music-morph-outline, .music-morph-extra');
    }""", arg=tab, timeout=5000)
    page.wait_for_timeout(150)
    others = [t for t in ("tracks", "artists", "albums") if t != tab]
    for other in others:
        assert page.eval_on_selector(f"#music-pane-{other}", "el => getComputedStyle(el).display") == "none"
    assert page.get_attribute(f".music-tab-btn[data-tab='{tab}']", "aria-selected") == "true"


def test_music_tabs_switch_cleanly_and_stop_previews(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/library/music")
    play = page.locator("#music-pane-tracks .preview-btn").first
    assert play.count() == 1, "no track in data/spotify.json has a preview"
    play.click()
    page.wait_for_function("document.querySelector('#music-pane-tracks .preview-btn[aria-pressed=\"true\"]')")
    for tab in ("artists", "albums", "tracks"):
        switch_tab(page, tab)
        assert page.locator(".preview-btn[aria-pressed='true']").count() == 0
    # Each pane rendered its cards
    for pane in ("tracks", "artists", "albums"):
        assert page.locator(f"#music-pane-{pane} .spotify-track-card, #music-pane-{pane} .album-card").count() >= 1
    assert_clean(page, errors)


def test_artist_hero_card_top_song_layout(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/library/music")
    switch_tab(page, "artists")
    card = "#music-pane-artists .top-track-banner"
    page.wait_for_selector(f"{card} .artist-song-cover-link")
    assert "open.spotify.com" in page.get_attribute(f"{card} .artist-song-cover-link", "href")
    assert page.locator(".artist-song-link").count() == 0

    artist = load_fixture("spotify")["top_artists_last_month"][0]
    assert artist["top_track"].get("preview_url"), "data/spotify.json: the #1 artist's top song has no preview_url"
    cover = rect(page, f"{card} .artist-song-cover-link")
    btn = rect(page, f"{card} .artist-song-play-btn")
    assert btn["y"] >= cover["y"] + cover["height"] - 0.5, "play button is not below the cover"
    assert abs((btn["x"] + btn["width"] / 2) - (cover["x"] + cover["width"] / 2)) <= 2
    ring = rect(page, f"{card} .artist-song-progress-bar")
    art = rect(page, f"{card} .artist-song-art")
    assert ring["x"] <= art["x"] + 0.5 and ring["y"] <= art["y"] + 0.5
    assert ring["x"] + ring["width"] >= art["x"] + art["width"] - 0.5
    assert ring["y"] + ring["height"] >= art["y"] + art["height"] - 0.5

    page.click(f"{card} .artist-song-play-btn")
    page.wait_for_function(f"document.querySelector(\"{card} .artist-song-play-btn\").getAttribute('aria-pressed') === 'true'")
    switch_tab(page, "tracks")
    assert page.locator(".preview-btn[aria-pressed='true']").count() == 0
    assert_clean(page, errors)


# ---------------------------------------------------------------------------------------------
# 4. Cinema
# ---------------------------------------------------------------------------------------------

def marquee_x(page):
    return page.eval_on_selector("#movies-favorites-container",
                                 "el => new DOMMatrix(getComputedStyle(el).transform).m41")


def test_favorites_marquee_runs_and_pauses_on_hover(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/library/cinema")
    a = marquee_x(page)
    page.wait_for_timeout(600)
    assert marquee_x(page) != a, "the favourites marquee isn't moving"
    # The strip never stops moving, so Playwright's hover (which waits for a still target) can't be used
    # Point at the middle of the visible strip, which is always over some card
    box = rect(page, ".animated-filmstrip-container")
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(1500)  # eases to a stop
    held = marquee_x(page)
    page.wait_for_timeout(600)
    assert abs(marquee_x(page) - held) < 0.5, "the marquee kept moving under the pointer"
    assert_clean(page, errors)


def test_favorites_are_a_static_grid_under_reduced_motion(new_page, base_url):
    page, errors = new_page(reduced_motion=True)
    open_page(page, base_url, "/library/cinema")
    style = page.eval_on_selector("#movies-favorites-container",
                                  "el => ({ display: getComputedStyle(el).display, transform: getComputedStyle(el).transform })")
    assert style["display"] == "grid"
    assert style["transform"] == "none"
    assert page.locator("#movies-favorites-container .filmstrip-card[aria-hidden='true']:visible").count() == 0
    assert_clean(page, errors)


def popover_geometry(page, idx):
    return page.evaluate("""i => {
        const card = document.querySelectorAll('#movies-recent-container .strip-card')[i].getBoundingClientRect();
        const pop = document.getElementById('recent-watch-popover');
        const p = pop.getBoundingClientRect();
        const c = pop.querySelector('.recent-popover-caret').getBoundingClientRect();
        return { open: pop.classList.contains('is-open'), cardCenter: card.left + card.width / 2,
                 cardBottom: card.bottom, caretCenter: c.left + c.width / 2, popTop: p.top,
                 popLeft: p.left, popRight: p.right, vw: document.documentElement.clientWidth }; }""", idx)


@pytest.mark.parametrize("viewport", ["1440x900", "1024x768"])
def test_recent_watches_caret_popover(new_page, base_url, viewport):
    page, errors = new_page(viewport)
    open_page(page, base_url, "/library/cinema")
    cards = page.locator("#movies-recent-container .strip-card")
    assert cards.count() >= 6
    assert page.locator("#movies-recent-container .poster-overlay").count() == 0
    cards.first.scroll_into_view_if_needed()
    for i in range(6):
        cards.nth(i).hover()
        page.wait_for_function("document.getElementById('recent-watch-popover').classList.contains('is-open')")
        page.wait_for_timeout(350)  # rise-in transition
        g = popover_geometry(page, i)
        assert g["popTop"] >= g["cardBottom"] - 12, f"card {i + 1}: popover is not below the card"
        assert abs(g["caretCenter"] - g["cardCenter"]) <= 2, f"card {i + 1}: caret off by {g['caretCenter'] - g['cardCenter']:.1f}px"
        assert g["popLeft"] >= 0 and g["popRight"] <= g["vw"], f"card {i + 1}: popover leaves the viewport"
    # Keyboard focus opens it too
    page.mouse.move(1, 1)
    page.wait_for_function("!document.getElementById('recent-watch-popover').classList.contains('is-open')")
    cards.nth(2).focus()
    page.wait_for_function("document.getElementById('recent-watch-popover').classList.contains('is-open')")
    page.keyboard.press("Escape")
    page.wait_for_function("!document.getElementById('recent-watch-popover').classList.contains('is-open')")
    assert_clean(page, errors)


def test_recent_watches_touch_tap_opens_popover(new_page, base_url):
    page, errors = new_page("390x844-touch")
    open_page(page, base_url, "/library/cinema")
    url = page.url
    card = page.locator("#movies-recent-container .strip-card").first
    card.scroll_into_view_if_needed()
    card.tap()
    page.wait_for_function("document.getElementById('recent-watch-popover').classList.contains('is-open')")
    assert page.url == url, "the first tap navigated"
    assert len(page.context.pages) == 1, "the first tap opened Letterboxd"
    link = page.locator("#recent-watch-popover .recent-popover-open")
    assert link.is_visible()
    assert link.text_content().strip() == "Letterboxd ↗"
    assert "letterboxd.com" in link.get_attribute("href")

    page.locator("h2.section-title").first.tap()
    page.wait_for_function("!document.getElementById('recent-watch-popover').classList.contains('is-open')")

    watch = page.locator("#movies-watchlist-container .watchlist-card").first
    watch.scroll_into_view_if_needed()
    assert watch.locator(".poster-overlay").count() == 1
    watch.tap()
    page.wait_for_timeout(200)
    assert "is-revealed" in watch.get_attribute("class")
    assert page.url == url and len(page.context.pages) == 1
    assert_clean(page, errors)


# ---------------------------------------------------------------------------------------------
# 5. Detector
# ---------------------------------------------------------------------------------------------

def require_cdn(page, net_state):
    if "cdn.jsdelivr.net" in net_state["offline_misses"]:
        pytest.skip("cdn.jsdelivr.net unreachable and not in the e2e cache")


def test_detector_preset_sample(new_page, base_url):
    page, errors = new_page()
    open_page(page, base_url, "/projects/real-deepfake-or-ai")
    page.click(".detector-sample-btn[data-sample='ai']")
    assert page.text_content("#detector-input-caption").strip() == "Preset illustration"
    assert page.locator("#detector-telemetry").is_hidden()
    assert page.get_attribute(".detector-sample-btn[data-sample='ai']", "aria-pressed") == "true"
    assert_clean(page, errors)


def test_detector_real_inference_on_upload(new_page, base_url, net_state):
    page, errors = new_page()
    open_page(page, base_url, "/projects/real-deepfake-or-ai")
    page.set_input_files("#detector-file-input", files=[{
        "name": "face.png", "mimeType": "image/png", "buffer": noisy_png(256, 256)}])
    try:
        page.wait_for_function("document.getElementById('detector-input-caption').textContent.includes('Model input')",
                               timeout=120000)
    except Exception:
        require_cdn(page, net_state)
        raise
    assert page.text_content("#detector-input-caption").strip() == "Model input · 224×224 (5% crop)"
    assert page.locator("#detector-telemetry").is_visible()
    assert re.fullmatch(r"\d+ ms", page.text_content("#telemetry-latency").strip())
    assert float(page.text_content("#telemetry-norm")) > 0
    lit = page.eval_on_selector("#detector-embedding-canvas", """c => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }""")
    assert lit > 0, "the embedding barcode is blank"
    assert page.text_content("#detector-live-result").startswith("Classification complete:")
    assert_clean(page, errors)


def test_detector_mermaid_scrolls_on_mobile(new_page, base_url, net_state):
    page, errors = new_page("390x844-touch")
    open_page(page, base_url, "/projects/real-deepfake-or-ai")
    page.locator("pre.mermaid, .mermaid").first.scroll_into_view_if_needed()
    try:
        page.wait_for_selector(".mermaid-scroll-wrap", timeout=30000)
    except Exception:
        require_cdn(page, net_state)
        raise
    hint = page.locator(".mermaid-scroll-wrap").first.locator("text=scroll →")
    assert hint.count() == 1 and hint.is_visible()
    assert_clean(page, errors)


# ---------------------------------------------------------------------------------------------
# 6. Accessibility and keyboard
# ---------------------------------------------------------------------------------------------

@pytest.mark.parametrize("name", list(PAGES))
def test_landmarks_and_accessible_names(new_page, base_url, name):
    page, errors = new_page()
    open_page(page, base_url, PAGES[name])
    assert page.locator("h1").count() == 1
    assert page.locator("main").count() == 1
    unnamed = page.evaluate("""() => [...document.querySelectorAll('a[href], button, input, [role=tab]')]
        .filter(el => el.getClientRects().length && !el.closest('[aria-hidden=true]'))
        .filter(el => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title
                        || el.textContent.trim() || (el.labels && el.labels.length)))
        .map(el => el.outerHTML.slice(0, 120))""")
    assert unnamed == [], unnamed
    no_alt = page.evaluate("() => [...document.images].filter(i => !i.hasAttribute('alt')).map(i => i.src)")
    assert no_alt == [], no_alt
    assert_clean(page, errors)


@pytest.mark.parametrize("name", list(PAGES))
def test_reduced_motion_stops_continuous_motion(new_page, base_url, name):
    page, errors = new_page(reduced_motion=True)
    open_page(page, base_url, PAGES[name], settle_ms=1500)
    result = page.evaluate("""async () => {
        let frames = 0, on = true;
        const loop = () => { if (!on) return; frames++; requestAnimationFrame(loop); };
        // Count the page's own rAF callbacks by wrapping the global for two seconds
        const raf = window.requestAnimationFrame;
        let pageFrames = 0;
        window.requestAnimationFrame = cb => raf(t => { pageFrames++; cb(t); });
        await new Promise(r => setTimeout(r, 2000));
        window.requestAnimationFrame = raf;
        const infinite = document.getAnimations().filter(a => a.playState === 'running' && (() => {
            try { return a.effect.getComputedTiming().iterations === Infinity; } catch { return false; } })());
        return { pageFrames, infinite: infinite.map(a => a.animationName || 'web-animation') }; }""")
    assert result["pageFrames"] == 0, f"{name}: {result['pageFrames']} rAF callbacks in 2 s under reduced motion"
    assert result["infinite"] == [], f"{name}: looping animations under reduced motion: {result['infinite']}"
    assert_clean(page, errors)


@pytest.mark.parametrize("name", list(PAGES))
def test_keyboard_focus_moves_through_controls_without_traps(new_page, base_url, name):
    page, errors = new_page()
    open_page(page, base_url, PAGES[name])
    seen = []
    for _ in range(120):
        page.keyboard.press("Tab")
        info = page.evaluate("""() => { const el = document.activeElement;
            if (!el || el === document.body) return null;
            const r = el.getBoundingClientRect();
            // A per-element id: two controls with the same text and link are still different stops
            el.__e2eFocusId ??= (window.__e2eFocusSeq = (window.__e2eFocusSeq || 0) + 1);
            return { key: el.__e2eFocusId + ' ' + el.tagName + ' ' + (el.getAttribute('href') || el.textContent.trim().slice(0, 30)),
                     visible: r.width > 0 && r.height > 0 }; }""")
        if info is None:
            break
        assert info["visible"], f"{name}: focus landed on an invisible element {info['key']}"
        if seen and info["key"] == seen[0]:
            break
        assert info["key"] not in seen[-1:], f"{name}: focus stuck on {info['key']}"
        seen.append(info["key"])
    else:
        pytest.fail(f"{name}: Tab never left the page or wrapped around ({len(seen)} stops)")
    assert len(seen) >= 3, f"{name}: only {len(seen)} focusable controls"
    assert len(set(seen)) == len(seen), f"{name}: focus revisited a control before finishing the page"
    assert_clean(page, errors)
