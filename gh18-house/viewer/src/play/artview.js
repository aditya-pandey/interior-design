import * as THREE from 'three';

// Looking at her paintings, as in a gallery. The camera leaves her eyes and glides to stand square in front of
// the painting on the wall, near enough that it fills the view, in the studio's own light; a warm picture light
// comes up on it and the room around falls a little darker; its varnish stops shining back.
//
//   scroll / pinch / double-click   closer (to the paint itself; never past what the photograph of it can show)
//   drag                            look across it (it glides on a little when let go)
//   ← →  (or a swipe)               glide along to the next one (a dip to black when it hangs somewhere else)
//   ↓                               step back to see the whole wall; click a painting there to go to it
//   P                               a slideshow: each in turn, drifting slowly closer, with her music
//   Esc or E                        back into her eyes
//
// A museum label in the corner: the title, year, medium and a line about it if the pack gives them
// (pack.art[i].title / year / medium / note), else "Painted by Deepti".
//
//   artworks: [{ index, pos: [x, y, z] (centre), normal: [nx, nz], size: [w, h] (m), px: [w, h] (image), mesh }]
//   in hanging order

const FOV = 46;
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createArtView({ camera, canvas, scene, artworks, meta = [], total, veil, onStart = () => {}, onEnd = () => {}, onSlideshow = () => {}, onShow = null, noLabel = false }) {
  const cap = document.createElement('div');
  cap.id = 'artcap'; cap.hidden = true;
  cap.innerHTML = `<div class="label"><p class="t"></p><p class="by"></p><p class="md"></p><p class="note"></p></div><p class="n"></p>
    <p class="k"><span><kbd>←</kbd><kbd>→</kbd> next</span><span>scroll to look closer</span><span><kbd>↓</kbd> the whole wall</span><span><kbd>P</kbd> slideshow</span><span><kbd>Esc</kbd> step back</span></p>
    <p class="wallhint">Click a painting to go to it · <kbd>↑</kbd> back</p>
    <button class="back" aria-label="Step back">Step back</button>`;
  document.body.append(cap);
  cap.querySelector('.back').addEventListener('click', () => end());

  // the picture light: always in the scene (so no shader has to change when it comes on), dark until used
  const spot = new THREE.SpotLight(0xffe9d2, 0, 9, 0.5, 0.8, 1.2);
  spot.castShadow = false; scene.add(spot); scene.add(spot.target);

  const v = {
    active: false, i: 0, mode: 'look',        // 'look' (one painting) or 'wall' (the whole wall)
    z: 1, px: 0, py: 0, cz: 1, cpx: 0, cpy: 0, vel: [0, 0],
    glide: null, player: null, hintT: 0, show: null, light: 0,
  };
  const tmpO = new THREE.PerspectiveCamera();          // (a camera: lookAt points its -z, the way it sees)
  const UP = new THREE.Vector3(0, 1, 0);
  const T = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  // a painting's frame of reference: centre, the way it faces, its right (as she looks at it)
  const frame = (a) => {
    const C = new THREE.Vector3(...a.pos), N = new THREE.Vector3(a.normal[0], 0, a.normal[1]).normalize();
    return { C, N, R: new THREE.Vector3(N.z, 0, -N.x) };
  };
  const fitOf = (a) => Math.max(0.4, (a.size[1] + 0.12) * 1.18 / (2 * T), (a.size[0] + 0.12) * 1.12 / (2 * T * camera.aspect));
  // as close as the photograph allows: about 1.6 screen pixels to one of its pixels at the most
  const zmax = (a) => THREE.MathUtils.clamp((a.px?.[1] || 1000) / (0.85 * canvas.clientHeight) * 1.6, 1.6, 5);
  function poseFor(a, z, px, py, out = {}) {
    const { C, N, R } = frame(a), dist = fitOf(a) / z, hv = dist * T, hw = hv * camera.aspect;
    const mx = Math.max(0, a.size[0] / 2 + 0.05 - hw), my = Math.max(0, a.size[1] / 2 + 0.05 - hv);
    px = THREE.MathUtils.clamp(px, -mx, mx); py = THREE.MathUtils.clamp(py, -my, my);
    const look = C.clone().addScaledVector(R, px).addScaledVector(UP, py);
    tmpO.position.copy(look).addScaledVector(N, dist); tmpO.lookAt(look);
    if (a.tilt) tmpO.rotateX(-a.tilt);                                        // (the easel leans back)
    Object.assign(out, { pos: tmpO.position.clone(), quat: tmpO.quaternion.clone(), fov: FOV, px, py, hv, hw, dist });
    return out;
  }
  // the whole wall a painting hangs on: the paintings facing the same way in the same plane, nearby
  function wallOf(a) {
    const { C, N, R } = frame(a);
    const on = artworks.filter((b) => b.normal[0] * a.normal[0] + b.normal[1] * a.normal[1] > 0.95 && Math.abs(new THREE.Vector3(...b.pos).sub(C).dot(N)) < 0.3 && new THREE.Vector3(...b.pos).distanceTo(C) < 9);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const b of on) { const d = new THREE.Vector3(...b.pos).sub(C), x = d.dot(R), y = d.y; x0 = Math.min(x0, x - b.size[0] / 2); x1 = Math.max(x1, x + b.size[0] / 2); y0 = Math.min(y0, y - b.size[1] / 2); y1 = Math.max(y1, y + b.size[1] / 2); }
    const w = x1 - x0 + 0.8, h = y1 - y0 + 0.6, dist = Math.max(1.2, h / (2 * T), w / (2 * T * camera.aspect));
    const look = C.clone().addScaledVector(R, (x0 + x1) / 2).addScaledVector(UP, (y0 + y1) / 2);
    tmpO.position.copy(look).addScaledVector(N, dist); tmpO.lookAt(look);
    return { pos: tmpO.position.clone(), quat: tmpO.quaternion.clone(), fov: FOV, on };
  }
  const snapshot = () => ({ pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov });
  const glideTo = (dur) => { v.glide = { from: snapshot(), t: 0, dur }; };

  // ---------------------------------------------------------------- the label
  function caption() {
    const a = artworks[v.i], m = meta[a.index] || {};
    const q = (s) => cap.querySelector(s);
    q('.t').textContent = m.title || 'Painted by Deepti';
    q('.by').textContent = m.title ? 'Deepti' : ''; q('.by').hidden = !m.title;
    const md = [m.medium, m.year].filter(Boolean).join(' · '); q('.md').textContent = md; q('.md').hidden = !md;
    q('.note').textContent = m.note || ''; q('.note').hidden = !m.note;
    q('.n').innerHTML = `${String(a.index + 1).padStart(2, '0')} <span>/ ${total}</span>${v.show ? ' <span>· slideshow</span>' : ''}`;
    cap.classList.add('hints'); v.hintT = v.show ? 0 : 4.5;
    if (noLabel) cap.querySelector('.label').hidden = true;
    onShow?.(a);
  }
  // the varnish: no shine while she's looking at it (and back after)
  let glare = null;
  const unglare = (a) => {
    if (glare) { glare.m.clearcoat = glare.cc; glare = null; }
    const m = a?.mesh?.userData?.canvas; if (m && m.clearcoat > 0.06) { glare = { m, cc: m.clearcoat }; m.clearcoat = 0.06; }
  };
  function lightOn(a) {
    const { C, N } = frame(a);
    spot.position.copy(C).addScaledVector(N, 1.9).add(new THREE.Vector3(0, 1.5, 0));
    spot.target.position.copy(C); spot.target.updateMatrixWorld();
    spot.angle = Math.min(0.9, Math.atan((Math.max(a.size[0], a.size[1]) * 0.56 + 0.08) / spot.position.distanceTo(C)));
    unglare(a);
  }

  // ---------------------------------------------------------------- moving about
  function start(index) {
    const k = artworks.findIndex((a) => a.index === index);
    v.i = k < 0 ? 0 : k; v.mode = 'look';
    v.player = snapshot();
    v.z = v.cz = 1; v.px = v.py = v.cpx = v.cpy = 0; v.vel = [0, 0];
    glideTo(1.15);
    v.active = true;
    cap.hidden = false; cap.classList.remove('wall'); requestAnimationFrame(() => cap.classList.add('in'));
    caption(); lightOn(artworks[v.i]);
    document.body.classList.add('viewing', 'looking');
    onStart();
  }
  function goTo(ni) {
    if (!v.active || v.glide?.back) return;
    const from = artworks[v.i], to = artworks[ni];
    const far = v.mode === 'look' && (Math.hypot(from.pos[0] - to.pos[0], from.pos[1] - to.pos[1], from.pos[2] - to.pos[2]) > 4.5 || from.normal[0] * to.normal[0] + from.normal[1] * to.normal[1] < 0.5);
    const swap = () => { v.i = ni; v.mode = 'look'; v.z = v.cz = 1; v.px = v.py = v.cpx = v.cpy = 0; v.vel = [0, 0]; cap.classList.remove('wall'); caption(); lightOn(to); };
    if (far) {                                             // across the studio: a quick dip to black
      veil?.classList.add('on');
      setTimeout(() => { swap(); v.glide = null; setTimeout(() => veil?.classList.remove('on'), 60); }, 420);
    } else { glideTo(1.0 + 0.12 * Math.hypot(from.pos[0] - to.pos[0], from.pos[2] - to.pos[2])); swap(); }
  }
  const go = (k) => goTo((v.i + k + artworks.length) % artworks.length);
  function wall() {
    if (v.mode === 'wall' || v.glide?.back) return;
    v.mode = 'wall'; glideTo(1.0); cap.classList.add('wall'); stopShow();
    spot.intensity = 0;
  }
  function end() {
    if (!v.active || v.glide?.back) return;
    stopShow();
    v.glide = { from: snapshot(), t: 0, dur: 0.9, back: true };
    cap.classList.remove('in');
    document.body.classList.remove('viewing', 'looking');
  }
  function toggleShow() {
    if (v.show) { stopShow(); return; }
    if (v.mode === 'wall') goTo(v.i);
    v.show = { t: 0 }; caption(); cap.classList.add('showing'); onSlideshow(true);
  }
  function stopShow() { if (!v.show) return; v.show = null; cap.classList.remove('showing'); caption(); onSlideshow(false); }

  // ---------------------------------------------------------------- each frame
  const pose = {};
  function update(dt) {
    if (!v.active) return false;
    const a = artworks[v.i];
    // the slideshow: a slow drift closer, then on to the next
    if (v.show && !v.glide) {
      v.show.t += dt; v.z = 1 + Math.min(0.12, v.show.t * 0.016);
      if (v.show.t > 7.5) { v.show.t = 0; go(1); }
    }
    // a drag's glide on, slowing
    if (Math.abs(v.vel[0]) + Math.abs(v.vel[1]) > 1e-3) { v.px += v.vel[0] * dt; v.py += v.vel[1] * dt; const k = Math.exp(-4.5 * dt); v.vel[0] *= k; v.vel[1] *= k; }
    { const lim = poseFor(a, v.z, v.px, v.py); if (lim.px !== v.px) v.vel[0] = 0; if (lim.py !== v.py) v.vel[1] = 0; v.px = lim.px; v.py = lim.py; }
    v.cz = damp(v.cz, v.z, 8, dt); v.cpx = damp(v.cpx, v.px, 10, dt); v.cpy = damp(v.cpy, v.py, 10, dt);
    let target = v.mode === 'wall' ? wallOf(a) : poseFor(a, v.cz, v.cpx, v.cpy, pose);
    if (v.glide?.back) target = v.player;
    if (v.glide) {
      v.glide.t += dt / v.glide.dur;
      const e = smooth(Math.min(1, v.glide.t)), f = v.glide.from;
      camera.position.lerpVectors(f.pos, target.pos, e);
      camera.quaternion.slerpQuaternions(f.quat, target.quat, e);
      camera.fov = THREE.MathUtils.lerp(f.fov, target.fov, e);
      if (v.glide.t >= 1) {
        if (v.glide.back) {
          v.active = false; v.glide = null; cap.hidden = true; spot.intensity = 0; unglare(null);
          onEnd(); camera.updateProjectionMatrix(); return false;
        }
        v.glide = null;
      }
    } else { camera.position.copy(target.pos); camera.quaternion.copy(target.quat); camera.fov = FOV; }
    // the picture light comes up (and goes when she steps back)
    const want = v.active && v.mode === 'look' && !v.glide?.back ? 1 : 0;
    v.light = damp(v.light, want, 3, dt); spot.intensity = 9 * v.light;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    if (v.hintT > 0) { v.hintT -= dt; if (v.hintT <= 0) cap.classList.remove('hints'); }
    return true;
  }

  // ---------------------------------------------------------------- closer, and across
  function zoomAt(nz, nx = 0, ny = 0) {
    if (v.mode !== 'look') return;
    const a = artworks[v.i];
    nz = THREE.MathUtils.clamp(nz, 1, zmax(a));
    const p0 = poseFor(a, v.z, v.px, v.py), qx = p0.px + nx * p0.hw, qy = p0.py + ny * p0.hv;
    const p1 = poseFor(a, nz, 0, 0);
    v.z = nz; const c = poseFor(a, nz, qx - nx * p1.hw, qy - ny * p1.hv); v.px = c.px; v.py = c.py; v.vel = [0, 0];
    if (nz === 1) v.px = v.py = 0;
  }
  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
  canvas.addEventListener('wheel', (e) => { if (!v.active || v.glide) return; e.preventDefault(); stopShow(); if (v.mode === 'wall') { if (e.deltaY < 0) goTo(v.i); return; } const [nx, ny] = ndc(e); zoomAt(v.z * Math.exp(-e.deltaY * 0.0018), nx, ny); if (e.deltaY > 0 && v.z <= 1.001 && (v.outAcc = (v.outAcc || 0) + e.deltaY) > 300) { v.outAcc = 0; wall(); } }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { if (!v.active || v.mode !== 'look') return; const [nx, ny] = ndc(e); zoomAt(v.z > 1.05 ? 1 : Math.min(2.6, zmax(artworks[v.i])), nx, ny); });
  const ptrs = new Map();
  let pinch = null, press = null, last = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!v.active) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    press = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; last = { t: performance.now(), x: e.clientX, y: e.clientY };
    v.vel = [0, 0];
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), z: v.z }; }
  });
  window.addEventListener('pointermove', (e) => {
    if (!v.active || !ptrs.has(e.pointerId)) return;
    const [x0, y0] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [p, q] = [...ptrs.values()]; zoomAt(pinch.z * Math.hypot(p[0] - q[0], p[1] - q[1]) / pinch.d); return; }
    if (v.mode === 'look' && v.z > 1.02) {                     // drag the painting across the view
      stopShow();
      const a = artworks[v.i], p = poseFor(a, v.z, v.px, v.py), mpp = (2 * p.hv) / canvas.clientHeight;
      const dx = -(e.clientX - x0) * mpp, dy = (e.clientY - y0) * mpp;
      v.px += dx; v.py += dy;
      const now = performance.now(), dtm = Math.max(1, now - last.t) / 1000;
      v.dragVel = [dx / dtm, dy / dtm]; last = { t: now, x: e.clientX, y: e.clientY };
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (v.dragVel && performance.now() - last.t < 80) v.vel = v.dragVel.map((q) => THREE.MathUtils.clamp(q, -3, 3));
    v.dragVel = null;
    if (!press) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y, quick = performance.now() - press.t < 600;
    if (v.mode === 'wall' && Math.hypot(dx, dy) < 6) {        // a click on the wall: that painting
      const [nx, ny] = ndc(e), hit = pick(nx, ny);
      if (hit >= 0) goTo(hit);
    } else if (v.mode === 'look' && v.z <= 1.02 && quick && Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) { stopShow(); go(dx < 0 ? 1 : -1); }
    press = null;
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  // which painting on the wall is under the pointer
  const pv = new THREE.Vector3();
  function pick(nx, ny) {
    for (const b of wallOf(artworks[v.i]).on) {
      const { C, R } = frame(b);
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pv.copy(C).addScaledVector(R, sx * b.size[0] / 2).addScaledVector(UP, sy * b.size[1] / 2).project(camera);
        x0 = Math.min(x0, pv.x); x1 = Math.max(x1, pv.x); y0 = Math.min(y0, pv.y); y1 = Math.max(y1, pv.y);
      }
      if (nx > x0 && nx < x1 && ny > y0 && ny < y1) return artworks.indexOf(b);
    }
    return -1;
  }
  function key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'KeyE' || c === 'Backspace') { end(); return; }
    if (c === 'KeyP') { toggleShow(); return; }
    stopShow();
    if (c === 'ArrowRight' || c === 'Space' || c === 'KeyD') { e.preventDefault(); go(1); }
    else if (c === 'ArrowLeft' || c === 'KeyA') { e.preventDefault(); go(-1); }
    else if (c === 'Equal' || c === 'NumpadAdd' || c === 'ArrowUp' || c === 'KeyW') { e.preventDefault(); if (v.mode === 'wall') goTo(v.i); else zoomAt(v.z * 1.4); }
    else if (c === 'Minus' || c === 'NumpadSubtract' || c === 'ArrowDown' || c === 'KeyS') { e.preventDefault(); if (v.z <= 1.02) wall(); else zoomAt(v.z / 1.4); }
    else if (c === 'Digit0') zoomAt(1);
    cap.classList.add('hints'); v.hintT = 3;
  }
  return {
    start, end, go, update, key, zoomAt, wall, toggleShow, pick,
    get active() { return v.active; },
    state: () => ({ active: v.active, index: artworks[v.i]?.index, mode: v.mode, zoom: +v.z.toFixed(2), zmax: +zmax(artworks[v.i] || artworks[0]).toFixed(2), gliding: !!v.glide, show: !!v.show, light: +v.light.toFixed(2) }),
  };
}
