import os
import json
import sys
import time
import requests
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
import urllib.parse
import html


# --- HELPERS: SUPABASE ---

def supabase_headers(key):
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def read_row(url, key, row_key):
    """Returns the stored value of one portfolio_data row, or None if it's missing or can't be read."""
    try:
        res = requests.get(
            f"{url}/rest/v1/portfolio_data?key=eq.{row_key}&select=value",
            headers=supabase_headers(key),
            timeout=10
        )
        if res.status_code == 200:
            rows = res.json()
            return rows[0].get("value") if rows else None
        print(f"Failed to read {row_key}: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Failed to read {row_key}: {e}")
    return None


def upsert_row(url, key, row_key, value):
    """Writes one portfolio_data row. Returns True if Supabase stored it."""
    try:
        res = requests.post(
            f"{url}/rest/v1/portfolio_data?on_conflict=key",
            headers={**supabase_headers(key), "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
            json={"key": row_key, "value": value},
            timeout=15
        )
        if res.status_code in (200, 201):
            return True
        print(f"Failed to update {row_key}: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Failed to update {row_key}: {e}")
    return False


# Everything that went wrong this run, as (section, message): failed sections, stored data reused in
# place of a fetch, writes that didn't land. Any entry fails the run at the end, so GitHub emails about
# it instead of the site quietly showing old data under a fresh "Synced" time.
SYNC_PROBLEMS = []


def report_problem(section, message):
    print(f"Problem in {section}: {message}")
    SYNC_PROBLEMS.append((section, message))


def fall_back(section, part, fresh, stored):
    """Returns `fresh`, or the stored copy when nothing was fetched (reported as a problem)."""
    if fresh:
        return fresh
    report_problem(section, f"no {part} fetched; " + ("reusing the stored copy" if stored else "nothing stored to reuse"))
    return stored or fresh


# --- HELPERS: SPOTIFY ---

SPOTIFY_GREEN = [29, 185, 84]


def get_prominent_color(image_url, fallback=SPOTIFY_GREEN):
    """Fetches image and extracts the dominant color using ColorThief with luminance boosting.
    Returns `fallback` (Spotify green; pass None for covers that aren't Spotify's) if that fails."""
    if not image_url: return fallback
    try:
        res = requests.get(image_url, timeout=5)
        if res.status_code == 200:
            img_file = io.BytesIO(res.content)
            color_thief = ColorThief(img_file)
            # quality=1 samples every pixel (the most accurate setting; ~0.3s for a 640px cover)
            dominant_color = list(color_thief.get_color(quality=1))
            
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
    return fallback


def add_prominent_colors(items, executor):
    """Adds each item's cover colour as "prominent_color" (the homepage glow and card wash use it).
    A cover that can't be read just goes without; the site then works the colour out itself."""
    futures = [(item, executor.submit(get_prominent_color, item["cover_url"], None))
               for item in items if isinstance(item, dict) and item.get("cover_url")]
    for item, future in futures:
        color = future.result()
        if color:
            item["prominent_color"] = color

SYNC_HEADERS = {"User-Agent": "simplyigit-sync/1.0 (https://simplyigit.me)"}
LRCLIB_TIMEOUT = 8
LYRICA_TIMEOUT = 15
# Worst case for get_lyrics: two LRCLIB searches, then Lyrica
LYRICS_TIMEOUT = 2 * LRCLIB_TIMEOUT + LYRICA_TIMEOUT + 5


def strip_title_suffixes(title):
    """Drops "(feat. X)" / "- Remastered" suffixes, which often break lyric lookups."""
    return re.sub(r'\s*[\(\[](?:feat|ft|with)\.?[^\)\]]*[\)\]]|\s+-\s+.*$', '', title, flags=re.I).strip()


def normalize_name(name):
    return re.sub(r'[^\w]+', ' ', (name or '').casefold()).strip()


def title_key(title):
    return normalize_name(strip_title_suffixes(title or ''))


def find_spotify_match(results, item_name, artist_name, search_type):
    """Picks the Spotify search result that is really the Last.fm item, or None."""
    target = (artist_name if artist_name else item_name).lower().strip()
    if search_type == "artist":
        return next((r for r in results if r['name'].lower().strip() == target), None)

    # Tracks: the artist may be billed anywhere in the credits, and the title must match too
    if artist_name:
        results = [r for r in results if any(a['name'].lower().strip() == target for a in r.get('artists', []))]
    # The same title first, so "Song" beats a "Song - Live at X" listed above it
    exact = next((r for r in results if normalize_name(r['name']) == normalize_name(item_name)), None)
    if exact:
        return exact
    want = title_key(item_name)
    same_song = next((r for r in results if title_key(r['name']) == want), None)
    if same_song or not want:
        return same_song
    # "Song" vs "Song - Live at X" / "Song (Demo)" style differences
    return next((r for r in results if (got := title_key(r['name'])) and (got.startswith(want) or want.startswith(got))), None)


def fetch_preview_url(song_title, artist_name):
    """30-second preview clip from the iTunes Search API (keyless). Spotify's API no longer returns
    preview URLs, so the site's play buttons use these instead."""
    wanted_artist = normalize_name(artist_name)
    want = title_key(song_title)
    for term in dict.fromkeys([f"{artist_name} {song_title}", f"{artist_name} {strip_title_suffixes(song_title)}"]):
        try:
            res = requests.get(
                "https://itunes.apple.com/search",
                params={"term": term, "media": "music", "entity": "song", "limit": 15},
                headers=SYNC_HEADERS,
                timeout=8
            )
            if res.status_code != 200:
                continue
            # Search is fuzzy: only accept the same song by the same artist
            hits = [
                h for h in res.json().get("results", [])
                if h.get("previewUrl") and wanted_artist and wanted_artist in normalize_name(h.get("artistName", ""))
            ]
            exact = next((h for h in hits if normalize_name(h.get("trackName", "")) == normalize_name(song_title)), None)
            same_song = exact or next((h for h in hits if title_key(h.get("trackName", "")) == want), None)
            if same_song:
                return same_song["previewUrl"]
        except Exception as e:
            print(f"iTunes preview lookup error for {song_title}: {e}")
    return None


def fetch_lrclib_lyrics(song_title, artist_name):
    """LRCLIB: free, keyless lyrics database (https://lrclib.net/docs)."""
    # /api/get needs album_name and duration for an exact match, so search and verify the hit instead
    bare_title = strip_title_suffixes(song_title)
    wanted_title = normalize_name(bare_title)
    wanted_artist = normalize_name(artist_name)
    for title in dict.fromkeys([song_title, bare_title]):
        params = {"track_name": title, "artist_name": artist_name}
        try:
            res = requests.get("https://lrclib.net/api/search", params=params, headers=SYNC_HEADERS, timeout=LRCLIB_TIMEOUT)
            if res.status_code != 200:
                continue
            for hit in res.json():
                if not hit.get("plainLyrics"):
                    continue
                # Search is fuzzy: only accept the same song by the same artist
                if normalize_name(strip_title_suffixes(hit.get("trackName", ""))) != wanted_title:
                    continue
                if wanted_artist not in normalize_name(hit.get("artistName", "")):
                    continue
                return hit["plainLyrics"]
        except Exception as e:
            print(f"LRCLIB Error: {e}")
    return None


# Last.fm header photos per artist. Last.fm serves GitHub Actions a bot challenge, so these are
# fetched from a personal machine by scripts/fetch_artist_banners.py and committed.
ARTIST_BANNERS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'artist_banners.json')


