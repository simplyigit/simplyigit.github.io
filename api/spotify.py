from http.server import BaseHTTPRequestHandler
import json
import os
import requests
import time

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Cache for 1 hour at the edge
        cache_header = 's-maxage=3600, stale-while-revalidate'
        
        try:
            supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
            supabase_key = os.environ.get('SUPABASE_ANON_KEY')
            
            if not supabase_url or not supabase_key:
                raise ValueError("Missing SUPABASE credentials")

            # Fetch from Supabase REST API
            res = requests.get(
                f"{supabase_url}/rest/v1/portfolio_data?key=eq.spotify&select=value",
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
                # Return empty structure instead of failing
                spotify_data = {}
            else:
                spotify_data = rows[0].get("value", {})
            
            response = {
                "success": True,
                "data": spotify_data,
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
