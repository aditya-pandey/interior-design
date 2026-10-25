import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import houseMain from '../../house.json';
import houseR1 from '../../house_r1.json';
import boqR1 from '../../boq_r1.json';
import { createMaterials } from './materials.js';
import { buildHouse, FLOOR_IDS } from './build.js';
import { Walker } from './walk.js';
import { buildContext } from './context.js';
import { buildPlumbing, buildElectrical } from './services.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import './style.css';

// ------------------------------------------------------------------ renderer & scene
const params = new URLSearchParams(location.search);
// Which version: the main site, or Revision R1 on /v1/ (or ?rev=r1). Both share all code and assets.
const REV = window.GH18_REV || params.get('rev') || (/\/v1(\/|$)/.test(location.pathname) ? 'r1' : 'main');
const house = REV === 'r1' ? houseR1 : houseMain;
const FEET = house.meta.display_units === 'ft-in (m)';
// The family's paintings (house.json floors[].art) show only on the /withpainting page (or with ?art).
const WITH_ART = window.GH18_ART === true || params.has('art') || /\/withpainting\/?$/.test(location.pathname);
for (const fl of house.floors) {
  if (!WITH_ART) delete fl.art;
  fl.furniture = fl.furniture.filter((f) => !f.variant || f.variant === (WITH_ART ? 'art' : 'no_art'));
}
// ?low = no AO / smaller shadow map (old laptops, CI); phones and tablets get it automatically
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const LOW = params.has('low') || TOUCH;
const PHONE = () => window.matchMedia('(max-width: 640px)').matches;
const CINEMA = params.has('cinema');    // ?cinema = no UI, bloom; camera driven by viewer.cine() (film render)
if (CINEMA) document.body.classList.add('cinema');

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

// Compass from house.json: north_vector is North in plan (x, y) = scene (x, z); East is North turned 90 degrees.
// Main site: front faces East, so North = +X. Revision R1: North = road side = +Z (front), East = -X.
const NORTH = house.meta.north_vector, EAST = [-NORTH[1], NORTH[0]];
// compass point of a plan direction (dx, dy), e.g. the front (0, 1) -> 'East' on the main site, 'North' in R1
function compass(dx, dy) {
  const b = (Math.atan2(dx * EAST[0] + dy * EAST[1], dx * NORTH[0] + dy * NORTH[1]) * 180 / Math.PI + 360) % 360;
  return ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'][Math.round(b / 45) % 8];
}

function sunDir(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg), el = THREE.MathUtils.degToRad(elevationDeg);
  const n = Math.cos(az) * Math.cos(el), e = Math.sin(az) * Math.cos(el);
  return new THREE.Vector3(NORTH[0] * n + EAST[0] * e, Math.sin(el), NORTH[1] * n + EAST[1] * e);
}

const TIMES = {
  // Gurugram, late afternoon: sun in the south-west over the back lawn
  day: { az: 235, el: 34, sun: 2.6, sunColor: 0xfff0dc, exposure: 0.75, hemi: 0.15, env: 0.55, interior: 0, emissive: 0, turbidity: 3, rayleigh: 1.2 },
  // dusk: sun just below the western horizon, warm interiors on
  dusk: { az: 290, el: -1.5, sun: 0.0, sunColor: 0xff9a5c, exposure: 1.2, hemi: 0.12, env: 0.08, interior: 1, emissive: 1, turbidity: 6, rayleigh: 2.6 },
};

