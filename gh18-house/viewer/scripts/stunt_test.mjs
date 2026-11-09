// The stunt park's vertical physics (src/play/airborne.js) with each vehicle's own physics, offline: into a ramp's
// side and back out, across the rollers, off the big launch ramp, and a few hundred random rides round the pad
// (with a rider's way out of a wall: back up, turn, go). Fails on a NaN, a flight over 3 s, or a ride left stuck.
//   node scripts/stunt_test.mjs
import { VehicleSim } from '../src/play/vehicle.js';
import { AID_LEVELS, steerLimit, rampKeySteer } from '../src/play/input.js';
import { FLEET } from '../src/play/vehicles.js';
import { airStep } from '../src/play/airborne.js';
import { heightAt, inPad, STUNT } from '../src/play/stuntpark.js';
import { groundHeight, surfaceAt } from '../src/play/beach.js';

const DT = 1 / 240, N0 = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const ground = (x, z) => heightAt(x, z) ?? groundHeight(x, z);
let rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
let fails = 0;
const fail = (m) => { fails++; console.log('  FAIL', m); };

function make(id, x, z, yawDeg, kmh) {
  const f = FLEET.find((q) => q.id === id), s = new VehicleSim(f.spec);
  s.aids = AID_LEVELS.assisted; s.reset(x, z, yawDeg * Math.PI / 180);
  s.vx = Math.sin(s.yaw) * kmh / 3.6; s.vz = Math.cos(s.yaw) * kmh / 3.6;
  return { id, sim: s, air: null, jumps: [], crashes: 0, maxAir: 0, maxVy: 0 };
}
function step(v, inp) {
  const s = v.sim, st = (v.st ||= { steer: 0 });
  const steer = rampKeySteer(st, inp.key || 0, s.speed, DT, Math.min(1, steerLimit(s.speed, s.s)));
  s.step(DT, { ...N0, ...inp, steer }, null, (x, z) => (v.air?.flying ? 'air' : inPad(x, z) ? 'road' : surfaceAt(x, z)));
  airStep(v, DT, { ground, launchAt: inPad, onLand: (q, A) => q.jumps.push({ t: A.t, d: Math.hypot(q.sim.x - A.x0, q.sim.z - A.z0) }), onCrash: (q) => q.crashes++ });
  if (v.air) { if (v.air.flying) v.maxAir = Math.max(v.maxAir, v.air.t); v.maxVy = Math.max(v.maxVy, v.air.vy); }
  if (![s.x, s.z, s.vx, s.vz, v.air?.y].every(Number.isFinite)) throw new Error('NaN');
}
const run = (v, secs, inp) => { for (let t = 0; t < secs; t += DT) step(v, typeof inp === 'function' ? inp(t, v) : inp); };
// riding with intent `inp`, and a rider's way out when it stops against something: back up, turn (walking a
// two-wheeler round; a car backing on full lock), go
function escapeRide(v, secs, inp0, change) {
  let inp = inp0, slow = 0, escape = 0, stuckFor = 0;
  for (let t = 0; t < secs; t += DT) {
    if (change && Math.abs(t % 0.7) < DT) inp = change();
    if (Math.abs(v.sim.speed) < 0.4 && inp.throttle && !escape) slow += DT; else slow = 0;
    if (slow > 1) { escape = 3.6; slow = 0; }
    let use = inp;
    if (escape > 0) { escape -= DT; use = escape > 2.2 ? { brake: 1 } : escape > 1.0 ? (v.sim.s.pivot ? { key: 1 } : { brake: 1, key: 1 }) : { throttle: 0.7, key: 1 }; }
    step(v, use);
    stuckFor = Math.abs(v.sim.speed) < 0.3 ? stuckFor + DT : 0;
  }
  return stuckFor;
}
const hold = (kmh, extra = {}) => (t, v) => ({ throttle: v.sim.speed * 3.6 < kmh ? 1 : 0.1, ...extra });

