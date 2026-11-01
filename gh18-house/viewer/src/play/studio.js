import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { STUDIO } from './site.js';

// Her studio on the beach: a glass pavilion facing the sea (north) and the sunset (west).
//   - east wall: a full library, a reading chair with a lamp
//   - centre: a daybed looking out to sea; a radio on the credenza for the music
//   - south wall and a free-standing partition: her paintings
//   - west: a writing desk at the glass, an easel with a canvas in progress
//   - her poems framed by the desk; walk up and press E to read them
//   - north deck: two loungers for the sunset; fairy lights along the eaves after dark
//
// Paintings, poems and music come from the personal pack (play/deepti/pack.json). Without it (a public
// build) the frames hang empty and the poems are not shown.
//
// Returns geometry plus what the rest of /play/ needs: car colliders (metres), the walker's colliders
// and floors (plan millimetres, like the tour's house data), things to interact with, and the lights.

const { x0: X0, z0: Z0, w: SW, d: SD, floor: F } = STUDIO;
const X1 = X0 + SW, Z1 = Z0 + SD;
const H = 3.0;                       // floor to ceiling
const T = 0.25;                      // solid wall thickness
const DOOR = [103.0, 104.8];         // glass slider in the south wall
const DECK = { x0: X0 - 1.0, x1: X1 + 1.0, z0: Z0 - 1.2, z1: Z1 + 2.6 };

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// geometry collector: per-material lists, merged at the end; optional vertex colours
class Parts {
  constructor() { this.p = {}; }
  add(key, g, color) {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color ?? 0xffffff);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    (this.p[key] ||= []).push(g);
  }
  box(key, x0, y0, z0, x1, y1, z1, color, worldUv = true) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (worldUv) boxUV(g);
    this.add(key, g, color);
  }
  rbox(key, cx, y0, cz, w, h, d, r, color, rotY = 0) {
    const g = new RoundedBoxGeometry(w, h, d, 3, r);
    g.rotateY(rotY);
    g.translate(cx, y0 + h / 2, cz);
    this.add(key, g, color);
  }
  cyl(key, x, y0, z, r0, r1, h, color, seg = 16) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    g.translate(x, y0 + h / 2, z);
    this.add(key, g, color);
  }
  meshes(mats) {
    return Object.entries(this.p).map(([k, list]) => {
      const m = new THREE.Mesh(mergeGeometries(list), mats[k]);
      m.name = 'studio_' + k;
      m.castShadow = !['glass', 'glow', 'fairy'].includes(k);
      m.receiveShadow = true;
      return m;
    });
  }
}
function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i)); else if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i)); else uv.setXY(i, p.getX(i), p.getY(i));
  }
}

