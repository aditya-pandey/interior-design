import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import house from '../../../house_r1.json';
import { createMaterials } from '../materials.js';
import { buildHouse } from '../build.js';
import { furnitureCorners, circleHitsPoly, pointInPoly } from '../geom.js';
import { Walker } from '../walk.js';
import { buildBeach, groundHeight, surfaceAt, coastDist, seaFence, ROAD } from './beach.js';
const ROAD_PTS2 = () => ROAD.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]);
import { buildStudio, DEVANAGARI } from './studio.js';
import { fontsReady } from './fonts.js';
import { STUDIO, STUDIO_PARK } from './site.js';
import { CollisionWorld } from './collide.js';
import { VehicleSim } from './vehicle.js';
import { loadBaleno, DASH } from './carmodel.js';
import { createParticles } from './particles.js';
import { CarAudio } from './audio.js';
import { Music } from './music.js';
import { playBirthday } from './birthday.js';
import { buildNightSky } from './night.js';
import { buildClouds } from './clouds.js';
import { buildSpray } from './spray.js';
import { buildDressing, createFootprints } from './dressing.js';
import { Ambience, measureSfx } from './ambience.js';
import { buildCosy } from './cosy.js';
import { buildBillboards } from './billboards.js';
import { RoomAudio } from './roomaudio.js';
import { buildCourt } from './court.js';
import { buildHouseLife } from './houselife.js';
import { poolLights } from './lightpool.js';
import { ChaseCam, headMotion } from './chasecam.js';
import { buildSea } from './water.js';
import { createPost } from './post.js';
import { loadScans } from './textures.js';
import { createSkids } from './skids.js';
import { createDevTools } from './devtools.js';
import { DriverInput, stickCurve } from './input.js';
import { improveWalker } from './walkfeel.js';
import { houseSeats, standSpot } from './seats.js';
import { sunPosition, sunEvents, momentHour, nearestMoment, MOMENTS, MOMENT_LABEL, fmtClock, blendKeys } from './skyclock.js';
improveWalker();
import './play.css';

// /play/ after "Get in the car" (entry.js runs the home tour first): GH-18 on a quiet coast. She starts
// in the Baleno at home; the coast road, her glass studio on the sand (her paintings, poems, photo
// album, books and music), a birthday tune on 11 November, and a recorded message when she reaches
// the studio.
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
const renderer = new THREE.WebGLRenderer({ antialias: LOW, powerPreference: 'high-performance', preserveDrawingBuffer: HEADLESS });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1.25 : 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.getElementById('play-app').appendChild(renderer.domElement);

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
// stars: how much of the night sky shows (0 = none, 1 = full night)
const MOON = { az: 318, el: 20 };            // over the open sea to the north-west, so its light lies on the water
const TIMES = {
  evening: { label: 'Evening', az: 258, el: 8, sun: 2.7, sunColor: 0xffc489, hemi: 0.4, hemiSky: 0xffe2c4, exposure: 0.74, turb: 4.2, ray: 2.7, env: 0.55, fog: 0xe9c9a3, lamps: 0, glow: 0, beams: false, stars: 0 },
  sunset: { label: 'Sunset', az: 268, el: 1.2, sun: 1.6, sunColor: 0xff9a52, hemi: 0.32, hemiSky: 0xffbf9a, exposure: 0.95, turb: 8, ray: 3.0, env: 0.42, fog: 0xe6a982, lamps: 0.6, glow: 0.4, beams: false, stars: 0 },
  dusk: { label: 'Dusk', az: 270, el: -3, sun: 0.0, sunColor: 0xff8a50, hemi: 0.42, hemiSky: 0x9a98c0, exposure: 1.05, turb: 9, ray: 3.2, env: 0.3, fog: 0x7d7287, lamps: 2.4, glow: 1, beams: true, stars: 0.42 },
  night: { label: 'Night', az: 252, el: -16, sun: 0.0, sunColor: 0x8899cc, hemi: 0.16, hemiSky: 0x34405e, exposure: 1.2, turb: 2, ray: 0.6, env: 0.1, fog: 0x0d121d, lamps: 3.2, glow: 1, beams: true, stars: 1, moon: { ...MOON, i: 0.34 } },
  day: { label: 'Day', az: 165, el: 55, sun: 3.0, sunColor: 0xfff5e8, hemi: 0.42, hemiSky: 0xdfe9ff, exposure: 0.62, turb: 2.2, ray: 2.2, env: 0.65, fog: 0xcfdde4, lamps: 0, glow: 0, beams: false, stars: 0, hdri: 'sky_day' },
};
const TIME_ORDER = MOMENTS;
// the light by the sun's height: the setting side uses the looks above; the rising side is cooler and
// misty at first (fogK < 1 thickens the haze)
TIMES.dawn = { ...TIMES.dusk, label: 'Dawn', sunColor: 0xff9a74, hemi: 0.4, hemiSky: 0x8e9ccc, exposure: 1.05, turb: 6, ray: 3.4, env: 0.28, fog: 0x99a1ba, lamps: 1.8, glow: 0.7, stars: 0.25, fogK: 0.55 };
TIMES.sunrise = { ...TIMES.sunset, label: 'Sunrise', sun: 1.4, sunColor: 0xffa77e, hemi: 0.36, hemiSky: 0xd9bccb, exposure: 0.95, turb: 6.5, ray: 3.2, env: 0.42, fog: 0xdcc6cc, lamps: 0, glow: 0.1, beams: false, fogK: 0.45 };
TIMES.morning = { ...TIMES.evening, label: 'Morning', sun: 2.6, sunColor: 0xffe6c8, hemi: 0.42, hemiSky: 0xdbe6f5, exposure: 0.68, turb: 3.4, ray: 2.0, env: 0.6, fog: 0xd5dfe8, fogK: 0.85 };
for (const t of Object.values(TIMES)) t.fogK ??= 1;
const SETTING = [[-16, 'night'], [-3, 'dusk'], [1.2, 'sunset'], [8, 'evening'], [55, 'day']].map(([el, k]) => ({ ...TIMES[k], el }));
const RISING = [[-16, 'night'], [-4, 'dawn'], [1.5, 'sunrise'], [14, 'morning'], [55, 'day']].map(([el, k]) => ({ ...TIMES[k], el }));
const PARAM_DATE = params.get('date') ? new Date(params.get('date') + 'T12:00:00') : new Date();

// ------------------------------------------------------------------ state
let lodTimer = 0;
const lodAt = new THREE.Vector3(1e9, 0, 0);
let billboards, roomAudio, court, houseLife, lightPool;
let wheelFx, cosy, clouds, spray, dressing, footprints, ambience, nearPalms = 0, palmTimer = 0;
const skyLight = { sunDir: new THREE.Vector3(0, 1, 0), sunCol: new THREE.Color(), amb: new THREE.Color(), haze: new THREE.Color(), moonDir: new THREE.Vector3(0, 1, 0), night: 0, cover: 0.42 };
const CLOUDS = params.has('clouds') ? Math.max(0, Math.min(1, +params.get('clouds'))) : null;   // ?clouds=0..1 fixes the cover
let M, beach, studio, collide, camBlock, car, sim, audio, music, walker, pack, head, walkData, sea, night, post, scans, skids, dev;
const skyHDR = {};
let seatSpots = [];                 // GH-18's sofas, chairs and beds, as things to interact with on foot                 // photographed skies, if fetched: { sky_day: { texture, background, phi, norm } }
const lampLights = [];
const state = {
  time: 'evening', cam: 'chase', beamsOverride: null, started: false, sound: true, driven: false, lying: null, overlay: false, engineOff: 0,
  mode: 'drive',         // 'foot' (walking, first person) or 'drive'
  explore: false,        // set when she gets in at the start: the studio's interactions wait for it
  birthday: false, msgPlayed: false,
  // the clock: hours (0..24), how many times faster than real time it runs (0 = stopped), the date
  clock: { h: 17.4, speed: HEADLESS ? 0 : 20, date: PARAM_DATE, boost: 0 },
};

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
  dressing = buildDressing({ low: LOW, time: beach.time });
  for (const o of dressing.objects) scene.add(o);
  footprints = createFootprints(scene);
  await fontsReady;                                  // (her name, the poems and the labels are drawn in the bundled type)
  studio = buildStudio(M, pack);
  scene.add(studio.group);
  cosy = buildCosy({ time: beach.time, anchors: studio.anchors });
  billboards = buildBillboards({ pack, studio: { x: STUDIO.x0 + STUDIO.w / 2, z: STUDIO.z0 + STUDIO.d / 2 } });
  scene.add(billboards.group);
  court = buildCourt();
  scene.add(court.group);
  houseLife = buildHouseLife({ house, rooms: ROOMS, pack });
  scene.add(houseLife.group);
  scene.add(cosy.group);
  const waterNormals = await new THREE.TextureLoader().loadAsync('play/textures/waternormals.jpg');
  sea = buildSea(renderer, { low: LOW, normals: waterNormals });
  scene.add(sea.mesh);
  night = buildNightSky();
  night.setMoon(MOON.az, MOON.el);
  scene.add(night.group);
  clouds = buildClouds();
  scene.add(clouds.mesh);
  spray = buildSpray({ low: LOW });
  scene.add(spray.points);
  if (!LOW) post = createPost(renderer, scene, camera, { low: LOW });
  scans = await loadScans();
  if (scans) applyScans();

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
  collide = new CollisionWorld([...beach.colliders, ...dressing.colliders, ...studio.carColliders, ...cosy.carColliders, ...billboards.carColliders, ...court.carColliders, ...houseItems, seaFence]);
  camBlock = new CollisionWorld([...studio.carColliders, ...houseItems]);

  // walking: the house's floors, stairs and walls, the studio's, and the ground of the coast
  walkData = {
    colliders: [...houseWalk, ...studio.walk.colliders, ...cosy.walk.colliders, ...court.walk.colliders],
    surfaces: [...data.surfaces, ...studio.walk.surfaces, ...cosy.walk.surfaces, ...court.walk.surfaces],
    stair: data.stair, levels: data.levels,
  };
  head = new THREE.PerspectiveCamera();          // the walker moves this "head"; her figure and the camera follow it
  walker = new FootWalker(head, renderer.domElement, walkData);
  walker.raised = [...studio.walk.surfaces, ...cosy.walk.surfaces, ...court.walk.surfaces];
  for (const c of walkData.colliders) c.bb = c.bb || bbOf(c.poly);
  // sitting and lying down in the house
  seatSpots = houseSeats(house).map((s) => {
    const base = walker.heights(s.centre[0] * 1000, s.centre[1] * 1000).reduce((a, b) => (Math.abs(b - s.ffl) < Math.abs(a - s.ffl) ? b : a), s.ffl);
    const r = Math.max(s.size[0], s.size[1]) / 2 + 1.1;
    return {
      kind: 'lounger', label: s.label, pos: [s.centre[0], base + 0.5, s.centre[1]], r,
      seat: { x: s.centre[0], z: s.centre[1], y: base, eye: [s.eye[0], base + s.eye[1], s.eye[2]], look: s.look, pitch: s.pitch, lie: s.lie,
        stand: [s.stand[0], s.stand[1], Math.atan2(s.look[0], s.look[1]), base], spot: s, flash: (s.lie ? 'Lie back' : 'Sit back') + ' · E to get up' },
    };
  });


  for (let i = 0; i < (LOW ? 4 : 6); i++) {
    const pl = new THREE.PointLight(0xffd29a, 0, 30, 2);
    scene.add(pl);
    lampLights.push(pl);
  }

  car = await loadBaleno('models/baleno.glb', CAR_ITEM.size[1] / 1000);
  scene.add(car.root);
  skids = createSkids(scene);
  wheelFx = createParticles(scene, { max: LOW ? 700 : 1600 });
  sim = new VehicleSim();
  sim.reset(HOME.x, HOME.z, HOME.yaw);
  driver = new DriverInput(sim.s);
  sim.aids = driver.aids; sim.aidsLabel = driver.aids.label;
  driver.onPadConnect = () => flash('Controller connected · RT gas · LT brake · RB handbrake · left stick steer · Y get out · View camera');
  dev = createDevTools({ sim, car, scene, state, onReplayStart: () => { if (state.mode !== 'drive') enterCar(); pose.copyFrom(sim); state.driven = true; skids.clear(); flash('Replaying the recording'); } });
  audio = new CarAudio();
  ambience = new Ambience(audio);
  footprints.onStep = () => ambience.footstep(groundUnderfoot());
  // her songs: her own files when the pack has them (played at the speakers of the room), else YouTube
  const files = (pack?.tracks || []).map((t) => ({ title: t.title, url: (pack.base || 'play/deepti/') + t.file }));
  music = new Music(pack?.music, document.getElementById('ytplayer'), files);
  roomAudio = new RoomAudio([...studio.audioZones, ...houseZones()]);
  music.onNeedAudio = () => { audio.start(); audio.setOn(state.sound); music.connect(audio.ctx, roomAudio, audio.master); };
  document.getElementById('music').classList.toggle('local', music.local);
  music.onChange = updateMusicUI;
  if (!pack || (!pack.music?.length && !files.length)) document.getElementById('music-btn').hidden = true;
  const b = pack?.birthday, today = new Date();
  state.birthday = params.has('birthday') || !!(b && today.getMonth() + 1 === b.month && today.getDate() === b.day);

  if (params.get('clock')) { state.clock.h = +params.get('clock'); applyClock(true); } else setTime(params.get('time') || 'evening');
  buildMap();
  bindUI();
  pose.copyFrom(sim);
  state.started = true;
  // she has just walked up to the car in the tour and got in (a key press or tap, so sound may start)
  placeHer(HOME.x - 1.45, HOME.z, 0);
  enterCar();
  document.getElementById('hud').hidden = false;
  document.getElementById('play-loading').hidden = true;
  lightPool = poolLights(scene, LOW ? 5 : 8);          // (all the point lights above, played by a fixed few)
  window.play.ready = true;
  const unlock = () => { audio.start(); audio.setOn(state.sound); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  frame(1 / 60);
  renderer.setAnimationLoop(HEADLESS ? null : loop);
}

