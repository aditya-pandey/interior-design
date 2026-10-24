import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  wallLength, wallPoint, wallTangent, wallSegments, spanPolygon, swingSign, polyArea,
  polyBBox, polyCentroid, pointInPoly, furnitureCorners,
} from './geom.js';
import { buildFurniture, buildJoinery } from './furniture.js';
import { finishKey, SURFACE_KEY } from './materials.js';

// Everything here is generated from house.json - nothing is placed by hand.
// Plan (x, y) mm -> world (X = x/1000, Z = y/1000), Y = z/1000 up.

export const FLOOR_IDS = ['GF', 'FF', 'SF', 'ROOF'];
const CUT = 1.2;                 // cutaway height above the floor (m)
const CLEAR = 3.0;               // default wall height (floor to soffit), m
const SOLID_KINDS = new Set(['external', 'internal', 'lift', 'shaft']);
const NO_COLLIDE_FURN = new Set(['rug', 'pendant_statement', 'mirror_round', 'hood', 'wall_cabinet', 'overhead_storage', 'shower_head', 'sink', 'hob']);

const mm = (v) => v / 1000;

// ------------------------------------------------------------------ geometry helpers

function shapeFrom(poly, holes = []) {
  const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(mm(x), -mm(y))));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(mm(x), -mm(y)))));
  return s;
}

// Prism from a plan polygon between y0 and y1 (metres). Optionally split caps/sides.
function prism(poly, y0, y1, holes = []) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(poly, holes), { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

function groupSlice(g, index) {
  const gr = g.groups[index];
  if (!gr) return null;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
  }
  return out;
}

function flatPoly(poly, y, holes = []) {
  const g = new THREE.ShapeGeometry(shapeFrom(poly, holes));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// A strip that follows a wall between t0 and t1 with its own thickness/offset (glass, frames, skins).
function strip(w, t0, t1, y0, y1, thick, offset = 0) {
  const ww = { ...w, t: thick };
  let poly;
  if (offset !== 0) {
    const h = thick / 2;
    if (w.arc) {
      const n = Math.max(1, Math.ceil((t1 - t0) / 150));
      const L = [], R = [];
      for (let i = 0; i <= n; i++) {
        const t = t0 + ((t1 - t0) * i) / n;
        L.push(wallPoint(w, t, offset + h)); R.push(wallPoint(w, t, offset - h));
      }
      poly = L.concat(R.reverse());
    } else {
      poly = [wallPoint(w, t0, offset + h), wallPoint(w, t1, offset + h), wallPoint(w, t1, offset - h), wallPoint(w, t0, offset - h)];
    }
  } else {
    poly = spanPolygon(ww, t0, t1);
  }
  return { g: prism(poly, y0, y1), poly };
}

// Strip split at the cutaway height so frames/glass above 1.2 m can be ghosted or hidden.
function addStrip(batch, fid, cat, mat, w, t0, t1, ya, yb, thick, off, fy) {
  if (yb - ya < 0.001 || t1 - t0 < 0.5) return;
  const cut = fy + CUT;
  const up = cat === 'glass' ? 'glassUpper' : 'upper';
  if (ya < cut && yb > cut) {
    batch.add(fid, cat, mat, strip(w, t0, t1, ya, cut, thick, off).g);
    batch.add(fid, up, mat, strip(w, t0, t1, cut, yb, thick, off).g);
  } else {
    batch.add(fid, yb <= cut + 1e-6 ? cat : up, mat, strip(w, t0, t1, ya, yb, thick, off).g);
  }
}

// Box placed by a plan point, plan direction, size (m) - used for door leaves, posts.
function orientedBox(cx, cy, dir, len, thick, y0, h) {
  const g = new THREE.BoxGeometry(len, h, thick);
  scaleUV(g, len, h, thick);
  g.rotateY(Math.atan2(-dir[1], dir[0]));
  g.translate(mm(cx), y0 + h / 2, mm(cy));
  return g;
}

function addBoxSplit(batch, fid, cat, mat, cx, cy, dir, len, thick, ya, yb, fy) {
  const cut = fy + CUT;
  const up = cat === 'glass' ? 'glassUpper' : 'upper';
  if (ya < cut && yb > cut) {
    batch.add(fid, cat, mat, orientedBox(cx, cy, dir, len, thick, ya, cut - ya));
    batch.add(fid, up, mat, orientedBox(cx, cy, dir, len, thick, cut, yb - cut));
  } else batch.add(fid, ya >= cut ? up : cat, mat, orientedBox(cx, cy, dir, len, thick, ya, yb - ya));
}

function scaleUV(g, w, h, d) {
  const n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
}

function normalise(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  }
  out.groups = [];
  return out;
}

// ------------------------------------------------------------------ batching

class Batch {
  constructor() { this.map = new Map(); }
  add(floor, cat, mat, g) {
    if (!g) return;
    const key = `${floor}|${cat}|${mat}`;
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(normalise(g));
  }
  meshes(M) {
    const out = [];
    for (const [key, list] of this.map) {
      const [floor, cat, mat] = key.split('|');
      const geo = mergeGeometries(list, false);
      if (!geo) { console.warn('merge failed', key); continue; }
      geo.computeBoundingSphere();
      const material = M[mat] || M.plaster;
      const mesh = new THREE.Mesh(geo, material);
      const transparent = material.transparent || cat === 'glass';
      mesh.castShadow = !transparent && !['ceiling', 'emissive', 'floor'].includes(cat);
      mesh.receiveShadow = !transparent;
      mesh.userData = { floor, cat, mat };
      out.push(mesh);
    }
    return out;
  }
}

