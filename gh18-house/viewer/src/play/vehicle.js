// Car physics for /play/: a planar two-axle ("bicycle") model with real tyre behaviour, an automatic
// gearbox and weight transfer. Pure maths, no three.js, so it can be stepped headlessly.
//
// Tyres: each axle's sideways force follows a Pacejka "magic formula" curve of its slip angle: it builds
// up, peaks at ~7 degrees and then falls away to ~80 % as the tyre slides, so the car lets go
// progressively and can be held in a slide instead of gripping like a rail and then snapping. Grip is
// shared between cornering and driving / braking (a friction circle): power on the front wheels (the
// Baleno is front-wheel drive) or hard braking leaves less for turning. The handbrake locks the rear
// wheels, which then just slide (their friction opposes their motion), so the tail swings out.
// Driver aids, as in most driving games: a little automatic counter-steer while the tail is out, ABS,
// and less steering lock at speed. Load moves forward under braking and back under power.
//
// The rear tyres are a touch grippier and stiffer per kilo than the fronts (as on a real road car, so it
// steers a little "safe": stable at speed), and lose less once they slide (so slides are catchable).
//
// Tuned to a 2022 Baleno: 920 kg, 2.52 m wheelbase, ~12 s to 100 km/h, ~0.85 g of grip, ~4.9 m turning radius.
//
// Frame: world X / Z plane, yaw 0 faces +Z, positive yaw turns towards +X (the car's left).

import { TUNING } from './vehicleTuning.js';

const G = 9.81;
export const SPEC = TUNING;                 // (all the numbers: vehicleTuning.js)

// Pacejka magic formula, normalised: slip angle (rad) -> -1..1 of the available grip
function magic(alpha, s, peak = s.peakSlip, C = s.shape) {
  const E = s.curvature;
  const B = Math.tan(Math.PI / (2 * C)) / peak;                // so the peak sits at `peak`
  const x = B * alpha;
  return Math.sin(C * Math.atan(x - E * (x - Math.atan(x))));
}

