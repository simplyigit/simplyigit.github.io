from http.server import BaseHTTPRequestHandler
import json
import os
import requests
import time
from base64 import b64encode
import concurrent.futures

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        response_data = None
        response_status = 200
        cache_header = 's-maxage=86400, stale-while-revalidate'

        try:
            # 1. Credentials
            client_id = os.environ.get('CLIENT_ID')
            client_secret = os.environ.get('CLIENT_SECRET')
            gist_id = os.environ.get('GIST_ID')
            github_token = os.environ.get('GITHUB_TOKEN')
            lfm_key = os.environ.get('LASTFM_API_KEY')
            lfm_user = os.environ.get('LASTFM_USER')

            if not all([client_id, client_secret, gist_id, github_token, lfm_key, lfm_user]):
                raise ValueError("Missing credentials in environment variables.")

            # 2. Get Spotify Access Token (Gist rotation logic)
            gist_headers = {"Authorization": f"token {github_token}", "Accept": "application/vnd.github.v3+json"}
            gist_url = f"https://api.github.com/gists/{gist_id}"
            gist_resp = requests.get(gist_url, headers=gist_headers)
            if gist_resp.status_code != 200: raise Exception("Failed to read Gist DB")
            
            gist_files = gist_resp.json().get("files", {})
            first_file_key = list(gist_files.keys())[0] if gist_files else None
            refresh_token = gist_files[first_file_key].get("content", "").strip()

            auth_str = f"{client_id}:{client_secret}"
            b64_auth = b64encode(auth_str.encode()).decode()
            token_resp = requests.post('https://accounts.spotify.com/api/token', 
                                     data={'grant_type': 'refresh_token', 'refresh_token': refresh_token},
                                     headers={'Authorization': f'Basic {b64_auth}'})
            
            if token_resp.status_code != 200: raise Exception("Failed to refresh Spotify token")
            token_json = token_resp.json()
            access_token = token_json.get('access_token')
            new_refresh = token_json.get('refresh_token')

            if new_refresh and new_refresh != refresh_token:
                patch_data = {"files": {first_file_key: {"content": new_refresh}}}
                requests.patch(gist_url, headers=gist_headers, json=patch_data)

            # 3. Fetch Top 5 Tracks & Artists from Last.fm
            lfm_base = "https://ws.audioscrobbler.com/2.0/"
            lfm_headers = {"User-Agent": f"simplyigit-api/1.0 ({lfm_user})"}
            lfm_params = {"api_key": lfm_key, "user": lfm_user, "format": "json", "period": "1month", "limit": 5}

            lfm_tracks_res = requests.get(lfm_base, params={**lfm_params, "method": "user.getTopTracks"}, headers=lfm_headers)
            lfm_artists_res = requests.get(lfm_base, params={**lfm_params, "method": "user.getTopArtists"}, headers=lfm_headers)

            raw_lfm_tracks = lfm_tracks_res.json().get("toptracks", {}).get("track", [])
            raw_lfm_artists = lfm_artists_res.json().get("topartists", {}).get("artist", [])

            # 4. Define Safe Search helper for Parallel execution
            def safe_search(item_name, artist_name, search_type):
                query = f"{search_type}:\"{item_name}\""
                if artist_name: query += f" artist:\"{artist_name}\""
                
                s_headers = {"Authorization": f"Bearer {access_token}"}
                s_params = {"q": query, "type": search_type, "limit": 3}
                try:
                    s_res = requests.get("https://api.spotify.com/v1/search", headers=s_headers, params=s_params, timeout=5)
                    s_data = s_res.json()
                    results = s_data.get(f"{search_type}s", {}).get("items", [])
                    
                    target = artist_name.lower() if artist_name else item_name.lower()
                    for res_item in results:
                        res_name = res_item['artists'][0]['name'].lower() if search_type == "track" else res_item['name'].lower()
                        if res_name == target:
                            imgs = res_item.get("images", []) if search_type == "artist" else res_item.get("album", {}).get("images", [])
                            return {
                                "spotify_url": res_item['external_urls']['spotify'],
                                "cover_url": imgs[0]['url'] if imgs else None,
                                "spotify_id": res_item['id']
                            }
                except: pass
                return None

            # 5. Parallel Spotify Search for all 10 items
            final_tracks = []
            final_artists = []
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)
            
            track_futures = {executor.submit(safe_search, t['name'], t['artist']['name'], "track"): t for t in raw_lfm_tracks}
            artist_futures = {executor.submit(safe_search, a['name'], None, "artist"): a for a in raw_lfm_artists}

            for fut, t in track_futures.items():
                s_info = fut.result()
                final_tracks.append({
                    "title": t['name'],
                    "artist": t['artist']['name'],
                    "playcount": t['playcount'],
                    "spotify_url": s_info['spotify_url'] if s_info else None,
                    "cover_url": s_info['cover_url'] if s_info else t.get('image', [{}])[-1].get('#text'),
                    "spotify_id": s_info['spotify_id'] if s_info else None
                })

            for fut, a in artist_futures.items():
                s_info = fut.result()
                final_artists.append({
                    "name": a['name'],
                    "playcount": a['playcount'],
                    "spotify_url": s_info['spotify_url'] if s_info else None,
                    "image_url": s_info['cover_url'] if s_info else a.get('image', [{}])[-1].get('#text'),
                    "spotify_id": s_info['spotify_id'] if s_info else None
                })
            
            executor.shutdown(wait=True)

            response_data = {
                "success": True,
                "data": {
                    "top_tracks_last_month": final_tracks,
                    "top_artists_last_month": final_artists
                },
                "timestamp": time.time()
            }

        except Exception as e:
            response_data = {"success": False, "error": str(e)}
            response_status = 500
            cache_header = 'no-store, no-cache, must-revalidate, max-age=0'

        self.send_response(response_status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Cache-Control', cache_header)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

handler = handler
