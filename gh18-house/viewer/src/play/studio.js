import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { STUDIO } from './site.js';
import { normalFromImage, plasterNormal, weaveNormal, canvasNormal, spineAtlas, spineUV, SPINE_CELLS } from './surfaces.js';
import { groundHeight } from './beach.js';

// Deepti's Studio, on the beach: two storeys and a roof terrace, facing the sea (north) and the sunset (west).
//   Ground floor (oak, +0.6 m on a teak deck):
//   - the library (east): a round birch-ply bookshelf with a cushioned seat inside (E to curl up), full-height
//     shelves either side, a reading chair, her chai
//   - the lounge: a long linen sofa facing the sea (E to sit), an oak coffee table with her photo album, the
//     radio on a credenza for the music
//   - the gallery (west): a lit partition hung both sides, a bench to sit and look (E), a sculpture, cane chairs
//   - an oak stair cantilevered from the south wall, a salon of her paintings climbing beside it
//   Upstairs: her atelier under north light: easels (one of hers in progress), a work table of brushes and
//   paints, flat files, canvases leaning on the wall, a mood board of her photographs, a reading corner, the
//   writing desk at the glass with her poems framed beside it
//   Roof terrace (west, over the gallery): a glass balustrade, a pergola with floor seating (E) and fairy
//   lights, loungers to the sunset, bougainvillea tumbling down the front
//   Outside: her name in bronze letters on the front (a warm halo after dark), an oak canopy and a plaque at
//   the door, a frangipani, her bicycle, path lights, a planter of grasses and lavender; loungers on the deck
//
// Paintings, poems, photos and music come from the personal pack (play/deepti/pack.json); there are about
// 50 places for paintings and they fill in order (anything past the first ~28 goes upstairs). Without the
// pack (a public build) the walls stay bare and the poems are not shown.
//
// Returns geometry plus what the rest of /play/ needs: car colliders (metres), the walker's colliders
// and floors (plan millimetres, like the tour's house data), things to interact with, and the lights.