for (const id of ['vespa', 'bicycle', 'roma']) {
  console.log(`== ${id}`);
  // A: straight into the landing ramp's side (1.5 m), then on: a rider's way out (back up, turn, go)
  {
    const v = make(id, 216, -5.3, 0, 18);
    run(v, 1.5, { throttle: 1 });
    const hit = v.crashes;
    escapeRide(v, 6, { throttle: 1, key: 0 });
    console.log(`  into the side: ${hit} crash(es), then ${(v.sim.speed * 3.6).toFixed(0)} km/h, ${Math.abs(v.sim.z + 4).toFixed(1)} m from it`);
    if (!hit) fail('no crash into the side'); if (Math.abs(v.sim.speed) < 1.2) fail('stuck at the side');
  }
  // A2: along a ramp's side, steering a little into it (scraping along): it keeps going
  {
    const v = make(id, 213.5, 8.95, 90, 20);
    run(v, 3, (t, q) => ({ throttle: q.sim.speed * 3.6 < 20 ? 1 : 0.2, key: -0.35 }));
    console.log(`  scraping along the tabletop's side: ${(v.sim.speed * 3.6).toFixed(0)} km/h after 3 s, ${v.crashes} touch(es)`);
    if (Math.abs(v.sim.speed) * 3.6 < 4) fail('slowed to a stop scraping along a side');
  }
  // B: across the rollers at an angle, and onto the kicker from its side edge
  {
    const v = make(id, 200, 3.4, 60, id === 'bicycle' ? 20 : 35);
    run(v, 3, hold(id === 'bicycle' ? 20 : 35));
    console.log(`  rollers at an angle: longest flight ${v.maxAir.toFixed(2)} s, highest climb rate ${v.maxVy.toFixed(1)} m/s`);
    if (v.maxAir > 1.2) fail('a long flight off the rollers');
    const k = make(id, 197.8, 8.0, 0, 15);
    run(k, 2, hold(15));
    console.log(`  onto the kicker from its side: longest flight ${k.maxAir.toFixed(2)} s, climb ${k.maxVy.toFixed(1)} m/s`);
    if (k.maxAir > 0.6) fail('launched by climbing the kicker\'s side');
  }
  // C: the big gap
  {
    const v = make(id, 176, -1, 90, 0), target = { vespa: 45, bicycle: 28, roma: 60 }[id];
    run(v, 12, hold(target));
    const j = v.jumps.sort((a, b) => b.d - a.d)[0];
    console.log(`  the big gap at ${target} km/h: ${j ? `${j.d.toFixed(1)} m, ${j.t.toFixed(2)} s` : 'no jump'}`);
    if (!j) fail('no jump off the launch ramp');
  }
  // D: random rides round the pad
  {
    let stuck = 0, longest = 0, runs = 150;
    for (let r = 0; r < runs; r++) {
      const v = make(id, STUNT.x0 + 2 + rnd() * (STUNT.x1 - STUNT.x0 - 4), STUNT.z0 + 1 + rnd() * (STUNT.z1 - STUNT.z0 - 2), rnd() * 360, rnd() * 40);
      const stuckFor = escapeRide(v, 10, { throttle: 1, key: 0 }, () => ({ throttle: rnd() < 0.8 ? 1 : 0, key: [-1, 0, 0, 1][Math.floor(rnd() * 4)] }));
      longest = Math.max(longest, v.maxAir);
      if (stuckFor > 3.5) { stuck++; if (process.env.DEBUG && stuck <= 6) { const x = v.sim.x, z = v.sim.z; console.log('    stuck at', x.toFixed(1), z.toFixed(1), 'yaw', (v.sim.yaw * 57.3 % 360).toFixed(0), 'h', ground(x, z).toFixed(2), 'y', v.air.y.toFixed(2), 'fly', v.air.flying, 'surf', inPad(x, z) ? 'pad' : surfaceAt(x, z), 'crashes', v.crashes, 'u', v.sim.speed.toFixed(2), 'rev', v.sim.reversing); } }
    }
    console.log(`  ${runs} random rides: longest flight ${longest.toFixed(2)} s, left stuck ${stuck}`);
    if (longest > 3) fail('a flight over 3 s'); if (stuck > runs * 0.03) fail('rides left stuck');
  }
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exitCode = fails ? 1 : 0;
