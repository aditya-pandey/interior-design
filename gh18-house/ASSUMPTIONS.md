# GH-18 — Assumptions, deviations and brief changes

Phase 1 record. Every guess, every deviation from the architect's drawing, and every brief change applied in `house.json`.
IDs (A-xx, B-xx) are referenced from notes inside `house.json`. Units are mm.

**Status legend:** **VERIFY** = please confirm on site or with the architect. **DECIDE** = your call; I picked a default.

---

## Questions for you (from the items below)

1. **Facing direction (A-02).** The brief left this blank, so I assumed the entrance faces **East**. This only affects the north arrow, sun studies and the vastu note in B-01.
2. **Foyer entry door (A-15).** The PDF shows no external door into the foyer. I added a 1200 frameless pivot door in the curved glass, reached from the parking through the glass gate. Is that how the house is entered?
3. **Balcony (B-06).** I kept the FF balcony instead of merging it into the master bedroom. Merge it?
4. **Mandir wall (B-01).** The mandir is on the wall facing the door, as the brief asks. Under the East assumption that is the north wall, so the deity faces south. If vastu matters, I would move it to the rear (west) wall so the deity faces east.
5. **Parking (A-24).** The bay inside the plot is only 2.38 m deep. Is the car meant to stand partly on the ramp?
6. **Kids room vs bedroom 3 (B-05).** I used the front-left room for the kids. Swap?

---

## A. Reading the PDF

**A-01 · Source and scale.** The PDF is a vector print, marked "SCALE: NTS". I read the dimension strings and the wall geometry straight from the vector layer, not from a raster trace. Scale: **28.53 mm per PDF point**, calibrated on the 2921 + 6000 interior width, the 4000 guest room and the 5100 drawing-room depth. All three agree within 0.1 %. The 300 dpi raster (`inputs/GH-18_plan_300dpi_rotated.png`) was used only to read the drawing visually. `tools/pdf_extract.py` re-extracts all 51 dimension strings into `inputs/pdf_dims.json`.

**A-02 · Orientation and origin.** The page is stored rotated 270°. I read it with the back lawn at the top, which puts the GF on the left of the sheet and the FF on the right. Model frame:
- Origin: the rear-left outer corner of the plot.
- x runs across the plot (left to right as drawn).
- y runs from the rear boundary toward the street.
- z is height above natural ground.

**Entrance facing: assumed East** (DECIDE). The front (+y) is East, so North is +x, which is the right side of the plan.

**A-03 · Door and window schedule (re-read).** It matches the brief's list. The sill column the brief left out:
- **Sill 100:** GL-1, GL-2, GL-5, GL-7, GL-8, GL-9.
- **Sill 950:** GL-3, GL-4, GL-10.
- **Sill 0:** doors.
- **Lintels:** all 2400. GL-8 has none; D4 is "as per lift vendor".

The plan tags read "D-1, D-2…" and the schedule reads "D1, D2…". These are the same items.

**A-04 · Finishing schedule (re-read). The brief's copy was shifted by one row.** What the PDF actually says (floor / wall / ceiling):

| Location | Floor | Wall | Ceiling |
|---|---|---|---|
| Ramp & Ext. Courtyard | Cobble Stone | Granite Stone | – |
| Ext. Entrance Area | Granite Stone | Paint Finish | Paint Finish |
| Entrance Foyer & Lobby | Italian Stone | Veneer Cladding | Veneer Polished |
| Study Room | Italian Stone | Veneer Cladding | POP Painted |
| Guest Room | Italian Stone | Paint Finish | POP Painted |
| Guest Room Toilet | Tile | Tile | POP Painted |
| Drawing / Dining | Italian Stone | Veneer Cladding | POP Painted / Veneer / Glass |
| Kitchen | Italian Stone | Italian Stone | POP Painted |
| Backyard Lawn Sitting Area | Granite Stone | Paint Finish | – |

The two changes that matter: the **kitchen floor is Italian stone** (not granite), and the **guest room floor is Italian stone** (not tile). `house.json` uses the PDF values. The one exception is B-04.

