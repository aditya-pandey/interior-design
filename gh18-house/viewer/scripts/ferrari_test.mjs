// The Ferrari at speed (src/play/vehicles.js 'roma'): cornering on the throttle, a quick lane change, lifting
// off mid-corner, at 120 / 160 / 200 km/h with keyboard steering, for each driving-aids level.
// Prints the largest body slide (degrees) and whether it spun (slide over 35°). node scripts/ferrari_test.mjs
import { VehicleSim } from '../src/play/vehicle.js';
import { steerLimit, rampKeySteer, AID_LEVELS } from '../src/play/input.js';
import { FLEET } from '../src/play/vehicles.js';
const spec = FLEET.find((f) => f.id === (process.argv[2] || 'roma')).spec, DT = 1 / 240, deg = (r) => r * 180 / Math.PI;
const N = { throttle: 0, brake: 0, steer: 0, handbrake: false };
function run(level, v0, plan) {
  const s = new VehicleSim(spec); s.aids = AID_LEVELS[level]; s.vz = v0 / 3.6; s.gear = spec.gears.length;
  for (let i = 0; i < 600; i++) { const e = v0 / 3.6 - s.speed; s.step(DT, { ...N, throttle: Math.max(0, Math.min(1, e * 2)) }, null, () => 'road'); }   // settle in gear
  const st = { steer: 0 }; let mx = 0, minV = Infinity, g = 0;
  for (let t = 0; t < plan.T; t += DT) {
    const p = plan.at(t), lim = Math.min(1, steerLimit(s.speed, s.s) * AID_LEVELS[level].keyLimit);
    const inp = { ...N, throttle: p.throttle ?? 0, brake: p.brake ?? 0, steer: rampKeySteer(st, p.key ?? 0, s.speed, DT, lim) };
    s.step(DT, inp, null, () => 'road');
    mx = Math.max(mx, Math.abs(s.drift)); g = Math.max(g, Math.abs(s.ayT ?? s.ay) / 9.81); minV = Math.min(minV, s.speed);
    if (![s.x, s.z, s.r].every(Number.isFinite)) return { slide: 999 };
  }
  return { slide: +deg(mx).toFixed(1), g: +g.toFixed(2), kmh: Math.round(s.speed * 3.6) };
}
const PLANS = {
  'corner on throttle': { T: 3, at: (t) => ({ throttle: 1, key: t < 2.5 ? 1 : 0 }) },
  'lane change': { T: 3, at: (t) => ({ throttle: 1, key: t < 0.5 ? 1 : t < 1.1 ? -1 : 0 }) },
  'lift mid-corner': { T: 3, at: (t) => ({ throttle: t < 1 ? 1 : 0, key: t < 2.5 ? 1 : 0 }) },
  'brake mid-corner': { T: 3, at: (t) => ({ throttle: t < 1 ? 1 : 0, brake: t > 1 && t < 2 ? 1 : 0, key: t < 2.5 ? 1 : 0 }) },
};
let bad = 0;
for (const level of ['assisted', 'sport', 'off']) for (const [name, plan] of Object.entries(PLANS)) {
  const row = [120, 160, 200].map((v) => { const r = run(level, v, plan); if (r.slide > 35 && level !== 'off') bad++; return `${v}: ${r.slide > 35 ? 'SPUN ' : ''}${r.slide}° ${r.g}g`.padEnd(20); });
  console.log(level.padEnd(9), name.padEnd(19), row.join('   '));
}
process.exitCode = bad ? 1 : 0;
