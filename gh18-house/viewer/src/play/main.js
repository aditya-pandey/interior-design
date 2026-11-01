import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import house from '../../../house_r1.json';
import { createMaterials } from '../materials.js';
import { buildHouse } from '../build.js';
import { furnitureCorners } from '../geom.js';
import { buildWorld, groundHeight } from './world.js';
import { CollisionWorld } from './collide.js';
import { VehicleSim } from './vehicle.js';
import { loadBaleno } from './carmodel.js';
import { CarAudio } from './audio.js';
import './play.css';

// /play/ : drive the family's Baleno out of GH-18's parking and around Celebrity Homes.
// The house is the R1 model, built by the tour's own builders; the colony is generated (world.js);
// the car is the tour's Baleno with physics (vehicle.js) and sound (audio.js).

const params = new URLSearchParams(location.search);
const HEADLESS = params.has('headless');
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const LOW = params.has('low') || TOUCH;
for (const fl of house.floors) {
  delete fl.art;                                        // the family's paintings stay on the tour's /withpainting page
  fl.furniture = fl.furniture.filter((f) => !f.variant || f.variant === 'no_art');
}
const CAR_ITEM = house.floors[0].furniture.find((f) => f.type === 'car_model');
const HOME = { x: CAR_ITEM.pos[0] / 1000, z: CAR_ITEM.pos[1] / 1000, yaw: 0 };   // reversed into the bay, nose to the road

// ------------------------------------------------------------------ renderer, scene, sky
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: HEADLESS });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1.25 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);
const sky = new Sky();
sky.scale.setScalar(1000);
scene.add(sky);
const skyScene = new THREE.Scene();
const skyForEnv = new Sky();
skyForEnv.scale.setScalar(1000);
skyScene.add(skyForEnv);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x8a7d6c, 0.35);
scene.add(hemi);
scene.fog = new THREE.Fog(0xd9c7b0, 120, 420);

// sun direction from compass azimuth (degrees from north, clockwise) and elevation; north = +Z, east = -X
function sunDir(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}
// Gurugram, early November: sunset about 17:30 at azimuth ~ 250 deg (WSW)
const TIMES = {
  evening: { label: 'Evening', az: 246, el: 9, sun: 2.6, sunColor: 0xffc489, hemi: 0.38, hemiSky: 0xffe2c4, exposure: 0.82, turb: 6, ray: 2.2, env: 0.55, fog: 0xe3c7a6, lamps: 0, windows: 0.25, beams: false },
  day: { label: 'Day', az: 165, el: 52, sun: 3.0, sunColor: 0xfff5e8, hemi: 0.42, hemiSky: 0xdfe9ff, exposure: 0.62, turb: 3, ray: 1.1, env: 0.65, fog: 0xcfd8de, lamps: 0, windows: 0, beams: false },
  dusk: { label: 'Dusk', az: 252, el: -2.5, sun: 0.0, sunColor: 0xff8a50, hemi: 0.42, hemiSky: 0x9a98c0, exposure: 1.05, turb: 9, ray: 3.2, env: 0.3, fog: 0x7a6f7c, lamps: 2.4, windows: 1.3, beams: true },
  // night: a moon high in the east-south-east gives the soft blue fill; lamps and headlights do the rest
  night: { label: 'Night', az: 252, el: -16, sun: 0.0, sunColor: 0x8899cc, hemi: 0.16, hemiSky: 0x34405e, exposure: 1.2, turb: 2, ray: 0.6, env: 0.1, fog: 0x0d121d, lamps: 3.2, windows: 1.8, beams: true, moon: { az: 115, el: 42, i: 0.32 } },
};
const TIME_ORDER = ['evening', 'dusk', 'night', 'day'];

// ------------------------------------------------------------------ state
let M, world, collide, camBlock, car, sim, audio;
const lampLights = [];
const state = { time: 'evening', cam: 'chase', beamsOverride: null, started: false, horn: false, sound: true, driven: false };

