import * as THREE from 'three';
import { SERIF, SANS } from './fonts.js';

// Her books in the studio's library: an oak library cart by the reading nook, her books standing on it with their
// titles on the spines. E (or a click) on one and her e-reader comes up open at that book (where she left off).
export function buildBookCart(books, { x, y, z, rot = 0 }) {
  const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = rot;
  const oak = new THREE.MeshStandardMaterial({ color: 0x9c7450, roughness: 0.55 }), brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 0.8 });
  const box = (w, h, d, px, py, pz, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; group.add(o); return o; };
  const W = 0.95, D = 0.42;
  for (const ty of [0.18, 0.62]) box(W, 0.03, D, 0, ty, 0, oak);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.035, 0.66, 0.035, sx * (W / 2 - 0.02), 0.33 + 0.08, sz * (D / 2 - 0.02), oak);
  box(W, 0.12, 0.02, 0, 0.7, -D / 2 + 0.01, oak);                           // a back rail
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12).rotateZ(Math.PI / 2), brass); c.position.set(sx * (W / 2 - 0.05), 0.04, sz * (D / 2 - 0.05)); group.add(c); }
  // the books: on the top tier, spines out; a few lying on the lower one
  const interact = [];
  const spine = (title, author, col) => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, 96, 512);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 28, 96, 3); g.fillRect(0, 481, 96, 3);
    g.save(); g.translate(56, 256); g.rotate(-Math.PI / 2); g.fillStyle = '#f4ead6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 400 40px ${SERIF}`; let t = title; while (g.measureText(t).width > 420 && t.length > 3) t = t.slice(0, -2); g.fillText(t === title ? t : t + '…', 0, 0);
    g.restore();
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx;
  };
  const COLS = ['#7a2e2e', '#2f4f4f', '#3b3b6b', '#6b4f2a', '#2e5a3a', '#5a2e4f', '#8a6a2a', '#30404f'];
  let bx = -W / 2 + 0.06;
  books.forEach((b, i) => {
    const th = 0.035 + ((i * 37) % 3) * 0.008, h = 0.23 + ((i * 53) % 4) * 0.012, col = COLS[(b.title.length + i) % COLS.length];
    const cover = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }), pages = new THREE.MeshStandardMaterial({ color: 0xf1e8d6, roughness: 0.9 });
    const sp = new THREE.MeshStandardMaterial({ map: spine(b.title, b.author, col), roughness: 0.55 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(th, h, 0.17), [cover, cover, pages, pages, sp, pages]);
    m.position.set(bx + th / 2, 0.635 + h / 2, 0.02); m.castShadow = true; group.add(m);
    bx += th + 0.004;
    m.updateMatrixWorld();
    interact.push({ kind: 'book', index: i, label: `Read “${b.title}”`, mesh: m, r: 1.9 });
  });
  group.updateMatrixWorld(true);
  for (const it of interact) { const p = new THREE.Vector3(); it.mesh.getWorldPosition(p); it.pos = [p.x, p.y, p.z]; }
  interact.push({ kind: 'reader', label: 'Her books', pos: [x, y + 0.7, z], r: 1.6 });
  const c = Math.cos(rot), s = Math.sin(rot), mm = (v) => Math.round(v * 1000);
  const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([u, v]) => [mm(x + u * c + v * s), mm(z - u * s + v * c)]);
  return { group, interact, collider: { poly: corners, y0: y, y1: y + 0.9 } };
}
