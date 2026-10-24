# Asset licences

## `textures/` (current)
These are procedural PBR sets (colour, normal and roughness maps) made by `tools/gen_textures.py` for this project. They are released as **CC0**.

They stand in for the Poly Haven sets named in the brief. `polyhaven.com` was blocked by the network policy of the environment that built Phase 2.

| Set | Use | Tile size |
|---|---|---|
| marble_beige | Floors, Italian stone | 1.2 m |
| marble_white | Counters, backsplash | 1.2 m |
| walnut | Veneer, joinery | 0.8 m |
| walnut_fluted | Feature walls, 25 mm flutes | 0.6 m |
| plaster | Walls | 2.0 m |
| tile_matte_lg / tile_matte_dark | Washrooms, 1200 × 600 tiles | 1.2 m |
| vitrified | SF service rooms, 600 × 600 tiles | 1.2 m |
| deck_tile | Deck and terraces, 1200 × 200 tiles | 1.2 m |
| granite_flamed | Paving | 0.8 m |
| cobble | Parking and ramp | 1.0 m |
| grass | Lawns | 1.5 m |
| pebbles | OTS floor | 0.8 m |
| concrete | Roof | 2.0 m |

## `polyhaven/` (after running `tools/fetch_polyhaven.py`)
Poly Haven textures and HDRIs, all **CC0**: https://polyhaven.com/license.

The script records each asset's source URL in `textures/manifest.json`. These are the asset IDs:
- **Textures:** marble_01, wood_table_001, painted_plaster_wall, large_square_tiles, wood_floor_deck, granite_tile, cobblestone_floor_01, aerial_grass_rock, gravel_floor, concrete_wall_008.
- **HDRIs:** kloofendal_48d_partly_cloudy_puresky, venice_sunset, spruit_sunrise.

## Code dependencies
- three.js (MIT)
- Vite (MIT)

## 3D models

- `models/baleno.glb`: "2022 Maruti Suzuki Baleno" (https://sketchfab.com/3d-models/2022-maruti-suzuki-baleno-438c1b0c1a4e4732aa1a3cbb505d19e5) by BHP3D (https://sketchfab.com/BHP3D), licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Changes:
  - body paint recoloured to Grandeur Grey
  - meshes simplified to about 37% and compressed (meshopt)
  - textures resized and converted to WebP
  - stretched 5.3% lengthwise in the viewer to the published 3990 mm length
  The credit is shown in the viewer panel.
