import * as THREE from 'three';

// Looking at her paintings: the camera leaves her eyes and glides to stand square in front of the painting on the
// wall, near enough that it fills the view (as you would step up to one in a gallery), the real thing in the
// studio's own light. Scroll, pinch or double-click to go closer (the canvas and its paint up close), drag to look
// across it; ← / → glide along to the next one (a quick dip to black if it hangs somewhere else); Esc (or E)
// steps back into her eyes.
//
//   artworks: [{ index, pos: [x, y, z] (centre), normal: [nx, nz] (the way it faces), size: [w, h] }] in hanging order

const FOV = 46;
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function createArtView({ camera, canvas, artworks, total, veil, onStart = () => {}, onEnd = () => {} }) {
  const cap = document.createElement('div');
  cap.id = 'artcap'; cap.hidden = true;
  cap.innerHTML = `<p class="t">Painted by Deepti</p><p class="n"></p>
    <p class="k"><span><kbd>←</kbd><kbd>→</kbd> the next one</span><span>scroll to look closer</span><span><kbd>Esc</kbd> step back</span></p>
    <button class="back" aria-label="Step back">Step back</button>`;
  document.body.append(cap);
  cap.querySelector('.back').addEventListener('click', () => end());

  const v = {
    active: false, i: 0,
    z: 1, px: 0, py: 0,                       // where she's looking (targets)
    cz: 1, cpx: 0, cpy: 0,                    // (smoothed)
    glide: null,                              // { from: {pos, quat, fov}, t, dur, back }
    player: null,                             // her own view, to go back to
    hintT: 0,
  };
  const tmpO = new THREE.PerspectiveCamera();          // (a camera: lookAt points its -z, the way it sees)
  const C = new THREE.Vector3(), N = new THREE.Vector3(), R = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const geo = (a) => {
    C.set(a.pos[0], a.pos[1], a.pos[2]); N.set(a.normal[0], 0, a.normal[1]).normalize(); R.set(-N.z, 0, N.x);
    const t = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const fit = Math.max(0.4, (a.size[1] + 0.12) * 1.18 / (2 * t), (a.size[0] + 0.12) * 1.12 / (2 * t * camera.aspect));
    return { t, fit };
  };
  // the camera for painting a, zoom z, looking at (px, py) on it
  function poseFor(a, z, px, py, out) {
    const { t, fit } = geo(a), dist = fit / z;
    const hv = dist * t, hw = hv * camera.aspect;
    const mx = Math.max(0, a.size[0] / 2 + 0.05 - hw), my = Math.max(0, a.size[1] / 2 + 0.05 - hv);
    px = THREE.MathUtils.clamp(px, -mx, mx); py = THREE.MathUtils.clamp(py, -my, my);
    const look = C.clone().addScaledVector(R, px).addScaledVector(UP, py);
    tmpO.position.copy(look).addScaledVector(N, dist);
    tmpO.lookAt(look);
    out.pos = tmpO.position.clone(); out.quat = tmpO.quaternion.clone(); out.fov = FOV; out.px = px; out.py = py; out.hv = hv; out.hw = hw; out.dist = dist;
    return out;
  }
  const snapshot = () => ({ pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov });

  function caption() {
    cap.querySelector('.n').innerHTML = `${String(artworks[v.i].index + 1).padStart(2, '0')} <span>/ ${total}</span>`;
    cap.classList.add('hints'); v.hintT = 4.5;
  }
  function start(index) {
    const k = artworks.findIndex((a) => a.index === index);
    v.i = k < 0 ? 0 : k;
    v.player = snapshot();
    v.z = v.cz = 1; v.px = v.py = v.cpx = v.cpy = 0;
    v.glide = { from: snapshot(), t: 0, dur: 1.15 };
    v.active = true;
    cap.hidden = false; requestAnimationFrame(() => cap.classList.add('in'));
    caption();
    document.body.classList.add('viewing');
    onStart();
  }
  function go(k) {
    if (!v.active || v.glide?.back) return;
    const from = artworks[v.i], ni = (v.i + k + artworks.length) % artworks.length, to = artworks[ni];
    const far = Math.hypot(from.pos[0] - to.pos[0], from.pos[1] - to.pos[1], from.pos[2] - to.pos[2]) > 4.5 || from.normal[0] * to.normal[0] + from.normal[1] * to.normal[1] < 0.5;
    const swap = () => { v.i = ni; v.z = v.cz = 1; v.px = v.py = v.cpx = v.cpy = 0; caption(); };
    if (far) {                                             // across the studio: a quick dip to black
      veil?.classList.add('on');
      setTimeout(() => { swap(); v.glide = null; setTimeout(() => veil?.classList.remove('on'), 60); }, 420);
    } else { const f = snapshot(); swap(); v.glide = { from: f, t: 0, dur: 1.0 + 0.12 * Math.hypot(from.pos[0] - to.pos[0], from.pos[2] - to.pos[2]) }; }
  }
  function end() {
    if (!v.active || v.glide?.back) return;
    v.glide = { from: snapshot(), t: 0, dur: 0.9, back: true };
    cap.classList.remove('in');
    document.body.classList.remove('viewing');
  }
  const pose = {};
  function update(dt) {
    if (!v.active) return false;
    { const lim = poseFor(artworks[v.i], v.z, v.px, v.py, {}); v.px = lim.px; v.py = lim.py; }      // (the target stays on the painting)
    v.cz = damp(v.cz, v.z, 9, dt); v.cpx = damp(v.cpx, v.px, 9, dt); v.cpy = damp(v.cpy, v.py, 9, dt);
    const a = artworks[v.i];
    poseFor(a, v.cz, v.cpx, v.cpy, pose);
    let target = pose;
    if (v.glide?.back) target = v.player;
    if (v.glide) {
      v.glide.t += dt / v.glide.dur;
      const e = smooth(Math.min(1, v.glide.t)), f = v.glide.from;
      camera.position.lerpVectors(f.pos, target.pos, e);
      camera.quaternion.slerpQuaternions(f.quat, target.quat, e);
      camera.fov = THREE.MathUtils.lerp(f.fov, target.fov, e);
      if (v.glide.t >= 1) {
        if (v.glide.back) { v.active = false; v.glide = null; cap.hidden = true; onEnd(); camera.updateProjectionMatrix(); return false; }
        v.glide = null;
      }
    } else { camera.position.copy(pose.pos); camera.quaternion.copy(pose.quat); camera.fov = FOV; }
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    if (v.hintT > 0) { v.hintT -= dt; if (v.hintT <= 0) cap.classList.remove('hints'); }
    return true;
  }
  // closer, about the point under the pointer (nx, ny in -1..1)
  function zoomAt(nz, nx = 0, ny = 0) {
    const a = artworks[v.i];
    nz = THREE.MathUtils.clamp(nz, 1, 5);
    const p0 = poseFor(a, v.z, v.px, v.py, {}), qx = p0.px + nx * p0.hw, qy = p0.py + ny * p0.hv;
    const p1 = poseFor(a, nz, 0, 0, {});
    v.z = nz; const c = poseFor(a, nz, qx - nx * p1.hw, qy - ny * p1.hv, {}); v.px = c.px; v.py = c.py;
    if (nz === 1) v.px = v.py = 0;
  }
  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
  canvas.addEventListener('wheel', (e) => { if (!v.active || v.glide) return; e.preventDefault(); const [nx, ny] = ndc(e); zoomAt(v.z * Math.exp(-e.deltaY * 0.0018), nx, ny); }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { if (!v.active) return; const [nx, ny] = ndc(e); zoomAt(v.z > 1.05 ? 1 : 2.6, nx, ny); });
  const ptrs = new Map();
  let pinch = null, swipe = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!v.active) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    swipe = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), z: v.z }; }
  });
  window.addEventListener('pointermove', (e) => {
    if (!v.active || !ptrs.has(e.pointerId)) return;
    const [x0, y0] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [p, q] = [...ptrs.values()]; zoomAt(pinch.z * Math.hypot(p[0] - q[0], p[1] - q[1]) / pinch.d); return; }
    if (v.z > 1.02) {                                          // drag the painting across the view
      const a = artworks[v.i], p = poseFor(a, v.z, v.px, v.py, {}), mpp = (2 * p.hv) / canvas.clientHeight;
      const c = poseFor(a, v.z, v.px - (e.clientX - x0) * mpp, v.py + (e.clientY - y0) * mpp, {}); v.px = c.px; v.py = c.py;
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (swipe && v.z <= 1.02) { const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && performance.now() - swipe.t < 600) go(dx < 0 ? 1 : -1); }
    swipe = null;
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  function key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'KeyE' || c === 'Backspace') { end(); return; }
    if (c === 'ArrowRight' || c === 'Space' || c === 'KeyD') { e.preventDefault(); go(1); }
    else if (c === 'ArrowLeft' || c === 'KeyA') { e.preventDefault(); go(-1); }
    else if (c === 'Equal' || c === 'NumpadAdd' || c === 'ArrowUp' || c === 'KeyW') { e.preventDefault(); zoomAt(v.z * 1.4); }
    else if (c === 'Minus' || c === 'NumpadSubtract' || c === 'ArrowDown' || c === 'KeyS') { e.preventDefault(); zoomAt(v.z / 1.4); }
    else if (c === 'Digit0') zoomAt(1);
    cap.classList.add('hints'); v.hintT = 3;
  }
  return { start, end, go, update, key, zoomAt, get active() { return v.active; }, state: () => ({ active: v.active, index: artworks[v.i]?.index, zoom: +v.z.toFixed(2), gliding: !!v.glide }) };
}
