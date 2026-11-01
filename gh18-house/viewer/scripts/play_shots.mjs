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
  await page.goto(`http://localhost:${PORT}/play/?headless&birthday`);
  await page.waitForFunction(() => window.play && window.play.ready, null, { timeout: 180000 });
  console.log('info', JSON.stringify(await page.evaluate(() => window.play.info())));
  const shot = async (name, fn) => {
    const s = await page.evaluate(fn);
    if (s) console.log(name, JSON.stringify(s));
    await page.screenshot({ path: path.join(out, name + '.png') });
  };
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  const plan = [
    ['01_tour', () => { play.tour('overview'); return play.state(); }],
    ['02_room', () => { play.room('Family Lounge'); return play.state(); }],
    ['03_walk', () => { play.tour('overview'); return play.walk(); }],
    ['04_car', () => play.stroll(1.6, 'KeyW', 113)],
    ['05_in_car', () => { play.enter(); play.render(); return play.state(); }],
    ['06_coast', () => { play.drive(1.5, { throttle: 0.5 }); play.drive(2.6, { throttle: 0.3, steer: 1 }); play.drive(1.0, { throttle: 0.6, steer: -0.2 }); return play.drive(4, { throttle: 0.8 }); }],
    ['07_driver', () => { play.camera('driver'); return play.drive(0.6, { throttle: 0.5, steer: 0.6 }); }],
    ['08_arrive', () => { play.camera('chase'); play.teleport(91, 36.5, 0); return play.exit(); }],
    ['09_inside', () => play.foot(104.2, 43.6, -20, 0.2, 0.6)],
    ['10_nook', () => { play.foot(100.25, 46.4, -90, 0.2, 0.6); play.interact(); return play.state(); }],
    ['11_album', () => { play.interact(); play.foot(103.9, 47.9, 0, 0.3, 0.6); play.interact(); play.page(1); return play.state(); }],
    ['12_lounger', () => { play.close(); play.foot(109.4, 52.4, 90, 0.2, 0.6); play.interact(); play.sunset(40); return play.state(); }],
  ];
  for (const [n, f] of plan) if (!only || only.includes(n)) await shot(n, f);
} finally {
  await browser.close();
  server.kill();
}