**A-05 · Wall thicknesses.**
- **Two wall types.** The PDF draws existing structure in dark grey and new partitions in light grey. `house.json` tags each wall `existing` or `new`, and the plans keep that distinction.
- **Partitions are 150, not 115.** The PDF dimensions one as "150", and every light-grey wall measures 147–151.
- **Side walls modelled at 230.** The PDF draws them at 170–245, because the drawing is NTS.
- **Other walls, as drawn:**
  - rear glazing wall: 150
  - lift: 150
  - OTS: 300
  - curved foyer wall: 190
  - front piers: 300
  - main-door line and study wall: 180
  - FF band wall behind the lift: 180
  - rear boundary: 200
  - front boundary: 300

**A-06 · Left wall face (the three 30 mm differences in the check).** The PDF chains do not close with a straight left wall:
- Rear part: 2921 + 6000 = **8921**.
- Front part: 4000 + 150 + 2850 + 1950 = **8950**.

The drawing makes up the difference by drawing the left wall about 30 mm thinner along the toilet and guest room. I kept a straight 230 wall and the exact 8921. As a result:
- guest room and lower toilet: 3970 against 4000
- GL-1 jamb to jamb: 2700 against 2730
- FF kids room: 4039 against 4070

All are within the 50 mm tolerance. **VERIFY** on site. If those rooms really are 4000, the left wall there is about 200 thick.

**A-07 · Dimensions with no string in the PDF (derived from the scale, ±30 mm).**
- **Back lawn:** 5315 deep, from the boundary wall to the rear glazing line. The brief said about 5.4 m.
- **Plot:** 22276 from the rear boundary to the outer face of the front boundary. The brief said about 22.4 m.
- **OTS:** outer 1766 × 2513, 300 walls. It protrudes **735 mm beyond the left wall line** (A-13).
- **Parking:** 3070 wide × 2380 deep inside the plot.
- **Drain:** 300 (labelled in the PDF).
- **Ramp:** 1500, outside the plot.
- **Stair:** treads 250, flight width 1054, spine 150, landing 1252 × 2259.
- **GF piers:** pier between GL-1 and the foyer glass 300 × 1100. Main-door nib 50.
- **FF front pier blocks:** 300 deep.

**A-08 · Curves.** All curves were fitted to the PDF's vector arcs; the largest deviation is 3 mm.
- **Curved guest-room wall:** guest face R1526 (PDF string), foyer face R1716, centre (2690, 16969).
- **Foyer glass:** R5832.
- **Concentric with the foyer glass:** the step edge (R6045) and the front-lawn edge (R7476).
- **FF GL-9 window:** R11044. Its arc length is 4096, against 4100 in the schedule.
- **FF front pier wall with GL-10:** R9344.
- **GL-8 balcony railing:** an S-curve of two arcs, R3802 and R3710. Total length 3968, against 3975 in the schedule.

**A-09 · Stair.** The PDF shows a **dog-leg running across the plot width, directly below the lift**. The brief said "running toward the front". Details:
- The first flight leaves the lobby going right, then turns at a landing against the right wall. The second flight returns to the left.
- Each flight has 8 treads × 250 as drawn. With 3300 floor to floor, that gives 2 × 9 risers of **183.3 mm**. That is within the 190 mm residential limit but on the steep side. **VERIFY** the existing riser count.
- The same core repeats from FF to SF.

**A-10 · Electrical panel and janitor.**
- **Location:** under the second flight, 3070 × 1054, plus the space under the landing, giving an L-shape of 4.7 m².
- **Size difference:** the brief's 3.1 × 1.4 includes the 300 joinery strip on the study side, which the PDF hatches as joinery.
- **Headroom:** about 2.9 m at the door, dropping to about 1.4 m under the landing.

**A-11 · FF lift-shaft rear wall (VERIFY).** The FF drawing places the wall behind the lift (the "band wall") 66–97 mm further back than the GF lift wall:
- FF lift block depth: 2015 (PDF)
- GF lift block depth: 2100 (PDF)

Both floors are modelled exactly as drawn, so both PDF strings pass. A real shaft is one vertical box, so one of the two drawings is wrong. Check against the lift vendor's shaft drawing.

**A-12 · FF lobby wall.** The FF lobby west partition sits 69 mm to the right of the GF one. That matches the FF 2780 lobby width against the GF 2850. These are non-structural partitions, so both are kept as drawn.

**A-13 · OTS beyond the boundary line.** As drawn, the OTS shaft sticks out 735 mm past the outer face of the left wall, so the plot origin is not its outer corner. It is probably a shaft shared with the neighbour. **VERIFY.**

