"""Fixtures for the Playwright browser suite (scripts/e2e/).

    pip install pytest playwright && python -m playwright install chromium
    pytest scripts/e2e/

Without Playwright installed (the GitHub Actions unit job) the suite is skipped, so a plain
`pytest scripts/` stays fast and green.

Each test session starts its own scripts/dev_server.py on a free localhost port. Every page gets
the same network, whatever the live services are doing:
- /api/* answers from the data/*.json snapshots (the same shape the API returns);
- cover art and photos (Spotify, Letterboxd, wsrv.nl, ...) are small generated PNGs;
- the 30-second previews are a short silent WAV;
- fonts and the jsDelivr scripts (ONNX Runtime, Mermaid) are cached on disk after the first
  download (SIMPLYIGIT_E2E_CACHE, default ~/.cache/simplyigit-e2e). Offline with an empty cache,
  fonts fall back to the system ones and the tests that need ONNX Runtime or Mermaid skip;
- any other outside request is aborted.
"""
import hashlib
import io
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib
from urllib.parse import urlsplit

import pytest

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # the test module skips itself through pytest.importorskip
    sync_playwright = None

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data")
CACHE_DIR = os.environ.get("SIMPLYIGIT_E2E_CACHE", os.path.expanduser("~/.cache/simplyigit-e2e"))

IMAGE_HOSTS = (
    "i.scdn.co", "wsrv.nl", "a.ltrbxd.com", "coverartarchive.org", "archive.org", "i.gr-assets.com",
    "lastfm.freetls.fastly.net", "raw.githubusercontent.com",
)
AUDIO_HOSTS = ("audio-ssl.itunes.apple.com",)
CACHED_HOSTS = ("cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com")

# Rendered by Chromium for requests the stubs deliberately abort; never a page bug
IGNORED_CONSOLE = ("GL Driver Message", "WebGL", "GPU stall")

VIEWPORTS = {
    "320x568": {"viewport": {"width": 320, "height": 568}},
    "390x844-touch": {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True},
    "768x1024": {"viewport": {"width": 768, "height": 1024}},
    "1024x768": {"viewport": {"width": 1024, "height": 768}},
    "1440x900": {"viewport": {"width": 1440, "height": 900}},
}


def host_matches(host, hosts):
    return any(host == h or host.endswith("." + h) for h in hosts)


def _png(width, height, rgb):
    """A solid-colour RGB PNG, written with zlib only (no Pillow needed)."""
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    row = b"\x00" + bytes(rgb) * width
    raw = zlib.compress(row * height, 9)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def placeholder_image(url):
    """A deterministic poster-shaped PNG whose colour comes from the URL, so covers still differ."""
    digest = hashlib.sha256(url.encode()).digest()
    rgb = (40 + digest[0] % 180, 40 + digest[1] % 180, 40 + digest[2] % 180)
    return _png(60, 90, rgb)


def silent_wav(seconds=3, rate=8000):
    frames = b"\x80" * (seconds * rate)  # 8-bit unsigned PCM silence
    buf = io.BytesIO()
    buf.write(b"RIFF" + struct.pack("<I", 36 + len(frames)) + b"WAVE")
    buf.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate, 1, 8))
    buf.write(b"data" + struct.pack("<I", len(frames)) + frames)
    return buf.getvalue()


SILENT_WAV = silent_wav()
CORS = {"access-control-allow-origin": "*", "cache-control": "no-store"}


class DiskCache:
    """Stores outside responses by URL so the suite runs offline after one online run."""

    def __init__(self, root):
        self.root = root

    def _paths(self, url):
        key = hashlib.sha256(url.encode()).hexdigest()
        return os.path.join(self.root, key + ".body"), os.path.join(self.root, key + ".json")

    def get(self, url):
        body_path, meta_path = self._paths(url)
        if not (os.path.exists(body_path) and os.path.exists(meta_path)):
            return None
        with open(meta_path) as f:
            meta = json.load(f)
        with open(body_path, "rb") as f:
            return meta["content_type"], f.read()

    def fetch(self, url):
        cached = self.get(url)
        if cached:
            return cached
        # The real browser's user agent decides which font formats Google serves; any modern UA gets woff2
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                content_type = resp.headers.get("content-type", "application/octet-stream")
        except (urllib.error.URLError, OSError, TimeoutError):
            return None
        os.makedirs(self.root, exist_ok=True)
        body_path, meta_path = self._paths(url)
        with open(body_path, "wb") as f:
            f.write(body)
        with open(meta_path, "w") as f:
            json.dump({"url": url, "content_type": content_type}, f)
        return content_type, body


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base_url():
    port = free_port()
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    # Never let a local .env.local turn on live Supabase data for the tests
    env.pop("SUPABASE_URL", None)
    env.pop("SUPABASE_ANON_KEY", None)
    proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "scripts", "dev_server.py"), str(port)],
                            cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url + "/robots.txt", timeout=1).close()
            break
        except (urllib.error.URLError, OSError):
            if proc.poll() is not None:
                pytest.fail("dev_server.py exited during startup")
            time.sleep(0.1)
    else:
        proc.terminate()
        pytest.fail("dev_server.py did not start")
    yield url
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception as e:  # noqa: BLE001 - no browser binary installed
            pytest.skip(f"Chromium is not available for Playwright: {e}")
        yield b
        b.close()