def load_artist_banners():
    try:
        with open(ARTIST_BANNERS_PATH) as f:
            return {name.casefold(): url for name, url in json.load(f).items() if url}
    except (FileNotFoundError, ValueError) as e:
        print(f"No artist banners loaded: {e}")
        return {}


def fetch_lyrica_lyrics(song_title, artist_name):
    """Fallback: community Lyrica API instance."""
    base_url = "https://test-0k.onrender.com/lyrics/"
    params = {"artist": artist_name, "song": song_title}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    try:
        res = requests.get(base_url, params=params, headers=headers, timeout=LYRICA_TIMEOUT)
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success":
                return data["data"].get("lyrics")
    except Exception as e:
        print(f"Lyrica Error: {e}")
    return None


def get_lyrics(song_title, artist_name):
    """Fetches plain lyrics from LRCLIB, falling back to Lyrica."""
    print(f"Fetching lyrics for: {song_title} - {artist_name}...")
    for source in (fetch_lrclib_lyrics, fetch_lyrica_lyrics):
        lyrics = source(song_title, artist_name)
        if lyrics:
            # Basic cleanup of any remaining HTML artifacts or repeated newlines
            lyrics = re.sub(r'<[^>]*>', '', lyrics)
            clean_lyrics = re.sub(r'(\n){3,}', '\n\n', lyrics).strip()
            print(f"Retrieved {len(clean_lyrics)} chars of lyrics via {source.__name__}.")
            return clean_lyrics
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