**A-14 · Main door D-1.**
- Opening: 1450 double leaf in the 1550 lobby width, with 50 nibs on each side.
- Swing: into the lobby, as drawn.

**A-15 · Foyer entry (DECIDE).** The foyer's only outside face is the curved glass, and the PDF shows no door in it. I added **GD-1**, a 1200 × 2400 frameless pivot door near the study wall.
- **Route in:** street → ramp → parking → glass gate GS-1 → granite entrance court → GD-1 → foyer → D-1 → lobby.
- **Step:** one 150 step along the glass, following the PDF's R6045 arc.

**A-16 · GS-1.** The PDF draws a cyan glazed element between the parking and the entrance court, but leaves it out of the schedule. I modelled it as a 2100-high glass screen with a 1000 gate. **VERIFY.**

**A-17 · GL-9 height conflict.** The schedule gives GL-9 as 4100 × **2400**, sill 100, lintel 2400. A 100 sill plus a 2400 window ends at 2500, which overshoots the lintel. I modelled 2300 high (head at 2400) to match every other opening.

**A-18 · Opening widths against the room dimensions.** Some brief figures are room or jamb dimensions, not glass sizes:
- **GL-1:** the 2730 in the brief is jamb to jamb; the glass is 2400.
- **GL-2:** the 3070 is the study width; the glass is 2770.
- **GL-5:** the 6000 is the room bay; the glass is 5700.

Openings in `house.json` use the schedule sizes, centred on the drawn glass.

**A-19 · Levels** (the PDF gives none, so these follow the brief).

| Level | Height (mm) |
|---|---|
| Natural ground | 0 |
| GF finished floor (plinth) | +450 |
| FF finished floor | +3750 |
| SF finished floor | +7050 |
| SF roof | +10350 |

- **Slabs and ceilings:** slab 300 including finishes, clear height 3000. False ceilings are POP at 2750, or 2600 in wet areas.
- **Outdoor levels:** the back deck, utility corner and entrance court are at +300, one 150 step below the house. The lawns and parking are at 0.
- **Heights above floor:** parapet 1050 and boundary walls 1500.

**A-20 · Study joinery strip.** The PDF hatches a 300 strip between the janitor and the study. I modelled it as a 150 partition, 15124–15274. The 4590 study depth is measured from its janitor-side face, as in the PDF.

**A-21 · Shower partitions.**
- **Glass doors:** GL-6, GL-6a and GL-6b are drawn as full-length lines. I added a 700 glass door at the far end of each so the shower can be entered.
- **Master toilet:** the PDF draws a tub or tray against the left wall. Following the brief (glass shower partitions), I replaced it with a 900 × 1900 walk-in shower behind a glass partition.

**A-22 · Master wardrobe alcove.** The PDF hatch fills the whole 2056 × 1140 alcove. I modelled a 600-deep wardrobe and left the rest as alcove floor. If you want a walk-in, the full depth is there.

**A-23 · Kids room corner.** The brown triangle where GL-9 meets the kids room is modelled as a 450-high walnut **window seat**.

**A-24 · Parking is short (VERIFY).** Inside the plot the bay is 3070 wide × **2380 deep**. Even with the 1500 ramp it gives about 3.9 m, which only fits a hatchback (about 3.8 m). The FF bedroom cantilevers over most of the bay. The reference car in the plan is shown to scale.

**A-25 · Furniture placement.** Beds, the 6-seat dining table and the toilet fixtures follow the architect's drawn positions. Everything else is my layout, at Indian sizes:
- Queen bed: 1524 × 1981 mattress.
- King bed: 1829 × 1981 mattress.
- Single bed: 914 × 1905.
- Dining table: 1800 × 950, 6 chairs.

**A-26 · Ceiling types.** Rooms have POP with cove lighting, except:
- wet areas: POP at 2600, no cove
- lobby/foyer: "veneer polished" accents, per the PDF
- dining: a walnut raft over the table

---

## B. Brief changes applied

**B-01 · Mandir + Store replaces the Study (GF).**
- **No wall changes.** Door D-2 stays where it is, from the passage.
- **Mandir:** a backlit walnut jaali unit (1200 wide, 600 deep, warm LED strip behind) on the **wall facing the door** (the right wall), centred on the room.
- **Storage:** full-height storage cupboards (2 × 1620, 600 deep) flank the mandir along that long wall.
- **Also in the room:** a puja chowki and a rug. The GL-2 window stays.
- **Vastu (DECIDE):** under the East assumption the right wall is North, so the deity faces South. If vastu matters, the rear (west) wall gives an east-facing deity.

