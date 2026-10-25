"""Generate clean 2D plan SVGs (one per floor) from house.json.

Usage: python3 tools/plans.py   ->  plans/GF.svg, plans/FF.svg, plans/SF.svg

1 SVG unit = 1 mm. Everything is drawn from house.json; dimensions are
measured from the model (see check_dims.SPEC), not copied from the PDF.
"""
import math
import os
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import houselib as hl  # noqa: E402
import check_dims  # noqa: E402

VB = (-2600, -1700, 21400, 27600)       # x, y, w, h  (same frame for every floor)
FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"

WALL_FILL = {"existing": "#262626", "new": "#6f6f6f", "proposed": "url(#hatchP)"}
SURFACE = {
    "grass": "#cfe3bd", "deck_tile": "#e7d3b8", "granite_flamed": "#e3e1dd", "cobble": "#d6d2cb",
    "grating": "#bfbfbf", "pebbles": "#ece9e2",
}
ROOM_TINT = {"tile_matte_lg": "#eaf2f5", "vitrified": "#f6f4ef", "marble_beige": "#fbf8f2", "granite_flamed": "#f0efec",
             "deck_tile": "#f1e6d6", "pebbles": "#f3f1ec"}
INK = "#222"
DIM = "#c0392b"
GLASS = "#2aa7c9"
FURN = "#8a7a5c"


def f(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def pts(poly):
    return " ".join("%s,%s" % (f(x), f(y)) for x, y in poly)


class Svg:
    def __init__(self):
        self.layers = {k: [] for k in ("bg", "outdoor", "rooms", "over", "furn", "stair", "walls", "open", "glass", "dims", "labels", "top")}

    def add(self, layer, s):
        self.layers[layer].append(s)

    def poly(self, layer, poly, fill="none", stroke="none", sw=0, extra=""):
        self.add(layer, '<polygon points="%s" fill="%s" stroke="%s" stroke-width="%s" %s/>' % (pts(poly), fill, stroke, f(sw), extra))

    def pline(self, layer, poly, stroke=INK, sw=15, extra=""):
        self.add(layer, '<polyline points="%s" fill="none" stroke="%s" stroke-width="%s" %s/>' % (pts(poly), stroke, f(sw), extra))

    def line(self, layer, a, b, stroke=INK, sw=15, extra=""):
        self.add(layer, '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s" %s/>' % (
            f(a[0]), f(a[1]), f(b[0]), f(b[1]), stroke, f(sw), extra))

    def text(self, layer, x, y, s, size=160, fill=INK, anchor="middle", weight="normal", rot=0, extra=""):
        tr = ' transform="rotate(%s %s %s)"' % (f(rot), f(x), f(y)) if rot else ""
        self.add(layer, '<text x="%s" y="%s" font-size="%s" fill="%s" text-anchor="%s" font-weight="%s" font-family="%s"%s %s>%s</text>' % (
            f(x), f(y), f(size), fill, anchor, weight, FONT, tr, extra, escape(s)))

    def render(self, title):
        x, y, w, h = VB
        head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" width="%smm" height="%smm">\n<title>%s</title>\n'
                % (x, y, w, h, f(w / 50), f(h / 50), escape(title)))
        defs = ('<defs>'
                '<pattern id="hatchP" patternUnits="userSpaceOnUse" width="90" height="90" patternTransform="rotate(45)">'
                '<rect width="90" height="90" fill="#f3c9a2"/><line x1="0" y1="0" x2="0" y2="90" stroke="#c0601f" stroke-width="30"/></pattern>'
                '<pattern id="grass" patternUnits="userSpaceOnUse" width="400" height="400">'
                '<rect width="400" height="400" fill="%s"/><path d="M60 120 l20 -50 l20 50 M260 320 l20 -50 l20 50" stroke="#9cc07f" stroke-width="12" fill="none"/></pattern>'
                '<pattern id="deck" patternUnits="userSpaceOnUse" width="1200" height="200">'
                '<rect width="1200" height="200" fill="%s"/><line x1="0" y1="0" x2="1200" y2="0" stroke="#cdb08a" stroke-width="10"/></pattern>'
                '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
                '<path d="M0,0 L10,5 L0,10 z" fill="%s"/></marker>'
                '</defs>\n' % (SURFACE["grass"], SURFACE["deck_tile"], INK))
        body = '<rect x="%s" y="%s" width="%s" height="%s" fill="#ffffff"/>\n' % (x, y, w, h)
        for k in self.layers:
            body += '<g id="%s">\n%s\n</g>\n' % (k, "\n".join(self.layers[k]))
        return head + defs + body + "</svg>\n"


# --------------------------------------------------------------------- walls & openings

def draw_walls(svg, fl):
    for w in fl["walls"]:
        kind = w["kind"]
        if kind in ("glass_wall", "glass_railing", "glass_partition", "glass_screen", "railing", "screen"):
            draw_light_wall(svg, w)
            continue
        solid, cuts = hl.wall_segments(w)
        if kind == "parapet":
            fill = "#d9d9d9" if w["status"] != "proposed" else "url(#hatchP)"
        elif kind == "boundary":
            fill = "#8c8c8c"
        else:
            fill = WALL_FILL.get(w["status"], "#555")
        for t0, t1 in solid:
            poly = hl.span_polygon(w, t0, t1)
            svg.poly("walls", poly, fill=fill, stroke=fill if fill.startswith("#") else "#c0601f", sw=4)
        for s, e, o in cuts:
            draw_opening(svg, w, o)


