import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { groundHeight } from './beach.js';
import { fontsReady, SERIF, SANS } from './fonts.js';

// A badminton court on the sand west of her studio, and a rally game on it.
//
// The court: regulation doubles, 13.40 x 6.10 m (singles 5.18 m; short service lines 1.98 m from the net,
// the doubles long service line 0.76 m inside the back line, centre lines), the long axis north-south so the
// low sun is never in a player's eyes. A sage acrylic court on a terracotta surround, on a slab edged in teak.
// The net 1.55 m at the posts, 1.524 m in the middle, its mesh stirring in the breeze. A windbreak screen with
// a planted hedge on the sea (north) and west sides, four floodlights that come on at dusk, a teak bench with
// rackets, a tube of shuttles, a towel and a water jug, a flip scoreboard. A boardwalk from the studio's deck.
//
// The rally: E at the bench. She plays the south half; her partner is a floating racket on the other side. The
// shuttle flies with a shuttlecock's drag (quick off the strings, then it floats and drops: terminal speed
// ~6.8 m/s). Space or a click swings when it's in reach; where she looks is where it goes (looking up lobs it,
// level drives it). The rally count goes up each time it crosses the net; best kept.

export const COURT = { x: 131, z: 41.7, hw: 3.05, hl: 6.70, sw: 2.59 };   // centre; doubles half-width, half-length; singles half-width
const SLAB = { x0: 126, x1: 136, z0: 33.0, z1: 50.4 };
const G = 9.81, K = G / (6.8 * 6.8);                                     // shuttle drag: a = -K |v| v

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
  interact.push({ kind: 'rally', label: 'Pick up a racket and rally', pos: [BX, Y + 0.6, BZ], r: 2.2 });

  // ---- the shuttle, her partner's racket, her racket (held in view)
  const shuttle = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.6 }));
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.013, 0.06, 16, 1, true).translate(0, 0.03, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  shuttle.add(cork, skirt); shuttle.visible = false; group.add(shuttle);
  const partner = racketMesh.clone(); partner.scale.setScalar(1.25); partner.visible = false; group.add(partner);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9c4, transparent: true, opacity: 0.18, depthWrite: false })); partner.add(glow);
  const mine = racketMesh.clone(); mine.visible = false; group.add(mine);

  const game = new Rally({ Y, shuttle, partner, mine, onScore: (n, best) => drawScore(scoreTex, n, best) });
  fontsReady.then(() => drawScore(scoreTex, 0, game.best));
  return {
    group, carColliders, interact, walk: { colliders: walkColliders, surfaces: walkSurfaces }, game, Y,
    setNight(on) { M.lamp.emissiveIntensity = on ? 3 : 0; for (const l of flood) l.intensity = on ? 30 : 0; },
    update(t) { netU.uTime.value = t; },
  };
}

