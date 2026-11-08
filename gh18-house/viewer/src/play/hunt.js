import * as THREE from 'three';
import { SERIF, SANS, DEVA } from './fonts.js';

// Letters for her, hidden round the world: a treasure hunt.
//
// pack.letters: [{ place, title?, text, photo?, audio?, hint?, sign? }] in the order they're meant to be found.
// Each place is one of the spots below (main.js gives their positions). The first (place "car") is waiting on
// the passenger seat when she starts the drive; the last (place "lighthouse-top") only opens once she has found
// all the others, and then the sun goes down and sky lanterns rise past her from the beach.
//
// An envelope (cream, a red wax seal; gold for the last) floats and turns slowly where it's hidden, glowing
// softly, with a few sparkles round it when she's near. E (or a click) and it comes to her and the letter unfolds
// in her hands, as the e-reader does: his words in ink on cream paper, a photograph if there is one, his voice if
// there's a recording (her music goes quiet for it). ← → for the next sheet of a long letter, Esc or E puts it
// away. A hint to the next one at the foot of each. "✉ 3 / 12" by the clock; a click there lists those found, to
// read again.

export const PLACES = {
  car: 'On the passenger seat', mandir: 'The mandir', kitchen: 'The kitchen', master: 'The master bedroom', 'house-terrace': 'The front terrace',
  nook: 'The reading nook', record: 'The record player', gallery: 'The gallery bench', desk: 'Her writing desk', terrace: "The studio's roof terrace",
  court: 'The court', fire: 'The fire on the beach', 'lighthouse-top': 'The top of the lighthouse',
};
const PW = 0.148, PH = 0.21;                 // a sheet: A5
const CW = 1240, CH = 1760;

