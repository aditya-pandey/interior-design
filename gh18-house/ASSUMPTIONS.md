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