async function init() {
  M = await createMaterials(renderer);
  // the house, as in the tour (without its small site plane and street: the colony replaces them)
  const data = buildHouse(house, M);
  for (const mesh of data.meshes) {
    if (mesh.userData.floor === 'SITE') continue;
    if (['car_paint', 'tyre', 'car_glass'].includes(mesh.userData.mat)) continue;     // the plan's stand-in car
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
  }
  world = buildWorld(M, { low: LOW });
  for (const m of world.meshes) { m.updateMatrix(); scene.add(m); }
  for (const o of world.objects) scene.add(o);

  // collision: the colony plus the house's ground-floor walls and furniture (not the stand-in car)
  const carPoly = JSON.stringify(furnitureCorners(CAR_ITEM));
  const items = world.colliders.slice();
  for (const c of data.colliders) {
    if (c.y0 > 1.3 || c.y1 < 0.15) continue;
    if (JSON.stringify(c.poly) === carPoly) continue;
    items.push({ poly: c.poly.map(([x, y]) => [x / 1000, y / 1000]) });
  }
  collide = new CollisionWorld(items);
  // the chase camera also keeps out of tree canopies
  camBlock = new CollisionWorld(items.concat(world.canopies.map((c) => ({ circle: c }))));

  // street-lamp light pool: a few real lights that follow the car from lamp to lamp after dark
  for (let i = 0; i < (LOW ? 4 : 6); i++) {
    const pl = new THREE.PointLight(0xffd29a, 0, 26, 2);
    scene.add(pl);
    lampLights.push(pl);
  }

  car = await loadBaleno('models/baleno.glb', CAR_ITEM.size[1] / 1000);
  scene.add(car.root);
  sim = new VehicleSim();
  sim.reset(HOME.x, HOME.z, HOME.yaw);
  audio = new CarAudio();

  setTime(params.get('time') || 'evening');
  buildMap();
  bindUI();
  placeCamera(true);
  document.getElementById('loading').remove();
  window.play.ready = true;
  if (HEADLESS) { start(false); frame(); } else { document.getElementById('start').hidden = false; }
  renderer.setAnimationLoop(HEADLESS ? null : loop);
}

// ------------------------------------------------------------------ time of day
function setTime(name) {
  const t = TIMES[name] || TIMES.evening;
  state.time = TIMES[name] ? name : 'evening';
  const dir = sunDir(t.az, t.el);
  for (const s of [sky, skyForEnv]) {
    const u = s.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.turbidity.value = t.turb;
    u.rayleigh.value = t.ray;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.82;
  }
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(skyScene);
  scene.environment = envRT.texture;
  scene.environmentIntensity = t.env;
  sun.userData.dir = t.moon ? sunDir(t.moon.az, t.moon.el) : dir;
  sun.intensity = t.moon ? t.moon.i : t.sun;
  sun.color.set(t.moon ? 0x9fb3ff : t.sunColor);
  sun.castShadow = t.sun > 0 || !!t.moon;
  hemi.intensity = t.hemi;
  hemi.color.set(t.hemiSky);
  renderer.toneMappingExposure = t.exposure;
  scene.fog.color.set(t.fog);
  sky.visible = state.time !== 'night';
  scene.background = state.time === 'night' ? new THREE.Color(0x070b14) : null;
  // the house's own lights, the colony's windows and lamps
  const glow = t.windows > 0.5 ? 1 : 0;
  for (const k of ['cove', 'downlight', 'lamp', 'window_lit']) if (M[k]) M[k].emissiveIntensity = glow * (k === 'window_lit' ? 1.4 : 1.2);
  world.materials.glass_lit.emissiveIntensity = t.windows;
  world.materials.lamp.emissiveIntensity = t.lamps;
  for (const pl of lampLights) pl.intensity = t.lamps > 0 ? 18 : 0;       // candela (physically based lights; the sun is ~3)
  lampTimer = 0;
  setBeams(state.beamsOverride ?? t.beams);
  const b = document.querySelector('[data-act="time"]');
  if (b) b.textContent = t.label;
}

function setBeams(on) {
  state.beams = on;
  for (const b of car.beams) b.intensity = on ? 220 : 0;
  car.mats.head.emissiveIntensity = on ? 2.2 : 0;
  document.querySelector('[data-act="lights"]')?.classList.toggle('on', on);
}

