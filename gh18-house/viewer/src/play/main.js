import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import house from '../../../house_r1.json';
import { createMaterials } from '../materials.js';
import { buildHouse } from '../build.js';
import { furnitureCorners, circleHitsPoly } from '../geom.js';
import { Walker } from '../walk.js';
import { buildBeach, groundHeight, surfaceAt, coastDist, seaFence } from './beach.js';
import { buildStudio } from './studio.js';
import { STUDIO, STUDIO_PARK } from './site.js';
import { CollisionWorld } from './collide.js';
import { VehicleSim } from './vehicle.js';
import { loadBaleno } from './carmodel.js';
import { CarAudio } from './audio.js';
import { Music } from './music.js';
import { buildCharacter } from './character.js';
import { playBirthday } from './birthday.js';
import './play.css';

// /play/ : GH-18 on a quiet coast. It opens as an ordinary home tour (orbit, views, floors, rooms).
// "Walk through the house" puts her (character.js) at the gate; when she walks up to the Baleno it
// asks her to get in, and only then does the rest open up: the coast road, her glass studio on the
// sand (her paintings, poems, photo album, books and music), a birthday tune on 11 November, and a
// recorded message when she reaches the studio.
// The house is the R1 model built by the tour's own builders; the coast is beach.js, the studio
// studio.js, the car vehicle.js + carmodel.js, the sound audio.js, the music music.js.

const params = new URLSearchParams(location.search);
const HEADLESS = params.has('headless');
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const LOW = params.has('low') || TOUCH;
for (const fl of house.floors) {
  delete fl.art;
  fl.furniture = fl.furniture.filter((f) => !f.variant || f.variant === 'no_art');
}
const CAR_ITEM = house.floors[0].furniture.find((f) => f.type === 'car_model');
const HOME = { x: CAR_ITEM.pos[0] / 1000, z: CAR_ITEM.pos[1] / 1000, yaw: 0 };

// ------------------------------------------------------------------ renderer, scene, sky
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: HEADLESS });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1.25 : 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 9000);
const sky = new Sky();
sky.scale.setScalar(8000);
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
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x8a7d6c, 0.35);
scene.add(hemi);
scene.fog = new THREE.Fog(0xd9c7b0, 400, 4200);

function sunDir(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}
// an imagined coast: the sun goes down a little north of west, over the open sea beyond the headland
const TIMES = {
  evening: { label: 'Evening', az: 258, el: 8, sun: 2.7, sunColor: 0xffc489, hemi: 0.4, hemiSky: 0xffe2c4, exposure: 0.74, turb: 4.2, ray: 2.7, env: 0.55, fog: 0xe9c9a3, lamps: 0, glow: 0, beams: false },
  sunset: { label: 'Sunset', az: 268, el: 1.2, sun: 1.6, sunColor: 0xff9a52, hemi: 0.32, hemiSky: 0xffbf9a, exposure: 0.95, turb: 8, ray: 3.0, env: 0.42, fog: 0xe6a982, lamps: 0.6, glow: 0.4, beams: false },
  dusk: { label: 'Dusk', az: 270, el: -3, sun: 0.0, sunColor: 0xff8a50, hemi: 0.42, hemiSky: 0x9a98c0, exposure: 1.05, turb: 9, ray: 3.2, env: 0.3, fog: 0x7d7287, lamps: 2.4, glow: 1, beams: true },
  night: { label: 'Night', az: 252, el: -16, sun: 0.0, sunColor: 0x8899cc, hemi: 0.16, hemiSky: 0x34405e, exposure: 1.2, turb: 2, ray: 0.6, env: 0.1, fog: 0x0d121d, lamps: 3.2, glow: 1, beams: true, moon: { az: 115, el: 42, i: 0.34 } },
  day: { label: 'Day', az: 165, el: 55, sun: 3.0, sunColor: 0xfff5e8, hemi: 0.42, hemiSky: 0xdfe9ff, exposure: 0.62, turb: 3, ray: 1.1, env: 0.65, fog: 0xcfdde4, lamps: 0, glow: 0, beams: false },
};
const TIME_ORDER = ['evening', 'sunset', 'dusk', 'night', 'day'];

// ------------------------------------------------------------------ state
let M, beach, studio, collide, camBlock, car, sim, audio, music, walker, pack, her, head, orbit, walkData, presets;
const floorGroups = {};
const lampLights = [];
const state = {
  time: 'evening', cam: 'chase', beamsOverride: null, started: false, sound: true, driven: false, lying: null, overlay: false, engineOff: 0,
  mode: 'tour',          // 'tour' (orbit + menus), 'foot' (walking as her), 'drive'
  explore: false,        // false until she first gets into the car: the coast, studio and HUD stay quiet until then
  fp: false,             // first-person view on foot (V)
  floor: 'ALL', birthday: false, msgPlayed: false,
};