// the tour's walker, on this coast: sand heights, no wading out to sea, and the parked car is solid
class FootWalker extends Walker {
  heights(x, y) {
    const out = super.heights(x, y);
    out[0] = groundHeight(x / 1000, y / 1000);
    // the studio's and the garden's built floors (plinth, deck, steps, boardwalk) stand on the sand: where one
    // is, the sand under it is not a floor, or she would stay on the sand and walk through them
    for (const s of this.raised || []) if (x >= s.bb[0] && x <= s.bb[2] && y >= s.bb[1] && y <= s.bb[3] && pointInPoly(x, y, s.poly)) { out.shift(); break; }
    return out;
  }
  place(x, y, foot, yaw = 0, pitch = 0) {
    super.place(x, y, foot, yaw, pitch);
    const hs = this.heights(x, y);                     // (the shared walker always counts the sand as a choice)
    if (!hs.includes(this.foot)) { this.foot = hs.reduce((a, b) => (Math.abs(b - foot) < Math.abs(a - foot) ? b : a)); this.camera.position.y = this.foot + 1.6; }
    this.eye = this.foot; this.mv = { x: 0, z: 0 };
  }
  // (a slimmer body than the tour's 250 mm: she fits through an 800 mm door without brushing the frame)
  blocked(x, y, foot) {
    const R = 210;
    for (const c of this.data.colliders) {
      if (c.y1 < foot + 0.2 || c.y0 > foot + 1.75) continue;
      const b = c.bb;
      if (x < b[0] - R || x > b[2] + R || y < b[1] - R || y > b[3] + R) continue;
      if (circleHitsPoly(x, y, R, c.poly)) return true;
    }
    if (coastDist(x / 1000, y / 1000) > 0.6) return true;
    if (state.mode === 'foot') {
      const c = sim.corners(sim.x, sim.z, -0.05).map(([a, b]) => [a * 1000, b * 1000]);
      if (foot < 1.2 && circleHitsPoly(x, y, 250, c)) return true;
    }
    return false;
  }
  // Walking, the way a game does it: she eases into a walk and out of it (no instant start and stop), and
  // when the way ahead is blocked she slides round it: the step is tried turned a little either way, up to
  // ~80°, before giving up, so a door frame or a table corner guides her past instead of catching her. The
  // eye follows steps and stairs through a spring, with a faint bob in time with her stride.
  update(dt) {
    if (this.classic) return super.update(dt);       // (the tour's own walking: kept for side-by-side tests)
    if (!this.active) return;
    const k = this.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + this.stick.y;
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.stick.x;
    const mag = Math.min(1, Math.hypot(fwd, side));
    const vmax = (k.ShiftLeft || k.ShiftRight ? 3.2 : 1.6) * mag;
    const dir = this._d ||= new THREE.Vector3();
    const ry = this.camera.rotation.y; dir.set(-Math.sin(ry), 0, -Math.cos(ry));      // (from her heading now, not last frame's matrix)
    let wx = 0, wz = 0;
    if (mag > 0.08) { const n = Math.hypot(fwd, side); wx = (dir.x * fwd - dir.z * side) / n * vmax; wz = (dir.z * fwd + dir.x * side) / n * vmax; }
    // door assist: heading roughly through a doorway close ahead, her path is drawn gently onto its centre line
    if (wx || wz) {
      const px = this.camera.position.x, pz = this.camera.position.z, sp0 = Math.hypot(wx, wz);
      for (const d of DOORWAYS) {
        if (Math.abs(d.y - this.foot) > 0.6) continue;
        const rx = px - d.x, rz = pz - d.z, dist = Math.hypot(rx, rz);
        if (dist > 1.8 || dist < 0.05) continue;
        const nx = -d.tz, nz = d.tx;                              // the wall's normal
        const along0 = rx * d.tx + rz * d.tz, off0 = rx * nx + rz * nz;
        const vin = (wx * nx + wz * nz) / sp0;                    // how squarely she's heading at the wall
        if (Math.abs(off0) < 0.05 || Math.sign(vin) === Math.sign(off0) || Math.abs(vin) < 0.5) continue;
        const tHit = -off0 / ((wx * nx + wz * nz) || 1e-6);      // where she'd cross the wall line
        const cross = along0 + (wx * d.tx + wz * d.tz) * tHit;
        const safe = d.half - 0.24;
        if (Math.abs(cross) <= safe || Math.abs(cross) > d.half + 0.45) continue;
        const pull = Math.min(1, (Math.abs(cross) - safe) / 0.3) * 0.9 * Math.min(1, 1.8 - dist);
        wx -= Math.sign(cross) * d.tx * pull * sp0; wz -= Math.sign(cross) * d.tz * pull * sp0;
        const k3 = sp0 / Math.hypot(wx, wz); wx *= k3; wz *= k3;
        break;
      }
    }
    const v = this.mv ||= { x: 0, z: 0 };
    const rate = mag > 0.08 ? 7 : 11;                          // speeding up, slowing down (1/s)
    v.x += (wx - v.x) * (1 - Math.exp(-rate * dt)); v.z += (wz - v.z) * (1 - Math.exp(-rate * dt));
    const sp = Math.hypot(v.x, v.z);
    const p = this.camera.position;
    if (sp < 0.03) { v.x = v.z = 0; }
    else {
      const x = p.x * 1000, y = p.z * 1000, sx = v.x * dt * 1000, sz = v.z * dt * 1000;
      const stuck = this.blocked(x, y, this.foot);           // (already overlapping something: let her step out of it)
      let moved = false;
      for (const a of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35]) {
        const c = Math.cos(a), s2 = Math.sin(a), f = Math.max(0.25, c);
        const nx = x + (sx * c - sz * s2) * f, ny = y + (sx * s2 + sz * c) * f;
        const h = this.standAt(nx, ny, this.foot);
        if (h === null || (!stuck && this.blocked(nx, ny, h))) continue;
        p.x = nx / 1000; p.z = ny / 1000; this.foot = h; moved = true;
        if (a) { const k2 = 0.35; v.x = v.x * (1 - k2) + ((nx - x) / 1000 / dt) * k2; v.z = v.z * (1 - k2) + ((ny - y) / 1000 / dt) * k2; }   // glide along it
        break;
      }
      if (!moved) { v.x *= 0.3; v.z *= 0.3; }
    }
    this.stride = (this.stride || 0) + sp * dt * 3.6;
    this.eye = this.eye == null || Math.abs(this.eye - this.foot) > 1.2 ? this.foot : this.eye + (this.foot - this.eye) * (1 - Math.exp(-14 * dt));
    p.y = this.eye + 1.6 + Math.sin(this.stride) * 0.016 * Math.min(1, sp / 1.6);
  }
}

