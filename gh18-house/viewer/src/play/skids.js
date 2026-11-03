import * as THREE from 'three';

// Skid marks: dark rubber streaks laid behind the tyres while they slide on the road. One ring buffer of
// quads for all four wheels; the oldest marks are overwritten. Marks on sand are lighter grooves.

const MAX = 1800, W = 0.19;

export function createSkids(scene) {
  const pos = new Float32Array(MAX * 4 * 3), col = new Float32Array(MAX * 4 * 4);
  const idx = new Uint32Array(MAX * 6);
  for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const nrm = new Float32Array(MAX * 4 * 3);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;                      // flat on the ground
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 0;
  mesh.name = 'skids';
  scene.add(mesh);
  let head = 0, dirty = false;
  const last = {};
  return {
    // wheel: key; x, z, y: contact point; dx, dz: unit direction of travel; k: 0..1 strength; sand: bool
    add(key, x, y, z, k, sand) {
      const p = last[key];
      if (!p || k < 0.05) { last[key] = k < 0.05 ? null : { x, y, z }; return; }
      const dx = x - p.x, dz = z - p.z, L = Math.hypot(dx, dz);
      if (L < 0.12) return;
      if (L > 2) { last[key] = { x, y, z }; return; }
      const nx = -dz / L * W / 2, nz = dx / L * W / 2;
      const i = head; head = (head + 1) % MAX;
      pos.set([p.x + nx, p.y + 0.012, p.z + nz, p.x - nx, p.y + 0.012, p.z - nz, x + nx, y + 0.012, z + nz, x - nx, y + 0.012, z - nz], i * 12);
      const c = sand ? [0.42, 0.36, 0.28] : [0.035, 0.035, 0.04];
      const a = sand ? 0.5 : Math.min(0.75, k) * 0.8;
      for (let v = 0; v < 4; v++) col.set([...c, a], (i * 4 + v) * 4);
      last[key] = { x, y, z };
      dirty = true;
    },
    lift(key) { last[key] = null; },
    update() {
      if (!dirty) return;
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
      dirty = false;
    },
    clear() { pos.fill(0); col.fill(0); dirty = true; for (const k in last) last[k] = null; },
  };
}
