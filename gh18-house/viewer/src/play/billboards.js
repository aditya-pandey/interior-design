import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROAD, coastDist, surfaceAt, groundHeight } from './beach.js';
import { fontsReady, SERIF, SANS } from './fonts.js';

// Her big paintings as billboards along the coast road, the way a museum advertises a show: a deep black steel
// frame on two slim columns, set back on the land side and facing the road, the painting printed large (with
// its brush strokes catching the light), a caption plate under it ("Painted by Deepti" and how far it is to her
// studio along the road), three gooseneck lamps that light it after dark. Spread evenly round the loop on
// straight stretches, away from the house and the studio. Only with the personal pack (her paintings).

const BACK = 9.5;                                   // metres from the road's centre line

export function buildBillboards({ pack, studio: S }) {
  const group = new THREE.Group(); group.name = 'billboards';
  const carColliders = [], lamps = [], canvases = [];
  const art = (pack && pack.art) || [];
  const big = art.filter((a) => !a.file.includes('small_')).slice(0, 5);
  if (!big.length) return { group, carColliders, setNight() {} };
  const base = pack.base || 'play/deepti/';
  const N = ROAD.length;
  // where the studio meets the road, for the distances on the captions
  let si = 0, sd = Infinity;
  ROAD.forEach((p, i) => { const d = Math.hypot(p.x - S.x, p.z - S.z); if (d < sd) { sd = d; si = i; } });
  // candidate places: straight stretches, the land side, clear of the house and the studio
  const cand = [];
  for (let i = 0; i < N; i += 5) {
    const p = ROAD[i], a = ROAD[(i - 15 + N) % N], b = ROAD[(i + 15) % N];
    const turn = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
    const nx = -p.tz, nz = p.tx;
    const side = coastDist(p.x + nx * 9, p.z + nz * 9) < coastDist(p.x - nx * 9, p.z - nz * 9) ? 1 : -1;
    const x = p.x + nx * side * BACK, z = p.z + nz * side * BACK;
    if (Math.hypot(x - 5, z - 15) < 60 || Math.hypot(x - S.x, z - S.z) < 70 || turn > 0.25 || surfaceAt(x, z) === 'road') continue;
    cand.push({ i, x, z, fx: -nx * side, fz: -nz * side });
  }
  const steelM = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.45, metalness: 0.7 });
  const backM = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.8, metalness: 0.3 });
  const lampHead = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.4 });
  const loader = new THREE.TextureLoader();
  big.forEach((a, k) => {
    const target = (k * N) / big.length + N * 0.08;
    const c = cand.reduce((m, q) => { const d = Math.min(Math.abs(q.i - target), N - Math.abs(q.i - target)); return !m || d < m.d ? { ...q, d } : m; }, null);
    if (!c) return;
    const ratio = a.w / a.h, H = Math.min(4.2, 7.2 / ratio), W = H * ratio, POST = 2.5, y0 = groundHeight(c.x, c.z);
    const bb = new THREE.Group(); bb.position.set(c.x, y0, c.z); bb.rotation.y = Math.atan2(c.fx, c.fz); group.add(bb);
    const add = (geo, mat, parent = bb) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    // columns, the frame, its back
    for (const sx of [-1, 1]) {
      const px = sx * (W / 2 - 0.4);
      add(new THREE.BoxGeometry(0.18, POST + H + 0.3, 0.18).translate(px, (POST + H + 0.3) / 2, -0.25), steelM);
      add(new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(px, 0.03, -0.25), steelM);
      const wx = c.x + Math.cos(bb.rotation.y) * px, wz = c.z - Math.sin(bb.rotation.y) * px;
      carColliders.push({ circle: [wx, wz, 0.35] });
    }
    add(new RoundedBoxGeometry(W + 0.36, H + 0.36, 0.22, 2, 0.03).translate(0, POST + H / 2, -0.06), steelM);
    add(new THREE.BoxGeometry(W + 0.2, H + 0.2, 0.02).translate(0, POST + H / 2, -0.18), backM);
    // the painting: printed canvas, varnished; lit from the front at night
    const canvasMat = new THREE.MeshPhysicalMaterial({ color: 0xeee6d8, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 });
    const plane = add(new THREE.PlaneGeometry(W, H).translate(0, POST + H / 2, 0.06), canvasMat);
    plane.castShadow = false;
    loader.load(base + a.file, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      canvasMat.map = tex; canvasMat.emissiveMap = tex; canvasMat.color.set(0xffffff); canvasMat.needsUpdate = true;
      if (a.file.endsWith('.png')) { canvasMat.transparent = false; canvasMat.alphaTest = 0.3; add(new THREE.PlaneGeometry(W, H).translate(0, POST + H / 2, 0.055), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 })); }
    });
    canvases.push(canvasMat);
    // the caption plate under it
    const d = Math.min(Math.abs(c.i - si), N - Math.abs(c.i - si)) * 2 / 1000;
    const cap = captionTexture(`${d.toFixed(1)} KM`);
    const plate = add(new THREE.PlaneGeometry(2.6, 0.52).translate(0, POST - 0.5, 0.0), new THREE.MeshStandardMaterial({ map: cap, roughness: 0.6 }));
    plate.castShadow = false;
    add(new THREE.BoxGeometry(2.7, 0.6, 0.06).translate(0, POST - 0.5, -0.04), steelM);
    // three gooseneck lamps along the top, leaning out over the painting
    for (const lx of [-W / 3, 0, W / 3]) {
      const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(lx, POST + H + 0.2, -0.05), new THREE.Vector3(lx, POST + H + 0.62, 0.2), new THREE.Vector3(lx, POST + H + 0.62, 0.7)]), 12, 0.025, 6);
      add(arm, steelM);
      const head = add(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 16).translate(lx, POST + H + 0.55, 0.75), steelM);
      head.rotation.x = 0;
      lamps.push(add(new THREE.CircleGeometry(0.1, 16).rotateX(Math.PI / 2 + 0.6).translate(lx, POST + H + 0.47, 0.78), lampHead));
    }
  });
  return {
    group, carColliders,
    setNight(on) {
      lampHead.emissiveIntensity = on ? 3 : 0;
      for (const m of canvases) m.emissiveIntensity = on ? 0.42 : 0;          // as if floodlit by the lamps
    },
  };
}

function captionTexture(dist) {
  const c = document.createElement('canvas'); c.width = 1040; c.height = 208;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const draw = () => {
    const g = c.getContext('2d');
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 1040, 208);
    g.fillStyle = '#2b211a'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `italic 400 84px ${SERIF}`; g.fillText('Painted by Deepti', 48, 100);
    g.textAlign = 'right'; g.font = `600 30px ${SANS}`; g.fillStyle = '#8a6a48';
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    g.fillText("DEEPTI'S STUDIO", 992, 78); g.fillStyle = '#2b211a'; g.fillText(dist, 992, 128);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = 'rgba(176,141,87,0.9)'; g.fillRect(560, 98, 120, 2);
    t.needsUpdate = true;
  };
  draw(); fontsReady.then(draw);
  return t;
}
