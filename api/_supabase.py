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
# Row written by scripts/sync_data.py: {"last_updated": <epoch seconds>, "sections": {<key>: <epoch seconds>}},
# the last sync and when each section last synced without problems
SYNC_META_KEY = 'sync_meta'


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


def respond(handler, keys, build, required_keys=None):
    """Sends {"success", "data", "timestamp", "synced_at"} for the rows `keys`, shaped by build(values),
    or a generic 503/500 with details in the function log. "synced_at" (when the data was last synced,
    for the site footer) is left out if the sync_meta row isn't there."""
    req_keys = keys if required_keys is None else required_keys
    try:
        values = fetch_values([*keys, SYNC_META_KEY])
        missing = [k for k in req_keys if not values.get(k)]
        if missing:
            print(f"{handler.path} missing required keys: {missing}")
            body = {"success": False, "error": "Data temporarily unavailable"}
            status, cache_header = 503, NO_CACHE_HEADER
        else:
            body = {"success": True, "data": build(values), "timestamp": time.time()}
            # The oldest last clean sync among these sections. Sections that aren't synced any more (books)
            # have no time and are left out; with none of them timed, fall back to the last sync
            meta = values.get(SYNC_META_KEY) or {}
            sections = meta.get("sections") or {}
            times = [sections[k] for k in keys if k in sections]
            synced_at = min(times) if times else meta.get("last_updated")
            if synced_at:
                body["synced_at"] = synced_at
            status, cache_header = 200, CACHE_HEADER
    except Exception as e:
        print(f"{handler.path} failed: {e!r}")
        body = {"success": False, "error": "Data temporarily unavailable"}
        status, cache_header = 500, NO_CACHE_HEADER

    payload = json.dumps(body).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-type', 'application/json')
    handler.send_header('Content-Length', str(len(payload)))
    handler.send_header('Cache-Control', cache_header)
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    if getattr(handler, "command", "GET") != "HEAD":
        handler.wfile.write(payload)
