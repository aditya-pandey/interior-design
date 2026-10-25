import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Services layers (R1): house.services.plumbing drawn as colour-coded pipes, stacks, chambers and tanks;
// house.services.electrical as point symbols, conduits per circuit, sub-mains and AC refrigerant runs.
// Plan (x, y) mm -> world (X = x/1000, Z = y/1000); z is mm above ground (GF FFL = 450) -> Y = z/1000.
// Every piece goes to the floor band its midpoint sits in, so the floor buttons filter the services too;
// a band starts 400 mm under its FFL, so the drains in a floor's sunken slab belong to that floor.
// X-ray: the pipes are drawn after the glass building, so its stacked layers never wash them out.

export const KINDS = {
  soil: { color: 0x7a4a26, name: 'Soil', more: 'WC' },
  waste: { color: 0xe08a1e, name: 'Waste', more: 'basin, shower, sink' },
  sewer: { color: 0x4e342e, name: 'Sewer', more: 'below ground' },
  rain: { color: 0x00a39a, name: 'Rainwater' },
  cold: { color: 0x1e7fe0, name: 'Cold water' },
  hot: { color: 0xe0352b, name: 'Hot water' },
  pumped: { color: 0x8e3cc4, name: 'Pumped riser', more: 'UGT → OHT' },
};
const CHAMBERS = {
  inspection: { color: 0x6d5a4b, name: 'Inspection chamber' },
  grease_trap: { color: 0xc26a1a, name: 'Grease trap' },
  cleanout: { color: 0x9e8f80, name: 'Sealed cleanout' },
  rwh_pit: { color: 0x00a39a, name: 'Rainwater pit', more: 'harvesting + recharge' },
  tank: { color: 0x2f8de4, name: 'Underground tank', more: '5000 L' },
};
const BANDS = [['GF', 3350], ['FF', 6650], ['SF', 9950], ['ROOF', Infinity]];
// electrical: a floor's conduits run in the slab above it, so its band ends at the next FFL
const EBANDS = [['GF', 3750], ['FF', 7050], ['SF', 10350], ['ROOF', Infinity]];
const band = (z, bands = BANDS) => bands.find(([, top]) => z < top)[0];
const v3 = (p) => new THREE.Vector3(p[0] / 1000, p[2] / 1000, p[1] / 1000);
// drawn a little fatter than real for the small supply lines, so they read at house scale
const radius = (kind, dia) => Math.max(dia, ['cold', 'hot', 'pumped'].includes(kind) ? 50 : 70) / 2000;

function tube(a, b, r) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 10, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function joint(p, r) {
  const g = new THREE.SphereGeometry(r * 1.15, 10, 6);
  g.translate(p.x, p.y, p.z);
  return g;
}

// split a segment at the floor-band boundaries so each piece can be filtered with its floor
function pieces(a, b, bands = BANDS) {
  const out = [];
  const cuts = [a[2], ...bands.map(([, t]) => t).filter((t) => t > Math.min(a[2], b[2]) && t < Math.max(a[2], b[2])), b[2]];
  cuts.sort((p, q) => (a[2] <= b[2] ? p - q : q - p));
  for (let i = 0; i + 1 < cuts.length; i++) {
    const k0 = a[2] === b[2] ? 0 : (cuts[i] - a[2]) / (b[2] - a[2]);
    const k1 = a[2] === b[2] ? 1 : (cuts[i + 1] - a[2]) / (b[2] - a[2]);
    const p0 = a.map((v, j) => v + (b[j] - v) * k0), p1 = a.map((v, j) => v + (b[j] - v) * k1);
    out.push([p0, p1, band((p0[2] + p1[2]) / 2, bands)]);
  }
  return out;
}

// one merged mesh per floor band and colour key; every key needs { color, opacity? } in `look`
function layer() {
  const groups = Object.fromEntries(BANDS.map(([f]) => [f, new THREE.Group()]));
  const geo = {};
  const add = (fid, key, g) => ((geo[fid + '|' + key] ||= []).push(g));
  const finish = (look) => {
    const mats = {};
    for (const [k, list] of Object.entries(geo)) {
      const [fid, key] = k.split('|');
      const { color, opacity = 1 } = look(key);
      const m = (mats[key] ||= new THREE.MeshStandardMaterial({
        color, roughness: 0.45, metalness: 0.05, emissive: color, emissiveIntensity: 0.28,
        transparent: true, opacity, depthWrite: opacity === 1,
      }));
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.renderOrder = opacity < 1 ? 9 : 10;
      mesh.userData.service = true;
      groups[fid].add(mesh);
    }
    return groups;
  };
  return { add, finish };
}

// fid: put the whole run on one floor (electrical circuits: a GF circuit runs in the GF ceiling slab); else by height
function polyline(add, key, pts, rad, fid = null, bands = BANDS) {
  pts.forEach((p, i) => {
    if (i) for (const [p0, p1, f] of pieces(pts[i - 1], p, bands)) if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) > 1) add(fid || f, key, tube(v3(p0), v3(p1), rad));
    add(fid || band(p[2], bands), key, joint(v3(p), rad));
  });
}

