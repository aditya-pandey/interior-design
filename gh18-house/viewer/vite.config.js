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

export default defineConfig({
  base: './',                       // relative paths so the site works under a sub-path (GitHub Pages)
  publicDir: '../assets',
  plugins: [stripPrivate, siteUrl],
  server: { port: 5173, fs: { allow: ['..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
