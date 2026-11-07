import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SERIF, SANS, DEVA } from './fonts.js';
import { DEVANAGARI } from './studio.js';

// Her e-reader. A slim e-ink reader she picks up (from the desk, the window bed or the nook, or when she goes to
// read a poem on the wall): it comes up into her hands in front of the camera, the studio still there behind it,
// softly darkened. The screen is e-ink: her poems set like a book, a page at a time, a library of all of them,
// the black flash of an e-ink refresh when a page turns, a warm front light that comes up after dark.
//
//   → / Space / a click on the right of the screen: next page       ← / a click on the left: back
//   ↑ ↓: the poem before / after    L: the library (↑ ↓ and Enter, or a click on a title)    − / +: type size
//   Esc or E: put it down (back where it came from)
//
// The screen is a 1200 × 1600 canvas: everything on it is typeset here (wrapping, stanzas kept together, short
// poems centred on their page).

const CW = 1200, CH = 1600;
const SIZE = [0.86, 1, 1.16];
// the device: about a Paperwhite (125 × 174 × 8 mm, a 3 : 4 screen)
const BW = 0.1255, BH = 0.1745, BD = 0.0082, SW = 0.1056, SH = 0.1408, SY = 0.0055;
const INK = '#0d0c0b', GREY = '#5c5852', PAPER = '#e9e6de';

