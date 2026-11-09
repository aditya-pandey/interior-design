# Preparing the garage's models (and her figure)

`build.mjs` takes a Sketchfab glTF download and writes the game's copy into `viewer/play/models/`:
textures resized and converted to WebP, geometry compressed (meshopt), unused data pruned. Per model:

- `roma` (Ferrari Roma): its 984 parts flattened and joined by material (a few dozen draw calls), the wheel
  group kept apart (`WHEELS`) so the game can split it into four spinning wheels.
- `bike` (the bicycle): the grass mound and its flowers removed, the rest simplified to ~50k triangles.
- `vespa`, `woman`: compressed as they are (the woman keeps her skeleton and animation).

```
npm i @gltf-transform/core@4.1.1 @gltf-transform/functions@4.1.1 @gltf-transform/extensions@4.1.1 meshoptimizer@0.22.0 sharp@0.33.5
node build.mjs in.glb ../../viewer/play/models/roma.glb roma
```
