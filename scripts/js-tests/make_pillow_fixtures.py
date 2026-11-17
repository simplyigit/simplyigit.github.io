"""Writes pillow-fixtures.json: what Pillow's bilinear resize (the model's training preprocessing)
produces for a few generated images. pillow-resize.test.mjs checks pillow-resize.js against it.

Run from the repo root after changing a case or upgrading Pillow: python scripts/js-tests/make_pillow_fixtures.py
"""
import json
import os

import PIL
from PIL import Image

# (pattern, srcW, srcH, outW, outH): downscales like real photos, an upscale, odd ratios, and the 224 target
CASES = [
    ("noise", 40, 30, 17, 11),
    ("noise", 9, 7, 20, 15),
    ("gradient", 120, 90, 28, 21),
    ("noise", 449, 337, 224, 224),
    ("gradient", 1000, 750, 224, 224),
    ("noise", 224, 224, 224, 224),
]
M = 0xFFFFFFFF


def pixels(pattern, w, h):
    """RGBA bytes, generated the same way as in pillow-resize.test.mjs."""
    out = bytearray(w * h * 4)
    x = 2463534242
    for i in range(w * h):
        if pattern == "noise":
            for c in range(3):
                # xorshift32
                x ^= (x << 13) & M
                x ^= x >> 17
                x ^= (x << 5) & M
                out[i * 4 + c] = x & 255
        else:
            px, py = i % w, i // w
            out[i * 4] = px * 255 // (w - 1)
            out[i * 4 + 1] = py * 255 // (h - 1)
            out[i * 4 + 2] = (px + py) * 255 // (w + h - 2)
        out[i * 4 + 3] = 255
    return bytes(out)


def fnv1a(data):
    h = 0x811C9DC5
    for b in data:
        h = ((h ^ b) * 0x01000193) & M
    return h


def main():
    cases = []
    for pattern, sw, sh, ow, oh in CASES:
        img = Image.frombytes("RGBA", (sw, sh), pixels(pattern, sw, sh)).convert("RGB")
        out = img.resize((ow, oh), Image.BILINEAR).tobytes()
        cases.append({"pattern": pattern, "srcW": sw, "srcH": sh, "outW": ow, "outH": oh,
                      "fnv1a": fnv1a(out), "head": list(out[:12])})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pillow-fixtures.json")
    with open(path, "w") as f:
        json.dump({"pillow": PIL.__version__, "cases": cases}, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(cases)} cases (Pillow {PIL.__version__}) to {path}")


if __name__ == "__main__":
    main()
