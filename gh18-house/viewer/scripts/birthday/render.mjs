// The birthday film: renders every frame from the play world (/play/) on this machine's GPU, then the music,
// then encodes the video with ffmpeg.
//
//   npm run birthday                      1920×1080, 30 fps, the built-in score  → film/birthday/Happy-Birthday-Deepti.mp4
//   npm run birthday -- --4k              3840×2160
//   npm run birthday -- --music song.mp3  her song instead of the built-in score (faded in and out to the film's length)
//   npm run birthday -- --stills          one frame from the middle of each shot (film/birthday/stills/), a quick look
//   npm run birthday -- --preview         a quick 960×540 version of the whole film
//   other options: --fps 24, --ss 1.5 (supersampling; default 1.5, 1 is faster), --no-build, --cpu (no GPU, slow),
//                  --only title,drive (just those shots, frames kept), --encode (skip rendering, encode what's there)
//
// Frames are kept in film/birthday/frames-<w>x<h>/ and a re-run picks up where it stopped. Everything goes to the
// gitignored film/birthday/ folder: the film is personal (her photographs and poems), keep it off the public site.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeScore } from './score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const [W, H] = flag('4k') ? [3840, 2160] : flag('preview') || flag('stills') ? [960, 540] : (opt('res', '1920x1080').split('x').map(Number));
const FPS = +opt('fps', 30), SS = +opt('ss', flag('4k') ? 1 : flag('cpu') || flag('preview') || flag('stills') ? 1 : 1.5);
const only = opt('only', null)?.split(',');
const OUT = path.join(root, 'film/birthday');
const FRAMES = path.join(OUT, flag('stills') ? 'stills' : `frames-${W}x${H}`);
const PORT = 4199;
mkdirSync(FRAMES, { recursive: true });

const sh = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...o }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`); };
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
if (!flag('stills') && !hasFfmpeg()) { console.error('ffmpeg is needed to make the video: brew install ffmpeg'); process.exit(1); }

// ---- 1. build the site (with her pack: the photos, paintings and poems)
if (!flag('no-build') && !flag('encode')) {
  console.log('Building…');
  sh('npx', ['vite', 'build', '--logLevel', 'warn'], { env: { ...process.env, PUBLIC_BUILD: '', PLAY_PERSONAL: '1' } });
  sh('npx', ['vite', 'build', '-c', 'vite.play.config.js', '--logLevel', 'warn'], { env: { ...process.env, PUBLIC_BUILD: '', PLAY_PERSONAL: '1' } });
}
if (!existsSync(path.join(root, 'dist/play/deepti/pack.json'))) { console.error('dist/play/deepti is missing: run without --no-build'); process.exit(1); }
const pack = JSON.parse(readFileSync(path.join(root, 'play/deepti/pack.json'), 'utf8'));

// ---- 2. render the frames
let info = null;
if (!flag('encode')) {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
  await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(); }); setTimeout(res, 10000); });
  const { chromium } = await import('playwright');
  // the GPU: a real (visible) browser window, Metal on a Mac. --cpu: headless SwiftShader (any machine, ~50× slower)
  const exe = process.env.FILM_CHROME ? { executablePath: process.env.FILM_CHROME } : {};       // (another Chromium, if Playwright's own isn't installed)
  const browser = flag('cpu')
    ? await chromium.launch({ ...exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    : await chromium.launch({ ...exe, headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SS });
  page.on('pageerror', (e) => console.error('page error:', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  console.log(`Loading the world (${W}×${H}, ${FPS} fps${SS !== 1 ? `, ${SS}× supersampled` : ''})…`);
  await page.goto(`http://localhost:${PORT}/play/?headless&drive`);
  await page.waitForFunction(() => window.play && window.play.ready, null, { timeout: 600000 });
  await page.evaluate(() => document.fonts.ready);
  const bd = pack.birthday;
  await page.evaluate(({ W, H, FPS, bd }) => { window.FILM_W = W; window.FILM_H = H; window.FILM_FPS = FPS; window.FILM_BDAY = bd; }, { W, H, FPS, bd });
  await page.addScriptTag({ content: readFileSync(path.join(here, 'film-page.js'), 'utf8') });
  await page.evaluate(() => window.FILM.ready());
  await page.waitForTimeout(3000);                                  // (textures)
  info = await page.evaluate(() => ({ total: window.FILM.total, frames: window.FILM.frames, shots: window.FILM.shots, bad: window.FILM.check() }));
  if (flag('check') && info.bad.length) console.warn('camera path points over furniture or walls:', info.bad.join('; '));
  console.log(`${info.shots.length} shots, ${info.total.toFixed(1)} s, ${info.frames} frames`);

  // which frames
  let list;
  const AT = opt('at', '0.5').split(',').map(Number);       // (--stills --at 0.1,0.5,0.9: those points of each shot)
  if (flag('stills')) list = info.shots.filter((s) => !only || only.includes(s.name)).flatMap((s) => AT.map((u, k) => ({ i: Math.round((s.t0 + s.dur * u) * FPS), name: s.name + (AT.length > 1 ? '-' + (k + 1) : '') })));
  else {
    list = [];
    for (let i = 0; i < info.frames; i++) {
      if (only) { const T = i / FPS; if (!info.shots.some((s) => only.includes(s.name) && T >= s.t0 && T < s.t0 + s.dur)) continue; }
      list.push({ i });
    }
  }
  const file = (f) => path.join(FRAMES, f.name ? `${f.name}.jpg` : String(f.i).padStart(6, '0') + '.jpg');
  const todo = list.filter((f) => flag('stills') || !existsSync(file(f)) || statSync(file(f)).size < 1000);
  if (todo.length < list.length) console.log(`${list.length - todo.length} frames already rendered, ${todo.length} to go`);
  const t0 = Date.now();
  // (frames are rendered in order, and the page is primed a few frames before a resume point, so the water's
  //  and the lights' smoothing match an uninterrupted run)
  let prev = -2;
  for (let n = 0; n < todo.length; n++) {
    const f = todo[n];
    if (f.i !== prev + 1) for (let k = Math.max(0, f.i - 3); k < f.i; k++) await page.evaluate((k) => window.FILM.frame(k, 0, false), k);
    const url = await page.evaluate((i) => window.FILM.frame(i, 0.95), f.i);
    writeFileSync(file(f), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    prev = f.i;
    if (n % 30 === 29 || n === todo.length - 1 || flag('stills')) {
      const per = (Date.now() - t0) / 1000 / (n + 1), left = (todo.length - n - 1) * per;
      process.stdout.write(`\r  frame ${n + 1}/${todo.length}  ${per.toFixed(2)} s/frame  ${left > 90 ? Math.round(left / 60) + ' min' : Math.round(left) + ' s'} left   `);
    }
  }
  process.stdout.write('\n');
  writeFileSync(path.join(OUT, 'film.json'), JSON.stringify({ W, H, FPS, total: info.total, frames: info.frames, shots: info.shots }, null, 1));
  await browser.close();
  server.kill();
}
if (flag('stills')) { console.log('Stills in', FRAMES); process.exit(0); }
if (only) { console.log('Rendered the frames for', only.join(', '), '(run again without --only for the whole film)'); process.exit(0); }