# Artists Spotify's search doesn't find by name
KNOWN_ARTISTS = {
    "ruel": {
        "spotify_id": "5xkAtLTf309LAGZTbvULBn",
        "spotify_url": "https://open.spotify.com/artist/5xkAtLTf309LAGZTbvULBn",
        "cover_url": "https://i.scdn.co/image/ab6761610000e5eb9184ca89cc9c4ecd7487bb5f"
    }
}


def get_spotify_access_token(url, key, client_id, client_secret):
    """Trades the stored refresh token for an access token, storing the new refresh token when Spotify
    rotates it. Raises RuntimeError if no access token can be had."""
    stored = read_row(url, key, "spotify_refresh_token")
    refresh_token = stored.get("refresh_token") if isinstance(stored, dict) else None
    if refresh_token:
        print("Retrieved refresh token from Supabase.")
    else:
        # Last resort: the GitHub secret, which may be stale once Spotify has rotated the token
        refresh_token = os.environ.get('SPOTIFY_REFRESH_TOKEN')
        if refresh_token:
            print("Falling back to the SPOTIFY_REFRESH_TOKEN secret.")
    if not refresh_token:
        raise RuntimeError("No Spotify refresh token in Supabase or the secrets")

    b64_auth = b64encode(f"{client_id}:{client_secret}".encode()).decode()
    print("Requesting new access token from Spotify...")
    token_resp = requests.post('https://accounts.spotify.com/api/token',
                             data={'grant_type': 'refresh_token', 'refresh_token': refresh_token},
                             headers={'Authorization': f'Basic {b64_auth}'},
                             timeout=10)
    if token_resp.status_code != 200:
        raise RuntimeError(f"Spotify refresh failed: {token_resp.status_code}")

    token_json = token_resp.json()
    new_refresh = token_json.get('refresh_token')
    if new_refresh and new_refresh != refresh_token:
        if upsert_row(url, key, "spotify_refresh_token", {"refresh_token": new_refresh}):
            print("Saved the rotated refresh token to Supabase.")
        else:
            # Spotify may already have retired the old token, so the next run could fail to sign in
            report_problem("spotify token", "Spotify rotated the refresh token, but saving it to Supabase failed")
    return token_json.get('access_token')


def fetch_lastfm_top(lfm_key, lfm_user):
    """This month's top 200 tracks and top 5 artists from Last.fm, most played first.
    The deeper track list (one request) also yields each top artist's most played song of the month."""
    lfm_base = "https://ws.audioscrobbler.com/2.0/"
    lfm_headers = {"User-Agent": f"simplyigit-api/1.0 ({lfm_user})"}
    lfm_params = {"api_key": lfm_key, "user": lfm_user, "format": "json", "period": "1month", "limit": 5}

    def lfm_get(method, **params):
        res = requests.get(lfm_base, params={**lfm_params, "method": method, **params}, headers=lfm_headers, timeout=10)
        res.raise_for_status()
        return res.json()

    tracks = lfm_get("user.getTopTracks", limit=200).get("toptracks", {}).get("track", [])
    artists = lfm_get("user.getTopArtists").get("topartists", {}).get("artist", [])
    return tracks, artists


def spotify_search(access_token, item_name, artist_name, search_type):
    """Spotify link, cover and ID for a Last.fm track or artist, or None if there's no sure match."""
    s_headers = {"Authorization": f"Bearer {access_token}"}
    target = (artist_name if artist_name else item_name).lower().strip()

    # Build candidate queries:
    queries = []
    if search_type == "artist":
        # For artist searches, searching exact phrase and plain name directly with higher limit
        queries.append(f'"{item_name}"')
        queries.append(item_name)
        queries.append(f'artist:"{item_name}"')
    else:
        if artist_name:
            queries.append(f'track:"{item_name}" artist:"{artist_name}"')
            queries.append(f'"{item_name}" "{artist_name}"')
        else:
            queries.append(f'track:"{item_name}"')
            queries.append(item_name)

    for q in queries:
        s_params = {"q": q, "type": search_type, "limit": 10}
        try:
            s_res = requests.get("https://api.spotify.com/v1/search", headers=s_headers, params=s_params, timeout=10)
            if s_res.status_code != 200:
                continue
            s_data = s_res.json()
            results = s_data.get(f"{search_type}s", {}).get("items", [])
            res_item = find_spotify_match(results, item_name, artist_name, search_type)
            if res_item:
                # Largest first (640, 300, 64); the ~300px copy serves the small cards
                imgs = res_item.get("images", []) if search_type == "artist" else res_item.get("album", {}).get("images", [])
                return {
                    "spotify_url": res_item['external_urls']['spotify'],
                    "cover_url": imgs[0]['url'] if imgs else None,
                    "cover_url_small": imgs[1]['url'] if len(imgs) > 1 else (imgs[0]['url'] if imgs else None),
                    "spotify_id": res_item['id']
                }
        except Exception as e:
            print(f"spotify_search error for {item_name} (query={q}): {e}")

    # Check known fallback catalog if search returned no match
    if search_type == "artist" and target in KNOWN_ARTISTS:
        return KNOWN_ARTISTS[target]
    return None


