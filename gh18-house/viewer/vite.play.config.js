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

// The page opens with the home tour itself (src/main.js, as on /v1/): its markup is taken from the tour's
// index.html (everything in <body> except its script tag) so the two never drift apart.
const tourMarkup = {
  name: 'tour-markup',
  transformIndexHtml(html) {
    if (!html.includes('<!--TOUR-->')) return html;
    const src = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
    const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>')).replace(/<script[^>]*src="\/src\/main\.js"[^>]*><\/script>/, '');
    return html.replace('<!--TOUR-->', body.trim());
  },
};
const playPage = {
  name: 'play-page',
  apply: 'build',
  closeBundle() {
    const f = path.resolve(__dirname, 'dist/play/index.html');
    let html = fs.readFileSync(f, 'utf8');
    html = html.replace(/(src|href)="\.\.\/assets\//g, '$1="assets/');
    fs.writeFileSync(f, html);
    // the play's own textures (water normals; the Poly Haven scans once fetched): CC0, always copied
    const tex = path.resolve(__dirname, 'play/textures');
    if (fs.existsSync(tex)) fs.cpSync(tex, path.resolve(__dirname, 'dist/play/textures'), { recursive: true });
    const mdl = path.resolve(__dirname, 'play/models');           // the protagonist (CC0, built by tools/character)
    if (fs.existsSync(mdl)) fs.cpSync(mdl, path.resolve(__dirname, 'dist/play/models'), { recursive: true });
    const fnt = path.resolve(__dirname, 'play/fonts');            // Noto Serif Devanagari for her Hindi poems (SIL OFL 1.1, OFL.txt alongside)
    if (fs.existsSync(fnt)) fs.cpSync(fnt, path.resolve(__dirname, 'dist/play/fonts'), { recursive: true });
    // pdf.js's standard fonts and character maps, for her books (Apache-2.0, from node_modules/pdfjs-dist)
    for (const d of ['standard_fonts', 'cmaps']) { const src = path.resolve(__dirname, 'node_modules/pdfjs-dist', d); if (fs.existsSync(src)) fs.cpSync(src, path.resolve(__dirname, 'dist/play/pdfjs', d), { recursive: true }); }
    const out = path.resolve(__dirname, 'dist/play/deepti');
    fs.rmSync(out, { recursive: true, force: true });
    if (PERSONAL) fs.cpSync(path.resolve(__dirname, 'play/deepti'), out, { recursive: true });
  },
};

export default defineConfig(({ command }) => ({
  base: './',
  publicDir: command === 'serve' ? '../assets' : false,
  plugins: [stripPrivate, tourMarkup, playPage],
  server: { port: 5174, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { play: path.resolve(__dirname, 'play/index.html') } },
  },
}));
