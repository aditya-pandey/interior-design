import * as THREE from 'three';

// While she walks round the house in the tour, the drive's code and its heaviest files are fetched in the
// background, so "Get in the car" doesn't wait on the network: the code is preloaded (parsed, not run), and
// the models, her moves and her paintings go into three.js's file cache, where the loaders in main.js find
// them (same URLs). main.js empties the cache once it has used them.
//
// The code's file names have hashes in them; the play build writes the list in place of this placeholder
// (vite.play.config.js). In the dev server there's no list: only the files are fetched.
const CHUNKS = '__PLAY_MAIN_CHUNKS__';
const MODELS = ['models/baleno.glb', 'play/models/roma.glb', 'play/models/vespa.glb', 'play/models/bike.glb', 'play/models/woman.glb',
  ...['walk', 'run', 'sit', 'drive', 'enter'].map((m) => `play/models/anims/${m}.fbx`)];

let started = false;
export function prefetch() {
  if (started) return;
  started = true;
  if (Array.isArray(CHUNKS)) for (const href of CHUNKS) {
    const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; document.head.appendChild(l);
  }
  THREE.Cache.enabled = true;
  const files = new THREE.FileLoader().setResponseType('arraybuffer'), images = new THREE.ImageLoader();
  // two at a time, so the tour stays smooth
  const queue = [...MODELS.map((u) => () => files.loadAsync(u))];
  fetch('play/deepti/pack.json').then((r) => r.json()).then((p) => {
    const base = p.base || 'play/deepti/';
    for (const a of [...(p.art || []), ...(p.album?.photos || [])]) if (a.file) queue.push(() => images.loadAsync(base + a.file));
  }).catch(() => {});
  const next = () => { const job = queue.shift(); if (job) job().catch(() => {}).finally(next); };
  next(); next();
}