export function createHunt({ pack, base = 'play/deepti/', scene, camera, spots, onOpen = () => {}, onClose = () => {}, onFinale = () => {}, onVoice = () => {}, onFound = () => {} }) {
  const letters = (pack?.letters || []).map((l, i) => ({ ...l, i, id: l.place || 'letter' + i }));
  const last = letters[letters.length - 1];
  let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem('gh18.letters') || '[]')); } catch { /* */ }
  const save = () => { try { localStorage.setItem('gh18.letters', JSON.stringify([...found])); } catch { /* */ } };

  // ---------------------------------------------------------------- the envelopes where they're hidden
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,230,180,0.9)'); r.addColorStop(0.35, 'rgba(255,210,150,0.35)'); r.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const envTex = (gold) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 352; const g = c.getContext('2d');
    g.fillStyle = '#f3ead9'; g.fillRect(0, 0, 512, 352);
    g.strokeStyle = 'rgba(120,90,60,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 200); g.lineTo(512, 0); g.stroke();
    g.beginPath(); g.moveTo(0, 352); g.lineTo(200, 175); g.moveTo(512, 352); g.lineTo(312, 175); g.stroke();
    g.fillStyle = gold ? '#c99a3b' : '#9e2a2b'; g.beginPath(); g.arc(256, 196, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = gold ? '#e8c46a' : '#c0392b'; g.beginPath(); g.arc(256, 196, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = gold ? '#8a6420' : '#6e1a1b'; g.font = `italic 400 40px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('D', 256, 199);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const envMat = [new THREE.MeshStandardMaterial({ map: envTex(false), roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: envTex(true), roughness: 0.7 })];
  const backMat = new THREE.MeshStandardMaterial({ color: 0xefe5d2, roughness: 0.85 });
  const envGeo = new THREE.BoxGeometry(0.27, 0.185, 0.007);
  const envMesh = (gold) => new THREE.Mesh(envGeo, [backMat, backMat, backMat, backMat, envMat[gold ? 1 : 0], backMat]);
  const group = new THREE.Group(); group.name = 'letters'; scene.add(group);
  const envs = [];
  for (const l of letters) {
    const sp = spots[l.place];
    if (!sp || l.place === 'car') continue;
    const g = new THREE.Group(); g.position.set(sp[0], sp[1], sp[2]);
    const m = envMesh(l === last); g.add(m);
    // (points, not sprites: the ambient-occlusion pass leaves points alone, a sprite would darken up close)
    const glow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), new THREE.PointsMaterial({ map: glowTex, size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    g.add(glow);
    const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3)), new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a8, size: 0.06, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(sparks); group.add(g);
    envs.push({ l, g, m, glow, sparks, phase: Math.random() * 6 });
  }
  const interact = envs.map((e) => ({ kind: 'letter', id: e.l.id, label: e.l === last ? 'Open the last letter' : 'Open the letter', pos: [e.g.position.x, e.g.position.y, e.g.position.z], r: 2.0, env: e }));

  // ---------------------------------------------------------------- the letter in her hands
  const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const paperMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, emissive: 0xfff3e2, emissiveMap: tex, emissiveIntensity: 0.22, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const paperGeo = new THREE.PlaneGeometry(PW, PH, 1, 12);
  { const p = paperGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) / PH + 0.5) * Math.PI) * 0.004); paperGeo.computeVertexNormals(); }   // (a gentle bow)
  const paper = new THREE.Mesh(paperGeo, paperMat); paper.renderOrder = 1001; paper.visible = false; scene.add(paper);
  const heldEnv = envMesh(false); heldEnv.material = heldEnv.material.map((m) => { const q = m.clone(); q.depthTest = false; q.transparent = true; return q; }); heldEnv.renderOrder = 1000; heldEnv.visible = false; scene.add(heldEnv);
  const veilMat = new THREE.MeshBasicMaterial({ color: 0x0b0907, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), veilMat); veil.renderOrder = 999; veil.visible = false; scene.add(veil);
  const hint = document.createElement('div');
  hint.id = 'letterhint'; hint.hidden = true;
  hint.innerHTML = `<span class="sheets"><kbd>←</kbd><kbd>→</kbd> the next page</span><span><kbd>Esc</kbd> put it away</span><span class="voice">▶ his voice</span><button>Put it away</button>`;
  document.body.append(hint);
  hint.querySelector('button').addEventListener('click', () => close());

  const photos = new Map();
  const photoOf = (l) => {
    if (!l.photo) return null;
    if (!photos.has(l.photo)) { const im = new Image(); im.onload = () => { if (cur === l) draw(); }; im.src = base + l.photo; photos.set(l.photo, im); }
    const im = photos.get(l.photo); return im.complete && im.naturalWidth ? im : null;
  };
  // the letter set in pages: ink on cream, a photograph at the top of the first if there is one
  const hindi = (s) => /[ऀ-ॿ]/.test(s || '');
  function pages(l) {
    const M = { x0: 130, x1: CW - 130, top: 170, bottom: CH - 170 };
    const hi = hindi(l.text), size = hi ? 52 : 60, lh = Math.round(size * (hi ? 1.85 : 1.48)), font = hi ? `400 ${size}px ${DEVA}` : `italic 400 ${size}px ${SERIF}`;
    const out = [[]]; let y = 0;
    const put = (o) => { if (y + o.h > M.bottom - M.top && out[out.length - 1].length) { out.push([]); y = 0; } out[out.length - 1].push({ ...o, y }); y += o.h; };
    if (l.photo) put({ kind: 'photo', h: 560 });
    if (l.title !== '') put({ kind: 'text', text: l.title || 'My dear Deepti,', font, h: lh * 1.5 });
    const body = l.text && l.text.trim() ? l.text : `(Aditya: this letter, "${PLACES[l.place] || l.place}", is still to be written. Open play/deepti/pack.json and put it in "letters".)`;
    ctx.font = font;
    for (const para of body.split(/\n\s*\n/)) {
      for (const line of para.split('\n')) {
        let cur2 = '';
        for (const w of line.split(/\s+/)) { const t = cur2 ? cur2 + ' ' + w : w; if (cur2 && ctx.measureText(t).width > M.x1 - M.x0) { put({ kind: 'text', text: cur2, font, h: lh }); cur2 = w; } else cur2 = t; }
        put({ kind: 'text', text: cur2, font, h: lh });
      }
      put({ kind: 'gap', h: lh * 0.55 });
    }
    put({ kind: 'sign', text: l.sign || '— Aditya', font: `italic 400 ${size + 8}px ${SERIF}`, h: lh * 1.6 });
    if (l.hint) put({ kind: 'hint', text: l.hint, font: `italic 400 ${Math.round(size * 0.8)}px ${SERIF}`, h: lh * 2 });
    if (out.length === 1) { const off = Math.max(0, (M.bottom - M.top - y) / 2 - 40); for (const o of out[0]) o.y += off; }
    return { M, list: out };
  }
  let cur = null, page = 0, laid = null;
  function draw() {
    const l = cur; if (!l) return;
    laid = laid || pages(l);
    const { M, list } = laid, pg = list[Math.min(page, list.length - 1)];
    // cream paper, a little grain, a soft edge
    ctx.fillStyle = '#f7f0e2'; ctx.fillRect(0, 0, CW, CH);
    const r = (() => { let s = 7 + l.i; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(120,95,60,${r() * 0.04})`; ctx.fillRect(r() * CW, r() * CH, 1.6, 1.6); }
    const edge = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.35, CW / 2, CH / 2, CH * 0.75); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(150,110,60,0.18)'); ctx.fillStyle = edge; ctx.fillRect(0, 0, CW, CH);
    ctx.textBaseline = 'alphabetic';
    for (const o of pg) {
      const y = M.top + o.y;
      if (o.kind === 'photo') {
        const im = photoOf(l), w = M.x1 - M.x0 - 80, h = o.h - 60;
        ctx.save(); ctx.translate(CW / 2, y + o.h / 2 - 20); ctx.rotate(-0.025);
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillRect(-w / 2 - 18, -h / 2 - 18, w + 36, h + 36); ctx.shadowColor = 'transparent';
        if (im) { const s = Math.max(w / im.naturalWidth, h / im.naturalHeight), sw = w / s, sh = h / s; ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, -w / 2, -h / 2, w, h); }
        else { ctx.fillStyle = '#e6dccb'; ctx.fillRect(-w / 2, -h / 2, w, h); }
        ctx.restore(); continue;
      }
      if (o.kind === 'gap') continue;
      ctx.font = o.font; ctx.fillStyle = o.kind === 'hint' ? '#8a6a48' : '#23264a';           // (blue-black ink; the hint in sepia)
      if (o.kind === 'sign') { ctx.textAlign = 'right'; ctx.fillText(o.text, M.x1, y + o.h * 0.7); }
      else if (o.kind === 'hint') { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(176,141,87,0.9)'; ctx.fillRect(CW / 2 - 40, y + 6, 80, 2); ctx.fillStyle = '#8a6a48'; ctx.fillText('P.S. ' + o.text, CW / 2, y + o.h * 0.62); }
      else { ctx.textAlign = 'left'; ctx.fillText(o.text, M.x0, y + o.h * 0.72); }
    }
    if (list.length > 1) { ctx.font = `500 26px ${SANS}`; ctx.fillStyle = '#9a8a72'; ctx.textAlign = 'center'; ctx.fillText(`${page + 1} / ${list.length}`, CW / 2, CH - 70); }
    tex.needsUpdate = true;
    hint.querySelector('.sheets').style.display = list.length > 1 ? '' : 'none';
  }

  const anim = { open: false, t: 0, src: null, srcEnv: null };
  const start = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const holdP = new THREE.Vector3(), holdQ = new THREE.Quaternion(), e1 = new THREE.Euler(), inv = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), sc = new THREE.Vector3();
  let voice = null, finaleWanted = false;
  function open(id, envEntry = null) {
    const l = letters.find((q) => q.id === id); if (!l) return;
    if (l === last && letters.some((q) => q !== last && !found.has(q.id))) {
      const left = letters.filter((q) => q !== last && !found.has(q.id)).length;
      return { locked: left };
    }
    cur = l; page = 0; laid = null; draw();
    camera.updateMatrixWorld(true); inv.copy(camera.matrixWorld).invert();
    if (envEntry) { envEntry.g.updateMatrixWorld(true); tmpM.multiplyMatrices(inv, envEntry.m.matrixWorld).decompose(start.pos, start.quat, sc); envEntry.g.visible = false; anim.srcEnv = envEntry; }
    else { start.pos.set(0.05, -0.25, -0.35); start.quat.setFromEuler(e1.set(-0.9, 0, 0.2)); anim.srcEnv = null; }
    anim.open = true; anim.t = 0;
    paper.visible = heldEnv.visible = veil.visible = true;
    if (!found.has(l.id)) { found.add(l.id); save(); onFound(found.size, letters.length, l); }
    hint.hidden = false; requestAnimationFrame(() => hint.classList.add('in'));
    hint.querySelector('.voice').style.display = l.audio ? '' : 'none';
    if (l.audio) { voice = new Audio(base + l.audio); onVoice(true); voice.play().catch(() => {}); voice.onended = () => { onVoice(false); hint.querySelector('.voice').textContent = '▶ his voice (again: V)'; }; }
    if (l === last) finaleWanted = true;
    onOpen();
    return { opened: true };
  }
  function close() {
    if (!anim.open) return;
    anim.open = false; anim.t = Math.min(anim.t, 1);
    hint.classList.remove('in'); setTimeout(() => { if (!anim.open) hint.hidden = true; }, 500);
    if (voice) { voice.pause(); voice = null; onVoice(false); }
    onClose();
    if (finaleWanted) { finaleWanted = false; setTimeout(() => onFinale(), 900); }
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function hold() {
    const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), d = Math.max((PH / 0.84) / (2 * tn), (PW / 0.9) / (2 * tn * camera.aspect));
    const s = performance.now() / 1000;
    holdP.set(Math.sin(s * 0.7) * 0.0008, -0.002, -d); holdQ.setFromEuler(e1.set(-0.06 + Math.sin(s * 0.9) * 0.004, Math.sin(s * 0.6) * 0.006, 0.012));
  }
  function update(t, dt, eye) {
    // the hidden ones: a slow turn and bob; brighter and sparkling when she's near
    for (const e of envs) {
      if (!e.g.visible) continue;
      if (found.has(e.l.id) && e.l !== last) { e.g.visible = false; continue; }
      const d = eye ? e.g.position.distanceTo(eye) : 99, near = THREE.MathUtils.clamp(1 - (d - 2) / 12, 0, 1);
      e.m.rotation.y = t * 0.7 + e.phase; e.m.position.y = Math.sin(t * 1.4 + e.phase) * 0.04;
      e.glow.material.opacity = 0.25 + 0.45 * near + Math.sin(t * 2.3 + e.phase) * 0.06;
      const p = e.sparks.geometry.attributes.position;
      for (let k = 0; k < 14; k++) { const a = t * (0.6 + k * 0.05) + k * 1.7 + e.phase, r = 0.18 + 0.1 * Math.sin(t * 0.8 + k); p.setXYZ(k, Math.cos(a) * r, Math.sin(t * 1.1 + k * 2.1) * 0.16, Math.sin(a) * r); }
      p.needsUpdate = true; e.sparks.material.opacity = 0.85 * near;
    }
    if (!paper.visible) return;
    anim.t = THREE.MathUtils.clamp(anim.t + (anim.open ? dt / 0.9 : -dt / 0.5), 0, 1);
    hold();
    camera.updateMatrixWorld(true);
    const k = ease(anim.t);
    // the envelope comes to her, then the letter rises out of it and opens out to its full size
    const kE = ease(THREE.MathUtils.clamp(anim.t / 0.55, 0, 1)), kP = ease(THREE.MathUtils.clamp((anim.t - 0.35) / 0.65, 0, 1));
    const envPos = start.pos.clone().lerp(holdP.clone().add(new THREE.Vector3(0, -0.02 - 0.25 * kP, 0.01)), kE), envQ = start.quat.clone().slerp(holdQ, kE);
    heldEnv.position.copy(envPos).applyMatrix4(camera.matrixWorld); heldEnv.quaternion.copy(camera.quaternion).multiply(envQ);
    heldEnv.visible = anim.t < 0.98 && anim.open || (!anim.open && anim.t > 0.02);
    const pPos = envPos.clone().lerp(holdP, kP);
    paper.position.copy(pPos).applyMatrix4(camera.matrixWorld); paper.quaternion.copy(camera.quaternion).multiply(holdQ);
    paper.scale.set(0.6 + 0.4 * kP, 0.25 + 0.75 * kP, 1); paperMat.opacity = Math.min(1, kP * 1.5);
    veil.position.set(0, 0, -0.5).applyMatrix4(camera.matrixWorld); veil.quaternion.copy(camera.quaternion); veilMat.opacity = 0.55 * k;
    if (!anim.open && anim.t <= 0) { paper.visible = heldEnv.visible = veil.visible = false; if (anim.srcEnv && anim.srcEnv.l === last) anim.srcEnv.g.visible = false; cur = null; }
  }
  function key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'KeyE' || c === 'Backspace') { close(); return; }
    const n = laid?.list.length || 1;
    if ((c === 'ArrowRight' || c === 'Space' || c === 'PageDown') && page < n - 1) { e.preventDefault(); page++; draw(); }
    else if ((c === 'ArrowLeft' || c === 'PageUp') && page > 0) { e.preventDefault(); page--; draw(); }
    else if (c === 'KeyV' && cur?.audio) { voice?.pause(); voice = new Audio(base + cur.audio); onVoice(true); voice.play().catch(() => {}); voice.onended = () => onVoice(false); }
  }
  function click(nx) { const n = laid?.list.length || 1; if (nx > 0 && page < n - 1) { page++; draw(); } else if (nx < 0 && page > 0) { page--; draw(); } else close(); }
  return {
    letters, interact, open, close, update, key, click, PLACES,
    get isOpen() { return anim.open; }, get busy() { return paper.visible; },
    found: () => [...found], count: () => found.size, total: letters.length,
    carPending: () => letters.some((l) => l.place === 'car' && !found.has(l.id)),
    reset: () => { found.clear(); save(); for (const e of envs) e.g.visible = true; },
    state: () => ({ open: anim.open, page, pages: laid?.list.length || 0, found: [...found], cur: cur?.id }),
  };
}

