"""Checks the pages against vercel.json (no network). Run: pytest scripts/"""
import base64
import glob
import hashlib
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [os.path.relpath(p, ROOT) for p in [
    os.path.join(ROOT, "index.html"), os.path.join(ROOT, "404.html"),
    *sorted(glob.glob(os.path.join(ROOT, "library", "*.html"))),
    *sorted(glob.glob(os.path.join(ROOT, "projects", "*", "index.html"))),
]]


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def csp_directives():
    config = json.loads(read("vercel.json"))
    rule = next(r for r in config["headers"] if r["source"] == "/(.*)")
    value = next(h["value"] for h in rule["headers"] if h["key"].startswith("Content-Security-Policy"))
    return {d.split()[0]: d.split()[1:] for d in (part.strip() for part in value.split(";")) if d}


@pytest.mark.parametrize("page", PAGES)
def test_inline_scripts_are_allowed_by_csp_hash(page):
    # Editing an inline <script> changes its hash: update script-src in vercel.json to match
    allowed = csp_directives()["script-src"]
    for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", read(page), re.S):
        digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
        assert f"'sha256-{digest}'" in allowed, f"{page}: inline script not in the CSP: {body[:60]}"


@pytest.mark.parametrize("page", PAGES)
def test_no_inline_event_handlers(page):
    # A CSP without 'unsafe-inline' scripts blocks onclick= and friends
    assert not re.search(r"<[^>]+\son[a-z]+\s*=", read(page)), page


def test_csp_hashes_are_all_in_use():
    in_use = set()
    for page in PAGES:
        for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", read(page), re.S):
            in_use.add("'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'")
    listed = {s for s in csp_directives()["script-src"] if s.startswith("'sha256-")}
    assert listed == in_use


def test_rewrite_destinations_exist():
    for rule in json.loads(read("vercel.json"))["rewrites"]:
        if "$" not in rule["destination"]:
            assert os.path.isfile(os.path.join(ROOT, rule["destination"].lstrip("/"))), rule