async function init() {
  M = await createMaterials(renderer);
  try { pack = await (await fetch('play/deepti/pack.json')).json(); } catch { pack = null; }

  const data = buildHouse(house, M);
  presets = data.presets;
  for (const mesh of data.meshes) {
    if (mesh.userData.floor === 'SITE') continue;
    if (['car_paint', 'tyre', 'car_glass'].includes(mesh.userData.mat)) continue;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    const fid = mesh.userData.floor || 'GF';
    if (!floorGroups[fid]) { floorGroups[fid] = new THREE.Group(); floorGroups[fid].name = fid; scene.add(floorGroups[fid]); }
    floorGroups[fid].add(mesh);
  }
  beach = buildBeach(M, { low: LOW });
  for (const m of beach.meshes) scene.add(m);
  for (const o of beach.objects) scene.add(o);
  studio = buildStudio(M, pack);
  scene.add(studio.group);

  // car collisions: the coast's palms and lamps, the studio, the house's ground floor, the sea fence
  const carPoly = JSON.stringify(furnitureCorners(CAR_ITEM));
  const houseItems = [];
  const houseWalk = [];
  for (const c of data.colliders) {
    if (JSON.stringify(c.poly) === carPoly) continue;
    houseWalk.push(c);
    if (c.y0 > 1.3 || c.y1 < 0.15) continue;
    houseItems.push({ poly: c.poly.map(([x, y]) => [x / 1000, y / 1000]) });
  }
  collide = new CollisionWorld([...beach.colliders, ...studio.carColliders, ...houseItems, seaFence]);
  camBlock = new CollisionWorld([...studio.carColliders, ...houseItems]);

  // walking: the house's floors, stairs and walls, the studio's, and the ground of the coast
  walkData = {
    colliders: [...houseWalk, ...studio.walk.colliders],
    surfaces: [...data.surfaces, ...studio.walk.surfaces],
    stair: data.stair, levels: data.levels,
  };
  head = new THREE.PerspectiveCamera();          // the walker moves this "head"; her figure and the camera follow it
  walker = new FootWalker(head, renderer.domElement, walkData);
  for (const c of walkData.colliders) c.bb = c.bb || bbOf(c.poly);
  her = buildCharacter();
  her.root.visible = false;
  scene.add(her.root);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.minDistance = 2;
  orbit.maxDistance = 180;

  for (let i = 0; i < (LOW ? 4 : 6); i++) {
    const pl = new THREE.PointLight(0xffd29a, 0, 30, 2);
    scene.add(pl);
    lampLights.push(pl);
  }

  car = await loadBaleno('models/baleno.glb', CAR_ITEM.size[1] / 1000);
  scene.add(car.root);
  sim = new VehicleSim();
  sim.reset(HOME.x, HOME.z, HOME.yaw);
  audio = new CarAudio();
  music = new Music(pack?.music, document.getElementById('ytplayer'));
  music.onChange = updateMusicUI;
  if (!pack) document.getElementById('music-btn').hidden = true;
  const b = pack?.birthday, today = new Date();
  state.birthday = params.has('birthday') || !!(b && today.getMonth() + 1 === b.month && today.getDate() === b.day);

  setTime(params.get('time') || 'evening');
  buildMap();
  bindUI();
  buildTour();
  pose.copyFrom(sim);
  enterTour('overview', true);
  document.getElementById('loading').remove();
  window.play.ready = true;
  state.started = true;
  // sound needs a first click or key (browser rule)
  const unlock = () => { audio.start(); audio.setOn(state.sound); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  if (params.has('explore')) { startWalk(); enterCar(); }
  frame(1 / 60);
  renderer.setAnimationLoop(HEADLESS ? null : loop);
}

// the tour's walker, on this coast: sand heights, no wading out to sea, and the parked car is solid
class FootWalker extends Walker {
  heights(x, y) {
    const out = super.heights(x, y);
    out[0] = groundHeight(x / 1000, y / 1000);
    return out;
  }
  blocked(x, y, foot) {
    if (super.blocked(x, y, foot)) return true;
    if (coastDist(x / 1000, y / 1000) > 0.6) return true;
    if (state.mode === 'foot') {
      const c = sim.corners(sim.x, sim.z, -0.05).map(([a, b]) => [a * 1000, b * 1000]);
      if (foot < 1.2 && circleHitsPoly(x, y, 250, c)) return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ time of day
let timeBlend = null;            // {from, to, k, rate} while the sunset plays out on the lounger
function applyTime(t) {
  const dir = sunDir(t.az, t.el);
  for (const s of [sky, skyForEnv]) {
    const u = s.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.turbidity.value = t.turb;
    u.rayleigh.value = t.ray;
    u.mieCoefficient.value = 0.0042;
    u.mieDirectionalG.value = 0.82;
  }
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(skyScene);
  scene.environment = envRT.texture;
  scene.environmentIntensity = t.env;
  sun.userData.dir = t.moon ? sunDir(t.moon.az, t.moon.el) : dir;
  sun.intensity = t.moon ? t.moon.i : t.sun;
  sun.color.set(t.moon ? 0x9fb3ff : t.sunColor);
  sun.castShadow = t.sun > 0.05 || !!t.moon;
  hemi.intensity = t.hemi;
  hemi.color.set(t.hemiSky);
  renderer.toneMappingExposure = t.exposure;
  scene.fog.color.set(t.fog);
  const night = t.el < -10;
  sky.visible = !night;
  scene.background = night ? new THREE.Color(0x070b14) : null;
  for (const k of ['cove', 'downlight', 'lamp', 'window_lit']) if (M[k]) M[k].emissiveIntensity = t.glow * 1.2;
  beach.materials.lamp.emissiveIntensity = t.lamps;
  studio.setNight(t.glow > 0.3);
  for (const pl of lampLights) pl.intensity = t.lamps > 0.5 ? 18 : 0;
  lampTimer = 0;
}
function setTime(name) {
  const t = TIMES[name] || TIMES.evening;
  state.time = TIMES[name] ? name : 'evening';
  timeBlend = null;
  applyTime(t);
  setBeams(state.beamsOverride ?? t.beams);
  const b = document.querySelector('[data-act="time"]');
  if (b) b.textContent = t.label;
}
function lerpTime(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') o[key] = key.includes('Color') || key === 'hemiSky' || key === 'fog' ? new THREE.Color(x).lerp(new THREE.Color(y), k).getHex() : x + (y - x) * k;
    else o[key] = k < 0.5 ? x : y;
  }
  return o;
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
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false };
let steerKey = 0;                // keyboard steering, eased in and out for a smooth wheel

function readInput(dt) {
  const k = (...c) => c.some((x) => keys[x]);
  let throttle = k('KeyW', 'ArrowUp') || touchKeys.gas ? 1 : 0;
  let brake = k('KeyS', 'ArrowDown') || touchKeys.brake ? 1 : 0;
  const target = (k('KeyA', 'ArrowLeft') || touchKeys.left ? 1 : 0) - (k('KeyD', 'ArrowRight') || touchKeys.right ? 1 : 0);
  const rate = target === 0 ? 5 : Math.sign(target) !== Math.sign(steerKey) ? 7 : 3.2;
  steerKey += Math.max(-rate * dt, Math.min(rate * dt, target - steerKey));
  let steer = steerKey;
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p) : null;
  if (pad) {
    const sx = pad.axes[0] || 0;
    if (Math.abs(sx) > 0.1) steer = -Math.sign(sx) * ((Math.abs(sx) - 0.1) / 0.9) ** 1.4;
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0);
  }
  return { throttle, brake, steer, handbrake: !!keys.Space || !!(pad && pad.buttons[0]?.pressed) };
}

function bindUI() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.repeat || !state.started) return;
    if (state.overlay) {
      if (album && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) { turnAlbum(e.code === 'ArrowRight' ? 1 : -1); return; }
      if (['Escape', 'KeyE', 'Enter', 'Space'].includes(e.code)) closeOverlay();
      return;
    }
    if (state.mode === 'tour') return;
    // before the drive, only walking keys: the rest is a surprise
    const act = state.explore
      ? { KeyC: cycleCam, KeyL: toggleBeams, KeyT: cycleTime, KeyR: goHome, KeyM: toggleSound, KeyF: toggleFoot, KeyE: interact, KeyP: () => music.toggle(), KeyN: () => music.next(), KeyG: goStudio, KeyV: toggleFP }[e.code]
      : { KeyF: toggleFoot, KeyE: interact, KeyV: toggleFP }[e.code];
    if (act) act();
    if (e.code === 'KeyH' && state.explore) horn(true);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyH') horn(false); });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; horn(false); });
  for (const b of document.querySelectorAll('#bar button')) {
    const act = b.dataset.act;
    if (act === 'horn') {
      b.addEventListener('pointerdown', () => horn(true));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => horn(false));
    } else {
      b.addEventListener('click', () => ({ cam: cycleCam, lights: toggleBeams, time: cycleTime, home: goHome, studio: goStudio, foot: toggleFoot, sound: toggleSound, music: toggleMusicPanel, tour: () => enterTour('overview') })[act]());
    }
  }
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); touchKeys[k] = true; b.classList.add('on'); };
    const off = () => { touchKeys[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  }
  document.getElementById('prompt').addEventListener('click', interact);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay' || e.target.classList.contains('close')) closeOverlay(); });
  // music panel
  document.getElementById('m-play').addEventListener('click', () => music.toggle());
  document.getElementById('m-next').addEventListener('click', () => music.next());
  document.getElementById('m-prev').addEventListener('click', () => music.prev());
  document.getElementById('m-vol').addEventListener('input', (e) => music.setVolume(+e.target.value));
  document.getElementById('m-close').addEventListener('click', () => toggleMusicPanel(false));
  // drag to look around (the car view eases back when you drive on; on foot it turns your head)
  const el = renderer.domElement;
  let drag = null;
  el.addEventListener('pointerdown', (e) => { if (state.mode !== 'tour') drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (state.mode === 'foot') {                 // swing the camera round her
      orb.yaw -= dx * 0.006;
      orb.pitch = Math.max(-0.35, Math.min(1.15, orb.pitch + dy * 0.004 * (state.fp ? -1 : 1)));
      return;
    }
    look.yaw -= dx * 0.006;
    look.pitch = Math.max(-0.35, Math.min(0.9, look.pitch + dy * 0.004));
    look.last = performance.now() / 1000;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => {
    if (state.mode === 'foot') orb.dist = Math.max(1.2, Math.min(7, orb.dist * (e.deltaY > 0 ? 1.08 : 0.93)));
    else look.zoom = Math.max(0.55, Math.min(2.2, look.zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.body.classList.toggle('touch', TOUCH);
}

const CAMS = ['chase', 'driver', 'high'];
function cycleCam() { if (state.mode !== 'drive') return; state.cam = CAMS[(CAMS.indexOf(state.cam) + 1) % CAMS.length]; look.yaw = 0; look.pitch = 0; state.driven = true; placeCamera(true, 1 / 60); }
function toggleBeams() { state.beamsOverride = !state.beams; setBeams(state.beamsOverride); }
function cycleTime() { state.beamsOverride = null; setTime(TIME_ORDER[(TIME_ORDER.indexOf(state.time) + 1) % TIME_ORDER.length]); }
function goHome() {
  if (state.mode === 'foot') { getUp(); placeHer(4.6, 23.6, Math.PI); return; }     // at the gate, facing the house
  sim.reset(HOME.x, HOME.z, HOME.yaw); pose.copyFrom(sim); state.driven = false; look.yaw = 0; look.pitch = 0; placeCamera(true, 1 / 60);
}
function goStudio() {
  if (state.mode === 'foot') { getUp(); placeHer(studio.entry.x, studio.entry.z, 0, 0.12); return; }
  sim.reset(STUDIO_PARK.x, STUDIO_PARK.z, STUDIO_PARK.yaw); pose.copyFrom(sim); state.driven = true; look.yaw = 0; placeCamera(true, 1 / 60);
}
function toggleSound() {
  state.sound = !state.sound;
  audio.start();
  audio.setOn(state.sound);
  document.querySelector('[data-act="sound"]').textContent = state.sound ? 'Sound on' : 'Sound off';
}
function horn(on) { audio?.hornOn(on && state.sound && state.mode === 'drive'); document.querySelector('[data-act="horn"]')?.classList.toggle('on', on); }

// ------------------------------------------------------------------ getting out, walking, getting in
function toggleFoot() {
  if (state.mode === 'drive') return exitCar();
  if (state.mode === 'foot') {
    const d = Math.hypot(head.position.x - sim.x, head.position.z - sim.z);
    if (d > 3.4) { flash('Walk up to the car to get in'); return; }
    enterCar();
  }
}
function exitCar() {
  if (Math.abs(sim.speed) > 1.5) { flash('Stop the car first'); return; }
  const [fx, fz] = sim.forward, rx = -fz, rz = fx;
  // beside the driver's door first (right-hand drive: the car's right); in a tight spot (GH-18's bay) in front or behind
  for (const [side, along, face] of [[1, -0.2, 0.6], [-1, -0.2, -0.6], [1, 1.2, 0.3], [-1, 1.2, -0.3], [0, 2.7, 0], [0, -2.7, Math.PI]]) {
    const x = sim.x + rx * side * 1.45 + fx * along, z = sim.z + rz * side * 1.45 + fz * along;
    if (walker.blocked(x * 1000, z * 1000, 0.3)) continue;
    state.mode = 'foot';
    scene.add(her.root);
    placeHer(x, z, sim.yaw + face, groundHeight(x, z));
    state.engineOff = 2.5;
    audio.door();
    updateModeUI();
    return;
  }
  flash('No room to get out here');
}
function enterCar() {
  getUp();
  state.mode = 'drive';
  walker.active = false;
  orbit.enabled = false;
  // she sits in the driver's seat (right-hand drive), visible through the glass
  car.body.add(her.root);
  her.root.position.set(-0.37, -0.06, -0.3);
  her.root.rotation.set(0, 0, 0);
  her.root.visible = true;
  // at home the opening shot from the street frames the car (and the birthday wish) as she pulls out
  state.cam = 'chase'; state.driven = Math.hypot(sim.x - HOME.x, sim.z - HOME.z) > 3.8; look.yaw = 0; look.pitch = 0;
  audio.start(); audio.door();
  applyHouseView();
  if (!state.explore) startExplore();
  updateModeUI();
  placeCamera(true, 1 / 60);
}
// the first time she gets in: the tour steps aside, the drive opens up, and on her birthday a tune plays
function startExplore() {
  state.explore = true;
  document.getElementById('tour').hidden = true;
  document.getElementById('hud').hidden = false;
  setFloor('ALL');
  if (state.birthday) {
    audio.start();
    const dur = audio.ctx ? playBirthday(audio.ctx, audio.master) : 8;
    const bd = document.getElementById('bday');
    bd.hidden = false;
    requestAnimationFrame(() => bd.classList.add('show'));
    setTimeout(() => { bd.classList.remove('show'); setTimeout(() => (bd.hidden = true), 1200); }, Math.max(6, dur) * 1000);
  } else flash('Take her for a drive along the coast');
}
// a recording from the owner, played once when she reaches the studio (pack.studioMessage)
function playMessage() {
  if (!pack?.studioMessage) return;
  const a = new Audio('play/deepti/' + pack.studioMessage);
  const card = document.getElementById('msg');
  const vol = music.volume;
  music.setVolume(Math.min(vol, 15));
  card.hidden = false;
  const done = () => { card.hidden = true; music.setVolume(vol); };
  a.addEventListener('ended', done);
  document.getElementById('msg-stop').onclick = () => { a.pause(); done(); };
  a.play().catch(() => { card.querySelector('span').textContent = 'A message for you · tap to play'; card.onclick = () => a.play(); });
}
function placeHer(x, z, yaw, foot = null) {
  walker.place(x * 1000, z * 1000, foot ?? groundHeight(x, z), yaw + Math.PI, 0);
  walker.active = true;
  her.root.visible = !state.fp;
  her.root.position.set(x, walker.foot, z);
  her.root.rotation.set(0, yaw, 0);
  herYaw = yaw;
  orb.yaw = yaw; orb.pitch = 0.22; orb.d = orb.dist;
  footPrev.set(head.position.x, 0, head.position.z);
}
function toggleFP() { if (state.mode !== 'foot') return; state.fp = !state.fp; flash(state.fp ? 'First person · V to see her again' : 'Third person'); }
function updateModeUI() {
  const foot = state.mode === 'foot';
  document.body.classList.toggle('on-foot', foot);
  document.body.classList.toggle('touring', state.mode === 'tour');
  const w = document.querySelector('#tour .t-walk');
  if (w) w.textContent = state.mode === 'foot' ? 'Back to the overview' : 'Walk through the house';
  const b = document.querySelector('[data-act="foot"]');
  if (b) b.textContent = foot ? 'Get in (F)' : 'Get out (F)';
  document.querySelector('[data-act="cam"]').disabled = foot;
}
let flashT = null;
function flash(msg) {
  const p = document.getElementById('toast');
  p.textContent = msg; p.hidden = false;
  clearTimeout(flashT); flashT = setTimeout(() => (p.hidden = true), 1800);
}

// ------------------------------------------------------------------ interactions (on foot)
let focus = null;
const fwdV = new THREE.Vector3();
function findFocus() {
  if (state.mode !== 'foot' || state.overlay) return null;
  if (state.lying) return { kind: 'getup', label: 'Get up' };
  camera.getWorldDirection(fwdV);
  const hx = head.position.x, hy = head.position.y, hz = head.position.z;
  let best = null, bestD = Infinity;
  for (const it of state.explore ? studio.interact : []) {
    const dx = it.pos[0] - hx, dz = it.pos[2] - hz, d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.pos[1] - hy) > 1.8) continue;
    const facing = (dx * fwdV.x + dz * fwdV.z) / (d || 1);
    if (facing < 0.55) continue;
    if (it.normal && dx * it.normal[0] + dz * it.normal[1] > 0) continue;     // the front of the painting, not its back
    if (d < bestD) { best = it; bestD = d; }
  }
  const dc = Math.hypot(hx - sim.x, hz - sim.z);
  if (!best && dc < 3.4) return { kind: 'car', label: 'Get in the car' };
  return best;
}
function interact() {
  const it = focus || findFocus();
  if (!it) return;
  if (it.kind === 'car') return toggleFoot();
  if (it.kind === 'getup') return getUp();
  if (it.kind === 'poem') return showPoem(pack.poems[it.index]);
  if (it.kind === 'art') return showArt(it.url);
  if (it.kind === 'radio') { toggleMusicPanel(true); music.toggle(); return; }
  if (it.kind === 'lounger') return lieDown(it.seat);
  if (it.kind === 'album') return showAlbum();
}
function showOverlay(html, cls) {
  const o = document.getElementById('overlay');
  o.className = cls || '';
  o.querySelector('.content').innerHTML = html;
  o.hidden = false;
  state.overlay = true;
}
function closeOverlay() { document.getElementById('overlay').hidden = true; state.overlay = false; album = null; }
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function showPoem(p) {
  const body = p.stanzas.map((st) => `<p>${st.map(esc).join('<br>')}</p>`).join('');
  showOverlay(`<button class="close" aria-label="Close">×</button><article class="poem"><h2>${esc(p.title)}</h2>${p.date ? `<time>${esc(p.date)}</time>` : ''}${body}<footer>— Deepti</footer></article>`, 'paper');
}
function showArt(url) {
  showOverlay(`<button class="close" aria-label="Close">×</button><figure class="art"><img src="${url}" alt="A painting by Deepti"><figcaption>Painted by Deepti</figcaption></figure>`, 'dark');
}
function lieDown(seat) {
  walker.active = false;
  her.root.visible = true;
  if (seat.eye) {
    // the reading nook: she sits sideways in the ring, back against the north cushion, legs along the seat
    const target = new THREE.Vector3(seat.x - 0.03, seat.y + 0.6, seat.z);
    state.lying = { seat, pose: 'nook', target };
    her.root.position.set(seat.x - 0.03, seat.y - 0.38, seat.z + 0.24);
    her.root.rotation.set(0, Math.PI, 0);
    orb.yaw = -Math.PI / 2 - 0.35; orb.pitch = 0.12; orb.d = 2.4;
    flash('Curl up and read · E to get up');
    return;
  }
  // a lounger: she lies back facing the sea; the camera looks past her to the sunset
  const target = new THREE.Vector3(seat.x, seat.y + 0.35, seat.z - 0.6);
  state.lying = { seat, pose: 'lie', target };
  her.root.position.set(seat.x, seat.y - 0.58, seat.z - 0.45);
  her.root.rotation.set(0, 0, 0);
  const az = THREE.MathUtils.degToRad(TIMES.sunset.az);
  orb.yaw = Math.atan2(-Math.sin(az), Math.cos(az)); orb.pitch = 0.1; orb.d = 2.6;
  const from = TIMES[state.time] && state.time !== 'night' ? state.time : 'evening';
  if (from === 'evening' || from === 'day' || from === 'sunset') timeBlend = { a: TIMES[from === 'day' ? 'evening' : from], steps: ['sunset', 'dusk'], k: 0 };
  flash('Watch the sun go down · E to get up');
}
function getUp() {
  if (!state.lying) return;
  const { seat } = state.lying;
  state.lying = null;
  if (seat.eye) placeHer(seat.x + 1.1, seat.z, Math.PI / 2, 0.6);
  else placeHer(seat.x - 0.95, seat.z, 0, 0.6);                 // beside the lounger, facing the sea
}

// ------------------------------------------------------------------ photo album: "Deepti's Corner"
let album = null;
function showAlbum() {
  album = { i: 0 };
  renderAlbum();
}
function renderAlbum() {
  const a = pack.album, photos = a.photos, i = album.i;
  const page = i === 0
    ? `<div class="cover"><h2>${esc(a.title)}</h2><p>❦</p><p class="hint">Turn the page →</p></div>`
    : `<figure><img src="play/deepti/${photos[i - 1].file}" alt=""><figcaption>${esc(photos[i - 1].caption || '')}</figcaption></figure>`;
  showOverlay(`<button class="close" aria-label="Close">×</button><div class="album">${page}
    <nav><button class="prev" ${i === 0 ? 'disabled' : ''}>‹</button><span>${i === 0 ? '' : i + ' / ' + photos.length}</span><button class="next" ${i === photos.length ? 'disabled' : ''}>›</button></nav></div>`, 'album-wrap');
  const o = document.getElementById('overlay');
  o.querySelector('.prev').onclick = () => turnAlbum(-1);
  o.querySelector('.next').onclick = () => turnAlbum(1);
}
function turnAlbum(k) {
  if (!album) return;
  album.i = Math.max(0, Math.min(pack.album.photos.length, album.i + k));
  renderAlbum();
}

// ------------------------------------------------------------------ the home tour (the opening view)
const VIEWS = {
  overview: { label: 'Overview', pos: [-17, 17, 46], target: [4.7, 3.2, 11] },
  front: { label: 'Front', pos: [1.5, 2.6, 37], target: [4.7, 3.6, 16] },
  back: { label: 'Back garden', pos: [7, 6.5, -15], target: [4.7, 2.5, 6] },
  terrace: { label: 'Terrace', pos: [21, 15, 31], target: [4.7, 7.5, 12] },
};
const FLOORS = [['ALL', 'All'], ['GF', 'Ground'], ['FF', 'First'], ['SF', 'Second']];
const ORDER = { GF: 0, FF: 1, SF: 2, ROOF: 3 };
let fly = null;
function buildTour() {
  const t = document.getElementById('tour');
  t.innerHTML = `<div class="t-head"><b>GH-18</b><span>3D home tour · R1</span><button class="t-menu" aria-label="Menu">☰</button></div>
    <div class="t-body">
      <h3>Views</h3><div class="t-row">${Object.entries(VIEWS).map(([k, v]) => `<button data-view="${k}">${v.label}</button>`).join('')}</div>
      <h3>Floors</h3><div class="t-row">${FLOORS.map(([k, l]) => `<button data-floor="${k}">${l}</button>`).join('')}</div>
      <h3>Rooms</h3><div class="t-rooms"></div>
      <h3>Time of day</h3><div class="t-row">${['day', 'evening', 'dusk', 'night'].map((k) => `<button data-time="${k}">${TIMES[k].label}</button>`).join('')}</div>
      <button class="t-walk">Walk through the house</button>
      <p class="t-hint">Drag to turn · scroll to zoom · when walking: W A S D, drag to look, Shift to hurry</p>
    </div>`;
  t.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { if (state.mode !== 'tour') enterTour(b.dataset.view); else tourView(b.dataset.view); }));
  t.querySelectorAll('[data-floor]').forEach((b) => (b.onclick = () => { if (state.mode !== 'tour') enterTour('overview'); setFloor(b.dataset.floor); if (b.dataset.floor !== 'ALL') floorView(b.dataset.floor); }));
  t.querySelectorAll('[data-time]').forEach((b) => (b.onclick = () => { state.beamsOverride = null; setTime(b.dataset.time); t.querySelectorAll('[data-time]').forEach((x) => x.classList.toggle('on', x === b)); }));
  t.querySelector('.t-walk').onclick = () => (state.mode === 'foot' ? enterTour('overview') : startWalk());
  t.querySelector('.t-menu').onclick = () => t.classList.toggle('collapsed');
  if (window.matchMedia('(max-width: 640px)').matches) t.classList.add('collapsed');
  setFloor('ALL');
}
function enterTour(view = 'overview', snap = false) {
  getUp();
  if (state.mode === 'foot') her.root.visible = false;
  state.mode = 'tour';
  walker.active = false;
  orbit.enabled = true;
  document.getElementById('tour').hidden = false;
  document.getElementById('hud').hidden = true;
  document.getElementById('music').hidden = true;
  tourView(view, snap);
  updateModeUI();
  applyHouseView();
}
function tourView(name, snap) {
  setFloor('ALL');
  const v = VIEWS[name] || VIEWS.overview;
  flyTo(v.pos, v.target, snap);
}
function floorView(fid) {
  const y = { GF: 0.45, FF: 3.75, SF: 7.05 }[fid] || 0;
  flyTo([-9, y + 16, 34], [4.7, y, 13]);
}
function flyTo(pos, target, snap) {
  if (snap) { camera.position.set(...pos); orbit.target.set(...target); orbit.update(); fly = null; return; }
  fly = { p0: camera.position.clone(), t0: orbit.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target), k: 0 };
}
function setFloor(f) {
  state.floor = f;
  for (const [fid, g] of Object.entries(floorGroups)) g.visible = f === 'ALL' || !(fid in ORDER) || ORDER[fid] <= ORDER[f];
  applyHouseView();
  const t = document.getElementById('tour');
  t.querySelectorAll('[data-floor]').forEach((b) => b.classList.toggle('on', b.dataset.floor === f));
  const list = t.querySelector('.t-rooms');
  const show = presets.filter((p) => (f === 'ALL' ? p.floor === 'GF' : p.floor === f) && p.kind !== 'outdoor' || (f === 'ALL' && p.kind === 'outdoor' && p.floor === 'GF'));
  list.innerHTML = show.map((p) => `<button data-room="${p.id}">${esc(p.name)}</button>`).join('');
  list.querySelectorAll('[data-room]').forEach((b) => (b.onclick = () => roomView(presets.find((p) => p.id === b.dataset.room))));
}
// the tour looks in from above, like the main site: no ceilings, and on a single floor the walls above
// 1.2 m are cut away. Walking or driving, everything is solid again.
function applyHouseView() {
  const tour = state.mode === 'tour';
  for (const g of Object.values(floorGroups)) {
    for (const m of g.children) {
      const cat = m.userData.cat;
      if (cat === 'ceiling') m.visible = !tour;
      else if (cat === 'upper' || cat === 'glassUpper') m.visible = !(tour && state.floor !== 'ALL' && m.userData.floor === state.floor);
    }
  }
}
function roomView(p) {
  setFloor(p.floor);
  const s = Math.max(4.5, p.size);
  flyTo([p.target[0] - s * 0.55, p.fy + s * 1.15 + 2.2, p.target[2] + s * 0.95], [p.target[0], p.fy + 0.6, p.target[2]]);
}
function startWalk() {
  state.mode = 'foot';
  orbit.enabled = false;
  setFloor('ALL');
  scene.add(her.root);
  placeHer(4.6, 25.2, Math.PI);             // on the road by the gate, facing the house
  if (state.explore) { document.getElementById('tour').hidden = true; document.getElementById('hud').hidden = false; }
  updateModeUI();
  applyHouseView();
  flash('W A S D to walk · drag to look around');
}

