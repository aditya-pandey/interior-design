// Car physics for /play/: a planar bicycle model (front and rear axle, tyre slip angles with a grip
// limit), an automatic gearbox, weight transfer and body pitch / roll for the visuals. Pure maths, no
// three.js, so it can be stepped headlessly. Tuned to feel like a 2022 Baleno: 920 kg, 2.52 m
// wheelbase, about 12 s to 100 km/h, forgiving rather than sporty.
//
// Frame: world X / Z plane, yaw 0 faces +Z, positive yaw turns towards +X (the car's left).

const G = 9.81;
export const SPEC = {
  mass: 920, wheelbase: 2.52, cgFront: 1.02, cgHeight: 0.52, length: 3.99, width: 1.745,
  inertia: 1350, wheelRadius: 0.30, maxSteer: 0.6, steerRate: 2.4, steerReturn: 3.4,
  power: 62000, maxAccelForce: 2900, brakeForce: 9200, handbrakeForce: 4200,
  rollResist: 140, drag: 0.42, mu: 1.05, muHandbrake: 0.42,
  gears: [3.55, 1.90, 1.28, 0.97, 0.78], final: 4.2, reverseRatio: 3.5, idle: 850, redline: 6200,
  maxReverse: 6,
};

export class VehicleSim {
  constructor(spec = SPEC) {
    this.s = spec;
    this.a = spec.cgFront;
    this.b = spec.wheelbase - spec.cgFront;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.r = 0;
    this.steer = 0; this.gear = 1; this.rpm = this.s.idle;
    this.ax = 0; this.ay = 0;              // body-frame accelerations (forward, left) for pitch / roll
    this.slip = 0;                         // 0..1, how hard the tyres are sliding (sound, smoke)
    this.impact = 0;                       // last collision speed, m/s (sound)
    this.reversing = false;
    this.wheelSpin = 0;
    this.shiftT = 0;                       // > 0 while a gear change cuts the drive
    this.surface = 'road';
    this.savePrev();
  }

  // the state at the start of the last step, so the renderer can draw between steps
  savePrev() {
    this.px = this.x; this.pz = this.z; this.pyaw = this.yaw; this.psteer = this.steer; this.pspin = this.wheelSpin;
  }

