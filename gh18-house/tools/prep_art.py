"""Turn the client's photos of their paintings into textures for the 3D viewer.

The photos themselves are kept out of the (public) repo. To rebuild, put them in a folder as
buddha.webp, gallery.webp, elephant.webp, horses.webp and run
    python3 tools/prep_art.py /path/to/photos
Needs opencv-python-headless + numpy. Writes assets/art/*.jpg|png and assets/art/gallery.json.

Framed paintings: the four canvas corners (inside the liner / mat) were read off the photos and
warped to a true rectangle at the canvas aspect. Glass glare was patched by cloning nearby (or the
mirror-symmetric) texture, not by blurring. Frames are modelled in 3D, so only the canvas is kept.
Gallery wall: each canvas is a box in the photo (auto-detected, a few fixed by hand); the photo is
roughly frontal, at ~1.39 mm per px (from 20x20 and 30x40 cm canvases).
"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'art')

FRAMED = {   # name: (canvas corners TL, TR, BR, BL in photo px, canvas mm)
    'buddha': ([(171, 167), (775, 174), (835, 960), (115, 960)], (400, 500)),
    'elephant': ([(138, 340), (1425, 327), (1420, 1002), (155, 1020)], (750, 400)),
    'horses': ([(108, 122), (1468, 95), (1602, 839), (-113, 794)], (1000, 500)),   # BL is off the photo: mirrored fill
}
PX_PER_MM = 2.0          # texture resolution for the framed canvases


def rectify(img, pts, w, h, inset=3):
    dst = np.float32([[-inset, -inset], [w - 1 + inset, -inset], [w - 1 + inset, h - 1 + inset], [-inset, h - 1 + inset]])
    M = cv2.getPerspectiveTransform(np.float32(pts), dst)
    return cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)


def clone(img, spots):
    """Replace soft discs (cx, cy, r) with the texture offset by (dx, dy)."""
    out = img.astype(np.float32)
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    for cx, cy, r, dx, dy in spots:
        a = np.clip((r - np.hypot(xx - cx, yy - cy)) / (r * 0.35), 0, 1)[..., None]
        sh = np.roll(np.roll(img, -dy, axis=0), -dx, axis=1).astype(np.float32)
        out = out * (1 - a) + sh * a
    return np.clip(out, 0, 255).astype(np.uint8)


def mirror_patch(img, axis_x, ellipse):
    """Blend in the mirror image (about x = axis_x) inside a feathered ellipse."""
    H, W = img.shape[:2]
    mir = np.roll(img[:, ::-1], -(W - 1 - 2 * axis_x), axis=1)
    m = np.zeros((H, W), np.float32)
    cv2.ellipse(m, *ellipse, 1, -1)
    m = cv2.GaussianBlur(m, (0, 0), 7)[..., None]
    return (img * (1 - m) + mir * m).astype(np.uint8)


def framed(src):
    for name, (pts, (wmm, hmm)) in FRAMED.items():
        img = cv2.imread(os.path.join(src, name + '.webp'))
        if name == 'horses':                       # 1200x600 first so the fixes below are in that space
            r = rectify(img, pts, 2000, 1000)
            r = cv2.resize(r[6:, 12:], (2000, 1000), interpolation=cv2.INTER_LANCZOS4)   # trim the liner sliver
            r = clone(r, [(1028, 975, 78, -175, -10), (1560, 975, 66, 150, -8), (1502, 993, 26, -60, -6)])
        elif name == 'buddha':
            r = rectify(img, pts, 1200, 1500)
            r = clone(r, [(377, 1102, 44, -60, 0)])
        else:
            r = rectify(img, pts, 1800, 960)
            r = mirror_patch(r, 898, ((652, 262), (52, 26), 8, 0, 360))
        r = cv2.resize(r, (int(wmm * PX_PER_MM), int(hmm * PX_PER_MM)), interpolation=cv2.INTER_AREA)
        if name == 'buddha':                       # black mat (60 mm) with a cream bevel, as framed
            mat = int(60 * PX_PER_MM)
            H, W = r.shape[:2]
            out = np.full((H + 2 * mat, W + 2 * mat, 3), (30, 27, 28), np.uint8)
            out += np.random.default_rng(1).integers(0, 5, out.shape, dtype=np.uint8)   # felt-like grain
            cv2.rectangle(out, (mat - 5, mat - 5), (mat + W + 4, mat + H + 4), (196, 214, 226), -1)
            out[mat:mat + H, mat:mat + W] = r
            r = out
        cv2.imwrite(os.path.join(OUT, name + '.jpg'), r, [cv2.IMWRITE_JPEG_QUALITY, 86])
        print(name, r.shape[1], 'x', r.shape[0])


# gallery wall: (x, y, w, h) boxes in the 1600x1200 photo, left-to-right reading order irrelevant
GALLERY = [
    ('couple_bench', (142, 103, 287, 207)), ('chakra_yogi', (453, 152, 148, 177)), ('golden_buds', (614, 153, 145, 143)),
    ('birds_branch', (778, 257, 154, 148)), ('sunset_pair', (1161, 137, 284, 212)), ('heart_couple', (465, 341, 295, 220)),
    ('fairies', (160, 333, 293, 214)), ('little_buddha', (781, 427, 138, 142)), ('girl_tree', (1100, 391, 151, 189)),
    ('solar_system', (1296, 363, 187, 143)), ('moon_dancer', (113, 561, 154, 183)), ('elephant_moon', (286, 627, 155, 153)),
    ('girl_butterfly', (481, 615, 189, 149)), ('guitar', (696, 583, 291, 221)), ('blue_flower', (1044, 603, 154, 194)),
    ('sun', (1280, 527, 121, 380)), ('moon_night', (1397, 695, 134, 390)), ('swing_girl', (1137, 890, 150, 195)),
    ('lovers_sunset', (81, 794, 211, 243)), ('glitter_trees', (317, 837, 157, 201)), ('do_what_you_love', (531, 815, 161, 161)),
    ('dragonflies', (721, 823, 153, 159)), ('shiva', (895, 854, 222, 200)), ('lanterns', (491, 989, 388, 131)),
]
CUTOUT = ('elephant_cutout', (930, 195, 215, 225))   # wooden cut-out: kept with alpha, hook removed
MM_PER_PX = 1.39


def largest(m):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    return (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)


def gallery(src):
    img = cv2.imread(os.path.join(src, 'gallery.webp'))
    # pack the crops into one atlas (keeps one texture + one draw call)
    pad, W = 6, 1760
    items, x, y, rowh = [], pad, pad, 0
    crops = []
    for name, (bx, by, bw, bh) in GALLERY:
        c = img[by + 2:by + bh - 2, bx + 2:bx + bw - 2]
        c = cv2.resize(c, (c.shape[1] * 2, c.shape[0] * 2), interpolation=cv2.INTER_CUBIC)   # 2x so mips stay crisp
        crops.append((name, (bx, by, bw, bh), c))
    crops.sort(key=lambda t: -t[2].shape[0])
    for name, box, c in crops:
        h, w = c.shape[:2]
        if x + w + pad > W:
            x, y, rowh = pad, y + rowh + pad, 0
        items.append((name, box, (x, y, w, h), c))
        x, rowh = x + w + pad, max(rowh, h)
    H = y + rowh + pad
    atlas = np.full((H, W, 3), 200, np.uint8)
    for name, box, (x, y, w, h), c in items:
        atlas[y:y + h, x:x + w] = c
    cv2.imwrite(os.path.join(OUT, 'gallery.jpg'), atlas, [cv2.IMWRITE_JPEG_QUALITY, 86])
    # wooden elephant cut-out: GrabCut (hook and the painting below marked as background), the trunk
    # tip added back from a colour mask, outline holes filled except the wall gap by the right tusk
    bx, by, bw, bh = CUTOUT[1]
    c = img[by:by + bh, bx:bx + bw].copy()
    mask = np.zeros(c.shape[:2], np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(c, mask, (2, 14, bw - 4, bh - 16), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    mask[0:40, 78:132] = cv2.GC_BGD
    mask[192:, 168:] = cv2.GC_BGD
    mask[100:180, 95:125] = cv2.GC_FGD
    mask[40:75, 10:60] = cv2.GC_PR_FGD
    mask[40:75, 160:205] = cv2.GC_PR_FGD
    cv2.grabCut(c, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == 1) | (mask == 3), 1, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV)
    col = ((hsv[..., 1] > 45) | (hsv[..., 2] < 120)).astype(np.uint8)
    reg = np.zeros_like(fg)
    reg[165:, 55:135] = 1
    fg = np.clip(fg + cv2.morphologyEx(col * reg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), 0, 1).astype(np.uint8)
    fg = largest(fg)
    fill = np.zeros_like(fg)
    cv2.drawContours(fill, cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], -1, 1, -1)
    wall = ((hsv[..., 1] < 32) & (hsv[..., 2] > 165)).astype(np.uint8)
    holes = cv2.morphologyEx(fill * wall, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(holes)
    cut = np.zeros_like(fill)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 120 and st[i, cv2.CC_STAT_TOP] > 110:
            cut[lab == i] = 1
    a = (fill * (1 - cv2.dilate(cut, np.ones((3, 3), np.uint8))) * 255).astype(np.uint8)
    a = cv2.GaussianBlur(a, (3, 3), 0)
    c2 = cv2.resize(np.dstack([c, a]), (bw * 2, bh * 2), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(os.path.join(OUT, 'elephant_cutout.png'), c2, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    # layout in mm relative to the arrangement's centre (photo x -> wall right, photo y -> down)
    allb = [b for _, b in GALLERY] + [CUTOUT[1]]
    x0 = min(b[0] for b in allb); x1 = max(b[0] + b[2] for b in allb)
    y0 = min(b[1] for b in allb); y1 = max(b[1] + b[3] for b in allb)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    out = {'size_mm': [round((x1 - x0) * MM_PER_PX), round((y1 - y0) * MM_PER_PX)], 'atlas': [W, H], 'items': []}
    for name, (bx, by, bw, bh), (ax, ay, aw, ah), _ in items:
        out['items'].append({'name': name, 'right': round((bx + bw / 2 - cx) * MM_PER_PX), 'up': round((cy - by - bh / 2) * MM_PER_PX),
                             'size': [round(bw * MM_PER_PX / 10) * 10, round(bh * MM_PER_PX / 10) * 10],
                             'uv': [round(ax / W, 5), round(1 - (ay + ah) / H, 5), round((ax + aw) / W, 5), round(1 - ay / H, 5)]})
    bx, by, bw, bh = CUTOUT[1]
    out['items'].append({'name': CUTOUT[0], 'right': round((bx + bw / 2 - cx) * MM_PER_PX), 'up': round((cy - by - bh / 2) * MM_PER_PX),
                         'size': [round(bw * MM_PER_PX / 10) * 10, round(bh * MM_PER_PX / 10) * 10], 'src': 'art/elephant_cutout.png'})
    json.dump(out, open(os.path.join(OUT, 'gallery.json'), 'w'), indent=1)
    print('gallery', len(out['items']), 'pieces, arrangement', out['size_mm'], 'mm, atlas', W, 'x', H)


if __name__ == '__main__':
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    framed(src)
    gallery(src)