// ------------------------------------------------------------------ the rally
class Rally {
  constructor({ Y, shuttle, partner, mine, onScore }) {
    Object.assign(this, { Y, shuttle, partner, mine, onScore });
    this.on = false; this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.count = 0; this.best = 0; this.swingT = 0; this.events = [];
    try { this.best = +localStorage.getItem('gh18.rallyBest') || 0; } catch { /* storage off */ }
    this.pp = new THREE.Vector3(COURT.x, Y + 1.3, COURT.z + 4);           // her partner's racket
  }
  start() { this.on = true; this.count = 0; this.partner.visible = true; this.mine.visible = true; this.state = 'wait'; this.timer = 1.2; this.onScore(0, this.best); }
  stop() { this.on = false; this.shuttle.visible = false; this.partner.visible = false; this.mine.visible = false; }
  // launch from p0 to land near the target, peaking around `apex` m above the court: searched with the drag on
  launch(p0, tx, tz, apex) {
    const d = new THREE.Vector3(tx - p0.x, 0, tz - p0.z), dist = d.length(); d.normalize();
    let best = null;
    const tryOne = (vy, vh) => {
      const land = this.simulate(p0, d.x * vh, vy, d.z * vh);
      const err = Math.abs(land.d - dist) * 3 + Math.abs(land.peak - (this.Y + apex)) * 0.4;
      if (!best || err < best.err) best = { err, vh, vy };
    };
    for (let vy = 1; vy <= 16; vy += 1.5) for (let vh = 2; vh <= 30; vh += 2) tryOne(vy, vh);      // coarse, then fine round the best
    const c = { ...best };
    for (let vy = c.vy - 1.5; vy <= c.vy + 1.5; vy += 0.25) for (let vh = c.vh - 2; vh <= c.vh + 2; vh += 0.25) if (vy > 0 && vh > 0) tryOne(vy, vh);
    this.p.copy(p0); this.v.set(d.x * best.vh, best.vy, d.z * best.vh);
  }
  simulate(p0, vx, vy, vz) {
    const p = p0.clone(), v = new THREE.Vector3(vx, vy, vz), dt = 1 / 60; let peak = p.y;
    for (let i = 0; i < 600 && p.y > this.Y; i++) { const s = v.length(); v.x -= K * s * v.x * dt; v.z -= K * s * v.z * dt; v.y -= (G + K * s * v.y) * dt; p.addScaledVector(v, dt); peak = Math.max(peak, p.y); }
    return { d: Math.hypot(p.x - p0.x, p.z - p0.z), peak };
  }
  swing() { if (this.on && this.swingT <= 0) { this.swingT = 0.35; this.wantHit = true; } }
  // her: head position, view yaw (0 = +z) and pitch (+ = looking down in this game's convention)
  update(dt, head, yaw, pitch) {
    this.events.length = 0;
    if (!this.on) return this.events;
    const Y = this.Y;
    this.swingT = Math.max(0, this.swingT - dt);
    // her racket, in view: lower right, swinging through when she swings
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) : 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    this.mine.position.set(head.x + fx * 0.55 + rx * (0.32 - sw * 0.5), head.y - 0.32 + sw * 0.35, head.z + fz * 0.55 + rz * (0.32 - sw * 0.5));
    this.mine.rotation.set(-0.3 - sw * 1.2, yaw + Math.PI, 0.6 - sw * 1.4, 'YXZ');
    if (this.state === 'wait') {                                        // her partner serves, high and gentle
      this.timer -= dt;
      this.pp.lerp(new THREE.Vector3(COURT.x, Y + 1.3, COURT.z + 3.6), 1 - Math.exp(-3 * dt));
      if (this.timer <= 0) {
        this.shuttle.visible = true;
        this.launch(this.pp.clone().add(new THREE.Vector3(0, 0.1, -0.3)), head.x + (Math.random() - 0.5), head.z + 0.6, 4.2);
        this.state = 'fly'; this.lastSide = 1; this.events.push('hit');
      }
    }
    if (this.state === 'fly') {
      const steps = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < steps; i++) {
        const h = dt / steps, s = this.v.length();
        this.v.x -= K * s * this.v.x * h; this.v.z -= K * s * this.v.z * h; this.v.y -= (G + K * s * this.v.y) * h;
        const pz = this.p.z; this.p.addScaledVector(this.v, h);
        // the net
        if ((pz - COURT.z) * (this.p.z - COURT.z) <= 0 && Math.abs(this.p.x - COURT.x) < COURT.hw && this.p.y < Y + 1.53) { this.end('net'); return this.events; }
        if ((pz - COURT.z) * (this.p.z - COURT.z) <= 0) { const side = Math.sign(this.p.z - COURT.z); if (side !== this.lastSide) { this.lastSide = side; this.count++; this.best = Math.max(this.best, this.count); this.onScore(this.count, this.best); } }
        if (this.p.y <= Y + 0.01) {
          const inX = Math.abs(this.p.x - COURT.x) <= COURT.sw + 0.02, inZ = Math.abs(this.p.z - COURT.z) <= COURT.hl + 0.02;
          this.end(this.p.z < COURT.z ? (inX && inZ ? 'missed' : 'out_theirs') : (inX && inZ ? 'winner' : 'out')); return this.events;
        }
      }
      this.shuttle.position.copy(this.p);
      if (this.v.lengthSq() > 1e-4) this.shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.v.clone().normalize());
      // her partner moves to where it will come down on their side, and plays it back
      if (this.v.z > 0 && this.p.z > COURT.z) {
        const land = this.predict();
        this.pp.lerp(new THREE.Vector3(land.x, Y + 1.2, land.z + 0.3), 1 - Math.exp(-2.6 * dt));
        if (this.willMiss == null) this.willMiss = Math.random() < Math.min(0.4, 0.04 + this.count * 0.015 + (this.lastPower || 0) * 0.15);   // decided once per shot
        if (!this.willMiss && this.p.distanceTo(this.pp) < 0.75 && this.p.y > Y + 0.4) {
          {
            const tx = COURT.x + (Math.random() - 0.5) * 2 * (COURT.sw - 0.6), tz = COURT.z - 1.6 - Math.random() * (COURT.hl - 2.4);
            this.launch(this.p.clone(), tx, tz, 2.4 + Math.random() * 2.6);
            this.events.push('hit');
          }
        }
        if (this.willMiss) this.pp.y = Math.max(Y + 0.9, this.pp.y - dt * 0.6);       // (a lunge that doesn't reach)
      } else { this.willMiss = null; this.pp.lerp(new THREE.Vector3(COURT.x, Y + 1.25, COURT.z + 3.4), 1 - Math.exp(-1.5 * dt)); }
      // her swing: in reach (about a racket's length from her, between knee and well over her head) and on her side
      if (this.wantHit && this.p.z < COURT.z) {
        const rp = new THREE.Vector3(head.x + fx * 0.6, head.y - 0.2, head.z + fz * 0.6);
        const d = this.p.distanceTo(rp);
        if (d < 1.35 && this.p.y > Y + 0.25 && this.p.y < Y + 3.1) {
          const look = Math.max(-0.6, Math.min(0.9, -pitch));               // looking up: a high clear; level: a flatter drive
          const reach = Math.max(4.2, 9 + look * 3);
          // a little help: aimed inside the lines (but where she looks)
          const tx = THREE.MathUtils.clamp(head.x + fx * reach, COURT.x - COURT.sw + 0.35, COURT.x + COURT.sw - 0.35), tz = Math.min(head.z + fz * reach, COURT.z + COURT.hl - 0.5);
          const apex = THREE.MathUtils.clamp(2.2 + look * 4, 1.9, 5.6);
          this.lastPower = 1 - Math.min(1, d / 1.35);
          this.launch(this.p.clone(), tx, Math.max(tz, COURT.z + 0.8), apex);
          this.wantHit = false;
          this.events.push('hit');
        }
      }
      if (this.swingT <= 0) this.wantHit = false;
    }
    if (this.state === 'over') { this.timer -= dt; if (this.timer <= 0) { this.state = 'wait'; this.timer = 0.6; this.count = 0; this.onScore(0, this.best); } }
    this.partner.position.copy(this.pp);
    this.partner.rotation.set(-0.2, Math.PI, Math.sin(performance.now() / 600) * 0.15);
    return this.events;
  }
  predict() {
    const p = this.p.clone(), v = this.v.clone(), dt = 1 / 60;
    for (let i = 0; i < 300 && p.y > this.Y + 1.2; i++) { const s = v.length(); v.x -= K * s * v.x * dt; v.z -= K * s * v.z * dt; v.y -= (G + K * s * v.y) * dt; p.addScaledVector(v, dt); }
    return p;
  }
  end(why) {
    this.willMiss = null;
    this.state = 'over'; this.timer = 1.6; this.result = why;
    try { localStorage.setItem('gh18.rallyBest', String(this.best)); } catch { /* ignore */ }
    this.events.push('end:' + why);
  }
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
function drawScore(t, n, best) {
  const c = t.userData.c, g = c.getContext('2d');
  g.fillStyle = '#1f2a24'; g.fillRect(0, 0, 440, 220);
  g.fillStyle = '#d9c9a8'; g.textAlign = 'center';
  g.font = `600 22px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '5px';
  g.fillText('RALLY', 120, 46); g.fillText('BEST', 330, 46);
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
