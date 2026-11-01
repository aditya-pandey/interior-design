// Headless screenshots of /play/ (the drive). Usage, from gh18-house/viewer after `npm run build`:
//   node scripts/play_shots.mjs [outDir] [width] [height]
// Serves dist with `vite preview`, opens /play/?headless and drives the car with window.play.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); await chromium.launch().then((b) => b.close()); } catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}
const out = path.resolve(process.argv[2] || 'screenshots/play');
const W = +(process.argv[3] || 960), H = +(process.argv[4] || 540);
fs.mkdirSync(out, { recursive: true });
const PORT = 4188;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/play/?headless`);
  await page.waitForFunction(() => window.play && window.play.ready, null, { timeout: 180000 });
  console.log('info', JSON.stringify(await page.evaluate(() => window.play.info())));
  const shot = async (name, fn) => {
    const s = await page.evaluate(fn);
    if (s) console.log(name, JSON.stringify(s));
    await page.screenshot({ path: path.join(out, name + '.png') });
  };
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  const plan = [
    ['01_home', () => { play.home(); play.render(); return play.state(); }],
    ['02_out', () => play.drive(1.5, { throttle: 0.5 })],
    ['03_turn', () => play.drive(2.6, { throttle: 0.3, steer: 1 })],
    ['04_coast', () => { play.drive(1.0, { throttle: 0.6, steer: -0.2 }); return play.drive(5, { throttle: 0.8 }); }],
    ['05_driver', () => { play.camera('driver'); return play.drive(0.6, { throttle: 0.5, steer: 0.6 }); }],
    ['06_high', () => { play.camera('high'); play.render(); return play.state(); }],
    ['07_studio', () => { play.camera('chase'); play.teleport(84, 31, 40); play.look(0.5, 0.15, 1.6); return play.state(); }],
    ['08_inside', () => play.foot(103.6, 44.0, 0, -4, 0.6)],
    ['09_library', () => play.foot(102.6, 46.2, -100, 4, 0.6)],
    ['10_gallery', () => play.foot(106.8, 47.6, 180, 6, 0.6)],
    ['11_partition', () => play.foot(103.9, 44.6, 95, 4, 0.6)],
    ['12_poem', () => { const r = play.foot(110.9, 43.7, 180, 4, 0.6); play.interact(); return r; }],
    ['13_lounger', () => { play.close(); play.foot(109.4, 52.4, 90, 0, 0.6); play.interact(); play.sunset(40); return play.state(); }],
    ['14_night', () => { play.setTime('night'); play.exit && 0; play.foot(96, 33, 30, 4, 0); return play.state(); }],
  ];
  for (const [n, f] of plan) if (!only || only.includes(n)) await shot(n, f);
} finally {
  await browser.close();
  server.kill();
}
