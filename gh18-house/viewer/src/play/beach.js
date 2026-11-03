import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COAST, BEACH, ROAD_PTS, ROAD_HALF, LANE, SHOULDER, STUDIO, STUDIO_PARK } from './site.js';
import { sandNormal, causticsTexture, fbm, normalTexture } from './surfaces.js';
import { SHORE_GLSL } from './shorewave.js';

// The world around GH-18 for /play/: land, a white-sand beach that slopes on under the sea (wet and
// glossy where the waves reach, with caustics under the water), the coastal highway loop, a few coconut
// palms, street lights, and low hills on the horizon. No other houses and nobody about. The sea itself
// is water.js.
//
// Also the ground model the car and the walker use: groundHeight(), surfaceAt() and a "sea fence"
// that keeps the car out of deep water.

export const WATER_Y = -0.35;          // still-water level

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ------------------------------------------------------------------ coastline maths
const SEG = [];
for (let i = 0; i < COAST.length - 1; i++) {
  const [ax, az] = COAST[i], [bx, bz] = COAST[i + 1];
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  SEG.push({ ax, az, dx: dx / L, dz: dz / L, L, s0: 0 });
}
for (let i = 1; i < SEG.length; i++) SEG[i].s0 = SEG[i - 1].s0 + SEG[i - 1].L;

// signed distance to the waterline: > 0 out at sea, < 0 on land. `out` gets the unit normal towards the sea.
export function coastDist(x, z, out) {
  let best = Infinity, sign = 1, nx = 0, nz = 1;
  for (const s of SEG) {
    let t = (x - s.ax) * s.dx + (z - s.az) * s.dz;
    t = Math.max(0, Math.min(s.L, t));
    const px = s.ax + s.dx * t, pz = s.az + s.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      const cross = s.dx * (z - s.az) - s.dz * (x - s.ax);
      sign = cross >= 0 ? 1 : -1;
      nx = -s.dz; nz = s.dx;                 // left of the walking direction = towards the sea
    }
  }
  if (out) { out[0] = nx; out[1] = nz; }
  return best * sign;
}

// sand profile across the beach: flat inland, a gentle fall to the waterline, then under the sea
function sandHeight(s) {
  if (s <= -BEACH) return 0;
  if (s < -6) return -0.15 * (s + BEACH) / (BEACH - 6);
  return -0.15 - (s + 6) * 0.047;
}

