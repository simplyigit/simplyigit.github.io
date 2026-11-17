# simplyigit.me

Personal portfolio of yiğit, live at **[simplyigit.me](https://simplyigit.me)**.

- **Projects:** [Real, Deepfake or AI](https://simplyigit.me/projects/real-deepfake-or-ai) classifies face images with ConvNeXt-Tiny features and a linear SVM. The model is exported to int8 ONNX and runs entirely in the visitor's browser with ONNX Runtime Web. Uploaded images are never sent anywhere.
- **Library of Interest:** live feeds of what I'm listening to (Spotify + Last.fm) and watching (Letterboxd). Reading (Goodreads) is deprecated: Goodreads closed its RSS feeds and put shelves behind sign-in in November 2026, so the homepage book card shows the last stored books with a "Deprecated" label, isn't a link, and `/library/reading` redirects home (`vercel.json`).

Plain HTML, CSS and JavaScript (ES modules), no framework or build step, deployed on Vercel.

## How the live data works

```
GitHub Action (hourly) ── scripts/sync_data.py ──▶ Supabase (portfolio_data table)
                                                        │
Browser ◀── /api/* (Vercel Python functions, edge-cached 10 min + 24 h stale-while-revalidate)
```

- `scripts/sync_data.py` collects Last.fm top tracks and artists (matched to Spotify for links and artwork), Letterboxd diary and watchlist (the four favourite films are listed in `FAVORITE_FILMS`, since Letterboxd's profile page sits behind a Cloudflare challenge; their posters still come from each film's page), and the project READMEs (rendered by GitHub's markdown API). For the #1 track, Gemini picks three short lyric lines. Full lyrics (LRCLIB, with a Lyrica fallback) are only used as input and are never stored or served. Each top track also gets a 30-second preview URL from the iTunes Search API (Spotify's API no longer returns previews); tracks Apple doesn't carry simply have no play button.
- Each sync also writes a `sync_meta` row with its time and, per section, when that section last synced without problems. The `/api` functions pass on the oldest of the sections a page shows as `synced_at`, which the footer shows as "Synced 12 min ago".
- The anon key can read only the public rows (`spotify`, `books`, `movies`, `projects`, `sync_meta`; a Supabase select policy). A new public row has to be added to that policy; everything else, like the Spotify refresh token, stays private.
- When any section fails, reuses stored data, or doesn't upload, the sync still stores what it can and then exits with an error, so the Action fails and GitHub emails the repo owner.
- Each page starts fetching its `/api` endpoint in `<head>`. If the data arrives within ~65 ms it renders directly. Otherwise the page shows its `localStorage` copy (or, on a first visit, the bundled seed) and morphs to fresh data when it lands. See `assets/js/modules/live-data.js`.
- If the API is unreachable, pages fall back to the static snapshots in `data/*.json`.

## Page transitions

Pages crossfade with cross-document view transitions. Between the homepage and a library page one element also morphs: the cassette's cover art into the #1 track's art, a VHS poster into that film's poster, the book into its cover (and back). `assets/js/vt-nav.js` names the two elements; each page script tells it which ones through `window.__vtMorph`. For the landing element to exist at the first frame, the page scripts sit in `<head>` with `blocking="render"`, and a page reached through a transition renders its cached data at once (`live-data.js`). Browsers without these features just crossfade.

The background mesh takes its hues from the covers (`setAmbientTint` in `core.js`): on the homepage one glow per library object (the book bottom-left, the #1 track in the middle, the latest film bottom-right), each also washing its own card; on the music page the visible tab's first cover. The sync stores each cover's `prominent_color`; without one the page works it out from the image. Keys `1` / `2` / `3` open Reading, Music and Cinema.

## Layout

```
index.html, library/*.html, projects/*/index.html   pages
404.html                                            shown by Vercel for any unknown URL
assets/css/base.css + {home,music,cinema,reading,project}.css
                                                    shared styles + one stylesheet per page
assets/js/vt-nav.js                                 page-transition flag and morph (blocking <head> script)
assets/js/pages/*.js                                page scripts
assets/js/modules/                                  shared utilities, cache, live-data loader, preview player, seed data
assets/models/                                      ONNX model (file name is versioned; bump it when retraining)
api/                                                Vercel Python functions; _supabase.py holds the shared code
scripts/sync_data.py                                data sync, run by .github/workflows/sync-supabase.yml
scripts/test_*.py, scripts/js-tests/                tests (sync helpers, pages vs vercel.json, resize parity), run by .github/workflows/tests.yml
scripts/dev_server.py                               local server that behaves like Vercel
data/*.json                                         static fallback snapshots
```

## Development

- `vercel dev` serves the pages and `/api/*`. It needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Without Vercel, `python3 scripts/dev_server.py` serves the site like Vercel does: clean URLs, the rewrites and headers in `vercel.json`, the 404 page and the `/api` functions (with live data if `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set).
- `python3 -m http.server` also works for the front end. `/api` returns 404 and pages fall back to `data/*.json`. Open pages by file name, e.g. `/library/music.html`, since clean URLs come from `vercel.json`.
- Running `python scripts/sync_data.py` locally, with the environment variables listed in the workflow, updates Supabase and also rewrites `data/*.json` and `assets/js/modules/seed-data.js`.
- `pytest scripts/` runs the sync tests and checks the pages against `vercel.json`; `node --test scripts/js-tests/*.test.mjs` checks the detector's resize against Pillow and the music title helpers. Neither needs network or credentials, and `.github/workflows/tests.yml` runs both on every push. After upgrading Pillow, regenerate the resize fixtures with `python scripts/js-tests/make_pillow_fixtures.py`.
- After changing a stylesheet or page script, bump its `?v=` query in the HTML. Shared modules aren't versioned; the browser revalidates them on every load.
- `localStorage` holds one entry, `simplyigit_dashboard_cache_v2` (`assets/js/modules/cache.js`). Bump its version when the stored shape changes; older entries are then ignored and removed.
- `vercel.json` sends a Content-Security-Policy, for now as `Content-Security-Policy-Report-Only` (violations are only logged in the console). The inline prefetch `<script>`s are allowed by their SHA-256 hash: after editing one, update its hash in `script-src` (`pytest scripts/` fails until you do). Cloudflare's injected bot-detection script can't be allowed by hash; turn off Cloudflare's JavaScript detections before switching the header to `Content-Security-Policy`.