def artist_song(lfm_track, t_info):
    """The top artist's most played song of the month, with its Spotify search result `t_info`."""
    return {
        "title": lfm_track['name'],
        "playcount": lfm_track['playcount'],
        "cover_url": t_info['cover_url'] if t_info else None,
        "cover_url_small": t_info.get('cover_url_small') if t_info else None,
        "spotify_url": t_info['spotify_url'] if t_info else None
    }


def fetch_spotify_data(url, key):
    """Top tracks and artists of the month. Raises on missing credentials or a failed sign-in or
    Last.fm request (Last.fm often answers 5xx with an HTML page); that fails this section only."""
    client_id = os.environ.get('CLIENT_ID')
    client_secret = os.environ.get('CLIENT_SECRET')
    lfm_key = os.environ.get('LASTFM_API_KEY')
    lfm_user = os.environ.get('LASTFM_USER')

    if not all([client_id, client_secret, lfm_key, lfm_user]):
        raise RuntimeError("Missing Spotify or Last.fm credentials")

    access_token = get_spotify_access_token(url, key, client_id, client_secret)
    raw_lfm_tracks_all, raw_lfm_artists = fetch_lastfm_top(lfm_key, lfm_user)
    raw_lfm_tracks = raw_lfm_tracks_all[:5]

    # Check existing DB for the top track's curated snippets to avoid unnecessary API calls
    existing_spotify = read_row(url, key, "spotify")
    existing_tracks = (existing_spotify.get("top_tracks_last_month") or []) if isinstance(existing_spotify, dict) else []
    existing_top_track_name = existing_tracks[0].get("title") if existing_tracks else None
    existing_ai_lyrics = existing_tracks[0].get("ai_lyrics") if existing_tracks else None
    # Stored previews, kept when a lookup fails so a play button doesn't come and go
    existing_previews = {
        (t.get("title"), t.get("artist")): t["preview_url"]
        for t in existing_tracks if isinstance(t, dict) and t.get("preview_url")
    }

    final_tracks = []
    final_artists = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
        track_futures = {executor.submit(spotify_search, access_token, t['name'], t['artist']['name'], "track"): t for t in raw_lfm_tracks}
        track_search_by_key = {(t['name'].casefold(), t['artist']['name'].casefold()): fut for fut, t in track_futures.items()}
        preview_futures = {
            (t['name'], t['artist']['name']): executor.submit(fetch_preview_url, t['name'], t['artist']['name'])
            for t in raw_lfm_tracks
        }

        # The #1 artist's most played song this month (the list is ranked); reuse the top-5 search if it's there
        top_artist_song = None
        if raw_lfm_artists:
            top_name = raw_lfm_artists[0]['name'].casefold()
            hit = next((t for t in raw_lfm_tracks_all if t['artist']['name'].casefold() == top_name), None)
            if hit:
                song_key = (hit['name'].casefold(), hit['artist']['name'].casefold())
                if song_key not in track_search_by_key:
                    track_search_by_key[song_key] = executor.submit(spotify_search, access_token, hit['name'], hit['artist']['name'], "track")
                top_artist_song = (hit, track_search_by_key[song_key])
        artist_futures = {executor.submit(spotify_search, access_token, a['name'], None, "artist"): a for a in raw_lfm_artists}
        artist_banners = load_artist_banners()

        # Start lyric fetching for #1 track early via Lyrica (only if it changed or missing)
        lyric_future = None
        if raw_lfm_tracks:
            top_t = raw_lfm_tracks[0]
            if existing_top_track_name == top_t['name'] and existing_ai_lyrics:
                print(f"Top track '{top_t['name']}' hasn't changed. Using cached lyric snippets.")
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
                "cover_url_small": (s_info.get('cover_url_small') if s_info else None) or cover_url,
                "spotify_id": s_info['spotify_id'] if s_info else None
            })
            if cover_url:
                color_futures[cover_url] = executor.submit(get_prominent_color, cover_url)

        for fut, a in artist_futures.items():
            s_info = fut.result()
            raw_lfm_img = a.get('image', [{}])[-1].get('#text')
            # Do not accept Last.fm generic placeholder star image
            if raw_lfm_img and "2a96cbd8b46e442fc41c2b86b821562f" in raw_lfm_img:
                raw_lfm_img = None

            image_url = (s_info.get('cover_url') if s_info else None) or raw_lfm_img
            final_artists.append({
                "name": a['name'],
                "playcount": a['playcount'],
                "spotify_url": s_info['spotify_url'] if s_info else None,
                "image_url": image_url,
                "banner_url": artist_banners.get(a['name'].casefold()),
                "spotify_id": s_info['spotify_id'] if s_info else None
            })
            if image_url and image_url not in color_futures:
                color_futures[image_url] = executor.submit(get_prominent_color, image_url)

        if final_artists and top_artist_song:
            hit, search_future = top_artist_song
            final_artists[0]["top_track"] = artist_song(hit, search_future.result())

        # Assign colors (and 30-second previews) back to tracks and artists
        for track in final_tracks:
            if track['cover_url'] in color_futures:
                track['prominent_color'] = color_futures[track['cover_url']].result()
            track_id = (track['title'], track['artist'])
            preview_url = preview_futures[track_id].result() or existing_previews.get(track_id)
            if preview_url:
                track['preview_url'] = preview_url
        for artist in final_artists:
            if artist['image_url'] in color_futures:
                artist['prominent_color'] = color_futures[artist['image_url']].result()

        # 6. Process AI Lyrics
        if final_tracks:
            print("Processing AI Lyrics for #1 track...")
            top_track = final_tracks[0]
            if existing_top_track_name == top_track['title'] and existing_ai_lyrics:
                top_track['ai_lyrics'] = existing_ai_lyrics
                print("Reused cached AI lyrics for unchanged #1 track!")
            else:
                lyrics_text = None
                if lyric_future:
                    try:
                        lyrics_text = lyric_future.result(timeout=LYRICS_TIMEOUT)
                    except Exception as e:
                        print(f"Lyric fetching timed out/failed: {str(e)}")

                # Full lyrics are only input for curation: they're copyrighted, so never stored or served
                if lyrics_text:
                    top_track['ai_lyrics'] = generate_lyric_snippets(top_track['title'], top_track['artist'], lyrics_text)
                    if top_track.get('ai_lyrics'):
                        print("AI Lyrics curated successfully!")
                else:
                    print("Skipping curation: No real lyrics retrieved.")

    return {
        "top_tracks_last_month": final_tracks,
        "top_artists_last_month": final_artists
    }

