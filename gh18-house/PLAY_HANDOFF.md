# GH-18 Play — handoff for the next agent

**Project:** turn the GH-18 3D home tour into a small, calm **free-roam world** at a new path, **`/play/`**, in the same repo.

**Status (31 Oct 2026):** brainstorm agreed with the user; **nothing implemented yet**. This document is the brief. Your job is to start building it in small, tested steps, show the user screenshots, and ask before big decisions.

**Read first:** `HANDOVER.md` in this folder. It describes the existing project in full (data model, tools, viewer, traps, how the user likes to work). This document only adds what is new for the Play project. If the two disagree about the existing code, trust the code, then `HANDOVER.md`.

---

## 0. Non-negotiable rules

1. **Do not break or change the existing sites.** `/`, `/withpainting/`, `/v1/` and `/v1/withpainting/` must look and behave exactly as they do now. Play code must never be imported by the existing tour's bundle.
2. **`/play/` is a separate page in the same repo and the same Vite project**, sharing the existing builders (`build.js`, `furniture.js`, `materials.js`, `geom.js`) by import. Don't copy-paste them.
3. **The model files stay the source of truth.** Play reads `house_r1.json` (the R1 layout is the current design). Do **not** add game-only data to `house.json` / `house_r1.json` or to `tools/build_*.py`. New data (street, interactions overrides, personal touches) goes in a **home pack** (§4.2).
4. **Branch:** work on a new branch **`play-v1`**, created from `house-design-v1`. Push there. Merge to `main` (the live site) **only when the user approves**. Note: `house-design-v1` holds F17 (the R1 drawing sheets), which the user has not yet approved for `main`; ask before merging anything.
5. **Quality bar is high** ("no compromise on quality"). Verify every step visually (headless screenshots, §7) before you report or push.
6. **Brainstorm / propose first for big choices; ask when ambiguous.** Small, reversible steps are fine to just do.
7. **Licences:** every new asset (model, texture, animation, music, sound) must be CC0 or CC-BY with the credit recorded in `assets/LICENSES.md` (and visible in the app for CC-BY). The Baleno is CC BY 4.0 (BHP3D); its credit must stay visible.
8. **Privacy** (§6): no personal data (names, photos, address) in the public build.

---

## 1. What we're making and for whom

- **Who it's for:** a gift. The house belongs to **Deepti Jain**. The user wants to show it to Deepti later ("she is basically sort of the best human I know"). The tone should be warm, calm and personal: **"a day at GH-18"**, not a game with goals or ways to fail.
  - The architect's drawings and the model's `meta.client` name Mr. Praveen Kumar Yadav as the client. Leave those documents as they are.
- **Reusable and scalable:** the user wants the engine to work for other houses later. Build it as **engine + home pack** (§4).
- **Better quality:** the visual quality should go up noticeably compared with the current tour (§5).
- **Setting:** the **real Gurugram street**: Celebrity Homes, Palam Vihar, Gurugram (a gated colony). A beach was floated but set aside; it could become a second "world" pack much later.

### The features the user asked for

| Feature | Notes |
|---|---|
| A human you walk around as | Animated character, walk / run, collisions, stairs |
| Drive the Baleno parked in front | Get in / out, simple car physics, a loop road around the block |
| Sit in chairs | Kitchen / dining chairs, sofas, the front-lawn seating, etc. |
| Play radio music | A radio object; music gets louder as you approach |
| Lie on the terrace and watch the sunset | SF front-terrace loungers + time-of-day with a real sun path |

### Ideas from the brainstorm (proposed, not yet confirmed)

- **Arrival:** start on the street at late afternoon, walk through the gate past the Baleno, in through the curved glass foyer.
- **Interactions from the existing data:**
  - **Light switches:** `services.electrical` already has every switch / light point and its circuit (points like `{id, kind: 'light', room, at: [x, y, z], circuit}`), so switches can toggle the right lights.
  - **Doors:** every opening has `hinge` and `swing`, so doors can open and close.
  - Fans spin, the TV turns on, the hob / chimney, taps (optional).
- **Dusk moments:** the mandir (`mandir_open`, family lounge NE) and the tulsi diyas (`tulsi_platform`, back garden) glow at dusk; interior lights come on.
- **Personal touches (private build only, §6):** her name on the gate plate, a welcome note on the foyer console, framed photos the user supplies, a playlist she likes.
- **Festive mode:** Diwali lights on the parapets, diyas.
- **Photo mode:** hide the UI, free camera, save a PNG.
- **Ambient sound:** birds (morning), distant traffic, temple bell at dusk, fans inside.

### Open questions — ask the user at the start

