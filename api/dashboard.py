from http.server import BaseHTTPRequestHandler
import os
import sys

# Each Vercel function runs on its own; make the shared helper next to it importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _supabase import respond, strip_full_lyrics  # noqa: E402


def build_dashboard(values):
    """Homepage payload: spotify, books and movies from one Supabase query."""
    return {
        "spotify": strip_full_lyrics(values.get("spotify") or {}),
        "books": values.get("books") or [],
        # Raw Letterboxd URLs: the frontend's safeImg() routes them through wsrv.nl, resized and as WebP
        "movies": values.get("movies") or {}
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        respond(self, ["spotify", "books", "movies"], build_dashboard)
