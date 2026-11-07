// Her reader: an e-reader that comes up over the studio for her poems and her paintings.
//
//   Poems     — set like a book: a title page and the poem across facing pages on a wide screen (one page on a
//               phone), turned with ← / →, a click on either edge, or a swipe; contents down the side (her poems,
//               and those written for her); text size and page colour (paper, sepia, night), remembered.
//   Paintings — each one large on a dark screen, zoom with the wheel, a pinch or a double-click, drag to look
//               around, ← / → through them all; thumbnails down the side.
//
// open({ tab: 'poems' | 'art', index }) is called when she reads a poem on the wall, looks at a painting, or picks
// up one of the reader devices in the studio. It's ordinary HTML over the 3D view (crisp text at any size).
import { DEVANAGARI } from './studio.js';

const SIZES = [0.8, 0.9, 1, 1.12, 1.26, 1.42, 1.6];
const THEMES = ['paper', 'sepia', 'night'];
const KEY = 'deepti-reader';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createReader({ pack, base = 'play/deepti/', onOpen = () => {}, onClose = () => {} }) {
  const poems = pack?.poems || [], art = pack?.art || [];
  const hindi = (p) => DEVANAGARI.test(p.title + p.stanzas.flat().join(''));
  const isHers = (p) => !p.author || /deepti/i.test(p.author);
  let prefs = { size: 2, theme: 'paper', poem: 0, art: 0 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* (private window) */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* */ } };

  const root = document.createElement('div');
  root.id = 'reader'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Reader');
  root.innerHTML = `
    <div class="rd-device">
      <header class="rd-top">
        <button class="rd-ic rd-toc-btn" aria-label="Contents" title="Contents">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>
        <div class="rd-brand"><em>Deepti’s</em> Reader</div>
        <nav class="rd-tabs" role="tablist">
          <button role="tab" data-tab="poems">Poems <small>${poems.length}</small></button>
          <button role="tab" data-tab="art">Paintings <small>${art.length}</small></button>
        </nav>
        <div class="rd-tools rd-tools-poems">
          <button class="rd-ic" data-act="smaller" aria-label="Smaller text" title="Smaller text (−)"><span class="aa sm">A</span></button>
          <button class="rd-ic" data-act="larger" aria-label="Larger text" title="Larger text (+)"><span class="aa">A</span></button>
          <button class="rd-ic" data-act="theme" aria-label="Page colour" title="Page colour">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" class="fill"/></svg></button>
        </div>
        <div class="rd-tools rd-tools-art">
          <button class="rd-ic" data-act="zoomout" aria-label="Zoom out" title="Zoom out (−)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M8 11h6M16 16l4 4"/></svg></button>
          <button class="rd-ic" data-act="zoomin" aria-label="Zoom in" title="Zoom in (+)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M8 11h6M11 8v6M16 16l4 4"/></svg></button>
          <button class="rd-ic" data-act="fit" aria-label="Fit to screen" title="Fit (0)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
        </div>
        <button class="rd-ic rd-close" aria-label="Close" title="Close (Esc)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </header>
      <div class="rd-body">
        <aside class="rd-toc" aria-label="Contents"></aside>
        <main class="rd-screen">
          <div class="rd-page"><div class="rd-flow"></div><i class="rd-spine" aria-hidden="true"></i></div>
          <div class="rd-art"><div class="rd-stage"><img alt=""></div><p class="rd-cap"></p></div>
          <button class="rd-turn prev" aria-label="Previous page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
          <button class="rd-turn next" aria-label="Next page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
        </main>
      </div>
      <footer class="rd-foot"><span class="rd-where"></span><div class="rd-progress"><i></i></div><span class="rd-count"></span></footer>
    </div>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const device = $('.rd-device'), toc = $('.rd-toc'), pageEl = $('.rd-page'), flow = $('.rd-flow');
  const artEl = $('.rd-art'), stage = $('.rd-stage'), img = stage.querySelector('img');

  let tab = 'poems', open = false, page = 0, pages = 1, step = 0, z = 1, panX = 0, panY = 0, fit = 1;

  // ---------------------------------------------------------------- contents
  function buildToc() {
    if (tab === 'poems') {
      const item = (p, i) => `<button class="rd-li${i === prefs.poem ? ' on' : ''}" data-i="${i}">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="t${hindi(p) ? ' hi' : ''}">${esc(p.title)}</span>
          ${p.date ? `<span class="d">${esc(p.date)}</span>` : ''}</button>`;
      const hers = poems.map((p, i) => [p, i]).filter(([p]) => isHers(p)), forHer = poems.map((p, i) => [p, i]).filter(([p]) => !isHers(p));
      toc.innerHTML = `<h4>Her poems</h4>${hers.map(([p, i]) => item(p, i)).join('')}`
        + (forHer.length ? `<h4>For her</h4>${forHer.map(([p, i]) => item(p, i).replace('</button>', `<span class="d${DEVANAGARI.test(p.author) ? ' hi' : ''}">${esc(p.author)}</span></button>`)).join('')}` : '');
    } else {
      toc.innerHTML = `<h4>Her paintings</h4><div class="rd-thumbs">${art.map((a, i) => `<button class="rd-th${i === prefs.art ? ' on' : ''}" data-i="${i}" aria-label="Painting ${i + 1}"><img loading="lazy" src="${base}${a.file}" alt=""></button>`).join('')}</div>`;
    }
    toc.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  toc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    if (tab === 'poems') showPoem(+b.dataset.i, 0); else showArt(+b.dataset.i);
    if (device.classList.contains('narrow')) device.classList.remove('toc-open');
  });

  // ---------------------------------------------------------------- poems
  function poemHTML(p) {
    const hi = hindi(p);
    const line = (ln) => { const t = ln.trim(), em = /^\*.*\*$/.test(t); return `<span class="ln">${em ? `<em>${esc(t.slice(1, -1))}</em>` : esc(ln) || '&nbsp;'}</span>`; };
    return `<section class="rd-title"><div>
        <p class="kicker">${isHers(p) ? 'A poem by Deepti' : `For Deepti · from ${esc(p.author)}`}</p>
        <h2${hi ? ' class="hi"' : ''}>${esc(p.title)}</h2>
        <i class="orn" aria-hidden="true"></i>
        ${p.date ? `<time>${esc(p.date)}</time>` : ''}
      </div></section>
      <section class="rd-text${hi ? ' hi' : ''}" lang="${hi ? 'hi' : 'en'}">
        ${p.stanzas.map((st) => `<p class="st${st.length <= 8 ? ' keep' : ''}">${st.map(line).join('')}</p>`).join('')}
        <footer>— ${esc(p.author || 'Deepti')}</footer>
      </section>`;
  }
  function showPoem(i, at = 0, fade = true) {
    prefs.poem = clamp(i, 0, poems.length - 1); save();
    const p = poems[prefs.poem];
    const go = () => {
      flow.innerHTML = poemHTML(p);
      layout();
      page = at === 'last' ? pages - 1 : clamp(at, 0, pages - 1);
      turnTo(page, false);
      flow.classList.remove('fade');
      toc.querySelectorAll('.rd-li').forEach((b) => b.classList.toggle('on', +b.dataset.i === prefs.poem));
    };
    if (fade && flow.innerHTML) { flow.classList.add('fade'); setTimeout(go, 180); } else go();
  }
  // lay the poem out in columns as tall as the page: a spread of two on a wide screen
  function layout() {
    device.style.setProperty('--fs', SIZES[prefs.size]);
    const W = pageEl.clientWidth, H = pageEl.clientHeight;
    device.style.setProperty('--vs', clamp(Math.min(H / 640, W / 760), 0.9, 1.3).toFixed(3));      // (the type grows with the screen)
    // two facing pages only on a really wide screen: a poem's lines shouldn't have to wrap
    const spread = W > 1300;
    pageEl.classList.toggle('spread', spread);
    const gap = spread ? Math.round(W * 0.12) : 48, cols = spread ? 2 : 1, colW = (W - gap * (cols - 1)) / cols;
    Object.assign(flow.style, { width: W + 'px', height: H + 'px', columnWidth: colW + 'px', columnGap: gap + 'px', transition: 'none' });
    const text = flow.querySelector('.rd-text');
    text.classList.remove('centre'); text.style.minHeight = '';
    // a short poem sits in the middle of its page
    const count = () => Math.max(1, Math.round((flow.scrollWidth + gap) / (colW + gap)));
    if (count() <= (spread ? 2 : 1)) { text.classList.add('centre'); text.style.minHeight = (spread ? H : H - flow.querySelector('.rd-title').offsetHeight) + 'px'; }
    pages = Math.max(1, Math.ceil(count() / cols));
    step = W + gap;
    page = clamp(page, 0, pages - 1);
    flow.style.transform = `translateX(${-page * step}px)`;
  }
  function turnTo(n, animate = true) {
    page = clamp(n, 0, pages - 1);
    flow.style.transition = animate ? 'transform 0.55s cubic-bezier(.22,.7,.2,1)' : 'none';
    flow.style.transform = `translateX(${-page * step}px)`;
    status();
  }
  function turn(k) {
    if (tab === 'art') return showArt((prefs.art + k + art.length) % art.length);
    if (page + k >= 0 && page + k < pages) return turnTo(page + k);
    if (k > 0 && prefs.poem < poems.length - 1) return showPoem(prefs.poem + 1, 0);
    if (k < 0 && prefs.poem > 0) return showPoem(prefs.poem - 1, 'last');
    device.classList.remove('nudge'); void device.offsetWidth; device.classList.add('nudge');     // (the end of the book)
  }

  // ---------------------------------------------------------------- paintings
  function showArt(i) {
    prefs.art = clamp(i, 0, art.length - 1); save();
    const a = art[prefs.art];
    stage.classList.add('fade');
    const im = new Image();
    im.onload = im.onerror = () => {
      img.src = im.src; img.width = a.w; img.height = a.h; img.classList.toggle('cut', a.file.endsWith('.png'));
      z = 1; panX = panY = 0; placeArt(false); stage.classList.remove('fade');
    };
    im.src = base + a.file;
    toc.querySelectorAll('.rd-th').forEach((b) => b.classList.toggle('on', +b.dataset.i === prefs.art));
    toc.querySelector('.rd-th.on')?.scrollIntoView({ block: 'nearest' });
    status();
  }
  function placeArt(animate = true) {
    const a = art[prefs.art]; if (!a) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    fit = Math.min((W * 0.9) / a.w, (H * 0.9) / a.h);
    const s = fit * z, mx = Math.max(0, (a.w * s - W) / 2 + 40), my = Math.max(0, (a.h * s - H) / 2 + 40);
    panX = clamp(panX, -mx, mx); panY = clamp(panY, -my, my);
    img.style.transition = animate ? 'transform 0.35s cubic-bezier(.22,.7,.2,1)' : 'none';
    img.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${s})`;
    stage.classList.toggle('zoomed', z > 1.01);
    $('.rd-cap').innerHTML = `Painted by Deepti <span>·</span> ${prefs.art + 1} of ${art.length}`;
  }
  // zoom about a point on the screen (cx, cy from the stage's centre)
  function zoomAt(nz, cx = 0, cy = 0, animate = true) {
    nz = clamp(nz, 1, 6);
    panX = cx - (cx - panX) * (nz / z); panY = cy - (cy - panY) * (nz / z);
    z = nz; if (z === 1) panX = panY = 0;
    placeArt(animate);
  }
  const fromCentre = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const [cx, cy] = fromCentre(e); zoomAt(z * Math.exp(-e.deltaY * 0.0022), cx, cy, false); }, { passive: false });
  stage.addEventListener('dblclick', (e) => { const [cx, cy] = fromCentre(e); zoomAt(z > 1.01 ? 1 : 2.5, cx, cy); });
  // drag to look around a zoomed painting; two fingers pinch; a swipe at fit size goes to the next one
  const ptrs = new Map();
  let pinch = null, swipe = null;
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); swipe = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 0, 0, false); return; }
    if (z > 1.01) { panX += e.clientX - px; panY += e.clientY - py; placeArt(false); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (swipe && z <= 1.01) { const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - swipe.t < 600) turn(dx < 0 ? 1 : -1); }
    swipe = null;
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  // a swipe across a page of poems
  let pswipe = null;
  pageEl.addEventListener('pointerdown', (e) => { pswipe = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  pageEl.addEventListener('pointerup', (e) => {
    if (!pswipe) return; const dx = e.clientX - pswipe.x, dy = e.clientY - pswipe.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - pswipe.t < 700) turn(dx < 0 ? 1 : -1);
    pswipe = null;
  });

  // ---------------------------------------------------------------- frame
  function status() {
    let where, count, prog;
    if (tab === 'poems') {
      const p = poems[prefs.poem];
      where = `<span class="${hindi(p) ? 'hi' : ''}">${esc(p.title)}</span>`;
      count = pages > 1 ? `Page ${page + 1} of ${pages}` : `Poem ${prefs.poem + 1} of ${poems.length}`;
      prog = (prefs.poem + (page + 1) / pages) / poems.length;
    } else {
      where = 'Her paintings'; count = `${prefs.art + 1} / ${art.length}`; prog = (prefs.art + 1) / art.length;
    }
    $('.rd-where').innerHTML = where; $('.rd-count').textContent = count;
    $('.rd-progress i').style.width = (prog * 100).toFixed(1) + '%';
    const first = tab === 'poems' ? prefs.poem === 0 && page === 0 : false, last = tab === 'poems' ? prefs.poem === poems.length - 1 && page === pages - 1 : false;
    $('.rd-turn.prev').classList.toggle('off', first); $('.rd-turn.next').classList.toggle('off', last);
  }
  function setTab(t) {
    tab = t;
    device.dataset.tab = t;
    root.querySelectorAll('.rd-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    buildToc();
    if (t === 'poems') showPoem(prefs.poem, page, false); else showArt(prefs.art);
  }
  function setTheme() { device.dataset.theme = prefs.theme; }
  function resize() {
    device.classList.toggle('narrow', root.clientWidth < 860);
    if (!open) return;
    if (tab === 'poems') { const frac = pages > 1 ? page / pages : 0; layout(); turnTo(Math.round(frac * pages), false); } else placeArt(false);
  }
  window.addEventListener('resize', resize);

  root.addEventListener('click', (e) => {
    if (e.target === root) return close();
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('rd-close')) return close();
    if (b.classList.contains('rd-toc-btn')) return device.classList.toggle('toc-open');
    if (b.dataset.tab) return setTab(b.dataset.tab);
    if (b.classList.contains('rd-turn')) return turn(b.classList.contains('next') ? 1 : -1);
    const act = b.dataset.act;
    if (act === 'smaller' || act === 'larger') { prefs.size = clamp(prefs.size + (act === 'larger' ? 1 : -1), 0, SIZES.length - 1); save(); const frac = page / pages; layout(); turnTo(Math.floor(frac * pages), false); }
    if (act === 'theme') { prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length]; save(); setTheme(); }
    if (act === 'zoomin') zoomAt(z * 1.5); if (act === 'zoomout') zoomAt(z / 1.5); if (act === 'fit') zoomAt(1);
  });

  function show({ tab: t = 'poems', index } = {}) {
    if (t === 'poems' && !poems.length) t = 'art';
    if (t === 'art' && !art.length) return;
    if (index != null) { if (t === 'poems') { prefs.poem = index; page = 0; } else prefs.art = index; }
    root.hidden = false; open = true;
    device.classList.toggle('narrow', root.clientWidth < 860); device.classList.remove('toc-open');
    setTheme();
    requestAnimationFrame(() => { root.classList.add('in'); });
    setTab(t);
    document.fonts?.ready.then(() => { if (open && tab === 'poems') { layout(); turnTo(page, false); } });
    onOpen();
  }
  function close() {
    if (!open) return;
    open = false; root.classList.remove('in');
    setTimeout(() => { if (!open) root.hidden = true; }, 320);
    onClose();
  }
  // keys, while it's open (from the game's key handler)
  function key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'KeyE') { close(); return true; }
    if (c === 'ArrowRight' || c === 'PageDown' || (c === 'Space' && !e.shiftKey)) { e.preventDefault(); turn(1); return true; }
    if (c === 'ArrowLeft' || c === 'PageUp' || (c === 'Space' && e.shiftKey)) { e.preventDefault(); turn(-1); return true; }
    if (c === 'ArrowDown' || c === 'ArrowUp') {
      e.preventDefault(); const k = c === 'ArrowDown' ? 1 : -1;
      if (tab === 'poems') showPoem(clamp(prefs.poem + k, 0, poems.length - 1), 0); else turn(k);
      return true;
    }
    if (c === 'Home') { tab === 'poems' ? turnTo(0) : showArt(0); return true; }
    if (c === 'End') { tab === 'poems' ? turnTo(pages - 1) : showArt(art.length - 1); return true; }
    const plus = c === 'Equal' || c === 'NumpadAdd', minus = c === 'Minus' || c === 'NumpadSubtract';
    if (plus || minus) {
      if (tab === 'art') zoomAt(z * (plus ? 1.5 : 1 / 1.5));
      else { prefs.size = clamp(prefs.size + (plus ? 1 : -1), 0, SIZES.length - 1); save(); const frac = page / pages; layout(); turnTo(Math.floor(frac * pages), false); }
      return true;
    }
    if (c === 'Digit0' && tab === 'art') { zoomAt(1); return true; }
    if (c === 'Tab') { e.preventDefault(); setTab(tab === 'poems' ? 'art' : 'poems'); return true; }
    return false;
  }

  return {
    open: show, close, key, get isOpen() { return open; },
    // (tests) where the reader is
    state: () => ({ open, tab, poem: prefs.poem, page, pages, art: prefs.art, zoom: z, size: prefs.size, theme: prefs.theme }),
  };
}