def draw_light_wall(svg, w):
    kind = w["kind"]
    L = hl.wall_length(w)
    solid, cuts = hl.wall_segments(w)
    if kind in ("glass_wall", "glass_partition", "glass_screen", "glass_railing"):
        for t0, t1 in solid:
            for off, sw in ((0, 18),) if kind != "glass_wall" else ((-20, 12), (20, 12)):
                pl = sample(w, t0, t1, off)
                svg.pline("glass", pl, stroke=GLASS, sw=sw)
            if kind == "glass_railing":
                svg.pline("glass", sample(w, t0, t1, 0), stroke=INK, sw=6, extra='stroke-dasharray="60 60"')
        for s, e, o in cuts:
            draw_opening(svg, w, o)
    elif kind == "railing":
        svg.pline("walls", sample(w, 0, L, 0), stroke=INK, sw=max(20, w["t"] * 0.3))
    elif kind == "screen":
        svg.pline("walls", sample(w, 0, L, 0), stroke="#8a6a44", sw=50, extra='stroke-dasharray="40 30"')


def sample(w, t0, t1, off, step=120):
    n = max(1, int((t1 - t0) / step)) if "arc" in w else 1
    return [hl.wall_point(w, t0 + (t1 - t0) * i / n, off) for i in range(n + 1)]


def side_sign(w, swing):
    """+1 if `swing` points to the wall's left normal, -1 otherwise."""
    if "arc" in w:
        arc = w["arc"]
        sgn = 1 if arc["to"] >= arc["from"] else -1
        # left normal points away from the centre for increasing angle
        return sgn if swing == "out" else -sgn
    dx, dy = hl.wall_dir(w)
    nx, ny = dy, -dx
    v = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}[swing]
    return 1 if nx * v[0] + ny * v[1] > 0 else -1


def draw_opening(svg, w, o):
    t0, t1 = o["offset"], o["offset"] + o["width"]
    h = w["t"] / 2.0
    typ = o["type"]
    # jamb lines
    for t in (t0, t1):
        svg.line("open", hl.wall_point(w, t, h), hl.wall_point(w, t, -h), stroke=INK, sw=8)
    if typ in ("window", "curtain"):
        for off, sw, col in ((h, 8, INK), (-h, 8, INK), (0, 14, GLASS)):
            svg.pline("open", sample(w, t0, t1, off), stroke=col, sw=sw)
        if o.get("sill", 0) >= 900:
            svg.pline("open", sample(w, t0, t1, h * 0.45), stroke=INK, sw=5)
    elif typ == "sliding_door":
        svg.pline("open", sample(w, t0, t1, h), stroke=INK, sw=6)
        svg.pline("open", sample(w, t0, t1, -h), stroke=INK, sw=6)
        mid = (t0 + t1) / 2
        svg.pline("open", sample(w, t0, mid + 100, h * 0.3), stroke=GLASS, sw=22)
        svg.pline("open", sample(w, mid - 100, t1, -h * 0.3), stroke=GLASS, sw=22)
    elif typ == "lift_door":
        svg.pline("open", sample(w, t0, t1, 0), stroke=INK, sw=10, extra='stroke-dasharray="50 40"')
    elif typ == "pivot_door":
        s = side_sign(w, o.get("swing", "out"))
        piv = t0 + o["width"] * 0.25
        p = hl.wall_point(w, piv, 0)
        b = hl.wall_point(w, t1, 0)
        q = hl.wall_point(w, piv, s * o["width"] * 0.75)
        svg.line("open", p, q, stroke=INK, sw=14)
        svg.add("open", '<path d="M%s,%s A%s,%s 0 0,%d %s,%s" fill="none" stroke="%s" stroke-width="6" stroke-dasharray="40 30"/>' % (
            f(b[0]), f(b[1]), f(o["width"] * 0.75), f(o["width"] * 0.75), 1 if s * swing_sense(w) > 0 else 0, f(q[0]), f(q[1]), INK))
        svg.add("open", '<circle cx="%s" cy="%s" r="35" fill="%s"/>' % (f(p[0]), f(p[1]), INK))
    else:   # hinged doors, glass doors, gates
        swing = o.get("swing", "+y")
        s = side_sign(w, swing)
        leaves = []
        if o.get("hinge") == "both" or o.get("leaves", 1) == 2:
            mid = (t0 + t1) / 2
            leaves = [(t0, mid), (t1, mid)]
        elif o.get("hinge") == "b":
            leaves = [(t1, t0)]
        else:
            leaves = [(t0, t1)]
        col = GLASS if typ == "glass_door" else INK
        for hinge_t, free_t in leaves:
            width = abs(free_t - hinge_t)
            hp = hl.wall_point(w, hinge_t, s * h)
            closed = hl.wall_point(w, free_t, s * h)
            # open leaf: perpendicular to the wall at the hinge, on the swing side
            if "arc" in w:
                tip = hl.wall_point(w, hinge_t, s * (h + width))
            else:
                dx, dy = hl.wall_dir(w)
                nx, ny = dy * s, -dx * s
                tip = (hp[0] + nx * width, hp[1] + ny * width)
            svg.line("open", hp, tip, stroke=col, sw=16)
            # arc from closed position to open tip
            cross = (closed[0] - hp[0]) * (tip[1] - hp[1]) - (closed[1] - hp[1]) * (tip[0] - hp[0])
            sweep = 1 if cross > 0 else 0
            svg.add("open", '<path d="M%s,%s A%s,%s 0 0,%d %s,%s" fill="none" stroke="%s" stroke-width="6" stroke-dasharray="45 30"/>' % (
                f(closed[0]), f(closed[1]), f(width), f(width), sweep, f(tip[0]), f(tip[1]), col))