// ------------------------------------------------------------------ state
const state = { floor: 'ALL', explode: 0, cutaway: false, mode: 'orbit', time: 'day', labels: false, services: null, materials: false };   // services: null | 'plumbing' | 'electrical'
let M, data, walker;
const floorGroups = {};
const ghost = new Map();
const pointLights = [];
let composer, gtao, context = null, services = null, matView = null;

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
  if (CINEMA) {
    context = buildContext(house.meta.plot, M);
    scene.add(context);
    // the parking "reference car" is a scale check, not part of the design: keep it out of the film
    for (const mesh of data.meshes) if (['car_paint', 'tyre', 'car_glass'].includes(mesh.userData.mat)) mesh.visible = false;
  } else {
    loadModels(data.models);
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
  if (house.services) setupServices();
  if (REV === 'r1') setupMaterials();
  // room labels
  for (const lb of data.labels) {
    const div = document.createElement('div');
    div.className = 'room-label' + (lb.status === 'PROPOSED' ? ' proposed' : '');
    div.innerHTML = FEET
      ? `<b>${lb.name}</b><span>${ftin(lb.w)} × ${ftin(lb.d)} (${(lb.w / 1000).toFixed(2)} × ${(lb.d / 1000).toFixed(2)} m)</span><span>${(lb.area * 10.7639).toFixed(0)} sq ft (${lb.area.toFixed(1)} m²)</span>`
      : `<b>${lb.name}</b><span>${(lb.w / 1000).toFixed(2)} × ${(lb.d / 1000).toFixed(2)} m</span><span>${lb.area.toFixed(1)} m² · ${(lb.area * 10.7639).toFixed(0)} ft²</span>`;
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
  if (house.meta.revision) document.querySelector('#panel h1 small').textContent = `3D home tour · ${house.meta.revision} draft`;
  if (camera.aspect < 1.2) goPreset('all', true);    // portrait phones: the opening view, framed for the narrow screen
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
  if (CINEMA) composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.5, 1.15));
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ view logic
const ORDER = { GF: 0, FF: 1, SF: 2, ROOF: 3 };

function ghostOf(mat, opacity = 0.12) {
  const key = mat.uuid + opacity;
  if (!ghost.has(key)) {
    const g = mat.clone();
    g.transparent = true; g.opacity = Math.min(opacity, mat.opacity); g.depthWrite = false;
    ghost.set(key, g);
  }
  return ghost.get(key);
}
// Services view: the whole building goes to glass so the pipes read; the ground stays half there
// for the below-ground runs and chambers, floor slabs a touch firmer than the walls.
const SERVICE_GHOST = { site: 0.4, floor: 0.16, slabcap: 0.16, furn: 0.16 };

function applyView() {
  const walk = state.mode === 'walk';
  const svc = !!state.services && !walk;
  const mats = !!state.materials && !!matView && !walk;
  if (svc) state.explode = 0;
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
      }
      const here = state.floor === fid || (state.floor === 'ALL' && fid === 'GF');
      if (o.userData.isLabel) o.visible = state.labels && !svc && !mats && !walk && here;
      if (o.userData.isMatLabel) o.visible = mats && here;
    });
  }
  if (services) {
    for (const [name, layer] of Object.entries(services)) {
      // one floor at a time when a floor is picked (the roof goes with the SF), all of them otherwise
      for (const [fid, g] of Object.entries(layer.groups)) g.visible = svc && state.services === name && (state.floor === 'ALL' || ORDER[fid] === lim || (fid === 'ROOF' && lim === 2));
    }
    document.querySelectorAll('[data-svc]').forEach((b) => b.classList.toggle('on', b.dataset.svc === (state.services || '')));
  }
  // every building mesh: its own material, or the Materials-view colour; then ghosted for the services
  // view (whole building) or the cutaway (walls above 1.2 m)
  scene.traverse((o) => {
    const cat = o.userData.cat;
    if (!o.isMesh || !cat) return;
    if (!o.userData.orig) { o.userData.orig = o.material; o.userData.cast = o.castShadow; }
    const base = mats ? overlayOf(o.userData.orig, o.userData.mat, cat) : o.userData.orig;
    const op = svc ? SERVICE_GHOST[cat] || 0.1 : cat === 'upper' && !walk && state.cutaway ? 0.12 : null;
    o.material = op === null ? base : Array.isArray(base) ? base.map((m) => ghostOf(m, op)) : ghostOf(base, op);
    o.castShadow = op === null ? o.userData.cast : false;
  });
  const legend = document.getElementById('svc-legend');
  legend.hidden = !(svc || mats);
  if (svc) legend.innerHTML = services[state.services].legendHTML;
  else if (mats) legend.innerHTML = matView.legendHTML;
  document.body.classList.toggle('materials', mats);
  document.querySelectorAll('[data-floor]').forEach((b) => b.classList.toggle('on', b.dataset.floor === state.floor));
  document.querySelectorAll('[data-time]').forEach((b) => b.classList.toggle('on', b.dataset.time === state.time));
  const ck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
  ck('cutaway', state.cutaway); ck('labels', state.labels); ck('materials', state.materials);
  const ex = document.getElementById('explode');
  if (ex) { ex.value = state.explode; ex.disabled = svc; }
  document.body.classList.toggle('walking', walk);
}