// ------------------------------------------------------------------ main build

export function buildHouse(house, M) {
  const models = [];                 // glTF props (the car), loaded by main.js
  const batch = new Batch();
  const colliders = [];       // {poly (mm), y0, y1} in metres
  const surfaces = [];        // {poly (mm), y}
  const labels = [];
  const lights = [];
  const presets = [];
  const ffl = (fid) => mm(house.levels[fid].ffl);

  for (const fl of house.floors) {
    const fid = fl.id;
    const fy = ffl(fid);

    // ---------------- walls and openings
    for (const w of fl.walls) buildWall(w, fid, fy, batch, colliders, surfaces, house);

    // ---------------- rooms: floor finish, ceiling, skins, lights, labels
    for (const r of fl.rooms) {
      const isVoid = r.kind === 'lift' || r.kind === 'shaft';
      const fk = finishKey(r.floor);
      if (fk && !isVoid) {
        batch.add(fid, 'floor', fk, flatPoly(r.polygon, fy + 0.004));
        surfaces.push({ poly: r.polygon, y: fy });
      }
      if (r.kind === 'shaft' && fid === 'GF') batch.add(fid, 'floor', 'pebbles', flatPoly(r.polygon, 0.02));
      if (r.ceiling && r.ceiling.height) buildCeiling(r, fid, fy, batch);
      if (r.wall && /tile/.test(r.wall)) buildSkin(r, fl, fy, (r.ceiling?.height || 2600) / 1000, 'tile_matte_lg', batch);
      for (const fw of r.feature_walls || []) buildFeatureWall(fw, fl, fy, r, batch);
      if (!isVoid) {
        const A = Math.abs(polyArea(r.polygon)) / 1e6;
        const [cx, cy] = r.label_at || polyCentroid(r.polygon);
        const [x0, y0, x1, y1] = polyBBox(r.polygon);
        labels.push({ floor: fid, name: r.name, area: A, w: x1 - x0, d: y1 - y0, pos: [mm(cx), fy + 0.05, mm(cy)], status: fl.status });
        presets.push({ id: r.id, name: r.name, floor: fid, kind: r.kind === 'outdoor' ? 'outdoor' : 'room',
          target: [mm(cx), fy + 1.0, mm(cy)], size: Math.max(x1 - x0, y1 - y0) / 1000, bbox: [mm(x0), mm(y0), mm(x1), mm(y1)], fy });
        if (r.ceiling && r.ceiling.height && r.kind !== 'outdoor') {
          lights.push({ floor: fid, pos: [mm(cx), fy + r.ceiling.height / 1000 - 0.35, mm(cy)], area: A });
        }
      }
    }

    // ---------------- outdoor areas
    for (const a of fl.outdoor || []) {
      const z = mm(a.z || 0);
      const mat = SURFACE_KEY[a.surface] || 'granite_flamed';
      if (z > 0.01) {
        const g = prism(a.polygon, 0, z);
        batch.add(fid, 'floor', mat, groupSlice(g, 0));
        batch.add(fid, 'struct', 'granite_flamed', groupSlice(g, 1));
      } else {
        batch.add(fid, 'floor', mat, flatPoly(a.polygon, a.outside_plot ? 0.006 : 0.008));
      }
      surfaces.push({ poly: a.polygon, y: z });
      if (a.id === 'GF-DRAIN') continue;
      const [cx, cy] = a.label_at || polyCentroid(a.polygon);
      const [x0, y0, x1, y1] = polyBBox(a.polygon);
      if (!a.outside_plot && a.id !== 'GF-STEP') {
        labels.push({ floor: fid, name: a.name, area: Math.abs(polyArea(a.polygon)) / 1e6, w: x1 - x0, d: y1 - y0, pos: [mm(cx), z + 0.05, mm(cy)], status: fl.status });
        presets.push({ id: a.id, name: a.name, floor: fid, kind: 'outdoor', target: [mm(cx), z + 1.0, mm(cy)], size: Math.max(x1 - x0, y1 - y0) / 1000, bbox: [mm(x0), mm(y0), mm(x1), mm(y1)], fy: z });
      }
    }

    // ---------------- furniture and joinery
    for (const f of fl.furniture || []) {
      const outdoor = (fl.outdoor || []).find((a) => a.id === f.room);
      const baseY = outdoor ? mm(outdoor.z || 0) : fy;
      if (f.src) models.push({ floor: fid, src: f.src, front: f.model_front || '+z', pos: f.pos, rot: f.rot || 0, baseY, size: f.size });
      for (const part of buildFurniture(f, baseY)) {
        const cat = part.m === 'glass' || part.m === 'glass_frosted' ? 'glass' : ['cove', 'lamp', 'jaali_glow', 'downlight'].includes(part.m) ? 'emissive' : 'furn';
        batch.add(fid, cat, part.m, part.g);
      }
      if (!NO_COLLIDE_FURN.has(f.type) && f.size[2] > 300 && !(f.z > 900)) {
        colliders.push({ poly: furnitureCorners(f), y0: baseY + mm(f.z || 0), y1: baseY + mm(f.z || 0) + mm(f.size[2]) });
      }
      if (f.type === 'pendant_statement') lights.push({ floor: fid, pos: [mm(f.pos[0]), baseY + mm(f.z || 2000) - 0.05, mm(f.pos[1])], area: 6, warm: true, kind: 'pendant' });
      if (f.type === 'mandir_jaali') lights.push({ floor: fid, pos: [mm(f.pos[0]), baseY + 1.3, mm(f.pos[1])], area: 3, kind: 'mandir' });
      if (f.type === 'counter' || f.type === 'utility_counter') buildBacksplash(f, fl, baseY, batch);
    }
    for (const j of fl.joinery || []) for (const part of buildJoinery(j, fy)) batch.add(fid, 'furn', part.m, part.g);
    for (const art of fl.art || []) buildArt(art, fid, fy, batch, M);

    if (fl.pergola) buildPergola(fl.pergola, fid, batch, colliders);
    if (fl.canopy) buildCanopy(fl.canopy, fid, fy, batch, colliders);
  }

  // ---------------- slabs
  for (const s of house.slabs) {
    const top = mm(s.z_top), bot = top - mm(s.thickness);
    const fid = s.level === 'ROOF' ? 'ROOF' : s.level;
    const g = prism(s.outline, bot, top, s.holes || []);
    batch.add(fid, 'struct', 'slab_edge', groupSlice(g, 1));
    const caps = groupSlice(g, 0);
    batch.add(fid, s.level === 'ROOF' ? 'struct' : 'slabcap', s.level === 'ROOF' ? 'concrete' : 'slab_edge', caps);
  }
  buildRoofExtras(house, batch);

  // ---------------- stair
  buildStair(house, batch);

  // ---------------- site
  const ground = new THREE.PlaneGeometry(90, 110);
  ground.rotateX(-Math.PI / 2); ground.translate(4.7, -0.03, 12);
  batch.add('SITE', 'site', 'ground', ground);
  const street = new THREE.PlaneGeometry(90, 9);
  street.rotateX(-Math.PI / 2); street.translate(4.7, -0.005, 24.1 + 4.5 + 1.5);
  batch.add('SITE', 'site', 'asphalt', street);

  return { meshes: batch.meshes(M), models, colliders, surfaces, labels, lights, presets, stair: house.stair, levels: house.levels };
}