def swing_sense(w):
    arc = w.get("arc")
    return 1 if (arc and arc["to"] >= arc["from"]) else -1


def opening_tags(svg, fl):
    for w in fl["walls"]:
        for o in w.get("openings", []):
            mid = o["offset"] + o["width"] / 2
            mark = o["mark"]
            if mark in ("D4",):
                continue
            # tag outside the wall on the side opposite to the swing (or outward)
            s = side_sign(w, o["swing"]) if o.get("swing") in ("+x", "-x", "+y", "-y") else 1
            q = hl.wall_point(w, mid, -s * (w["t"] / 2 + 260))
            if o["type"] in ("window", "curtain", "sliding_door"):
                q = outward(w, mid, fl)
            r = 150 if len(mark) <= 4 else 185
            svg.add("labels", '<circle cx="%s" cy="%s" r="%s" fill="#fff" stroke="%s" stroke-width="10"/>' % (f(q[0]), f(q[1]), r, "#c2185b"))
            svg.text("labels", q[0], q[1] + 42, mark, size=115 if len(mark) <= 4 else 95, fill="#c2185b")


def outward(w, t, fl):
    """Point just outside an external wall: pick the side farther from the floor's centre."""
    h = w["t"] / 2 + 280
    a, b = hl.wall_point(w, t, h), hl.wall_point(w, t, -h)
    cx, cy = 4700, 13500
    return a if math.hypot(a[0] - cx, a[1] - cy) > math.hypot(b[0] - cx, b[1] - cy) else b


# --------------------------------------------------------------------- rooms, outdoor, furniture

def draw_outdoor(svg, fl):
    for a in fl.get("outdoor", []):
        s = a["surface"]
        fill = {"grass": "url(#grass)", "deck_tile": "url(#deck)"}.get(s, SURFACE.get(s, "#eee"))
        extra = 'stroke-dasharray="80 60"' if a.get("outside_plot") else ""
        svg.poly("outdoor", a["polygon"], fill=fill, stroke="#9a9a9a", sw=10, extra=extra)


def room_label(svg, r, proposed=False, small=False):
    poly = r["polygon"]
    cx, cy = r.get("label_at") or hl.poly_centroid(poly)
    A = hl.poly_area(poly)
    x0, y0, x1, y1 = hl.poly_bbox(poly)
    name = (r.get("label_name") or r["name"]).upper()
    big = 210 if not small else 150
    lines = [(name, big, "bold", INK)]
    if r.get("kind") not in ("lift", "shaft"):
        if FEET:
            lines.append(("%.0f sq ft (%.1f m²)" % (hl.sqft(A), hl.sqm(A)), 135, "normal", "#444"))
            lines.append(("%s × %s" % (hl.ftin(x1 - x0), hl.ftin(y1 - y0)), 125, "normal", "#555"))
            lines.append(("(%.2f × %.2f m)" % ((x1 - x0) / 1000, (y1 - y0) / 1000), 105, "normal", "#777"))
        else:
            lines.append(("%.1f m² · %.0f ft²" % (hl.sqm(A), hl.sqft(A)), 135, "normal", "#444"))
            dims = r.get("dims_label") or "%d × %d" % (round((x1 - x0) / 10) * 10, round((y1 - y0) / 10) * 10)
            lines.append((dims, 120, "normal", "#666"))
    if r.get("brief_change"):
        lines.append(("BRIEF CHANGE (was %s)" % r["was"] if r.get("was") else "BRIEF CHANGE", 110, "bold", "#c0601f"))
    if proposed:
        lines.append(("PROPOSED", 115, "bold", "#c0601f"))
    total = sum(s * 1.25 for _, s, _, _ in lines)
    y = cy - total / 2 + lines[0][1]
    for txt, size, wgt, col in lines:
        # white halo for legibility over furniture
        svg.text("labels", cx, y, txt, size=size, fill="#fff", weight=wgt, extra='stroke="#fff" stroke-width="45" stroke-linejoin="round"')
        svg.text("labels", cx, y, txt, size=size, fill=col, weight=wgt)
        y += size * 1.25


