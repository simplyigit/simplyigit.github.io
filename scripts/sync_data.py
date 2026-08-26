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
from colorthief import ColorThief
import io
import urllib.request
import html


# --- HELPERS: SPOTIFY ---

def get_prominent_color(image_url):
    """Fetches image and extracts the dominant color using ColorThief with luminance boosting."""
    if not image_url: return [29, 185, 84] # Spotify Green fallback
    try:
        res = requests.get(image_url, timeout=5)
        if res.status_code == 200:
            img_file = io.BytesIO(res.content)
            color_thief = ColorThief(img_file)
            dominant_color = list(color_thief.get_color(quality=7))
            
            # Boost luminance if the color is too dark for the UI
            # Relative luminance formula: 0.299R + 0.587G + 0.114B
            r, g, b = dominant_color
            luminance = (0.299 * r + 0.587 * g + 0.114 * b)
            
            # Target a minimum luminance of ~80 for visibility on dark backgrounds
            if luminance < 80:
                factor = 80 / (luminance + 1) # Avoid div by zero
                # Scale up while capping at 255
                dominant_color = [
                    min(255, int(r * factor)),
                    min(255, int(g * factor)),
                    min(255, int(b * factor))
                ]
                print(f"Boosted dark color {r,g,b} (lum {luminance:.1f}) -> {dominant_color}")
                
            return dominant_color
    except Exception as e:
        print(f"Color extraction error: {e}")
    return [29, 185, 84]

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
            "select the 3 most impactful, 'hard-hitting' lines.\n"
            "Return a JSON object with keys 'lyric1', 'lyric2', 'lyric3'.\n"
            "Do NOT invent lyrics. Use the exact text provided.\n\n"
            f"Lyrics:\n{lyrics}"
        )

        fallback_models = [
            "gemini-3.1-flash-lite-preview",
            "gemini-3.0-flash-preview",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite"
        ]

        response = None
        for model_name in fallback_models:
            try:
                print(f"Attempting to generate lyrics with {model_name}...")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                print(f"Successfully generated lyrics with {model_name}.")
                break # Exit loop if successful
            except Exception as e:
                print(f"Failed with {model_name}: {str(e)}")
                continue # Try the next model

        if not response:
            print("All fallback models failed due to high demand or errors.")
            return None

        print(f"Gemini Curation Response: {response.text}")
        data = json.loads(response.text)        
        # Regex filter to clean snippets
        def clean_lyric(text):
            if not text: return text
            # Remove [Chorus], (Verse 1), etc.
            text = re.sub(r'[\[\(].*?[\]\)]', '', text)
            # Replace slashes or multiple dashes with a comma
            text = re.sub(r'\s*/\s*|\s*-{2,}\s*', ', ', text)
            # Remove leading/trailing quotes and extra whitespace
            text = text.strip().strip('"').strip("'")
            return text

        for key in ['lyric1', 'lyric2', 'lyric3']:
            if key in data:
                data[key] = clean_lyric(data[key])
        
        return data
    except Exception as e:
        print(f"Curation Error: {e}")
        return None

