// A vehicle's height (the physics in vehicle.js is flat): one step of it, run after each 240 Hz physics step.
//
// On the ground it follows the surface, and remembers how fast it's climbing; that rate can't be more than a ramp
// could give it at its speed (a step up off a ramp's low edge, a kerb, is climbed but launches nothing). Where the
// surface drops away faster than it would fall (a ramp's lip, a roller's crest) it flies: no grip, gravity, the
// speed it had; it lands where the surface comes back up to it. A step up of more than 30 cm (a ramp's side or tall
// end) is a crash: put back where it was and bounced off. A flight can't last more than 5 s (it's put down).
//
//   airStep(v, dt, { ground(x, z), launchAt(x, z) (where launches can happen), onLand(v, A, h), onCrash(v, A) })
//   v: { sim, air }; v.air: { y, vy, flying, t, x0, z0, y0, top, sx, sz }

const G = 9.81, WALL = 0.3, KERB = 0.05, MAX_SLOPE = 0.85;

export function airStep(v, dt, { ground, launchAt, onLand, onCrash }) {
  const s = v.sim, h = ground(s.x, s.z);
  let A = v.air;
  if (!A || !Number.isFinite(A.y) || Math.hypot(s.x - A.sx, s.z - A.sz) > 2) A = v.air = { y: h, vy: 0, flying: false, sx: s.x, sz: s.z };   // (placed somewhere new)
  const speed = Math.abs(s.speed);
  if (!A.flying) {
    const dh = h - A.y;
    if (dh > WALL) { crash(v, A, ground); onCrash?.(v, A); return; }
    const yPred = A.y + A.vy * dt - 0.5 * G * dt * dt;
    if ((!launchAt || launchAt(s.x, s.z)) && A.vy > 0.8 && h < yPred - 0.01 && speed > 3) {
      Object.assign(A, { flying: true, y: yPred, t: 0, x0: s.x, z0: s.z, y0: yPred, top: yPred });
      A.vy -= G * dt;
    } else {
      // climbing: the rate the surface lifts it, no faster than a ramp's slope at this speed; a kerb lifts it, that's all
      A.vy = dh > KERB ? 0 : Math.max(-6, Math.min(dh / dt, speed * MAX_SLOPE + 0.3));
      A.y = h;
    }
  } else {
    A.t += dt; A.vy -= G * dt; A.y += A.vy * dt; A.top = Math.max(A.top, A.y);
    if (A.t > 5) { A.flying = false; A.y = h; A.vy = 0; }
    else if (A.y <= h) {
      if (h - A.y > WALL) { crash(v, A, ground); onCrash?.(v, A); return; }   // (came down into a ramp's face, not onto it)
      const vy = A.vy;
      A.flying = false; A.y = h; A.vy = 0;
      onLand?.(v, A, h, -vy);
    }
  }
  A.sx = s.x; A.sz = s.z;
}

// put back where it was last, and slid along what it hit: the speed into it taken off (a little bounce), the speed
// along it kept (most of it). Which way the obstacle faces comes from the surface's slope round the spot it hit
function crash(v, A, ground) {
  const s = v.sim, hx = s.x, hz = s.z, sp = Math.hypot(s.vx, s.vz), e = 0.25;
  let nx = ground(hx - e, hz) - ground(hx + e, hz), nz = ground(hx, hz - e) - ground(hx, hz + e);     // (downhill: away from it)
  const n = Math.hypot(nx, nz);
  s.x = s.px = A.sx; s.z = s.pz = A.sz;
  if (n > 0.05) {
    nx /= n; nz /= n;
    s.x += nx * 0.03; s.z += nz * 0.03; s.px = s.x; s.pz = s.z;          // (off its edge: not grazing it again next step)
    const vn = s.vx * nx + s.vz * nz;
    if (vn < 0) { s.vx -= 1.25 * vn * nx; s.vz -= 1.25 * vn * nz; }
    if (vn < -0.8) { s.vx *= 0.85; s.vz *= 0.85; }                      // (a real knock costs speed; a graze doesn't)
    // pushing its nose into it: the nose is turned along it, a little each time (as a wall it scrapes along does)
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), fn = fx * nx + fz * nz;
    if (fn < -0.05) {
      let tx = fx - fn * nx, tz = fz - fn * nz;
      if (Math.hypot(tx, tz) < 0.05) { tx = -nz; tz = nx; }                       // (square on: either way along it)
      let d = Math.atan2(tx, tz) - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += Math.max(-0.035, Math.min(0.035, d)); s.pyaw = s.yaw;
    }
    s.impact = Math.max(s.impact || 0, Math.max(0, -vn));
  } else { s.vx *= -0.25; s.vz *= -0.25; s.impact = Math.max(s.impact || 0, sp); }
  A.flying = false; A.vy = 0; A.y = ground(s.x, s.z);
}