def furniture_symbol(svg, it):
    typ = it["type"]
    c = hl.furniture_corners(it)
    w, d = it["size"][0], it["size"][1]
    rot = it.get("rot", 0)
    cx, cy = it["pos"]

    def L(lx, ly):  # local -> world
        a = math.radians(rot)
        return (cx + lx * math.cos(a) - ly * math.sin(a), cy + lx * math.sin(a) + ly * math.cos(a))

    S = dict(fill="#fffdf8", stroke=FURN, sw=10)
    if typ in ("rug",):
        svg.poly("furn", c, fill="#f5efe4", stroke="#c9b99a", sw=8, extra='stroke-dasharray="60 40"')
        return
    if typ in ("pendant_statement",):
        svg.poly("furn", c, fill="none", stroke="#b08d57", sw=10, extra='stroke-dasharray="30 30"')
        svg.text("furn", cx, cy - d / 2 - 60, "PENDANT", size=80, fill="#b08d57")
        return
    if typ in ("wall_cabinet", "overhead_storage", "hood", "mirror_round"):
        svg.poly("furn", c, fill="none", stroke=FURN, sw=8, extra='stroke-dasharray="50 35"')
        return
    if typ in ("car_reference", "car_model"):
        svg.poly("furn", c, fill="none", stroke="#777", sw=12, extra='stroke-dasharray="90 60"')
        svg.text("furn", cx, cy + d / 2 - 250, "ref. car 3.8 m", size=100, fill="#777")
        return
    if typ in ("planter", "bamboo_planter", "bean_bag", "pouf", "floor_lamp", "side_table") and typ != "side_table":
        r = min(w, d) / 2
        svg.add("furn", '<circle cx="%s" cy="%s" r="%s" fill="%s" stroke="%s" stroke-width="10"/>' % (
            f(cx), f(cy), f(r), "#e6efd9" if "planter" in typ else "#fffdf8", FURN))
        return
    if typ == "sofa_l":
        ch = 950
        chaise_local = 1 if it.get("chaise", "+x") == "+x" else -1
        # main run along the back (local -y), chaise on one end extending to the front (+y)
        if chaise_local > 0:
            poly = [L(-w / 2, -d / 2), L(w / 2, -d / 2), L(w / 2, d / 2), L(w / 2 - ch, d / 2), L(w / 2 - ch, -d / 2 + ch), L(-w / 2, -d / 2 + ch)]
        else:
            poly = [L(-w / 2, -d / 2), L(w / 2, -d / 2), L(w / 2, -d / 2 + ch), L(-w / 2 + ch, -d / 2 + ch), L(-w / 2 + ch, d / 2), L(-w / 2, d / 2)]
        svg.poly("furn", poly, fill="#f4ede2", stroke=FURN, sw=12)
        back = 200
        svg.pline("furn", [L(-w / 2 + back, -d / 2 + back), L(w / 2 - back, -d / 2 + back)], stroke=FURN, sw=8)
        return
    svg.poly("furn", c, fill=S["fill"], stroke=S["stroke"], sw=S["sw"])
    if typ.startswith("bed"):
        # head at local -y? beds: headboard at the back (local -y), pillows next to it
        hb = 80
        svg.pline("furn", [L(-w / 2, -d / 2 + hb), L(w / 2, -d / 2 + hb)], stroke=FURN, sw=8)
        n = 2 if w > 1200 else 1
        pw = (w - 200) / n - 60
        for i in range(n):
            x0 = -w / 2 + 100 + i * (pw + 60) + 30
            svg.poly("furn", [L(x0, -d / 2 + hb + 60), L(x0 + pw, -d / 2 + hb + 60), L(x0 + pw, -d / 2 + hb + 420), L(x0, -d / 2 + hb + 420)],
                     fill="#fff", stroke=FURN, sw=6)
        svg.pline("furn", [L(-w / 2, d * 0.15), L(w / 2, d * 0.05)], stroke=FURN, sw=6)
    elif typ in ("wardrobe", "storage_tall", "tall_unit", "crockery_unit", "storage_bench"):
        svg.pline("furn", [L(-w / 2, d / 2 - 40), L(w / 2, d / 2 - 40)], stroke=FURN, sw=6)
        svg.pline("furn", [L(-w / 2, -d / 2), L(w / 2, d / 2)], stroke=FURN, sw=5)
        svg.pline("furn", [L(-w / 2, d / 2), L(w / 2, -d / 2)], stroke=FURN, sw=5)
    elif typ == "tulsi_platform":
        svg.add("furn", '<circle cx="%s" cy="%s" r="220" fill="#e6efd9" stroke="%s" stroke-width="8"/>' % (f(L(0, -40)[0]), f(L(0, -40)[1]), FURN))
        svg.text("furn", cx, cy - (d / 2 + 140) * math.cos(math.radians(rot)) * -1 + 30, "TULSI", size=95, fill="#5d7a3a")
    elif typ in ("mandir_jaali", "mandir_open"):
        for i in range(-2, 3):
            svg.pline("furn", [L(i * w / 6 - 80, d / 2 - 60), L(i * w / 6, d / 2 - 180), L(i * w / 6 + 80, d / 2 - 60)], stroke="#b08d57", sw=8)
        svg.text("furn", cx, cy + 40, "MANDIR", size=95, fill="#b08d57", rot=(90 if rot in (90, 270) else 0))
    elif typ in ("wc_wall_hung",):
        svg.add("furn", '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff" stroke="%s" stroke-width="8" transform="rotate(%s %s %s)"/>' % (
            f(L(0, 40)[0]), f(L(0, 40)[1]), f(w * 0.42), f(d * 0.4), FURN, f(rot), f(L(0, 40)[0]), f(L(0, 40)[1])))
    elif typ in ("vanity", "basin", "utility_counter", "mop_sink", "sink"):
        p = L(0, 0)
        svg.add("furn", '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff" stroke="%s" stroke-width="8"/>' % (
            f(p[0]), f(p[1]), f(min(w, d) * 0.32), f(min(w, d) * 0.22), FURN))
    elif typ in ("shower_head",):
        svg.add("furn", '<circle cx="%s" cy="%s" r="90" fill="none" stroke="%s" stroke-width="8"/>' % (f(cx), f(cy), GLASS))
    elif typ in ("dining_table", "coffee_table", "outdoor_table"):
        pass
    elif typ in ("dining_chair", "accent_chair", "lounge_chair", "chair", "study_chair", "bar_stool", "outdoor_sofa", "lounger", "bench"):
        svg.pline("furn", [L(-w / 2 + 40, -d / 2 + 90), L(w / 2 - 40, -d / 2 + 90)], stroke=FURN, sw=8)
    elif typ in ("counter_peninsula",):
        pass
    elif typ in ("hob",):
        for dx in (-0.25, 0.25):
            for dy in (-0.25, 0.25):
                p = L(dx * w, dy * d)
                svg.add("furn", '<circle cx="%s" cy="%s" r="70" fill="none" stroke="%s" stroke-width="6"/>' % (f(p[0]), f(p[1]), FURN))


