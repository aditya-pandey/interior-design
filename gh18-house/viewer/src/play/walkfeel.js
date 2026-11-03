import * as THREE from 'three';
import { Walker } from '../walk.js';

// A better walk for /play/ (the tour itself, on / and /v1/, keeps its own): applied by patching the
// tour's Walker class at start-up, so both the home tour inside /play/ and walking on the coast get it.
//   - momentum: she speeds up and slows down over a fraction of a second instead of starting and
//     stopping dead; a little quicker than before (a relaxed 1.9 m/s walk, 4.2 m/s with Shift)
//   - sliding: blocked moves are split into short steps, and a blocked step tries the directions
//     either side before giving up, so she glides along walls and round furniture corners instead of
//     sticking to them
//   - stairs: the eye follows the floor height smoothly (no jolt at each tread), and a slightly larger
//     step-up is allowed at the top and bottom of a flight
//   - a faint head bob while moving

const EYE = 1.6, WALK = 1.9, RUN = 4.2, ACC = 9, DEC = 12, SUB = 0.06;
const TRY = [0, 0.45, -0.45, 0.95, -0.95, 1.35, -1.35];        // radians either side of the wanted direction

export function improveWalker() {
  const P = Walker.prototype;
  if (P._improved) return;
  P._improved = true;

  const place = P.place;
  P.place = function (...args) {
    place.apply(this, args);
    this.eyeY = this.foot + EYE;
    if (this.vel) this.vel.set(0, 0);
  };

  P.update = function (dt) {
    this.vel ||= new THREE.Vector2();
    this.bob ||= 0;
    if (this.eyeY == null) this.eyeY = this.foot + EYE;
    const p = this.camera.position;
    if (!this.active) { this.vel.set(0, 0); return; }
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + this.stick.y;
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.stick.x;
    const mag = Math.min(1, Math.hypot(fwd, side));
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    // wanted velocity (m/s, world X / Z)
    let wx = 0, wz = 0;
    if (mag > 0.08) {
      const sp = (k.ShiftLeft || k.ShiftRight ? RUN : WALK) * mag;
      const mx = dir.x * fwd - dir.z * side, mz = dir.z * fwd + dir.x * side, L = Math.hypot(mx, mz) || 1;
      wx = (mx / L) * sp; wz = (mz / L) * sp;
    }
    const rate = wx || wz ? ACC : DEC;
    const ex = wx - this.vel.x, ez = wz - this.vel.y, el = Math.hypot(ex, ez), dv = Math.min(el, rate * dt);
    if (el > 1e-6) { this.vel.x += (ex / el) * dv; this.vel.y += (ez / el) * dv; }

    let x = p.x * 1000, y = p.z * 1000;
    const step = Math.hypot(this.vel.x, this.vel.y) * dt;
    if (step > 1e-5) {
      const n = Math.max(1, Math.ceil(step / SUB));
      const ang = Math.atan2(this.vel.y, this.vel.x), len = (step / n) * 1000;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        let ok = false;
        for (const t of TRY) {
          const l = len * Math.cos(t);
          if (l < len * 0.15) continue;
          const nx = x + Math.cos(ang + t) * l, ny = y + Math.sin(ang + t) * l;
          const h = this.standAt(nx, ny, this.foot);
          if (h === null || this.blocked(nx, ny, h)) continue;
          x = nx; y = ny; this.foot = h; ok = true; moved += l;
          break;
        }
        if (!ok) break;
      }
      // lose the speed that went into the wall
      if (moved < len * n * 0.5) this.vel.multiplyScalar(moved / (len * n) + 0.2);
    }
    // the eye follows the floor smoothly (stairs), with a faint bob while walking
    const target = this.foot + EYE;
    this.eyeY = Math.abs(target - this.eyeY) > 1.2 ? target : this.eyeY + (target - this.eyeY) * (1 - Math.exp(-dt * 12));
    const speed = Math.hypot(this.vel.x, this.vel.y);
    this.bob += speed * dt * 3.6;
    const bob = Math.sin(this.bob) * 0.018 * Math.min(1, speed / 2);
    p.set(x / 1000, this.eyeY + bob, y / 1000);
  };

  // a slightly taller step at the ends of a flight, where a tread meets the floor
  const standAt = P.standAt;
  P.standAt = function (x, y, foot) {
    const h = standAt.call(this, x, y, foot);
    if (h !== null) return h;
    let best = null;
    for (const v of this.heights(x, y)) {
      const d = v - foot;
      if (d > 0.5 || d < -0.5) continue;
      if (best === null || Math.abs(d) < Math.abs(best - foot)) best = v;
    }
    return best;
  };
}