// ------------------------------------------------------------------ on foot: her figure and the camera behind her
const orb = { yaw: Math.PI, pitch: 0.22, dist: 3.2, d: 3.2 };
let herYaw = 0, herSpeed = 0;
const footPrev = new THREE.Vector3();
const HOUSE_BOX = [-0.8, 5.4, 9.5, 22.4];
function bbOf(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
// is there a wall at this point (metres) at height y? (camera only)
function wallAt(x, y, z) {
  const X = x * 1000, Z = z * 1000;
  for (const c of walkData.colliders) {
    if (y < c.y0 || y > c.y1) continue;
    const b = c.bb;
    if (X < b[0] - 150 || X > b[2] + 150 || Z < b[1] - 150 || Z > b[3] + 150) continue;
    if (circleHitsPoly(X, Z, 140, c.poly)) return true;
  }
  return false;
}
function updateFoot(dt) {
  // the walker moves her "head" the way the camera faces
  head.rotation.set(0, orb.yaw + Math.PI, 0, 'YXZ');
  if (!state.lying && !state.overlay) {
    walker.stick.y = (touchKeys.gas ? 1 : 0) - (touchKeys.brake ? 1 : 0);
    const turn = (touchKeys.left ? 1 : 0) - (touchKeys.right ? 1 : 0);
    if (turn) orb.yaw += turn * 1.6 * dt;
    walker.update(dt);
  }
  // her figure follows, turning towards where she walks
  const dx = head.position.x - footPrev.x, dz = head.position.z - footPrev.z, d = Math.hypot(dx, dz);
  footPrev.set(head.position.x, 0, head.position.z);
  herSpeed = d / Math.max(dt, 1e-3);
  if (state.lying) {
    her.update(dt, { pose: state.lying.pose });
    return;
  }
  if (d > 0.002) {
    let a = Math.atan2(dx, dz) - herYaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    herYaw += a * (1 - Math.exp(-dt * 12));
  }
  her.root.position.set(head.position.x, walker.foot, head.position.z);
  her.root.rotation.set(0, herYaw, 0);
  her.update(dt, { pose: herSpeed > 0.15 ? 'walk' : 'stand', speed: herSpeed });
}
function placeFootCamera(dt, snap) {
  camera.near = 0.05;
  const t = state.lying ? state.lying.target : tmpV.set(head.position.x, walker.foot + 1.38, head.position.z);
  if (state.fp && !state.lying) {
    her.root.visible = false;
    camera.position.set(head.position.x, walker.foot + 1.52, head.position.z);
    camera.rotation.set(-orb.pitch * 0.8, orb.yaw + Math.PI, 0, 'YXZ');
    camera.fov = 70; camera.updateProjectionMatrix();
    return;
  }
  const cp = Math.cos(orb.pitch), sp = Math.sin(orb.pitch);
  const ux = -Math.sin(orb.yaw) * cp, uy = sp, uz = -Math.cos(orb.yaw) * cp;
  // pull in in front of walls
  let free = orb.dist;
  for (let i = 1; i <= (state.lying ? 0 : 12); i++) {          // seated views are framed by hand: no pull-in
    const k = (i / 12) * orb.dist;
    if (wallAt(t.x + ux * k, t.y + uy * k, t.z + uz * k)) { free = Math.max(0.35, k - 0.3); break; }
  }
  orb.d = snap ? free : damp(orb.d, free, free < orb.d ? 25 : 3, dt);
  let y = t.y + uy * orb.d;
  // indoors, keep under the ceiling
  const indoor = head.position.x > HOUSE_BOX[0] && head.position.x < HOUSE_BOX[2] && head.position.z > HOUSE_BOX[1] && head.position.z < HOUSE_BOX[3];
  if (indoor && walker.foot > 0.3) y = Math.min(y, walker.foot + 2.75);
  if (head.position.x > STUDIO.x0 && head.position.x < STUDIO.x0 + STUDIO.w && head.position.z > STUDIO.z0 && head.position.z < STUDIO.z0 + STUDIO.d) y = Math.min(y, STUDIO.floor + 2.8);
  camera.position.set(t.x + ux * orb.d, Math.max(y, groundHeight(t.x + ux * orb.d, t.z + uz * orb.d) + 0.25), t.z + uz * orb.d);
  camera.lookAt(t.x, t.y - 0.1, t.z);
  her.root.visible = orb.d > 0.5;
  camera.fov = damp(camera.fov, 60, 6, dt); camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ music UI
function toggleMusicPanel(force) {
  const p = document.getElementById('music');
  const open = typeof force === 'boolean' ? force : p.hidden;
  p.hidden = !open;
  if (open) music.load();
  else music.pause();               // YouTube asks for the player to be visible while it plays
}
function updateMusicUI() {
  document.getElementById('m-title').textContent = music.error || music.title || 'Her songs';
  document.getElementById('m-play').textContent = music.playing ? '❚❚' : '▶';
  document.getElementById('music-btn').classList.toggle('on', music.playing);
}

// ------------------------------------------------------------------ car visuals (drawn between physics steps)
const pose = {
  x: 0, z: 0, yaw: 0, steer: 0, spin: 0,
  copyFrom(s) { this.x = s.x; this.z = s.z; this.yaw = s.yaw; this.steer = s.steer; this.spin = s.wheelSpin; },
  blend(s, a) {
    this.x = s.px + (s.x - s.px) * a; this.z = s.pz + (s.z - s.pz) * a;
    let dy = s.yaw - s.pyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = s.pyaw + dy * a;
    this.steer = s.psteer + (s.steer - s.psteer) * a;
    this.spin = s.pspin + (s.wheelSpin - s.pspin) * a;
  },
};
const body = { pitch: 0, roll: 0, vp: 0, vr: 0 };
const H = { FL: 0, FR: 0, RL: 0, RR: 0 };
function updateCar(dt) {
  const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw), rx = -fz, rz = fx;
  for (const w of car.wheels) {
    const lx = w.rest.x, lz = w.rest.z;
    H[w.q] = groundHeight(pose.x - rx * lx + fx * lz, pose.z - rz * lx + fz * lz);
  }
  const front = (H.FL + H.FR) / 2, rear = (H.RL + H.RR) / 2, left = (H.FL + H.RL) / 2, right = (H.FR + H.RR) / 2;
  const gy = (front + rear) / 2;
  // body on springs: a damped spring towards the pitch / roll the accelerations and the ground ask for
  const tp = -Math.atan2(front - rear, car.wheelbase) - sim.ax * 0.010;
  const tr = Math.atan2(left - right, car.track) + sim.ay * 0.011;
  const K = 120, C = 16;
  body.vp += ((tp - body.pitch) * K - body.vp * C) * dt; body.pitch += body.vp * dt;
  body.vr += ((tr - body.roll) * K - body.vr * C) * dt; body.roll += body.vr * dt;
  car.root.position.set(pose.x, gy, pose.z);
  car.root.rotation.y = pose.yaw;
  car.body.rotation.set(body.pitch, 0, body.roll);
  for (const w of car.wheels) {
    w.steer.rotation.y = w.front ? pose.steer : 0;
    w.spin.rotation.x = pose.spin * (sim.s.wheelRadius / w.radius);
    w.axle.position.y = w.rest.y + (H[w.q] - gy);
  }
  if (car.steering) car.steering.rotation.z = pose.steer * 13.5;          // ~14:1 steering ratio
  const inp = state.mode === 'drive' ? lastInput : NO_INPUT;
  const braking = (sim.speed > 0.3 && inp.brake > 0) || (sim.speed < -0.3 && inp.throttle > 0) || inp.handbrake;
  car.mats.tail.emissiveIntensity = (state.beams ? 0.7 : 0) + (braking ? 2.6 : 0);
  car.mats.reverse.emissiveIntensity = sim.reversing && sim.speed < -0.1 ? 1.6 : 0;
}
let lastInput = NO_INPUT;

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();
const cam = { yaw: 0, dist: 6.4, h: 2.3, fov: 58, init: false };
const CORNERS = [[0, 0], [0, 0], [0, 0], [0, 0]];
function blockedAt(px, pz) {
  const s = 0.3;
  CORNERS[0][0] = px - s; CORNERS[0][1] = pz - s; CORNERS[1][0] = px + s; CORNERS[1][1] = pz - s;
  CORNERS[2][0] = px + s; CORNERS[2][1] = pz + s; CORNERS[3][0] = px - s; CORNERS[3][1] = pz + s;
  return !!camBlock.deepest(CORNERS, px, pz);
}
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
function placeCamera(snap, dt) {
  if (state.mode === 'foot') return placeFootCamera(dt, snap);
  if (state.mode === 'tour') {
    camera.near = 0.1;
    camera.fov = 45; camera.updateProjectionMatrix();
    if (fly) {
      fly.k = Math.min(1, fly.k + dt / 0.9);
      const e = fly.k * fly.k * (3 - 2 * fly.k);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      orbit.target.lerpVectors(fly.t0, fly.t1, e);
      if (fly.k >= 1) fly = null;
    }
    orbit.update();
    return;
  }
  const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw), now = performance.now() / 1000;
  const kmh = Math.abs(sim.speed) * 3.6;
  if (Math.abs(sim.speed) > 2 && now - look.last > 1.5) { look.yaw = damp(look.yaw, 0, 1.5, dt); look.pitch = damp(look.pitch, 0, 1.5, dt); }
  if (Math.hypot(pose.x - HOME.x, pose.z - HOME.z) > 3.8) state.driven = true;      // out of the gate

  if (state.cam === 'driver') {
    car.root.updateMatrixWorld(true);
    car.eye.getWorldPosition(camPos);
    // the head sways a little with the car: back under acceleration, out in the turns
    // (left = (cos yaw, -sin yaw); in a left turn ay > 0 and the head moves to the right)
    camPos.x += -fx * sim.ax * 0.004 - Math.cos(pose.yaw) * sim.ay * 0.005;
    camPos.z += -fz * sim.ax * 0.004 + Math.sin(pose.yaw) * sim.ay * 0.005;
    const yaw = pose.yaw + look.yaw * 1.4 + pose.steer * 0.35, pitch = -0.07 - look.pitch * 0.6 + body.pitch * 0.5;
    camLook.set(camPos.x + Math.sin(yaw) * 10, camPos.y + Math.sin(pitch) * 10, camPos.z + Math.cos(yaw) * 10);
    camera.near = 0.03;
    cam.fov = damp(cam.fov, 72 + Math.min(kmh, 140) * 0.04, 4, dt);
    camera.fov = cam.fov;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    return;
  }
  camera.near = 0.1;
  // opening shot from the beach side of the road, looking back at the car and GH-18
  if (!state.driven && state.cam === 'chase') {
    tmpV.set(HOME.x - 4.6, 1.8, HOME.z + 10.5);
    tmpL.set(pose.x - 2.0, 2.4 + Math.max(0, 1 - (pose.z - HOME.z) / 3) * 0.6, pose.z - 3.0);   // follows the car out
    if (snap) { camPos.copy(tmpV); camLook.copy(tmpL); } else { camPos.lerp(tmpV, 1 - Math.exp(-dt * 3)); camLook.lerp(tmpL, 1 - Math.exp(-dt * 3)); }
    cam.yaw = pose.yaw; cam.init = true;
    camera.fov = cam.fov = 58;
    camera.position.copy(camPos); camera.lookAt(camLook); camera.updateProjectionMatrix();
    return;
  }
  // chase: the camera swings round behind the car's heading (a damped angle), not its position, so it
  // stays locked to the car without rubber-banding
  const high = state.cam === 'high';
  const targetYaw = pose.yaw + look.yaw;
  if (snap || !cam.init) { cam.yaw = targetYaw; cam.init = true; } else {
    let d = targetYaw - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += d * (1 - Math.exp(-dt * (high ? 2.5 : 4.2)));
  }
  let dist = (high ? 13 : 6.3 + Math.min(kmh, 120) * 0.012) * look.zoom;
  const ht = (high ? 8.5 : 2.25) * look.zoom + look.pitch * dist * 0.8;
  // keep out of walls: shorten towards the car
  let free = 1;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    if (blockedAt(pose.x - Math.sin(cam.yaw) * dist * t, pose.z - Math.cos(cam.yaw) * dist * t)) { free = Math.max(0.45, (i - 1.5) / 8); break; }
  }
  cam.dist = snap ? dist * free : damp(cam.dist, dist * free, free < cam.dist / dist ? 12 : 3, dt);
  // when boxed in (leaving GH-18's parking), sit a little higher and look down over the roof
  const htB = ht + (1 - free) * 1.1;
  cam.h = snap ? htB : damp(cam.h, htB, 4, dt);
  camPos.set(pose.x - Math.sin(cam.yaw) * cam.dist, Math.max(0.7, cam.h + groundHeight(pose.x, pose.z)), pose.z - Math.cos(cam.yaw) * cam.dist);
  camLook.set(pose.x + fx * (high ? 3 : 2.0), (high ? 0.4 : 1.05), pose.z + fz * (high ? 3 : 2.0));
  cam.fov = snap ? 58 : damp(cam.fov, 58 + Math.min(kmh, 140) * 0.09, 3, dt);
  camera.fov = cam.fov;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ map