// ------------------------------------------------------------------ walls

function wallRange(w, fy) {
  const base = w.base != null ? mm(w.base) : fy;
  let h = w.h != null ? mm(w.h) : CLEAR;
  if (w.kind === 'parapet' && w.h == null) h = 1.05;
  return [base, base + h];
}

function addSolid(batch, colliders, fid, w, t0, t1, y0, y1, mat, fy, split) {
  if (y1 - y0 < 0.002 || t1 - t0 < 1) return;
  const poly = spanPolygon(w, t0, t1);
  const cut = fy + CUT;
  if (split && y0 < cut && y1 > cut) {
    batch.add(fid, 'struct', mat, prism(poly, y0, cut));
    batch.add(fid, 'upper', mat, prism(poly, cut, y1));
  } else {
    batch.add(fid, split && y0 >= cut ? 'upper' : 'struct', mat, prism(poly, y0, y1));
  }
  colliders.push({ poly, y0, y1 });
}

function buildWall(w, fid, fy, batch, colliders, surfaces, house) {
  const [y0, y1] = wallRange(w, fy);
  const L = wallLength(w);
  const kind = w.kind;
  const { solid, cuts } = wallSegments(w);

  if (kind === 'glass_wall' || kind === 'glass_partition' || kind === 'glass_screen' || kind === 'glass_railing') {
    for (const [t0, t1] of solid) glassRun(batch, colliders, fid, w, t0, t1, y0, y1, kind, kind === 'glass_railing' ? 99 : fy);
    for (const [s, e, o] of cuts) buildOpening(batch, colliders, surfaces, fid, w, o, y0, y1, fy);
    return;
  }
  if (kind === 'railing') { railing(batch, colliders, fid, w, 0, L, y0, y1); return; }
  if (kind === 'screen') { slats(batch, colliders, fid, w, y0, y1); return; }

  const mat = kind === 'boundary' ? 'boundary' : kind === 'parapet' ? 'plaster_ext' : 'plaster';
  const split = SOLID_KINDS.has(kind);
  for (const [t0, t1] of solid) addSolid(batch, colliders, fid, w, t0, t1, y0, y1, mat, fy, split);
  if (kind === 'boundary' || kind === 'parapet') {     // coping
    const { g } = strip(w, 0, L, y1, y1 + 0.03, w.t + 40);
    batch.add(fid, 'struct', 'granite_flamed', g);
  }
  for (const [s, e, o] of cuts) {
    const sill = mm(o.sill || 0);
    const head = sill + mm(o.height);
    addSolid(batch, colliders, fid, w, s, e, y0, y0 + sill, mat, fy, split);           // below the sill
    addSolid(batch, colliders, fid, w, s, e, y0 + head, y1, mat, fy, split);           // lintel / wall above
    buildOpening(batch, colliders, surfaces, fid, w, o, y0, y1, fy);
  }
}

