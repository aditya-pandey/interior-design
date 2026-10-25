"""Shared geometry helpers for house.json (stdlib only).

Coordinate system (see house.json -> meta):
  x  -> to the right in the drawing (across the plot), mm
  y  -> down the drawing, from the rear (back lawn) to the front (street), mm
  z  -> up, mm above natural ground level (NGL = 0)
Origin (0, 0) is the rear-left outer corner of the plot.
Angles for arcs are in degrees, measured with atan2(dy, dx) in this x/y frame,
so with y pointing down, increasing angle runs clockwise on screen.
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path=None):
    with open(path or os.path.join(ROOT, "house.json")) as f:
        return json.load(f)


# ---------------------------------------------------------------- arcs

def arc_point(c, r, deg):
    a = math.radians(deg)
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))


def arc_length(arc, r=None):
    r = arc["r"] if r is None else r
    return abs(arc["to"] - arc["from"]) * math.pi / 180.0 * r


def arc_points(arc, r=None, step=150.0, t0=0.0, t1=None):
    """Points along an arc from arc-length t0 to t1 (mm), at radius r."""
    r = arc["r"] if r is None else r
    total = arc_length(arc, arc["r"])
    t1 = total if t1 is None else t1
    sgn = 1 if arc["to"] >= arc["from"] else -1
    n = max(2, int(abs(t1 - t0) / step) + 1)
    pts = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        deg = arc["from"] + sgn * (t / (math.pi / 180.0 * arc["r"]))
        pts.append(arc_point(arc["c"], r, deg))
    return pts


# ---------------------------------------------------------------- walls

def wall_length(w):
    if "arc" in w:
        return arc_length(w["arc"])
    (ax, ay), (bx, by) = w["a"], w["b"]
    return math.hypot(bx - ax, by - ay)


def wall_dir(w):
    (ax, ay), (bx, by) = w["a"], w["b"]
    L = math.hypot(bx - ax, by - ay)
    return ((bx - ax) / L, (by - ay) / L)


def wall_point(w, t, side=0.0):
    """Point at distance t along the wall centreline, offset `side` mm to the
    wall's left normal (left of the a->b direction as seen on screen with y down
    is (dy, -dx))."""
    if "arc" in w:
        arc = w["arc"]
        sgn = 1 if arc["to"] >= arc["from"] else -1
        deg = arc["from"] + sgn * (t / (math.pi / 180.0 * arc["r"]))
        # same convention as straight walls: side>0 is the left normal (dy, -dx)
        # of the travel direction, i.e. away from the centre when the angle increases
        r = arc["r"] + sgn * side
        return arc_point(arc["c"], r, deg)
    (ax, ay) = w["a"]
    dx, dy = wall_dir(w)
    nx, ny = dy, -dx
    return (ax + dx * t + nx * side, ay + dy * t + ny * side)


def wall_segments(w, gap_types=("door", "window", "glass_door", "sliding_door",
                                "opening", "pivot_door", "lift_door", "gate", "curtain")):
    """Split a wall centreline into solid [t0, t1] spans and opening spans."""
    L = wall_length(w)
    cuts = sorted((o["offset"], o["offset"] + o["width"], o) for o in w.get("openings", []))
    solid, t = [], 0.0
    for s, e, o in cuts:
        if s > t:
            solid.append((t, s))
        t = max(t, e)
    if t < L:
        solid.append((t, L))
    return solid, cuts


def span_polygon(w, t0, t1, step=120.0):
    """Outline polygon for the part of a wall between t0 and t1."""
    h = w["t"] / 2.0
    if "arc" in w:
        n = max(1, int((t1 - t0) / step))
        ts = [t0 + (t1 - t0) * i / n for i in range(n + 1)]
        left = [wall_point(w, t, +h) for t in ts]
        right = [wall_point(w, t, -h) for t in reversed(ts)]
        return left + right
    return [wall_point(w, t0, +h), wall_point(w, t1, +h),
            wall_point(w, t1, -h), wall_point(w, t0, -h)]


def face(w, side):
    """Face coordinate of an axis-aligned wall. side: '+' (larger x or y) or '-'."""
    (ax, ay), (bx, by) = w["a"], w["b"]
    h = w["t"] / 2.0
    if abs(ax - bx) < 1e-6:          # vertical wall -> x face
        return ax + h if side == "+" else ax - h
    if abs(ay - by) < 1e-6:          # horizontal wall -> y face
        return ay + h if side == "+" else ay - h
    raise ValueError("face() needs an axis-aligned wall: %s" % w["id"])


# ---------------------------------------------------------------- polygons

def poly_area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def poly_bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def poly_centroid(pts):
    a = 0.0
    cx = cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        cr = x1 * y2 - x2 * y1
        a += cr
        cx += (x1 + x2) * cr
        cy += (y1 + y2) * cr
    if abs(a) < 1e-9:
        xs, ys = zip(*pts)
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (3 * a), cy / (3 * a)


def furniture_corners(f):
    """Plan footprint of a furniture item (rectangle, rotated)."""
    w, d = f["size"][0], f["size"][1]
    a = math.radians(f.get("rot", 0))
    ca, sa = math.cos(a), math.sin(a)
    cx, cy = f["pos"]
    out = []
    for lx, ly in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)):
        out.append((cx + lx * ca - ly * sa, cy + lx * sa + ly * ca))
    return out


def by_id(items, ident):
    for it in items:
        if it["id"] == ident:
            return it
    raise KeyError(ident)


def floor(h, fid):
    return by_id(h["floors"], fid)


def all_walls(h, fid):
    fl = floor(h, fid)
    return fl["walls"]


def sqm(mm2):
    return mm2 / 1e6


def sqft(mm2):
    return mm2 / 1e6 * 10.7639


def ftin(mm):
    """Length in feet-inches to the nearest inch, e.g. 4110 -> 13'-6\"."""
    inches = round(mm / 25.4)
    return "%d'-%d\"" % (inches // 12, inches % 12)


def feet(h):
    """True when the model asks for feet-inches (Revision R1 onward)."""
    return h["meta"].get("display_units") == "ft-in (m)"


def length_label(h, mm):
    """A dimension as the model wants it shown: mm, or feet-inches with metres in brackets."""
    return "%s (%.2f m)" % (ftin(mm), mm / 1000) if feet(h) else "%d" % round(mm)