const { x0: X0, z0: Z0, w: SW, d: SD, floor: F } = STUDIO;
const X1 = X0 + SW, Z1 = Z0 + SD;
const CH = F + 3.1;                  // ground floor ceiling
const U = F + 3.4;                   // upstairs floor (and the terrace)
const H2 = 3.0;                      // upstairs, floor to ceiling
const UX1 = 107;                     // the upper storey's west wall; the terrace beyond it
const T = 0.25;                      // solid wall thickness
const DOOR = [99.6, 101.4];          // the front door, in the south wall
export const BEACH_DOOR = [106.5, 108.3];   // glass slider in the north wall, out onto the deck and down to the beach
const TD = [45.8, 47.6];             // upstairs: the door out onto the terrace (in the west wall)
// the stair: along the south wall, rising east from the lounge to the atelier; 19 risers
const ST = { xBot: 106.9, z0: Z0 + T, z1: Z0 + 1.45, n: 19, R: (U - F) / 19, G: 0.28 };
ST.xTop = ST.xBot - (ST.n - 1) * ST.G;
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
  const solid = (x0, z0, x1, z1, y0 = F, y1 = y0 + 2) => walkColliders.push({ poly: rectMM(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)), y0, y1 });
  const surf = (x0, z0, x1, z1, y) => walkSurfaces.push({ poly: rectMM(x0, z0, x1, z1), y });

  const oak = plankTexture([196, 150, 104], 3), teak = plankTexture([150, 104, 70], 4);
  const relief = (t, k) => { const n = normalFromImage(t.image, 512, k, 0.6); n.repeat.copy(t.repeat); return n; };
  const oakN = relief(oak, 2.2), teakN = relief(teak, 2.6);
  const plasterN = plasterNormal(); plasterN.repeat.set(1 / 2, 1 / 2);
  const cloth = weaveNormal(48, 31); cloth.repeat.set(6, 6);
  const v2 = (k) => new THREE.Vector2(k, k);
  const mats = {
    plinth: new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.9, vertexColors: true, normalMap: plasterN, normalScale: v2(0.8) }),
    deck: new THREE.MeshStandardMaterial({ map: teak, roughness: 0.7, vertexColors: true, normalMap: teakN, normalScale: v2(0.7) }),
    // oiled oak floor: a soft sheen, the grain and the plank joints catch the light
    floor: new THREE.MeshPhysicalMaterial({ map: oak, roughness: 0.42, vertexColors: true, normalMap: oakN, normalScale: v2(0.45), clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    plaster: new THREE.MeshStandardMaterial({ map: M.plaster?.map || null, color: 0xffffff, roughness: 0.92, vertexColors: true, normalMap: plasterN, normalScale: v2(0.5) }),
    wood: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.55, vertexColors: true, normalMap: oakN, normalScale: v2(0.35) }),
    paint: new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true }),
    books: new THREE.MeshStandardMaterial({ map: spineAtlas(), roughness: 0.72 }),
    // cloth: a woven relief and the soft sheen fabric has at grazing angles
    fabric: new THREE.MeshPhysicalMaterial({ roughness: 0.92, vertexColors: true, normalMap: cloth, normalScale: v2(0.5), sheen: 0.8, sheenRoughness: 0.55, sheenColor: 0xffffff }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.75, vertexColors: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 1, vertexColors: true }),
    glass: M.glass,
    glow: new THREE.MeshStandardMaterial({ color: 0xfff1d8, emissive: 0xffc27e, emissiveIntensity: 0, roughness: 0.5, vertexColors: true }),
    fairy: new THREE.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffcf8a, emissiveIntensity: 0, roughness: 0.4 }),
    leaf: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true, side: THREE.DoubleSide }),
    bloom: new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }),
    ply: new THREE.MeshStandardMaterial({ map: birchTexture(), roughness: 0.5, vertexColors: true }),   // pale birch plywood
  };
  mats.ply.normalMap = relief(mats.ply.map, 1.2); mats.ply.normalScale = v2(0.3);
  const anchors = {};                          // where cosy.js puts its candles

  // ================================================================== the building
  // ---- plinth and a teak deck all round; steps up from the boardwalk to the front door
  parts.box('plinth', DECK.x0, -0.5, DECK.z0, DECK.x1, F - 0.15, DECK.z1, 0xd2ccc0);
  parts.box('deck', DECK.x0, F - 0.15, DECK.z0, DECK.x1, F, DECK.z1, 0xffffff);
  surf(DECK.x0, DECK.z0, DECK.x1, Z0, F); surf(DECK.x0, Z1, DECK.x1, DECK.z1, F);          // the deck: a ring round the building
  surf(DECK.x0, Z0, X0, Z1, F); surf(X1, Z0, DECK.x1, Z1, F);
  carColliders.push({ poly: [[DECK.x0, DECK.z0 - 0.8], [DECK.x1, DECK.z0 - 0.8], [DECK.x1, DECK.z1], [DECK.x0, DECK.z1]] });
  for (const [h, z0, z1] of [[0.2, DECK.z0 - 0.8, DECK.z0 - 0.4], [0.4, DECK.z0 - 0.4, DECK.z0]]) {
    parts.box('deck', DOOR[0] - 0.4, -0.2, z0, DOOR[1] + 0.4, h, z1, 0xe8ddd0);
    surf(DOOR[0] - 0.4, z0, DOOR[1] + 0.4, z1, h);
  }
  // the boardwalk from the parking pad
  parts.box('deck', 95.2, -0.1, 36.4, DOOR[1] + 0.4, 0.12, DECK.z0 - 0.8, 0xd8c7b2);
  surf(95.2, 36.4, DOOR[1] + 0.4, DECK.z0 - 0.8, 0.12);

  // ---- floors: oak downstairs (round the stair), oak upstairs (round the stairwell), teak on the terrace
  parts.box('floor', X0, F, Z0, X1, F + 0.01, Z1, 0xffffff);
  surf(X0, ST.z1, X1, Z1, F); surf(X0, Z0, ST.xTop, ST.z1, F); surf(ST.xBot, Z0, X1, ST.z1, F);
  parts.box('floor', X0, U - 0.01, ST.z1, UX1, U, Z1, 0xffffff);
  parts.box('floor', X0, U - 0.01, Z0, ST.xTop, U, ST.z1, 0xffffff);
  surf(X0, ST.z1, UX1, Z1, U); surf(X0, Z0, ST.xTop, ST.z1, U);
  parts.box('deck', UX1, U - 0.01, Z0, X1, U, Z1, 0xf0e4d4);
  surf(UX1, Z0, X1, Z1, U);
  // the slab between the floors (white fascia outside, deep eaves to the north over the deck) and the
  // ceiling under it, open over the stair
  for (const [a, b, c, d] of [[X0 - 0.4, ST.z1, X1 + 0.9, Z1 + 1.8], [X0 - 0.4, Z0 - 0.5, ST.xTop, ST.z1], [UX1, Z0 - 0.5, X1 + 0.9, ST.z1], [ST.xTop, Z0 - 0.5, UX1, Z0]]) {
    parts.box('plaster', a, CH, b, c, U - 0.01, d, 0xfbfaf6);
  }
  for (const [a, b, c, d] of [[X0, ST.z1, X1, Z1], [X0, Z0, ST.xTop, ST.z1], [UX1, Z0, X1, ST.z1]]) parts.box('plaster', a, CH - 0.03, b, c, CH, d, 0xf7f3ec);
  parts.box('wood', X0 - 0.38, CH - 0.03, Z1, X1 + 0.88, CH, Z1 + 1.78, 0xe9d6bd);              // oak soffit on the eaves
  parts.box('wood', X1, CH - 0.03, Z0 - 0.48, X1 + 0.88, CH, Z1, 0xe9d6bd);

  // ---- ground floor walls: solid east and south (front door), glass to the sea (north) and the sunset (west)
  const GW = 0xf6f2ea;
  parts.box('plaster', X0, F, Z0, X0 + T, CH, Z1, GW); solid(X0, Z0, X0 + T, Z1);
  parts.box('plaster', X0, F, Z0, DOOR[0], CH, Z0 + T, GW); solid(X0, Z0, DOOR[0], Z0 + T);
  parts.box('plaster', DOOR[1], F, Z0, X1, CH, Z0 + T, GW); solid(DOOR[1], Z0, X1, Z0 + T);
  parts.box('plaster', DOOR[0], F + 2.5, Z0, DOOR[1], CH, Z0 + T, GW);
  parts.box('plaster', ST.xTop, CH, Z0, UX1, U, Z0 + T, GW);                                     // the stair wall runs up through the slab
  // the front door: a tall oak pivot door, standing open
  parts.box('wood', DOOR[0] + 0.02, F, Z0 + T, DOOR[0] + 0.08, F + 2.48, Z0 + T + 0.95, 0x8a6240);
  parts.cyl('brass', DOOR[0] + 0.1, F + 0.9, Z0 + T + 0.85, 0.012, 0.012, 0.4, 0xb08d57, 8);
  solid(DOOR[0], Z0 + T, DOOR[0] + 0.1, Z0 + T + 0.95);
  // glass runs with slim black mullions
  const glassX = (a, b, z, y0, y1) => {
    const L = b - a, n = Math.max(1, Math.round(L / 1.55)), step = L / n;
    parts.box('glass', a, y0, z - 0.03, b, y1, z);
    for (let i = 0; i <= n; i++) parts.box('metal', a + i * step - 0.035, y0, z - 0.07, a + i * step + 0.035, y1, z + 0.02, 0x1b1b1b);
    parts.box('metal', a, y0, z - 0.07, b, y0 + 0.06, z + 0.02, 0x1b1b1b);
    solid(a, z - 0.08, b, z + 0.02, y0);
  };
  const glassZ = (a, b, x, y0, y1) => {
    const L = b - a, n = Math.max(1, Math.round(L / 1.55)), step = L / n;
    parts.box('glass', x - 0.03, y0, a, x, y1, b);
    for (let i = 0; i <= n; i++) parts.box('metal', x - 0.07, y0, a + i * step - 0.035, x + 0.02, y1, a + i * step + 0.035, 0x1b1b1b);
    parts.box('metal', x - 0.07, y0, a, x + 0.02, y0 + 0.06, b, 0x1b1b1b);
    solid(x - 0.08, a, x + 0.02, b, y0);
  };
  glassX(X0 + T, BEACH_DOOR[0], Z1, F, CH);
  glassX(BEACH_DOOR[1], X1, Z1, F, CH);
  parts.box('glass', BEACH_DOOR[0] - 1.75, F, Z1 - 0.12, BEACH_DOOR[0] + 0.05, F + 2.5, Z1 - 0.08);          // the beach door, slid open
  parts.box('metal', BEACH_DOOR[0] - 1.75, F + 2.47, Z1 - 0.14, BEACH_DOOR[0] + 0.05, F + 2.53, Z1 - 0.06, 0x1b1b1b);
  parts.box('metal', BEACH_DOOR[0] - 0.02, F, Z1 - 0.14, BEACH_DOOR[0] + 0.04, F + 2.5, Z1 - 0.06, 0x1b1b1b);
  parts.box('metal', BEACH_DOOR[0], F + 2.5, Z1 - 0.07, BEACH_DOOR[1], CH, Z1 + 0.02, 0x1b1b1b);
  parts.box('wood', BEACH_DOOR[0], F, Z1 - 0.08, BEACH_DOOR[1], F + 0.012, Z1 + 0.04, 0x9c7450);
  glassZ(Z0 + T, Z1, X1, F, CH);

  // ---- the stair: oak treads cantilevered from the south wall, a glass balustrade with a brass rail
  const slant = (key, x0, y0, x1, y1, z, h, th, color) => {        // a panel whose bottom edge runs from (x0, y0) to (x1, y1)
    const L = x1 - x0, g = new THREE.BoxGeometry(L, h, th), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + (p.getX(i) / L + 0.5) * (y1 - y0));
    g.computeVertexNormals();
    g.translate((x0 + x1) / 2, y0 + h / 2, z);
    parts.add(key, g, color);
  };
  for (let k = 1; k <= ST.n - 1; k++) {
    const xHi = ST.xBot - (k - 1) * ST.G, xLo = xHi - ST.G, h = F + k * ST.R;
    parts.box('wood', xLo - 0.02, h - 0.065, ST.z0, xHi, h, ST.z1 - 0.03, 0xc8a070);
    surf(xLo, ST.z0, xHi, ST.z1, h);
    if (k >= 3) solid(xLo, ST.z0, xHi, ST.z1, F, h - 0.25);
  }
  slant('metal', ST.xTop, U - 0.32, ST.xBot, F - 0.32, ST.z1 - 0.02, 0.3, 0.02, 0x1d1d1d);     // a slim steel stringer on the open side
  slant('glass', ST.xTop, U + 0.04, ST.xBot, F + 0.04, ST.z1 - 0.01, 0.92, 0.015);
  slant('brass', ST.xTop, U + 0.96, ST.xBot, F + 0.96, ST.z1 - 0.01, 0.035, 0.05, 0xb08d57);
  solid(ST.xTop, ST.z1 - 0.04, ST.xBot, ST.z1 + 0.04, F, U + 1.2);
  // upstairs: a glass guard along the stairwell
  parts.box('glass', ST.xTop, U, ST.z1 - 0.02, UX1, U + 1.0, ST.z1 - 0.005);
  parts.box('brass', ST.xTop, U + 1.0, ST.z1 - 0.035, UX1, U + 1.035, ST.z1 + 0.015, 0xb08d57);

  // ---- upstairs: her atelier. Solid east, south and west (a door to the terrace), all glass to the sea
  const UW = 0xf8f5ef, U1 = U + H2;
  parts.box('plaster', X0, U, Z0, X0 + T, U1, Z1, UW); solid(X0, Z0, X0 + T, Z1, U);
  parts.box('plaster', X0, U, Z0, UX1, U1, Z0 + T, UW); solid(X0, Z0, UX1, Z0 + T, U);
  parts.box('plaster', UX1 - T, U, Z0, UX1, U1, TD[0], UW); solid(UX1 - T, Z0, UX1, TD[0], U);
  parts.box('plaster', UX1 - T, U, TD[1], UX1, U1, Z1, UW); solid(UX1 - T, TD[1], UX1, Z1, U);
  parts.box('plaster', UX1 - T, U + 2.5, TD[0], UX1, U1, TD[1], UW);
  parts.box('glass', UX1 - 0.12, U, TD[0] - 1.75, UX1 - 0.08, U + 2.5, TD[0] + 0.05);           // the terrace door, slid open
  parts.box('metal', UX1 - 0.14, U, TD[0] - 0.02, UX1 - 0.06, U + 2.5, TD[0] + 0.04, 0x1b1b1b);
  parts.box('wood', UX1 - T, U, TD[0], UX1, U + 0.012, TD[1], 0x9c7450);
  glassX(X0 + T, UX1 - T, Z1, U, U1);
  parts.box('plaster', X0, U1 - 0.03, Z0, UX1, U1, Z1, 0xf7f3ec);                                 // ceiling
  parts.box('plaster', X0 - 0.5, U1, Z0 - 0.5, UX1 + 0.5, U1 + 0.25, Z1 + 0.9, 0xfbfaf6);         // roof, its eaves
  parts.box('wood', X0 - 0.48, U1 - 0.02, Z1, UX1 + 0.48, U1, Z1 + 0.88, 0xe9d6bd);
  // outside, the upper volume is wrapped in vertical oak battens (south and east), flat oak on the west
  const BAT = 0xb98a5c;
  const battens = (axis, a, b, fixed, out) => {
    for (let s = a + 0.05; s < b - 0.02; s += 0.11) {
      if (axis === 'x') parts.box('wood', s - 0.024, U - 0.3, fixed + out * 0.02, s + 0.024, U1 + 0.02, fixed + out * 0.075, BAT);
      else parts.box('wood', fixed + out * 0.02, U - 0.3, s - 0.024, fixed + out * 0.075, U1 + 0.02, s + 0.024, BAT);
    }
    if (axis === 'x') parts.box('wood', a, U - 0.3, fixed + out * 0.005, b, U1, fixed + out * 0.02, 0x4a3524);
    else parts.box('wood', fixed + out * 0.005, U - 0.3, a, fixed + out * 0.02, U1, b, 0x4a3524);
  };
  battens('x', X0 - 0.07, UX1, Z0, -1);
  battens('z', Z0, Z1, X0, -1);
  parts.box('wood', UX1, U, Z0, UX1 + 0.03, U1, TD[0], 0xc49a6c);
  parts.box('wood', UX1, U, TD[1], UX1 + 0.03, U1, Z1, 0xc49a6c);
  parts.box('wood', UX1, U + 2.5, TD[0], UX1 + 0.03, U1, TD[1], 0xc49a6c);

  // ---- the roof terrace: a glass balustrade, a pergola, planters; bougainvillea spilling over the edge
  const PH = 1.05;
  parts.box('glass', UX1, U, Z0, X1, U + PH, Z0 + 0.03); parts.box('brass', UX1, U + PH, Z0 - 0.01, X1, U + PH + 0.035, Z0 + 0.045, 0xb08d57);
  parts.box('glass', X1 - 0.03, U, Z0, X1, U + PH, Z1); parts.box('brass', X1 - 0.045, U + PH, Z0, X1 + 0.01, U + PH + 0.035, Z1, 0xb08d57);
  parts.box('glass', UX1, U, Z1 - 0.03, X1, U + PH, Z1); parts.box('brass', UX1, U + PH, Z1 - 0.045, X1, U + PH + 0.035, Z1 + 0.01, 0xb08d57);
  solid(UX1, Z0, X1, Z0 + 0.06, U, U + 1.3); solid(X1 - 0.06, Z0, X1, Z1, U, U + 1.3); solid(UX1, Z1 - 0.06, X1, Z1, U, U + 1.3);
  const PG = { x0: 110.9, x1: 115.4, z0: 42.6, z1: 48.8, h: 2.65 };
  for (const [px, pz] of [[PG.x0, PG.z0], [PG.x1, PG.z0], [PG.x0, PG.z1], [PG.x1, PG.z1]]) {
    parts.box('wood', px - 0.06, U, pz - 0.06, px + 0.06, U + PG.h, pz + 0.06, 0x8a6240);
    solid(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, U, U + 2);
  }
  for (const pz of [PG.z0, PG.z1]) parts.box('wood', PG.x0 - 0.3, U + PG.h, pz - 0.07, PG.x1 + 0.3, U + PG.h + 0.16, pz + 0.07, 0x8a6240);
  for (let x = PG.x0 - 0.2; x <= PG.x1 + 0.2; x += 0.3) parts.box('wood', x - 0.025, U + PG.h + 0.16, PG.z0 - 0.4, x + 0.025, U + PG.h + 0.26, PG.z1 + 0.4, 0xa87b52);
  // planters along the south and west parapets
  const planter = (x0, z0, x1, z1, y) => { parts.box('plaster', x0, y, z0, x1, y + 0.45, z1, 0xe4dccd); parts.box('paint', x0 + 0.04, y + 0.4, z0 + 0.04, x1 - 0.04, y + 0.43, z1 - 0.04, 0x4a3828); solid(x0, z0, x1, z1, y, y + 0.5); };
  planter(UX1 + 0.3, Z0 + 0.08, X1 - 0.6, Z0 + 0.55, U);
  planter(X1 - 0.55, Z0 + 0.6, X1 - 0.08, 46.0, U);

  const signW = 5.6, signX = 107.0, signY = F + 2.05, signZ = Z0 - 0.03;
  // ---- foliage: leaves and flowers as small cards (merged)
  const leafCard = (x, y, z, s, col, key = 'leaf', tilt = 0.6, r = Math.random) => {
    const g = new THREE.PlaneGeometry(s, s * 0.62);
    g.rotateX(-Math.PI / 2 + tilt * (r() - 0.3)); g.rotateY(r() * Math.PI * 2); g.translate(x, y, z);
    parts.add(key, g, col);
  };
  const BOUG = [0xc2185b, 0xd81b60, 0xad1457, 0xe04884], GREEN = [0x3d6b35, 0x4f7f3f, 0x355e2e];
  const fr = rng(4242);
  // bougainvillea: in the terrace planters, tumbling down the south facade
  for (let i = 0; i < 1100; i++) {
    const x = UX1 + 0.4 + fr() * (X1 - UX1 - 1.0), drop = fr() ** 1.6 * (x < signX + signW / 2 + 0.3 ? 0.5 : 2.1);   // (clear of the sign)
    const out = drop > 0.1 ? -0.12 - fr() * 0.25 : 0.1 + fr() * 0.35;
    const y = U + 0.5 + fr() * 0.35 - drop, z = Z0 + out;
    if (fr() < 0.6) leafCard(x, y, z, 0.12 + fr() * 0.08, BOUG[i % 4], 'bloom', 1.4, fr);
    else leafCard(x, y, z, 0.14, GREEN[i % 3], 'leaf', 1.2, fr);
  }
  for (let i = 0; i < 450; i++) {
    const z = Z0 + 0.7 + fr() * 5.2, drop = fr() ** 2 * 1.5;
    const x = drop > 0.1 ? X1 + 0.1 + fr() * 0.2 : X1 - 0.5 + fr() * 0.4;
    if (fr() < 0.6) leafCard(x, U + 0.55 + fr() * 0.3 - drop, z, 0.12 + fr() * 0.08, BOUG[i % 4], 'bloom', 1.4, fr);
    else leafCard(x, U + 0.55 + fr() * 0.3 - drop, z, 0.14, GREEN[i % 3], 'leaf', 1.2, fr);
  }

  // ---- the name on the front: dark bronze letters on the white wall, a warm halo behind them at night
  const signTex = signTexture("Deepti's Studio", 'paintings · poems · music', false), haloTex = signTexture("Deepti's Studio", 'paintings · poems · music', true);
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, transparent: true, alphaTest: 0.35, metalness: 0.35, roughness: 0.45, color: 0xffffff });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW * 0.25), signMat);
  sign.position.set(signX, signY, signZ - 0.025); sign.rotation.y = Math.PI; sign.castShadow = true;
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffb767 });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(signW * 1.1, signW * 0.25 * 1.35), haloMat);
  halo.position.set(signX, signY, signZ - 0.005); halo.rotation.y = Math.PI; halo.renderOrder = 2;
  group.add(sign, halo);
  // a slatted oak canopy over the front door, brass sconces either side, a plaque
  for (let x = DOOR[0] - 0.55; x <= DOOR[1] + 0.55; x += 0.12) parts.box('wood', x - 0.03, F + 2.62, Z0 - 1.0, x + 0.03, F + 2.7, Z0, 0x9c7450);
  parts.box('metal', DOOR[0] - 0.6, F + 2.56, Z0 - 1.02, DOOR[1] + 0.6, F + 2.62, Z0, 0x1d1d1d);
  for (const x of [DOOR[0] - 0.35, DOOR[1] + 0.35]) {
    parts.cyl('brass', x, F + 1.85, Z0 - 0.09, 0.05, 0.05, 0.3, 0xb08d57, 16);
    parts.cyl('glow', x, F + 1.88, Z0 - 0.09, 0.035, 0.035, 0.24, 0xffffff, 12);
  }
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.55 }));
  plaque.position.set(DOOR[1] + 0.55, F + 1.35, Z0 - 0.012); plaque.rotation.y = Math.PI; group.add(plaque);
  // a long planter of grasses and lavender along the front, path lights on the boardwalk
  parts.box('plaster', 104.0, F, Z0 - 0.75, X1 - 0.3, F + 0.38, Z0 - 0.25, 0xe4dccd);
  solid(104.0, Z0 - 0.75, X1 - 0.3, Z0 - 0.25, F, F + 0.5);
  for (let i = 0; i < 260; i++) {
    const x = 104.1 + fr() * (X1 - 104.5), z = Z0 - 0.7 + fr() * 0.4;
    const g = new THREE.PlaneGeometry(0.02, 0.35 + fr() * 0.3); g.translate(0, 0.2, 0); g.rotateZ((fr() - 0.5) * 0.6); g.rotateY(fr() * 3);
    g.translate(x, F + 0.36, z); parts.add('leaf', g, i % 7 ? 0x8a9a5b : 0x7a6fae);
  }
  for (const x of [96.2, 98.0, 99.8]) {
    parts.cyl('metal', x, 0.12, 36.25, 0.05, 0.05, 0.6, 0x1d1d1d, 12);
    parts.cyl('glow', x, 0.62, 36.25, 0.045, 0.045, 0.1, 0xffffff, 12);
  }
  // a frangipani by the steps, her bicycle against the wall
  frangipani(parts, 97.0, 35.5, groundHeight(97.0, 35.5), rng(77));                 // at the start of the boardwalk
  carColliders.push({ circle: [97.0, 35.5, 0.4] }); solid(96.8, 35.3, 97.2, 35.7, -0.5, 3);
  const bike = bicycleGroup();
  bike.position.set(102.75, F, Z0 - 0.45); bike.rotation.set(0.09, Math.PI + 0.06, 0);   // front wheel to the east, leaning on its stand
  group.add(bike);
  solid(101.85, Z0 - 0.75, 103.65, Z0 - 0.15, F, F + 1);
  // a pair of loungers on the north deck, under the eaves
  for (const lx of [112.6, 114.2]) {
    parts.rbox('wood', lx, F, Z1 + 1.35, 0.7, 0.3, 1.9, 0.03, 0x9c7450);
    parts.rbox('fabric', lx, F + 0.3, Z1 + 1.45, 0.66, 0.08, 1.5, 0.03, 0xf2ece0);
    const back = new RoundedBoxGeometry(0.66, 0.08, 0.7, 3, 0.03);
    back.rotateX(-0.85); back.translate(lx, F + 0.55, Z1 + 0.62);
    parts.add('fabric', back, 0xf2ece0);
    solid(lx - 0.36, Z1 + 0.35, lx + 0.36, Z1 + 2.3, F, F + 0.6);
    interact.push({ kind: 'lounger', label: 'Lie down and watch the sunset', pos: [lx, F + 0.5, Z1 + 1.4], r: 1.4, seat: { x: lx, z: Z1 + 1.5, y: F + 0.62, yaw: 0 } });
  }
  parts.cyl('wood', 111.8, F, Z1 + 1.2, 0.22, 0.22, 0.42, 0xa87b52, 16);

  // ================================================================== inside: the library (east)
  // a round birch-ply bookshelf against the east wall with a cushioned seat inside, like the owner's
  // reference. The ring stands in the YZ plane, its open front facing the room (+X).
  const RN = { R: 1.2, band: 0.34, D: 0.5, x: X0 + T, z: 46.4 };
  RN.y = F + RN.R;
  const rIn = RN.R - RN.band;
  const ply = 0xefdcbc, plyEdge = 0xe3caa2;
  const place = (g) => { g.rotateY(Math.PI / 2); g.translate(RN.x, RN.y, RN.z); return g; };
  const annulus = (r0, r1, depth, z0 = 0) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, r1, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, r0, 0, Math.PI * 2, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 72 });
    g.translate(0, 0, z0);
    return place(g);
  };
  parts.add('ply', annulus(RN.R - 0.026, RN.R, RN.D), ply);
  parts.add('ply', annulus(rIn, rIn + 0.026, RN.D), ply);
  parts.add('ply', annulus(rIn, RN.R, 0.018), plyEdge);
  const NC = 16;
  for (let k = 0; k < NC; k++) {
    const a = (k / NC) * Math.PI * 2 + Math.PI / NC;
    const g = new THREE.BoxGeometry(RN.band, 0.022, RN.D);
    g.translate((rIn + RN.R) / 2, 0, RN.D / 2);
    g.rotateZ(a);
    parts.add('ply', place(g), ply);
  }
  for (const sz of [-1, 1]) parts.box('ply', RN.x, F, RN.z + sz * 0.55 - 0.18, RN.x + RN.D, F + 0.14, RN.z + sz * 0.55 + 0.18, plyEdge);
  // a book: the face towards the room (+X) is its spine, the sides its cloth cover, the rest page edges
  const book = (x0, y0, z0, x1, y1, z1, k) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const uv = g.attributes.uv, R = spineUV(k);
    const rects = [R.spine, R.pages, R.pages, R.pages, R.cover, R.cover];
    const flat = y1 - y0 < z1 - z0;
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v, [a, b, c, d] = rects[f];
      let u = uv.getX(i), w = uv.getY(i);
      if (f === 0 && flat) [u, w] = [w, u];
      uv.setXY(i, a + (c - a) * u, b + (d - b) * w);
    }
    parts.add('books', g, 0xffffff);
  };
  const br = rng(808);
  for (let k = 0; k < NC; k++) {
    const a = ((k + 0.5) / NC) * Math.PI * 2 + Math.PI / NC;
    const rc = (rIn + RN.R) / 2;
    const cz = RN.z - Math.cos(a) * rc, cy = RN.y + Math.sin(a) * rc;
    const tight = Math.abs(Math.sin(2 * a));
    const roll = br();
    if (roll < 0.06) continue;
    if (roll < 0.2) {
      let y = cy - 0.1;
      for (let i = 0; i < 4; i++) { const t = 0.025 + br() * 0.02; book(RN.x + 0.22, y, cz - 0.1 + br() * 0.02, RN.x + 0.44, y + t, cz + 0.1 + br() * 0.02, Math.floor(br() * SPINE_CELLS)); y += t; }
      continue;
    }
    const rowW = 0.38 - 0.13 * tight, maxH = 0.25 - 0.07 * tight;
    let z = cz - rowW / 2;
    while (z < cz + rowW / 2 - 0.02) {
      const t = 0.022 + br() * 0.03, h = maxH * (0.72 + br() * 0.28), dpt = 0.15 + br() * 0.06;
      book(RN.x + RN.D - 0.04 - dpt, cy - maxH / 2, z, RN.x + RN.D - 0.04, cy - maxH / 2 + h, z + t, Math.floor(br() * SPINE_CELLS));
      z += t + 0.002;
    }
  }
  const sage = 0x9dbcad;
  parts.rbox('fabric', RN.x + 0.27, RN.y - rIn + 0.05, RN.z - 0.05, 0.46, 0.17, 0.98, 0.07, sage);
  const back = new RoundedBoxGeometry(0.44, 0.66, 0.17, 3, 0.07);
  back.rotateX(0.55); back.translate(RN.x + 0.27, F + 0.86, RN.z + 0.52);
  parts.add('fabric', back, sage);
  const side = new RoundedBoxGeometry(0.42, 0.34, 0.15, 3, 0.06);
  side.rotateX(-0.6); side.translate(RN.x + 0.27, F + 0.68, RN.z - 0.62);
  parts.add('fabric', side, 0x8fb0a0);
  solid(RN.x, RN.z - RN.R, RN.x + RN.D, RN.z + RN.R, F, F + 2.4);
  interact.push({ kind: 'lounger', label: 'Curl up with a book', pos: [RN.x + 0.4, F + 0.9, RN.z], normal: [1, 0], r: 1.9,
    seat: { x: RN.x + 0.3, z: RN.z, y: F + 0.55, eye: [RN.x + 0.32, F + 1.18, RN.z + 0.12], look: [1, -0.15], quiet: true } });
  // full-height birch shelves either side of the ring, filled with books
  const shelfUnit = (z0, z1, y0, top, seed) => {
    const D = 0.36, x0 = X0 + T, x1 = x0 + D, cols = Math.round((z1 - z0) / 0.42), cw = (z1 - z0) / cols, rows = Math.round((top - 0.12) / 0.36), rh = (top - 0.12) / rows;
    const sr = rng(seed);
    parts.box('ply', x0, y0, z0 - 0.02, x1, y0 + top, z0, plyEdge); parts.box('ply', x0, y0, z1, x1, y0 + top, z1 + 0.02, plyEdge);
    parts.box('ply', x0, y0, z0, x0 + 0.015, y0 + top, z1, ply);
    for (let r = 0; r <= rows; r++) parts.box('ply', x0, y0 + 0.1 + r * rh - 0.018, z0, x1, y0 + 0.1 + r * rh, z1, ply);
    parts.box('ply', x0, y0, z0, x1, y0 + 0.08, z1, plyEdge);
    for (let c = 1; c < cols; c++) parts.box('ply', x0, y0 + 0.08, z0 + c * cw - 0.009, x1, y0 + top, z0 + c * cw + 0.009, ply);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cy0 = y0 + 0.1 + r * rh, cz0 = z0 + c * cw + 0.02, cz1 = z0 + (c + 1) * cw - 0.02, roll = sr();
      if (roll < 0.08) {                                   // a vase or a little sculpture instead of books
        parts.cyl('paper', x0 + 0.18, cy0, (cz0 + cz1) / 2, 0.06, 0.045, 0.16 + sr() * 0.08, [0x2f5d50, 0xe8e1d4, 0xa4532e, 0x1f3a5f][Math.floor(sr() * 4)], 14);
        continue;
      }
      let z = cz0 + (roll < 0.3 ? 0.12 : 0);
      const maxH = rh - 0.06;
      while (z < cz1 - 0.025) {
        const t = 0.022 + sr() * 0.03, h = maxH * (0.62 + sr() * 0.36), dpt = 0.17 + sr() * 0.1;
        book(x1 - 0.03 - dpt, cy0, z, x1 - 0.03, cy0 + h, z + t, Math.floor(sr() * SPINE_CELLS));
        z += t + 0.002;
      }
      if (roll < 0.3) { let y = cy0; for (let i = 0; i < 3; i++) { const t = 0.03 + sr() * 0.02; book(x1 - 0.25, y, cz0, x1 - 0.03, y + t, cz0 + 0.1, Math.floor(sr() * SPINE_CELLS)); y += t; } }
    }
    solid(x0, z0 - 0.02, x1, z1 + 0.02, y0, y0 + 2.4);
  };
  shelfUnit(41.1, 44.7, F, CH - F - 0.12, 61);
  shelfUnit(48.1, 50.6, F, CH - F - 0.12, 62);
  // floor lamp, a side table with her chai, a reading chair, a sheepskin rug
  parts.cyl('metal', 99.05, F, 44.95, 0.16, 0.16, 0.03, 0x1d1d1d, 20);
  parts.cyl('brass', 99.05, F, 44.95, 0.012, 0.012, 1.55, 0xb08d57, 8);
  const shade = new THREE.CylinderGeometry(0.12, 0.2, 0.24, 20, 1, true);
  shade.translate(99.15, F + 1.55, 45.05); parts.add('glow', shade, 0xf3e6cf);
  solid(98.8, 44.7, 99.3, 45.2, F, F + 1.6);
  parts.cyl('wood', 99.1, F, 47.85, 0.2, 0.2, 0.5, 0x8a6240, 18);
  book(98.98, F + 0.5, 47.75, 99.2, F + 0.54, 47.91, 1);
  parts.cyl('paper', 99.22, F + 0.5, 47.95, 0.04, 0.035, 0.08, 0xf5f1e8, 12);
  solid(98.88, 47.63, 99.32, 48.07, F, F + 0.6);
  const rr = rng(46), pts = [];
  for (let i = 0; i < 40; i++) { const t = (i / 40) * Math.PI * 2, j = 1 + (rr() - 0.5) * 0.18; pts.push(new THREE.Vector2(Math.cos(t) * 0.78 * j, Math.sin(t) * 0.58 * j)); }
  const rugGeo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.025, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.015, bevelSegments: 2 });
  rugGeo.rotateX(-Math.PI / 2); rugGeo.translate(RN.x + 1.25, F + 0.005, RN.z);
  parts.add('fabric', rugGeo, 0xf3efe6);
  const chair = (cx, cz, rot, col, y = F) => {
    parts.rbox('fabric', cx, y + 0.1, cz, 0.85, 0.42, 0.8, 0.08, col, rot);
    const bk = new RoundedBoxGeometry(0.85, 0.55, 0.18, 3, 0.07);
    bk.translate(0, 0.25, -0.33); bk.rotateY(rot); bk.translate(cx, y + 0.52, cz);
    parts.add('fabric', bk, col);
    for (const sx of [-1, 1]) {
      const arm = new RoundedBoxGeometry(0.14, 0.32, 0.78, 3, 0.05);
      arm.translate(sx * 0.4, 0.16, 0); arm.rotateY(rot); arm.translate(cx, y + 0.42, cz);
      parts.add('fabric', arm, col);
    }
    for (const [lx, lz] of [[-0.35, -0.32], [0.35, -0.32], [-0.35, 0.32], [0.35, 0.32]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      parts.cyl('wood', cx + lx * c + lz * s, y, cz - lx * s + lz * c, 0.02, 0.025, 0.12, 0x6b4a2f, 8);
    }
    solid(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, y, y + 1);
  };
  chair(101.4, 49.4, Math.PI * 0.8, 0xb5653d);
  parts.cyl('wood', 102.25, F, 50.1, 0.22, 0.22, 0.45, 0x6b4a2f, 18);
  parts.cyl('paper', 102.25, F + 0.45, 50.1, 0.07, 0.05, 0.22, 0x2f5d50, 14);
  solid(102.0, 49.85, 102.5, 50.35, F, F + 0.7);

  // ================================================================== the lounge (middle)
  parts.box('fabric', 103.1, F, 44.4, 108.9, F + 0.012, 49.6, 0xd8cdb8);              // a big wool rug
  parts.box('fabric', 103.25, F + 0.012, 44.55, 108.75, F + 0.014, 49.45, 0xc9bca4);
  // a long, low linen sofa facing the sea
  const SX = 105.6, SZ = 45.6, SL = 3.0;
  parts.rbox('wood', SX, F, SZ, SL, 0.12, 1.0, 0.02, 0x6b4a2f);
  parts.rbox('fabric', SX, F + 0.12, SZ + 0.05, SL - 0.1, 0.3, 0.9, 0.08, 0xefe9de);
  parts.rbox('fabric', SX, F + 0.12, SZ - 0.38, SL, 0.62, 0.24, 0.1, 0xe7dfd0);
  for (const s of [-1, 1]) parts.rbox('fabric', SX + s * (SL / 2 - 0.12), F + 0.12, SZ + 0.02, 0.24, 0.48, 0.98, 0.1, 0xe7dfd0);
  for (const [dx, col] of [[-1.0, 0x5f7387], [-0.45, 0xc9a24a], [0.35, 0xa4532e], [0.95, 0x2f5d50]]) {
    const c = new RoundedBoxGeometry(0.46, 0.42, 0.14, 3, 0.07); c.rotateX(-0.22); c.translate(SX + dx, F + 0.63, SZ - 0.2); parts.add('fabric', c, col);
  }
  const knit = new RoundedBoxGeometry(0.75, 0.05, 1.0, 2, 0.02); knit.rotateY(0.1); knit.translate(SX + 0.95, F + 0.45, SZ + 0.15); parts.add('fabric', knit, 0xc99a2e);
  solid(SX - SL / 2, SZ - 0.5, SX + SL / 2, SZ + 0.5, F, F + 1);
  interact.push({ kind: 'lounger', label: 'Sit on the sofa', pos: [SX, F + 0.6, SZ + 0.3], r: 1.8, normal: [0, 1],
    seat: { x: SX - 0.3, z: SZ + 0.1, y: F, eye: [SX - 0.3, F + 1.12, SZ + 0.05], look: [0, 1], pitch: 0.04, flash: 'Sit back · E to get up', stand: [SX - 0.3, SZ + 1.05, 0, F] } });
  // coffee table: a slab of oak on a plinth, her album, candles, shells
  const CT = { x: 105.6, z: 47.55 };
  parts.rbox('wood', CT.x, F, CT.z, 0.9, 0.3, 0.5, 0.02, 0x5b3e28);
  parts.rbox('wood', CT.x, F + 0.3, CT.z, 1.5, 0.06, 0.8, 0.02, 0xb88c5e);
  solid(CT.x - 0.75, CT.z - 0.4, CT.x + 0.75, CT.z + 0.4, F, F + 0.4);
  parts.cyl('paper', CT.x - 0.5, F + 0.36, CT.z - 0.15, 0.09, 0.07, 0.12, 0xe8e1d4, 16);
  anchors.coffee = [CT.x - 0.4, F + 0.36, CT.z + 0.15];
  let by = F + 0.36;
  for (const [t, col] of [[0.035, 0x7a2e2e], [0.03, 0xe8e0cf], [0.04, 0x1f3a5f]]) { book(CT.x + 0.15, by, CT.z - 0.28, CT.x + 0.4, by + t, CT.z - 0.08, Math.floor(br() * SPINE_CELLS)); by += t; void col; }
  if (pack && pack.album && pack.album.photos?.length) {
    const cover = new THREE.MeshStandardMaterial({ map: albumCover(pack.album.title || "Deepti's Corner"), roughness: 0.8 });
    const linen = new THREE.MeshStandardMaterial({ color: 0x8fae9f, roughness: 0.9 });
    const pages = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.9 });
    const alb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.27), [pages, linen, cover, linen, pages, pages]);
    alb.position.set(CT.x + 0.1, F + 0.36 + 0.0225, CT.z + 0.15); alb.rotation.y = 0.18; alb.castShadow = true;
    group.add(alb);
    interact.push({ kind: 'album', label: `Open “${pack.album.title || "Deepti's Corner"}”`, pos: [CT.x + 0.1, F + 0.4, CT.z + 0.15], r: 1.7 });
  }
  chair(103.75, 47.6, Math.PI / 2, 0x3f6f8f);
  // a window bed: a deep floor mattress on a low oak platform by the glass, piled with pillows, a knitted
  // throw, a sheepskin beside it, a lantern and a tray of chai; E to curl up and watch the sea. A cat asleep
  // at its foot.
  const WB = { x: 104.2, z: 49.62, w: 2.6, d: 1.85 };
  parts.rbox('wood', WB.x, F, WB.z, WB.w, 0.12, WB.d, 0.02, 0x8a6240);
  parts.rbox('fabric', WB.x, F + 0.12, WB.z, WB.w - 0.1, 0.2, WB.d - 0.1, 0.07, 0xefe7da);
  for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) parts.cyl('fabric', WB.x + i * 0.32, F + 0.315, WB.z + j * 0.3, 0.012, 0.012, 0.01, 0xd9cfbf, 8);   // tufts
  const pillow = (x, z, w, h, d, tilt, col) => { const c = new RoundedBoxGeometry(w, h, d, 4, Math.min(h, d) * 0.45); c.rotateX(tilt); c.translate(x, F + 0.32 + h / 2, z); parts.add('fabric', c, col); };
  pillow(WB.x - 0.75, WB.z - 0.72, 0.75, 0.5, 0.2, -0.3, 0xe8e0d0);
  pillow(WB.x, WB.z - 0.74, 0.75, 0.52, 0.2, -0.3, 0xe5dccb);
  pillow(WB.x + 0.75, WB.z - 0.72, 0.75, 0.5, 0.2, -0.3, 0xe8e0d0);
  pillow(WB.x - 0.45, WB.z - 0.52, 0.48, 0.38, 0.15, -0.2, 0x9dbcad);
  pillow(WB.x + 0.15, WB.z - 0.54, 0.48, 0.38, 0.15, -0.22, 0xc9a24a);
  pillow(WB.x + 0.7, WB.z - 0.52, 0.44, 0.36, 0.15, -0.18, 0xa4532e);
  const bolW = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 20); bolW.rotateX(Math.PI / 2); bolW.translate(WB.x - 1.12, F + 0.42, WB.z + 0.05); parts.add('fabric', bolW, 0x8e2f2a);
  // the knitted throw, falling over the platform's edge on the west side
  const thr = new THREE.PlaneGeometry(1.0, 1.5, 14, 20), tp = thr.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), y = tp.getY(i), over = Math.max(0, x - 0.25); tp.setXYZ(i, Math.min(x, 0.25) + 0.02 * Math.sin(y * 9), y, over > 0 ? -over : 0.015 * Math.sin(x * 11 + y * 4)); }
  thr.computeVertexNormals(); thr.rotateX(-Math.PI / 2); thr.translate(WB.x + 1.0, F + 0.33, WB.z + 0.15);
  parts.add('fabric', thr, 0xc99a2e);
  const fold = new RoundedBoxGeometry(1.1, 0.08, 0.45, 3, 0.035); fold.translate(WB.x - 0.25, F + 0.36, WB.z + 0.55); parts.add('fabric', fold, 0xf4efe6);      // a folded quilt
  // a sheepskin on the floor, a brass lantern and a tray of chai on the platform's corner
  const sk = []; const sr2 = rng(71);
  for (let i = 0; i < 40; i++) { const t = (i / 40) * Math.PI * 2, j = 1 + (sr2() - 0.5) * 0.2; sk.push(new THREE.Vector2(Math.cos(t) * 0.55 * j, Math.sin(t) * 0.4 * j)); }
  const skin = new THREE.ExtrudeGeometry(new THREE.Shape(sk), { depth: 0.03, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 2 });
  skin.rotateX(-Math.PI / 2); skin.translate(WB.x - 1.75, F + 0.005, WB.z - 0.1); parts.add('fabric', skin, 0xf6f2ea);
  parts.box('metal', WB.x - 1.24, F + 0.12, WB.z + 0.66, WB.x - 1.06, F + 0.14, WB.z + 0.84, 0x1d1d1d);
  parts.box('glow', WB.x - 1.22, F + 0.14, WB.z + 0.68, WB.x - 1.08, F + 0.36, WB.z + 0.82, 0xffffff);
  parts.box('brass', WB.x - 1.24, F + 0.36, WB.z + 0.66, WB.x - 1.06, F + 0.38, WB.z + 0.84, 0xb08d57);
  parts.rbox('wood', WB.x + 1.0, F + 0.32, WB.z - 0.15, 0.4, 0.025, 0.3, 0.01, 0x6b4a2f);
  parts.cyl('paper', WB.x + 0.92, F + 0.345, WB.z - 0.18, 0.035, 0.03, 0.07, 0xf5f1e8, 12);
  parts.cyl('paper', WB.x + 1.08, F + 0.345, WB.z - 0.1, 0.035, 0.03, 0.07, 0xf5f1e8, 12);
  book(WB.x + 0.3, F + 0.32, WB.z + 0.25, WB.x + 0.55, F + 0.35, WB.z + 0.42, 7);
  solid(WB.x - WB.w / 2, WB.z - WB.d / 2, WB.x + WB.w / 2, WB.z + WB.d / 2, F, F + 0.5);
  interact.push({ kind: 'lounger', label: 'Curl up on the window bed', pos: [WB.x, F + 0.5, WB.z], r: 2.1,
    seat: { x: WB.x - 0.2, z: WB.z, y: F, eye: [WB.x - 0.2, F + 0.86, WB.z - 0.35], look: [0.1, 1], pitch: 0.03, flash: 'Curl up and watch the sea · E to get up', stand: [WB.x - 0.2, WB.z - WB.d / 2 - 0.42, Math.PI, F] } });
  const cat = sleepingCat();
  cat.position.set(WB.x + 0.55, F + 0.32, WB.z + 0.5); cat.rotation.y = -0.6;
  group.add(cat);
  // an oak-slatted ceiling over the lounge
  for (let x = 103.05; x < 110.0; x += 0.1) parts.box('wood', x, CH - 0.075, ST.z1 + 0.6, x + 0.05, CH - 0.03, Z1 - 0.35, 0xd9b48a);
  parts.box('paint', 103.0, CH - 0.032, ST.z1 + 0.6, 110.0, CH - 0.03, Z1 - 0.35, 0x2a2018);

  // three brass pendants over the table
  for (const [dx, dz, dy] of [[-0.45, 0, 1.95], [0.1, 0.15, 1.75], [0.55, -0.1, 2.05]]) {
    const x = CT.x + dx, z = CT.z + dz;
    parts.cyl('metal', x, F + dy, z, 0.004, 0.004, CH - F - dy, 0x1d1d1d, 4);
    const dome = new THREE.SphereGeometry(0.17, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(x, F + dy, z); parts.add('brass', dome, 0xb08d57);
    const bulb = new THREE.SphereGeometry(0.05, 12, 8); bulb.translate(x, F + dy - 0.02, z); parts.add('glow', bulb, 0xffffff);
  }
  // the credenza with the radio, under her elephant
  const CR = { x0: 107.6, x1: 110.2 };
  parts.rbox('wood', (CR.x0 + CR.x1) / 2, F, Z0 + T + 0.24, CR.x1 - CR.x0, 0.62, 0.45, 0.02, 0xa87b52);
  for (let x = CR.x0 + 0.1; x < CR.x1 - 0.05; x += 0.06) parts.box('wood', x, F + 0.08, Z0 + T + 0.465, x + 0.03, F + 0.58, Z0 + T + 0.475, 0x8a6240);
  solid(CR.x0, Z0 + T, CR.x1, Z0 + T + 0.5, F, F + 0.7);
  const radio = { x: 108.1, z: Z0 + T + 0.24 };
  parts.rbox('wood', radio.x, F + 0.62, radio.z, 0.42, 0.26, 0.2, 0.03, 0x6b4a2f);
  parts.box('fabric', radio.x - 0.18, F + 0.67, radio.z + 0.101, radio.x + 0.02, F + 0.84, radio.z + 0.105, 0xd9cbb0, false);
  parts.cyl('brass', radio.x + 0.11, F + 0.72, radio.z + 0.1, 0.045, 0.045, 0.02, 0xb08d57, 16);
  interact.push({ kind: 'radio', label: 'Play music', pos: [radio.x, F + 0.8, radio.z], r: 1.8 });
  parts.cyl('paper', 109.7, F + 0.62, Z0 + T + 0.24, 0.08, 0.06, 0.3, 0x2f5d50, 16);
  for (let k = 0; k < 3; k++) { const g = new THREE.CylinderGeometry(0.004, 0.004, 0.45, 4); g.rotateZ((k - 1) * 0.25); g.translate(109.7 + (k - 1) * 0.05, F + 1.12, Z0 + T + 0.24); parts.add('leaf', g, 0x6b7a3a); }

  // ================================================================== the gallery (west)
  const GP = { x: 112.7, z0: 42.3, z1: 48.5 };
  parts.box('plaster', GP.x - 0.09, F, GP.z0, GP.x + 0.09, F + 2.55, GP.z1, 0xfbf9f4);
  parts.box('wood', GP.x - 0.1, F, GP.z0 - 0.01, GP.x + 0.1, F + 0.08, GP.z1 + 0.01, 0x5b3e28);
  solid(GP.x - 0.12, GP.z0, GP.x + 0.12, GP.z1, F, F + 2.6);
  // brass tracks with spots either side, aimed at the partition
  for (const s of [-1, 1]) {
    const tx = GP.x + s * 1.1;
    parts.box('brass', tx - 0.02, CH - 0.05, GP.z0, tx + 0.02, CH - 0.03, GP.z1, 0xb08d57);
    for (let z = GP.z0 + 0.6; z < GP.z1; z += 1.25) {
      const g = new THREE.CylinderGeometry(0.035, 0.045, 0.16, 12); g.rotateZ(s * 0.7); g.translate(tx - s * 0.04, CH - 0.15, z); parts.add('metal', g, 0x1d1d1d);
      const l = new THREE.CircleGeometry(0.03, 12); l.rotateY(-s * Math.PI / 2); l.rotateZ(s * 0.7); l.translate(tx - s * 0.1, CH - 0.2, z); parts.add('glow', l, 0xffffff);
    }
  }
  // a gallery bench, to sit and look
  parts.rbox('wood', 110.85, F + 0.4, 45.4, 0.45, 0.06, 1.7, 0.01, 0xb88c5e);
  for (const dz of [-0.7, 0.7]) parts.box('metal', 110.66, F, 45.4 + dz - 0.02, 111.04, F + 0.4, 45.4 + dz + 0.02, 0x1d1d1d);
  solid(110.6, 44.5, 111.1, 46.3, F, F + 0.5);
  interact.push({ kind: 'lounger', label: 'Sit and look at her paintings', pos: [110.85, F + 0.6, 45.4], r: 1.6,
    seat: { x: 110.85, z: 45.4, y: F, eye: [110.8, F + 1.15, 45.4], look: [1, 0], pitch: -0.05, flash: 'Take your time · E to get up', stand: [110.0, 45.4, -Math.PI / 2, F] } });
  // a sculpture on a plinth, a tall olive in a pot, cane chairs facing the sunset
  parts.box('plaster', 114.2, F, 49.4, 114.75, F + 0.95, 49.95, 0xf3efe6);
  const sc = new THREE.TorusKnotGeometry(0.16, 0.05, 90, 12, 2, 3); sc.translate(114.475, F + 1.2, 49.675); parts.add('paint', sc, 0x2e2a26);
  solid(114.15, 49.35, 114.8, 50.0, F, F + 1.4);
  pottedTree(parts, 115.3, 41.0, F, rng(5), solid);
  pottedTree(parts, 107.75, 43.1, U, rng(6), solid);                // (on the terrace, by the door)
  for (const [cx, cz, rot] of [[113.4, 50.15, 0.5], [115.1, 48.3, -0.9]]) chair(cx, cz, rot, 0xd8c3a0);

  // ================================================================== upstairs: the atelier
  // two easels by the north glass: one with a canvas of hers in progress, one blank
  const easelAt = (x, z, rot, y) => {
    const eg = [];
    for (const [lx, lz] of [[-0.3, 0], [0.3, 0], [0, -0.45]]) {
      const g = new THREE.CylinderGeometry(0.018, 0.022, 1.8, 6); g.translate(0, 0.9, 0);
      g.rotateX(lz ? 0.25 : -0.08); g.rotateZ(lx * -0.12); g.translate(lx, 0, lz); eg.push(g);
    }
    const ledge = new THREE.BoxGeometry(0.75, 0.04, 0.08); ledge.translate(0, 0.78, 0.06); eg.push(ledge);
    const geo = mergeGeometries(eg.map((g) => g.toNonIndexed())); geo.rotateY(rot); geo.translate(x, y, z);
    parts.add('wood', geo, 0xa87b52);
    solid(x - 0.45, z - 0.45, x + 0.45, z + 0.45, y, y + 1.8);
  };
  const easel = { x: 103.4, z: 49.2, rot: Math.PI + 0.25 };
  easelAt(easel.x, easel.z, easel.rot, U);
  const easel2 = { x: 100.6, z: 48.7, rot: Math.PI - 0.35 };
  easelAt(easel2.x, easel2.z, easel2.rot, U);
  const blank = paintingMesh(0.6, 0.75, 0xf4f0e8);
  blank.position.set(easel2.x + Math.sin(easel2.rot) * 0.1, U + 1.18, easel2.z + Math.cos(easel2.rot) * 0.1); blank.rotation.set(-0.12, easel2.rot, 0, 'YXZ'); group.add(blank);
  // a stool with her palette, a work table of jars, brushes, tubes and a sketchbook
  parts.cyl('wood', 102.6, U, 48.3, 0.18, 0.18, 0.6, 0x8a6240, 12);
  const pal = new THREE.CylinderGeometry(0.17, 0.17, 0.01, 20); pal.scale(1.2, 1, 0.85); pal.translate(102.6, U + 0.61, 48.3); parts.add('wood', pal, 0xd9b98a);
  for (const [i, c] of [0xc0392b, 0xe1a92a, 0x1f6f8b, 0xffffff, 0x2e7d32].entries()) parts.cyl('paint', 102.5 + Math.cos(i) * 0.1, U + 0.615, 48.3 + Math.sin(i) * 0.07, 0.022, 0.022, 0.012, c, 8);
  solid(102.35, 48.05, 102.85, 48.55, U, U + 0.7);
  const WT = { x: 104.4, z: 44.6 };
  parts.rbox('wood', WT.x, U + 0.86, WT.z, 2.0, 0.05, 0.95, 0.01, 0xd8c3a0);
  for (const [dx, dz] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) parts.box('metal', WT.x + dx - 0.02, U, WT.z + dz - 0.02, WT.x + dx + 0.02, U + 0.86, WT.z + dz + 0.02, 0x1d1d1d);
  parts.box('wood', WT.x - 0.95, U + 0.25, WT.z - 0.42, WT.x + 0.95, U + 0.27, WT.z + 0.42, 0xc49a6c);
  solid(WT.x - 1.0, WT.z - 0.5, WT.x + 1.0, WT.z + 0.5, U, U + 0.95);
  const tr = rng(311);
  for (let i = 0; i < 4; i++) {                                               // jars of brushes
    const jx = WT.x - 0.75 + i * 0.16, jz = WT.z - 0.28;
    parts.cyl('glass', jx, U + 0.91, jz, 0.045, 0.04, 0.14);
    for (let b = 0; b < 6; b++) { const g = new THREE.CylinderGeometry(0.004, 0.004, 0.28, 4); g.rotateZ((tr() - 0.5) * 0.4); g.rotateX((tr() - 0.5) * 0.4); g.translate(jx + (tr() - 0.5) * 0.04, U + 1.03, jz + (tr() - 0.5) * 0.04); parts.add('wood', g, [0x8a6240, 0x1d1d1d, 0xc0392b][b % 3]); }
  }
  for (let i = 0; i < 9; i++) { const g = new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8); g.rotateZ(Math.PI / 2); g.rotateY(tr() * 3); g.translate(WT.x - 0.1 + tr() * 0.6, U + 0.925, WT.z + tr() * 0.3); parts.add('paint', g, [0xc0392b, 0xe1a92a, 0x1f6f8b, 0x2e7d32, 0xf4f0e8, 0x7a2e2e][i % 6]); }
  parts.box('paper', WT.x + 0.45, U + 0.91, WT.z - 0.05, WT.x + 0.85, U + 0.915, WT.z + 0.25, 0xfbf8f0);
  parts.box('paper', WT.x - 0.3, U + 0.91, WT.z + 0.05, WT.x + 0.05, U + 0.93, WT.z + 0.32, 0x2f2a25);
  // flat files along the east wall, canvases leaning against it
  parts.box('wood', X0 + T, U, 41.9, X0 + T + 0.75, U + 0.88, 44.3, 0xe3cfb2);
  for (let d = 0; d < 5; d++) { parts.box('wood', X0 + T + 0.75, U + 0.06 + d * 0.165, 41.95, X0 + T + 0.76, U + 0.2 + d * 0.165, 44.25, 0xd8c3a0); parts.box('brass', X0 + T + 0.76, U + 0.12 + d * 0.165, 43.0, X0 + T + 0.78, U + 0.135 + d * 0.165, 43.2, 0xb08d57); }
  solid(X0 + T, 41.9, X0 + T + 0.8, 44.3, U, U + 0.9);
  for (let i = 0; i < 4; i++) {
    const w = 0.6 + i * 0.12, h = 0.75 + i * 0.1, g = new THREE.BoxGeometry(0.025, h, w);
    g.rotateZ(-0.12 - i * 0.02); g.translate(X0 + T + 0.12 + i * 0.035, U + h / 2, 49.6 - w / 2);
    parts.add('wood', g, i % 2 ? 0xe9dfcf : 0xd9c7a8);
  }
  solid(X0 + T, 48.6, X0 + T + 0.35, 49.7, U, U + 1.2);
  // the reading corner: an armchair to the sea, a lamp, a basket of books
  chair(100.0, 50.15, 0, 0x9dbcad, U);
  parts.cyl('metal', 99.0, U, 50.4, 0.14, 0.14, 0.03, 0x1d1d1d, 18);
  parts.cyl('brass', 99.0, U, 50.4, 0.012, 0.012, 1.45, 0xb08d57, 8);
  const sh2 = new THREE.CylinderGeometry(0.12, 0.2, 0.24, 20, 1, true); sh2.translate(99.05, U + 1.45, 50.35); parts.add('glow', sh2, 0xf3e6cf);
  solid(98.8, 50.2, 99.2, 50.6, U, U + 1.5);
  // the writing desk at the glass, her poems on the wall beside it
  const DK = { x: 105.6, z: 50.3 };
  parts.rbox('wood', DK.x, U + 0.72, DK.z, 1.7, 0.04, 0.7, 0.01, 0xc49a6c);
  for (const [dx, dz] of [[-0.78, -0.28], [0.78, -0.28], [-0.78, 0.28], [0.78, 0.28]]) parts.cyl('metal', DK.x + dx, U, DK.z + dz, 0.018, 0.018, 0.72, 0x1d1d1d, 8);
  solid(DK.x - 0.88, DK.z - 0.38, DK.x + 0.88, DK.z + 0.38, U, U + 0.8);
  parts.box('paper', DK.x - 0.3, U + 0.76, DK.z - 0.15, DK.x + 0.12, U + 0.765, DK.z + 0.15, 0xfbf8f0);
  const pen = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6); pen.rotateX(Math.PI / 2); pen.rotateY(0.4); pen.translate(DK.x, U + 0.772, DK.z); parts.add('brass', pen, 0x2a2a2a);
  parts.cyl('metal', DK.x + 0.6, U + 0.76, DK.z + 0.15, 0.07, 0.07, 0.02, 0x1d1d1d, 16);
  parts.cyl('metal', DK.x + 0.6, U + 0.76, DK.z + 0.15, 0.008, 0.008, 0.4, 0x1d1d1d, 6);
  const dl = new THREE.ConeGeometry(0.11, 0.14, 20, 1, true); dl.translate(DK.x + 0.55, U + 1.13, DK.z + 0.1); parts.add('glow', dl, 0xf3e6cf);
  chair(DK.x, DK.z - 0.85, 0, 0x3f6f8f, U);
  // pendants upstairs
  for (const [x, z] of [[103.5, 46.5], [100.6, 44.0]]) {
    parts.cyl('metal', x, U + 2.1, z, 0.004, 0.004, H2 - 2.1, 0x1d1d1d, 4);
    const dome = new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(x, U + 2.1, z); parts.add('brass', dome, 0xb08d57);
    const bulb = new THREE.SphereGeometry(0.06, 12, 8); bulb.translate(x, U + 2.08, z); parts.add('glow', bulb, 0xffffff);
  }

  // ================================================================== the terrace: floor seating under the pergola, loungers
  const B = { x0: PG.x0 + 0.15, x1: PG.x1 - 0.4, z0: 44.2, z1: 47.4 };
  const jute = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#b89a6a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 256; i += 4) { g.fillStyle = `rgba(90,66,34,${0.2 + (i % 8 ? 0.1 : 0.25)})`; g.fillRect(0, i, 256, 1.5); g.fillRect(i, 0, 1.5, 256); } g.strokeStyle = 'rgba(120,40,30,0.55)'; g.lineWidth = 10; g.strokeRect(14, 14, 228, 228); return c; })());
  jute.colorSpace = THREE.SRGBColorSpace;
  const juteM = new THREE.Mesh(new THREE.BoxGeometry(B.x1 - B.x0, 0.012, B.z1 - B.z0), new THREE.MeshStandardMaterial({ map: jute, roughness: 0.95 }));
  juteM.position.set((B.x0 + B.x1) / 2, U + 0.006, (B.z0 + B.z1) / 2); juteM.receiveShadow = true; group.add(juteM);
  parts.rbox('fabric', B.x0 + 0.45, U, (B.z0 + B.z1) / 2, 0.85, 0.14, 2.4, 0.05, 0xe9dcc4);              // the gaddi, on the land side, facing the sunset
  const bol = new THREE.CylinderGeometry(0.11, 0.11, 2.2, 20); bol.rotateX(Math.PI / 2); bol.translate(B.x0 + 0.12, U + 0.25, (B.z0 + B.z1) / 2); parts.add('fabric', bol, 0x8e2f2a);
  for (const [z, col] of [[44.75, 0xc9a24a], [45.8, 0x2f5d50], [46.85, 0xa4532e]]) { const c = new RoundedBoxGeometry(0.13, 0.4, 0.42, 3, 0.05); c.rotateZ(-0.2); c.translate(B.x0 + 0.25, U + 0.34, z); parts.add('fabric', c, col); }
  for (const [x, z, col] of [[B.x1 - 0.5, 44.7, 0x5f7387], [B.x1 - 0.4, 46.9, 0xc9a24a]]) parts.rbox('fabric', x, U, z, 0.55, 0.12, 0.55, 0.05, col);
  const CX = (B.x0 + B.x1) / 2 + 0.35, CZ = (B.z0 + B.z1) / 2;
  parts.box('wood', CX - 0.38, U + 0.26, CZ - 0.28, CX + 0.38, U + 0.3, CZ + 0.28, 0x9c6a3e);
  for (const [dx, dz] of [[-0.33, -0.23], [0.33, -0.23], [-0.33, 0.23], [0.33, 0.23]]) parts.box('wood', CX + dx - 0.025, U, CZ + dz - 0.025, CX + dx + 0.025, U + 0.26, CZ + dz + 0.025, 0x9c6a3e);
  parts.cyl('brass', CX + 0.12, U + 0.3, CZ + 0.05, 0.05, 0.035, 0.03, 0xc19a55, 18);
  const kettle = new THREE.SphereGeometry(0.075, 18, 12); kettle.scale(1, 0.85, 1); kettle.translate(CX - 0.1, U + 0.37, CZ - 0.08); parts.add('brass', kettle, 0xc19a55);
  anchors.diya = [CX + 0.12, U + 0.35, CZ + 0.05];
  solid(B.x0, B.z0 + 0.6, B.x0 + 0.9, B.z1 - 0.6, U, U + 0.5);
  solid(CX - 0.4, CZ - 0.3, CX + 0.4, CZ + 0.3, U, U + 0.35);
  interact.push({ kind: 'lounger', label: 'Sit on the floor cushions', pos: [B.x0 + 0.5, U + 0.6, CZ], r: 2.4, normal: [1, 0],
    seat: { x: B.x0 + 0.55, z: CZ, y: U, eye: [B.x0 + 0.6, U + 0.95, CZ], look: [1, 0], pitch: 0.06, flash: 'The sun goes down over the sea · E to get up', stand: [B.x0 + 1.4, CZ - 1.0, Math.PI / 2, U] } });
  // fairy lights round the pergola
  const beads = [];
  const addBeads = (ax, ay, az, bx, by, bz, sagK = 0.12) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.3);
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin((t * L / 1.6) * Math.PI) ** 2 * sagK;
      const s = new THREE.SphereGeometry(0.03, 6, 4); s.translate(ax + (bx - ax) * t, ay + (by - ay) * t - sag, az + (bz - az) * t); beads.push(s);
    }
  };
  addBeads(PG.x0, U + PG.h - 0.05, PG.z0, PG.x1, U + PG.h - 0.05, PG.z0);
  addBeads(PG.x0, U + PG.h - 0.05, PG.z1, PG.x1, U + PG.h - 0.05, PG.z1);
  addBeads(PG.x0, U + PG.h - 0.05, PG.z0, PG.x1, U + PG.h - 0.05, PG.z1, 0.25);
  addBeads(PG.x1, U + PG.h - 0.05, PG.z0, PG.x0, U + PG.h - 0.05, PG.z1, 0.25);
  addBeads(X0 - 0.3, CH - 0.08, Z1 + 1.7, X1 + 0.8, CH - 0.08, Z1 + 1.7);                       // and along the north eave over the deck
  const fairy = new THREE.Mesh(mergeGeometries(beads), mats.fairy); fairy.name = 'fairy_lights'; group.add(fairy);
  // two loungers along the north balustrade, to the sea and the sunset
  for (const lx of [108.3, 109.9]) {
    parts.rbox('wood', lx, U, 49.4, 0.7, 0.3, 1.9, 0.03, 0x9c7450);
    parts.rbox('fabric', lx, U + 0.3, 49.5, 0.66, 0.08, 1.5, 0.03, 0xf2ece0);
    const bk = new RoundedBoxGeometry(0.66, 0.08, 0.7, 3, 0.03); bk.rotateX(-0.85); bk.translate(lx, U + 0.55, 48.67); parts.add('fabric', bk, 0xf2ece0);
    solid(lx - 0.36, 48.4, lx + 0.36, 50.35, U, U + 0.6);
    interact.push({ kind: 'lounger', label: 'Lie down and watch the sunset', pos: [lx, U + 0.5, 49.4], r: 1.9, seat: { x: lx, z: 49.55, y: U + 0.62, yaw: 0 } });
  }
  // lanterns on the terrace
  for (const [x, z] of [[107.6, 41.0], [115.4, 50.4], [110.6, 50.5]]) {
    parts.box('metal', x - 0.11, U, z - 0.11, x + 0.11, U + 0.42, z + 0.11, 0x1d1d1d);
    parts.box('glow', x - 0.08, U + 0.06, z - 0.08, x + 0.08, U + 0.36, z + 0.08, 0xffffff);
    solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, U, U + 0.5);
  }

  // ================================================================== her paintings and poems
  // Wall places for her work, best first: big works on the stair wall and in the gallery, the small
  // ones on the stair and both faces of the gallery partition, and anything more in the atelier
  // upstairs (about 50 places in all). The pack's paintings fill them in order.
  const art = (pack && pack.art) || [];
  const isBig = (a) => !a.file.includes('small_');
  const SWZ = Z0 + T + 0.03;
  const stairH = (x) => F + ((ST.xBot - x) / ST.G + 0.5) * ST.R;               // the tread height under x
  const slots = { big: [], small: [] };
  slots.big.push({ cx: 104.55, cy: stairH(104.55) + 1.5, z: SWZ, face: 'n', h: 1.0, frame: 0x2a1f16, light: true });
  slots.big.push({ cx: 102.4, cy: stairH(102.4) + 1.35, z: SWZ, face: 'n', h: 0.8, frame: 0x2a1f16, light: true });
  slots.big.push({ cx: 113.4, cy: F + 1.75, z: SWZ, face: 'n', h: 1.15, frame: 0xb08d57, light: true });
  slots.big.push({ cx: 108.9, cy: F + 1.75, z: SWZ, face: 'n', h: 0.78, frame: null });
  for (const x of [106.35, 105.55, 103.55, 101.0]) slots.small.push({ cx: x, cy: (x < ST.xTop ? U : stairH(x)) + 1.4, z: SWZ, face: 'n', h: 0.42, maxW: 0.5 });
  for (const s of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
    slots.small.push({ cx: GP.x + s * 0.1, cz: GP.z0 + 0.55 + c * ((GP.z1 - GP.z0 - 1.1) / 4), cy: F + (r ? 1.12 : 1.78) + (c % 2 ? 0.04 : -0.03), face: s > 0 ? 'px' : 'nx', h: 0.42, maxW: 0.6 });
  }
  // upstairs (only used when the pack has more than fits downstairs)
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) slots.small.push({ cx: 101.6 + c * 0.98, cy: U + (r ? 1.75 : 2.5), z: SWZ, face: 'n', h: 0.42, maxW: 0.6, up: true });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) slots.small.push({ cz: 44.9 + c * 0.82, cx: X0 + T + 0.03, cy: U + (r ? 1.45 : 2.3), face: 'px', h: 0.42, maxW: 0.6, up: true });
  const hang = [];
  const bigs = art.filter(isBig), smalls = art.filter((a) => !isBig(a));
  bigs.forEach((a, i) => { if (slots.big[i]) hang.push({ a, ...slots.big[i] }); else smalls.push(a); });
  const FRAMES = [0x1d1d1d, 0xf4f0e8, 0x8a6240];
  smalls.forEach((a, i) => { if (slots.small[i]) hang.push({ a, ...slots.small[i], frame: slots.small[i].frame ?? FRAMES[i % 3] }); });
  const loader = new THREE.TextureLoader();
  const base = (pack && pack.base) || 'play/deepti/';
  const ROT = { n: 0, px: Math.PI / 2, nx: -Math.PI / 2 }, NORMAL = { n: [0, 1], px: [1, 0], nx: [-1, 0] };   // which way each faces: north (+z), +x, -x
  for (const p of hang) {
    const a = p.a, ratio = a.w / a.h;
    let h = ratio > 2 ? Math.min(p.h, 0.3) : ratio < 0.5 ? p.h * 1.4 : p.h, w = h * ratio;
    if (p.maxW && w > p.maxW) { w = p.maxW; h = w / ratio; }
    const mesh = paintingMesh(w, h, p.frame);
    mesh.position.set(p.cx, p.cy, p.z ?? p.cz); mesh.rotation.y = ROT[p.face];
    group.add(mesh);
    const canvasMat = mesh.userData.canvas, png = a.file.endsWith('.png');
    loader.load(base + a.file, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; canvasMat.map = tex; canvasMat.color.set(0xffffff); canvasMat.needsUpdate = true;
      if (!png) setTimeout(() => addImpasto(canvasMat, tex.image), 50 + Math.random() * 1500);
    });
    if (png) { canvasMat.transparent = false; canvasMat.alphaTest = 0.4; }
    interact.push({ kind: 'art', label: 'Look at the painting', url: base + a.file, pos: [mesh.position.x, p.cy, mesh.position.z], normal: NORMAL[p.face], r: 1.9 });
    if (p.light) {                                                              // a brass picture light
      parts.box('brass', p.cx - w * 0.3, p.cy + h / 2 + 0.12, SWZ, p.cx + w * 0.3, p.cy + h / 2 + 0.17, SWZ + 0.12, 0xb08d57);
      parts.box('glow', p.cx - w * 0.28, p.cy + h / 2 + 0.115, SWZ + 0.08, p.cx + w * 0.28, p.cy + h / 2 + 0.122, SWZ + 0.11, 0xffffff);
    }
  }
  // the canvas on the easel: one of hers, as if still being painted
  const easelPick = art.find((a) => a.file.endsWith('small_19.jpg')) || art[0];
  if (easelPick) {
    const ratio = easelPick.w / easelPick.h, h = 0.66, w = h * ratio;
    const mesh = paintingMesh(w, h, 0xf4f0e8);
    mesh.position.set(easel.x + Math.sin(easel.rot) * 0.1, U + 1.12, easel.z + Math.cos(easel.rot) * 0.1);
    mesh.rotation.set(-0.12, easel.rot, 0, 'YXZ');
    group.add(mesh);
    loader.load(base + easelPick.file, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; mesh.userData.canvas.map = tex; mesh.userData.canvas.color.set(0xffffff); mesh.userData.canvas.needsUpdate = true; addImpasto(mesh.userData.canvas, tex.image); });
    interact.push({ kind: 'art', label: 'Look at the canvas', url: base + easelPick.file, pos: [mesh.position.x, U + 1.1, mesh.position.z], normal: [Math.sin(easel.rot), Math.cos(easel.rot)], r: 1.8 });
  }
  // her poems: a wall of them in the atelier (its west wall, either side of the terrace door), each framed
  // behind glass under a little brass light. Hindi ones are set in Devanagari (Noto Serif Devanagari, loaded
  // below; the frames are redrawn once it has arrived).
  const poems = (pack && pack.poems) || [];
  const poemTexs = [];
  const wallX = UX1 - T - 0.03;
  const runs = [[41.75, 45.6], [47.85, 50.6]];                       // wall either side of the door (the desk sits under the second)
  const perRun = [Math.ceil(poems.length / 2), Math.floor(poems.length / 2)];
  let pi = 0;
  runs.forEach(([z0, z1], ri) => {
    const n = perRun[ri];
    if (!n) return;
    const w = Math.min(0.62, (z1 - z0 - 0.2 * (n - 1)) / n), gap = (z1 - z0 - n * w) / Math.max(1, n - 1);
    for (let k = 0; k < n; k++, pi++) {
      const poem = poems[pi], lines = poem.stanzas.reduce((m, st) => m + st.length, 0) + poem.stanzas.length;
      const h = Math.max(0.62, Math.min(1.25, 0.32 + lines * 0.042));
      const tex = poemTexture(poem, w / h); poemTexs.push(tex);
      const mesh = paintingMesh(w, h, 0xf4f0e8, tex, { glazed: true });
      const cz = n === 1 ? (z0 + z1) / 2 : z0 + w / 2 + k * (w + gap), cy = U + 1.62;
      mesh.position.set(wallX, cy, cz); mesh.rotation.y = -Math.PI / 2;
      group.add(mesh);
      parts.box('brass', wallX - 0.12, cy + h / 2 + 0.1, cz - w * 0.3, wallX, cy + h / 2 + 0.14, cz + w * 0.3, 0xb08d57);
      parts.box('glow', wallX - 0.1, cy + h / 2 + 0.095, cz - w * 0.28, wallX - 0.07, cy + h / 2 + 0.1, cz + w * 0.28, 0xffffff);
      interact.push({ kind: 'poem', index: pi, label: `Read “${poem.title}”`, pos: [wallX, cy, cz], normal: [-1, 0], r: 2.0 });
    }
  });
  if (poems.some((p) => DEVANAGARI.test(JSON.stringify(p))) && typeof FontFace !== 'undefined') {
    new FontFace(DEVA_FONT, 'url(play/fonts/NotoSerifDevanagari-Regular.ttf)').load()
      .then((f) => { document.fonts.add(f); for (const t of poemTexs) t.userData.redraw(); })
      .catch(() => { /* the system's own Devanagari font will do */ });
  }
  // a mood board on the atelier's south wall: her photographs pinned to cork
  const photos = pack?.album?.photos || [];
  if (photos.length) {
    parts.box('paint', 98.55, U + 1.05, SWZ - 0.01, 100.85, U + 2.25, SWZ + 0.01, 0xb08a5e);
    photos.slice(0, 6).forEach((ph, i) => {
      const r = ph.w / ph.h, h = r > 1.2 ? 0.3 : 0.42, w = h * r;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      m.position.set(98.95 + (i % 3) * 0.74 + (i > 2 ? 0.2 : 0), U + (i < 3 ? 1.9 : 1.38), SWZ + 0.02 + i * 0.001); m.rotation.z = (i % 2 ? 1 : -1) * 0.05;
      group.add(m);
      loader.load(base + ph.file, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; m.material.map = tex; m.material.needsUpdate = true; });
      parts.cyl('paint', m.position.x, m.position.y + h / 2 - 0.03, SWZ + 0.025, 0.012, 0.012, 0.01, [0xc0392b, 0xe1a92a, 0x1f6f8b][i % 3], 8);
    });
  }

  // ---- candles on the window sills (cosy.js lights them)
  anchors.sills = [[99.4, F, Z1 - 0.2], [99.6, F, Z1 - 0.2], [105.4, F, Z1 - 0.2], [104.6, U, Z1 - 0.2]];

  for (const m of parts.meshes(mats)) group.add(m);

  // lights after dark: the lounge, a wash on the front, the gallery, the atelier, the terrace
  const lights = [[104.8, F + 2.7, 46.8, 14, 10], [106.5, F + 2.4, Z0 - 2.2, 9, 5], [112.7, F + 2.6, 45.4, 10, 7], [102.8, U + 2.5, 46.4, 12, 11], [113.1, U + 2.4, 45.7, 10, 6]].map(([x, y, z, range, i]) => {
    const l = new THREE.PointLight(0xffc98f, 0, range, 2); l.position.set(x, y, z); l.userData.on = i; group.add(l); return l;
  });

  return {
    group, carColliders, interact, mats, frameMats: () => FRAME_MATS, anchors,
    walk: { colliders: walkColliders, surfaces: walkSurfaces },
    setNight(on) {
      mats.glow.emissiveIntensity = on ? 1.6 : 0;
      mats.fairy.emissiveIntensity = on ? 2.4 : 0;
      for (const l of lights) l.intensity = on ? l.userData.on : 0;
      haloMat.opacity = on ? 0.55 : 0;
    },
    update(t) { const k = Math.sin(t * 1.5); cat.userData.body.scale.set(1, 1 + k * 0.035, 1 + k * 0.02); cat.userData.ear.rotation.z = Math.sin(t * 0.37) > 0.97 ? 0.35 : 0; },
    entry: { x: 99.0, z: 37.2 },          // on the boardwalk, facing the steps
    upper: U, terraceX: UX1,
  };
}

