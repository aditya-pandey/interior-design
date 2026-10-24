"""Compare house.json against every dimension string read from the PDF.

Each PDF string (inputs/pdf_dims.json, made by pdf_extract.py) is matched to a
measurement taken from house.json. Anything off by more than TOL mm is a
mismatch. Also checks opening sizes against the door/window schedule and the
coverage of the PDF strings (every string must be mapped).

Usage: python3 tools/check_dims.py            (prints the report, writes plans/check_report.txt)
Exit code 1 if any mismatch over TOL or any PDF string is unmapped.
PDF strings made obsolete by a client change (SUPERSEDED, ASSUMPTIONS.md section D)
are still mapped and listed, with the model value, but are not counted as mismatches.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import houselib as hl  # noqa: E402

TOL = 50

# (floor, PDF text, approx X) -> client change that made the PDF dimension obsolete
SUPERSEDED = {
    ("GF", "6000", 295.7): "D-01 closed kitchen: its new wall takes 150 from the drawing room",
    ("GF", "1850", 193.2): "D-01 closed kitchen: peninsula removed",
    ("GF", "1250", 164.5): "D-01 closed kitchen: peninsula removed",
    ("GF", "R300", 180.0): "D-01 closed kitchen: peninsula removed",
    ("FF", "3100", 752.8): "D-03 toilet moved to the front wall",
    ("FF", "1500", 802.1): "D-03 toilet moved to the front wall",
    ("FF", "3250", 750.2): "D-03 toilet moved to the front wall",
    ("FF", "4258", 800.0): "D-03 toilet moved to the front wall",
}


def superseded(fl, txt, X):
    return next((v for (f, t, x), v in SUPERSEDED.items() if f == fl and t == txt and abs(x - X) < 4), None)


# ------------------------------------------------------------- model probes
class Probe:
    def __init__(self, h):
        self.h = h
        self.walls = {w["id"]: w for fl in h["floors"] for w in fl["walls"]}
        self.furn = {f["id"]: f for fl in h["floors"] for f in fl["furniture"]}
        self.ops = {o["id"]: (o, w) for w in self.walls.values() for o in w.get("openings", [])}

    def f(self, wid, side):            # wall face coordinate
        return hl.face(self.walls[wid], side)

    def t(self, wid):
        return self.walls[wid]["t"]

    def a(self, wid, i):               # wall start point coordinate (0=x, 1=y)
        return self.walls[wid]["a"][i]

    def b(self, wid, i):
        return self.walls[wid]["b"][i]

    def fb(self, fid):                 # furniture world bbox
        return hl.poly_bbox(hl.furniture_corners(self.furn[fid]))

    def op_start(self, oid, i):        # coordinate where an opening starts along an axis-aligned wall
        o, w = self.ops[oid]
        return hl.wall_point(w, o["offset"])[i]

    def arc_face_r(self, wid, side):   # radius of an arc wall face ('in' / 'out')
        w = self.walls[wid]
        return w["arc"]["r"] + (w["t"] / 2 if side == "out" else -w["t"] / 2)

    def arc_y_at_x(self, wid, x, side):
        w = self.walls[wid]
        cx, cy = w["arc"]["c"]
        r = self.arc_face_r(wid, side)
        return cy + math.sqrt(r * r - (x - cx) ** 2)


# (floor, pdf text, approx PDF X, approx PDF Y, description, measure(P), draw-on-plan (p1, p2, offset) or None)
# p1/p2 are lambdas returning model points so the plan dimensions are drawn from the model, not copied.
SPEC = [
  # ------------------------------------------------------------------ GF
  ("GF", "2921", 139.8, 343.6, "Kitchen: left wall inner face -> kitchen wall (D-01, on the PDF peninsula line)",
   lambda P: P.f("GF-W27", "-") - P.f("GF-W02", "+"),
   lambda P: ((P.f("GF-W02", "+"), 6265), (P.f("GF-W27", "-"), 6265), -300)),
  ("GF", "6000", 295.7, 343.6, "Drawing: kitchen wall outer face -> right wall inner face",
   lambda P: P.f("GF-W04", "-") - P.f("GF-W27", "+"),
   lambda P: ((P.f("GF-W27", "+"), 6265), (P.f("GF-W04", "-"), 6265), -300)),
  ("GF", "1721", 139.5, 369.6, "Kitchen: left counter front -> right run front (was the peninsula inner edge)",
   lambda P: P.fb("GF-K02")[0] - P.fb("GF-K03")[2], None),
  ("GF", "1850", 193.2, 374.3, "Peninsula: rear wall inner face -> centre of R300 end", None, None),
  ("GF", "1250", 164.5, 384.8, "Peninsula: rear counter front -> centre of R300 end", None, None),
  ("GF", "R300", 180.0, 405.0, "Peninsula end radius", None, None),
  ("GF", "4785", 91.6, 425.4, "Left side: rear wall inner face -> OTS outer face",
   lambda P: P.f("GF-OTS1", "-") - P.f("GF-W01", "+"),
   lambda P: ((P.f("GF-W02", "+"), P.f("GF-W01", "+")), (P.f("GF-W02", "+"), P.f("GF-OTS1", "-")), -450)),
  ("GF", "5100", 394.1, 431.1, "Right side: rear wall inner face -> lift top wall outer face",
   lambda P: P.f("GF-W09", "-") - P.f("GF-W01", "+"),
   lambda P: ((P.f("GF-W04", "-"), P.f("GF-W01", "+")), (P.f("GF-W04", "-"), P.f("GF-W09", "-")), 450)),
  ("GF", "4185", 118.2, 436.0, "Kitchen left run: rear counter front -> OTS outer face",
   lambda P: P.f("GF-OTS1", "-") - P.fb("GF-K01")[3], None),
  ("GF", "3170", 171.8, 516.4, "Service band: OTS -> lobby wall (toilet clear width)",
   lambda P: P.f("GF-W12", "-") - P.f("GF-OTS4", "+"),
   lambda P: ((P.f("GF-OTS4", "+"), 10766), (P.f("GF-W12", "-"), 10766), 0)),
  ("GF", "150", 221.8, 516.4, "Lobby west wall thickness",
   lambda P: P.t("GF-W12"), None),
  ("GF", "2850", 282.7, 516.4, "Lobby width at lift",
   lambda P: P.f("GF-W10", "-") - P.f("GF-W12", "+"),
   lambda P: ((P.f("GF-W12", "+"), 10766), (P.f("GF-W10", "-"), 10766), 0)),
  ("GF", "1950", 366.5, 516.4, "Lift block width (incl. lift west wall)",
   lambda P: P.f("GF-W04", "-") - P.f("GF-W10", "-"),
   lambda P: ((P.f("GF-W10", "-"), 10766), (P.f("GF-W04", "-"), 10766), 0)),
  ("GF", "915", 121.1, 525.4, "Strip between OTS top and toilet top wall",
   lambda P: P.f("GF-W17", "-") - P.f("GF-OTS1", "-"), None),
  ("GF", "600", 222.7, 530.9, "Lift top line -> toilet top wall",
   lambda P: P.f("GF-W17", "-") - P.f("GF-W09", "-"), None),
  ("GF", "3170", 171.8, 550.8, "Toilet clear width (upper part)",
   lambda P: P.f("GF-W12", "-") - P.f("GF-OTS4", "+"), None),
  ("GF", "2100", 327.1, 557.2, "Lift block depth (outer)",
   lambda P: P.f("GF-W11", "+") - P.f("GF-W09", "-"),
   lambda P: ((7200, P.f("GF-W09", "-")), (7200, P.f("GF-W11", "+")), 350)),
  ("GF", "1800", 395.9, 557.4, "Lift shaft clear depth",
   lambda P: P.f("GF-W11", "-") - P.f("GF-W09", "+"), None),
  ("GF", "1450", 120.0, 572.3, "Toilet top wall -> OTS bottom (GL-3 zone)",
   lambda P: P.f("GF-OTS3", "+") - P.f("GF-W17", "+"), None),
  ("GF", "950", 91.9, 614.2, "OTS bottom -> toilet/guest wall",
   lambda P: P.f("GF-W18", "-") - P.f("GF-OTS3", "+"), None),
  ("GF", "4000", 157.4, 624.4, "Toilet clear width (lower part)",
   lambda P: P.f("GF-W12", "-") - P.f("GF-W03", "+"), None),
  ("GF", "6430", 235.3, 633.1, "Lobby run: lift top line -> main door line",
   lambda P: P.f("GF-W21", "-") - P.f("GF-W09", "-"),
   lambda P: ((P.f("GF-W12", "+"), P.f("GF-W09", "-")), (P.f("GF-W12", "+"), P.f("GF-W21", "-")), -300)),
  ("GF", "600", 91.6, 646.6, "Guest wardrobe strip depth",
   lambda P: P.fb("GF-G04")[3] - P.f("GF-W18", "+"), None),
  ("GF", "4000", 157.4, 661.2, "Guest room clear width",
   lambda P: P.f("GF-W12", "-") - P.f("GF-W03", "+"),
   lambda P: ((P.f("GF-W03", "+"), 15250), (P.f("GF-W12", "-"), 15250), 0)),
  ("GF", "3275", 280.9, 688.5, "Stair spine -> main door line",
   lambda P: P.f("GF-W21", "-") - P.f("GF-W22", "-"), None),
  ("GF", "2470", 221.7, 700.5, "Guest door jamb -> start of curved wall",
   lambda P: P.b("GF-W13", 1) - P.op_start("GF-D2a", 1), None),
  ("GF", "1550", 259.6, 719.0, "Lobby narrow width",
   lambda P: P.f("GF-W19", "-") - P.f("GF-W12", "+"),
   lambda P: ((P.f("GF-W12", "+"), 16600), (P.f("GF-W19", "-"), 16600), 0)),
  ("GF", "4440", 91.6, 734.9, "Guest room depth: wardrobe front -> GL-1 wall",
   lambda P: P.f("GF-W16", "-") - P.fb("GF-G04")[3],
   lambda P: ((P.f("GF-W03", "+"), P.fb("GF-G04")[3]), (P.f("GF-W03", "+"), P.f("GF-W16", "-")), 400)),
  ("GF", "4590", 395.2, 764.2, "Study (mandir+store) depth from janitor-side face",
   lambda P: P.f("GF-W24", "-") - P.f("GF-W23", "-"),
   lambda P: ((P.f("GF-W04", "-"), P.f("GF-W23", "-")), (P.f("GF-W04", "-"), P.f("GF-W24", "-")), 450)),
  ("GF", "R1526", 232.0, 766.0, "Curved wall radius (guest-room face)",
   lambda P: P.arc_face_r("GF-W14", "in"), None),
  ("GF", "715", 178.9, 800.3, "Pier top -> GL-1 wall inner face",
   lambda P: P.f("GF-W16", "-") - P.a("GF-W15", 1), None),
  ("GF", "2730", 135.1, 809.5, "Left wall inner face -> pier (GL-1 jamb to jamb)",
   lambda P: P.f("GF-W15", "-") - P.f("GF-W03", "+"), None),
  ("GF", "3070", 347.1, 826.7, "Study (mandir+store) width",
   lambda P: P.f("GF-W04", "-") - P.f("GF-W20", "+"),
   lambda P: ((P.f("GF-W20", "+"), P.f("GF-W24", "-")), (P.f("GF-W04", "-"), P.f("GF-W24", "-")), 400)),
  # ------------------------------------------------------------------ FF
  ("FF", "2761", 543.2, 345.0, "Master toilet width",
   lambda P: P.f("FF-W07", "-") - P.f("FF-W02", "+"),
   lambda P: ((P.f("FF-W02", "+"), 5665), (P.f("FF-W07", "-"), 5665), 350)),
  ("FF", "6000", 701.9, 383.5, "Master bedroom width (upper part)",
   lambda P: P.f("FF-W04", "-") - P.f("FF-W07", "+"),
   lambda P: ((P.f("FF-W07", "+"), 7300), (P.f("FF-W04", "-"), 7300), 0)),
  ("FF", "2940", 497.2, 393.2, "Master toilet depth",
   lambda P: P.f("FF-W08", "-") - P.f("FF-W01", "+"),
   lambda P: ((P.f("FF-W02", "+"), P.f("FF-W01", "+")), (P.f("FF-W02", "+"), P.f("FF-W08", "-")), 400)),
  ("FF", "3864", 802.4, 449.4, "Master bedroom depth (GL-7 wall -> band wall)",
   lambda P: P.f("FF-W09", "-") - P.f("FF-W06", "+"),
   lambda P: ((P.f("FF-W04", "-"), P.f("FF-W06", "+")), (P.f("FF-W04", "-"), P.f("FF-W09", "-")), 450)),
  ("FF", "1685", 482.4, 480.0, "Dresser depth on the left wall",
   lambda P: P.f("FF-OTS1", "-") - P.f("FF-W08", "+"), None),
  ("FF", "4730", 724.4, 512.5, "Master bedroom width at the lobby",
   lambda P: P.f("FF-W04", "-") - P.f("FF-W11", "+"), None),
  ("FF", "2780", 690.1, 524.9, "FF lobby width",
   lambda P: P.f("FF-W15", "-") - P.f("FF-W11", "+"),
   lambda P: ((P.f("FF-W11", "+"), 11000), (P.f("FF-W15", "-"), 11000), 0)),
  ("FF", "3240", 579.3, 527.8, "Kids toilet width",
   lambda P: P.f("FF-W11", "-") - P.f("FF-OTS4", "+"),
   lambda P: ((P.f("FF-OTS4", "+"), 12500), (P.f("FF-W11", "-"), 12500), 0)),
  ("FF", "1965", 527.3, 558.0, "Kids toilet depth",
   lambda P: P.f("FF-W12", "-") - P.f("FF-W09", "+"), None),
  ("FF", "2015", 733.4, 558.8, "FF lift block depth",
   lambda P: P.f("FF-W16", "+") - P.f("FF-W09", "+"), None),
  ("FF", "4455", 643.7, 601.5, "FF lobby length",
   lambda P: P.f("FF-W17", "-") - P.f("FF-W09", "+"),
   lambda P: ((P.f("FF-W11", "+"), P.f("FF-W09", "+")), (P.f("FF-W11", "+"), P.f("FF-W17", "-")), -300)),
  ("FF", "4070", 564.8, 619.8, "Bedroom 3 (was kids room) clear width",
   lambda P: P.f("FF-W11", "-") - P.f("FF-W03", "+"),
   lambda P: ((P.f("FF-W03", "+"), 14000), (P.f("FF-W11", "-"), 14000), 0)),
  ("FF", "3100", 752.8, 680.8, "Old bedroom 3 toilet width", None, None),
  ("FF", "1500", 802.1, 706.1, "Old bedroom 3 toilet depth", None, None),
  ("FF", "5540", 496.1, 715.7, "Bedroom 3 (was kids room) depth: wardrobe front -> GL-1 wall",
   lambda P: P.f("FF-W24", "-") - P.fb("FF-B01")[3],
   lambda P: ((P.f("FF-W03", "+"), P.fb("FF-B01")[3]), (P.f("FF-W03", "+"), P.f("FF-W24", "-")), 400)),
  ("FF", "3250", 750.2, 742.2, "Old bedroom 3 toilet block width incl. west wall", None, None),
  ("FF", "4550", 660.0, 764.5, "Kids room (was bedroom 3) wardrobe wall length",
   lambda P: P.b("FF-W21", 1) - P.a("FF-W21", 1), None),
  ("FF", "4258", 800.0, 812.1, "Old bedroom 3 depth along the right wall (to the old toilet)", None, None),
]


def opening_checks(P):
    """Openings vs the schedule. Returns rows (id, mark, model, schedule, delta)."""
    rows = []
    items = P.h["schedule"]["items"]
    for oid, (o, w) in sorted(P.ops.items()):
        mark = o["mark"].replace("D-", "D")
        if mark not in items or not items[mark]["size"]:
            continue
        sw, sh = items[mark]["size"]
        rows.append((oid, o["mark"], "width", o["width"], sw))
        if items[mark].get("sill") is not None and o["type"] not in ("door",):
            rows.append((oid, o["mark"], "sill", o["sill"], items[mark]["sill"]))
        rows.append((oid, o["mark"], "height", o["height"], sh if mark != "GL-9" else 2300))
    # GL-8 railing: total arc length of both railing arcs
    gl8 = sum(hl.wall_length(P.walls[i]) for i in ("FF-W28", "FF-W29"))
    rows.append(("FF-W28+29", "GL-8", "length", round(gl8), items["GL-8"]["size"][0]))
    return rows


def brief_checks(P):
    h = P.h
    rows = [
        ("Interior width (2921 + 6000)", P.f("GF-W04", "-") - P.f("GF-W02", "+"), 8921),
        ("Outer width", h["meta"]["plot"]["width_outer"], 9400),
        ("Rear boundary -> front boundary", h["meta"]["plot"]["depth_to_front_boundary"], 22400),
        ("Back lawn depth (boundary -> house)", P.f("GF-W01", "-") - P.f("GF-B1", "+"), 5400),
        ("Deck depth from house", 5515 - 2814, 2700),
    ]
    return rows


def main():
    h = hl.load()
    P = Probe(h)
    pdf = json.load(open(os.path.join(hl.ROOT, "inputs", "pdf_dims.json")))["dims"]
    lines, bad = [], 0
    out = lines.append
    out("GH-18 dimension check   (tolerance %d mm)" % TOL)
    out("source: house.json vs %d dimension strings in inputs/pdf_dims.json" % len(pdf))
    out("")
    out("%-3s %-6s %-6s %-7s %-6s %-6s %s" % ("fl", "PDF", "model", "delta", "status", "", "what"))
    used = set()
    for fl, txt, X, Y, desc, fn, _ in SPEC:
        # map to the extracted record (coverage)
        cand = [i for i, d in enumerate(pdf) if d["floor"] == fl and d["text"] == txt and abs(d["X"] - X) < 4 and abs(d["Y"] - Y) < 4]
        rec = "" if cand else "  [not found in pdf_dims.json]"
        used.update(cand)
        val = int(txt.lstrip("R"))
        why = superseded(fl, txt, X)
        if why:
            m = fn(P) if fn else None
            if not cand:
                bad += 1
            out("%-3s %-6s %-6s %7s %-6s %-6s %s  [superseded: %s]%s" % (
                fl, txt, "-" if m is None else "%.0f" % m, "-" if m is None else "%+.0f" % (m - val), "SUPER", "", desc, why, rec))
            continue
        m = fn(P)
        d = m - val
        st = "OK" if abs(d) <= 20 else ("OK~" if abs(d) <= TOL else "FAIL")
        if st == "FAIL" or not cand:
            bad += 1
        out("%-3s %-6s %-6.0f %+7.0f %-6s %-6s %s%s" % (fl, txt, m, d, st, "", desc, rec))
    unmapped = [d for i, d in enumerate(pdf) if i not in used]
    out("")
    out("PDF strings mapped: %d / %d" % (len(used), len(pdf)))
    for d in unmapped:
        bad += 1
        out("  UNMAPPED: %s %s at (%.1f, %.1f)" % (d["floor"], d["text"], d["X"], d["Y"]))
    out("")
    out("Openings vs door/window schedule")
    for oid, mark, what, m, s in opening_checks(P):
        d = m - s
        st = "OK" if abs(d) <= 20 else ("OK~" if abs(d) <= TOL else "FAIL")
        if st == "FAIL":
            bad += 1
        out("  %-10s %-6s %-6s model %5.0f  schedule %5.0f  %+5.0f  %s" % (oid, mark, what, m, s, d, st))
    out("")
    out("Brief figures (informational, brief values are approximate)")
    for name, m, b in brief_checks(P):
        out("  %-38s model %6.0f   brief ~%6.0f   %+6.0f" % (name, m, b, m - b))
    out("")
    fails = sum(1 for l in lines if " FAIL" in l)
    out("RESULT: %s  (%d mismatches over %d mm, %d unmapped PDF strings)" % (
        "PASS" if bad == 0 else "FAIL", fails, TOL, len(unmapped)))
    out("Legend: OK = within 20 mm, OK~ = 21-50 mm (explained in ASSUMPTIONS.md), FAIL = over 50 mm,")
    out("        SUPER = PDF dimension superseded by a client change (ASSUMPTIONS.md section D)")
    text = "\n".join(lines)
    print(text)
    os.makedirs(os.path.join(hl.ROOT, "plans"), exist_ok=True)
    with open(os.path.join(hl.ROOT, "plans", "check_report.txt"), "w") as f:
        f.write(text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
