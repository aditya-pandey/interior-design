import { defineConfig } from 'vite';

// house.json lives one level up; textures are served from ../assets
export default defineConfig({
  publicDir: '../assets',
  server: { port: 5173, fs: { allow: ['..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