function glassRun(batch, colliders, fid, w, t0, t1, y0, y1, kind, fy) {
  const isRail = kind === 'glass_railing';
  const gy1 = isRail ? y1 - 0.04 : y1;
  addStrip(batch, fid, 'glass', 'glass', w, t0, t1, y0 + (isRail ? 0.06 : 0), gy1, 12, 0, fy);
  // frames: bottom channel + top rail / head
  addStrip(batch, fid, 'struct', 'black_metal', w, t0, t1, y0, y0 + (isRail ? 0.06 : 0.03), 50, 0, fy);
  addStrip(batch, fid, 'struct', isRail ? 'brass' : 'black_metal', w, t0, t1, gy1, y1 + (isRail ? 0 : 0), isRail ? 50 : 50, 0, fy);
  if (!isRail) addStrip(batch, fid, 'struct', 'black_metal', w, t0, t1, y1 - 0.03, y1, 50, 0, fy);
  // mullions roughly every 1.2 m on long runs (frameless partitions stay clean)
  if (kind === 'glass_wall' || kind === 'glass_screen') {
    const n = Math.max(1, Math.round((t1 - t0) / 1200));
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      addStrip(batch, fid, 'struct', 'black_metal', w, Math.max(t0, t - 20), Math.min(t1, t + 20), y0, y1, 50, 0, fy);
    }
  }
  colliders.push({ poly: spanPolygon({ ...w, t: 60 }, t0, t1), y0, y1 });
}

function railing(batch, colliders, fid, w, t0, t1, y0, y1) {
  batch.add(fid, 'struct', 'black_metal', strip(w, t0, t1, y1 - 0.04, y1, 50).g);
  batch.add(fid, 'glass', 'glass', strip(w, t0, t1, y0 + 0.05, y1 - 0.04, 12).g);
  const n = Math.max(1, Math.round((t1 - t0) / 1000));
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    batch.add(fid, 'struct', 'black_metal', strip(w, Math.max(t0, t - 20), Math.min(t1, t + 20), y0, y1, 40).g);
  }
  colliders.push({ poly: spanPolygon({ ...w, t: 60 }, t0, t1), y0, y1 });
}

function slats(batch, colliders, fid, w, y0, y1) {
  const L = wallLength(w);
  for (let t = 20; t < L - 20; t += 100) batch.add(fid, 'furn', 'walnut', strip(w, t - 20, t + 20, y0, y1, 60).g);
  batch.add(fid, 'furn', 'black_metal', strip(w, 0, L, y1 - 0.04, y1, 70).g);
  colliders.push({ poly: spanPolygon(w, 0, L), y0, y1 });
}

// ------------------------------------------------------------------ openings

