from http.server import BaseHTTPRequestHandler
import json
import requests
from bs4 import BeautifulSoup
import time
import concurrent.futures

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

            session = requests.Session()

            def get_hd_poster(film_link):
                if not film_link: return ""
                try:
                    res = session.get(base_url + film_link, headers=headers, timeout=5)
                    if res.status_code == 200:
                        # Extract explicit 2:3 poster from JSON-LD
                        m = re.search(r'"image":"(https://a\.ltrbxd\.com[^"]+)"', res.text)
                        if m:
                            return m.group(1)
                except:
                    pass
                return ""

            # Use ThreadPoolExecutor for parallel poster fetching
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)

            # 1. Fetch Recent Activity (via RSS)
            recent_activity = []
            rss_resp = session.get(f"{base_url}/{username}/rss/", headers=headers, timeout=10)
            if rss_resp.status_code == 200:
                root = ET.fromstring(rss_resp.content)
                for item in root.findall('./channel/item')[:5]:
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
            prof_resp = session.get(f"{base_url}/{username}/", headers=headers, timeout=10)
            if prof_resp.status_code == 200:
                prof_soup = BeautifulSoup(prof_resp.text, 'html.parser')
                fav_section = prof_soup.find(id='favourites')
                if fav_section:
                    fav_items = []
                    for div in fav_section.find_all('div', class_='react-component'):
                        fav_title = div.get('data-item-full-display-name', '')
                        film_link = div.get('data-item-link', '')
                        target_link = div.get('data-target-link', film_link)
                        fav_items.append((fav_title, film_link, target_link))
                    
                    # Fetch posters in parallel
                    poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in fav_items}
                    for future in concurrent.futures.as_completed(poster_futures):
                        item = poster_futures[future]
                        cover_url = future.result()
                        favorite_films.append({
                            "title": item[0],
                            "link": base_url + item[2] if item[2] else "",
                            "cover_url": cover_url
                        })

            # 3. Fetch Watchlist
            watchlist_films = []
            watch_resp = session.get(f"{base_url}/{username}/watchlist/", headers=headers, timeout=10)
            if watch_resp.status_code == 200:
                watch_soup = BeautifulSoup(watch_resp.text, 'html.parser')
                watch_items = []
                for div in watch_soup.find_all('div', attrs={'data-component-class': 'LazyPoster'})[:10]:
                    watch_title = div.get('data-item-full-display-name', '')
                    target_link = div.get('data-film-link', div.get('data-target-link', ''))
                    watch_items.append((watch_title, target_link))
                
                # Fetch posters in parallel
                poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in watch_items}
                for future in concurrent.futures.as_completed(poster_futures):
                    item = poster_futures[future]
                    cover_url = future.result()
                    watchlist_films.append({
                        "title": item[0],
                        "link": base_url + item[1] if item[1] else "",
                        "cover_url": cover_url
                    })

            executor.shutdown(wait=False)

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