# --- HELPERS: FAVORITE ALBUMS (ALL-TIME FAVORITES) ---

# spotify_id: the album's Spotify page, looked up once (the list never changes, so no hourly search)
FAVORITE_ALBUMS_RAW = [
    {
        "title": "Purple Rain",
        "year": "1984",
        "artist": "Prince and The Revolution",
        "raw_cover_url": "https://coverartarchive.org/release-group/b93a7c47-a6d4-33f2-9034-53fdd991f4ba/front",
        "banner_url": "/images/albums/purple-rain-banner.webp",
        "bg_url": "/images/albums/purple-rain-bg.webp",
        "typo_url": "/images/albums/purple-rain-typo.webp",
        "spotify_id": "2umoqwMrmjBBPeaqgYu6J9",
        "prominent_color": [196, 170, 250]
    },
    {
        "title": "Angel Face (Club Deluxe)",
        "year": "2023",
        "artist": "Stephen Sanchez",
        "raw_cover_url": "https://coverartarchive.org/release/b53c56ef-d530-476e-962b-014296986cb8/38792987419.jpg",
        "banner_url": "/images/albums/angel-face-banner.webp",
        "bg_url": "/images/albums/angel-face-bg.webp",
        "typo_url": "/images/albums/angel-face-typo.webp",
        "spotify_id": "3fD6ZQKymy2oP1t6c8NEOc",
        "prominent_color": [213, 86, 69]
    },
    {
        "title": "5SOS5 (Deluxe)",
        "year": "2022",
        "artist": "5 Seconds of Summer",
        "raw_cover_url": "https://coverartarchive.org/release-group/9cfe783c-18f2-47bb-a88f-4f45bceb7eda/front",
        "banner_url": "/images/albums/5sos5-banner.webp",
        "bg_url": "/images/albums/5sos5-bg.webp",
        "typo_url": "/images/albums/5sos5-typo.webp",
        "spotify_id": "26uA5pGrTovBLxikRsMQJ4",
        "prominent_color": [247, 221, 207]
    },
    {
        "title": "Fine Line",
        "year": "2019",
        "artist": "Harry Styles",
        "raw_cover_url": "https://coverartarchive.org/release-group/b9990da8-7953-4e64-aea5-065ca9cd3cb7/front",
        "banner_url": "/images/albums/fine-line-banner.webp",
        "bg_url": "/images/albums/fine-line-bg.webp",
        "typo_url": "/images/albums/fine-line-typo.webp",
        "spotify_id": "7xV2TzoaVc0ycW7fwBwAml",
        "prominent_color": [115, 194, 214]
    },
    {
        "title": "4TH WALL",
        "year": "2023",
        "artist": "Ruel",
        "raw_cover_url": "https://coverartarchive.org/release-group/97226a36-4394-4188-b29e-3a8210d33173/front",
        "banner_url": "/images/albums/4th-wall-banner.webp",
        "bg_url": "/images/albums/4th-wall-bg.webp",
        "typo_url": "/images/albums/4th-wall-typo.webp",
        "spotify_id": "6SW7IIrlj6LoWxDPinGeQp",
        "prominent_color": [226, 108, 34]
    }
]

