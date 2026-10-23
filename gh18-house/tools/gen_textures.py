"""Generate seamless PBR texture sets (colour / normal / roughness) for the viewer
and the Blender renders.

These are procedural, made here, and released CC0 together with the project.
They stand in for the Poly Haven sets until tools/fetch_polyhaven.py can run
(polyhaven.com is not reachable from the build environment). The viewer reads
assets/textures/manifest.json and prefers a Poly Haven set when one exists.

Usage: python3 tools/gen_textures.py [size]      (default 1024 px, needs numpy + Pillow)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "textures")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
rng = np.random.default_rng(18)


# ------------------------------------------------------------------ periodic noise helpers

def noise(beta=2.0, n=N, aniso=(1.0, 1.0), seed=None):
    """Tileable fractal noise in [0, 1] via a 1/f^beta spectrum."""
    g = np.random.default_rng(seed) if seed is not None else rng
    fx = np.fft.fftfreq(n)[:, None] * aniso[0]
    fy = np.fft.rfftfreq(n)[None, :] * aniso[1]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    spec = (g.normal(size=f.shape) + 1j * g.normal(size=f.shape)) / f ** (beta / 2)
    spec[0, 0] = 0
    out = np.fft.irfft2(spec, s=(n, n))
    out -= out.min()
    return out / out.max()


def grid(n=N):
    y, x = np.mgrid[0:n, 0:n] / n
    return x, y


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    L = np.sqrt(dx ** 2 + dy ** 2 + nz ** 2)
    # OpenGL convention (+Y up), as three.js and Blender expect
    return np.stack([(-dx / L + 1) / 2, (dy / L + 1) / 2, (nz / L + 1) / 2], -1)


def mix(c0, c1, t):
    t = t[..., None]
    return np.array(c0) * (1 - t) + np.array(c1) * t


def save(name, color, height, rough, nstrength, size_m, desc):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f"{name}_color.jpg"), quality=90)
    Image.fromarray((normal_from_height(height, nstrength) * 255).astype(np.uint8)).save(os.path.join(OUT, f"{name}_normal.jpg"), quality=92)
    rough = np.broadcast_to(np.asarray(rough, dtype=float), color.shape[:2])
    Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f"{name}_rough.jpg"), quality=90)
    return {"color": f"textures/{name}_color.jpg", "normal": f"textures/{name}_normal.jpg",
            "rough": f"textures/{name}_rough.jpg", "size_m": size_m, "source": "procedural (gen_textures.py)", "license": "CC0", "desc": desc}


def rgb(hexs):
    hexs = hexs.lstrip("#")
    return [int(hexs[i:i + 2], 16) / 255 for i in (0, 2, 4)]


# ------------------------------------------------------------------ materials

def marble(base, vein, vein_amt, seed):
    x, y = grid()
    turb = noise(4.0, seed=seed)
    warp = noise(4.5, seed=seed + 1)
    # veins: zero-crossings of a warped periodic ramp (periodic in x and y)
    v = np.sin(2 * np.pi * (x + y) + 7.0 * turb + 2.5 * warp)
    veins = np.exp(-np.abs(v) * 6) * vein_amt
    v2 = np.sin(2 * np.pi * (2 * x - y) + 6.0 * noise(4.0, seed=seed + 2))
    fine = np.exp(-np.abs(v2) * 18) * vein_amt * 0.55
    cloud = noise(3.6, seed=seed + 3)
    col = mix(base, np.array(base) * 0.93, cloud)
    t = np.clip(veins + fine, 0, 1)[..., None]
    col = col * (1 - t) + np.array(vein) * t
    h = (veins + fine) * 0.3 + cloud * 0.05
    rough = 0.22 + 0.08 * cloud + 0.05 * veins
    return col, h, rough


def walnut(fluted=False):
    x, y = grid()
    n1 = noise(3.6, aniso=(12.0, 1.0), seed=40)      # long features along y (vertical grain)
    n2 = noise(3.6, seed=41)
    lines = np.sin(2 * np.pi * (x * 40 + 6.0 * n1))
    t = np.clip(0.5 + 0.35 * lines + (n2 - 0.5) * 0.8, 0, 1)
    col = mix(rgb("#4a2f1e"), rgb("#8a6342"), t)
    pores = (noise(0.8, aniso=(25.0, 1.0), seed=42) > 0.8) * 0.08
    col = col * (1 - pores[..., None])
    h = lines * 0.05 + pores
    if fluted:      # 24 flutes across the 0.6 m tile = 25 mm flutes
        fl = np.abs(np.sin(np.pi * x * 24))
        h = h * 0.3 + fl * 1.2
        col = col * (0.82 + 0.18 * fl[..., None])
    rough = 0.48 + 0.12 * n2
    return col, h, rough


def tiles(cols, rows, base, var, grout, grout_w, seed, stagger=False, jitter=0.04):
    """Rectangular tiles across the texture; cols x rows per tile of texture."""
    x, y = grid()
    r = np.floor(y * rows)
    xs = x * cols + (0.5 * (r % 2) if stagger else 0)
    c = np.floor(xs) % cols
    fx, fy = xs - np.floor(xs), y * rows - r
    gx = grout_w * cols
    gy = grout_w * rows
    g = ((fx < gx) | (fx > 1 - gx) | (fy < gy) | (fy > 1 - gy)).astype(float)
    tile_id = (r * 131 + c * 17) % 97
    tone = (np.sin(tile_id * 12.9898) * 43758.5453) % 1.0
    n = noise(2.4, seed=seed)
    col = mix(base, var, np.clip(0.5 * tone + 0.5 * n, 0, 1)) * (1 + (rng.random() - 0.5) * jitter)
    col = col * (1 - g[..., None]) + np.array(grout) * g[..., None]
    return col, g, n, tone, fx, fy, r


def main():
    man = {}
    # floors & stone
    c, h, r = marble(rgb("#ece2d1"), rgb("#b39c80"), 0.55, 1)
    man["marble_beige"] = save("marble_beige", c, h, r, 2.0, 1.2, "Light beige Italian marble, honed")
    c, h, r = marble(rgb("#f3f1ed"), rgb("#6f7176"), 0.75, 7)
    man["marble_white"] = save("marble_white", c, h, r, 2.0, 1.2, "White statuario-style marble")
    # walnut
    c, h, r = walnut()
    man["walnut"] = save("walnut", c, h, r, 3.0, 0.8, "Walnut veneer, matte")
    c, h, r = walnut(fluted=True)
    man["walnut_fluted"] = save("walnut_fluted", c, h, r, 5.0, 0.6, "Fluted walnut panel, 25 mm flutes")
    # plaster
    n = noise(2.8, seed=60)
    c = mix(rgb("#f4efe6"), rgb("#ebe4d8"), n)
    man["plaster"] = save("plaster", c, n * 0.3, 0.88 + 0.06 * n, 1.5, 2.0, "Warm white painted plaster")
    # large format tiles 1200x600 (texture = 1.2 x 1.2 m: 1 col x 2 rows)
    c, g, n, *_ = tiles(1, 2, rgb("#cfc8bd"), rgb("#c4bcaf"), rgb("#a9a297"), 0.0018, 61)
    man["tile_matte_lg"] = save("tile_matte_lg", c, 1 - g * 0.6 + n * 0.02, 0.62 + 0.1 * n, 2.5, 1.2, "Large-format matte porcelain 1200x600")
    c, g, n, *_ = tiles(1, 2, rgb("#5a5652"), rgb("#4d4945"), rgb("#3a3734"), 0.0018, 62)
    man["tile_matte_dark"] = save("tile_matte_dark", c, 1 - g * 0.6 + n * 0.02, 0.6 + 0.1 * n, 2.5, 1.2, "Large-format matte porcelain, charcoal")
    c, g, n, *_ = tiles(2, 2, rgb("#e1ddd5"), rgb("#d6d1c7"), rgb("#b8b2a7"), 0.003, 63)
    man["vitrified"] = save("vitrified", c, 1 - g * 0.6, 0.45 + 0.1 * n, 2.5, 1.2, "Vitrified tile 600x600")
    # deck tiles 1200x200 staggered (texture 1.2 x 1.2 m: 1 col x 6 rows)
    x, y = grid()
    c, g, n, tone, fx, fy, rr = tiles(1, 6, rgb("#a07a52"), rgb("#7f5d3c"), rgb("#4a3a2a"), 0.004, 64, stagger=True)
    grain = noise(2.0, aniso=(14.0, 1.0), seed=65)
    c = c * (0.85 + 0.3 * grain[..., None])
    man["deck_tile"] = save("deck_tile", c, (1 - g) * 0.8 + grain * 0.2, 0.7 + 0.15 * n, 3.0, 1.2, "Wood-look porcelain deck tile 1200x200")
    # granite (flamed)
    s1 = noise(0.6, seed=66)
    s2 = noise(0.4, seed=67)
    c = mix(rgb("#8f8c87"), rgb("#bdbab4"), s1)
    c = c * (1 - (s2 > 0.8)[..., None] * 0.5)
    man["granite_flamed"] = save("granite_flamed", c, s1 * 0.5 + s2 * 0.3, 0.8 + 0.1 * s1, 3.0, 0.8, "Flamed grey granite")
    # cobble setts 100 mm (texture 1 x 1 m)
    c, g, n, tone, fx, fy, rr = tiles(10, 10, rgb("#8a847b"), rgb("#6e6a63"), rgb("#4d4a45"), 0.012, 68, stagger=True, jitter=0.1)
    dome = np.clip(np.sin(np.pi * fx) * np.sin(np.pi * fy), 0, 1) ** 0.5
    man["cobble"] = save("cobble", c * (0.85 + 0.2 * dome[..., None]), dome * (1 - g) + n * 0.1, 0.8 + 0.1 * n, 4.0, 1.0, "Cobble stone setts")
    # grass
    b1 = noise(1.2, seed=70)
    b2 = noise(0.5, seed=71)
    c = mix(rgb("#4f7a2e"), rgb("#8db35a"), np.clip(0.6 * b1 + 0.4 * b2, 0, 1))
    man["grass"] = save("grass", c, b2, 0.95 - 0.05 * b1, 6.0, 1.5, "Lawn")
    # pebbles
    p = noise(0.3, seed=72)
    cells = np.abs(np.sin(2 * np.pi * (noise(1.5, seed=73) * 9)))
    c = mix(rgb("#d9d5cc"), rgb("#f2efe8"), cells) * (0.9 + 0.1 * p[..., None])
    man["pebbles"] = save("pebbles", c, cells, 0.7 + 0.2 * p, 5.0, 0.8, "White pebbles")
    # concrete
    n = noise(2.2, seed=74)
    c = mix(rgb("#aaa59e"), rgb("#c3beb6"), n)
    man["concrete"] = save("concrete", c, n * 0.2, 0.85, 1.5, 2.0, "Plastered concrete")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1)
    print("wrote %d texture sets to %s (%d px)" % (len(man), OUT, N))


if __name__ == "__main__":
    main()