// ------------------------------------------------------------------ the house's rooms: where she is, the floor plan
const ROOMS = house.floors.flatMap((f) => f.rooms.filter((r) => r.polygon && !['OTS', 'Lift'].includes(r.name)).map((r) => {
  const xs = r.polygon.map((q) => q[0]), ys = r.polygon.map((q) => q[1]);
  const at = r.label_at || [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  return { id: r.id, floor: f.id, ffl: house.levels[f.id].ffl / 1000, name: r.name, poly: r.polygon, at, finish: String(r.floor || '') };
}));
// the doorways (for door assist): centre, the wall's normal and along-vector, half-width, floor level
const DOORWAYS = house.floors.flatMap((f) => f.walls.filter((w) => w.a && w.b).flatMap((w) => {
  const [ax, ay] = w.a, [bx, by] = w.b, L = Math.hypot(bx - ax, by - ay);
  return (w.openings || []).filter((o) => /door|opening/.test(o.type) && o.type !== 'lift_door' && o.width >= 600).map((o) => {
    const t = (o.offset + o.width / 2) / L;
    return { x: (ax + (bx - ax) * t) / 1000, z: (ay + (by - ay) * t) / 1000, tx: (bx - ax) / L, tz: (by - ay) / L, half: o.width / 2000, y: house.levels[f.id].ffl / 1000 };
  });
}));
const FLOORS = ['GF', 'FF', 'SF'].map((id) => ({ id, ffl: house.levels[id].ffl / 1000, name: { GF: 'Ground floor', FF: 'First floor', SF: 'Second floor' }[id] }));
function houseFloor(foot) { return FLOORS.reduce((a, b) => (Math.abs(b.ffl - foot) < Math.abs(a.ffl - foot) ? b : a)); }
function roomAt(x, z, foot) {
  if (!inHouse(x, z) || foot < 0.3) return null;
  const fl = houseFloor(foot);
  return ROOMS.find((r) => r.floor === fl.id && pointInPoly(x * 1000, z * 1000, r.poly)) || { name: fl.name, floor: fl.id };
}
let roomNow = null;
function updateRoomChip() {
  if (state.rally) return;
  const r = state.mode === 'foot' ? roomAt(head.position.x, head.position.z, walker.foot) : null;
  const label = r ? (r.name === houseFloor(walker.foot).name ? r.name : `${r.name} · ${houseFloor(walker.foot).id}`) : null;
  if (label === roomNow) return;
  roomNow = label;
  const chip = document.getElementById('room-chip');
  chip.hidden = !label;
  if (label) { chip.querySelector('.val').textContent = label; chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
}
// the minimap indoors: the plan of the floor she is on, rooms named, her arrow; north up as outside
function drawPlan(g, S) {
  const fl = houseFloor(walker.foot), k = S / 14, px = head.position.x, pz = head.position.z;
  const tx = (x) => S / 2 - (x / 1000 - px) * k, ty = (y) => S / 2 - (y / 1000 - pz) * k;
  g.fillStyle = '#ece4d6'; g.fillRect(0, 0, S, S);
  const here = roomAt(px, pz, walker.foot);
  for (const r of ROOMS.filter((q) => q.floor === fl.id)) {
    g.beginPath(); r.poly.forEach(([x, y], i) => (i ? g.lineTo(tx(x), ty(y)) : g.moveTo(tx(x), ty(y)))); g.closePath();
    g.fillStyle = here && here.name === r.name ? '#f6d9a8' : '#fbf8f2'; g.fill();
    g.strokeStyle = '#5b4a3a'; g.lineWidth = 2; g.stroke();
  }
  // room names: the one she's in first, then the others that fit without overlapping
  g.font = '600 11px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const placed = [];
  const rooms = ROOMS.filter((q) => q.floor === fl.id).sort((a, b) => (here && b.name === here.name) - (here && a.name === here.name));
  for (const r of rooms) {
    const name = r.name.split(' (')[0].split(' + ')[0].replace('Guest Lounge / Study', 'Study'), x = tx(r.at[0]), y = ty(r.at[1]);
    const w = g.measureText(name).width + 6, box = [x - w / 2, y - 7, x + w / 2, y + 7];
    if (box[0] < 6 || box[2] > S - 6 || box[1] < 22 || box[3] > S - 32) continue;
    if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    g.fillStyle = here && r.name === here.name ? '#2e2216' : '#5a4a3a'; g.fillText(name, x, y);
  }
  g.font = '700 11px Inter, sans-serif';
  const fw = g.measureText(fl.name).width + 16;
  g.fillStyle = 'rgba(46,34,22,0.82)'; g.beginPath(); g.roundRect(S / 2 - fw / 2, S - 30, fw, 18, 9); g.fill();
  g.fillStyle = '#f6f1e8'; g.fillText(fl.name, S / 2, S - 21);
  g.textBaseline = 'alphabetic';
}

// ------------------------------------------------------------------ time of day
const waterAmb = new THREE.Color();
function applyTime(t, regen = true) {
  const dir = sunDir(t.az, t.el);
  for (const s of [sky, skyForEnv]) {
    const u = s.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.turbidity.value = t.turb;
    u.rayleigh.value = t.ray;
    u.mieCoefficient.value = 0.0042;
    u.mieDirectionalG.value = 0.82;
  }
  const photo = t.hdri && skyHDR[t.hdri];
  if (!regen) { /* keep the current reflections */ } else if (photo) {
    if (photo.norm == null) photo.norm = hdrNorm(photo);       // against the generated sky at this hour
    // a photographed sky: turned so its sun stands where ours is
    const a = THREE.MathUtils.degToRad(t.az), rotY = photo.phi - Math.atan2(Math.cos(a), -Math.sin(a));
    scene.environment = photo.texture;
    scene.environmentRotation.set(0, rotY, 0);
    scene.backgroundRotation.set(0, rotY, 0);
    scene.environmentIntensity = t.env * photo.norm;
    scene.background = null;                     // (the photo lights the scene; the sky you see is the live one)
  } else {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene);
    scene.environment = envRT.texture;
    scene.environmentRotation.set(0, 0, 0);
    scene.environmentIntensity = t.env;
    scene.background = null;
  }
  sun.userData.dir = t.moon ? sunDir(t.moon.az, t.moon.el) : dir;
  // the clouds' light: the real sun (still lighting them from below just after sunset), the sky, the haze
  skyLight.sunDir.copy(dir);
  skyLight.sunCol.set(t.sunColor).multiplyScalar((t.sun > 0.05 ? t.sun : 1.2) * 0.62);
  skyLight.amb.set(t.hemiSky).multiplyScalar(t.hemi * 1.5).add(new THREE.Color(t.fog).multiplyScalar(t.env * 0.35));
  skyLight.haze.set(t.fog).multiplyScalar(0.55 + t.env * 0.5);
  skyLight.moonDir.copy(sunDir(MOON.az, MOON.el));
  skyLight.night = t.stars ?? 0;
  skyLight.cover = CLOUDS ?? 0.36 + 0.12 * Math.sin((state.clock?.h ?? 12) * 0.9) + 0.06 * Math.sin((state.clock?.h ?? 12) * 2.3);
  sun.intensity = t.moon ? t.moon.i : t.sun;
  sun.color.set(t.moon ? 0x9fb3ff : t.sunColor);
  sun.castShadow = t.sun > 0.05 || !!t.moon;
  hemi.intensity = t.hemi;
  hemi.color.set(t.hemiSky);
  renderer.toneMappingExposure = t.exposure;
  scene.fog.color.set(t.fog);
  state.stars = t.stars ?? 0;
  state.sunEl = t.el;
  state.glow = t.glow ?? 0;
  scene.fog.near = (400 - 220 * state.stars) * t.fogK;   // more haze at night (far hills fade into the sky)
  scene.fog.far = (4200 - 1900 * state.stars) * t.fogK;  // and in the morning mist
  if (!regen) scene.environmentIntensity = t.env * (photo?.norm || 1);
  sky.visible = state.stars < 0.98;                      // at full night the star dome covers it
  for (const k of ['cove', 'downlight', 'lamp', 'window_lit']) if (M[k]) M[k].emissiveIntensity = t.glow * 1.2;
  beach.materials.lamp.emissiveIntensity = t.lamps;
  studio.setNight(t.glow > 0.3);
  billboards?.setNight(t.glow > 0.3);
  court?.setNight(t.glow > 0.3);
  if (DASH.mat) DASH.mat.emissiveIntensity = t.glow > 0.3 ? 0.9 : 0.12;     // the gauges and screen glow after dark
  for (const pl of lampLights) pl.intensity = t.lamps > 0.5 ? 18 : 0;
  // the sea's own light: the sky's colour on the water body
  waterAmb.copy(new THREE.Color(t.hemiSky)).multiplyScalar(t.hemi * 0.9).add(new THREE.Color(t.fog).multiplyScalar(t.env * 0.35));
  beach.caustics.value.copy(sun.color).multiplyScalar(sun.intensity * Math.max(0, sun.userData.dir.y) * 0.3);
  post?.setBloom(0.2 + state.stars * 0.25, 2.2 - state.stars * 1.2);
  if (regen) lampTimer = 0;
}
// photo-scanned textures (play/textures/, if fetched): the coast and the studio's surfaces
function applyScans() {
  const b = beach.materials, m = studio.mats;
  scans.apply(b.sand, 'sand', { normalScale: 0.8, tone: 0xf1ebdf, ao: 0.45 });     // white coral sand
  scans.apply(b.land, 'ground');
  scans.apply(b.pad, 'asphalt');
  scans.apply(m.deck, 'deck');
  scans.apply(m.floor, 'floor_oak', { normalScale: 0.6 });
  scans.apply(m.wood, 'oak', { normalScale: 0.5 });
  scans.apply(m.ply, 'plywood', { normalScale: 0.4 });
  scans.apply(m.plaster, 'plaster', { normalScale: 0.6, relief: true, ao: 0.3 });   // clean white walls, real trowel texture
  scans.apply(m.plinth, 'plaster', { relief: true, ao: 0.4 });
  scans.apply(m.fabric, 'linen', { repeat: 4, normalScale: 0.7 });
  for (const f of studio.frameMats()) scans.apply(f, 'dark_wood', { repeat: 2 });
  scans.sky('sky_day', renderer).then((h) => {
    if (!h) return;
    skyHDR.sky_day = { ...h, norm: null };
    applyClock(true);
  });
}
// how bright a photographed sky is next to the generated one: compare the average light from the
// upper half of each, so switching to the photo doesn't change the exposure
function hdrNorm(h) {
  const proc = skyRadiance(skyScene), photo = h.meanUp;
  return photo > 0 ? Math.max(0.3, Math.min(3, proc / photo)) : 1;
}
const cubeRT = new THREE.WebGLCubeRenderTarget(16, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.1, 5000, cubeRT);
function skyRadiance(sc) {
  cubeCam.update(renderer, sc);
  const buf = new Uint16Array(16 * 16 * 4);
  let sum = 0, n = 0;
  for (const face of [0, 1, 2, 4, 5]) {                  // all but straight down
    renderer.readRenderTargetPixels(cubeRT, 0, 0, 16, 16, buf, face);
    for (let i = 0; i < 256; i++) {
      const y = i >> 4;
      if (face !== 2 && y < 8) continue;                  // the sides' upper halves (rows run bottom-up)
      const L = THREE.DataUtils.fromHalfFloat(buf[i * 4]) * 0.2 + THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]) * 0.7 + THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]) * 0.1;
      sum += Math.min(L, 8); n++;
    }
  }
  return sum / Math.max(1, n);
}