def optimize_cover_url(url):
    """Optimizes CoverArtArchive URLs by swapping full-res masters for 500px thumbnails."""
    if not url: return ""
    if "coverartarchive.org" in url:
        if url.endswith("/front"):
            return url + "-500"
        if re.search(r'/\d+\.jpg$', url):
            return re.sub(r'/(\d+)\.jpg$', r'/\1-500.jpg', url)
    return url

def fetch_favorite_albums():
    """
    Processes and returns the hardcoded all-time favorite albums with:
    - Optimized cover arts (500px CAA thumbnails + global wsrv.nl WebP proxy URLs)
    - Luminance-boosted prominent colors
    - Spotify album links from the fixed IDs
    """
    albums = []
    for base in FAVORITE_ALBUMS_RAW:
        album = base.copy()
        raw_url = album.get("raw_cover_url", "")
        cover_500 = optimize_cover_url(raw_url)
        album["cover_url"] = cover_500
        album["format_tag"] = f"LP · {album['year']}"
        album["spotify_url"] = f"https://open.spotify.com/album/{album['spotify_id']}"
        
        # wsrv.nl proxy WebP URL for fast global CDN delivery and anti-ISP-block protection
        if cover_500:
            album["optimized_cover_url"] = f"https://wsrv.nl/?url={urllib.parse.quote(cover_500)}&w=500&output=webp"
            
        # Dynamically compute/verify prominent color if not set
        if "prominent_color" not in album:
            try:
                album["prominent_color"] = get_prominent_color(cover_500)
            except Exception:
                album["prominent_color"] = [29, 185, 84]

        albums.append(album)
    return albums

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

LETTERBOXD_NS = '{https://letterboxd.com}'


def stars_from_rating(value):
    """Letterboxd's 0.5–5.0 member rating as the site's star string ("3.5" -> "★★★½"); "" if unrated."""
    try:
        rating = float(value)
    except (TypeError, ValueError):
        return ""
    if rating <= 0:
        return ""
    return "★" * int(rating) + ("½" if rating % 1 >= 0.5 else "")


def parse_letterboxd_item(item):
    """One entry of the Letterboxd RSS feed as a recent_activity film."""
    def lb(name):
        return (item.findtext(LETTERBOXD_NS + name) or '').strip()

    # The feed's own elements; the <title> ("Film, 2020 - ★★★½") breaks on half-star-only
    # ratings and on reviews tagged " (contains spoilers)"
    title = lb('filmTitle')
    rating = stars_from_rating(lb('memberRating'))
    if not title:
        # Items without them (lists, or a feed change): parse the <title> instead
        text = re.sub(r' \(contains spoilers\)$', '', (item.findtext('title') or '').strip())
        rating_match = re.search(r' - (★+½?|½)$', text)
        if rating_match:
            rating = rating_match.group(1)
            text = text[:rating_match.start()]
        title = re.sub(r'(, \d{4}|\(\d{4}\))$', '', text).strip()

    img_m = re.search(r'<img[^>]+src="([^">]+)"', item.findtext('description') or '')
    return {
        "title": html.unescape(title),
        "rating": rating,
        "is_rewatch": lb('rewatch').lower() == 'yes',
        "is_favorite": lb('memberLike').lower() == 'yes',
        "link": item.findtext('link') or "",
        "cover_url": img_m.group(1) if img_m else ""
    }