The user has not answered these yet. Ask them in one short message (they often reply from a phone). Use the defaults below if they say "your call".

1. **Which moments matter most to Deepti?** (music, the sunset, the mandir at dusk, driving…) → decides priorities. *Default: sunset from the terrace + sitting + radio first.*
2. **Phone or laptop?** *Default: both; laptop is the main target, it must stay usable on a mid-range phone.*
3. **Public but unlisted, or password-protected?** *Default: unlisted + `noindex`, personal touches only in a private build (§6).*
4. **Third person (you see a character she can dress up) or first person?** *Default: third person, with a key to switch to first person. Stylised character, **not** a likeness of her face.*

---

## 2. What already exists that you'll build on

(Details in `HANDOVER.md` §4 and §6.)

- **Model:** `gh18-house/house_r1.json` (generated by `tools/build_r1.py`; never hand-edit). Units mm. Plan frame: **north = +y (road side)**, **east = −x**, left wall is the GH-17 party wall, right wall GH-19. Levels: GF FFL +450, FF +3750, SF +7050, roof +10350 (mm above natural ground).
- **Viewer:** `gh18-house/viewer/` — Vite 5.4.11 + three 0.170.0, no other runtime deps.
  - World mapping (`src/build.js`): **plan (x, y) mm → world X = x/1000, Z = y/1000, Y = z/1000 up.** So north = +Z.
  - `src/walk.js`: an existing **first-person walker** (PointerLockControls, WASD + touch joystick, 1.6 m eye height, wall / furniture collision via 2D polygons, floor following incl. stairs from `data.colliders` / `data.surfaces`). Reuse its collision + floor-height logic as the starting point for the character controller.
  - `src/build.js`: builds walls, openings, slabs, rooms, furniture (`furniture.js` builders per `type`), batches meshes per `floor|cat|mat`; light positions per room.
  - `src/main.js`: scene, sky, sun (DirectionalLight with shadows), presets, views (services, materials), glTF loading (`loadModels()`, GLTFLoader + MeshoptDecoder), `window.viewer` API for headless control.
  - Pages are produced by the `extraPages` plugin in `vite.config.js` (copies of `index.html` with a `<base>` + flags). **For `/play/` use a real second entry instead** (§4.1), because it is a different app.
  - Privacy: `PUBLIC_BUILD=1` strips `meta.client` / `meta.source` from the JSON in the hosted build.
- **Car:** `assets/models/baleno.glb` (meshopt-compressed, 262k triangles, CC BY 4.0, credit required). It is placed by a `car_model` furniture item in the GF parking.
- **Textures:** procedural CC0 PBR sets (`tools/gen_textures.py`), because polyhaven.com was blocked in the old sandbox. `tools/fetch_polyhaven.py` swaps in real Poly Haven sets where the network allows.
- **Furniture types in R1 you can give "affordances" to:**
  - **Sit:** `dining_chair` (6, GF dining), `sofa`, `sofa_l`, `settee`, `accent_chair`, `lounge_chair` (GF 2, FF 5), `study_chair`, `chair` (SF 5), `pouf`, `bean_bag`, `outdoor_sofa` (GF), `bed_*` edges.
  - **Lie:** `lounger` (SF 2, front terrace — the sunset spot), `bed_king`, `bed_queen`, `bed_single`.
  - **Use:** `tv_unit` (TV on/off), `hob`, `hood`, `mandir_open` (light a diya), `tulsi_platform` (diya), `washer_dryer`, `sink`, `vanity`.
  - **Drive:** `car_model`.
  - Furniture items carry `id`, `room`, `type`, `pos` (mm), `size` (mm), `rot` (deg; local +y is the front; front vector = (−sin rot, cos rot)) and, for seating, `seats`. Check `furniture.js` and `HANDOVER.md` §4.5 for details.
- **Headless rendering recipe:** `HANDOVER.md` §9 (SwiftShader flags, the Playwright workaround, `?headless` + `window.viewer.ready`).

---

## 3. Recommended technology (check, then decide)

