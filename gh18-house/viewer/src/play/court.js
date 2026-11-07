import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { groundHeight } from './beach.js';
import { fontsReady, SERIF, SANS } from './fonts.js';
import { Badminton } from './badminton.js';

// A badminton court on the sand west of her studio, and a rally game on it.
//
// The court: regulation doubles, 13.40 x 6.10 m (singles 5.18 m; short service lines 1.98 m from the net,
// the doubles long service line 0.76 m inside the back line, centre lines), the long axis north-south so the
// low sun is never in a player's eyes. A sage acrylic court on a terracotta surround, on a slab edged in teak.
// The net 1.55 m at the posts, 1.524 m in the middle, its mesh stirring in the breeze. A windbreak screen with
// a planted hedge on the sea (north) and west sides, four floodlights that come on at dusk, a teak bench with
// rackets, a tube of shuttles, a towel and a water jug, a flip scoreboard. A boardwalk from the studio's deck.
//
// The game (badminton.js): E at the bench. A game to 11 against a floating racket, or a relaxed rally.

export const COURT = { x: 131, z: 41.7, hw: 3.05, hl: 6.70, sw: 2.59 };   // centre; doubles half-width, half-length; singles half-width
const SLAB = { x0: 126, x1: 136, z0: 33.0, z1: 50.4 };

