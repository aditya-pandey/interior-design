// The driving camera for /play/ (driving phase 4). Pure maths (no three.js), so the test bench can drive it.
//
// Chase / high camera:
//   - swings round behind the car on a damped angle (not a lagging position: no rubber-banding), stiffer at
//     speed; looks a little into the corner (ahead of the turn, from the yaw rate) and, in a slide, part-way
//     towards where the car is going
//   - pulls back and drops a little as speed rises; under hard acceleration it trails a touch further, under
//     braking it closes in (a soft spring, so it settles rather than snaps)
//   - follows the ground through a spring so bumps and kerbs are softened; a fine shake above ~110 km/h
//     and a jolt on impacts
//   - field of view widens with speed
//   - look behind (hold B / the right stick click): swings round to look back past the car in ~0.2 s
// Driver's seat and bonnet cameras: the head moves with the g-forces (back under acceleration, forward
// under braking, out and tilted in corners), looks a little into the turn, and turns over the shoulder to
// look behind.
//
// Units: metres, seconds, radians. Yaw 0 faces +Z; forward = (sin yaw, cos yaw).

export const CAM = {
  dist: 5.6, distPerMS: 0.045, distMax: 8.6,     // chase distance and its growth with speed (m, m per m/s)
  height: 2.05, heightDrop: 0.35,                // camera height, and how much it drops at speed
  lookAhead: 2.2, lookHeight: 1.0,               // the point it aims at, ahead of the car
  yawRate: 3.2, yawRateFast: 5.5,                // swing-in rates (1/s) at low and high speed
  lead: 0.45,                                    // look into corners: seconds of yaw rate
  slide: 0.6,                                    // share of a slide's angle it follows
  accelSpring: 26, accelDamp: 9, accelGain: 0.07,// distance spring under acceleration / braking (m per m/s²)
  vertRate: 7,                                   // ground-following spring (1/s)
  fov: 56, fovPerMS: 0.28, fovMax: 74,
  shakeSpeed: 30, shake: 0.012,                  // m/s above which it shakes; amplitude (m)
  lookBackRate: 16,                              // how fast it swings round to look back (1/s)
  high: { dist: 12.5, height: 8.5, lookAhead: 3.0, lookHeight: 0.4 },
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export class ChaseCam {
  constructor(c = CAM) { this.c = c; this.init = false; this.back = 0; this.shakeT = 0; this.jolt = 0; }

  // car: { x, z, y (ground height under it), yaw, vx, vz, speed (signed), r (yaw rate), ax (forward accel) }
  // opt: { mode: 'chase' | 'high', lookYaw, lookPitch, zoom, lookBack, blocked(x, z) -> bool, impact }
  update(dt, car, opt = {}) {
    const c = this.c, high = opt.mode === 'high', H = high ? c.high : null;
    const v = Math.abs(car.speed), spd = Math.hypot(car.vx, car.vz);
    // where it wants to look from: behind the heading, part-way to the direction of travel in a slide,
    // a little into the turn
    let slide = 0;
    if (car.speed > 3) slide = wrap(Math.atan2(car.vx, car.vz) - car.yaw) * Math.min(1, (spd - 3) / 5) * c.slide;
    const lead = Math.max(-0.35, Math.min(0.35, car.r * c.lead * Math.min(1, v / 8)));
    this.back = damp(this.back, opt.lookBack ? 1 : 0, c.lookBackRate, dt);
    this.leadS = damp(this.leadS ?? lead, lead, 4, dt);          // (smoothed: quick wiggles don't twitch the view)
    const target = car.yaw + slide + this.leadS + (opt.lookYaw || 0);
    if (!this.init) { this.base = target; this.dist = c.dist; this.distV = 0; this.y = car.y; this.init = true; }
    const rate = c.yawRate + (c.yawRateFast - c.yawRate) * Math.min(1, v / 25);
    this.base += wrap(target - this.base) * (1 - Math.exp(-rate * dt));
    this.yaw = this.base + this.back * Math.PI;                  // looking back swings straight round
    // distance: grows with speed; a spring trails it under acceleration and closes it under braking
    const zoom = opt.zoom || 1;
    const want = (high ? H.dist : Math.min(c.distMax, c.dist + v * c.distPerMS)) * zoom + (high ? 0 : car.ax * c.accelGain * Math.sign(car.speed || 1));
    this.distV += ((want - this.dist) * c.accelSpring - this.distV * c.accelDamp) * dt;
    this.dist += this.distV * dt;
    // keep out of walls: shorten towards the car (quickly in, slowly back out)
    let free = 1;
    if (opt.blocked) for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      if (opt.blocked(car.x - Math.sin(this.yaw) * this.dist * t, car.z - Math.cos(this.yaw) * this.dist * t)) { free = Math.max(0.45, (i - 1.5) / 8); break; }
    }
    this.free = this.free == null ? free : damp(this.free, free, free < this.free ? 12 : 3, dt);
    const d = this.dist * this.free;
    // height: lower at speed, higher when boxed in; the ground followed through a spring
    this.y = damp(this.y, car.y, c.vertRate, dt);
    const h = (high ? H.height : c.height - c.heightDrop * Math.min(1, v / 30)) * zoom + (opt.lookPitch || 0) * d * 0.8 + (1 - this.free) * 1.1;
    let x = car.x - Math.sin(this.yaw) * d, z = car.z - Math.cos(this.yaw) * d, y = Math.max(0.7, this.y + h);
    // shake: fine, at speed; a jolt on impacts
    this.shakeT += dt;
    if (opt.impact && opt.impact > this.lastImpact + 0.5) this.jolt = Math.min(0.25, opt.impact * 0.03);
    this.lastImpact = opt.impact || 0;
    this.jolt = Math.max(0, this.jolt - dt * 0.6);
    const sk = Math.max(0, v - c.shakeSpeed) / 15 * c.shake + this.jolt;
    if (sk > 0) {
      const t = this.shakeT;
      x += Math.sin(t * 31.7) * sk * 0.6; y += Math.sin(t * 43.1 + 1) * sk; z += Math.sin(t * 37.3 + 2) * sk * 0.6;
    }
    // aim: ahead of the car (behind it, when looking back)
    const fwd = car.speed < -0.5 ? -1 : 1, la = (high ? H.lookAhead : c.lookAhead) * (1 - 2 * this.back);
    const lx = car.x + Math.sin(car.yaw) * la * fwd, lz = car.z + Math.cos(car.yaw) * la * fwd;
    const ly = this.y + (high ? H.lookHeight : c.lookHeight);
    this.fov = damp(this.fov ?? c.fov, Math.min(c.fovMax, c.fov + v * c.fovPerMS), 3, dt);
    return { x, y, z, lx, ly, lz, fov: this.fov };
  }
}

// the head in the driver's seat (or the bonnet camera): offsets in the car's frame, from the g-forces
// ax: forward accel, ay: sideways accel (+ left), steer: wheel angle, r: yaw rate. Returns
// { back, side, up (m), yaw, pitch, roll (rad) } to add to the seated eye.
export function headMotion(state, dt, { ax, ay, steer, r, speed, lookBack }) {
  const s = state;
  s.ax = damp(s.ax ?? 0, ax, 6, dt); s.ay = damp(s.ay ?? 0, ay, 6, dt);
  s.back = damp(s.back ?? 0, lookBack ? 1 : 0, 10, dt);
  return {
    back: -s.ax * 0.006,                  // pushed back accelerating, forward braking
    side: -s.ay * 0.007,                  // thrown to the outside of the turn
    up: 0,
    yaw: steer * 0.35 + Math.max(-0.2, Math.min(0.2, r * 0.12 * Math.min(1, Math.abs(speed) / 8))) + s.back * 2.6,
    pitch: s.ax * 0.003,
    roll: -s.ay * 0.004,                  // the head tilts into the turn a touch
  };
}