**B-02 · GF toilet and guest room kept as drawn.** No attached washroom was added to the guest room. The GF toilet remains the L-shaped 3170/4000 × 2400 room with the GL-6 shower partition and the GL-3 window into the OTS.

**B-03 · Utility and wash area outside the kitchen (proposed).**
- **Where:** a tiled (flamed granite) corner of the backyard, 2110 × 2700, directly outside GL-4.
- **Fittings:** a 2200 × 600 counter along the boundary wall, with a utility sink and an under-counter washing machine.
- **Screen:** a 1.8 m slatted wood screen separates it from the deck seating.
- **Access:** only through the deck, because GL-4 is a window over the kitchen counter. The maid route therefore passes through the drawing room. If that matters, a side door is not possible without losing counter run.

**B-04 · Back deck and pergola (proposed).**
- **Deck:** the first 2700 from the house outside GL-5 (6810 × 2700, +300). The rest of the backyard stays lawn (8920 × 2610).
- **Pergola:**
  - top at +3000 (2.7 m above the deck), which stays below the FF balcony soffit at about +3450
  - 4 posts, 150 square
  - rafters at 450 centres
- **Deck finish (deviation):** the PDF lists granite for the "lawn sitting area". The brief asks for wood-look deck tiles outside, so the deck uses **wood-look porcelain deck tiles** and the utility corner uses granite.

**B-05 · FF bedroom assignment (DECIDE).** The architect's layout is kept unchanged.
- **Master** = the rear suite with the **dresser** (dresser → toilet) and the balcony. King bed on the right wall, which carries the walnut fluted feature wall.
- **Kids room** = the **front-left** bedroom, the larger at about 4.0 × 5.5 m plus wardrobes, with the toilet reached through the wardrobe vestibule. It has room for a 2400 study desk with overhead storage on the right wall, wardrobes along the top, and a window seat. The front-right room's curved glass would make a desk awkward.
- **Bedroom 3** = the **front-right** bedroom with its own toilet, furnished as a standard bedroom. It has the drawn 4550 wardrobe wall, a queen bed, a dresser and a lounge chair.

**B-06 · Balcony not merged (DECIDE).** There is only one balcony, the curved one off the master bedroom. I kept it:
- Merging it means replacing the GL-8 glass railing with full-height curved glazing on a cantilever, and removing GL-7.
- That adds about 6.3 m² of awkward, tapering floor.
- It also removes the only FF outdoor space.

If you want it merged, it is a one-wall change in `house.json`: remove FF-W06/GL-7 and turn FF-W28/29 into a glass wall.

**B-07 · No store room. Storage provided instead:**
- **Master:** alcove wardrobe 2056 plus a second wardrobe 1127.
- **Dresser:** wardrobe 1962 plus a corner unit.
- **Kids room:** wardrobes 2038 + 897, plus overhead study storage and a storage bench.
- **Bedroom 3:** a 4550 wardrobe wall.
- **FF lobby:** a full-height cupboard, 1750 × 450, beside the lift.

**B-08 · Second floor (PROPOSED, not in the PDF).**
- **Core continues:** lift, stair (with a stair-cover roof above) and OTS.
- **Wet rooms stacked on the FF kids toilet**, so the plumbing stacks line up:
  - **Servant washroom:** 1240 × 1960, with a GL-3-type window into the OTS.
  - **Washing area:** 1850 × 1960, with a washer-dryer stack, a utility sink, a full-height cupboard with a pull-out ironing board, and an ironing counter.
- **Servant room:** 4040 × 2340, with a single bed, wardrobe, desk and a front window. It sits on the FF band of wardrobes and the kids room.
- **Lobby:** over the FF lobby, with glazed doors to both terraces.
- **Back terrace (covered):** over the master suite, 40 m², with a **polycarbonate canopy on a light steel frame** that falls from +3000 to +2600 toward the rear. The balcony below stays open to sky.
- **Front terrace (open):** over the kids room and bedroom 3, 42 m², 1050 parapet following the curved façade.