function setTime(t) {
  state.time = t;
  applyTime(t === 'dusk' ? 1 : 0);
  applyView();
}

// Blend between day (k=0) and dusk (k=1): sun path, sky, exposure and interior lights.
function blendTimes(k) {
  const a = TIMES.day, b = TIMES.dusk, T = {};
  for (const key of Object.keys(a)) {
    if (key === 'sunColor') T[key] = new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), k);
    else T[key] = a[key] + (b[key] - a[key]) * k;
  }
  // lights switch on through the second half of the blend
  T.interior = T.emissive = THREE.MathUtils.smoothstep(k, 0.35, 0.9);
  return T;
}

function applyTime(k) {
  const T = blendTimes(k);
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
  sun.visible = T.sun > 0.01;
  hemi.intensity = T.hemi;
  renderer.toneMappingExposure = T.exposure;
  scene.environmentIntensity = T.env;
  for (const pl of pointLights) { pl.visible = T.interior > 0.001; pl.intensity = pl.userData.base * T.interior; }
  M.cove.emissiveIntensity = T.emissive * 3;
  M.downlight.emissiveIntensity = T.emissive * 4;
  M.lamp.emissiveIntensity = T.emissive * 3;
  M.jaali_glow.emissiveIntensity = 0.8 + T.emissive * 2.5;
  M.window_lit.emissiveIntensity = T.emissive * 1.6;
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
    { id: 'front', name: `Exterior — front (${compass(0, 1)})`, group: 'Overview', floor: 'ALL', cut: false, pos: [cx + 6, 3.5, D + 16], target: [cx, 4.5, D - 4] },
    { id: 'rear', name: `Exterior — rear lawn (${compass(0, -1)})`, group: 'Overview', floor: 'ALL', cut: false, pos: [cx - 5, 5.5, -14], target: [cx, 3.5, 6] },
    ...(house.services ? [
      { id: 'services', name: 'Services — plumbing', group: 'Overview', floor: 'ALL', cut: false, svc: 'plumbing', pos: [cx - 17, 17, cz + 22], target: [cx, 3.2, cz + 1] },
      { id: 'electrical', name: 'Services — electrical', group: 'Overview', floor: 'ALL', cut: false, svc: 'electrical', pos: [cx - 17, 17, cz + 22], target: [cx, 3.2, cz + 1] },
    ] : []),
    ...(REV === 'r1' ? [
      { id: 'materials', name: 'Materials — ground floor', group: 'Overview', floor: 'GF', cut: true, mats: true, pos: [cx + 14, 22, cz + 16], target: [cx, 0.5, cz] },
      { id: 'materials-ff', name: 'Materials — first floor', group: 'Overview', floor: 'FF', cut: true, mats: true, pos: [cx + 14, 25, cz + 16], target: [cx, 3.8, cz] },
    ] : []),
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
  if (p.svc) { state.services = p.svc; state.materials = false; }
  if (p.mats) { state.materials = true; state.services = null; }
  applyView();
  flyTo(...framed(p), instant ? 0 : 1.1);
  document.getElementById('preset').value = id;
  return true;
}