| Need | Recommendation | Notes |
|---|---|---|
| Physics (character, car, colliders) | **Rapier** (`@dimforge/rapier3d-compat`, WASM, Apache-2.0) | Has a kinematic character controller and a raycast vehicle controller. Build colliders from walls / slabs / stairs / furniture in the model. Lazy-load it only on `/play/`. |
| Character | Rigged glTF, **CC0**: e.g. Quaternius (Universal Animation Library / modular characters), Kenney | Needs idle, walk, run, sit, lie, (drive). Avoid assets whose licence forbids redistributing the raw file (the repo is public). |
| Animation | three.js `AnimationMixer`, crossfades; a small state machine | |
| Sun path | Implement the NOAA / SunCalc formulas (or the `suncalc` npm, BSD-2) | Palam Vihar ≈ **28.51° N, 77.04° E** (verify). Map azimuth with north = +Z, east = −X. Drive the existing sun light + sky + exposure from time of day. |
| Sky / atmosphere | three.js `Sky` (examples/jsm) or a physically based sky, plus night (stars, moon) | |
| Audio | Web Audio via three.js `AudioListener` / `PositionalAudio` | Start only after a user gesture. Music: CC0 / CC-BY tracks bundled in the repo, credited. **No live internet radio** (licensing, CORS, reliability). |
| Asset compression | glTF + meshopt (already used) or Draco; textures **KTX2** (Basis) | `gltf-transform` CLI. Keep every asset in the licence manifest. |
| Lighting quality | Baked lightmaps / light probes for interiors, cascaded or tuned shadows, AgX / ACES tone mapping, SSAO, mild bloom | WebGL2 first; WebGPU renderer is optional later. |
| UI | Plain DOM overlays (as the tour does), touch controls for phones | |

Network caveat: the old sandbox blocked polyhaven.com, sketchfab.com and CDNs. Check what your environment can reach (`npm install` from the registry should work; test it). If an asset site is blocked, ask the user to download and upload it (they did this for the Baleno).

---

## 4. Architecture

### 4.1 Where the code goes

```
gh18-house/
  packs/gh18/                 HOME PACK #1 (data + assets specific to this house)
    world.json                street, neighbours, trees, road loop, spawn point, sun location, time defaults
    interactions.json         optional overrides (e.g. which sofa seats exist, radio position, extra props)
    private/                  personal touches: GIT-IGNORED; see §6
  viewer/
    play/index.html           second Vite entry -> dist/play/index.html (add to build.rollupOptions.input)
    src/play/                 Play app
      main.js                 boot: load pack + house_r1.json, build house with the shared builders, start engine
      engine/                 house-agnostic: physics, character, camera, interaction, vehicle, time-of-day, audio, ui
      world/                  procedural street / neighbours / trees from world.json
```

- `vite.config.js`: add `play/index.html` as a second input. Keep the existing `extraPages` plugin untouched. Make sure the main tour's chunk graph does not import anything from `src/play/` (check the built `dist/assets` names / sizes before and after).
- Expose a **`window.play` API** for headless tests (like `window.viewer`): `ready`, `setTime(hh, mm, dateISO)`, `teleport(x_mm, y_mm, floor)`, `sit(furnitureId)`, `lie(furnitureId)`, `enterCar()`, `radio(on)`, `photo()`, `settle(seconds)`.

### 4.2 Engine vs home pack

- **Engine** knows nothing about GH-18. Given a house model (`house*.json` schema) and a pack, it builds the world, colliders and interactions.
- **Affordances are by furniture `type`** (a registry in the engine: `type -> {sit: [seat offsets], lie: [...], use: handler}`), so any house in the same schema gets sit / lie / use automatically. A pack can override or add.
- **The street is data:** `world.json` describes road width and loop, plot frontage, neighbour plots (width, depth, floors, setback, facade style seed), trees, streetlights, parked cars, the society gate. A generator turns it into geometry. Celebrity Homes' real layout isn't in the repo: start with a plausible row of plots (same frontage as GH-18, 9381 mm wide, road on the north / +y side beyond the ramp), then ask the user for a map screenshot or photos to make it truer.
- **Neighbours are low-cost massing** with a few facade variations and LODs, not detailed houses.

---

## 5. Quality: where the real gains are (in order)

1. **Furniture models.** Most pieces are procedural boxes today. Swapping key pieces (sofas, chairs, beds, dining set, loungers, kitchen) for good CC0 models is the biggest visible jump. Keep the procedural builders as fallback and keep sizes from the model.
2. **Materials.** Real CC0 PBR textures (Poly Haven / ambientCG if reachable) for wood, marble, fabric, tiles.
3. **Lighting.** Interiors need bounce light: baked lightmaps or probes; better shadows; correct exposure across the day; night lighting from the real light points in `services.electrical`.
4. **The character** and its animation blending.
5. **Performance budgets:**
   - **Laptop:** 60 fps.
   - **Mid-range phone:** at least 30 fps, with an automatic low-quality tier (the tour already has a `LOW` flag).
   - **Loading:** first meaningful frame in a few seconds with a progress screen, lazy-load audio and the street.

---

## 6. Privacy (important)

