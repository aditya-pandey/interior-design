import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, weld, simplify, resample, getBounds, flatten, join, instance, weldPrimitive, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [src, out, kind] = process.argv.slice(2);
const doc = await io.read(src);
const root = doc.getRoot();
const tris = () => { let t = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; return Math.round(t); };
console.log('before', tris(), 'tris');
if (kind === 'bike') {
  // the grass mound and its flowers: everything of the flower materials, and the ground disc
  const drop = new Set(['phong1', 'lambert3', 'lambert2', 'lambert7']);
  for (const n of root.listNodes()) { const m = n.getMesh(); if (m && m.listPrimitives().every((p) => drop.has(p.getMaterial()?.getName()))) n.dispose(); }
}
if (kind === 'woman') {
  // her figure, lighter for a game camera a few metres away: the teeth (behind closed lips) and the eyelashes
  // (behind her sunglasses) go; each part is simplified by how much detail it needs to keep its silhouette
  const drop = new Set(['AvatarTeethLower', 'AvatarTeethUpper', 'AvatarEyelashes']);
  for (const n of root.listNodes()) { const m = n.getMesh(); if (m && m.listPrimitives().every((p) => drop.has(p.getMaterial()?.getName()))) n.dispose(); }
  const RATIO = { haircut: 0.4, outfit_bottom: 0.35, AvatarHead: 0.45, outfit_top: 0.5, AvatarBody: 0.5, outfit_shoes: 0.45, glasses: 0.5 };
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const r = RATIO[p.getMaterial()?.getName()];
    if (!r) continue;
    weldPrimitive(p, {});
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: r, error: p.getMaterial().getName() === 'haircut' ? 0.008 : 0.006 });   // (hair is many separate strands: it needs more leeway)
  }
}
await doc.transform(prune(), dedup());
// fewer draw calls: everything flattened and joined by material; the Ferrari's wheels joined only among themselves
if (kind === 'roma' || kind === 'bike') {
  const scene = root.listScenes()[0];
  const wheelSet = new Set();
  if (kind === 'roma') for (const n of root.listNodes()) if (/Combined3DWheel/.test(n.getName())) n.traverse((q) => wheelSet.add(q));
  await doc.transform(flatten());
  const body = doc.createNode('BODY'), wheels = doc.createNode('WHEELS');
  for (const n of [...scene.listChildren()]) { if (!n.getMesh()) continue; scene.removeChild(n); (wheelSet.has(n) ? wheels : body).addChild(n); }
  scene.addChild(body); if (wheels.listChildren().length) scene.addChild(wheels);
  await doc.transform(join({ keepNamed: false }), prune());
  console.log('meshes now', root.listMeshes().length);
}
const opts = { bike: { simplify: 0.35 }, roma: {}, vespa: {}, woman: {} }[kind] || {};
if (opts.simplify) await doc.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: opts.simplify, error: 0.0008 }));
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [kind === 'woman' ? 512 : 2048, kind === 'woman' ? 512 : 2048] }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
console.log('after', tris(), 'tris');
await io.write(out, doc);