// ---------------------------------------------------------------- the finale: sky lanterns rising from the beach
export function skyLanterns(scene, { x0, x1, z0, z1, n = 90 }) {
  const geo = new THREE.CylinderGeometry(0.2, 0.15, 0.42, 10, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb066, side: THREE.DoubleSide, transparent: true, opacity: 0.95, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.frustumCulled = false; mesh.renderOrder = 7;
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,190,110,0.85)'); r.addColorStop(0.4, 'rgba(255,150,70,0.25)'); r.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const hp = new Float32Array(n * 3).fill(-1e4);
  const halos = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(hp, 3)), new THREE.PointsMaterial({ map: glowTex, size: 1.8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halos.frustumCulled = false; halos.renderOrder = 8;
  scene.add(mesh, halos);
  const L = Array.from({ length: n }, () => ({ x: x0 + Math.random() * (x1 - x0), z: z0 + Math.random() * (z1 - z0), y: 0.6 + Math.random() * 1.5, at: Math.random() * 28, v: 0.7 + Math.random() * 0.6, ph: Math.random() * 6 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let t = 0;
  const api = {
    running: false,
    start() { api.running = true; t = 0; },
    update(dt, camera) {
      t += dt;
      L.forEach((l, i) => {
        const age = t - l.at, on = age > 0;
        const y = on ? l.y + age * l.v : -100;
        p.set(l.x + (on ? Math.sin(age * 0.4 + l.ph) * 1.2 + age * 0.35 : 0), y, l.z + (on ? age * 0.25 : 0));
        const flick = 0.9 + 0.1 * Math.sin(t * 9 + l.ph * 3);
        s.setScalar(on && y < 260 ? 1 : 0); q.identity(); m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
        if (on && y < 260) hp.set([p.x, p.y + 0.05 * flick, p.z], i * 3); else hp.set([0, -1e4, 0], i * 3);
      });
      mesh.instanceMatrix.needsUpdate = true; halos.geometry.attributes.position.needsUpdate = true;
      if (t > 300) api.running = false;
    },
  };
  // (all hidden until the finale: in the scene from the start, so their shaders are ready)
  const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < n; i++) mesh.setMatrixAt(i, z);
  return api;
}