// jump the clock to a named moment of the day (sunrise, morning, day, evening, sunset, dusk, night)
function setTime(name) {
  if (!MOMENTS.includes(name)) name = 'evening';
  state.clock.h = momentHour(name, state.clock.date);
  state.clock.boost = 0;
  applyClock(true);
}
// the look of the sky and light for the clock's time
function clockLook() {
  const { az, el } = sunPosition(state.clock.date, state.clock.h);
  const rising = state.clock.h < sunEvents(state.clock.date).noon;
  const t = blendKeys(rising ? RISING : SETTING, el, lerpTime);
  t.az = az; t.el = el;
  return t;
}
let lastEnvEl = null, envAge = 0, lastBeams = null, labelTimer = 0;
function applyClock(force = false) {
  const t = clockLook();
  const regen = force || lastEnvEl == null || Math.abs(t.el - lastEnvEl) > 0.4 || envAge > 4;
  if (regen) { lastEnvEl = t.el; envAge = 0; }
  applyTime(t, regen);
  state.time = nearestMoment(state.clock.h, state.clock.date);
  if (lastBeams !== t.beams) { lastBeams = t.beams; setBeams(state.beamsOverride ?? t.beams); }
  if (force) setBeams(state.beamsOverride ?? t.beams);
  setVal('time', `${MOMENT_LABEL[state.time]} ${fmtClock(state.clock.h)}`);
}
// once a frame: the clock runs, and the light follows it (cheaply; the sky's reflections are
// recomputed when the sun has moved enough)
function tickClock(dt) {
  const c = state.clock, speed = c.boost || c.speed;
  envAge += dt; labelTimer -= dt;
  if (!speed) return;
  c.h = (c.h + (dt * speed) / 3600 + 24) % 24;     // speed: how many times faster than real time
  // a boosted clock (watching the sunset from the lounger) runs on until it's dark
  if (c.boost && sunPosition(c.date, c.h).el < -6) c.boost = 0;
  if (labelTimer <= 0 || c.boost) { labelTimer = 0.25; applyClock(); }
}
const SPEEDS = [0, 1, 5, 20, 60, 180, 600];
function clockSpeed(dir) {
  const c = state.clock, i = SPEEDS.indexOf(c.speed);
  c.speed = dir === 0 ? (c.speed ? 0 : 20) : SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + dir))];
  flash(c.speed ? `Time: ${c.speed === 1 ? 'real time' : `${c.speed}× (a day in ${Math.round(1440 / c.speed)} min)`}` : 'Time stopped');
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
  if (!car) return;                    // (the sky can be ready before the car has loaded)
  for (const b of car.beams) b.intensity = on ? 220 : 0;
  car.mats.head.emissiveIntensity = on ? 2.2 : 0;
  document.querySelector('[data-act="lights"]')?.classList.toggle('on', on);
  setVal('lights', on ? 'On' : 'Off');
}

// ------------------------------------------------------------------ input
const keys = {};
const touchKeys = {};
const look = { yaw: 0, pitch: 0, zoom: 1, last: -10 };
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false };
let driver;                      // input.js: keyboard / gamepad / touch shaping and the driving-aid level

