import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { STUDIO } from './site.js';
import { BEACH_DOOR } from './studio.js';
import { groundHeight } from './beach.js';
import { rng, weaveNormal } from './surfaces.js';

// Making the studio cosy, and the way down to the beach (added on top of studio.js):
//   - sheer linen curtains gathered at the glass, stirring in the sea breeze
//   - a floor-seating corner (baithak): a jute rug, a gaddi mattress with bolsters and cushions, a low
//     chowki with a brass diya and a tea set; E to sit
//   - a mustard throw and more cushions on the daybed, books on the coffee table and by the nook
//   - candles (coffee table, windowsill) and the diya: flickering light after dark
//   - a hanging pothos in the north-west corner, a monstera by the door
//   - wind chimes under the eaves by the beach door
//   - steps from the deck down to the sand, in front of the new beach door
//   - on the beach: a fire pit ringed with stones, with driftwood logs to sit on (lit at dusk and
//     night: flames, embers, a flickering glow, and crackle in ambience.js); E to sit by the fire
//   - a hammock on a teak stand, rocking gently; E to lie in it

const { x0: X0, z0: Z0, w: SW, d: SD, floor: F } = STUDIO;
const X1 = X0 + SW, Z1 = Z0 + SD, H = 3.0;
const DZ1 = Z1 + 2.6;                                    // the deck's north edge
const mm = (v) => Math.round(v * 1000);
const rect = (x0, z0, x1, z1) => [[mm(x0), mm(z0)], [mm(x1), mm(z0)], [mm(x1), mm(z1)], [mm(x0), mm(z1)]];

export const FIRE = { x: 104.2, z: 56.4 };
export const HAMMOCK = { x: 96.6, z: 55.2 };

