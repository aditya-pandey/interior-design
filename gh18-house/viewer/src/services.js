import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Services layer (R1): house.services.plumbing drawn as colour-coded pipes, stacks, chambers and tanks.
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
const band = (z) => BANDS.find(([, top]) => z < top)[0];
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
function pieces(a, b) {
  const out = [];
  const cuts = [a[2], ...BANDS.map(([, t]) => t).filter((t) => t > Math.min(a[2], b[2]) && t < Math.max(a[2], b[2])), b[2]];
  cuts.sort((p, q) => (a[2] <= b[2] ? p - q : q - p));
  for (let i = 0; i + 1 < cuts.length; i++) {
    const k0 = a[2] === b[2] ? 0 : (cuts[i] - a[2]) / (b[2] - a[2]);
    const k1 = a[2] === b[2] ? 1 : (cuts[i + 1] - a[2]) / (b[2] - a[2]);
    const p0 = a.map((v, j) => v + (b[j] - v) * k0), p1 = a.map((v, j) => v + (b[j] - v) * k1);
    out.push([p0, p1, band((p0[2] + p1[2]) / 2)]);
  }
  return out;
}

export function buildServices(services) {
  const pl = services.plumbing;
  const groups = Object.fromEntries(BANDS.map(([f]) => [f, new THREE.Group()]));
  const geo = {};                                   // floor|kind -> [geometries]
  const add = (fid, key, g) => ((geo[fid + '|' + key] ||= []).push(g));
  const mats = {};
  const mat = (key, color, opacity = 1) => (mats[key] ||= new THREE.MeshStandardMaterial({
    color, roughness: 0.45, metalness: 0.05, emissive: color, emissiveIntensity: 0.28,
    transparent: true, opacity, depthWrite: opacity === 1,
  }));
  const labels = [];

  for (const r of pl.runs) {
    const rad = radius(r.kind, r.dia);
    r.pts.forEach((p, i) => {
      if (i) for (const [p0, p1, fid] of pieces(r.pts[i - 1], p)) add(fid, r.kind, tube(v3(p0), v3(p1), rad));
      add(band(p[2]), r.kind, joint(v3(p), rad));
    });
  }
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

  for (const [key, list] of Object.entries(geo)) {
    const [fid, kind] = key.split('|');
    let m;
    if (kind === 'lid') m = mat('lid', 0x8a8780);
    else if (kind.startsWith('ch_')) m = mat(kind, CHAMBERS[kind.slice(3)].color, 0.72);
    else m = mat(kind, KINDS[kind].color);
    const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
    mesh.renderOrder = m.opacity < 1 ? 9 : 10;
    mesh.userData.service = true;
    groups[fid].add(mesh);
  }
  const used = new Set([...pl.runs.map((r) => r.kind), ...pl.stacks.map((s) => s.kind)]);
  const legend = [
    ...Object.entries(KINDS).filter(([k]) => used.has(k)).map(([, v]) => ({ ...v, shape: 'line' })),
    ...Object.entries(CHAMBERS).filter(([k]) => pl.chambers.some((c) => c.type === k)).map(([, v]) => ({ ...v, shape: 'box' })),
  ];
  return { groups, labels, legend };
}
