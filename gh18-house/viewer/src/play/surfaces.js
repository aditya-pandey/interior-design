import * as THREE from 'three';

// Surface detail for /play/, made in the browser: tileable relief (normal maps) for sand ripples,
// plaster, wood grain, woven fabric and painting canvas; book spines; underwater caustics.
// When the photo-scanned textures are present (play/textures/, fetched by tools/fetch_play_textures.py)
// textures.js lays those over the top; these are the always-available base.

export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// tileable value noise on an S x S grid: `cells` lattice cells across the tile
function valueNoise(S, cells, seed) {
  const r = rng(seed), lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x / S) * cells, fy = (y / S) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = lat[(iy % cells) * cells + (ix % cells)], b = lat[(iy % cells) * cells + ((ix + 1) % cells)];
    const c = lat[((iy + 1) % cells) * cells + (ix % cells)], d = lat[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
    out[y * S + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  return out;
}
export function fbm(S, base, octaves, seed, gain = 0.5) {
  const out = new Float32Array(S * S);
  let amp = 1, cells = base;
  for (let o = 0; o < octaves && cells <= S; o++) {
    const n = valueNoise(S, cells, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= gain; cells *= 2;
  }
  return out;
}

// a height field (wrapping) -> tangent-space normal map
export function normalTexture(h, S, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + (x + 1) % S] - h[y * S + (x - 1 + S) % S];
    const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * S + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// a grey value map (roughness etc.)
function greyTexture(v, S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const b = Math.max(0, Math.min(255, v[i] * 255)); img.data.set([b, b, b, 255], i * 4); }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// relief from a picture's brightness (wood grain, paint strokes): dark = low
export function normalFromImage(img, S, strength, blur = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (blur) g.filter = `blur(${blur}px)`;
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  return normalTexture(h, S, strength);
}

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

// sand: wind ripples (~11 cm apart, softly asymmetric, wandering) and grains. One tile = 1 m.
export const sandNormal = () => once('sand', () => {
  const S = 512, warp = fbm(S, 4, 3, 7), grain = fbm(S, 128, 2, 9), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, p = ((y + warp[i] * 70) / S) * 9 * Math.PI * 2;
    const rip = Math.sin(p) + 0.35 * Math.sin(2 * p + 0.6);            // gentle lee/stoss asymmetry
    h[i] = rip * 0.55 + grain[i] * 0.8;
  }
  return normalTexture(h, S, 2.2);
});

// plaster: soft trowel undulation and fine grit. One tile = 2 m.
export const plasterNormal = () => once('plaster', () => {
  const S = 512, a = fbm(S, 6, 4, 21), b = fbm(S, 96, 2, 22), h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) h[i] = a[i] * 1.2 + b[i] * 0.35;
  return normalTexture(h, S, 1.6);
});

// woven cloth (linen weave): threads over and under, with slub. `threads` per tile.
export const weaveNormal = (threads = 48, seed = 31) => once('weave' + threads + seed, () => {
  const S = 512, slub = fbm(S, 16, 3, seed), h = new Float32Array(S * S), k = threads / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x * k, v = y * k, iu = Math.floor(u), iv = Math.floor(v);
    const fu = u - iu, fv = v - iv;
    const over = (iu + iv) % 2 === 0;                     // plain weave
    const warp = Math.sin(Math.PI * fu), weft = Math.sin(Math.PI * fv);
    h[y * S + x] = (over ? warp * (0.6 + 0.4 * weft) : weft * (0.6 + 0.4 * warp)) + slub[y * S + x] * 0.5;
  }
  return normalTexture(h, S, 3.0);
});

// painting canvas: a finer, tighter weave (cotton duck), primed (lower relief)
export const canvasNormal = () => weaveNormal(64, 41);