// Presets are composed for a landscape window; on a tall (portrait) screen pull the camera back
// along its line of sight so the house still fits across the narrow width.
function framed(p) {
  const pos = new THREE.Vector3(...p.pos), target = new THREE.Vector3(...p.target);
  const k = camera.aspect < 1.2 ? Math.min(2, Math.sqrt(1.4 / camera.aspect)) : 1;
  return [target.clone().add(pos.sub(target).multiplyScalar(k)), target];
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
  if (TOUCH) walker.active = true;                     // no pointer lock on phones: joystick + drag
  else if (!window.viewer.headless) walker.controls.lock();
  closeMenu();
}
function exitWalk() {
  state.mode = 'orbit';
  walker.active = false;
  walker.stick.x = walker.stick.y = 0;
  document.getElementById('stick').classList.remove('on');
  if (walker.controls.isLocked) walker.controls.unlock();
  controls.enabled = true;
  camera.rotation.set(0, 0, 0);
  applyView();
  flyTo(...framed(overviewPresets()[0]), 0);
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
  sel.addEventListener('change', () => { goPreset(sel.value); closeMenu(); });
  const panel = document.getElementById('panel'), menu = document.getElementById('menu');
  menu.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    menu.setAttribute('aria-expanded', open);
    menu.textContent = open ? 'Close' : 'Menu';
  });
  if (TOUCH) touchWalk();
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
    if (e.code === 'KeyP' && services) { state.services = state.services === 'plumbing' ? null : 'plumbing'; state.materials = false; applyView(); }
    if (e.code === 'KeyE' && services && state.mode !== 'walk') { state.services = state.services === 'electrical' ? null : 'electrical'; state.materials = false; applyView(); }
    if (e.code === 'KeyM' && matView) { state.materials = !state.materials; state.services = null; applyView(); }
    if (e.code === 'KeyN') setTime(state.time === 'day' ? 'dusk' : 'day');
    if (e.code === 'Digit1') { state.floor = 'GF'; applyView(); }
    if (e.code === 'Digit2') { state.floor = 'FF'; applyView(); }
    if (e.code === 'Digit3') { state.floor = 'SF'; applyView(); }
    if (e.code === 'Digit0') { state.floor = 'ALL'; applyView(); }
    if (e.code === 'KeyQ' && state.mode === 'walk') exitWalk();
  });
}

// ------------------------------------------------------------------ services (R1 plumbing + electrical)
function setupServices() {
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const names = Object.fromEntries(house.floors.flatMap((f) => f.rooms.map((r) => [r.id, r.name])));
  const sv = house.services;
  services = {};
  const parts = [
    ['plumbing', sv.plumbing && buildPlumbing(sv.plumbing), 'Plumbing — design intent',
      'Not for construction: sizing, falls and the sewer connection by the licensed plumber.'],
    ['electrical', sv.electrical && buildElectrical(sv.electrical, names), 'Electrical — design intent',
      'Lines are conduits per circuit, looped point to point in the slab above. Not for construction: cable sizes, load sanction and testing by the licensed electrician.'],
  ];
  for (const [name, layer, title, foot] of parts) {
    if (!layer) continue;
    services[name] = layer;
    layer.tags = [];
    for (const [fid, g] of Object.entries(layer.groups)) { g.name = `${name}-${fid}`; g.visible = false; scene.add(g); }
    for (const lb of layer.labels) {
      const div = document.createElement('div');
      div.className = 'svc-label';
      div.innerHTML = `<b>${lb.id}</b><span> ${lb.text}</span>`;
      layer.tags.push(div);
      const obj = new CSS2DObject(div);
      obj.position.set(...lb.pos);
      layer.groups[lb.floor].add(obj);
    }
    layer.legendHTML = `<b>${title}</b>` + layer.legend.map((k) =>
      `<p><i class="${k.shape}" style="background:${hex(k.color)}"></i><span>${k.name}${k.more ? `<em> (${k.more})</em>` : ''}</span></p>`).join('') +
      `<small>${sv[name].source}. ${foot}</small>`;
    document.querySelector(`[data-svc="${name}"]`).hidden = false;
  }
  document.getElementById('svc-row').hidden = false;
  document.querySelector('.svc-key').hidden = false;
  document.querySelectorAll('[data-svc]').forEach((b) => b.addEventListener('click', () => { state.services = b.dataset.svc || null; if (state.services) state.materials = false; applyView(); }));
}

