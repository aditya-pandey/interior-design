import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundHeight } from './beach.js';

// The lighthouse on the headland, where the coast turns south ~90 m west of her studio (the sea on two sides,
// the sun going down behind it as seen from the studio's terrace).
//
// A granite outcrop at the water's edge, a stone apron on it with a low parapet, steps up from the beach; a
// tapering white tower with red bands, 22 m, a door, small windows climbing it; the gallery at the top (she can
// walk right round it), the glazed lantern room, a copper dome. After dusk the lamp turns: two beams sweep the
// sea every 12 s, and the lantern glows. A gravel lay-by off the coast road and a flagstone path with low lamps.
//
// E at the door climbs to the top (a fade, like the house's lift: "122 steps"); E at the hatch up there comes down.

export const LIGHTHOUSE = { x: 212, z: 23 };
const A = 2.2;                       // the apron's top (m)
const H = 22;                        // the tower, apron to gallery
const TOP = A + H;                   // the gallery floor
const R0 = 2.6, R1 = 1.95;           // the tower's radius at the foot and at the top
export const LIGHTHOUSE_PARK = { x: 186.5, z: -3.5 };

export function buildLighthouse() {
  const group = new THREE.Group(); group.name = 'lighthouse';
  const { x: LX, z: LZ } = LIGHTHOUSE;
  const carColliders = [], colliders = [], surfaces = [], interact = [];
  const mm = (v) => Math.round(v * 1000);
  const ring = (cx, cz, r, n = 16, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });
  const polyMM = (pts) => pts.map(([x, z]) => [mm(x), mm(z)]);
  const add = (geo, mat, cast = true, receive = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; group.add(m); return m; };
  const rng = (() => { let s = 31; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const M = {
    rock: new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.95, flatShading: true }),
    wet: new THREE.MeshStandardMaterial({ color: 0x4f4a45, roughness: 0.55, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.92 }),
    tower: new THREE.MeshStandardMaterial({ map: bandTexture(), roughness: 0.7 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.45, metalness: 0.6 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x3f6f62, roughness: 0.5, metalness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeef2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    lens: new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffd99a, emissiveIntensity: 0.2, roughness: 0.15, metalness: 0.3 }),
    door: new THREE.MeshStandardMaterial({ color: 0x2f4a3f, roughness: 0.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0xb8ad98, roughness: 1 }),
    win: new THREE.MeshStandardMaterial({ color: 0x1d2a33, emissive: 0xffc98a, emissiveIntensity: 0, roughness: 0.3 }),
  };

  // ---- the outcrop: granite boulders round a flat-topped mound, spilling into the sea on the north-west
  const boulders = [], wet = [];
  const boulder = (x, z, r, y, squash = 0.65, list = boulders) => {
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.78 + rng() * 0.38; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k); }
    g.rotateY(rng() * 6); g.translate(x, y, z); g.computeVertexNormals(); list.push(g);
  };
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + rng() * 0.2, r = 5.4 + rng() * 1.6; boulder(LX + Math.cos(a) * r, LZ + Math.sin(a) * r, 1.6 + rng() * 1.2, A - 1.4 - rng() * 0.6); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 3.5; boulder(LX + Math.cos(a) * r, LZ + Math.sin(a) * r, 2.2, A - 1.6); }
  // (towards the sea: a spill of wet rocks into the water)
  for (let i = 0; i < 18; i++) { const a = 0.55 + (rng() - 0.5) * 1.6, r = 7 + rng() * 9; boulder(LX + Math.cos(a) * r, LZ + Math.sin(a) * r, 0.6 + rng() * 1.3, -0.5 - rng() * 0.3, 0.7, rng() < 0.6 ? wet : boulders); }
  add(mergeGeometries(boulders.map((g) => g.toNonIndexed())), M.rock);
  add(mergeGeometries(wet.map((g) => g.toNonIndexed())), M.wet);
  carColliders.push({ poly: ring(LX, LZ, 7.4, 14) });
  carColliders.push({ poly: [[LX + 5, LZ + 4], [LX + 17, LZ + 10], [LX + 15, LZ + 18], [LX + 3, LZ + 9]] });
  // the apron: flagstones, a low parapet (a gap for the steps, which come up from the south-east)
  const STEP_DIR = Math.atan2(-6, -5);                         // towards the path (south-east of the tower)
  add(new THREE.CylinderGeometry(4.7, 5.0, 0.5, 40).translate(LX, A - 0.25, LZ), M.stone, false);
  surfaces.push({ poly: polyMM(ring(LX, LZ, 4.55, 24)), y: A });
  const parapet = [];
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2, am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am - STEP_DIR), Math.cos(am - STEP_DIR))) < 0.22) continue;
    const len = 2 * 4.6 * Math.sin(Math.PI / 28), g = new THREE.BoxGeometry(len + 0.05, 0.6, 0.32);
    g.rotateY(-am + Math.PI / 2); g.translate(LX + Math.cos(am) * 4.6, A + 0.3, LZ + Math.sin(am) * 4.6); parapet.push(g);
    const c = [[a0, 4.42], [a1, 4.42], [a1, 4.85], [a0, 4.85]].map(([a, r]) => [LX + Math.cos(a) * r, LZ + Math.sin(a) * r]);
    colliders.push({ poly: polyMM(c), y0: A - 0.1, y1: A + 0.9 });
  }
  add(mergeGeometries(parapet), M.wall);
  // around the mound at beach level (she can't walk up the rocks, only the steps)
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2, am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am - STEP_DIR), Math.cos(am - STEP_DIR))) < 0.3) continue;
    colliders.push({ poly: polyMM([[a0, 4.9], [a1, 4.9], [a1, 7.0], [a0, 7.0]].map(([a, r]) => [LX + Math.cos(a) * r, LZ + Math.sin(a) * r])), y0: -1, y1: A - 0.3 });
  }
  // the steps: ten of them, 0.22 m, from the sand to the apron
  const sd = [Math.cos(STEP_DIR), Math.sin(STEP_DIR)], sr = [-sd[1], sd[0]];
  const steps = [], gy = groundHeight(LX + sd[0] * 8.5, LZ + sd[1] * 8.5);
  const N = 10, rise = (A - gy) / N, tread = 0.38, W2 = 0.9;
  for (let k = 0; k < N; k++) {
    const d0 = 4.6 + (N - 1 - k) * tread, d1 = d0 + tread, y = gy + rise * (k + 1);
    const cx = LX + sd[0] * (d0 + d1) / 2, cz = LZ + sd[1] * (d0 + d1) / 2;
    const g = new THREE.BoxGeometry(tread, y - gy + 0.2, W2 * 2); g.rotateY(-STEP_DIR); g.translate(cx, (y + gy - 0.2) / 2, cz); steps.push(g);
    const q = [[d0, -W2], [d1, -W2], [d1, W2], [d0, W2]].map(([d, w]) => [LX + sd[0] * d + sr[0] * w, LZ + sd[1] * d + sr[1] * w]);
    surfaces.push({ poly: polyMM(q), y });
  }
  add(mergeGeometries(steps), M.wall);
  for (const s of [-1, 1]) {                                     // low walls each side of the steps
    const q = [[4.5, s * W2], [4.6 + N * tread + 0.1, s * W2], [4.6 + N * tread + 0.1, s * (W2 + 0.3)], [4.5, s * (W2 + 0.3)]].map(([d, w]) => [LX + sd[0] * d + sr[0] * w, LZ + sd[1] * d + sr[1] * w]);
    colliders.push({ poly: polyMM(q), y0: -1, y1: A + 0.8 });
    const g = new THREE.BoxGeometry(N * tread + 0.6, 0.5, 0.28); g.rotateY(-STEP_DIR);
    const d = 4.6 + (N * tread) / 2; g.translate(LX + sd[0] * d + sr[0] * s * (W2 + 0.15), A - 0.6, LZ + sd[1] * d + sr[1] * s * (W2 + 0.15)); add(g, M.wall);
  }

  // ---- the tower: white with two red bands, tapering; a door, windows climbing round it
  add(new THREE.CylinderGeometry(R1, R0, H, 48, 1, true).translate(LX, A + H / 2, LZ), M.tower);
  add(new THREE.CylinderGeometry(R0 + 0.12, R0 + 0.2, 0.5, 48).translate(LX, A + 0.25, LZ), M.wall);
  colliders.push({ poly: polyMM(ring(LX, LZ, R0 + 0.05, 20)), y0: A - 0.5, y1: TOP - 0.2 });
  const doorA = STEP_DIR;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), M.door);
  door.position.set(LX + Math.cos(doorA) * (R0 + 0.03), A + 1.05, LZ + Math.sin(doorA) * (R0 + 0.03)); door.rotation.y = Math.PI / 2 - doorA; group.add(door);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.2), M.wall); lintel.position.set(LX + Math.cos(doorA) * (R0 + 0.06), A + 2.2, LZ + Math.sin(doorA) * (R0 + 0.06)); lintel.rotation.y = Math.PI / 2 - doorA; group.add(lintel);
  const doorLamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), M.lamp); doorLamp.position.set(LX + Math.cos(doorA) * (R0 + 0.25), A + 2.55, LZ + Math.sin(doorA) * (R0 + 0.25)); group.add(doorLamp);
  const wins = [];
  for (let k = 0; k < 6; k++) {
    const y = A + 4 + k * 3.1, r = R0 + (R1 - R0) * ((y - A) / H) + 0.02, a = doorA + 0.6 + k * 1.15;
    const g = new THREE.PlaneGeometry(0.42, 0.75); g.rotateY(Math.PI / 2 - a); g.translate(LX + Math.cos(a) * r, y, LZ + Math.sin(a) * r); wins.push(g);
  }
  add(mergeGeometries(wins), M.win, false);
  interact.push({ kind: 'climb', label: 'Climb to the top (122 steps)', pos: [LX + Math.cos(doorA) * (R0 + 0.15), A + 1.2, LZ + Math.sin(doorA) * (R0 + 0.15)], normal: [Math.cos(doorA), Math.sin(doorA)], r: 2.4 });

  // ---- the gallery: an iron deck right round, a railing; the lantern room; the dome
  add(new THREE.CylinderGeometry(3.15, 2.2, 0.35, 48).translate(LX, TOP - 0.175, LZ), M.iron);
  const deck = [];
  for (let i = 0; i < 32; i++) {
    const a0 = (i / 32) * Math.PI * 2, a1 = ((i + 1) / 32) * Math.PI * 2;
    surfaces.push({ poly: polyMM([[a0, 1.2], [a1, 1.2], [a1, 3.15], [a0, 3.15]].map(([a, r]) => [LX + Math.cos(a) * r, LZ + Math.sin(a) * r])), y: TOP });
    colliders.push({ poly: polyMM([[a0, 3.0], [a1, 3.0], [a1, 3.6], [a0, 3.6]].map(([a, r]) => [LX + Math.cos(a) * r, LZ + Math.sin(a) * r])), y0: TOP - 0.3, y1: TOP + 1.3 });
    const pa = (a0 + a1) / 2;
    deck.push(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 6).translate(LX + Math.cos(pa) * 3.05, TOP + 0.52, LZ + Math.sin(pa) * 3.05));
  }
  for (const y of [TOP + 1.05, TOP + 0.55]) deck.push(new THREE.TorusGeometry(3.05, y > TOP + 1 ? 0.03 : 0.015, 6, 64).rotateX(Math.PI / 2).translate(LX, y, LZ));
  add(mergeGeometries(deck.map((g) => g.toNonIndexed())), M.iron);
  colliders.push({ poly: polyMM(ring(LX, LZ, 1.55, 16)), y0: TOP - 0.3, y1: TOP + 3.5 });
  // the lantern room: a glazed drum with iron mullions, the lens inside, a domed copper roof with a ball and a rod
  add(new THREE.CylinderGeometry(1.5, 1.5, 0.7, 32).translate(LX, TOP + 0.35, LZ), M.iron);
  add(new THREE.CylinderGeometry(1.45, 1.45, 2.3, 32, 1, true).translate(LX, TOP + 1.85, LZ), M.glass, false, false);
  const mull = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mull.push(new THREE.BoxGeometry(0.06, 2.3, 0.06).translate(LX + Math.cos(a) * 1.46, TOP + 1.85, LZ + Math.sin(a) * 1.46)); }
  mull.push(new THREE.TorusGeometry(1.46, 0.04, 6, 48).rotateX(Math.PI / 2).translate(LX, TOP + 3.0, LZ));
  add(mergeGeometries(mull.map((g) => g.toNonIndexed())), M.iron);
  const lens = add(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 24).translate(LX, TOP + 1.75, LZ), M.lens);
  add(new THREE.SphereGeometry(1.62, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(LX, TOP + 3.0, LZ), M.copper);
  add(new THREE.SphereGeometry(0.16, 16, 10).translate(LX, TOP + 4.1, LZ), M.copper);
  add(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6).translate(LX, TOP + 4.75, LZ), M.iron);
  interact.push({ kind: 'descend', label: 'Go back down', pos: [LX + Math.cos(doorA) * 2.2, TOP + 1.2, LZ + Math.sin(doorA) * 2.2], r: 1.7 });
  // a bench up here, facing the sunset (west, +x)
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a5e3c, roughness: 0.6 }));
  bench.position.set(LX + 2.35, TOP + 0.45, LZ - 0.4); bench.castShadow = true; group.add(bench);
  for (const dz of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.06, 0.45, 0.06).translate(LX + 2.35, TOP + 0.22, LZ - 0.4 + dz), M.iron);
  // the light: a glow in the lantern and two beams sweeping the sea
  const lampLight = new THREE.PointLight(0xffe0a8, 0, 22, 1.8); lampLight.position.set(LX, TOP + 1.8, LZ); group.add(lampLight);
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beams = new THREE.Group(); beams.position.set(LX, TOP + 1.75, LZ); group.add(beams);
  for (const s of [0, Math.PI]) {
    const g = new THREE.CylinderGeometry(5, 0.3, 90, 24, 1, true); g.translate(0, 45, 0); g.rotateZ(-Math.PI / 2 - 0.035); g.rotateY(s);
    const m = new THREE.Mesh(g, beamMat); m.renderOrder = 8; m.frustumCulled = false; beams.add(m);
  }

  // ---- the lay-by, the path, the path lamps
  const P = LIGHTHOUSE_PARK;
  add(new THREE.BoxGeometry(9, 0.06, 7.5).translate(P.x, 0.0, P.z), M.gravel, false);
  const startX = P.x + 3.5, startZ = P.z + 3, endX = LX + sd[0] * (4.6 + N * tread + 0.4), endZ = LZ + sd[1] * (4.6 + N * tread + 0.4);
  const flags = [], posts = [], lampHeads = [];
  const L = Math.hypot(endX - startX, endZ - startZ), nF = Math.floor(L / 0.75);
  for (let i = 0; i <= nF; i++) {
    const t = i / nF, x = startX + (endX - startX) * t + (rng() - 0.5) * 0.12, z = startZ + (endZ - startZ) * t + (rng() - 0.5) * 0.12;
    const g = new THREE.CylinderGeometry(0.42 + rng() * 0.12, 0.45, 0.06, 7); g.rotateY(rng() * 3); g.translate(x, groundHeight(x, z) + 0.02, z); flags.push(g);
    if (i % 7 === 3) for (const s of [-1, 1]) {
      const dx = (endZ - startZ) / L, dz = -(endX - startX) / L, px = x + dx * s * 1.1, pz = z + dz * s * 1.1, y0 = groundHeight(px, pz);
      posts.push(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8).translate(px, y0 + 0.27, pz));
      lampHeads.push(new THREE.BoxGeometry(0.16, 0.08, 0.16).translate(px, y0 + 0.58, pz));
    }
  }
  add(mergeGeometries(flags.map((g) => g.toNonIndexed())), M.stone, false);
  add(mergeGeometries(posts.map((g) => g.toNonIndexed())), M.iron);
  add(mergeGeometries(lampHeads.map((g) => g.toNonIndexed())), M.lamp, false);

  let nightK = 0;
  return {
    group, carColliders, interact, walk: { colliders, surfaces },
    door: { x: LX + Math.cos(doorA) * (R0 + 1.1), z: LZ + Math.sin(doorA) * (R0 + 1.1), y: A, yaw: doorA },
    top: { x: LX + 2.4, z: LZ + 0.9, y: TOP, yaw: Math.PI / 2 },           // (on the gallery, facing west: the sunset)
    TOP, park: P,
    setNight(on) { nightK = on ? 1 : 0; M.lamp.emissiveIntensity = on ? 2.2 : 0; M.win.emissiveIntensity = on ? 0.9 : 0; lampLight.intensity = on ? 6 : 0; },
    update(t, dt, glow = 0, eye = null) {
      const k = THREE.MathUtils.clamp((glow - 0.15) / 0.5, 0, 1);
      beams.rotation.y = -t * (Math.PI * 2 / 12);
      const close = eye ? THREE.MathUtils.clamp((eye.distanceTo(beams.position) - 3) / 10, 0.12, 1) : 1;      // (up on the gallery: barely there)
      beamMat.opacity = 0.15 * k * close;
      M.lens.emissiveIntensity = 0.2 + 3.2 * k;
      beams.visible = k > 0.01;
    },
  };
}

