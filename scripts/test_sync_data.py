"""Tests for the pure helpers in sync_data.py (no network). Run: pytest scripts/"""
import xml.etree.ElementTree as ET

import pytest

import sync_data
from sync_data import (
    fall_back, fetch_favorite_albums, find_spotify_match, is_valid_payload, parse_letterboxd_item,
    stars_from_rating, strip_title_suffixes, title_key,
)


@pytest.fixture(autouse=True)
def clear_problems():
    sync_data.SYNC_PROBLEMS.clear()
    yield
    sync_data.SYNC_PROBLEMS.clear()


# --- Song titles ---

@pytest.mark.parametrize("title, expected", [
    ("Another You (feat. Sadie Jean)", "Another You"),
    ("Song [with Someone]", "Song"),
    ("Song (ft. X)", "Song"),
    ("Here Comes The Sun - Remastered 2009", "Here Comes The Sun"),
    ("Bad Omens", "Bad Omens"),
])
def test_strip_title_suffixes(title, expected):
    assert strip_title_suffixes(title) == expected


def test_title_key_ignores_case_punctuation_and_suffixes():
    assert title_key("Me Myself & I (feat. X)") == title_key("me myself i")
    assert title_key(None) == ""


def track(name, *artists, id="t"):
    return {"name": name, "id": id, "artists": [{"name": a} for a in artists]}


def test_track_match_needs_artist_and_title():
    results = [track("Other Song", "Ruel", id="1"), track("Painkiller", "Ruel", id="2")]
    assert find_spotify_match(results, "Painkiller", "Ruel", "track")["id"] == "2"
    assert find_spotify_match(results, "Missing", "Ruel", "track") is None
    assert find_spotify_match([track("Painkiller", "Someone Else")], "Painkiller", "Ruel", "track") is None


def test_track_match_artist_billed_anywhere():
    results = [track("Who Do You Love", "The Chainsmokers", "5 Seconds of Summer", id="1")]
    assert find_spotify_match(results, "Who Do You Love", "5 Seconds of Summer", "track")["id"] == "1"


def test_track_match_prefers_exact_then_prefix():
    results = [track("Song (Demo)", "A", id="demo"), track("Song", "A", id="studio")]
    assert find_spotify_match(results, "Song", "A", "track")["id"] == "studio"
    assert find_spotify_match(results[:1], "Song", "A", "track")["id"] == "demo"


def test_track_match_studio_beats_live_listed_first():
    results = [track("Song - Live at X", "A", id="live"), track("Song", "A", id="studio")]
    assert find_spotify_match(results, "Song", "A", "track")["id"] == "studio"
    # Still found when the live or remastered version is all Spotify returns
    assert find_spotify_match(results[:1], "Song", "A", "track")["id"] == "live"
    assert find_spotify_match([track("Song - Remastered 2009", "A", id="rm")], "Song (feat. B)", "A", "track")["id"] == "rm"


def test_artist_match_is_exact_name():
    results = [{"name": "Ruel Tribute", "id": "x"}, {"name": "Ruel", "id": "y"}]
    assert find_spotify_match(results, "Ruel", None, "artist")["id"] == "y"


# --- Letterboxd feed ---

@pytest.mark.parametrize("value, stars", [
    ("3.5", "★★★½"), ("0.5", "½"), ("5.0", "★★★★★"), ("1.0", "★"), ("", ""), (None, ""), ("0", ""),
])
def test_stars_from_rating(value, stars):
    assert stars_from_rating(value) == stars