// warm oak planks, drawn once
function plankTexture(base, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d'), r = rng(seed);
  for (let y = 0; y < 512; y += 32) {
    const shade = 0.88 + r() * 0.2;
    const [R, G, B] = base.map((v) => Math.min(255, v * shade));
    g.fillStyle = `rgb(${R},${G},${B})`;
    g.fillRect(0, y, 512, 32);
    for (let k = 0; k < 40; k++) {                     // grain
      g.strokeStyle = `rgba(80,50,30,${0.04 + r() * 0.08})`;
      g.lineWidth = 1;
      const yy = y + r() * 32;
      g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(170, yy + r() * 4 - 2, 340, yy + r() * 4 - 2, 512, yy + r() * 3 - 1.5); g.stroke();
    }
    g.fillStyle = 'rgba(40,25,15,0.35)';
    g.fillRect(0, y, 512, 1.5);
    const joint = r() * 512;
    g.fillRect(joint, y, 1.5, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / 2.4, 1 / 2.4);     // 512 px = 2.4 m: 15 cm planks
  return t;
}

// ------------------------------------------------------------------ build
export function buildStudio(M, pack) {
  const parts = new Parts();
  const group = new THREE.Group();
  group.name = 'studio';
  const carColliders = [];                     // metres
  const walkColliders = [];                    // {poly mm, y0, y1}
  const walkSurfaces = [];                     // {poly mm, y}
  const interact = [];
  const mm = (v) => Math.round(v * 1000);
  const rectMM = (x0, z0, x1, z1) => [[mm(x0), mm(z0)], [mm(x1), mm(z0)], [mm(x1), mm(z1)], [mm(x0), mm(z1)]];
  const solid = (x0, z0, x1, z1, y0 = F, y1 = F + 2) => walkColliders.push({ poly: rectMM(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)), y0, y1 });

  const oak = plankTexture([196, 150, 104], 3), teak = plankTexture([150, 104, 70], 4);
  const mats = {
    plinth: new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.9, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ map: teak, roughness: 0.75, vertexColors: true }),
    floor: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.45, vertexColors: true }),
    plaster: new THREE.MeshStandardMaterial({ map: M.plaster?.map || null, color: 0xffffff, roughness: 0.92, vertexColors: true }),
    wood: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.6, vertexColors: true }),
    paint: new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true }),
    fabric: new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.75, vertexColors: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 1, vertexColors: true }),
    glass: M.glass,
    glow: new THREE.MeshStandardMaterial({ color: 0xfff1d8, emissive: 0xffc27e, emissiveIntensity: 0, roughness: 0.5, vertexColors: true }),
    fairy: new THREE.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffcf8a, emissiveIntensity: 0, roughness: 0.4 }),
    leaf: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }),
  };

  // ---- plinth, deck, steps, boardwalk
  parts.box('plinth', DECK.x0, -0.5, DECK.z0, DECK.x1, F - 0.15, DECK.z1, 0xd2ccc0);
  parts.box('deck', DECK.x0, F - 0.15, DECK.z0, DECK.x1, F, DECK.z1, 0xffffff);
  parts.box('floor', X0, F, Z0, X1, F + 0.01, Z1, 0xffffff);
  const steps = [[0.2, DECK.z0 - 0.8, DECK.z0 - 0.4], [0.4, DECK.z0 - 0.4, DECK.z0]];
  for (const [h, z0, z1] of steps) {
    parts.box('deck', DOOR[0] - 0.4, -0.2, z0, DOOR[1] + 0.4, h, z1, 0xe8ddd0);
    walkSurfaces.push({ poly: rectMM(DOOR[0] - 0.4, z0, DOOR[1] + 0.4, z1), y: h });
  }
  walkSurfaces.push({ poly: rectMM(DECK.x0, DECK.z0, DECK.x1, DECK.z1), y: F });
  carColliders.push({ poly: [[DECK.x0, DECK.z0 - 0.8], [DECK.x1, DECK.z0 - 0.8], [DECK.x1, DECK.z1], [DECK.x0, DECK.z1]] });
  // boardwalk from the parking pad to the steps
  const BW = [[95.2, 36.6, 104.2, 38.2], [102.6, 38.2, 104.2, DECK.z0 - 0.8]];
  for (const [a, b, c, d] of BW) {
    parts.box('deck', a, -0.1, b, c, 0.12, d, 0xd8c7b2);
    walkSurfaces.push({ poly: rectMM(a, b, c, d), y: 0.12 });
  }

  // ---- walls: solid east and south (with the door), glass north and west
  parts.box('plaster', X0, F, Z0, X0 + T, F + H, Z1, 0xf4f0e8);                               // east
  parts.box('plaster', X0, F, Z0, DOOR[0], F + H, Z0 + T, 0xf4f0e8);                         // south, left of the door
  parts.box('plaster', DOOR[1], F, Z0, X1, F + H, Z0 + T, 0xf4f0e8);                         // south, right
  parts.box('plaster', DOOR[0], F + 2.4, Z0, DOOR[1], F + H, Z0 + T, 0xf4f0e8);              // over the door
  solid(X0, Z0, X0 + T, Z1); solid(X0, Z0, DOOR[0], Z0 + T); solid(DOOR[1], Z0, X1, Z0 + T);
  // the door: a glass slider, open
  parts.box('glass', DOOR[0] - 0.85, F, Z0 + 0.05, DOOR[0] + 0.05, F + 2.4, Z0 + 0.09);
  parts.box('metal', DOOR[0] - 0.85, F + 2.36, Z0 + 0.03, DOOR[0] + 0.05, F + 2.42, Z0 + 0.11, 0x1d1d1d);
  // glass walls with slim black mullions
  const glassRun = (a, b, along) => {
    const L = b - a, n = Math.round(L / 1.55), step = L / n;
    if (along === 'x') {
      parts.box('glass', a, F, Z1 - 0.03, b, F + H, Z1);
      for (let i = 0; i <= n; i++) parts.box('metal', a + i * step - 0.035, F, Z1 - 0.07, a + i * step + 0.035, F + H, Z1 + 0.02, 0x1b1b1b);
      parts.box('metal', a, F, Z1 - 0.07, b, F + 0.06, Z1 + 0.02, 0x1b1b1b);
      solid(a, Z1 - 0.08, b, Z1 + 0.02);
    } else {
      parts.box('glass', X1 - 0.03, F, a, X1, F + H, b);
      for (let i = 0; i <= n; i++) parts.box('metal', X1 - 0.07, F, a + i * step - 0.035, X1 + 0.02, F + H, a + i * step + 0.035, 0x1b1b1b);
      parts.box('metal', X1 - 0.07, F, a, X1 + 0.02, F + 0.06, b, 0x1b1b1b);
      solid(X1 - 0.08, a, X1 + 0.02, b);
    }
  };
  glassRun(X0 + T, X1, 'x');
  glassRun(Z0 + T, Z1, 'z');
  // roof: a thin white slab with deep eaves, oak soffit
  const R = { x0: X0 - 0.9, x1: X1 + 1.3, z0: Z0 - 0.9, z1: Z1 + 1.8 };
  parts.box('plaster', R.x0, F + H, R.z0, R.x1, F + H + 0.28, R.z1, 0xfbfaf6);
  // ceiling: light inside, oak soffit only on the eaves outside the glass
  parts.box('plaster', X0, F + H - 0.03, Z0, X1, F + H, Z1, 0xf7f3ec);
  parts.box('wood', R.x0 + 0.02, F + H - 0.03, Z1, R.x1 - 0.02, F + H, R.z1 - 0.02, 0xe9d6bd);
  parts.box('wood', X1, F + H - 0.03, R.z0 + 0.02, R.x1 - 0.02, F + H, Z1, 0xe9d6bd);
  parts.box('wood', R.x0 + 0.02, F + H - 0.03, R.z0 + 0.02, X1, F + H, Z0, 0xe9d6bd);
  parts.box('wood', R.x0 + 0.02, F + H - 0.03, Z0, X0, F + H, Z1, 0xe9d6bd);
  // oak cladding on the outside of the solid walls
  parts.box('wood', X0 - 0.05, F, Z0 - 0.05, X0, F + H, Z1, 0xd8b48a);
  parts.box('wood', X0 - 0.05, F, Z0 - 0.05, DOOR[0], F + H, Z0, 0xd8b48a);
  parts.box('wood', DOOR[1], F, Z0 - 0.05, X1, F + H, Z0, 0xd8b48a);
  parts.box('wood', DOOR[0], F + 2.4, Z0 - 0.05, DOOR[1], F + H, Z0, 0xd8b48a);
  // fairy lights along the north and west eaves
  const beads = [];
  const addBeads = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.32);
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin((t * L / 1.6) * Math.PI) ** 2 * 0.12;
      const s = new THREE.SphereGeometry(0.03, 6, 4);
      s.translate(ax + (bx - ax) * t, F + H - 0.08 - sag, az + (bz - az) * t);
      beads.push(s);
    }
  };
  addBeads(R.x0 + 0.1, R.z1 - 0.08, R.x1 - 0.1, R.z1 - 0.08);
  addBeads(R.x1 - 0.08, R.z0 + 0.1, R.x1 - 0.08, R.z1 - 0.1);
  const fairy = new THREE.Mesh(mergeGeometries(beads), mats.fairy);
  fairy.name = 'fairy_lights';
  group.add(fairy);

  // ---- library: the east wall, floor to ceiling
  const LB = { x0: X0 + T, x1: X0 + T + 0.38, z0: Z0 + 0.6, z1: Z1 - 0.7 };
  const shelfY = [];
  for (let y = F + 0.1; y < F + H - 0.25; y += 0.38) shelfY.push(y);
  parts.box('wood', LB.x0, F, LB.z0 - 0.04, LB.x1, F + H - 0.05, LB.z0, 0xc49a6c);
  parts.box('wood', LB.x0, F, LB.z1, LB.x1, F + H - 0.05, LB.z1 + 0.04, 0xc49a6c);
  for (let z = LB.z0 + 1.2; z < LB.z1 - 0.2; z += 1.2) parts.box('wood', LB.x0, F, z - 0.02, LB.x1, F + H - 0.05, z + 0.02, 0xc49a6c);
  for (const y of shelfY) parts.box('wood', LB.x0, y - 0.03, LB.z0, LB.x1, y, LB.z1, 0xc49a6c);
  parts.box('wood', LB.x0, F + H - 0.08, LB.z0 - 0.04, LB.x1 + 0.02, F + H - 0.03, LB.z1 + 0.04, 0xb88c5e);
  solid(LB.x0, LB.z0, LB.x1, LB.z1, F, F + H);
  const SPINES = [0x7a2e2e, 0x1f3a5f, 0xc9a24a, 0x2f5d50, 0xe8e0cf, 0x2c4a2a, 0xa4532e, 0x1c1c1c, 0x8a8a8a, 0x5b3a6b, 0xd7c3a1, 0x3f6f8f, 0x9c2f45, 0xe0b46c, 0x435b3a];
  const br = rng(808);
  for (const y of shelfY) {
    let z = LB.z0 + 0.03;
    while (z < LB.z1 - 0.05) {
      if (br() < 0.035) { z += 0.25 + br() * 0.3; continue; }              // a gap, or a small object
      const t = 0.022 + br() * 0.035, h = 0.19 + br() * 0.13, dpt = 0.16 + br() * 0.07;
      const lean = br() < 0.04;
      const g = new THREE.BoxGeometry(dpt, h, t);
      if (lean) { g.translate(0, h / 2, 0); g.rotateX(0.18); g.translate(0, -h / 2, 0); }
      g.translate(LB.x0 + 0.02 + dpt / 2 + (0.36 - dpt - 0.02), y + h / 2, z + t / 2);
      parts.add('paint', g, SPINES[Math.floor(br() * SPINES.length)]);
      z += t + 0.002;
      if (z > Math.floor((z - LB.z0) / 1.2) * 1.2 + LB.z0 + 1.17 && br() < 0.9) z = Math.ceil((z - LB.z0) / 1.2) * 1.2 + LB.z0 + 0.03;
    }
  }
  // a rolling library ladder
  for (const dz of [-0.22, 0.22]) {
    const g = new THREE.CylinderGeometry(0.02, 0.02, 3.0, 8);
    g.rotateZ(-0.2); g.translate(LB.x1 + 0.32, F + 1.45, 46.6 + dz);
    parts.add('brass', g, 0xb08d57);
  }
  for (let k = 0; k < 7; k++) {
    const y = F + 0.3 + k * 0.38, x = LB.x1 + 0.6 - (y - F) * 0.2;
    parts.box('wood', x - 0.03, y, 46.35, x + 0.03, y + 0.03, 46.85, 0xb88c5e);
  }

  // ---- reading corner (south-east): armchair, footstool, floor lamp, side table, rug
  parts.cyl('fabric', 100.0, F + 0.01, 44.4, 1.15, 1.15, 0.015, 0xd9c7a8, 32);
  const chair = (cx, cz, rot, col) => {
    parts.rbox('fabric', cx, F + 0.1, cz, 0.85, 0.42, 0.8, 0.08, col, rot);
    const back = new RoundedBoxGeometry(0.85, 0.55, 0.18, 3, 0.07);
    back.translate(0, 0.25, -0.33); back.rotateY(rot); back.translate(cx, F + 0.52, cz);
    parts.add('fabric', back, col);
    for (const sx of [-1, 1]) {
      const arm = new RoundedBoxGeometry(0.14, 0.32, 0.78, 3, 0.05);
      arm.translate(sx * 0.4, 0.16, 0); arm.rotateY(rot); arm.translate(cx, F + 0.42, cz);
      parts.add('fabric', arm, col);
    }
    for (const [lx, lz] of [[-0.35, -0.32], [0.35, -0.32], [-0.35, 0.32], [0.35, 0.32]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      parts.cyl('wood', cx + lx * c + lz * s, F, cz - lx * s + lz * c, 0.02, 0.025, 0.12, 0x6b4a2f, 8);
    }
    solid(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, F, F + 1);
  };
  chair(99.9, 44.2, -2.4, 0xb4683c);                     // terracotta velvet, angled to the sea
  parts.rbox('fabric', 100.6, F, 45.15, 0.5, 0.36, 0.4, 0.06, 0xb4683c);
  parts.cyl('metal', 99.1, F, 43.4, 0.16, 0.16, 0.03, 0x1d1d1d, 20);
  parts.cyl('metal', 99.1, F, 43.4, 0.012, 0.012, 1.55, 0x1d1d1d, 8);
  const shade = new THREE.CylinderGeometry(0.16, 0.24, 0.26, 20, 1, true);
  shade.translate(99.1, F + 1.55, 43.4);
  parts.add('glow', shade, 0xf3e6cf);
  parts.cyl('wood', 99.2, F, 45.1, 0.22, 0.22, 0.5, 0x8a6240, 18);
  parts.box('paint', 99.08, F + 0.5, 45.0, 99.3, F + 0.54, 45.16, 0x1f3a5f);                 // a book on the side table
  parts.cyl('paper', 99.32, F + 0.5, 45.2, 0.04, 0.035, 0.08, 0xf5f1e8, 12);                  // chai
  solid(98.9, 43.1, 99.4, 43.7, F, F + 1.6);

  // ---- daybed facing the sea, coffee table, big rug
  parts.box('fabric', 101.6, F, 46.0, 105.4, F + 0.012, 49.6, 0xcfc3b0);
  parts.rbox('wood', 103.5, F, 46.9, 2.3, 0.28, 0.95, 0.03, 0x9c7450);
  parts.rbox('fabric', 103.5, F + 0.28, 46.9, 2.2, 0.18, 0.9, 0.06, 0xefe9de);
  parts.rbox('fabric', 103.5, F + 0.46, 46.52, 2.1, 0.42, 0.2, 0.08, 0xe5dccb);
  for (const [cx, col] of [[102.8, 0x5f7387], [103.5, 0xc9a24a], [104.2, 0xa4532e]]) parts.rbox('fabric', cx, F + 0.46, 46.72, 0.48, 0.4, 0.14, 0.07, col);
  solid(102.35, 46.4, 104.65, 47.4, F, F + 1);
  parts.rbox('wood', 103.5, F + 0.3, 48.4, 1.2, 0.05, 0.65, 0.02, 0xb88c5e);
  for (const [lx, lz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) parts.cyl('wood', 103.5 + lx, F, 48.4 + lz, 0.025, 0.025, 0.3, 0x8a6240, 8);
  parts.cyl('paper', 103.2, F + 0.35, 48.35, 0.09, 0.07, 0.12, 0xe8e1d4, 16);                // a bowl of shells
  solid(102.9, 48.07, 104.1, 48.73, F, F + 0.4);

  // ---- credenza on the south wall with the radio
  parts.rbox('wood', 106.6, F, Z0 + T + 0.25, 2.2, 0.62, 0.45, 0.02, 0xa87b52);
  solid(105.5, Z0 + T, 107.7, Z0 + T + 0.5, F, F + 0.7);
  const radio = { x: 106.0, z: Z0 + T + 0.25 };
  parts.rbox('wood', radio.x, F + 0.62, radio.z, 0.42, 0.26, 0.2, 0.03, 0x6b4a2f);
  parts.box('fabric', radio.x - 0.18, F + 0.67, radio.z + 0.101, radio.x + 0.02, F + 0.84, radio.z + 0.105, 0xd9cbb0, false);
  parts.cyl('brass', radio.x + 0.11, F + 0.72, radio.z + 0.1, 0.045, 0.045, 0.02, 0xb08d57, 16);
  interact.push({ kind: 'radio', label: 'Play music', pos: [radio.x, F + 0.8, radio.z], r: 1.8 });
  parts.cyl('paper', 107.4, F + 0.62, Z0 + T + 0.25, 0.08, 0.06, 0.3, 0x2f5d50, 16);           // vase
  for (let k = 0; k < 3; k++) {
    const g = new THREE.CylinderGeometry(0.004, 0.004, 0.45, 4);
    g.rotateZ((k - 1) * 0.25); g.translate(107.4 + (k - 1) * 0.05, F + 1.12, Z0 + T + 0.25);
    parts.add('leaf', g, 0x6b7a3a);
  }

  // ---- writing desk at the west glass, chair, notebook, lamp
  parts.rbox('wood', 111.25, F + 0.72, 44.3, 0.75, 0.04, 1.8, 0.01, 0xc49a6c);
  for (const [dx, dz] of [[-0.3, -0.82], [0.3, -0.82], [-0.3, 0.82], [0.3, 0.82]]) parts.cyl('metal', 111.25 + dx, F, 44.3 + dz, 0.018, 0.018, 0.72, 0x1d1d1d, 8);
  solid(110.85, 43.4, 111.65, 45.2, F, F + 0.8);
  parts.box('paper', 111.0, F + 0.76, 44.0, 111.32, F + 0.765, 44.45, 0xfbf8f0);               // open notebook
  parts.box('paper', 111.0, F + 0.76, 44.47, 111.32, F + 0.765, 44.9, 0xf7f2e6);
  const pen = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6); pen.rotateX(Math.PI / 2); pen.rotateY(0.4); pen.translate(111.2, F + 0.772, 44.75);
  parts.add('brass', pen, 0x2a2a2a);
  parts.cyl('metal', 111.45, F + 0.76, 43.6, 0.07, 0.07, 0.02, 0x1d1d1d, 16);
  parts.cyl('metal', 111.45, F + 0.76, 43.6, 0.008, 0.008, 0.4, 0x1d1d1d, 6);
  const dl = new THREE.ConeGeometry(0.11, 0.14, 20, 1, true); dl.translate(111.4, F + 1.13, 43.65);
  parts.add('glow', dl, 0xf3e6cf);
  chair(110.35, 44.3, Math.PI / 2, 0x3f6f8f);

  // ---- easel by the north-west corner, a canvas in progress; stool with a palette
  const easel = { x: 109.6, z: 49.4, rot: Math.atan2(-5.5, -6.8) };
  const eg = [];
  for (const [lx, lz] of [[-0.3, 0], [0.3, 0], [0, -0.45]]) {
    const g = new THREE.CylinderGeometry(0.018, 0.022, 1.8, 6);
    g.translate(0, 0.9, 0);
    g.rotateX(lz ? 0.25 : -0.08); g.rotateZ(lx * -0.12);
    g.translate(lx, 0, lz);
    eg.push(g);
  }
  const ledge = new THREE.BoxGeometry(0.75, 0.04, 0.08); ledge.translate(0, 0.78, 0.06); eg.push(ledge);
  const easelGeo = mergeGeometries(eg.map((g) => g.toNonIndexed()));
  easelGeo.rotateY(easel.rot); easelGeo.translate(easel.x, F, easel.z);
  parts.add('wood', easelGeo, 0xa87b52);
  solid(easel.x - 0.45, easel.z - 0.45, easel.x + 0.45, easel.z + 0.45, F, F + 1.8);
  parts.cyl('wood', 108.7, F, 49.9, 0.18, 0.18, 0.6, 0x8a6240, 12);
  const pal = new THREE.CylinderGeometry(0.17, 0.17, 0.01, 20); pal.scale(1.2, 1, 0.85); pal.translate(108.7, F + 0.61, 49.9);
  parts.add('wood', pal, 0xd9b98a);
  for (const [i, c] of [0xc0392b, 0xe1a92a, 0x1f6f8b, 0xffffff, 0x2e7d32].entries()) parts.cyl('paint', 108.6 + Math.cos(i) * 0.1, F + 0.615, 49.9 + Math.sin(i) * 0.07, 0.022, 0.022, 0.012, c, 8);

  // ---- loungers at the north-west corner of the deck: clear of the studio, towards the sunset over the sea
  for (const lx of [110.35, 111.95]) {
    parts.rbox('wood', lx, F, Z1 + 1.35, 0.7, 0.3, 1.9, 0.03, 0x9c7450);
    parts.rbox('fabric', lx, F + 0.3, Z1 + 1.45, 0.66, 0.08, 1.5, 0.03, 0xf2ece0);
    const back = new RoundedBoxGeometry(0.66, 0.08, 0.7, 3, 0.03);
    back.rotateX(-0.85); back.translate(lx, F + 0.55, Z1 + 0.62);
    parts.add('fabric', back, 0xf2ece0);
    solid(lx - 0.36, Z1 + 0.35, lx + 0.36, Z1 + 2.3, F, F + 0.6);
    interact.push({ kind: 'lounger', label: 'Lie down and watch the sunset', pos: [lx, F + 0.5, Z1 + 1.4], r: 1.4, seat: { x: lx, z: Z1 + 1.5, y: F + 0.62, yaw: 0 } });
  }
  parts.cyl('wood', 109.2, F, Z1 + 1.2, 0.22, 0.22, 0.42, 0xa87b52, 16);

  // ---- plants
  const plant = (x, z, h, potCol) => {
    parts.cyl('paint', x, F, z, 0.2, 0.26, 0.42, potCol, 18);
    const lr = rng(Math.round(x * 100 + z));
    for (let k = 0; k < 14; k++) {
      const leaf = new THREE.SphereGeometry(0.16, 8, 6);
      leaf.scale(1, 0.25, 0.6);
      const a = lr() * Math.PI * 2, y = F + 0.5 + (k / 14) * (h - 0.6);
      leaf.rotateY(a); leaf.rotateZ(0.5);
      leaf.translate(x + Math.cos(a) * 0.18, y, z + Math.sin(a) * 0.18);
      parts.add('leaf', leaf, k % 2 ? 0x3d6b35 : 0x4f7f3f);
    }
    parts.cyl('wood', x, F + 0.42, z, 0.015, 0.015, h - 0.5, 0x5b4636, 6);
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, F, F + h);
  };
  plant(111.4, 50.4, 1.9, 0xe8e1d4);
  plant(99.0, 50.5, 1.6, 0x2f2f2f);
  plant(107.6, 42.75, 1.2, 0xc9b7a0);

  // ---- pendant lights
  for (const [x, z] of [[103.5, 47.6], [111.1, 44.3], [100.0, 44.4]]) {
    parts.cyl('metal', x, F + 1.95, z, 0.004, 0.004, H - 1.95, 0x1d1d1d, 4);
    const dome = new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(x, F + 1.95, z);
    parts.add('brass', dome, 0xb08d57);
    const bulb = new THREE.SphereGeometry(0.06, 12, 8); bulb.translate(x, F + 1.93, z);
    parts.add('glow', bulb, 0xffffff);
  }

  // ---- her paintings and poems
  const art = (pack && pack.art) || [];
  const byName = Object.fromEntries(art.map((a) => [a.file.split('/').pop(), a]));
  const hang = [];
  // south wall, inside face (z = Z0 + T), looking north
  const SW_Z = Z0 + T + 0.03;
  hang.push({ f: 'buddha.jpg', cx: 99.75, cy: F + 1.65, h: 1.0, face: [0, 1], z: SW_Z, frame: 0x2a1f16 });
  hang.push({ f: 'elephant.jpg', cx: 101.6, cy: F + 1.6, h: 0.8, face: [0, 1], z: SW_Z, frame: 0x2a1f16 });
  hang.push({ f: 'horses.jpg', cx: 106.6, cy: F + 1.75, h: 1.15, face: [0, 1], z: SW_Z, frame: 0xb08d57 });
  hang.push({ f: 'elephant_cutout.png', cx: 109.0, cy: F + 1.55, h: 0.78, face: [0, 1], z: SW_Z, frame: null });
  // the gallery partition: a free-standing oak panel, 12 small paintings on each face
  const PX = 106.4, PZ0 = 42.9, PZ1 = 46.6;
  parts.box('wood', PX - 0.07, F, PZ0, PX + 0.07, F + 2.3, PZ1, 0xe9dcc8);
  parts.box('wood', PX - 0.09, F, PZ0 - 0.02, PX + 0.09, F + 0.06, PZ1 + 0.02, 0x8a6240);
  solid(PX - 0.1, PZ0, PX + 0.1, PZ1, F, F + 2.3);
  const smalls = art.filter((a) => a.file.includes('small_')).map((a) => a.file.split('/').pop());
  const layoutFace = (list, sx) => {
    // two rows of six, salon-style, each painting ~0.38 m tall (wide ones shorter)
    list.forEach((f, i) => {
      const row = Math.floor(i / 6), col = i % 6;
      const a = byName[f], ratio = a.w / a.h;
      const h = ratio > 2 ? 0.26 : ratio < 0.5 ? 0.62 : 0.4;
      const cz = PZ0 + 0.35 + col * ((PZ1 - PZ0 - 0.7) / 5);
      const cy = F + (row === 0 ? 1.68 : 1.12) + (col % 2 ? 0.04 : -0.03);
      hang.push({ f, cx: PX + sx * 0.075, cy, cz, h: Math.min(h, ratio > 2 ? 0.26 : h), face: [sx, 0], frame: [0x1d1d1d, 0xf4f0e8, 0x8a6240][(i + (sx > 0 ? 1 : 0)) % 3], maxW: 0.58 });
    });
  };
  layoutFace(smalls.slice(0, 12), -1);         // east face: seen from the daybed
  layoutFace(smalls.slice(12, 24), 1);          // west face: seen from the desk
  const loader = new THREE.TextureLoader();
  const base = (pack && pack.base) || 'play/deepti/';
  for (const p of hang) {
    const a = byName[p.f];
    const ratio = a ? a.w / a.h : 1.25;
    let h = p.h, w = h * ratio;
    if (p.maxW && w > p.maxW) { w = p.maxW; h = w / ratio; }
    const mesh = paintingMesh(w, h, p.frame);
    if (p.face[0] === 0) mesh.position.set(p.cx, p.cy, p.z);
    else { mesh.position.set(p.cx, p.cy, p.cz); mesh.rotation.y = p.face[0] > 0 ? Math.PI / 2 : -Math.PI / 2; }
    group.add(mesh);
    const canvasMat = mesh.userData.canvas;
    if (a) {
      loader.load(base + a.file, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; canvasMat.map = tex; canvasMat.color.set(0xffffff); canvasMat.needsUpdate = true; });
      if (p.f.endsWith('.png')) { canvasMat.transparent = false; canvasMat.alphaTest = 0.4; }
      const normal = p.face[0] === 0 ? [0, 1] : [p.face[0], 0];
      interact.push({ kind: 'art', label: 'Look at the painting', url: base + a.file, pos: [mesh.position.x, p.cy, mesh.position.z], normal, r: 1.9 });
    }
    // a brass picture light over the big ones
    if (p.face[0] === 0 && w > 0.7) {
      parts.box('brass', p.cx - w * 0.3, p.cy + h / 2 + 0.12, SW_Z, p.cx + w * 0.3, p.cy + h / 2 + 0.17, SW_Z + 0.12, 0xb08d57);
      parts.box('glow', p.cx - w * 0.28, p.cy + h / 2 + 0.115, SW_Z + 0.08, p.cx + w * 0.28, p.cy + h / 2 + 0.122, SW_Z + 0.11, 0xffffff);
    }
  }
  // poems: framed, on the south wall by the desk
  const poems = (pack && pack.poems) || [];
  poems.forEach((poem, i) => {
    const w = i === 0 ? 0.62 : 0.72, h = i === 0 ? 0.78 : 1.06;
    const tex = poemTexture(poem, w / h);
    const mesh = paintingMesh(w, h, 0xf4f0e8, tex);
    const cx = 110.45 + i * 0.95;
    mesh.position.set(cx, F + 1.55, SW_Z);
    group.add(mesh);
    interact.push({ kind: 'poem', index: i, label: `Read “${poem.title}”`, pos: [cx, F + 1.55, SW_Z], normal: [0, 1], r: 1.9 });
  });
  // the canvas on the easel: one of hers, as if still being painted
  const easelPick = byName['small_19.jpg'] || art[0];
  if (easelPick) {
    const ratio = easelPick.w / easelPick.h, h = 0.62, w = h * ratio;
    const mesh = paintingMesh(w, h, 0xf4f0e8);
    mesh.position.set(easel.x + Math.sin(easel.rot) * 0.1, F + 1.12, easel.z + Math.cos(easel.rot) * 0.1);
    mesh.rotation.set(-0.12, easel.rot, 0, 'YXZ');
    group.add(mesh);
    loader.load(base + easelPick.file, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; mesh.userData.canvas.map = tex; mesh.userData.canvas.color.set(0xffffff); mesh.userData.canvas.needsUpdate = true; });
    interact.push({ kind: 'art', label: 'Look at the canvas', url: base + easelPick.file, pos: [mesh.position.x, F + 1.1, mesh.position.z], normal: [Math.sin(easel.rot), Math.cos(easel.rot)], r: 1.8 });
  }

  for (const m of parts.meshes(mats)) group.add(m);

  // lights: one warm room light and a little light over the deck, both after dark
  const room = new THREE.PointLight(0xffc98f, 0, 14, 2);
  room.position.set(104.5, F + 2.5, 46.8);
  const deckLight = new THREE.PointLight(0xffc98f, 0, 9, 2);
  deckLight.position.set(103, F + 2.6, Z1 + 1.2);
  group.add(room, deckLight);

  return {
    group, carColliders, interact, mats,
    walk: { colliders: walkColliders, surfaces: walkSurfaces },
    setNight(on) {
      mats.glow.emissiveIntensity = on ? 1.6 : 0;
      mats.fairy.emissiveIntensity = on ? 2.4 : 0;
      room.intensity = on ? 16 : 0;
      deckLight.intensity = on ? 5 : 0;
    },
    entry: { x: 103.9, z: 37.4 },          // on the boardwalk, facing the steps
  };
}