// ------------------------------------------------------------------ Materials view (R1): surfaces coloured by material, quantities per room
// Colours by the material key of each merged mesh; quantities come from boq_r1.json (tools/boq.py).
const MAT_CATS = [
  { key: 'marble', color: 0xe3cf9f, name: 'Italian marble floors', keys: ['marble_beige'] },
  { key: 'tiles', color: 0x7fb0dc, name: 'Tiles', more: 'washrooms, service rooms', keys: ['tile_matte_lg', 'tile_matte_dark', 'vitrified'] },
  { key: 'deck', color: 0x79b19c, name: 'Deck tiles', more: 'balcony, terraces, deck', keys: ['deck_tile'] },
  { key: 'paint', color: 0xc5e0b4, name: 'Paint', more: 'walls; exterior lighter', keys: ['plaster', 'plaster_ext', 'boundary', 'slab_edge', 'concrete'] },
  { key: 'granite', color: 0x55575c, name: 'Granite', more: 'counters, paving, sills', keys: ['granite_flamed', 'granite_black', 'cobble'] },
  { key: 'stone', color: 0xf3eee4, name: 'White marble', more: 'vanity tops, backsplash, mandir', keys: ['marble_white'] },
  { key: 'timber', color: 0xa76b3c, name: 'Timber & veneer', more: 'cladding, fluted walls, doors', keys: ['walnut', 'walnut_fluted'] },
  { key: 'mdf', color: 0xf0a04b, name: 'MDF joinery', more: 'wardrobes, cabinets', keys: ['lacquer_greige', 'lacquer_white'] },
  { key: 'pop', color: 0xfbfbfb, name: 'POP ceilings', more: 'seen in walk mode', keys: ['pop_white'] },
];
const MAT_OF = Object.fromEntries(MAT_CATS.flatMap((c) => c.keys.map((k) => [k, c])));
const overlays = new Map();
function overlayOf(mat, key, cat) {
  if (Array.isArray(mat)) return mat.map((m) => overlayOf(m, key, cat));
  if (['emissive', 'glass', 'glassUpper', 'site'].includes(cat)) return mat;
  const c = MAT_OF[key];
  const id = c ? c.key + (key === 'plaster_ext' || key === 'boundary' ? '_ext' : '') : 'other';
  if (!overlays.has(id)) {
    const color = c ? (id === 'paint_ext' ? 0xe1eed8 : c.color) : 0xd2cfc9;
    overlays.set(id, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, side: mat.side }));
  }
  return overlays.get(id);
}