  get forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  get left() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }
  get speed() { const [fx, fz] = this.forward; return this.vx * fx + this.vz * fz; }   // signed, m/s

  // corners of the body footprint (lateral u to the car's right, longitudinal v forward)
  corners(x = this.x, z = this.z, shrink = 0.03) {
    const hw = this.s.width / 2 - shrink, hl = this.s.length / 2 - shrink;
    const [fx, fz] = this.forward, rx = -fz, rz = fx;      // right = forward rotated -90 degrees
    const p = (u, v) => [x + rx * u + fx * v, z + rz * u + fz * v];
    return [p(-hw, -hl), p(hw, -hl), p(hw, hl), p(-hw, hl)];
  }

  // input: {throttle 0..1, brake 0..1, steer -1..1 (+ = left), handbrake bool}
  // surfaceAt(x, z) -> 'road' | 'sand' | 'water' | 'ground' changes grip and rolling drag
  step(dt, input, world, surfaceAt) {
    const s = this.s;
    this.savePrev();
    this.surface = surfaceAt ? surfaceAt(this.x, this.z) : 'road';
    const SURF = { road: [1, 0], ground: [0.9, 260], sand: [0.72, 900], water: [0.6, 2600] }[this.surface] || [1, 0];
    const [fx, fz] = this.forward, [lx, lz] = this.left;
    let u = this.vx * fx + this.vz * fz;            // forward speed
    let v = this.vx * lx + this.vz * lz;            // leftward speed

    // steering: limited lock at speed, smooth ramp
    const maxLock = s.maxSteer / (1 + Math.abs(u) / 11);
    const target = input.steer * maxLock;
    const rate = Math.abs(target) > Math.abs(this.steer) && Math.sign(target) === Math.sign(this.steer || target) ? s.steerRate : s.steerReturn;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    const d = this.steer;

    // pedals: forward pedal drives (or brakes while rolling back); back pedal brakes, then reverses
    let drive = 0, brake = 0;
    if (u > 0.4) this.reversing = false;
    if (u < -0.4) this.reversing = true;
    if (!this.reversing) {
      drive = input.throttle;
      brake = input.brake;
      if (input.brake > 0 && Math.abs(u) < 0.4 && input.throttle === 0) { this.reversing = true; }
    } else {
      drive = -input.brake;
      brake = input.throttle;
      if (input.throttle > 0 && Math.abs(u) < 0.4 && input.brake === 0) { this.reversing = false; }
    }

    // gearbox and engine force
    const ratio = this.reversing ? s.reverseRatio : s.gears[this.gear - 1];
    const wheelRpm = (Math.abs(u) / s.wheelRadius) * 60 / (2 * Math.PI);
    this.rpm = Math.max(s.idle, Math.min(s.redline, wheelRpm * ratio * s.final));
    if (!this.reversing) {
      if (this.rpm > 5300 && this.gear < s.gears.length && input.throttle > 0.05) { this.gear++; this.shiftT = 0.22; }
      else if (this.gear > 1 && wheelRpm * s.gears[this.gear - 2] * s.final < 3000) this.gear--;
    } else this.gear = 1;
    let Fx = 0;
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (drive !== 0 && this.shiftT <= 0.05) {
      const f = Math.min(s.maxAccelForce, s.power / Math.max(Math.abs(u), 2));
      Fx += drive * f * (this.reversing && Math.abs(u) > s.maxReverse ? 0 : 1);
      if (!this.reversing && this.rpm >= s.redline - 10 && this.gear === s.gears.length) Fx = 0;
    }
    const sgn = Math.abs(u) > 0.05 ? Math.sign(u) : 0;
    const Fb = brake * s.brakeForce + (input.handbrake ? s.handbrakeForce : 0);
    Fx -= sgn * (s.rollResist + SURF[1] + s.drag * u * u);
    // braking can't push the car backwards: clamp it to what stops the car this step
    const stopF = Math.abs(u) * s.mass / dt;
    Fx -= sgn * Math.min(Fb, stopF);
    if (sgn === 0 && drive === 0) { u = 0; Fx = 0; }

    // weight transfer and lateral tyre forces
    const L = s.wheelbase;
    const Nf = Math.max(0.2, s.mass * G * this.b / L - s.mass * this.ax * s.cgHeight / L);
    const Nr = Math.max(0.2, s.mass * G * this.a / L + s.mass * this.ax * s.cgHeight / L);
    const Cf = 11 * s.mass * G * this.b / L, Cr = 12.5 * s.mass * G * this.a / L;
    const au = Math.max(Math.abs(u), 0.5);
    const af = Math.atan2(v + this.a * this.r, au) - d * Math.sign(u || 1);
    const ar = Math.atan2(v - this.b * this.r, au);
    const muF = s.mu * SURF[0];
    const muR = (input.handbrake ? s.muHandbrake : s.mu) * SURF[0];
    const Fyf = Math.max(-muF * Nf, Math.min(muF * Nf, -Cf * af));
    const Fyr = Math.max(-muR * Nr, Math.min(muR * Nr, -Cr * ar));
    this.slip = Math.min(1, Math.max(Math.abs(Fyr) / (muR * Nr), Math.abs(Fyf) / (muF * Nf)) * Math.min(1, Math.abs(u) / 8)
      * (Math.max(Math.abs(af), Math.abs(ar)) > 0.12 ? 1 : 0.3));

    // integrate (semi-implicit Euler)
    const du = (Fx - Fyf * Math.sin(d)) / s.mass + v * this.r;
    const dv = (Fyr + Fyf * Math.cos(d)) / s.mass - u * this.r;
    const dr = (this.a * Fyf * Math.cos(d) - this.b * Fyr) / s.inertia;
    u += du * dt; v += dv * dt; this.r += dr * dt;
    if (sgn !== 0 && Math.sign(u) !== sgn && drive === 0) u = 0;     // brakes stop the car, don't reverse it
    // low speed: blend to the kinematic model (no slip), which is stable when parking
    const k = Math.min(1, Math.max(0, (Math.abs(u) - 1.0) / 3.0));
    // (rolling without slip turns the car about its rear axle, so the centre moves sideways at b * r)
    const rKin = u * Math.tan(d) / L, vKin = this.b * rKin;
    this.r = rKin + (this.r - rKin) * k;
    v = vKin + (v - vKin) * k;
    this.ax = this.ax + ((du - v * this.r) - this.ax) * Math.min(1, dt * 8);
    this.ay = this.ay + ((u * this.r) - this.ay) * Math.min(1, dt * 8);

    this.r *= 1 - Math.min(1, dt * 0.6);           // a touch of yaw damping (tyre scrub, dampers): calmer, smoother
    this.yaw += this.r * dt;
    const [nfx, nfz] = this.forward, [nlx, nlz] = this.left;
    this.vx = nfx * u + nlx * v;
    this.vz = nfz * u + nlz * v;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.wheelSpin += (u / s.wheelRadius) * dt;

    // collisions: push out of the deepest overlap, bounce a little, lose speed
    this.impact = Math.max(0, this.impact - dt * 4);
    if (world) {
      for (let it = 0; it < 4; it++) {
        const hit = world.deepest(this.corners(), this.x, this.z);
        if (!hit) break;
        const [nx, nz] = hit.n;
        this.x += nx * (hit.depth + 0.002);
        this.z += nz * (hit.depth + 0.002);
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          this.impact = Math.max(this.impact, -vn);
          const e = 0.18;
          this.vx -= (1 + e) * vn * nx;
          this.vz -= (1 + e) * vn * nz;
          const tx = -nz, tz = nx, vt = this.vx * tx + this.vz * tz;
          const vn2 = this.vx * nx + this.vz * nz;
          this.vx = nx * vn2 + tx * vt * 0.85;
          this.vz = nz * vn2 + tz * vt * 0.85;
          this.r *= 0.5;
        }
      }
    }
  }
}
