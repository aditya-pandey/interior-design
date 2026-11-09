// The map (M): the whole coast drawn from the minimap's own picture (1 px per metre), the places marked, where
// she is (and which way she faces). Click a place, or anywhere on land, to go there (fast travel); drag to move
// the map, scroll to zoom. M or Esc closes it.
//
//   createWorldMap({ base, MAP, places: [{ id, name, x, z, icon }], where: () => ({ x, z, yaw }), onTravel(x, z, place) })

export function createWorldMap({ base, MAP, places, where, onTravel }) {
  const el = document.createElement('div');
  el.id = 'worldmap'; el.hidden = true;
  el.innerHTML = `<canvas></canvas><div class="wm-head"><h3>The coast</h3><p>Click a place, or anywhere, to go there · drag to move · scroll to zoom · <kbd>M</kbd> close</p></div>
    <div class="wm-list"></div><button class="wm-close" aria-label="Close">×</button>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d');
  const list = el.querySelector('.wm-list');
  list.innerHTML = places.map((p) => `<button data-id="${p.id}"><i>${p.icon}</i>${p.name}</button>`).join('');
  let open = false, hover = null;
  const view = { cx: 0, cz: 0, k: 1 };                    // centre (world), pixels per metre
  const toScreen = (x, z) => [cv.width / 2 + (MAP.x1 - x - (MAP.x1 - view.cx)) * view.k, cv.height / 2 + (MAP.z1 - z - (MAP.z1 - view.cz)) * view.k];
  const toWorld = (sx, sy) => [view.cx - (sx - cv.width / 2) / view.k, view.cz - (sy - cv.height / 2) / view.k];

  function size() {
    const r = el.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  function render() {
    if (!open) return;
    const W = cv.width, H = cv.height, dpr = cv.width / el.clientWidth;
    g.fillStyle = '#7fb3c4'; g.fillRect(0, 0, W, H);
    const [x0, y0] = toScreen(MAP.x1, MAP.z1);
    g.imageSmoothingEnabled = view.k < 3;
    g.drawImage(base, x0, y0, base.width * view.k, base.height * view.k);
    // places
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const taken = [];                                       // (labels kept apart: one moves below another's)
    for (const p of places) {
      const [sx, sy] = toScreen(p.x, p.z), on = hover === p;
      g.fillStyle = on ? '#ffffff' : 'rgba(255,250,240,0.92)'; g.strokeStyle = '#2a2118'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(sx, sy, (on ? 15 : 13) * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = `${15 * dpr}px sans-serif`; g.fillStyle = '#2a2118'; g.fillText(p.icon, sx, sy + 1 * dpr);
      g.font = `600 ${13 * dpr}px sans-serif`;
      const tw = g.measureText(p.name).width + 12 * dpr, th = 20 * dpr;
      let ly = sy + 18 * dpr;
      for (let i = 0; i < 8 && taken.some((r) => Math.abs(r[0] - sx) < (r[2] + tw) / 2 && Math.abs(r[1] - ly) < th + 2); i++) ly += th + 3 * dpr;
      taken.push([sx, ly, tw]);
      if (ly > sy + 20 * dpr) { g.strokeStyle = 'rgba(30,24,18,0.5)'; g.lineWidth = 1 * dpr; g.beginPath(); g.moveTo(sx, sy + 13 * dpr); g.lineTo(sx, ly); g.stroke(); }
      g.fillStyle = 'rgba(30,24,18,0.78)'; g.fillRect(sx - tw / 2, ly, tw, th);
      g.fillStyle = '#fff'; g.fillText(p.name, sx, ly + 10 * dpr);
    }
    // her
    const w = where(), [hx, hy] = toScreen(w.x, w.z);
    g.save(); g.translate(hx, hy); g.rotate(-w.yaw);
    g.fillStyle = '#ffd9a0'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(0, -12 * dpr); g.lineTo(8 * dpr, 9 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-8 * dpr, 9 * dpr); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#1b1b1b'; g.font = `bold ${14 * dpr}px sans-serif`; g.fillText('N', W - 26 * dpr, 70 * dpr);
    g.beginPath(); g.moveTo(W - 26 * dpr, 50 * dpr); g.lineTo(W - 31 * dpr, 60 * dpr); g.lineTo(W - 21 * dpr, 60 * dpr); g.fill();
    requestAnimationFrame(render);
  }
  function show() {
    if (open) return;
    open = true; el.hidden = false; size();
    const w = where(); view.cx = w.x; view.cz = w.z - 15; view.k = Math.min(cv.width, cv.height) / 230;
    render();
  }
  function hide() { open = false; el.hidden = true; }
  const placeAt = (sx, sy) => places.find((p) => { const [x, y] = toScreen(p.x, p.z); return Math.hypot(x - sx, y - sy) < 18 * (cv.width / el.clientWidth); });
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    const dpr = cv.width / el.clientWidth;
    if (drag) { view.cx += (e.clientX - drag.x) * dpr / view.k; view.cz += (e.clientY - drag.y) * dpr / view.k; drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
    hover = placeAt(e.offsetX * dpr, e.offsetY * dpr) || null; cv.style.cursor = hover ? 'pointer' : drag ? 'grabbing' : 'crosshair';
  });
  cv.addEventListener('pointerup', (e) => {
    const d = drag; drag = null;
    if (!d || d.moved > 6) return;
    const dpr = cv.width / el.clientWidth, sx = e.offsetX * dpr, sy = e.offsetY * dpr, p = placeAt(sx, sy);
    hide();
    if (p) onTravel(p.x, p.z, p); else { const [x, z] = toWorld(sx, sy); onTravel(x, z, null); }
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dpr = cv.width / el.clientWidth, sx = e.offsetX * dpr, sy = e.offsetY * dpr, [wx, wz] = toWorld(sx, sy);
    view.k = Math.min(14, Math.max(0.35, view.k * Math.exp(-e.deltaY * 0.0015)));
    const [nx, nz] = toWorld(sx, sy); view.cx += wx - nx; view.cz += wz - nz;   // (zoom about the pointer)
  }, { passive: false });
  for (const b of list.querySelectorAll('button')) b.addEventListener('click', () => { const p = places.find((q) => q.id === b.dataset.id); hide(); onTravel(p.x, p.z, p); });
  el.querySelector('.wm-close').addEventListener('click', hide);
  window.addEventListener('resize', () => { if (open) size(); });
  return { show, hide, toggle: () => (open ? hide() : show()), get open() { return open; }, el };
}