function setupMaterials() {
  const rooms = boqR1.rooms || {};
  const sqft = (m2) => Math.round(m2 * 10.7639).toLocaleString('en-IN');
  const tags = [];
  for (const fl of house.floors) {
    for (const r of fl.rooms) {
      const q = rooms[r.id];
      if (!q || q.area_m2 === undefined) continue;
      const lines = [];
      if (q.floor_optA) lines.push(`Floor ${sqft(q.area_m2)} sq ft: marble <em>or ${q.floor_optB.boxes} boxes tiles</em>`);
      else if (q.floor_tile) lines.push(`Floor ${sqft(q.area_m2)} sq ft: tiles, ${q.floor_tile.boxes} boxes`);
      else if (q.floor_granite_m2) lines.push(`Floor ${sqft(q.area_m2)} sq ft: granite`);
      else lines.push(`Floor ${sqft(q.area_m2)} sq ft`);
      const w = [];
      if (q.paint_walls_m2) w.push(`paint ${sqft(q.paint_walls_m2)} sq ft`);
      if (q.wall_tile) w.push(`tiles ${sqft(q.wall_tile.net_m2)} sq ft (${q.wall_tile.boxes} boxes)`);
      if (q.wall_cladding_m2) w.push(`veneer ${sqft(q.wall_cladding_m2)} sq ft`);
      if (q.fluted_m2) w.push(`fluted ${sqft(q.fluted_m2)} sq ft`);
      if (q.backsplash_m2) w.push(`backsplash ${sqft(q.backsplash_m2)} sq ft`);
      if (w.length) lines.push('Walls: ' + w.join(' · '));
      const c = [];
      if (q.pop) c.push(`POP ${sqft(q.pop.area_m2)} sq ft` + (q.pop.cove_m ? ` · cove ${Math.round(q.pop.cove_m * 3.28084)} ft` : ''));
      const L = q.lights || {};
      if (L.downlights) c.push(`${L.downlights} downlights`);
      if (L.fan) c.push(`${L.fan} fan`);
      if (c.length) lines.push(c.join(' · '));
      const div = document.createElement('div');
      div.className = 'mat-label';
      div.innerHTML = `<b>${r.name}</b>` + lines.map((t) => `<span>${t}</span>`).join('');
      const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
      const at = r.label_at || [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      const obj = new CSS2DObject(div);
      obj.position.set(at[0] / 1000, house.levels[fl.id].ffl / 1000 + 0.05, at[1] / 1000);
      obj.userData.isMatLabel = true;
      obj.visible = false;
      floorGroups[fl.id].add(obj);
      tags.push(div);
    }
  }
  tags.sort((a, b) => b.textContent.length - a.textContent.length);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const sum = Object.fromEntries((boqR1.summary || []).map(([k, v]) => [k.trim(), v]));
  matView = {
    tags,
    legendHTML: '<b>Materials &amp; quantities</b>' + MAT_CATS.map((k) =>
      `<p><i class="box" style="background:${hex(k.color)}"></i><span>${k.name}${k.more ? `<em> (${k.more})</em>` : ''}</span></p>`).join('') +
      `<small><span class="sum">${['Living floors', '2. Pipes', '3. Wires', '9. Lights'].filter((k) => sum[k]).map((k) => `<b class="k">${k.replace(/^\d\. /, '')}:</b> ${sum[k]}`).join('<br>')}` +
      '<br>Pipes and wires are drawn in the Services views. </span>Full schedule: <a href="files/GH-18_R1_materials.pdf" target="_blank" rel="noopener">PDF</a> · ' +
      '<a href="files/GH-18_R1_materials.xlsx">Excel</a>. Quantities only, design stage.</small>',
  };
  document.getElementById('mat-row').hidden = false;
  document.querySelector('.mat-key').hidden = false;
  document.getElementById('materials').addEventListener('change', (e) => { state.materials = e.target.checked; if (state.materials) state.services = null; applyView(); });
}

// Service tags are listed most important first (stacks, then chambers); any tag that would land on
// one already shown is hidden for this frame, so the tags never pile up whatever the camera does.
function declutterTags() {
  const shown = [];
  const tags = state.materials && matView ? matView.tags : services[state.services].tags;
  for (const el of tags) {
    el.style.visibility = '';
    if (el.parentElement === null || el.style.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    if (shown.some((q) => r.left < q.right + 3 && r.right > q.left - 3 && r.top < q.bottom + 2 && r.bottom > q.top - 2)) el.style.visibility = 'hidden';
    else shown.push(r);
  }
}

// glTF props (the Baleno in the parking bay): native scale across and up, stretched to the
// real length along the car, front turned to the piece's +Z, then placed like furniture.
function loadModels(list) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  window.viewer.modelsReady = Promise.all(list.map(async (m) => {
    try {
      const gltf = await loader.loadAsync(m.src);
      const obj = gltf.scene;
      if (m.front === '-z') obj.rotation.y = Math.PI;
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const holder = new THREE.Group();
      obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      holder.add(obj);
      holder.scale.z = m.size[1] / 1000 / size.z;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = !o.material.transparent;
        o.receiveShadow = true;
        o.userData = { floor: m.floor, cat: 'furn', mat: 'model' };
      });
      const place = new THREE.Group();
      place.add(holder);
      place.position.set(m.pos[0] / 1000, m.baseY, m.pos[1] / 1000);
      place.rotation.y = -THREE.MathUtils.degToRad(m.rot);
      floorGroups[m.floor].add(place);
      if (window.viewer.headless) frame();
    } catch (e) {
      console.warn('model failed to load', m.src, e);
    }
  }));
}