# All-time favourite films, in profile order. The profile page, the only place Letterboxd lists them,
# sits behind a Cloudflare challenge (since 2026-11), so they live here: update by hand when they change.
# film: the slug of letterboxd.com/film/<film>/ (posters and backdrops come from there);
# link: the page the card opens
FAVORITE_FILMS = [
    {"title": "Interstellar", "film": "interstellar", "link": "/oneyigit/film/interstellar/"},
    {"title": "The Perks of Being a Wallflower", "film": "the-perks-of-being-a-wallflower", "link": "/oneyigit/film/the-perks-of-being-a-wallflower/1/"},
    {"title": "Before Sunrise", "film": "before-sunrise", "link": "/oneyigit/film/before-sunrise/"},
    {"title": "A.I. Artificial Intelligence", "film": "ai-artificial-intelligence", "link": "/oneyigit/film/ai-artificial-intelligence/"},
]


def fetch_favorite_films(executor, stored=None):
    """FAVORITE_FILMS with their poster and backdrop. A film whose page can't be read keeps its
    stored images (reported as a problem)."""
    stored_by_title = {f.get("title"): f for f in stored or [] if isinstance(f, dict)}
    lookups = [(film, executor.submit(get_both_images, f"/film/{film['film']}/")) for film in FAVORITE_FILMS]
    films = []
    for film, lookup in lookups:
        backdrop, poster = lookup.result()
        if not poster:
            old = stored_by_title.get(film["title"], {})
            report_problem("movies", f"no poster for {film['title']}; " + ("reusing the stored one" if old.get("cover_url") else "none stored"))
            backdrop, poster = old.get("backdrop_url", ""), old.get("cover_url", "")
        films.append({"title": film["title"], "link": "https://letterboxd.com" + film["link"], "cover_url": poster, "backdrop_url": backdrop})
    return films


def fetch_movies_data(url=None, key=None):
    username = "oneyigit"
    base_url = "https://letterboxd.com"
    
    # Retrieve existing movies from Supabase as fallback to prevent wiping data on temporary network glitches
    existing_movies = (read_row(url, key, "movies") if url and key else None) or {}
    if not isinstance(existing_movies, dict):
        existing_movies = {}

    # 1. Recent Activity (from Letterboxd RSS)
    recent_activity = []
    try:
        rss_content = fetch_letterboxd_html(f"{base_url}/{username}/rss/", timeout=10)
        root = ET.fromstring(rss_content)
        recent_activity = [parse_letterboxd_item(item) for item in root.findall('./channel/item')[:7]]
    except Exception as e:
        print(f"Error fetching recent activity: {e}")

    recent_activity = fall_back("movies", "recent activity", recent_activity, existing_movies.get("recent_activity"))

    # 2. Favorites & Watchlist (Parallel posters)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        favorite_films = fetch_favorite_films(executor, existing_movies.get("favorite_films"))

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

        watchlist_films = fall_back("movies", "watchlist", watchlist_films, existing_movies.get("watchlist"))

        add_prominent_colors(recent_activity, executor)
    return {"recent_activity": recent_activity, "favorite_films": favorite_films, "watchlist": watchlist_films}

# --- BOOKS ---
# Goodreads closed its RSS feeds and put shelves behind sign-in (2026-11), so books are no longer synced:
# the stored "books" row is kept as it is, and the Reading page is retired (vercel.json redirects it home).

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

SYNC_CATEGORIES = ["spotify", "movies", "projects"]
# Row holding {"last_updated": <epoch seconds>, "sections": {<category>: <epoch seconds>}}: the last sync
# that stored anything, and when each section last synced without problems
SYNC_META_KEY = "sync_meta"


def is_valid_payload(category, value):
    """False for error dicts and empty results, which must never replace a stored row."""
    if category == "spotify":
        return isinstance(value, dict) and bool(value.get("top_tracks_last_month"))
    if category == "movies":
        return isinstance(value, dict) and any(value.get(k) for k in ("recent_activity", "favorite_films", "watchlist"))
    if category == "projects":
        return isinstance(value, dict) and bool(value)
    return False


def safe_fetch(name, fetch, *args):
    """Runs one section's fetch; an error fails that section instead of the whole sync."""
    try:
        return fetch(*args)
    except Exception as e:
        report_problem(name, f"fetch failed: {e!r}")
        return None


def fetch_existing_rows(url, key, categories):
    """Returns the currently stored {category: value} rows, or {} if Supabase can't be read."""
    try:
        res = requests.get(
            f"{url}/rest/v1/portfolio_data?key=in.({','.join(categories)})&select=key,value",
            headers=supabase_headers(key),
            timeout=10
        )
        if res.status_code == 200:
            return {row.get("key"): row.get("value") for row in res.json()}
    except Exception as e:
        print(f"Failed to read existing rows: {e}")
    return {}