- The hosted sites are public. A walkable copy of a real home, with its layout, address and the owner's name or photos, needs care.
- **Public `/play/`:** no names, no photos, no address text. Keep the `PUBLIC_BUILD` stripping. Add `<meta name="robots" content="noindex">`. Don't link `/play/` from the existing tour unless the user asks.
- **Personal touches** (name plate, welcome note, photos, playlist) live in `packs/gh18/private/`, which is **git-ignored**, and load only if present (a local / private build). Ask the user how they want to share the private version (e.g. a local build they open, or a password-protected host). Never commit her photos or personal data.
- **Character:** stylised and customisable (hair, clothes, colours). Don't model her real face.

---

## 7. How to test (do this every step)

- **Build:** `cd gh18-house/viewer && npm run build` must pass, and the existing pages must be unchanged.
- **Regression check:** before your first change, take screenshots of `/`, `/v1/` and one walk pose with the existing recipe (`HANDOVER.md` §9). Re-take them after each merge-ready step and compare.
- **Play screenshots:** add `viewer/scripts/play_shots.mjs` (commit it) that serves `dist` with `vite preview`, opens `/play/?headless`, waits for `window.play.ready`, and captures a fixed set of poses:
  - street arrival
  - foyer
  - sitting at the dining table
  - lying on the SF lounger at sunset
  - inside the car
  - night with lights on
- **SwiftShader is slow:** use about 800 × 500 viewports for headless shots (1280 × 800 timed out before).
- **Performance:** log fps / draw calls / triangle count in `?debug`. Ask the user to try it on their phone; give them the URL and what to try.
- **Playwright trap:** the repo pins `playwright 1.48.2`, which can't find a browser in the cloud sandbox. Temporarily move `viewer/node_modules/playwright` aside and use the global install (`/opt/node22/lib/node_modules/playwright/index.mjs`), then **move it back**.

---

## 8. Suggested phases (each ends with screenshots and a short report to the user)

| Phase | Scope | Done when |
|---|---|---|
| **P0 Scaffold** | Ask the 4 open questions. Branch `play-v1`. `/play/` entry that builds the R1 house with the shared builders, the pack loader, `window.play`, `play_shots.mjs`. | `/play/` renders the house; existing pages unchanged; build + shots pass. |
| **P1 Walk and sit** | Rapier colliders from the model; third-person character with idle / walk / run, stairs, camera; interaction prompts; sit and lie from the affordance registry. | You can walk from the gate to the SF terrace and sit / lie on every listed seat without clipping. |
| **P2 Time and sound** | Real sun path + sky + night; interior lights from `services.electrical` at dusk; mandir and tulsi glow; radio with positional music; ambient sounds. | Sunset from the SF lounger looks right (direction checked as below); radio works on a phone after a tap. |
| **P3 The street** | `world.json` + generator: road loop, neighbours, trees, streetlights, gate; LODs. | Arrival shot looks like a believable Gurugram colony street; fps budget holds. |
| **P4 Drive** | Enter / exit the Baleno, raycast vehicle, gate opens, drive the loop, park again. | Drive out and back without falling through or getting stuck. |
| **P5 Quality pass** | Furniture models, real textures, baked / probe lighting, post-processing, loading screen, low-quality tier. | Side-by-side screenshots show a clear jump; phone stays ≥ 30 fps. |
| **P6 Personal + polish** | Private pack (name plate, note, photos, playlist), festive mode, photo mode, credits screen. | User reviews a private build. |

On the sunset direction: west is **+x** in the plan frame (east is −x), so in the world the sun sets towards **+X**. Verify with a screenshot at a known time (e.g. 31 Oct, sunset ≈ 17:35 IST, azimuth ≈ 254°, i.e. west-south-west).

---

## 9. Working with the user

- Non-technical, precise about the home, often on a phone, sometimes Hinglish. Values quality, seeing results (screenshots), and the existing version kept intact.
- Process: propose → they say "go ahead" → build in steps → short report with screenshots, what changed, where, any deviation or question. Don't bury caveats.
- They can run things locally (`npm run dev`) if that saves time.
- See `HANDOVER.md` §10 for more.

---

## 10. Starter prompt for the next session (copy-paste)

> You are picking up the GH-18 project in the repo `aditya-pandey/interior-design`. Read `gh18-house/PLAY_HANDOFF.md` first, then `gh18-house/HANDOVER.md`. We are building `/play/`, a free-roam version of the house (walk as a character, sit, lie on the terrace and watch the sunset, play radio music, drive the Baleno, on a real Gurugram street) as a gift for the owner. Follow the rules in §0 of PLAY_HANDOFF.md: don't change the existing sites, work on branch `play-v1` from `house-design-v1`, verify with screenshots, ask before big decisions. Start with phase P0: ask me the four open questions in §1, then scaffold `/play/`.