// caustics: bright webs where light focuses under rippling water (cellular pattern, tileable)
export const causticsTexture = () => once('caustics', () => {
  const S = 256, N = 22, r = rng(55), pts = [];
  for (let i = 0; i < N; i++) pts.push([r() * S, r() * S]);
  const v = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let f1 = 1e9, f2 = 1e9;
    for (const [px, py] of pts) for (let oy = -S; oy <= S; oy += S) for (let ox = -S; ox <= S; ox += S) {
      const d = Math.hypot(x - px - ox, y - py - oy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    const e = f2 - f1;                                    // small on the cell edges
    v[y * S + x] = Math.pow(Math.max(0, 1 - e / 9), 3);
  }
  const t = greyTexture(v, S);
  t.colorSpace = THREE.NoColorSpace;
  return t;
});

// wood relief + roughness from a plank picture (the procedural planks, or a scan)
export function woodMaps(canvasOrImage, S = 512) {
  const n = normalFromImage(canvasOrImage, S, 2.4, 0.6);
  return { normal: n };
}

// book spines: an atlas of 32 spines (8 x 4 cells) plus a cell of page edges. Each cell: the spine on the
// left 80%, the cover cloth on the right 20%. Bands, gilt rules and a title block, in the colours of a
// well-read shelf.
export const SPINE_CELLS = 32;
export const spineAtlas = () => once('spines', () => {
  const W = 1024, Hh = 1024, cw = W / 8, ch = Hh / 5;
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d'), r = rng(808);
  const cloth = ['#7a2e2e', '#1f3a5f', '#c9a24a', '#2f5d50', '#e8e0cf', '#2c4a2a', '#a4532e', '#1c1c1c', '#8a8a8a', '#5b3a6b', '#d7c3a1', '#3f6f8f', '#9c2f45', '#e0b46c', '#6e5a44', '#f1ebe0', '#38424f', '#b8742a'];
  for (let k = 0; k < SPINE_CELLS; k++) {
    const x = (k % 8) * cw, y = Math.floor(k / 8) * ch, col = cloth[k % cloth.length];
    g.fillStyle = col; g.fillRect(x, y, cw, ch);
    // cloth texture
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`; g.fillRect(x + r() * cw, y + r() * ch, 2, 1); }
    // the spine runs vertically (v); the room-facing face spans u 0..0.8 of the cell
    const sw = cw * 0.8, light = parseInt(col.slice(1), 16) > 0x999999;
    const ink = light ? 'rgba(40,30,20,0.85)' : r() < 0.6 ? 'rgba(226,192,122,0.95)' : 'rgba(245,240,230,0.9)';
    g.fillStyle = ink;
    const style = k % 4;
    if (style !== 3) { g.fillRect(x + 4, y + ch * 0.08, sw - 8, 3); g.fillRect(x + 4, y + ch * 0.92, sw - 8, 3); }
    if (style === 0) { g.fillRect(x + 4, y + ch * 0.12, sw - 8, 1.5); g.fillRect(x + 4, y + ch * 0.88, sw - 8, 1.5); }
    if (style === 1) { g.fillStyle = light ? '#7a2e2e' : '#1c1c1c'; g.fillRect(x + 6, y + ch * 0.22, sw - 12, ch * 0.2); g.fillStyle = ink; }
    // title: short strokes down the spine, author lower down
    const tx = x + sw / 2;
    let ty = y + ch * (style === 1 ? 0.26 : 0.24);
    const words = 2 + Math.floor(r() * 3);
    for (let w = 0; w < words; w++) { const L = 6 + r() * 16; g.fillRect(tx - 3, ty, 6, L); ty += L + 4; }
    g.fillRect(tx - 2, y + ch * 0.74, 4, 10 + r() * 10);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + sw, y, 2, ch);           // the joint
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, 3, ch); g.fillRect(x + sw - 3, y, 3, ch);   // rounded spine shading
  }
  // page edges (last row): cream with fine lines
  g.fillStyle = '#efe6d2'; g.fillRect(0, ch * 4, W, ch);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,100,70,${0.05 + r() * 0.1})`; g.fillRect(0, ch * 4 + r() * ch, W, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
});
// UV rectangles in the atlas for spine k
export function spineUV(k) {
  const cw = 1 / 8, ch = 1 / 5, x = (k % 8) * cw, y = 1 - (Math.floor(k / 8) + 1) * ch;   // flipY: row 0 at the top
  return { spine: [x, y, x + cw * 0.8, y + ch], cover: [x + cw * 0.82, y, x + cw * 0.98, y + ch], pages: [0.02, 0.01, 0.98, ch - 0.01] };
}
