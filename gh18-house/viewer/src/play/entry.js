// /play/ entry: first the home tour itself, exactly as on /v1/ (the tour's own main.js, menus, views,
// lighting and walk mode). While she walks, a watcher looks for her near the Baleno in the parking and
// offers "Get in the car". Getting in releases the tour (its WebGL context is let go, which stops its
// render loop) and loads the drive: the coast, her studio, the birthday tune (src/play/main.js).
// ?drive skips the tour and starts in the car (testing).
//
// Two things are added to the tour's walk mode here, for /play/ only (the tour on / and /v1/ is not
// changed): a smoother walk (walkfeel.js: momentum, sliding along walls and furniture, smooth stairs)
// and sitting or lying down on the house's sofas, chairs and beds (seats.js; E to sit, E or a step to
// get up). ?oldwalk keeps the tour's own walk (for comparison).

import house from '../../../house_r1.json';
import { improveWalker } from './walkfeel.js';
import { houseSeats, nearestSeat, standSpot } from './seats.js';

const params = new URLSearchParams(location.search);
const CAR = { x: 7.615, z: 21.945 };          // the Baleno in GH-18's parking (house_r1.json GF-O07)
let started = false;
if (!params.has('oldwalk')) improveWalker();
const SEATS = houseSeats(house);

async function startDrive() {
  if (started) return;
  started = true;
  if (seated) standUp(true);
  document.getElementById('play-prompt').hidden = true;
  document.getElementById('play-seat').hidden = true;
  const curtain = document.getElementById('play-loading');
  curtain.hidden = false;
  document.exitPointerLock?.();
  const canvas = document.querySelector('#app canvas');
  canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  for (const id of ['app', 'panel', 'walkhud', 'stick', 'svc-legend', 'loading']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  document.body.className = '';
  await import('./main.js');
}

// ---- sitting in the tour
let seated = null, focusSeat = null, tween = null;
// the floor under a seat: the walkable height there closest to its storey's floor level
const baseAt = (w, s) => w.heights(s.centre[0] * 1000, s.centre[1] * 1000).reduce((a, b) => (Math.abs(b - s.ffl) < Math.abs(a - s.ffl) ? b : a), s.ffl);
const yawFor = (fx, fz) => Math.atan2(-fx, -fz);                 // the tour's camera: rotation (pitch, yaw, 0, 'YXZ')

function animate(cam, to, toYaw, toPitch, done) {
  const from = cam.position.clone(), r = cam.rotation;
  const y0 = r.y, p0 = r.x;
  let dy = toYaw - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const t0 = performance.now(), T = 650;
  cancelAnimationFrame(tween);
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / T), e = k * k * (3 - 2 * k);
    cam.position.lerpVectors(from, to, e);
    cam.rotation.set(p0 + (toPitch - p0) * e, y0 + dy * e, 0, 'YXZ');
    if (k < 1) tween = requestAnimationFrame(step); else done?.();
  };
  if (window.viewer?.headless) { cam.position.copy(to); cam.rotation.set(toPitch, y0 + dy, 0, 'YXZ'); done?.(); } else step();
}

function sitDown(s) {
  const v = window.viewer, w = v.walker(), cam = w.camera;
  const base = baseAt(w, s);
  seated = { seat: s, base, prev: [cam.position.x, cam.position.z] };
  w.active = false;
  const to = cam.position.clone().set(s.eye[0], base + s.eye[1], s.eye[2]);
  animate(cam, to, yawFor(s.look[0], s.look[1]), s.lie ? s.pitch : -s.pitch);
}
function standUp(now = false) {
  if (!seated) return;
  const v = window.viewer, w = v.walker(), cam = w.camera, { seat, base, prev } = seated;
  seated = null;
  const yaw = yawFor(seat.look[0], seat.look[1]);
  // a clear spot to stand on (in front of a sofa there is often a coffee table)
  const free = (x, z) => { const h = w.standAt(x * 1000, z * 1000, base); return h !== null && Math.abs(h - base) < 0.3 && !w.blocked(x * 1000, z * 1000, h); };
  const [sx, sz] = standSpot(seat, prev, free);
  const done = () => { w.place(sx * 1000, sz * 1000, base, yaw, 0); w.active = w.controls.isLocked || matchMedia('(pointer: coarse)').matches || !!v.headless; };
  if (now) return done();
  animate(cam, cam.position.clone().set(sx, base + 1.6, sz), yaw, 0, done);
}

function watch() {
  const prompt = document.getElementById('play-prompt');
  const seatPrompt = document.getElementById('play-seat');
  const dir = { x: 0, z: 0 };
  setInterval(() => {
    const v = window.viewer;
    if (started || !v || !v.ready) return;
    const w = v.walker(), cam = w.camera.position;
    const walking = v.state.mode === 'walk';
    if (!walking && seated) seated = null;
    const near = walking && !seated && Math.hypot(cam.x - CAR.x, cam.z - CAR.z) < 3.0 && cam.y < 2.6;
    prompt.hidden = !near;
    focusSeat = null;
    if (walking && !near) {
      if (seated) focusSeat = seated.seat;
      else {
        const f = w.camera.getWorldDirection(new w.camera.position.constructor());
        dir.x = f.x; dir.z = f.z;
        const L = Math.hypot(dir.x, dir.z) || 1;
        focusSeat = nearestSeat(SEATS, cam.x, cam.z, w.foot, dir.x / L, dir.z / L, (s) => baseAt(w, s));
      }
    }
    seatPrompt.hidden = !focusSeat;
    if (focusSeat) seatPrompt.innerHTML = `<kbd>E</kbd> ${seated ? 'Get up' : focusSeat.label}`;
  }, 200);
  window.addEventListener('keydown', (e) => {
    if (started) return;
    if (e.code === 'KeyF' && !prompt.hidden) startDrive();
    if (e.code === 'KeyE' && window.viewer?.state.mode === 'walk') { if (seated) standUp(); else if (focusSeat) sitDown(focusSeat); }
    if (seated && ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code)) standUp();
  });
  prompt.addEventListener('click', startDrive);
  seatPrompt.addEventListener('click', () => { if (seated) standUp(); else if (focusSeat) sitDown(focusSeat); });
}

window.playEntry = { start: startDrive, sit: (id) => { const s = SEATS.find((q) => q.id === id); if (s) sitDown(s); return !!s; }, stand: () => standUp(true), seats: () => SEATS.map((s) => s.id) };
if (params.has('drive')) startDrive();
else import('../main.js').then(watch);
