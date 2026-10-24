// Screenshot every camera preset plus the key modes (dusk, cutaway, explode, walk, labels).
// Usage: npm run build && npm run shots [-- only=id1,id2] [-- low]
// Uses Playwright's Chromium with SwiftShader WebGL, so it runs headless without a GPU.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')).map(([k, v]) => [k, v ?? true]));
const only = args.only ? String(args.only).split(',') : null;
const PORT = 4173;

// reuse a running `vite preview` on PORT, otherwise start one
let server = null;
try {
  await fetch(`http://localhost:${PORT}/`);
} catch {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
  await new Promise((res, rej) => {
    server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(); });
    server.on('exit', (c) => rej(new Error('preview exited ' + c)));
    setTimeout(res, 8000);
  });
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +(args.w || 1600), height: +(args.h || 1000) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/?headless${args.low ? '&low' : ''}${args.art ? '&art' : ''}`);   // art: the /withpainting version
await page.waitForFunction(() => window.viewer && (window.viewer.ready || window.viewer.error), null, { timeout: 180000 });
const err = await page.evaluate(() => window.viewer.error);
if (err) { console.error(err); process.exit(1); }
// let textures load
await page.waitForTimeout(4000);

async function shot(name, setup) {
  if (only && !only.includes(name)) return;
  await page.evaluate(setup);
  await page.evaluate(() => window.viewer.settle(4));
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('shot', name);
}

const presets = await page.evaluate(() => window.viewer.presets());
for (const p of presets) {
  await shot(`preset_${p.id}`, `window.viewer.setTime('day'); window.viewer.setLabels(false); window.viewer.goPreset('${p.id}', true)`);
}
await shot('mode_dusk_all', `window.viewer.setTime('dusk'); window.viewer.goPreset('all', true)`);
await shot('mode_dusk_gf_cutaway', `window.viewer.setTime('dusk'); window.viewer.goPreset('gf', true)`);
await shot('mode_dusk_rear', `window.viewer.setTime('dusk'); window.viewer.goPreset('rear', true)`);
await shot('mode_labels_gf', `window.viewer.setTime('day'); window.viewer.goPreset('gf', true); window.viewer.setLabels(true)`);
await shot('mode_labels_ff', `window.viewer.setTime('day'); window.viewer.goPreset('ff', true); window.viewer.setLabels(true)`);
await shot('walk_drawing_to_lawn', `window.viewer.setLabels(false); window.viewer.setTime('day'); window.viewer.walkPose(6600, 9900, 0.45, 0, -3)`);
await shot('walk_foyer', `window.viewer.walkPose(5200, 19800, 0.45, 20, -2)`);
await shot('walk_kitchen', `window.viewer.walkPose(2600, 10600, 0.45, 14, -10)`);
await shot('walk_dining', `window.viewer.walkPose(6500, 11800, 0.45, 22, -8)`);
await shot('walk_wash', `window.viewer.walkPose(2700, 4300, 0.3, 80, -12)`);
await shot('walk_master', `window.viewer.walkPose(5000, 7000, 3.75, -120, -8)`);
await shot('walk_kids', `window.viewer.walkPose(7600, 16600, 3.75, 155, -10)`);
await shot('walk_bedroom3', `window.viewer.walkPose(2900, 14200, 3.75, 160, -8)`);
await shot('walk_mandir', `window.viewer.walkPose(6500, 17495, 0.45, -90, -2)`);
if (args.art) {
  await shot('art_master_bed', `window.viewer.walkPose(5300, 8738, 3.75, -90, 2)`);
  await shot('art_master_buddha', `window.viewer.walkPose(6250, 7700, 3.75, 180, 0)`);
  await shot('art_lobby_horses', `window.viewer.walkPose(5800, 11450, 3.75, 115, 0)`);
  await shot('art_bedroom3_gallery', `window.viewer.walkPose(1500, 17250, 3.75, -90, 3)`);
}
await shot('walk_dusk_drawing', `window.viewer.setTime('dusk'); window.viewer.walkPose(8200, 10300, 0.45, 35, -6)`);
const stats = await page.evaluate(() => window.viewer.stats());
console.log('stats', JSON.stringify(stats));
if (errors.length) console.log('console errors:\n' + errors.slice(0, 20).join('\n'));
await browser.close();
if (server) server.kill();
