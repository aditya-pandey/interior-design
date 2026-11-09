import * as THREE from 'three';

// Photo mode (V): the world holds still; the camera is free to frame a picture of her and the coast.
//   drag            orbit round the subject          scroll        closer / further
//   W A S D         move the camera's centre         Q / E         down / up
//   [ / ]           lens: wider / longer              F             filter (none, warm, golden, black & white, vivid, film)
//   H               hide the hints                    Space / Enter take the photo (a JPEG is saved)
//   V / Esc         back to the game
// The filter is a CSS filter on the canvas while framing, and the same filter is drawn into the saved picture.

const FILTERS = [
  { name: 'Natural', css: 'none' },
  { name: 'Warm', css: 'sepia(0.22) saturate(1.12) hue-rotate(-6deg)' },
  { name: 'Golden hour', css: 'sepia(0.38) saturate(1.3) brightness(1.04) contrast(1.04)' },
  { name: 'Black & white', css: 'grayscale(1) contrast(1.12) brightness(1.03)' },
  { name: 'Vivid', css: 'saturate(1.45) contrast(1.08)' },
  { name: 'Film', css: 'contrast(0.9) saturate(0.82) sepia(0.16) brightness(1.06)', vignette: true },
];

export function createPhotoMode({ camera, canvas, draw, subject, onEnter, onExit }) {
  let active = false, hintsOn = true, filter = 0;
  const o = { yaw: 0, pitch: 0.15, dist: 3.2, fov: 50, c: new THREE.Vector3() };
  const keys = {};
  const ui = document.createElement('div');
  ui.id = 'photo-ui'; ui.hidden = true;
  ui.innerHTML = `<div class="ph-top"><span class="ph-title">Photo mode</span><span class="ph-filter"></span></div>
    <div class="ph-hints"><span><kbd>Drag</kbd> orbit</span><span><kbd>Scroll</kbd> zoom</span><span><kbd>WASD</kbd> move · <kbd>Q</kbd><kbd>E</kbd> down / up</span><span><kbd>[</kbd><kbd>]</kbd> lens</span><span><kbd>F</kbd> filter</span><span><kbd>H</kbd> hide hints</span><span><kbd>Space</kbd> take photo</span><span><kbd>V</kbd> back</span></div>
    <button class="ph-shoot" aria-label="Take photo"></button><div class="ph-vignette"></div><div class="ph-flash"></div>`;
  document.body.appendChild(ui);
  const label = () => { ui.querySelector('.ph-filter').textContent = `${FILTERS[filter].name} · ${Math.round(o.fov)}°`; };
  const setFilter = () => { canvas.style.filter = active ? FILTERS[filter].css : ''; ui.querySelector('.ph-vignette').style.opacity = active && FILTERS[filter].vignette ? 1 : 0; label(); };

  function enter() {
    if (active) return;
    active = true;
    const s = subject();                                   // { pos, yaw }: her (or the vehicle), and where she faces
    o.c.copy(s.pos);
    // start from where the game's camera is, looking at her
    const d = camera.position.clone().sub(o.c);
    o.dist = THREE.MathUtils.clamp(d.length(), 1.2, 12);
    o.yaw = Math.atan2(d.x, d.z); o.pitch = THREE.MathUtils.clamp(Math.asin(d.y / (d.length() || 1)), -0.3, 1.3);
    o.fov = camera.fov;
    ui.hidden = false; document.body.classList.add('photo');
    setFilter(); onEnter?.();
  }
  function exit() {
    if (!active) return;
    active = false; ui.hidden = true; document.body.classList.remove('photo');
    for (const k in keys) keys[k] = false;
    setFilter(); onExit?.();
  }
  function shoot() {
    draw();                                                 // (read back in the same task as it's drawn)
    const w = canvas.width, h = canvas.height, out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g = out.getContext('2d');
    g.filter = FILTERS[filter].css; g.drawImage(canvas, 0, 0); g.filter = 'none';
    if (FILTERS[filter].vignette) {
      const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(20,12,4,0.55)'); g.fillStyle = r; g.fillRect(0, 0, w, h);
    }
    out.toBlob((b) => {
      const a = document.createElement('a'), t = new Date(), p = (n) => String(n).padStart(2, '0');
      a.href = URL.createObjectURL(b); a.download = `coast-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.jpg`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/jpeg', 0.93);
    const f = ui.querySelector('.ph-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function key(e) {
    if (e.type === 'keyup') { keys[e.code] = false; return; }
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'KeyV' || e.code === 'Escape') exit();
    else if (e.code === 'KeyF') { filter = (filter + 1) % FILTERS.length; setFilter(); }
    else if (e.code === 'KeyH') { hintsOn = !hintsOn; ui.querySelector('.ph-hints').hidden = !hintsOn; ui.querySelector('.ph-top').hidden = !hintsOn; }
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); shoot(); }
    else if (e.code === 'BracketLeft') { o.fov = Math.min(90, o.fov + 5); label(); }
    else if (e.code === 'BracketRight') { o.fov = Math.max(15, o.fov - 5); label(); }
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (active) drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', (e) => {
    if (!active || !drag) return;
    o.yaw -= (e.clientX - drag.x) * 0.006; o.pitch = THREE.MathUtils.clamp(o.pitch + (e.clientY - drag.y) * 0.005, -0.35, 1.45);
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { if (!active) return; e.preventDefault(); o.dist = THREE.MathUtils.clamp(o.dist * Math.exp(e.deltaY * 0.0012), 0.6, 40); }, { passive: false });
  ui.querySelector('.ph-shoot').addEventListener('click', shoot);

  // the camera, each frame while framing
  const fw = new THREE.Vector3(), rt = new THREE.Vector3();
  function update(dt) {
    if (!active) return;
    const mv = 3 * dt * Math.max(1, o.dist / 4);
    fw.set(-Math.sin(o.yaw), 0, -Math.cos(o.yaw)); rt.set(-fw.z, 0, fw.x);
    if (keys.KeyW || keys.ArrowUp) o.c.addScaledVector(fw, mv);
    if (keys.KeyS || keys.ArrowDown) o.c.addScaledVector(fw, -mv);
    if (keys.KeyD || keys.ArrowRight) o.c.addScaledVector(rt, mv);
    if (keys.KeyA || keys.ArrowLeft) o.c.addScaledVector(rt, -mv);
    if (keys.KeyE) o.c.y += mv;
    if (keys.KeyQ) o.c.y = Math.max(0.1, o.c.y - mv);
    const cp = Math.cos(o.pitch);
    camera.position.set(o.c.x + Math.sin(o.yaw) * cp * o.dist, Math.max(0.15, o.c.y + Math.sin(o.pitch) * o.dist), o.c.z + Math.cos(o.yaw) * cp * o.dist);
    camera.up.set(0, 1, 0); camera.lookAt(o.c);
    camera.fov = o.fov; camera.updateProjectionMatrix();
  }
  return { enter, exit, key, update, shoot, get active() { return active; }, set filter(i) { filter = i % FILTERS.length; setFilter(); }, orbit: o };
}