def draw_peninsula(svg, it):
    # counter with a semicircular end at local +y
    w, d = it["size"][0], it["size"][1]
    r = it.get("end_radius", w / 2)
    cx, cy = it["pos"]
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - d / 2, cy + d / 2 - r
    path = "M%s,%s L%s,%s L%s,%s A%s,%s 0 0,1 %s,%s Z" % (f(x0), f(y0), f(x1), f(y0), f(x1), f(y1), f(r), f(r), f(x0), f(y1))
    svg.add("furn", '<path d="%s" fill="#fffdf8" stroke="%s" stroke-width="10"/>' % (path, FURN))


def draw_furniture(svg, fl):
    # plans show the /withpainting layout (paintings drawn below), so skip the pieces it replaces
    items = sorted((it for it in fl.get("furniture", []) if it.get("variant") != "no_art" and not it.get("on_roof")),
                   key=lambda it: 0 if it["type"] == "rug" else 1)
    for it in fl.get("furniture", []):                # roof equipment: dashed outline + label on the floor below
        if it.get("on_roof"):
            pts = hl.furniture_corners(it)
            svg.poly("over", pts, fill="none", stroke="#6b8fa0", sw=14, extra='stroke-dasharray="90 60"')
            cx, cy = it["pos"]
            svg.text("over", cx, cy + 40, "ON ROOF: " + it["type"].replace("_", " ").upper(), size=95, fill="#46708a", weight="bold")
    for it in items:
        if it["type"] == "counter_peninsula":
            draw_peninsula(svg, it)
        else:
            furniture_symbol(svg, it)
    for j in fl.get("joinery", []):
        svg.poly("furn", j["polygon"], fill="#efe2cf", stroke=FURN, sw=10)
        cx, cy = hl.poly_centroid(j["polygon"])
        svg.text("furn", cx, cy + 30, "SEAT", size=90, fill=FURN)
    for a in fl.get("art", []):                       # paintings: a gilt bar on the wall face
        r = math.radians(a["rot"])
        fx, fy = -math.sin(r), math.cos(r)
        rx, ry = math.cos(r), math.sin(r)
        w = a["size"][0] if a["type"] == "gallery" else a["canvas"][0] + 2 * (a["frame"]["width"] + a["frame"].get("lip_width", 0))
        d = a.get("depth") or a["frame"]["depth"]
        x, y = a["pos"][0] + fx * d / 2, a["pos"][1] + fy * d / 2
        svg.line("furn", (x - rx * w / 2, y - ry * w / 2), (x + rx * w / 2, y + ry * w / 2), stroke="#b08d57", sw=max(d, 40))
        svg.text("furn", x + fx * 170, y + fy * 170 + 30, a["title"].upper(), size=70, fill="#8a6a44",
                 rot=90 if abs(fx) > 0.5 else 0)


# --------------------------------------------------------------------- stair

