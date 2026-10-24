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
    if (!PUBLIC || !id.endsWith('house.json')) return null;
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

// /withpainting/: the same build with the paintings switched on. Its index.html points every relative
// URL back at the site root with <base href="../">, so nothing is duplicated. Without the trailing
// slash that base would be wrong, so that URL first redirects to the slashed one.
const withPainting = {
  name: 'with-painting-page',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(__dirname, 'dist');
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
      .replace('<head>', `<head>
  <script>if (!location.pathname.endsWith('/')) location.replace(location.pathname + '/' + location.search + location.hash);</script>
  <base href="../" />
  <script>window.GH18_ART = true;</script>`)
      .replaceAll('GH-18 · 3D Home Tour', 'GH-18 · 3D Home Tour · with paintings')
      .replace(/(og:url" content="[^"]+)/, '$1withpainting/');
    fs.mkdirSync(path.join(dist, 'withpainting'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'withpainting', 'index.html'), html);
  },
};

export default defineConfig({
  base: './',                       // relative paths so the site works under a sub-path (GitHub Pages)
  publicDir: '../assets',
  plugins: [stripPrivate, siteUrl, withPainting],
  server: { port: 5173, fs: { allow: ['..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
