import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The colony around GH-18 for /play/: a 3 x 3 grid of blocks (two back-to-back rows of 9.381 m plots,
// like GH-18's own), a park across the road from GH-18, a ring of colony roads, the boundary wall and a
// gate onto the main road. Everything is generated from a seed, so it is the same every visit.
//
// Frame (same as the tour): world X = plan x / 1000 (+X = west in R1), Z = plan y / 1000 (+Z = north, the
// road side), Y up. GH-18's plot is X 0..9.381, Z 0..22.276 and faces +Z.
//
// It is scenery, not design: nothing here comes from house_r1.json except GH-18's plot size. The real
// colony layout can replace this later (e.g. from OpenStreetMap) without touching the car or the house.

export const P = 9.381;            // plot width (GH-18)
export const D = 22.276;           // plot depth, rear boundary to front boundary (GH-18)
const VERGE = 1.8, ROAD = 7.0;
export const GAP = VERGE * 2 + ROAD;   // road corridor between blocks
const PLOTS = 10;                  // plots per row; GH-18 is plot 0, the block runs from plot -5 to 4
const BW = PLOTS * P, BD = 2 * D;
const BX0 = -5 * P;                // block (0,0) spans X BX0..BX0+BW, Z -D..D
const SX = BW + GAP, SZ = BD + GAP;
const PARK = '0,1';                // block across the road from GH-18
const GH18 = { block: '0,0', plot: 0, row: 1 };

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// ------------------------------------------------------------------ geometry collector
// Boxes, cylinders and blobs are collected per material and merged into one mesh each. UVs are
// world-space metres (the textured materials repeat by metres), colours go in a vertex attribute
// so every house can have its own paint without extra draw calls.
class Parts {
  constructor() { this.parts = {}; }
  push(key, geo, color) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const c = new THREE.Color(color ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos);
    g.setAttribute('normal', nor);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (this.parts[key] ||= []).push(g);
  }
  // axis-aligned box from (x0, y0, z0) to (x1, y1, z1)
  box(key, x0, y0, z0, x1, y1, z1, color) {
    const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0], [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
    const g = new THREE.BoxGeometry(bx - ax, y1 - y0, bz - az);
    g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    this.push(key, g, color);
  }
  cyl(key, x, y0, z, r, h, color, seg = 12, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    this.push(key, g, color);
  }
  meshes(mats) {
    const out = [];
    for (const [k, list] of Object.entries(this.parts)) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mats[k]);
      mesh.name = 'world_' + k;
      mesh.castShadow = !/glass_lit|lamp|road|paver|grass|ground|stripe|mark/.test(k);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      out.push(mesh);
    }
    return out;
  }
}

// ------------------------------------------------------------------ materials

