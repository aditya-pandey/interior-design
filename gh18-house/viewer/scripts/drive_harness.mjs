// Headless driving test bench for /play/'s car (src/play/vehicle.js is pure maths, so it runs in Node).
// Runs a fixed set of manoeuvres, prints each measurement against its target, and saves the results.
//
//   node scripts/drive_harness.mjs                 run, print, save scripts/drive_results/latest.json
//   node scripts/drive_harness.mjs --save baseline also save as baseline.json (the reference)
//   node scripts/drive_harness.mjs --compare       show the change from baseline.json
//   node scripts/drive_harness.mjs --sim <file>    test another vehicle.js (e.g. an older version)
//   node scripts/drive_harness.mjs --replay <rec>  replay a recording made in the game (F4) and
//                                                  print what the car did (CSV with --csv)
// Exit code 1 if any measurement misses its target (so it can gate a commit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const simFile = opt('--sim') ? path.resolve(opt('--sim')) : path.join(here, '../src/play/vehicle.js');
const { VehicleSim } = await import(pathToFileURL(simFile).href);
const { steerLimit, rampKeySteer, AID_LEVELS } = await import(pathToFileURL(path.join(here, '../src/play/input.js')).href);
const DT = 1 / 240, N = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const deg = (r) => (r * 180) / Math.PI, kmh = (s) => s.speed * 3.6;
const mk = (v0 = 0, surface = 'road') => { const s = new VehicleSim(); s.vz = v0 / 3.6; s._surf = () => surface; return s; };
const step = (s, inp) => { s.step(DT, { ...N, ...inp }, null, s._surf); if (![s.x, s.z, s.yaw, s.r, s.vx, s.vz].every(Number.isFinite)) throw new Error('NaN in the simulation'); };
const run = (s, secs, inp, each) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { step(s, typeof inp === 'function' ? inp(i * DT, s) : inp); each?.(i * DT, s); } };
// hold a speed with the pedals (simple P controller) while doing something else
const hold = (v, extra = {}) => (t, s) => { const e = v / 3.6 - s.speed; return { throttle: Math.max(0, Math.min(1, e * 1.5)), brake: Math.max(0, Math.min(1, -e * 0.8)), ...extra }; };

