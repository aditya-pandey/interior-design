import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import house from '../../house.json';
import { createMaterials } from './materials.js';
import { buildHouse, FLOOR_IDS } from './build.js';
import { Walker } from './walk.js';
import './style.css';

// ------------------------------------------------------------------ renderer & scene
const params = new URLSearchParams(location.search);
const LOW = params.has('low');          // ?low = no AO / smaller shadow map (old laptops, CI)

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // retina cap keeps AO + MSAA smooth on laptops
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
document.getElementById('app').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2500);
camera.position.set(22, 24, 34);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(4.7, 2, 12);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1.5;
controls.maxDistance = 120;

// ------------------------------------------------------------------ sky, sun, environment
const sky = new Sky();
sky.scale.setScalar(2000);
scene.add(sky);
// Image-based light: a neutral studio environment (the blue sky dome would tint every
// interior surface, since IBL is not occluded by walls). The physical sky stays as background.
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 4096, LOW ? 1024 : 4096);
const sc = sun.shadow.camera;
sc.left = -16; sc.right = 16; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 120;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
sun.target.position.set(4.7, 0, 12);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x9a8f80, 0.35);
scene.add(hemi);

// Plan: front (+Z) faces East (ASSUMPTIONS A-02), so North = +X, East = +Z.
function sunDir(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg), el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
}

const TIMES = {
  // Gurugram, late afternoon: sun in the south-west over the back lawn
  day: { az: 235, el: 34, sun: 2.6, sunColor: 0xfff0dc, exposure: 0.75, hemi: 0.15, env: 0.55, interior: 0, emissive: 0, turbidity: 3, rayleigh: 1.2 },
  // dusk: sun just below the western horizon, warm interiors on
  dusk: { az: 290, el: -1.5, sun: 0.0, sunColor: 0xff9a5c, exposure: 1.2, hemi: 0.12, env: 0.08, interior: 1, emissive: 1, turbidity: 6, rayleigh: 2.6 },
};

// ------------------------------------------------------------------ state
const state = { floor: 'ALL', explode: 0, cutaway: false, mode: 'orbit', time: 'day', labels: false };
let M, data, walker;
const floorGroups = {};
const ghost = new Map();
const pointLights = [];
let composer, gtao;

async function init() {
  M = await createMaterials(renderer);
  data = buildHouse(house, M);
  for (const fid of FLOOR_IDS) {
    floorGroups[fid] = new THREE.Group();
    floorGroups[fid].name = fid;
    scene.add(floorGroups[fid]);
  }
  for (const mesh of data.meshes) {
    const g = floorGroups[mesh.userData.floor];
    (g || scene).add(mesh);
  }
  // interior lights (dusk)
  for (const l of data.lights) {
    const color = l.kind === 'mandir' ? 0xffa646 : 0xffc58a;
    const I = l.kind === 'pendant' ? 6 : l.kind === 'mandir' ? 2.5 : Math.min(14, 2.5 + l.area * 0.55);
    const pl = new THREE.PointLight(color, I, 0, 2);
    pl.position.set(...l.pos);
    pl.userData.base = I;
    pl.visible = false;
    floorGroups[l.floor].add(pl);
    pointLights.push(pl);
  }
  // room labels
  for (const lb of data.labels) {
    const div = document.createElement('div');
    div.className = 'room-label' + (lb.status === 'PROPOSED' ? ' proposed' : '');
    div.innerHTML = `<b>${lb.name}</b><span>${(lb.w / 1000).toFixed(2)} × ${(lb.d / 1000).toFixed(2)} m</span><span>${lb.area.toFixed(1)} m² · ${(lb.area * 10.7639).toFixed(0)} ft²</span>`;
    const obj = new CSS2DObject(div);
    obj.position.set(...lb.pos);
    obj.userData.isLabel = true;
    floorGroups[lb.floor].add(obj);
  }
  walker = new Walker(camera, renderer.domElement, data);
  walker.controls.addEventListener('unlock', () => { walker.active = false; document.body.classList.remove('locked'); });
  walker.controls.addEventListener('lock', () => { walker.active = true; document.body.classList.add('locked'); });

  setupPost();
  buildUI();
  setTime('day');
  applyView();
  window.viewer.ready = true;
  document.getElementById('loading').remove();
}

function setupPost() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!LOW) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ view logic
const ORDER = { GF: 0, FF: 1, SF: 2, ROOF: 3 };

function ghostOf(mat) {
  if (!ghost.has(mat)) {
    const g = mat.clone();
    g.transparent = true; g.opacity = 0.12; g.depthWrite = false;
    ghost.set(mat, g);
  }
  return ghost.get(mat);
}

