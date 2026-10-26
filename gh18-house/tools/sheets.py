"""Revision R1 of the architect's drawing UPS/GH18/PV/001 (R0, 17.08.25) as A3 sheets.

Usage: python3 tools/sheets.py [house_r1.json plans/r1]
  -> plans/r1/GH-18_R1_drawing.html (two A3 landscape sheets; PDF via viewer/scripts/html2pdf.mjs)

Sheet 1 follows R0: ground and first floor plans side by side, the door-window schedule and the
finishing schedule, and R0's title block. Sheet 2 adds the proposed second floor, its schedules,
the R1 revision notes, the hold points and the room areas. Plans come from tools/plans.py at 1:100
(1 sheet unit = 1 mm on paper = 100 mm in the model); every schedule row is read from the model.
"""
import math
import os
import re
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import houselib as hl  # noqa: E402
import plans  # noqa: E402

W, H = 420, 297                        # A3 landscape, mm
SCALE = 100
FONT = "Carlito, Calibri, Arial, sans-serif"
SERIF = "Liberation Serif, Times New Roman, serif"
INK = "#1a1a1a"
PINK = "#a0307a"                      # R0 draws its schedules in magenta; a darker shade prints better
RED = "#c0601f"
DATE = "26.10.26"
DWG_NO = "UPS/GH18/PV/001"
CROP_X = (-1300, 10200)               # model mm, same for every floor so the plans line up
CROP_GF = (-1000, 24200)
CROP_UP = (3600, 22200)               # FF and SF

FIN_FLOOR = {"marble_beige": "Italian Stone*", "tile_matte_lg": "Tile (matte 1200×600)", "vitrified": "Vitrified tile 600×600",
             "deck_tile": "Deck tile (wood-look, anti-skid)", "granite_flamed": "Granite Stone (flamed)", "cobble": "Cobble Stone",
             "pebbles": "Pebbles", "grass": "Lawn"}
DESC = {   # short descriptions for marks R0 does not schedule
    "GL-F": "Curved frameless glass facade, floor to ceiling", "GD-1": "Frameless glass pivot entry door (in GL-F)",
    "GS-1": "Glass screen with 1000 gate", "KD-1": "Sliding door, fluted glass in black frame",
    "KW-1": "Vent window with exhaust fan, into OTS", "KW-2": "Vent window with exhaust fan, into OTS",
    "PD-1": "Glazed door to terrace", "PD-2": "Flush Door", "PW-1": "Glass Window Openable",
    "D1": "Flush Door, double leaf (main door)", "D4": "As Lift, as per lift vendor",
}
MARK_ORDER = ["GL-1", "GL-2", "GL-3", "GL-4", "GL-5", "GL-6", "GL-7", "GL-8", "GL-9", "GL-10", "GL-F", "GD-1", "GS-1",
              "KD-1", "KW-1", "KW-2", "PD-1", "PW-1", "D1", "D2", "D3", "PD-2", "D4"]
DRAWN_ON_R0 = ("GL-F", "GD-1", "GS-1")   # drawn on R0 but not in its schedule
REMARKS = {   # what R1 does in the room, beyond its finishes (ASSUMPTIONS.md section E)
    "GF-DRW": "TV + AC on W wall; open mandir in NE corner (B3, B6)",
    "GF-DIN": "Dining beside the lobby; hand-wash basin niche (D-01, B3)",
    "GF-KIT": "Closed U-kitchen + wash nook; counter top black granite 20 mm (D-01, B4)",
    "GF-MND": "Desk, sofa, settee, TV (B5)",
    "GF-JAN": "Cupboards to stair soffit; inverter / network rack (B7)",
    "GF-GST": "Wardrobe on S wall",
    "GF-DECK": "Deck + pergola; tulsi in lawn NE corner (B15)",
    "FF-MTL": "Tub + over-tub screen; WC on OTS stack; sunken floor (hold) (C10)",
    "FF-DRS": "Walk-in dresser lit by GL-4; mirror on E wall (C10)",
    "FF-LOB": "Pantry counter by lift, black granite top (C8)",
    "FF-BD3": "Front-left bedroom (D-04)",
    "FF-KID": "Study desk along GL-9 (C9, D-04)",
    "FF-KTL": "Back at its R0 place, stack SS-3 (C9)",
    "SF-WSH": "Linen / utility store (D11)",
    "SF-TRB": "Washer-dryer, sink, ironing, drying racks (D11)",
}
GF_ROWS = [("Parking & Ramp", ["GF-PARK", "GF-RAMP"], 0), ("Entrance Court", ["GF-COURT"], 1), ("Entrance Foyer", ["GF-FOY"], None),
           ("Lobby", ["GF-LOB"], None), (None, ["GF-MND"], None), (None, ["GF-GST"], None), ("Toilet", ["GF-TLT"], None),
           (None, ["GF-DRW"], None), (None, ["GF-DIN"], None), (None, ["GF-KIT"], None), (None, ["GF-JAN"], None),
           ("Deck + Pergola", ["GF-DECK"], 8)]
