from http.server import BaseHTTPRequestHandler
import json
import os
import time
import urllib.request


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Cache for 60s in browser, 10 min fresh at edge CDN, 24h stale-while-revalidate
        cache_header = 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400'

        try:
            supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
            supabase_key = os.environ.get('SUPABASE_ANON_KEY')

            if not supabase_url or not supabase_key:
                raise ValueError("Missing SUPABASE credentials")

            # Fetch spotify, books, and movies in a single PostgREST query using stdlib urllib (zero cold-start import overhead)
            req = urllib.request.Request(
                f"{supabase_url}/rest/v1/portfolio_data?key=in.(spotify,books,movies)&select=key,value",
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
            payload = {
                "spotify": {},
                "books": [],
                "movies": {}
            }
            for row in rows:
                k = row.get("key")
                if k in payload:
                    payload[k] = row.get("value", payload[k])

            # Sanitize artist image URLs: replace Last.fm placeholder star with known Spotify images
            KNOWN_ARTISTS = {
                "ruel": {
                    "spotify_id": "5xkAtLTf309LAGZTbvULBn",
                    "spotify_url": "https://open.spotify.com/artist/5xkAtLTf309LAGZTbvULBn",
                    "image_url": "https://i.scdn.co/image/ab6761610000e5eb9184ca89cc9c4ecd7487bb5f"
                }
            }
            spotify_data = payload.get("spotify")
            if isinstance(spotify_data, dict):
                artists = spotify_data.get("top_artists_last_month", [])
                if isinstance(artists, list):
                    for a in artists:
                        if isinstance(a, dict):
                            key = a.get("name", "").lower().strip()
                            img = a.get("image_url") or ""
                            is_placeholder = "2a96cbd8b46e442fc41c2b86b821562f" in img or not img
                            if key in KNOWN_ARTISTS:
                                known = KNOWN_ARTISTS[key]
                                if is_placeholder:
                                    a["image_url"] = known["image_url"]
                                if not a.get("spotify_url"):
                                    a["spotify_url"] = known["spotify_url"]
                                if not a.get("spotify_id"):
                                    a["spotify_id"] = known["spotify_id"]
                            elif is_placeholder:
                                a["image_url"] = ""

            # Proxy Letterboxd CDN images to avoid ISP/DNS blocks
            def proxy_img(u):
                if u and isinstance(u, str) and "a.ltrbxd.com" in u and "wsrv.nl" not in u:
                    return f"https://wsrv.nl/?url={u}"
                return u

            movies_data = payload.get("movies")
            if isinstance(movies_data, dict):
                for cat in ["favorite_films", "recent_activity", "watchlist"]:
                    items = movies_data.get(cat, [])
                    if isinstance(items, list):
                        for item in items:
                            if isinstance(item, dict):
                                if "cover_url" in item:
                                    item["cover_url"] = proxy_img(item["cover_url"])
                                if "backdrop_url" in item:
                                    item["backdrop_url"] = proxy_img(item["backdrop_url"])

            response = {
                "success": True,
                "data": payload,
                "timestamp": time.time()
            }

        except Exception as e:
            response = {"success": False, "error": str(e)}
            cache_header = 'no-store, no-cache, must-revalidate, max-age=0'

        self.send_response(200 if response.get("success") else 500)
        self.send_header('Content-type', 'application/json')
        self.send_header('Cache-Control', cache_header)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode('utf-8'))
