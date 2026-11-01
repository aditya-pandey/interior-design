import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import house from '../../../house_r1.json';
import { createMaterials } from '../materials.js';
import { buildHouse } from '../build.js';
import { furnitureCorners, circleHitsPoly } from '../geom.js';
import { Walker } from '../walk.js';
import { buildBeach, groundHeight, surfaceAt, coastDist, seaFence } from './beach.js';
import { buildStudio } from './studio.js';
import { STUDIO_PARK } from './site.js';
import { CollisionWorld } from './collide.js';
import { VehicleSim } from './vehicle.js';
import { loadBaleno } from './carmodel.js';
import { CarAudio } from './audio.js';
import { Music } from './music.js';
import './play.css';

// /play/ : GH-18 on a quiet coast. Drive the Baleno along the beach highway, get out and walk, and
// spend time in her glass studio on the sand (her paintings, poems, books and music).
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
let M, beach, studio, collide, camBlock, car, sim, audio, music, walker, pack;
const lampLights = [];
const state = { time: 'evening', cam: 'chase', beamsOverride: null, started: false, sound: true, driven: false, mode: 'drive', lying: null, overlay: false, engineOff: 0 };

async function init() {
  M = await createMaterials(renderer);
  try { pack = await (await fetch('play/deepti/pack.json')).json(); } catch { pack = null; }

  const data = buildHouse(house, M);
  for (const mesh of data.meshes) {
    if (mesh.userData.floor === 'SITE') continue;
    if (['car_paint', 'tyre', 'car_glass'].includes(mesh.userData.mat)) continue;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
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
  const walkData = {
    colliders: [...houseWalk, ...studio.walk.colliders],
    surfaces: [...data.surfaces, ...studio.walk.surfaces],
    stair: data.stair, levels: data.levels,
  };
  walker = new FootWalker(camera, renderer.domElement, walkData);

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

  setTime(params.get('time') || 'evening');
  buildMap();
  bindUI();
  pose.copyFrom(sim);
  placeCamera(true, 1 / 60);
  document.getElementById('loading').remove();
  window.play.ready = true;
  if (HEADLESS) { start(false); frame(1 / 60); } else document.getElementById('start').hidden = false;
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
    if (state.overlay) { if (['Escape', 'KeyE', 'Enter', 'Space'].includes(e.code)) closeOverlay(); return; }
    const act = { KeyC: cycleCam, KeyL: toggleBeams, KeyT: cycleTime, KeyR: goHome, KeyM: toggleSound, KeyF: toggleFoot, KeyE: interact, KeyP: () => music.toggle(), KeyN: () => music.next(), KeyG: goStudio }[e.code];
    if (act) act();
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
      b.addEventListener('click', () => ({ cam: cycleCam, lights: toggleBeams, time: cycleTime, home: goHome, studio: goStudio, foot: toggleFoot, sound: toggleSound, music: toggleMusicPanel })[act]());
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
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (state.mode === 'foot' && !state.lying) { walker.look(dx * 0.8, dy * 0.8); return; }
    look.yaw -= dx * 0.006;
    look.pitch = Math.max(-0.35, Math.min(0.9, look.pitch + dy * 0.004));
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
  updateModeUI();
}
const CAMS = ['chase', 'driver', 'high'];
function cycleCam() { if (state.mode !== 'drive') return; state.cam = CAMS[(CAMS.indexOf(state.cam) + 1) % CAMS.length]; look.yaw = 0; look.pitch = 0; state.driven = true; placeCamera(true, 1 / 60); }
function toggleBeams() { state.beamsOverride = !state.beams; setBeams(state.beamsOverride); }
function cycleTime() { state.beamsOverride = null; setTime(TIME_ORDER[(TIME_ORDER.indexOf(state.time) + 1) % TIME_ORDER.length]); }
function goHome() {
  if (state.mode === 'foot') { getUp(); walker.place(4800, 24600, 0, 0, 0); return; }     // at the gate, facing the house
  sim.reset(HOME.x, HOME.z, HOME.yaw); pose.copyFrom(sim); state.driven = false; look.yaw = 0; look.pitch = 0; placeCamera(true, 1 / 60);
}
function goStudio() {
  if (state.mode === 'foot') { getUp(); walker.place(studio.entry.x * 1000, studio.entry.z * 1000, 0.12, Math.PI, 0); return; }
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
  if (state.mode === 'drive') {
    if (Math.abs(sim.speed) > 1.5) { flash('Stop the car first'); return; }
    // step out on the driver's side (right-hand drive: the car's right), or the other side if blocked
    const [fx, fz] = sim.forward, rx = -fz, rz = fx;
    let placed = false;
    // beside the driver's door first; in a tight spot (GH-18's bay) in front of or behind the car
    for (const [side, along, face] of [[1, -0.2, 0.6], [-1, -0.2, -0.6], [1, 1.2, 0.3], [-1, 1.2, -0.3], [0, 2.7, 0], [0, -2.7, Math.PI]]) {
      const x = (sim.x + rx * side * 1.45 + fx * along) * 1000, y = (sim.z + rz * side * 1.45 + fz * along) * 1000;
      if (walker.blocked(x, y, 0.3)) continue;
      state.mode = 'foot';
      walker.place(x, y, groundHeight(x / 1000, y / 1000), sim.yaw + Math.PI + face, 0);
      placed = true;
      break;
    }
    if (!placed) { flash('No room to get out here'); return; }
    walker.active = true;
    state.engineOff = 2.5;
    audio.door();
  } else {
    const d = Math.hypot(camera.position.x - sim.x, camera.position.z - sim.z);
    if (d > 3.4) { flash('Walk up to the car to get in'); return; }
    getUp();
    state.mode = 'drive';
    walker.active = false;
    state.cam = 'chase'; state.driven = true; look.yaw = 0; look.pitch = 0;
    audio.door();
    placeCamera(true, 1 / 60);
  }
  updateModeUI();
}
function updateModeUI() {
  const foot = state.mode === 'foot';
  document.body.classList.toggle('on-foot', foot);
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
  let best = null, bestD = Infinity;
  for (const it of studio.interact) {
    const dx = it.pos[0] - camera.position.x, dz = it.pos[2] - camera.position.z, d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.pos[1] - camera.position.y) > 1.8) continue;
    const facing = (dx * fwdV.x + dz * fwdV.z) / (d || 1);
    if (facing < 0.55) continue;
    if (it.normal && dx * it.normal[0] + dz * it.normal[1] > 0) continue;     // the front of the painting, not its back
    if (d < bestD) { best = it; bestD = d; }
  }
  const dc = Math.hypot(camera.position.x - sim.x, camera.position.z - sim.z);
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
}
function showOverlay(html, cls) {
  const o = document.getElementById('overlay');
  o.className = cls || '';
  o.querySelector('.content').innerHTML = html;
  o.hidden = false;
  state.overlay = true;
}
function closeOverlay() { document.getElementById('overlay').hidden = true; state.overlay = false; }
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function showPoem(p) {
  const body = p.stanzas.map((st) => `<p>${st.map(esc).join('<br>')}</p>`).join('');
  showOverlay(`<button class="close" aria-label="Close">×</button><article class="poem"><h2>${esc(p.title)}</h2>${p.date ? `<time>${esc(p.date)}</time>` : ''}${body}<footer>— Deepti</footer></article>`, 'paper');
}
function showArt(url) {
  showOverlay(`<button class="close" aria-label="Close">×</button><figure class="art"><img src="${url}" alt="A painting by Deepti"><figcaption>Painted by Deepti</figcaption></figure>`, 'dark');
}
function lieDown(seat) {
  state.lying = { seat, from: { ...walker.camera.position }, foot: walker.foot };
  walker.active = false;
  if (seat.eye) {                                            // the reading nook: sit and look out across the studio
    camera.position.set(...seat.eye);
    camera.rotation.set(0.0, Math.atan2(seat.look[0], seat.look[1]) + Math.PI, 0, 'YXZ');
    flash('Curl up and read · E to get up');
    return;
  }
  camera.position.set(seat.x, seat.y + 0.42, seat.z - 0.55);
  // head turned to the sunset: the sun's bearing (x = -sin az, z = cos az), slightly above the horizon
  const az = THREE.MathUtils.degToRad(TIMES.sunset.az);
  camera.rotation.set(0.06, Math.atan2(-Math.sin(az), Math.cos(az)) + Math.PI, 0, 'YXZ');
  // let the sun go down slowly while she lies here
  const from = TIMES[state.time] && state.time !== 'night' ? state.time : 'evening';
  if (from === 'evening' || from === 'day' || from === 'sunset') {
    timeBlend = { a: TIMES[from === 'day' ? 'evening' : from], steps: ['sunset', 'dusk'], k: 0 };
  }
  flash('Watch the sun go down · E to get up');
}
function getUp() {
  if (!state.lying) return;
  const { seat } = state.lying;
  state.lying = null;
  walker.place((seat.x + 0.95) * 1000, seat.z * 1000, 0.6, Math.PI, 0);      // beside the lounger, facing the sea
  walker.active = true;
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
  if (state.mode === 'foot') {
    camera.near = 0.05;
    cam.fov = damp(cam.fov, 70, 6, dt);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    return;                                   // the walker drives the camera
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
  const px = state.mode === 'foot' ? camera.position.x : pose.x, pz = state.mode === 'foot' ? camera.position.z : pose.z;
  const u = MAP.x1 - px, v = MAP.z1 - pz;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#7fb3c4'; g.fillRect(0, 0, S, S);
  g.drawImage(mapBase, u - S / 2 / k, v - S / 2 / k, S / k, S / k, 0, 0, S, S);
  g.translate(S / 2, S / 2);
  let yaw = pose.yaw;
  if (state.mode === 'foot') { camera.getWorldDirection(fwdV); yaw = Math.atan2(fwdV.x, fwdV.z); }
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
  if (state.mode === 'foot' && !state.lying && !state.overlay) {
    // touch on foot: gas / brake walk, the arrows turn
    walker.stick.y = (touchKeys.gas ? 1 : 0) - (touchKeys.brake ? 1 : 0);
    const turn = (touchKeys.left ? 1 : 0) - (touchKeys.right ? 1 : 0);
    if (turn) walker.look(-turn * 160 * dt, 0);
    walker.update(dt);
  }
  frame(dt);
}

function frame(dt = 1 / 60, draw = true) {
  clock += dt;
  beach.update(clock);
  updateCar(dt);
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
  const focusX = state.mode === 'foot' ? camera.position.x : pose.x, focusZ = state.mode === 'foot' ? camera.position.z : pose.z;
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
      shoreDist: coastDist(camera.position.x, camera.position.z) * -1, inside: state.mode === 'drive' && state.cam === 'driver',
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
    for (let i = 0; i < 30; i++) { updateCar(1 / 30); placeCamera(false, 1 / 30); }
    hudTimer = 0; lampTimer = 0;
    frame(1 / 60);
    return window.play.state();
  },
  exit: () => { toggleFoot(); frame(1 / 60); return window.play.state(); },
  // on foot: put the walker at (x, z) metres, facing yaw degrees (0 = north / +Z), eye pitch degrees
  foot: (x, z, yawDeg = 0, pitchDeg = 0, footY = 0) => {
    state.mode = 'foot'; walker.active = true; updateModeUI();
    walker.place(x * 1000, z * 1000, footY, THREE.MathUtils.degToRad(yawDeg) + Math.PI, THREE.MathUtils.degToRad(pitchDeg));
    hudTimer = 0; frame(1 / 60);
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z, focus: focus && focus.label };
  },
  walk: (seconds, code = 'KeyW') => {
    walker.keys[code] = true;
    for (let t = 0; t < seconds; t += 1 / 60) walker.update(1 / 60);
    walker.keys[code] = false;
    hudTimer = 0; frame(1 / 60);
    return { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2), focus: focus && focus.label };
  },
  interact: () => { focus = findFocus(); interact(); frame(1 / 60); return state.overlay || !!state.lying; },
  close: () => { closeOverlay(); frame(1 / 60); },
  sunset: (seconds) => { for (let t = 0; t < seconds; t += 0.25) frame(0.25, false); hudTimer = 0; frame(1 / 60); return state.time; },
  render: () => { placeCamera(true, 1 / 60); hudTimer = 0; lampTimer = 0; frame(1 / 60); },
  state: () => ({ mode: state.mode, x: +sim.x.toFixed(2), z: +sim.z.toFixed(2), yaw: +THREE.MathUtils.radToDeg(sim.yaw).toFixed(1), kmh: +(sim.speed * 3.6).toFixed(1), gear: sim.gear, rpm: Math.round(sim.rpm), surface: sim.surface }),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, wheel: !!car.steering, pack: !!pack, interact: studio.interact.length }),
};

init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.querySelector('span').textContent = 'Something went wrong: ' + e.message;
});