// feet-inches to the nearest inch: 4110 mm -> 13'-6"
function ftin(mm) {
  const inches = Math.round(mm / 25.4);
  return `${Math.floor(inches / 12)}'-${inches % 12}"`;
}

function closeMenu() {
  if (!PHONE()) return;
  document.getElementById('panel').classList.remove('open');
  const m = document.getElementById('menu');
  m.setAttribute('aria-expanded', false);
  m.textContent = 'Menu';
}

// Phones in walk mode: a touch on the left part of the screen is a joystick, anywhere else drags the view.
function touchWalk() {
  const el = renderer.domElement, stick = document.getElementById('stick'), knob = stick.firstElementChild;
  const R = 56;
  let move = null;                                     // { id, x0, y0 }
  const looks = new Map();                             // id -> last { x, y }
  el.addEventListener('touchstart', (e) => {
    if (state.mode !== 'walk') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!move && t.clientX < window.innerWidth * 0.45) {
        move = { id: t.identifier, x0: t.clientX, y0: t.clientY };
        stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px';
        knob.style.transform = '';
        stick.classList.add('on');
      } else looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    if (state.mode !== 'walk') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (move && t.identifier === move.id) {
        let dx = t.clientX - move.x0, dy = t.clientY - move.y0;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        walker.stick.x = dx / R; walker.stick.y = -dy / R;
      } else if (looks.has(t.identifier)) {
        const l = looks.get(t.identifier);
        walker.look(t.clientX - l.x, t.clientY - l.y);
        looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (move && t.identifier === move.id) {
        move = null; walker.stick.x = walker.stick.y = 0; stick.classList.remove('on');
      }
      looks.delete(t.identifier);
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
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
  else if (!CINEMA) controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
  if (((services && state.services) || (matView && state.materials)) && state.mode !== 'walk') declutterTags();
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
  setServices: (v) => { state.services = v === true ? 'plumbing' : v || null; if (state.services) state.materials = false; applyView(); },
  setMaterials: (v) => { state.materials = !!v; if (v) state.services = null; applyView(); },
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
  // Film camera: place the camera directly and choose what is shown (used by viewer/film/render.mjs).
  cine: (o) => {
    state.mode = o.interior ? 'walk' : 'orbit';
    state.floor = o.floor || 'ALL';
    state.cutaway = !!o.cutaway;
    state.explode = o.explode || 0;
    state.labels = false;
    controls.enabled = false;
    if (o.time !== undefined) { state.time = o.time > 0.5 ? 'dusk' : 'day'; applyTime(o.time); }
    if (o.exposure !== undefined) renderer.toneMappingExposure = o.exposure;
    if (context) context.visible = o.context !== false;
    applyView();
    camera.fov = o.fov || 45;
    camera.updateProjectionMatrix();
    camera.position.set(...o.pos);
    controls.target.set(...o.target);
    camera.up.set(Math.sin(o.roll || 0), Math.cos(o.roll || 0), 0);
    camera.lookAt(...o.target);
    return true;
  },
  renderFrame: () => { composer.render(); return true; },
};

// headless (screenshots): no animation loop; frames are rendered on demand via viewer.settle()
if (!params.has('headless')) renderer.setAnimationLoop(frame);
init().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = 'Error: ' + e.message;
  window.viewer.error = String(e.stack || e);
});
