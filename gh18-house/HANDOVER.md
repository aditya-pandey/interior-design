# GH-18 House Model — Handover for the next AI agent or developer

**Project:** GH-18, Celebrity Homes, Palam Vihar, Gurugram, India. Renovation of an existing house, plus a proposed second floor.
**Owner:** Deepti Jain. The architect's drawing (R0) names **Mr. Praveen Kumar Yadav** as the client, and that name is kept wherever the drawing is reproduced (`meta.client` in the model, the R1 drawing sheets, the plan title blocks). The person giving instructions in the build sessions is the owner's side (the repository owner, `aditya-pandey`).
**Repository:** `github.com/aditya-pandey/interior-design`.
**Branches:**
- `main` is the repository's default branch and the live branch. GitHub Pages and Netlify both deploy from it.
- `house-design-v1` is the working branch. Changes are made there and merged into `main` to go live.
- The first Claude session worked on an auto-named branch, `claude/zen-shannon-ilvm07`, which was then the default. It was renamed to `house-design-v1` and `main` was created from it. The owner has since deleted the old branch (and with it an unneeded Imgbot pull request).
- **What is where (31 Oct 2026):** `main` has everything up to F16 (materials schedule + Materials view, with the car-colour fix). `house-design-v1` is one step ahead: **F17**, the R1 issue of the architect's drawing. F17 waits for the owner's approval before it is merged into `main`.
- `play-v1` (branched from `house-design-v1`, 1 Nov 2026): `/play/`, GH-18 by the sea with her studio (§6.8), in progress. Not merged.
**Live sites:**
- GitHub Pages: https://aditya-pandey.github.io/interior-design/
- Netlify, from the same repository's `main` branch (production branch set to `main`). Netlify sometimes lags behind GitHub Pages.

**State at handover (31 Oct 2026):** everything described here is committed and pushed. The last change is **F17**, the R1 issue of the architect's drawing (`plans/r1/GH-18_R1_drawing.pdf`, made by `tools/sheets.py`), on `house-design-v1`, not yet merged into `main`. Before it came **F16**, the materials and quantities schedule with its 3D view, which is live. All automated checks pass (`check_dims` PASS for main and R1; `check_services` 278 pass, 4 warnings, 0 fail), and GitHub Pages deployed successfully from `main`.

This document is meant to be pasted into a new Claude (or other agent) session as the opening context. It tries to carry everything the previous sessions learned: the goal, the data model, the code, the design decisions and why they were made, the user's preferences, the traps, and the open items. If anything here disagrees with the code, trust the code and fix this document.

---

## 0. Read this first: the nine rules

1. **`house.json` and `house_r1.json` are the single sources of truth.** Plans, checks, the 3D viewer and the film are all generated from them. Never hand-edit the generated outputs (`plans/*.svg`, reports, `dist/`).
2. **Neither JSON is hand-edited either.**
   - `house.json` is written by `tools/build_house.py`.
   - `house_r1.json` is written by `tools/build_r1.py`, which deep-copies the main model and applies tagged patch functions.
   - To change the main site, edit `build_house.py`. To change Revision R1, add or edit a patch in `build_r1.py`. Then regenerate.
3. **Never change the main site (`/`) unless the user explicitly asks.** The owner's Oct 2026 changes live only in R1 (`/v1/`). After any tool or viewer change, check that the main outputs come out byte-identical; `git status` should show nothing changed under `plans/` (main).
4. **Units are mm in the model.**
   - R1 displays feet-inches with metres in brackets, e.g. `9'-1" (2.77 m)`. Use that style in anything the user reads about R1.
   - The main site displays metres.
5. **Orientation differs between the versions.**
   - Main site: the front (+y, street) faces EAST (`meta.north_vector [1,0]`; an early assumption).
   - R1: the front faces NORTH (`north_vector [0,1]`), confirmed by the user and by all consultant drawings. In R1, **east is −x** (the left, small-x side wall) and **west is +x**.
   - Vastu reasoning in R1 must use this frame.
6. **"No compromise on quality."** The user's words. Verify every visual change by rendering it (headless Chromium, see §9) and looking at the images before you push. Re-run every check script.
7. **Big changes are proposed first, then built step by step.**
   - The user often says "Do not implement anything. We will brainstorm first". Write a clear proposal, wait for "go ahead", then build in steps (A, B, C…), showing each one.
   - When a request is ambiguous or self-contradictory (for example "mandir near the lift in the north-east", when the lift is on the west), ask one crisp question with the options and the trade-offs.
8. **Work on `house-design-v1`; `main` is live.**
   - Commit to `house-design-v1` with descriptive messages.
   - When a change is verified and the user approves it, merge it into `main`. A push to `main` that touches `gh18-house/**` triggers the GitHub Pages deploy.
   - Do not open a PR unless asked. Never rewrite `main`'s history.
9. **Keep the records in step with the model.**
    - Every change gets a row in `ASSUMPTIONS.md` (sections A–E).
    - For R1, also update `CHANGE_REGISTER.md`, which maps every owner, consultant and Vastu item to what R1 does.

---

## 1. What the project is

