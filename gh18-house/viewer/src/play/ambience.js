// The sounds of the coast (world step 5), synthesised with Web Audio (no recordings, nothing to license):
//   - waves: each shore wave you see breaking is heard breaking at the same moment (the timing is the
//     sea shader's own formula, shorewave.js), from where it breaks: a crash, then the hiss of the wash
//     running up the sand; plus a low surf bed. Louder close to the water, panned left / right.
//   - wind: a soft breeze in gusts, and the dry rustle of palm fronds when you're near palms
//   - birds: little chirps and whistles at dawn and in the morning, gulls over the water, the odd crow;
//     quieter at midday, a few at golden hour, none at night
//   - crickets after dark, mostly inland and in the dune grass
//   - footsteps that match what's underfoot: dry sand, wet sand, timber deck, the studio's oak floor,
//     the house's stone and tile, the road
// Indoors and inside the car the outside sounds are quieter / muffled.

import { coastDist } from './beach.js';

const SW_K = (2 * Math.PI) / 24, SW_W = (2 * Math.PI) / 8.5;
// (the same as swPhase / swAmp in shorewave.js)
const swPhase = (s, t, x, z) => SW_K * s + SW_W * t + 0.6 * Math.sin(x * 0.031 + z * 0.022 + t * 0.05) + 0.25 * Math.sin(-x * 0.09 + z * 0.07);
const swSet = (t, x, z) => 0.75 + 0.25 * Math.sin(t * 0.11 + x * 0.004 + z * 0.003);

function noiseBuffer(ctx, seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return buf;
}
const env = (g, t, a, peak, d, floor = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(floor, t + a + d); };

// ---- one-shot sounds: (ctx, destination, start time, options). Exported so they can be tested offline.
export const SFX = {
  // a wave breaking: the crash, the thump under it, then the swash hissing up the sand
  wave(ctx, dest, t, { gain = 0.5, buf } = {}) {
    const src = ctx.createBufferSource(); src.buffer = buf || noiseBuffer(ctx, 5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.35); lp.frequency.exponentialRampToValueAtTime(500, t + 2.6);
    const g = ctx.createGain(); env(g, t, 0.32, gain, 2.8);
    src.connect(lp).connect(g).connect(dest);
    const thump = ctx.createBufferSource(); thump.buffer = src.buffer;
    const tl = ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 160;
    const tg = ctx.createGain(); env(tg, t + 0.15, 0.06, gain * 1.6, 0.9);
    thump.connect(tl).connect(tg).connect(dest);
    const fizz = ctx.createBufferSource(); fizz.buffer = src.buffer;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const fg = ctx.createGain(); env(fg, t + 1.4, 0.9, gain * 0.35, 2.4);
    fizz.connect(hp).connect(fg).connect(dest);
    src.start(t); src.stop(t + 3.4); thump.start(t, 0.7); thump.stop(t + 1.2); fizz.start(t + 1.4, 1.3); fizz.stop(t + 4.8);
  },
  // a small bird: a quick run of rising chirps
  chirp(ctx, dest, t, { gain = 0.06, base = 3200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4) } = {}) {
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + i * (0.09 + Math.random() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base * 0.8, t0); o.frequency.exponentialRampToValueAtTime(base * 1.25, t0 + 0.035); o.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.07);
      env(g, t0, 0.008, gain, 0.07);
      o.connect(g).connect(dest); o.start(t0); o.stop(t0 + 0.1);
    }
  },
  // a myna-like whistle: two notes sliding
  whistle(ctx, dest, t, { gain = 0.05 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = 1800 + Math.random() * 900;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18); o.frequency.setValueAtTime(f * 0.9, t + 0.26); o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.42);
    env(g, t, 0.03, gain, 0.45);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.5);
  },
  // a gull over the water: a falling, nasal cry, twice or three times
  gull(ctx, dest, t, { gain = 0.045 } = {}) {
    const k = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < k; i++) {
      const t0 = t + i * 0.42, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 3;
      o.frequency.setValueAtTime(1350, t0); o.frequency.exponentialRampToValueAtTime(820, t0 + 0.32);
      env(g, t0, 0.04, gain, 0.32);
      o.connect(bp).connect(g).connect(dest); o.start(t0); o.stop(t0 + 0.4);
    }
  },
  // a crow: a harsh "caw"
  crow(ctx, dest, t, { gain = 0.05 } = {}) {
    for (let i = 0; i < 2; i++) {
      const t0 = t + i * 0.45, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
      o.frequency.setValueAtTime(520, t0); o.frequency.linearRampToValueAtTime(430, t0 + 0.3);
      env(g, t0, 0.03, gain, 0.3);
      o.connect(bp).connect(g).connect(dest); o.start(t0); o.stop(t0 + 0.36);
    }
  },
  // a footstep on: 'sand' | 'wet' | 'wood' | 'tile' | 'road'
  step(ctx, dest, t, { surface = 'sand', gain = 0.12, buf } = {}) {
    const src = ctx.createBufferSource(); src.buffer = buf || noiseBuffer(ctx, 0.3);
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    const P = { sand: ['bandpass', 1100, 0.7, 0.012, 0.11, 1.4], wet: ['bandpass', 520, 0.9, 0.01, 0.13, 1.6], wood: ['bandpass', 1800, 1.2, 0.003, 0.05, 0.7], tile: ['highpass', 2600, 0.7, 0.002, 0.03, 0.6], road: ['bandpass', 2000, 1.0, 0.004, 0.06, 0.8] }[surface] || ['bandpass', 1000, 0.7, 0.01, 0.1, 1];
    f.type = P[0]; f.frequency.value = P[1] * (0.9 + Math.random() * 0.2); f.Q.value = P[2];
    env(g, t, P[3], gain * P[5], P[4]);
    src.connect(f).connect(g).connect(dest); src.start(t, Math.random() * 0.1); src.stop(t + 0.2);
    if (surface === 'wood' || surface === 'tile') {                 // the heel: a short low knock
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(surface === 'wood' ? 150 : 220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
      env(og, t, 0.002, gain * (surface === 'wood' ? 0.9 : 0.4), 0.07);
      o.connect(og).connect(dest); o.start(t); o.stop(t + 0.1);
    }
  },
};

