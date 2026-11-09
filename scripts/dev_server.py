"""Local preview server that behaves like Vercel for this site: clean URLs, the rewrites in
vercel.json, and the Python /api functions.

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


def load_rewrites():
    """Exact-path rewrites from vercel.json (the /api catch-all is handled separately)."""
    with open(os.path.join(ROOT, "vercel.json")) as f:
        config = json.load(f)
    return {r["source"]: r["destination"] for r in config.get("rewrites", []) if "(" not in r["source"]}


REWRITES = load_rewrites()


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parts = urlsplit(self.path)
        path = parts.path
        query = f"?{parts.query}" if parts.query else ""

        if path.startswith("/api/"):
            return self.run_api_function(path[len("/api/"):].strip("/"))

        if path in REWRITES:
            self.path = REWRITES[path] + query
        elif not os.path.splitext(path)[1] and os.path.isfile(os.path.join(ROOT, path.lstrip("/") + ".html")):
            # cleanUrls: /foo serves foo.html
            self.path = path + ".html" + query
        return super().do_GET()

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
