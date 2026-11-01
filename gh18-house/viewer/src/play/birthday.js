// "Happy Birthday" on a soft piano, synthesised with Web Audio (the melody is in the public domain).
// Each note is a few slightly inharmonic partials with a quick attack and a long, darkening decay;
// the left hand plays the chords; a short generated reverb gives it a room.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MIDI = { C3: 48, F3: 53, G3: 55, B2: 47, E3: 52, A3: 57, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79 };

// [note, beats] in 3/4; a beat is a crotchet
const MELODY = [
  ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
  ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
  ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
  ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3],
];
// chords: [beat from the start, notes, beats held]
const CHORDS = [
  [1, ['C3', 'E3', 'G3'], 3], [4, ['B2', 'F3', 'G3'], 3], [7, ['B2', 'F3', 'G3'], 3], [10, ['C3', 'E3', 'G3'], 3],
  [13, ['C3', 'E3', 'G3'], 3], [16, ['F3', 'A3', 'C4'], 3], [20, ['C3', 'E3', 'G3'], 2], [22, ['B2', 'F3', 'G3'], 1], [23, ['C3', 'E3', 'G3'], 3],
];

function reverb(ctx, seconds = 2.2) {
  const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function piano(ctx, out, freq, t, dur, vel) {
  const partials = [1, 0.5, 0.28, 0.16, 0.08, 0.05];
  const decay = Math.max(0.9, 3.2 - Math.log2(freq / 130) * 0.7);
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, freq * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 2.2), t + decay);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.25);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vel * 0.05), t + decay);
  const end = t + Math.min(decay, dur + 0.5);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.18);
  g.connect(lp).connect(out);
  partials.forEach((a, i) => {
    const n = i + 1, o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * n * Math.sqrt(1 + 0.0004 * n * n);
    const pg = ctx.createGain(); pg.gain.value = a;
    o.connect(pg).connect(g);
    o.start(t); o.stop(end + 0.6);
  });
}

// plays once; returns the length in seconds. `dest` is where the sound goes (e.g. the car audio master).
export function playBirthday(ctx, dest, { tempo = 92 } = {}) {
  const beat = 60 / tempo, t0 = ctx.currentTime + 0.35;
  const out = ctx.createGain(); out.gain.value = 0.55;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  const rv = reverb(ctx);
  out.connect(dest); out.connect(rv).connect(wet).connect(dest);
  let b = 0;
  for (const [n, len] of MELODY) {
    // a little rubato: linger on the long notes at the ends of the lines
    piano(ctx, out, NOTE(MIDI[n]), t0 + b * beat, len * beat * 0.95, len >= 2 ? 0.34 : 0.3);
    b += len;
  }
  for (const [at, notes, len] of CHORDS) for (const n of notes) piano(ctx, out, NOTE(MIDI[n]), t0 + at * beat, len * beat, 0.11);
  return b * beat + 2.5;
}
