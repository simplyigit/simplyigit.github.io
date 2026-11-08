# simplyigit.me

Personal portfolio of yiğit, live at **[simplyigit.me](https://simplyigit.me)**.

- **Projects:** [Real, Deepfake or AI](https://simplyigit.me/projects/real-deepfake-or-ai) classifies face images with ConvNeXt-Tiny features and a linear SVM. The model is exported to int8 ONNX and runs entirely in the visitor's browser with ONNX Runtime Web. Uploaded images are never sent anywhere.
- **Library of Interest:** live feeds of what I'm listening to (Spotify + Last.fm), watching (Letterboxd) and reading (Goodreads).

Plain HTML, CSS and JavaScript (ES modules), no framework or build step, deployed on Vercel.

## How the live data works

```
GitHub Action (hourly) ── scripts/sync_data.py ──▶ Supabase (portfolio_data table)
                                                        │
Browser ◀── /api/* (Vercel Python functions, edge-cached 10 min + 24 h stale-while-revalidate)
```

- `scripts/sync_data.py` collects Last.fm top tracks and artists (matched to Spotify for links and artwork), Letterboxd favorites, diary and watchlist, Goodreads shelves, and the project READMEs (rendered by GitHub's markdown API). For the #1 track, Gemini picks three short lyric lines. Full lyrics (LRCLIB, with a Lyrica fallback) are only used as input and are never stored or served.
- Each page starts fetching its `/api` endpoint in `<head>`. If the data arrives within ~65 ms it renders directly. Otherwise the page shows its `localStorage` copy (or, on a first visit, the bundled seed) and morphs to fresh data when it lands. See `assets/js/modules/live-data.js`.
- If the API is unreachable, pages fall back to the static snapshots in `data/*.json`.

## Layout

```
index.html, library/*.html, projects/*/index.html   pages
assets/css/base.css + {home,music,cinema,reading,project}.css
                                                    shared styles + one stylesheet per page
assets/js/vt-nav.js                                 page-transition flag (blocking <head> script)
assets/js/pages/*.js                                page scripts
assets/js/modules/                                  shared utilities, cache, live-data loader, seed data
assets/models/                                      ONNX model (file name is versioned; bump it when retraining)
api/                                                Vercel Python functions; _supabase.py holds the shared code
scripts/sync_data.py                                data sync, run by .github/workflows/sync-supabase.yml
data/*.json                                         static fallback snapshots
```

## Development

- `vercel dev` serves the pages and `/api/*`. It needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Without Vercel, `python3 -m http.server` works for the front end. `/api` returns 404 and pages fall back to `data/*.json`. Open pages by file name, e.g. `/library/music.html`, since clean URLs come from `vercel.json`.
- Running `python scripts/sync_data.py` locally, with the environment variables listed in the workflow, updates Supabase and also rewrites `data/*.json` and `assets/js/modules/seed-data.js`.
- After changing a stylesheet or page script, bump its `?v=` query in the HTML. Shared modules aren't versioned; the browser revalidates them on every load.
