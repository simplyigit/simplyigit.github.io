"""Local preview server that behaves like Vercel for this site: clean URLs, the redirects, rewrites and
headers in vercel.json, and the Python /api functions.

    python3 scripts/dev_server.py [port]        # default port 8000

Live API data needs SUPABASE_URL and SUPABASE_ANON_KEY, from the environment or a `.env.local`
file in the repo root (gitignored). Without them /api answers 500 and the pages fall back to the
/data snapshots, exactly as they would in production.

Responses are sent with `Cache-Control: no-store`, so edits show up on a plain reload.
"""
import http.server
import importlib.util
import json
import os
import re
import sys
import threading
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "api")
sys.path.insert(0, API_DIR)
# Requests are threaded: loading (and patching) the API modules must not interleave
API_IMPORT_LOCK = threading.Lock()


def load_env_file(path):
    """Reads KEY=VALUE lines into os.environ without overriding variables that are already set."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_vercel_config():
    with open(os.path.join(ROOT, "vercel.json")) as f:
        return json.load(f)


def load_rewrites(config):
    """Exact-path rewrites from vercel.json (the /api catch-all is handled separately)."""
    return {r["source"]: r["destination"] for r in config.get("rewrites", []) if "(" not in r["source"]}


def load_redirects(config):
    """Exact-path redirects from vercel.json, as {source: (destination, status)}."""
    return {r["source"]: (r["destination"], 308 if r.get("permanent", True) else 307)
            for r in config.get("redirects", []) if "(" not in r["source"] and ":" not in r["source"]}


def load_headers(config):
    """vercel.json's custom headers as (source pattern, [(key, value)]). Its sources are plain regexes.
    Cache-Control is left out: everything here is no-store (see end_headers)."""
    return [
        (re.compile(rule["source"]), [(h["key"], h["value"]) for h in rule["headers"] if h["key"].lower() != "cache-control"])
        for rule in config.get("headers", [])
    ]


VERCEL_CONFIG = load_vercel_config()
REWRITES = load_rewrites(VERCEL_CONFIG)
REDIRECTS = load_redirects(VERCEL_CONFIG)
HEADERS = load_headers(VERCEL_CONFIG)


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        # Vercel matches header sources against the requested path, before rewrites
        path = urlsplit(getattr(self, "request_path", self.path)).path
        for pattern, headers in HEADERS:
            if pattern.fullmatch(path):
                for key, value in headers:
                    self.send_header(key, value)
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        # Like Vercel: an unknown URL gets the site's own 404.html (the /api functions keep plain errors)
        page = os.path.join(ROOT, "404.html")
        if code == 404 and not self.path.startswith("/api/") and os.path.isfile(page):
            with open(page, "rb") as f:
                body = f.read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def _prepare_request(self):
        self.request_path = self.path
        parts = urlsplit(self.path)
        path = parts.path
        query = f"?{parts.query}" if parts.query else ""

        if path.startswith("/api/"):
            return ("api", path[len("/api/"):].strip("/"))

        # cleanUrls: /foo.html is /foo for redirects too
        redirect = REDIRECTS.get(path) or REDIRECTS.get(path[:-len(".html")] if path.endswith(".html") else None)
        if redirect:
            self.send_response(redirect[1])
            self.send_header("Location", redirect[0])
            self.send_header("Content-Length", "0")
            self.end_headers()
            return ("done", None)

        if path in REWRITES:
            self.path = REWRITES[path] + query
        elif not os.path.splitext(path)[1] and os.path.isfile(os.path.join(ROOT, path.lstrip("/") + ".html")):
            # cleanUrls: /foo serves foo.html
            self.path = path + ".html" + query
        return ("static", None)

    def do_GET(self):
        kind, arg = self._prepare_request()
        if kind == "api":
            return self.run_api_function(arg)
        if kind == "static":
            return super().do_GET()

    def do_HEAD(self):
        kind, arg = self._prepare_request()
        if kind == "api":
            return self.run_api_function(arg)
        if kind == "static":
            return super().do_HEAD()

    def run_api_function(self, name):
        source = os.path.join(API_DIR, f"{name}.py")
        if not name or name.startswith("_") or "/" in name or not os.path.isfile(source):
            return self.send_error(404, "No such API function")
        # Fresh import per request, so edits to api/*.py apply without a restart
        with API_IMPORT_LOCK:
            sys.modules.pop("_supabase", None)
            spec = importlib.util.spec_from_file_location(f"api_{name}", source)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        # Vercel's handler classes only use the request/response methods this handler already has
        if self.command == "HEAD" and hasattr(module.handler, "do_HEAD"):
            module.handler.do_HEAD(self)
        else:
            module.handler.do_GET(self)


def main():
    load_env_file(os.path.join(ROOT, ".env.local"))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    live = bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_ANON_KEY"))
    print(f"Serving {ROOT} at http://localhost:{port}", flush=True)
    print("API: live Supabase data" if live else "API: no SUPABASE_URL/SUPABASE_ANON_KEY, so pages use the /data snapshots", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), DevHandler).serve_forever()


if __name__ == "__main__":
    main()