let mapBase = null;
const MAP = { x0: -900, x1: 400, z0: -650, z1: 140, px: 1 };     // 1 px per metre
function buildMap() {
  const W = MAP.x1 - MAP.x0, Hh = MAP.z1 - MAP.z0;
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const U = (x) => MAP.x1 - x, V = (z) => MAP.z1 - z;           // east (-X) to the right, north up
  g.fillStyle = '#d8ccb2'; g.fillRect(0, 0, W, Hh);
  // sea: the side of the coastline away from the land
  g.fillStyle = '#7fb3c4';
  g.beginPath();
  const coast = beach.map.coast;
  g.moveTo(U(coast[0][0]), V(coast[0][1]));
  for (const [x, z] of coast) g.lineTo(U(x), V(z));
  g.lineTo(U(2000), V(-3000)); g.lineTo(U(2000), V(3000)); g.lineTo(U(-3000), V(3000)); g.closePath(); g.fill();
  g.strokeStyle = '#efe0bf'; g.lineWidth = 16; g.lineJoin = 'round';
  g.beginPath(); coast.forEach(([x, z], i) => (i ? g.lineTo(U(x), V(z) + 0) : g.moveTo(U(x), V(z)))); g.stroke();
  g.strokeStyle = '#5f5b55'; g.lineWidth = 7;
  g.beginPath(); beach.map.road.forEach((p, i) => (i ? g.lineTo(U(p.x), V(p.z)) : g.moveTo(U(p.x), V(p.z)))); g.closePath(); g.stroke();
  g.fillStyle = '#d9822b'; g.fillRect(U(9.381), V(22.276), 9.381, 22.276);
  g.fillStyle = '#c0567a'; g.fillRect(U(112), V(51), 14, 9);
  g.font = 'bold 11px sans-serif'; g.fillStyle = '#4a2e14';
  g.fillText('Home', U(9.381) - 2, V(22.276) + 34);
  g.fillText('Studio', U(112) - 4, V(51) - 6);
  mapBase = c;
}
function drawMap() {
  const cv = document.getElementById('map');
  if (!cv || !mapBase) return;
  const g = cv.getContext('2d'), S = cv.width, view = 260;
  const k = S / view;
  const px = state.mode === 'foot' ? head.position.x : pose.x, pz = state.mode === 'foot' ? head.position.z : pose.z;
  const u = MAP.x1 - px, v = MAP.z1 - pz;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#7fb3c4'; g.fillRect(0, 0, S, S);
  g.drawImage(mapBase, u - S / 2 / k, v - S / 2 / k, S / k, S / k, 0, 0, S, S);
  g.translate(S / 2, S / 2);
  let yaw = pose.yaw;
  if (state.mode === 'foot') yaw = herYaw;
  g.rotate(-yaw);
  g.fillStyle = state.mode === 'foot' ? '#ffd9a0' : '#ffffff'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = '#1b1b1b'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
  g.fillText('N', S / 2, 14);
}