function readInput(dt) {
  return driver.read(dt, keys, touchKeys, sim.speed);
}
// gamepad buttons, the right stick, the horn and rumble (once a frame)
let padHorn = false;
function padExtras(dt) {
  for (const ev of driver.events || []) ({ foot: toggleFoot, camera: cycleCam, lights: toggleBeams, time: cycleTime, music: playMusicHere })[ev]?.();
  if (driver.horn !== padHorn) { padHorn = driver.horn; horn(padHorn); }
  const lx = driver.padLook.x, ly = driver.padLook.y;
  if (state.mode === 'foot') {
    orb.yaw -= lx * dt * 2.4;
    orb.pitch = Math.max(-1.2, Math.min(1.2, orb.pitch + ly * dt * 1.6));
  } else if (lx || ly) {
    look.yaw -= lx * dt * 2.6;
    look.pitch = Math.max(-0.35, Math.min(0.9, look.pitch + ly * dt * 1.4));
    look.last = performance.now() / 1000;
  }
  if (state.mode === 'drive') driver.rumble(dt, sim);
}
function cycleAids() {
  const a = driver.cycleLevel();
  sim.aids = a; sim.aidsLabel = a.label;
  setVal('aids', a.label);
  flash({ assisted: 'Driving aids: Assisted (stability, counter-steer, traction, ABS)', sport: 'Driving aids: Sport (light stability and counter-steer)', off: 'Driving aids: off (wheelspin, locking brakes, no catching)' }[driver.level]);
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
    // driving dev tools: F3 overlay, F4 record / stop (saves a file), F6 replay the last recording
    if (e.code === 'F3') { e.preventDefault(); dev.toggleOverlay(); return; }
    if (e.code === 'F4') { e.preventDefault(); const r = dev.toggleRecord(); flash(r ? `Saved the recording (${(r.steps / 240).toFixed(1)} s)` : 'Recording your driving · F4 to stop'); return; }
    if (e.code === 'F6') { e.preventDefault(); if (!dev.replayLast()) flash('No recording yet (F4 to record, or drop a file here)'); return; }
    if (state.rally && (e.code === 'Space' || e.code === 'Escape')) { e.preventDefault(); if (e.code === 'Space') court.game.swing(); else stopRally(); return; }
    if (e.code === 'BracketRight' || e.code === 'BracketLeft' || e.code === 'Backslash') { clockSpeed(e.code === 'BracketRight' ? 1 : e.code === 'BracketLeft' ? -1 : 0); return; }
    const act = { KeyK: cycleAids, KeyC: cycleCam, KeyL: toggleBeams, KeyT: cycleTime, KeyR: goHome, KeyM: toggleSound, KeyF: toggleFoot, KeyE: interact, KeyP: playMusicHere, KeyO: cycleMusicZone, KeyN: () => music.next(), KeyG: goStudio }[e.code];
    if (act) act();
    if (e.code === 'KeyH' && state.explore) horn(true);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  renderer.domElement.addEventListener('pointerdown', () => { if (state.rally) court.game.swing(); });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyH') horn(false); });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; horn(false); });
  // the menu: ☰ (or Tab) opens it; a click outside or Escape closes it
  const menu = document.getElementById('hud-menu'), menuBtn = document.getElementById('hud-menu-btn');
  const openMenu = (on) => { menu.hidden = !on; menuBtn.setAttribute('aria-expanded', String(on)); menuBtn.classList.toggle('on', on); };
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(menu.hidden); });
  window.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#hud-menu, #hud-menu-btn')) openMenu(false); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' && state.started) { e.preventDefault(); openMenu(menu.hidden); }
    if (e.code === 'Escape' && !menu.hidden) openMenu(false);
  });
  for (const b of document.querySelectorAll('#hud [data-act]')) {
    const act = b.dataset.act;
    if (act === 'horn') {
      b.addEventListener('pointerdown', () => horn(true));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => horn(false));
    } else {
      b.addEventListener('click', () => ({ goto: showGoTo, musiczone: cycleMusicZone, aids: cycleAids, cam: cycleCam, lights: toggleBeams, time: cycleTime, home: goHome, studio: goStudio, foot: toggleFoot, sound: toggleSound, music: toggleMusicPanel, tour: () => location.reload() })[act]());
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
    if (state.mode === 'foot') {                 // look around
      orb.yaw -= dx * 0.005;
      orb.pitch = Math.max(-1.2, Math.min(1.2, orb.pitch - dy * 0.004));
      return;
    }
    look.yaw -= dx * 0.006;
    look.pitch = Math.max(-0.35, Math.min(0.9, look.pitch + dy * 0.004));
    look.last = performance.now() / 1000;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => {
    if (state.mode !== 'foot') look.zoom = Math.max(0.55, Math.min(2.2, look.zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post?.setSize(window.innerWidth, window.innerHeight);
  });
  document.body.classList.toggle('touch', TOUCH);
}

const CAMS = ['chase', 'driver', 'hood', 'high'];
const chase = new ChaseCam(), head2 = {};
const lookingBack = () => !!keys.KeyB || !!driver?.lookBack;
const CAM_LABEL = { chase: 'Chase', driver: "Driver's seat", hood: 'Bonnet', high: 'High' };
function cycleCam() { if (state.mode !== 'drive') return; state.cam = CAMS[(CAMS.indexOf(state.cam) + 1) % CAMS.length]; setVal('cam', CAM_LABEL[state.cam]); look.yaw = 0; look.pitch = 0; state.driven = true; placeCamera(true, 1 / 60); }
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
  setVal('sound', state.sound ? 'On' : 'Off');
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
  // at home the opening shot from the street frames the car (and the birthday wish) as she pulls out
  state.cam = 'chase'; state.driven = Math.hypot(sim.x - HOME.x, sim.z - HOME.z) > 3.8; look.yaw = 0; look.pitch = 0;
  audio.start(); audio.door();
  if (!state.explore) startExplore();
  updateModeUI();
  placeCamera(true, 1 / 60);
}
// she gets in (from the tour): the drive opens up, and on her birthday a tune plays
function startExplore() {
  state.explore = true;
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
  orb.yaw = yaw; orb.pitch = 0;
}
function updateModeUI() {
  const foot = state.mode === 'foot';
  document.body.classList.toggle('on-foot', foot);
  setVal('foot', 'Get out');
  document.getElementById('foot-btn').hidden = foot;          // (on foot, the prompt by the car offers to get in)
  document.querySelector('[data-act="cam"]').disabled = foot;
}
// a control's current value, in the menu (and the time chip): Camera · Chase, Sound · On
function setVal(act, text) { for (const el of document.querySelectorAll(`[data-act="${act}"] .val`)) el.textContent = text; }
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
  for (const it of state.explore ? [...studio.interact, ...cosy.interact, ...court.interact, ...houseLife.interact, ...seatSpots] : seatSpots) {
    const dx = it.pos[0] - hx, dz = it.pos[2] - hz, d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.pos[1] - hy) > 1.8) continue;
    const facing = (dx * fwdV.x + dz * fwdV.z) / (d || 1);
    if (facing < 0.55) continue;
    if (it.normal && dx * it.normal[0] + dz * it.normal[1] > 0) continue;     // the front of the painting, not its back
    const sc = d + (it.kind === 'lounger' ? 0.6 : 0);               // (a thing to use beats a seat beside it)
    if (sc < bestD) { best = it; bestD = sc; }
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
  if (it.kind === 'radio' || it.kind === 'musicpanel') return musicPanel(it.zone);
  if (it.kind === 'rally') return state.rally ? stopRally() : startRally();
  if (it.kind === 'diya') { houseLife.lightDiya(audio?.ctx, audio?.master); flash('The diya is lit'); return; }
  if (it.kind === 'chai') { houseLife.makeChai(); flash('Putting the chai on…'); return; }
  if (it.kind === 'lift') return showLift(it.floor);
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
  const line = (ln) => (/^\*.*\*$/.test(ln.trim()) ? `<em>${esc(ln.trim().slice(1, -1))}</em>` : esc(ln));
  const body = p.stanzas.map((st) => `<p>${st.map(line).join('<br>')}</p>`).join('');
  const hi = DEVANAGARI.test(p.title + p.stanzas.flat().join(''));
  showOverlay(`<button class="close" aria-label="Close">×</button><article class="poem${hi ? ' hi' : ''}" lang="${hi ? 'hi' : 'en'}"><h2>${esc(p.title)}</h2><i class="rule" aria-hidden="true"></i>${p.date ? `<time>${esc(p.date)}</time>` : ''}${body}<footer>— ${esc(p.author || 'Deepti')}</footer></article>`, 'paper');
}
function showArt(url) {
  showOverlay(`<button class="close" aria-label="Close">×</button><figure class="art"><img src="${url}" alt="A painting by Deepti"><figcaption>Painted by Deepti</figcaption></figure>`, 'dark');
}
let prevSeatPos = null;
function lieDown(seat) {
  prevSeatPos = [head.position.x, head.position.z];
  if (seat.rocker) studio.rocker.seated = true;
  walker.active = false;
  if (seat.eye) {
    // the reading nook: curled up in the ring, looking out across the studio
    state.lying = { seat, eye: new THREE.Vector3(...seat.eye) };
    orb.yaw = Math.atan2(seat.look[0], seat.look[1]); orb.pitch = seat.pitch != null ? (seat.lie ? -seat.pitch : seat.pitch) : 0.05;
    flash(seat.flash || 'Curl up and read · E to get up');
    return;
  }
  // a lounger: lying back, head turned to the sunset over the sea
  state.lying = { seat, eye: new THREE.Vector3(seat.x, seat.y + 0.42, seat.z - 0.55) };
  const az = THREE.MathUtils.degToRad(sunPosition(state.clock.date, sunEvents(state.clock.date).set).az);   // where the sun actually sets today
  orb.yaw = Math.atan2(-Math.sin(az), Math.cos(az)); orb.pitch = -0.06;
  // the sunset plays out: if it's daytime, the clock moves to golden hour, then runs fast until dark
  const c = state.clock, ev = sunEvents(c.date);
  if (c.h > ev.rise && c.h < ev.set + 0.2) {
    if (c.h < momentHour('evening', c.date)) { c.h = momentHour('evening', c.date); applyClock(true); }
    c.boost = 90;                                // ~40 s from golden hour to dusk
  }
  flash('Watch the sun go down · E to get up');
}
// what's underfoot (for the footsteps), and whether she's indoors (outside sounds quieter)
function inHouse(x, z) { return x > 0 && x < 9.4 && z > 0 && z < 22.3; }
function inStudio(x, z) { return x > STUDIO.x0 - 1 && x < STUDIO.x0 + STUDIO.w + 1 && z > STUDIO.z0 - 1.2 && z < STUDIO.z0 + STUDIO.d + 2.6; }
function groundUnderfoot() {
  const x = head.position.x, z = head.position.z, f = walker.foot;
  if (inHouse(x, z) && f > 0.3) { const r = roomAt(x, z, f); return /wood|oak|laminate|deck/i.test(r?.finish || '') ? 'wood' : 'tile'; }
  if (inStudio(x, z) && f > 0.4) return 'wood';
  if (f > 0.08 && f < 0.2) return 'wood';                     // the boardwalk
  const surf = surfaceAt(x, z);
  if (surf === 'road') return 'road';
  if (surf === 'sand' || surf === 'water') return coastDist(x, z) > -5.5 ? 'wet' : 'sand';
  return 'sand';
}
function isIndoors() {
  if (state.mode !== 'foot') return false;
  const x = head.position.x, z = head.position.z;
  const onTerrace = x > studio.terraceX && walker.foot > studio.upper - 0.2;     // (the roof terrace is outdoors)
  return (inHouse(x, z) && walker.foot > 0.3) || (x > STUDIO.x0 && x < STUDIO.x0 + STUDIO.w && z > STUDIO.z0 && z < STUDIO.z0 + STUDIO.d && walker.foot > 0.4 && !onTerrace);
}
function getUp() {
  if (!state.lying) return;
  const { seat } = state.lying;
  state.lying = null;
  if (seat.rocker) studio.rocker.seated = false;
  if (seat.stand) {
    // in the house: in front of it if that's clear (a coffee table is often there), else where she was
    const base = seat.stand[3];
    const free = (x, z) => { const h = walker.standAt(x * 1000, z * 1000, base); return h !== null && Math.abs(h - base) < 0.3 && !walker.blocked(x * 1000, z * 1000, h); };
    // (seats outside the house have no seat-list entry: a stand-up point and the seat itself are enough)
    const spot = seat.spot || { stand: seat.stand, centre: [seat.x, seat.z], look: seat.look || [Math.sin(seat.stand[2]), Math.cos(seat.stand[2])], size: [1, 1] };
    const [sx, sz] = standSpot(spot, prevSeatPos, free);
    placeHer(sx, sz, seat.stand[2], base);
  }
  else if (seat.eye) placeHer(seat.x + 1.1, seat.z, Math.PI / 2, 0.6);
  else placeHer(seat.x - 0.95, seat.z, 0, (seat.y ?? 1.22) - 0.62);   // beside the lounger, facing the sea (on its floor: the deck or the roof terrace)
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


// ------------------------------------------------------------------ on foot: through her own eyes
const orb = { yaw: Math.PI, pitch: 0 };      // where she looks: yaw (0 = north / +Z), pitch (+ = down)
function bbOf(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
function updateFoot(dt) {
  // the walker moves her "head" the way she looks
  head.rotation.set(0, orb.yaw + Math.PI, 0, 'YXZ');
  if (state.lying || state.overlay) return;
  const pad = driver.pad;                      // left stick walks, as well as the on-screen buttons
  walker.stick.y = (touchKeys.gas ? 1 : 0) - (touchKeys.brake ? 1 : 0) + (pad ? -stickCurve(pad.axes[1] || 0) : 0);
  walker.stick.x = pad ? stickCurve(pad.axes[0] || 0) : 0;
  const turn = (touchKeys.left ? 1 : 0) - (touchKeys.right ? 1 : 0);
  if (turn) orb.yaw += turn * 1.6 * dt;
  walker.update(dt);
  footprints.step(head.position.x, head.position.z, orb.yaw, surfaceAt(head.position.x, head.position.z) === 'sand');
}
function placeFootCamera(dt) {
  camera.near = 0.05;
  let e = state.lying ? state.lying.eye : tmpV.set(head.position.x, head.position.y - 0.05, head.position.z);    // (smoothed on stairs)
  if (state.lying?.seat.sway) e = tmpV.copy(state.lying.eye).add(new THREE.Vector3(0, Math.sin(clock * 0.9) * 0.02, Math.sin(clock * 0.9) * 0.07));   // the hammock rocks
  let rockPitch = 0;
  if (state.lying?.seat.rocker) {                                   // rocking: the head swings back and forth with the chair
    const a = studio.rocker.angle, lk = state.lying.seat.look;
    e = tmpV.copy(state.lying.eye).add(new THREE.Vector3(lk[0] * Math.sin(a) * 0.55, -(1 - Math.cos(a)) * 0.5, lk[1] * Math.sin(a) * 0.55));
    rockPitch = a * 0.8;
  }
  camera.position.copy(e);
  camera.rotation.set(-orb.pitch - rockPitch, orb.yaw + Math.PI, 0, 'YXZ');
  camera.fov = damp(camera.fov, 70, 6, dt);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ music UI
// music: P plays (or pauses) in the room she's in; O switches between this room and everywhere; the panels in
// the studio (and the record player) play their own room
function zoneHere() { return state.mode === 'foot' ? roomAudio.zoneAt(head.position.x, head.position.z, walker.foot) : null; }
function playMusicHere() {
  if (music.playing) { music.pause(); return; }
  const z = zoneHere();
  roomAudio.here = z; if (!z && roomAudio.mode === 'here' && state.mode === 'foot') roomAudio.mode = 'all';
  if (!music.local) toggleMusicPanel(true);
  music.play(); updateMusicUI();
}
function musicPanel(zoneId) {
  const z = roomAudio.zones.find((q) => q.id === zoneId);
  if (music.playing && roomAudio.mode === 'here' && roomAudio.here === z) { music.pause(); flash('Music off'); return; }
  roomAudio.here = z; roomAudio.mode = 'here';
  if (!music.local) toggleMusicPanel(true);
  if (!music.playing) music.play();
  flash(`Music · ${z.name}`); updateMusicUI();
}
function cycleMusicZone() {
  roomAudio.mode = roomAudio.mode === 'all' ? 'here' : 'all';
  if (roomAudio.mode === 'here') roomAudio.here = zoneHere() || roomAudio.here;
  flash(roomAudio.mode === 'all' ? 'Music everywhere' : `Music in this room${roomAudio.here ? ' · ' + roomAudio.here.name : ''}`);
  updateMusicUI();
}
// the lift: choose a floor; the doors, a hum, a chime, and she steps out there
const FLOOR_NAME = { GF: 'Ground', FF: 'First', SF: 'Second' };
function showLift(from) {
  const btns = ['SF', 'FF', 'GF'].map((f) => `<button data-f="${f}"${f === from ? ' class="here"' : ''}>${{ GF: 'G', FF: '1', SF: '2' }[f]}<small>${FLOOR_NAME[f]}</small></button>`).join('');
  showOverlay(`<button class="close" aria-label="Close">×</button><div class="lift"><h3>Lift</h3><div class="pad">${btns}</div></div>`, 'paper');
  for (const b of document.querySelectorAll('#overlay .lift button')) b.addEventListener('click', () => rideLift(from, b.dataset.f));
}
function rideLift(from, to) {
  closeOverlay();
  const d = houseLife.liftDoors.find((q) => q.floor === to);
  if (!d || from === to) return;
  const veil = document.getElementById('veil') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'veil' });
  veil.classList.add('on');
  setTimeout(() => {
    placeHer(d.x + d.nx * 0.9, d.z + d.nz * 0.9, Math.atan2(d.nx, d.nz), d.y);
    houseLife.chime(audio?.ctx, audio?.master);
    veil.classList.remove('on'); flash(`${FLOOR_NAME[to]} floor`);
  }, 1600);
}
// go to: any room of the house, the studio, the court
function showGoTo() {
  const fl = ['GF', 'FF', 'SF'].map((f) => `<section><h4>${FLOORS.find((q) => q.id === f).name}</h4>${ROOMS.filter((r) => r.floor === f && !/Toilet|Washroom|Store|Storage|Utility|Lobby/.test(r.name)).map((r) => `<button data-room="${esc(r.id || r.name)}">${esc(r.name)}</button>`).join('')}</section>`).join('');
  showOverlay(`<button class="close" aria-label="Close">×</button><div class="goto"><h3>Go to</h3>${fl}<section><h4>Outside</h4><button data-place="studio">Deepti's Studio</button><button data-place="court">The court</button><button data-place="home">The gate</button></section></div>`, 'paper');
  for (const b of document.querySelectorAll('#overlay .goto button')) b.addEventListener('click', () => {
    closeOverlay();
    if (state.mode === 'drive') { exitCar(); if (state.mode === 'drive') return; }
    getUp();
    if (b.dataset.place === 'studio') return placeHer(studio.entry.x, studio.entry.z, 0, 0.12);
    if (b.dataset.place === 'court') return placeHer(124.6, 39.6, Math.PI / 2, court.Y);
    if (b.dataset.place === 'home') return placeHer(4.6, 23.6, Math.PI);
    const r = ROOMS.find((q) => (q.id || q.name) === b.dataset.room);
    if (r) { placeHer(r.at[0] / 1000, r.at[1] / 1000, 0, r.ffl); flash(r.name); }
  });
}

// the badminton rally: E at the court's bench; Space or a click swings; Esc (or walking off the court) stops
function startRally() {
  state.rally = true; court.game.start();
  flash('Rally · Space or click to swing · look up to lob · Esc to stop');
}
function stopRally() {
  state.rally = false; court.game.stop(); roomNow = null; updateRoomChip();
}
function rallyTick(dt) {
  const ev = court.game.update(dt, head.position, orb.yaw, orb.pitch);
  for (const e of ev) {
    if (e === 'hit') thwack();
    if (e.startsWith('end:')) {
      const n = court.game.count, why = e.slice(4);
      flash({ net: 'Into the net', missed: 'Missed it', out: 'Out', out_theirs: 'Theirs went out', winner: 'A winner!' }[why] + ` · rally ${n}`);
    }
  }
  const chip = document.getElementById('room-chip');
  chip.hidden = false; chip.querySelector('.val').textContent = `Rally ${court.game.count} · Best ${court.game.best}`; roomNow = '__rally';
  if (Math.hypot(head.position.x - 131, head.position.z - 41.7) > 12 || state.mode !== 'foot') stopRally();
}
function thwack() {
  const ctx = audio?.ctx; if (!ctx || !state.sound) return;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
  const src = ctx.createBufferSource(); src.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.4;
  const g = ctx.createGain(); g.gain.value = 0.5;
  src.connect(f).connect(g).connect(audio.master); src.start();
}

// the house's rooms as music zones: a ceiling speaker in each
function houseZones() {
  const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.014, 24), mat = new THREE.MeshStandardMaterial({ color: 0xece9e3, roughness: 0.6 });
  const zones = ROOMS.filter((r) => r.floor !== 'SF' || !/Terrace/.test(r.name)).map((r) => ({
    id: 'h-' + r.floor + '-' + r.name, name: r.name, group: 'house', floor: { GF: 0, FF: 1, SF: 2 }[r.floor],
    speakers: [[r.at[0] / 1000, r.ffl + 2.9, r.at[1] / 1000]],
    contains: (x, z, f) => Math.abs(f - r.ffl) < 1.2 && pointInPoly(x * 1000, z * 1000, r.poly),
  }));
  const im = new THREE.InstancedMesh(geo, mat, zones.length), m = new THREE.Matrix4();
  zones.forEach((zn, i) => { const [x, y, z] = zn.speakers[0]; im.setMatrixAt(i, m.makeTranslation(x, y + 0.08, z)); });
  im.name = 'house_speakers'; scene.add(im);
  return zones;
}
function toggleMusicPanel(force) {
  const p = document.getElementById('music');
  const open = typeof force === 'boolean' ? force : p.hidden;
  p.hidden = !open;
  if (open) music.load();
  else if (!music.local) music.pause();               // YouTube asks for the player to be visible while it plays
}
function updateMusicUI() {
  document.getElementById('m-title').textContent = music.error || music.title || 'Her songs';
  document.getElementById('m-play').textContent = music.playing ? '❚❚' : '▶';
  document.getElementById('music-btn').classList.toggle('on', music.playing);
  setVal('music', music.playing ? 'Playing' : '');
  setVal('musiczone', roomAudio?.mode === 'all' ? 'Everywhere' : roomAudio?.here ? roomAudio.here.name : 'This room');
}

