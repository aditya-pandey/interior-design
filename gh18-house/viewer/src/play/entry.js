// /play/ entry: first the home tour itself, exactly as on /v1/ (the tour's own main.js, menus, views,
// lighting and walk mode). While she walks, a watcher looks for her near the Baleno in the parking and
// offers "Get in the car". Getting in releases the tour (its WebGL context is let go, which stops its
// render loop) and loads the drive: the coast, her studio, the birthday tune (src/play/main.js).
// ?drive skips the tour and starts in the car (testing).

const params = new URLSearchParams(location.search);
const CAR = { x: 7.615, z: 21.945 };          // the Baleno in GH-18's parking (house_r1.json GF-O07)
let started = false;

async function startDrive() {
  if (started) return;
  started = true;
  document.getElementById('play-prompt').hidden = true;
  const curtain = document.getElementById('play-loading');
  curtain.hidden = false;
  document.exitPointerLock?.();
  const canvas = document.querySelector('#app canvas');
  canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  for (const id of ['app', 'panel', 'walkhud', 'stick', 'svc-legend', 'loading']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  document.body.className = '';
  await import('./main.js');
}

function watch() {
  const prompt = document.getElementById('play-prompt');
  setInterval(() => {
    const v = window.viewer;
    if (started || !v || !v.ready) return;
    const cam = v.walker().camera.position;
    const near = v.state.mode === 'walk' && Math.hypot(cam.x - CAR.x, cam.z - CAR.z) < 3.0 && cam.y < 2.6;
    prompt.hidden = !near;
  }, 250);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !document.getElementById('play-prompt').hidden) startDrive(); });
  prompt.addEventListener('click', startDrive);
}

window.playEntry = { start: startDrive };
if (params.has('drive')) startDrive();
else import('../main.js').then(watch);
