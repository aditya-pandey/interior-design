// Sounds for /play/, synthesised with Web Audio (no recordings, nothing to license):
// - engine: a 1.2 L four-cylinder. Firing note (rpm / 30 Hz) with its half order and harmonics, through
//   soft saturation and a load-dependent filter; intake noise with throttle; a dip at each gear change
// - road: low rumble growing with speed; wind above ~40 km/h; crunch on sand, gravel on dry ground, splash in water
// - tyres (phase 5): a low scrub as they near their grip, a squeal past it (pitch rising with slip), a broad
//   skid when wheels lock (handbrake, braking without ABS)
// - exhaust pops on lifting off at high revs, a faint gearbox whine
// - horn: the two-tone note of a small Indian hatchback
// - bumps: a low thud for knocks
// - the sea: surf that swells and falls, louder near the shore
// Inside the car (driver's view) everything outside is muffled and the engine is quieter.
// Browsers allow audio only after a user gesture, so start() runs from the "Start" button.

export class CarAudio {
  constructor() { this.ctx = null; this.on = true; this.inside = false; this.gear = 1; }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.85 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    // everything except the cabin goes through the "outside" filter, closed down when inside the car
    this.outside = ctx.createBiquadFilter();
    this.outside.type = 'lowpass'; this.outside.frequency.value = 18000;
    this.outside.connect(this.master);