// ------------------------------------------------------------------ car visuals (drawn between physics steps)
const pose = {
  x: 0, z: 0, yaw: 0, steer: 0, spin: 0, roll: 0, pitch: 0,
  copyFrom(s) { this.x = s.x; this.z = s.z; this.yaw = s.yaw; this.steer = s.steer; this.spin = s.wheelSpin; this.roll = s.roll; this.pitch = s.pitch; },
  blend(s, a) {
    this.x = s.px + (s.x - s.px) * a; this.z = s.pz + (s.z - s.pz) * a;
    let dy = s.yaw - s.pyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = s.pyaw + dy * a;
    this.steer = s.psteer + (s.steer - s.psteer) * a;
    this.spin = s.pspin + (s.wheelSpin - s.pspin) * a;
    this.roll = s.roll; this.pitch = s.pitch;
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
  const tp = -Math.atan2(front - rear, car.wheelbase);           // the ground's slope; roll and pitch from the
  const tr = Math.atan2(left - right, car.track);                 // springs come from the simulation
  const K = sim.s.bodySpring, C = sim.s.bodyDamp;
  body.vp += ((tp - body.pitch) * K - body.vp * C) * dt; body.pitch += body.vp * dt;
  body.vr += ((tr - body.roll) * K - body.vr * C) * dt; body.roll += body.vr * dt;
  car.root.position.set(pose.x, gy, pose.z);
  car.root.rotation.y = pose.yaw;
  car.body.rotation.set(body.pitch + pose.pitch, 0, body.roll + pose.roll);
  for (const w of car.wheels) {
    w.steer.rotation.y = w.front ? pose.steer : 0;
    w.spin.rotation.x = pose.spin * (sim.s.wheelRadius / w.radius);
    w.axle.position.y = w.rest.y + (H[w.q] - gy);
  }
  if (car.steering) car.steering.rotation.z = pose.steer * 13.5;          // ~14:1 steering ratio
  // skid marks behind sliding tyres (rubber on the road, grooves in the sand)
  const onSand = sim.surface === 'sand' || sim.surface === 'ground';
  for (const w of car.wheels) {
    const sl = w.front ? sim.slipF : sim.slipR;
    const k = onSand ? (Math.abs(sim.speed) > 0.8 ? 0.3 + sl * 0.4 : 0) : sl - 0.45;       // tracks in sand always
    const wx = pose.x - rx * w.rest.x + fx * w.rest.z, wz = pose.z - rz * w.rest.x + fz * w.rest.z;
    if (sim.surface === 'water') skids.lift(w.q);
    else skids.add(w.q, wx, H[w.q], wz, k * 1.6, onSand);
  }
  skids.update();
  // smoke from sliding tyres on tarmac; sand, dust and water thrown up off the road
  const spd = Math.abs(sim.speed), t0 = clock;
  if (t0 !== fxClock && (fxClock = t0) >= 0) for (const w of car.wheels) {          // (once per tick of the clock: not while a test settles the view)
    const sl = w.front ? sim.slipF : sim.slipR, key = 'w' + w.q;
    const wx = pose.x - rx * w.rest.x + fx * w.rest.z, wz = pose.z - rz * w.rest.x + fz * w.rest.z, wy = H[w.q] + 0.12;
    const back = -Math.sign(sim.speed || 1);
    if (sim.surface === 'road' && sl > 0.5 && spd > 2) wheelFx.emit(key, 'smoke', (sl - 0.45) * 140, dt, t0, wx, wy, wz, sim.vx * 0.25, 0.5, sim.vz * 0.25, 0.9, 0.55);
    else if ((sim.surface === 'sand' || sim.surface === 'ground') && spd > 2.5) {
      const kick = Math.min(1, spd / 12) * ((w.front ? 1 : 0.5) + sl);
      wheelFx.emit(key, 'sand', 110 * kick, dt, t0, wx, wy - 0.05, wz, fx * back * spd * 0.22, 1.6 + spd * 0.06, fz * back * spd * 0.22, 1.2, 0.2);
      wheelFx.emit(key + 'd', 'dust', 14 * kick * (sim.surface === 'ground' ? 1.4 : 1), dt, t0, wx, wy, wz, sim.vx * 0.1, 0.3, sim.vz * 0.1, 0.8, 0.55);
    } else if (sim.surface === 'water' && spd > 1.5) {
      wheelFx.emit(key, 'water', Math.min(80, spd * 6), dt, t0, wx, wy - 0.05, wz, (w.left ? 1 : -1) * rx * -1.2 + sim.vx * 0.3, 1.6 + spd * 0.05, (w.left ? 1 : -1) * rz * -1.2 + sim.vz * 0.3, 1.0, 0.07);
    }
  }
  const inp = state.mode === 'drive' ? lastInput : NO_INPUT;
  const braking = (sim.speed > 0.3 && inp.brake > 0) || (sim.speed < -0.3 && inp.throttle > 0) || inp.handbrake;
  car.mats.tail.emissiveIntensity = (state.beams ? 0.7 : 0) + (braking ? 2.6 : 0);
  car.mats.reverse.emissiveIntensity = sim.reversing && sim.speed < -0.1 ? 1.6 : 0;
}
let lastInput = NO_INPUT, fxClock = -1;

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
  const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw), now = performance.now() / 1000;
  const kmh = Math.abs(sim.speed) * 3.6;
  if (Math.abs(sim.speed) > 2 && now - look.last > 1.5) { look.yaw = damp(look.yaw, 0, 1.5, dt); look.pitch = damp(look.pitch, 0, 1.5, dt); }
  if (Math.hypot(pose.x - HOME.x, pose.z - HOME.z) > 3.8) state.driven = true;      // out of the gate

  if (state.cam === 'driver' || state.cam === 'hood') {
    // in the seat (or on the bonnet): the head moves with the g-forces, looks into the turn, turns to look back
    car.root.updateMatrixWorld(true);
    const hm = headMotion(head2, dt || 1 / 60, { ax: sim.axT ?? sim.ax, ay: sim.ayT ?? sim.ay, steer: pose.steer, r: sim.r, speed: sim.speed, lookBack: lookingBack() });
    const lx = Math.cos(pose.yaw), lz = -Math.sin(pose.yaw);                       // the car's left
    if (state.cam === 'hood') camPos.set(0, 1.08, 1.05).applyMatrix4(car.body.matrixWorld);
    else car.eye.getWorldPosition(camPos);
    const k = state.cam === 'hood' ? 0.4 : 1;
    camPos.x += (fx * hm.back + lx * hm.side) * k; camPos.z += (fz * hm.back + lz * hm.side) * k;
    const yaw = pose.yaw + look.yaw * 1.4 + hm.yaw * (state.cam === 'hood' ? 0.6 : 1), pitch = -0.07 - look.pitch * 0.6 + body.pitch * 0.5 + hm.pitch;
    camLook.set(camPos.x + Math.sin(yaw) * 10, camPos.y + Math.sin(pitch) * 10, camPos.z + Math.cos(yaw) * 10);
    camera.near = state.cam === 'hood' ? 0.1 : 0.03;
    // a natural field of view from the seat (wider ones stretch the dashboard and the wheel)
    cam.fov = damp(cam.fov, (state.cam === 'hood' ? 62 : 56) + Math.min(kmh, 140) * 0.035, 4, dt);
    car.cabin.intensity = state.cam === 'driver' ? (sun.userData.dir?.y > 0 ? sun.intensity * 0.32 : 0) + hemi.intensity * 0.6 : 0;
    camera.fov = cam.fov;
    camera.position.copy(camPos);
    const roll = hm.roll * k;
    camera.up.set(lx * Math.sin(roll), Math.cos(roll), lz * Math.sin(roll));
    camera.lookAt(camLook);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    return;
  }
  camera.near = 0.1;
  car.cabin.intensity = 0;
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
  // chase / high: chasecam.js (leads into corners, follows slides, springs with speed and braking, smooths
  // bumps, looks back on B)
  if (snap) chase.init = false;
  const v = chase.update(dt || 1 / 60, { x: pose.x, z: pose.z, y: groundHeight(pose.x, pose.z), yaw: pose.yaw, vx: sim.vx, vz: sim.vz, speed: sim.speed, r: sim.r, ax: sim.axT ?? sim.ax },
    { mode: state.cam === 'high' ? 'high' : 'chase', lookYaw: look.yaw, lookPitch: look.pitch, zoom: look.zoom, lookBack: lookingBack(), blocked: blockedAt, impact: sim.impact });
  camPos.set(v.x, v.y, v.z); camLook.set(v.lx, v.ly, v.lz);
  cam.fov = camera.fov = v.fov;
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
  if (state.mode === 'foot' && roomAt(px, pz, walker.foot)) drawPlan(g, S);
  else { g.fillStyle = '#7fb3c4'; g.fillRect(0, 0, S, S); g.drawImage(mapBase, u - S / 2 / k, v - S / 2 / k, S / k, S / k, 0, 0, S, S); }
  g.translate(S / 2, S / 2);
  let yaw = pose.yaw;
  if (state.mode === 'foot') yaw = orb.yaw;
  g.rotate(-yaw);
  g.fillStyle = state.mode === 'foot' ? '#ffd9a0' : '#ffffff'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = '#1b1b1b'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
  g.fillText('N', S / 2, 14);
}