- An accurate, to-scale digital model of the house, built from the architect's PDF (`inputs/GH-18 GF FF Floor Plan.pdf`, drawing UPS/GH18/PV/001 R0, 17.08.25, "scale NTS").
- On top of it:
  1. **2D plans** (SVG) with dimensions, area tables and a dimension check against every string in the PDF.
  2. **A three.js 3D web viewer**:
     - dollhouse orbit, cutaway, exploded floors
     - first-person walk with collision, phone touch controls
     - day/dusk lighting, room labels
     - glTF props (the family's car)
     - Revision R1 with plumbing and electrical services in 3D
  3. **A 54-second cinematic film**, rendered headless from the viewer.
- Phase 3 (Blender renders) was planned in the original brief but never started.

### Timeline of the work, so you know the history

1. **Phase 1:** data model, plans and dimension check (ASSUMPTIONS sections A and B).
2. **Phase 2:** the viewer (section C), then the film.
3. **Deployment:**
   - Netlify initially failed because the app is not at the repo root; `netlify.toml` fixed this.
   - GitHub Pages via an Actions workflow.
   - At the end, the branches were reorganised: `main` became the live default branch and `house-design-v1` the working branch (see the top of this document and §9).
4. **Client feedback round 1** (section D, main site):
   - D-01 closed kitchen
   - D-02 separate wash area
   - D-03 bedroom-3 toilet on the outer wall
   - D-04 kids room and bedroom 3 swapped (study desk faces east)
   - D-06 the family's car
5. **Site polish:**
   - site name, favicon set, Open Graph preview image
   - mobile UX: bottom-sheet menu and touch joystick
   - Baleno car model, recoloured grey and optimised
6. **Revision R1 (Oct 2026, section E):**
   - **Inputs:**
     - the owner's 12-point change list
     - three consultant mark-ups on R0: the Vastu red-line register, Electrical Layout Rev A and Plumbing Layout Rev A
   - **Process:** the user asked to brainstorm first, then approved a brief and asked for a separate URL (`/v1/`).
   - **Steps, each pushed and reported:**
     - A: orientation and units
     - B: ground floor
     - C: first floor
     - D: second floor
     - E: services (E12 plumbing, E13 electrical, E14 change register)
   - **Owner follow-ups:**
     - the mandir moved from the guest room to the family lounge (B6 revised)
     - a tulsi added (B15), first in the front lawn's NE, then moved to the back garden at the owner's request
7. **This handover document** (first version), the branch reorganisation (`main` live, `house-design-v1` working).
8. **F16 materials and quantities** (owner's nine items: tiles, pipes, wires, paint, POP, granite, timber, MDF board in wardrobes, lights): `tools/boq.py` → Excel + PDF, and a *Materials* view in the 3D tour. Merged to `main`; a follow-up fix stopped the Materials view recolouring the car.
9. **F17 R1 issue of the architect's drawing:** the owner asked for an updated version of the original R0 sheet "basis how our layout and plan looks like". `tools/sheets.py` → two A3 sheets (§5.6). The FF master-washroom vent window was re-marked **KW-2** at the same time. On `house-design-v1`, awaiting approval.

---

## 2. Repository layout

```
interior-design/                      (repo root)
  netlify.toml                        Netlify: base gh18-house/viewer, npm run build, publish dist, NODE 20, PUBLIC_BUILD=1
  .github/workflows/pages.yml         GitHub Pages: on push to main touching gh18-house/**
  gh18-house/
    house.json                        MAIN model (generated by tools/build_house.py)
    house_r1.json                     R1 model (generated by tools/build_r1.py)
    boq_r1.json                       R1 materials and quantities per room / category (generated by tools/boq.py; read by the viewer)
    README.md                         how to run everything, conventions
    ASSUMPTIONS.md                    every guess, deviation and change: A (PDF reading), B (brief),
                                      C (viewer), D (client round 1), E (R1 table, incl. F16 materials)
    CHANGE_REGISTER.md                R1: owner items, red-lines, plumbing / electrical clouds -> R1, holds
    HANDOVER.md                       this document (HANDOVER.pdf is an older snapshot; the owner asked to stop rebuilding it)
    inputs/                           architect PDF, 300 dpi raster, reference PNGs, pdf_dims.json
    plans/                            MAIN: GF.svg FF.svg SF.svg check_report.txt (generated)
    plans/r1/                         R1: GF.svg FF.svg SF.svg check_report.txt services_report.txt (generated)
                                      + GH-18_R1_materials.xlsx / .pdf, materials.html (generated by tools/boq.py)
                                      + GH-18_R1_drawing.html / .pdf: R1 issue of the architect's sheet (tools/sheets.py)
    tools/
      houselib.py                     geometry helpers + ftin / feet / length_label / point_in_poly
      build_house.py                  writes house.json (W, ARC, O, F, CEIL helpers; importable, writes only in __main__)
      build_r1.py                     writes house_r1.json = deepcopy(build_house.house) + PATCHES
      check_dims.py                   model vs every PDF dimension string (TOL 50 mm); [house_r1.json] arg
      check_services.py               R1 services: PLUMBING, ELECTRICAL and VASTU PLACEMENTS rules + schedules
      boq.py                          materials and quantities (tiles, pipes, wires, paint, POP, granite, timber, MDF, lights)
      plans.py                        SVG plans; args: [house file] [out dir]; build(h, fl, title=False) for sheets.py
      sheets.py                       R1 of UPS/GH18/PV/001 R0: two A3 sheets (GF+FF, SF + notes), schedules read from the model
      pdf_extract.py                  re-reads dimension strings from the PDF (needs pdfplumber)
      gen_textures.py                 procedural CC0 PBR textures (used because Poly Haven was blocked)
      fetch_polyhaven.py              optional: swap in real Poly Haven textures/HDRIs where internet allows
    assets/                           served as the viewer's public dir
      textures/ (+manifest.json)  models/baleno.glb (3.7 MB)
      site/ (favicon.svg, PNG icons, og.jpg, site.webmanifest)    LICENSES.md
    viewer/                           Vite 5.4.11 + three 0.170.0 (Node 20)
      index.html  vite.config.js  package.json
      src/main.js        app: renderer, UI, view logic, presets, walk, services UI, scripting API
      src/build.js       house JSON -> merged meshes per floor|category|material; lights; labels; presets; colliders
      src/furniture.js   parametric furniture builders (B.<type>)
      src/materials.js   materials (textured + flat + emissive)
      src/geom.js        geometry helpers   src/walk.js  first-person walker   src/context.js  film-only neighbourhood
      src/services.js    3D services layers (plumbing + electrical)
      src/style.css
      scripts/shots.mjs  screenshots of every preset (npm run shots)
      scripts/html2pdf.mjs  HTML -> PDF with Chromium (used for the materials PDF)
      film/              shots.mjs, render.mjs, post.py, score.py (cinematic film pipeline)
    renders/                          film output location (the mp4 is not committed)
```

---

## 3. How to run

```bash
# Python 3.9+, standard library only (pdfplumber only for pdf_extract.py)
cd gh18-house
python3 tools/build_house.py            # -> house.json           (main site model)
python3 tools/check_dims.py             # -> plans/check_report.txt (must say RESULT: PASS)
python3 tools/plans.py                  # -> plans/GF.svg FF.svg SF.svg

python3 tools/build_r1.py               # -> house_r1.json        (R1 = main + patches)
python3 tools/check_dims.py house_r1.json        # -> plans/r1/check_report.txt
python3 tools/plans.py house_r1.json plans/r1    # -> plans/r1/*.svg
python3 tools/check_services.py house_r1.json    # -> plans/r1/services_report.txt (exit 1 on any FAIL)
python3 tools/boq.py house_r1.json               # -> boq_r1.json, plans/r1/GH-18_R1_materials.xlsx, materials.html
(cd viewer && node scripts/html2pdf.mjs ../plans/r1/materials.html ../plans/r1/GH-18_R1_materials.pdf)
python3 tools/sheets.py house_r1.json plans/r1    # -> plans/r1/GH-18_R1_drawing.html (architect's sheet, R1)
(cd viewer && node scripts/html2pdf.mjs ../plans/r1/GH-18_R1_drawing.html ../plans/r1/GH-18_R1_drawing.pdf -)

# Viewer (Node 18+, 20 used in CI)
cd viewer && npm install
npm run dev          # http://localhost:5173  (?rev=r1 for R1, ?low for weak GPUs)
npm run build        # dist/ with the main site at / and R1 at /v1/
npm run preview      # serve dist
npm run shots        # screenshots of every preset into viewer/screenshots/
PUBLIC_BUILD=1 npm run build   # what CI does: strips the client name/address from the JSON in the bundle
```

The R1 checks pass at handover:
- **`check_dims`:** `RESULT: PASS (0 mismatches over 50 mm, 0 unmapped PDF strings)`.
- **`check_services`:** `RESULT: PASS (278 pass, 4 warn, 0 fail)`. The four warnings are listed in §7.6.

---

## 4. The data model (house.json / house_r1.json)

### 4.1 Frame and units

- **Units:** mm.
- **Origin:** the rear-left outer corner of the plot (outer face of the rear boundary × outer face of the left side wall).
- **Axes:**
  - **x:** across the plot, 0 → 9381 (`PLOT_W`). Side walls have centrelines at x 115 and x 9266 and are 230 thick, so the interior faces are x 230 and x 9151.
  - **y:** from the rear boundary toward the street. The rear glazing line is at y 5590; the front boundary's outer face is at y 22276 (`plot.depth_to_front_boundary`). The ramp lies outside the plot, beyond that.
  - **z:** up from natural ground (NGL = 0).
- **Levels (`levels`):** GF finished floor +450, FF +3750, SF +7050 (proposed), roof slab top +10350.
  - Floor to floor 3300; slab 300; clear height 3000.
  - False ceilings (POP) at 2750 above FFL, or 2600 in wet rooms.
- **Outdoor levels:**
  - lawns and parking: 0
  - deck, utility corner and entrance court: +300 (one step below the house)
  - parapets: 1050 high; boundary walls: 1500 high
- **Orientation:**
  - Main site: `meta.north_vector = [1,0]` (front faces East).
  - R1: `[0,1]` (front faces North, so East = −x and West = +x).
  - `meta.north_label` and `meta.display_units` (R1: `"ft-in (m)"`) drive the plans and the viewer.

### 4.2 Top-level keys

`meta, levels, schedule (doors/windows from the PDF), finish_schedule_pdf, materials, stair, slabs, floors[], services (R1 only)`

- `meta`: project, client, source, units, origin, axes, pdf_scale_mm_per_pt 28.53, north_vector, plot, revision (R1), display_units.
- `floors[]`: one entry each for GF, FF and SF:
  - `walls[]`, `rooms[]`, `outdoor[]`, `furniture[]`
  - optional `joinery[]`, `pergola` (GF), `canopy` (SF)

### 4.3 Walls and openings

- **A wall** is either `{id, a:[x,y], b:[x,y], t, kind, status, openings[], note}` or an arc `{arc:{c, r, from, to}}` (degrees), plus `t`.
  - `kind`: external | internal | lift | shaft | boundary | parapet | glass_wall | glass_partition | glass_railing | railing | screen.
  - `status`: existing (dark grey in the PDF) | new (light grey) | proposed. Plans draw these differently.
  - Optional `h` and `base` override the height.
- **An opening** sits inside its wall: `{id, mark, type, offset (mm along the wall from a), width, height, sill, hinge a|b, swing}`.
  - `swing` is the world direction the leaf opens into (`+x`, `-y`, …), or `out` for the pivot door.
  - Types: door, sliding_door, glass_door, pivot_door, window, lift_door, curtain, gate.
  - Moving a wall moves its openings.
- **Room polygons are explicit.** If you move a wall, update the polygons of the rooms it bounds. `check_dims` catches dimension drift.

### 4.4 Rooms and outdoor areas

- **Rooms:** `{id, name, kind?, polygon, floor finish, wall finish, ceiling:{type, height, cove}, status, note, label_at?}`.
  - `kind` may be shaft, lift or outdoor (SF terraces are rooms with kind outdoor).
  - IDs: `GF-KIT`, `GF-DIN`, `GF-DRW` (Family Lounge in R1), `GF-LOB`, `GF-TLT`, `GF-GST`, `GF-FOY`, `GF-MND` (Guest Lounge/Study in R1), `GF-JAN` (Under-stair Storage in R1), `GF-LFT`, `GF-OTS`, `FF-MST`, `FF-DRS`, `FF-MTL`, `FF-BAL`, `FF-TL3`, `FF-LOB`, `FF-BD3`, `FF-KID`, `FF-KTL`, …, `SF-LOB`, `SF-SWR`, `SF-WSH` (Store), `SF-SRV`, `SF-TRB`, `SF-TRF`.
  - R1 renames keep the old name in `was` and mark `brief_change: true`.
- **Outdoor areas** (`floors[].outdoor[]`): `{id, name, polygon, z?, finish}`.
  - GF: `GF-LAWN-B` (back lawn, y 200–2814), `GF-DECK` (deck + pergola, y 2814–5515), `GF-LAWN-F`, `GF-COURT`, `GF-STEP`, `GF-PARK`, `GF-DRAIN`, `GF-RAMP`.

### 4.5 Furniture

- **Format:** `{id, room, type, pos:[x,y] (centre), size:[w,d,h], rot (deg), z? (raised above the floor), note, ...extras}`.
- **The piece's local +y is its FRONT.** So `rot` 0 faces +y (street), 90 faces −x, 180 faces −y (lawn), 270 faces +x.
  - Front vector in plan: `(−sin rot, cos rot)`.
  - The user (or devotee) stands in front and faces the opposite way.
- **Extras in use:**
  - `src: 'models/x.glb'` with `model_front: '-z'`: a glTF prop. The car `GF-O07`, type `car_model`, has an empty builder.
  - `on_roof: true` with `z` = roof height above the SF: drawn in the ROOF layer, and dashed "ON ROOF" on the SF plan.
  - `chaise`, `sink: true` (utility counter), `credit`.
- **Furniture placed in an outdoor area** stands at that area's `z`.

### 4.6 Services (R1 only): `services.plumbing` and `services.electrical`

- **Common:** points are `[x, y, z]` with z ABSOLUTE in mm (GF FFL = 450).

**Plumbing**
- **Stacks:** `{id, kind, dia, at:[x,y], z:[z0,z1], serves, note}`.
  - SS-1 at (450, 11100) in the OTS, rising to 1 m above the roof.
  - SS-3 at (8950, 15420), in a boxed duct in the guest lounge's SW corner. Its vent sits above the front terrace parapet.
- **Chambers:** `{id, type: inspection|grease_trap|cleanout|rwh_pit|tank, at, size, depth, area, note}`.

  | Chamber | Position | Area | Notes |
  |---|---|---|---|
  | IC-2 | (150, 11700) | OTS | |
  | GT-1 | (150, 12350) | OTS | |
  | CO-1 | (4800, 14200) | lobby | sealed cleanout |
  | CO-2 | (4800, 18000) | lobby / foyer | sealed cleanout |
  | IC-3 | (5300, 20300) | entrance court | |
  | IC-4 | (8700, 20300) | parking | heavy-duty cover |
  | IC-5 | (7600, 21900) | parking | heavy-duty cover; the only municipal connection |
  | RWH | (4500, 21400) | entrance court | 1200 dia pit |
  | UGT | (900, 21100) | NE front lawn | 1500 × 1200, 5000 L |

- **Runs:** `{id, kind: soil|waste|sewer|cold|hot|pumped|rain, dia, pts[[x,y,z]], serves, outfall?}`.
  - Gravity runs are made by `drain()` in `build_r1.py`. It takes the start invert and computes every later z from the plan length × fall, rounding down per segment.
  - Falls are the minimums × 1.1: soil 1:40, waste 1:50, 150 sewer 1:50, 110 sewer 1:40, rain 1:100. The z you type after the first point is ignored.
- **Fixtures** come from the furniture, e.g. `wc_wall_hung`, `vanity`, `basin`, `sink`, `shower_head`, `bathtub`, `washer_dryer`, `utility_counter` with `sink`.

**Electrical**
- **points:** `{id 'GF-E01'…, kind, floor, room, serves, at, base, note, face?:[nx,ny], circuit, tag?, tr?, kw?, ceiling?}`.
  - `room` is where the point is. `serves` is the room it is for; switchboards outside wet rooms carry the wet room here.
  - `base` is the floor or area level.
  - `face` is the unit plan normal into the room, for wall-mounted symbols.
  - `tr` is the AC tonnage; `kw` is used for pumps and the lift.
- **kinds:**
  - lights: `light`, `pd` (pendant), `fan`, `ucl` (under-cabinet light), `ml` (mirror light), `wl` (wall light), `gl` (garden bollard)
  - switches: `sb`, `sb2w` (2-way / bedside)
  - sockets: `s6`, `s6c` (counter), `s16`, `usb`, `tv`, `data`, `ip65`, `ups`, `ch` (chimney)
  - big loads: `ac`, `gy` (geyser), `ef` (exhaust fan), `ev`, `iso` (lift isolator), `pump`, `spare`
  - low voltage: `cctv`, `vdp`, `vdpo`, `rack`
  - detectors: `sd`, `hd`
  - boards: `db`, `mtr`, `inv`
- **circuits:** `{id, cls: lighting|sockets|power|geyser|ac|ups|data, db, points[], mcb, cable, rcd, backup?, note?}`.
  - They are grouped automatically per DB: lighting ≤ 10 load points (switchboards don't count), sockets ≤ 8, and one dedicated circuit per 16 A outlet, AC, geyser, EV, pump and the lift.
  - DB-1 serves GF and outside, DB-2 FF, DB-3 SF and roof; LIFT is on DB-1. UPS and DATA run from the inverter / rack.
- **routes:** `{circuit, cls, trunk[[x,y,z]], drops[[[..],[..]]]}`.
  - Loop-in conduit runs nearest-neighbour from the DB, Manhattan legs in the slab above (GF circuits at 3600, FF at 6900, SF at 10200), with a vertical drop to each point.
  - Outdoor circuits run buried at −300.
- **submains:** SM-1 MTR→DB-1, SM-2 DB-1→DB-2, SM-3 DB-1→DB-3, SM-4 DB-1→INV, each hand-routed.
- **refrigerant:** `{ac, odu (furniture id), pts, length, note}`, hand-routed per AC.

---

## 5. The tools in detail

### 5.1 `build_house.py` (main site)

- **Helpers** (also imported by `build_r1.py` as `base.F`, `base.O`, …):
  - `W(id,a,b,t,kind,status,…, openings)` for walls, `ARC(...)` for arcs
  - `O(id,mark,type,offset,width,height,sill,hinge,swing,…)` for openings
  - `F(id,room,type,pos,size,rot,z,**kw)` for furniture
  - `CEIL(type,height,cove)` for ceilings
- **Constants:** `XL_IN=230`, `XR_IN=9151`, `XL_C=115`, `XR_C=9266`, `PLOT_W=9381`, `Y_REAR_GLASS=5590`, plus the arc centres fitted to the PDF vectors (max deviation 3 mm).
- **Writing:** the script writes only under `if __name__ == '__main__'`, so `build_r1.py` can import `base.house` without side effects. `dump()` gives a compact, stable JSON layout; keep it so diffs stay readable.

### 5.2 `build_r1.py` (Revision R1)

- **Process:** `h = deepcopy(base.house)`, set `meta.revision='R1'`, then run every function in `PATCHES` in order.
- **Helpers:** `floor(h,'GF')`, `find(items,id)`, `drop(items,*ids)` (asserts the ids exist), `opening(wall,id)`, `rename(room,name,was,note)`.
- **PATCHES at handover, in order:**

  | Patch | Item | What it does |
  |---|---|---|
  | `a1_orientation` | A1 | north_vector [0,1], labels |
  | `a2_units` | A2 | display_units ft-in (m) |
  | `b3_family_lounge` | B3 | L-sofa faces the TV on the W wall; dining basin GF-F24 |
  | `b4_kitchen_wash` | B4 | removes the D-02 wash yard; GL-4 back to R0; wash nook GF-K10/K07/K13 inside the kitchen; KW-1 window + exhaust into the OTS |
  | `b5_guest_lounge` | B5 | GF-MND → Guest Lounge / Study (desk on the E wall, sofa, TV, settee, coffee table, rug) |
  | `b6_mandir` | B6 revised | open mandir GF-F25 on the lounge E wall at (3525, 8350), rot 270; pouf F26, rug F27; crockery F19 moves to (3525, 7000) |
  | `b7_under_stair` | B7 | storage units, inverter / network rack, door swing; DB cabinet K12 beside the fridge tower K04 on the kitchen E wall |
  | `c8_pantry` | C8 | FF lobby pantry counter FF-L01 + wall cupboards FF-L05 |
  | `c9_kids_toilet_back` | C9 | reverts D-03: kids toilet KTL back beside the stair at its R0 size |
  | `c10_master_suite` | C10 | washroom and dresser swapped; tub FF-T01, WC FF-T02 by the OTS, vent window FF-MW1 (mark KW-2; KW-1 is the GF wash-nook window); doors D2a / D3a re-hung |
  | `d11_utility_terrace` | D11 | SF utility on the covered back terrace; store; drying racks; ODUs; OHT SF-R01 and solar heater SF-R02 on the roof |
  | `b15_tulsi` | B15 | tulsi platform GF-O09 at (645, 1650), rot 270, in the back lawn's NE corner; bamboo planters O10 / O11; fluted panel O12 on the E boundary wall |
  | `e12_plumbing` | E12 | `services.plumbing` |
  | `e13_electrical` | E13 | `services.electrical`; also re-places the ODUs (drops SF-AC2, moves SF-AC1, adds SF-AC5/6 and GF-O08) |
  | `f16_materials` | F16 | kitchen, wash-nook and pantry counter tops get `top: 'granite_black'` (the BOQ's granite); quantities come from `tools/boq.py` |

- **To add an R1 change:**
  1. Write a function with a docstring that states the item ID and the reasoning.
  2. Append it to `PATCHES`; order matters, so services go last because they read furniture positions.
  3. Rebuild and run all the checks.
  4. Regenerate the R1 plans.
  5. Render and look at the result.
  6. Add an ASSUMPTIONS section E row and a CHANGE_REGISTER row.
  7. Commit and push.

### 5.3 `check_dims.py`

- **What it does:** maps every one of the 51 PDF dimension strings (`inputs/pdf_dims.json`) to a probe on the model and compares within TOL = 50 mm. It also checks openings against the schedule, plus the brief's checks.
- **`SUPERSEDED`:** PDF strings made obsolete by a client change (D-01, D-03). They are listed as SUPER, not counted as failures.
- **`REVERTED = {"R1": ("D-03",)}`:** R1 undid D-03, so those four strings are measured again in R1, and they pass.
- **Exit code:** 1 on any mismatch or unmapped string.

### 5.4 `plans.py`

- **Arguments:** `[house file] [out dir]`. It sets the globals FEET and SRC.
- **What it draws:**
  - walls coloured by status (existing dark, new grey, proposed hatched)
  - openings with swings, opening tags, room labels with size and area, dimensions, outdoor areas
  - furniture symbols (`furniture_symbol()`; add a branch there for new types), the stair
  - overlays: floor above, roof items dashed
  - a title block with north arrow, scale bar, legend and room-area table
- **Units:** R1 labels are in feet-inches with metres in brackets.

### 5.5 `boq.py` (materials and quantities, F16)

- **Run:** `python3 tools/boq.py house_r1.json`, after `build_r1.py`. It writes `boq_r1.json` (used by the viewer), the Excel file and `materials.html`; `viewer/scripts/html2pdf.mjs` turns the HTML into the PDF. Commit all of them, because the viewer imports `boq_r1.json` and the Vite build copies the PDF and Excel into `dist/files/`.
- **The owner's nine items, measured from the model:**
  - **Tiles:** wet-room floors and walls (to the false ceiling, minus openings), deck tiles, the SF vitrified floor; boxes per tile size with wastage; waterproofing for wet rooms.
  - **Living floors, both ways:** A = Italian marble (+15%), B = 1600 × 800 vitrified (+8%), plus skirting. The owner decides later.
  - **Pipes:** lengths per kind and diameter along the plumbing runs and stacks (3 m lengths +10%, bends counted); chambers; AC copper pairs per route.
  - **Wires:** each circuit's route × 3 cores +10% (90 m coils), conduit; sub-mains (sizes indicative); Cat-6; accessory counts; DB ways.
  - **Paint:** interior walls (minus openings, tiles, cladding, fluted walls, backsplash), ceilings on POP, exterior (non-party walls, parapets, boundary walls); putty, primer and emulsion litres at indicative coverage.
  - **POP:** ceiling areas, gypsum boards, perimeter channel and cove lengths.
  - **Granite:** counter tops with cut-outs, window sills, door thresholds, the stair and flamed paving; the kitchen backsplash is listed as white marble (as designed).
  - **Timber:** door frames and shutters, pergola cft, handrail, veneer cladding (lobby, foyer, guest lounge), fluted walnut, the tulsi panel and the mandir.
  - **MDF:** per wardrobe and storage unit (carcass, shutters, back, sheets, hinges, edge band, laminate). BWP ply for wet units (vanities, sink base, utility, terrace), as the owner asked: MDF elsewhere.
  - **Lights:** downlights on the 1.4 m grid the 3D shows (each electrical "light point" switches a group), cove and under-cabinet LED, fans, mirror, wall and garden lights, exhaust fans and detectors.
- **Specs and rates live at the top of the file** (`TILE`, `OPTION_B`, `MARBLE`, `PIPE_SPEC`, `PAINT`, `CABLE_SUBMAIN`). Change a spec there and re-run. No costs are included (owner's choice).

### 5.6 `sheets.py` (R1 issue of the architect's drawing, F17)

- **What:** the architect's sheet UPS/GH18/PV/001 (R0, 17.08.25, `inputs/GH-18 GF FF Floor Plan.pdf`) re-issued as **R1** on two A3 landscape sheets at 1:100. Sheet 1 follows R0: GF and FF plans side by side, door-window schedule, finishing schedule, R0's title block (contractor, project, client, architect, DWG NO, released for approval). Sheet 2: the proposed SF plan and schedules, the R1 revision notes, open items / hold points, general notes and room areas.
- **How:** the plans are `plans.build(h, fl, title=False)` nested in the sheet with a fixed crop (`CROP_*`). The door-window rows are read from the openings (counts, sizes, sills; the location comes from the rooms on each side of the wall), plus the GL-6 partitions, GL-8 railing and GL-F facade walls. The finishing rows are read from each room's `floor` / `wall` / `ceiling` and compared with R0's row (`finish_schedule_pdf`): △ = changed, + = not on R0. The revision notes, hold points and remarks are curated lists at the top of the file: keep them in step with CHANGE_REGISTER.md.
- **Left blank on purpose:** DRN. and CHD., for the architect / contractor to sign.

### 5.7 `check_services.py`

It runs three sections and writes `plans/r1/services_report.txt`.

- **PLUMBING:**
  - every wet fixture is drained (WCs by soil pipes) and has a cold supply within 2.2 m
  - every drain ends at a stack, a chamber, another drain or a marked outfall
  - every gravity run falls at least at its minimum (`MIN_FALL` per kind and diameter)
  - chambers are not inside rooms (sealed cleanouts excepted)
  - nothing runs under the guest room
  - nothing is in the party walls (x 0–230 and 9151–9381, outside the OTS)
  - the UGT is ≥ 2 m from the sewer and the RWH
  - OHT head over the showers (warn under 2.5 m)
  - vents ≥ 1 m above the roof or terrace
- **ELECTRICAL:**
  - the sheet's point schedule, row by row, mapped to R1 rooms (`SHEET` table)
  - every room lit and switched, with its switchboard ≤ 1.8 m from a door (open-plan rooms and lobbies are switched 2-way and exempt)
  - wet rooms: switches outside; exhaust on the OTS or a non-party external wall, or a ceiling fan ducted to an open terrace; geyser ≥ 1.8 m high and ≥ 0.6 m from the shower or tub
  - sockets ≥ 0.6 m from basins, sinks, tubs and showers in the same room
  - every bedside table has a 2-way switch and a socket
  - ACs: not over glazing, ≥ 2 m high, refrigerant route to an ODU ≤ 15 m (warn up to 25 m), route clear of the party walls, every ODU used once
  - ODU Vastu zone (warn N / NE / E)
  - DBs: not in the Brahmasthan (centre ninth of the house footprint) or a wet room; SE preferred (warn otherwise); ≥ 0.6 m from water pipes
  - detectors: smoke in bedrooms, lounges and lobbies; heat, not smoke, in the kitchen
  - circuit limits and RCDs; every point on a circuit; circuits fed from their own floor's DB
  - no EF or ODU on the party walls
  - load: connected kW, demand at 0.55 diversity, so 3-phase
  - **Also prints:** the point schedule per room, the circuit table (MCB, cable, RCD, kW) and the AC routes. This part is meant for the electrician.
- **VASTU PLACEMENTS:**
  - mandir: the devotee faces E or N; it sits in the NE quarter of its room; no toilet behind, beside or above it
  - tulsi: in the NE corner of its garden; the devotee faces E or N; plot zone N / NE / E preferred (warn otherwise); open to the sky
  - UGT in the NE; OHT in the S / SW / W; the cook faces east
- **Zones:** Vastu zones use a 3 × 3 grid over the house footprint for the DB, ODU and OHT checks, and over the plot for the UGT and tulsi checks.

---

## 6. The 3D viewer in detail

### 6.1 Pages and flags (`vite.config.js`)

- **One build serves the main site (`/`) and R1 (`/v1/`).**
- **The `extraPages` plugin** copies `dist/index.html` into each subfolder and adds three things:
  1. a script that redirects to the trailing-slash URL
  2. `<base href="../">` (or `"../../"`), so assets resolve from the root and nothing is duplicated
  3. a `window.GH18_REV` flag
- **`main.js` picks the version from:**
  - `REV`: `window.GH18_REV`, or `?rev=r1`, or a `/v1/` path
- **Why `<base>` and not copying assets:** an earlier version 404'd on assets (the preload scanner resolved relative paths against the subfolder). The static `<base>` plus slash redirect fixed it.
- **`stripPrivate`:** with PUBLIC_BUILD=1 it removes `meta.client` and `meta.source` and sets `meta.project='GH-18'` in both JSON files.
- **`siteUrl`:** fills `__SITE_URL__` in the Open Graph tags (from SITE_URL, or Netlify's URL).

### 6.2 `main.js` flow

1. **Setup:**
   - Imports both JSON files and picks `house` by REV.
   - `FEET` comes from `display_units`. `TOUCH` = coarse pointer; `LOW` = `?low` or touch; `PHONE` = ≤ 640 px.
   - `CINEMA` (`?cinema`): no UI, bloom, camera driven by `viewer.cine()`.
2. **Renderer:**
   - WebGLRenderer with ACES tone mapping and a CSS2DRenderer for labels.
   - Sky, PMREM RoomEnvironment (neutral studio IBL), a directional sun with shadows, a hemisphere light.
   - `NORTH` / `EAST` come from `meta.north_vector`. `sunDir(az, el)` uses them, so the sun is correct in both versions. `compass()` names the exterior views.
3. **`init()`:**
   - `createMaterials`, then `buildHouse(house, M)` returns meshes tagged `userData {floor, cat, mat}`.
   - One `THREE.Group` per FLOOR_ID (GF, FF, SF, ROOF); SITE meshes go straight in the scene.
   - Point lights per room (dusk only), room labels (CSS2D, feet-inches for R1), the Walker, `setupServices()` if `house.services` exists, `setupMaterials()` on R1, post-processing (GTAO unless LOW), `buildUI()`.
   - Portrait screens get a framed opening view. Then it sets `window.viewer.ready = true`.
4. **`applyView()`** applies `state {floor, explode, cutaway, mode, time, labels, services, materials}`:
   - floor visibility and explode offsets (4.5 m per floor)
   - ceilings shown only in walk mode
   - cutaway ghosts the `upper` category (walls above 1.2 m)
   - labels
   - services ghost every building mesh: `ghostOf(material, opacity)`, keyed by material uuid + opacity; opacities in `SERVICE_GHOST`: site 0.4, floors and slab caps 0.16, furniture 0.16, others 0.1
   - only the active services layer is shown; a picked floor isolates that floor's services (ROOF goes with SF)
   - the legend HTML is swapped per layer (services or materials)
   - **one pass sets every building mesh's material:** the original, or its Materials-view colour (`overlayOf`, by the mesh's material key); then ghosted for the services view (whole building) or the cutaway (`upper` walls). Keep this single pass when adding modes.
   - **Materials view (R1):** surfaces coloured by category (`MAT_CATS`: marble, tiles, deck, paint, granite, white marble, timber, MDF, POP). Shared materials are told apart by batch tags: `build.js` batches joinery lacquer as `lacquer_*#joinery` (MDF colour) and flush-door leaves / linings as `lacquer_white#door` (timber colour); `M[key.split('#')[0]]` is the real material, so nothing else changes. Lacquered appliances (AC units, tanks) stay neutral, and glTF props (`mat 'model'`, the car) keep their own look; a quantity chip per room from `boq_r1.json` (`isMatLabel`, shown for the picked floor, decluttered like the service tags); the legend shows totals and links `files/GH-18_R1_materials.pdf` / `.xlsx`. Materials and services are mutually exclusive.
5. **Presets:**
   - Overview: Dollhouse, Exploded, GF / FF / SF cutaways, front and rear exteriors, plus for R1 "Services — plumbing", "Services — electrical", "Materials — ground floor" and "Materials — first floor".
   - One preset per room or outdoor area.
   - `framed()` pulls the camera back on portrait screens.
6. **Walk mode:**
   - Walker: PointerLock on desktop. On touch, the left 45 % of the screen is a joystick and the rest drags to look.
   - Eye height 1.6 m, collision against walls, glass and furniture, follows floors and stairs.
7. **UI** (`index.html` panel):
   - controls: View select, Floors GF/FF/SF/All, Explode, Cutaway, Room names, Materials & quantities (R1), Services Off/Plumbing/Electrical (only on pages with services), Light Day/Dusk, Walk
   - hints and the Baleno credit
   - **Keys:** 0–3 floors, C cutaway, L labels, P plumbing, E electrical (not in walk mode), M materials (R1), N day/dusk, Q leave walk.
   - **Phones:** the panel is a bottom sheet with a Menu button; the walk HUD moves to the top; the services legend is a compact 3-column grid at the top.
8. **`window.viewer` scripting API** (used by every render or test script):
   ```
   ready, headless (?headless: no animation loop; call settle()),
   presets(), goPreset(id, instant), setFloor('GF'|'FF'|'SF'|'ALL'), setCutaway(b), setExplode(0..1), setLabels(b),
   setServices(null|'plumbing'|'electrical'|true), setMaterials(bool), setTime('day'|'dusk'),
   walkAt(roomId, yawDeg, pitchDeg), walkPose(x_mm, y_mm, foot_m, yawDeg, pitchDeg), exitWalk(),
   settle(n) (render n frames synchronously), stats(), cine({pos,target,fov,floor,cutaway,explode,time 0..1,exposure,interior,context,roll}),
   renderFrame(), modelsReady (Promise for glTF props), error (set if init failed)
   ```
   - `walkPose` takes the foot height in METRES (0.45 = GF floor, 0 = lawn). Yaw: 0 looks −y, 90 looks −x (east in R1), 180 looks +y, 270 looks +x.

### 6.3 `build.js`

- **Merging:** batches geometry per `floor|category|material` and merges it with `mergeGeometries` for performance.
- **Categories:**
  - `struct`: walls below 1.2 m
  - `upper`: above 1.2 m; ghosted by the cutaway
  - `glass`, `glassUpper`
  - `ceiling`, `floor`, `slabcap`
  - `furn`
  - `emissive`: cove, lamp, jaali_glow and downlight materials; no shadows
  - `site`: ground, street
- **Builds:** walls with openings, frames, glass, doors (hinged doors shown open about 90°, sliders closed but walkable), room floors and ceilings (POP + cove + downlights), tile skins in wet rooms, stair, slabs, pergola, canopy, outdoor areas, furniture (`buildFurniture`), backsplashes, and the lights list (rooms; the pendant; `mandir_wall` / `mandir_open` / `tulsi_platform` glow).
- **Returns:** `{meshes, labels, presets, lights, models, colliders, …}`.

### 6.4 `furniture.js` conventions

- Every builder `B.<type> = (parts, w, d, h) => {...}` works in metres in the local frame:
  - X = width
  - Z = depth, with the FRONT at +Z
  - Y = up from the base
- **Helpers:** `box(parts, mat, w, h, d, x, y0, z, bevel)` (bottom at y0), `cyl(parts, mat, rTop, rBot, h, x, y0, z, seg)`, `sphere(parts, mat, r, x, y, z, scaleY, detail)`, `plateZ(...)` (a thin plate facing +Z), `legs4`, `grooves`, `cabinet`, `beds`, `sofaStraight`, `armchair`, …
- **Raw geometry:** push `{g, m}` with any THREE geometry.
- **Material keys:**
  - textured: marble_beige, marble_white, walnut, walnut_fluted, plaster, plaster_ext, tile_matte_lg, tile_matte_dark, vitrified, deck_tile, granite_flamed, cobble, grass, pebbles, concrete
  - flat: boundary, pop_white, slab_edge, black_metal, brass, steel, ceramic, linen, linen_white, fabric_taupe, fabric_olive, fabric_rust, fabric_blue, leather, rug, rug_dark, lacquer_white, lacquer_greige, terracotta, foliage, foliage_dark, mattress, appliance, car_paint, tyre, asphalt, ground, lift_steel, mirror, trunk
  - special / emissive: glass, glass_frosted, polycarbonate, cove, downlight, lamp, jaali_glow, window_lit, window_dark
- **To add a new furniture type:**
  1. Add a builder in `furniture.js`.
  2. Add a plan symbol branch in `plans.py` `furniture_symbol()` (otherwise it draws as a plain rectangle).
  3. If it glows at dusk, add a light in `build.js`.
  4. Render it in day and dusk.
- **Notable builders added in R1:**
  - `sofa`, `settee`, `mandir_wall` (withdrawn), `mandir_open`
  - `bathtub`, `water_tank`, `solar_heater`, `ac_odu`
  - `tulsi_platform`, `bamboo_planter`, `fluted_panel` (with a brass Om made of torus arcs)
  - `car_model` (empty: the glTF is loaded separately)

### 6.5 `services.js` (3D services)

- **`layer()`:** returns `add(fid, key, geometry)` and `finish(look)`. `finish` merges geometry per floor band and colour key into meshes.
- **Drawing order:** service materials are `transparent: true` with renderOrder 10 (9 for translucent chambers), so they draw AFTER the ghosted building. The pipes stay crisp, like an X-ray.
- **Floor bands:**
  - **Plumbing:** `BANDS` start 400 mm under each FFL (3350 / 6650 / 9950), so a floor's sunken-slab drains belong to that floor.
  - **Electrical:** uses `EBANDS` at the FFLs (3750 / 7050 / 10350), because a floor's conduits run in the slab above it. Single-floor circuits are forced onto their own floor; sub-mains, refrigerant and UPS/data runs split by height.
- **`buildPlumbing(pl)`:**
  - tubes per run, with joints
  - stacks with vent cowls
  - chambers as boxes, the RWH pit as a cylinder, with lids
  - tags for stacks and chambers
  - legend
- **`buildElectrical(el, names)`:**
  - symbols per kind (`symbol()`): ceiling discs, a 3-blade fan, pendant spheres, wall plates oriented by `face`, AC / geyser / DB boxes, garden bollards drawn from `base`
  - conduit polylines coloured by circuit class; sub-mains black; refrigerant cyan
  - tags for DBs, MTR, INV and each ODU (with the room it serves)
  - categories in `ECAT`
- **Tags:** `main.js` `declutterTags()` hides any tag that overlaps an earlier, higher-priority one, every frame.
- **Bug fixed, remember it:** `g.visible` must be a real boolean. `state.services` is null when off, and `null && x` is null. three.js only hides objects whose `visible === false`, so layers stayed visible until the flag was coerced with `!!`.

### 6.6 glTF car

- **Source:** `assets/models/baleno.glb`: the 2022 Maruti Suzuki Baleno by BHP3D, CC BY 4.0, recoloured to Grandeur Grey metallic.
- **Optimisation:** 708k → 262k triangles, meshopt compression, 31 MB → 3.7 MB.
- **Loading:** `loadModels()` uses GLTFLoader with MeshoptDecoder. The model is kept at native width and height and stretched along its length to `size[1]` = 3990 mm. With `model_front '-z'` it is turned 180°.
- **Credit:** must stay visible in the panel and in `assets/LICENSES.md` (licence requirement).
- **In `?cinema`:** the car meshes are hidden.

### 6.7 Film

- **Shot list:** `viewer/film/shots.mjs` holds camera paths in model coordinates, cut on the bars of a 96 BPM score.
- **Rendering:** `render.mjs` renders the frames headless (about 5 s per frame; resumable).
- **Post:** `post.py` does the edit, grade, letterbox titles, score (`score.py` synthesises it) and the encode.
- **Context:** `?cinema` adds a neighbourhood (`context.js`); it is scenery only.
- **Output:** 54 s, 1920 × 1080 at 24 fps, 2.39:1. The mp4 is not committed.

### 6.8 By the sea (`/play/`, branch `play-v1`, in progress)

- **What:** a free-roam page started on 1 Nov 2026 at the user's request. The first version drove the Baleno round a generated colony; the user then asked for no other houses, the house by a beach, a highway along the beach, very smooth driving with a proper driver's view, and "a small space for her" to walk or drive to: a glass studio with a library, her paintings, her poems and her music. Not merged to `main`; not linked from the tour; `noindex`.
- **Build:** `vite.play.config.js` is a second, separate build (`npm run build` runs both); the tour's output is byte-identical. `play/index.html` carries `<base href="../">` so `textures/` and `models/` resolve from the site root.
- **Layout (`site.js`):** an imagined coast. The sea is north of GH-18 and, past a headland, to the west, so the sun sets over open water (sunset azimuth set to ~268° on purpose). The highway is a closed Catmull-Rom loop (~3 km) whose first stretch runs past GH-18's gate (centre line Z 28). Her studio sits on the beach ~100 m west (X 98–112, Z 42–51), with a parking pad and a boardwalk.
- **World (`beach.js`):** land polygon inland of the beach; a white-sand ribbon along the coastline that slopes on under the sea to 92 m out (`sandHeight`), with ripple and grain relief, wet and glossy where the swell reaches, and under the water tinted by absorption (red first, then green: the turquoise of the shallows) with moving caustics; the road is a ribbon with a canvas texture (shoulders, edge lines, dashed centre). Coconut palms (procedural trunks and frond strips, instanced), street lights on the loop's inner side, low hills and a far headland. `groundHeight` / `surfaceAt` / `coastDist` are the ground model: the car loses grip and gains drag on sand and in the shallows; a "sea fence" (a collision field) stops it 2.5 m into the water.
- **Studio (`studio.js`):** glass on the sea and sunset sides, oak-clad solid walls to the road and library sides. A round birch-ply bookshelf nook on the east wall (after the owner's reference photo: a 2.4 m ring of book cubbies with a sage cushioned seat inside, a sheepskin rug; E to curl up in it), a brass floor lamp, daybed facing the sea, credenza with a radio (plays the music), writing desk at the glass, easel with one of her paintings, plants, pendants. Her paintings: Buddha, elephant, horses and the elephant cut-out on the south wall; 24 small ones (cut out of her collage) on a free-standing oak partition, 12 per face. Her two poems framed by the desk, rendered on a canvas (`poemTexture`). Loungers at the north-west corner of the deck face the sunset; fairy lights along the eaves after dark. Walkable via `walk.colliders` / `walk.surfaces` in the tour's millimetre format.
- **Personal pack:** `play/deepti/` (art/, `pack.json` with poems exactly as she wrote them and the two YouTube IDs). Copied into `dist/play/deepti/` only for private builds (see `vite.play.config.js`). The repo is private; the public sites must not carry it.
- **Car:** physics as before (bicycle model, slip, weight transfer, 5-speed auto) plus surface grip, a torque cut during upshifts and yaw damping. Rendering is interpolated between the 120 Hz physics steps (`pose.blend`), which removes the stutter of the first version. The chase camera follows a damped heading, not a lagging position; FOV opens with speed. The steering wheel is extracted from the merged interior mesh (triangles in a disc around the hub badge's axis) and turns at ~14:1. The driver's head sways with the car.
- **Opening and flow (owner's brief, 2 Nov 2026):** `/play/` opens with the home tour itself: `src/play/entry.js` imports the tour's own `src/main.js` (R1, `window.GH18_REV = 'r1'`), and `vite.play.config.js` injects the tour's `index.html` body markup, so menus, views, lighting and walk mode are exactly those of `/v1/` (no change to the tour's code). A watcher polls `window.viewer` (walk mode, camera within 3 m of the parked Baleno) and shows "F · Get in the car". Getting in lets go of the tour's WebGL context (which stops its render loop), hides its markup and loads the drive (`src/play/main.js`), which starts with her in the car at home. On 11 November (`pack.birthday`, or `?birthday`) a synthesised "Happy Birthday" piano tune (`birthday.js`) plays with a banner. When she first reaches the studio (stopped at the pad, or on foot on the deck) the owner's recording plays once: put the file in `viewer/play/deepti/` and set `"studioMessage": "<file name>"` in `pack.json` (null until then). "Home tour" in the drive reloads the page. `?drive` skips the tour (testing).
- **Her figure (9 Nov 2026, superseding the earlier no-figure rule at the owner's request):** `avatar.js` loads `play/models/woman.glb` (Sketchfab "Modern Indian Woman", Pixel_Monster, CC BY 4.0; made lighter by `tools/vehicles/build.mjs … woman`: 44k triangles, 11 parts, 512 px textures; drawn on layer 2 (`AVATAR_LAYER`: the camera and the sun's shadow camera see it, the sea's mirror camera doesn't), culled by per-part bounding spheres grown 0.8 m, her animation skipped while she's hidden; Mixamo-named skeleton with `_NN` suffixes, stripped), scaled to 1.62 m. Her embedded idle always plays; walk, run, sit, drive, ride (Vespa) and pedal (bicycle, phase from the crank) are rotations about her own axes made in code on top of it, cross-faded. Mixamo FBX clips in `play/models/anims/{walk,run,sit,drive}.fbx` (FBX, without skin, 30 fps, in place), committed (owner's choice; Walk, Run Forward, Sitting Idle, Driving, plus Entering Car: played from 1.25 s to 3.25 s at 1.15× when she gets into a car (her root turned 90° and placed so the clip's end hips land on the seat's hips; her feet on the ground until she sits; a mirrored copy, L/R swapped and reflected across x, for the right-hand-drive Baleno; a camera beside the door, the first of six spots with a clear ray to it; driving input held and gas/brake/E skip; cut before the clip reaches for the door, which doesn't open), are retargeted by bone name (any `mixamorig`/`mixamorig2` prefix stripped) and take over that move (a move with a clip gets no made pose on top; hip height scaled from Mixamo's ~98 cm standing height; seats re-measured once clips load) (the idle's weight steps aside, since the mixer averages by weight; the hips track is rescaled to her units and kept in place). On foot: she turns to her walking direction; the camera is 2.7 m behind her right shoulder outdoors, pulled in by walls (`walker.blocked(…, cam)` and the camera blockers), first person indoors / lying / reading / C. In a vehicle her eyes are put at its `eye` (head-bone offset measured per seat with `headIn(mode)`); hidden in the driver's and bonnet views, during the rally, the reader, letters and the painting viewer. Test hook: `play.walk(seconds, key)`.
- **Open world (9 Nov 2026; owner: jumping and more open-world features; the lighthouse replaced by something fun to use; her figure in the studio):**
  - *Stunt park* (`stuntpark.js`, replaces `lighthouse.js`, deleted): pad x 188–234, z −6–17 at y 0.14 on the headland, an access strip from the coast road (x 172–188) under an arch. `RAMPS` (profiles along +x): kicker (0.7 m), tabletop (1.0 m), launch (1.5 m) → 8 m gap → landing, rollers. `heightAt(x, z)` (pad + ramps, null off the pad) is the ground for everything in main.js (`groundAt`). Vehicle vertical physics in `airborne.js` (`airStep`, per 240 Hz step, called by `vertStep` in main.js; reworked after the owner's Vespa got pinned against a ramp: a step up of more than 5 cm no longer gives a climb rate (it launched vehicles 2 s into the air), the climb rate is capped by speed × 0.85, a crash slides along the obstacle (normal from the surface's slope; speed lost only on a real knock; nose turned along it; put 3 cm clear of its edge), flights end after 5 s, the two-wheelers reverse (1.2–1.3 m/s) and pivot at a standstill (`spec.pivot`), the rollers are 0.25 m (under the 0.3 m wall height), and the lanes were swapped so the big gap is in line with the way in (a 24 m run-up); `scripts/stunt_test.mjs` checks it all offline). Originally: on the ground it follows the surface and remembers its climb rate; where the surface falls away faster than gravity (a lip) it flies (`surfAt` → 'air': `vehicle.js` gives no grip), lands where the surface meets it (thud, springs squashed, the jump scored: distance, air time, height → `scoreJump`, best in `localStorage` `gh18.stunt`), and a step up of more than 0.3 m (a ramp's side or face) is a crash (put back, bounced). Teleports re-seat it. Cars' and two-wheelers' pitch follow the ramp, or the arc in the air. Tyre walls are car and walking colliders; two pooled floodlights. The last letter moved to the launch ramp's top (`stunt-top`; `pack.json` updated); the finale's lanterns rise from the beach by the park.
  - *On foot* (`FootWalker`): `jump()` (Space): a climb if a ledge 0.45–1.8 m above her feet is 0.45–0.65 m ahead (`heights(…, true)` includes the tops of solid things, measured from the model once by `topOf`: colliders' own heights are only how far up they block), else a jump (3.5 m/s up, more at a run); `airStep` integrates, lands on the highest surface at or below her feet; walking off an edge drops her. Her poses: `jump` and `climb` made in avatar.js (Mixamo `jump.fbx` / `climb.fbx` in `play/models/anims/` would replace them). Test hook `play.jumpWalk(seconds, key)`.
  - *Photo mode* (`photo.js`, V) and *the map* (`worldmap.js`, M; places from `PLACES()`, `travelTo`). Sound toggle moved to Shift+M.
  - *Studio in third person*: the camera is behind her in the studio (2.1 m; it checks walls only: furniture blocks are 2 m tall and the cars' outline covers the whole building), the house stays first person; seated spots with an eye point outside the house show her sitting (`sittingAsHer`, Mixamo sit, placed by `her.sitHead`), the camera a little above; loungers stay first person.
- **Opening the world (9 Nov 2026):** while she walks the tour, `prefetch.js` (started by `entry.js` once the tour is up) preloads the drive's code (`<link rel=modulepreload>` for the chunks the play build names in place of `__PLAY_MAIN_CHUNKS__`: `mainChunks` in `vite.play.config.js`) and puts the models, Mixamo clips and her paintings and photos into `THREE.Cache` (two at a time), where main.js's loaders find them under the same URLs. `init()` starts the pack, the Baleno, the water normals, the other vehicles and her figure all at once; the world opens with the Baleno only, and `addLater()` adds the Ferrari, Vespa, bicycle and her figure (each `compileAsync`'d first, then put in the scene) and empties the cache. Their headlamps are stand-in `SpotLight`s in the scene from the start (`spareBeams`), handed over on arrival, and a car's cabin light joins the pool (`lightPool.adopt`): a light added later would change every shader. Stage times print to the console ("opening the world (ms from start): materials · house · coast · fonts · studio · world · car · built · shaders · garage"); `play.timings()` in tests. Switching vehicles now turns the last one's lamps off and this one's on if they were on.
- **The Ferrari at speed (9 Nov 2026):** with 400 kW at the rear and nothing held back, under full throttle at up to ~140 km/h the rear tyres had almost no grip left for cornering, and it spun even with aids on. Now: rear-drive traction control keeps a reserve of rear grip for cornering (`aids.tcsReserve`: Assisted 0.45, Sport 0.3; off with aids off), downforce (`spec.downforce`, N per (m/s)², 42% front; ~3.6 kN at 200 km/h), and its own steering (`lockSpeedFalloff` 12, slower hands at speed) and a rear that lets go more gently. `node scripts/ferrari_test.mjs [id]` drives four manoeuvres at 120/160/200 km/h per aids level: Assisted and Sport now slide at most 3.4° at 1.2–1.4 g (before: spun at 120 km/h); Baleno unchanged (drive harness 29/29).
- **Her on the two-wheelers (9 Nov 2026, redone after the owner's review):** the bicycle model was modelled leaning 3.4° on its stand with its whole steering (fork, front wheel, bars, basket) turned 13°, and its saddle set for a taller rider; the loader now stands it upright (`upright`), turns the steering straight about its axis (`steerRest`) and lowers the saddle 10 cm (`saddleDrop`: triangles in a box moved down). Her pose (`avatar.js` rig, world-space targets from `updateHer`): hips on the saddle; each grip (measured: centre and axis, held in the handlebar's own frame so it turns with the steering) runs through her palm (palm down on it, index finger on its inner end, `orient`), fingers and thumb curled round it (`curl`); she leans forward from the hips until the grips are in reach (elbows bent); the ball of each foot on its pedal (round with the crank), toes a little down, knees forward. Stopped (eased): on the step-through bicycle she slides forward off the saddle and stands astride it, both feet down; on the Vespa she stays seated, on tiptoe.
- **The garage (8 Nov 2026):** `vehicles.js` `FLEET` (Baleno at home; Ferrari Roma, rwd, grey; Vespa; bicycle, at the studio), `vehiclemodels.js` (`loadCar`, `loadTwoWheeler`: wheels, steering axis, crank split by region), per-vehicle `VehicleSim` spec and sound profile (`audio.setProfile`); parked ones are dynamic obstacles (a `field` collider). Models built by `tools/vehicles/build.mjs`; credits in `assets/LICENSES.md`.
- **On foot:** behind her outdoors, first person indoors (see her figure). The tour's `Walker` moves an invisible "head" the way she looks (drag to look, W A S D, Shift to hurry; on phones Gas / Brake walk and the arrows turn).
- **Sound:** synthesised: engine with harmonics and saturation, a dip at each shift, intake, road rumble, wind, squeal, sand crunch, surf by the shore, horn, door; muffled cabin mix in the driver's view.
- **Music (`music.js`):** her songs through YouTube's IFrame Player API (nothing downloaded). The player is visible in the music panel while it plays, as YouTube's terms ask; closing the panel pauses it. Needs internet; unembeddable videos are skipped.
- **Test API (`window.play`):** `drive`, `foot`, `walk`, `exit`, `interact`, `close`, `sunset`, `setTime`, `camera`, `teleport`, `home`, `studio`, `look`, `render`, `state`, `info`. `scripts/play_shots.mjs` runs a 20-shot route. In headless SwiftShader use `?headless`.
- **Numbers (desktop):** about 256 draw calls and 0.67 M triangles per pass of the scene (measured before the realism pass); the sea's reflection draws the scene a second time at half resolution, and GTAO a third (normals and depth).
- **Realism pass (3 Nov 2026; owner: "hyper realistic, calm sea side, even the sand"; laptop / desktop first; turquoise sea, white sand; a shooting star about once a minute with "Make a wish"):**
  - **Sea (`water.js`):** a polar grid that follows the camera (rings ~0.3 m apart near you), lifted by five long, low Gerstner swells coming in from the north and north-west, so the waterline creeps up and back down the beach. Planar mirror reflection of the whole scene (half resolution, 4x MSAA), bent by four drifting layers of `play/textures/waternormals.jpg` (three.js example texture, from its GitHub repo). Depth comes from a baked half-float map of the distance to the coast (`coastDist`, 1.7 km square) plus the beach profile, so the water is clear over the shallows and deep teal further out. Fresnel uses a smoothed normal; sun or moon glitter is a sharp Blinn highlight; lacy foam and a thin white line where the water runs out on the sand. Premultiplied blending (reflection + body over what's below).
  - **Night sky (`night.js`):** a dome on a sphere that follows the camera: a dark gradient with a Milky Way band (procedural dust and lanes), ~9,000 twinkling stars (crowded along the band, a few bright ones, warm and cool tints), the moon with a halo over the open sea to the north-west (az 318°, el 20°; the night's moonlight comes from there, so its path lies on the water). Shows partly at dusk (`stars` in `TIMES`). A shooting star every 45–75 s at night, spawned in front of where she is looking, and "Make a wish ✨" fades in (`#wish`).
  - **Finish (`post.js`, desktop only; `?low` and touch devices skip it):** HDR half-float buffer with 4x MSAA, GTAO ambient occlusion (the pass's defaults; custom values broke its depth with this camera's 0.1 m–9 km range), a gentle bloom (threshold lower at night for the moon and lamps), tone mapping in `OutputPass`. If frames take longer than ~26 ms it drops AO, then the pixel ratio.
  - **Materials (`surfaces.js`, `studio.js`):** generated relief maps for sand ripples, plaster, wood grain (from the plank textures), woven fabric; fabric has sheen, the oak floor a clearcoat; books are a spine atlas (cloth colours, gilt bands, titles; page edges and covers on the other faces); paintings sit on a canvas weave under a satin varnish whose relief comes from each picture's own brush strokes once it loads (`addImpasto`); poems are behind glass; wooden frames have grain.
  - **Photo-scanned textures (optional):** `tools/fetch_play_textures.py` downloads Poly Haven (CC0) scans for sand, ground, asphalt, deck, oak floor, oak, dark wood, plywood, plaster, linen, plus a daytime sky HDR, into `viewer/play/textures/` with a `manifest.json`. Poly Haven can't be reached from the build sandbox, so the owner runs it locally and commits the folder. `textures.js` lays a scan over a material only if it's there, dividing out the scan's average colour and putting back the tone the material was designed with (the white sand stays white, each piece of oak keeps its shade). The day sky photo becomes background and lighting, turned so its sun matches ours, its sun capped (the directional light is the sun) and its brightness matched to the generated sky. Fetched by the owner on 3 Nov 2026 and committed (76 MB): coast_sand_01, dry_ground_01, asphalt_02, wood_floor_deck, laminate_floor_02, oak_veneer_01, dark_wood, plywood, white_plaster_02, fabric_pattern_05 (relief only: it has no colour map), and the kloofendal_48d_partly_cloudy_puresky sky. The plaster scan is used for relief only (its colour is stained; the walls stay clean white); the sand is toned to white coral sand with its AO softened. Note: `vite.play.config.js` copies `play/textures/` into every build, so merging to `main` would add ~76 MB to the deployed site.
  - **Test API additions:** `wait(seconds, shoot)` (lets time pass; `shoot` fires a shooting star), `quality()`, `debug()`. `play_shots.mjs` adds shots 13–20 (shore at evening and day, waterline, night sea, shooting star, dusk, gallery, books).
- **Feel pass (3 Nov 2026; owner: walking a bit sluggish, stuck at stairs and furniture, wants to sit on sofas / beds / chairs; driving should feel natural, like GTA 5: tyres felt stuck to the road, turns and drifts unnatural; better car finish):**
  - **Driving (`vehicle.js`):** tyre forces follow a Pacejka magic-formula curve (peak ~7°, falling to ~80 % past it) with load sensitivity and a friction circle per axle (front-wheel drive: power or braking leaves less grip for turning); rear tyres a little stiffer and grippier per kilo, so the car is stable at speed but slides progressively when provoked; handbrake locks the rear (sliding friction); brake proportioning (rear capped) and ABS; automatic counter-steer while the tail is out; less steering lock at speed; the old low-speed "no slip" blend now only below ~8 km/h and fades the tyre forces with it, and the extra yaw damping is gone. Physics at 240 Hz. Measured headless (`vehicle.js` is pure): 0–100 km/h 10.5 s, 100–0 in 44 m, ~0.94 g, turning radius ~4 m, slalom at 100 km/h stable, handbrake turn at 60 km/h rotates ~105°. The chase camera swings part-way towards the direction of travel in a slide.
  - **Skid marks (`skids.js`):** black rubber streaks behind sliding tyres on the road; tyre tracks always in sand.
  - **Car finish (`carmodel.js`):** metallic paint with flakes (from surface position: the body has no UVs) under a mirror clear coat; clear, reflective glazing; alloy rims; matt tyres; chrome garnish; lamps under clear lenses; a soft contact shadow under the car.
  - **Walking (`walkfeel.js`, /play/ only — the tour on / and /v1/ is untouched):** patches the tour's `Walker` at start-up: momentum (accelerates / slows over a fraction of a second), 1.9 m/s walk and 4.2 m/s with Shift, moves in short sub-steps that try directions either side when blocked (glides along walls and round furniture), the eye follows stair treads smoothly, a slightly taller step at flight ends, a faint head bob. `?oldwalk` keeps the tour's own. Stair routes GF→FF→SF and back from several starting points tested headless with both walkers (no sticking found on those routes; the new one is ~12 % quicker).
  - **Sitting (`seats.js`):** seats from house_r1.json furniture (sofas, settee, armchairs, lounge / dining / study chairs, poufs, benches, bean bag; beds and loungers to lie on), facing the furniture's front. In the home tour (entry.js): "E · Sit on the sofa" when close and looking at it; the view glides to a seated eye height (or lying back on the pillow); E or a step gets up in front of it if that spot is clear, else where she stood before sitting, else the first clear spot round it (`standSpot`; 22 of 36 front spots were inside a coffee table or chair, which left her unable to move — fixed 3 Nov). The walker also lets her walk out of anything she overlaps. On the coast (main.js) the same seats are part of the E interactions. Test hooks: `playEntry.sit(id)`, `playEntry.stand()`.
- **Driving programme (from 3 Nov 2026; the owner asked for the best driving experience, run in phases with a playtest after each):** (1) tools and baseline; (2) tyres and chassis; (3) aids and input; (4) camera; (5) sound and visual feedback; (6) collisions; (7) polish.
  - **Phase 1 — tools (done):**
    - `src/play/vehicleTuning.js`: every handling number, with what it changes. `vehicle.js` reads it (the refactor was checked to give byte-identical results).
    - `scripts/drive_harness.mjs` (`npm run drive:test`): 19 scripted manoeuvres in Node against targets (0–100, top speed, braking, skidpad, turn-in time, yaw overshoot, slalom, lift-off, trail-braking, handbrake turn and recovery, turning circle, drawn roll and dive, sand, standstill creep, physics cost). `--save`, `--compare`, `--sim <file>` (test another vehicle.js), `--replay <recording> [--csv]`. Results in `scripts/drive_results/`: `baseline.json` (the model as of the 3 Nov feel pass: 13/19 on target) and `original_model.json` (the model before it: 8/19).
    - `src/play/devtools.js`, in /play/: **F3** overlay (speed, gear, rpm, pedals and steering, slip angles against their peaks, slide angle, yaw rate, g, axle loads, grip used per axle with friction circles, active aids, surface; force arrows at the wheels, red when sliding); **F4** records every input at every physics step and saves a .json; **F6** replays it (or drop the file on the page). Replays are exact (live run, in-game replay and headless replay end at the same spot). Test hooks `play.dev()`.
    - Baseline misses (for phase 2): 0–100 too quick (10.5 s, target 11–12); turn-in too quick (0.13 s, target 0.15–0.25: twitchy); turning circle too big (5.5 m, Baleno 4.85); drawn roll (5.8°) and dive (5.0°) too much; and after a handbrake flick, straightening up with throttle does not catch the slide: it spins until nearly stopped. Also seen on the overlay: the automatic counter-steer works against a deliberate handbrake turn; the "lateral g" shown is u·r, which overstates it in a spin.
  - **Phase 2 — tyres and chassis (done, 19/19 on target; `scripts/drive_results/phase2.json`):**
    - Wheel loads: fore-aft transfer plus side-to-side transfer per axle (`rollFront` 0.6 of it at the front: the understeer / oversteer balance), with load sensitivity per wheel.
    - Tyre relaxation length (0.4 m): sideways force builds as the tyre rolls, softening turn-in.
    - Body roll and pitch are simulated springs and dampers (≈3.4° roll at 0.88 g, ≈2.2° dive braking from 100), drawn on the car (`sim.roll`, `sim.pitch`); the drawn body only adds the ground's slope.
    - True accelerations (`sim.axT`, `sim.ayT`) for the overlay and the springs (the old u·r overstated a spin).
    - Stability aid (`escGain`, `escSlide`): a correcting yaw moment when the car rotates faster than the steering asks; with the counter-steer it stands aside while the handbrake is held and returns over 0.35 s (`aidReturn`). A handbrake flick at 70 km/h now recovers in 1.2 s (it used to spin out); handbrake turns still rotate ~96°.
    - Full lock (0.665 rad) up to 3 m/s, then less with speed: kerb-to-kerb turning circle 4.84 m (Baleno 4.85). Steering speed falls with road speed (`steerRateFalloff`): turn-in 0.16 s. 0–100 11.3 s.
    - Driver's view: eye moved to a normal seated position (~0.6 m behind the wheel); field of view 56° (was 72°, which stretched everything); a cabin fill light for daylight through the glass. The steering wheel is the file's own (the real Baleno wheel: Suzuki badge, spoke switches); a modelled replacement was tried and dropped in phase 3 because the original reads better once lit and seen at a normal field of view. Its cut-out from the dashboard now takes the rim's full depth but nothing behind the hub (the stalks used to turn with it).
    - `play.drive(seconds, input, false)` steps physics without drawing (for scripted driving); the screenshot route keeps to its lane with a small lane-keeping controller.
  - **Phase 3 — input and aids (done; 23/23 on target, `scripts/drive_results/phase3.json`):**
    - `src/play/input.js` (`DriverInput`): keyboard / touch steering eases in (faster at low speed), snaps back, swaps sides quickly; throttle and brake ramp in over ~0.2 s. With aids, a full steering key turns the wheels only as far as the tyres can use at that speed (`steerLimit`, ~peak slip): holding a key carves a corner at ~0.9 g with a ~2° slide instead of scrubbing.
    - Gamepad (standard mapping): left stick steers (dead zone 0.08, curve 1.6, the same speed limit as a soft ceiling ×1.15), RT / LT analogue throttle / brake, RB or A handbrake, Y get in / out, B horn, View camera, D-pad up lights, D-pad down time of day, Menu music, right stick looks around (on foot: left stick walks, right stick looks). Rumble: weak motor for tyre slip and rough ground, strong for impacts and ABS. A toast lists the controls when a pad connects.
    - Driving aids (HUD button / K; saved per browser): **Assisted** (default: counter-steer, stability, traction control, ABS, key limit), **Sport** (counter-steer ×0.35, stability ×0.3, looser key limit), **Aids off** (no counter-steer or stability; the front wheels can spin up or lock, then have only sliding grip; no key limit). Without aids the handbrake flick is still catchable with opposite lock (~2 s).
    - New harness tests: keyboard corner at 100 km/h (slide, g), at 60 km/h (g), aids-off flick with a counter-steering driver. Test hook `play._driver()`.
- **World and protagonist programme (from 3 Nov 2026):** the owner chose a fictional protagonist (an Indian woman in her thirties, not modelled on Deepti or anyone real) built with MakeHuman / MPFB2 (CC0: the plug-in's bundled assets are CC0; its repo carries the base mesh, shape targets and rigs including a Mixamo-compatible `rig.mixamo.json`), a kurta-and-trousers outfit first, animations from Mixamo (downloaded by the owner) plus Quaternius (CC0). MetaHuman (now usable in other engines, per Epic) was set aside as too heavy for a browser; Ready Player Me shut down in Jan 2026. World steps: (1) day–night clock; (2) clouds; (3) breaking waves; (4) sand and road dressing; (5) sound.
  - **World step 1 — the clock (done):** `src/play/skyclock.js`: real sun position (NOAA approximation) for 15.5° N 73.8° E (near Goa), IST, today's date (`?date=YYYY-MM-DD` to choose); sunrise / noon / sunset computed (3 Nov: 06:32 / 12:18 / 18:05, setting at 255°). The light blends by sun height between keyframes, with a separate rising palette (dawn, a pink misty sunrise with thicker haze, a cool morning) and the setting one (golden hour, sunset, dusk, night). The clock runs at 20× by default (`[` / `]` slower / faster, `\` stop or start; headless stops it); T jumps between Sunrise · Morning · Midday · Golden hour · Sunset · Dusk · Night, and the HUD shows the moment and time. Sky reflections are recomputed only when the sun has moved 0.4° (or every 4 s). The photographed day sky now only lights the scene; the visible sky is always the live one (no pop). The lounger moves the clock to golden hour and runs it at 90× until dark, facing the day's real sunset. `?clock=17.5` starts at a time; `play.clock(h, speed)` for tests.
  - **World step 2 — clouds (done):** `src/play/clouds.js`: a camera-following dome whose view rays are carried up to a cumulus layer (~1.6 km; domain-warped fbm drifting on the wind) and a high cirrus layer (~9 km, streaks). Each cloud is shaded by how much cloud lies towards the sun (two samples), plus a scattering term so noon clouds stay white, forward-scattering glow and silver linings near the sun; after sunset they stay lit from below (pink, orange, then lavender) until the sun is ~7° down; faint moonlight at night; thinner and hazier near the horizon. Coverage drifts slowly through the day (`?clouds=0..1` fixes it). Rendered after the stars and moon (they pass in front), and seen in the sea's reflection. Not yet: cloud shadows on the ground (planned with weather).
  - **World step 3 — shore waves (done):** `src/play/shorewave.js` (GLSL shared by the sea, the sand and the spray): a train of swells with crests parallel to the coast (from the coast-distance map), 24 m apart, one every 8.5 s, in sets that grow and fade; they shoal (grow as the water shallows), have peaked crests, break into whitewater 2.5–13 m out, and run up the sand as a thin sheet that drains back. The sea's vertex shader adds the wave height along the coast's normal (gradient of the distance map) on top of the offshore swells (now calmer); the fragment shader adds the breaking whitewater (broken up by the foam lace). Thin swash is see-through (its sky reflection fades in the last 10 cm of depth) with a lacy edge. The sand shader shows a glossy film in the swash zone after each wave drains, then soaking in. `src/play/spray.js`: ~3,000 GPU droplets along the coast, thrown off each crest as it breaks and carried shoreward. Tuned for a calm sea: run-up of a couple of metres on the 1:21 beach.
  - **World step 4 — dressing (done):** `src/play/dressing.js`: ~11,000 dune-grass clumps (instanced crossed planes, canvas blades) on the dry upper beach, denser towards the land and in patches, kept off the road, GH-18, the studio and the parking; the wrack line (~730 seaweed decals at the high-tide mark) and ~25 pieces of driftwood; footprints (a ring of 260 decals stamped every 0.66 m while she walks on sand); roadside kilometre stones every ~500 m (white with a yellow cap), two 40 km/h signs either side of GH-18, a bus shelter and a chai stall on the road near the house, all with car colliders. `beach.js`: a 48 m worn road tile (tyre-polished lane paths, repair patches, cracks, chipped paint, sand drifts on the edges); `windSway()` bends palms (trunk sway with height, frond flutter) and the grass with the sea breeze, each plant out of step.
  - **World step 5 — sound (done):** `src/play/ambience.js` (Web Audio, synthesised; shares CarAudio's context and its in-car muffling): waves break audibly when the visible crest at the break point in front of her passes (the sea shader's own phase formula), from that direction (stereo pan) and at a level by distance: crash + low thump + the wash hissing up the sand ~1.4 s later; a low surf bed by distance (the old unsynced surf in audio.js is silenced); breeze in gusts; palm rustle when palms are within 15 m; birds by sun height (chirps, myna-like whistles, the odd crow; gulls near the water), none at night; crickets after dark, inland and in the grass; footsteps per surface (dry sand, wet sand, timber deck / boardwalk / studio oak, the house's stone and tile, the road) triggered with the footprints. Indoors (house, studio) outside sounds drop to ~35 %. Checked offline (`measureSfx`: every sound renders, wave peak 0.4, no clipping) and live headless (5 waves in 40 s, one per wave). Not heard by me: tuning by ear is for the owner.
  - **Protagonist step 1 — base body (done):** `tools/character/` builds her in headless Blender (bpy 5.2 from PyPI + MPFB2 cloned from GitHub and installed as a user extension; the MakeHuman site itself is not reachable from the build sandbox). Female, ~33 (age macro 0.5615), 1.59 m, slim-average, race macros caucasian 0.5 / african 0.3 / asian 0.2; Mixamo-named skeleton (MPFB's `rig.mixamo.json`, 52 bones); shape targets baked; clothing: a knee-length teal kurta (body faces under the torso and upper arms pushed out 11 mm + MakeHuman's skirt helper cut at the knee) and off-white churidar trousers (tights helper, knee to ankle); body faces hidden under clothes removed (no poke-through); brown eyes (front-on UVs and a painted iris), lashes; placeholder hair: a cap shaped to her head (hairline by position) and a braid weighted to the head and upper spine. `viewer/play/models/protagonist.glb` (1 MB; copied into builds by `vite.play.config.js`), `tools/character/protagonist_for_mixamo.fbx` (one joined mesh for Mixamo's auto-rigger). Not yet in the game: she needs animations first.
  - **Waiting on downloads (owner):** (1) the MakeHuman system assets pack (CC0: skins, eyebrows, eyelashes, hair, eyes) from static.makehumancommunity.org/assets/assetpacks.html; (2) Mixamo: upload the FBX, auto-rig, download the clips listed to the owner (FBX, 30 fps, locomotion "In Place"), commit them under `tools/character/mixamo/`.
  - **Cosy studio and the beach door (3 Nov, owner: "more cosy; a door inside to the beach; other things"):** `studio.js` exports `BEACH_DOOR` (x 106.5–108.3): the north glass wall now has an open sliding door (panel parked behind the glass to its left, header, threshold) onto the deck. `src/play/cosy.js` adds: three timber steps from the deck down to the sand in front of it (walkable; checked headless: inside → deck → steps → beach); sheer linen curtains gathered at the glass (brass rods; they stir in the breeze); a floor-seating corner by the west glass (jute rug, gaddi mattress, bolster, cushions, a low teak chowki with a brass diya, kettle and glasses; E to sit); a mustard knit throw and cushions on the daybed; books on the coffee table and by the nook; candles on the coffee table and the north sill and the diya, with flickering light after dark; a hanging pothos (north-west corner) and a monstera by the door; wind chimes under the eaves by the door (they swing in the gusts and ring in ambience.js); on the beach a fire pit (stone ring, ash, charred logs glowing, a flickering fire shader, embers, a warm light; lit from dusk) with two driftwood logs to sit on (E: "Sit by the fire") and its crackle and roar in ambience.js; a striped hammock on a teak stand (E to lie in it; the view rocks gently).
  - **Driving phase 4 — camera (done; 28/28 on target incl. 5 camera tests, `scripts/drive_results/phase4.json`):** `src/play/chasecam.js` (pure, tested in Node): chase / high camera on a damped angle (stiffer at speed) that looks into corners (0.45 s of yaw rate, smoothed: ~8° into a 60 km/h corner) and follows ~45 % of a slide; distance grows with speed (5.6 → 8.6 m) and rides a spring with acceleration (closes ~0.8 m braking from 100); height drops a little at speed; the ground followed through a spring (bumps softened); a fine shake above ~110 km/h and a jolt on impacts; FOV 56° widening with speed; wall avoidance kept; look behind on **B** (or the gamepad's right-stick click / LB) swings round in 0.18 s. `headMotion()`: in the driver's seat the head moves back / forward and out with the g-forces, tilts a touch into turns, looks into the turn and over the shoulder on B. New **bonnet** camera (C cycles chase · driver · bonnet · high). Camera tests in `drive_harness.mjs`: corner lead, slide follow, look-back time, brake close-in, slalom smoothness.
  - **Driving phase 5 — sound and visual feedback (done; 29/29 on target, `scripts/drive_results/phase5.json`):** `src/play/particles.js`: one GPU-moved particle pool (1600, 700 on low-end) for the wheels — tyre smoke on tarmac when a tyre slides (soft, growing, drifting with the breeze), clumps of damp sand thrown back off the beach (they land and fade) with a pale haze, dust on dry ground, droplets in the shallows; emitted per wheel from the slip and surface in `updateCar`, lit by the sun and sky. `carmodel.js` `dashGlow()`: the gauges and screens of the real dashboard texture (`reflector.1` atlas) become an emissive map, lit up with the headlamps (0.9 at night, 0.12 by day). `audio.js`: tyre scrub as the tyres near their grip (`tel.useF/useR`), squeal past it, a broad skid when wheels lock (handbrake, braking without ABS), gravel crunch on dry ground, a splash in water, a faint gearbox whine (louder on the overrun) and exhaust pops when lifting off above 3600 rpm. Water drag cut from 2600 to 1600 N so a car stopped in the shallows wades out (it was stuck at 0.2 km/h); new harness test `water_pullaway` (11 km/h after 3 s).
  - **Studio v2 — Deepti's Studio (done):** `site.js` STUDIO now 18 × 11 m (x 98–116, z 40–51; the north edge, beach door and the beach pieces unchanged). `studio.js` rebuilt: ground floor (+0.6) library (the ring nook, full-height birch shelves, reading chair), lounge (linen sofa, oak coffee table with the album, brass pendants, the radio credenza), gallery (a lit partition, 10 works each face, brass track spots, a bench to sit and look, a sculpture, cane chairs); an oak stair cantilevered from the south wall (19 risers, 0.6 → 4.0 m, glass balustrade, brass rail; per-tread walk surfaces and under-stair colliders) with a salon of paintings climbing beside it; upstairs (+4.0) her atelier under north light (two easels, work table of brushes and paints, flat files, leaning canvases, a cork mood board of her photos, a reading corner, the writing desk with her poems on the wall); a roof terrace over the gallery (glass balustrade, pergola with fairy lights and the floor seating, two loungers, bougainvillea tumbling down the front). Outside: "Deepti's Studio" in dark bronze letters on the front with a warm halo at night, an oak canopy, sconces and a plaque at the door, a frangipani at the boardwalk, her bicycle, a planter of grasses and lavender, path lights, a wash of light on the front at night; the grove palms moved clear. About 50 places for paintings fill in order from the pack (big works on the stair and gallery walls, small ones on the stair and the partition, anything past ~28 upstairs). `cosy.js` keeps the curtains (now both floors), candles (placed from `studio.anchors`), plants, chimes, beach steps, fire pit and hammock. Fixes: walking up onto the studio floor (the sand under built floors is no longer a floor: she used to walk through the plinth, the view 0.6 m low); getting up from seats outside the house (fire logs, hammock, floor seating) no longer throws; a terrace lounger leaves her on the terrace. HUD: a ☰ menu (or Tab) with icons, values and keys replaces the two rows of buttons; Get out shows only while driving.
  - **Her poems in Hindi (done):** five more poems in `play/deepti/pack.json` (seven in all; the fifth transliterated into Devanagari, titled with its first line). The atelier's west wall is now a poetry wall: every poem framed behind glass under a brass light, either side of the terrace door (`studio.js`, frame height from the line count). Devanagari is set in Noto Serif Devanagari (`viewer/play/fonts/`, SIL OFL 1.1 with `OFL.txt`; copied into every build, it holds no personal content): loaded with `FontFace` when the pack has Hindi, the frames redrawn once it arrives; the reading overlay shows Hindi upright (no false italic) with more line spacing (`.poem.hi`).
  - **Bicycle, window bed, record player (done):** `bicycleGroup()` replaces the old stick bike: a sage Dutch step-through (swooping tube frame, 20-spoke wheels with tyres and chrome rims, chrome mudguards, swept-back bar with leather grips, bell and lamp, sprung leather saddle, chain guard, rear rack, kickstand, a wicker basket of flowers), leaning on its stand by the front wall. In the lounge, by the north glass: a window bed (a deep tufted mattress on a low oak platform, pillows, a bolster, a knitted throw over the edge, a folded quilt, a sheepskin, a lantern, a tray of chai, a book); E to curl up and watch the sea. An oak-slatted ceiling over the lounge. The radio is replaced by a listening corner: an open walnut record console (three bays of records, brass feet), a pair of walnut speakers with woven grilles angled to the sofa, and a turntable (walnut plinth, aluminium platter, a record with a \"Deepti's Studio\" label, S-shaped tonearm with headshell and counterweight, an acrylic lid propped open, the sleeve of the record that's playing beside it). E plays her music; while it plays the record turns at 33⅓, the arm swings onto it and the power light glows (`studio.update(t, playing)`, from `frame`). (A sleeping cat was tried and taken out: not her.)
  - **Trees and walking (done):** *Palms* (`beach.js` `palmGeometry`/`buildPalms`) are now botanical rather than cards: a flared, tapering trunk with leaf-scar rings (grey at the foot, warmer up the stem) and a fibrous collar; ~24 fronds on a golden-angle spiral, each a midrib arching under its weight with real leaflets hanging in a V, drooping more towards the tip, yellowing at the tips of older fronds, young fronds upright in the centre, 2–3 dead brown fronds hanging below; a cluster of coconuts; soft upward normals and crown occlusion in the vertex colours (no black undersides). Five variants; full detail within 55 m of the camera, a lighter build beyond (`palmLOD`, re-sorted every 0.5 s or after a 5 m jump, from `frame`). *Dune grass* (`dressing.js`): clumps within 40 m are drawn as real blades (tapered, arching, green to straw, some dry), the rest as the old cards (`dressing.lod`). The frangipani has a fuller canopy of paddle leaves and more flowers. *Walking* (`FootWalker.update` in `main.js`; the tour's `walk.js` untouched): eases into and out of a walk; a slimmer body (210 mm); when blocked, the step is tried turned up to ~77° either way so door frames and corners guide her past; door assist (near a doorway and heading roughly through it, the path is drawn onto its centre line; doorways from `house_r1.json`); steps out of anything she overlaps; the eye follows steps through a spring with a faint stride bob. Doorway test (every door both sides, off-centre and near-miss aims): 71 % → 93 % passes; the rest are the full under-stair store and the main door's leaves. All stair routes still pass. *Orientation*: a room chip by the clock ("Kitchen · GF") while in the house, and the minimap turns into the plan of her floor, the room she is in highlighted, names placed without overlap.
  - **Studio C, music, court, billboards, house life, type (done):** *Type*: `fonts.js` loads bundled, subset OFL fonts (`play/fonts/`, licences alongside): Cormorant Garamond (her name, plaque, poems), Inter (labels), Noto Serif Devanagari (Hindi); the canvases wait for `fontsReady`. Poems (framed and on screen) are a warm paper card with a colour wash, gold hairline, italic title over a gold rule, spaced-capital dates. *Studio* (`site.js` 22 × 11 m): ground ceilings 3.6 m, upstairs at +4.5; a double-height lounge (x 106–113) to a skylight, glass to the sea all the way up, a cascade of brass globes; the atelier (x 98–106) opens onto it behind glass; an oak bridge along the north glass to the roof terrace (x 113–120); her horses large on the tall south wall; poems on the atelier's east wall; 22-riser stair. *Library*: a halo round the nook, backlit cubbies, paper lanterns, a rail and ladder, a bentwood rocking chair (`rockingChair()`: rolls on its rockers about the arc's centre; rocks while she sits, the view with it; settles after). *Billboards* (`billboards.js`): her big paintings on gallery-style billboards round the loop (land side, straight stretches), captions with the distance to the studio, gooseneck lamps; private pack only. *Music* (`roomaudio.js`, `music.js`): zones (studio library, lounge, gallery, atelier, terrace; every house room) with speakers; P plays in the room she's in, O this room / everywhere, brass panels and the record player play their room; her own files (`pack.tracks`) play through Web Audio at up to four nearby speakers (HRTF panners, muffled by what's between: open plan, wall, floor, outside); the YouTube list follows the same levels by volume; in the car straight through. *Court* (`court.js`): regulation doubles badminton court west of the studio (sage on terracotta, all lines, regulation net that stirs, windbreak and hedge, floodlights, bench, scoreboard, boardwalk); the rally: E at the bench, a floating-racket partner, shuttle with real drag (terminal ~6.8 m/s), Space/click swings in reach, aimed where she looks (up lobs), a little aim help, partner misses decided once per shot; rally and best (localStorage). *House life* (`houselife.js`, the tour untouched): the room she walks into lights up at night (two warm lights hand over); a working lift (E at its door, a floor panel, a fade and a chime); the mandir's own two diya stands lit with a bell; chai on the hob (a brass kettle, steam, a cup); ceiling fans in the bedrooms; her photos in standing frames on consoles and bedside tables; a fridge hum and a ticking clock; footsteps by the floor finish; "Go to…" in the menu (every room, the studio, the court, the gate). *Lights*: `lightpool.js` takes every point light out of the scene and lets a fixed 8 (5 on low-end) stand in for the brightest nearby, re-chosen 4× a second (constant shader cost, no recompiles). Things to use now beat a seat beside them for the E prompt.
  - **Her reader, and looking at paintings (done):** *E-reader* (`ereader.js`, `createEReader({pack, camera, scene, clockLabel, onOpen, onClose})`): a 3D device (about a Paperwhite, 125 × 174 mm, rounded graphite body, "Deepti" on the bezel) drawn over everything (depth test off, in order), held in front of the camera at the distance where it fills ~80 % of the view height (and fits the width on a phone), its top tilted away, a breath of sway; a dark veil behind it at 58 %. It rises from below the view, or from the studio device she picked up (that one is hidden meanwhile and goes back). The screen is a 1200 × 1600 canvas: `typeset(i)` sets a poem in pages (kicker, title, ornament, date; lines wrapped at words; stanzas of ≤ 8 lines kept together; signature; a one-page poem centred); a header (Deepti's Reader, the game's clock) and footer (title, page n of m, progress); a library (her poems, then those for her, the chosen row inverted, page counts). Page turns flash black for 70 ms and leave a faint ghost for 0.45 s. Keys while open: ← → / Space / PageUp-Down, ↑ ↓, L, − +, Esc / E; clicks raycast the screen (left third back, else on; the top strip opens the library; a library row opens that poem); swipe and wheel (one page per flick) turn. Front light: emissive 0.18 by day, up to 0.68 at night. Remembers the poem and size. *Paintings* (`artview.js`): the camera leaves her eyes and glides (smootherstep, 1.15 s) to stand square in front of the painting at the distance where it (and its frame) fills the view (FOV 46°); zoom 1–5× about the pointer (wheel, pinch, double-click, + −), drag to pan within the painting, swipe or ← → glide to the next in hanging order (a dip to black via `#veil` when the next hangs on another wall or > 4.5 m away), Esc / E glide back to her eyes. A small caption bottom-left (Painted by Deepti, n / 28, the keys for a few seconds; a Step back button on touch). Paintings carry `size` and `index` in `studio.interact`; `frame()` lets the art view drive the camera instead of `placeCamera`. *Clicks*: `pickAt` takes a painting when the click is inside its outline on the screen, anything else when the click is near its spot. While reading or looking, the HUD fades out (`body.viewing`) and walking stops (`state.overlay`). Wall poems: lines wrap at a word; the largest size that fits, never below ~30 px on the 1024 px card; too long → "Read on in her reader"; less glossy glazing.
  - **Badminton rebuilt, first-drive stutter, painting viewer (done):** *Stutter*: `warmUp()` in `main.js` runs behind the loading curtain: every texture `initTexture`d, every shader compiled with `compileAsync` (hidden objects shown for it), three frames drawn (coast, studio, court) for the post-processing and the sea; `post.rest()` restarts the quality watcher after. 166 programs exist at the start (56 before; the other ~110 used to compile during the first drive). The beach grass dressing now keeps off the court (x 119–139, z 30.5–53). *Badminton* (`badminton.js`, `Badminton` built by `court.js`; the old first-person `Rally` is gone): broadcast camera behind her baseline (`placeCamera`, follows her a little, shake on smashes); rackets as players (scaled 1.5×, soft shadows), shuttle 1.7×, trail, flash. Flight: drag a = −K|v|v (terminal 6.8 m/s), 120 Hz. `solve()` searches launch velocity for a target and apex with net clearance; `solveSmash()` the flattest angle that clears. `planFor(who)` samples the flight and picks the first point in the hitting band (0.3–2.75 m) the player can reach in time (her 4.4 m/s, partner 3.4–5.0 m/s by skill, reaction 0.08 / 0.3–0.15 s), else a lunge. Her timing: `press()` at time t against the plan's contact time: |err| < 0.055 s perfect, < 0.12 good, < 0.2 early/late, < 0.26 weak; the hit happens when the shuttle reaches the racket. Aim from the pointer on the far court (`aimFromScreen`), else keys; shot kind from aim depth, height and timing (drop / smash / lift / clear / drive); spread by quality. Her racket doesn't chase a shot that's landing out (red marker). Partner: shot choice by height and her position (smash chance with skill, drops when she's deep), aim away from her, aim error by skill, 4–12 % plain errors (long, wide, net), misses decided per shot from reach and shot difficulty; it leaves shots going out. Skill moves ±0.03 per point (0.3–0.95) so games stay close. Rally scoring to 11, win by 2, cap 15; server = last winner, right court on even score, diagonal boxes, serve faults. Rally mode: no score, the partner keeps it going, longest rally saved. HUD `#bm` (score pill with the server's dot, calls, a help card, Stop); the scoreboard by the court shows the score. Sounds in `courtSound` (`main.js`). A bot with human-like timing (±0.13 s, 6 % no press) wins 11–6 / 11–8 / 11–4 in 2.5–4.5 min. *Paintings* (`artview.js`): a SpotLight (always in the scene, intensity 0 until used, so no recompiles) lights the painting from above-front, up to 9 while looking; a CSS vignette (`body.looking::after`); the painting's clearcoat drops to 0.06 while looked at (restored after); zoom capped at ~1.6 screen px per image px (`px` from the pack); drag has inertia; ↓ / scrolling out at fit size → the whole wall (paintings facing the same way in the same plane within 9 m, fitted), a click there picks one (`pick`); P a slideshow (7.5 s each, a slow push-in, starts the music); a museum label from `pack.art[i]` title / year / medium / note. The right-hand vector was reversed (zoom about the pointer went the wrong way): fixed.
  - **Lighthouse (removed 9 Nov 2026 for the stunt park), his letters, her library (done):** *Lighthouse* (`lighthouse.js`, deleted): at (212, 23) where the coast turns south; granite outcrop (merged displaced icosahedra), stone apron at +2.2 with a parapet (colliders, a gap at the steps), ten 0.22 m steps from the sand (walk surfaces), a 22 m tapered tower (band texture), the gallery at +24.2 (32 annulus surfaces, railing colliders, the lantern room as a collider), lantern glass and lens, copper dome; `climb`/`descend` interactions fade like the lift (`climbLighthouse` in main.js); two additive cone beams rotating every 12 s after dusk, fading near the lamp and nearly gone when the camera is up there; a lay-by at (186.5, −3.5) and a flagstone path with lamps; map dot and Go to. Car colliders round the outcrop. *Letters* (`hunt.js`): `pack.letters` in order (place, title, text, hint, photo, audio, sign); places from `spots` built in main.js (house life's diya and chai, studio interaction points, the court bench, the fire, the lighthouse bench); envelopes float/turn/glow (Points, so GTAO ignores them), sparkles near; `open()` brings the envelope to her and slides the letter out to hold (3D, depth test off, a dark veil), typeset in pages (photo, title, wrapped paragraphs, signature, P.S. hint); voice via `<audio>` (music ducked); found ids in localStorage `gh18.letters`; the last is locked until the others are found; closing it calls `finale()` (sunset boost if the sun is up, `skyLanterns` (90 instanced lanterns + point halos, pre-built so nothing compiles), her music, a title). The car letter is offered by `findFocus` while stopped in the car. ✉ chip lists found letters; map rings. *Library* (`books.js`, `bookcart.js`, `ereader.js`): pdf.js 4.10 lazy-imported (worker via `?url`; absolute URLs because the worker resolves relative to itself; `standard_fonts` and `cmaps` copied to `dist/play/pdfjs/`); `bookText()` groups text items into lines and paragraphs (gaps, indents, sentence ends), headings by size, drops running headers/page numbers, joins hyphenated words; `layBook()` sets paragraphs into pages (justified, indents, chapters start a page); `renderPage()` for O (original, greyscale on the e-ink); bookmarks as a fraction per book in the e-reader prefs; the library list scrolls, books first. Books listed but missing on disk are skipped (HEAD check), and with none the cart isn't built.
  - **Birthday film (done; renders on the owner's Mac):** `npm run birthday` → `viewer/film/birthday/Happy-Birthday-Deepti.mp4` (gitignored). *Film mode* in `main.js`: `play.cine({px,py,pz, tx,ty,tz, fov, hour, cut, car, clock, dt})` sets the camera exactly, hides the HUD, sets the clock and the world's time (`clock`, so a re-render is identical), hides floors above `cut` for cut-aways (`userData.floor`; the bedroom fans carry `userData.hangsFrom`), places the car (no skids: slip zeroed); `play.filmInfo()` gives rooms, doors, floors, the road, the studio and court and the album; `play.clear(x,z,y)` checks a point of a walking path. `lightpool.reset()` re-chooses lights after a camera jump. *Shots* (`scripts/birthday/film-page.js`): 19 shots, ~172 s with 1 s dissolves: title over GH-18 in the morning, the coast, the entrance, family lounge/dining/kitchen, ground/first/second floor and roof from above (cut-away orbits), master bedroom and balcony, the back garden from above the rear wall, the drive along the coast road at golden hour (the car on the left lane of `ROAD`), the studio's front at sunset, the lounge at dusk, the gallery, the library nook, the poem wall (a line of Aditya's poem), the court at night, her photos (blurred field, white mat, slow push), the beach at night with the closing title. Titles and captions are drawn in a 2D canvas over each 3D frame (Cormorant Garamond, Inter). *Render* (`render.mjs`): builds with the pack, serves `dist`, opens a visible Chromium window on the GPU (Metal on a Mac; `--cpu` for SwiftShader), renders frames in order to `film/birthday/frames-WxH/` (resumable), writes the score, encodes H.264 CRF 15 + AAC 320k with ffmpeg; `--4k`, `--music file`, `--stills [--at 0.1,0.5,0.9] [--only names]`, `--preview`, `--fps`, `--ss` (supersampling, default 1.5). *Score* (`score.mjs`): piano over strings in D major at 72 BPM, synthesised (stretched partials, Freeverb), following the sections of the film.
- **Next, if wanted:** a few more places along the coast.

---

## 7. Revision R1 — the design content and the reasoning

### 7.1 The owner's original change list, verbatim in meaning (Oct 2026)

1. Family lounge, TV, dining and a small washbasin.
2. Dimensions in feet instead of metres.
3. Servant-room washroom. The owner later said to ignore this one.
4. FF: instead of the cupboard in the lobby near the lift, a pantry slab with a storage cupboard.
5. Revert the bathroom layout changes of bedroom 3 / kids room.
6. A bath tub in the master bedroom's washroom.
7. Kitchen washing area: outer construction is not allowed.
8. Convert Mandir + Store into a work table, a sitting sofa with one settee (sethi), and a TV for guests.
9. Design a small mandir somewhere ("chotu sa kahin": a tiny one).
10. Plan storage beneath the stairs.
11. Master bedroom: exchange the dresser and the washroom area, with the door on the dresser side.
12. SF washing area: washing machine, ironing and utility, with a place to hang clothes on the terrace.

Plus the consultant drawings: wiring, plumbing and electrical.

### 7.2 Clarifications the owner gave (approved brief)

1. North = the road side.
2. Swap the master dresser and washroom, and add a tub.
3. No construction outside.
4. A small mandir per Vastu on the GF. This was **later revised**: not in a bedroom; in the family lounge's NE corner.
5. A pantry slab with storage above, near the lift.
6. Ignore the servant washroom; the SF utility should be "outside type" (washing machine, ironing).
7. Feet, with metres in brackets.
8. Show the services in the 3D view.
9. Keep R1 on a different URL (`/v1`) and don't touch the existing site.
10. **Later follow-ups:**
    - the mandir moved to the family lounge, east wall, NE corner, with the devotee facing east, after an Instagram reference photo
    - a tulsi was added after a reference photo: first in the NE front lawn, then moved by the owner to the **back garden**

### 7.3 Where things are in R1, and why

- **Family Lounge (GF-DRW + GF-DIN, open plan):**
  - TV and 2 TR AC on the west (fluted walnut) wall; the L-sofa faces it
  - pendant over the 6-seat dining table
  - hand-wash basin with a mirror light in the niche by the kitchen wall (it drains to the GF toilet line)
  - open mandir on the east (kitchen) wall at the NE corner, devotee facing east; the crockery unit is south of it on the same wall
- **Kitchen (GF-KIT):**
  - closed, with the KD-1 sliding door
  - hob on the east wall (the cook faces east, red-line 7)
  - wash nook on the north side with a double sink and an exhaust into the OTS (B4); prep counter at the south, under GL-4
  - fridge tower, then DB-1 in a 400 mm cabinet, on the east wall (SE zone)
  - the earlier D-02 outdoor wash yard is removed (owner item 7)
- **Guest Lounge / Study (GF-MND):** desk on the east wall (user faces east), 2-seater sofa facing a TV on the west wall, settee on the south wall. The SS-3 boxed duct is in its SW corner.
- **Guest room (GF-GST):** wardrobe on the south wall, bed headboard on the east wall, no mandir. Its AC sits over GL-1; the outdoor unit is on the front lawn (sheet A6).
- **Under-stair (GF-JAN):** storage cut to the soffit, plus a ventilated inverter / battery / network rack.
- **FF master suite:**
  - bedroom: king bed, headboard on the west wall
  - dresser in the old washroom zone: mirror on the east wall, DB-2 on its west wall
  - washroom in the old dresser zone: tub with an over-tub shower screen, WC on the east wall by the OTS on stack SS-1, vanity on the south wall
  - **Hold point:** this washroom sits over the kitchen, against red-line 11. It needs a new sunken floor and waterproofing.
- **FF lobby:** 1.5 m stone pantry counter with wall cupboards, 250 mm clear of the lift door (C8).
- **FF kids room and toilet:**
  - the kids toilet is back beside the stair at its R0 size, on SS-3 (C9)
  - the study desk faces north along GL-9
  - the TV sits in a niche in the wardrobe run
- **FF bedroom 3** (the front-left room in plan) has its own toilet on SS-1.
- **SF:**
  - servant room, servant washroom (unchanged)
  - store (the old washing room)
  - open utility on the covered back terrace: washer-dryer, utility sink, ironing, tall cupboard, drying racks
  - front terrace kept open
  - OHT 2000 L and solar heater on the SF roof
- **AC outdoor units:**
  - back terrace: SF-AC1 at the SE corner (bedroom 3, via the OTS, 14.3 m); SF-AC3 (family lounge, up the balcony west wall); SF-AC4 (master, straight up)
  - front terrace, NW against the stair wall: SF-AC5 (kids room, straight up); SF-AC6 (guest lounge, up the SS-3 duct)
  - front lawn: GF-O08 (guest room)
- **Tulsi:** back garden NE corner, against the east boundary wall, devotee facing east. Plot zone SE, flagged for the Vastu consultant.

### 7.4 Plumbing (E12) — reasoning

- **Drainage:**
  - Because of C10 the master WC sits by the OTS, so SS-2 is dropped and everything wet on the east side goes to SS-1 in the OTS.
  - The kitchen wash nook drains to grease trap GT-1 in the OTS, so the rear lawn has no chamber or pit (red-line 5, P1, P6).
- **Sewer route** (as in Rev A): IC-2 (OTS) → sleeved under the GF toilet, lobby and foyer with sealed cleanouts CO-1 / CO-2 → IC-3 (entrance court) → IC-5 (parking). SS-3 joins through IC-4. Only IC-5 connects to the municipal sewer.
- **Water:**
  - UGT in the NE front lawn, 3.4 m from the sewer and 2.2 m from the RWH pit.
  - The meter inlet does not cross the sewer.
  - Pumped riser R-1 runs in the east-wall chase above FFL (so it is not "under" the guest room), then up the OTS to the OHT on the SF roof.
  - DT-1 comes down the OTS; DT-2 goes to the SS-3 duct.
  - Solar hot water goes to the master washroom and the kitchen.
- **Rain:** four 100 mm RWPs on the front face to the RWH pit; its overflow goes to the 300 mm storm drain, which takes no sewage.
- **Warning:** the OHT base is only 1.45 m above the SF shower head, so the SF washroom gets a small pressure pump (the electrical sheet has a terrace pump point).

### 7.5 Electrical (E13) — reasoning

- **DBs:**
  - DB-1 (main) at (250, 9451), on the kitchen east wall, SE.
  - DB-2 at (2973, 5950), on the dresser's west wall. It is still in the SE zone, and it could not stay over DB-1 because the C10 washroom is there now.
  - DB-3 at (250, 13300), in the SF servant room for the SF and terrace. **Warn:** E zone.
  - Inverter + rack under the stair; meter + main switch on the front boundary wall at (5000, 22290), read from the street.
- **ODUs:** both side walls are party walls (with GH-17 and GH-19), so no ODU, exhaust or refrigerant penetration may be on them. That forced every ODU to the terraces or lawns, as listed in 7.3.
- **Changes from the sheet** (all recorded in ASSUMPTIONS E13 and CHANGE_REGISTER §4):
  - Bedroom-3 toilet switches are in the bedroom niche, because its door opens from bedroom 3, not the lobby.
  - Master washroom switches are at the dresser door, because wardrobes flank the washroom door.
  - Bedside points are at 600 mm, because the side tables are 500 mm high.
  - The guest AC is above GL-1 at 2450.
  - The kids-toilet EF is a ceiling fan ducted to the open terrace (its W wall is a party wall).
- **Load:** 45.9 kW connected, about 25 kW demand, so a 3-phase supply.

### 7.6 Materials (F16) — reasoning

- **What the owner asked:** "additions, need to get all of these in place": tiles, pipes, wires, paint, POP, granite, timber, MDF board in wardrobes, lights. Read as a materials-and-quantities schedule, and confirmed with the owner:
  - quantities only (no costs)
  - living floors both ways (marble or tiles) to decide
  - MDF as asked
  - a Materials view in 3D
- **Why measured, not typed:** every number comes from the model, so a design change and a re-run of `boq.py` keep the schedule right.
- **Downlights:** the electrical sheet's "light points" are switched groups. The fixture count follows the 1.4 m downlight grid that the 3D ceilings already show, so the 3D and the schedule agree.
- **Granite:** the counter tops were white marble in the model, but the owner listed granite (the norm for Indian kitchens), so R1 now shows 20 mm black granite and the schedule matches. Vanity tops and the backsplash stay white marble.
- **MDF in wet places:** plain MDF swells with damp. The owner chose MDF, so BWP ply is kept only for genuinely wet units. The note is in the Excel file.

### 7.7 Open items and hold points (also in CHANGE_REGISTER §5)

The four warnings in the services report:
1. SF shower head pressure → pump.
2. Guest-room ODU in the NE zone (the sheet's own A6).
3. DB-3 in the E zone.
4. Tulsi in the plot's SE zone (the owner's choice).

Hold points and open questions:
- **Master washroom over the kitchen:** sunken floor, waterproofing, flood test (architect, structural, plumber).
- **Living-area floors:** the owner still has to choose A (Italian marble) or B (large-format tiles); both are in the materials schedule.
- **Master headboard on the W wall** against red-line 13 (S wall). The electrical sheet assumes W.
- **SF rooms not in the S / SW** (red-line T); the SF is a proposal.
- **Structural:** the deck pergola kept or removed under "no outside construction" (asked, unanswered); the tank stand; the OTS opening; the lift pit and overrun; the balconies; the front curved balcony (red-line 16, P9), which is not in the model.
- **Plumber:** sewer invert levels and the municipal connection (RWA / MCG); the GF toilet vanity at the south end (red-line 3, R0 kept); cleanouts, valves, balcony spouts and condensate drains (not modelled).
- **Electrician:** cable sizes, load sanction and testing.
- **Vastu consultant:** re-check of R1 before freeze.
- **Main site questions still open** in ASSUMPTIONS (top): A-15 foyer entry door, A-24 short parking bay, B-06 balcony merge.
- **F17 drawing sheets:**
  - merge into `main` once the owner approves
  - DRN. / CHD. boxes are blank on purpose, for the architect / contractor to sign
  - R0's contractor block (Unique Project Solutions, address, phone) is copied as is; ask if the issue should carry another name
  - known cosmetic overlaps on the FF plan: the GL-4 tag over the dresser dimension, the D3 tag over the bedroom-3 toilet dimension. Fixing them means moving labels shared with the main site's plans, which must stay byte-identical, so they were left.

---

## 8. Design language and quality bar

- **Palette:**
  - light beige Italian marble floors in living rooms and bedrooms; warm-white walls
  - walnut and fluted walnut feature walls (foyer, lounge west wall, master headboard wall)
  - matte large-format porcelain in washrooms; brass accents; black metal frames
  - warm 2700 K-look cove lighting at dusk
- **Furniture:** Indian sizes (queen bed 1524 × 1981 mattress, king 1829 × 1981). All furniture is parametric with bevelled boxes, so keep new pieces in the same style: clean, slightly rounded, with walnut, marble, brass and linen.
- **Reference-driven pieces:** when the user shares a reference photo (the mandir, the tulsi), model its main features faithfully:
  - **Mandir:** marble back panel; backlit cusped (Mughal) arch; gold lotus reliefs; deity on a ledge; floating fluted cabinet with a marble top; brass diya stands; LED coves; pouf and rug in front.
  - **Tulsi:** floating marble plinth with LED under it; carved pedestal and planter; brass diyas; bamboo planters on each side; fluted backdrop with a brass Om.
  - **Verify both by eye:** render day and dusk in walk view, and iterate until it reads like the photo (proportions, glow, motifs).
- **Verification standard used so far:** after every change,
  1. regenerate, and run `check_dims` (main and R1) and `check_services`
  2. render the SVG plans to PNG and look at them
  3. render the 3D views headless (overview, the affected room in walk mode, day and dusk)
  4. on phones, check portrait at 390 × 844 with touch
  5. confirm the main site is unchanged
- **Report to the user:**
  - Briefly, with screenshots sent as files.
  - In plain language: what changed, where it is, any deviations with the reason, and any open questions.
  - Use feet-inches with metres for R1.

---

## 9. Environment notes and traps (learned the hard way)

- **Headless rendering:** use Playwright's Chromium with SwiftShader WebGL:
  ```js
  import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';   // global install in the cloud sandbox
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // start `npx vite preview --port 4187 --strictPort` in gh18-house/viewer, then:
  await page.goto('http://localhost:4187/v1/?headless');
  await page.waitForFunction(() => window.viewer && window.viewer.ready, null, { timeout: 120000 });
  await page.evaluate(() => { viewer.setServices('electrical'); viewer.cine({ pos: [-12.8, 17, 33.8], target: [4.7, 3.2, 12.8] }); viewer.settle(2); });
  await page.evaluate(() => { viewer.walkPose(5400, 8350, 0.45, 90, -2); viewer.settle(3); });   // e.g. the mandir, looking east
  await page.screenshot({ path: 'out.png' });
  ```
  - The project pins `playwright 1.48.2` in devDependencies; in the cloud sandbox that version could not find a browser.
  - **Workaround used:** temporarily move `viewer/node_modules/playwright` aside while running scripts, so the global install is used, then **put it back**.
  - `scripts/shots.mjs` falls back to the global path automatically.
- **Render SVG plans to PNG:** load the SVG in Chromium with `page.setContent` and screenshot the `svg` element.
- **Network policy in the original sandbox:** blocked polyhaven.com, ambientcg, jsDelivr/unpkg CDNs, sketchfab.com and the deployed github.io site. That is why:
  - the textures are procedural
  - the Baleno was uploaded by the user as a zip
  - deploys can't be checked from the sandbox (use the GitHub Actions run list instead)
- **Don't use `pkill -f` with broad patterns.** It killed the agent's own shell once. Kill by PID.
- **Netlify vs GitHub Pages:** both build from the repo's `main` branch. GitHub Pages deploys on each push to `main` (Actions). If the user sees an older version on Netlify, ask them to check Netlify → Deploys, use "Clear cache and deploy site" if needed, and hard-refresh.
- **Deploying from a new branch:**
  - **Path filter:** the workflow only runs when files under `gh18-house/**` (or the workflow itself) change. A branch pushed with no new changes (e.g. a freshly created `main` identical to the default) triggers nothing. Start it by hand with the workflow's *Run workflow* button (`workflow_dispatch`).
  - **Environment rule:** the `github-pages` environment has a deployment-branch rule. When `main` was created, its deploy job was rejected within a second, with no log, until the owner allowed `main` under Settings → Environments → `github-pages` (and made `main` the default branch). If a deploy job fails instantly with no log, check that rule first.
- **Branch housekeeping from the agent sandbox:** pushing new branches works. Deleting a remote branch was refused (the connection dropped twice), so ask the user to delete branches in the GitHub UI (Branches page → bin icon).
- **The previous agent's render scripts** (`r1_walk.mjs`, `el_shot.mjs`, `svc_ui.mjs`, …) lived in a session scratchpad and are NOT in the repo. Recreate them from the snippet above, or add a `scripts/render.mjs` to the repo.
- **Client privacy:**
  - The client's name and address are in the JSON `meta` and are stripped from public builds (PUBLIC_BUILD=1).
  - Don't publish personal data elsewhere.
- **Licences:** Baleno CC BY 4.0 (credit must stay); procedural textures CC0; see `assets/LICENSES.md`.

---

## 10. How the user likes to work

- **Who:** the user is the house owner's side, non-technical but precise about the home. They often write from a phone, sometimes in Hinglish (e.g. "ki jagah" = "instead of", "chotu sa" = "small").
- **What they value:**
  - quality ("No compromise on quality")
  - the old version kept intact (new work on new URLs)
  - Vastu-correct placements
  - feet-inches dimensions
  - seeing the result (screenshots)
- **Process they asked for:**
  - brainstorm and propose first when the change is big
  - then "go ahead" / "continue", step by step
  - they confirm interpretations, so ask when something is ambiguous
- **Running things themselves:** they offered to run things locally if that saves time and tokens. Suggest local commands when useful, e.g. `npm run dev` to preview.
- **Reports:** short; what changed, where, why, and any deviation or open question. Send renders. Don't bury the important caveat.

---

### Starter prompt for a new session (copy-paste)

> You are picking up the GH-18 house-model project in the repo `aditya-pandey/interior-design` (folder `gh18-house/`). Read `gh18-house/HANDOVER.md` fully before doing anything; follow its nine rules (§0) and the change checklist (Appendix E). Work on branch `house-design-v1`; merge into `main` (the live site) only when I approve. Keep the main site `/` unchanged; Revision R1 lives at `/v1/`, with feet-inches and metres in brackets. Brainstorm or propose first for big changes, ask when something is ambiguous, and show me screenshots of what you changed. Pending from last time: my approval to merge F17 (the R1 drawing sheets) into `main`, and my choice between floor Option A (Italian marble) and Option B (1600 × 800 tiles).

---

## 11. Glossary

- **Areas and rooms:**
  - **OTS:** open-to-sky shaft (east side, x < 1031, y 10751–12665); carries stacks, risers and vents.
  - **Brahmasthan:** the Vastu centre of the house; kept free of DBs and heavy items.
  - **Mandir:** home shrine. **Tulsi vrindavan:** a raised stand for the holy basil plant. **Sethi / settee:** low seat with bolsters. **Diya:** oil lamp.
  - **Vastu zones:** N / NE / E / SE / S / SW / W / NW / centre on a 3 × 3 grid.
- **Levels:** FFL finished floor level, NGL natural ground level, POP plaster-of-Paris false ceiling.
- **Plumbing:**
  - UGT / OHT: underground / overhead water tank
  - RWH: rainwater harvesting pit; RWP: rainwater pipe
  - IC: inspection chamber; CO: sealed cleanout; GT: grease trap
  - SS: soil stack; DT: down-take (cold supply from the OHT); R-1: pumped riser
- **Electrical:**
  - DB: distribution board; MCB: miniature circuit breaker; RCD: 30 mA residual-current device
  - ODU: AC outdoor unit; TR: AC tonnage; EF: exhaust fan; VDP: video door phone
  - SB: switchboard; 2W: 2-way switch; IP65: weatherproof
- **Parties:**
  - RWA: residents' welfare association; MCG: Municipal Corporation of Gurugram
  - GH-17 / GH-19: the neighbouring houses on the east and west party walls
- **Item tags:**
  - A-xx / B-xx / C-xx / D-xx: main-site assumption and change IDs (ASSUMPTIONS A–D)
  - A1…E14, B15: R1 items (ASSUMPTIONS E)
  - red-line 1–18, T: Vastu register items
  - P1–P10: plumbing clouds; A1–A8 and B1–B9: electrical clouds (these electrical "A/B" tags are not ASSUMPTIONS IDs; the context makes clear which is meant)

---

## Appendix A — Vastu red-line register (consultant, overlaid on R0; N = road side)

Type: R = retain, M = modify, H = hold point.

| # | Space / zone | Type | Instruction | Structural / plumbing hold point |
|---|---|---|---|---|
| 1 | GF entrance foyer, N | R | Retain the N entry. Light-coloured main door. Foyer bright and uncluttered (N in deficit on GF). | — |
| 2 | GF guest room, NE / ENE | R | No heavy wardrobe on the NE wall; wardrobe on the S or W wall. Puja niche preferred in the NE corner. | — |
| 3 | GF toilet, E / ESE | M | WC at the south (ESE) end; wash / vanity at the north end. | Soil stack aligned with the FF toilet above (item 14); falls to a rear drain with inspection chambers. |
| 4 | GF electrical panel, centre | M | Move the DB / panel out of the Brahmasthan, preferably to the SE (kitchen side). Keep the centre light and clear. | Electrical consultant to confirm cable routing and panel access. |
| 5 | GF rear lawn, S / SW | M | Tall trees and heavy planters along the S and SW boundary. No water body, bore well or soak pit in the rear lawn. | Tree roots min. 1.5 m clear of footings and the rear drain. |
| 6 | GF front lawn, NE | M | RWH pit / water feature in the NE front lawn. | Min. 1.5 m clear of footings; waterproofing and overflow to the storm drain. |
| 7 | GF kitchen, SE | R | Retain. Hob on the SE wall (cook facing E); sink on the N side of the kitchen. Grease trap before the rear drain. | FF master toilet sits above the kitchen (see item 11). |
| 8 | GF study, NW / NNW | R | Retain. Desk facing N or E. Light neutral colours; no heavy storage (NNW in excess). | — |
| 9 | GF lift, W | H | Retain the location. | Lift vendor: pit depth, shaft and overrun; pit waterproofing; clash check with footings and drains. |
| 10 | GF OTS, E | H | Retain. | Structural design of the slab opening and trimmer beams before demolition. |
| 11 | FF master toilet, SE / SSE | M | Revised from the earlier toilet–dresser swap (the dresser zone is too small for a toilet). Put the WC at the ESE (dresser) end of the existing toilet, shower and vanity at the SSE end; the toilet stays within the existing sunken area. | No slab cutting needed. The toilet is above the GF kitchen: full waterproofing with a flood test; no soil pipes running exposed through the kitchen ceiling. |
| 12 | FF dresser, ESE | R | Retain as drawn. Mirror on the N or E wall. | — |
| 13 | FF master bedroom, SW / S | R | Headboard on the S wall; wardrobes on the S / SW walls (SSW in excess suits heavy storage). | Stone flooring load check on the FF slab. |
| 14 | FF toilet (centre-east), centre / E | R | Retain: it sits directly over the GF toilet, allowing a single vertical stack. | Shared soil / waste stack with the GF toilet; vent to the terrace. |
| 15 | FF toilet (bedroom 3), WNW | R | Retain: an ideal toilet zone. | Separate stack on the W side. |
| 16 | FF front curved balcony, N / NW | H | Keep open; light planters only. | Cantilever check; glass railing fixing and load; drainage slope. |
| 17 | FF stair / lift, W | R | Retain. | Headroom and lift overrun at the terrace. |
| 18 | FF rear balcony, SW | H | Retain. | Waterproofing, slope 1:100, overflow spout; railing fixing. |
| T | Terrace (not on R0), SW / W | H | Overhead water tank on the SW / W; open terrace kept on the N / NE. Any new room only in the S / SW. | Tank on an RCC stand over column / beam lines; check residual pressure at the FF showers. |

**Issue status:** NOT FOR CONSTRUCTION. This is an owner instruction to the architect. An R1 construction issue is to be prepared by the architect, with structural and plumbing drawings. The Vastu consultant re-checks R1 before freeze.

## Appendix B — Plumbing Layout Rev A (sheets 2–3, condensed)

**Terrace plan (sheet 2):**
- Heavy items go on the S / SW: OHT, solar heater, ODUs. N / NE are kept open and light.
- **OHT:** 1500–2000 L in the SW corner, on an RCC stand spanning column and beam lines. A float switch controls the pump PP; overflow to an RWP. The base must be at least 2.5–3 m above the FF shower heads, or there is a booster pump on DT-1.
- **DT-1 / DT-2:** both start at the OHT with a gate valve and a non-return valve.
  - DT-1 runs down the OTS: GF toilet, kitchen, utility, FF centre and master toilets.
  - DT-2 runs to the SS-3 boxed duct (FF WNW toilet).
- **Vents:** SS-1, SS-2 and SS-3 extend at least 1 m above the terrace finish, with a cowl, at least 3 m from any window or the solar heater.
- **Rain:** terrace slope 1:100 to the N; four 100 mm RWPs on the front face to the RWH pit; parapet spouts as overflow.
- **Waterproofing:** membrane plus brickbat coba; 48 h flood test; 300 mm upstands.

**Stacks (sheet 3, A):**
- **SS-1:** OTS, east side. Serves the GF toilet and the FF centre toilet. 110 mm soil, 75 waste, 50 vent. Discharges to IC-2 in the OTS.
- **SS-2:** rear face, just inside the E corner. Serves the FF master toilet. Runs in the sunken floor, not through the kitchen ceiling. Discharges to IC-1 in the rear lawn.
- **SS-3:** boxed duct inside the WNW toilet / study NW corner. Serves the FF WNW toilet. Discharges to IC-4 in the parking.
- **Kitchen:** sink + dishwasher, 50 mm waste, to a grease trap in a rear-lawn chamber, then IC-1.
- **Utility:** rear lawn (covered), to IC-1.
- **Rain:** four RWPs on the front face to the RWH and recharge pit in the front lawn; overflow to the storm drain.

**Routing (B):**
- Sewer: IC-1 → under the kitchen's E edge (sleeved) → IC-2 (OTS) → under the GF toilet and lobby / foyer (sleeved, sealed access CO-1 / CO-2) → IC-3 (front court) → IC-5 (parking).
- SS-3 → IC-4 → IC-5. Nothing under the guest room.
- Gradients: 150 mm uPVC SN8 at least 1:60; 110 mm at least 1:40.
- Chambers only in lawns, the OTS, the courtyard and the parking; heavy-duty covers at IC-4 / IC-5.
- Only IC-5 connects to the municipal sewer; no sewage to the storm drain.
- Everything stays inside the plot; nothing on the E / W party walls.

**Water (C):**
- **UGT:** 5000 L in the NE front lawn, at least 2 m from any sewer line or chamber and from the RWH pit.
- **Inlet:** from the gate with a meter and check valve, straight to the UGT.
- **Pumping:** PP 0.5–1 HP; R-1 (32 mm) in the E-wall chase and the OTS to the OHT.
- **Valves:** each toilet has an isolation valve.
- **Hot water:** a geyser per toilet, inside the toilet, high, out of the splash zone; optional solar heater on the S of the terrace.

**Change log (D):**
- **P1:** SS-2, IC-1 and the grease trap moved inside the plot; RCP-1 removed.
- **P2:** kitchen waste to the grease trap.
- **P3:** sewer re-routed under the toilet, lobby and foyer; R-1 into the E-wall chase.
- **P4:** UGT in the NE with ≥ 2 m clearances; IC-3 moved to the front court; the inlet doesn't cross the sewer.
- **P5:** no sewer branch into the storm drain; only IC-5; heavy-duty covers.
- **P6:** no pit or water body in the rear lawn; terrace rain to the front.
- **P7:** master toilet geyser inside, cleanout on the WC run, access panel at the bath, DT-1 branch in a wall chase with a valve.
- **P8:** SS-3 in a boxed duct.
- **P9 / P10:** front balcony RWP to the RWH; rear balcony spout to the lawn.

**Assumptions:** the E and W walls are treated as party walls; the municipal connection is at the front road; the OTS is large enough for SS-1, DT-1, R-1 and IC-2.

## Appendix C — Electrical Layout Rev A (sheet 2, condensed)

**Point schedule per room (A):**

| Room | Lights | Fan | 6 A | 16 A | AC | Geyser | EF | TV / data | Remarks |
|---|---|---|---|---|---|---|---|---|---|
| GF drawing / dining | 4 + pendant | 1 | 2 | — | 1 (2 TR) | — | — | TV + data | TV & AC on the W wall; 2-way switches at both ends; smoke detector |
| GF kitchen | 2 + under-cabinet | — | 1 + chimney | 3 | — | — | 1 | — | Hob on the E wall; EF on the rear wall; MW, DW, fridge on 16 A; heat detector |
| GF toilet | 2 | — | 1 | — | — | 1 | 1 | — | EF on the OTS wall; socket ≥ 600 mm from the basin (RCD); switchboard outside |
| GF lobby / stair / panel room | 2 | — | — | — | — | — | — | rack | 2-way stair switching; inverter + battery + network rack; smoke detector |
| GF guest room | 2 | 1 | 3 | — | 1 (1.5 TR) | — | — | TV | AC on the N wall, ODU on the front lawn; TV on the W wall; 2-way both sides |
| GF foyer | 2 | — | — | — | — | — | — | — | VDP screen; outdoor VDP at the gate |
| GF study | 2 | 1 | 2 + UPS | — | 1 (1.5 TR) | — | — | data | Desk on the E wall; sockets, data and UPS at the desk |
| External / parking | 8 garden + 2 gate | — | 1 IP65 | — | — | — | — | 2 CCTV | Rear CCTV; irrigation pump point; EV 32 A; meter at the gate |
| FF master bedroom | 3 | 1 | 3 + 2 USB | — | 1 (2 TR) | — | — | TV | Headboard on the W wall; 2-way both sides; AC moved to the W wall |
| FF master toilet | 2 | — | 1 | — | — | 1 | 1 | — | Switchboard outside; geyser high on the rear wall |
| FF dresser | 1 + mirror | — | 1 | — | — | — | — | — | DB-2 on the E wall, stacked over DB-1 |
| FF centre toilet | 1 + mirror | — | — | — | — | 1 | 1 | — | EF on the OTS wall; switchboard outside in the lobby |
| FF lobby / stair | 2 | — | — | — | — | — | — | — | 2-way stair switching; smoke detector |
| FF bedroom 2 | 2 | 1 | 3 | — | 1 (1.5 TR) | — | — | TV + data | Confirm the ODU route (E wall may be a party wall) |
| FF toilet (WNW) | 1 | — | — | — | — | 1 | 1 | — | EF on the external W wall; geyser on the inner wall |
| FF bedroom 3 | 2 | 1 | 3 | — | 1 (1.5 TR) | — | — | TV | Headboard on the W wall; 2-way both sides |
| FF balconies | 3 + 1 wall | — | 2 IP65 | — | — | — | — | — | Weatherproof fittings |
| Terrace | 2 | — | 1 IP65 | — | — | — | — | — | ODU zone S / SW; pressure pump; solar inverter; spare conduit to the main panel |

**Circuits (B):**

| Circuit | Use | MCB | Cable (Cu, FRLS) |
|---|---|---|---|
| L1–L4 | Lighting + fans, ≤ ~10 points each | 6 / 10 A | 1.5 sq mm |
| S1–S4 | 6 A sockets by area, 30 mA RCD | 16 A | 2.5 sq mm |
| P1–P3 | Kitchen 16 A appliances | 20 A | 4 sq mm |
| G1–G4 | Geysers | 20 A | 4 sq mm |
| AC1–AC6 | ACs | 20 A (2 TR: 25 A) | 4 sq mm |
| EV / LIFT (3-phase) / PUMP | As per maker | As per maker | As per maker |
| UPS | Lights, fans, router, CCTV, study | 16 A | 2.5 sq mm |

**Load (C):**
- lighting + fans 1.8 kW
- sockets 3.0 kW
- kitchen 4.5 kW
- geysers 4 × 2.0 = 8.0 kW
- ACs 10.5 kW
- EV 7.4 kW
- lift 4.0 kW
- pumps 1.5 kW
- **Total:** about 41 kW connected; 20–25 kW maximum demand, so 3-phase.

**Clouds (D):**
- **A1:** rear lawn IP65, irrigation pump point, rear CCTV, ODU for the drawing-room AC.
- **A2:** drawing room TV and AC on the W wall; pendant; 2-way at both ends; smoke detector.
- **A3:** kitchen hob and chimney on the E wall; EF to the rear wall; fridge and DW points; heat detector; DB-1 in the SE.
- **A4:** GF toilet EF to the OTS wall; socket away from the basin; switchboard outside.
- **A5:** DB-1 out of the centre; 2-way stair switching; inverter + rack in the panel room; smoke detector.
- **A6:** guest room TV on the W wall; AC on the N wall with a front-lawn ODU; bedside points both sides.
- **A7:** study desk sockets, data and UPS on the E wall.
- **A8:** gate lights and outdoor VDP.
- **B1 / B9:** IP65 on the balconies.
- **B2:** master AC off the glazed wall; sockets / USB and 2-way both sides; smoke detector.
- **B3 / B4:** master toilet switchboard outside, geyser out of the splash zone; dresser mirror light; DB-2 over DB-1.
- **B5:** centre toilet EF on the OTS wall, mirror light, switchboard outside.
- **B6:** bedroom 2 ODU route to confirm.
- **B7:** WNW toilet EF and geyser swapped (EF on the external wall).
- **B8:** bedroom 3 sockets and 2-way both sides; smoke detector.

**Typical heights:** switchboard 1200, bedside 450, counter 1100, AC 2100, geyser 1800 mm above FFL.
**Protection:** 30 mA RCD on socket, wet, outdoor and EV circuits; SPD at the main panel; at least 2 earth pits plus a lift earth.

**Note on room names:** the sheet's FF "Bedroom 2" is R1's FF-BD3 (Bedroom 3, east side); the sheet's "Bedroom 3" is R1's kids room; the sheet's "Centre toilet" is R1's Bedroom 3 Toilet; the sheet's "Toilet (WNW)" is R1's kids toilet.

## Appendix D — Key coordinates in R1 (mm)

**GF rooms** (bounding boxes, x0–x1 × y0–y1):
- Kitchen 230–3150 × 5665–11365
- Family Lounge 3300–9151 × 5665–8500
- Dining 3300–9151 × 8500–11365
- Lobby 4350–7200 × 10766–17196
- Toilet 230–4200 × 11515–13916
- Guest Room 230–4216 × 14066–19106
- Foyer 3229–5902 × 17375–20290
- Guest Lounge / Study 6080–9151 × 15274–19716
- Under-stair 6080–9151 × 12865–15124
- Lift 7350–9151 × 10916–12715
- OTS −435–731 × 10751–12665

**GF outdoor areas:**
- back lawn 230–9151 × 200–2814
- deck 230–9151 × 2814–5515 (pergola posts at y 2964, x 2489 / 4659 / 6830 / 9001)
- front lawn 230–3237 × 20153–21975
- entrance court 230–5900 × 19257–21975
- parking 6080–9151 × 19896–22276

**FF rooms:**
- Master Bedroom 3143–9151 × 5665–10669
- Dresser 230–2993 × 5665–8605
- Master Washroom 230–2993 × 8755–10669
- Balcony 5349–9151 × 4575–6655
- Bedroom 3 Toilet 1031–4269 × 10849–12813
- Lobby 4419–7198 × 10849–15306
- Bedroom 3 230–4269 × 12964–20006
- Kids Room 4371–9151 × 15456–21217
- Kids Toilet 6048–9151 × 15305–16805

**SF rooms:**
- Lobby 4419–7198 × 10849–15306
- Servant Washroom 1031–2268 × 10849–12813
- Store 2418–4269 × 10849–12813
- Servant Room 230–4269 × 12963–15306
- Back Terrace + Utility 230–9151 × 5665–10669
- Front Terrace 230–9151 × 15305–21217

**Key items:**
- mandir GF-F25 (3525, 8350), rot 270
- tulsi GF-O09 (645, 1650), rot 270
- OHT SF-R01 (6300, 11600); solar SF-R02 (3000, 11500), both on the roof
- car GF-O07 (7615, 21945)
- DB-1 (250, 9451); DB-2 (2973, 5950); DB-3 (250, 13300); INV (8525, 12885); MTR (5000, 22290)
- SS-1 (450, 11100); SS-3 (8950, 15420); UGT (900, 21100); RWH (4500, 21400)

---

## Appendix E — Checklist for any change

1. **Understand the request.** Map it to the frame (R1: north = +y, east = −x). If it is ambiguous or conflicts with Vastu or the consultants' rules, ask one clear question with options.
2. **Pick the right place:**
   - main site → `build_house.py` (only if asked)
   - R1 → a patch in `build_r1.py`
   - visuals → `furniture.js`, `plans.py` symbol, `build.js` light
   - services → `e12_plumbing` / `e13_electrical`
3. **Rebuild and check everything:**
   - `build_r1.py`
   - `check_dims` for main and R1 (both PASS)
   - `check_services` (no FAIL; explain any new WARN)
   - `boq.py` and `html2pdf.mjs` (R1), so the materials schedule and the Materials view follow the change
   - `plans.py` for main and R1; main must be byte-identical unless the change was meant for it
4. **Build the viewer** (`npm run build`), render the affected views (day and dusk, walk and overview, phone if it's UI), and look at them.
5. **Update the records:** ASSUMPTIONS (row with the reasoning), CHANGE_REGISTER (if R1), README (if the workflow changed).
6. **Commit** with a descriptive message on `house-design-v1`, and **push**. Once the user approves, **merge into `main`**; GitHub Pages redeploys from `main` automatically.
7. **Report to the user:** what changed, where (feet-inches), why, any deviation or open question, with screenshots.
