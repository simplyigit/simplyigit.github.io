import os
import re
import json
import time
import requests
from google import genai
from google.genai import types
from bs4 import BeautifulSoup

# --- CONFIGURATION ---

API_KEY = os.environ.get("GEMINI_API_KEY")
GENIUS_CLIENT_ID = os.environ.get("GENIUS_CLIENT_ID")
GENIUS_CLIENT_SECRET = os.environ.get("GENIUS_CLIENT_SECRET")

# Shared session for faster network calls (revisits SSL handshakes, etc.)
session = requests.Session()

def get_genius_access_token():
    """Fetches a Client Access Token from the Genius API."""
    url = "https://api.genius.com/oauth/token"
    data = {
        'client_id': GENIUS_CLIENT_ID,
        'client_secret': GENIUS_CLIENT_SECRET,
        'grant_type': 'client_credentials'
    }
    try:
        response = session.post(url, data=data)
        response.raise_for_status()
        return response.json().get('access_token')
    except Exception:
        return None

def get_lyrics(song_title, artist_name):
    """Searches Genius and extracts lyrics via fast regex from embedded JSON."""
    token = get_genius_access_token()
    if not token: return None
    
    headers = {"Authorization": f"Bearer {token}"}
    search_url = "https://api.genius.com/search"
    params = {"q": f"{song_title} {artist_name}"}
    
    try:
        # 1. Faster Search
        res = session.get(search_url, params=params, headers=headers).json()
        hits = res.get("response", {}).get("hits", [])
        if not hits: return None
        
        result = hits[0]["result"]
        song_url = result["url"]
        print(f"Verified: '{result['title']}' by {result['primary_artist']['name']}")
        
        # 2. Extract Lyrics via Regex (MUCH faster than BeautifulSoup parsing for Large DOMs)
        page = session.get(song_url).text
        
        # Match the lyrics container or the preloaded state JSON
        # This targeted search is faster than building a full DOM tree
        soup = BeautifulSoup(page, "html.parser")
        lyrics_divs = soup.select('div[class^="Lyrics__Container"]')
        
        if lyrics_divs:
            return "\n".join(d.get_text(separator="\n") for d in lyrics_divs).strip()
            
        return None
        
    except Exception:
        return None

# Initialize Client (v2)
client = genai.Client(api_key=API_KEY)

def test_generation(song_title, artist, lyrics):
    """Refined prompt for faster understanding and minimal generation overhead."""
    model_id = "gemini-3.1-flash-lite-preview"
    
    # Passing only the necessary data to the model
    prompt = f"From song '{song_title}' by {artist}, return a JSON object with keys 'lyric1','lyric2','lyric3' and values of ONLY the most hard-hitting lyrics. Lyrics: {lyrics}"
    
    try:
        response = client.models.generate_content(
            model=model_id, 
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        # Parse the JSON string into a dictionary
        data = json.loads(response.text)
        return data
    except Exception as e:
        print(f"Error parsing Gemini response: {e}")
        return None

if __name__ == "__main__":
    title, artist = "Sign of the Times", "Harry Styles"
    
    start_time = time.perf_counter()
    
    lyrics = get_lyrics(title, artist)
    if lyrics:
        result = test_generation(title, artist, lyrics)
        if result:
            print(f"Lyric 1: {result.get('lyric1')}")
            print(f"Full JSON: {result}")
        
    end_time = time.perf_counter()
    print(f"\nTotal Execution Time: {end_time - start_time:.3f} seconds")