def fetch_spotify_data(url, key):
    client_id = os.environ.get('CLIENT_ID')
    client_secret = os.environ.get('CLIENT_SECRET')
    lfm_key = os.environ.get('LASTFM_API_KEY')
    lfm_user = os.environ.get('LASTFM_USER')

    if not all([client_id, client_secret, lfm_key, lfm_user]):
        return {"success": False, "error": "Missing Spotify credentials"}

    # 1. Get refresh token from Supabase using requests
    refresh_token = None
    try:
        res = requests.get(
            f"{url}/rest/v1/portfolio_data?key=eq.spotify_refresh_token&select=value",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}"
            },
            timeout=10
        )
        if res.status_code == 200 and res.json():
            refresh_token = res.json()[0]['value'].get('refresh_token')
            print("Retrieved refresh token from Supabase.")
    except Exception as e:
        print(f"Supabase token read error: {e}")
    
    if not refresh_token:
        print("Error: No Spotify refresh token found in Supabase.")
        return {"success": False, "error": "No refresh token found"}

    auth_str = f"{client_id}:{client_secret}"
    b64_auth = b64encode(auth_str.encode()).decode()
    
    print("Requesting new access token from Spotify...")
    token_resp = requests.post('https://accounts.spotify.com/api/token', 
                             data={'grant_type': 'refresh_token', 'refresh_token': refresh_token},
                             headers={'Authorization': f'Basic {b64_auth}'},
                             timeout=10)
    
    if token_resp.status_code != 200:
        print(f"Spotify API Error: {token_resp.status_code}")
        return {"success": False, "error": f"Spotify refresh failed: {token_resp.status_code}"}
    
    token_json = token_resp.json()
    access_token = token_json.get('access_token')
    new_refresh = token_json.get('refresh_token')

    # 2. If Spotify provided a NEW refresh token, save it to Supabase using requests
    if new_refresh and new_refresh != refresh_token:
        try:
            requests.post(
                f"{url}/rest/v1/portfolio_data?on_conflict=key",
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                json={
                    "key": "spotify_refresh_token",
                    "value": {"refresh_token": new_refresh}
                },
                timeout=10
            )
            print("Successfully rotated and saved new refresh token to Supabase.")
        except Exception as e:
            print(f"Failed to save rotated token: {e}")

    lfm_base = "https://ws.audioscrobbler.com/2.0/"
    lfm_headers = {"User-Agent": f"simplyigit-api/1.0 ({lfm_user})"}
    lfm_params = {"api_key": lfm_key, "user": lfm_user, "format": "json", "period": "1month", "limit": 5}

    lfm_tracks_res = requests.get(lfm_base, params={**lfm_params, "method": "user.getTopTracks"}, headers=lfm_headers)
    lfm_artists_res = requests.get(lfm_base, params={**lfm_params, "method": "user.getTopArtists"}, headers=lfm_headers)

    raw_lfm_tracks = lfm_tracks_res.json().get("toptracks", {}).get("track", [])
    raw_lfm_artists = lfm_artists_res.json().get("topartists", {}).get("artist", [])

    # Check existing DB for the top track's lyrics to avoid unnecessary API calls
    existing_lyrics = None
    existing_top_track_name = None
    try:
        res = requests.get(
            f"{url}/rest/v1/portfolio_data?key=eq.spotify&select=value",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=10
        )
        if res.status_code == 200 and res.json():
            existing_spotify = res.json()[0].get("value", {})
            existing_tracks = existing_spotify.get("top_tracks_last_month", [])
            if existing_tracks:
                existing_top_track_name = existing_tracks[0].get("title")
                existing_lyrics = existing_tracks[0].get("lyrics")
    except Exception as e:
        print(f"Failed to check existing lyrics in DB: {e}")

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
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=15)
    track_futures = {executor.submit(safe_search, t['name'], t['artist']['name'], "track"): t for t in raw_lfm_tracks}
    artist_futures = {executor.submit(safe_search, a['name'], None, "artist"): a for a in raw_lfm_artists}
    
    # Start lyric fetching for #1 track early via Lyrica (only if it changed or missing)
    lyric_future = None
    if raw_lfm_tracks:
        top_t = raw_lfm_tracks[0]
        if existing_top_track_name == top_t['name'] and existing_lyrics:
            print(f"Top track '{top_t['name']}' hasn't changed. Using cached lyrics.")
        else:
            lyric_future = executor.submit(get_lyrics, top_t['name'], top_t['artist']['name'])

    # Pre-fetch colors in parallel after we get the URLs
    color_futures = {}

    for fut, t in track_futures.items():
        s_info = fut.result()
        cover_url = s_info['cover_url'] if s_info else t.get('image', [{}])[-1].get('#text')
        final_tracks.append({
            "title": t['name'],
            "artist": t['artist']['name'],
            "playcount": t['playcount'],
            "spotify_url": s_info['spotify_url'] if s_info else None,
            "cover_url": cover_url,
            "spotify_id": s_info['spotify_id'] if s_info else None
        })
        if cover_url:
            color_futures[cover_url] = executor.submit(get_prominent_color, cover_url)

    for fut, a in artist_futures.items():
        s_info = fut.result()
        image_url = s_info['cover_url'] if s_info else a.get('image', [{}])[-1].get('#text')
        final_artists.append({
            "name": a['name'],
            "playcount": a['playcount'],
            "spotify_url": s_info['spotify_url'] if s_info else None,
            "image_url": image_url,
            "spotify_id": s_info['spotify_id'] if s_info else None
        })
    
    # Assign colors back to tracks
    for track in final_tracks:
        if track['cover_url'] in color_futures:
            track['prominent_color'] = color_futures[track['cover_url']].result()
    
    # 6. Process AI Lyrics
    if final_tracks:
        print("Processing AI Lyrics for #1 track...")
        top_track = final_tracks[0]
        lyrics_text = existing_lyrics if (existing_top_track_name == top_track['title'] and existing_lyrics) else None
        
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

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
}

