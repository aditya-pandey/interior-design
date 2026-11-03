"""Download the real (photo-scanned, CC0) textures and sky images for /play/ from Poly Haven.

Poly Haven can't be reached from the build environment, so run this on your own computer:

    cd gh18-house
    python3 tools/fetch_play_textures.py            # ~60 MB, a few minutes
    git add viewer/play/textures && git commit -m "Play: Poly Haven textures" && git push

It writes JPG maps (colour, normal, roughness, and AO where there is one) and an HDR daytime sky into
viewer/play/textures/, plus manifest.json, which /play/ reads at start-up. Without them /play/ uses its
generated textures. The main tour (/ and /v1/) is not touched.

Each material lists preferred Poly Haven assets; if none of them exists any more, the closest asset is
found in Poly Haven's catalogue by keyword, and the choice is printed. Licence: CC0
(https://polyhaven.com/license); each asset's page is recorded in the manifest.
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "viewer", "play", "textures")
API = "https://api.polyhaven.com"
UA = {"User-Agent": "gh18-house/1.0 (play texture fetch)"}

# key -> (preferred asset ids, search keywords, resolution, real-world tile size in metres)
TEXTURES = {
    "sand":      (["coast_sand_01", "coast_sand_02", "aerial_beach_01", "sand_01"], ["sand", "beach"], "2k", 3.0),
    "ground":    (["dry_ground_01", "brown_mud_dry", "aerial_ground_rock", "dirt"], ["dry", "ground", "soil"], "2k", 6.0),
    "asphalt":   (["asphalt_02", "asphalt_track", "rough_asphalt", "asphalt_01"], ["asphalt", "road"], "2k", 4.0),
    "deck":      (["wood_floor_deck", "weathered_planks", "wooden_planks", "brown_planks_03"], ["planks", "deck"], "2k", 2.4),
    "floor_oak": (["laminate_floor_02", "wood_floor", "oak_veneer_01", "wood_floor_worn"], ["wood floor", "parquet", "laminate"], "2k", 2.4),
    "oak":       (["oak_veneer_01", "fine_grained_wood", "wood_table_001", "kitchen_wood"], ["oak", "veneer", "wood"], "1k", 1.0),
    "dark_wood": (["dark_wood", "wood_table_001", "dark_wooden_planks", "wood_cabinet_worn_long"], ["dark wood", "walnut"], "1k", 1.0),
    "plywood":   (["plywood", "plywood_02", "fine_grained_wood"], ["plywood", "birch"], "1k", 1.2),
    "plaster":   (["white_plaster_02", "painted_plaster_wall", "beige_wall_001", "plastered_wall"], ["plaster", "wall"], "2k", 2.0),
    "linen":     (["fabric_pattern_05", "fabric_pattern_07", "denim_fabric", "fabric_leather_01"], ["fabric", "linen", "cloth"], "1k", 0.6),
}
# sky images: [key, preferred ids, keywords]. Only the daytime sky is photographed; evening, sunset, dusk and
# night are drawn by /play/ itself so they can change smoothly from one to the next.
HDRIS = [
    ["sky_day", ["kloofendal_48d_partly_cloudy_puresky", "kloppenheim_06_puresky", "syferfontein_0d_clear_puresky"], ["puresky", "clear"]],
]
MAPS = (("color", ["Diffuse", "diff"]), ("normal", ["nor_gl"]), ("rough", ["Rough", "rough"]), ("ao", ["AO", "ao"]))


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def pick(kind, preferred, keywords, catalogue):
    for a in preferred:
        if a in catalogue:
            return a
    for kw in keywords:
        for slug, meta in catalogue.items():
            hay = (slug + " " + meta.get("name", "") + " " + " ".join(meta.get("tags", [])) + " " + " ".join(meta.get("categories", []))).lower()
            if all(w in hay for w in kw.split()):
                return slug
    raise SystemExit("no Poly Haven %s found for %s / %s" % (kind, preferred, keywords))


def main():
    os.makedirs(OUT, exist_ok=True)
    tex_cat = json.loads(get(API + "/assets?t=textures"))
    hdr_cat = json.loads(get(API + "/assets?t=hdris"))
    manifest = {"note": "Poly Haven (CC0) textures for /play/, fetched by tools/fetch_play_textures.py", "textures": {}, "hdri": {}}
    for key, (pref, kws, res, size) in TEXTURES.items():
        asset = pick("texture", pref, kws, tex_cat)
        files = json.loads(get("%s/files/%s" % (API, asset)))
        entry = {"asset": asset, "size_m": size, "source": "https://polyhaven.com/a/" + asset, "license": "CC0"}
        for kind, names in MAPS:
            f = next((files[n] for n in names if n in files), None)
            if not f or res not in f:
                continue
            url = f[res]["jpg"]["url"]
            name = "%s_%s.jpg" % (key, kind)
            dst = os.path.join(OUT, name)
            if not os.path.exists(dst):
                open(dst, "wb").write(get(url))
            entry[kind] = name
        manifest["textures"][key] = entry
        print("%-10s <- %s (%s)" % (key, asset, ", ".join(k for k, _ in MAPS if k in entry)))
    for key, pref, kws in HDRIS:
        asset = pick("hdri", pref, kws, hdr_cat)
        files = json.loads(get("%s/files/%s" % (API, asset)))
        url = files["hdri"]["2k"]["hdr"]["url"]
        name = key + ".hdr"
        dst = os.path.join(OUT, name)
        if not os.path.exists(dst):
            open(dst, "wb").write(get(url))
        manifest["hdri"][key] = {"asset": asset, "file": name, "source": "https://polyhaven.com/a/" + asset, "license": "CC0"}
        print("%-10s <- %s" % (key, asset))
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1e6
    print("\nwrote %s (%.0f MB). Now commit viewer/play/textures and push." % (OUT, total))


if __name__ == "__main__":
    sys.exit(main())