// ---- 3. the music
info = info || JSON.parse(readFileSync(path.join(OUT, 'film.json'), 'utf8'));
const total = info.frames / FPS;
const have = readdirSync(FRAMES).filter((f) => /^\d{6}\.jpg$/.test(f)).length;
if (have < info.frames) { console.error(`only ${have} of ${info.frames} frames rendered: run again without --encode`); process.exit(1); }
let music = opt('music', null);
if (music) {
  music = path.resolve(process.env.INIT_CWD || process.cwd(), music);
  if (!existsSync(music)) { console.error('music file not found:', music); process.exit(1); }
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', music], { encoding: 'utf8' });
  const d = +p.stdout;
  if (d && d < total - 1) console.warn(`note: the song (${d.toFixed(0)} s) is shorter than the film (${total.toFixed(0)} s); the end will be silent`);
} else {
  music = path.join(OUT, 'score.wav');
  console.log('Writing the music…');
  writeScore(music, total, info.shots);
}

// ---- 4. encode: H.264 (high quality, plays everywhere: QuickTime, WhatsApp, phones), AAC 320k
const out = path.join(OUT, `Happy-Birthday-Deepti${W >= 3840 ? '-4K' : flag('preview') ? '-preview' : ''}.mp4`);
console.log('Encoding…');
const fadeOut = Math.max(0, total - 5).toFixed(2);
sh('ffmpeg', ['-y', '-loglevel', 'error', '-stats',
  '-framerate', String(FPS), '-i', path.join(FRAMES, '%06d.jpg'),
  '-i', music,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', W >= 3840 ? 'medium' : 'slow', '-crf', W >= 3840 ? '17' : '15', '-tune', 'film',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-af', `afade=t=in:d=1.2,afade=t=out:st=${fadeOut}:d=5`,
  '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
  '-t', total.toFixed(3), '-movflags', '+faststart',
  '-metadata', 'title=Happy Birthday, Deepti', out]);
console.log('\nDone:', out);
if (flag('preview')) rmSync(path.join(OUT, 'score.wav'), { force: true });
