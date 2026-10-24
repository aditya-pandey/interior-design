// Render the film's frames from the live three.js model (headless Chromium, SwiftShader).
// Usage: node film/render.mjs [gpu] [only=s01_aerial,s04_drawing] [still] [w=1920 h=804]
//   still : render only the middle frame of each shot (framing check) into film/stills/
// Frames go to film/frames/<shot>/0001.png; existing frames are skipped (resumable).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, poseAt, framesOf } from './shots.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')).map(([k, v]) => [k, v ?? true]));
const only = args.only ? String(args.only).split(',') : null;
const W = +(args.w || 1920), H = +(args.h || 804);
const PORT = 4173;

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

let server = null;
try { await fetch(`http://localhost:${PORT}/`); } catch {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
  await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(); }); setTimeout(res, 8000); });
}

// `gpu`: visible browser window on the real GPU (fast on a Mac); default: headless SwiftShader (CPU, any machine)
const browser = args.gpu
  ? await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
  : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', String(e)));
await page.goto(`http://localhost:${PORT}/?headless&cinema`);
await page.waitForFunction(() => window.viewer && (window.viewer.ready || window.viewer.error), null, { timeout: 300000 });
await page.waitForTimeout(4000);    // textures

const t0 = Date.now();
let done = 0;
for (const shot of SHOTS) {
  if (only && !only.includes(shot.id)) continue;
  const n = framesOf(shot);
  const dir = path.join(here, args.still ? 'stills' : path.join('frames', shot.id));
  mkdirSync(dir, { recursive: true });
  const list = args.still ? [Math.floor(n / 2)] : [...Array(n).keys()];
  for (const i of list) {
    const file = args.still ? path.join(dir, `${shot.id}.png`) : path.join(dir, String(i + 1).padStart(4, '0') + '.png');
    if (!args.still && existsSync(file)) continue;
    const pose = poseAt(shot, n > 1 ? i / (n - 1) : 0);
    await page.evaluate((o) => { window.viewer.cine(o); window.viewer.renderFrame(); }, pose);
    await page.screenshot({ path: file });
    done++;
    if (done % 24 === 0 || args.still) {
      const rate = (Date.now() - t0) / 1000 / done;
      console.log(`${shot.id} ${i + 1}/${n}  ${rate.toFixed(1)} s/frame`);
    }
  }
}
await browser.close();
if (server) server.kill();
console.log('done', done, 'frames in', ((Date.now() - t0) / 60000).toFixed(1), 'min');
