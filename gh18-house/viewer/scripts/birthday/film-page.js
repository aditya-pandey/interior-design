// The birthday film's shot list. Injected into /play/?headless&drive&film by render.mjs; window.FILM.frame(i)
// draws output frame i (the 3D frame from the game's own film mode, play.cine, plus titles and the photographs,
// composed in a 2D canvas) and returns it as a JPEG data URL.
//
// Everything filmed is the finished model as it is: the camera only goes where the plan has floors, doorways and
// open ground (the rooms, doors, road and places come from play.filmInfo(); walking paths are checked with
// play.clear()), floors are hidden only for the top-down cutaways, nothing is added to the world.
(() => {
  const P = window.play, I = P.filmInfo(), { THREE } = P.debug();
  const FPS = window.FILM_FPS || 30, W = window.FILM_W || 1920, H = window.FILM_H || 1080, XF = 1.0;    // cross-fade (s)
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const path = (pts) => (pts.length === 1 ? { getPointAt: () => V(pts[0]) } : new THREE.CatmullRomCurve3(pts.map(V), false, 'centripetal'));
  const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);                          // smootherstep: still at both ends
  const lerp = (a, b, t) => a + (b - a) * t;
  const room = (name, floor) => I.rooms.find((r) => r.name === name && r.floor === floor);
  const EYE = 1.55, GF = 0.45, FF = 3.75, SF = 7.05;
  const S = I.studio, U = S.upper, C = I.court;
  const bday = (() => { const m = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'], b = window.FILM_BDAY; return b ? `${b.day} ${m[b.month - 1]}` : 'WITH LOVE'; })();

  // ---- the car's drive from home to the studio, along the road (left lane), eased in and out
  const carPath = (() => {
    const road = I.road, N = road.length;
    const near = (x, z) => road.reduce((b, p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; return d < b.d ? { i, d } : b; }, { i: 0, d: Infinity }).i;
    const ih = near(I.home.x, I.home.z), ip = near(I.park.x, I.park.z);
    const fwd = (ip - ih + N) % N, back = (ih - ip + N) % N, dir = fwd <= back ? 1 : -1, steps = Math.min(fwd, back);
    const pts = [];
    for (let k = 0; k <= steps - 3; k += 4) {
      const i = (ih + dir * k + N) % N, j = (i + dir + N) % N;
      const tx = road[j][0] - road[i][0], tz = road[j][1] - road[i][1], l = Math.hypot(tx, tz) || 1;
      pts.push([road[i][0] + (tz / l) * 1.8, 0, road[i][1] - (tx / l) * 1.8]);   // the left lane
    }
    pts.push([I.park.x, 0, I.park.z]);
    return path(pts);
  })();
  const carAt = (t) => {
    const s = THREE.MathUtils.clamp(smooth(t) * 0.94 + t * 0.06, 0, 1), p = carPath.getPointAt(s), q = carPath.getPointAt(Math.min(1, s + 0.004));
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    return { x: p.x, z: p.z, yaw, spin: (s * carPath.getLength()) / 0.31, steer: 0, speed: 8 };
  };

  // ---- the shots. pos / tgt: camera and aim paths (eased); hour: time of day (or [from, to]); cut: show only up to
  // this floor; caption: a quiet lower-left title; car: where the car is
  const shots = [
    { name: 'title', dur: 12, hour: 7.3, fov: [40, 36],
      pos: [[-17, 15, 44], [-11, 9, 37], [-6, 4.6, 31.5]], tgt: [[4.6, 6.5, 12], [4.6, 5.0, 14], [4.7, 4.2, 15.5]], title: true },
    { name: 'coast', dur: 12, hour: 9.2, fov: 46, caption: ['THE COAST', 'GH-18 · the house by the sea'],
      pos: [[-12, 26, -14], [16, 34, 6], [50, 36, 26], [82, 26, 28]], tgt: [[5, 0, 32], [35, 0, 52], [75, 0, 52], [108, 2, 46]] },
    { name: 'entrance', dur: 11, hour: 10.0, fov: 52, caption: ['THE ENTRANCE', 'Ground floor'],
      pos: [[4.75, GF + EYE, 26.5], [4.8, GF + EYE, 22.4], [4.92, GF + EYE, 18.9]], tgt: [[4.9, GF + 2.1, 19], [5.0, GF + 1.7, 15], [5.15, GF + 1.5, 11]] },
    { name: 'living', dur: 10, hour: 10.6, fov: 58, caption: ['FAMILY LOUNGE · DINING · KITCHEN', 'Ground floor'],
      pos: [[6.0, GF + EYE, 11.0], [6.6, GF + EYE, 9.4], [6.2, GF + EYE, 7.6]], tgt: [[7.5, GF + 1.2, 6.0], [5.0, GF + 1.2, 5.6], [2.2, GF + 1.3, 8.4]] },
    { name: 'plan_gf', dur: 6.5, hour: 12.0, fov: 42, cut: 'GF', orbit: { c: [4.7, GF, 12.0], r: 15, h: 19, a: [-40, 5] }, caption: ['GROUND FLOOR', 'from above'] },
    { name: 'plan_ff', dur: 6.5, hour: 12.0, fov: 42, cut: 'FF', orbit: { c: [4.7, FF, 12.0], r: 15, h: 17, a: [5, 50] }, caption: ['FIRST FLOOR', 'from above'] },
    { name: 'plan_sf', dur: 6.5, hour: 12.0, fov: 42, cut: 'SF', orbit: { c: [4.7, SF, 12.0], r: 15, h: 15, a: [50, 95] }, caption: ['SECOND FLOOR', 'the terraces'] },
    { name: 'plan_roof', dur: 5.5, hour: 12.0, fov: 42, orbit: { c: [4.7, 4, 12.0], r: 19, h: 18, a: [95, 125] } },
    { name: 'master', dur: 8, hour: 16.6, fov: 56, caption: ['MASTER BEDROOM', 'First floor · the balcony'],
      pos: [[5.2, FF + EYE, 10.0], [6.0, FF + EYE, 8.6], [6.9, FF + EYE, 7.4]], tgt: [[7.0, FF + 1.2, 6.5], [7.3, FF + 1.1, 5.6], [7.6, FF + 0.9, 3.2]] },
    { name: 'garden', dur: 9, hour: 17.0, fov: 50, caption: ['THE BACK GARDEN', 'lawn · deck · pergola'],
      pos: [[-1.5, 5.2, -3.5], [4.6, 4.6, -4.2], [10.5, 5.2, -3.5]], tgt: [[4.0, 1.2, 3.6], [4.6, 1.4, 4.0], [5.2, 1.2, 3.6]] },
    { name: 'drive', dur: 16, hour: [17.35, 17.6], fov: [48, 42], caption: ['THE COAST ROAD', 'home to the studio'], car: true },
    { name: 'studio_ext', dur: 11, hour: 18.1, fov: [46, 42], caption: ["DEEPTI'S STUDIO", 'on the beach'],
      pos: [[99.5, 1.7, 29.0], [107.5, 2.2, 29.6], [115.0, 2.8, 30.6]], tgt: [[104.5, 3.0, 40], [108.5, 3.3, 40], [111.5, 3.4, 40]] },
    { name: 'lounge', dur: 10, hour: 19.0, fov: [56, 52],
      pos: [[107.4, 1.9, 55.0], [107.4, 2.0, 50.4], [110.2, 2.3, 46.4]], tgt: [[107.6, 2.2, 46], [109.4, 2.8, 42], [109.6, 4.6, 40.4]] },
    { name: 'gallery', dur: 9, hour: 19.25, fov: 50, caption: ['HER PAINTINGS', 'the gallery'],
      pos: [[114.0, 2.0, 48.2], [114.1, 2.0, 45.4], [114.0, 2.0, 42.9]], tgt: [[116.5, 2.0, 47.6], [116.5, 2.0, 44.8], [116.5, 2.0, 42.6]] },
    { name: 'library', dur: 9, hour: 19.8, fov: [52, 46], caption: ['THE LIBRARY', 'the reading nook'],
      pos: [[104.2, 2.1, 46.6], [102.6, 1.9, 46.5], [100.9, 1.65, 46.4]], tgt: [[98.4, 1.8, 46.4], [98.4, 1.8, 46.4], [98.4, 1.75, 46.4]] },
    { name: 'poems', dur: 10, hour: 20.0, fov: 48, caption: ['HER POEMS', 'the atelier'], poem: true,
      pos: [[100.0, U + 1.6, 42.3], [100.0, U + 1.6, 45.0], [100.0, U + 1.6, 47.5]], tgt: [[98.3, U + 1.62, 42.9], [98.3, U + 1.62, 45.6], [98.3, U + 1.62, 48.1]] },
    { name: 'court', dur: 9, hour: 20.4, fov: 40, caption: ['THE COURT', 'under the lights'], orbit: { c: [C.x, C.Y + 0.6, C.z], r: 15, h: 7.5, a: [-178, -152] } },
    { name: 'photos', dur: 15, photos: true },
    { name: 'finale', dur: 13, hour: 21.3, fov: [44, 50], ending: true,
      pos: [[110, 1.4, 61.5], [113, 3.0, 65], [117, 5.5, 69]], tgt: [[108, 3.0, 47], [108, 3.4, 46], [108, 4.5, 44]] },
  ];
  let t0 = 0;
  for (const s of shots) { s.t0 = t0; t0 += s.dur - XF; s.posP = s.pos && path(s.pos); s.tgtP = s.tgt && path(s.tgt); }
  const TOTAL = t0 + XF;

  // ---- one shot's 3D frame at local time t (seconds into the shot)
  function camFor(s, t) {
    const u = THREE.MathUtils.clamp(t / s.dur, 0, 1), e = smooth(u);
    const fov = Array.isArray(s.fov) ? lerp(s.fov[0], s.fov[1], e) : s.fov || 50;
    const hour = Array.isArray(s.hour) ? lerp(s.hour[0], s.hour[1], u) : s.hour;
    let p, g, car = null;
    if (s.orbit) {
      const o = s.orbit, a = THREE.MathUtils.degToRad(lerp(o.a[0], o.a[1], e));
      p = [o.c[0] + Math.sin(a) * o.r, o.c[1] + o.h, o.c[2] + Math.cos(a) * o.r]; g = o.c;
    } else if (s.car) {
      car = carAt(u);
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
      // a tracking shot: from behind and above, swinging round to the car's sea-side flank as it nears the studio
      const k = smooth(THREE.MathUtils.clamp((u - 0.35) / 0.45, 0, 1));
      const back = lerp(-9, 1.5, k), side = lerp(1.5, -8.5, k), up = lerp(3.4, 1.7, k);
      p = [car.x + fx * back + lx * side, up, car.z + fz * back + lz * side];
      g = [car.x + fx * lerp(7, 2, k), 1.0, car.z + fz * lerp(7, 2, k)];
    } else { const a = s.posP.getPointAt(e), b = s.tgtP.getPointAt(e); p = [a.x, a.y, a.z]; g = [b.x, b.y, b.z]; }
    return { px: p[0], py: p[1], pz: p[2], tx: g[0], ty: g[1], tz: g[2], fov, hour, cut: s.cut || null, car, near: s.orbit ? 0.5 : 0.08 };
  }

  // ---- 2D: the compositor
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const photos = I.photos.map((p) => { const im = new Image(); im.src = p.url; return { im, ...p }; });
  const serif = (px, it = true, wt = 400) => `${it ? 'italic ' : ''}${wt} ${px}px 'Cormorant Garamond', Georgia, serif`;
  const sans = (px, wt = 600) => `${wt} ${px}px Inter, 'Helvetica Neue', Arial, sans-serif`;
  const spaced = (txt, x, y, px, sp, align = 'left') => { g.font = sans(px); if ('letterSpacing' in g) g.letterSpacing = sp + 'px'; g.textAlign = align; g.fillText(txt, x, y); if ('letterSpacing' in g) g.letterSpacing = '0px'; };
  const k = W / 1920;
  const fadeIn = (t, a, d) => THREE.MathUtils.clamp((t - a) / d, 0, 1);
  function caption(s, t) {
    if (!s.caption) return;
    const a = Math.min(fadeIn(t, 1.2, 1.0), 1 - fadeIn(t, s.dur - 2.4, 1.0));
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18 * k;
    g.fillStyle = 'rgba(232,206,160,0.95)'; g.fillRect(96 * k, H - 168 * k, 46 * k, 2 * k);
    g.fillStyle = '#f7f1e6'; spaced(s.caption[0], 96 * k, H - 128 * k, 20 * k, 6 * k);
    g.font = serif(34 * k); g.fillStyle = 'rgba(247,241,230,0.92)'; g.textAlign = 'left'; g.fillText(s.caption[1], 96 * k, H - 86 * k);
    g.restore();
  }
  function vignette(strength = 0.38) {
    const r = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${strength})`); g.fillStyle = r; g.fillRect(0, 0, W, H);
  }
  function titleCard(t, dur, lines) {
    const a = Math.min(fadeIn(t, lines.at, 1.6), 1 - fadeIn(t, dur - lines.out, 1.4));
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 30 * k;
    g.fillStyle = '#fbf6ec'; g.textAlign = 'center';
    g.font = serif(118 * k); g.fillText(lines.a, W / 2, H * 0.44);
    g.font = serif(150 * k); g.fillText(lines.b, W / 2, H * 0.44 + 150 * k);
    g.fillStyle = 'rgba(232,206,160,0.95)'; g.fillRect(W / 2 - 40 * k, H * 0.44 + 205 * k, 80 * k, 2 * k);
    g.fillStyle = '#f2e6cf'; spaced(lines.c, W / 2, H * 0.44 + 252 * k, 20 * k, 8 * k, 'center');
    g.restore();
  }
  function poemCard(t, dur) {
    const a = Math.min(fadeIn(t, 2.2, 1.6), 1 - fadeIn(t, dur - 2.6, 1.4));
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 24 * k; g.fillStyle = '#fbf6ec'; g.textAlign = 'right';
    g.font = serif(46 * k); g.fillText('Maybe it’s an art,', W - 110 * k, H - 210 * k); g.fillText('The tree and you.', W - 110 * k, H - 152 * k);
    g.font = serif(30 * k); g.fillStyle = 'rgba(240,226,200,0.92)'; g.fillText('— Aditya', W - 110 * k, H - 100 * k);
    g.restore();
  }
  // the photographs: each on a soft blurred field of itself, in a white mat, slowly drifting closer
  function drawPhotos(t, dur) {
    g.fillStyle = '#16120e'; g.fillRect(0, 0, W, H);
    const n = photos.length; if (!n) return;
    const per = dur / n;
    for (let i = 0; i < n; i++) {
      const s0 = i * per, a = Math.min(fadeIn(t, s0 - 0.6, 1.2), 1 - fadeIn(t, s0 + per - 0.6, 1.2));
      if (a <= 0 || !photos[i].im.complete) continue;
      const { im, w, h } = photos[i], local = (t - s0) / per, z = 1 + 0.06 * local;
      g.save(); g.globalAlpha = a;
      g.filter = `blur(${40 * k}px) brightness(0.45)`; const cs = Math.max(W / w, H / h) * 1.15; g.drawImage(im, W / 2 - (w * cs) / 2, H / 2 - (h * cs) / 2, w * cs, h * cs); g.filter = 'none';
      const fit = Math.min((W * 0.62) / w, (H * 0.74) / h) * z, pw = w * fit, ph = h * fit, x = W / 2 - pw / 2 + (i % 2 ? 1 : -1) * 18 * k * local, y = H / 2 - ph / 2 - 10 * k;
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 50 * k; g.shadowOffsetY = 18 * k;
      g.fillStyle = '#f8f4ec'; g.fillRect(x - 22 * k, y - 22 * k, pw + 44 * k, ph + 44 * k);
      g.shadowColor = 'transparent'; g.drawImage(im, x, y, pw, ph);
      g.restore();
    }
    const a = Math.min(fadeIn(t, 0.8, 1.4), 1 - fadeIn(t, dur - 1.8, 1.2));
    g.save(); g.globalAlpha = a; g.fillStyle = 'rgba(232,206,160,0.95)'; g.fillRect(96 * k, H - 128 * k, 46 * k, 2 * k);
    g.fillStyle = '#f7f1e6'; spaced('MOMENTS', 96 * k, H - 90 * k, 20 * k, 6 * k); g.restore();
  }

  // one shot drawn into the compositor with alpha a
  function drawShot(s, t, a, dt, T) {
    g.save(); g.globalAlpha = a;
    if (s.photos) drawPhotos(t, s.dur);
    else {
      const c = camFor(s, t);
      P.cine({ ...c, dt, clock: T, grab: false, regen: true });
      g.drawImage(P.debug().renderer.domElement, 0, 0, W, H);
      vignette(s.cut ? 0.25 : 0.38);
      caption(s, t);
      if (s.title) titleCard(t, s.dur, { a: 'Happy Birthday,', b: 'Deepti', c: bday, at: 1.6, out: 3.2 });
      if (s.poem) poemCard(t, s.dur);
      if (s.ending) titleCard(t, s.dur, { a: 'Happy Birthday,', b: 'Deepti', c: 'WITH LOVE · ADITYA', at: 3.5, out: 0.01 });
    }
    g.restore();
  }

  window.FILM = {
    cam: (name, u) => { const s = shots.find((x) => x.name === name); return camFor(s, u * s.dur); },
    fps: FPS, total: TOTAL, frames: Math.round(TOTAL * FPS), shots: shots.map((s) => ({ name: s.name, t0: s.t0, dur: s.dur })),
    ready: () => Promise.all(photos.map((p) => (p.im.complete ? 1 : new Promise((r) => { p.im.onload = r; p.im.onerror = r; })))),
    frame(i, q = 0.94, grab = true) {
      const T = i / FPS;
      g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const live = shots.filter((s) => T >= s.t0 && T < s.t0 + s.dur);
      live.forEach((s, j) => {
        const t = T - s.t0;
        // the incoming shot fades in over the outgoing one
        const a = j === 0 ? 1 : THREE.MathUtils.clamp(t / XF, 0, 1);
        drawShot(s, t, a, j === 0 ? 1 / FPS : 0, T + 2);
      });
      // fade from black at the start, to black at the end
      const fin = Math.min(1, T / 1.8), fout = Math.min(1, (TOTAL - T) / 2.5);
      if (fin < 1 || fout < 1) { g.globalAlpha = 1 - Math.min(fin, fout); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      return grab ? cv.toDataURL('image/jpeg', q) : null;
    },
    // checks: is every walking shot's path through open floor? (sampled; the camera's floor from its height)
    check() {
      const bad = [];
      for (const s of shots) {
        if (!s.posP || s.orbit || s.car || ['title', 'coast', 'studio_ext', 'finale', 'garden', 'poems'].includes(s.name)) continue;
        for (let u = 0; u <= 1.0001; u += 0.02) {
          const p = s.posP.getPointAt(Math.min(1, u)), y = p.y - EYE;
          const fl = [GF, FF, SF, 0.6, U].reduce((m, v) => (Math.abs(v - y) < Math.abs(m - y) ? v : m));
          if (p.z > 54 || (s.name === 'entrance' && p.z > 20.3)) continue;          // (outside, approaching)
          if (!P.clear(p.x, p.z, fl)) bad.push(`${s.name} @${u.toFixed(2)} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        }
      }
      return bad;
    },
  };
})();
