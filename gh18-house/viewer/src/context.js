import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Neighbourhood context for the film (?cinema): flanking row houses, the street with
// trees and lamps, and the houses across the road. Deliberately simple massing so the
// GH-18 model stays the hero. Not part of house.json (it is scenery, not design).

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function buildContext(plot, M) {
  const g = new THREE.Group();
  g.name = 'context';
  const parts = { ctx_wall: [], ctx_wall2: [], window_dark: [], window_lit: [], trunk: [], foliage: [], foliage_dark: [], black_metal: [], lamp: [], concrete: [], granite_flamed: [] };
  const add = (k, geo) => parts[k].push(geo.index ? geo.toNonIndexed() : geo);
  const box = (k, w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y + h / 2, z); add(k, b); };
  const W = plot.width_outer / 1000, D = plot.depth_to_front_boundary / 1000;
  const r = rng(18);

  // a simple Indian row house: plinth, 2-3 storeys, slab bands, recessed windows (some lit at dusk)
  function house(x0, x1, z0, z1, floors, facing = 1) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box('ctx_wall', w, 0.45, d, cx, 0, cz);
    for (let f = 0; f < floors; f++) {
      const y = 0.45 + f * 3.3;
      box(f % 2 ? 'ctx_wall2' : 'ctx_wall', w - 0.02, 3.0, d - 0.02, cx, y, cz);
      box('concrete', w + 0.3, 0.3, d + 0.3, cx, y + 3.0, cz);                     // slab band
      const zf = facing > 0 ? z1 + 0.01 : z0 - 0.01;
      const nwin = Math.max(1, Math.floor(w / 3));
      for (let i = 0; i < nwin; i++) {
        const wx = x0 + (w * (i + 0.5)) / nwin;
        const lit = r() > 0.75 ? 'window_lit' : 'window_dark';
        box(lit, Math.min(2.2, w / nwin - 0.6), 1.9, 0.05, wx, y + 0.6, zf);
      }
    }
    box('ctx_wall', w, 1.05, d, cx, 0.45 + floors * 3.3, cz);                        // parapet block
  }

  // flanking plots (shared party walls): older two-storey houses, set further back, so GH-18 leads
  house(-9.4, -0.75, 6.5, 16.8, 2, 1);
  house(W + 0.02, W + 9.4, 6.5, 16.5, 2, 1);
  house(-18.8, -9.45, 7.0, 17.0, 2, 1);
  house(W + 9.45, W + 18.8, 6.0, 17.2, 2, 1);
  // boundary walls of the neighbours' front yards
  for (const [a, b] of [[-9.4, -0.75], [W + 0.02, W + 9.4]]) box('ctx_wall', b - a, 1.5, 0.25, (a + b) / 2, 0, D - 0.15);
  // houses behind (back-to-back plots) and across the road
  for (let i = -3; i <= 3; i++) {
    const x0 = i * 9.4 + 0.2, x1 = x0 + 9.0;
    house(x0, x1, -24.0, -11.0, 2, -1);
    house(x0, x1, D + 15.5, D + 29.5, 2 + (Math.abs(i) % 2), -1);
  }

  // street: footpaths with kerbs either side of the road
  box('granite_flamed', 70, 0.15, 2.4, W / 2, 0, D + 1.9);
  box('granite_flamed', 70, 0.15, 2.4, W / 2, 0, D + 12.6);
  box('concrete', 70, 0.18, 0.15, W / 2, 0, D + 3.1);
  box('concrete', 70, 0.18, 0.15, W / 2, 0, D + 11.4);

  // street trees (neem-like): trunk + clustered canopy
  const trees = [[-4.5, D + 1.8], [W + 4.5, D + 1.8], [-14, D + 1.8], [W + 14, D + 1.8], [-8, D + 12.6], [2, D + 12.6], [12, D + 12.6], [22, D + 12.6], [-4, 2.0], [W + 4, 2.4]];
  for (const [x, z] of trees) {
    const h = 2.6 + r() * 1.2;
    const t = new THREE.CylinderGeometry(0.12, 0.18, h, 10); t.translate(x, h / 2, z); add('trunk', t);
    for (let k = 0; k < 6; k++) {
      const s = 1.1 + r() * 0.9;
      const c = new THREE.IcosahedronGeometry(s, 1);
      c.scale(1, 0.8, 1);
      c.translate(x + (r() - 0.5) * 2.2, h + 0.6 + r() * 1.6, z + (r() - 0.5) * 2.2);
      add(k % 2 ? 'foliage' : 'foliage_dark', c);
    }
  }
  // street lamps
  for (const x of [-11, 13.5, 26]) {
    const z = D + 3.0;
    const p = new THREE.CylinderGeometry(0.06, 0.09, 5.2, 10); p.translate(x, 2.6, z); add('black_metal', p);
    box('black_metal', 0.08, 0.06, 1.1, x, 5.1, z - 0.5);
    box('lamp', 0.45, 0.08, 0.22, x, 5.0, z - 1.0);
  }

  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list.map((q) => { for (const a of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(a)) q.deleteAttribute(a); return q; }));
    const mesh = new THREE.Mesh(geo, M[k] || M.plaster);
    mesh.castShadow = !['window_lit', 'window_dark', 'lamp'].includes(k);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
