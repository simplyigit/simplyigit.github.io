from http.server import BaseHTTPRequestHandler
import json
import requests
from bs4 import BeautifulSoup
import time

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Set aggressive caching headers to explicitly prevent page loading latency
        # s-maxage=86400 -> Vercel edge CDN caches the response for 24 hours.
        # stale-while-revalidate -> Vercel serves the old cache instantly to users, while rebuilding the new cache invisibly in the background.
        response_data = None
        response_status = 200
        cache_header = 's-maxage=86400, stale-while-revalidate'

        try:
            import xml.etree.ElementTree as ET
            import re

            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36: simplyigit caching'
            }
            username = "oneyigit"
            base_url = "https://letterboxd.com"

            def get_hd_poster(film_link):
                try:
                    res = requests.get(base_url + film_link, headers=headers)
                    if res.status_code == 200:
                        # Extract explicit 2:3 poster from JSON-LD instead of the og:image backdrops
                        m = re.search(r'"image":"(https://a\.ltrbxd\.com[^"]+)"', res.text)
                        if m:
                            return m.group(1)
                except:
                    pass
                return ""

            # 1. Fetch Recent Activity (via RSS)
            recent_activity = []
            rss_resp = requests.get(f"{base_url}/{username}/rss/", headers=headers)
            if rss_resp.status_code == 200:
                root = ET.fromstring(rss_resp.content)
                for item in root.findall('./channel/item')[:5]:  # limit to top 5
                    title_text = item.find('title').text if item.find('title') is not None else ""
                    link_text = item.find('link').text if item.find('link') is not None else ""
                    desc_html = item.find('description').text if item.find('description') is not None else ""

                    cover_url = ""
                    if desc_html:
                        desc_soup = BeautifulSoup(desc_html, 'html.parser')
                        img = desc_soup.find('img')
                        if img:
                            cover_url = img.get('src')

                    recent_activity.append({
                        "title_and_rating": title_text,
                        "link": link_text,
                        "cover_url": cover_url
                    })

            # 2. Fetch Favorite Films (via Profile)
            favorite_films = []
            prof_resp = requests.get(f"{base_url}/{username}/", headers=headers)
            if prof_resp.status_code == 200:
                prof_soup = BeautifulSoup(prof_resp.text, 'html.parser')
                fav_section = prof_soup.find(id='favourites')
                if fav_section:
                    for div in fav_section.find_all('div', class_='react-component'):
                        fav_title = div.get('data-item-full-display-name', '')
                        target_link = div.get('data-target-link', '') # Example: /film/interstellar/
                        base_film_link = div.get('data-film-link', target_link)

                        cover_url = get_hd_poster(base_film_link)

                        favorite_films.append({
                            "title": fav_title,
                            "link": base_url + base_film_link if base_film_link else "",
                            "cover_url": cover_url
                        })

            # 3. Fetch Watchlist
            watchlist_films = []
            watch_resp = requests.get(f"{base_url}/{username}/watchlist/", headers=headers)
            if watch_resp.status_code == 200:
                watch_soup = BeautifulSoup(watch_resp.text, 'html.parser')
                for div in watch_soup.find_all('div', attrs={'data-component-class': 'LazyPoster'})[:10]:
                    watch_title = div.get('data-item-full-display-name', '')
                    target_link = div.get('data-film-link', div.get('data-target-link', ''))

                    cover_url = get_hd_poster(target_link)

                    watchlist_films.append({
                        "title": watch_title,
                        "link": base_url + target_link if target_link else "",
                        "cover_url": cover_url
                    })

            movies_data = {
                "recent_activity": recent_activity,
                "favorite_films": favorite_films,
                "watchlist": watchlist_films
            }

            response = {
                "success": True,
                "data": movies_data,
                "timestamp": time.time()
            }

            response_data = response

        except Exception as e:
            error_response = {"success": False, "error": str(e)}
            response_data = error_response
            response_status = 500
            cache_header = 'no-store, no-cache, must-revalidate, max-age=0'

        self.send_response(response_status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Cache-Control', cache_header)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if response_data:
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
        return