OUTDOOR_WC = {"GF-PARK": (None, "—"), "GF-COURT": (None, None), "GF-DECK": ("Paint Finish", "Pergola, open"),
              "FF-BAL": ("Paint Finish", "—"), "SF-TRF": ("Paint Finish (parapet)", "— (open)")}
REVISION_NOTES = [
    ("A1, A2", "General", "North is the road side (all consultant drawings). Dimensions in feet-inches with metres in brackets."),
    ("B3", "GF Family Lounge", "Drawing room becomes a family lounge: TV and AC on the west wall, L-sofa facing the TV."),
    ("B6", "GF Family Lounge", "Small open mandir on the east wall at the NE corner; devotee faces east; no toilet behind or above."),
    ("D-01", "GF Kitchen / Dining", "Closed kitchen on the R0 peninsula line with sliding door KD-1; dining moved beside the lobby."),
    ("B4", "GF Kitchen", "No construction outside: GL-4 back at its R0 position; wash nook (double sink) inside, vent KW-1 into the OTS."),
    ("B5", "GF Study", "Becomes Guest Lounge / Study: desk on the east wall, sofa, settee, TV."),
    ("B7", "GF Panel & Janitor", "Becomes under-stair storage with inverter / network rack; DB-1 moves to the kitchen east wall (SE)."),
    ("B15", "GF Back lawn", "Deck and pergola outside GL-5; tulsi vrindavan in the lawn's NE corner on the boundary wall."),
    ("C10", "FF Master suite", "Washroom and dresser swapped (bedroom → dresser → washroom); bath tub with over-tub screen; vent KW-2."),
    ("D-04, C9", "FF Bedrooms", "Front-left room is Bedroom 3, front-right is the Kids Room; kids toilet back at its R0 place."),
    ("C8", "FF Lobby", "Cupboard by the lift becomes a pantry counter with wall cupboards, 10\" clear of the lift door."),
    ("D11", "SF (proposed)", "Lobby, servant room + washroom, store; open utility and drying on the covered back terrace."),
    ("E12, E13", "Services", "Plumbing and electrical layouts Rev A re-applied to this layout (separate drawings and reports)."),
    ("F16", "Materials", "Floors: Italian marble (Option A) or 1600 × 800 tiles (Option B), owner to decide; counters black granite."),
]
HOLD_POINTS = [
    ("Master washroom over the kitchen: sunken floor, waterproofing, flood test", "Architect, structural, plumber"),
    ("Front curved balcony (red-line 16): kids-room glazing forms the curve", "Architect"),
    ("GF toilet vanity at the south end (R0 position kept)", "Architect"),
    ("Tank stand on the SF roof, OTS opening, lift pit and overrun", "Structural, lift vendor"),
    ("Deck pergola under \"no outside construction\"", "Owner"),
    ("Living / bedroom floors: Option A marble or Option B tiles", "Owner"),
    ("Tulsi in the plot's SE zone; guest-room AC unit in the NE; DB-3 in the E zone", "Vastu consultant"),
    ("Master headboard on the W wall (red-line asks S); SF rooms not in the S / SW", "Vastu consultant"),
    ("Sewer invert levels and the municipal connection", "Plumber, RWA / MCG"),
]


