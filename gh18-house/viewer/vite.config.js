import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// house.json lives one level up; textures are served from ../assets.
// PUBLIC_BUILD=1 (the hosted site) strips the client name and address from house.json,
// so the shared model doesn't say whose house it is or where it is.
const PUBLIC = process.env.PUBLIC_BUILD === '1';

const stripPrivate = {
  name: 'strip-private-house-data',
  enforce: 'pre',
  transform(code, id) {
    if (!PUBLIC || !/house(_r1)?\.json$/.test(id)) return null;
    const h = JSON.parse(code);
    h.meta.project = 'GH-18';
    delete h.meta.client;
    delete h.meta.source;
    return { code: JSON.stringify(h), map: null };
  },
};

// Absolute site URL for the link-preview tags in index.html (og:image must be absolute).
// Netlify sets URL during its build; the GitHub Pages workflow sets SITE_URL.
const SITE_URL = (process.env.SITE_URL || process.env.URL || '').replace(/\/?$/, '/');
const siteUrl = {
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', SITE_URL === '/' ? '' : SITE_URL),
};

// Extra pages, all from the same build: each is index.html with a <base> pointing back at the site
// root (so nothing is duplicated) and a flag for main.js. A URL without the trailing slash first
// redirects to the slashed one, where the relative <base> is right.
//   /withpainting/      the family's paintings on
//   /v1/                Revision R1 (owner changes, Oct 2026) - the main site stays as it is
//   /v1/withpainting/   Revision R1 with the paintings
const PAGES = [
  { dir: 'withpainting', base: '../', flags: { GH18_ART: true }, title: ' · with paintings' },
  { dir: 'v1', base: '../', flags: { GH18_REV: 'r1' }, title: ' · R1' },
  { dir: 'v1/withpainting', base: '../../', flags: { GH18_REV: 'r1', GH18_ART: true }, title: ' · R1 · with paintings' },
];
const extraPages = {
  name: 'extra-pages',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(__dirname, 'dist');
    const src = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    for (const pg of PAGES) {
      const flags = Object.entries(pg.flags).map(([k, v]) => `window.${k} = ${JSON.stringify(v)};`).join(' ');
      const html = src
        .replace('<head>', `<head>
  <script>if (!location.pathname.endsWith('/')) location.replace(location.pathname + '/' + location.search + location.hash);</script>
  <base href="${pg.base}" />
  <script>${flags}</script>`)
        .replaceAll('GH-18 · 3D Home Tour', 'GH-18 · 3D Home Tour' + pg.title)
        .replace(/(og:url" content="[^"]+)/, `$1${pg.dir}/`);
      fs.mkdirSync(path.join(dist, pg.dir), { recursive: true });
      fs.writeFileSync(path.join(dist, pg.dir, 'index.html'), html);
    }
    // R1 materials schedule (tools/boq.py), linked from the Materials view's legend
    fs.mkdirSync(path.join(dist, 'files'), { recursive: true });
    for (const f of ['GH-18_R1_materials.pdf', 'GH-18_R1_materials.xlsx']) {
      const src = path.resolve(__dirname, '../plans/r1', f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, 'files', f));
    }
  },
};

export default defineConfig({
  base: './',                       // relative paths so the site works under a sub-path (GitHub Pages)
  publicDir: '../assets',
  plugins: [stripPrivate, siteUrl, extraPages],
  server: { port: 5173, fs: { allow: ['..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
