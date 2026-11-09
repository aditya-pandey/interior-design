import * as THREE from 'three';
import { groundHeight } from './beach.js';

// The stunt park, on the headland where the coast turns south (where the lighthouse stood): a concrete pad with
// two lanes of ramps for the bicycle, the Vespa and the cars, and rollers between them.
//   lane 1 (z −1)  the big gap: a launch ramp to 1.5 m, an 8 m gap, a landing ramp (in line with the way in from
//                  the road: a long run-up)
//   lane 2 (z 11.5) a kicker, then a tabletop (up, a flat top, down)
//   between        rollers
// Tyre walls round it, an arch over the way in from the coast road, flags, a scoreboard (last jump, best jump),
// two floodlights for the evening.
//
// heightAt(x, z): the surface there (the pad and the ramps' tops), or null off the pad: the vehicles' vertical
// physics (main.js) and her walking use it. faces(x, z): true where a ramp's side or tall end stands (driving into
// it is a crash, not a climb).

export const STUNT = { x0: 188, x1: 234, z0: -9, z1: 17, Y: 0.14 };
const { x0: PX0, x1: PX1, z0: PZ0, z1: PZ1, Y: PY } = STUNT;
const ACCESS = { x0: 172, x1: PX0, z0: -5, z1: 2.5 };          // the way in from the coast road, in line with the big gap

// the ramps: along +x, centred on zc, w wide; h(s) the height s metres in
const curve = (H, L, p) => (s) => H * Math.pow(Math.min(1, Math.max(0, s / L)), p);
export const RAMPS = [
  { id: 'launch', x0: 197, x1: 203, zc: -1, w: 5, h: curve(1.5, 6, 1.6), back: true },
  { id: 'landing', x0: 212, x1: 222, zc: -1, w: 6, h: (s) => (s < 1 ? 1.5 : 1.5 * (1 - (s - 1) / 9)), front: true },
  { id: 'kicker', x0: 196, x1: 199.5, zc: 11.5, w: 4, h: curve(0.7, 3.5, 1.7), back: true },
  { id: 'table', x0: 211, x1: 225, zc: 11.5, w: 4.6, h: (s) => (s < 5 ? 1.0 * Math.pow(s / 5, 1.3) : s < 9 ? 1.0 : 1.0 * (1 - (s - 9) / 5)) },
  { id: 'rollers', x0: 201, x1: 227, zc: 5.6, w: 3, h: (s) => 0.25 * Math.sin((Math.PI * s) / 4) ** 2 },   // (under the 0.3 m that counts as a wall: ridable from the side too)
];
const rampAt = (x, z) => {
  let best = 0;
  for (const r of RAMPS) if (x >= r.x0 && x <= r.x1 && Math.abs(z - r.zc) <= r.w / 2) best = Math.max(best, r.h(x - r.x0));
  return best;
};
export const inPad = (x, z) => (x >= PX0 && x <= PX1 && z >= PZ0 && z <= PZ1) || (x >= ACCESS.x0 && x <= ACCESS.x1 && z >= ACCESS.z0 && z <= ACCESS.z1);
export function heightAt(x, z) {
  if (x >= PX0 && x <= PX1 && z >= PZ0 && z <= PZ1) return PY + rampAt(x, z);
  if (x >= ACCESS.x0 && x <= ACCESS.x1 && z >= ACCESS.z0 && z <= ACCESS.z1) {    // (eases from the road's level to the pad's)
    const k = (x - ACCESS.x0) / (ACCESS.x1 - ACCESS.x0);
    return groundHeight(x, z) * (1 - k) + PY * k;
  }
  return null;
}

