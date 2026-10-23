import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { pointInPoly, circleHitsPoly, polyBBox } from './geom.js';
import { stairHeights } from './build.js';

// First-person walk mode: WASD + mouse at 1.6 m eye height, wall/furniture collision,
// and floor following (rooms, terraces, outdoor levels, stairs) taken from house.json.

const EYE = 1.6, RADIUS = 250, STEP = 0.42, SPEED = 1.5, RUN = 3.2;

export class Walker {
  constructor(camera, dom, data) {
    this.camera = camera;
    this.data = data;
    this.controls = new PointerLockControls(camera, dom);
    this.keys = {};
    this.foot = 0.45;
    this.active = false;
    for (const c of data.colliders) c.bb = polyBBox(c.poly);
    for (const s of data.surfaces) s.bb = polyBBox(s.poly);
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  // Walkable heights at plan point (mm).
  heights(x, y) {
    const out = [0];
    for (const s of this.data.surfaces) {
      const b = s.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointInPoly(x, y, s.poly)) out.push(s.y);
    }
    return out.concat(stairHeights(this.data.stair, this.data.levels, x, y));
  }

  standAt(x, y, foot) {
    let best = null;
    for (const h of this.heights(x, y)) {
      const d = h - foot;
      if (d > STEP || d < -STEP) continue;
      if (best === null || Math.abs(d) < Math.abs(best - foot)) best = h;
    }
    return best;
  }

  blocked(x, y, foot) {
    for (const c of this.data.colliders) {
      if (c.y1 < foot + 0.2 || c.y0 > foot + 1.75) continue;
      const b = c.bb;
      if (x < b[0] - RADIUS || x > b[2] + RADIUS || y < b[1] - RADIUS || y > b[3] + RADIUS) continue;
      if (circleHitsPoly(x, y, RADIUS, c.poly)) return true;
    }
    return false;
  }

  // Place the walker at plan point (mm) on the surface nearest to `foot` (m).
  place(x, y, foot, yaw = 0, pitch = 0) {
    const h = this.heights(x, y).reduce((a, b) => (Math.abs(b - foot) < Math.abs(a - foot) ? b : a), 0);
    this.foot = h;
    this.camera.position.set(x / 1000, h + EYE, y / 1000);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    if (!fwd && !side) return;
    const speed = (k.ShiftLeft || k.ShiftRight ? RUN : SPEED) * dt;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const mv = dir.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize().multiplyScalar(speed * 1000);
    const p = this.camera.position;
    let x = p.x * 1000, y = p.z * 1000;
    // try the full move, then slide along each axis
    for (const [dx, dy] of [[mv.x, mv.z], [mv.x, 0], [0, mv.z]]) {
      const nx = x + dx, ny = y + dy;
      const h = this.standAt(nx, ny, this.foot);
      if (h === null || this.blocked(nx, ny, h)) continue;
      x = nx; y = ny; this.foot = h;
      break;
    }
    p.set(x / 1000, this.foot + EYE, y / 1000);
  }
}
