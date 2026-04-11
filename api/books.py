from http.server import BaseHTTPRequestHandler
import json
import requests
from bs4 import BeautifulSoup
import time

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Set aggressive caching headers to explicitly prevent page loading latency
        # s-maxage=86400 -> Vercel edge CDN caches the response for 24 hours.
        # stale-while-revalidate -> Vercel serves the old cache instantly to users, while rebuilding the new cache invisibly in the background!
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Cache-Control', 's-maxage=86400, stale-while-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            import xml.etree.ElementTree as ET
            import re
            
            # Using the RSS feed bypasses the Goodreads Sign-In gate!
            url = 'https://www.goodreads.com/review/list_rss/199124060?shelf=to-read'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            rss_response = requests.get(url, headers=headers)
            if rss_response.status_code != 200:
                raise Exception(f"Failed to fetch Goodreads RSS: {rss_response.status_code}")
                
            root = ET.fromstring(rss_response.content)
            items = root.findall('./channel/item')
            
            books_data = []
            for item in items:
                title = item.find('title').text if item.find('title') is not None else "Unknown Title"
                author = item.find('author_name').text if item.find('author_name') is not None else "Unknown Author"
                cover_url = item.find('book_image_url').text if item.find('book_image_url') is not None else ""
                link = item.find('link').text if item.find('link') is not None else "#"
                
                # Remove thumbnail constraints (e.g. `._SY75_`) to get clearer/higher-res covers
                if cover_url:
                    cover_url = re.sub(r'\._[A-Za-z0-9]+_\.', '.', cover_url)

                books_data.append({
                    "title": title,
                    "author": author,
                    "cover_url": cover_url,
                    "link": link
                })

            response = {
                "success": True,
                "data": books_data,
                "timestamp": time.time()
            }
            
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            error_response = {"success": False, "error": str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
        return
