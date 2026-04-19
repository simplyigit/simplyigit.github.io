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
            gist_id = os.environ.get('GIST_ID')
            github_token = os.environ.get('GITHUB_TOKEN')
            
            if not gist_id or not github_token:
                raise ValueError("Missing GIST_ID or GITHUB_TOKEN")

            # Fetch the specific data.json from the Gist
            gist_url = f"https://api.github.com/gists/{gist_id}"
            headers = {"Authorization": f"token {github_token}", "Accept": "application/vnd.github.v3+json"}
            gist_resp = requests.get(gist_url, headers=headers, timeout=5)
            
            if gist_resp.status_code != 200:
                raise Exception(f"Failed to fetch Gist: {gist_resp.status_code}")
                
            gist_data = gist_resp.json()
            db_content = gist_data.get("files", {}).get("data.json", {}).get("content")
            
            if not db_content:
                raise Exception("data.json not found in Gist")
                
            db = json.loads(db_content)
            movies_data = db.get("movies", {})
            
            response = {
                "success": True,
                "data": movies_data,
                "timestamp": db.get("last_updated", time.time())
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