    // ---- engine
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    sat.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 110; body.gain.value = 7; body.Q.value = 0.9;
    const eng = ctx.createGain(); eng.gain.value = 0;
    sat.connect(lp).connect(body).connect(eng).connect(this.outside);
    const osc = (type, gain) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); g.gain.value = gain; o.connect(g).connect(sat); o.start(); return o; };
    this.engine = { eng, lp, o1: osc('sawtooth', 0.42), o2: osc('sawtooth', 0.26), o3: osc('triangle', 0.22), o4: osc('sine', 0.3) };
    const intake = this.noise(); const ib = ctx.createBiquadFilter(); ib.type = 'bandpass'; ib.Q.value = 1.1;
    const ig = ctx.createGain(); ig.gain.value = 0;
    intake.connect(ib).connect(ig).connect(this.outside);
    this.intake = { ib, ig };

    // ---- road, wind, tyres, sand
    const road = this.noise(true); const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 380;
    this.road = ctx.createGain(); this.road.gain.value = 0;
    road.connect(rf).connect(this.road).connect(this.master);
    const wind = this.noise(); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.5;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    wind.connect(wf).connect(this.wind).connect(this.master);
    const sq = this.noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 7;
    const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1750; bp2.Q.value = 9;
    this.squeal = ctx.createGain(); this.squeal.gain.value = 0;
    sq.connect(bp).connect(this.squeal); sq.connect(bp2).connect(this.squeal); this.squeal.connect(this.outside);
    const sand = this.noise(); const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 420; sf.Q.value = 0.8;
    this.sand = ctx.createGain(); this.sand.gain.value = 0;
    sand.connect(sf).connect(this.sand).connect(this.outside);

    // ---- horn
    const hg = ctx.createGain(); hg.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 900; hf.Q.value = 0.8;
    hf.connect(hg); hg.connect(this.master);
    for (const f of [415, 498]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    this.horn = hg;

    // ---- phase 5: scrub, skid, gravel, splash, gearbox whine
    const loop = (brown, type, f, q) => { const n = this.noise(brown); const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; n.connect(b).connect(g).connect(this.outside); return { g, b }; };
    this.scrub = loop(false, 'bandpass', 560, 2.2);
    this.skid = loop(false, 'bandpass', 820, 0.6);
    this.gravel = loop(false, 'bandpass', 2600, 0.9);
    this.splash = loop(true, 'lowpass', 900, 0.7);
    const wo = ctx.createOscillator(); wo.type = 'sine'; this.whine = ctx.createGain(); this.whine.gain.value = 0;
    wo.connect(this.whine).connect(this.outside); wo.start(); this.whineOsc = wo;
    this.prevThrottle = 0;

    // ---- the sea: pink-ish noise, low-passed, with a slow swell
    const surf = this.noise(true); const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 700;
    this.surf = ctx.createGain(); this.surf.gain.value = 0;
    const swell = ctx.createGain(); swell.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; const lg = ctx.createGain(); lg.gain.value = 0.45;
    lfo.connect(lg).connect(swell.gain); lfo.start();
    surf.connect(sl).connect(swell).connect(this.surf).connect(this.outside);
  }

  noise(brown = false) {
    const ctx = this.ctx, len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
    return src;
  }

  setOn(on) {
    this.on = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
    if (this.ctx && on && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // the vehicle's voice (vehicles.js sound): freq × the firing frequency, gain, tone (the filter's brightness),
  // engine: false for the bicycle (then the freewheel's buzz instead), cvt: the revs held up by the belt
  setProfile(p = {}) { this.profile = { freq: 1, gain: 1, tone: 1, engine: true, ...p }; }
  // a bicycle's bell (instead of the horn)
  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, at] of [[2350, 0], [2350, 0.16]]) for (const k of [1, 2.76]) {
      const o = this.ctx.createOscillator(); o.frequency.value = f * k;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(k === 1 ? 0.12 : 0.04, t + at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.9);
      o.connect(g).connect(this.master); o.start(t + at); o.stop(t + at + 1);
    }
  }
  // engineOn: false when she has got out (the car idles quietly, then the engine is switched off)
  update({ rpm, throttle, slip, speed, gear, surface, shoreDist, inside, engineOn = true, tel = {} }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.engine, P = this.profile || { freq: 1, gain: 1, tone: 1, engine: true };
    if (P.engine === false) engineOn = false;
    const f = rpm / 30 * P.freq;
    e.o1.frequency.setTargetAtTime(f, t, 0.025);
    e.o2.frequency.setTargetAtTime(f * 0.5 * 1.004, t, 0.025);
    e.o3.frequency.setTargetAtTime(f * 1.5, t, 0.025);
    e.o4.frequency.setTargetAtTime(f * 0.25, t, 0.025);
    e.lp.frequency.setTargetAtTime((220 + throttle * 1300 + rpm * 0.18) * P.tone, t, 0.05);
    let g = (engineOn ? 0.075 + throttle * 0.085 + Math.min(rpm / 6000, 1) * 0.05 : 0) * P.gain;
    if (gear !== this.gear && !P.cvt) {              // gear change: a short dip
      this.gear = gear;
      e.eng.gain.cancelScheduledValues(t);
      e.eng.gain.setValueAtTime(e.eng.gain.value, t);
      e.eng.gain.linearRampToValueAtTime(g * 0.35, t + 0.06);
    }
    if (inside) g *= 0.7;
    e.eng.gain.setTargetAtTime(g, t + 0.06, 0.07);
    this.intake.ib.frequency.setTargetAtTime(500 + rpm * 0.25, t, 0.05);
    this.intake.ig.gain.setTargetAtTime(engineOn ? throttle * 0.035 * Math.min(1, rpm / 3000) : 0, t, 0.08);
    const v = Math.abs(speed);
    this.road.gain.setTargetAtTime(Math.min(0.16, v * 0.007) * (surface === 'road' ? 1 : 0.6) * (inside ? 1.2 : 1), t, 0.1);
    this.wind.gain.setTargetAtTime(Math.max(0, v - 11) ** 2 * 0.00022 * (inside ? 0.45 : 1), t, 0.15);
    // tyres: how hard they're working (grip used) and how far past their peak (slip)
    const use = Math.max(tel.useF || 0, tel.useR || 0), onRoad = surface === 'road';
    const locked = tel.locked || tel.lockF;
    this.scrub.g.gain.setTargetAtTime(onRoad && v > 4 && !locked ? Math.max(0, (use - 0.78) / 0.22) * 0.05 : 0, t, 0.06);
    this.squeal.gain.setTargetAtTime(onRoad && slip > 0.5 && v > 4 && !locked ? (slip - 0.5) * 0.45 : 0, t, 0.05);
    this.skid.g.gain.setTargetAtTime(locked && v > 2 ? (onRoad ? 0.13 : 0.06) * Math.min(1, v / 10) : 0, t, 0.04);
    this.gravel.g.gain.setTargetAtTime(surface === 'ground' ? Math.min(0.07, v * 0.006) : 0, t, 0.08);
    this.splash.g.gain.setTargetAtTime(surface === 'water' ? Math.min(0.2, v * 0.03) : 0, t, 0.1);
    // gearbox whine: a faint tone tracking the driveline, louder on the overrun
    this.whineOsc.frequency.setTargetAtTime(Math.max(40, rpm * 0.21), t, 0.05);
    this.whine.gain.setTargetAtTime(engineOn && v > 3 && !P.cvt ? 0.004 + (throttle < 0.05 ? 0.004 : 0) : 0, t, 0.1);
    // a bicycle: the freewheel's buzz while she coasts (the pawls clicking ~24 times a wheel turn), the chain while she pedals
    if (P.freewheel) {
      if (!this.fw) {
        const o = this.ctx.createOscillator(); o.type = 'square'; const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 2.5;
        const g2 = this.ctx.createGain(); g2.gain.value = 0; o.connect(bp).connect(g2).connect(this.outside); o.start(); this.fw = { o, g: g2 };
      }
      this.fw.o.frequency.setTargetAtTime(Math.max(5, v * 11.4), t, 0.05);
      this.fw.g.gain.setTargetAtTime(v > 0.8 && throttle < 0.05 ? 0.012 : 0, t, 0.06);
    } else if (this.fw) this.fw.g.gain.setTargetAtTime(0, t, 0.05);
    // exhaust pops: lifting off sharply at high revs
    if (engineOn && !P.cvt && this.prevThrottle > 0.5 && throttle < 0.05 && rpm > 3600) this.pops(2 + Math.floor(Math.random() * 3));
    this.prevThrottle = throttle;
    this.sand.gain.setTargetAtTime(surface === 'sand' || surface === 'water' ? Math.min(0.12, v * 0.012) : 0, t, 0.08);
    this.surf.gain.setTargetAtTime(Math.max(0, 1 - Math.max(0, shoreDist) / 120) * 0.22, t, 0.3);
    if (inside !== this.inside) {
      this.inside = inside;
      this.outside.frequency.setTargetAtTime(inside ? 1500 : 18000, t, 0.08);
    }
  }

  pops(n) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const t = t0 + 0.08 + i * (0.07 + Math.random() * 0.12);
      const src = ctx.createBufferSource(); src.buffer = this.popBuf ||= (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate), d = b.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (ctx.sampleRate * 0.006)); return b; })();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + Math.random() * 600;
      const g = ctx.createGain(); g.gain.value = 0.18 + Math.random() * 0.12;
      src.connect(f).connect(g).connect(this.outside); src.start(t);
    }
  }

  hornOn(on) {
    if (!this.ctx) return;
    this.horn.gain.setTargetAtTime(on ? 0.15 : 0, this.ctx.currentTime, 0.012);
  }

  thud(strength) {
    if (!this.ctx || strength < 0.05) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.6, strength), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
  }

  // a car door: a short thunk (getting in and out)
  door() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = n.buffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.5;
    n.connect(f).connect(g).connect(this.master); n.start(t);
  }
}
