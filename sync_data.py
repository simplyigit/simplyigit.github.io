import os
import json
import time
import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET
import re
import concurrent.futures
from base64 import b64encode
from google import genai
from google.genai import types
import markdown

# --- HELPERS: SPOTIFY ---

def get_lyrics(song_title, artist_name):
    """Fetches lyrics via Lyrica API for high reliability."""
    base_url = "https://test-0k.onrender.com/lyrics/"
    params = {"artist": artist_name, "song": song_title}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    try:
        print(f"Fetching Lyrica for: {song_title} - {artist_name}...")
        res = requests.get(base_url, params=params, headers=headers, timeout=15)
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success":
                lyrics = data["data"].get("lyrics")
                if lyrics:
                    # Basic cleanup of any remaining HTML artifacts or repeated newlines
                    lyrics = re.sub(r'<[^>]*>', '', lyrics) 
                    clean_lyrics = re.sub(r'(\n){3,}', '\n\n', lyrics).strip()
                    print(f"Retrieved {len(clean_lyrics)} chars of lyrics.")
                    return clean_lyrics
    except Exception as e:
        print(f"Lyrica Error: {e}")
    return None

def generate_lyric_snippets(title, artist, lyrics):
    """Curates 3 hard-hitting snippets from the provided lyrics using Gemini."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or not lyrics: 
        print("Missing API key or lyrics for curation.")
        return None
    try:
        client = genai.Client(api_key=api_key)
        prompt = (
            f"Based EXCLUSIVELY on the lyrics below for '{title}' by {artist}, "
            "select the 3 most impactful, 'hard-hitting' short snippets (1-2 lines each).\n"
            "Return a JSON object with keys 'lyric1', 'lyric2', 'lyric3'.\n"
            "Do NOT invent lyrics. Use the exact text provided.\n\n"
            f"Lyrics:\n{lyrics}"
        )
        
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview", 
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        print(f"Gemini Curation Response: {response.text}")
        return json.loads(response.text)
    except Exception as e:
        print(f"Curation Error: {e}")
        return None

def fetch_spotify_data():
    client_id = os.environ.get('CLIENT_ID')
    client_secret = os.environ.get('CLIENT_SECRET')
    gist_id = os.environ.get('GIST_ID')
    github_token = os.environ.get('GITHUB_TOKEN')
    lfm_key = os.environ.get('LASTFM_API_KEY')
    lfm_user = os.environ.get('LASTFM_USER')

    if not all([client_id, client_secret, gist_id, github_token, lfm_key, lfm_user]):
        return {"success": False, "error": "Missing Spotify credentials"}

    gist_headers = {"Authorization": f"token {github_token}", "Accept": "application/vnd.github.v3+json"}
    gist_url = f"https://api.github.com/gists/{gist_id}"
    print(f"Reading Gist: {gist_url}")
    gist_resp = requests.get(gist_url, headers=gist_headers)
    if gist_resp.status_code != 200: 
        print(f"Gist Read Failed: {gist_resp.status_code}")
        return {"success": False, "error": f"Failed to read Gist: {gist_resp.status_code}"}
    
    gist_files = gist_resp.json().get("files", {})
    print(f"Files found in Gist: {list(gist_files.keys())}")
    
    token_file_key = next((k for k in gist_files.keys() if k != "data.json"), None)
    
    if not token_file_key:
        print("Error: No token file found in Gist (other than data.json).")
        return {"success": False, "error": "No token file found in Gist"}
    
    print(f"Attempting refresh with file: {token_file_key}")
    refresh_token = gist_files[token_file_key].get("content", "").strip()
    print(f"Refresh token starts with: {refresh_token[:5]}...")

    auth_str = f"{client_id}:{client_secret}"
    b64_auth = b64encode(auth_str.encode()).decode()
    
    print("Requesting new access token from Spotify...")
    token_resp = requests.post('https://accounts.spotify.com/api/token', 
                             data={'grant_type': 'refresh_token', 'refresh_token': refresh_token},
                             headers={'Authorization': f'Basic {b64_auth}'},
                             timeout=10)
    
    if token_resp.status_code != 200:
        print(f"Spotify API Error: {token_resp.status_code}")
        print(f"Spotify Response: {token_resp.text}")
        return {"success": False, "error": f"Spotify refresh failed: {token_resp.status_code}"}
    
    print("Spotify token refreshed successfully!")
    token_json = token_resp.json()
    access_token = token_json.get('access_token')
    new_refresh = token_json.get('refresh_token')

    if new_refresh and new_refresh != refresh_token:
        patch_data = {"files": {token_file_key: {"content": new_refresh}}}
        requests.patch(gist_url, headers=gist_headers, json=patch_data)

    lfm_base = "https://ws.audioscrobbler.com/2.0/"
    lfm_headers = {"User-Agent": f"simplyigit-api/1.0 ({lfm_user})"}
    lfm_params = {"api_key": lfm_key, "user": lfm_user, "format": "json", "period": "1month", "limit": 5}

    lfm_tracks_res = requests.get(lfm_base, params={**lfm_params, "method": "user.getTopTracks"}, headers=lfm_headers)
    lfm_artists_res = requests.get(lfm_base, params={**lfm_params, "method": "user.getTopArtists"}, headers=lfm_headers)

    raw_lfm_tracks = lfm_tracks_res.json().get("toptracks", {}).get("track", [])
    raw_lfm_artists = lfm_artists_res.json().get("topartists", {}).get("artist", [])

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

    final_tracks = []
    final_artists = []
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=11)
    track_futures = {executor.submit(safe_search, t['name'], t['artist']['name'], "track"): t for t in raw_lfm_tracks}
    artist_futures = {executor.submit(safe_search, a['name'], None, "artist"): a for a in raw_lfm_artists}
    
    # Start lyric fetching for #1 track early via Lyrica
    lyric_future = None
    if raw_lfm_tracks:
        top_t = raw_lfm_tracks[0]
        lyric_future = executor.submit(get_lyrics, top_t['name'], top_t['artist']['name'])

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
    
    # 6. Process AI Lyrics
    if final_tracks:
        print("Processing AI Lyrics for #1 track...")
        top_track = final_tracks[0]
        lyrics_text = None
        
        if lyric_future:
            try:
                lyrics_text = lyric_future.result(timeout=15)
            except Exception as e:
                print(f"Lyric fetching timed out/failed: {str(e)}")

        if lyrics_text:
            top_track['ai_lyrics'] = generate_lyric_snippets(top_track['title'], top_track['artist'], lyrics_text)
            if top_track.get('ai_lyrics'):
                print("AI Lyrics curated successfully!")
        else:
            print("Skipping curation: No real lyrics retrieved.")

    executor.shutdown(wait=True)
    return {"top_tracks_last_month": final_tracks, "top_artists_last_month": final_artists}

# --- HELPERS: MOVIES ---

def get_hd_poster(film_link):
    if not film_link: return ""
    base_url = "https://letterboxd.com"
    headers = {'User-Agent': 'Mozilla/5.0: simplyigit sync'}
    try:
        res = requests.get(base_url + film_link, headers=headers, timeout=5)
        if res.status_code == 200:
            m = re.search(r'"image":"(https://a\.ltrbxd\.com[^"]+)"', res.text)
            if m: return m.group(1)
    except: pass
    return ""

def fetch_movies_data():
    headers = {'User-Agent': 'Mozilla/5.0: simplyigit sync'}
    username = "oneyigit"
    base_url = "https://letterboxd.com"
    
    # Recent Activity
    recent_activity = []
    rss_resp = requests.get(f"{base_url}/{username}/rss/", headers=headers, timeout=10)
    if rss_resp.status_code == 200:
        root = ET.fromstring(rss_resp.content)
        for item in root.findall('./channel/item')[:7]:
            title_text = item.find('title').text if item.find('title') is not None else ""
            link_text = item.find('link').text if item.find('link') is not None else ""
            desc_html = item.find('description').text if item.find('description') is not None else ""
            cover_url = ""
            rating = ""
            is_rewatch = False
            is_favorite = False
            if desc_html:
                desc_soup = BeautifulSoup(desc_html, 'html.parser')
                img = desc_soup.find('img')
                if img: cover_url = img.get('src')
                text_content = desc_soup.get_text()
                rating_match = re.search(r' - (★+½?|½)$', title_text)
                if rating_match: rating = rating_match.group(1)
                if "This review may contain spoilers" in text_content or "Watched on" in text_content:
                    if "rewatch" in title_text.lower() or " (rewatch)" in title_text.lower(): is_rewatch = True
                if "♥" in title_text or "♥" in desc_html: is_favorite = True
            display_title = re.sub(r' - ★+½?|½$', '', title_text).replace(' (rewatch)', '').replace(' ♥', '')
            recent_activity.append({"title": display_title, "rating": rating, "is_rewatch": is_rewatch, "is_favorite": is_favorite, "link": link_text, "cover_url": cover_url})

    # Favorites & Watchlist (Parallel posters)
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)
    
    favorite_films = []
    prof_resp = requests.get(f"{base_url}/{username}/", headers=headers, timeout=10)
    if prof_resp.status_code == 200:
        prof_soup = BeautifulSoup(prof_resp.text, 'html.parser')
        fav_section = prof_soup.find(id='favourites')
        if fav_section:
            fav_items = []
            for div in fav_section.find_all('div', class_='react-component'):
                fav_title = re.sub(r'\s\(\d{4}\)$', '', div.get('data-item-full-display-name', ''))
                film_link = div.get('data-item-link', '')
                target_link = div.get('data-target-link', film_link)
                fav_items.append((fav_title, film_link, target_link))
            poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in fav_items}
            concurrent.futures.wait(poster_futures)
            for itm in fav_items:
                for fut, f_itm in poster_futures.items():
                    if f_itm == itm:
                        favorite_films.append({"title": itm[0], "link": base_url + itm[2] if itm[2] else "", "cover_url": fut.result()})
                        break

    watchlist_films = []
    watch_resp = requests.get(f"{base_url}/{username}/watchlist/", headers=headers, timeout=10)
    if watch_resp.status_code == 200:
        watch_soup = BeautifulSoup(watch_resp.text, 'html.parser')
        watch_items = []
        for div in watch_soup.find_all('div', attrs={'data-component-class': 'LazyPoster'})[:7]:
            watch_title = div.get('data-item-full-display-name', '')
            target_link = div.get('data-film-link', div.get('data-target-link', ''))
            watch_items.append((watch_title, target_link))
        poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in watch_items}
        concurrent.futures.wait(poster_futures)
        for itm in watch_items:
            for fut, w_itm in poster_futures.items():
                if w_itm == itm:
                    watchlist_films.append({"title": itm[0], "link": base_url + itm[1] if itm[1] else "", "cover_url": fut.result()})
                    break

    executor.shutdown(wait=False)
    return {"recent_activity": recent_activity, "favorite_films": favorite_films, "watchlist": watchlist_films}

# --- HELPERS: BOOKS ---

def fetch_books_data():
    url = 'https://www.goodreads.com/review/list_rss/199124060?shelf=to-read'
    headers = {'User-Agent': 'Mozilla/5.0: simplyigit sync'}
    try:
        rss_response = requests.get(url, headers=headers, timeout=10)
        root = ET.fromstring(rss_response.content)
        items = root.findall('./channel/item')
        books_data = []
        for item in items:
            title = item.find('title').text if item.find('title') is not None else "Unknown Title"
            author = item.find('author_name').text if item.find('author_name') is not None else "Unknown Author"
            cover_url = item.find('book_image_url').text if item.find('book_image_url') is not None else ""
            if cover_url: cover_url = re.sub(r'\._[A-Za-z0-9]+_\.', '.', cover_url)
            books_data.append({"title": title, "author": author, "cover_url": cover_url, "link": item.find('link').text if item.find('link') is not None else "#"})
        return books_data
    except: return []

# --- HELPERS: PROJECTS ---

def fetch_projects_data():
    """Fetches and pre-renders READMEs for featured projects."""
    project_repos = [
        "simplyigit/Real-Deepfake-or-AI"
    ]
    projects_html = {}
    headers = {'User-Agent': 'Mozilla/5.0: simplyigit sync'}
    
    for repo in project_repos:
        print(f"Fetching README for {repo}...")
        # Try main branch, then master
        for branch in ["main", "master"]:
            url = f"https://raw.githubusercontent.com/{repo}/{branch}/README.md"
            try:
                res = requests.get(url, headers=headers, timeout=10)
                if res.status_code == 200:
                    # Convert Markdown to HTML with more robust extensions
                    html = markdown.markdown(res.text, extensions=[
                        'fenced_code', 
                        'tables',
                        'extra',
                        'nl2br',
                        'sane_lists'
                    ])
                    projects_html[repo] = html
                    print(f"Successfully rendered {repo} from {branch}")
                    break
            except: continue
            
    return projects_html

# --- MAIN SYNC ---

def main():
    print("Starting sync...")
    data = {
        "spotify": fetch_spotify_data(),
        "movies": fetch_movies_data(),
        "books": fetch_books_data(),
        "projects": fetch_projects_data(),
        "last_updated": time.time()
    }
    
    github_token = os.environ.get('GITHUB_TOKEN')
    gist_id = os.environ.get('GIST_ID')
    
    if not github_token or not gist_id:
        print("Missing GITHUB_TOKEN or GIST_ID. Outputting to console.")
        print(json.dumps(data, indent=2))
        return

    gist_url = f"https://api.github.com/gists/{gist_id}"
    headers = {"Authorization": f"token {github_token}", "Accept": "application/vnd.github.v3+json"}
    
    payload = {
        "files": {
            "data.json": {
                "content": json.dumps(data)
            }
        }
    }
    
    res = requests.patch(gist_url, headers=headers, json=payload)
    if res.status_code == 200:
        print("Gist updated successfully!")
    else:
        print(f"Failed to update Gist: {res.status_code}")
        print(res.text)

if __name__ == "__main__":
    main()