export function buildCourt() {
  const group = new THREE.Group(); group.name = 'court';
  const carColliders = [], walkColliders = [], walkSurfaces = [], interact = [];
  const mm = (v) => Math.round(v * 1000);
  const rect = (x0, z0, x1, z1) => [[mm(x0), mm(z0)], [mm(x1), mm(z0)], [mm(x1), mm(z1)], [mm(x0), mm(z1)]];
  const solid = (x0, z0, x1, z1, y0, y1) => walkColliders.push({ poly: rect(x0, z0, x1, z1), y0, y1 });
  let gy = -1;
  for (let x = SLAB.x0; x <= SLAB.x1; x += 2) for (let z = SLAB.z0; z <= SLAB.z1; z += 2) gy = Math.max(gy, groundHeight(x, z));
  const Y = gy + 0.14;                                                    // the playing surface
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  const box = (x0, y0, z0, x1, y1, z1, mat, cast = true) => add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat, cast);
  const M = {
    slab: new THREE.MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.9 }),
    teak: new THREE.MeshStandardMaterial({ color: 0x8a5e3c, roughness: 0.6 }),
    surround: new THREE.MeshStandardMaterial({ color: 0xb4674c, roughness: 0.85 }),
    court: new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x1d1f20, roughness: 0.4, metalness: 0.7 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x23392c, roughness: 0.9, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.7, side: THREE.DoubleSide }),
    bloom: new THREE.MeshStandardMaterial({ color: 0xc2185b, roughness: 0.7, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2dc, emissiveIntensity: 0, roughness: 0.4 }),
  };
  // ---- the slab, the surround, the court
  box(SLAB.x0, gy - 0.4, SLAB.z0, SLAB.x1, Y - 0.02, SLAB.z1, M.slab);
  box(SLAB.x0 - 0.06, Y - 0.06, SLAB.z0 - 0.06, SLAB.x1 + 0.06, Y - 0.005, SLAB.z1 + 0.06, M.teak);
  box(SLAB.x0, Y - 0.02, SLAB.z0, SLAB.x1, Y, SLAB.z1, M.surround, false);
  const cw = 2 * COURT.hw + 0.6, cl = 2 * COURT.hl + 0.6;                 // the green runs 0.3 m past the lines
  add(new THREE.PlaneGeometry(cw, cl).rotateX(-Math.PI / 2).translate(COURT.x, Y + 0.002, COURT.z), M.court, false);
  walkSurfaces.push({ poly: rect(SLAB.x0, SLAB.z0, SLAB.x1, SLAB.z1), y: Y });
  carColliders.push({ poly: [[SLAB.x0, SLAB.z0], [SLAB.x1, SLAB.z0], [SLAB.x1, SLAB.z1], [SLAB.x0, SLAB.z1]] });
  // a boardwalk from her studio's deck (its west edge) to the court
  box(121.0, gy - 0.1, 39.0, SLAB.x0, Y - 0.02, 40.3, M.teak);
  walkSurfaces.push({ poly: rect(121.0, 39.0, SLAB.x0, 40.3), y: Y - 0.02 });
  // ---- the net: steel posts on the doubles sidelines, a mesh with a white tape along the top, stirring
  const netTop = (x) => 1.524 + 0.026 * (Math.abs(x - COURT.x) / COURT.hw) ** 2;
  for (const s of [-1, 1]) {
    const px = COURT.x + s * COURT.hw;
    box(px - 0.025, Y, COURT.z - 0.025, px + 0.025, Y + 1.55, COURT.z + 0.025, M.steel);
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 20).translate(px, Y + 0.03, COURT.z), M.steel);
    solid(px - 0.08, COURT.z - 0.08, px + 0.08, COURT.z + 0.08, Y, Y + 1.6);
  }
  const netG = new THREE.PlaneGeometry(2 * COURT.hw, 0.76, 40, 6), np = netG.attributes.position;
  for (let i = 0; i < np.count; i++) { const x = np.getX(i), y = np.getY(i); np.setY(i, netTop(COURT.x + x) - 0.38 + y - 0.0 - (0.38 - y) * 0); np.setX(i, x); }
  netG.translate(COURT.x, Y, COURT.z);
  const netU = { uTime: { value: 0 } };
  const netMat = new THREE.MeshStandardMaterial({ map: netTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  netMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = netU.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float sag = 1.0 - pow(abs(position.x - ${COURT.x.toFixed(2)}) / ${COURT.hw.toFixed(2)}, 2.0);
      transformed.z += sin(uTime * 1.7 + position.x * 0.9) * 0.025 * sag * (1.6 - (position.y - ${Y.toFixed(2)}));`);
  };
  netMat.customProgramCacheKey = () => 'gh18-net';
  add(netG, netMat, false);
  const tape = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => { const x = COURT.x - COURT.hw + (i / 8) * 2 * COURT.hw; return new THREE.Vector3(x, Y + netTop(x) + 0.01, COURT.z); })), 32, 0.022, 6);
  add(tape, new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.7 }));
  solid(COURT.x - COURT.hw, COURT.z - 0.05, COURT.x + COURT.hw, COURT.z + 0.05, Y, Y + 1.55);
  // ---- the windbreak: a dark green screen on posts with a planted hedge, on the sea and west sides
  const r = mulberry(17);
  const windbreak = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), n = Math.round(L / 3);
    for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; add(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8).translate(x, Y + 1.25, z), M.steel); }
    const sc = new THREE.PlaneGeometry(L, 1.9); sc.rotateY(-ang); sc.translate((ax + bx) / 2, Y + 1.35, (az + bz) / 2); add(sc, M.screen, false);
    const box2 = new THREE.BoxGeometry(L, 0.45, 0.5); box2.rotateY(-ang); box2.translate((ax + bx) / 2, Y + 0.22, (az + bz) / 2); add(box2, M.teak);
    const leaves = [], blooms = [];
    for (let k = 0; k < L * 26; k++) {
      const t = r(), x = ax + (bx - ax) * t + (r() - 0.5) * 0.4 * Math.sin(ang), z = az + (bz - az) * t + (r() - 0.5) * 0.4 * Math.cos(ang), y = Y + 0.45 + r() * 0.9;
      const g = new THREE.PlaneGeometry(0.14, 0.08); g.rotateX(-Math.PI / 2 + (r() - 0.5)); g.rotateY(r() * 6); g.translate(x, y, z);
      (r() < 0.12 ? blooms : leaves).push(g);
    }
    add(mergeAll(leaves), M.leaf); if (blooms.length) add(mergeAll(blooms), M.bloom);
    const nx = Math.sin(ang) * 0.3, nz = -Math.cos(ang) * 0.3;
    solid(Math.min(ax, bx) - Math.abs(nx), Math.min(az, bz) - Math.abs(nz), Math.max(ax, bx) + Math.abs(nx), Math.max(az, bz) + Math.abs(nz), Y, Y + 2.5);
  };
  windbreak(SLAB.x0 + 0.3, SLAB.z1 - 0.3, SLAB.x1 - 0.3, SLAB.z1 - 0.3);
  windbreak(SLAB.x1 - 0.3, SLAB.z1 - 0.3, SLAB.x1 - 0.3, SLAB.z0 + 2.5);
  // ---- floodlights at the corners, angled in
  const lamps = [];
  for (const [x, z] of [[SLAB.x0 + 0.25, SLAB.z0 + 0.25], [SLAB.x0 + 0.25, SLAB.z1 - 0.9], [SLAB.x1 - 0.85, SLAB.z0 + 0.25], [SLAB.x1 - 0.85, SLAB.z1 - 0.9]]) {
    add(new THREE.CylinderGeometry(0.06, 0.09, 7, 10).translate(x, Y + 3.5, z), M.steel);
    const hx = x + Math.sign(COURT.x - x) * 0.35, hz = z + Math.sign(COURT.z - z) * 0.35;
    const head = add(new RoundedBoxGeometry(0.5, 0.12, 0.34, 2, 0.03).translate(hx, Y + 7.0, hz), M.steel);
    void head;
    lamps.push(add(new THREE.PlaneGeometry(0.42, 0.26).rotateX(Math.PI / 2).translate(hx, Y + 6.93, hz), M.lamp, false));
    solid(x - 0.12, z - 0.12, x + 0.12, z + 0.12, Y, Y + 3);
  }
  const flood = [0.33, 0.67].map((t) => { const l = new THREE.PointLight(0xfff2dc, 0, 26, 1.6); l.position.set(COURT.x, Y + 7, SLAB.z0 + (SLAB.z1 - SLAB.z0) * t); group.add(l); return l; });
  // ---- the bench, rackets, shuttles, towel, water; the scoreboard
  const BX = SLAB.x0 + 0.75, BZ = 38.6;                                   // east margin, her half
  box(BX - 0.22, Y + 0.42, BZ - 0.9, BX + 0.22, Y + 0.47, BZ + 0.9, M.teak);
  for (const dz of [-0.75, 0.75]) box(BX - 0.2, Y, BZ + dz - 0.03, BX + 0.2, Y + 0.42, BZ + dz + 0.03, M.steel);
  solid(BX - 0.25, BZ - 0.95, BX + 0.25, BZ + 0.95, Y, Y + 0.6);
  const racketMesh = racket();
  for (const [dz, rot] of [[-0.55, 0.3], [-0.35, -0.2]]) { const rk = racketMesh.clone(); rk.position.set(BX - 0.05, Y + 0.47, BZ + dz); rk.rotation.set(-1.45, rot, 0); group.add(rk); }
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 16).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(BX, Y + 0.52, BZ + 0.15), new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.5 }));
  add(new RoundedBoxGeometry(0.4, 0.04, 0.3, 2, 0.015).translate(BX, Y + 0.49, BZ + 0.55), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.95 }));
  add(new THREE.CylinderGeometry(0.07, 0.06, 0.22, 18).translate(BX - 0.05, Y + 0.58, BZ + 0.82), new THREE.MeshPhysicalMaterial({ color: 0xdfeff2, roughness: 0.05, transparent: true, opacity: 0.5 }));
  const scoreTex = scoreTexture();
  const board = add(new THREE.PlaneGeometry(1.1, 0.55).translate(0, 0, 0), new THREE.MeshStandardMaterial({ map: scoreTex, roughness: 0.6 }), false);
  board.position.set(COURT.x + 1.6, Y + 1.7, SLAB.z0 + 0.12);                 // at the south end, facing the court
  box(COURT.x + 1.55, Y, SLAB.z0 + 0.03, COURT.x + 1.65, Y + 1.98, SLAB.z0 + 0.08, M.steel);
  box(COURT.x + 1.0, Y + 1.38, SLAB.z0 + 0.04, COURT.x + 2.2, Y + 2.0, SLAB.z0 + 0.09, M.steel);
  interact.push({ kind: 'rally', label: 'Play a game of badminton', pos: [BX, Y + 0.6, BZ], r: 2.2 });

  // ---- the shuttle, her partner's racket, her racket (held in view)
  const shuttle = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.6 }));
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.013, 0.06, 16, 1, true).translate(0, 0.03, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  shuttle.add(cork, skirt); shuttle.visible = false; group.add(shuttle);
  const partner = racketMesh.clone(); partner.scale.setScalar(1.25); partner.visible = false; group.add(partner);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9c4, transparent: true, opacity: 0.18, depthWrite: false })); partner.add(glow);
  const mine = racketMesh.clone(); mine.visible = false; group.add(mine);

  const game = new Badminton({ C: COURT, Y, group, shuttle, partner, mine, drawScore: (l1, a, l2, b) => drawScore(scoreTex, l1, a, l2, b) });
  fontsReady.then(() => drawScore(scoreTex, 'DEEPTI', 0, 'PARTNER', 0));
  return {
    group, carColliders, interact, walk: { colliders: walkColliders, surfaces: walkSurfaces }, game, Y,
    setNight(on) { M.lamp.emissiveIntensity = on ? 3 : 0; for (const l of flood) l.intensity = on ? 30 : 0; },
    update(t) { netU.uTime.value = t; },
  };
}

// ------------------------------------------------------------------ textures and small things
function courtTexture() {
  // 1 px = 1 cm over the green (court + 0.3 m each side); lines 4 cm, white
  const W = 671 + 60, H = 1340 + 60, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#5c8c6b'; g.fillRect(0, 0, W, H);
  const r = mulberry(9);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.035})`; g.fillRect(r() * W, r() * H, 2, 2); }
  g.fillStyle = '#f6f4ee';
  const L = (x0, y0, x1, y1) => g.fillRect(30 + x0, 30 + y0, x1 - x0, y1 - y0);
  const w = 610, h = 1340, s = (610 - 518) / 2, lw = 4;
  L(0, 0, w, lw); L(0, h - lw, w, h); L(0, 0, lw, h); L(w - lw, 0, w, h);          // doubles boundary
  L(s, 0, s + lw, h); L(w - s - lw, 0, w - s, h);                                  // singles sidelines
  for (const y of [h / 2 - 198, h / 2 + 198 - lw]) L(0, y, w, y + lw);                // short service lines
  for (const y of [76, h - 76 - lw]) L(0, y, w, y + lw);                             // doubles long service lines
  L(w / 2 - lw / 2, 0, w / 2 + lw / 2, h / 2 - 198); L(w / 2 - lw / 2, h / 2 + 198, w / 2 + lw / 2, h);   // centre lines
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function netTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); g.strokeStyle = '#111'; g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6.1 / 0.02 / 8, 0.76 / 0.02 / 8);
  return t;
}
function racket() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 32).scale(0.8, 1.15, 1), new THREE.MeshStandardMaterial({ color: 0x1f3a5f, roughness: 0.35, metalness: 0.4 }));
  frame.position.y = 0.55; g.add(frame);
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.clearRect(0, 0, 64, 64); x.strokeStyle = '#f4f0e6'; x.lineWidth = 1.4;
  for (let i = 2; i < 64; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24).scale(0.8, 1.15, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  strings.position.y = 0.55; g.add(strings);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 8).translate(0, 0.28, 0), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.9, roughness: 0.3 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.013, 0.2, 10).translate(0, 0.0, 0), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.8 }));
  g.add(shaft, grip);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}
function scoreTexture() {
  const c = document.createElement('canvas'); c.width = 440; c.height = 220;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.c = c;
  return t;
}
function drawScore(t, l1, n, l2, best) {
  const c = t.userData.c, g = c.getContext('2d');
  g.fillStyle = '#1f2a24'; g.fillRect(0, 0, 440, 220);
  g.fillStyle = '#d9c9a8'; g.textAlign = 'center';
  g.font = `600 22px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '5px';
  g.fillText(l1, 120, 46); g.fillText(l2, 330, 46);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  for (const [v, x] of [[n, 120], [best, 330]]) { g.fillStyle = '#f4efe6'; g.fillRect(x - 70, 64, 140, 120); g.fillStyle = '#1f2a24'; g.font = `500 100px ${SERIF}`; g.fillText(String(v), x, 160); }
  t.needsUpdate = true;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mergeAll(list) {
  const geo = new THREE.BufferGeometry(), pos = [], nor = [];
  for (const g of list) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
