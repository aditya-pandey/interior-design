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
  // 1) the home tour itself (as on /v1/), then walking up to the car in its walk mode
  await page.waitForFunction(() => window.viewer && window.viewer.ready, null, { timeout: 180000 });
  await page.evaluate(() => window.viewer.settle(3));
  await page.screenshot({ path: path.join(out, '00_tour.png') });
  await page.evaluate(() => { window.viewer.walkPose(6900, 24300, 0, -16, -6); window.viewer.settle(2); });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.viewer.settle(1));
  await page.screenshot({ path: path.join(out, '00b_car_prompt.png') });
  console.log('prompt shown:', await page.evaluate(() => !document.getElementById('play-prompt').hidden));
  // 2) get in: the drive takes over
  await page.evaluate(() => window.playEntry.start());
  await page.waitForFunction(() => window.play && window.play.ready, null, { timeout: 180000 });
  console.log('info', JSON.stringify(await page.evaluate(() => window.play.info())));
  const shot = async (name, fn) => {
    const s = await page.evaluate(fn);
    if (s) console.log(name, JSON.stringify(s));
    await page.screenshot({ path: path.join(out, name + '.png') });
  };
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  const plan = [
    ['05_in_car', () => { play.render(); return play.state(); }],
    ['06_coast', () => { play.drive(1.5, { throttle: 0.5 }); play.drive(2.6, { throttle: 0.3, steer: 1 }); play.drive(1.0, { throttle: 0.6, steer: -0.2 }); return play.drive(4, { throttle: 0.8 }); }],
    ['07_driver', () => { play.camera('driver'); return play.drive(0.6, { throttle: 0.5, steer: 0.6 }); }],
    ['08_arrive', () => { play.camera('chase'); play.teleport(91, 36.5, 0); return play.exit(); }],
    ['09_inside', () => play.foot(104.2, 43.6, -20, 0.2, 0.6)],
    ['10_nook', () => { play.foot(100.25, 46.4, -90, 0.2, 0.6); play.interact(); return play.state(); }],
    ['11_album', () => { play.interact(); play.foot(103.9, 47.9, 0, 0.3, 0.6); play.interact(); play.page(1); return play.state(); }],
    ['12_lounger', () => { play.close(); play.foot(109.4, 52.4, 90, 0.2, 0.6); play.interact(); play.sunset(40); return play.state(); }],
    // realism: the sea, the sand, the night sky
    ['13_shore_evening', () => { play.close(); play.setTime('evening'); play.foot(104, 56.5, 0, 0.12); play.wait(1); return play.quality(); }],
    ['14_shore_day', () => { play.setTime('day'); play.foot(104, 56.5, 20, 0.12); return play.wait(1); }],
    ['15_waterline', () => { play.setTime('evening'); play.foot(96, 57.5, 30, 0.55); return play.wait(1); }],
    ['16_night_sea', () => { play.setTime('night'); play.foot(104, 56.5, 42, 0.02); return play.wait(1); }],
    ['17_shooting_star', () => { play.foot(104, 56.5, 42, -0.3); play.wait(0.05, true); return play.wait(0.4); }],
    ['18_dusk', () => { play.setTime('dusk'); play.foot(104, 56.5, 60, -0.05); return play.wait(1); }],
    ['19_gallery', () => { play.setTime('day'); play.foot(104.2, 44.6, 180, 0.05, 0.6); return play.wait(0.2); }],
    ['20_books', () => { play.foot(101.2, 46.4, -90, 0.12, 0.6); return play.wait(0.2); }],
  ];
  for (const [n, f] of plan) if (!only || only.includes(n)) await shot(n, f);
} finally {
  await browser.close();
  server.kill();
}