// ------------------------------------------------------------------ loop
const STEP = 1 / 120;
let acc = 0, last = performance.now(), lampTimer = 0, hudTimer = 0, prevImpact = 0, clock = 0, envTimer = 0;
function stepSim(dt, input) {
  acc += Math.min(dt, 0.1);
  while (acc >= STEP) { sim.step(STEP, input, collide, surfaceAt); acc -= STEP; }
  pose.blend(sim, acc / STEP);
}

function loop() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const input = state.started ? readInput(dt) : NO_INPUT;
  lastInput = state.mode === 'drive' && !state.overlay ? input : { ...NO_INPUT, handbrake: true };
  stepSim(dt, lastInput);
  if (state.mode === 'foot') updateFoot(dt);
  frame(dt);
}

function frame(dt = 1 / 60, draw = true) {
  clock += dt;
  beach.update(clock);
  updateCar(dt);
  if (state.mode === 'drive') {                    // she drives: in her seat, hidden from her own eyes
    her.update(dt, { pose: 'drive' });
    her.root.visible = state.cam !== 'driver';
  }
  placeCamera(false, dt);
  // the sunset plays out (lounger): blend through sunset to dusk over about a minute
  if (timeBlend) {
    timeBlend.k += dt / 30;
    const seg = Math.min(timeBlend.steps.length - 1, Math.floor(timeBlend.k));
    const from = seg === 0 ? timeBlend.a : TIMES[timeBlend.steps[seg - 1]], to = TIMES[timeBlend.steps[seg]];
    const k = Math.min(1, timeBlend.k - seg);
    envTimer -= dt;
    if (envTimer <= 0) { envTimer = 0.4; applyTime(lerpTime(from, to, k)); }
    if (timeBlend.k >= timeBlend.steps.length) { const end = timeBlend.steps[timeBlend.steps.length - 1]; setTime(end); }
  }
  const focusX = state.mode === 'foot' ? head.position.x : state.mode === 'tour' ? orbit.target.x : pose.x;
  const focusZ = state.mode === 'foot' ? head.position.z : state.mode === 'tour' ? orbit.target.z : pose.z;
  const d = sun.userData.dir || new THREE.Vector3(0, 1, 0);
  sun.target.position.set(focusX, 0, focusZ);
  sun.position.set(focusX + d.x * 150, Math.max(10, d.y * 150), focusZ + d.z * 150);
  lampTimer -= dt;
  if (lampTimer <= 0 && lampLights[0].intensity > 0) {
    lampTimer = 0.5;
    const near = beach.lamps.map((l) => [l, (l.hx - focusX) ** 2 + (l.hz - focusZ) ** 2]).sort((a, b) => a[1] - b[1]);
    lampLights.forEach((pl, i) => { const l = near[i][0]; pl.position.set(l.hx, 7.6, l.hz); });
  }
  if (audio?.ctx) {
    if (state.engineOff > 0) state.engineOff -= dt;
    audio.update({
      rpm: sim.rpm, throttle: state.mode === 'drive' ? (lastInput.throttle || (lastInput.brake && sim.reversing ? 1 : 0)) : 0,
      slip: sim.slip, speed: sim.speed, gear: sim.gear, surface: sim.surface,
      shoreDist: state.explore ? -coastDist(camera.position.x, camera.position.z) : 999, inside: state.mode === 'drive' && state.cam === 'driver',
      engineOn: state.mode === 'drive' || state.engineOff > 0,
    });
    if (sim.impact > prevImpact + 0.5) audio.thud(sim.impact / 8);
  }
  prevImpact = sim.impact;
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    document.getElementById('kmh').textContent = Math.round(Math.abs(sim.speed) * 3.6);
    const moving = Math.abs(sim.speed) > 0.2;
    document.getElementById('gear').textContent = sim.reversing ? 'R' : moving ? 'D' + sim.gear : 'D';
    focus = findFocus();
    // her message plays once, the first time she reaches the studio (by car or on foot)
    if (state.explore && !state.msgPlayed && pack?.studioMessage) {
      const atPad = state.mode === 'drive' && Math.hypot(sim.x - STUDIO_PARK.x, sim.z - STUDIO_PARK.z) < 14 && Math.abs(sim.speed) < 1.5;
      const onDeck = state.mode === 'foot' && head.position.x > STUDIO.x0 - 1.5 && head.position.x < STUDIO.x0 + STUDIO.w + 1.5 && head.position.z > STUDIO.z0 - 2.5 && head.position.z < STUDIO.z0 + STUDIO.d + 3;
      if (atPad || onDeck) { state.msgPlayed = true; playMessage(); }
    }
    const pr = document.getElementById('prompt');
    pr.hidden = !focus;
    if (focus) pr.innerHTML = `<kbd>E</kbd> ${esc(focus.label)}`;
    drawMap();
  }
  if (draw) renderer.render(scene, camera);
}