// ------------------------------------------------------------------ loop
const STEP = 1 / 240;                  // physics steps: the tyre model is stiff, so small steps keep it stable
let acc = 0, last = performance.now(), lampTimer = 0, hudTimer = 0, prevImpact = 0, clock = 0, envTimer = 0;
function stepSim(dt, input) {
  acc += Math.min(dt, 0.1);
  while (acc >= STEP) { sim.step(STEP, dev.stepInput(input), collide, surfaceAt); acc -= STEP; }
  pose.blend(sim, acc / STEP);
}

function loop() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const input = state.started ? readInput(dt) : NO_INPUT;
  lastInput = state.mode === 'drive' && !state.overlay ? input : { ...NO_INPUT, handbrake: true };
  padExtras(dt);
  stepSim(dt, lastInput);
  if (state.mode === 'foot') updateFoot(dt);
  frame(dt);
  post?.watch(dt, (pr) => { renderer.setPixelRatio(pr); post.setSize(window.innerWidth, window.innerHeight); }, () => sea.setScale(0.3));
}

// a shooting star: "Make a wish" for a few seconds
let wishTimer = null;
function wish() {
  const w = document.getElementById('wish');
  if (state.overlay || !w) return;
  clearTimeout(wishTimer);
  w.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('show')));
  wishTimer = setTimeout(() => { w.classList.remove('show'); wishTimer = setTimeout(() => (w.hidden = true), 1500); }, 4200);
}
function draw() {
  sea.update(clock, scene, camera, sun, waterAmb);
  if (post) post.render(); else renderer.render(scene, camera);
}

function frame(dt = 1 / 60, show = true) {
  // palms near the camera get their full crowns (every half second, or at once after a jump)
  lodTimer -= dt;
  if (lodTimer <= 0 || camera.position.distanceToSquared(lodAt) > 25) { beach.palmLOD(camera.position); dressing.lod(camera.position); lodAt.copy(camera.position); lodTimer = 0.5; }
  clock += dt;
  if (night.update(dt, clock, state.stars, camera)) wish();
  clouds.update(clock, camera, skyLight);
  wheelFx.update(clock, sun.color, sun.intensity * Math.max(0.1, sun.userData.dir?.y ?? 1), waterAmb);
  cosy.update(clock, Math.max(state.stars, (state.glow || 0) * 0.8));
  court.update(clock);
  lightPool?.update(dt, camera.position);
  if (houseLife.update(clock, dt, { x: head.position.x, z: head.position.z, foot: walker.foot, room: state.mode === 'foot' ? roomAt(head.position.x, head.position.z, walker.foot) : null, night: (state.glow || 0) > 0.3, ctx: audio?.ctx, out: audio?.master, indoors: isIndoors() })) flash('Chai’s ready ☕');
  if (state.rally) rallyTick(dt);
  if (roomAudio) music.setLevel(roomAudio.update(dt, camera, { playing: music.playing, inCar: state.mode === 'drive', foot: walker?.foot ?? 0 }));
  studio.update(clock, !!music?.playing || state.recordDemo);
  spray.update(clock, sun, waterAmb);
  beach.update(clock);
  updateCar(dt);
  if (!state.cine) placeCamera(false, dt);
  tickClock(dt);
  let focusX = state.mode === 'foot' ? head.position.x : pose.x, focusZ = state.mode === 'foot' ? head.position.z : pose.z;
  if (state.cine) { focusX = state.cine.tx; focusZ = state.cine.tz; }      // (a film shot: the sun's shadows round what the camera looks at)
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
      slip: sim.slip, speed: sim.speed, gear: sim.gear, surface: sim.surface, tel: sim.tel,
      shoreDist: 999,                                  // (the sea is ambience.js now) inside: state.mode === 'drive' && state.cam === 'driver',
      engineOn: state.mode === 'drive' || state.engineOff > 0,
    });
    if (sim.impact > prevImpact + 0.5) audio.thud(sim.impact / 8);
    // the coast's own sounds: waves breaking in time with the sea, wind, palms, birds, crickets
    palmTimer -= dt;
    if (palmTimer <= 0) { palmTimer = 0.5; nearPalms = beach.palms.filter((p) => (p.x - camera.position.x) ** 2 + (p.z - camera.position.z) ** 2 < 225).length; }
    camera.getWorldDirection(fwdV);
    const rl = Math.hypot(fwdV.x, fwdV.z) || 1;
    ambience.update(dt, { x: camera.position.x, z: camera.position.z, rx: -fwdV.z / rl, rz: fwdV.x / rl, t: clock, sunEl: state.sunEl ?? 10, night: state.stars, indoors: isIndoors(), palms: nearPalms, fire: cosy.fire, chimes: { ...cosy.chimes, gust: cosy.gust } });
  }
  prevImpact = sim.impact;
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    document.getElementById('kmh').textContent = Math.round(Math.abs(sim.speed) * 3.6);
    const moving = Math.abs(sim.speed) > 0.2;
    document.getElementById('gear').textContent = sim.reversing ? 'R' : moving ? 'D' + sim.gear : 'D';
    focus = findFocus();
    updateRoomChip();
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
  dev.frame();
  if (show) draw();
}

