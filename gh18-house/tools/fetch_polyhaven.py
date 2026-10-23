"""Download the Poly Haven (CC0) texture sets and HDRIs used by the viewer and renders.

Poly Haven was not reachable from the build environment, so the repository ships
procedural stand-ins (tools/gen_textures.py). Run this on a machine with internet
access; it downloads 1k/2k JPG maps into assets/polyhaven/<asset>/ and repoints
assets/textures/manifest.json at them. The viewer picks them up on reload.

Usage: python3 tools/fetch_polyhaven.py [--res 2k]
Licence: all Poly Haven assets are CC0 (https://polyhaven.com/license).
"""
import argparse
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
API = "https://api.polyhaven.com/files/%s"

# material key in manifest.json -> (Poly Haven asset id, real-world tile size in metres)
TEXTURES = {
    "marble_beige": ("marble_01", 1.5),
    "marble_white": ("marble_01", 1.5),
    "walnut": ("wood_table_001", 1.0),
    "walnut_fluted": ("wood_table_001", 1.0),
    "plaster": ("painted_plaster_wall", 2.0),
    "tile_matte_lg": ("large_square_tiles", 2.0),
    "tile_matte_dark": ("large_square_tiles", 2.0),
    "deck_tile": ("wood_floor_deck", 2.0),
    "granite_flamed": ("granite_tile", 1.0),
    "cobble": ("cobblestone_floor_01", 2.0),
    "grass": ("aerial_grass_rock", 3.0),
    "pebbles": ("gravel_floor", 1.5),
    "concrete": ("concrete_wall_008", 2.0),
}
HDRIS = ["kloofendal_48d_partly_cloudy_puresky", "venice_sunset", "spruit_sunrise"]
UA = {"User-Agent": "gh18-house/1.0 (asset fetch)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", default="1k", choices=["1k", "2k", "4k"])
    args = ap.parse_args()
    man_path = os.path.join(ASSETS, "textures", "manifest.json")
    manifest = json.load(open(man_path))
    done = {}
    for key, (asset, size) in TEXTURES.items():
        if asset not in done:
            files = json.loads(get(API % asset))
            out = os.path.join(ASSETS, "polyhaven", asset)
            os.makedirs(out, exist_ok=True)
            paths = {}
            for kind, names in (("color", ["Diffuse", "diff"]), ("normal", ["nor_gl"]), ("rough", ["Rough", "rough"])):
                entry = next((files[n] for n in names if n in files), None)
                if not entry:
                    continue
                url = entry[args.res]["jpg"]["url"]
                dst = os.path.join(out, os.path.basename(url))
                if not os.path.exists(dst):
                    open(dst, "wb").write(get(url))
                paths[kind] = os.path.relpath(dst, ASSETS).replace(os.sep, "/")
            done[asset] = paths
            print("fetched", asset, sorted(paths))
        p = done[asset]
        if {"color", "normal", "rough"} <= set(p):
            manifest[key] = dict(manifest.get(key, {}), color=p["color"], normal=p["normal"], rough=p["rough"], size_m=size,
                                 source="Poly Haven: https://polyhaven.com/a/%s" % asset, license="CC0")
    for h in HDRIS:
        files = json.loads(get(API % h))
        url = files["hdri"]["2k"]["hdr"]["url"]
        dst = os.path.join(ASSETS, "polyhaven", "hdri", os.path.basename(url))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            open(dst, "wb").write(get(url))
        print("fetched hdri", h)
    json.dump(manifest, open(man_path, "w"), indent=1)
    print("manifest updated:", man_path)


if __name__ == "__main__":
    main()