const AIR = [0.015, 0];
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
    this.slip = 0;                         // 0..1, how hard the tyres are sliding (sound, skid marks)
    this.drift = 0;                        // body slip angle, rad (+ = sliding to the left)
    this.tel = {};                         // per-step telemetry (see step())
    this.roll = 0; this.rollRate = 0;      // body roll, rad (+ when cornering left: leans out to the right)
    this.pitch = 0; this.pitchRate = 0;    // body pitch, rad (+ = nose down, under braking)
    this.aF = 0; this.aR = 0;              // slip angles as the tyres actually feel them (they take a moment to build)
    this.hbT = 1;                          // seconds since the handbrake was let go
    this.aids = { counter: 1, esc: 1, tcs: true, abs: true };   // driving aids (input.js AID_LEVELS)
    this.ayT = 0; this.axT = 0;            // true accelerations (m/s², sideways left / forward), unfiltered
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
    const SURF = this.surface === 'air' ? AIR : s.surfaces[this.surface] || s.surfaces.road;      // (in the air: no grip, nothing to roll on)
    const [fx, fz] = this.forward, [lx, lz] = this.left;
    let u = this.vx * fx + this.vz * fz;            // forward speed
    let v = this.vx * lx + this.vz * lz;            // leftward speed

    // steering: less lock at speed, a smooth ramp, and (while the tail is out and the driver isn't
    // already steering against it) a little automatic counter-steer, as driving games do
    this.hbT = input.handbrake ? 0 : Math.min(5, this.hbT + dt);
    const aidK = Math.min(1, this.hbT / s.aidReturn);           // aids stand aside while the handbrake is on
    const maxLock = s.maxSteer / (1 + Math.max(0, Math.abs(u) - s.lockFreeSpeed) / s.lockSpeedFalloff);
    const beta = Math.abs(u) > 4 ? Math.atan2(v, Math.abs(u)) : 0;
    const assist = Math.max(-s.counterSteerMax, Math.min(s.counterSteerMax, beta * s.counterSteer)) * (1 - Math.min(1, Math.abs(input.steer)) * s.counterSteerYield) * aidK * this.aids.counter;
    const target = Math.max(-s.maxSteer, Math.min(s.maxSteer, input.steer * maxLock + (u >= 0 ? assist : 0)));
    const rate = (Math.abs(target) > Math.abs(this.steer) && Math.sign(target) === Math.sign(this.steer || target) ? s.steerRate : s.steerReturn) * (1 + Math.abs(beta) * s.steerRateSlide) / (1 + Math.abs(u) / s.steerRateFalloff);
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

    // gearbox and engine force (at the front wheels)
    const ratio = this.reversing ? s.reverseRatio : s.gears[this.gear - 1];
    const wheelRpm = (Math.abs(u) / s.wheelRadius) * 60 / (2 * Math.PI);
    this.rpm = Math.max(s.idle, Math.min(s.redline, wheelRpm * ratio * s.final));
    if (!this.reversing) {
      if (this.rpm > s.shiftUpRpm && this.gear < s.gears.length && input.throttle > 0.05) { this.gear++; this.shiftT = s.shiftTime; }
      else if (this.gear > 1 && wheelRpm * s.gears[this.gear - 2] * s.final < s.shiftDownRpm) this.gear--;
    } else this.gear = 1;
    this.shiftT = Math.max(0, this.shiftT - dt);
    let Fdrive = 0;
    if (drive !== 0 && this.shiftT <= 0.05) {
      const f = Math.min(s.maxAccelForce, s.power / Math.max(Math.abs(u), 2));
      Fdrive = drive * f * (this.reversing && Math.abs(u) > s.maxReverse ? 0 : 1);
      if (!this.reversing && this.rpm >= s.redline - 10 && this.gear === s.gears.length) Fdrive = 0;
    }
    const sgn = Math.abs(u) > 0.05 ? Math.sign(u) : 0;
    const resist = sgn * (s.rollResist + SURF[1] + s.drag * u * u);

    // ---- wheel loads. Fore-aft: the load moves with the (smoothed) acceleration. Side to side: in a
    // corner the outside wheels carry more; the split between the axles (roll stiffness) is a balance
    // tool: more of it at the front = more understeer. A heavily loaded tyre grips proportionally less,
    // so an axle whose load is shared unevenly grips less in total.
    const L = s.wheelbase, a = this.a, b = this.b, m = s.mass;
    const N0f = m * G * b / L, N0r = m * G * a / L;
    // downforce (a fast car's body presses it onto the road, growing with the square of speed)
    const DF = (s.downforce || 0) * u * u, dfF = s.downforceFront ?? 0.4;
    const Nf = Math.max(500, N0f - m * this.ax * s.cgHeight / L + DF * dfF);
    const Nr = Math.max(500, N0r + m * this.ax * s.cgHeight / L + DF * (1 - dfF));
    const dLat = m * this.ay * s.cgHeight / s.track;                 // total sideways load transfer, N
    const tf = dLat * s.rollFront, tr = dLat * (1 - s.rollFront);
    const wheelGrip = (N, N0) => Math.max(0, N) * (1 - s.loadSens * (Math.max(0, N) / N0 - 1));
    const NfL = Nf / 2 - tf, NfR = Nf / 2 + tf, NrL = Nr / 2 - tr, NrR = Nr / 2 + tr;     // (left accel: load to the right)
    const Df = s.mu * SURF[0] * (wheelGrip(NfL, N0f / 2) + wheelGrip(NfR, N0f / 2));
    const Dr = s.muRear * SURF[0] * (wheelGrip(NrL, N0r / 2) + wheelGrip(NrR, N0r / 2));

    // ---- longitudinal demand per axle: drive at the front; brakes split front / rear (ABS keeps them
    // inside the grip); the handbrake locks the rear
    const Fb = brake * s.brakeForce;
    const stopF = Math.abs(u) * m / dt;                       // never more than stops the car this step
    const bF = Math.min(Fb, stopF);
    const rwd = !!s.rwd;                                      // (rear-wheel drive: the Ferrari, the two-wheelers)
    let FxF = (rwd ? 0 : Fdrive) - sgn * bF * s.frontBrake;
    let FxR = (rwd ? Fdrive : 0) - sgn * bF * (1 - s.frontBrake);
    const FxF0 = FxF, FxR0 = FxR;
    // traction control / ABS keep the front just inside its grip. Without them the wheels spin up or
    // lock, and a sliding tyre only has its sliding friction, mostly used up along the road
    const spinF = !rwd && !this.aids.tcs && Fdrive !== 0 && Math.abs(FxF) > Df;
    const lockF = !this.aids.abs && brake > 0 && Math.abs(FxF) > Df && !spinF;
    if (spinF || lockF) FxF = Math.sign(FxF) * s.muSlide * Df;
    else FxF = Math.max(-s.absFront * Df, Math.min(s.absFront * Df, FxF));   // wheelspin / ABS: capped at the grip
    const capR = this.aids.abs ? s.absRear : 0.98;
    const spinR = rwd && !this.aids.tcs && Fdrive > 0 && FxR > Dr;    // power oversteer: the rears spin up and let go
    if (spinR) FxR = s.muSlide * Dr;
    else FxR = Math.max(-capR * Dr, Math.min((rwd && Fdrive > 0 ? s.absFront : capR) * Dr, FxR));             // brake proportioning keeps the rear turning
    // rear-wheel drive with traction control: the power is held back so the rear tyres keep some grip for
    // holding the car in a corner (what they're holding now, plus a reserve), not all of it used to push
    if (rwd && Fdrive > 0 && this.aids.tcs && !spinR) {
      const lat = Math.min(0.94, Math.abs(this.tel.Fyr || 0) / Math.max(1, Dr) + (this.aids.tcsReserve ?? 0.3));
      FxR = Math.min(FxR, Dr * Math.sqrt(1 - lat * lat));
    }
    const locked = input.handbrake && Math.abs(u) > 0.8;

    // ---- slip angles. A tyre needs to roll a little way (its relaxation length) before its sideways
    // force builds, which softens turn-in and takes the edge off sudden inputs.
    const au = Math.max(Math.abs(u), s.lowSpeedSlip);
    const vF = v + a * this.r, vR = v - b * this.r;
    const afNow = Math.atan2(vF, au) - d * Math.sign(u || 1);
    const arNow = Math.atan2(vR, au);
    const relax = Math.min(1, (Math.hypot(u, v) * dt) / s.relaxLength);
    this.aF += (afNow - this.aF) * relax;
    this.aR += (arNow - this.aR) * relax;
    const af = this.aF, ar = this.aR;
    // sideways force: the magic-formula curve of the grip left over after driving / braking
    let Fyf = -magic(af, s) * Math.sqrt(Math.max(0, Df * Df - FxF * FxF));
    if (lockF) { const sp = Math.hypot(u, vF) || 1; Fyf = -s.muSlide * Df * vF / sp * 0.6; }   // locked fronts don't steer
    let Fyr;
    if (locked) {
      // locked rear wheels slide: friction opposes the contact patch's motion
      const sp = Math.hypot(u, vR) || 1;
      const mk = s.muSlide * SURF[0] * Nr;
      FxR = -mk * u / sp;
      Fyr = -mk * vR / sp;
    } else {
      Fyr = -magic(ar, s, s.peakSlipRear, s.shapeRear) * Math.sqrt(Math.max(0, Dr * Dr - FxR * FxR));
    }
    // at walking pace the car simply rolls (blended in below): sideways tyre forces fade out, or the
    // big slip angles of a slow, fully locked car would brake it to a halt
    const kRoll = Math.min(1, Math.max(0, (Math.abs(u) - s.rollBlend[0]) / s.rollBlend[1]));
    const FyfE = Fyf * kRoll, FyrE = Fyr * (locked ? 1 : kRoll);
    const slideF = Math.min(1, Math.abs(af) / (s.peakSlip * 1.4)), slideR = locked ? 1 : Math.min(1, Math.abs(ar) / (s.peakSlip * 1.4));
    const spin = spinF || lockF || spinR ? 1 : Math.abs(Fdrive) > 0.9 * (rwd ? Dr : Df) ? 0.8 : 0;
    const sp6 = Math.min(1, Math.abs(u) / 6);
    this.slip = Math.min(1, Math.max(slideF, slideR, spin) * sp6);
    this.slipF = Math.max(slideF, spin) * sp6;            // per axle, for skid marks
    this.slipR = slideR * sp6;
    this.drift = Math.atan2(v, Math.max(Math.abs(u), 0.1)) * (Math.abs(u) > 3 ? 1 : 0);   // body slip angle

    // ---- stability aid: if the car rotates faster than the steering asks for (the tail coming round),
    // a correcting yaw moment, as stability control does by braking single wheels. It stands aside
    // while the handbrake is held (so drifts can start) and fades back in after.
    const rMax = 0.92 * s.mu * SURF[0] * G / Math.max(Math.abs(u), 3);            // the most the grip allows
    const rRef = Math.max(-rMax, Math.min(rMax, u * Math.tan(d) / (L * (1 + s.understeerK * u * u))));
    const over = (Math.sign(this.r) !== Math.sign(rRef) && Math.abs(this.r) > 0.1) || Math.abs(this.r) > Math.abs(rRef) + 0.05;
    const escOn = over && Math.abs(u) > 5 && Math.abs(this.drift) > s.escSlide;
    const Mesc = escOn ? -s.escGain * s.inertia * (this.r - rRef) * aidK * this.aids.esc : 0;

    // telemetry for the debug overlay and the test harness (forces in N, angles in rad, per axle)
    const T = this.tel;
    T.af = af; T.ar = ar; T.Nf = Nf; T.Nr = Nr; T.Df = Df; T.Dr = Dr; T.N = [NfL, NfR, NrL, NrR];
    T.FxF = FxF; T.FxR = FxR; T.Fyf = Fyf * kRoll; T.Fyr = Fyr * (locked ? 1 : kRoll);
    T.steer = d; T.assist = u >= 0 ? assist : 0; T.locked = locked; T.surface = this.surface;
    T.abs = brake > 0 && (Math.abs(FxF0) > Math.abs(FxF) + 1 || Math.abs(FxR0) > Math.abs(FxR) + 1);
    T.tcs = Fdrive !== 0 && (Math.abs(FxF0) > Math.abs(FxF) + 1 || (rwd && FxR0 > FxR + 1));
    T.esc = escOn && aidK > 0.5 && this.aids.esc > 0;
    T.spin = spinF; T.lockF = lockF;
    T.useF = Math.hypot(FxF, Fyf) / Math.max(1, Df); T.useR = locked ? 1 : Math.hypot(FxR, Fyr) / Math.max(1, Dr);

    // ---- integrate (semi-implicit Euler); the steered front force acts along the wheel's heading
    const cd = Math.cos(d), sd = Math.sin(d);
    const Fu = FxF * cd - FyfE * sd + FxR - resist;
    const Fv = FxF * sd + FyfE * cd + FyrE;
    const Mz = a * (FxF * sd + FyfE * cd) - b * FyrE + Mesc * kRoll;
    const du = Fu / m + v * this.r;
    const dv = Fv / m - u * this.r;
    u += du * dt; v += dv * dt; this.r += (Mz / s.inertia) * dt;
    if (sgn !== 0 && Math.sign(u) !== sgn && drive === 0) u = 0;     // brakes stop the car, don't reverse it
    if (sgn === 0 && drive === 0 && !locked) u *= 0.9;
    // walking pace: blend to plain rolling (no slip), which is stable for parking and creeping
    const k = kRoll;
    // (rolling without slip turns the car about its rear axle, so the centre moves sideways at b * r)
    const rKin = u * Math.tan(d) / L, vKin = b * rKin;
    this.r = rKin + (this.r - rKin) * k;
    v = vKin + (v - vKin) * k;
    // true accelerations of the body (what the driver feels): forces over mass
    this.axT = Fu / m; this.ayT = Fv / m * k + (u * this.r) * (1 - k);
    this.ax = this.ax + (this.axT - this.ax) * Math.min(1, dt * s.accelFilter);
    this.ay = this.ay + (this.ayT - this.ay) * Math.min(1, dt * s.accelFilter);
    // ---- the body on its springs: roll and pitch from the accelerations, with damping
    const rollAcc = (m * this.ayT * s.rollArm - s.rollStiff * this.roll - s.rollDamp * this.rollRate) / s.rollInertia;
    this.rollRate += rollAcc * dt; this.roll += this.rollRate * dt;
    const pitchAcc = (-m * this.axT * s.pitchArm - s.pitchStiff * this.pitch - s.pitchDamp * this.pitchRate) / s.pitchInertia;
    this.pitchRate += pitchAcc * dt; this.pitch += this.pitchRate * dt;

    this.yaw += this.r * dt;
    const [nfx, nfz] = this.forward, [nlx, nlz] = this.left;
    this.vx = nfx * u + nlx * v;
    this.vz = nfz * u + nlz * v;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // the wheels: locked rear ones stop (the visuals use the front's spin for all, so this is the front)
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
