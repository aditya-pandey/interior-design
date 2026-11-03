# The /play/ protagonist

A fictional Indian woman in her early thirties (not modelled on any real person), built with
[MPFB2](https://static.makehumancommunity.org/mpfb/docs.html) (MakeHuman for Blender; its assets and the
characters it makes are CC0).

- `common.py`: her body settings (MakeHuman macros: female, ~33, ~1.57 m, slim-average).
- `build.py`: builds her in headless Blender and exports `viewer/play/models/protagonist.glb`:
  a Mixamo-named skeleton (52 bones), the body, a teal knee-length kurta (cut from the body and MakeHuman's
  skirt helper), off-white churidar trousers (from the tights helper), brown eyes, lashes, and placeholder
  hair (a cap and a braid) until the MakeHuman asset pack is installed. `--fbx <file>` also writes one
  joined mesh for Mixamo's auto-rigger (`protagonist_for_mixamo.fbx`).

Run (Blender as a Python module, with MPFB2 installed as an extension):

    uv venv -p 3.13 bvenv && uv pip install -p bvenv/bin/python bpy
    # install mpfb2/src/mpfb into Blender's user extensions (see build notes in HANDOVER.md §6.8)
    bvenv/bin/python tools/character/build.py --fbx tools/character/protagonist_for_mixamo.fbx

Still needed (downloads, see HANDOVER.md): the MakeHuman system assets pack (hair, eyebrows, eyelashes,
skins) and Mixamo animations (made on `protagonist_for_mixamo.fbx`).
