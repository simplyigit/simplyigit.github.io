from http.server import BaseHTTPRequestHandler
import os
import sys

# Each Vercel function runs on its own; make the shared helper next to it importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _supabase import respond, strip_full_lyrics  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        respond(self, ["spotify"], lambda values: strip_full_lyrics(values.get("spotify") or {}))
