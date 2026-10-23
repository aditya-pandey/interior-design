// Plan geometry helpers - a port of tools/houselib.py so the viewer reads house.json
// with exactly the same conventions as the plan generator.
// Plan units are mm: x across the plot, y from the rear lawn to the street.

const RAD = Math.PI / 180;

export function arcPoint(c, r, deg) {
  return [c[0] + r * Math.cos(deg * RAD), c[1] + r * Math.sin(deg * RAD)];
}

export function wallLength(w) {
  if (w.arc) return Math.abs(w.arc.to - w.arc.from) * RAD * w.arc.r;
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

export function wallDir(w) {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
}

// Point at distance t along the centreline, offset `side` mm along the left normal (dy, -dx).
export function wallPoint(w, t, side = 0) {
  if (w.arc) {
    const { c, r, from, to } = w.arc;
    const sgn = to >= from ? 1 : -1;
    const deg = from + sgn * (t / (RAD * r));
    return arcPoint(c, r + sgn * side, deg);
  }
  const [dx, dy] = wallDir(w);
  return [w.a[0] + dx * t + dy * side, w.a[1] + dy * t - dx * side];
}

// Unit tangent (direction of travel) at distance t.
export function wallTangent(w, t) {
  if (!w.arc) return wallDir(w);
  const { from, to, r } = w.arc;
  const sgn = to >= from ? 1 : -1;
  const deg = from + sgn * (t / (RAD * r));
  return [-Math.sin(deg * RAD) * sgn, Math.cos(deg * RAD) * sgn];
}

export function wallSegments(w) {
  const L = wallLength(w);
  const cuts = (w.openings || []).map((o) => [o.offset, o.offset + o.width, o]).sort((a, b) => a[0] - b[0]);
  const solid = [];
  let t = 0;
  for (const [s, e] of cuts) {
    if (s > t) solid.push([t, s]);
    t = Math.max(t, e);
  }
  if (t < L) solid.push([t, L]);
  return { solid, cuts };
}

export function spanPolygon(w, t0, t1, step = 150) {
  const h = w.t / 2;
  if (w.arc) {
    const n = Math.max(1, Math.ceil((t1 - t0) / step));
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      left.push(wallPoint(w, t, h));
      right.push(wallPoint(w, t, -h));
    }
    return left.concat(right.reverse());
  }
  return [wallPoint(w, t0, h), wallPoint(w, t1, h), wallPoint(w, t1, -h), wallPoint(w, t0, -h)];
}

// Swing sign: +1 if the leaf opens toward the wall's left normal.
export function swingSign(w, swing) {
  if (w.arc) {
    const sgn = w.arc.to >= w.arc.from ? 1 : -1;
    return swing === 'out' ? sgn : -sgn;
  }
  const [dx, dy] = wallDir(w);
  const v = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] }[swing] || [0, 1];
  return dy * v[0] - dx * v[1] > 0 ? 1 : -1;
}

export function face(w, side) {
  const h = w.t / 2;
  if (Math.abs(w.a[0] - w.b[0]) < 1e-6) return side === '+' ? w.a[0] + h : w.a[0] - h;
  return side === '+' ? w.a[1] + h : w.a[1] - h;
}

export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polyBBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

export function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  if (Math.abs(a) < 1e-9) {
    const b = polyBBox(pts);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Circle (radius r) vs polygon overlap.
export function circleHitsPoly(x, y, r, pts) {
  if (pointInPoly(x, y, pts)) return true;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (distToSegment(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1]) < r) return true;
  }
  return false;
}

export function furnitureCorners(f) {
  const [w, d] = f.size;
  const a = (f.rot || 0) * RAD, ca = Math.cos(a), sa = Math.sin(a);
  const [cx, cy] = f.pos;
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, ly]) => [
    cx + lx * ca - ly * sa,
    cy + lx * sa + ly * ca,
  ]);
}