def fetch_letterboxd_html(url, timeout=10):
    """Fetches Letterboxd HTML using urllib to bypass Cloudflare anti-bot challenges."""
    req = urllib.request.Request(url, headers=BROWSER_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode('utf-8', errors='replace')

def get_hd_poster(film_link):
    if not film_link: return ""
    base_url = "https://letterboxd.com"
    try:
        content = fetch_letterboxd_html(base_url + film_link, timeout=8)
        m = re.search(r'"image":"(https://a\.ltrbxd\.com[^"]+)"', content)
        if not m:
            m = re.search(r'<meta property="og:image" content="([^"]+)"', content)
        if m: return m.group(1)
    except Exception as e:
        print(f"Poster fetch error for {film_link}: {e}")
    return ""

def get_both_images(film_link):
    if not film_link: return ("", "")
    base_url = "https://letterboxd.com"
    backdrop, poster = "", ""
    try:
        content = fetch_letterboxd_html(base_url + film_link, timeout=8)
        m_back = re.search(r'data-backdrop="([^"]+)"', content)
        if not m_back:
            m_back = re.search(r'data-backdrop2x="([^"]+)"', content)
        if m_back: backdrop = m_back.group(1)
        
        m_post = re.search(r'"image":"(https://a\.ltrbxd\.com[^"]+)"', content)
        if not m_post:
            m_post = re.search(r'<meta property="og:image" content="([^"]+)"', content)
        if not m_post:
            m_post = re.search(r'<meta name="twitter:image" content="([^"]+)"', content)
        if m_post: poster = m_post.group(1)
    except Exception as e:
        print(f"Backdrop/poster fetch error for {film_link}: {e}")
        
    if not backdrop: backdrop = poster
    if not poster: poster = backdrop
    return backdrop, poster

def fetch_movies_data(url=None, key=None):
    username = "oneyigit"
    base_url = "https://letterboxd.com"
    
    # Retrieve existing movies from Supabase as fallback to prevent wiping data on temporary network glitches
    existing_movies = {}
    if url and key:
        try:
            res = requests.get(
                f"{url}/rest/v1/portfolio_data?key=eq.movies&select=value",
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
                timeout=10
            )
            if res.status_code == 200 and res.json():
                existing_movies = res.json()[0].get("value", {})
        except Exception as e:
            print(f"Failed to check existing movies in DB: {e}")

    # 1. Recent Activity (from Letterboxd RSS)
    recent_activity = []
    try:
        rss_content = fetch_letterboxd_html(f"{base_url}/{username}/rss/", timeout=10)
        root = ET.fromstring(rss_content)
        for item in root.findall('./channel/item')[:7]:
            title_text = item.find('title').text if item.find('title') is not None else ""
            link_text = item.find('link').text if item.find('link') is not None else ""
            desc_html = item.find('description').text if item.find('description') is not None else ""
            cover_url = ""
            rating = ""
            is_rewatch = False
            is_favorite = False
            if desc_html:
                img_m = re.search(r'<img[^>]+src="([^">]+)"', desc_html)
                if img_m: cover_url = img_m.group(1)
                rating_match = re.search(r' - (★+½?|½)$', title_text)
                if rating_match: rating = rating_match.group(1)
                if "rewatch" in title_text.lower() or " (rewatch)" in title_text.lower() or "rewatch" in desc_html.lower():
                    is_rewatch = True
                if "♥" in title_text or "♥" in desc_html:
                    is_favorite = True
            display_title = re.sub(r' - ★+½?|½$', '', title_text).replace(' (rewatch)', '').replace(' ♥', '')
            display_title = re.sub(r'(, \d{4}|\(\d{4}\))$', '', display_title).strip() # Strip year like ", 2024" or "(2024)"
            display_title = html.unescape(display_title)
            recent_activity.append({"title": display_title, "rating": rating, "is_rewatch": is_rewatch, "is_favorite": is_favorite, "link": link_text, "cover_url": cover_url})
    except Exception as e:
        print(f"Error fetching recent activity: {e}")

    if not recent_activity and existing_movies.get("recent_activity"):
        print("Using cached recent_activity from Supabase.")
        recent_activity = existing_movies["recent_activity"]

    # 2. Favorites & Watchlist (Parallel posters)
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)
    
    favorite_films = []
    try:
        prof_html = fetch_letterboxd_html(f"{base_url}/{username}/", timeout=10)
        fav_idx = prof_html.find('id="favourites"')
        if fav_idx == -1:
            fav_idx = prof_html.find('favourites')
            
        if fav_idx != -1:
            fav_section_html = prof_html[fav_idx:prof_html.find('</section>', fav_idx)]
            fav_items = []
            for m in re.finditer(r'<div\s+class="react-component"[^>]+>', fav_section_html):
                tag = m.group(0)
                name_m = re.search(r'data-item-full-display-name="([^"]+)"', tag)
                link_m = re.search(r'data-item-link="([^"]+)"', tag)
                target_m = re.search(r'data-target-link="([^"]+)"', tag)
                
                fav_title = re.sub(r'\s\(\d{4}\)$', '', name_m.group(1)) if name_m else ""
                fav_title = html.unescape(fav_title)
                film_link = link_m.group(1) if link_m else ""
                target_link = target_m.group(1) if target_m else film_link
                if fav_title:
                    fav_items.append((fav_title, film_link, target_link))
                    
            poster_futures = {executor.submit(get_both_images, item[1]): item for item in fav_items}
            concurrent.futures.wait(poster_futures)
            for itm in fav_items:
                for fut, f_itm in poster_futures.items():
                    if f_itm == itm:
                        backdrop, poster = fut.result()
                        favorite_films.append({"title": itm[0], "link": base_url + itm[2] if itm[2] else "", "cover_url": poster, "backdrop_url": backdrop})
                        break
        else:
            print("Could not find 'favourites' section in Letterboxd profile.")
    except Exception as e:
        print(f"Error fetching favorite films: {e}")

    if not favorite_films and existing_movies.get("favorite_films"):
        print("Using cached favorite_films from Supabase.")
        favorite_films = existing_movies["favorite_films"]

    # 3. Watchlist
    watchlist_films = []
    try:
        watch_html = fetch_letterboxd_html(f"{base_url}/{username}/watchlist/", timeout=10)
        watch_items = []
        for m in re.finditer(r'<div\s+[^>]*data-component-class="LazyPoster"[^>]*>', watch_html):
            tag = m.group(0)
            name_m = re.search(r'data-item-full-display-name="([^"]+)"', tag)
            film_m = re.search(r'data-film-link="([^"]+)"', tag)
            target_m = re.search(r'data-target-link="([^"]+)"', tag)
            
            watch_title = re.sub(r'\s\(\d{4}\)$', '', name_m.group(1)) if name_m else ""
            watch_title = html.unescape(watch_title)
            target_link = film_m.group(1) if film_m else (target_m.group(1) if target_m else "")
            if watch_title and target_link:
                watch_items.append((watch_title, target_link))
            if len(watch_items) >= 7:
                break
                
        poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in watch_items}
        concurrent.futures.wait(poster_futures)
        for itm in watch_items:
            for fut, w_itm in poster_futures.items():
                if w_itm == itm:
                    watchlist_films.append({"title": itm[0], "link": base_url + itm[1] if itm[1] else "", "cover_url": fut.result()})
                    break
    except Exception as e:
        print(f"Error fetching watchlist: {e}")

    if not watchlist_films and existing_movies.get("watchlist"):
        print("Using cached watchlist from Supabase.")
        watchlist_films = existing_movies["watchlist"]

    executor.shutdown(wait=False)
    return {"recent_activity": recent_activity, "favorite_films": favorite_films, "watchlist": watchlist_films}

