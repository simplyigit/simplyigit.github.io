"""Shared helpers for the /api functions: read portfolio_data rows from Supabase and send cached JSON.

Vercel doesn't expose underscore-prefixed files as functions. Pure stdlib for fast cold starts.
"""
import json
import os
import time
import urllib.request

# Cache for 60s in browser, 10 min fresh at edge CDN, 24h stale-while-revalidate
CACHE_HEADER = 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400'
NO_CACHE_HEADER = 'no-store, no-cache, must-revalidate, max-age=0'


def fetch_values(keys):
    """Returns {key: value} for the requested portfolio_data rows in a single PostgREST query."""
    supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    supabase_key = os.environ.get('SUPABASE_ANON_KEY')
    if not supabase_url or not supabase_key:
        raise ValueError("Missing SUPABASE credentials")

    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/portfolio_data?key=in.({','.join(keys)})&select=key,value",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Accept": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        if res.status != 200:
            raise Exception(f"Supabase Error {res.status}")
        rows = json.loads(res.read().decode('utf-8'))
    return {row.get("key"): row.get("value") for row in rows}


def strip_full_lyrics(spotify):
    """Only the curated ai_lyrics snippets are public; drop full lyrics left by older syncs."""
    if isinstance(spotify, dict):
        for track in spotify.get("top_tracks_last_month") or []:
            if isinstance(track, dict):
                track.pop("lyrics", None)
    return spotify


def respond(handler, load):
    """Sends {"success", "data", "timestamp"} from load(), or a generic 500 with details in the function log."""
    try:
        body = {"success": True, "data": load(), "timestamp": time.time()}
        status, cache_header = 200, CACHE_HEADER
    except Exception as e:
        print(f"{handler.path} failed: {e!r}")
        body = {"success": False, "error": "Data temporarily unavailable"}
        status, cache_header = 500, NO_CACHE_HEADER

    handler.send_response(status)
    handler.send_header('Content-type', 'application/json')
    handler.send_header('Cache-Control', cache_header)
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode('utf-8'))
