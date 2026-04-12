from http.server import BaseHTTPRequestHandler
import json
import os
import requests
import time
from base64 import b64encode

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        # Set aggressive caching headers to explicitly prevent page loading latency
        self.send_header('Cache-Control', 's-maxage=86400, stale-while-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            client_id = os.environ.get('CLIENT_ID')
            client_secret = os.environ.get('CLIENT_SECRET')
            
            # Gist DB credentials for Serverless Token Rotation
            gist_id = os.environ.get('GIST_ID')
            github_token = os.environ.get('GITHUB_TOKEN')

            if not all([client_id, client_secret, gist_id, github_token]):
                raise ValueError("Missing Spotify or Gist credentials in environment variables.")

            # 1. READ Refresh Token from Gist (Stateless DB)
            gist_headers = {
                "Authorization": f"token {github_token}",
                "Accept": "application/vnd.github.v3+json"
            }
            gist_url = f"https://api.github.com/gists/{gist_id}"
            gist_response = requests.get(gist_url, headers=gist_headers)
            
            if gist_response.status_code != 200:
                raise Exception(f"Failed to read Gist DB: {gist_response.text}")
                
            gist_data = gist_response.json()
            files = gist_data.get("files", {})
            first_file = list(files.values())[0] if files else None
            
            if not first_file:
                raise Exception("Gist database is empty.")
                
            current_refresh_token = first_file.get("content", "").strip()

            if not current_refresh_token:
                raise Exception("Refresh token in Gist is empty.")

            # 2. Get Access Token
            auth_str = f"{client_id}:{client_secret}"
            b64_auth_str = b64encode(auth_str.encode()).decode()
            token_headers = {
                'Authorization': f'Basic {b64_auth_str}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': current_refresh_token,
                'client_id': client_id
            }
            token_response = requests.post('https://accounts.spotify.com/api/token', data=token_data, headers=token_headers)
            
            if token_response.status_code != 200:
                raise Exception(f"Failed to refresh token: {token_response.text}")
            
            token_json = token_response.json()
            access_token = token_json.get('access_token')
            new_refresh_token = token_json.get('refresh_token')

            # 3. ROTATE Refresh Token in Gist DB (if Spotify issued a new one)
            if new_refresh_token and new_refresh_token != current_refresh_token:
                filename = list(files.keys())[0]
                patch_data = {
                    "files": {
                        filename: {
                            "content": new_refresh_token
                        }
                    }
                }
                # Seamlessly write back to the Gist without touching Vercel's read-only .env!
                patch_res = requests.patch(gist_url, headers=gist_headers, json=patch_data)
                if patch_res.status_code != 200:
                    raise Exception(f"Spotify rotated token but Gist DB failed to update: {patch_res.text}")

            # 4. Fetch Top Tracks (short_term = approx last 4 weeks)
            tracks_url = "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5"
            api_headers = {"Authorization": f"Bearer {access_token}"}
            
            tracks_response = requests.get(tracks_url, headers=api_headers)
            if tracks_response.status_code != 200:
                 raise Exception(f"Failed to fetch top tracks: {tracks_response.text}")
                 
            tracks_data = tracks_response.json()
            
            # 5. Format Top Tracks
            top_tracks = []
            for item in tracks_data.get('items', []):
                top_tracks.append({
                    "title": item.get('name'),
                    "artist": ", ".join([artist.get('name') for artist in item.get('artists', [])]),
                    "spotify_url": item.get('external_urls', {}).get('spotify'),
                    "cover_url": item.get('album', {}).get('images', [{}])[0].get('url') if item.get('album', {}).get('images') else None
                })

            # 6. Fetch Top Artists (short_term = approx last 4 weeks)
            artists_url = "https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5"
            artists_response = requests.get(artists_url, headers=api_headers)
            if artists_response.status_code != 200:
                 raise Exception(f"Failed to fetch top artists: {artists_response.text}")
                 
            artists_data = artists_response.json()
            
            # 7. Format Top Artists
            top_artists = []
            for item in artists_data.get('items', []):
                top_artists.append({
                    "name": item.get('name'),
                    "spotify_url": item.get('external_urls', {}).get('spotify'),
                    "image_url": item.get('images', [{}])[0].get('url') if item.get('images') else None
                })

            response = {
                "success": True,
                "data": {
                    "top_tracks_last_month": top_tracks,
                    "top_artists_last_month": top_artists
                },
                "timestamp": time.time()
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            error_response = {"success": False, "error": str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
        return