export function buildPlumbing(pl) {
  const { add, finish } = layer();
  const labels = [];

  for (const r of pl.runs) polyline(add, r.kind, r.pts, radius(r.kind, r.dia));
  for (const s of pl.stacks) {
    const rad = s.dia / 2000;
    for (const [p0, p1, fid] of pieces([...s.at, s.z[0]], [...s.at, s.z[1]])) add(fid, s.kind, tube(v3(p0), v3(p1), rad * 1.15));
    const cowl = new THREE.CylinderGeometry(rad * 1.9, rad * 1.4, 0.16, 12);   // vent cowl
    cowl.translate(s.at[0] / 1000, s.z[1] / 1000 + 0.08, s.at[1] / 1000);
    add(band(s.z[1]), s.kind, cowl);
    labels.push({ floor: 'GF', pos: [s.at[0] / 1000, 2.2, s.at[1] / 1000], id: s.id, text: `${s.dia} mm ${s.kind} stack` });
  }
  for (const c of pl.chambers) {
    const [w, d] = c.size, h = c.depth / 1000;
    const g = c.type === 'rwh_pit' ? new THREE.CylinderGeometry(w / 2000, w / 2000, h, 24) : new THREE.BoxGeometry(w / 1000, h, d / 1000);
    g.translate(c.at[0] / 1000, 0.02 - h / 2, c.at[1] / 1000);
    add('GF', 'ch_' + c.type, g);
    const lid = c.type === 'rwh_pit' ? new THREE.CylinderGeometry(w / 2000 + 0.03, w / 2000 + 0.03, 0.03, 24) : new THREE.BoxGeometry(w / 1000 + 0.06, 0.03, d / 1000 + 0.06);
    lid.translate(c.at[0] / 1000, 0.035, c.at[1] / 1000);
    add('GF', 'lid', lid);
    labels.push({ floor: 'GF', pos: [c.at[0] / 1000, 0.45, c.at[1] / 1000], id: c.id, text: CHAMBERS[c.type].name });
  }

  const groups = finish((k) => (k === 'lid' ? { color: 0x8a8780 } : k.startsWith('ch_') ? { color: CHAMBERS[k.slice(3)].color, opacity: 0.72 } : KINDS[k]));
  const used = new Set([...pl.runs.map((r) => r.kind), ...pl.stacks.map((s) => s.kind)]);
  const legend = [
    ...Object.entries(KINDS).filter(([k]) => used.has(k)).map(([, v]) => ({ ...v, shape: 'line' })),
    ...Object.entries(CHAMBERS).filter(([k]) => pl.chambers.some((c) => c.type === k)).map(([, v]) => ({ ...v, shape: 'box' })),
  ];
  return { groups, labels, legend };
}

// ------------------------------------------------------------------ electrical
export const ECAT = {
  lights: { color: 0xf2b705, name: 'Lights & fans', kinds: ['light', 'pd', 'ucl', 'ml', 'wl', 'gl', 'fan'] },
  switches: { color: 0x455a64, name: 'Switchboards', more: '2-way at bedsides, stairs', kinds: ['sb', 'sb2w'] },
  sockets: { color: 0x2e9d4f, name: '6 A sockets', more: 'incl. TV, USB, IP65', kinds: ['s6', 's6c', 'usb', 'ip65', 'ups', 'ch', 'tv'] },
  power: { color: 0xef6c00, name: '16 A power', more: 'kitchen, washer, EV, pumps, lift', kinds: ['s16', 'ev', 'pump', 'iso', 'spare'] },
  ac: { color: 0x00a6c8, name: 'AC', more: 'refrigerant to its outdoor unit', kinds: ['ac'] },
  gy: { color: 0xd32f2f, name: 'Geysers', kinds: ['gy'] },
  ef: { color: 0x8d6e63, name: 'Exhaust fans', kinds: ['ef'] },
  lv: { color: 0x2f5fd0, name: 'Data, CCTV', more: 'door phone', kinds: ['data', 'cctv', 'vdp', 'vdpo', 'rack'] },
  det: { color: 0xe91e63, name: 'Detectors', more: 'smoke, heat', kinds: ['sd', 'hd'] },
  db: { color: 0x1b1b1b, name: 'DBs', more: 'meter, inverter; black lines: sub-mains', kinds: ['db', 'mtr', 'inv'] },
};
const CAT_OF = Object.fromEntries(Object.entries(ECAT).flatMap(([c, v]) => v.kinds.map((k) => [k, c])));
const CLS = { lighting: 'lights', sockets: 'sockets', power: 'power', ac: 'ac', geyser: 'gy', ups: 'ups', data: 'lv' };
// symbol sizes in mm: width along the wall, height, depth off the wall
const SYM = {
  sb: [180, 120, 35], sb2w: [90, 90, 30], s6: [85, 85, 30], s6c: [85, 85, 30], usb: [85, 60, 30], ip65: [100, 100, 60], ups: [85, 85, 30],
  ch: [85, 85, 30], tv: [160, 90, 30], s16: [110, 110, 40], ev: [300, 420, 140], iso: [160, 220, 90], spare: [250, 300, 120],
  ac: [900, 290, 220], gy: [380, 450, 380], ef: [260, 260, 60], data: [85, 85, 30], cctv: [120, 120, 220], vdp: [180, 240, 30],
  vdpo: [120, 200, 40], rack: [550, 600, 450], db: [400, 600, 120], mtr: [500, 650, 200], inv: [450, 350, 300],
  ucl: [600, 30, 60], ml: [600, 40, 60], wl: [140, 200, 90], pump: [350, 300, 300],
};