function keyCorner(v) {
  const s = mk(v), st = { steer: 0 }; let mx = 0;
  run(s, 4, (t, q) => ({ ...hold(v)(t, q), steer: rampKeySteer(st, 1, q.speed, DT, Math.min(1, steerLimit(q.speed, q.s))) }), (t, q) => { mx = Math.max(mx, Math.abs(q.drift)); });
  return { slide: deg(mx), g: Math.abs(s.ayT ?? s.ay) / 9.81 };
}
// [id, what it means, unit, [min, max], function -> value]
const TESTS = [
  ['accel_0_100', '0–100 km/h, full throttle', 's', [11, 12], () => { const s = mk(); let t = 0; while (kmh(s) < 100 && t < 40) { step(s, { throttle: 1 }); t += DT; } return t; }],
  ['top_speed', 'speed after 60 s flat out', 'km/h', [165, 182], () => { const s = mk(); run(s, 60, { throttle: 1 }); return kmh(s); }],
  ['brake_100_0', 'braking distance 100–0 km/h', 'm', [38, 45], () => { const s = mk(100); const x0 = s.z; let t = 0; while (s.speed > 0.05 && t < 20) { step(s, { brake: 1 }); t += DT; } return Math.hypot(s.x, s.z - x0); }],
  ['skidpad_g', 'steady cornering grip at 60 km/h, full lock', 'g', [0.85, 0.95], () => { const s = mk(60); run(s, 6, hold(60, { steer: 1 })); return Math.abs(s.ay) / 9.81; }],
  ['turn_in', 'step steer at 60 km/h: time to 63 % of the final yaw rate', 's', [0.15, 0.25], () => {
    const s = mk(60); run(s, 1, hold(60)); const rs = []; run(s, 3, hold(60, { steer: 0.5 }), (t, q) => rs.push([t, Math.abs(q.r)]));
    const fin = rs[rs.length - 1][1]; return rs.find(([, r]) => r >= 0.632 * fin)[0];
  }],
  ['yaw_overshoot', 'step steer at 60 km/h: yaw-rate overshoot', '%', [0, 12], () => {
    const s = mk(60); run(s, 1, hold(60)); let mx = 0; run(s, 3, hold(60, { steer: 0.5 }), (t, q) => { mx = Math.max(mx, Math.abs(q.r)); });
    return (mx / Math.abs(s.r) - 1) * 100;
  }],
  ['slalom_drift', 'slalom at 100 km/h (0.6 Hz, ±0.6): biggest slide angle', '°', [0, 10], () => {
    const s = mk(100); let mx = 0; run(s, 6, (t) => ({ throttle: 0.5, steer: 0.6 * Math.sin(t * 2 * Math.PI * 0.6) }), (t, q) => { mx = Math.max(mx, Math.abs(q.drift)); }); return deg(mx);
  }],
  ['liftoff_tighten', 'lift off mid-corner at 80 km/h: yaw rate after / before', '×', [1.0, 1.3], () => {
    const s = mk(80); run(s, 3, hold(80, { steer: 0.6 })); const r0 = Math.abs(s.r); run(s, 0.6, { steer: 0.6 }); return Math.abs(s.r) / r0;
  }],
  ['liftoff_drift', 'lift off mid-corner at 80 km/h: biggest slide angle', '°', [0, 12], () => {
    const s = mk(80); run(s, 3, hold(80, { steer: 0.6 })); let mx = 0; run(s, 1.5, { steer: 0.6 }, (t, q) => { mx = Math.max(mx, Math.abs(q.drift)); }); return deg(mx);
  }],
  ['trailbrake_drift', 'brake hard mid-corner at 80 km/h: biggest slide angle', '°', [0, 15], () => {
    const s = mk(80); run(s, 2, hold(80, { steer: 0.6 })); let mx = 0; run(s, 2, { steer: 0.6, brake: 0.8 }, (t, q) => { mx = Math.max(mx, Math.abs(q.drift)); }); return deg(mx);
  }],
  ['handbrake_turn', 'handbrake turn from 60 km/h (steer + handbrake 1 s): rotation', '°', [60, 120], () => {
    const s = mk(60); run(s, 0.25, { steer: 1 }); const y0 = s.yaw; run(s, 1, { steer: 1, handbrake: true }); return deg(Math.abs(s.yaw - y0));
  }],
  ['handbrake_recover', 'flick the tail out at 70 km/h (handbrake 0.5 s), then straighten up with 60 % throttle: time until it grips again (slide < 3°; NaN = it spun out)', 's', [0.3, 2], () => {
    const s = mk(70); run(s, 0.25, { steer: 1 }); run(s, 0.5, { steer: 1, handbrake: true }); let t = 0;
    while (t < 6) { step(s, { throttle: 0.6 }); t += DT; if (Math.abs(s.drift) < 3 / 57.3 && Math.abs(s.r) < 0.3) break; }
    return kmh(s) < 12 ? NaN : t;                     // (too slow to tell: counts as a miss)
  }],
  ['turning_circle', 'turning circle, kerb to kerb (outer front wheel radius)', 'm', [4.6, 5.2], () => {
    const s = mk(); run(s, 1, { throttle: 0.2 }); run(s, 6, (t, q) => ({ steer: 1, throttle: q.speed < 1.5 ? 0.2 : 0, brake: q.speed > 2 ? 0.2 : 0 }));
    const L = s.s.wheelbase, d = Math.abs(s.steer); return L / Math.sin(d) + (s.s.track || 1.52) / 2;
  }],
  ['body_roll', 'body roll in the skidpad corner', '°', [2, 4.5], () => { const s = mk(60); run(s, 6, hold(60, { steer: 1 })); return s.roll != null ? deg(Math.abs(s.roll)) : deg(Math.abs(s.ay) * 0.011); }],
  ['brake_dive', 'nose dive braking from 100 km/h', '°', [1, 3], () => { const s = mk(100); let mx = 0; run(s, 1.5, { brake: 1 }, (t, q) => { mx = Math.max(mx, q.pitch != null ? Math.abs(q.pitch) : Math.abs(q.ax) * 0.01); }); return deg(mx); }],
  ['sand_0_50', '0–50 km/h on sand', 's', [5, 12], () => { const s = mk(0, 'sand'); let t = 0; while (kmh(s) < 50 && t < 30) { step(s, { throttle: 1 }); t += DT; } return t; }],
  ['sand_grip', 'cornering grip on sand at 40 km/h, full lock', 'g', [0.5, 0.75], () => { const s = mk(40, 'sand'); run(s, 6, hold(40, { steer: 1 })); return Math.abs(s.ay) / 9.81; }],
  // keyboard driving (input.js): holding a steering key carves the corner at the limit instead of scrubbing
  ['key_corner_100_slide', 'keyboard: hold left at 100 km/h for 4 s (Assisted): biggest slide angle', '°', [0, 5], () => keyCorner(100).slide],
  ['key_corner_100_g', 'keyboard: hold left at 100 km/h: sideways grip used', 'g', [0.7, 0.95], () => keyCorner(100).g],
  ['key_corner_60_g', 'keyboard: hold left at 60 km/h: sideways grip used', 'g', [0.75, 0.95], () => keyCorner(60).g],
  ['aidsoff_flick', 'aids off: the handbrake flick at 70 km/h, the driver counter-steering: time to grip again (NaN = spun out)', 's', [0.3, 4], () => {
    const s = mk(70); s.aids = AID_LEVELS.off; run(s, 0.25, { steer: 1 }); run(s, 0.5, { steer: 1, handbrake: true }); let t = 0;
    while (t < 6) { step(s, { throttle: 0.6, steer: Math.max(-1, Math.min(1, s.drift * 3)) });  /* the driver counter-steers */ t += DT; if (Math.abs(s.drift) < 3 / 57.3 && Math.abs(s.r) < 0.3) break; }
    return kmh(s) < 12 ? NaN : t;
  }],
  ['standstill_creep', 'parked, no input, 10 s: how far it creeps', 'm', [0, 0.01], () => { const s = mk(); run(s, 10, {}); return Math.hypot(s.x, s.z); }],
  ['physics_cost', 'physics time per 60 fps frame (4 steps)', 'ms', [0, 1], () => {
    const s = mk(80); const t0 = performance.now(); run(s, 10, (t) => ({ throttle: 0.5, steer: Math.sin(t) })); return (performance.now() - t0) / (10 * 60);
  }],
];