// a framed canvas: a thin frame (or none) and a canvas plane facing +Z
function paintingMesh(w, h, frameColor, tex) {
  const g = new THREE.Group();
  const canvas = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0xece6da, map: tex || null, roughness: 0.85 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), canvas);
  plane.position.z = 0.025;
  g.add(plane);
  if (frameColor != null) {
    const fw = 0.035, fd = 0.04;
    const mat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.5, metalness: frameColor === 0xb08d57 ? 0.8 : 0.05 });
    for (const [x, y, ww, hh] of [[0, h / 2 + fw / 2, w + fw * 2, fw], [0, -h / 2 - fw / 2, w + fw * 2, fw], [-w / 2 - fw / 2, 0, fw, h], [w / 2 + fw / 2, 0, fw, h]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, fd), mat);
      b.position.set(x, y, fd / 2);
      b.castShadow = true;
      g.add(b);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat);
    back.position.z = 0.012;
    g.add(back);
  }
  g.userData.canvas = canvas;
  return g;
}

// a poem on cream paper: title, lines in stanzas, date, signature
export function poemTexture(poem, ratio) {
  const W = 1024, Hh = Math.round(W / ratio);
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, W, Hh);
  const r = rng(5);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(150,120,80,${r() * 0.05})`; g.fillRect(r() * W, r() * Hh, 2, 2); }
  g.strokeStyle = 'rgba(140,110,70,0.35)'; g.lineWidth = 2; g.strokeRect(40, 40, W - 80, Hh - 80);
  const lines = poem.stanzas.reduce((n, s) => n + s.length, 0) + poem.stanzas.length;
  const size = Math.min(34, Math.floor((Hh - 330) / (lines * 1.45)));
  g.fillStyle = '#3a2a1c'; g.textAlign = 'center';
  g.font = `italic 600 ${Math.round(size * 1.7)}px Georgia, 'Times New Roman', serif`;
  g.fillText(poem.title, W / 2, 150);
  if (poem.date) { g.font = `${Math.round(size * 0.8)}px Georgia, serif`; g.fillStyle = '#7a6448'; g.fillText(poem.date, W / 2, 150 + size * 1.5); }
  g.fillStyle = '#3a2a1c';
  g.font = `italic ${size}px Georgia, 'Times New Roman', serif`;
  let y = 150 + size * 3.4;
  for (const st of poem.stanzas) {
    for (const ln of st) { fitText(g, ln, W / 2, y, W - 150); y += size * 1.45; }
    y += size * 0.8;
  }
  g.font = `italic ${Math.round(size * 1.05)}px Georgia, serif`;
  g.fillStyle = '#7a6448';
  g.fillText('— Deepti', W / 2, Math.min(Hh - 80, y + size));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function fitText(g, s, x, y, maxW) {
  const w = g.measureText(s).width;
  if (w <= maxW) { g.fillText(s, x, y); return; }
  g.save(); g.translate(x, y); g.scale(maxW / w, 1); g.fillText(s, 0, 0); g.restore();
}