def draw_stair(svg, st, fl_id):
    for fl in st["flights"]:
        (x0, y0), (x1, y1) = fl["start"], fl["end"]
        xa, xb = min(x0, x1), max(x0, x1)
        ya, yb = min(y0, y1), max(y0, y1)
        above = fl_id == "GF" and fl["id"] == "F2"     # flight above the plan cut on GF
        dash = ' stroke-dasharray="60 40"' if above else ""
        svg.poly("stair", [(xa, ya), (xb, ya), (xb, yb), (xa, yb)], fill="none" if above else "#fbfbfb", stroke=INK, sw=10, extra=dash)
        n = fl["treads"]
        for i in range(1, n + 1):
            x = xa + (xb - xa) * i / n
            svg.line("stair", (x, ya), (x, yb), stroke="#999" if above else "#777", sw=6, extra=dash)
        if above:
            svg.text("stair", (xa + xb) / 2, yb - 120, "FLIGHT OVER (janitor below)", size=95, fill="#888")
            continue
        # walking line + arrow
        ym = (ya + yb) / 2
        if fl["dir"] == "+x":
            a, b = (xa + 120, ym), (xb + 500, ym)
        else:
            a, b = (xb + 500, ym), (xa + 120, ym)
        if fl_id == "SF":                          # top floor: both flights lead down
            a, b = b, a
        svg.line("stair", a, b, stroke=INK, sw=10, extra='marker-end="url(#arr)"')
    # landing
    lp = st["landing"]["polygon"]
    svg.poly("stair", lp, fill="none" if fl_id == "GF" else "#f6f6f6", stroke=INK, sw=10,
             extra='stroke-dasharray="60 40"' if fl_id == "GF" else "")
    lab = {"GF": "UP", "FF": "UP / DN", "SF": "DN"}[fl_id]
    svg.text("stair", 5899 - 60, 13460, lab, size=150, fill=INK, anchor="end", weight="bold")
    svg.text("stair", (7899 + 9151) / 2, 13150, "LANDING +1650", size=95, fill="#666")


# --------------------------------------------------------------------- dimensions

def dim(svg, p1, p2, off, label, col=DIM, size=125):
    (x1, y1), (x2, y2) = p1, p2
    L = math.hypot(x2 - x1, y2 - y1)
    if L < 1:
        return
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    nx, ny = uy, -ux
    a = (x1 + nx * off, y1 + ny * off)
    b = (x2 + nx * off, y2 + ny * off)
    svg.line("dims", p1, a, stroke=col, sw=4)
    svg.line("dims", p2, b, stroke=col, sw=4)
    svg.line("dims", a, b, stroke=col, sw=6)
    for p in (a, b):
        svg.line("dims", (p[0] - 50 * (ux - nx), p[1] - 50 * (uy - ny)), (p[0] + 50 * (ux - nx), p[1] + 50 * (uy - ny)), stroke=col, sw=10)
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    ang = math.degrees(math.atan2(uy, ux))
    if ang > 90 or ang <= -90:
        ang += 180
    tx, ty = mx + nx * 45 * (1 if off >= 0 else -1), my + ny * 45 * (1 if off >= 0 else -1)
    svg.text("dims", tx, ty, label, size=size, fill=col, rot=ang, extra='stroke="#fff" stroke-width="30" paint-order="stroke"')


def draw_dims(svg, h, fl_id):
    P = check_dims.Probe(h)
    for fl, txt, X, Y, desc, fn, draw in check_dims.SPEC:
        if fl != fl_id or draw is None or check_dims.superseded(fl, txt, X, h):
            continue
        p1, p2, off = draw(P)
        val = fn(P)
        dim(svg, p1, p2, off, hl.length_label(h, val))
    # overall dimensions (derived, grey)
    W = h["meta"]["plot"]["width_outer"]
    L = lambda v: hl.length_label(h, v)  # noqa: E731
    if fl_id == "GF":
        dim(svg, (0, 0), (W, 0), 700, "%s plot (outer)" % L(W), col="#555")
        dim(svg, (0, 0), (0, h["meta"]["plot"]["depth_to_front_boundary"]), -1100, "%s rear boundary to front boundary" % L(h["meta"]["plot"]["depth_to_front_boundary"]), col="#555")
        dim(svg, (0, 200), (0, 5515), -600, "%s back lawn" % L(5515 - 200), col="#555")
        dim(svg, (9381, 2814), (9381, 5515), 500, "%s deck" % L(2700), col="#555")
    elif fl_id == "FF":
        dim(svg, (0, 5515), (W, 5515), 1500, L(W), col="#555")
    else:
        dim(svg, (0, 5515), (W, 5515), 1500, L(W), col="#555")


# --------------------------------------------------------------------- overlays