function buildOpening(batch, colliders, surfaces, fid, w, o, y0, y1, fy) {
  const t0 = o.offset, t1 = o.offset + o.width;
  const sill = y0 + mm(o.sill || 0);
  const head = sill + mm(o.height);
  const T = w.t;
  const type = o.type;
  // threshold surface so walking through a doorway stays on the floor (sliding doors have a 100 sill)
  if (type !== 'window' && type !== 'curtain' && type !== 'lift_door') surfaces.push({ poly: spanPolygon(w, t0, t1), y: y0 + mm(o.sill || 0) });

  if (type === 'window' || type === 'curtain' || type === 'sliding_door') {
    const fr = 'black_metal';
    addStrip(batch, fid, 'struct', fr, w, t0, t1, sill, sill + 0.05, Math.min(T, 70), 0, fy);
    addStrip(batch, fid, 'struct', fr, w, t0, t1, head - 0.05, head, Math.min(T, 70), 0, fy);
    addStrip(batch, fid, 'struct', fr, w, t0, t0 + 50, sill, head, Math.min(T, 70), 0, fy);
    addStrip(batch, fid, 'struct', fr, w, t1 - 50, t1, sill, head, Math.min(T, 70), 0, fy);
    if (type === 'sliding_door') {
      const mid = (t0 + t1) / 2;
      addStrip(batch, fid, 'glass', 'glass', w, t0 + 50, mid + 40, sill + 0.05, head - 0.05, 12, 18, fy);
      addStrip(batch, fid, 'glass', 'glass', w, mid - 40, t1 - 50, sill + 0.05, head - 0.05, 12, -18, fy);
      for (const [a, b, off] of [[mid - 10, mid + 40, 18], [mid - 40, mid + 10, -18]]) addStrip(batch, fid, 'struct', fr, w, a, b, sill, head, 30, off, fy);
      // sliding doors to outside: treat the glass as a barrier only when "closed" - leave walkable
    } else {
      addStrip(batch, fid, 'glass', 'glass', w, t0 + 50, t1 - 50, sill + 0.05, head - 0.05, 12, 0, fy);
      const n = Math.max(1, Math.round((t1 - t0) / 1200));
      for (let i = 1; i < n; i++) {
        const t = t0 + ((t1 - t0) * i) / n;
        addStrip(batch, fid, 'struct', fr, w, t - 20, t + 20, sill, head, 60, 0, fy);
      }
      colliders.push({ poly: spanPolygon({ ...w, t: 60 }, t0, t1), y0: sill, y1: head });
    }
    return;
  }

  if (type === 'lift_door') {
    addStrip(batch, fid, 'struct', 'lift_steel', w, t0, (t0 + t1) / 2 - 3, y0, head, 40, 0, fy);
    addStrip(batch, fid, 'struct', 'lift_steel', w, (t0 + t1) / 2 + 3, t1, y0, head, 40, 0, fy);
    addStrip(batch, fid, 'struct', 'steel', w, t0 - 60, t1 + 60, head, head + 0.08, T + 20, 0, fy);
    colliders.push({ poly: spanPolygon(w, t0, t1), y0, y1: head });
    return;
  }

  // jamb lining and head casing (hinged doors, glass doors, pivot, gates)
  const glassy = type === 'glass_door' || type === 'pivot_door' || type === 'gate';
  if (!glassy) {
    const lin = o.mark === 'D1' ? 'walnut' : 'lacquer_white';
    addStrip(batch, fid, 'struct', lin, w, t0, t0 + 25, y0, head, T + 20, 0, fy);
    addStrip(batch, fid, 'struct', lin, w, t1 - 25, t1, y0, head, T + 20, 0, fy);
    addStrip(batch, fid, 'struct', lin, w, t0, t1, head - 0.025, head, T + 20, 0, fy);
  }
  const leafMat = glassy ? 'glass' : o.mark === 'D1' ? 'walnut' : 'lacquer_white';
  const leafT = glassy ? 0.012 : 0.04;
  const s = o.swing ? swingSign(w, o.swing) : 1;
  const leaves = o.hinge === 'both' || o.leaves === 2 ? [[t0, (t0 + t1) / 2], [t1, (t0 + t1) / 2]]
    : o.hinge === 'b' ? [[t1, t0]] : [[t0, t1]];
  const angle = type === 'pivot_door' ? 60 : type === 'gate' ? 80 : 88;
  for (const [ht, ft] of leaves) {
    const width = Math.abs(ft - ht) - 8;
    const hp = wallPoint(w, ht, s * (T / 2 - (glassy ? T / 2 : 20)));
    const fp = wallPoint(w, ft, s * (T / 2 - (glassy ? T / 2 : 20)));
    let u = [fp[0] - hp[0], fp[1] - hp[1]];
    const Lu = Math.hypot(u[0], u[1]) || 1;
    u = [u[0] / Lu, u[1] / Lu];
    const tg = wallTangent(w, ht);
    const n = [tg[1] * s, -tg[0] * s];             // left normal * swing side
    const a = (angle * Math.PI) / 180;
    const dir = [u[0] * Math.cos(a) + n[0] * Math.sin(a), u[1] * Math.cos(a) + n[1] * Math.sin(a)];
    let pivot = hp;
    if (type === 'pivot_door') pivot = wallPoint(w, ht + (ft - ht) * 0.25, 0);
    const len = type === 'pivot_door' ? width * 0.75 : width;
    const cx = pivot[0] + (dir[0] * len) / 2;
    const cy = pivot[1] + (dir[1] * len) / 2;
    addBoxSplit(batch, fid, glassy ? 'glass' : 'struct', leafMat, cx, cy, dir, mm(len), leafT, y0 + 0.01, head - 0.01, fy);
    if (type === 'pivot_door') {   // the short leg of the pivot leaf
      const back = [-dir[0], -dir[1]];
      addBoxSplit(batch, fid, 'glass', 'glass', pivot[0] + back[0] * width * 0.125, pivot[1] + back[1] * width * 0.125, back, mm(width * 0.25), leafT, y0 + 0.01, head - 0.01, fy);
    }
    if (!glassy || type === 'pivot_door') {     // pull handle
      const hx = pivot[0] + dir[0] * (len - 60), hy = pivot[1] + dir[1] * (len - 60);
      batch.add(fid, 'struct', o.mark === 'D1' ? 'brass' : 'black_metal', orientedBox(hx, hy, [-dir[1], dir[0]], 0.08, 0.02, y0 + (o.mark === 'D1' ? 0.6 : 0.95), o.mark === 'D1' ? 1.2 : 0.2));
    }
  }
}

// ------------------------------------------------------------------ room finishes

function insetEdges(poly) {
  const A = polyArea(poly);
  const sgn = A > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy) || 1;
    // inward normal of a polygon with signed area A (y down): for A>0, inward = (-dy, dx)/L
    return { p, q, L, n: [(-dy / L) * sgn, (dx / L) * sgn] };
  });
}

function buildCeiling(r, fid, fy, batch) {
  const h = fy + r.ceiling.height / 1000;
  batch.add(fid, 'ceiling', 'pop_white', flatPoly(r.polygon, h));
  const edges = insetEdges(r.polygon);
  if (r.ceiling.cove) {
    for (const e of edges) {
      if (e.L < 400) continue;
      const a = [e.p[0] + e.n[0] * 120 + (e.q[0] - e.p[0]) / e.L * 60, e.p[1] + e.n[1] * 120 + (e.q[1] - e.p[1]) / e.L * 60];
      const b = [e.q[0] + e.n[0] * 120 - (e.q[0] - e.p[0]) / e.L * 60, e.q[1] + e.n[1] * 120 - (e.q[1] - e.p[1]) / e.L * 60];
      const c = [b[0] + e.n[0] * 40, b[1] + e.n[1] * 40], d = [a[0] + e.n[0] * 40, a[1] + e.n[1] * 40];
      batch.add(fid, 'ceiling', 'cove', flatPoly([a, b, c, d], h - 0.004));
    }
  }
  // downlights on a ~1.4 m grid inside the room
  const [x0, y0, x1, y1] = polyBBox(r.polygon);
  const step = 1400;
  const nx = Math.max(1, Math.floor((x1 - x0) / step)), ny = Math.max(1, Math.floor((y1 - y0) / step));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / nx, y = y0 + ((j + 0.5) * (y1 - y0)) / ny;
    if (!pointInPoly(x, y, r.polygon)) continue;
    const g = new THREE.CircleGeometry(0.045, 20);
    g.rotateX(Math.PI / 2);
    g.translate(mm(x), h - 0.003, mm(y));
    batch.add(fid, 'ceiling', 'downlight', g);
  }
}