// ------------------------------------------------------------------ headless / test API
window.play = {
  ready: false,
  setTime,
  // walk for `seconds` holding a key (W by default), the camera facing yawDeg (0 = north)
  stroll: (seconds, code = 'KeyW', yawDeg = null, draw = true) => {
    if (yawDeg != null) orb.yaw = THREE.MathUtils.degToRad(yawDeg);
    walker.keys[code] = true;
    for (let t = 0; t < seconds; t += 1 / 30) { updateFoot(1 / 30); placeFootCamera(1 / 30, false); }
    walker.keys[code] = false;
    for (let i = 0; i < 8; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, false); }
    if (draw) { hudTimer = 0; frame(1 / 60); }
    return { x: +head.position.x.toFixed(2), z: +head.position.z.toFixed(2), foot: +walker.foot.toFixed(2), focus: focus && focus.label };
  },
  camera: (mode) => { state.cam = mode; state.driven = true; placeCamera(true, 1 / 60); },
  teleport: (x, z, yawDeg = 0) => { sim.reset(x, z, THREE.MathUtils.degToRad(yawDeg)); pose.copyFrom(sim); state.driven = true; placeCamera(true, 1 / 60); },
  home: goHome,
  studio: goStudio,
  look: (yaw = 0, pitch = 0, zoom = 1) => { Object.assign(look, { yaw, pitch, zoom, last: performance.now() / 1000 + 1e6 }); placeCamera(true, 1 / 60); },
  // (draw = false: physics only, for scripted driving loops; call render() after)
  drive: (seconds, input = {}, draw = true) => {
    const inp = { ...NO_INPUT, ...input };
    lastInput = inp;
    const n = Math.round(seconds / STEP), per = Math.round(1 / 60 / STEP);
    for (let i = 0; i < n; i++) {
      sim.step(STEP, dev.stepInput(inp), collide, surfaceAt);
      if (i % per === per - 1) { pose.copyFrom(sim); clock += 1 / 60; updateCar(1 / 60); }       // (skid marks, suspension, wheel effects)
    }
    pose.copyFrom(sim);
    if (!draw) return window.play.state();
    for (let i = 0; i < 30; i++) { updateCar(1 / 30); placeCamera(false, 1 / 30); }
    hudTimer = 0; lampTimer = 0;
    frame(1 / 60);
    return window.play.state();
  },
  exit: () => { exitCar(); for (let i = 0; i < 10; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); } frame(1 / 60); return window.play.state(); },
  enter: () => { toggleFoot(); frame(1 / 60); return window.play.state(); },
  // on foot: put her at (x, z) metres facing yaw degrees (0 = north / +Z); the camera behind her
  foot: (x, z, yawDeg = 0, pitch = 0.22, footY = 0, draw = true) => {
    getUp();
    if (state.mode !== 'foot') state.mode = 'foot';
    placeHer(x, z, THREE.MathUtils.degToRad(yawDeg), footY);
    orb.pitch = pitch;
    for (let i = 0; i < 2; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); }
    updateModeUI();
    if (draw) { hudTimer = 0; frame(1 / 60); }
    return { x: +head.position.x.toFixed(2), z: +head.position.z.toFixed(2), foot: +walker.foot.toFixed(2), focus: focus && focus.label };
  },
  interact: () => { focus = findFocus(); interact(); for (let i = 0; i < 10; i++) { updateFoot(1 / 30); placeFootCamera(1 / 30, i === 0); } hudTimer = 0; frame(1 / 60); return state.overlay || !!state.lying; },
  page: (k) => { turnAlbum(k); },
  close: () => { closeOverlay(); album = null; frame(1 / 60); },
  sunset: (seconds) => { for (let t = 0; t < seconds; t += 0.25) frame(0.25, false); hudTimer = 0; frame(1 / 60); return state.time; },
  render: () => { placeCamera(true, 1 / 60); hudTimer = 0; lampTimer = 0; frame(1 / 60); },
  // the model's own geometry, for the film's shot list (nothing is invented: rooms, doorways, the road, the places)
  filmInfo: () => {
    const floors = {}; scene.traverse((o) => { const f = o.userData?.floor; if (f) floors[f] = (floors[f] || 0) + 1; });
    return {
      floors, rooms: ROOMS.map((r) => ({ name: r.name, floor: r.floor, ffl: r.ffl, at: [r.at[0] / 1000, r.at[1] / 1000], box: [Math.min(...r.poly.map((q) => q[0])) / 1000, Math.min(...r.poly.map((q) => q[1])) / 1000, Math.max(...r.poly.map((q) => q[0])) / 1000, Math.max(...r.poly.map((q) => q[1])) / 1000] })),
      doors: DOORWAYS, home: HOME, park: STUDIO_PARK, studio: { ...STUDIO, upper: studio.upper, terraceX: studio.terraceX }, court: { Y: court.Y, x: 131, z: 41.7 },
      road: ROAD_PTS2(), photos: (pack?.album?.photos || []).map((p) => ({ url: (pack.base || 'play/deepti/') + p.file, w: p.w, h: p.h })),
    };
  },
  // free walking check for a film path: is a point clear for a person at floor y?
  clear: (x, z, y) => { const h = walker.standAt(x * 1000, z * 1000, y); return h !== null && Math.abs(h - y) < 0.3 && !walker.blocked(x * 1000, z * 1000, h); },
  // ---- film mode: the camera set exactly (position, target, field of view), no HUD; floors above `level`
  // hidden for cut-away views of the model; the car placed along a path; one frame drawn, returned as JPEG
  cine: (c) => {
    if (!state.cineHud) { state.cineHud = true; for (const id of ['hud', 'prompt', 'toast', 'play-prompt', 'play-seat']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } }
    if (c.hour != null && Math.abs(c.hour - state.clock.h) > 1e-4) { state.clock.h = c.hour; state.clock.speed = 0; applyClock(c.regen ?? true); }
    if (c.car) { pose.x = c.car.x; pose.z = c.car.z; pose.yaw = c.car.yaw; pose.steer = c.car.steer || 0; pose.spin = c.car.spin || 0; pose.roll = 0; pose.pitch = 0; sim.x = c.car.x; sim.z = c.car.z; sim.yaw = c.car.yaw; sim.slipF = sim.slipR = 0; sim.vx = Math.sin(c.car.yaw) * (c.car.speed || 0); sim.vz = Math.cos(c.car.yaw) * (c.car.speed || 0); sim.surface = 'road'; }       // (no skids: the physics isn't running)
    if (c.beams != null) setBeams(c.beams);
    const want = c.cut || null;
    if (want !== state.cineCut) {
      state.cineCut = want;
      const order = ['GF', 'FF', 'SF', 'ROOF'], keep = want ? order.indexOf(want) : 99;
      scene.traverse((o) => { const f = o.userData?.floor || o.userData?.hangsFrom; if (f && f !== 'SITE' && order.includes(f)) o.visible = order.indexOf(f) <= keep; });
    }
    state.cine = { tx: c.tx, tz: c.tz };
    camera.position.set(c.px, c.py, c.pz); camera.up.set(0, 1, 0); camera.lookAt(c.tx, c.ty, c.tz);
    if (c.roll) camera.rotateZ(c.roll);
    camera.fov = c.fov || 50; camera.near = c.near || 0.08; camera.updateProjectionMatrix();
    hudTimer = 1e9; lampTimer = 0; lodTimer = 0; lightPool?.reset();
    if (c.clock != null) clock = c.clock - (c.dt ?? 1 / 24);       // (the world's clock set exactly: water, flames and stars are the same on a re-render)
    frame(c.dt ?? 1 / 24);
    return c.grab === false ? null : renderer.domElement.toDataURL('image/jpeg', c.q || 0.93);
  },
  // let `seconds` of time pass (water, stars) and draw; shoot: fire a shooting star first
  wait: (seconds, shoot = false) => { if (shoot) night.shoot(); for (let t = 0; t < seconds; t += 1 / 30) frame(1 / 30, false); hudTimer = 0; frame(1 / 60); return !document.getElementById('wish').hidden; },
  debug: () => ({ sea, night, post, scene, camera, renderer, sun, THREE, state, walker, roomAudio, music, court }),
  clock: (h, speed) => { if (h != null) { state.clock.h = h; } if (speed != null) state.clock.speed = speed; applyClock(true); return { h: state.clock.h, label: fmtClock(state.clock.h), moment: state.time, sun: sunPosition(state.clock.date, state.clock.h) }; },
  dev: () => dev,
  sound: () => ({ audio, ambience, measureSfx }),
  footprints: () => footprints,
  dressing: () => dressing.counts,
  _driver: () => driver,
  quality: () => ({ ao: !!post?.gtao?.enabled, pr: renderer.getPixelRatio(), scans: !!scans, hdri: Object.keys(skyHDR) }),
  state: () => ({ mode: state.mode, explore: state.explore, birthday: state.birthday, x: +sim.x.toFixed(2), z: +sim.z.toFixed(2), yaw: +THREE.MathUtils.radToDeg(sim.yaw).toFixed(1), kmh: +(sim.speed * 3.6).toFixed(1), gear: sim.gear, surface: sim.surface }),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, wheel: !!car.steering, pack: !!pack, interact: studio.interact.length }),
};

init().catch((e) => {
  console.error(e);
  const l = document.getElementById('play-loading');
  if (l) { l.hidden = false; l.querySelector('span').textContent = 'Something went wrong: ' + e.message; }
});
