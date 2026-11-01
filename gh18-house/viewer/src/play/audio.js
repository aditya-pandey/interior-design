// Car sounds, synthesised with Web Audio (no recordings, so nothing to license):
// - engine: a 4-cylinder firing note (rpm / 30 Hz) from two detuned oscillators and filtered noise,
//   brighter and louder with throttle
// - tyre squeal: band-passed noise that follows the tyre slip
// - horn: the two-tone note of a small Indian hatchback
// - bumps: a low thud for speed breakers and knocks.
// Browsers only allow audio after a user gesture, so start() is called from the "Start" button.

export class CarAudio {
  constructor() { this.ctx = null; this.on = true; }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.9 : 0;
    this.master.connect(ctx.destination);

    // engine
    const eng = ctx.createGain(); eng.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 2.5;
    lp.connect(eng); eng.connect(this.master);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'triangle';
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const g3 = ctx.createGain(); g3.gain.value = 0.35;
    o1.connect(g1).connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp);
    for (const o of [o1, o2, o3]) o.start();
    const rumble = this.noise(); const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 160;
    const rg = ctx.createGain(); rg.gain.value = 0.25;
    rumble.connect(rf).connect(rg).connect(lp);
    this.engine = { eng, lp, o1, o2, o3 };

    // tyres
    const sq = this.noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sq.connect(bp).connect(sg).connect(this.master);
    this.squeal = sg;

    // horn
    const hg = ctx.createGain(); hg.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 900; hf.Q.value = 0.8;
    hf.connect(hg); hg.connect(this.master);
    for (const f of [415, 498]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    this.horn = hg;
  }

  noise() {
    const ctx = this.ctx, len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
    return src;
  }

  setOn(on) {
    this.on = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    if (this.ctx && on && this.ctx.state === 'suspended') this.ctx.resume();
  }

  update(rpm, throttle, slip, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.engine;
    const f = rpm / 30;                                   // firing frequency of a 4-cylinder 4-stroke
    e.o1.frequency.setTargetAtTime(f, t, 0.03);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    e.o3.frequency.setTargetAtTime(f * 1.01, t, 0.03);
    e.lp.frequency.setTargetAtTime(260 + throttle * 900 + rpm * 0.12, t, 0.05);
    e.eng.gain.setTargetAtTime(0.10 + throttle * 0.10 + Math.min(rpm / 6000, 1) * 0.06, t, 0.06);
    this.squeal.gain.setTargetAtTime(slip > 0.55 && speed > 4 ? (slip - 0.55) * 0.5 : 0, t, 0.05);
  }

  hornOn(on) {
    if (!this.ctx) return;
    this.horn.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.012);
  }

  thud(strength) {
    if (!this.ctx || strength < 0.05) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.6, strength), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
  }
}