**A-30 · SF structure (VERIFY with a structural engineer).**
- **Extra storey:** the existing frame must be checked for the added load.
- **SF front wall:** it sits on the FF lobby wall only for x > 4270. Over the kids room it needs a beam.
- **Lift:** needs an overrun above the SF roof (MRL, about 1.5 m, per vendor).

**B-09 · Washrooms.** Wall-hung WCs with concealed cisterns (the GF one sits in the PDF's 150 ledge), floating vanities, glass shower partitions, and large-format matte tiles on floor and walls.

**B-10 · Finishes.** The PDF schedule (A-04) is the base, plus the brief's palette:
- **Floors:** light beige Italian marble in all living rooms and bedrooms.
- **Walls:** warm white by default.
- **Walnut fluted feature walls:** the foyer's study-side wall, the drawing room's right wall, and the wall behind the master bed.
- **Mandir/store and lobby:** veneer cladding, per the PDF.
- **Washrooms:** matte porcelain.
- **SF service rooms:** vitrified tile.
- **Terraces and deck:** wood-look deck tiles.

The BRIEF CHANGE tags on the plans mark B-01, B-03 and B-04.

---

## C. Phase 2: 3D viewer

**C-01 · Textures (deviation).** The brief asks for Poly Haven CC0 textures. `polyhaven.com`, `ambientcg.com`, jsDelivr and unpkg are all blocked by the network policy of the build environment. In their place:
- **Now:** `tools/gen_textures.py` makes procedural PBR sets (colour, normal and roughness). They are CC0 and can be regenerated.
- **Later:** run `tools/fetch_polyhaven.py` once on a machine with internet access. It downloads the named Poly Haven sets and HDRIs and switches the viewer over without code changes.

**C-02 · Sun and sky.**
- **Day:** late afternoon, sun azimuth 235° (south-west) at 34° elevation, which lights the back lawn and the drawing room.
- **Dusk:** sun 1.5° below the western horizon.
- **Orientation:** both follow the East-facing assumption (A-02).
- **Lighting:** the physical sky is the visible background. Image-based light comes from a neutral studio environment, because a blue sky dome would tint every interior wall.

**C-03 · Interior lights at dusk.**
- **Fixtures:** cove strips, a downlight grid of about 1.4 m in every POP ceiling, one warm 2700 K-look point light per room, the dining pendant and the mandir LED.
- **Brightness:** intensities are set to read correctly on screen, not taken from photometric data.

**C-04 · Furniture.** All furniture is parametric (built from bevelled and rounded boxes) from `house.json`. Detailed CC0 furniture models are planned for the Phase 3 renders.

**C-05 · Doors.** In the model, hinged doors are shown open at about 90° so walk mode can pass through. The lift doors are closed, and the GL-5 / GL-7 sliders are shown closed but are walkable.

**C-06 · Lift overrun.** A 1.5 m plastered box above the SF roof stands in for the overrun. The real size depends on the lift vendor (A-30).

**C-07 · Stair handrail.** A walnut handrail runs along the spine of each flight.

## D. Client feedback, round 1

The PDF dimensions these changes make obsolete are listed as `SUPER` in `plans/check_report.txt` rather than counted as mismatches.

**D-01 · Closed kitchen, dining moved (GF).**
- The kitchen is now a closed room. A new 150 mm wall stands on the PDF peninsula line, so the kitchen keeps its 2920 clear width.
- The layout is a U-shape: the sink under GL-4, the hob on the left run, and a new right run on the new wall. The peninsula and bar stools are gone.
- The 915 strip behind the kitchen is now its pantry.
- The door to the dining is KD-1, a 1000-wide sliding door in fluted glass, so no leaf swings into the kitchen.
- The drawing room keeps the lawn half, 5850 × 2840. Its width drops from 6000 to 5851 because of the new wall.
- The dining (6-seater) moves between the drawing room and the lobby, next to the kitchen door. The crockery unit sits in the niche between the kitchen and lobby walls.

**D-02 · Separate wash area (GF).**
- The rear-left corner outside the kitchen is now a walled wash area, 3070 × 2550, open to sky. It holds a utensil-wash sink, the washing machine and a drying rack.
- It is reached from the kitchen through a new door D3 in the rear wall. GL-4 moves 147 mm left to make room for it. A service gate (GT-1) opens to the back lawn.
- 2.1 m walls replace the slatted screen, and the deck and pergola now start at x 3450.
- *Option:* a polycarbonate canopy for monsoon use.

**D-03 · Kids-room toilet on the outer wall (FF).**
- The toilet of the front-right bedroom used to sit against the stair, with no outside wall. The side walls are taken as blind party walls.
- It is now in the front (east) corner. Window GL-10 is frosted and takes the exhaust fan.
- Size is 2130 × 2020 (4.2 m²): WC, vanity, and a walk-in shower behind a glass panel.
- *Check:* it sits over the parking and over the store end of the GF mandir room. The mandir itself is about 1.1 m away. Drainage runs down the right wall into the parking.

**D-04 · Kids room and bedroom 3 swapped (FF).**
- The front-right room, with the curved east glazing GL-9, is now the kids room.
- Its study desk runs along GL-9, so the child faces east while studying.
- The front-left room is now bedroom 3, with the former kids toilet (window GL-3 to the open-to-sky OTS).

**D-05 · The family's own paintings (FF).**
- **Textures:** made by `tools/prep_art.py` from the client's photos. The photos themselves stay out of the repo.
  - Each framed canvas is straightened from four corners read off its photo.
  - Glass glare is patched with nearby texture, and on the elephant with the mirror-symmetric side.
  - Frames are modelled in 3D, so the textures are canvas only.
  - The gallery-wall canvases are cut from the photo of the wall as hung (about 1.39 mm per px, set from the 20 × 20 and 30 × 40 cm canvases). The wooden elephant is cut out with transparency.
- **Assumed sizes** (not measured; tell us the real ones):
  - Buddha: 40 × 50 cm, black mat, gold frame.
  - Elephant: 75 × 40 cm, blue frame with a gilt lip.
  - Seven horses: 100 × 50 cm, dark carved frame with a gilt lip.
- **Placement:**
  - **Master bedroom:** the elephant over the bed on the fluted walnut wall; the Buddha on the wall between the lobby door and the bed.
  - **First-floor lobby:** the seven horses, facing you as you come up the stairs. Horses are traditionally kept out of bedrooms.
  - **Bedroom 3:** the whole gallery wall, about 2.0 × 1.4 m, over a low console and facing the bed. On /withpainting only, the console replaces the dresser and mirror, and the lounge chair moves (furniture `variant`).

**D-06 · The family's car in the parking bay.**
- **Model:** a 2022 Maruti Suzuki Baleno from Sketchfab, by BHP3D under CC BY 4.0.
- **Changes:**
  - recoloured from its dark blue to Grandeur Grey metallic with a clear-coat
  - simplified from 708k to 262k triangles and compressed to 3.7 MB
  - stretched 5.3% lengthwise to the published 3990 mm, keeping its native width, height and 620 mm wheels
- **Placement:** reversed in, so the nose faces the street. It replaces the generic 3.8 m scale car. The bay is still only 2.38 m deep inside the plot (A-24).

## E. Revision R1: owner changes of Oct 2026 (site: `/v1/`)

R1 is a separate version, so the main site stays as it is:
- **Files:** `house_r1.json` is generated by `tools/build_r1.py` as `house.json` plus one tagged patch per item below. Its plans are in `plans/r1/`.
- **URLs:** the viewer serves it at `/v1/` and `/v1/withpainting/`.

**Inputs:**
- the owner's 12-point change list
- the consultant drawings of Oct 2026: Vastu red-line register (18 items), Electrical Layout Rev A, Plumbing Layout Rev A

All three drawings are mark-ups on the architect's R0 plan, so their positions are taken as rules and re-applied to this model.

| Item | Change | Status |
|---|---|---|
| A1 | North is the road side, as in all three consultant drawings. The left side wall is east (party wall with GH-17); the right side is west (GH-19). This replaces the "entrance faces East" default of A-02. | done |
| A2 | Dimensions shown in feet-inches with metres in brackets. The model stays in mm. | done |
| B3 | Drawing room becomes a Family Lounge. The TV sits on the west (fluted walnut) wall and the L-sofa is turned to face it, with the chaise toward the lawn glass. The crockery unit moves to the kitchen wall. A hand-wash basin with mirror goes in the niche by the dining; it drains into the GF toilet line behind. | done |
| B4 | No construction outside: the wash yard's walls, gate and kitchen back door are removed, and GL-4 returns to its R0 position. The deck is paving only, full width, and the pergola returns to its original extent. The kitchen's north strip becomes a wash nook (double sink, drainer, dish-rack cabinet) with a vent window and exhaust into the OTS (KW-1). This puts the sink on the north side (red-line 7). The south counter becomes the prep counter; the hob stays on the east wall. | done |
| B5 | Mandir + Store becomes a Guest Lounge / Study: a desk on the east wall (user faces east), a 2-seater sofa facing a TV on the west wall, a settee (sethi) with bolsters on the south wall, coffee table and rug. | done |
| B6 | Small floating walnut mandir (600 × 350 × 1100 mm) in the NE corner of the guest room, on the east wall, with a backlit jaali, a brass diya and a niche light. The devotee faces east. | done |
| B7 | Under-stair storage: cupboards cut to the stair soffit, a low cupboard under the landing, and a ventilated inverter / battery / network rack. The store door now opens out to the lobby. DB-1 moves to a 400 mm enclosed cabinet beside the fridge tower on the kitchen east wall (SE zone). | done |
| C8 | The lobby cupboard by the lift becomes a 1.5 m stone pantry counter with wall cupboards above, kept 250 mm clear of the lift door. No sink. | done |
| C9 | D-03 reverted: the kids-room toilet returns beside the stair at its R0 size (plumbing SS-3, red-line 15), with its door, glass shower and fittings. The kids room is re-furnished around it. The D-04 room swap stays: the study desk along GL-9 now faces north (red-line 8). The four R0 toilet dimensions are measured again in R1 and pass. | done |
| C10 | Master suite: washroom and dresser swapped, owner's decision. **Washroom** (old dresser zone, 9'-1" × 6'-3"): 1700 × 750 bath tub with an over-tub shower screen; WC on the east wall by the OTS, so its soil goes to the OTS stack SS-1; basin on the south wall; vent window and exhaust into the OTS (FF-MW1). **Dresser** (old washroom zone, 9'-1" × 9'-8"): lit by GL-4, with the dressing mirror on the east wall (red-line 12), wardrobes and a window bench. Route: bedroom → dresser → washroom; the bedroom TV moves along the wall to clear the new door. **Hold point:** this conflicts with red-line 11. It needs a new sunken floor over the kitchen, with waterproofing and a flood test, and the SS-2 stack re-planned. For the architect and plumber. | done |
| D11 | Second-floor utility, open to the covered back terrace. A washer-dryer, utility sink counter, ironing counter and tall cupboard stand against the wall right outside the lobby door; they drain to the OTS stack SS-1 beside them. Two drying racks sit under the polycarbonate roof. The enclosed washing room becomes a linen / utility store. The servant washroom is unchanged. **Terrace zoning:** AC outdoor units on the rear parapet (S/SW), in the bays between the canopy posts (E13 later re-placed all the units: three here); the front terrace (N/NE) is kept open. The plumbing sheet put the overhead tank on a stand on the FF roof, which only works without a second floor. With the SF built, the 2000 L tank (south-west part of the roof, beside the lift overrun) and the solar water heater (south edge, facing south) go on the **SF roof**, so every floor, including the SF washroom, gets pressure without a booster pump. | done |
| E12 | **Plumbing** (Plumbing Layout Rev A, re-applied to the R1 layout) is stored as data in `house_r1.json` under `services.plumbing`: stacks, chambers and pipe runs, all in 3D with real falls. `tools/check_services.py` checks it against the sheet's own rules (`plans/r1/services_report.txt`: 97 pass, 1 warn). **Drainage:** SS-1 in the OTS takes the GF toilet, dining basin, master washroom, bedroom-3 toilet, SF washroom and SF utility. SS-3 in a boxed duct takes the kids toilet. SS-2 is dropped because the C10 master WC now sits by the OTS. The kitchen wash nook drains to a grease trap (GT-1) in the OTS, so nothing is left in the rear lawn: no IC-1, no pit (P1, P6). The sewer route is as in Rev A: IC-2 (OTS), sleeved under the GF toilet, lobby and foyer with sealed cleanouts CO-1/CO-2, then IC-3 (entrance court) and IC-5 (parking). SS-3 joins through IC-4. Only IC-5 goes to the municipal sewer. Nothing runs under the guest room or in the party walls. Falls are 10% steeper than the sheet's minimum: 150 mm sewer about 1:45 (min 1:60), 110 mm 1:36 (min 1:40). A shower over a tub drains through the tub waste. **Water:** a 5000 L UGT in the NE front lawn, 3.4 m from the sewer and 2.2 m from the RWH pit. The meter inlet does not cross the sewer. Pumped riser R-1 runs in the east-wall chase above floor level, then up the OTS to the 2000 L tank on the SF roof. DT-1 comes down the OTS with a branch to each wet area; DT-2 feeds the kids toilet. Solar hot water goes to the master washroom and the kitchen. **Rain:** four 100 mm RWPs on the front face go to the RWH pit in the entrance court; its overflow goes to the 300 mm storm drain, which takes no sewage. **Warn:** the tank base is only 1.45 m above the SF shower head, so the SF washroom needs a small pressure pump (the electrical sheet already has a terrace pump point). **3D:** pick *Services: Plumbing* (or press P, or pick *Services — plumbing* under View) on `/v1/`. The building turns to glass and the pipes show in colour, with tags and a legend; the floor buttons filter them too. Design intent only: sizing, invert levels and the sewer connection are for the licensed plumber. | done |
| E13 | **Electrical** (Electrical Layout Rev A, re-placed for R1) is stored as data in `house_r1.json` under `services.electrical`: 188 points, 43 circuits, conduit routes, sub-mains and AC refrigerant runs. `tools/check_services.py` checks it against the sheet's rules: point schedule row by row, switches at doors and outside wet rooms, exhausts, geysers out of the splash zone, sockets 0.6 m from water, bedside 2-way switches, AC routes, DB zones, detectors, circuit limits and RCDs, and load. Result: 170 pass, 2 warn. The report also prints the point schedule, the circuit list with MCB / cable / RCD / kW, and the AC routes (`plans/r1/services_report.txt`). **Changes from Rev A, forced by R1:** (1) DB-1 stays in the kitchen east-wall cabinet (SE). DB-2 cannot sit over it any more, because C10 put the master washroom there, so it moves to the dresser's west wall (still SE). DB-3 is added for the SF and terrace, on the servant-room east wall (**warn:** E zone, as there is no indoor SE space on the SF). (2) The E and W walls are party walls (A1), so no outdoor unit or exhaust is on them. Master bedroom: straight up to the back terrace. Family lounge: up the balcony's west wall to the back terrace. Bedroom 3: through its toilet ceiling and the OTS to the back terrace's SE corner, 14.3 m, draining via the OTS as the sheet says. Kids room and guest lounge: to the NW of the front terrace, against the stair wall (kids room straight up; guest lounge up the SS-3 duct). Guest room: front lawn, as in A6 (**warn:** NE zone; for the Vastu consultant). D11's four back-terrace units become three. (3) Kids-toilet exhaust: B7 put it on the W wall, which is the GH-19 party wall, so it becomes a ceiling fan ducted to the open front terrace above. (4) Bedroom-3 toilet (Rev A's centre toilet): its door now opens from bedroom 3, so its switches are in the bedroom niche. Master washroom: its door has wardrobes on both sides, so its switches are at the dresser door. Master geyser on the east wall, 2 m from the shower. (5) The kids-room TV sits in a niche in the wardrobe run, facing the bed. The guest-room AC is above GL-1 at 2.45 m (head 2.4 m). Bedside points are at 0.6 m (sheet 0.45 m), because the side tables are 0.5 m high. **Added:** wash-nook exhaust into the OTS (B4), pantry sockets and light (C8), smoke detectors in the guest room, guest lounge, lobbies and servant room, the SF rooms, the SF washroom pressure pump (from the E12 warning) and the lift isolator at the top landing. **Load:** 45.9 kW connected (sheet ~41 kW; the SF adds a geyser, a washer and a pump), about 25 kW maximum demand, so a 3-phase supply as the sheet says. **3D:** pick *Services: Electrical* (or press E, or pick *Services — electrical* under View). Symbols are colour-coded by type, conduit lines by circuit, sub-mains in black and refrigerant in cyan. The floor buttons show one floor at a time. Design intent only: cable sizes, load sanction and testing are for the licensed electrical contractor. | done |
| E14 | Change register: every consultant cloud (A1-A8, B1-B9, P1-P10), red-line item (1-18, T) and owner item (1-12) mapped to what R1 does with it | to do |