// ------------------------------------------------------------------ road maths
const roadCurve = new THREE.CatmullRomCurve3(ROAD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const ROAD_LEN = roadCurve.getLength();
const ROAD_N = Math.round(ROAD_LEN / 2);
export const ROAD = roadCurve.getSpacedPoints(ROAD_N).slice(0, ROAD_N).map((p, i) => {
  const t = roadCurve.getTangentAt(i / ROAD_N);
  return { x: p.x, z: p.z, tx: t.x, tz: t.z };
});
const RGRID = new Map(), RCELL = 24;
ROAD.forEach((p, i) => {
  const k = Math.floor(p.x / RCELL) + ',' + Math.floor(p.z / RCELL);
  if (!RGRID.has(k)) RGRID.set(k, []);
  RGRID.get(k).push(i);
});
export function roadDist(x, z) {
  const ci = Math.floor(x / RCELL), cj = Math.floor(z / RCELL);
  let best = Infinity;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const k of RGRID.get(i + ',' + j) || []) {
      const p = ROAD[k], d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// ------------------------------------------------------------------ ground model (car, walker, camera)
const PARK = { x0: STUDIO_PARK.x - 4.5, x1: STUDIO_PARK.x + 4, z0: 27, z1: STUDIO_PARK.z + 4 };
export function groundHeight(x, z) {
  if (roadDist(x, z) < ROAD_HALF + 0.3) return 0.01;
  if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return 0.01;
  const s = coastDist(x, z);
  if (s <= -BEACH) return 0;
  return sandHeight(s) + (s < -6 ? dune(x, z) * Math.min(1, (-6 - s) / 6) * Math.min(1, (s + BEACH) / 6) : 0);
}
function dune(x, z) { return 0.06 * Math.sin(x * 0.21 + z * 0.13) * Math.sin(z * 0.17 - x * 0.07); }

export function surfaceAt(x, z) {
  if (roadDist(x, z) < ROAD_HALF + 0.2) return 'road';
  if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return 'road';
  const s = coastDist(x, z);
  if (s > -1) return 'water';
  if (s > -BEACH) return 'sand';
  return 'ground';
}

// the car may wade a little but not drive out to sea
const SEA_LIMIT = 2.5;
export const seaFence = {
  field: true,
  test(corners) {
    let best = null;
    const n = [0, 0];
    for (const [x, z] of corners) {
      const s = coastDist(x, z, n);
      if (s > SEA_LIMIT && (!best || s - SEA_LIMIT > best.depth)) best = { n: [-n[0], -n[1]], depth: s - SEA_LIMIT };
    }
    return best;
  },
};

// ------------------------------------------------------------------ textures
function canvasTex(size, draw, repeat, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}
function speckle(g, n, size, r, cols, a0 = 0.15, a1 = 0.45, s0 = 1, s1 = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.globalAlpha = a0 + r() * (a1 - a0);
    const s = s0 + r() * (s1 - s0);
    g.fillRect(r() * size, r() * size, s, s);
  }
  g.globalAlpha = 1;
}
// white coral sand: pale grains, a few darker ones, bits of shell
const sandTex = () => canvasTex(512, (g, S) => {
  g.fillStyle = '#f1ebdf'; g.fillRect(0, 0, S, S);
  const r = rng(11);
  speckle(g, 30000, S, r, ['#fbf8f2', '#e6dccb', '#ece3d3', '#d8ccb6', '#ffffff'], 0.15, 0.55, 1, 2.2);
  speckle(g, 900, S, r, ['#b9a98f', '#a29680', '#c7b79c'], 0.3, 0.7, 1, 2);
  speckle(g, 260, S, r, ['#f7e3d6', '#efe7da', '#e9d2c0'], 0.5, 0.9, 1.5, 3.5);   // shell bits
});
const soilTex = () => canvasTex(512, (g, S) => {
  g.fillStyle = '#b9a47f'; g.fillRect(0, 0, S, S);
  const r = rng(12);
  for (let i = 0; i < 90; i++) {                                   // dry grass patches
    const x = r() * S, y = r() * S, R = 20 + r() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, R);
    grd.addColorStop(0, `rgba(${110 + r() * 30},${125 + r() * 25},${70 + r() * 20},0.55)`);
    grd.addColorStop(1, 'rgba(120,130,80,0)');
    g.fillStyle = grd; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  speckle(g, 20000, S, r, ['#c9b48e', '#a48f6b', '#8f8a5a', '#d6c6a4'], 0.15, 0.5, 1, 2.5);
});
// road: a lived-in coastal road. One tile is 48 m: shoulders, worn white edge lines, two lanes with
// darker polished tyre paths, a dashed centre line with chipped dashes, repair patches, cracks, and sand
// blown onto the edges. u runs across the road, v along it.
const ROAD_TILE = 48;
const roadTex = () => {
  const W = 512, Hh = 2048, c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d'), r = rng(13);
  const total = 2 * ROAD_HALF, px = (m) => (m / total) * W, py = (m) => (m / ROAD_TILE) * Hh;
  g.fillStyle = '#4f4e4b'; g.fillRect(0, 0, W, Hh);
  // aggregate and stains
  speckle(g, 70000, Math.max(W, Hh), r, ['#3e3d3b', '#5c5a57', '#69665f', '#2f2e2d', '#57544e'], 0.15, 0.5, 1, 2.2);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * Hh, rr = 10 + r() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, `rgba(${r() < 0.5 ? '30,29,28' : '95,92,86'},${0.08 + r() * 0.12})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // tyre paths: darker, smoother bands in each lane
  for (const lane of [SHOULDER + LANE * 0.5, total - SHOULDER - LANE * 0.5]) for (const off of [-0.8, 0.8]) {
    const x = px(lane + off), w = px(0.55);
    const grd = g.createLinearGradient(x - w, 0, x + w, 0);
    grd.addColorStop(0, 'rgba(25,25,25,0)'); grd.addColorStop(0.5, 'rgba(25,25,25,0.16)'); grd.addColorStop(1, 'rgba(25,25,25,0)');
    g.fillStyle = grd; g.fillRect(x - w, 0, w * 2, Hh);
  }
  // repair patches: darker, crisper rectangles with a sealed edge
  for (let i = 0; i < 5; i++) {
    const w = px(0.8 + r() * 2.2), h = py(0.8 + r() * 3), x = px(SHOULDER) + r() * (W - 2 * px(SHOULDER) - w), y = r() * (Hh - h);
    g.fillStyle = `rgba(38,38,37,${0.6 + r() * 0.3})`; g.fillRect(x, y, w, h);
    speckle(g, Math.round(w * h / 12), 1, r, ['#2a2a29', '#4a4946'], 0.2, 0.5, 1, 2);
    g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  }
  // shoulders a lighter, dustier grey
  g.fillStyle = 'rgba(120,114,104,0.55)'; g.fillRect(0, 0, px(SHOULDER), Hh); g.fillRect(W - px(SHOULDER), 0, px(SHOULDER), Hh);
  // paint, worn: lighter where the wheels run over it, with chips missing
  const paint = (x, y, w, h) => {
    g.fillStyle = 'rgba(236,233,224,0.82)'; g.fillRect(x, y, w, h);
    g.fillStyle = '#4f4e4b';
    for (let i = 0; i < h / 6; i++) { if (r() < 0.35) { g.globalAlpha = 0.3 + r() * 0.5; g.fillRect(x + r() * w - 2, y + r() * h, 2 + r() * 4, 2 + r() * 6); } }
    g.globalAlpha = 1;
  };
  paint(px(SHOULDER) - 5, 0, 8, Hh); paint(W - px(SHOULDER) - 3, 0, 8, Hh);
  for (let k = 0; k < 4; k++) paint(W / 2 - 5, py(k * 12), 10, py(4.5));                 // 4.5 m dash, 7.5 m gap
  // cracks: thin dark wandering lines, a few branching
  g.strokeStyle = 'rgba(18,18,18,0.75)';
  for (let i = 0; i < 26; i++) {
    let x = px(SHOULDER) + r() * (W - 2 * px(SHOULDER)), y = r() * Hh;
    g.lineWidth = 0.8 + r() * 1.4; g.beginPath(); g.moveTo(x, y);
    const n = 6 + Math.floor(r() * 14), ang = r() * Math.PI * 2;
    for (let k = 0; k < n; k++) { x += Math.cos(ang + (r() - 0.5) * 1.6) * (4 + r() * 10); y += Math.sin(ang + (r() - 0.5) * 1.6) * (4 + r() * 10); g.lineTo(x, y); }
    g.stroke();
  }
  // sand blown onto the edges, in drifts
  for (const side of [0, 1]) for (let i = 0; i < 160; i++) {
    const y = r() * Hh, depth = px(0.2 + r() * 1.3), x = side ? W - depth : 0;
    const grd = g.createLinearGradient(side ? W : 0, 0, side ? W - depth : depth, 0);
    grd.addColorStop(0, `rgba(222,210,186,${0.35 + r() * 0.35})`); grd.addColorStop(1, 'rgba(222,210,186,0)');
    g.fillStyle = grd; g.fillRect(x, y, depth, 6 + r() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return t;
};
// ------------------------------------------------------------------ build
export function buildBeach(M, opts = {}) {
  const low = !!opts.low;
  const meshes = [], objects = [], colliders = [];
  const time = { value: 0 };

  // land: everything inland of the beach (a big polygon whose sea edge is the beach's inland edge)
  const inner = offsetCoast(-BEACH);
  const shape = new THREE.Shape();
  const landPts = [...inner, [inner[inner.length - 1][0] - 6000, -4000], [-6000, -4000], [-6000, inner[0][1]]];
  landPts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const landGeo = new THREE.ShapeGeometry(shape);
  landGeo.rotateX(-Math.PI / 2);
  worldUV(landGeo);
  const soil = soilTex(); soil.repeat.set(1 / 16, 1 / 16);
  const soilN = normalTexture(fbm(256, 8, 4, 61), 256, 3); soilN.repeat.set(1 / 4, 1 / 4);
  const landMat = new THREE.MeshStandardMaterial({ map: soil, roughness: 1, normalMap: soilN, normalScale: new THREE.Vector2(0.6, 0.6) });
  const land = new THREE.Mesh(landGeo, landMat);
  land.position.y = -0.005;                // a hair below the sand's inland edge, so the seam doesn't flicker
  land.receiveShadow = true; land.name = 'land';
  meshes.push(land);

  // sand: a ribbon along the coast from the inland edge out under the water
  const S_STEPS = [-BEACH, -30, -24, -18, -12, -8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3.5, 5, 7, 9.5, 12, 16, 20, 26, 32, 40, 50, 62, 76, 92];
  const coastPts = resampleCoast(3);
  const sp = [], sh = [], suv = [], sidx = [];
  coastPts.forEach(([x, z, nx, nz]) => {
    for (const s of S_STEPS) {
      const px = x + nx * s, pz = z + nz * s;
      // under the road and the parking pad the sand stays just below them (no dunes poking through)
      const onRoad = s > -BEACH - 2 && (roadDist(px, pz) < ROAD_HALF + 1 || (px > PARK.x0 - 1 && px < PARK.x1 + 1 && pz > PARK.z0 - 1 && pz < PARK.z1 + 1));
      sp.push(px, s <= -BEACH ? -0.005 : onRoad ? -0.03 : groundHeightAtS(px, pz, s), pz);
      sh.push(s);
      suv.push(px, pz);
    }
  });
  const nS = S_STEPS.length;
  for (let i = 0; i < coastPts.length - 1; i++) for (let j = 0; j < nS - 1; j++) {
    const a = i * nS + j, b = a + 1, c = a + nS, d = c + 1;
    sidx.push(a, b, c, b, d, c);         // wound to face up
  }
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sandGeo.setAttribute('shore', new THREE.Float32BufferAttribute(sh, 1));
  sandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  sandGeo.setIndex(sidx);
  sandGeo.computeVertexNormals();
  const st = sandTex(); st.repeat.set(1 / 5, 1 / 5);
  const sn = sandNormal();                               // ripples and grains, 1 m tiles
  const caus = { value: new THREE.Color(0, 0, 0) };      // sunlight reaching the sea floor (set by the game)
  const sandMat = new THREE.MeshStandardMaterial({ map: st, roughness: 0.93, normalMap: sn, normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide });
  // wet sand where the waves reach (darker, glossy), and caustics dancing on the floor under the water
  sandMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uCaus = caus;
    sh.uniforms.uCausTex = { value: causticsTexture() };
    sh.vertexShader = 'attribute float shore;\nvarying float vShore;\nvarying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vShore = shore; vWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    sh.fragmentShader = 'uniform float uTime;\nuniform vec3 uCaus;\nuniform sampler2D uCausTex;\nvarying float vShore;\nvarying vec3 vWP;\n' + SHORE_GLSL + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float under = smoothstep( ${(WATER_Y + 0.08).toFixed(2)}, ${(WATER_Y - 0.04).toFixed(2)}, vWP.y );
        float wet = max( smoothstep( -6.0, -2.4, vShore ), under );
        // the swash zone: a film of water left by each wave as it drains back (glossy, darker), then soaking in
        float swash = smoothstep( -4.5, -1.2, vShore ) * ( 1.0 - under );
        float film = swash * pow( 0.5 + 0.5 * sin( swPhase( vShore, uTime, vWP.xz ) - 1.3 ), 2.0 );
        wet = max( wet, swash * 0.85 );
        diffuseColor.rgb *= mix( 1.0, 0.55, wet ) * ( 1.0 - film * 0.12 );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.58, wet * ( 1.0 - under ) );
        roughnessFactor = mix( roughnessFactor, 0.36, film );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize( mix( normal, nonPerturbedNormal, wet * 0.6 ) );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wd = max( 0.0, ${WATER_Y.toFixed(2)} - vWP.y );
        // light down to the sand and back up through clear water: red goes first, then green -> turquoise
        diffuseColor.rgb *= exp( -wd * vec3( 0.95, 0.2, 0.13 ) );
        vec2 cu = vWP.xz * 0.42;
        float c1 = texture2D( uCausTex, cu + vec2( uTime * 0.031, uTime * 0.019 ) ).r;
        float c2 = texture2D( uCausTex, cu * 1.37 + vec2( -uTime * 0.024, uTime * 0.033 ) ).r;
        float caustic = min( c1, c2 ) * 2.2 + ( c1 + c2 ) * 0.08;
        totalEmissiveRadiance += diffuseColor.rgb * uCaus * caustic * smoothstep( 0.03, 0.3, wd ) * exp( -wd * 0.45 );`);
  };
  sandMat.customProgramCacheKey = () => 'gh18-sand';
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.receiveShadow = true; sand.name = 'sand';
  meshes.push(sand);

  // highway ribbon
  const rp = [], ruv = [], ridx = [];
  let v = 0;
  for (let i = 0; i <= ROAD.length; i++) {
    const p = ROAD[i % ROAD.length], q = ROAD[(i + 1) % ROAD.length];
    if (i) v += Math.hypot(p.x - ROAD[i - 1].x, p.z - ROAD[i - 1].z);
    const nx = -p.tz, nz = p.tx;                 // left of the travel direction
    rp.push(p.x + nx * ROAD_HALF, 0.01, p.z + nz * ROAD_HALF, p.x - nx * ROAD_HALF, 0.01, p.z - nz * ROAD_HALF);
    ruv.push(0, v / ROAD_TILE, 1, v / ROAD_TILE);
    if (i < ROAD.length) { const a = i * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    void q;
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  roadGeo.setIndex(ridx);
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true; road.name = 'highway';
  meshes.push(road);

  // the studio's driveway and parking pad (plain asphalt)
  const asphalt = canvasTex(256, (g, S) => { g.fillStyle = '#545350'; g.fillRect(0, 0, S, S); speckle(g, 9000, S, rng(14), ['#3e3d3b', '#69665f', '#2f2e2d'], 0.2, 0.5, 1, 2); }, null);
  asphalt.repeat.set(1 / 3, 1 / 3);
  const padGeo = new THREE.BoxGeometry(PARK.x1 - PARK.x0, 0.02, PARK.z1 - PARK.z0);
  padGeo.translate((PARK.x0 + PARK.x1) / 2, 0.0, (PARK.z0 + PARK.z1) / 2);
  worldUV(padGeo);
  const padMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.receiveShadow = true;
  meshes.push(pad);

  // coconut palms: a few by GH-18, a grove at her studio, and odd ones along the beach
  const palms = [];
  const r = rng(77);
  for (const [x, z] of [[-3.5, 19.5], [12.6, 18.8], [-6, 36.5], [16, 38], [4.5, 41.5]]) palms.push({ x, z });
  for (const [x, z] of [[96.5, 40], [114.5, 41.5], [115.5, 49], [99, 54.5], [108, 55.5], [86.5, 41], [118, 36]]) palms.push({ x, z });
  for (const p of resampleCoast(70)) {
    const s = -10 - r() * 18, x = p[0] + p[2] * s, z = p[1] + p[3] * s;
    if (Math.hypot(x - 105, z - 46) < 40 || Math.hypot(x - 5, z - 20) < 30) continue;
    if (roadDist(x, z) < ROAD_HALF + 3) continue;
    palms.push({ x, z });
    if (r() < 0.4) palms.push({ x: x + 2 + r() * 3, z: z - 1 - r() * 2 });
  }
  objects.push(...buildPalms(palms, low, time));
  for (const p of palms) colliders.push({ circle: [p.x, p.z, 0.28] });

  // street lights on the inner side of the loop, every ~50 m
  const lamps = [];
  const cx = ROAD_PTS.reduce((s, p) => s + p[0], 0) / ROAD_PTS.length, cz = ROAD_PTS.reduce((s, p) => s + p[1], 0) / ROAD_PTS.length;
  for (let i = 0; i < ROAD.length; i += 25) {
    const p = ROAD[i];
    let nx = -p.tz, nz = p.tx;
    if ((p.x + nx - cx) ** 2 + (p.z + nz - cz) ** 2 > (p.x - nx - cx) ** 2 + (p.z - nz - cz) ** 2) { nx = -nx; nz = -nz; }
    const off = ROAD_HALF + 1.0;
    const x = p.x + nx * off, z = p.z + nz * off;
    if (x > -2 && x < 12 && z > 18 && z < 24) continue;          // keep GH-18's gate clear
    lamps.push({ x, z, ax: -nx, az: -nz });
    colliders.push({ circle: [x, z, 0.14] });
  }
  objects.push(...buildLamps(lamps));

  // horizon: low hills inland, a far headland across the bay
  const hills = [];
  const hr = rng(91);
  for (let k = 0; k < 26; k++) {
    const a = Math.PI * (0.55 + hr() * 1.0), d = 1500 + hr() * 1400;
    const x = Math.cos(a) * d - 200, z = Math.sin(a) * d * 0.9 - 300;
    if (coastDist(x, z) > -200) continue;
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.scale(220 + hr() * 380, 40 + hr() * 110, 180 + hr() * 300);
    g.translate(x, -8, z);
    hills.push(g);
  }
  // the far headland: a long ridge with an uneven crest (not a smooth dome)
  const head = new THREE.IcosahedronGeometry(1, 4);
  const hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const crest = 1 + 0.35 * Math.sin(x * 7.1 + 1.3) * Math.cos(z * 3.3) + 0.22 * Math.sin(x * 15.7 + z * 4.1) + 0.5 * Math.max(0, x) ** 2 - 0.25 * Math.max(0, -x);
    hp.setY(i, y > 0 ? y * crest : y);
  }
  head.scale(900, 95, 260); head.rotateY(0.5); head.translate(1500, -20, 900);
  hills.push(head);
  const hillMesh = new THREE.Mesh(mergeGeometries(hills.map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshStandardMaterial({ color: 0x8a8f72, roughness: 1, flatShading: true }));
  hillMesh.name = 'hills';
  meshes.push(hillMesh);

  return {
    meshes, objects, colliders, lamps, time, palms, caustics: caus,
    materials: { lamp: LAMP_MAT, sand: sandMat, land: landMat, pad: padMat, road: roadMat },
    update(t) { time.value = t; },
    map: { coast: COAST, road: ROAD.filter((_, i) => i % 3 === 0), park: PARK },
  };
}

function groundHeightAtS(x, z, s) {
  return sandHeight(s) + (s < -6 ? dune(x, z) * Math.min(1, (-6 - s) / 6) * Math.min(1, (s + BEACH) / 6) : 0);
}

// points along the coastline every `step` metres, with the unit normal towards the sea: [x, z, nx, nz]
function resampleCoast(step) {
  const out = [];
  for (const s of SEG) {
    for (let t = 0; t < s.L; t += step) out.push([s.ax + s.dx * t, s.az + s.dz * t, -s.dz, s.dx]);
  }
  const last = SEG[SEG.length - 1];
  out.push([last.ax + last.dx * last.L, last.az + last.dz * last.L, -last.dz, last.dx]);
  // smooth the normals at the corners so the ribbons don't fold
  for (let k = 0; k < 3; k++) for (let i = 1; i < out.length - 1; i++) {
    const nx = out[i - 1][2] + out[i][2] * 2 + out[i + 1][2], nz = out[i - 1][3] + out[i][3] * 2 + out[i + 1][3], L = Math.hypot(nx, nz);
    out[i][2] = nx / L; out[i][3] = nz / L;
  }
  return out;
}
// coastline samples for other modules (the spray): [x, z, nx, nz] every `step` m, normal towards the sea
export function coastSamples(step) { return resampleCoast(step); }
function offsetCoast(s) { return resampleCoast(8).map(([x, z, nx, nz]) => [x + nx * s, z + nz * s]); }

function worldUV(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ------------------------------------------------------------------ wind
// bend an instanced plant with the wind: sway grows with height (squared), each instance out of step;
// `flutter` adds a quicker shiver to leaves and blades. The breeze comes off the sea (towards -Z).
export function windSway(mat, time, flutter, key, height = 9) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hk = clamp(position.y / ${height.toFixed(1)}, 0.0, 1.5); hk *= hk;
      float ph = ip.x * 0.37 + ip.z * 0.61;
      float gust = 0.6 + 0.4 * sin(uTime * 0.23 + ip.x * 0.01);
      float sway = (sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25 + 0.5) * gust;
      transformed.z -= sway * 0.22 * hk * ${(height / 9).toFixed(2)};
      transformed.x += sin(uTime * 0.9 + ph * 1.3) * 0.08 * hk * ${(height / 9).toFixed(2)};
      transformed += normal * sin(uTime * 7.0 + position.x * 3.1 + position.z * 2.3 + ph) * ${flutter.toFixed(3)} * hk;`);
  };
  mat.customProgramCacheKey = () => 'gh18-wind-' + key;
}

// ------------------------------------------------------------------ palms
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 512);
  const r = rng(5);
  // rib down the middle, leaflets either side, longer in the middle of the frond
  for (let y = 20; y < 500; y += 7) {
    const t = y / 512, len = 58 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 4;
    for (const side of [-1, 1]) {
      const hue = 95 + r() * 18, l = 26 + r() * 12;
      g.strokeStyle = `hsl(${hue}, 45%, ${l}%)`;
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + side * len * 0.5, y + 6, 64 + side * len, y + 22 + r() * 6); g.stroke();
    }
  }
  g.strokeStyle = '#6b6a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildPalms(list, low, time) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7258, roughness: 0.95, vertexColors: true });
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x6b5a2a, roughness: 0.7 });
  // the sea breeze: the trunk leans and sways gently (more towards the top), the fronds flutter
  for (const [m, flutter] of [[trunkMat, 0], [frondMat, 1], [nutMat, 0]]) windSway(m, time, flutter ? 0.11 : 0, 'palm' + flutter);
  const out = [];
  const variants = [0, 1, 2].map((k) => palmGeometry(k, low));
  const groups = variants.map(() => []);
  list.forEach((p, i) => groups[i % 3].push(p));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  variants.forEach((v, k) => {
    const items = groups[k];
    if (!items.length) return;
    const parts = [[v.trunk, trunkMat], [v.fronds, frondMat], [v.nuts, nutMat]];
    for (const [geo, mat] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((p, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (p.x * 12.9898 + p.z * 78.233) % (Math.PI * 2));
        const sc = 0.85 + ((p.x * 7 + p.z * 3) % 1 + 1) % 1 * 0.35;
        s.setScalar(sc); pos.set(p.x, groundHeight(p.x, p.z) - 0.05, p.z);
        m.compose(pos, q, s);
        im.setMatrixAt(i, m);
      });
      im.castShadow = true; im.receiveShadow = true; im.name = 'palm';
      out.push(im);
    }
  });
  return out;
}

function palmGeometry(k, low) {
  const r = rng(300 + k);
  const H = 7 + r() * 3.5, lean = 0.9 + r() * 1.6;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.2, H * 0.35, 0), new THREE.Vector3(lean * 0.6, H * 0.7, 0), new THREE.Vector3(lean, H, 0),
  ]);
  const trunk = new THREE.TubeGeometry(curve, low ? 8 : 14, 0.17, low ? 6 : 9, false);
  // taper and ring bands
  const p = trunk.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i);
    const t = Math.min(1, Math.max(0, tmp.y / H));
    const ax = curve.getPointAt(t);
    const scale = 1.25 - t * 0.45;
    p.setXYZ(i, ax.x + (tmp.x - ax.x) * scale, tmp.y, ax.z + (tmp.z - ax.z) * scale);
    const band = 0.5 + 0.5 * Math.sin(tmp.y * 9.5);
    c.setRGB(0.62 + band * 0.12, 0.52 + band * 0.1, 0.42 + band * 0.08);
    col.set([c.r, c.g, c.b], i * 3);
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
  trunk.computeVertexNormals();
  const top = curve.getPointAt(1);
  // fronds: curved strips radiating from the crown, drooping towards the tips
  const fronds = [];
  const n = low ? 10 : 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const len = 3.6 + r() * 1.4, up = i % 3 === 0 ? 0.55 : 0.15 + r() * 0.2;
    const g = new THREE.PlaneGeometry(1.5, len, 1, low ? 5 : 8);
    g.translate(0, len / 2, 0);
    const pp = g.attributes.position;
    for (let j = 0; j < pp.count; j++) {
      const y = pp.getY(j), t = y / len;
      const droop = t * t * len * 0.75;
      pp.setXYZ(j, pp.getX(j) * (0.35 + Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.65), y * Math.cos(up), y * Math.sin(up) - droop + Math.abs(pp.getX(j)) * 0.25);
    }
    // the strip lies along +Y (out) and +Z (up): turn it to lie outward, then spin it round the crown
    g.rotateX(-Math.PI / 2);
    g.rotateY(a);
    g.translate(top.x, top.y, top.z);
    g.computeVertexNormals();
    fronds.push(g);
  }
  const nuts = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.SphereGeometry(0.13, 8, 6);
    const a = i * 1.7;
    s.translate(top.x + Math.cos(a) * 0.22, top.y - 0.25, top.z + Math.sin(a) * 0.22);
    nuts.push(s);
  }
  return { trunk, fronds: mergeGeometries(fronds), nuts: mergeGeometries(nuts) };
}

// ------------------------------------------------------------------ street lights
const LAMP_MAT = new THREE.MeshStandardMaterial({ color: 0xf4efe4, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
function buildLamps(list) {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 8, 8); pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.8); arm.translate(0, 7.9, 0.85);
  const head = new THREE.BoxGeometry(0.32, 0.12, 0.62); head.translate(0, 7.82, 1.75);
  const pm = new THREE.InstancedMesh(mergeGeometries([pole, arm]), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.45, metalness: 0.7 }), list.length);
  const hm = new THREE.InstancedMesh(head, LAMP_MAT, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  list.forEach((l, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(l.ax, l.az));
    m.compose(new THREE.Vector3(l.x, 0, l.z), q, new THREE.Vector3(1, 1, 1));
    pm.setMatrixAt(i, m); hm.setMatrixAt(i, m);
    l.hx = l.x + l.ax * 1.75; l.hz = l.z + l.az * 1.75;     // where the light hangs
  });
  pm.castShadow = true; pm.name = 'lamps'; hm.name = 'lamp_heads';
  return [pm, hm];
}
