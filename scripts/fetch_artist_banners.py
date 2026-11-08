"""Fetches Last.fm header photos for the top artists into data/artist_banners.json.

Last.fm answers GitHub Actions with a bot challenge, so this runs from your own machine instead:
    python3 scripts/fetch_artist_banners.py               # current top artists, from the live site
    python3 scripts/fetch_artist_banners.py "Artist" ...  # specific artists
    python3 scripts/fetch_artist_banners.py --refresh     # re-fetch artists already in the file
Then commit data/artist_banners.json; the hourly sync reads it. Standard library only.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

BANNERS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'artist_banners.json')
LIVE_API = "https://simplyigit.me/api/spotify"
HEADERS = {"User-Agent": "simplyigit-banners/1.0 (https://simplyigit.me)"}
GALLERY_IMAGE = re.compile(r'/i/u/avatar170s/([0-9a-f]{32})')


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=15) as res:
        return res.read().decode('utf-8', 'replace')


def current_top_artists():
    data = json.loads(get(f"{LIVE_API}?fresh={os.getpid()}"))
    return [a["name"] for a in (data.get("data") or {}).get("top_artists_last_month", []) if a.get("name")]


def fetch_banner(artist_name):
    """Top-voted photo from the artist's Last.fm gallery (the image Last.fm uses as the page header)."""
    page = get(f"https://www.last.fm/music/{urllib.parse.quote_plus(artist_name)}/+images")
    match = GALLERY_IMAGE.search(page)
    if not match:
        title = re.search(r'<title>(.*?)</title>', page, re.S)
        raise ValueError(f"no gallery image (page title: {title.group(1).strip()[:60] if title else 'none'})")
    original = f"https://lastfm.freetls.fastly.net/i/u/ar0/{match.group(1)}"
    # Originals run up to ~3000px; wsrv.nl serves a 1400px WebP sized for the card backdrop
    return f"https://wsrv.nl/?url={urllib.parse.quote(original)}&w=1400&output=webp"


def main():
    args = [a for a in sys.argv[1:] if a != "--refresh"]
    refresh = "--refresh" in sys.argv
    try:
        with open(BANNERS_PATH) as f:
            banners = json.load(f)
    except FileNotFoundError:
        banners = {}

    names = args or current_top_artists()
    for name in names:
        if name in banners and not refresh:
            print(f"  {name}: already saved")
            continue
        try:
            banners[name] = fetch_banner(name)
            print(f"  {name}: saved")
        except Exception as e:
            print(f"  {name}: skipped, {e}")

    with open(BANNERS_PATH, "w") as f:
        json.dump(dict(sorted(banners.items(), key=lambda kv: kv[0].casefold())), f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"{len(banners)} banners in {os.path.relpath(BANNERS_PATH)}")


if __name__ == "__main__":
    main()
