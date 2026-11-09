// 2D collision for the car (plan view, metres): convex polygons and circles in a uniform grid,
// tested against the car's oriented box with the separating-axis theorem. "Fields" are tested
// everywhere: objects with test(corners) -> {n, depth} | null (e.g. the sea fence).

const CELL = 6;

export class CollisionWorld {
  constructor(items) {
    this.grid = new Map();
    this.items = [];
    this.fields = [];
    for (const it of items) this.add(it);
  }

  add(it) {
    if (it.field) { this.fields.push(it); return; }
    let bb;
    if (it.circle) {
      const [x, z, r] = it.circle;
      bb = [x - r, z - r, x + r, z + r];
    } else {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of it.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      bb = [x0, z0, x1, z1];
      it.center = [(x0 + x1) / 2, (z0 + z1) / 2];
    }
    it.bb = bb;
    it.id = this.items.length;
    this.items.push(it);
    for (let i = Math.floor(bb[0] / CELL); i <= Math.floor(bb[2] / CELL); i++) {
      for (let j = Math.floor(bb[1] / CELL); j <= Math.floor(bb[3] / CELL); j++) {
        const k = i + ',' + j;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(it);
      }
    }
  }

  near(x0, z0, x1, z1) {
    const seen = new Set(), out = [];
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        for (const it of this.grid.get(i + ',' + j) || []) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          if (it.bb[0] > x1 || it.bb[2] < x0 || it.bb[1] > z1 || it.bb[3] < z0) continue;
          out.push(it);
        }
      }
    }
    return out;
  }

  // Deepest overlap between the box (corners, centre) and anything nearby: {n: [nx, nz] pointing from
  // the obstacle into the box, depth} or null.
  deepest(corners, cx, cz) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of corners) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    let best = null;
    for (const it of this.near(x0, z0, x1, z1)) {
      const hit = it.circle ? boxCircle(corners, cx, cz, it.circle) : sat(corners, cx, cz, it.poly, it.center);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    for (const f of this.fields) {
      const hit = f.test(corners);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    return best;
  }
}

function project(pts, nx, nz) {
  let mn = Infinity, mx = -Infinity;
  for (const [x, z] of pts) {
    const d = x * nx + z * nz;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }
  return [mn, mx];
}

export function sat(A, ax, az, B, bc) {
  let depth = Infinity, n = null;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
      let nx = z1 - z0, nz = -(x1 - x0);
      const L = Math.hypot(nx, nz);
      if (L < 1e-9) continue;
      nx /= L; nz /= L;
      const [a0, a1] = project(A, nx, nz), [b0, b1] = project(B, nx, nz);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (o < depth) { depth = o; n = [nx, nz]; }
    }
  }
  if ((ax - bc[0]) * n[0] + (az - bc[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { n, depth };
}

function boxCircle(corners, cx, cz, [x, z, r]) {
  // box axes from its corners: 0->1 = width (right), 1->2 = length (forward)
  const ux = corners[1][0] - corners[0][0], uz = corners[1][1] - corners[0][1];
  const vx = corners[2][0] - corners[1][0], vz = corners[2][1] - corners[1][1];
  const hw = Math.hypot(ux, uz) / 2, hl = Math.hypot(vx, vz) / 2;
  const ex = [ux / (2 * hw), uz / (2 * hw)], ez = [vx / (2 * hl), vz / (2 * hl)];
  const dx = x - cx, dz = z - cz;
  const lu = dx * ex[0] + dz * ex[1], lv = dx * ez[0] + dz * ez[1];
  const qu = Math.max(-hw, Math.min(hw, lu)), qv = Math.max(-hl, Math.min(hl, lv));
  if (Math.abs(lu) <= hw && Math.abs(lv) <= hl) {
    // circle centre inside the box: push out along the nearest side
    const pu = hw - Math.abs(lu), pv = hl - Math.abs(lv);
    if (pu < pv) { const s = lu > 0 ? -1 : 1; return { n: [ex[0] * s, ex[1] * s], depth: pu + r }; }
    const s = lv > 0 ? -1 : 1;
    return { n: [ez[0] * s, ez[1] * s], depth: pv + r };
  }
  const px = cx + ex[0] * qu + ez[0] * qv, pz = cz + ex[1] * qu + ez[1] * qv;
  const d = Math.hypot(px - x, pz - z);
  if (d >= r) return null;
  return { n: [(px - x) / d, (pz - z) / d], depth: r - d };
}
