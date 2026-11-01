// Sounds for /play/, synthesised with Web Audio (no recordings, nothing to license):
// - engine: a 1.2 L four-cylinder. Firing note (rpm / 30 Hz) with its half order and harmonics, through
//   soft saturation and a load-dependent filter; intake noise with throttle; a dip at each gear change
// - road: low rumble growing with speed; wind above ~40 km/h; tyre squeal from slip; crunch on sand
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

  // engineOn: false when she has got out (the car idles quietly, then the engine is switched off)
  update({ rpm, throttle, slip, speed, gear, surface, shoreDist, inside, engineOn = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.engine;
    const f = rpm / 30;
    e.o1.frequency.setTargetAtTime(f, t, 0.025);
    e.o2.frequency.setTargetAtTime(f * 0.5 * 1.004, t, 0.025);
    e.o3.frequency.setTargetAtTime(f * 1.5, t, 0.025);
    e.o4.frequency.setTargetAtTime(f * 0.25, t, 0.025);
    e.lp.frequency.setTargetAtTime(220 + throttle * 1300 + rpm * 0.18, t, 0.05);
    let g = engineOn ? 0.075 + throttle * 0.085 + Math.min(rpm / 6000, 1) * 0.05 : 0;
    if (gear !== this.gear) {                        // gear change: a short dip
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
    this.squeal.gain.setTargetAtTime(slip > 0.55 && v > 4 && surface === 'road' ? (slip - 0.55) * 0.42 : 0, t, 0.05);
    this.sand.gain.setTargetAtTime(surface === 'sand' || surface === 'water' ? Math.min(0.12, v * 0.012) : 0, t, 0.08);
    this.surf.gain.setTargetAtTime(Math.max(0, 1 - Math.max(0, shoreDist) / 120) * 0.22, t, 0.3);
    if (inside !== this.inside) {
      this.inside = inside;
      this.outside.frequency.setTargetAtTime(inside ? 1500 : 18000, t, 0.08);
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