export function createEReader({ pack, camera, scene, clockLabel = () => '', onOpen = () => {}, onClose = () => {} }) {
  const poems = pack?.poems || [];
  const hindi = (p) => DEVANAGARI.test(p.title + p.stanzas.flat().join(''));
  const hers = (p) => !p.author || /deepti/i.test(p.author);
  let prefs = { poem: 0, size: 1 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('deepti-ereader') || '{}')); } catch { /* */ }
  const save = () => { try { localStorage.setItem('deepti-ereader', JSON.stringify(prefs)); } catch { /* */ } };

  // ---------------------------------------------------------------- the device
  const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const onTop = (m, order) => { m.depthTest = false; m.depthWrite = false; return order; };
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.55, metalness: 0.05, transparent: true });       // (transparent: drawn in order, over the veil)
  const screenMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0, emissive: 0xfff1dc, emissiveMap: tex, emissiveIntensity: 0.2, transparent: true });
  const device = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 4, 0.0072), shellMat); body.renderOrder = onTop(shellMat, 1000);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMat); screen.position.set(0, SY, BD / 2 + 0.00015); screen.renderOrder = onTop(screenMat, 1001);
  // her name, small, on the bottom bezel
  const lc = document.createElement('canvas'); lc.width = 256; lc.height = 48;
  const lg = lc.getContext('2d'); lg.fillStyle = '#8b867e'; lg.font = `italic 400 30px ${SERIF}`; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('Deepti', 128, 26);
  const logoMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.75 });
  logoMat.map.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0056), logoMat); logo.position.set(0, -BH / 2 + 0.0105, BD / 2 + 0.0002); logo.renderOrder = onTop(logoMat, 1002);
  device.add(body, screen, logo);
  device.visible = false;
  scene.add(device);
  // the room behind goes quiet while she reads
  const veilMat = new THREE.MeshBasicMaterial({ color: 0x0b0907, transparent: true, opacity: 0 });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), veilMat); veil.renderOrder = onTop(veilMat, 999); veil.visible = false;
  scene.add(veil);

  // a quiet line of keys under it (a button to put it down on a touch screen)
  const hint = document.createElement('div');
  hint.id = 'readhint'; hint.hidden = true;
  hint.innerHTML = `<span><kbd>←</kbd><kbd>→</kbd> turn the page</span><span><kbd>↑</kbd><kbd>↓</kbd> another poem</span><span><kbd>L</kbd> library</span><span><kbd>Esc</kbd> put it down</span><button>Put it down</button>`;
  document.body.append(hint);
  hint.querySelector('button').addEventListener('click', () => close());
  let hintT = 0;

  // ---------------------------------------------------------------- typesetting
  const fonts = (p, s) => {
    const hi = hindi(p);
    return {
      hi,
      body: hi ? `400 ${Math.round(40 * s)}px ${DEVA}` : `500 ${Math.round(47 * s)}px ${SERIF}`,
      em: hi ? `400 ${Math.round(40 * s)}px ${DEVA}` : `italic 400 ${Math.round(47 * s)}px ${SERIF}`,
      lh: hi ? Math.round(40 * s * 2.0) : Math.round(47 * s * 1.5),
      title: hi ? `400 ${Math.round(66 * s)}px ${DEVA}` : `italic 400 ${Math.round(86 * s)}px ${SERIF}`,
      titleLh: hi ? Math.round(66 * s * 1.5) : Math.round(86 * s * 1.12),
    };
  };
  const M = { x0: 104, x1: CW - 104, top: 150, bottom: CH - 160 };
  const wrap = (text, font, width) => {
    g.font = font;
    if (g.measureText(text).width <= width) return [text];
    const out = []; let cur = '';
    for (const w of text.split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (cur && g.measureText(t).width > width) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur);
    return out;
  };
  // a poem → pages of lines to draw: { text, font, y, color, kind }
  const layoutCache = new Map();
  function typeset(i) {
    const key = i + ':' + prefs.size;
    if (layoutCache.has(key)) return layoutCache.get(key);
    const p = poems[i], s = SIZE[prefs.size], f = fonts(p, s), width = M.x1 - M.x0, avail = M.bottom - M.top;
    const blocks = [];
    // the title block
    const tl = [{ text: hers(p) ? 'A POEM BY DEEPTI' : `FOR DEEPTI  ·  FROM ${p.author.toUpperCase()}`, font: `600 ${Math.round(21 * s)}px ${DEVANAGARI.test(p.author || '') ? DEVA : SANS}`, h: Math.round(56 * s), color: GREY, spaced: 5, kind: 'kicker' }];
    for (const t of wrap(p.title, f.title, width)) tl.push({ text: t, font: f.title, h: f.titleLh, color: INK });
    tl.push({ kind: 'orn', h: Math.round(64 * s) });
    if (p.date) tl.push({ text: p.date.toUpperCase(), font: `600 ${Math.round(20 * s)}px ${SANS}`, h: Math.round(40 * s), color: GREY, spaced: 4 });
    tl.push({ kind: 'gap', h: Math.round(44 * s) });
    blocks.push({ lines: tl, keep: true });
    for (const st of p.stanzas) {
      const lines = [];
      for (const ln of st) {
        const t = ln.trim(), em = /^\*.*\*$/.test(t), txt = em ? t.slice(1, -1) : ln;
        for (const part of wrap(txt, em ? f.em : f.body, width)) lines.push({ text: part, font: em ? f.em : f.body, h: f.lh, color: INK });
      }
      lines.push({ kind: 'gap', h: Math.round(f.lh * 0.62) });
      blocks.push({ lines, keep: st.length <= 8 });
    }
    blocks.push({ lines: [{ text: '— ' + (p.author || 'Deepti'), font: hindi({ title: p.author || '', stanzas: [] }) ? `400 ${Math.round(36 * s)}px ${DEVA}` : `italic 400 ${Math.round(44 * s)}px ${SERIF}`, h: Math.round(70 * s), color: '#5d564c' }], keep: true });
    const pages = [[]];
    let y = 0;
    const put = (ln) => { pages[pages.length - 1].push({ ...ln, y }); y += ln.h; };
    for (const b of blocks) {
      const need = b.lines.reduce((m, l) => m + l.h, 0) - (b.lines.at(-1).kind === 'gap' ? b.lines.at(-1).h : 0);
      if (y + need > avail && y > 0 && b.keep && need <= avail) { pages.push([]); y = 0; }
      for (const ln of b.lines) {
        if (y + ln.h > avail && ln.kind !== 'gap') { pages.push([]); y = 0; }
        if (ln.kind === 'gap' && y === 0) continue;
        put(ln);
      }
    }
    // a poem on one page sits in its middle
    if (pages.length === 1) { const used = y - (pages[0].at(-1)?.kind === 'gap' ? pages[0].at(-1).h : 0), off = Math.max(0, (avail - used) / 2 - 20); for (const l of pages[0]) l.y += off; }
    layoutCache.set(key, pages);
    return pages;
  }

  // ---------------------------------------------------------------- drawing the screen
  const grain = (() => {                                  // the e-ink's paper (drawn once, reused)
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const q = c.getContext('2d'); q.fillStyle = PAPER; q.fillRect(0, 0, CW, CH);
    let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26000; i++) { q.fillStyle = `rgba(40,36,30,${rnd() * 0.035})`; q.fillRect(rnd() * CW, rnd() * CH, 1.6, 1.6); }
    return c;
  })();
  const spacedText = (text, x, y, sp, align) => {
    if ('letterSpacing' in g) { g.letterSpacing = sp + 'px'; g.textAlign = align; g.fillText(text, x, y); g.letterSpacing = '0px'; return; }
    g.textAlign = align; g.fillText(text, x, y);
  };
  function chrome(left, right, progress) {
    g.fillStyle = GREY; g.font = `500 22px ${SANS}`; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('Deepti’s Reader', M.x0, 74);
    g.textAlign = 'right'; g.fillText(clockLabel(), M.x1, 74);
    g.fillStyle = 'rgba(27,26,24,0.14)'; g.fillRect(M.x0, 104, M.x1 - M.x0, 1.5);
    g.fillStyle = GREY; g.font = `500 22px ${left.hi ? DEVA : SANS}`;
    g.textAlign = 'left'; g.fillText(left.text, M.x0, CH - 74);
    g.font = `500 22px ${SANS}`; g.textAlign = 'right'; g.fillText(right, M.x1, CH - 74);
    if (progress != null) {
      g.fillStyle = 'rgba(27,26,24,0.14)'; g.fillRect(M.x0, CH - 112, M.x1 - M.x0, 3);
      g.fillStyle = INK; g.fillRect(M.x0, CH - 112, (M.x1 - M.x0) * progress, 3);
    }
  }
  function drawPage() {
    const pages = typeset(prefs.poem), pg = pages[view.page] || pages[0], p = poems[prefs.poem];
    g.drawImage(grain, 0, 0);
    g.textBaseline = 'alphabetic';
    for (const l of pg) {
      const y = M.top + l.y;
      if (l.kind === 'orn') {
        const cy = y + l.h / 2, cx = CW / 2;
        g.fillStyle = INK; g.fillRect(cx - 74, cy, 54, 1.6); g.fillRect(cx + 20, cy, 54, 1.6);
        g.save(); g.translate(cx, cy + 1); g.rotate(Math.PI / 4); g.fillRect(-6, -6, 12, 12); g.restore();
        continue;
      }
      if (l.kind === 'gap') continue;
      g.fillStyle = l.color; g.font = l.font;
      const base = y + l.h * 0.72;
      if (l.spaced) spacedText(l.text, CW / 2, base, l.spaced, 'center');
      else { g.textAlign = 'center'; g.fillText(l.text, CW / 2, base); if (l.color === INK) { g.strokeStyle = INK; g.lineWidth = 0.9; g.strokeText(l.text, CW / 2, base); } }
    }
    chrome({ text: p.title, hi: hindi(p) }, pages.length > 1 ? `Page ${view.page + 1} of ${pages.length}` : `${prefs.poem + 1} of ${poems.length}`, (view.page + 1) / pages.length);
  }
  let rows = [];
  function drawLibrary() {
    g.drawImage(grain, 0, 0);
    g.fillStyle = INK; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = `italic 400 76px ${SERIF}`; g.fillText('Library', M.x0, 238);
    g.fillStyle = GREY; g.font = `500 22px ${SANS}`; g.fillText(`${poems.length} poems`, M.x0 + 4, 284);
    const order = [...poems.map((p, i) => i).filter((i) => hers(poems[i])), ...poems.map((p, i) => i).filter((i) => !hers(poems[i]))];
    rows = [];
    let y = 330, section = null;
    const RH = Math.min(104, (M.bottom - 330 - 2 * 74) / Math.max(1, poems.length));
    for (const i of order) {
      const p = poems[i], sec = hers(p) ? 'HER POEMS' : 'FOR HER';
      if (sec !== section) { section = sec; y += 26; g.fillStyle = GREY; g.font = `600 20px ${SANS}`; spacedText(sec, M.x0, y + 20, 5, 'left'); y += 48; }
      const on = i === view.sel;
      if (on) { g.fillStyle = INK; g.fillRect(M.x0 - 22, y, M.x1 - M.x0 + 44, RH - 8); }
      g.fillStyle = on ? PAPER : INK; g.textAlign = 'left';
      g.font = hindi(p) ? `400 ${Math.round(RH * 0.36)}px ${DEVA}` : `italic 400 ${Math.round(RH * 0.44)}px ${SERIF}`;
      let title = p.title; while (g.measureText(title).width > M.x1 - M.x0 - 200 && title.length > 4) title = title.slice(0, -2);
      g.fillText(title === p.title ? title : title + '…', M.x0, y + RH * 0.56);
      g.fillStyle = on ? '#cfcac0' : GREY; g.font = `500 20px ${SANS}`; g.textAlign = 'right';
      const n = typeset(i).length;
      g.fillText(`${n} ${n === 1 ? 'page' : 'pages'}`, M.x1, y + RH * 0.56);
      if (!hers(p) || p.date) { g.textAlign = 'left'; g.font = `500 19px ${DEVANAGARI.test(p.author || '') ? DEVA : SANS}`; g.fillText([p.author, p.date].filter(Boolean).join('  ·  '), M.x0, y + RH * 0.84); }
      rows.push({ i, y0: y, y1: y + RH - 8 });
      y += RH;
    }
    chrome({ text: 'Choose a poem', hi: false }, '↑ ↓  ·  Enter', null);
  }
  // the e-ink refresh: a black flash, then the page (with a faint ghost of the last one, gone a moment later)
  let flashT = 0, prevImage = null;
  function render(refresh = false) {
    if (refresh) {
      prevImage = prevImage || document.createElement('canvas'); prevImage.width = CW; prevImage.height = CH;
      prevImage.getContext('2d').drawImage(canvas, 0, 0);
      g.fillStyle = '#121110'; g.fillRect(0, 0, CW, CH); tex.needsUpdate = true;
      flashT = 0.07; return;
    }
    if (view.mode === 'library') drawLibrary(); else drawPage();
    tex.needsUpdate = true;
  }
  function finishRefresh() {
    if (view.mode === 'library') drawLibrary(); else drawPage();
    if (prevImage) { g.globalAlpha = 0.07; g.drawImage(prevImage, 0, 0); g.globalAlpha = 1; ghostT = 0.45; }
    tex.needsUpdate = true;
  }
  let ghostT = 0;

  // ---------------------------------------------------------------- reading
  const view = { mode: 'page', page: 0, sel: 0 };
  function goPoem(i, page = 0) {
    prefs.poem = THREE.MathUtils.clamp(i, 0, poems.length - 1); save();
    view.mode = 'page'; view.page = page === 'last' ? typeset(prefs.poem).length - 1 : page;
    render(true);
  }
  function turn(k) {
    if (view.mode === 'library') { view.sel = (view.sel + k + poems.length) % poems.length; render(); return; }
    const n = typeset(prefs.poem).length;
    if (view.page + k >= 0 && view.page + k < n) { view.page += k; render(true); return; }
    if (k > 0 && prefs.poem < poems.length - 1) return goPoem(prefs.poem + 1);
    if (k < 0 && prefs.poem > 0) return goPoem(prefs.poem - 1, 'last');
  }
  function library() { view.mode = 'library'; view.sel = prefs.poem; render(true); }
  function setSize(k) {
    const frac = view.page / Math.max(1, typeset(prefs.poem).length);
    prefs.size = THREE.MathUtils.clamp(prefs.size + k, 0, SIZE.length - 1); save();
    view.page = Math.min(typeset(prefs.poem).length - 1, Math.floor(frac * typeset(prefs.poem).length));
    render(true);
  }

  // ---------------------------------------------------------------- coming up into her hands, and going back
  const anim = { open: false, t: 0, from: null, source: null };
  const holdPos = new THREE.Vector3(), holdQuat = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), invCam = new THREE.Matrix4();
  const startPos = new THREE.Vector3(), startQuat = new THREE.Quaternion(), e1 = new THREE.Euler();
  const hold = () => {
    // as big as reads comfortably: the device about 80 % of the view's height, a little below the middle, its top tilted away
    const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), d = Math.max((BH / 0.8) / (2 * tn), (BW / 0.9) / (2 * tn * camera.aspect));      // (and no wider than the screen, on a phone)
    const sway = performance.now() / 1000;
    holdPos.set(Math.sin(sway * 0.7) * 0.0009, -0.003 + Math.sin(sway * 1.1) * 0.0006, -d);
    holdQuat.setFromEuler(e1.set(-0.07 + Math.sin(sway * 0.9) * 0.004, Math.sin(sway * 0.6) * 0.006, 0));
  };
  function open({ index = null, source = null } = {}) {
    if (!poems.length) return;
    if (index != null) { prefs.poem = index; view.mode = 'page'; view.page = 0; save(); }
    else { view.mode = 'library'; view.sel = prefs.poem; }
    render(false);
    camera.updateMatrixWorld(true);
    invCam.copy(camera.matrixWorld).invert();
    if (source) {                                            // up from where it lay
      source.updateMatrixWorld(true);
      tmpM.multiplyMatrices(invCam, source.matrixWorld).decompose(startPos, startQuat, new THREE.Vector3());
      // (the studio's device lies flat, screen up: stand it up to face her as it rises)
      startQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      source.visible = false;
    } else { startPos.set(0, -0.2, -0.16); startQuat.setFromEuler(e1.set(-1.1, 0, 0)); }
    anim.open = true; anim.t = 0; anim.source = source;
    device.visible = veil.visible = true;
    hint.hidden = false; requestAnimationFrame(() => hint.classList.add('in')); hintT = 6;
    onOpen();
  }
  function close() {
    if (!anim.open) return;
    anim.open = false; anim.t = 1;
    hint.classList.remove('in'); setTimeout(() => { if (!anim.open) hint.hidden = true; }, 500);
    onClose();
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function update(dt) {
    if (!device.visible) return;
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.classList.remove('in'); }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) finishRefresh(); }
    else if (ghostT > 0) { ghostT -= dt; if (ghostT <= 0) render(); }
    anim.t = THREE.MathUtils.clamp(anim.t + (anim.open ? dt / 0.6 : -dt / 0.45), 0, 1);
    hold();
    const k = ease(anim.t);
    const p = startPos.clone().lerp(holdPos, k), q = startQuat.clone().slerp(holdQuat, k);
    camera.updateMatrixWorld(true);
    device.position.copy(p).applyMatrix4(camera.matrixWorld);
    device.quaternion.copy(camera.quaternion).multiply(q);
    veil.position.set(0, 0, -0.5).applyMatrix4(camera.matrixWorld); veil.quaternion.copy(camera.quaternion);
    veilMat.opacity = 0.58 * k;
    if (!anim.open && anim.t <= 0) { device.visible = veil.visible = false; if (anim.source) anim.source.visible = true; anim.source = null; }
  }
  // the front light: up after dark
  const setLight = (night) => { screenMat.emissiveIntensity = 0.18 + 0.5 * THREE.MathUtils.clamp(night, 0, 1); };

  // a click while reading: on a title in the library, else the left or right of the screen
  const ray = new THREE.Raycaster();
  function click(nx, ny) {
    if (!anim.open) return;
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const hit = ray.intersectObject(screen)[0];
    if (view.mode === 'library') {
      if (!hit) return;
      const cy = (1 - hit.uv.y) * CH, row = rows.find((r) => cy >= r.y0 && cy <= r.y1);
      if (row) goPoem(row.i);
      return;
    }
    const u = hit ? hit.uv.x : (nx + 1) / 2;
    if (hit && (1 - hit.uv.y) * CH < 120) { library(); return; }        // the top of the screen: the library
    turn(u < 0.35 ? -1 : 1);
  }
  function key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'KeyE' || c === 'Backspace') { close(); return; }
    if (view.mode === 'library') {
      if (c === 'ArrowDown' || c === 'ArrowRight') { e.preventDefault(); turn(1); }
      else if (c === 'ArrowUp' || c === 'ArrowLeft') { e.preventDefault(); turn(-1); }
      else if (c === 'Enter' || c === 'Space') { e.preventDefault(); goPoem(view.sel); }
      return;
    }
    if (c === 'ArrowRight' || c === 'PageDown' || (c === 'Space' && !e.shiftKey)) { e.preventDefault(); turn(1); }
    else if (c === 'ArrowLeft' || c === 'PageUp' || (c === 'Space' && e.shiftKey)) { e.preventDefault(); turn(-1); }
    else if (c === 'ArrowDown') { e.preventDefault(); if (prefs.poem < poems.length - 1) goPoem(prefs.poem + 1); }
    else if (c === 'ArrowUp') { e.preventDefault(); if (prefs.poem > 0) goPoem(prefs.poem - 1); }
    else if (c === 'KeyL' || c === 'Home') library();
    else if (c === 'Equal' || c === 'NumpadAdd') setSize(1);
    else if (c === 'Minus' || c === 'NumpadSubtract') setSize(-1);
  }
  return {
    open, close, update, click, key, turn, setLight, library,
    get isOpen() { return anim.open; },
    get busy() { return device.visible; },
    state: () => ({ open: anim.open, mode: view.mode, poem: prefs.poem, page: view.page, pages: typeset(prefs.poem).length, size: prefs.size }),
  };
}
