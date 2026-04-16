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
                        if img:
                            cover_url = img.get('src')
                        
                        # Extract rating, favorite, rewatch from the text
                        # Letterboxd RSS description usually contains "Watched on ...", "Rating: ...", etc.
                        text_content = desc_soup.get_text()
                        
                        # Rating extraction from title (e.g., "Movie Title, 2023 - ★★★★")
                        rating_match = re.search(r' - (★+½?|½)$', title_text)
                        if rating_match:
                            rating = rating_match.group(1)
                        
                        # Rewatch/Favorite check in description or title
                        if "This review may contain spoilers" in text_content or "Watched on" in text_content:
                            if "rewatch" in title_text.lower() or " (rewatch)" in title_text.lower():
                                is_rewatch = True
                        
                        # Check for the heart icon or text in the description
                        if "♥" in title_text or "♥" in desc_html:
                            is_favorite = True

                    # Clean title for display
                    display_title = re.sub(r' - ★+½?|½$', '', title_text)
                    display_title = display_title.replace(' (rewatch)', '').replace(' ♥', '')

                    recent_activity.append({
                        "title": display_title,
                        "rating": rating,
                        "is_rewatch": is_rewatch,
                        "is_favorite": is_favorite,
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
                    # Letterboxd favorites are naturally in order in the DOM
                    for div in fav_section.find_all('div', class_='react-component'):
                        fav_title = div.get('data-item-full-display-name', '')
                        # Remove year from title (usually in format "Movie Title (YYYY)")
                        fav_title = re.sub(r'\s\(\d{4}\)$', '', fav_title)
                        
                        film_link = div.get('data-item-link', '')
                        target_link = div.get('data-target-link', film_link)
                        fav_items.append((fav_title, film_link, target_link))
                    
                    # Fetch posters in parallel
                    poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in fav_items}
                    # To maintain order, we shouldn't use as_completed or we need to sort them back
                    # Using wait and then iterating in original order is better
                    concurrent.futures.wait(poster_futures)
                    for item in fav_items:
                        # find the future for this item
                        for fut, itm in poster_futures.items():
                            if itm == item:
                                cover_url = fut.result()
                                favorite_films.append({
                                    "title": item[0],
                                    "link": base_url + item[2] if item[2] else "",
                                    "cover_url": cover_url
                                })
                                break

            # 3. Fetch Watchlist
            watchlist_films = []
            watch_resp = session.get(f"{base_url}/{username}/watchlist/", headers=headers, timeout=10)
            if watch_resp.status_code == 200:
                watch_soup = BeautifulSoup(watch_resp.text, 'html.parser')
                watch_items = []
                for div in watch_soup.find_all('div', attrs={'data-component-class': 'LazyPoster'})[:7]:  # Limited to 7
                    watch_title = div.get('data-item-full-display-name', '')
                    target_link = div.get('data-film-link', div.get('data-target-link', ''))
                    watch_items.append((watch_title, target_link))
                
                # Fetch posters in parallel
                poster_futures = {executor.submit(get_hd_poster, item[1]): item for item in watch_items}
                concurrent.futures.wait(poster_futures)
                for item in watch_items:
                    for fut, itm in poster_futures.items():
                        if itm == item:
                            cover_url = fut.result()
                            watchlist_films.append({
                                "title": item[0],
                                "link": base_url + item[1] if item[1] else "",
                                "cover_url": cover_url
                            })
                            break

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