def draw_overlays(svg, h, fl):
    fid = fl["id"]
    if fid == "GF":
        # FF outline overhead (dashed)
        ff = hl.by_id(h["slabs"], "S-FF")["outline"]
        svg.poly("over", ff, fill="none", stroke="#777", sw=10, extra='stroke-dasharray="120 80"')
        svg.text("over", 7300, 4900, "FF BALCONY ABOVE", size=110, fill="#777")
        svg.text("over", 7615, 21750, "FF BEDROOM ABOVE", size=110, fill="#777")
        pg = fl.get("pergola")
        if pg:
            xs = [p[0] for p in pg["posts"]]
            x0, x1 = min(xs) - 75, 9151
            y0, y1 = pg["posts"][0][1] - 75, 5515
            svg.poly("over", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill="none", stroke="#8a6a44", sw=12, extra='stroke-dasharray="100 60"')
            y = y0 + 300
            while y < y1 - 100:
                svg.line("over", (x0, y), (x1, y), stroke="#c2a57f", sw=6)
                y += pg["rafters"]["spacing"]
            for (px, py) in pg["posts"]:
                svg.poly("over", [(px - 75, py - 75), (px + 75, py - 75), (px + 75, py + 75), (px - 75, py + 75)], fill="#8a6a44")
            svg.text("over", (x0 + x1) / 2, y0 - 120, "PERGOLA OVER DECK (top +3000) — BRIEF CHANGE", size=120, fill="#8a6a44", weight="bold")
    if fid == "SF":
        cp = fl.get("canopy")
        if cp:
            svg.poly("over", cp["polygon"], fill="#e8eef0", stroke="#6b8fa0", sw=12, extra='fill-opacity="0.35" stroke-dasharray="120 70"')
            for (px, py) in cp["posts"]:
                svg.poly("over", [(px - 50, py - 50), (px + 50, py - 50), (px + 50, py + 50), (px - 50, py + 50)], fill="#1d1d1d")
            svg.text("over", 4700, 9950, "POLYCARBONATE CANOPY OVER (temporary, light steel frame)", size=120, fill="#4f7385", weight="bold")
        # outline of FF below
        ff = hl.by_id(h["slabs"], "S-FF")["outline"]
        svg.poly("over", ff, fill="none", stroke="#aaa", sw=8, extra='stroke-dasharray="40 40"')


# --------------------------------------------------------------------- title, legend, schedule

def title_block(svg, h, fl, rooms_table):
    x0 = 11200
    rev = h["meta"].get("revision")
    svg.text("top", x0, 0, "GH-18  ·  %s%s" % (fl["name"].upper(), "  ·  " + rev if rev else ""), size=420, anchor="start", weight="bold")
    svg.text("top", x0, 520, h["meta"]["project"], size=170, anchor="start", fill="#444")
    svg.text("top", x0, 760, "Client: %s" % h["meta"]["client"], size=170, anchor="start", fill="#444")
    lvl = h["levels"][fl["id"]]
    if FEET:
        svg.text("top", x0, 1000, "Generated from %s; dimensions in feet-inches (metres). Source: %s" % (SRC, h["meta"]["source"]), size=105, anchor="start", fill="#666")
        svg.text("top", x0, 1260, "FFL +%s above ground · floor to floor %s · clear %s" % tuple(hl.length_label(h, lvl[k]) for k in ("ffl", "floor_to_floor", "clear")),
                 size=140, anchor="start", fill="#444")
    else:
        svg.text("top", x0, 1000, "Generated from house.json, all units mm. Source: %s" % h["meta"]["source"], size=105, anchor="start", fill="#666")
        svg.text("top", x0, 1260, "FFL +%d above ground · floor to floor %d · clear %d" % (lvl["ffl"], lvl["floor_to_floor"], lvl["clear"]),
                 size=140, anchor="start", fill="#444")
    if fl["status"] == "PROPOSED":
        svg.add("top", '<rect x="%d" y="1500" width="4300" height="620" fill="none" stroke="#c0601f" stroke-width="40"/>' % x0)
        svg.text("top", x0 + 2150, 1990, "PROPOSED — NOT IN PDF", size=330, fill="#c0601f", weight="bold")
    # north arrow + scale bar
    nx, ny = x0 + 600, 3300
    nv = h["meta"]["north_vector"]
    ang = math.degrees(math.atan2(nv[1], nv[0])) + 90
    svg.add("top", '<g transform="translate(%d %d) rotate(%s)"><circle r="420" fill="none" stroke="%s" stroke-width="18"/>'
            '<path d="M0,-380 L140,200 L0,110 L-140,200 Z" fill="%s"/></g>' % (nx, ny, f(ang), INK, INK))
    n1, n2 = h["meta"].get("north_label") or ["N (assumed:", "entrance faces East)"]
    svg.text("top", nx + 640, ny - 60, n1, size=140, anchor="start")
    svg.text("top", nx + 640, ny + 140, n2, size=140, anchor="start")
    sx, sy = x0, 4500
    seg = 4 * 304.8 if FEET else 1000          # 5 x 4 ft = 20 ft, or 5 x 1 m
    for i in range(5):
        svg.add("top", '<rect x="%s" y="%d" width="%s" height="120" fill="%s" stroke="%s" stroke-width="10"/>' % (
            f(sx + i * seg), sy, f(seg), INK if i % 2 == 0 else "#fff", INK))
    svg.text("top", sx, sy + 340, "0", size=130, anchor="middle")
    svg.text("top", sx + 5 * seg, sy + 340, "20 ft (6.1 m)" if FEET else "5000 mm", size=130, anchor="middle")
    # legend
    ly = 5300
    items = [("#262626", "Existing wall (dark grey in PDF)"), ("#6f6f6f", "New wall / partition (light grey in PDF)"),
             ("url(#hatchP)", "PROPOSED (not in PDF)"), ("#8c8c8c", "Boundary wall 1500 high"), (GLASS, "Glass / glazing")]
    for i, (col, txt) in enumerate(items):
        y = ly + i * 330
        svg.add("top", '<rect x="%d" y="%d" width="420" height="200" fill="%s" stroke="#444" stroke-width="8"/>' % (x0, y, col))
        svg.text("top", x0 + 560, y + 160, txt, size=140, anchor="start")
    y = ly + len(items) * 330 + 160
    svg.line("top", (x0, y), (x0 + 420, y), stroke="#777", sw=10, extra='stroke-dasharray="120 80"')
    svg.text("top", x0 + 560, y + 50, "Outline of floor above / overhead element", size=140, anchor="start")
    y += 330
    svg.text("top", x0 + 210, y + 50, "000", size=125, fill=DIM)
    svg.text("top", x0 + 560, y + 50, "Dimension measured from house.json (red = PDF string)", size=140, anchor="start")
    # room table
    ty = y + 520
    svg.text("top", x0, ty, "ROOM AREAS (internal, incl. built-in joinery)", size=170, anchor="start", weight="bold")
    ty += 300
    tot = 0.0
    for name, a, note in rooms_table:
        svg.text("top", x0, ty, name, size=140, anchor="start")
        if FEET:
            svg.text("top", x0 + 3600, ty, "%.0f sq ft" % hl.sqft(a), size=140, anchor="end")
            svg.text("top", x0 + 4900, ty, "(%.1f m²)" % hl.sqm(a), size=140, anchor="end")
        else:
            svg.text("top", x0 + 3600, ty, "%.1f m²" % hl.sqm(a), size=140, anchor="end")
            svg.text("top", x0 + 4900, ty, "%.0f ft²" % hl.sqft(a), size=140, anchor="end")
        if note:
            svg.text("top", x0 + 5050, ty, note, size=110, anchor="start", fill="#c0601f")
        tot += a if note != "outdoor" else 0
        ty += 220
    svg.line("top", (x0, ty - 120), (x0 + 4900, ty - 120), stroke="#999", sw=8)
    svg.text("top", x0, ty + 60, "Total indoor (rooms listed above, excl. outdoor)", size=140, anchor="start", weight="bold")
    svg.text("top", x0 + 4900, ty + 60, ("%.0f sq ft (%.1f m²)" % (hl.sqft(tot), hl.sqm(tot))) if FEET else ("%.1f m² / %.0f ft²" % (hl.sqm(tot), hl.sqft(tot))),
             size=140, anchor="end", weight="bold")
    return ty