// ------------------------------------------------------------------ input
const keys = {};
const touchKeys = {};
const look = { yaw: 0, pitch: 0, zoom: 1, last: -10 };

function readInput() {
  const k = (...c) => c.some((x) => keys[x]);
  let throttle = k('KeyW', 'ArrowUp') || touchKeys.gas ? 1 : 0;
  let brake = k('KeyS', 'ArrowDown') || touchKeys.brake ? 1 : 0;
  let steer = (k('KeyA', 'ArrowLeft') || touchKeys.left ? 1 : 0) - (k('KeyD', 'ArrowRight') || touchKeys.right ? 1 : 0);
  const handbrake = !!keys.Space;
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p) : null;
  if (pad) {
    const sx = pad.axes[0] || 0;
    if (Math.abs(sx) > 0.12) steer = -sx;
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0);
  }
  return { throttle, brake, steer, handbrake: handbrake || !!(pad && pad.buttons[0]?.pressed) };
}

function bindUI() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (!state.started) return;
    if (e.code === 'KeyC') cycleCam();
    if (e.code === 'KeyL') toggleBeams();
    if (e.code === 'KeyT') cycleTime();
    if (e.code === 'KeyR') goHome();
    if (e.code === 'KeyM') toggleSound();
    if (e.code === 'KeyH') horn(true);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyH') horn(false); });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; horn(false); });
  document.getElementById('go').addEventListener('click', () => start(true));
  for (const b of document.querySelectorAll('#bar button')) {
    const act = b.dataset.act;
    if (act === 'horn') {
      b.addEventListener('pointerdown', () => horn(true));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => horn(false));
    } else {
      b.addEventListener('click', () => ({ cam: cycleCam, lights: toggleBeams, time: cycleTime, home: goHome, sound: toggleSound })[act]());
    }
  }
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); touchKeys[k] = true; b.classList.add('on'); };
    const off = () => { touchKeys[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  }
  // drag to look around the car (it eases back once you drive on); wheel / pinch to zoom
  const el = renderer.domElement;
  let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    look.yaw -= (e.clientX - drag.x) * 0.006;
    look.pitch = Math.max(-0.35, Math.min(0.9, look.pitch + (e.clientY - drag.y) * 0.004));
    drag.x = e.clientX; drag.y = e.clientY;
    look.last = performance.now() / 1000;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => { look.zoom = Math.max(0.55, Math.min(2.2, look.zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.body.classList.toggle('touch', TOUCH);
}

function start(withSound) {
  state.started = true;
  document.getElementById('start').hidden = true;
  document.getElementById('hud').hidden = false;
  if (withSound) { audio.start(); audio.setOn(state.sound); }
}
const CAMS = ['chase', 'driver', 'high'];
function cycleCam() { state.cam = CAMS[(CAMS.indexOf(state.cam) + 1) % CAMS.length]; look.yaw = 0; look.pitch = 0; placeCamera(true); }
function toggleBeams() { state.beamsOverride = !state.beams; setBeams(state.beamsOverride); }
function cycleTime() { state.beamsOverride = null; setTime(TIME_ORDER[(TIME_ORDER.indexOf(state.time) + 1) % TIME_ORDER.length]); }
function goHome() { sim.reset(HOME.x, HOME.z, HOME.yaw); state.driven = false; look.yaw = 0; look.pitch = 0; placeCamera(true); }
function toggleSound() {
  state.sound = !state.sound;
  audio.start();
  audio.setOn(state.sound);
  document.querySelector('[data-act="sound"]').textContent = state.sound ? 'Sound on' : 'Sound off';
}
function horn(on) { state.horn = on; audio?.hornOn(on && state.sound); document.querySelector('[data-act="horn"]')?.classList.toggle('on', on); }

// ------------------------------------------------------------------ car visuals
const body = { pitch: 0, roll: 0, y: 0 };
function updateCar(dt) {
  const [fx, fz] = sim.forward, rx = -fz, rz = fx;
  // ground under each wheel (speed breakers) -> ride height, pitch and roll
  const h = {};
  for (const w of car.wheels) {
    // wheel position: the model is centred on its footprint, like the physics body; +X is the car's left
    const lx = w.rest.x, lz = w.rest.z;
    h[w.q] = groundHeight(sim.x - rx * lx + fx * lz, sim.z - rz * lx + fz * lz);
  }
  const front = (h.FL + h.FR) / 2, rear = (h.RL + h.RR) / 2, left = (h.FL + h.RL) / 2, right = (h.FR + h.RR) / 2;
  const gy = (front + rear) / 2;
  const tp = -Math.atan2(front - rear, car.wheelbase) - sim.ax * 0.011;
  const tr = Math.atan2(left - right, car.track) + sim.ay * 0.012;     // + rolls the roof towards the car's right
  const k = 1 - Math.exp(-dt * 9);
  body.pitch += (tp - body.pitch) * k;
  body.roll += (tr - body.roll) * k;
  car.root.position.set(sim.x, gy, sim.z);
  car.root.rotation.y = sim.yaw;
  car.body.rotation.set(body.pitch, 0, body.roll);
  for (const w of car.wheels) {
    w.steer.rotation.y = w.front ? sim.steer : 0;
    w.spin.rotation.x = sim.wheelSpin * (sim.s.wheelRadius / w.radius);   // sim spins a 0.30 m wheel
    w.axle.position.y = w.rest.y + (h[w.q] - gy);
  }
  const braking = (sim.speed > 0.3 && readInputCache.brake > 0) || (sim.speed < -0.3 && readInputCache.throttle > 0) || readInputCache.handbrake;
  car.mats.tail.emissiveIntensity = (state.beams ? 0.7 : 0) + (braking ? 2.6 : 0);
  car.mats.reverse.emissiveIntensity = sim.reversing && sim.speed < -0.1 ? 1.6 : 0;
}
let readInputCache = { throttle: 0, brake: 0, steer: 0, handbrake: false };

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function placeCamera(snap, dt = 1 / 60) {
  const [fx, fz] = sim.forward;
  const cx = sim.x, cz = sim.z, now = performance.now() / 1000;
  // ease the look-around back behind the car once it's moving
  if (Math.abs(sim.speed) > 2 && now - look.last > 1.5) { const e = 1 - Math.exp(-dt * 1.5); look.yaw -= look.yaw * e; look.pitch -= look.pitch * e; }
  if (state.cam === 'driver') {
    car.root.updateMatrixWorld(true);
    car.eye.getWorldPosition(camPos);
    const yaw = sim.yaw + look.yaw * 1.4, pitch = -0.06 - look.pitch * 0.6;
    camLook.set(camPos.x + Math.sin(yaw) * 10, camPos.y + Math.sin(pitch) * 10, camPos.z + Math.cos(yaw) * 10);
    camera.near = 0.05;
    camera.fov = 68;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    return;
  }
  camera.near = 0.1;
  camera.fov = 55;
  // opening shot: from the street, looking back at the Baleno in GH-18's parking; the chase camera
  // takes over (smoothly) once the car moves
  if (Math.abs(sim.speed) > 0.3) state.driven = true;
  if (!state.driven && state.cam === 'chase') {
    const target = new THREE.Vector3(HOME.x - 4.2, 1.75, HOME.z + 9.2);
    const lookAt = new THREE.Vector3(HOME.x - 2.2, 2.9, HOME.z - 3.5);
    if (snap) { camPos.copy(target); camLook.copy(lookAt); } else { camPos.lerp(target, 1 - Math.exp(-dt * 3)); camLook.lerp(lookAt, 1 - Math.exp(-dt * 3)); }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    return;
  }
  const high = state.cam === 'high';
  let dist = (high ? 13 : 6.2 + Math.min(Math.abs(sim.speed), 25) * 0.06) * look.zoom;
  const ht = (high ? 8.5 : 2.35) * look.zoom + look.pitch * dist * 0.8;
  const heading = Math.atan2(fx, fz) + look.yaw + (sim.reversing && sim.speed < -1 ? 0 : 0);
  let tx = cx - Math.sin(heading) * dist, tz = cz - Math.cos(heading) * dist;
  // keep the camera out of walls: walk out from the car and stop short of the first obstacle
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, px = cx + (tx - cx) * t, pz = cz + (tz - cz) * t;
    const s = 0.3;
    if (camBlock.deepest([[px - s, pz - s], [px + s, pz - s], [px + s, pz + s], [px - s, pz + s]], px, pz)) {
      const tt = Math.max(0.25, (i - 1.5) / steps);
      tx = cx + (tx - cx) * tt; tz = cz + (tz - cz) * tt;
      dist *= tt;
      break;
    }
  }
  const target = new THREE.Vector3(tx, Math.max(0.6, ht), tz);
  const lookAt = new THREE.Vector3(cx + fx * (high ? 3 : 2.2), high ? 0.4 : 1.05, cz + fz * (high ? 3 : 2.2));
  if (snap) { camPos.copy(target); camLook.copy(lookAt); } else {
    camPos.lerp(target, 1 - Math.exp(-dt * 5));
    camLook.lerp(lookAt, 1 - Math.exp(-dt * 8));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ map
let mapBase = null;
const MAP_PX = 2;   // pixels per metre in the base image
function buildMap() {
  const m = world.map, ex = world.extent;
  const W = Math.ceil((ex.x1 - ex.x0) * MAP_PX), H = Math.ceil((ex.z1 - ex.z0) * MAP_PX);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // map coords: east (-X) to the right, north (+Z) up
  const U = (x) => (ex.x1 - x) * MAP_PX, V = (z) => (ex.z1 - z) * MAP_PX;
  const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(U(Math.max(x0, x1)), V(Math.max(z0, z1)), Math.abs(x1 - x0) * MAP_PX, Math.abs(z1 - z0) * MAP_PX); };
  g.fillStyle = '#d9cfbf'; g.fillRect(0, 0, W, H);
  R(m.ext.x0 - 1, m.ext.z0 - 1, m.ext.x1 + 1, m.ext.z1 + 1, '#cfc4b2');
  for (const b of m.blocks) R(b.x0, b.z0, b.x1, b.z1, b.park ? '#9fbf86' : '#e9e1d3');
  for (const z of m.roadsX) R(m.ext.x0, z - m.road / 2, m.ext.x1, z + m.road / 2, '#77736d');
  for (const x of m.roadsZ) R(x - m.road / 2, m.ext.z0, x + m.road / 2, m.ext.z1, '#77736d');
  R(m.gate - 4.5, m.ext.z1 - 1, m.gate + 4.5, m.main.z0, '#77736d');
  R(m.main.x0, m.main.z0, m.main.x1, m.main.z1, '#615e59');
  // GH-18
  R(0, 0, 9.381, 22.276, '#d9822b');
  g.fillStyle = '#5b3a1b';
  g.font = 'bold 13px sans-serif';
  g.fillText('GH-18', U(9.381) + 2, V(11) + 4);
  mapBase = c;
}

function drawMap() {
  const cv = document.getElementById('map');
  if (!cv || !mapBase) return;
  const g = cv.getContext('2d'), S = cv.width, view = 160;          // metres across
  const ex = world.extent, k = S / view / MAP_PX;
  const u = (ex.x1 - sim.x) * MAP_PX, v = (ex.z1 - sim.z) * MAP_PX;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#d9cfbf'; g.fillRect(0, 0, S, S);
  g.drawImage(mapBase, u - S / 2 / k, v - S / 2 / k, S / k, S / k, 0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.rotate(-sim.yaw);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = '#1b1b1b'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
  g.fillText('N', S / 2, 14);
}

// ------------------------------------------------------------------ loop
const STEP = 1 / 120;
let acc = 0, last = performance.now(), lampTimer = 0, hudTimer = 0, prevImpact = 0, prevBump = 0;
function stepSim(dt, input) {
  acc += Math.min(dt, 0.1);
  while (acc >= STEP) { sim.step(STEP, input, collide); acc -= STEP; }
}

function loop() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  readInputCache = state.started ? readInput() : { throttle: 0, brake: 0, steer: 0, handbrake: false };
  stepSim(dt, readInputCache);
  frame(dt);
}

function frame(dt = 1 / 60) {
  updateCar(dt);
  placeCamera(false, dt);
  // the sun's shadow box follows the car
  const d = sun.userData.dir || new THREE.Vector3(0, 1, 0);
  sun.target.position.set(sim.x, 0, sim.z);
  sun.position.set(sim.x + d.x * 120, Math.max(10, d.y * 120), sim.z + d.z * 120);
  // street-lamp lights: move the pool to the lamps nearest the car
  lampTimer -= dt;
  if (lampTimer <= 0 && lampLights[0].intensity > 0) {
    lampTimer = 0.4;
    const near = world.lamps.map((l) => [l, (l.x - sim.x) ** 2 + (l.z - sim.z) ** 2]).sort((a, b) => a[1] - b[1]);
    lampLights.forEach((pl, i) => {
      const l = near[i][0], s = l.park ? 0.65 : 1;
      pl.position.set(l.x + Math.sin(l.yaw) * 1.3, 5.6 * s, l.z + Math.cos(l.yaw) * 1.3);
    });
  }
  // sound
  if (audio?.ctx) {
    audio.update(sim.rpm, readInputCache.throttle || readInputCache.brake && sim.reversing ? 1 : 0, sim.slip, Math.abs(sim.speed));
    if (sim.impact > prevImpact + 0.5) audio.thud(sim.impact / 8);
    const bump = groundHeight(sim.x, sim.z);
    if (bump > 0.02 && prevBump <= 0.02 && Math.abs(sim.speed) > 2) audio.thud(Math.min(0.5, Math.abs(sim.speed) / 25));
    prevBump = bump;
  }
  prevImpact = sim.impact;
  // HUD
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.08;
    document.getElementById('kmh').textContent = Math.round(Math.abs(sim.speed) * 3.6);
    const moving = Math.abs(sim.speed) > 0.2;
    document.getElementById('gear').textContent = sim.reversing ? 'R' : moving ? 'D' + sim.gear : 'D';
    drawMap();
  }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ headless / test API
window.play = {
  ready: false,
  setTime,
  camera: (mode) => { state.cam = mode; placeCamera(true); },
  teleport: (x, z, yawDeg = 0) => { sim.reset(x, z, THREE.MathUtils.degToRad(yawDeg)); placeCamera(true); },
  home: goHome,
  look: (yaw = 0, pitch = 0, zoom = 1) => { Object.assign(look, { yaw, pitch, zoom, last: performance.now() / 1000 + 1e6 }); placeCamera(true); },
  // drive for `seconds` of simulated time with fixed controls, then draw one frame
  drive: (seconds, input = {}) => {
    const inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...input };
    readInputCache = inp;
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) sim.step(STEP, inp, collide);
    for (let i = 0; i < 30; i++) { updateCar(1 / 30); placeCamera(false, 1 / 30); }
    hudTimer = 0; lampTimer = 0;
    frame(1 / 60);
    return window.play.state();
  },
  render: () => { placeCamera(true); hudTimer = 0; lampTimer = 0; frame(1 / 60); },
  state: () => ({ x: +sim.x.toFixed(2), z: +sim.z.toFixed(2), yaw: +THREE.MathUtils.radToDeg(sim.yaw).toFixed(1), kmh: +(sim.speed * 3.6).toFixed(1), gear: sim.gear, rpm: Math.round(sim.rpm), reversing: sim.reversing }),
  // colliders touching the car (grown by `pad` metres), for debugging stuck spots
  hits: (pad = 0.15) => {
    const c = sim.corners(sim.x, sim.z, -pad);
    const xs = c.map((p) => p[0]), zs = c.map((p) => p[1]);
    return collide.near(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)).map((it) => it.circle ? { circle: it.circle } : { bb: it.bb.map((v) => +v.toFixed(2)) });
  },
  info: () => ({ dims: car.dims, wheelbase: car.wheelbase, track: car.track, wheels: car.wheels.map((w) => [w.q, w.radius.toFixed(3), w.rest.toArray().map((v) => v.toFixed(2))]), scale: car.scale, native: car.nativeSize, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
};

init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.querySelector('span').textContent = 'Something went wrong: ' + e.message;
});
