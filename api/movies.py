from http.server import BaseHTTPRequestHandler
import os
import sys

# Each Vercel function runs on its own; make the shared helper next to it importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _supabase import fetch_values, proxy_letterboxd_images, respond  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        respond(self, lambda: proxy_letterboxd_images(fetch_values(["movies"]).get("movies") or {}))
