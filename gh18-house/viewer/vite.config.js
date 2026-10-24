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

export default defineConfig({
  base: './',                       // relative paths so the site works under a sub-path (GitHub Pages)
  publicDir: '../assets',
  plugins: [stripPrivate],
  server: { port: 5173, fs: { allow: ['..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
