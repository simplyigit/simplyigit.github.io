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
        self.send_header('Cache-Control', 's-maxage=86400, stale-while-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            client_id = os.environ.get('CLIENT_ID')
            client_secret = os.environ.get('CLIENT_SECRET')
            refresh_token = os.environ.get('REFRESH_TOKEN')

            if not all([client_id, client_secret, refresh_token]):
                raise ValueError("Missing Spotify credentials in environment variables.")

            # 1. Get Access Token
            auth_str = f"{client_id}:{client_secret}"
            b64_auth_str = b64encode(auth_str.encode()).decode()
            token_headers = {
                'Authorization': f'Basic {b64_auth_str}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': client_id
            }
            token_response = requests.post('https://accounts.spotify.com/api/token', data=token_data, headers=token_headers)
            
            if token_response.status_code != 200:
                raise Exception(f"Failed to refresh token: {token_response.text}")
            
            access_token = token_response.json().get('access_token')

            # 2. Fetch Top Tracks (short_term = approx last 4 weeks)
            tracks_url = "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5"
            api_headers = {"Authorization": f"Bearer {access_token}"}
            
            tracks_response = requests.get(tracks_url, headers=api_headers)
            if tracks_response.status_code != 200:
                 raise Exception(f"Failed to fetch top tracks: {tracks_response.text}")
                 
            tracks_data = tracks_response.json()
            
            # 3. Format Top Tracks
            top_tracks = []
            for item in tracks_data.get('items', []):
                top_tracks.append({
                    "title": item.get('name'),
                    "artist": ", ".join([artist.get('name') for artist in item.get('artists', [])]),
                    "spotify_url": item.get('external_urls', {}).get('spotify'),
                    "cover_url": item.get('album', {}).get('images', [{}])[0].get('url') if item.get('album', {}).get('images') else None
                })

            # 4. Fetch Top Artists (short_term = approx last 4 weeks)
            artists_url = "https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5"
            artists_response = requests.get(artists_url, headers=api_headers)
            if artists_response.status_code != 200:
                 raise Exception(f"Failed to fetch top artists: {artists_response.text}")
                 
            artists_data = artists_response.json()
            
            # 5. Format Top Artists
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
