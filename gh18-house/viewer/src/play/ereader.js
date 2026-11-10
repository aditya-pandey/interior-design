import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SERIF, SANS, DEVA } from './fonts.js';
import { DEVANAGARI } from './studio.js';
import { loadBook, bookText, renderPage } from './books.js';

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
const INK = '#231d18', GREY = '#9a6b4a', PAPER = '#fffaf3';

export function createEReader({ pack, books = [], camera, scene, clockLabel = () => '', onOpen = () => {}, onClose = () => {} }) {
  const poems = pack?.poems || [];
  const hindi = (p) => DEVANAGARI.test(p.title + p.stanzas.flat().join(''));
  const hers = (p) => !p.author || /deepti/i.test(p.author);
  let prefs = { poem: 0, size: 1, marks: {} };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('deepti-ereader') || '{}')); } catch { /* */ }
  const save = () => { try { localStorage.setItem('deepti-ereader', JSON.stringify(prefs)); } catch { /* */ } };

  // ---------------------------------------------------------------- the device
  const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const onTop = (m, order) => { m.depthTest = false; m.depthWrite = false; return order; };
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.55, metalness: 0.05, transparent: true });       // (transparent: drawn in order, over the veil)
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });   // (a screen lights itself: always clear to read)
  const device = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 4, 0.0072), shellMat); body.renderOrder = onTop(shellMat, 1000);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMat); screen.position.set(0, SY, BD / 2 + 0.00015); screen.renderOrder = onTop(screenMat, 1001);
  // her name, small, on the bottom bezel
  const lc = document.createElement('canvas'); lc.width = 256; lc.height = 48;
  const lg = lc.getContext('2d'); lg.fillStyle = '#8b867e'; lg.font = `700 30px ${SERIF}`; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('Deepti', 128, 26);
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
      em: hi ? `400 ${Math.round(40 * s)}px ${DEVA}` : `700 ${Math.round(47 * s)}px ${SERIF}`,
      lh: hi ? Math.round(40 * s * 2.0) : Math.round(47 * s * 1.5),
      title: hi ? `400 ${Math.round(66 * s)}px ${DEVA}` : `700 ${Math.round(86 * s)}px ${SERIF}`,
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
    blocks.push({ lines: [{ text: '— ' + (p.author || 'Deepti'), font: hindi({ title: p.author || '', stanzas: [] }) ? `400 ${Math.round(36 * s)}px ${DEVA}` : `700 ${Math.round(44 * s)}px ${SERIF}`, h: Math.round(70 * s), color: '#5d564c' }], keep: true });
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
      else { g.textAlign = 'center'; g.fillText(l.text, CW / 2, base); if (l.color === INK) {  } }
    }
    chrome({ text: p.title, hi: hindi(p) }, pages.length > 1 ? `Page ${view.page + 1} of ${pages.length}` : `${prefs.poem + 1} of ${poems.length}`, (view.page + 1) / pages.length);
  }
  // the library: her books first (if there are any), then her poems and those for her; a long list scrolls
  let rows = [], libTop = 0;
  const poemOrder = () => [...poems.map((p, i) => i).filter((i) => hers(poems[i])), ...poems.map((p, i) => i).filter((i) => !hers(poems[i]))];
  const items = () => [...books.map((b, bi) => ({ kind: 'book', bi, sec: 'HER BOOKS' })), ...poemOrder().map((i) => ({ kind: 'poem', i, sec: hers(poems[i]) ? 'HER POEMS' : 'FOR HER' }))];
  function drawLibrary() {
    g.drawImage(grain, 0, 0);
    g.fillStyle = INK; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = `700 76px ${SERIF}`; g.fillText('Library', M.x0, 238);
    g.fillStyle = GREY; g.font = `500 22px ${SANS}`; g.fillText([books.length ? `${books.length} ${books.length === 1 ? 'book' : 'books'}` : '', `${poems.length} poems`].filter(Boolean).join('  ·  '), M.x0 + 4, 284);
    const list = items(), RH = 96, HEAD = 74, top = 320, bottom = M.bottom - 10;
    // the rows' heights, section headings included, then scroll so the chosen one is in view
    const ys = []; let y = 0, sec = null;
    for (const it of list) { if (it.sec !== sec) { sec = it.sec; y += HEAD; } ys.push(y); y += RH; }
    const selY = ys[view.sel] ?? 0;
    if (selY - libTop < 0) libTop = Math.max(0, selY - HEAD); else if (selY + RH - libTop > bottom - top) libTop = selY + RH - (bottom - top);
    g.save(); g.beginPath(); g.rect(0, top, CW, bottom - top); g.clip();
    rows = []; sec = null;
    list.forEach((it, k) => {
      const ry = top + ys[k] - libTop;
      if (it.sec !== sec) { sec = it.sec; g.fillStyle = GREY; g.font = `600 20px ${SANS}`; spacedText(sec, M.x0, ry - HEAD + 50, 5, 'left'); }
      if (ry + RH < top || ry > bottom) return;
      const on = k === view.sel;
      if (on) { g.fillStyle = INK; g.fillRect(M.x0 - 22, ry, M.x1 - M.x0 + 44, RH - 8); }
      let title, sub, right, hi = false;
      if (it.kind === 'book') { const b = books[it.bi]; title = b.title; sub = b.author || ''; const m = prefs.marks[b.url]; right = m ? `${Math.round((m.frac || 0) * 100)}%` : 'new'; }
      else { const p = poems[it.i]; title = p.title; hi = hindi(p); sub = (!hers(p) || p.date) ? [p.author, p.date].filter(Boolean).join('  ·  ') : ''; const n = typeset(it.i).length; right = `${n} ${n === 1 ? 'page' : 'pages'}`; }
      g.fillStyle = on ? PAPER : INK; g.textAlign = 'left';
      g.font = hi ? `400 35px ${DEVA}` : `700 42px ${SERIF}`;
      let t = title; while (g.measureText(t).width > M.x1 - M.x0 - 200 && t.length > 4) t = t.slice(0, -2);
      g.fillText(t === title ? t : t + '…', M.x0, ry + RH * 0.52);
      g.fillStyle = on ? '#cfcac0' : GREY; g.font = `500 20px ${SANS}`; g.textAlign = 'right'; g.fillText(right, M.x1, ry + RH * 0.52);
      if (sub) { g.textAlign = 'left'; g.font = `500 19px ${DEVANAGARI.test(sub) ? DEVA : SANS}`; g.fillText(sub, M.x0, ry + RH * 0.82); }
      rows.push({ k, y0: ry, y1: ry + RH - 8 });
    });
    g.restore();
    chrome({ text: books.length ? 'Choose a book or a poem' : 'Choose a poem', hi: false }, '↑ ↓  ·  Enter', null);
  }
  const choose = (k) => { const it = items()[k]; if (!it) return; if (it.kind === 'book') openBook(it.bi); else goPoem(it.i); };

  // ---------------------------------------------------------------- a book: set again at her size, or its own pages
  const bookData = new Map();
  const BOOK_SIZE = [0.86, 1, 1.16];
  function layBook(paras, si) {
    const s = BOOK_SIZE[si], width = M.x1 - M.x0, avail = M.bottom - M.top;
    const pages = [[]]; let y = 0, at = 0;
    const put = (o) => { if (y + o.h > avail && pages[pages.length - 1].length) { pages.push([]); y = 0; } pages[pages.length - 1].push({ ...o, y, at }); y += o.h; };
    let afterHead = true;
    paras.forEach((p, pi) => {
      at = pi;
      const hi = DEVANAGARI.test(p.text);
      if (p.kind === 'h') {
        if (y > avail * 0.35) { pages.push([]); y = 0; }                     // (a new chapter starts a new page)
        const font = hi ? `400 ${Math.round(52 * s)}px ${DEVA}` : `700 ${Math.round(66 * s)}px ${SERIF}`, lh = Math.round((hi ? 52 : 66) * s * 1.3);
        put({ kind: 'gap', h: y ? lh * 0.6 : lh * 1.2 });
        for (const t of wrap(p.text, font, width * 0.86)) put({ kind: 'h', text: t, font, h: lh });
        put({ kind: 'gap', h: lh * 0.7 }); afterHead = true; return;
      }
      const font = hi ? `400 ${Math.round(38 * s)}px ${DEVA}` : `500 ${Math.round(45 * s)}px ${SERIF}`, lh = Math.round((hi ? 38 * 1.95 : 45 * 1.42) * s), indent = afterHead ? 0 : Math.round(45 * s * 1.3);
      g.font = font;
      const words = p.text.split(/\s+/).filter(Boolean); let line = [], w = indent; const space = g.measureText(' ').width;
      const flushLine = (last) => { put({ kind: 'line', words: line, font, h: lh, indent: line.first ? indent : 0, justify: !last, width }); };
      let first = true;
      for (const word of words) {
        const ww = g.measureText(word).width;
        if (line.length && w + space + ww > width) { line.first = first; flushLine(false); first = false; line = []; w = 0; }
        line.push({ t: word, w: ww }); w += (line.length > 1 ? space : 0) + ww;
      }
      if (line.length) { line.first = first; flushLine(true); }
      afterHead = false;
    });
    return pages;
  }
  function drawBook() {
    const bk = view.book, b = books[bk.bi], d = bookData.get(bk.bi);
    g.drawImage(grain, 0, 0);
    g.textBaseline = 'alphabetic';
    const msg = (t) => { g.fillStyle = GREY; g.font = `700 44px ${SERIF}`; g.textAlign = 'center'; g.fillText(t, CW / 2, CH / 2); };
    if (!d || d.loading) { msg(`Opening “${b.title}”…`); chrome({ text: b.title }, '', null); return; }
    if (d.error) { msg('This book could not be opened.'); chrome({ text: b.title }, '', null); return; }
    if (bk.original) {
      const n = d.book.pages, img = d.imgs.get(bk.page);
      if (img) { g.save(); g.filter = 'grayscale(1) contrast(1.15)'; g.drawImage(img, (CW - img.width) / 2, M.top - 40 + (M.bottom - M.top + 40 - img.height) / 2); g.restore(); }
      else { msg('…'); pageImage(bk.bi, bk.page); }
      chrome({ text: b.title }, `Page ${bk.page + 1} of ${n}  ·  original`, (bk.page + 1) / n);
      return;
    }
    const pages = d.laid.get(prefs.size) || d.laid.set(prefs.size, layBook(d.paras, prefs.size)).get(prefs.size);
    if (!pages.length || !d.paras.length) { msg('No text in this PDF: O for its own pages'); chrome({ text: b.title }, '', null); return; }
    const pg = pages[Math.min(bk.page, pages.length - 1)];
    for (const l of pg) {
      const y = M.top + l.y;
      if (l.kind === 'gap') continue;
      g.fillStyle = INK; g.font = l.font;
      if (l.kind === 'h') { g.textAlign = 'center'; g.fillText(l.text, CW / 2, y + l.h * 0.72); continue; }
      // a line of the text, justified (the last line of a paragraph is not)
      const x0 = M.x0 + (l.indent || 0), total = l.words.reduce((a, q) => a + q.w, 0), gaps = l.words.length - 1;
      const sp = l.justify && gaps > 0 ? (l.width - (l.indent || 0) - total) / gaps : g.measureText(' ').width;
      let x = x0; g.textAlign = 'left';
      for (const q of l.words) { g.fillText(q.t, x, y + l.h * 0.72); x += q.w + sp; }
    }
    const frac = (bk.page + 1) / pages.length;
    chrome({ text: b.title, hi: DEVANAGARI.test(b.title) }, `Page ${bk.page + 1} of ${pages.length}  ·  ${Math.round(frac * 100)}%`, frac);
  }
  function pageImage(bi, n) {
    const d = bookData.get(bi); if (!d || d.pending.has(n)) return;
    d.pending.add(n);
    renderPage(d.book, n + 1, M.x1 - M.x0 + 120, M.bottom - M.top + 40).then((c) => { d.imgs.set(n, c); d.pending.delete(n); if (view.mode === 'book' && view.book.bi === bi && view.book.page === n) render(); }).catch(() => d.pending.delete(n));
  }
  function bookPages(bi) { const d = bookData.get(bi); if (!d || d.loading || d.error) return 1; if (view.book.original) return d.book.pages; return (d.laid.get(prefs.size) || d.laid.set(prefs.size, layBook(d.paras, prefs.size)).get(prefs.size)).length || 1; }
  function mark() { const bk = view.book, b = books[bk.bi]; prefs.marks[b.url] = { frac: bk.page / Math.max(1, bookPages(bk.bi)), orig: bk.original }; save(); }
  function openBook(bi) {
    const b = books[bi]; if (!b) return;
    const m = prefs.marks[b.url] || {};
    view.mode = 'book'; view.book = { bi, page: 0, original: !!m.orig };
    let d = bookData.get(bi);
    if (!d) {
      d = { loading: true, imgs: new Map(), pending: new Set(), laid: new Map() }; bookData.set(bi, d);
      loadBook(b.url).then(async (book) => { d.book = book; d.paras = await bookText(book); d.loading = false; })
        .catch((e) => { console.warn('book', b.url, e?.name, e?.message || e); d.error = true; d.loading = false; })
        .then(() => { if (view.mode === 'book' && view.book.bi === bi) { view.book.page = Math.min(bookPages(bi) - 1, Math.floor((m.frac || 0) * bookPages(bi))); render(true); } });
    } else if (!d.loading) view.book.page = Math.min(bookPages(bi) - 1, Math.floor((m.frac || 0) * bookPages(bi)));
    render(true);
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
    if (view.mode === 'library') drawLibrary(); else if (view.mode === 'book') drawBook(); else drawPage();
    tex.needsUpdate = true;
  }
  function finishRefresh() {
    if (view.mode === 'library') drawLibrary(); else if (view.mode === 'book') drawBook(); else drawPage();
    if (prevImage) { g.globalAlpha = 0.07; g.drawImage(prevImage, 0, 0); g.globalAlpha = 1; ghostT = 0.45; }
    tex.needsUpdate = true;
  }
  let ghostT = 0;

  // ---------------------------------------------------------------- reading
  const view = { mode: 'page', page: 0, sel: 0, book: null };
  const selOfPoem = (i) => Math.max(0, items().findIndex((it) => it.kind === 'poem' && it.i === i));
  function goPoem(i, page = 0) {
    prefs.poem = THREE.MathUtils.clamp(i, 0, poems.length - 1); save();
    view.mode = 'page'; view.page = page === 'last' ? typeset(prefs.poem).length - 1 : page;
    render(true);
  }
  function turn(k) {
    if (view.mode === 'library') { const n = items().length; view.sel = (view.sel + k + n) % n; render(); return; }
    if (view.mode === 'book') {
      const n = bookPages(view.book.bi);
      if (view.book.page + k >= 0 && view.book.page + k < n) { view.book.page += k; mark(); render(true); }
      return;
    }
    const n = typeset(prefs.poem).length;
    if (view.page + k >= 0 && view.page + k < n) { view.page += k; render(true); return; }
    if (k > 0 && prefs.poem < poems.length - 1) return goPoem(prefs.poem + 1);
    if (k < 0 && prefs.poem > 0) return goPoem(prefs.poem - 1, 'last');
  }
  function library() { if (view.mode === 'book') { mark(); view.sel = view.book.bi; } else view.sel = selOfPoem(prefs.poem); view.mode = 'library'; libTop = 0; render(true); }
  function setSize(k) {
    if (view.mode === 'book') {
      const frac = view.book.page / Math.max(1, bookPages(view.book.bi));
      prefs.size = THREE.MathUtils.clamp(prefs.size + k, 0, SIZE.length - 1); save();
      view.book.page = Math.min(bookPages(view.book.bi) - 1, Math.floor(frac * bookPages(view.book.bi))); mark(); render(true); return;
    }
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
  function open({ index = null, book = null, source = null } = {}) {
    if (!poems.length && !books.length) return;
    if (book != null) openBook(book);
    else if (index != null) { prefs.poem = index; view.mode = 'page'; view.page = 0; save(); render(false); }
    else { view.mode = 'library'; view.sel = view.book ? view.book.bi : selOfPoem(prefs.poem); libTop = 0; render(false); }
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
      if (row) choose(row.k);
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
      else if (c === 'Enter' || c === 'Space') { e.preventDefault(); choose(view.sel); }
      return;
    }
    if (view.mode === 'book') {
      if (c === 'ArrowRight' || c === 'PageDown' || c === 'ArrowDown' || (c === 'Space' && !e.shiftKey)) { e.preventDefault(); turn(1); }
      else if (c === 'ArrowLeft' || c === 'PageUp' || c === 'ArrowUp' || (c === 'Space' && e.shiftKey)) { e.preventDefault(); turn(-1); }
      else if (c === 'KeyO') { const frac = view.book.page / Math.max(1, bookPages(view.book.bi)); view.book.original = !view.book.original; view.book.page = Math.min(bookPages(view.book.bi) - 1, Math.floor(frac * bookPages(view.book.bi))); mark(); render(true); }
      else if (c === 'KeyL' || c === 'Home') library();
      else if (c === 'Equal' || c === 'NumpadAdd') setSize(1);
      else if (c === 'Minus' || c === 'NumpadSubtract') setSize(-1);
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
    state: () => ({ open: anim.open, mode: view.mode, poem: prefs.poem, page: view.mode === 'book' ? view.book.page : view.page, pages: view.mode === 'book' ? bookPages(view.book.bi) : typeset(prefs.poem).length, size: prefs.size, book: view.book && { ...view.book, loading: bookData.get(view.book.bi)?.loading, paras: bookData.get(view.book.bi)?.paras?.length } }),
    openBook, books,
  };
}
