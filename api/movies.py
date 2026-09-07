from http.server import BaseHTTPRequestHandler
import json
import os
import requests
import time

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Cache for 5 min in browser, 1 hour at edge CDN, 24h stale-while-revalidate
        cache_header = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
        
        try:
            supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
            supabase_key = os.environ.get('SUPABASE_ANON_KEY')
            
            if not supabase_url or not supabase_key:
                raise ValueError("Missing SUPABASE credentials")

            # Fetch from Supabase REST API
            res = requests.get(
                f"{supabase_url}/rest/v1/portfolio_data?key=eq.movies&select=value",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}"
                },
                timeout=5
            )
            
            if res.status_code != 200:
                raise Exception(f"Supabase Error {res.status_code}: {res.text}")
                
            rows = res.json()
            if not rows:
                movies_data = {}
            else:
                movies_data = rows[0].get("value", {})
            
            # Proxy Letterboxd CDN images to avoid ISP/DNS blocks (e.g. in Turkey)
            def proxy_img(u):
                if u and isinstance(u, str) and "a.ltrbxd.com" in u and "wsrv.nl" not in u:
                    return f"https://wsrv.nl/?url={u}"
                return u

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
                "data": movies_data,
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