// Find openings of the floor's walls that lie on a room edge (for skins and feature walls).
function openingsOnEdge(fl, a, b) {
  const out = [];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  for (const w of fl.walls) {
    for (const o of w.openings || []) {
      const c = wallPoint(w, o.offset + o.width / 2);
      const t = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy;
      const dist = Math.abs((c[0] - a[0]) * uy - (c[1] - a[1]) * ux);
      if (dist <= w.t / 2 + 30 && t > -o.width / 2 && t < L + o.width / 2) {
        out.push({ s: t - o.width / 2, e: t + o.width / 2, sill: (o.sill || 0) / 1000, head: ((o.sill || 0) + o.height) / 1000 });
      }
    }
  }
  return out;
}

function skinAlong(batch, fid, fy, a, b, n, ys, ye, mat, fl, thick = 0.012) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 50) return;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const ops = openingsOnEdge(fl, a, b).sort((p, q) => p.s - q.s);
  const pieces = [];
  let t = 0;
  for (const o of ops) {
    if (o.s > t) pieces.push([t, o.s, ys, ye]);
    if (o.sill > 0.05) pieces.push([Math.max(0, o.s), Math.min(L, o.e), ys, Math.min(ye, fy + o.sill)]);
    if (fy + o.head < ye) pieces.push([Math.max(0, o.s), Math.min(L, o.e), fy + o.head, ye]);
    t = Math.max(t, o.e);
  }
  if (t < L) pieces.push([t, L, ys, ye]);
  for (const [s, e, y0, y1] of pieces) {
    if (e - s < 5 || y1 - y0 < 0.01) continue;
    const p0 = [a[0] + ux * s, a[1] + uy * s], p1 = [a[0] + ux * e, a[1] + uy * e];
    const tm = thick * 1000;
    const poly = [p0, p1, [p1[0] + n[0] * tm, p1[1] + n[1] * tm], [p0[0] + n[0] * tm, p0[1] + n[1] * tm]];
    if (y0 < fy + CUT) batch.add(fid, 'struct', mat, prism(poly, y0, Math.min(y1, fy + CUT)));
    if (y1 > fy + CUT) batch.add(fid, 'upper', mat, prism(poly, Math.max(y0, fy + CUT), y1));
  }
}

function buildSkin(r, fl, fy, height, mat, batch) {
  for (const e of insetEdges(r.polygon)) {
    skinAlong(batch, fl.id, fy, e.p, e.q, e.n, fy, fy + height, mat, fl);
  }
}

// ------------------------------------------------------------------ paintings
// pos is a point on the wall face, rot the facing (as for furniture), z the centre height above FFL.
// Frames are modelled; the texture is only the canvas (tools/prep_art.py). One material per image.

const artLoader = new THREE.TextureLoader();

function artMaterial(M, src, opts = {}) {
  const key = `art:${src}`;
  if (!M[key]) {
    const t = artLoader.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    M[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0, ...opts });
    M[key].name = key;
  }
  return key;
}

// flat quad facing (fx, fy), centred at plan point c (mm) and height zc (m), uv = [u0, v0, u1, v1]
function artQuad(c, f, right, w, h, zc, uv = [0, 0, 1, 1]) {
  const g = new THREE.PlaneGeometry(w, h);
  const u = g.attributes.uv;
  for (let i = 0; i < u.count; i++) u.setXY(i, uv[0] + u.getX(i) * (uv[2] - uv[0]), uv[1] + u.getY(i) * (uv[3] - uv[1]));
  g.rotateY(Math.atan2(f[0], f[1]));
  g.translate(mm(c[0]), zc, mm(c[1]));
  return g;
}

