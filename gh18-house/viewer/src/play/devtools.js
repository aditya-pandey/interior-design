import * as THREE from 'three';

// Driving dev tools for /play/ (phase 1 of the driving work):
//   F3  debug overlay: speed, gear, rpm, pedals and steering, slip angles, axle loads, grip used
//       (friction circles), g-forces, slide angle, which aids are acting, surface; force arrows at the
//       wheels (green: what the tyre is doing; red when it's sliding)
//   F4  record: start / stop. Stopping saves a .json of every input at every physics step (plus the
//       start state and the surfaces driven on), to send back as "this felt wrong"; replay it in the
//       game with F6, or headless with `node scripts/drive_harness.mjs --replay <file>`.
//   F6  replay the last recording (or drop a recording file on the page)
// None of this changes how the car drives.

export function createDevTools({ sim, car, scene, state, onReplayStart }) {
  // ---- overlay
  const box = document.createElement('div');
  box.id = 'devhud';
  box.hidden = true;
  box.innerHTML = '<pre></pre><canvas width="220" height="110"></canvas>';
  Object.assign(box.style, {
    position: 'fixed', left: '12px', top: '104px', zIndex: 40, background: 'rgba(12,12,14,0.78)', color: '#e8f1ea', padding: '10px 12px',
    borderRadius: '10px', font: '12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace', pointerEvents: 'none', whiteSpace: 'pre',
  });
  document.body.appendChild(box);
  const pre = box.querySelector('pre'), cv = box.querySelector('canvas'), g = cv.getContext('2d');
  pre.style.margin = '0 0 6px';

  // force arrows at each wheel
  const arrows = car.wheels.map((w) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x47d16c, 0.18, 0.12);
    a.visible = false;
    a.line.material.depthTest = false; a.cone.material.depthTest = false;
    a.renderOrder = 50;
    car.root.add(a);
    return { a, w };
  });

  const bar = (v, n = 10) => { const k = Math.round(Math.max(0, Math.min(1, v)) * n); return '█'.repeat(k) + '·'.repeat(n - k); };
  const sbar = (v, n = 10) => { const k = Math.round(Math.max(-1, Math.min(1, v)) * n); return (k < 0 ? '·'.repeat(n + k) + '█'.repeat(-k) : '·'.repeat(n)) + '|' + (k > 0 ? '█'.repeat(k) + '·'.repeat(n - k) : '·'.repeat(n)); };
  const D = (r) => (r * 180 / Math.PI).toFixed(1).padStart(6);
  let lastInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  function circle(cx, cy, r, use, label, sliding) {
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    g.fillStyle = sliding ? '#ff5a4f' : '#47d16c';
    g.beginPath(); g.arc(cx + use[0] * r, cy - use[1] * r, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#cfd8d2'; g.font = '11px ui-monospace, monospace'; g.fillText(label, cx - r, cy + r + 12);
  }

  function drawOverlay() {
    const t = sim.tel, s = sim.s;
    if (!t.Nf) return;
    const kmh = sim.speed * 3.6, g9 = 9.81;
    const aids = [t.abs && "ABS", t.tcs && "TRACTION", t.esc && "STABILITY", Math.abs(t.assist) > 0.01 && `COUNTER-STEER ${D(t.assist).trim()}°`, t.locked && 'HANDBRAKE LOCK'].filter(Boolean).join('  ') || '—';
    pre.textContent =
      `${kmh.toFixed(0).padStart(4)} km/h   gear ${sim.reversing ? 'R' : sim.gear}   ${Math.round(sim.rpm)} rpm   ${t.surface}${rec ? '   ● REC ' + (recSteps * 1 / 240).toFixed(1) + ' s' : ''}${replay ? '   ▶ REPLAY' : ''}\n` +
      `throttle ${bar(lastInput.throttle)}  brake ${bar(lastInput.brake)}\n` +
      `steer in ${sbar(-lastInput.steer, 6)}  wheels ${D(t.steer)}°\n` +
      `slip angle  front ${D(t.af)}°  rear ${D(t.ar)}°   (peak ${D(s.peakSlip)}° / ${D(s.peakSlipRear)}°)\n` +
      `slide angle ${D(sim.drift)}°   yaw ${D(sim.r)}°/s\n` +
      `g  lateral ${(sim.ayT / g9).toFixed(2).padStart(5)}  long ${(sim.axT / g9).toFixed(2).padStart(5)}   roll ${D(sim.roll)}°  pitch ${D(sim.pitch)}°\n` +
      `load  front ${Math.round(t.Nf)} N  rear ${Math.round(t.Nr)} N\n` +
      `grip used  front ${(t.useF * 100).toFixed(0).padStart(3)} %  rear ${(t.useR * 100).toFixed(0).padStart(3)} %\n` +
      `aids  ${aids}`;
    g.clearRect(0, 0, cv.width, cv.height);
    // friction circles: x = sideways force / grip, y = drive (+) or braking (-) / grip
    circle(55, 50, 40, [t.Fyf / Math.max(1, t.Df), t.FxF / Math.max(1, t.Df)], 'front', Math.abs(t.af) > s.peakSlip);
    circle(165, 50, 40, [t.Fyr / Math.max(1, t.Dr), t.FxR / Math.max(1, t.Dr)], 'rear', t.locked || Math.abs(t.ar) > s.peakSlipRear);
  }

  const v = new THREE.Vector3();
  function drawArrows() {
    const t = sim.tel;
    for (const { a, w } of arrows) {
      const front = w.front;
      const Fx = (front ? t.FxF : t.FxR) / 2, Fy = (front ? t.Fyf : t.Fyr) / 2, D0 = (front ? t.Df : t.Dr) / 2;
      // in the car's frame: +Z forward, +X left; the front force turns with the wheel
      const ang = front ? t.steer : 0;
      const fz = Fx * Math.cos(ang) - Fy * Math.sin(ang), fx = Fx * Math.sin(ang) + Fy * Math.cos(ang);
      const len = Math.hypot(fx, fz);
      a.visible = len > 30;
      if (!a.visible) continue;
      v.set(fx, 0, fz).normalize();
      a.position.set(w.rest.x, w.rest.y + 0.45, w.rest.z);
      a.setDirection(v);
      a.setLength(0.25 + 1.4 * Math.min(1.2, len / Math.max(1, D0)), 0.18, 0.12);
      const sliding = front ? Math.abs(t.af) > sim.s.peakSlip : t.locked || Math.abs(t.ar) > sim.s.peakSlipRear;
      a.setColor(sliding ? 0xff5a4f : 0x47d16c);
    }
  }

  // ---- recording and replay (inputs at physics-step resolution, so a replay is exact)
  let rec = null, recSteps = 0, replay = null, lastRec = null;
  const same = (a, b) => a && a.throttle === b.throttle && a.brake === b.brake && a.steer === b.steer && !!a.handbrake === !!b.handbrake;

  function startRecording() {
    rec = { version: 1, dt: 1 / 240, when: new Date().toISOString(), time: state.time, start: { x: sim.x, z: sim.z, yaw: sim.yaw, vx: sim.vx, vz: sim.vz, r: sim.r, gear: sim.gear }, inputs: [], surfaces: [], steps: 0, prev: null, prevSurf: null };
    recSteps = 0;
  }
  function stopRecording() {
    const r = rec; rec = null;
    r.steps = recSteps;
    delete r.prev; delete r.prevSurf;
    r.surfaceDefault = r.surfaces[0]?.[1] || 'road';
    lastRec = r;
    const blob = new Blob([JSON.stringify(r)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `baleno_run_${r.when.replace(/[:.]/g, '-').slice(0, 19)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    return r;
  }
  function startReplay(r) {
    if (!r) return false;
    replay = { r, k: 0, i: 0, input: { throttle: 0, brake: 0, steer: 0, handbrake: false } };
    sim.reset(r.start.x, r.start.z, r.start.yaw);
    sim.vx = r.start.vx; sim.vz = r.start.vz; sim.r = r.start.r || 0; sim.gear = r.start.gear || 1;
    onReplayStart?.(r);
    return true;
  }
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f || !/\.json$/i.test(f.name)) return;
    e.preventDefault();
    try { const r = JSON.parse(await f.text()); if (r.inputs && r.start) { lastRec = r; startReplay(r); } } catch { /* not a recording */ }
  });

  return {
    get recording() { return !!rec; },
    get replaying() { return !!replay; },
    toggleOverlay() {
      box.hidden = !box.hidden;
      for (const { a } of arrows) a.visible = false;
      return !box.hidden;
    },
    toggleRecord() { if (rec) return stopRecording(); startRecording(); return null; },
    replayLast() { return startReplay(lastRec); },
    replay: startReplay,
    // called for every physics step: returns the input to use (the replay's, or the player's)
    stepInput(input) {
      let inp = input;
      if (replay) {
        const { r } = replay;
        while (replay.k < r.inputs.length && r.inputs[replay.k][0] === replay.i) {
          const [, th, br, st, hb] = r.inputs[replay.k++];
          replay.input = { throttle: th, brake: br, steer: st, handbrake: !!hb };
        }
        inp = replay.input;
        if (++replay.i >= r.steps) replay = null;
      }
      if (rec) {
        if (!same(rec.prev, inp)) { rec.inputs.push([recSteps, +inp.throttle.toFixed(3), +inp.brake.toFixed(3), +inp.steer.toFixed(4), inp.handbrake ? 1 : 0]); rec.prev = { ...inp }; }
        if (sim.surface !== rec.prevSurf) { rec.surfaces.push([recSteps, sim.surface]); rec.prevSurf = sim.surface; }
        recSteps++;
      }
      lastInput = inp;
      return inp;
    },
    frame() {
      if (box.hidden) return;
      drawOverlay();
      drawArrows();
    },
    // test hook: record `steps` of a scripted input, return the recording
    _lastRecording: () => lastRec,
  };
}
