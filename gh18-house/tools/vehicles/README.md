# Preparing the garage's models (and her figure)

`build.mjs` takes a Sketchfab glTF download and writes the game's copy into `viewer/play/models/`:
textures resized and converted to WebP, geometry compressed (meshopt), unused data pruned. Per model:

- `roma` (Ferrari Roma): its 984 parts flattened and joined by material (a few dozen draw calls), the wheel
  group kept apart (`WHEELS`) so the game can split it into four spinning wheels.
- `bike` (the bicycle): the grass mound and its flowers removed, the rest simplified to ~50k triangles.
- `vespa`: compressed as it is.
- `woman` (her figure): lighter for the game camera: the teeth and eyelashes removed (hidden behind closed lips
  and sunglasses), each part simplified by how much detail it needs (hair to 40%, with more leeway because
  it's many separate strands; clothes and head 35–50%), textures 512 px. 112k → 44k triangles, 3.6 → 1.4 MB,
  14 → 11 draw calls; her skeleton and idle animation kept. Built from the Sketchfab download:
  `node build.mjs modern_indian_woman.glb ../../viewer/play/models/woman.glb woman`.

```
npm i @gltf-transform/core@4.1.1 @gltf-transform/functions@4.1.1 @gltf-transform/extensions@4.1.1 meshoptimizer@0.22.0 sharp@0.33.5
node build.mjs in.glb ../../viewer/play/models/roma.glb roma
```