function applyView() {
  const walk = state.mode === 'walk';
  const lim = state.floor === 'ALL' ? 3 : ORDER[state.floor];
  for (const fid of FLOOR_IDS) {
    const g = floorGroups[fid];
    g.visible = walk || ORDER[fid] <= lim;
    g.position.y = walk ? 0 : ORDER[fid] * state.explode * 4.5;
    g.traverse((o) => {
      if (o.isMesh) {
        const cat = o.userData.cat;
        if (cat === 'ceiling') o.visible = walk;
        if (cat === 'glassUpper') o.visible = walk || !state.cutaway;
        if (cat === 'upper') {
          const top = !walk && state.cutaway;
          if (!o.userData.orig) o.userData.orig = o.material;
          o.material = top ? ghostOf(o.userData.orig) : o.userData.orig;
          o.castShadow = !top;
        }
      }
      if (o.userData.isLabel) o.visible = state.labels && !walk && (state.floor === fid || (state.floor === 'ALL' && fid === 'GF'));
    });
  }
  document.querySelectorAll('[data-floor]').forEach((b) => b.classList.toggle('on', b.dataset.floor === state.floor));
  document.querySelectorAll('[data-time]').forEach((b) => b.classList.toggle('on', b.dataset.time === state.time));
  const ck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
  ck('cutaway', state.cutaway); ck('labels', state.labels);
  const ex = document.getElementById('explode');
  if (ex) ex.value = state.explode;
  document.body.classList.toggle('walking', walk);
}

function setTime(t) {
  state.time = t;
  const T = TIMES[t];
  const d = sunDir(T.az, T.el);
  {
    const u = sky.material.uniforms;
    u.sunPosition.value.copy(d);
    u.turbidity.value = T.turbidity;
    u.rayleigh.value = T.rayleigh;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
  }
  sun.position.copy(d.clone().multiplyScalar(60)).add(sun.target.position);
  sun.intensity = T.sun;
  sun.color.set(T.sunColor);
  sun.visible = T.sun > 0;
  hemi.intensity = T.hemi;
  renderer.toneMappingExposure = T.exposure;
  scene.environmentIntensity = T.env;
  for (const pl of pointLights) pl.visible = T.interior > 0;
  M.cove.emissiveIntensity = T.emissive * 3;
  M.downlight.emissiveIntensity = T.emissive * 4;
  M.lamp.emissiveIntensity = T.emissive * 3;
  M.jaali_glow.emissiveIntensity = 0.8 + T.emissive * 2.5;
  applyView();
}

// ------------------------------------------------------------------ camera flights
let flight = null;
function flyTo(pos, target, dur = 1.0) {
  if (dur <= 0) {
    camera.position.copy(pos); controls.target.copy(target); controls.update();
    return;
  }
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur: dur * 1000 };
}

// Exterior / overview presets are derived from the plot size in house.json.
function overviewPresets() {
  const W = house.meta.plot.width_outer / 1000, D = house.meta.plot.depth_to_front_boundary / 1000;
  const cx = W / 2, cz = D / 2;
  return [
    { id: 'all', name: 'Dollhouse — whole house', group: 'Overview', floor: 'ALL', cut: false, pos: [cx + 24, 26, cz + 26], target: [cx, 3, cz] },
    { id: 'explode', name: 'Exploded floors', group: 'Overview', floor: 'ALL', cut: true, explode: 1, pos: [cx + 26, 28, cz + 24], target: [cx, 6, cz] },
    { id: 'gf', name: 'Ground floor (cutaway)', group: 'Overview', floor: 'GF', cut: true, pos: [cx + 14, 22, cz + 16], target: [cx, 0.5, cz] },
    { id: 'ff', name: 'First floor (cutaway)', group: 'Overview', floor: 'FF', cut: true, pos: [cx + 14, 25, cz + 16], target: [cx, 3.8, cz] },
    { id: 'sf', name: 'Second floor — PROPOSED (cutaway)', group: 'Overview', floor: 'SF', cut: true, pos: [cx + 14, 28, cz + 16], target: [cx, 7.1, cz] },
    { id: 'front', name: 'Exterior — front (East)', group: 'Overview', floor: 'ALL', cut: false, pos: [cx + 6, 3.5, D + 16], target: [cx, 4.5, D - 4] },
    { id: 'rear', name: 'Exterior — rear lawn (West)', group: 'Overview', floor: 'ALL', cut: false, pos: [cx - 5, 5.5, -14], target: [cx, 3.5, 6] },
  ];
}

function roomPresets() {
  return data.presets.map((p) => {
    const d = Math.max(5.5, p.size * 1.25 + 3.5);
    const [x, y, z] = p.target;
    return { id: p.id, name: p.name, group: { GF: 'Ground floor', FF: 'First floor', SF: 'Second floor (PROPOSED)' }[p.floor],
      floor: p.floor, cut: true, room: p, pos: [x + d * 0.45, y + d * 0.95, z + d * 0.6], target: [x, y - 0.6, z] };
  });
}

let PRESETS = [];
function goPreset(id, instant = false) {
  const p = PRESETS.find((q) => q.id === id);
  if (!p) return false;
  if (state.mode === 'walk') exitWalk();
  state.floor = p.floor; state.cutaway = p.cut; state.explode = p.explode || 0;
  applyView();
  flyTo(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.target), instant ? 0 : 1.1);
  document.getElementById('preset').value = id;
  return true;
}

