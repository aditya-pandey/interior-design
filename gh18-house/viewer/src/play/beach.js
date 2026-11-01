import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COAST, BEACH, ROAD_PTS, ROAD_HALF, LANE, SHOULDER, STUDIO, STUDIO_PARK } from './site.js';

// The world around GH-18 for /play/: land, a sandy beach that slopes into the sea, the sea itself
// (animated normals, foam at the waterline), the coastal highway loop, a few coconut palms, street
// lights, and low hills on the horizon. No other houses and nobody about.
//
// Also the ground model the car and the walker use: groundHeight(), surfaceAt() and a "sea fence"
// that keeps the car out of deep water.

const WATER_Y = -0.35;

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
const sandTex = () => canvasTex(512, (g, S) => {
  g.fillStyle = '#e6d3b0'; g.fillRect(0, 0, S, S);
  const r = rng(11);
  speckle(g, 26000, S, r, ['#f3e4c6', '#cdb48c', '#d9c29b', '#bfa47a', '#fff4dc'], 0.15, 0.5, 1, 2.2);
  speckle(g, 300, S, r, ['#a68b62', '#8c7a63', '#efe7da'], 0.4, 0.8, 1.5, 3.5);   // shell bits
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
// road: shoulders, white edge lines, two lanes, dashed white centre line; v runs along the road (12 m per tile)
const roadTex = () => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d'), W = 256, Hh = 512;
  const total = 2 * ROAD_HALF, px = (m) => (m / total) * W;
  g.fillStyle = '#4d4c4a'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#6d6a64'; g.fillRect(0, 0, px(SHOULDER), Hh); g.fillRect(W - px(SHOULDER), 0, px(SHOULDER), Hh);
  const r = rng(13);
  speckle(g, 14000, 512, r, ['#3e3d3b', '#5c5a57', '#69665f', '#2f2e2d'], 0.2, 0.55, 1, 2);
  g.fillStyle = '#e9e7e0';
  g.fillRect(px(SHOULDER) - 3, 0, 5, Hh); g.fillRect(W - px(SHOULDER) - 2, 0, 5, Hh);
  g.fillRect(W / 2 - 3, 0, 6, Hh * (4.5 / 12));                    // 4.5 m dash, 7.5 m gap
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return t;
};
// tileable wave normals from a sum of integer-frequency sines
function waterNormals() {
  const S = 256, h = new Float32Array(S * S), r = rng(21);
  const waves = Array.from({ length: 14 }, () => ({ fx: Math.floor(r() * 9) - 4, fy: Math.floor(r() * 9) - 4 || 1, ph: r() * 6.28, a: 0.4 + r() }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin((w.fx * x + w.fy * y) / S * Math.PI * 2 + w.ph) / Math.hypot(w.fx, w.fy);
    h[y * S + x] = v;
  }
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + (x + 1) % S] - h[y * S + (x - 1 + S) % S];
    const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

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
  const land = new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({ map: soil, roughness: 1 }));
  land.position.y = -0.005;                // a hair below the sand's inland edge, so the seam doesn't flicker
  land.receiveShadow = true; land.name = 'land';
  meshes.push(land);

  // sand: a ribbon along the coast from the inland edge out under the water
  const S_STEPS = [-BEACH, -30, -24, -18, -12, -8, -6, -4, -2, 0, 3, 7, 12, 20, 32];
  const coastPts = resampleCoast(4);
  const sp = [], sc = [], suv = [], sidx = [];
  const wet = new THREE.Color(0xb59a76), dry = new THREE.Color(0xffffff), tmp = new THREE.Color();
  coastPts.forEach(([x, z, nx, nz]) => {
    for (const s of S_STEPS) {
      const px = x + nx * s, pz = z + nz * s;
      // under the road and the parking pad the sand stays just below them (no dunes poking through)
      const onRoad = s > -BEACH - 2 && (roadDist(px, pz) < ROAD_HALF + 1 || (px > PARK.x0 - 1 && px < PARK.x1 + 1 && pz > PARK.z0 - 1 && pz < PARK.z1 + 1));
      sp.push(px, s <= -BEACH ? -0.005 : onRoad ? -0.03 : groundHeightAtS(px, pz, s), pz);
      const w = Math.min(1, Math.max(0, (s + 5) / 4));
      tmp.copy(dry).lerp(wet, w);
      sc.push(tmp.r, tmp.g, tmp.b);
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
  sandGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  sandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  sandGeo.setIndex(sidx);
  sandGeo.computeVertexNormals();
  const st = sandTex(); st.repeat.set(1 / 5, 1 / 5);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: st, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  sand.receiveShadow = true; sand.name = 'sand';
  meshes.push(sand);

  // sea: one big plane under the land, with two layers of scrolling wave normals; a shallow tint near the shore
  const nm = waterNormals();
  nm.repeat.set(1 / 9, 1 / 9);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x1f5f6e, roughness: 0.06, metalness: 0.05, normalMap: nm, normalScale: new THREE.Vector2(0.55, 0.55), transparent: true, opacity: 0.93 });
  seaMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec3 n1 = texture2D( normalMap, vNormalMapUv + vec2( uTime * 0.011, uTime * 0.007 ) ).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D( normalMap, vNormalMapUv * 0.37 + vec2( -uTime * 0.006, uTime * 0.009 ) ).xyz * 2.0 - 1.0;
      vec3 mapN = normalize( vec3( ( n1.xy + n2.xy ) * normalScale, n1.z * n2.z ) );
      normal = normalize( tbn * mapN );`);
  };
  seaMat.customProgramCacheKey = () => 'gh18-sea';
  const seaGeo = new THREE.PlaneGeometry(14000, 14000, 1, 1);
  seaGeo.rotateX(-Math.PI / 2);
  worldUV(seaGeo);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.y = WATER_Y;
  sea.receiveShadow = true; sea.name = 'sea';
  sea.renderOrder = 1;
  meshes.push(sea);

  // foam: a strip at the waterline whose white streaks wash in and out
  const foamTex = canvasTex(256, (g, S) => {
    g.clearRect(0, 0, S, S);
    const r = rng(31);
    for (let i = 0; i < 220; i++) {
      const y = r() * S, x = r() * S, w = 20 + r() * 90, a = 0.25 + r() * 0.6;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath(); g.ellipse(x, y, w, 1.5 + r() * 3, 0, 0, Math.PI * 2); g.fill();
    }
  }, null, true);
  const fp = [], fuv = [], fidx = [];
  const FS = [-4.5, -2.5, -0.5, 1.5];
  let along = 0;
  coastPts.forEach(([x, z, nx, nz], i) => {
    if (i) along += Math.hypot(x - coastPts[i - 1][0], z - coastPts[i - 1][1]);
    FS.forEach((s, j) => { fp.push(x + nx * s, WATER_Y + 0.02, z + nz * s); fuv.push(along / 18, j / (FS.length - 1)); });
  });
  for (let i = 0; i < coastPts.length - 1; i++) for (let j = 0; j < FS.length - 1; j++) {
    const a = i * FS.length + j, b = a + 1, c = a + FS.length, d = c + 1;
    fidx.push(a, b, c, b, d, c);
  }
  const foamGeo = new THREE.BufferGeometry();
  foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  foamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
  foamGeo.setIndex(fidx);
  foamGeo.computeVertexNormals();
  const foamMat = new THREE.MeshStandardMaterial({ map: foamTex, transparent: true, depthWrite: false, roughness: 0.6, color: 0xffffff });
  foamMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      float wave = 0.5 + 0.5 * sin( uTime * 0.55 + vMapUv.x * 0.9 );
      float band = smoothstep( 0.0, 0.25, vMapUv.y ) * ( 1.0 - smoothstep( 0.45 + wave * 0.4, 1.0, vMapUv.y ) );
      vec4 fc = texture2D( map, vec2( vMapUv.x, vMapUv.y * 1.6 - wave * 0.5 + uTime * 0.02 ) );
      diffuseColor *= vec4( 1.0, 1.0, 1.0, fc.a * band * 0.85 );`);
  };
  foamMat.customProgramCacheKey = () => 'gh18-foam';
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.renderOrder = 2; foam.name = 'foam';
  meshes.push(foam);

  // highway ribbon
  const rp = [], ruv = [], ridx = [];
  let v = 0;
  for (let i = 0; i <= ROAD.length; i++) {
    const p = ROAD[i % ROAD.length], q = ROAD[(i + 1) % ROAD.length];
    if (i) v += Math.hypot(p.x - ROAD[i - 1].x, p.z - ROAD[i - 1].z);
    const nx = -p.tz, nz = p.tx;                 // left of the travel direction
    rp.push(p.x + nx * ROAD_HALF, 0.01, p.z + nz * ROAD_HALF, p.x - nx * ROAD_HALF, 0.01, p.z - nz * ROAD_HALF);
    ruv.push(0, v / 12, 1, v / 12);
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
  const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }));
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
  objects.push(...buildPalms(palms, low));
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
  const head = new THREE.IcosahedronGeometry(1, 2);
  head.scale(900, 90, 260); head.rotateY(0.5); head.translate(1500, -20, 900);
  hills.push(head);
  const hillMesh = new THREE.Mesh(mergeGeometries(hills.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x8a8f72, roughness: 1, flatShading: true }));
  hillMesh.name = 'hills';
  meshes.push(hillMesh);

  return {
    meshes, objects, colliders, lamps, time, palms,
    materials: { sea: seaMat, lamp: LAMP_MAT },
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
function offsetCoast(s) { return resampleCoast(8).map(([x, z, nx, nz]) => [x + nx * s, z + nz * s]); }

function worldUV(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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

function buildPalms(list, low) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7258, roughness: 0.95, vertexColors: true });
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x6b5a2a, roughness: 0.7 });
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