// ---- textures
function bandTexture() {
  // the tower's paint: white, two red bands (v = 0 at the foot); a little weathering
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, 64, 512);
  g.fillStyle = '#b23a2e';
  for (const [a, b] of [[0.30, 0.44], [0.66, 0.80]]) g.fillRect(0, 512 * (1 - b), 64, 512 * (b - a));
  let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(80,70,60,${r() * 0.05})`; g.fillRect(r() * 64, r() * 512, 1 + r() * 2, 2 + r() * 10); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1);
  return t;
}
function flagTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#a49a8a'; g.fillRect(0, 0, 256, 256);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgb(${150 + r() * 40},${142 + r() * 36},${126 + r() * 30})`; const x = r() * 256, y = r() * 256, w = 30 + r() * 50; g.fillRect(x, y, w, w * (0.5 + r() * 0.6)); }
  g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 32 + r() * 6); g.lineTo(256, i * 32 + r() * 6); g.stroke(); g.beginPath(); g.moveTo(i * 32 + r() * 6, 0); g.lineTo(i * 32 + r() * 6, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return t;
}
function beamTexture() {
  // along the beam: bright at the lamp (the cone's narrow end, the bottom of its texture), fading out over the sea
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 256; y++) { const v = y / 255, near = Math.pow(v, 2.2) * Math.min(1, (1 - v) / 0.06); g.fillStyle = `rgba(255,236,190,${near})`; g.fillRect(0, y, 4, 1); }      // (and soft where it leaves the lamp)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
