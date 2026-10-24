// GH-18 film: shot list. World units are metres: X across the plot (North = +X),
// Z from the back lawn to the street (East = +Z), Y up from ground. GF floor +0.45,
// FF +3.75, SF +7.05. Every shot is a whole number of bars of the 96 BPM score
// (1 bar = 2.5 s = 60 frames at 24 fps), so cuts land on the downbeat.
//
// time: 0 = afternoon, ~0.55 = golden hour, 1 = dusk (viewer.cine blends sun, sky and lights)

export const FPS = 24;
export const BAR = 2.5;
export const INTRO_BARS = 2;          // black + title, made in post (no render)

export const SHOTS = [
  {
    id: 's01_aerial', bars: 2, caption: null, time: 0.93, exposure: 1.15, fov: 34,
    keys: [
      { pos: [30, 24, 46], target: [4.7, 3.5, 14] },
      { pos: [20, 11, 37], target: [4.7, 4.5, 16] },
      { pos: [13.5, 3.6, 31], target: [5.0, 4.6, 18.5] },
    ],
  },
  {
    id: 's02_front', bars: 1, caption: 'The curved glass foyer', time: 0.93, exposure: 1.1, fov: 32,
    keys: [{ pos: [-1.0, 3.4, 30.5], target: [3.8, 3.2, 19.5] }, { pos: [7.5, 3.2, 30.0], target: [5.2, 3.0, 19.8] }],
  },
  {
    id: 's03_enter', bars: 1, caption: null, time: 0.93, exposure: 0.62, fov: 58, interior: true,
    keys: [{ pos: [5.55, 2.0, 20.0], target: [5.1, 1.85, 14.5] }, { pos: [5.12, 2.0, 17.0], target: [5.1, 1.85, 11.5] }],
  },
  {
    id: 's04_drawing', bars: 2, caption: 'Drawing · Dining', time: 0.52, exposure: 0.8, fov: 50, interior: true,
    keys: [{ pos: [3.7, 1.75, 10.35], target: [5.2, 1.35, 5.6] }, { pos: [5.9, 1.65, 10.45], target: [6.4, 1.3, 5.6] }, { pos: [8.2, 1.6, 10.3], target: [7.0, 1.3, 5.6] }],
  },
  {
    id: 's05_kitchen', bars: 1, caption: 'Kitchen', time: 0.52, exposure: 0.8, fov: 58, interior: true,
    keys: [{ pos: [2.75, 1.8, 10.9], target: [1.3, 1.0, 6.2] }, { pos: [2.3, 1.7, 10.4], target: [1.1, 1.0, 6.0] }],
  },
  {
    id: 's06_dining', bars: 1, caption: null, time: 0.96, exposure: 0.55, fov: 40, interior: true,
    keys: [{ pos: [7.0, 1.7, 11.8], target: [5.4, 1.6, 9.7] }, { pos: [6.4, 1.95, 11.3], target: [5.3, 1.75, 9.75] }],
  },
  {
    id: 's07_mandir', bars: 1, caption: 'Mandir', time: 0.96, exposure: 0.5, fov: 44, interior: true,
    keys: [{ pos: [6.45, 1.6, 17.5], target: [9.1, 1.55, 17.5] }, { pos: [7.55, 1.55, 17.5], target: [9.1, 1.55, 17.5] }],
  },
  {
    // the drop: dollhouse, cutaway, floors explode apart while the camera orbits
    id: 's08_explode', bars: 3, caption: null, time: 0.25, exposure: 0.8, fov: 34, context: false, cutaway: true,
    explode: [[0, 0], [0.18, 0], [0.75, 1], [1, 1]],
    keys: [
      { pos: [4.7, 33, 22.5], target: [4.7, 0.5, 13.5] },
      { pos: [17, 24, 29], target: [4.7, 5.0, 13] },
      { pos: [21, 17, 20], target: [4.7, 8.5, 12.5] },
      { pos: [18.5, 14, 6], target: [4.7, 9.0, 12.5] },
    ],
  },
  {
    id: 's09_master', bars: 1, caption: 'Master bedroom', time: 0.9, exposure: 0.6, fov: 52, interior: true,
    keys: [{ pos: [4.1, 5.25, 9.9], target: [8.6, 4.4, 8.4] }, { pos: [5.3, 5.15, 9.6], target: [8.8, 4.4, 8.6] }],
  },
  {
    id: 's10_kids', bars: 1, caption: 'Kids room', time: 0.52, exposure: 0.8, fov: 56, interior: true,
    keys: [{ pos: [7.9, 5.2, 16.2], target: [5.9, 4.4, 20.4] }, { pos: [7.3, 5.2, 16.8], target: [5.8, 4.5, 20.6] }],
  },
  {
    id: 's11_roof', bars: 1, caption: 'Rooftop terraces — proposed', time: 0.6, exposure: 0.95, fov: 40,
    keys: [{ pos: [-2.5, 12.5, 28.5], target: [4.5, 7.4, 17.5] }, { pos: [1.5, 15.0, 26.5], target: [4.8, 7.2, 15.5] }],
  },
  {
    // time-lapse: afternoon to dusk from the back lawn, lights come on
    id: 's12_timelapse', bars: 2, caption: 'Afternoon to evening', time: [0.05, 1.0], exposure: [0.78, 1.1], fov: 46,
    keys: [{ pos: [1.6, 3.3, -6.5], target: [5.4, 4.6, 10] }, { pos: [3.6, 3.5, -4.8], target: [5.2, 4.6, 10] }],
  },
  {
    id: 's13_finale', bars: 2, caption: null, time: 1.0, exposure: 1.15, fov: 34,
    keys: [{ pos: [11, 9.5, 33], target: [4.7, 4.5, 16] }, { pos: [20, 19, 41], target: [4.7, 4.0, 15] }, { pos: [32, 30, 52], target: [4.7, 3.5, 14] }],
  },
];

