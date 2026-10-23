"""Extract every dimension string from the architect's PDF.

Writes inputs/pdf_dims.json: one record per numeric dimension string (and the
R-radius labels), with its position in the PDF read in drawing orientation
(X right, Y down, PDF points, page rotated so the lawn is at the top).

Needs pdfplumber (pip install pdfplumber). The JSON is committed, so the check
script does not need pdfplumber.

Usage: python3 tools/pdf_extract.py ["inputs/GH-18 GF FF Floor Plan.pdf"]
"""
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "inputs", "GH-18 GF FF Floor Plan.pdf")
OUT = os.path.join(ROOT, "inputs", "pdf_dims.json")

FF_SPLIT_X = 430.0   # FF sheet is to the right of this X (reading frame)
DIM_COLOR = "(1.0, 0.0, 0.0)"   # dimension text is pure red in this drawing


def main():
    import pdfplumber
    page = pdfplumber.open(PDF).pages[0]
    ph = page.height                     # 841.92: page is stored landscape, shown rotated 270
    chars, seen = [], set()
    for c in page.chars:
        key = (c["text"], round(c["x0"], 2), round(c["top"], 2))
        if key in seen:
            continue
        seen.add(key)
        a, b = c["matrix"][0], c["matrix"][1]
        chars.append(dict(t=c["text"], X=ph - (c["top"] + c["bottom"]) / 2, Y=(c["x0"] + c["x1"]) / 2,
                          ang=round(math.degrees(math.atan2(b, a))), size=c["size"],
                          col=str(c.get("non_stroking_color"))))
    groups = {}
    for ch in chars:
        horiz = ch["ang"] == 90
        base = round((ch["Y"] if horiz else ch["X"]) * 2) / 2
        pos = ch["X"] if horiz else ch["Y"]
        groups.setdefault((ch["ang"], base), []).append((pos, ch))
    words = []
    for (ang, base), lst in groups.items():
        lst.sort(key=lambda t: t[0], reverse=(ang == 180))
        cur = [lst[0]]
        for it in lst[1:]:
            if abs(it[0] - cur[-1][0]) < max(it[1]["size"], cur[-1][1]["size"]) * 0.9 + 0.5:
                cur.append(it)
            else:
                words.append((ang, cur))
                cur = [it]
        words.append((ang, cur))
    out = []
    for ang, cur in words:
        txt = "".join(c["t"] for _, c in cur).strip()
        X = sum(c["X"] for _, c in cur) / len(cur)
        Y = sum(c["Y"] for _, c in cur) / len(cur)
        if cur[0][1]["col"] != DIM_COLOR or Y < 300:      # skip schedule table + title block
            continue
        if re.fullmatch(r"\d{3,4}", txt):
            out.append(dict(text=txt, value=int(txt), floor="FF" if X > FF_SPLIT_X else "GF",
                            X=round(X, 1), Y=round(Y, 1), orient="h" if ang == 90 else "v"))
    # radius labels are set along an angle (not 90/180): rebuild them per angle
    slanted = {}
    for ch in chars:
        if ch["col"] == DIM_COLOR and ch["ang"] not in (90, 180) and ch["Y"] > 300:
            slanted.setdefault(ch["ang"], []).append(ch)
    for ang, lst in slanted.items():
        lst.sort(key=lambda c: c["X"])
        txt = "".join(c["t"] for c in lst)
        if re.fullmatch(r"R\d{3,4}", txt):
            X = sum(c["X"] for c in lst) / len(lst)
            Y = sum(c["Y"] for c in lst) / len(lst)
            out.append(dict(text=txt, value=int(txt[1:]), floor="FF" if X > FF_SPLIT_X else "GF",
                            X=round(X, 1), Y=round(Y, 1), orient="arc"))
    out.sort(key=lambda r: (r["floor"], r["Y"], r["X"]))
    with open(OUT, "w") as f:
        json.dump(dict(source=os.path.basename(PDF), frame="PDF points, page rotated to reading orientation (lawn at top)",
                       count=len(out), dims=out), f, indent=1)
    print("wrote %s (%d dimension strings)" % (OUT, len(out)))


if __name__ == "__main__":
    main()