export class Ambience {
  constructor(audio) { this.audio = audio; this.ready = false; this.lastPh = null; this.birdT = 2; this.gullT = 6; }

  init() {
    const ctx = this.audio.ctx;
    if (!ctx || this.ready) return !!ctx;
    this.ready = true;
    this.out = ctx.createGain(); this.out.gain.value = 1;
    this.out.connect(this.audio.outside);                     // muffled with everything else inside the car
    this.pan = ctx.createStereoPanner(); this.waveGain = ctx.createGain();
    this.waveGain.connect(this.pan).connect(this.out);
    this.waveBuf = noiseBuffer(ctx, 5);
    this.stepBuf = noiseBuffer(ctx, 0.3);
    // the surf bed: brown noise, low, slowly breathing
    const bed = ctx.createBufferSource(); bed.buffer = noiseBuffer(ctx, 4, true); bed.loop = true;
    const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 450;
    this.bed = ctx.createGain(); this.bed.gain.value = 0;
    bed.connect(bl).connect(this.bed).connect(this.out); bed.start();
    // wind and palm rustle
    const wn = ctx.createBufferSource(); wn.buffer = noiseBuffer(ctx, 4); wn.loop = true;
    const wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 650; wb.Q.value = 0.4;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    wn.connect(wb).connect(this.wind).connect(this.out); wn.start();
    const rs = ctx.createBufferSource(); rs.buffer = noiseBuffer(ctx, 4); rs.loop = true;
    const rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 3500;
    this.rustle = ctx.createGain(); this.rustle.gain.value = 0;
    rs.connect(rh).connect(this.rustle).connect(this.out); rs.start();
    // crickets: three voices, each a high tone pulsed fast and chirping a few times a second
    this.crickets = ctx.createGain(); this.crickets.gain.value = 0; this.crickets.connect(this.out);
    for (const [f, rate, pulse] of [[4400, 2.7, 34], [4750, 3.3, 41], [4150, 2.2, 29]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g1 = ctx.createGain(); g1.gain.value = 0;
      const p = ctx.createOscillator(); p.type = 'square'; p.frequency.value = pulse;
      const pg = ctx.createGain(); pg.gain.value = 0.5; p.connect(pg).connect(g1.gain);
      const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = rate;
      const cg = ctx.createGain(); cg.gain.value = 0.5; const g2 = ctx.createGain(); g2.gain.value = 0.5;
      c.connect(cg).connect(g2.gain);
      o.connect(g1).connect(g2).connect(this.crickets);
      o.start(); p.start(); c.start();
    }
    this.birds = ctx.createGain(); this.birds.gain.value = 1; this.birds.connect(this.out);
    this.steps = ctx.createGain(); this.steps.gain.value = 1; this.steps.connect(this.audio.master);
    return true;
  }

  // x, z: the listener; right: unit vector to her right (for panning); t: the sea's clock (s);
  // sunEl: the sun's height (deg); indoors: inside the house or studio; palms: palms within ~15 m
  update(dt, { x, z, rx = 1, rz = 0, t, sunEl, night, indoors, palms = 0 }) {
    if (!this.init()) return;
    const ctx = this.audio.ctx, now = ctx.currentTime;
    const n = [0, 0], sL = coastDist(x, z, n);                   // listener's distance to the waterline (+ = at sea)
    const toShore = Math.max(0, -sL);
    const near = Math.max(0, 1 - toShore / 160);
    const roomK = indoors ? 0.35 : 1;
    // surf bed
    this.bed.gain.setTargetAtTime(0.11 * Math.pow(near, 1.6) * roomK, now, 0.4);
    // the breaking wave in front of her: when its crest passes the break point, schedule a crash
    const bx = x + n[0] * (toShore + 6), bz = z + n[1] * (toShore + 6);
    const ph = swPhase(6, t, bx, bz) + 0.55 - Math.PI / 2;
    const cyc = Math.floor(ph / (2 * Math.PI));
    if (this.lastPh != null && cyc !== this.lastPh && near > 0.02) {
      const d = toShore + 6, g = Math.min(0.75, 0.9 / Math.pow(1 + d / 10, 1.25)) * swSet(t, bx, bz) * roomK;
      SFX.wave(ctx, this.waveGain, now + 0.02, { gain: g, buf: this.waveBuf });
      this.waves = (this.waves || 0) + 1;
    }
    this.lastPh = cyc;
    const pan = n[0] * rx + n[1] * rz;                            // the sea to her right: pan right
    this.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, pan * 0.8)), now, 0.3);
    // wind in gusts; palms rustle
    const gust = 0.55 + 0.45 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1);
    this.wind.gain.setTargetAtTime((0.012 + 0.03 * gust) * (0.5 + 0.5 * near) * roomK, now, 0.6);
    this.rustle.gain.setTargetAtTime(Math.min(1, palms / 3) * 0.02 * gust * roomK, now, 0.4);
    // crickets after dark, inland (and in the grass) rather than at the water's edge
    const inland = Math.min(1, Math.max(0.15, (toShore - 8) / 25));
    this.crickets.gain.setTargetAtTime(Math.max(0, (night - 0.4) / 0.6) * 0.012 * inland * (indoors ? 0.25 : 1), now, 1.2);
    // birds: lots at dawn and in the morning, few at midday, some at golden hour
    const birdy = sunEl < -5 ? 0 : sunEl < 4 ? (sunEl + 5) / 9 : sunEl < 25 ? 1 : sunEl < 45 ? 0.35 : 0.2;
    this.birdT -= dt; this.gullT -= dt;
    if (birdy > 0 && this.birdT <= 0) {
      this.birdT = (1.2 + Math.random() * 4) / Math.max(0.15, birdy);
      const r = Math.random(), at = now + 0.05;
      const dest = this.birdPan(ctx, Math.random() * 1.6 - 0.8);
      if (r < 0.62) SFX.chirp(ctx, dest, at, { gain: 0.035 * roomK });
      else if (r < 0.9) SFX.whistle(ctx, dest, at, { gain: 0.03 * roomK });
      else SFX.crow(ctx, dest, at, { gain: 0.028 * roomK });
    }
    if (sunEl > -3 && near > 0.3 && this.gullT <= 0) {
      this.gullT = 9 + Math.random() * 18;
      SFX.gull(ctx, this.birdPan(ctx, Math.max(-0.8, Math.min(0.8, pan * 0.6 + (Math.random() - 0.5) * 0.6))), now + 0.05, { gain: 0.07 * near * roomK });
    }
  }
  birdPan(ctx, p) { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(this.birds); return s; }

  footstep(surface) {
    if (!this.init()) return;
    SFX.step(this.audio.ctx, this.steps, this.audio.ctx.currentTime + 0.005, { surface, gain: 0.1, buf: this.stepBuf });
  }
}

// test helper: render a one-shot offline and measure it (peak and RMS, 0..1)
export async function measureSfx(name, opts = {}, seconds = 5) {
  const ctx = new OfflineAudioContext(1, 44100 * seconds, 44100);
  SFX[name](ctx, ctx.destination, 0.05, opts);
  const d = (await ctx.startRendering()).getChannelData(0);
  let pk = 0, sum = 0;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += v * v; }
  return { peak: +pk.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
}
