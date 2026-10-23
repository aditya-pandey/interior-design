# GH-18 house model

To-scale model of GH-18, Celebrity Homes, Palam Vihar, Gurugram (client: Mr. Praveen Kumar Yadav), built from the architect's GF/FF plan, plus a proposed second floor.

**`house.json` is the single source of truth.** The plans, the dimension check, and later the 3D viewer and the Blender renders are all generated from it.

## Status

| Phase | State |
|---|---|
| 1. Data model + 2D plans | done, awaiting review |
| 2. three.js viewer (`viewer/`) | not started |
| 3. Blender renders (`render/`, `renders/`) | not started |

## Layout

```
house.json          walls, openings, rooms, outdoor areas, stair, slabs, furniture (mm)
ASSUMPTIONS.md      every guess, deviation from the drawing and brief change
plans/              GF.svg, FF.svg, SF.svg + check_report.txt (generated)
inputs/             architect's PDF, 300 dpi raster, reference PNGs, pdf_dims.json
tools/              houselib.py (geometry), plans.py, check_dims.py, pdf_extract.py
viewer/ render/ renders/ assets/   phases 2 and 3
```

## Regenerate

Python 3.9+, standard library only:

```bash
python3 tools/check_dims.py   # house.json vs every PDF dimension string -> plans/check_report.txt
python3 tools/plans.py        # plans/GF.svg, FF.svg, SF.svg
```

`tools/pdf_extract.py` re-reads the dimension strings from the PDF into `inputs/pdf_dims.json`. It needs `pip install pdfplumber`, and only has to run if the PDF changes.

## house.json conventions

- **Units and origin.** Units are mm. The origin is the rear-left outer corner of the plot.
  - `x`: across the plot, left to right as the plan is drawn.
  - `y`: from the back lawn toward the street.
  - `z`: up from natural ground.
- **Levels.** `levels` holds the finished floor heights (GF +450, FF +3750, SF +7050).
- **Walls.** A wall is either a centreline `a → b` or an `arc` (`c`, `r`, `from`/`to` in degrees), with thickness `t`.
  - `kind`: external, internal, lift, shaft, boundary, parapet, glass_wall, glass_partition, glass_railing, railing, screen.
  - `status`: existing, new or proposed.
  - Optional `h` and `base` override the floor's clear height.
- **Openings** live inside their wall:
  - `offset` is measured along the wall from `a`.
  - `width`, `height` and `sill` follow the schedule.
  - `hinge` is `a` or `b`.
  - `swing` is the world direction the leaf opens into (`+x`, `-y`, …).
  - Move a wall and its doors and windows move with it.
- **Rooms.** Rooms are explicit polygons, carrying finishes and ceiling data. **If you move a wall, update the polygons of the rooms it bounds as well.** `check_dims.py` will flag anything that drifts from the PDF.
- **Furniture.** Each piece has a `pos` (centre), `size` `[w, d, h]`, `rot` in degrees and an optional `z`. The piece's local +y is its front:
  - `rot` 0 faces the street
  - `rot` 180 faces the lawn
  - `rot` 90 faces −x
  - `rot` 270 faces +x