function buildArt(a, fid, fy, batch, M) {
  const r = THREE.MathUtils.degToRad(a.rot);
  const f = [-Math.sin(r), Math.cos(r)];            // facing (out of the wall)
  const right = [Math.cos(r), Math.sin(r)];         // viewer's right when looking at it
  const at = (along, out) => [a.pos[0] + right[0] * along + f[0] * out, a.pos[1] + right[1] * along + f[1] * out];
  const zc = fy + mm(a.z);

  if (a.type === 'gallery') {
    const key = artMaterial(M, a.atlas, { roughness: 0.75 });
    for (const it of a.items) {
      const [w, h] = it.size;
      const z = zc + mm(it.up);
      if (it.src) {                                  // cut-out piece with alpha: 6 mm board, no box
        const k = artMaterial(M, it.src, { transparent: true, alphaTest: 0.5, roughness: 0.6 });
        batch.add(fid, 'upper', k, artQuad(at(it.right, 8), f, right, mm(w), mm(h), z));
        continue;
      }
      batch.add(fid, 'upper', 'linen_white', orientedBox(...at(it.right, a.depth / 2), right, mm(w), mm(a.depth), z - mm(h) / 2, mm(h)));
      batch.add(fid, 'upper', key, artQuad(at(it.right, a.depth + 0.6), f, right, mm(w), mm(h), z, it.uv));
    }
    return;
  }

  const [cw, ch] = a.canvas;
  const fr = a.frame || { width: 40, depth: 30, mat: 'black_metal' };
  const lw = fr.lip ? fr.lip_width || 10 : 0;
  const iw = cw + 2 * lw, ih = ch + 2 * lw;          // frame opening
  const ow = iw + 2 * fr.width, oh = ih + 2 * fr.width;
  const D = fr.depth;
  // moulding: top and bottom run the full width, sides fit between them
  for (const s of [-1, 1]) {
    batch.add(fid, 'upper', fr.mat, orientedBox(...at(0, D / 2), right, mm(ow), mm(D), zc + s * mm(oh / 2 - fr.width / 2) - mm(fr.width) / 2, mm(fr.width)));
    batch.add(fid, 'upper', fr.mat, orientedBox(...at(s * (ow / 2 - fr.width / 2), D / 2), right, mm(fr.width), mm(D), zc - mm(ih) / 2, mm(ih)));
  }
  if (lw) {                                          // gilt lip, set back from the moulding face
    for (const s of [-1, 1]) {
      batch.add(fid, 'upper', fr.lip, orientedBox(...at(0, (D - 8) / 2), right, mm(iw), mm(D - 8), zc + s * mm(ih / 2 - lw / 2) - mm(lw) / 2, mm(lw)));
      batch.add(fid, 'upper', fr.lip, orientedBox(...at(s * (iw / 2 - lw / 2), (D - 8) / 2), right, mm(lw), mm(D - 8), zc - mm(ch) / 2, mm(ch)));
    }
  }
  batch.add(fid, 'upper', 'black_metal', orientedBox(...at(0, 4), right, mm(iw), mm(8), zc - mm(ih) / 2, mm(ih)));    // backing board
  batch.add(fid, 'upper', artMaterial(M, a.src), artQuad(at(0, D - 14), f, right, mm(cw), mm(ch), zc));
  if (a.glass) batch.add(fid, 'glassUpper', 'art_glass', artQuad(at(0, D - 6), f, right, mm(iw), mm(ih), zc));
}

function buildFeatureWall(fw, fl, fy, r, batch) {
  const w = fl.walls.find((x) => x.id === fw.wall);
  if (!w) return;
  const vertical = Math.abs(w.a[0] - w.b[0]) < 1e-6;
  const off = fw.side === '+' ? w.t / 2 : -w.t / 2;
  const sgn = fw.side === '+' ? 1 : -1;
  const a = vertical ? [w.a[0] + off, fw.from] : [fw.from, w.a[1] + off];
  const b = vertical ? [w.a[0] + off, fw.to] : [fw.to, w.a[1] + off];
  const n = vertical ? [sgn, 0] : [0, sgn];
  const h = (r.ceiling?.height || 2750) / 1000;
  skinAlong(batch, fl.id, fy, a, b, n, fy, fy + h, 'walnut_fluted', fl, 0.025);
}

function buildBacksplash(f, fl, baseY, batch) {
  // full-height splash up to a wall cabinet above, otherwise a 100 mm upstand
  const above = (fl.furniture || []).find((g) => g.type === 'wall_cabinet' && g.room === f.room &&
    Math.hypot(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]) < 400);
  const a = ((f.rot || 0) * Math.PI) / 180;
  const [w, d, h] = f.size;
  const cx = f.pos[0] + Math.sin(a) * (d / 2), cy = f.pos[1] - Math.cos(a) * (d / 2);   // centre of the back edge
  const ux = Math.cos(a), uy = Math.sin(a);
  const top = above ? mm(above.z) : mm(h) + 0.05;
  const g = new THREE.BoxGeometry(mm(w), top - mm(h), 0.012);
  scaleUV(g, mm(w), top - mm(h), 0.012);
  g.rotateY(Math.atan2(-uy, ux));
  g.translate(mm(cx) - Math.sin(a) * 0.006, baseY + (mm(h) + top) / 2, mm(cy) + Math.cos(a) * 0.006);
  batch.add(fl.id, 'furn', f.type === 'utility_counter' ? 'granite_flamed' : 'marble_white', g);
}

// ------------------------------------------------------------------ outdoor structures

function post(batch, fid, x, y, s, y0, y1, mat) {
  const g = new THREE.BoxGeometry(mm(s), y1 - y0, mm(s));
  scaleUV(g, mm(s), y1 - y0, mm(s));
  g.translate(mm(x), (y0 + y1) / 2, mm(y));
  batch.add(fid, 'struct', mat, g);
}

function beam(batch, fid, a, b, w, y0, h, mat) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  batch.add(fid, 'struct', mat, orientedBox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dir, mm(L), mm(w), y0, h));
}

