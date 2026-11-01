import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { stripPrivate } from './vite.config.js';

// /play/ : the free-roam version (drive the Baleno around the colony). A second, separate build so the
// home tour's bundle (vite.config.js) is untouched. It runs after the main build (npm run build) and
// adds dist/play/index.html + its own chunks to dist/assets; textures and models are already in dist
// from the main build, so publicDir is only used by the dev server.
//
// The page sits one folder down but fetches textures/ and models/ relative to the site root, so
// play/index.html carries <base href="../">; the built page's asset links (emitted as ../assets/...)
// are rewritten to match that base.
//
// play/deepti/ is her personal pack (paintings, poems, music list). It is copied into dist/play/deepti/
// only for private builds: the public site build (PUBLIC_BUILD=1, as on GitHub Pages and Netlify)
// leaves it out unless PLAY_PERSONAL=1 is set on purpose. Without it the studio's frames hang empty.
const PERSONAL = process.env.PUBLIC_BUILD !== '1' || process.env.PLAY_PERSONAL === '1';
const playPage = {
  name: 'play-page',
  apply: 'build',
  closeBundle() {
    const f = path.resolve(__dirname, 'dist/play/index.html');
    let html = fs.readFileSync(f, 'utf8');
    html = html.replace(/(src|href)="\.\.\/assets\//g, '$1="assets/');
    fs.writeFileSync(f, html);
    const out = path.resolve(__dirname, 'dist/play/deepti');
    fs.rmSync(out, { recursive: true, force: true });
    if (PERSONAL) fs.cpSync(path.resolve(__dirname, 'play/deepti'), out, { recursive: true });
  },
};

export default defineConfig(({ command }) => ({
  base: './',
  publicDir: command === 'serve' ? '../assets' : false,
  plugins: [stripPrivate, playPage],
  server: { port: 5174, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { play: path.resolve(__dirname, 'play/index.html') } },
  },
}));
