// The film's built-in score: a quiet piano piece over strings, synthesised here (no samples, nothing downloaded).
// D major, 72 BPM. It follows the film: a soft opening under the title, the piano's arpeggios through the house,
// low strings joining for the drive along the coast, bells at dusk in the studio, the tune over her photographs,
// and a long resolve on the last title. (Her own song can replace it: --music song.mp3.)
import { writeFileSync } from 'node:fs';

const SR = 48000;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export function writeScore(file, total, shots) {
  const N = Math.ceil((total + 0.5) * SR), L = new Float32Array(N), R = new Float32Array(N);
  const at = (name, k = 0) => { const s = shots.find((x) => x.name === name); return s ? s.t0 + k * s.dur : 0; };
  const BEAT = 60 / 72, BAR = 4 * BEAT;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // a piano-like note: slightly stretched partials, each dying away faster the higher it is; a soft hammer
  function piano(t, m, vel, dur = 3.2, pan = 0) {
    const f = hz(m), i0 = Math.round(t * SR), len = Math.min(N - i0, Math.round((dur + 1.4) * SR));
    if (len <= 0 || i0 < 0) return;
    const B = 0.00035, parts = [];
    for (let n = 1; n <= 9; n++) { const fn = f * n * Math.sqrt(1 + B * n * n); if (fn > 12000) break; parts.push([2 * Math.PI * fn / SR, (1 / n ** 1.15) * (n === 1 ? 1 : 0.7 + 0.3 * vel), 0.55 + n * 0.45 + f / 900, rnd() * 6.28]); }
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4), rel = Math.round(dur * SR);
    for (let i = 0; i < len; i++) {
      const tt = i / SR; let v = 0;
      for (const [w, a, d, ph] of parts) v += a * Math.exp(-d * tt) * Math.sin(w * i + ph);
      const att = Math.min(1, tt / 0.004), off = i > rel ? Math.exp(-(i - rel) / (0.25 * SR)) : 1;
      v *= vel * 0.16 * att * off;
      L[i0 + i] += v * gl; R[i0 + i] += v * gr;
    }
  }
  // strings / pad: detuned sines with a few soft partials, slow swell in and out
  function pad(t, dur, ms, vel, bright = 0.3) {
    const i0 = Math.max(0, Math.round(t * SR)), len = Math.min(N - i0, Math.round((dur + 2.5) * SR)), A = 1.6 * SR, Rl = 2.5 * SR, D = dur * SR;
    for (const m of ms) for (const det of [-0.06, 0.07]) {
      const f = hz(m + det), pan = det > 0 ? 0.35 : -0.35, gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4), ph = rnd() * 6.28;
      const w = 2 * Math.PI * f / SR;
      for (let i = 0; i < len; i++) {
        const env = Math.min(1, i / A) * (i > D ? Math.max(0, 1 - (i - D) / Rl) : 1);
        if (env <= 0) continue;
        const vib = 1 + 0.0012 * Math.sin(2 * Math.PI * 5.1 * i / SR + ph);
        const x = w * i * vib + ph;
        const v = (Math.sin(x) + bright * 0.35 * Math.sin(2 * x) + bright * 0.15 * Math.sin(3 * x)) * env * vel * 0.03;
        L[i0 + i] += v * gl; R[i0 + i] += v * gr;
      }
    }
  }
  // a small bell (celesta-ish): two inharmonic partials
  function bell(t, m, vel) {
    const f = hz(m), i0 = Math.round(t * SR), len = Math.min(N - i0, 3 * SR), pan = rnd() * 1.2 - 0.6;
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < len; i++) {
      const tt = i / SR, v = vel * 0.05 * Math.min(1, tt / 0.002) * (Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 1.6) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * tt) * Math.exp(-tt * 4));
      L[i0 + i] += v * gl; R[i0 + i] += v * gr;
    }
  }

  // the harmony: D  A/C#  Bm  G  |  G  D/F#  Em7  A(sus)
  const PROG = [
    { bass: 38, pad: [57, 62, 66], arp: [62, 66, 69, 74] },
    { bass: 37, pad: [57, 61, 64], arp: [61, 64, 69, 73] },
    { bass: 35, pad: [54, 59, 62], arp: [59, 62, 66, 71] },
    { bass: 31, pad: [55, 59, 62], arp: [59, 62, 67, 71] },
    { bass: 31, pad: [55, 59, 64], arp: [59, 62, 67, 74] },
    { bass: 30, pad: [57, 62, 66], arp: [62, 66, 69, 74] },
    { bass: 28, pad: [55, 59, 62], arp: [59, 62, 66, 67] },
    { bass: 33, pad: [57, 62, 64], arp: [61, 64, 69, 76] },
  ];
  // sections (seconds): from the shot list
  const S = { title: 0, house: at('coast', 0.4), plans: at('plan_gf'), drive: at('drive'), studio: at('studio_ext', 0.5), photos: at('photos'), finale: at('finale'), end: total };
  const level = (t) => (t < S.house ? 0.75 : t < S.drive ? 0.9 : t < S.studio ? 1.05 : t < S.photos ? 0.8 : t < S.finale ? 0.95 : 0.85);

  // the tune (over the photographs, and its echo at the end): scale degrees in D, [beat offset, midi, beats]
  const TUNE = [[0, 78, 1.5], [1.5, 76, 0.5], [2, 74, 2], [4, 73, 1.5], [5.5, 74, 0.5], [6, 76, 2], [8, 74, 1.5], [9.5, 71, 0.5], [10, 69, 2],
    [12, 71, 1], [13, 74, 1], [14, 79, 2], [16, 78, 1.5], [17.5, 76, 0.5], [18, 74, 2], [20, 76, 1.5], [21.5, 74, 0.5], [22, 73, 1], [23, 76, 1], [24, 74, 4]];

  const lastBar = Math.floor((S.finale + 2) / BAR);
  for (let b = 0; b * BAR < S.finale + 2; b++) {
    const t = b * BAR + 0.4, c = PROG[b % 8], lv = level(t);
    pad(t, BAR + 0.3, t < S.house ? c.pad : [c.bass + 24, ...c.pad], 0.9 * lv, t > S.drive && t < S.studio ? 0.6 : 0.3);
    if (t >= S.drive && t < S.studio + BAR) pad(t, BAR + 0.2, [c.bass + 12], 1.3 * lv, 0.5);                  // low strings for the drive
    // the piano
    if (t < S.house) { piano(t + BEAT * 0, c.arp[0], 0.45 * lv, 3.5, -0.2); piano(t + BEAT * 2, c.arp[2], 0.38 * lv, 3, 0.2); if (b % 2) piano(t + BEAT * 3, c.arp[3], 0.3 * lv, 2.5, 0.3); continue; }
    piano(t, c.bass + 12, 0.5 * lv, BAR, -0.1);
    const pattern = t > S.drive && t < S.studio ? [0, 1, 2, 3, 2, 1, 2, 3] : [0, 1, 2, 3, 2, 1];
    const step = BAR / (pattern.length === 8 ? 8 : 6) * (pattern.length === 8 ? 1 : 1);
    pattern.forEach((k, j) => piano(t + j * step, c.arp[k], (0.34 - 0.03 * (j % 2)) * lv * (t > S.photos && t < S.finale ? 0.7 : 1), 2.2, -0.3 + 0.2 * k));
    if (t > S.studio && t < S.photos && b % 2 === 0) bell(t + BEAT * 2.5, c.arp[3] + 12, 0.7);              // dusk in the studio
    if (b === lastBar) break;
  }
  const tune = (t0, vel) => { for (const [o, m, d] of TUNE) piano(t0 + o * BEAT, m, vel, d * BEAT + 0.6, 0.1); };
  const photoBar = Math.ceil((S.photos + 0.4 - 0.4) / BAR) * BAR + 0.4;
  if (photoBar + 24 * BEAT < S.finale + 4) tune(photoBar, 0.62);
  // the finale: back home on D, a long held chord and the tune's last phrase high and quiet
  const fin = Math.ceil((S.finale + 1.5 - 0.4) / BAR) * BAR + 0.4;
  pad(fin, Math.max(4, total - fin - 2), [38, 50, 57, 62, 66, 69], 0.95, 0.35);
  piano(fin, 38, 0.6, 6); piano(fin, 50, 0.5, 6); piano(fin + BEAT, 62, 0.4, 5); piano(fin + 2 * BEAT, 66, 0.4, 5); piano(fin + 3 * BEAT, 69, 0.38, 5);
  const last = [[0, 78, 1.5], [1.5, 76, 0.5], [2, 74, 2], [4, 81, 1], [5, 78, 3]];
  for (const [o, m, d] of last) piano(fin + BAR + o * BEAT, m + 12, 0.32, d * BEAT + 1.5, 0.2);
  bell(fin + 2 * BAR + 3 * BEAT, 86, 0.6);

  // a room: a stereo Freeverb (8 combs, 4 allpasses a side), mixed under the dry sound
  const reverb = (x, spread) => {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ b: new Float32Array(d + spread), i: 0, s: 0 }));
    const alls = [556, 441, 341, 225].map((d) => ({ b: new Float32Array(d + spread), i: 0 }));
    const out = new Float32Array(x.length), fb = 0.86, damp = 0.3;
    for (let n = 0; n < x.length; n++) {
      const inp = x[n] * 0.015; let y = 0;
      for (const c of combs) { const o = c.b[c.i]; c.s = o * (1 - damp) + c.s * damp; c.b[c.i] = inp + c.s * fb; if (++c.i >= c.b.length) c.i = 0; y += o; }
      for (const a of alls) { const o = a.b[a.i]; a.b[a.i] = y + o * 0.5; if (++a.i >= a.b.length) a.i = 0; y = o - y; }
      out[n] = y;
    }
    return out;
  };
  const wl = reverb(L, 0), wr = reverb(R, 23);
  let peak = 0;
  for (let n = 0; n < N; n++) { L[n] = L[n] * 0.8 + wl[n] * 1.0; R[n] = R[n] * 0.8 + wr[n] * 1.0; peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n])); }
  // master: to -1.5 dBFS through a gentle soft clip, a fade at each end
  const g = 0.84 / (peak || 1), buf = Buffer.alloc(44 + N * 4);
  const fadeIn = 0.8 * SR, fadeOut = 4 * SR;
  for (let n = 0; n < N; n++) {
    const f = Math.min(1, n / fadeIn, (N - n) / fadeOut);
    buf.writeInt16LE(Math.round(Math.tanh(L[n] * g * 1.1) / Math.tanh(1.1) * f * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[n] * g * 1.1) / Math.tanh(1.1) * f * 32767), 46 + n * 4);
  }
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  writeFileSync(file, buf);
}

// node score.mjs out.wav [seconds]: the score alone (a rough shot list), to listen to
if (process.argv[1] && process.argv[1].endsWith('score.mjs')) {
  const total = +(process.argv[3] || 176), names = ['title', 'coast', 'entrance', 'lobby', 'living', 'plan_gf', 'plan_ff', 'plan_sf', 'plan_roof', 'master', 'garden', 'drive', 'studio_ext', 'lounge', 'gallery', 'library', 'poems', 'court', 'photos', 'finale'];
  const durs = [12, 12, 9, 8, 10, 6.5, 6.5, 6.5, 5.5, 8, 9, 16, 11, 10, 9, 9, 10, 9, 15, 13];
  let t = 0; const shots = names.map((name, i) => { const s = { name, t0: t, dur: durs[i] }; t += durs[i] - 1; return s; });
  writeScore(process.argv[2] || 'score.wav', total, shots);
}