@pytest.fixture(scope="session")
def disk_cache():
    return DiskCache(CACHE_DIR)


@pytest.fixture(scope="session")
def fixtures():
    out = {}
    for name in ("dashboard", "spotify", "movies", "projects"):
        with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as f:
            out[name] = f.read()
    return out


INIT_SCRIPT = """
window.__cspViolations = [];
document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push({
    directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile || '', line: e.lineNumber }));
"""


def unexpected_csp_violations(violations):
    """CSP reports the pages would cause in production. Left out: Playwright's own string predicates
    (wait_for_function evaluates them in the page: blocked "eval" with no source file), and
    ONNX Runtime Web's bundled protobuf.js probing for require() with eval inside a try/catch
    (ort.min.js `inquire`), which fails harmlessly: inference also works under an enforcing CSP."""
    out = []
    for v in violations:
        if v["blocked"] == "eval" and not v["source"]:
            continue
        if v["blocked"] == "eval" and v["source"].startswith("https://cdn.jsdelivr.net/npm/onnxruntime-web@"):
            continue
        out.append(v)
    return out


class PageErrors:
    def __init__(self):
        self.page_errors = []
        self.console_errors = []
        self.failed_requests = []

    def unexpected_console(self):
        return [m for m in self.console_errors if not any(s in m for s in IGNORED_CONSOLE)]


def install_routes(context, base_url, fixtures, disk_cache, state, api_overrides=None):
    origin = urlsplit(base_url).netloc

    def handle(route):
        request = route.request
        parts = urlsplit(request.url)
        host = parts.hostname or ""
        if parts.netloc == origin:
            if parts.path.startswith("/api/"):
                name = parts.path[len("/api/"):].strip("/")
                body = (api_overrides or {}).get(name) or fixtures.get(name)
                if body:
                    return route.fulfill(status=200, content_type="application/json", body=body,
                                         headers={"cache-control": "no-store"})
                return route.fulfill(status=404, content_type="application/json", body='{"success": false}')
            return route.continue_()
        if host_matches(host, IMAGE_HOSTS):
            return route.fulfill(status=200, content_type="image/png", body=placeholder_image(request.url), headers=CORS)
        if host_matches(host, AUDIO_HOSTS):
            return route.fulfill(status=200, content_type="audio/wav", body=SILENT_WAV, headers=CORS)
        if host_matches(host, CACHED_HOSTS):
            hit = disk_cache.fetch(request.url)
            if hit:
                content_type, body = hit
                return route.fulfill(status=200, content_type=content_type, body=body, headers=CORS)
            state["offline_misses"].add(host)
            if host == "fonts.googleapis.com":
                return route.fulfill(status=200, content_type="text/css", body="", headers=CORS)
            return route.abort("internetdisconnected")
        state["aborted"].append(request.url)
        return route.abort("blockedbyclient")

    context.route("**/*", handle)


@pytest.fixture(scope="session")
def net_state():
    return {"offline_misses": set(), "aborted": []}


@pytest.fixture
def new_page(browser, base_url, fixtures, disk_cache, net_state):
    """new_page(viewport_name="1440x900", reduced_motion=False, api_overrides=None, **context_options)
    -> (page, errors). api_overrides maps an /api name to the JSON body to answer with instead."""
    contexts = []

    def make(viewport_name="1440x900", reduced_motion=False, api_overrides=None, **options):
        opts = {**VIEWPORTS[viewport_name], **options}
        context = browser.new_context(reduced_motion="reduce" if reduced_motion else "no-preference",
                                      service_workers="block", **opts)
        context.add_init_script(INIT_SCRIPT)
        install_routes(context, base_url, fixtures, disk_cache, net_state, api_overrides)
        page = context.new_page()
        errors = PageErrors()
        page.on("pageerror", lambda e: errors.page_errors.append(str(e)))
        page.on("console", lambda m: errors.console_errors.append(m.text) if m.type == "error" else None)
        page.on("response", lambda r: errors.failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        contexts.append(context)
        return page, errors

    yield make
    for c in contexts:
        c.close()