function symbol(p) {
  const [x, y, z] = p.at;
  const k = p.kind;
  if (['light', 'pd', 'sd', 'hd'].includes(k) || (k === 'ef' && p.ceiling)) {       // on the ceiling
    const r = k === 'pd' ? 0.14 : k === 'sd' || k === 'hd' ? 0.06 : k === 'ef' ? 0.14 : 0.09;
    const g = k === 'pd' ? new THREE.SphereGeometry(r, 14, 10) : new THREE.CylinderGeometry(r, r, 0.035, 18);
    g.translate(x / 1000, z / 1000 - (k === 'pd' ? 0.6 : 0.02), y / 1000);
    return g;
  }
  if (k === 'fan') {                                  // three blades round a hub
    const parts = [0, 120, 240].map((a) => {
      const b = new THREE.BoxGeometry(0.55, 0.012, 0.09);
      b.translate(0.33, 0, 0);
      b.rotateY(THREE.MathUtils.degToRad(a));
      return b;
    });
    const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.14, 16);
    hub.translate(0, 0.05, 0);
    const g = mergeGeometries([...parts, hub], false);
    g.translate(x / 1000, z / 1000 - 0.3, y / 1000);
    return g;
  }
  if (k === 'gl') {                                   // garden / planter bollard from the ground or floor it stands on
    const h = (z - p.base) / 1000;
    const g = new THREE.CylinderGeometry(0.05, 0.06, h, 12);
    g.translate(x / 1000, p.base / 1000 + h / 2, y / 1000);
    return g;
  }
  const [w, h, d] = (SYM[k] || [100, 100, 40]).map((v) => v / 1000);
  const g = new THREE.BoxGeometry(w, h, d);
  const n = p.face;
  if (n) {
    g.translate(0, 0, d / 2);
    g.rotateY(Math.atan2(n[0], n[1]));
  }
  g.translate(x / 1000, z / 1000 + (k === 'ac' || k === 'gy' ? h / 2 : 0), y / 1000);
  return g;
}

export function buildElectrical(el, names) {
  const { add, finish } = layer();
  const labels = [];
  const floorOf = {};
  for (const p of el.points) {
    add(p.floor, CAT_OF[p.kind], symbol(p));
    if (p.circuit) (floorOf[p.circuit] ||= new Set()).add(p.floor);
  }
  for (const r of el.routes) {
    const key = 'c_' + CLS[r.cls];
    const fl = floorOf[r.circuit] && floorOf[r.circuit].size === 1 ? [...floorOf[r.circuit]][0] : null;    // UPS / data span floors
    polyline(add, key, r.trunk, 0.014, fl, EBANDS);
    for (const d of r.drops) polyline(add, key, d, 0.011, fl, EBANDS);
  }
  for (const s of el.submains) polyline(add, 'sub', s.pts, 0.028, null, EBANDS);
  for (const r of el.refrigerant) polyline(add, 'c_ac', r.pts, 0.024, null, EBANDS);
  const tagged = { db: 1, mtr: 1, inv: 1 };
  for (const p of el.points) {
    if (!tagged[p.kind]) continue;
    labels.push({ floor: p.floor, pos: [p.at[0] / 1000, p.at[2] / 1000 + 0.55, p.at[1] / 1000], id: p.tag,
      text: p.kind === 'mtr' ? 'meter + main switch' : p.kind === 'inv' ? 'inverter + rack' : { 'DB-1': 'main DB, GF + outside', 'DB-2': 'FF', 'DB-3': 'SF + terrace' }[p.tag] });
  }
  const acRoom = Object.fromEntries(el.points.filter((p) => p.kind === 'ac').map((p) => [p.id, p.room]));
  for (const r of el.refrigerant) {
    const e = r.pts[r.pts.length - 1];
    labels.push({ floor: band(e[2], EBANDS), pos: [e[0] / 1000, e[2] / 1000 + 0.5, e[1] / 1000], id: 'ODU', text: names[acRoom[r.ac]] || '' });
  }
  const look = (k) => (k === 'sub' ? { color: 0x1b1b1b } : k.startsWith('c_') ? { color: (k === 'c_ups' ? 0x7e57c2 : ECAT[k.slice(2)].color) } : ECAT[k]);
  const groups = finish(look);
  const legend = [
    ...Object.values(ECAT).map((v) => ({ ...v, shape: 'box' })),
    { color: 0x7e57c2, name: 'Inverter-backed', more: 'CCTV, door phone, desk UPS', shape: 'line' },
  ];
  return { groups, labels, legend };
}