// ---------------------------------------------------------------- interpolation

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

function path(points, u) {
  if (points.length === 1) return points[0];
  const n = points.length - 1;
  const s = Math.min(n - 1e-9, Math.max(0, u * n));
  const i = Math.floor(s), t = s - i;
  const P = (k) => points[Math.max(0, Math.min(n, k))];
  // extrapolate the end tangents so the move starts and ends cleanly
  const p0 = i === 0 ? P(0).map((v, j) => 2 * v - P(1)[j]) : P(i - 1);
  const p3 = i + 1 === n ? P(n).map((v, j) => 2 * v - P(n - 1)[j]) : P(i + 2);
  return catmull(p0, P(i), P(i + 1), p3, t);
}

// gentle ease: mostly constant speed, softened at both ends (reads as a dolly/crane move)
export function ease(u) {
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return 0.55 * u + 0.45 * e;
}

function value(v, u) {
  if (Array.isArray(v) && Array.isArray(v[0])) {             // piecewise [[u, value], ...]
    for (let i = 1; i < v.length; i++) {
      if (u <= v[i][0]) {
        const [u0, a] = v[i - 1], [u1, b] = v[i];
        const k = (u - u0) / (u1 - u0 || 1);
        const s = k * k * (3 - 2 * k);
        return a + (b - a) * s;
      }
    }
    return v[v.length - 1][1];
  }
  if (Array.isArray(v)) { const s = u * u * (3 - 2 * u); return v[0] + (v[1] - v[0]) * s; }
  return v;
}

export function poseAt(shot, u) {
  const e = ease(u);
  return {
    pos: path(shot.keys.map((k) => k.pos), e),
    target: path(shot.keys.map((k) => k.target), e),
    fov: shot.fov,
    time: value(shot.time, u),
    exposure: shot.exposure === undefined ? undefined : value(shot.exposure, u),
    explode: shot.explode ? value(shot.explode, u) : 0,
    interior: !!shot.interior,
    cutaway: !!shot.cutaway,
    context: shot.context !== false,
    floor: shot.floor || 'ALL',
  };
}

export const framesOf = (shot) => Math.round(shot.bars * BAR * FPS);