function noiseTexture(size, base, spread, specks, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const r = rng(seed);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (r() - 0.5) * spread;
    img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < specks; i++) {
    const v = 90 + r() * 120;
    g.fillStyle = `rgba(${v},${v},${v * 0.97},${0.25 + r() * 0.4})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function worldMaterials(M) {
  const tint = (src, opts = {}) => new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, normalScale: src.normalScale,
    roughness: 1, vertexColors: true, ...opts,
  });
  const asphalt = noiseTexture(256, '#5b5a57', 26, 900, 7);
  asphalt.repeat.set(1 / 3, 1 / 3);
  const earth = noiseTexture(256, '#a89a82', 30, 500, 9);
  earth.repeat.set(1 / 6, 1 / 6);
  const W = {
    wall: tint(M.plaster),
    stone: tint(M.granite_flamed),
    paver: tint(M.cobble, { normalScale: new THREE.Vector2(0.6, 0.6) }),
    grass: tint(M.grass),
    road: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, vertexColors: true }),
    ground: new THREE.MeshStandardMaterial({ map: earth, roughness: 1, vertexColors: true }),
    flat: new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true }),
    stripe: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.6, vertexColors: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb2bb, roughness: 0.08, metalness: 0.6, vertexColors: true }),
    glass_lit: new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffc27e, emissiveIntensity: 0, roughness: 0.3, vertexColors: true }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf4efe4, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true }),
    sign: null,
  };
  return W;
}

// ------------------------------------------------------------------ layout helpers

function blockRect(bx, bz) {
  const x0 = BX0 + bx * SX, z0 = -D + bz * SZ;
  return { x0, x1: x0 + BW, z0, z1: z0 + BD };
}
const BLOCKS = [];
for (let bz = -1; bz <= 1; bz++) for (let bx = -1; bx <= 1; bx++) BLOCKS.push([bx, bz]);

// road centre lines: 4 along X (between block rows and outside), 4 along Z
const ROADS_X = [], ROADS_Z = [];
for (let k = -1; k <= 2; k++) ROADS_X.push(-D + k * SZ - GAP / 2);           // Z of roads running along X
for (let k = -1; k <= 2; k++) ROADS_Z.push(BX0 + k * SX - GAP / 2);          // X of roads running along Z
const EXT = { x0: ROADS_Z[0] - GAP / 2, x1: ROADS_Z[3] + GAP / 2, z0: ROADS_X[0] - GAP / 2, z1: ROADS_X[3] + GAP / 2 };
// main road outside the colony gate (north side), with a median
const MAIN = { z0: EXT.z1 + 4, z1: EXT.z1 + 4 + 15, x0: EXT.x0 - 60, x1: EXT.x1 + 60 };
const GATE_X = (ROADS_Z[1] + ROADS_Z[2]) / 2 + 0;   // gate centred on the park block, on the north wall
const GATE_W = 9;

// speed breakers: mid-way between junctions on every road (the one on GH-18's road is moved 30 m west,
// clear of its ramp)
export const BREAKERS = [];
for (const z of ROADS_X) for (let i = 0; i < 3; i++) BREAKERS.push({ along: 'x', x: (ROADS_Z[i] + ROADS_Z[i + 1]) / 2 + (i === 1 && z === ROADS_X[2] ? 30 : 0), z });
for (const x of ROADS_Z) for (let i = 0; i < 3; i++) BREAKERS.push({ along: 'z', x, z: (ROADS_X[i] + ROADS_X[i + 1]) / 2 });
const BUMP_H = 0.075, BUMP_HALF = 0.5;

// ground height under a point (speed breakers are the only bumps; everything else is flat)
export function groundHeight(x, z) {
  for (const b of BREAKERS) {
    const d = b.along === 'x' ? x - b.x : z - b.z;
    const across = b.along === 'x' ? z - b.z : x - b.x;
    if (Math.abs(d) < BUMP_HALF && Math.abs(across) < ROAD / 2 + 0.1) {
      const c = Math.cos((d / BUMP_HALF) * Math.PI / 2);
      return BUMP_H * c * c;
    }
  }
  return 0;
}

// ------------------------------------------------------------------ the generator

export function buildWorld(M, opts = {}) {
  const parts = new Parts();
  const W = worldMaterials(M);
  const colliders = [];      // {poly: [[x,z]...]} or {circle: [x, z, r]}
  const rect = (x0, z0, x1, z1) => colliders.push({ poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
  const trees = [], lamps = [], cars = [];
  const r = rng(1818);
  const low = !!opts.low;

  // ground, roads, verges ---------------------------------------------------
  parts.box('ground', MAIN.x0 - 80, -0.06, EXT.z0 - 90, MAIN.x1 + 80, -0.02, MAIN.z1 + 70, 0xffffff);
  for (const z of ROADS_X) parts.box('road', EXT.x0, -0.02, z - ROAD / 2, EXT.x1, 0.0, z + ROAD / 2, 0xffffff);
  for (const x of ROADS_Z) parts.box('road', x - ROAD / 2, -0.02, EXT.z0, x + ROAD / 2, 0.0, EXT.z1, 0xffffff);
  // outer verge band inside the colony wall
  for (const [x0, z0, x1, z1] of [[EXT.x0, EXT.z0, EXT.x1, EXT.z0 + VERGE], [EXT.x0, EXT.z1 - VERGE, EXT.x1, EXT.z1],
    [EXT.x0, EXT.z0, EXT.x0 + VERGE, EXT.z1], [EXT.x1 - VERGE, EXT.z0, EXT.x1, EXT.z1]]) parts.box('paver', x0, -0.02, z0, x1, 0.01, z1, 0xc9bfb2);
  for (const [bx, bz] of BLOCKS) {
    const b = blockRect(bx, bz);
    const ring = [[b.x0 - VERGE, b.z1, b.x1 + VERGE, b.z1 + VERGE], [b.x0 - VERGE, b.z0 - VERGE, b.x1 + VERGE, b.z0],
      [b.x0 - VERGE, b.z0, b.x0, b.z1], [b.x1, b.z0, b.x1 + VERGE, b.z1]];
    for (const [x0, z0, x1, z1] of ring) {
      // GH-18's own ramp crosses the north verge: leave it out there (the ramp is in the house model)
      if (bx === 0 && bz === 0 && z0 === b.z1) {
        parts.box('paver', x0, -0.02, z0, 6.08, 0.01, z1, 0xc9bfb2);
        parts.box('paver', P, -0.02, z0, x1, 0.01, z1, 0xc9bfb2);
      } else parts.box('paver', x0, -0.02, z0, x1, 0.01, z1, 0xc9bfb2);
      // kerb stones along the road edge
      const horiz = z1 - z0 === VERGE && x1 - x0 > VERGE;
      if (horiz) {
        const zk = z0 === b.z1 ? z1 : z0;
        parts.box('stone', x0, 0, zk - 0.08, x1, 0.06, zk + 0.08, 0x9d968c);
      } else {
        const xk = x0 === b.x1 ? x1 : x0;
        parts.box('stone', xk - 0.08, 0, z0, xk + 0.08, 0.06, z1, 0x9d968c);
      }
    }
  }
  // speed breakers: yellow and black stripes, rounded
  for (const b of BREAKERS) {
    const n = 8, len = ROAD;
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(BUMP_HALF, BUMP_HALF, len / n, 10, 1, false, 0, Math.PI);
      g.rotateZ(Math.PI / 2);         // axis along X, half-round on top
      g.scale(1, BUMP_H / BUMP_HALF, 1);
      const off = -len / 2 + (i + 0.5) * len / n;
      if (b.along === 'x') { g.rotateY(Math.PI / 2); g.translate(b.x, 0, b.z + off); } else g.translate(b.x + off, 0, b.z);
      parts.push('stripe', g, i % 2 ? 0x1d1d1d : 0xe2b623);
    }
  }

  // houses -------------------------------------------------------------------
  const WALLS = [0xefe6d6, 0xe9dcc6, 0xf3efe8, 0xdcd0bd, 0xe7d6c3, 0xd5d9da, 0xefe1cf, 0xe3c9a8, 0xd9bea3, 0xf6f3ee, 0xc9b49a];
  const ACCENT = [0x7f6a58, 0x5f5b57, 0x9c5a3c, 0x4e555b, 0xb39b7a, 0x8a8178, 0x3f3b37];
  for (const [bx, bz] of BLOCKS) {
    const key = bx + ',' + bz, b = blockRect(bx, bz);
    if (key === PARK) { park(b); continue; }
    for (let row = 0; row < 2; row++) {            // row 0 faces -Z (south), row 1 faces +Z (north)
      for (let i = 0; i < PLOTS; i++) {
        const x0 = b.x0 + i * P, x1 = x0 + P;
        const plotIdx = i - 5;
        if (key === GH18.block && row === GH18.row && plotIdx === GH18.plot) continue;
        const s = row === 1 ? 1 : -1;
        const zf = row === 1 ? b.z1 : b.z0;          // front boundary
        const zr = (b.z0 + b.z1) / 2;                // rear boundary (back-to-back)
        // GH-17 (plot -1) and GH-19 (plot 1) share walls with GH-18: GH-17 keeps clear of GH-18's OTS,
        // which projects 0.7 m into it, and GH-19 of GH-18's west wall
        const nextTo = key === GH18.block && row === GH18.row;
        const xa = nextTo && plotIdx === 1 ? P + 0.01 : x0, xb = nextTo && plotIdx === -1 ? -0.75 : x1;
        house(xa, xb, zf, zr, s, (bx + 3) * 1000 + (bz + 3) * 100 + row * 20 + i);
      }
    }
  }

  function house(x0, x1, zf, zr, s, seed) {
    const hr = rng(seed * 7919 + 13);
    const w = x1 - x0;
    const wall = pick(hr, WALLS), accent = pick(hr, ACCENT), trim = hr() < 0.6 ? 0xf7f5f0 : 0xd8d2c8;
    const floors = hr() < 0.6 ? 3 : 2;
    const stilt = floors === 3 && hr() < 0.45;
    const front = 3.2 + hr() * 2.6, rear = 2.0 + hr() * 2.0;
    const hf = zf - s * front, hb = zr + s * rear;     // house front / back faces
    const [z0, z1] = hf < hb ? [hf, hb] : [hb, hf];
    const FH = 3.3, PL = 0.45;
    // plinth
    parts.box('wall', x0, 0, z0, x1, PL, z1, accent);
    for (let f = 0; f < floors; f++) {
      const y = PL + f * FH;
      const set = f > 0 && hr() < 0.3 ? 1.2 : 0;          // upper floor stepped back
      const ff = hf + -s * set;
      const [a, c] = ff < hb ? [ff, hb] : [hb, ff];
      if (f === 0 && stilt) {
        // stilt parking: columns + back wall, a car inside sometimes
        for (const cx of [x0 + 0.25, x1 - 0.25, (x0 + x1) / 2]) parts.box('wall', cx - 0.2, y, ff - 0.2, cx + 0.2, y + FH - 0.3, ff + 0.2, trim);
        parts.box('wall', x0, y, a + (s > 0 ? 0 : 6), x1, y + FH - 0.3, c - (s > 0 ? 6 : 0), wall);
        if (hr() < 0.6) cars.push({ x: (x0 + x1) / 2 + (hr() - 0.5) * 2, z: ff - s * 3, yaw: s > 0 ? 0 : Math.PI, seed: seed });
      } else {
        parts.box('wall', x0, y, a, x1, y + FH - 0.3, c, wall);
      }
      // slab band, projecting at the front
      parts.box('wall', x0, y + FH - 0.3, Math.min(a, c) - (s < 0 ? 0.35 : 0), x1, y + FH, Math.max(a, c) + (s > 0 ? 0.35 : 0), trim);
      if (f === 0 && stilt) continue;
      // windows on the front face
      const n = w > 8 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const ww = f === 0 && k === 0 ? 1.1 : 1.6 + hr() * 0.6;   // ground floor: a door first
        const cx = x0 + (w * (k + 0.5)) / n;
        const yb = f === 0 && k === 0 ? y : y + 0.8, yt = y + 2.3;
        const face = ff + s * 0.02;
        parts.box('flat', cx - ww / 2 - 0.08, yb - 0.06, face - 0.03, cx + ww / 2 + 0.08, yt + 0.08, face + s * 0.05, f === 0 && k === 0 ? 0x5a3d2b : 0x2d2d2d);
        if (!(f === 0 && k === 0)) {
          const lit = hr() < 0.35;
          parts.box(lit ? 'glass_lit' : 'glass', cx - ww / 2, yb, face + s * 0.05, cx + ww / 2, yt, face + s * 0.07, lit ? 0xffffff : 0xb9c6cc);
        }
        parts.box('flat', cx - ww / 2 - 0.12, yb - 0.1, face, cx + ww / 2 + 0.12, yb - 0.02, face + s * 0.12, trim);   // sill
      }
      // a balcony on some upper floors
      if (f > 0 && hr() < 0.5) {
        const bw = w * (0.45 + hr() * 0.3), bxs = hr() < 0.5 ? x0 + 0.3 : x1 - 0.3 - bw;
        parts.box('wall', bxs, y - 0.05, ff + s * 0.35, bxs + bw, y + 0.12, ff + s * 1.3, trim);
        parts.box(hr() < 0.5 ? 'glass' : 'metal', bxs, y + 0.12, ff + s * 1.26, bxs + bw, y + 1.1, ff + s * 1.3, hr() < 0.5 ? 0xd0dde2 : 0x2a2a2a);
        parts.box('metal', bxs, y + 1.08, ff + s * 1.22, bxs + bw, y + 1.12, ff + s * 1.32, 0x2a2a2a);
      }
    }
    const top = PL + floors * FH;
    // vertical stone feature panel on some facades
    if (hr() < 0.55) {
      const px = hr() < 0.5 ? x0 + 0.2 : x1 - 1.4;
      parts.box('stone', px, PL, hf + s * 0.02, px + 1.2, top + 0.6, hf + s * 0.14, accent);
    }
    // parapet, stair room (mumty) and the black water tanks every Indian roof has
    parts.box('wall', x0, top, z0, x1, top + 0.9, z0 + 0.2, wall);
    parts.box('wall', x0, top, z1 - 0.2, x1, top + 0.9, z1, wall);
    const mz = s > 0 ? z0 + 1 : z1 - 4.5;
    const mx = hr() < 0.5 ? x0 + 0.2 : x1 - 3.4;
    parts.box('wall', mx, top, mz, mx + 3.2, top + 2.6, mz + 3.5, wall);
    parts.box('wall', mx - 0.1, top + 2.6, mz - 0.1, mx + 3.3, top + 2.75, mz + 3.6, trim);
    const tanks = hr() < 0.5 ? 2 : 1;
    for (let t = 0; t < tanks; t++) parts.cyl('flat', mx + 0.9 + t * 1.4, top + 2.75, mz + 1.75, 0.55, 1.1, 0x1b1b1b, low ? 8 : 14, 0.5);
    if (hr() < 0.35) parts.box('metal', x0 + 1, top + 0.4, (z0 + z1) / 2 - 1, x0 + 3.2, top + 1.3, (z0 + z1) / 2 + 0.6, 0x2c3e55);   // solar panel

    // front yard: paving, boundary wall with a gate, a planter
    const [ya, yb] = zf < hf ? [zf, hf] : [hf, zf];
    parts.box('paver', x0, -0.02, ya, x1, 0.03, yb, 0xb8b0a5);
    const gw = 3.2, gx = hr() < 0.5 ? x0 + 0.6 : x1 - 0.6 - gw;
    const bwz = zf - s * 0.12;
    const bwc = hr() < 0.5 ? wall : accent;
    parts.box('wall', x0, 0, bwz - 0.1, gx, 1.35, bwz + 0.1, bwc);
    parts.box('wall', gx + gw, 0, bwz - 0.1, x1, 1.35, bwz + 0.1, bwc);
    parts.box('metal', gx, 0.05, bwz - 0.03, gx + gw, 1.5, bwz + 0.03, pick(hr, [0x1f1f1f, 0x3a3a3a, 0x5b4632, 0x2e3a46]));
    for (const px of [gx - 0.35, gx + gw]) parts.box('wall', px, 0, bwz - 0.18, px + 0.35, 1.65, bwz + 0.18, trim);
    if (hr() < 0.6) {
      const tx = gx > (x0 + x1) / 2 ? x0 + 1.4 : x1 - 1.4;
      trees.push({ x: tx, z: (zf + hf) / 2, kind: 'shrub', s: 0.55 + hr() * 0.3 });
    }
    rect(x0, Math.min(zf, hb) , x1, Math.max(zf, hb));   // the whole plot is solid to the car (gates closed)
    // side walls between front yards are part of the solid plot
  }

  function park(b) {
    const m = 0.5;
    parts.box('grass', b.x0, -0.02, b.z0, b.x1, 0.04, b.z1, 0xd9dccb);
    // low wall + railing with entrances in the middle of each side
    const rail = (x0, z0, x1, z1) => {
      parts.box('wall', x0, 0, z0, x1, 0.5, z1, 0xd6cfc4);
      parts.box('metal', x0, 0.5, z0 + (z1 - z0) / 2 - 0.02, x1, 1.2, z0 + (z1 - z0) / 2 + 0.02, 0x2b3a2e);
      rect(x0, z0, x1, z1);
    };
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, e = 1.2;
    rail(b.x0, b.z0, cx - e, b.z0 + 0.25); rail(cx + e, b.z0, b.x1, b.z0 + 0.25);
    rail(b.x0, b.z1 - 0.25, cx - e, b.z1); rail(cx + e, b.z1 - 0.25, b.x1, b.z1);
    rail(b.x0, b.z0, b.x0 + 0.25, cz - e); rail(b.x0, cz + e, b.x0 + 0.25, b.z1);
    rail(b.x1 - 0.25, b.z0, b.x1, cz - e); rail(b.x1 - 0.25, cz + e, b.x1, b.z1);
    // walking track (red pavers) around a lawn, paths to the entrances
    const t = 5, tw = 2.2;
    for (const [x0, z0, x1, z1] of [[b.x0 + t, b.z0 + t, b.x1 - t, b.z0 + t + tw], [b.x0 + t, b.z1 - t - tw, b.x1 - t, b.z1 - t],
      [b.x0 + t, b.z0 + t, b.x0 + t + tw, b.z1 - t], [b.x1 - t - tw, b.z0 + t, b.x1 - t, b.z1 - t],
      [cx - 1, b.z0, cx + 1, b.z1], [b.x0, cz - 1, b.x1, cz + 1]]) parts.box('paver', x0, 0.02, z0, x1, 0.06, z1, 0xe0b49a);
    // central chhatri (pavilion): plinth, 8 columns, dome
    parts.cyl('stone', cx, 0, cz, 4.2, 0.45, 0xd8cfc0, 24);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      parts.cyl('wall', cx + Math.cos(a) * 3.6, 0.45, cz + Math.sin(a) * 3.6, 0.18, 2.8, 0xf3eee6, 10);
    }
    parts.cyl('wall', cx, 3.25, cz, 4.1, 0.3, 0xf3eee6, 24);
    const dome = new THREE.SphereGeometry(3.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(cx, 3.55, cz);
    parts.push('wall', dome, 0xeee4d4);
    // benches along the track
    for (let k = 0; k < 10; k++) {
      const bxk = b.x0 + 12 + k * ((BW - 24) / 9);
      for (const zz of [b.z0 + t + tw + 0.6, b.z1 - t - tw - 0.6]) {
        parts.box('wall', bxk - 0.9, 0, zz - 0.25, bxk + 0.9, 0.42, zz + 0.25, 0xcfc6b8);
      }
    }
    // trees: a ring inside the railing and a few on the lawn
    for (let x = b.x0 + 2.4; x < b.x1 - 2; x += 7.5) for (const z of [b.z0 + 2.4, b.z1 - 2.4]) trees.push({ x: x + r() * 1.5, z, kind: r() < 0.5 ? 'neem' : 'ashoka', s: 0.9 + r() * 0.4 });
    for (let z = b.z0 + 9; z < b.z1 - 8; z += 7) for (const x of [b.x0 + 2.4, b.x1 - 2.4]) trees.push({ x, z: z + r(), kind: 'ashoka', s: 0.9 + r() * 0.3 });
    for (let k = 0; k < 14; k++) {
      const x = b.x0 + 10 + r() * (BW - 20), z = b.z0 + 10 + r() * (BD - 20);
      if (Math.hypot(x - cx, z - cz) > 9 && Math.abs(x - cx) > 2.5 && Math.abs(z - cz) > 2.5) trees.push({ x, z, kind: r() < 0.6 ? 'neem' : 'gulmohar', s: 1 + r() * 0.5 });
    }
    for (const [lx, lz] of [[b.x0 + t + tw + 0.5, b.z0 + t + tw + 0.5], [b.x1 - t - tw - 0.5, b.z0 + t + tw + 0.5], [b.x0 + t + tw + 0.5, b.z1 - t - tw - 0.5], [b.x1 - t - tw - 0.5, b.z1 - t - tw - 0.5]]) lamps.push({ x: lx, z: lz, yaw: 0, park: true });
  }

  // street trees and lamps on the verges ----------------------------------------
  for (const [bx, bz] of BLOCKS) {
    const b = blockRect(bx, bz);
    const sides = [[b.x0, b.z1 + VERGE * 0.55, b.x1, b.z1 + VERGE * 0.55, 0], [b.x0, b.z0 - VERGE * 0.55, b.x1, b.z0 - VERGE * 0.55, Math.PI],
      [b.x0 - VERGE * 0.55, b.z0, b.x0 - VERGE * 0.55, b.z1, -Math.PI / 2], [b.x1 + VERGE * 0.55, b.z0, b.x1 + VERGE * 0.55, b.z1, Math.PI / 2]];
    for (const [x0, z0, x1, z1, yaw] of sides) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 11);
      for (let k = 1; k < n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (bx === 0 && bz === 0 && yaw === 0 && x > 4.5 && x < 11) continue;   // keep GH-18's frontage and ramp open
        if (r() < 0.82) trees.push({ x: x + (r() - 0.5) * 1.2, z, kind: pick(r, ['neem', 'neem', 'ashoka', 'gulmohar']), s: 0.8 + r() * 0.5 });
      }
      const nl = Math.floor(L / 28);
      for (let k = 0; k <= nl; k++) {
        const t = (k + 0.5) / (nl + 1), x = x0 + (x1 - x0) * t + (z0 === z1 ? 2.5 : 0), z = z0 + (z1 - z0) * t + (z0 === z1 ? 0 : 2.5);
        if (bx === 0 && bz === 0 && yaw === 0 && x > 4.5 && x < 11) continue;
        lamps.push({ x, z, yaw });
      }
    }
  }

  // colony wall, gate, main road ---------------------------------------------------
  const WH = 2.4, wt = 0.3;
  const wallSeg = (x0, z0, x1, z1) => { parts.box('wall', x0, 0, z0, x1, WH, z1, 0xd8cdbd); parts.box('wall', x0 - 0.05, WH, z0 - 0.05, x1 + 0.05, WH + 0.12, z1 + 0.05, 0xbfb3a2); rect(x0, z0, x1, z1); };
  const ox0 = EXT.x0 - 1, ox1 = EXT.x1 + 1, oz0 = EXT.z0 - 1, oz1 = EXT.z1 + 1;
  wallSeg(ox0, oz0 - wt, ox1, oz0);
  wallSeg(ox0 - wt, oz0, ox0, oz1);
  wallSeg(ox1, oz0, ox1 + wt, oz1);
  wallSeg(ox0, oz1, GATE_X - GATE_W / 2, oz1 + wt);
  wallSeg(GATE_X + GATE_W / 2, oz1, ox1, oz1 + wt);
  // the gap between the colony's north road and its wall is paved; so is the gate apron to the main road
  parts.box('road', GATE_X - GATE_W / 2, -0.02, EXT.z1 - 0.5, GATE_X + GATE_W / 2, 0.0, MAIN.z0 + 0.5, 0xffffff);
  // gate pillars, arch beam with the colony name, guard cabin and a raised boom barrier
  for (const px of [GATE_X - GATE_W / 2 - 1.0, GATE_X + GATE_W / 2]) {
    parts.box('stone', px, 0, oz1 - 0.5, px + 1.0, 5.2, oz1 + 0.8, 0x8b7d6b);
    parts.box('wall', px - 0.1, 5.2, oz1 - 0.6, px + 1.1, 5.45, oz1 + 0.9, 0xefe8dc);
    rect(px, oz1 - 0.5, px + 1.0, oz1 + 0.8);
  }
  parts.box('wall', GATE_X - GATE_W / 2 - 1.0, 4.3, oz1 - 0.2, GATE_X + GATE_W / 2 + 1.0, 5.1, oz1 + 0.5, 0xefe8dc);
  const signZ = oz1 + 0.52;
  const cabin = [GATE_X + GATE_W / 2 + 2.2, oz1 - 3.6];
  parts.box('wall', cabin[0], 0, cabin[1], cabin[0] + 2.2, 2.6, cabin[1] + 2.2, 0xe6dccb);
  parts.box('glass', cabin[0] - 0.01, 1.0, cabin[1] + 0.4, cabin[0] + 0.01, 2.0, cabin[1] + 1.8, 0xc3d2d8);
  parts.box('wall', cabin[0] - 0.2, 2.6, cabin[1] - 0.2, cabin[0] + 2.4, 2.75, cabin[1] + 2.4, 0x9c4a33);
  rect(cabin[0], cabin[1], cabin[0] + 2.2, cabin[1] + 2.2);
  // boom barrier, raised (red and white)
  const bb = [GATE_X + GATE_W / 2 - 0.4, oz1 - 1.2];
  parts.box('flat', bb[0] - 0.25, 0, bb[1] - 0.25, bb[0] + 0.25, 1.1, bb[1] + 0.25, 0xd9d9d9);
  for (let k = 0; k < 6; k++) {
    const g = new THREE.BoxGeometry(0.1, 1.2, 0.1);
    g.translate(0, 0.6 + k * 1.2, 0);
    g.rotateZ(0.22);
    g.translate(bb[0], 1.0, bb[1]);
    parts.push('flat', g, k % 2 ? 0xffffff : 0xc0392b);
  }
  // main road: two carriageways and a planted median, closed with barricades at both ends
  parts.box('road', MAIN.x0, -0.02, MAIN.z0, MAIN.x1, 0.0, MAIN.z1, 0xffffff);
  parts.box('paver', MAIN.x0, -0.02, EXT.z1 + 1.3, MAIN.x1, 0.01, MAIN.z0, 0xc2b8aa);
  const mz = (MAIN.z0 + MAIN.z1) / 2;
  parts.box('stone', MAIN.x0, 0, mz - 0.7, MAIN.x1, 0.3, mz + 0.7, 0xb5aa9a);
  parts.box('grass', MAIN.x0, 0.3, mz - 0.6, MAIN.x1, 0.32, mz + 0.6, 0xffffff);
  rect(MAIN.x0, mz - 0.7, MAIN.x1, mz + 0.7);
  for (let x = MAIN.x0 + 6; x < MAIN.x1; x += 9) trees.push({ x, z: mz, kind: 'shrub', s: 0.7 });
  for (const x of [MAIN.x0, MAIN.x1]) {
    for (let k = 0; k < 4; k++) {
      const z = MAIN.z0 + 1.8 + k * 3.6;
      parts.box('flat', x - 0.6, 0, z - 1.0, x + 0.6, 1.0, z + 1.0, k % 2 ? 0xd9d9d9 : 0xc0392b);
    }
    rect(x - (x === MAIN.x0 ? 3 : 0.6), MAIN.z0 - 1, x + (x === MAIN.x1 ? 3 : 0.6), MAIN.z1 + 1);
  }
  // dashed lane lines
  for (let x = MAIN.x0 + 2; x < MAIN.x1 - 2; x += 6) for (const z of [(MAIN.z0 + mz) / 2, (mz + MAIN.z1) / 2]) parts.box('stripe', x, 0.0, z - 0.06, x + 3, 0.012, z + 0.06, 0xe8e6df);
  // the far side of the main road: shops with signboards, behind a footpath
  rect(MAIN.x0, MAIN.z1 + 2, MAIN.x1, MAIN.z1 + 20);
  parts.box('paver', MAIN.x0, -0.02, MAIN.z1, MAIN.x1, 0.12, MAIN.z1 + 3, 0xc2b8aa);
  for (let x = MAIN.x0 + 4, k = 0; x < MAIN.x1 - 10; k++) {
    const w = 8 + r() * 10, h = 3.6 + Math.floor(r() * 3) * 3.3;
    const c = pick(r, WALLS);
    parts.box('wall', x, 0, MAIN.z1 + 4, x + w, h, MAIN.z1 + 18, c);
    parts.box('glass', x + 0.6, 0.2, MAIN.z1 + 3.96, x + w - 0.6, 2.8, MAIN.z1 + 4.0, 0x8fa1aa);
    parts.box('flat', x + 0.3, 2.9, MAIN.z1 + 3.8, x + w - 0.3, 3.6, MAIN.z1 + 3.95, pick(r, [0xc0392b, 0x1f6f8b, 0xe1a92a, 0x2e7d32, 0x6a3d9a, 0xd35400, 0x34495e]));
    if (r() < 0.5) parts.box('glass_lit', x + 1, 4.4, MAIN.z1 + 3.97, x + w - 1, 5.6, MAIN.z1 + 4.0, 0xffffff);
    x += w + 0.4;
  }

  // parked cars along the colony roads (simple shapes, so the Baleno stays the hero) -------------
  const CAR_COL = [0xf2f2f2, 0xbfc3c7, 0x2b2f33, 0x8b1e1e, 0x1f3f6b, 0x6d6e70, 0xe8e4da];
  for (let k = 0; k < 26; k++) {
    const vertical = r() < 0.4;
    if (vertical) {
      const x = pick(r, ROADS_Z), side = r() < 0.5 ? -1 : 1, i = Math.floor(r() * 3);
      const z = ROADS_X[i] + GAP / 2 + 6 + r() * (BD - 12);
      cars.push({ x: x + side * (ROAD / 2 - 1.05), z, yaw: side > 0 ? 0 : Math.PI, seed: 50 + k });
    } else {
      const z = pick(r, ROADS_X), side = r() < 0.5 ? -1 : 1, i = Math.floor(r() * 3);
      const x = ROADS_Z[i] + GAP / 2 + 6 + r() * (BW - 12);
      if (z === ROADS_X[2] && x > -3 && x < 16) continue;      // not in front of GH-18
      cars.push({ x, z: z + side * (ROAD / 2 - 1.05), yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, seed: 50 + k });
    }
  }
  for (const c of cars) {
    const cr = rng(c.seed * 31 + 7), col = pick(cr, CAR_COL);
    const g = carShape(col, cr() < 0.3);
    for (const [key, geo, color] of g) {
      geo.rotateY(c.yaw);
      geo.translate(c.x, 0, c.z);
      parts.push(key, geo, color);
    }
    const ca = Math.cos(c.yaw), sa = Math.sin(c.yaw), hw = 0.88, hl = 2.05;
    const pt = (lx, lz) => [c.x + lx * ca + lz * sa, c.z - lx * sa + lz * ca];
    colliders.push({ poly: [pt(-hw, -hl), pt(hw, -hl), pt(hw, hl), pt(-hw, hl)] });
  }

  // instanced trees and lamps -------------------------------------------------------
  const objects = [];
  const canopies = [];
  objects.push(...buildTrees(trees, W, colliders, canopies, low));
  objects.push(...buildLamps(lamps, W, colliders));
  const meshes = parts.meshes(W);
  const sign = gateSign(GATE_X, signZ);
  objects.push(sign);

  return {
    meshes, objects, colliders, canopies, materials: W, lamps,
    extent: { x0: MAIN.x0, x1: MAIN.x1, z0: EXT.z0 - 2, z1: MAIN.z1 + 20 },
    map: { blocks: BLOCKS.map(([bx, bz]) => ({ ...blockRect(bx, bz), park: bx + ',' + bz === PARK })), roadsX: ROADS_X, roadsZ: ROADS_Z, ext: EXT, main: MAIN, gate: GATE_X, road: ROAD },
  };
}

// a parked hatchback / sedan from a few rounded boxes, pointing +Z
function carShape(color, sedan) {
  const out = [];
  const L = sedan ? 4.3 : 3.9, Wd = 1.72;
  const body = new THREE.BoxGeometry(Wd, 0.62, L); body.translate(0, 0.62, 0);
  out.push(['flat', body, color]);
  const cab = new THREE.BoxGeometry(Wd - 0.12, 0.5, L * 0.5); cab.translate(0, 1.18, sedan ? -0.1 : -0.25);
  out.push(['glass', cab, 0x55626a]);
  const roof = new THREE.BoxGeometry(Wd - 0.2, 0.06, L * 0.46); roof.translate(0, 1.45, sedan ? -0.1 : -0.25);
  out.push(['flat', roof, color]);
  for (const [x, z] of [[-0.78, L * 0.32], [0.78, L * 0.32], [-0.78, -L * 0.32], [0.78, -L * 0.32]]) {
    const w = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12); w.rotateZ(Math.PI / 2); w.translate(x, 0.31, z);
    out.push(['flat', w, 0x151515]);
  }
  return out;
}

function buildTrees(list, W, colliders, canopies, low) {
  // three species: neem (broad, clustered), ashoka (tall, narrow), gulmohar (wide, flat, flame-red tint),
  // plus garden shrubs. One instanced trunk mesh and one instanced canopy mesh per species.
  const species = {
    neem: { trunk: [0.16, 0.22, 2.8], blobs: [[0, 3.6, 0, 1.6], [1.0, 3.3, 0.4, 1.2], [-0.9, 3.4, -0.3, 1.25], [0.2, 4.4, -0.6, 1.1], [-0.3, 3.0, 1.0, 1.0], [0.6, 4.1, 0.9, 0.95]], colors: [0x4c7a35, 0x3d6a2c, 0x5a8a3e] },
    ashoka: { trunk: [0.1, 0.14, 1.2], cone: true, colors: [0x2f5a2a, 0x2a5226] },
    // gulmohar flowers in May-June; in the rest of the year it is a wide, light green umbrella
    gulmohar: { trunk: [0.17, 0.24, 2.6], blobs: [[0, 3.3, 0, 1.9], [1.5, 3.1, 0.3, 1.4], [-1.4, 3.2, -0.2, 1.4], [0.3, 3.9, 0.9, 1.3]], colors: [0x6c9a46, 0x5f8d3e] },
    shrub: { trunk: [0.05, 0.06, 0.3], blobs: [[0, 0.9, 0, 0.75], [0.4, 0.8, 0.2, 0.55], [-0.35, 0.85, -0.2, 0.55]], colors: [0x4a7f3a, 0x3f6f33] },
  };
  const out = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [name, sp] of Object.entries(species)) {
    const items = list.filter((t) => t.kind === name);
    if (!items.length) continue;
    const trunk = new THREE.CylinderGeometry(sp.trunk[0], sp.trunk[1], sp.trunk[2], 7);
    trunk.translate(0, sp.trunk[2] / 2, 0);
    const blobs = [];
    const detail = low ? 0 : 1;
    if (sp.cone) {
      for (let k = 0; k < 4; k++) {
        const g = new THREE.ConeGeometry(0.85 - k * 0.12, 2.4, 8);
        g.translate(0, 1.6 + k * 1.5, 0);
        blobs.push(colorize(g, sp.colors[k % 2]));
      }
    } else {
      sp.blobs.forEach(([x, y, z, rr], k) => {
        const g = new THREE.IcosahedronGeometry(rr, detail);
        g.scale(1, 0.78, 1);
        jitter(g, rr * 0.12, k + 3);
        g.translate(x, y, z);
        blobs.push(colorize(g, sp.colors[k % sp.colors.length]));
      });
    }
    const canopy = mergeGeometries(blobs);
    const tm = new THREE.InstancedMesh(trunk, W.trunk, items.length);
    const cm = new THREE.InstancedMesh(canopy, W.leaf, items.length);
    items.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.x * 7.3 + t.z * 3.1) % (Math.PI * 2));
      s.setScalar(t.s); p.set(t.x, 0, t.z);
      m.compose(p, q, s);
      tm.setMatrixAt(i, m); cm.setMatrixAt(i, m);
      if (name !== 'shrub') {
        colliders.push({ circle: [t.x, t.z, 0.28 * t.s] });
        canopies.push([t.x, t.z, (name === 'ashoka' ? 1.0 : 2.0) * t.s]);
      }
    });
    for (const im of [tm, cm]) { im.castShadow = true; im.receiveShadow = true; im.name = 'trees_' + name; }
    out.push(tm, cm);
  }
  return out;
}

function colorize(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

function jitter(g, amt, seed) {
  const r = rng(seed * 97), pos = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, (r() - 0.5) * 2 * amt);
    const d = map.get(key), len = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)) || 1;
    pos.setXYZ(i, pos.getX(i) * (1 + d / len), pos.getY(i) * (1 + d / len), pos.getZ(i) * (1 + d / len));
  }
  g.computeVertexNormals();
}

function buildLamps(list, W, colliders) {
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 6, 8); pole.translate(0, 3, 0);
  const arm = new THREE.BoxGeometry(0.07, 0.07, 1.4); arm.translate(0, 5.9, 0.65);
  const head = new THREE.BoxGeometry(0.28, 0.1, 0.55); head.translate(0, 5.82, 1.3);
  const metal = mergeGeometries([pole, arm]);
  const pm = new THREE.InstancedMesh(metal, new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.5, metalness: 0.6 }), list.length);
  const hm = new THREE.InstancedMesh(head, W.lamp, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  list.forEach((l, i) => {
    // the arm (local +Z) reaches over the road: yaw 0 = towards +Z, for lamps on a block's north verge
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.yaw);
    m.compose(new THREE.Vector3(l.x, 0, l.z), q, new THREE.Vector3(1, l.park ? 0.65 : 1, 1));
    pm.setMatrixAt(i, m); hm.setMatrixAt(i, m);
    colliders.push({ circle: [l.x, l.z, 0.12] });
  });
  pm.castShadow = true;
  pm.name = 'lamps'; hm.name = 'lamp_heads';
  return [pm, hm];
}

// "CELEBRITY HOMES" on the gate's arch beam, painted on a canvas
function gateSign(x, z) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#efe8dc'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#6b4a2f';
  g.font = '600 62px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CELEBRITY HOMES', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 0.8), mat);
  mesh.position.set(x, 4.7, z);
  const back = mesh.clone();
  back.rotation.y = Math.PI;
  back.position.z = z - 0.74;
  const grp = new THREE.Group();
  grp.add(mesh, back);
  grp.name = 'gate_sign';
  return grp;
}