def f(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


class Sheet:
    def __init__(self):
        self.out = []

    def add(self, s):
        self.out.append(s)

    def rect(self, x, y, w, h, fill="none", stroke=INK, sw=0.25, extra=""):
        self.add('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="%s" stroke-width="%s" %s/>' % (f(x), f(y), f(w), f(h), fill, stroke, f(sw), extra))

    def line(self, x1, y1, x2, y2, stroke=INK, sw=0.25):
        self.add('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s"/>' % (f(x1), f(y1), f(x2), f(y2), stroke, f(sw)))

    def text(self, x, y, s, size=2.2, anchor="start", weight="normal", fill=INK, font=FONT, maxw=None, extra=""):
        fit = ""
        if maxw and text_w(s, size) > maxw:
            fit = ' textLength="%s" lengthAdjust="spacingAndGlyphs"' % f(maxw)
        self.add('<text x="%s" y="%s" font-size="%s" font-family="%s" font-weight="%s" fill="%s" text-anchor="%s"%s %s>%s</text>' % (
            f(x), f(y), f(size), font, weight, fill, anchor, fit, extra, escape(s)))


def text_w(s, size):
    return len(s) * size * 0.47


def wrap(s, width, size):
    words, lines, cur = str(s).split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if cur and text_w(t, size) > width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    return lines + [cur] if cur or not lines else lines


def table(sh, x, y, title, cols, rows, size=1.9, title_size=4.2):
    """cols: [(header, width, anchor)]; rows: lists of cell strings. Returns the y below the table."""
    sh.text(x + sum(c[1] for c in cols) / 2, y + title_size, title, size=title_size, anchor="middle", fill=PINK)
    y += title_size + 2.2
    lh, pad = size * 1.28, 0.75
    tw = sum(c[1] for c in cols)

    def row(cells, bold=False):
        nonlocal y
        wrapped = [wrap(c, w - 1.6, size) for c, (_, w, _) in zip(cells, cols)]
        h = max(len(w) for w in wrapped) * lh + 2 * pad
        cx = x
        for lines, (_, w, anchor) in zip(wrapped, cols):
            tx = cx + (w / 2 if anchor == "middle" else 0.8)
            for i, ln in enumerate(lines):
                sh.text(tx, y + pad + size * 0.95 + i * lh, ln, size=size, anchor=anchor, weight="bold" if bold else "normal",
                        fill=PINK if bold else INK, maxw=w - 1.4)
            sh.line(cx, y, cx, y + h, stroke=PINK, sw=0.2)
            cx += w
        sh.line(cx, y, cx, y + h, stroke=PINK, sw=0.2)
        sh.line(x, y, x + tw, y, stroke=PINK, sw=0.2)
        y += h

    row([c[0] for c in cols], bold=True)
    for r in rows:
        row(r)
    sh.line(x, y, x + tw, y, stroke=PINK, sw=0.2)
    return y


# --------------------------------------------------------------------- plans

def plan(sh, h, fid, x, y, crop_y):
    fl = hl.floor(h, fid)
    src = plans.build(h, fl, title=False)
    vx, vw = CROP_X[0], CROP_X[1] - CROP_X[0]
    vy, vh = crop_y[0], crop_y[1] - crop_y[0]
    src = re.sub(r"<svg [^>]*>", '<svg x="%s" y="%s" width="%s" height="%s" viewBox="%d %d %d %d" overflow="hidden">' % (
        f(x), f(y), f(vw / SCALE), f(vh / SCALE), vx, vy, vw, vh), src, count=1)
    sh.add(re.sub(r"<title>.*?</title>\n", "", src, count=1))
    return lambda mx, my: (x + (mx - vx) / SCALE, y + (my - vy) / SCALE)


def caption(sh, x, y, name, subs):
    sh.text(x, y, name, size=4.2, weight="bold")
    sh.line(x, y + 1.0, x + text_w(name, 4.2) * 1.12, y + 1.0, sw=0.35)
    for i, sub in enumerate(subs):
        sh.text(x, y + 4.4 + i * 2.8, sub, size=2.2, fill="#444")


def level_text(h, fid):
    lvl = h["levels"][fid]
    return ["SCALE 1:100 (A3)", "FFL +%s  ·  floor to floor %s" % (hl.length_label(h, lvl["ffl"]), hl.length_label(h, lvl["floor_to_floor"]))]


# --------------------------------------------------------------------- schedules from the model

def size_text(w, ht):
    return "%s × %s (%.2f × %.2f m)" % (hl.ftin(w), hl.ftin(ht), w / 1000, ht / 1000)


def level_label(mm):
    return "%s (%.2f m)" % (hl.ftin(mm), mm / 1000)


def place_name(fl, pt):
    for r in fl["rooms"] + fl.get("outdoor", []):
        if hl.point_in_poly(pt, r["polygon"]):
            return r["name"]
    return None


def opening_place(fl, w, mid):
    """Name the room an opening serves, from the spaces on its two sides."""
    names = [place_name(fl, hl.wall_point(w, mid, s * (w["t"] / 2 + 200))) for s in (1, -1)]
    names = [n for n in names if n]
    keep = [n for n in names if n not in ("Lobby", "OTS", "Lift")]
    pick = keep if keep else names
    if len(pick) == 2 and any(fl_out(fl, n) for n in pick):
        pick = [n for n in pick if not fl_out(fl, n)] or pick
    return " / ".join(dict.fromkeys(pick)) or "?"


def fl_out(fl, name):
    return any(a["name"] == name for a in fl.get("outdoor", [])) or any(r["name"] == name and r.get("kind") == "outdoor" for r in fl["rooms"])


def door_window_rows(h, fids):
    items, unsched = h["schedule"]["items"], h["schedule"]["unscheduled"]
    found = {}            # mark -> {"sizes": set, "places": {fid: [names]}, "n": int}

    def note(mark, fid, place, size=None, sill=None):
        e = found.setdefault(mark, {"sizes": set(), "places": {}, "n": 0})
        e["n"] += 1
        e["places"].setdefault(fid, []).append(place)
        if size:
            e["sizes"].add((size, sill))

    for fid in fids:
        fl = hl.floor(h, fid)
        for w in fl["walls"]:
            k = w.get("kind")
            if k == "glass_partition":
                note("GL-6", fid, place_name(fl, hl.wall_point(w, hl.wall_length(w) / 2, 0)) or "?")
            elif k == "glass_wall":
                note("GL-F", fid, opening_place(fl, w, hl.wall_length(w) / 2), (round(hl.wall_length(w)), None), 0)
            for o in w.get("openings", []):
                if o["type"] == "glass_door" and o["mark"].startswith("GL-6"):
                    continue          # the door leaf of a GL-6 partition
                note(o["mark"], fid, opening_place(fl, w, o["offset"] + o["width"] / 2), (o["width"], o["height"]), o.get("sill", 0))
        rail = [w for w in fl["walls"] if w.get("kind") == "glass_railing"]
        if rail:
            note("GL-8", fid, opening_place(fl, rail[0], hl.wall_length(rail[0]) / 2), (round(sum(hl.wall_length(w) for w in rail)), rail[0]["h"]), 100)
    rows = []
    for mark in sorted(found, key=lambda m: MARK_ORDER.index(m) if m in MARK_ORDER else 99):
        e = found[mark]
        it = items.get(mark)
        if mark == "GL-6":
            size, sill, lintel = "As per site (6'-7\" / 2.00 m high)", level_label(100), "—"
        elif mark == "D4":
            size, sill, lintel = "As Lift", "—", "—"
        else:
            (w, ht), s = sorted(e["sizes"])[0]
            if mark == "GL-8":
                w = it["size"][0]        # schedule length; check_dims confirms the two arcs add up to it
            size = size_text(w, ht) if ht else "%s arc (%.2f m) × full height" % (hl.ftin(w), w / 1000)
            sill = level_label(s) if s else "—"
            lintel = level_label(s + ht) if ht and mark != "GL-8" else "—"
            if len(e["sizes"]) > 1:
                size += " ±"
        desc = DESC.get(mark) or (it["desc"].split(" (")[0] if it else unsched.get(mark, {}).get("desc", ""))
        if mark == "GL-6":
            desc = "Shower Partition with glass door"
        where = "; ".join("%s %s" % (fid, ", ".join(sorted(dict.fromkeys(p)))) for fid, p in e["places"].items())
        flag = "new" if (not it and mark not in DRAWN_ON_R0) else ("added" if mark in DRAWN_ON_R0 else "")
        rows.append([mark, size, sill, lintel, str(e["n"]), desc, where, flag])
    return rows


def wall_text(r):
    w = r.get("wall") or ""
    base = {"paint_warm_white": "Paint Finish", "tile_matte_lg": "Tile"}.get(w, "Veneer Cladding" if w.startswith("walnut") else (w or "—"))
    if r.get("feature_walls"):
        base += "; fluted veneer feature wall"
    if "marble_white" in (r.get("wall_feature") or ""):
        base += "; Italian Stone backsplash"
    return base


def ceiling_text(r):
    c = r.get("ceiling") or {}
    t = c.get("type") or ""
    if not t:
        return "—"
    if t.startswith("POP + walnut"):
        s = "POP Painted / Veneer"
    elif t == "POP":
        s = "POP Painted"
    elif t == "stair soffit":
        return "Stair soffit, painted"
    elif "polycarbonate" in t:
        return "Polycarbonate canopy"
    else:
        s = t
    if c.get("cove"):
        s += ", cove light"
    if "veneer raft" in (c.get("feature") or ""):
        s += " + veneer raft"
    return s


def core(s):
    s = re.split(r"[,;(*+]| / ", s or "")[0].strip().lower()
    return "" if s == "—" else s


def finish_rows(h, fids):
    r0 = h["finish_schedule_pdf"]["rows"]
    spaces = {}
    for fid in fids:
        fl = hl.floor(h, fid)
        for r in fl["rooms"] + fl.get("outdoor", []):
            spaces[r["id"]] = dict(r, _fid=fid)
    order = []
    if "GF" in fids:
        order += GF_ROWS
    for fid in fids:
        if fid != "GF":
            order += [(None, [r["id"]], None) for r in hl.floor(h, fid)["rooms"] if r.get("kind") not in ("lift", "shaft")]
    rows = []
    for label, ids, r0_idx in order:
        r = spaces[ids[0]]
        outdoor = r.get("kind") == "outdoor" or "surface" in r
        floor = FIN_FLOOR.get(r.get("floor") or r.get("surface"), "—")
        if outdoor:
            ow, oc = OUTDOOR_WC.get(r["id"], (None, None))
            ref = r0[r0_idx] if r0_idx is not None else None
            wall = ow or (ref[2] if ref else "Paint Finish")
            ceil = oc or (ref[3] if ref and ref[3] else ceiling_text(r))
        else:
            wall, ceil = wall_text(r), ceiling_text(r)
        if r0_idx is None and r.get("pdf_finish"):
            loc0 = r["pdf_finish"].split(":")[0].replace(" / ", "/")
            ref = next((x for x in r0 if x[0].replace(" /", "/").replace("/ ", "/") == loc0), None)
        elif r0_idx is None:
            ref = None
        if ref is None:
            flag = "+"
        else:
            same = all(core(a) == core(b) for a, b in zip((floor, wall, ceil), ref[1:])) and not r.get("was")
            flag = "" if same else "△"
        name = "%s %s" % (r["_fid"], label or r["name"])
        rem = REMARKS.get(r["id"], "")
        if r.get("was"):
            rem = ("was %s. " % r["was"]) + rem
        rows.append([name, floor, wall, ceil, rem.strip(), flag])
    return rows


def area_rows(h):
    rows = []
    for fl in h["floors"]:
        tot = 0.0
        for r in fl["rooms"]:
            if r.get("kind") in ("lift", "shaft"):
                continue
            a = hl.poly_area(r["polygon"])
            out = r.get("kind") == "outdoor"
            tot += 0 if out else a
            rows.append([fl["id"], r["name"] + (" (outdoor)" if out else ""), "%.0f" % hl.sqft(a), "%.1f" % hl.sqm(a)])
        rows.append([fl["id"], "Total indoor", "%.0f" % hl.sqft(tot), "%.1f" % hl.sqm(tot)])
    return rows


# --------------------------------------------------------------------- frame, title block, legend

def frame(sh, h, contents, sht):
    sh.rect(0, 0, W, H, fill="#fff", stroke="none")
    sh.rect(4, 4, W - 8, H - 8, sw=0.6)
    sh.rect(5, 5, W - 10, H - 10, sw=0.25)
    y0, y1 = 266, 292
    sh.line(5, y0, W - 5, y0, sw=0.5)
    # contractor (as R0)
    sh.text(6.5, y0 + 3.2, "CONTRACTOR:-", size=2.1, weight="bold")
    sh.text(9, y0 + 9.6, "UNIQUE PROJECT SOLUTIONS", size=5.4, fill="#d9534f", font=SERIF)
    for i, s in enumerate(["D-53/4, Ground Floor, Shaheen Bagh, Abul Fazal Encl.-2", "Jamia Nagar, Okhla, New Delhi 110025",
                           "E- uniqueprojectsolutions@gmail.com", "M-9911012341"]):
        sh.text(11, y0 + 13.6 + i * 3.3, s, size=2.5, weight="bold")
    # project / client / architects
    x = 100
    sh.line(x, y0, x, y1, sw=0.4)
    sh.line(x, y0 + 9.5, 245, y0 + 9.5)
    sh.line(x, y0 + 18, 245, y0 + 18)
    sh.text(x + 1.5, y0 + 5.6, "PROJECT :-", size=2.5)
    sh.text(x + 16, y0 + 4.0, "RENOVATION WORK AT GH-18, CELEBRITY HOMES, PALAM VIHAR", size=2.9)
    sh.text(x + 16, y0 + 7.8, "GURUGRAM", size=2.9)
    sh.text(x + 1.5, y0 + 15.0, "CLIENT:-", size=2.5)
    sh.text(x + 15, y0 + 15.0, h["meta"]["client"], size=3.6, weight="bold")
    sh.text(x + 1.5, y0 + 23.3, "ARCHITECTS:-", size=2.5)
    sh.text(x + 19, y0 + 23.3, "Mr. Harish", size=3.2, weight="bold")
    # sheet contents / drn / chd / dwg no / released for
    x = 245
    sh.line(x, y0, x, y1, sw=0.4)
    sh.line(x, y0 + 10, 365, y0 + 10)
    sh.line(x, y0 + 20.5, 365, y0 + 20.5)
    sh.text(x + 1.5, y0 + 3.4, "SHEET CONTENTS :-", size=2.2)
    sh.text(x + 4, y0 + 8.3, contents, size=3.5, weight="bold", maxw=113)
    for cx in (275, 300):
        sh.line(cx, y0 + 10, cx, y0 + 20.5)
    sh.text(x + 15, y0 + 13.3, "DRN.", size=2.3, anchor="middle")
    sh.text(287.5, y0 + 13.3, "CHD.", size=2.3, anchor="middle")
    sh.text(301.5, y0 + 13.6, "DWG. NO. :-", size=2.3)
    sh.text(315, y0 + 18.2, DWG_NO, size=3.6, weight="bold")
    boxes = [("RELEASED FOR :-", None), ("PRELIMINARY", False), ("TENDER", False), ("INFORMATION", False), ("APPROVAL", True),
             ("FABRICATION", False), ("SERVE", False)]
    bx = x + 1
    for name, on in boxes:
        if on is not None:
            sh.rect(bx, y0 + 22.1, 1.7, 1.7, fill=INK if on else "none", sw=0.2)
            bx += 2.2
        sh.text(bx, y0 + 23.7, name, size=1.75, weight="bold" if on else "normal")
        bx += text_w(name, 1.75) + 3.2
    # date / scale / rev / sheet
    x = 365
    sh.line(x, y0, x, y1, sw=0.4)
    sh.line(x, y0 + 8.5, W - 5, y0 + 8.5)
    sh.line(x, y0 + 15, W - 5, y0 + 15)
    sh.line(385, y0 + 15, 385, y1)
    sh.text(x + 1.5, y0 + 5.6, "DATE :-", size=2.4)
    sh.text(x + 12.5, y0 + 5.7, DATE, size=3.2, weight="bold")
    sh.text(x + 1.5, y0 + 12.6, "SCALE:-", size=2.4)
    sh.text(x + 12.5, y0 + 12.7, "1:100 (A3)", size=3.0, weight="bold")
    sh.text(375, y0 + 18.8, "REV.", size=2.3, anchor="middle")
    sh.text(375, y0 + 24, "R1", size=3.6, weight="bold", anchor="middle")
    sh.text(400, y0 + 18.8, "SHT.NO.", size=2.3, anchor="middle")
    sh.text(400, y0 + 24, sht, size=3.6, weight="bold", anchor="middle")


def north(sh, h, x, y):
    nv = h["meta"]["north_vector"]
    ang = math.degrees(math.atan2(nv[1], nv[0])) + 90
    sh.add('<g transform="translate(%s %s) rotate(%s)"><circle r="4.2" fill="none" stroke="%s" stroke-width="0.25"/>'
           '<path d="M0,-3.8 L1.4,2 L0,1.1 L-1.4,2 Z" fill="%s"/></g>' % (f(x), f(y), f(ang), INK, INK))
    sh.text(x, y + 7.6, "N", size=2.6, anchor="middle", weight="bold")
    sh.text(x, y + 10.2, "road side", size=1.8, anchor="middle", fill="#555")


def scale_bars(sh, sx, sy):
    """Bars at 1:100: 5 m and 16 ft."""
    sh.text(sx - 1, sy - 1.6, "GRAPHIC SCALE 1:100", size=1.9, weight="bold")
    for i in range(5):
        sh.rect(sx + i * 10, sy, 10, 1.2, fill=INK if i % 2 == 0 else "#fff", sw=0.2)
    sh.text(sx, sy + 3.6, "0", size=1.8, anchor="middle")
    sh.text(sx + 50, sy + 3.6, "5 m", size=1.8, anchor="middle")
    ft = 304.8 / SCALE
    for i in range(4):
        sh.rect(sx + i * 4 * ft, sy + 6, 4 * ft, 1.2, fill=INK if i % 2 == 0 else "#fff", sw=0.2)
    sh.text(sx, sy + 9.6, "0", size=1.8, anchor="middle")
    sh.text(sx + 16 * ft, sy + 9.6, "16 ft", size=1.8, anchor="middle")


def legend(sh, x, y, width):
    sh.text(x, y, "LEGEND", size=2.8, weight="bold", fill=PINK)
    items = [("#262626", "Existing wall"), ("#6f6f6f", "New wall / partition"), ("url(#hatchP)", "Proposed wall (SF)"),
             ("#8c8c8c", "Boundary wall 1500 high"), (plans.GLASS, "Glass / glazing"), (None, "Floor above / overhead (dashed)")]
    col = width / 2
    for i, (fill, txt) in enumerate(items):
        cx, cy = x + (i % 2) * col, y + 3 + (i // 2) * 3.6
        if fill:
            sh.rect(cx, cy, 5, 2.2, fill=fill, stroke="#444", sw=0.15)
        else:
            sh.add('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#777" stroke-width="0.3" stroke-dasharray="1.2 0.8"/>' % (f(cx), f(cy + 1.1), f(cx + 5), f(cy + 1.1)))
        sh.text(cx + 6.5, cy + 1.9, txt, size=2.0)
    cy = y + 3 + 3 * 3.6
    sh.add('<circle cx="%s" cy="%s" r="1.4" fill="#fff" stroke="#c2185b" stroke-width="0.15"/>' % (f(x + 2.5), f(cy + 1.1)))
    sh.text(x + 2.5, cy + 1.6, "D2", size=1.1, anchor="middle", fill="#c2185b")
    sh.text(x + 6.5, cy + 1.9, "Door / window mark (see schedule)", size=2.0)
    sh.text(x + col, cy + 1.9, "R1 CHANGE", size=1.9, weight="bold", fill=RED)
    sh.text(x + col + 13, cy + 1.9, "room changed from R0", size=2.0)
    return cy + 4


# --------------------------------------------------------------------- sheets

def sheet1(h):
    sh = Sheet()
    frame(sh, h, "GROUND FLOOR PLAN & FIRST FLOOR PLAN", "1 of 2")
    gf = plan(sh, h, "GF", 7, 7, CROP_GF)
    cx, cy = gf(-200, 23150)
    caption(sh, cx, cy, "GROUND FLOOR PLAN", level_text(h, "GF"))
    ff = plan(sh, h, "FF", 126, 7, CROP_UP)
    cx, cy = ff(-200, CROP_UP[1] + 300)
    caption(sh, cx, cy, "FIRST FLOOR PLAN", level_text(h, "FF"))
    y = legend(sh, 127, cy + 12, 92)
    north(sh, h, 233, cy + 16)
    y = revisions(sh, 127, y + 2, 113)
    scale_bars(sh, 129, y + 5)
    x = 245
    y = table(sh, x, 6, "DOOR-WINDOW SCHEDULE", dw_cols(), door_window_rows(h, ["GF", "FF"]))
    sh.text(x, y + 3, "Sizes W × H in feet-inches (metres). CILL and LINTEL above finished floor. NOS = number on this sheet. "
                      "new = not on R0; added = drawn on R0, not scheduled. ± = more than one size, as marked on plan.", size=1.7, fill="#555", maxw=168)
    y = table(sh, x, y + 6, "FINISHING SCHEDULE", fin_cols(), finish_rows(h, ["GF", "FF"]))
    fin_notes(sh, x, y)
    return sh


def dw_cols():
    return [("MARK", 11, "middle"), ("SIZE", 30, "start"), ("CILL", 16, "start"), ("LINTEL", 16, "start"), ("NOS", 7, "middle"),
            ("DESCRIPTION", 37, "start"), ("LOCATION", 43, "start"), ("R1", 8, "middle")]


def fin_cols():
    return [("LOCATION", 27, "start"), ("FLOOR", 25, "start"), ("WALL", 30, "start"), ("CEILING", 26, "start"),
            ("REMARKS", 54, "start"), ("R1", 6, "middle")]


def fin_notes(sh, x, y):
    for i, s in enumerate([
            "* Italian Stone: Option A Italian marble 18 mm polished in place, or Option B large-format vitrified 1600 × 800 marble look. Owner to decide (materials schedule F16).",
            "Tile: matte porcelain 1200 × 600, floors and walls of wet rooms. △ = changed from R0;  + = row added in R1 (R0 schedules the GF only)."]):
        sh.text(x, y + 3 + i * 2.6, s, size=1.7, fill="#555", maxw=168)


def revisions(sh, x, y, width):
    cols = [("REV", 10, "middle"), ("DATE", 15, "middle"), ("DESCRIPTION", width - 25, "start")]
    return table(sh, x, y, "REVISIONS", cols, [
        ["R0", "17.08.25", "Ground floor plan issued for approval (UPS)."],
        ["R1", DATE, "Owner changes of Oct 2026 on R0: layout, Vastu red-lines, plumbing, electrical and materials. FF and proposed SF added. See sheet 2."],
    ], size=1.9, title_size=2.8)


def sheet2(h):
    sh = Sheet()
    frame(sh, h, "SECOND FLOOR PLAN (PROPOSED) & R1 NOTES", "2 of 2")
    sf = plan(sh, h, "SF", 7, 7, CROP_UP)
    cx, cy = sf(-200, CROP_UP[1] + 300)
    caption(sh, cx, cy, "SECOND FLOOR PLAN (PROPOSED)", level_text(h, "SF"))
    y = legend(sh, 8, cy + 12, 92)
    north(sh, h, 114, cy + 16)
    scale_bars(sh, 10, y + 6)
    notes = ["All dimensions in feet-inches with metres in brackets. Do not scale; check on site.",
             "Drawn from the R1 model (house_r1.json). Every R0 dimension is re-measured (plans/r1/check_report.txt).",
             "The second floor is a proposal; it is not on R0. Structure, lift overrun and tank stand to be confirmed.",
             "Read with the R1 change register, the plumbing and electrical reports and the materials schedule."]
    # schedules for the SF
    x1, x2 = 126, 272
    sf_dw = [("MARK", 11, "middle"), ("SIZE", 33, "start"), ("CILL", 16, "start"), ("LINTEL", 16, "start"), ("NOS", 7, "middle"),
             ("DESCRIPTION", 32, "start"), ("LOCATION", 27, "start")]
    ya = table(sh, x1, 6, "DOOR-WINDOW SCHEDULE · SF", sf_dw, [r[:7] for r in door_window_rows(h, ["SF"])])
    sf_fin = [("LOCATION", 30, "start"), ("FLOOR", 26, "start"), ("WALL", 27, "start"), ("CEILING", 25, "start"), ("REMARKS", 33, "start")]
    yb = table(sh, x2, 6, "FINISHING SCHEDULE · SF", sf_fin, [r[:5] for r in finish_rows(h, ["SF"])])
    y = max(ya, yb) + 5
    yr = table(sh, x1, y, "R1 REVISION NOTES (CHANGES FROM R0)", [("REF", 13, "middle"), ("AREA", 24, "start"), ("CHANGE", 105, "start")],
               [list(r) for r in REVISION_NOTES], size=2.25)
    table(sh, x1, yr + 5, "GENERAL NOTES", [("NO", 8, "middle"), ("NOTE", 134, "start")],
          [[str(i + 1), n] for i, n in enumerate(notes)], size=2.25)
    yh = table(sh, x2, y, "OPEN ITEMS & HOLD POINTS", [("ITEM", 95, "start"), ("FOR", 46, "start")], [list(r) for r in HOLD_POINTS], size=2.2)
    table(sh, x2, yh + 4, "ROOM AREAS (internal, incl. built-in joinery)", [("FLR", 9, "middle"), ("ROOM", 76, "start"), ("SQ FT", 28, "middle"), ("M²", 28, "middle")],
          area_rows(h), size=2.0, title_size=3.2)
    return sh


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "house_r1.json"
    out_dir = os.path.join(hl.ROOT, sys.argv[2] if len(sys.argv) > 2 else "plans/r1")
    h = hl.load(os.path.join(hl.ROOT, src))
    plans.FEET, plans.SRC, plans.CHANGE_WORD = hl.feet(h), src, "R1 CHANGE"
    pages = []
    for sh in (sheet1(h), sheet2(h)):
        pages.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%dmm" height="%dmm">\n%s\n</svg>' % (W, H, W, H, "\n".join(sh.out)))
    html = ('<!doctype html><html><head><meta charset="utf-8"><title>GH-18 %s R1</title><style>@page{size:A3 landscape;margin:0}'
            'body{margin:0}svg{display:block;page-break-after:always}svg svg{page-break-after:auto}</style></head><body>\n%s\n</body></html>\n'
            % (DWG_NO, "\n".join(pages)))
    path = os.path.join(out_dir, "GH-18_R1_drawing.html")
    with open(path, "w") as fp:
        fp.write(html)
    print("wrote", path)


if __name__ == "__main__":
    main()