# --------------------------------------------------------------------- main

def build(h, fl):
    svg = Svg()
    fid = fl["id"]
    proposed = fl["status"] == "PROPOSED"
    draw_outdoor(svg, fl)
    # terrace / roof fills for upper floors
    rows = []
    for r in fl["rooms"]:
        tint = ROOM_TINT.get(r.get("floor") or "", "#fbf9f5")
        if r.get("kind") == "lift":
            tint = "#f0f0f0"
        if r.get("kind") == "shaft":
            tint = "#f3f1ec"
        svg.poly("rooms", r["polygon"], fill=tint, stroke="none")
        if r.get("kind") in ("lift", "shaft"):
            x0, y0, x1, y1 = hl.poly_bbox(r["polygon"])
            svg.line("rooms", (x0, y0), (x1, y1), stroke="#a0784a", sw=10, extra='stroke-dasharray="50 35"')
            svg.line("rooms", (x0, y1), (x1, y0), stroke="#a0784a", sw=10, extra='stroke-dasharray="50 35"')
        note = "outdoor" if r.get("kind") == "outdoor" else ("PROPOSED" if proposed else ("BRIEF CHANGE" if r.get("brief_change") else ""))
        if r.get("kind") not in ("lift", "shaft"):
            rows.append((r["name"], hl.poly_area(r["polygon"]), note))
    for a in fl.get("outdoor", []):
        if not a.get("outside_plot") and a["id"] not in ("GF-DRAIN", "GF-STEP"):
            rows.append((a["name"], hl.poly_area(a["polygon"]), "outdoor"))
    draw_overlays(svg, h, fl)
    draw_furniture(svg, fl)
    if fid in h["stair"]["floors"]:
        draw_stair(svg, h["stair"], fid)
    draw_walls(svg, fl)
    opening_tags(svg, fl)
    for r in fl["rooms"]:
        room_label(svg, r, proposed=proposed, small=(hl.poly_area(r["polygon"]) < 4.5e6))
    for a in fl.get("outdoor", []):
        if a["id"] in ("GF-DRAIN", "GF-STEP"):
            continue
        room_label(svg, dict(a, kind="outdoor"), small=True)
    draw_dims(svg, h, fid)
    title_block(svg, h, fl, rows)
    return svg.render("GH-18 %s plan" % fl["name"])


FEET = False           # set from the model in main(): feet-inches (metres) for Revision R1 onward
SRC = "house.json"


def main():
    """python3 tools/plans.py [house_r1.json plans/r1]"""
    global FEET, SRC
    SRC = sys.argv[1] if len(sys.argv) > 1 else "house.json"
    h = hl.load(os.path.join(hl.ROOT, SRC))
    FEET = hl.feet(h)
    out_dir = os.path.join(hl.ROOT, sys.argv[2] if len(sys.argv) > 2 else "plans")
    os.makedirs(out_dir, exist_ok=True)
    for fl in h["floors"]:
        path = os.path.join(out_dir, "%s.svg" % fl["id"])
        with open(path, "w") as fp:
            fp.write(build(h, fl))
        print("wrote", path)


if __name__ == "__main__":
    main()