// her name for the front wall: an elegant serif in dark bronze (or, for the halo, soft and blurred)
function signTexture(name, tag, halo) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  if (halo) g.filter = 'blur(18px)';
  g.fillStyle = halo ? '#ffffff' : '#3b2a1c';
  g.font = "italic 400 220px 'Cormorant Garamond', 'Playfair Display', Didot, Georgia, serif";
  g.fillText(name, 1024, 280);
  g.font = "500 54px Inter, 'Helvetica Neue', Arial, sans-serif";
  if ('letterSpacing' in g) g.letterSpacing = '18px';
  g.fillText(tag.toUpperCase(), 1024, 420);
  if (!halo) {                                   // a fine highlight on the letters' upper edges: cast bronze
    g.globalCompositeOperation = 'source-atop';
    const grad = g.createLinearGradient(0, 80, 0, 440);
    grad.addColorStop(0, '#6e5232'); grad.addColorStop(0.5, '#3a2818'); grad.addColorStop(1, '#22170e');
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function plaqueTexture() {
  const c = document.createElement('canvas');
  c.width = 460; c.height = 300;
  const g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#8a6240'; g.fillRect(0, 0, 460, 300);
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(50,30,15,${0.05 + r() * 0.1})`; g.beginPath(); const y = r() * 300; g.moveTo(0, y); g.bezierCurveTo(150, y + 4, 300, y - 4, 460, y + r() * 4); g.stroke(); }
  g.strokeStyle = 'rgba(240,215,160,0.6)'; g.lineWidth = 3; g.strokeRect(16, 16, 428, 268);
  g.fillStyle = '#f1dcae'; g.textAlign = 'center';
  g.font = "italic 52px Georgia, serif"; g.fillText("Deepti's Studio", 230, 132);
  g.font = '22px Georgia, serif'; g.fillText('paintings · poems · music', 230, 186);
  g.font = '20px Georgia, serif'; g.fillText('come in ❦', 230, 236);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a frangipani: a grey forking trunk, leathery leaves in rosettes at the tips, white-and-yellow flowers
function frangipani(parts, x, z, y0, r) {
  const tips = [];
  const branch = (px, py, pz, dx, dy, dz, len, rad, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.75, rad, len, 8);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(px, py, pz);
    parts.add('wood', g, 0x8d8478);
    const ex = px + dir.x * len, ey = py + dir.y * len, ez = pz + dir.z * len;
    if (depth === 0) { tips.push([ex, ey, ez]); return; }
    const n = depth > 1 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      branch(ex, ey, ez, dir.x * 0.5 + Math.cos(a) * 0.7, 0.75 + r() * 0.3, dir.z * 0.5 + Math.sin(a) * 0.7, len * (0.62 + r() * 0.15), rad * 0.68, depth - 1);
    }
  };
  branch(x, y0, z, 0.05, 1, 0.03, 1.25, 0.12, 3);
  for (const [tx, ty, tz] of tips) {
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + r(), L = 0.42 + r() * 0.14;
      const g = new THREE.PlaneGeometry(L, L * 0.34); g.translate(L / 2, 0, 0); g.rotateX(-Math.PI / 2); g.rotateZ(0.55 + r() * 0.45); g.rotateY(a);
      g.translate(tx, ty + 0.02, tz); parts.add('leaf', g, k % 2 ? 0x3e6a2f : 0x4c7a38);
    }
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2, d = 0.04 + r() * 0.06;
      for (let p = 0; p < 5; p++) {
        const g = new THREE.CircleGeometry(0.03, 8); g.scale(1.6, 1, 1); g.translate(0.035, 0, 0); g.rotateZ((p / 5) * Math.PI * 2);
        g.rotateX(-Math.PI / 2 + 0.4); g.translate(tx + Math.cos(a) * d, ty + 0.1 + r() * 0.05, tz + Math.sin(a) * d);
        parts.add('bloom', g, p % 2 ? 0xfdfbf3 : 0xfff6dc);
      }
      const c = new THREE.CircleGeometry(0.018, 8); c.rotateX(-Math.PI / 2); c.translate(tx + Math.cos(a) * d, ty + 0.115, tz + Math.sin(a) * d); parts.add('bloom', c, 0xf3c13a);
    }
  }
}
// a tall plant in a pot: an olive-ish canopy of small leaves on a slim trunk
function pottedTree(parts, x, z, y0, r, solid) {
  parts.cyl('paint', x, y0, z, 0.24, 0.3, 0.55, 0xd8cdb8, 20);
  parts.cyl('wood', x, y0 + 0.55, z, 0.025, 0.035, 1.2, 0x6b5a48, 8);
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2, rad = 0.12 + r() * 0.45, h = y0 + 1.3 + r() * 0.9 - rad * 0.4;
    const g = new THREE.PlaneGeometry(0.09, 0.035); g.rotateY(r() * 3); g.rotateX(r() - 0.5); g.translate(x + Math.cos(a) * rad, h, z + Math.sin(a) * rad);
    parts.add('leaf', g, i % 3 ? 0x6b7f4a : 0x839660);
  }
  solid(x - 0.32, z - 0.32, x + 0.32, z + 0.32, y0, y0 + 2);
}
// a ginger cat, curled up asleep: body, head tucked on its paws, ears, a tail wrapped round; it breathes
function sleepingCat() {
  const g = new THREE.Group();
  const plain = new THREE.MeshPhysicalMaterial({ color: 0xd68d48, roughness: 0.85, sheen: 1, sheenColor: 0xffd7a8, sheenRoughness: 0.5 });
  const pale = new THREE.MeshPhysicalMaterial({ color: 0xf3e6d2, roughness: 0.85, sheen: 1, sheenColor: 0xffffff });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e1d12, roughness: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd98c8c, roughness: 0.6 });
  const add = (geo, mat, parent = g) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const bodyGeo = new THREE.SphereGeometry(0.2, 28, 18).scale(1.2, 0.5, 0.78).translate(0, 0.1, 0);
  { const p = bodyGeo.attributes.position, col = new Float32Array(p.count * 3), top = new THREE.Color(0xa85f28), side = new THREE.Color(0xdc9655), under = new THREE.Color(0xf0dcc0), c2 = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const h = (p.getY(i) - 0.1) / 0.1; if (h > 0) c2.copy(side).lerp(top, h * h); else c2.copy(side).lerp(under, Math.min(1, -h * 1.4)); col.set([c2.r, c2.g, c2.b], i * 3); }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const body = add(bodyGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.85, sheen: 1, sheenColor: 0xffd7a8, sheenRoughness: 0.5 }));   // darker along the spine, cream underneath
  // the head, resting on the front paws at one end, turned a little towards us
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.026, 0.1, 4, 10).rotateZ(Math.PI / 2).translate(0.27, 0.026, 0.06 + s * 0.035), pale);
  const head = new THREE.Group(); head.position.set(0.27, 0.095, 0.07); head.rotation.set(0.15, 0.45, -0.12); g.add(head);
  add(new THREE.SphereGeometry(0.095, 22, 16).scale(1.0, 0.82, 1.1), plain, head);
  add(new THREE.SphereGeometry(0.045, 14, 10).scale(0.9, 0.7, 1.15).translate(0.072, -0.025, 0), pale, head);   // muzzle
  add(new THREE.SphereGeometry(0.009, 8, 6).translate(0.112, -0.012, 0), pink, head);                            // nose
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.004, 0.004, 0.032).rotateX(s * 0.15).translate(0.082, 0.018, s * 0.038), dark, head);   // eyes shut
  const ear = new THREE.Group(); head.add(ear);
  for (const s of [-1, 1]) {
    const e = new THREE.ConeGeometry(0.036, 0.075, 4); e.rotateY(Math.PI / 4); e.translate(0, 0.037, 0); e.rotateX(s * 0.3); e.translate(-0.015, 0.06, s * 0.05);
    add(e, plain, s > 0 ? ear : head);
    const inner = new THREE.ConeGeometry(0.02, 0.05, 4); inner.rotateY(Math.PI / 4); inner.translate(0.008, 0.03, 0); inner.rotateX(s * 0.3); inner.translate(-0.01, 0.062, s * 0.05);
    add(inner, pink, s > 0 ? ear : head);
  }
  add(new THREE.SphereGeometry(0.075, 14, 10).scale(1, 0.75, 1).translate(0.16, 0.07, 0.11), pale);           // white chest by the paws
  // the tail, wrapped round the front, its tip by the nose
  const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.24, 0.05, -0.02], [-0.22, 0.04, 0.14], [-0.05, 0.03, 0.2], [0.14, 0.03, 0.19], [0.27, 0.035, 0.15]].map((p) => new THREE.Vector3(...p))), 24, 0.03, 8);
  add(tail, plain);
  add(new THREE.SphereGeometry(0.031, 10, 8).translate(0.27, 0.035, 0.15), dark);
  g.userData = { body, ear };
  return g;
}

// her bicycle: a sage-green Dutch step-through with a swept-back bar, chrome mudguards, a sprung leather
// saddle and a wicker basket of flowers, leaning on its stand. Built in its own frame (x along the bike,
// y up, wheels on the ground) and returned as a group to place and tilt.
function bicycleGroup() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x6f9a86, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: 1, roughness: 0.16 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.9 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.55 });
  const wicker = new THREE.MeshStandardMaterial({ map: wickerTexture(), roughness: 0.85, side: THREE.DoubleSide });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const tube = (pts, r, mat, seg = 24) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 8), mat);
  const R = 0.34, rear = [-0.53, R], front = [0.56, R];
  for (const [cx, cy] of [rear, front]) {
    add(new THREE.TorusGeometry(R - 0.012, 0.024, 10, 48).translate(cx, cy, 0), rubber);           // tyre
    add(new THREE.TorusGeometry(R - 0.042, 0.009, 6, 48).translate(cx, cy, 0), chrome);            // rim
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 12).rotateX(Math.PI / 2).translate(cx, cy, 0), chrome);
    const spokes = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2, s = new THREE.CylinderGeometry(0.0016, 0.0016, R - 0.06, 3);
      s.translate(0, (R - 0.06) / 2 + 0.02, 0); s.rotateZ(a); s.translate(cx, cy, (k % 2 ? 1 : -1) * 0.012);
      spokes.push(s);
    }
    add(mergeGeometries(spokes), chrome);
  }
  // mudguards: chrome arcs over the tops of the wheels
  add(new THREE.TorusGeometry(R + 0.035, 0.03, 4, 32, Math.PI * 0.62).scale(1, 1, 0.5).rotateZ(Math.PI * 0.12).translate(rear[0], rear[1], 0), chrome);
  add(new THREE.TorusGeometry(R + 0.035, 0.03, 4, 32, Math.PI * 0.5).scale(1, 1, 0.5).rotateZ(Math.PI * 0.32).translate(front[0], front[1], 0), chrome);
  // the frame: a swooping step-through tube, the seat tube, stays, the fork
  const BB = [0.0, 0.3, 0], head = [0.4, 0.86, 0], seat = [-0.12, 0.86, 0];
  tube([head, [0.33, 0.62, 0], [0.18, 0.36, 0], BB], 0.022, paint);
  tube([[0.39, 0.78, 0], [0.3, 0.55, 0], [0.12, 0.33, 0], [0.02, 0.3, 0]], 0.016, paint);
  tube([BB, [-0.06, 0.6, 0], seat], 0.021, paint, 8);
  for (const s of [-1, 1]) {
    tube([BB, [-0.25, 0.32, s * 0.05], [rear[0], rear[1], s * 0.055]], 0.011, paint, 8);
    tube([[-0.1, 0.8, 0], [-0.3, 0.6, s * 0.045], [rear[0], rear[1], s * 0.055]], 0.01, paint, 8);
    tube([[0.42, 0.84, 0], [0.47, 0.62, s * 0.05], [front[0] - 0.01, front[1], s * 0.055]], 0.012, paint, 10);
  }
  add(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12).rotateZ(-0.35).translate(0.41, 0.88, 0), paint);   // head tube
  // swept-back bar on a chrome stem, leather grips, a bell, a lamp
  tube([[0.43, 0.94, 0], [0.42, 1.02, 0], [0.36, 1.05, 0]], 0.012, chrome, 8);
  tube([[0.22, 1.02, -0.3], [0.32, 1.05, -0.22], [0.36, 1.05, 0], [0.32, 1.05, 0.22], [0.22, 1.02, 0.3]], 0.011, chrome, 24);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.017, 0.017, 0.11, 10).rotateZ(Math.PI / 2).rotateY(s * 0.5).translate(0.2, 1.02, s * 0.3), leather);
  add(new THREE.SphereGeometry(0.022, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.3, 1.06, -0.2), chrome);
  add(new THREE.CylinderGeometry(0.04, 0.03, 0.06, 14).rotateZ(Math.PI / 2).translate(0.5, 0.8, 0), chrome);
  // sprung leather saddle on its post
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.16, 8).rotateZ(0.22).translate(-0.135, 0.92, 0), chrome);
  const sd = new THREE.Shape(); sd.moveTo(-0.13, -0.09); sd.quadraticCurveTo(0.02, -0.11, 0.13, -0.025); sd.lineTo(0.13, 0.025); sd.quadraticCurveTo(0.02, 0.11, -0.13, 0.09); sd.quadraticCurveTo(-0.16, 0, -0.13, -0.09);
  add(new THREE.ExtrudeGeometry(sd, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3 }).rotateX(Math.PI / 2).translate(-0.17, 1.03, 0), leather);
  for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.018, 0.005, 6, 12).rotateY(Math.PI / 2).translate(-0.27, 1.0, s * 0.05), chrome);
  // chainring, chain guard, cranks and pedals, the kickstand
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.006, 32).rotateX(Math.PI / 2).translate(BB[0], BB[1], 0.06), chrome);
  add(new THREE.BoxGeometry(0.56, 0.05, 0.012).rotateZ(0.04).translate(-0.27, 0.33, 0.085), paint);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.018, 0.17, 0.012).translate(0, -s * 0.085, 0).rotateZ(0.6).translate(BB[0], BB[1], s * 0.08), chrome);
    add(new THREE.BoxGeometry(0.1, 0.02, 0.07).translate(Math.sin(0.6) * 0.17 * s, BB[1] - Math.cos(0.6) * 0.17 * s, s * 0.12), rubber);
  }
  tube([[-0.06, 0.29, -0.05], [-0.16, 0.12, -0.14], [-0.22, 0.0, -0.2]], 0.008, chrome, 6);
  // a rear rack, and the wicker basket on the front with flowers
  for (const s of [-1, 1]) tube([[-0.18, 0.72, s * 0.08], [-0.45, 0.72, s * 0.09], [-0.6, 0.68, s * 0.07], [rear[0], rear[1], s * 0.06]], 0.006, chrome, 10);
  for (let x = -0.2; x > -0.62; x -= 0.07) add(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6).rotateX(Math.PI / 2).translate(x, 0.725, 0), chrome);
  const B = { x: 0.66, y: 0.93, w: 0.3, h: 0.22, d: 0.36 };
  const basket = new THREE.Group(); basket.position.set(B.x, B.y, 0); g.add(basket);
  const side = (w, h, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wicker); m.position.set(x, 0, z); m.rotation.y = ry; m.castShadow = true; basket.add(m); };
  side(B.w, B.h, 0, B.d / 2, 0); side(B.w, B.h, 0, -B.d / 2, 0); side(B.d, B.h, B.w / 2, 0, Math.PI / 2); side(B.d, B.h, -B.w / 2, 0, Math.PI / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.d).rotateX(-Math.PI / 2).translate(0, -B.h / 2, 0), wicker); basket.add(floor);
  for (const s of [-1, 1]) { const rim = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.02, 0.025, 0.02), leather); rim.position.set(0, B.h / 2, s * B.d / 2); basket.add(rim); }
  for (const s of [-1, 1]) { const rim = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, B.d + 0.02), leather); rim.position.set(s * B.w / 2, B.h / 2, 0); basket.add(rim); }
  tube([[0.46, 0.84, 0], [B.x - 0.1, B.y - B.h / 2, 0]], 0.008, chrome, 4);
  const r = rng(515), cols = [0xc2185b, 0xfdfbf3, 0xe1a92a, 0xd81b60, 0xf4a6c0];
  for (let k = 0; k < 14; k++) {
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.035 + r() * 0.02, 10, 8), new THREE.MeshStandardMaterial({ color: cols[k % 5], roughness: 0.8 }));
    bloom.position.set((r() - 0.5) * (B.w - 0.06), B.h / 2 + 0.04 + r() * 0.1, (r() - 0.5) * (B.d - 0.06)); bloom.castShadow = true; basket.add(bloom);
  }
  for (let k = 0; k < 10; k++) {
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.035), new THREE.MeshStandardMaterial({ color: 0x4f7f3f, roughness: 0.7, side: THREE.DoubleSide }));
    lf.position.set((r() - 0.5) * B.w, B.h / 2 + 0.05 + r() * 0.06, (r() - 0.5) * B.d); lf.rotation.set(r() - 0.5, r() * 3, 0.5); basket.add(lf);
  }
  return g;
}
function wickerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7a5530'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 16) {
    const o = (y / 8) % 2 ? 8 : 0;
    const grad = g.createLinearGradient(0, y, 0, y + 8); grad.addColorStop(0, '#e2bf86'); grad.addColorStop(0.5, '#c99a5c'); grad.addColorStop(1, '#8a6238');
    g.fillStyle = grad; g.beginPath(); g.ellipse(x + o + 8, y + 4, 7.5, 3.6, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 8;
  return t;
}

// a framed canvas: a thin frame (or none) and a canvas plane facing +Z. Paintings are on woven canvas
// under a satin varnish; when the picture loads, its brush strokes give the varnish its relief
// (addImpasto). Poems are paper behind glass.
const frameTex = { oak: null };
const FRAME_MATS = [];                  // the wooden frames (for the scanned wood, textures.js)
function paintingMesh(w, h, frameColor, tex, { glazed = false } = {}) {
  const g = new THREE.Group();
  const weave = canvasNormal().clone();
  weave.repeat.set(w / 0.06, h / 0.06);
  weave.needsUpdate = true;
  const canvas = glazed
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex || null, roughness: 0.9, clearcoat: 1, clearcoatRoughness: 0.04 })
    : new THREE.MeshPhysicalMaterial({ color: tex ? 0xffffff : 0xece6da, map: tex || null, roughness: 0.62, normalMap: weave, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.45, clearcoatRoughness: 0.32 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), canvas);
  plane.position.z = 0.025;
  plane.receiveShadow = true;
  g.add(plane);
  if (frameColor != null) {
    const fw = 0.035, fd = 0.04;
    const wooden = frameColor === 0x2a1f16 || frameColor === 0x8a6240;
    const brass = frameColor === 0xb08d57;
    if (wooden && !frameTex.oak) { frameTex.oak = plankTexture([200, 170, 140], 12); frameTex.oak.repeat.set(1 / 0.6, 1 / 0.6); frameTex.n = normalFromImage(frameTex.oak.image, 256, 2, 0.4); frameTex.n.repeat.copy(frameTex.oak.repeat); }
    const mat = new THREE.MeshPhysicalMaterial({
      color: frameColor, roughness: brass ? 0.32 : wooden ? 0.5 : 0.38, metalness: brass ? 0.85 : 0,
      map: wooden ? frameTex.oak : null, normalMap: wooden ? frameTex.n : null, clearcoat: wooden ? 0.4 : brass ? 0 : 0.2, clearcoatRoughness: 0.35,
    });
    if (wooden) FRAME_MATS.push(mat);
    for (const [x, y, ww, hh] of [[0, h / 2 + fw / 2, w + fw * 2, fw], [0, -h / 2 - fw / 2, w + fw * 2, fw], [-w / 2 - fw / 2, 0, fw, h], [w / 2 + fw / 2, 0, fw, h]]) {
      const geo = new THREE.BoxGeometry(ww, hh, fd);
      if (ww < hh) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * hh, uv.getX(i) * ww); } else { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ww, uv.getY(i) * hh); }
      const b = new THREE.Mesh(geo, mat);
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
// once a painting's picture has loaded: the brush strokes, raised under the varnish
function addImpasto(mat, img) {
  if (!img || !mat.isMeshPhysicalMaterial) return;
  const n = normalFromImage(img, 512, 1.3, 0.7);
  n.wrapS = n.wrapT = THREE.ClampToEdgeWrapping;
  mat.clearcoatNormalMap = n;
  mat.clearcoatNormalScale = new THREE.Vector2(0.6, 0.6);
  mat.needsUpdate = true;
}

// pale birch plywood face: fine straight grain, near white so the vertex colour carries the tone
function birchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d'), r = rng(17);
  g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 160; k++) {
    g.strokeStyle = `rgba(150,110,60,${0.03 + r() * 0.07})`;
    g.lineWidth = 0.6 + r() * 1.4;
    const y = r() * 512;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(170, y + r() * 10 - 5, 340, y + r() * 10 - 5, 512, y + r() * 4 - 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / 0.8, 1 / 0.8);
  return t;
}

// a poem on cream paper: title, lines in stanzas, date, signature
export const DEVANAGARI = /[\u0900-\u097F]/;
export const DEVA_FONT = 'Noto Serif Devanagari';
export function poemTexture(poem, ratio) {
  const W = 1024, Hh = Math.round(W / ratio);
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.redraw = () => { drawPoem(c, poem, W, Hh); t.needsUpdate = true; };
  t.userData.redraw();
  return t;
}
function drawPoem(c, poem, W, Hh) {
  const g = c.getContext('2d');
  // Hindi in Devanagari: upright (no false italic), a little more room between lines for the matras
  const hi = DEVANAGARI.test(poem.title + poem.stanzas.flat().join(''));
  const it = hi ? '' : 'italic ', face = hi ? `'${DEVA_FONT}', Georgia, serif` : "Georgia, 'Times New Roman', serif", lh = hi ? 1.6 : 1.45;
  g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, W, Hh);
  const r = rng(5);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(150,120,80,${r() * 0.05})`; g.fillRect(r() * W, r() * Hh, 2, 2); }
  g.strokeStyle = 'rgba(140,110,70,0.35)'; g.lineWidth = 2; g.strokeRect(40, 40, W - 80, Hh - 80);
  const lines = poem.stanzas.reduce((n, s) => n + s.length, 0) + poem.stanzas.length;
  const size = Math.min(34, Math.floor((Hh - 330) / (lines * lh)));
  g.fillStyle = '#3a2a1c'; g.textAlign = 'center';
  g.font = `${it}600 ${Math.round(size * (hi ? 1.45 : 1.7))}px ${face}`;
  fitText(g, poem.title, W / 2, 150, W - 150);
  if (poem.date) { g.font = `${Math.round(size * 0.8)}px Georgia, serif`; g.fillStyle = '#7a6448'; g.fillText(poem.date, W / 2, 150 + size * 1.5); }
  g.fillStyle = '#3a2a1c';
  g.font = `${it}${size}px ${face}`;
  let y = 150 + size * 3.4;
  for (const st of poem.stanzas) {
    for (const ln of st) { fitText(g, ln, W / 2, y, W - 150); y += size * lh; }
    y += size * 0.8;
  }
  g.font = `italic ${Math.round(size * 1.05)}px Georgia, serif`;
  g.fillStyle = '#7a6448';
  g.fillText('— Deepti', W / 2, Math.min(Hh - 80, y + size));
}
function fitText(g, s, x, y, maxW) {
  const w = g.measureText(s).width;
  if (w <= maxW) { g.fillText(s, x, y); return; }
  g.save(); g.translate(x, y); g.scale(maxW / w, 1); g.fillText(s, 0, 0); g.restore();
}

// the album's cover: sage linen, a thin gold border, the title in gold
function albumCover(title) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 408;
  const g = c.getContext('2d');
  g.fillStyle = '#8fae9f'; g.fillRect(0, 0, 512, 408);
  const r = rng(9);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(r() * 512, r() * 408, 2, 1); g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * 512, r() * 408, 1, 2); }
  g.strokeStyle = '#d9b46a'; g.lineWidth = 3; g.strokeRect(26, 26, 460, 356);
  g.fillStyle = '#e3c27d'; g.textAlign = 'center';
  g.font = 'italic 600 54px Georgia, serif';
  g.fillText(title, 256, 220);
  g.font = '22px Georgia, serif';
  g.fillText('❦', 256, 268);
  // the book lies with its top face up and its spine to the left: the texture is seen from above
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