function canvas(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

export function buildCosy({ time }) {
  const group = new THREE.Group(); group.name = 'cosy';
  const walkColliders = [], walkSurfaces = [], carColliders = [], interact = [];
  const solid = (x0, z0, x1, z1, y0 = F, y1 = F + 1) => walkColliders.push({ poly: rect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)), y0, y1 });
  const r = rng(909);
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  const box = (w, h, d, x, y, z, mat) => add(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), mat);
  const cloth = weaveNormal(48, 31).clone(); cloth.repeat.set(5, 5);
  const fabric = (hex, sheen = 0.7) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.9, normalMap: cloth, normalScale: new THREE.Vector2(0.5, 0.5), sheen, sheenRoughness: 0.6, sheenColor: 0xffffff });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5132, roughness: 0.6 });
  const teak = new THREE.MeshStandardMaterial({ color: 0x9c6a3e, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc19a55, metalness: 1, roughness: 0.3 });

  // ---- the floor-seating corner (west side, between the desk and the easel)
  const B = { x0: 108.1, x1: 111.4, z0: 46.0, z1: 48.4 };
  const jute = canvas(256, 256, (g, W) => {
    g.fillStyle = '#b89a6a'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < W; i += 4) { g.fillStyle = `rgba(90,66,34,${0.2 + (i % 8 ? 0.1 : 0.25)})`; g.fillRect(0, i, W, 1.5); g.fillRect(i, 0, 1.5, W); }
    g.strokeStyle = 'rgba(120,40,30,0.55)'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, W - 28);
  }); jute.repeat.set(1, 1);
  add(new THREE.BoxGeometry(B.x1 - B.x0, 0.012, B.z1 - B.z0).translate((B.x0 + B.x1) / 2, F + 0.006, (B.z0 + B.z1) / 2), new THREE.MeshStandardMaterial({ map: jute, roughness: 0.95 }), false);
  const gaddi = fabric(0xe9dcc4);
  add(new RoundedBoxGeometry(0.85, 0.14, 2.1, 3, 0.05).translate(B.x1 - 0.5, F + 0.07, (B.z0 + B.z1) / 2), gaddi);       // mattress against the glass
  const bolster = (x, z, rot, hex) => { const c = new THREE.CylinderGeometry(0.11, 0.11, 0.7, 20); c.rotateZ(Math.PI / 2); c.rotateY(rot); c.translate(x, F + 0.25, z); add(c, fabric(hex)); };
  bolster(B.x1 - 0.2, 47.2, Math.PI / 2, 0x8e2f2a);
  for (const [z, hex] of [[46.55, 0xc9a24a], [47.2, 0x2f5d50], [47.85, 0xa4532e]]) add(new RoundedBoxGeometry(0.42, 0.4, 0.13, 3, 0.05).rotateY(Math.PI / 2).translate(B.x1 - 0.82, F + 0.34, z), fabric(hex));
  for (const [x, z, hex] of [[108.7, 46.5, 0x5f7387], [108.6, 47.9, 0xc9a24a]]) add(new RoundedBoxGeometry(0.55, 0.12, 0.55, 3, 0.05).translate(x, F + 0.06, z), fabric(hex));   // floor cushions
  // the chowki: a low teak table with a brass diya and a tea set
  const CX = 109.5, CZ = 47.2;
  box(0.75, 0.04, 0.55, CX, F + 0.26, CZ, teak);
  for (const [dx, dz] of [[-0.33, -0.23], [0.33, -0.23], [-0.33, 0.23], [0.33, 0.23]]) box(0.05, 0.26, 0.05, CX + dx, F, CZ + dz, teak);
  add(new THREE.CylinderGeometry(0.05, 0.035, 0.03, 18).translate(CX - 0.2, F + 0.315, CZ - 0.1), brass);               // diya
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12).scale(1, 0.85, 1).translate(CX + 0.12, F + 0.37, CZ + 0.05), brass); kettle.castShadow = true; group.add(kettle);
  for (const [dx, dz] of [[0.25, -0.12], [0.02, -0.17]]) add(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 14).translate(CX + dx, F + 0.335, CZ + dz), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.05 }));
  solid(B.x1 - 0.95, B.z0 + 0.1, B.x1, B.z1 - 0.1, F, F + 0.5);
  solid(CX - 0.4, CZ - 0.3, CX + 0.4, CZ + 0.3, F, F + 0.35);
  interact.push({ kind: 'lounger', label: 'Sit on the floor cushions', pos: [B.x1 - 0.5, F + 0.6, 47.2], r: 2.6, normal: [-1, 0],
    seat: { x: B.x1 - 0.55, z: 47.2, y: F, eye: [B.x1 - 0.6, F + 0.95, 47.2], look: [-1, 0], pitch: 0.18, flash: 'Sit back · E to get up', stand: [108.0, 47.2, -Math.PI / 2, F] } });

  // ---- the daybed: a mustard throw over its end, more cushions; books
  const knit = canvas(128, 128, (g, W) => { g.fillStyle = '#c99a2e'; g.fillRect(0, 0, W, W); for (let y = 0; y < W; y += 8) for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(80,50,10,0.18)'; g.beginPath(); g.ellipse(x + 4, y + 4, 2.5, 4, 0.3, 0, Math.PI * 2); g.fill(); } }); knit.repeat.set(3, 3);
  const throwG = new THREE.PlaneGeometry(0.9, 1.4, 12, 18), tp = throwG.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), y = tp.getY(i); const over = Math.max(0, y - 0.2); tp.setXYZ(i, x, Math.min(y, 0.2) + 0.03 * Math.sin(x * 9), over > 0 ? -over : 0.02 * Math.sin(y * 7 + x * 3)); }
  throwG.computeVertexNormals(); throwG.rotateX(-Math.PI / 2); throwG.rotateY(0.15);
  const th = add(throwG.translate(104.35, F + 0.47, 46.95), new THREE.MeshPhysicalMaterial({ map: knit, roughness: 0.95, sheen: 0.8, sheenColor: 0xffe0a0, side: THREE.DoubleSide }));
  void th;
  for (const [x, hex] of [[102.45, 0xe8e1d4], [104.55, 0x2f5d50]]) add(new RoundedBoxGeometry(0.4, 0.36, 0.13, 3, 0.06).rotateX(-0.25).translate(x, F + 0.62, 46.75), fabric(hex));
  const bookCols = [0x7a2e2e, 0x1f3a5f, 0xc9a24a, 0x2f5d50, 0xe8e0cf, 0x5b3a6b];
  const stack = (x, y, z, n, rot) => { let yy = y; for (let i = 0; i < n; i++) { const t = 0.025 + r() * 0.025; add(new THREE.BoxGeometry(0.2 + r() * 0.06, t, 0.15 + r() * 0.04).rotateY(rot + (r() - 0.5) * 0.3).translate(x, yy + t / 2, z), new THREE.MeshStandardMaterial({ color: bookCols[i % 6], roughness: 0.75 })); yy += t; } };
  stack(103.9, F + 0.35, 48.15, 3, 0.4);
  stack(98.95, F, 47.6, 6, 0.1);                         // a pile on the floor by the nook

  // ---- candles: on the coffee table, the north windowsill, and the diya
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.95 });
  const wax = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 0.7, emissive: 0xffb060, emissiveIntensity: 0 });
  const flames = [];
  const candle = (x, z, h, y0 = F) => {
    add(new THREE.CylinderGeometry(0.035, 0.035, h, 18).translate(x, y0 + h / 2, z), wax);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 2.2, 1), flameMat);
    f.position.set(x, y0 + h + 0.025, z); group.add(f); flames.push(f);
  };
  candle(103.1, 48.55, 0.12, F + 0.35); candle(103.2, 48.42, 0.08, F + 0.35); candle(103.0, 48.4, 0.16, F + 0.35);
  for (const x of [99.4, 99.6, 105.4]) candle(x, Z1 - 0.2, 0.1 + r() * 0.08, F);
  const diyaFlame = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8).scale(1, 2.4, 1), flameMat);
  diyaFlame.position.set(CX - 0.2, F + 0.35, CZ - 0.1); group.add(diyaFlame); flames.push(diyaFlame);
  const candleLight = new THREE.PointLight(0xffb36b, 0, 4, 2); candleLight.position.set(103.1, F + 0.65, 48.5);
  const diyaLight = new THREE.PointLight(0xffb36b, 0, 3.5, 2); diyaLight.position.set(CX - 0.2, F + 0.55, CZ - 0.1);
  group.add(candleLight, diyaLight);

  // ---- curtains: sheer linen, gathered either side of each glass bay, hanging from a rod
  const sheer = new THREE.MeshPhysicalMaterial({ color: 0xf6f1e7, roughness: 0.9, transparent: true, opacity: 0.62, side: THREE.DoubleSide, sheen: 0.6, sheenColor: 0xffffff, depthWrite: false });
  sheer.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hang = clamp((${(F + 2.9).toFixed(2)} - position.y) / 2.8, 0.0, 1.0);
      transformed += normal * sin(uTime * 1.3 + position.x * 1.7 + position.z * 1.9 + position.y * 0.8) * 0.035 * hang * hang;`);
  };
  sheer.customProgramCacheKey = () => 'gh18-sheer';
  const curtain = (ax, az, bx, bz, folds) => {
    const L = Math.hypot(bx - ax, bz - az), g = new THREE.PlaneGeometry(L, 2.85, folds * 6, 8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / L) * folds * Math.PI * 2) * 0.05);
    g.computeVertexNormals();
    g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, F + 1.47, (az + bz) / 2);
    const m = new THREE.Mesh(g, sheer); m.renderOrder = 3; group.add(m);
  };
  const ci = 0.16;                                         // inside the glass
  curtain(X0 + 0.3, Z1 - ci, X0 + 1.4, Z1 - ci, 4);        // north wall: the corners and either side of the door
  curtain(BEACH_DOOR[0] - 2.0, Z1 - ci - 0.06, BEACH_DOOR[0] - 1.1, Z1 - ci - 0.06, 3);
  curtain(BEACH_DOOR[1] + 0.1, Z1 - ci, BEACH_DOOR[1] + 1.0, Z1 - ci, 3);
  curtain(X1 - ci, Z1 - 1.1, X1 - ci, Z1 - 0.25, 3);       // west wall: the corner and the far end
  curtain(X1 - ci, Z0 + 0.35, X1 - ci, Z0 + 1.25, 3);
  for (const [ax, az, bx, bz] of [[X0 + 0.25, Z1 - ci, X1 - 0.2, Z1 - ci], [X1 - ci, Z0 + 0.3, X1 - ci, Z1 - 0.2]]) {
    const L = Math.hypot(bx - ax, bz - az), rod = new THREE.CylinderGeometry(0.012, 0.012, L, 8);
    rod.rotateZ(Math.PI / 2); rod.rotateY(-Math.atan2(bz - az, bx - ax)); rod.translate((ax + bx) / 2, F + 2.92, (az + bz) / 2); add(rod, brass, false);
  }

  // ---- plants: a hanging pothos (north-west corner) and a monstera by the door
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f6e33, roughness: 0.6, side: THREE.DoubleSide });
  const hang = { x: X1 - 0.7, z: Z1 - 0.7 };
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 4).translate(hang.x, F + H - 0.45, hang.z), brass, false);
  add(new THREE.CylinderGeometry(0.16, 0.11, 0.18, 18).translate(hang.x, F + 1.97, hang.z), new THREE.MeshStandardMaterial({ color: 0xd8c7a8, roughness: 0.8 }));
  const vines = [];
  for (let v = 0; v < 9; v++) {
    const a = (v / 9) * Math.PI * 2, len = 0.6 + r() * 0.9;
    for (let k = 0; k < 9; k++) {
      const t = k / 8, lf = new THREE.PlaneGeometry(0.08, 0.06); lf.rotateY(a + k); lf.rotateX(0.6);
      lf.translate(hang.x + Math.cos(a) * (0.16 + t * 0.12), F + 2.0 - t * len, hang.z + Math.sin(a) * (0.16 + t * 0.12));
      vines.push(lf);
    }
  }
  add(mergeGeometries(vines), leaf);
  const mon = { x: BEACH_DOOR[1] + 0.55, z: Z1 - 0.65 };
  add(new THREE.CylinderGeometry(0.2, 0.16, 0.38, 18).translate(mon.x, F, mon.z).translate(0, 0.19, 0), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }));
  const leaves = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r(), L = 0.3 + r() * 0.15, lf = new THREE.CircleGeometry(L / 2, 14, 0, Math.PI * 1.7);
    lf.rotateX(-1.0 - r() * 0.4); lf.rotateY(a); lf.translate(mon.x + Math.cos(a) * 0.32, F + 0.6 + r() * 0.6, mon.z + Math.sin(a) * 0.32);
    leaves.push(lf);
  }
  add(mergeGeometries(leaves), leaf);
  solid(mon.x - 0.3, mon.z - 0.3, mon.x + 0.3, mon.z + 0.3, F, F + 1.4);
  solid(BEACH_DOOR[0] - 1.75, Z1 - 0.14, BEACH_DOOR[0] + 0.05, Z1 - 0.06, F, F + 2.5);     // the open door panel

  // ---- wind chimes under the eaves by the door
  const chimes = new THREE.Group(); chimes.position.set(BEACH_DOOR[1] + 0.3, F + H - 0.05, Z1 + 1.1);
  chimes.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 20), teak));
  const rods = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, L = 0.25 + k * 0.05;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, L, 8).translate(0, -L / 2 - 0.08, 0), new THREE.MeshStandardMaterial({ color: 0xd6d8da, metalness: 1, roughness: 0.2 }));
    rod.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); chimes.add(rod); rods.push(rod);
  }
  group.add(chimes);

  // ---- steps from the deck down to the sand, in front of the beach door
  const sx0 = BEACH_DOOR[0] - 0.4, sx1 = BEACH_DOOR[1] + 0.4;
  const gz = groundHeight((sx0 + sx1) / 2, DZ1 + 1.4);
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 0.7 });
  const nSteps = 3;
  for (let k = 0; k < nSteps; k++) {
    const top = F - ((k + 1) * (F - gz)) / (nSteps + 1), z0 = DZ1 + k * 0.32, z1 = z0 + 0.32;
    add(new THREE.BoxGeometry(sx1 - sx0, top - (gz - 0.2), z1 - z0).translate((sx0 + sx1) / 2, (top + gz - 0.2) / 2, (z0 + z1) / 2), stepMat);
    walkSurfaces.push({ poly: rect(sx0, z0, sx1, z1), y: top });
  }
  carColliders.push({ poly: [[sx0, DZ1], [sx1, DZ1], [sx1, DZ1 + 1.0], [sx0, DZ1 + 1.0]] });

  // ---- the fire pit and its logs
  const stone = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.95 });
  const fy = groundHeight(FIRE.x, FIRE.z);
  const stones = [];
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, s = new THREE.DodecahedronGeometry(0.11 + r() * 0.05, 0); s.scale(1.2, 0.7, 1); s.rotateY(r() * 3); s.translate(FIRE.x + Math.cos(a) * 0.55, fy + 0.05, FIRE.z + Math.sin(a) * 0.55); stones.push(s.toNonIndexed()); }
  add(mergeGeometries(stones), stone);
  add(new THREE.CircleGeometry(0.48, 24).rotateX(-Math.PI / 2).translate(FIRE.x, fy + 0.012, FIRE.z), new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 1 }), false);   // ash
  const charred = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9, emissive: 0xff4a10, emissiveIntensity: 0 });
  for (let k = 0; k < 4; k++) { const l = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 10); l.rotateZ(1.25); l.rotateY((k / 4) * Math.PI * 2); l.translate(FIRE.x, fy + 0.15, FIRE.z); add(l, charred); }
  const logMat = new THREE.MeshStandardMaterial({ color: 0xb59c7e, roughness: 0.9 });
  const seats = [[-1.9, 0.0], [0.2, -1.8]];            // driftwood logs to sit on: on the land side and the east
  for (const [dx, dz] of seats) {
    const lx = FIRE.x + dx, lz = FIRE.z + dz, ly = groundHeight(lx, lz);
    const l = new THREE.CylinderGeometry(0.17, 0.19, 1.6, 14); l.rotateZ(Math.PI / 2); if (Math.abs(dz) > Math.abs(dx)) l.rotateY(0); else l.rotateY(Math.PI / 2);
    add(l.translate(lx, ly + 0.17, lz), logMat);
    carColliders.push({ circle: [lx, lz, 0.6] });
    const fx = -dx / Math.hypot(dx, dz), fz = -dz / Math.hypot(dx, dz);
    interact.push({ kind: 'lounger', label: 'Sit by the fire', pos: [lx, ly + 0.6, lz], r: 2.2,
      seat: { x: lx, z: lz, y: ly, eye: [lx - fx * 0.05, ly + 1.12, lz - fz * 0.05], look: [fx, fz], pitch: 0.28, flash: 'Warm your hands · E to get up', stand: [lx - fx * 0.7, lz - fz * 0.7, Math.atan2(fx, fz), ly] } });
  }
  carColliders.push({ circle: [FIRE.x, FIRE.z, 0.75] });
  // flames: a few crossed billboards with a flickering, rising fire shader; embers as points
  const fireU = { uTime: time, uLit: { value: 0 } };
  const fireMat = new THREE.ShaderMaterial({
    uniforms: fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uLit; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv; float t = uTime;
        float turb = n(vec2(p.x * 6.0, p.y * 4.0 - t * 3.2)) * 0.6 + n(vec2(p.x * 13.0, p.y * 9.0 - t * 5.0)) * 0.4;
        float shape = (1.0 - abs(p.x - 0.5) * 2.2 - p.y * 0.85) + turb * 0.55 - 0.25;
        float a = smoothstep(0.0, 0.45, shape) * uLit;
        vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.85, 0.45), smoothstep(0.2, 0.9, shape));
        gl_FragColor = vec4(c * a * 2.2, a);
      }`,
  });
  for (let k = 0; k < 3; k++) { const q = new THREE.PlaneGeometry(0.7, 0.95); q.translate(0, 0.475, 0); q.rotateY((k / 3) * Math.PI); q.translate(FIRE.x, fy + 0.08, FIRE.z); const m = new THREE.Mesh(q, fireMat); m.renderOrder = 5; group.add(m); }
  const EN = 60, ep = new Float32Array(EN * 3), es = new Float32Array(EN);
  for (let i = 0; i < EN; i++) { es[i] = r(); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('seed', new THREE.BufferAttribute(es, 1));
  const embers = new THREE.Points(eg, new THREE.ShaderMaterial({
    uniforms: { ...fireU, uC: { value: new THREE.Vector3(FIRE.x, fy + 0.2, FIRE.z) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uTime, uLit; uniform vec3 uC; varying float vA;
      void main(){ float life = fract(uTime * (0.25 + seed * 0.2) + seed * 7.0);
        vec3 p = uC + vec3(sin(seed * 40.0 + uTime) * 0.25 * life, life * (1.2 + seed * 1.4), cos(seed * 31.0 + uTime * 0.7) * 0.25 * life);
        vA = (1.0 - life) * uLit; vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = 2.5 * (6.0 / max(1.0, -mv.z)) + 1.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * vA * smoothstep(0.5, 0.0, d) * 2.0, 1.0); }',
  }));
  embers.frustumCulled = false; group.add(embers);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 14, 2); fireLight.position.set(FIRE.x, fy + 0.6, FIRE.z); group.add(fireLight);

  // ---- the hammock on a teak stand, along the beach (facing the sea)
  const hy = groundHeight(HAMMOCK.x, HAMMOCK.z);
  const stand = [];
  for (const s of [-1, 1]) {
    const p = new THREE.CylinderGeometry(0.05, 0.06, 1.55, 10); p.rotateZ(s * 0.5); p.translate(HAMMOCK.x + s * 1.45, hy + 0.7, HAMMOCK.z); stand.push(p);
  }
  const base = new THREE.BoxGeometry(3.4, 0.09, 0.12); base.translate(HAMMOCK.x, hy + 0.045, HAMMOCK.z); stand.push(base);
  for (const s of [-1, 1]) { const f = new THREE.BoxGeometry(0.1, 0.06, 0.9); f.translate(HAMMOCK.x + s * 1.65, hy + 0.03, HAMMOCK.z); stand.push(f); }
  add(mergeGeometries(stand.map((g) => (g.index ? g.toNonIndexed() : g))), teak);
  const stripes = canvas(256, 64, (g, W, Hh) => { const cols = ['#c0392b', '#f1c232', '#2f5d50', '#f4efe4', '#1f3a5f']; for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 5]; g.fillRect(0, (i * Hh) / 16, W, Hh / 16 + 1); } });
  const bed = new THREE.PlaneGeometry(2.0, 0.85, 20, 6), bp = bed.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i); bp.setZ(i, -0.42 * (1 - (x / 1.0) ** 2) - 0.08 * (1 - (y / 0.425) ** 2)); }
  bed.computeVertexNormals(); bed.rotateX(-Math.PI / 2);
  const hammock = new THREE.Mesh(bed, new THREE.MeshPhysicalMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide, sheen: 0.5 }));
  hammock.position.set(HAMMOCK.x, hy + 1.05, HAMMOCK.z); hammock.castShadow = true; hammock.receiveShadow = true; group.add(hammock);
  carColliders.push({ poly: [[HAMMOCK.x - 1.8, HAMMOCK.z - 0.5], [HAMMOCK.x + 1.8, HAMMOCK.z - 0.5], [HAMMOCK.x + 1.8, HAMMOCK.z + 0.5], [HAMMOCK.x - 1.8, HAMMOCK.z + 0.5]] });
  interact.push({ kind: 'lounger', label: 'Lie in the hammock', pos: [HAMMOCK.x, hy + 0.8, HAMMOCK.z], r: 2.0,
    seat: { x: HAMMOCK.x, z: HAMMOCK.z, y: hy, eye: [HAMMOCK.x - 0.55, hy + 0.85, HAMMOCK.z], look: [0.45, 0.89], pitch: 0.12, sway: true, flash: 'Swing gently · E to get up', stand: [HAMMOCK.x, HAMMOCK.z - 1.0, 0, hy] } });

  return {
    group, walk: { colliders: walkColliders, surfaces: walkSurfaces }, carColliders, interact,
    fire: { x: FIRE.x, z: FIRE.z, lit: 0 }, chimes: { x: chimes.position.x, z: chimes.position.z },
    // night: 0..1. Flicker, the fire and the chimes in the wind, the hammock rocking.
    update(t, night) {
      const lit = Math.min(1, Math.max(0, (night - 0.15) / 0.5));
      this.fire.lit = lit;
      const fl = 0.75 + 0.15 * Math.sin(t * 13.1) + 0.1 * Math.sin(t * 23.7 + 1.3);
      fireU.uLit.value = lit;
      fireLight.intensity = lit * 9 * fl;
      charred.emissiveIntensity = lit * (0.8 + 0.4 * Math.sin(t * 3.3));
      candleLight.intensity = lit * 1.6 * (0.85 + 0.15 * Math.sin(t * 17.3));
      diyaLight.intensity = lit * 1.1 * (0.85 + 0.15 * Math.sin(t * 15.7 + 2));
      wax.emissiveIntensity = lit * 0.25;
      for (const f of flames) { f.visible = lit > 0.05; f.scale.y = 0.85 + 0.25 * Math.sin(t * 19 + f.position.x * 7); }
      const gust = 0.55 + 0.45 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1);
      rods.forEach((rd, k) => { rd.rotation.x = Math.sin(t * 2.1 + k) * 0.12 * gust; rd.rotation.z = Math.cos(t * 1.7 + k * 1.3) * 0.12 * gust; });
      hammock.rotation.x = Math.sin(t * 0.9) * 0.06;
      this.gust = gust;
    },
  };
}