function buildPergola(pg, fid, batch, colliders) {
  const top = mm(pg.z_top);
  const deck = 0.3;
  for (const [x, y] of pg.posts) {
    post(batch, fid, x, y, pg.post_size, deck, top - mm(pg.beam.size[1]), 'black_metal');
    colliders.push({ poly: [[x - 75, y - 75], [x + 75, y - 75], [x + 75, y + 75], [x - 75, y + 75]], y0: deck, y1: top });
  }
  beam(batch, fid, pg.beam.a, pg.beam.b, pg.beam.size[0], top - mm(pg.beam.size[1]), mm(pg.beam.size[1]), 'black_metal');
  beam(batch, fid, pg.ledger.a, pg.ledger.b, 100, top - 0.25, 0.25, 'black_metal');
  const rf = pg.rafters;
  const x0 = pg.beam.a[0], x1 = pg.beam.b[0];
  for (let x = x0 + 100; x < x1 - 30; x += rf.spacing) {
    beam(batch, fid, [x, rf.from_y], [x, rf.to_y], rf.size[0], top - mm(rf.size[1]) + 0.05, mm(rf.size[1]), 'walnut');
  }
}

function buildCanopy(cp, fid, fy, batch, colliders) {
  const hi = fy + mm(cp.z_high), lo = fy + mm(cp.z_low);
  const ys = cp.polygon.map((p) => p[1]);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const zAt = (y) => lo + ((y - ymin) / (ymax - ymin)) * (hi - lo);       // falls toward the rear (-y)
  const g = new THREE.ShapeGeometry(shapeFrom(cp.polygon));
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, zAt(pos.getZ(i) * 1000));
  g.computeVertexNormals();
  batch.add(fid, 'glass', 'polycarbonate', g);
  for (const [x, y] of cp.posts) {
    post(batch, fid, x, y, cp.post_size, fy, zAt(y), 'black_metal');
    colliders.push({ poly: [[x - 50, y - 50], [x + 50, y - 50], [x + 50, y + 50], [x - 50, y + 50]], y0: fy, y1: zAt(y) });
  }
  // purlins along x every ~1.2 m
  for (let y = ymin + 100; y < ymax; y += 1200) {
    const xs = cp.polygon.map((p) => p[0]);
    const xa = Math.min(...xs), xb = Math.max(...xs);
    beam(batch, fid, [xa, y], [xb, y], 60, zAt(y) - 0.1, 0.1, 'black_metal');
  }
}

function buildRoofExtras(house, batch) {
  // lift overrun above the SF roof (MRL lift, ~1.5 m) - drawn as a plastered box
  const top = mm(house.levels.ROOF.ffl);
  const box = [[7200, 10766], [9381, 10766], [9381, 12865], [7200, 12865]];
  batch.add('ROOF', 'struct', 'plaster_ext', prism(box, top, top + 1.5));
  batch.add('ROOF', 'struct', 'concrete', prism([[7150, 10716], [9431, 10716], [9431, 12915], [7150, 12915]], top + 1.5, top + 1.65));
}

// ------------------------------------------------------------------ stair

function buildStair(house, batch) {
  const st = house.stair;
  const R = st.riser / 1000;
  const storeys = st.floors.slice(0, -1);           // flights start on GF and FF
  for (const fid of storeys) {
    const base = mm(house.levels[fid].ffl);
    for (const f of st.flights) {
      const [xa, ya] = f.start, [xb, yb] = f.end;
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
      const lv0 = base + mm(f.from_level);
      for (let i = 0; i < f.risers - 1; i++) {        // treads; the last riser lands on the landing/floor
        const top = lv0 + (i + 1) * R;
        const tx0 = f.dir === '+x' ? x0 + i * st.going : x1 - (i + 1) * st.going;
        const poly = [[tx0, y0], [tx0 + st.going, y0], [tx0 + st.going, y1], [tx0, y1]];
        batch.add(fid, 'struct', 'marble_beige', prism(poly, top - 0.04, top));
        batch.add(fid, 'struct', 'slab_edge', prism(poly, top - R - 0.18, top - 0.04));
      }
      // sloped handrail on the spine side
      const yr = f.dir === '+x' ? y1 - 40 : y0 + 40;
      const xs = f.dir === '+x' ? [x0, x1] : [x1, x0];
      const h0 = lv0 + 0.9, h1 = lv0 + mm(f.to_level - f.from_level) + 0.9;
      batch.add(fid, 'upper', 'walnut', railBetween(xs, h0, h1, yr));
    }
    const lp = st.landing.polygon;
    const lt = base + mm(st.landing.level);
    batch.add(fid, 'struct', 'marble_beige', prism(lp, lt - 0.04, lt));
    batch.add(fid, 'struct', 'slab_edge', prism(lp, lt - mm(st.landing.thickness), lt - 0.04));
  }
}

// Handrail: a cylinder between two 3D points.
function railBetween(xs, h0, h1, yr) {
  const a = new THREE.Vector3(mm(xs[0]), h0, mm(yr)), b = new THREE.Vector3(mm(xs[1]), h1, mm(yr));
  const L = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(0.022, 0.022, L, 12);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Walkable stair surfaces for walk mode.
export function stairHeights(stair, levels, x, y) {
  const out = [];
  const R = stair.riser / 1000;
  for (const fid of stair.floors.slice(0, -1)) {
    const base = levels[fid].ffl / 1000;
    for (const f of stair.flights) {
      const [xa, ya] = f.start, [xb, yb] = f.end;
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const along = f.dir === '+x' ? x - x0 : x1 - x;
      const i = Math.min(f.risers - 1, Math.floor(along / stair.going) + 1);
      out.push(base + f.from_level / 1000 + i * R);
    }
    const lp = stair.landing.polygon;
    if (pointInPoly(x, y, lp)) out.push(base + stair.landing.level / 1000);
  }
  return out;
}