// ---- textures, drawn
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  return t;
}
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const concreteTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b9b4ab'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const v = 150 + rnd() * 70 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  g.strokeStyle = 'rgba(70,64,58,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);       // (slab joints, every 4 m)
  for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(60,55,50,0.12)'; g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
});
const plyTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#c99b62'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${120 + rnd() * 40 | 0},${80 + rnd() * 30 | 0},40,${0.08 + rnd() * 0.1})`; g.fillRect(0, y, w, 1 + rnd() * 2); }
  for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(80,50,25,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, (i + 1) * h / 4); g.lineTo(w, (i + 1) * h / 4); g.stroke(); }   // (sheet joins)
  g.fillStyle = 'rgba(40,30,20,0.6)';
  for (let x = 16; x < w; x += 64) for (let y = 16; y < h; y += 64) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }  // screws
});
const chevronTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a';
  for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 + h, h); g.lineTo(x + h, h); g.closePath(); g.fill(); }
}, [6, 1]);
const sideTex = () => canvasTex(256, 128, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#c0392b'; g.fillRect(i * w / 8, 0, w / 8, h); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h - 10, w, 10);
}, [2, 1]);

// ---- the park
export function buildStuntPark() {
  const group = new THREE.Group(), carColliders = [], walkColliders = [], interact = [];
  const mm = (v) => Math.round(v * 1000);
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const M = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.95 }),
    ply: new THREE.MeshStandardMaterial({ map: plyTex(), roughness: 0.8 }),
    chevron: new THREE.MeshStandardMaterial({ map: chevronTex(), roughness: 0.7 }),
    side: new THREE.MeshStandardMaterial({ map: sideTex(), roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.7, roughness: 0.45 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe2a8, emissiveIntensity: 0 }),
  };
  const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m; };

  // the pad (a slab, its edge down into the sand) and the way in from the road
  const pad = new THREE.BoxGeometry(PX1 - PX0, 0.6, PZ1 - PZ0); pad.translate((PX0 + PX1) / 2, PY - 0.3, (PZ0 + PZ1) / 2);
  const uv = pad.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (PX1 - PX0) / 4, uv.getY(i) * (PZ1 - PZ0) / 4);
  mesh(pad, M.concrete, false);
  {
    const N = 8, pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const x = ACCESS.x0 + (ACCESS.x1 - ACCESS.x0) * (i / N); for (const z of [ACCESS.z0, ACCESS.z1]) pos.push(x, heightAt(x, z) + 0.015, z); }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, M.asphalt, false);
  }
  // painted lines: the lanes, start marks
  for (const [x0, x1, z] of [[190, 232, 3.3], [190, 232, 7.9], [190, 232, 14.6]]) mesh(new THREE.BoxGeometry(x1 - x0, 0.01, 0.12).translate((x0 + x1) / 2, PY + 0.006, z), M.paint, false);
  for (const z of [-1, 11.5]) mesh(new THREE.BoxGeometry(0.4, 0.01, 4).translate(191, PY + 0.006, z), M.chevron, false);

  // the ramps: a top sampled along its profile, the sides, a face where it ends tall, steel legs under it
  for (const r of RAMPS) {
    const L = r.x1 - r.x0, N = Math.max(8, Math.round(L * 6)), hw = r.w / 2;
    const top = [], tuv = [], tidx = [], side = [], sidx = [];
    for (let i = 0; i <= N; i++) {
      const s = (L * i) / N, x = r.x0 + s, h = PY + r.h(s);
      top.push(x, h, r.zc - hw, x, h, r.zc + hw); tuv.push(s / 2, 0, s / 2, r.w / 2);
      for (const zs of [-hw, hw]) side.push(x, PY, r.zc + zs, x, h, r.zc + zs);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; tidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (let i = 0; i < N; i++) {
      const a = i * 4;                                                   // (each sample: two sides × bottom, top)
      sidx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);                   // the -z side
      sidx.push(a + 2, a + 3, a + 6, a + 3, a + 7, a + 6);               // the +z side
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2)); tg.setIndex(tidx); tg.computeVertexNormals();
    mesh(tg, r.id === 'rollers' ? M.concrete : M.ply);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    const suv = []; for (let i = 0; i <= N; i++) for (let k = 0; k < 2; k++) suv.push((L * i) / N / 2, 0, (L * i) / N / 2, 0.6); sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    sg.setIndex(sidx); sg.computeVertexNormals();
    const sm = mesh(sg, r.id === 'rollers' ? M.concrete : M.side); sm.material = sm.material.clone(); sm.material.side = THREE.DoubleSide;
    // the lip: a chevron strip where it ends tall (the kicker, the launch ramp); a face down to the pad
    for (const [end, s] of [['back', L], ['front', 0]]) {
      if (!r[end]) continue;
      const x = r.x0 + s, h = r.h(s);
      mesh(new THREE.BoxGeometry(0.05, h, r.w).translate(x + (end === 'back' ? 0.025 : -0.025), PY + h / 2, r.zc), M.side);
      mesh(new THREE.BoxGeometry(0.5, 0.012, r.w).translate(x + (end === 'back' ? -0.25 : 0.25), PY + h + 0.004, r.zc).applyMatrix4(new THREE.Matrix4()), M.chevron, false);
    }
    // legs under the high parts
    if (r.id !== 'rollers') for (let s = 1; s < L; s += 2) { const h = r.h(s); if (h < 0.5) continue; for (const zs of [-hw + 0.25, hw - 0.25]) mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6).translate(r.x0 + s, PY + h / 2, r.zc + zs), M.steel); }
  }
  // the gap between launch and landing: sand with a few cones to aim between
  for (const [x, z] of [[206, -3.8], [206, 1.8], [209, -3.8], [209, 1.8]]) mesh(new THREE.ConeGeometry(0.18, 0.5, 12).translate(x, PY + 0.25, z), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }));

  // tyre walls round the park (a gap for the way in), solid to cars and to her
  const tyreGeo = new THREE.TorusGeometry(0.36, 0.14, 8, 16).rotateX(Math.PI / 2);
  const walls = [[[PX0, 3.2], [PX0, PZ1]], [[PX0, PZ1], [PX1, PZ1]], [[PX1, PZ1], [PX1, PZ0]], [[PX1, PZ0], [PX0, PZ0]], [[PX0, PZ0], [PX0, -6.2]]];
  const tyres = [];
  for (const [[ax, az], [bx, bz]] of walls) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(len / 0.78));
    for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n); for (let k = 0; k < 2; k++) tyres.push([x, PY + 0.07 + k * 0.27, z]); }
    const nx = -(bz - az) / len, nz = (bx - ax) / len, r = 0.5;
    const poly = [[ax + nx * r, az + nz * r], [bx + nx * r, bz + nz * r], [bx - nx * r, bz - nz * r], [ax - nx * r, az - nz * r]];
    carColliders.push({ poly });
    walkColliders.push({ poly: poly.map(([x, z]) => [mm(x), mm(z)]), y0: 0, y1: PY + 0.55, noTop: false });
  }
  const tyreIM = new THREE.InstancedMesh(tyreGeo, M.tyre, tyres.length);
  const tm = new THREE.Matrix4();
  tyres.forEach(([x, y, z], i) => { tm.makeRotationY(rnd() * 3).setPosition(x, y, z); tyreIM.setMatrixAt(i, tm); });
  tyreIM.castShadow = true; tyreIM.receiveShadow = true; group.add(tyreIM);

  // the arch over the way in: two posts, a banner
  const banner = canvasTex(1024, 192, (g, w, h) => {
    g.fillStyle = '#1d2b3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#ffffff'; g.font = 'bold 96px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STUNT PARK', w / 2, h / 2 + 4);
  });
  for (const z of [-5.6, 2.9]) mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 12).translate(186.2, PY + 2.2, z), M.steel);
  const bm = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.7 });
  for (const [rot, dx] of [[-Math.PI / 2, -0.02], [Math.PI / 2, 0.02]]) mesh(new THREE.PlaneGeometry(8.4, 1.2).rotateY(rot).translate(186.2 + dx, PY + 3.7, -1.35), bm);   // (readable from the road and from inside)

  // flags on the far wall
  const flagCols = [0xd94a3d, 0xf2c230, 0x2f7fc1, 0x3aa35b, 0xf2efe6];
  for (let i = 0; i < 9; i++) {
    const x = 192 + i * 5, z = PZ1 + 0.6;
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 4, 6).translate(x, PY + 2, z), M.steel);
    const f = mesh(new THREE.PlaneGeometry(1.1, 0.7).translate(0.55, 0, 0), new THREE.MeshStandardMaterial({ color: flagCols[i % 5], side: THREE.DoubleSide, roughness: 0.8 }));
    f.position.set(x, PY + 3.6, z); f.userData.flag = i;
  }

  // the scoreboard by the landing: last jump, best jump
  const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512;
  const scTex = new THREE.CanvasTexture(sc); scTex.colorSpace = THREE.SRGBColorSpace;
  const drawScore = (last, best) => {
    const g = sc.getContext('2d'), w = sc.width, h = sc.height;
    g.fillStyle = '#10151c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.textAlign = 'left'; g.fillStyle = '#9fb3c8'; g.font = '600 46px Inter, sans-serif';
    g.fillText('LAST JUMP', 50, 110); g.fillText('BEST', 50, 330);
    g.fillStyle = '#ffffff'; g.font = 'bold 92px Inter, sans-serif';
    g.fillText(last ? `${last.dist.toFixed(1)} m` : '—', 50, 215);
    g.fillStyle = '#f2c230'; g.fillText(best ? `${best.dist.toFixed(1)} m` : '—', 50, 435);
    g.fillStyle = '#c9d6e3'; g.font = '500 42px Inter, sans-serif';
    if (last) g.fillText(`${last.air.toFixed(1)} s air · ${last.height.toFixed(1)} m high · ${last.by}`, 360, 215);
    if (best) g.fillText(`${best.air.toFixed(1)} s · ${best.by}`, 360, 435);
    scTex.needsUpdate = true;
  };
  for (const z of [-10.4, -14.2]) mesh(new THREE.BoxGeometry(0.15, 3.4, 0.15).translate(217, PY + 1.7, z), M.steel);
  mesh(new THREE.BoxGeometry(0.12, 2.2, 4.2).translate(217, PY + 3.0, -12.3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  const board = mesh(new THREE.PlaneGeometry(4.0, 2.0).rotateY(-Math.PI / 2).translate(216.93, PY + 3.0, -12.3), new THREE.MeshBasicMaterial({ map: scTex, toneMapped: false }), false);
  board.material.side = THREE.FrontSide;

  // floodlights (pooled point lights) on two masts
  const lights = [];
  for (const [x, z] of [[199.5, PZ1 + 0.8], [219.5, PZ1 + 0.8]]) {
    mesh(new THREE.CylinderGeometry(0.1, 0.14, 8, 10).translate(x, PY + 4, z), M.steel);
    mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5).translate(x, PY + 8.1, z - 0.2), M.lamp);
    const pl = new THREE.PointLight(0xffe7c2, 0, 34, 1.6); pl.position.set(x, PY + 7.6, z - 1.2); group.add(pl); lights.push(pl);
  }

  // the best jump, remembered (per browser)
  let best = null, last = null;
  try { best = JSON.parse(localStorage.getItem('gh18.stunt') || 'null'); } catch { /* storage off */ }
  drawScore(last, best);
  function scoreJump(j) {
    last = j;
    const isBest = !best || j.dist > best.dist;
    if (isBest) { best = j; try { localStorage.setItem('gh18.stunt', JSON.stringify(j)); } catch { /* storage off */ } }
    drawScore(last, best);
    return isBest;
  }
  function setNight(on) { for (const l of lights) l.intensity = on ? 60 : 0; M.lamp.emissiveIntensity = on ? 3 : 0; }
  function update(t) { group.traverse((o) => { if (o.userData.flag != null) o.rotation.y = Math.sin(t * 2.2 + o.userData.flag) * 0.35; }); }

  // where the big ramp's top is (the last letter waits there), where to stand on arrival, where to park
  const launch = RAMPS.find((r) => r.id === 'launch');
  return {
    group, carColliders, interact, walk: { colliders: walkColliders, surfaces: [] },
    heightAt, inPad, scoreJump, setNight, update,
    top: [launch.x1 - 0.6, PY + launch.h(launch.x1 - launch.x0 - 0.6) + 1.15, launch.zc],
    entry: { x: 190, z: 5.5, yaw: Math.PI / 2 }, park: { x: 178, z: -1.2, yaw: Math.PI / 2 },   // (parked on the way in: the run-up ahead)
  };
}