def feed_item(title, film_title=None, year=None, rating=None, rewatch="No", like="No"):
    """An <item> shaped like Letterboxd's diary RSS (2026-11)."""
    lb = lambda name, value: f"<letterboxd:{name}>{value}</letterboxd:{name}>" if value is not None else ""
    xml = f"""<item xmlns:letterboxd="https://letterboxd.com">
        <title>{title}</title>
        <link>https://letterboxd.com/oneyigit/film/x/</link>
        <description><![CDATA[ <p><img src="https://a.ltrbxd.com/poster.jpg"/></p> <p>Watched on Friday.</p> ]]></description>
        {lb("rewatch", rewatch)}{lb("filmTitle", film_title)}{lb("filmYear", year)}{lb("memberRating", rating)}{lb("memberLike", like)}
    </item>"""
    return ET.fromstring(xml)


def test_parse_regular_entry():
    film = parse_letterboxd_item(feed_item("Catch Me If You Can, 2002 - ★★★★½", "Catch Me If You Can", "2002", "4.5"))
    assert film == {
        "title": "Catch Me If You Can", "rating": "★★★★½", "is_rewatch": False, "is_favorite": False,
        "link": "https://letterboxd.com/oneyigit/film/x/", "cover_url": "https://a.ltrbxd.com/poster.jpg",
    }


def test_parse_half_star_only():
    film = parse_letterboxd_item(feed_item("Bad Film, 2020 - ½", "Bad Film", "2020", "0.5"))
    assert (film["title"], film["rating"]) == ("Bad Film", "½")


def test_parse_spoiler_review():
    film = parse_letterboxd_item(feed_item("Film, 2026 - ★★★ (contains spoilers)", "Film", "2026", "3.0"))
    assert (film["title"], film["rating"]) == ("Film", "★★★")


def test_parse_rewatch_and_like_flags():
    film = parse_letterboxd_item(feed_item("Aladdin, 1992 - ★★★★★", "Aladdin", "1992", "5.0", rewatch="Yes", like="Yes"))
    assert film["is_rewatch"] and film["is_favorite"]


def test_parse_unrated_and_escaped_title():
    film = parse_letterboxd_item(feed_item("Minions &amp; Monsters, 2026", "Minions &amp; Monsters", "2026"))
    assert (film["title"], film["rating"]) == ("Minions & Monsters", "")


@pytest.mark.parametrize("title, expected", [
    ("Film, 2020 - ★★★½", ("Film", "★★★½")),
    ("Bad Film, 2020 - ½", ("Bad Film", "½")),
    ("Film, 2026 - ★★ (contains spoilers)", ("Film", "★★")),
    ("Unrated Film (1999)", ("Unrated Film", "")),
])
def test_parse_falls_back_to_title_text(title, expected):
    film = parse_letterboxd_item(feed_item(title, rewatch=None, like=None))
    assert (film["title"], film["rating"]) == expected
    assert not film["is_rewatch"] and not film["is_favorite"]


# --- Sync bookkeeping ---

def test_is_valid_payload_rejects_errors_and_empty_results():
    assert not is_valid_payload("spotify", {"success": False, "error": "x"})
    assert not is_valid_payload("spotify", None)
    assert is_valid_payload("spotify", {"top_tracks_last_month": [{}]})
    assert not is_valid_payload("movies", {"recent_activity": [], "favorite_films": [], "watchlist": []})
    assert is_valid_payload("books", [{}]) and not is_valid_payload("books", [])
    assert not is_valid_payload("favorite_albums", [{}])


def test_fall_back_reports_reused_and_missing_data():
    assert fall_back("movies", "watchlist", [1], [2]) == [1]
    assert sync_data.SYNC_PROBLEMS == []
    assert fall_back("movies", "watchlist", [], [2]) == [2]
    assert fall_back("books", "books", [], None) == []
    assert [section for section, _ in sync_data.SYNC_PROBLEMS] == ["movies", "books"]


def test_favorite_albums_need_no_network():
    albums = fetch_favorite_albums()
    assert len(albums) == 5
    for album in albums:
        assert album["spotify_url"] == f"https://open.spotify.com/album/{album['spotify_id']}"
        assert len(album["spotify_id"]) == 22
        assert album["prominent_color"] and album["optimized_cover_url"].startswith("https://wsrv.nl/")