if (opt('--replay')) {
  const rec = JSON.parse(fs.readFileSync(opt('--replay'), 'utf8'));
  const s = new VehicleSim(); s.reset(rec.start.x, rec.start.z, rec.start.yaw); s.vx = rec.start.vx || 0; s.vz = rec.start.vz || 0;
  s.r = rec.start.r || 0; s.gear = rec.start.gear || 1;
  let inp = { ...N }, k = 0, si = 0, surf = rec.surfaceDefault || 'road'; const rows = [];
  for (let i = 0; i < rec.steps; i++) {
    while (k < rec.inputs.length && rec.inputs[k][0] === i) { const [, th, br, st, hb] = rec.inputs[k++]; inp = { throttle: th, brake: br, steer: st, handbrake: !!hb }; }
    while (si < (rec.surfaces || []).length && rec.surfaces[si][0] <= i) surf = rec.surfaces[si++][1];
    s.step(rec.dt || DT, inp, null, () => surf);
    if (i % 24 === 0) rows.push([i * (rec.dt || DT), kmh(s), deg(s.drift), s.ay / 9.81, s.ax / 9.81, s.gear, inp.throttle, inp.brake, inp.steer, +inp.handbrake]);
  }
  if (opt('--csv')) { console.log('t,kmh,slide_deg,lat_g,long_g,gear,throttle,brake,steer,handbrake'); for (const r of rows) console.log(r.map((v) => +v.toFixed(3)).join(',')); }
  const max = (j) => Math.max(...rows.map((r) => Math.abs(r[j])));
  console.log(`replayed ${(rec.steps * (rec.dt || DT)).toFixed(1)} s: top ${max(1).toFixed(0)} km/h, biggest slide ${max(2).toFixed(1)}°, peak lateral ${max(3).toFixed(2)} g, peak braking ${max(4).toFixed(2)} g`);
  console.log(`ends at x ${s.x.toFixed(2)}, z ${s.z.toFixed(2)}, heading ${deg(s.yaw).toFixed(1)}° (a headless replay has the surfaces but no walls or trees)`);
  process.exit(0);
}

const results = {}; let fails = 0;
const base = opt('--compare') ? JSON.parse(fs.readFileSync(path.join(here, 'drive_results', typeof opt('--compare') === 'string' ? opt('--compare') : 'baseline.json'), 'utf8')) : null;
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('test', 18) + pad('value', 13) + pad('target', 17) + (base ? pad('was', 10) : '') + 'what');
for (const [id, what, unit, [lo, hi], fn] of TESTS) {
  let v;
  try { v = fn(); } catch (e) { v = NaN; }
  const ok = Number.isFinite(v) && v >= lo && v <= hi;
  if (!ok && id !== 'physics_cost') fails++;
  results[id] = { value: +v.toFixed(3), unit, target: [lo, hi], ok, what };
  const was = base?.results?.[id]?.value;
  console.log(pad(id, 18) + pad(`${Number.isFinite(v) ? v.toFixed(2) : 'NaN'} ${unit}`, 13) + pad(`${lo}–${hi} ${unit}`, 17) + (base ? pad(was == null ? '—' : was.toFixed(2), 10) : '') + (ok ? '  ok  ' : ' MISS ') + what);
}
console.log(`\n${TESTS.length - fails}/${TESTS.length} on target`);
const out = { when: new Date().toISOString(), sim: path.relative(path.join(here, '..'), simFile), results };
fs.writeFileSync(path.join(here, 'drive_results', 'latest.json'), JSON.stringify(out, null, 1));
if (opt('--save')) fs.writeFileSync(path.join(here, 'drive_results', `${typeof opt('--save') === 'string' ? opt('--save') : 'baseline'}.json`), JSON.stringify(out, null, 1));
process.exitCode = fails ? 1 : 0;