# --- HELPERS: BOOKS ---

def fetch_books_data(url=None, key=None):
    goodreads_url = 'https://www.goodreads.com/review/list_rss/199124060?shelf=to-read'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
    books_data = []
    try:
        req = urllib.request.Request(goodreads_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as rss_response:
            root = ET.fromstring(rss_response.read())
            items = root.findall('./channel/item')
            for item in items:
                title = item.find('title').text if item.find('title') is not None else "Unknown Title"
                title = html.unescape(title)
                author = item.find('author_name').text if item.find('author_name') is not None else "Unknown Author"
                author = html.unescape(author)
                cover_url = item.find('book_image_url').text if item.find('book_image_url') is not None else ""
                if cover_url: cover_url = re.sub(r'\._[A-Za-z0-9]+_\.', '.', cover_url)
                books_data.append({"title": title, "author": author, "cover_url": cover_url, "link": item.find('link').text if item.find('link') is not None else "#"})
    except Exception as e:
        print(f"Error fetching Goodreads books: {e}")

    if not books_data and url and key:
        try:
            res = requests.get(
                f"{url}/rest/v1/portfolio_data?key=eq.books&select=value",
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
                timeout=10
            )
            if res.status_code == 200 and res.json():
                existing = res.json()[0].get("value", [])
                if existing:
                    print("Using cached books from Supabase.")
                    books_data = existing
        except Exception as e:
            print(f"Failed to check existing books in DB: {e}")

    return books_data

# --- HELPERS: PROJECTS ---

def fetch_projects_data(github_token):
    """Fetches and pre-renders READMEs for featured projects using GitHub API."""
    project_repos = [
        "simplyigit/Real-Deepfake-or-AI"
    ]
    projects_html = {}
    headers = {
        'User-Agent': 'Mozilla/5.0: simplyigit sync',
        'Authorization': f'token {github_token}' if github_token else None
    }
    
    for repo in project_repos:
        print(f"Fetching README for {repo}...")
        # Try main branch, then master
        for branch in ["main", "master"]:
            url = f"https://raw.githubusercontent.com/{repo}/{branch}/README.md"
            try:
                res = requests.get(url, headers=headers, timeout=10)
                if res.status_code == 200:
                    # Convert Markdown to HTML using GitHub's own rendering API
                    # This ensures 100% compatibility with GitHub formatting
                    print(f"Rendering {repo} via GitHub API...")
                    api_url = "https://api.github.com/markdown"
                    payload = {"text": res.text, "mode": "markdown"}
                    api_res = requests.post(api_url, headers=headers, json=payload, timeout=10)
                    
                    if api_res.status_code == 200:
                        projects_html[repo] = api_res.text
                        print(f"Successfully rendered {repo} from {branch}")
                        break
                    else:
                        print(f"GitHub API Error: {api_res.status_code}")
                        # Fallback to local markdown if API fails
                        projects_html[repo] = markdown.markdown(res.text, extensions=['extra', 'sane_lists'])
                        break
            except Exception as e: 
                print(f"Error processing {repo}: {e}")
                continue
            
    return projects_html

# --- MAIN SYNC ---

def main():
    print("Starting sync...")
    github_token = os.environ.get('GITHUB_TOKEN')
    
    url = os.environ.get("SUPABASE_URL", "").rstrip('/')
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Outputting to console.")
        return

    data = {
        "spotify": fetch_spotify_data(url, key),
        "movies": fetch_movies_data(url, key),
        "books": fetch_books_data(url, key),
        "projects": fetch_projects_data(github_token),
        "last_updated": time.time()
    }
    
    print("Uploading to Supabase...")
    # Upsert each section into its own row for better organization
    for category in ["spotify", "movies", "books", "projects"]:
        try:
            # We still use requests for the main data payload to avoid conflicts, 
            # but we use the client for the refresh token rotation since it's cleaner.
            res = requests.post(
                f"{url}/rest/v1/portfolio_data?on_conflict=key",
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                json={
                    "key": category,
                    "value": data[category]
                },
                timeout=15
            )
            
            if res.status_code in [200, 201]:
                print(f"Successfully updated {category}")
            else:
                print(f"Failed to update {category}: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"Failed to update {category}: {str(e)}")

    print("Sync complete!")

if __name__ == "__main__":
    main()