// ------------------------------------------------------------------ walk mode
function enterWalk(roomId) {
  const id = roomId || document.getElementById('preset').value;
  const p = data.presets.find((q) => q.id === id) || data.presets.find((q) => q.id === 'GF-FOY');
  state.mode = 'walk';
  applyView();
  const [x, , z] = p.target;
  walker.place(x * 1000, z * 1000, p.fy, Math.PI, 0);
  controls.enabled = false;
  if (!window.viewer.headless) walker.controls.lock();
}
function exitWalk() {
  state.mode = 'orbit';
  walker.active = false;
  if (walker.controls.isLocked) walker.controls.unlock();
  controls.enabled = true;
  camera.rotation.set(0, 0, 0);
  applyView();
  flyTo(new THREE.Vector3(...overviewPresets()[0].pos), new THREE.Vector3(...overviewPresets()[0].target), 0);
}

// ------------------------------------------------------------------ UI
function buildUI() {
  PRESETS = [...overviewPresets(), ...roomPresets()];
  const sel = document.getElementById('preset');
  const groups = {};
  for (const p of PRESETS) {
    if (!groups[p.group]) {
      groups[p.group] = document.createElement('optgroup');
      groups[p.group].label = p.group;
      sel.appendChild(groups[p.group]);
    }
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    groups[p.group].appendChild(o);
  }
  sel.addEventListener('change', () => goPreset(sel.value));
  document.querySelectorAll('[data-floor]').forEach((b) => b.addEventListener('click', () => { state.floor = b.dataset.floor; applyView(); }));
  document.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => setTime(b.dataset.time)));
  document.getElementById('explode').addEventListener('input', (e) => { state.explode = +e.target.value; applyView(); });
  document.getElementById('cutaway').addEventListener('change', (e) => { state.cutaway = e.target.checked; applyView(); });
  document.getElementById('labels').addEventListener('change', (e) => { state.labels = e.target.checked; applyView(); });
  document.getElementById('walk').addEventListener('click', () => enterWalk());
  document.getElementById('exitwalk').addEventListener('click', () => exitWalk());
  renderer.domElement.addEventListener('click', () => { if (state.mode === 'walk' && !walker.controls.isLocked) walker.controls.lock(); });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyC') { state.cutaway = !state.cutaway; applyView(); }
    if (e.code === 'KeyL') { state.labels = !state.labels; applyView(); }
    if (e.code === 'KeyN') setTime(state.time === 'day' ? 'dusk' : 'day');
    if (e.code === 'Digit1') { state.floor = 'GF'; applyView(); }
    if (e.code === 'Digit2') { state.floor = 'FF'; applyView(); }
    if (e.code === 'Digit3') { state.floor = 'SF'; applyView(); }
    if (e.code === 'Digit0') { state.floor = 'ALL'; applyView(); }
    if (e.code === 'KeyQ' && state.mode === 'walk') exitWalk();
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  composer.setSize(s.x, s.y);
});

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
function frame() {
  if (!composer) return;
  const dt = Math.min(0.05, clock.getDelta());
  if (flight) {
    const k = Math.min(1, (performance.now() - flight.start) / flight.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(flight.p0, flight.p1, e);
    controls.target.lerpVectors(flight.t0, flight.t1, e);
    if (k >= 1) flight = null;
  }
  if (state.mode === 'walk') walker.update(dt);
  else controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

// ------------------------------------------------------------------ scripting API (screenshots, console)
window.viewer = {
  ready: false,
  headless: params.has('headless'),
  state,
  presets: () => PRESETS.map((p) => ({ id: p.id, name: p.name, group: p.group })),
  goPreset,
  setFloor: (f) => { state.floor = f; applyView(); },
  setCutaway: (v) => { state.cutaway = v; applyView(); },
  setExplode: (v) => { state.explode = v; applyView(); },
  setLabels: (v) => { state.labels = v; applyView(); },
  setTime,
  walkAt: (roomId, yawDeg = 180, pitchDeg = -5) => {
    enterWalk(roomId);
    const p = data.presets.find((q) => q.id === roomId);
    walker.place(p.target[0] * 1000, p.target[2] * 1000, p.fy, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg));
  },
  walkPose: (x, y, foot, yawDeg, pitchDeg = 0) => {
    state.mode = 'walk'; controls.enabled = false; applyView();
    walker.place(x, y, foot, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg));
  },
  exitWalk,
  // render N frames synchronously so a screenshot sees a settled image
  settle: (n = 3) => { for (let i = 0; i < n; i++) frame(); return true; },
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, meshes: data.meshes.length, lights: pointLights.length }),
  walker: () => walker,
};

// headless (screenshots): no animation loop; frames are rendered on demand via viewer.settle()
if (!params.has('headless')) renderer.setAnimationLoop(frame);
init().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = 'Error: ' + e.message;
  window.viewer.error = String(e.stack || e);
});