def main():
    print("Starting sync...")
    github_token = os.environ.get('GITHUB_TOKEN')
    
    url = os.environ.get("SUPABASE_URL", "").rstrip('/')
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.")
        sys.exit(1)

    spotify_data = safe_fetch("spotify", fetch_spotify_data, url, key)
    if is_valid_payload("spotify", spotify_data):
        # A fixed list that rides along in the spotify row
        spotify_data["favorite_albums"] = fetch_favorite_albums()

    data = {
        "spotify": spotify_data,
        "movies": safe_fetch("movies", fetch_movies_data, url, key),
        "projects": safe_fetch("projects", fetch_projects_data, github_token),
        "last_updated": time.time()
    }

    # A failed section keeps its stored row: skip its upsert and export the stored copy instead
    failed = [c for c in SYNC_CATEGORIES if not is_valid_payload(c, data[c])]
    existing = fetch_existing_rows(url, key, [*failed, SYNC_META_KEY])
    for category in failed:
        if not any(section == category for section, _ in SYNC_PROBLEMS):
            report_problem(category, "nothing fetched")
        print(f"Keeping stored data for {category}.")
        data[category] = existing.get(category)

    if os.environ.get("EXPORT_STATIC") == "1" or os.environ.get("GITHUB_ACTIONS") != "true":
        print("Exporting static snapshots...")
        # Books aren't synced any more: the snapshots carry the stored copy
        export_static_snapshots({**data, "books": read_row(url, key, "books")})

    print("Uploading to Supabase...")
    for category in SYNC_CATEGORIES:
        if category in failed:
            continue
        if upsert_row(url, key, category, data[category]):
            print(f"Successfully updated {category}")
        else:
            report_problem(category, "upload to Supabase failed")

    # When this sync ran, for the site footer ("Synced 12 min ago"); the /api functions pass on the oldest
    # time among the sections a page shows. A section with problems keeps its previous time.
    with_problems = {section for section, _ in SYNC_PROBLEMS}
    clean = [c for c in SYNC_CATEGORIES if c not in with_problems]
    if clean:
        meta = existing.get(SYNC_META_KEY)
        sections = meta.get("sections") or {} if isinstance(meta, dict) else {}
        # Only sections that are still synced (books stopped in 2026-11)
        sections = {c: t for c, t in sections.items() if c in SYNC_CATEGORIES}
        sections.update({c: data["last_updated"] for c in clean})
        if not upsert_row(url, key, SYNC_META_KEY, {"last_updated": data["last_updated"], "sections": sections}):
            report_problem(SYNC_META_KEY, "upload to Supabase failed")

    if SYNC_PROBLEMS:
        # A failed run makes GitHub email the repo owner
        print(f"Sync finished with {len(SYNC_PROBLEMS)} problem(s):")
        for section, message in SYNC_PROBLEMS:
            print(f"  - {section}: {message}")
        sys.exit(1)
    print("Sync complete!")

def export_static_snapshots(data):
    """Exports synchronized snapshots to static data/ files and seed-data.js."""
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_dir = os.path.join(base_dir, "data")
        os.makedirs(data_dir, exist_ok=True)

        spotify = data.get("spotify")
        movies = data.get("movies")
        books = data.get("books")
        projects = data.get("projects")
        synced_at = data.get("last_updated")

        # A section that failed with nothing stored to fall back on keeps its previous snapshot
        for name, value in (("spotify", spotify), ("movies", movies), ("books", books), ("projects", projects)):
            if value:
                with open(os.path.join(data_dir, f"{name}.json"), "w") as f:
                    json.dump({"success": True, "data": value, "synced_at": synced_at}, f, indent=2)

        if not (spotify and movies and books):
            print("Skipping dashboard.json and seed-data.js: a section is missing.")
            return

        dashboard = {
            "spotify": spotify,
            "books": books,
            "movies": movies
        }
        with open(os.path.join(data_dir, "dashboard.json"), "w") as f:
            json.dump({"success": True, "data": dashboard, "synced_at": synced_at}, f, indent=2)

        seed_path = os.path.join(base_dir, "assets", "js", "modules", "seed-data.js")
        seed_content = f"""// Seed data for instantaneous 0ms first-paint (Synchronized with live data)
export const SEED_SPOTIFY = {json.dumps(spotify, indent=2)};

export const SEED_MOVIES = {json.dumps(movies, indent=2)};

export const SEED_BOOKS = {json.dumps(books, indent=2)};
"""
        with open(seed_path, "w") as f:
            f.write(seed_content)

        print("Exported static snapshots to data/*.json and seed-data.js successfully!")
    except Exception as e:
        print(f"Error exporting static snapshots: {e}")

if __name__ == "__main__":
    main()