// ------------------------------------------------------------------ headless / test API
window.play = {
  ready: false,
  setTime,
  tour: (view = 'overview') => { enterTour(view, true); frame(1 / 60); },
  floor: (f) => { setFloor(f); if (f !== 'ALL') floorView(f); fly && (fly.k = 1); frame(1 / 60); },
  room: (name) => { roomView(presets.find((p) => p.name === name)); fly.k = 0.999; frame(1); },
  walk: () => { startWalk(); for (let i = 0; i < 20; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); } hudTimer = 0; frame(1 / 60); return window.play.state(); },
  // walk for `seconds` holding a key (W by default), the camera facing yawDeg (0 = north)
  stroll: (seconds, code = 'KeyW', yawDeg = null) => {
    if (yawDeg != null) orb.yaw = THREE.MathUtils.degToRad(yawDeg);
    walker.keys[code] = true;
    for (let t = 0; t < seconds; t += 1 / 30) { updateFoot(1 / 30); placeFootCamera(1 / 30, false); }
    walker.keys[code] = false;
    for (let i = 0; i < 8; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, false); }
    hudTimer = 0; frame(1 / 60);
    return { x: +head.position.x.toFixed(2), z: +head.position.z.toFixed(2), foot: +walker.foot.toFixed(2), focus: focus && focus.label };
  },
  orbit: (yawDeg, pitch = 0.22, dist = 3.2) => { orb.yaw = THREE.MathUtils.degToRad(yawDeg); orb.pitch = pitch; orb.dist = dist; placeFootCamera(1 / 60, true); frame(1 / 60); },
  camera: (mode) => { state.cam = mode; state.driven = true; placeCamera(true, 1 / 60); },
  teleport: (x, z, yawDeg = 0) => { sim.reset(x, z, THREE.MathUtils.degToRad(yawDeg)); pose.copyFrom(sim); state.driven = true; placeCamera(true, 1 / 60); },
  home: goHome,
  studio: goStudio,
  look: (yaw = 0, pitch = 0, zoom = 1) => { Object.assign(look, { yaw, pitch, zoom, last: performance.now() / 1000 + 1e6 }); placeCamera(true, 1 / 60); },
  drive: (seconds, input = {}) => {
    const inp = { ...NO_INPUT, ...input };
    lastInput = inp;
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) sim.step(STEP, inp, collide, surfaceAt);
    pose.copyFrom(sim);
    for (let i = 0; i < 30; i++) { updateCar(1 / 30); her.update(1 / 30, { pose: 'drive' }); placeCamera(false, 1 / 30); }
    hudTimer = 0; lampTimer = 0;
    frame(1 / 60);
    return window.play.state();
  },
  exit: () => { exitCar(); for (let i = 0; i < 10; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); } frame(1 / 60); return window.play.state(); },
  enter: () => { toggleFoot(); frame(1 / 60); return window.play.state(); },
  // on foot: put her at (x, z) metres facing yaw degrees (0 = north / +Z); the camera behind her
  foot: (x, z, yawDeg = 0, pitch = 0.22, footY = 0) => {
    if (state.mode !== 'foot') { state.mode = 'foot'; orbit.enabled = false; scene.add(her.root); }
    placeHer(x, z, THREE.MathUtils.degToRad(yawDeg), footY);
    orb.pitch = pitch;
    for (let i = 0; i < 10; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); }
    updateModeUI();
    hudTimer = 0; frame(1 / 60);
    return { x: +head.position.x.toFixed(2), z: +head.position.z.toFixed(2), foot: +walker.foot.toFixed(2), focus: focus && focus.label };
  },
  interact: () => { focus = findFocus(); interact(); for (let i = 0; i < 10; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); } hudTimer = 0; frame(1 / 60); return state.overlay || !!state.lying; },
  page: (k) => { turnAlbum(k); },
  close: () => { closeOverlay(); album = null; frame(1 / 60); },
  sunset: (seconds) => { for (let t = 0; t < seconds; t += 0.25) frame(0.25, false); hudTimer = 0; frame(1 / 60); return state.time; },
  render: () => { placeCamera(true, 1 / 60); hudTimer = 0; lampTimer = 0; frame(1 / 60); },
  state: () => ({ mode: state.mode, explore: state.explore, birthday: state.birthday, x: +sim.x.toFixed(2), z: +sim.z.toFixed(2), yaw: +THREE.MathUtils.radToDeg(sim.yaw).toFixed(1), kmh: +(sim.speed * 3.6).toFixed(1), gear: sim.gear, surface: sim.surface }),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, wheel: !!car.steering, pack: !!pack, interact: studio.interact.length }),
};

init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.querySelector('span').textContent = 'Something went wrong: ' + e.message;
});
