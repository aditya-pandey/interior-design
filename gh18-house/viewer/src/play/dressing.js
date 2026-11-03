import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coastSamples, groundHeight, roadDist, ROAD, windSway, WATER_Y } from './beach.js';
import { BEACH, ROAD_HALF, STUDIO, STUDIO_PARK } from './site.js';
import { rng } from './surfaces.js';

// World step 4, the things that make the coast feel lived in:
//   - dune grass on the dry upper beach, in clumps that thicken towards the land and sway in the breeze
//   - the wrack line: seaweed and the odd piece of driftwood where the high tide left them
//   - footprints in the sand where she walks
//   - the roadside: kilometre stones (white with a yellow cap, as on Indian highways), speed-limit
//     signs, a bus shelter and a chai stall by the beach
// Kept sparse on purpose. Car colliders are returned for everything solid.

const clear = (x, z) => {
  if (roadDist(x, z) < ROAD_HALF + 1.6) return false;
  if (x > -6 && x < 16 && z > -4 && z < 44) return false;                                     // GH-18 and its gate
  if (x > STUDIO.x0 - 4 && x < STUDIO.x0 + STUDIO.w + 4 && z > STUDIO.z0 - 4 && z < STUDIO.z0 + STUDIO.d + 6) return false;
  if (x > STUDIO_PARK.x - 6 && x < STUDIO_PARK.x + 14 && z > 26 && z < STUDIO_PARK.z + 6) return false;
  return true;
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---- dune grass
function grassTexture() {
  return canvasTex(256, 256, (g, W, H) => {
    const r = rng(71);
    for (let i = 0; i < 90; i++) {
      const x0 = W * (0.15 + r() * 0.7), lean = (r() - 0.5) * 110, h = H * (0.45 + r() * 0.55);
      const hue = 60 + r() * 30, light = 38 + r() * 26, sat = 25 + r() * 25;
      g.strokeStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
      g.lineWidth = 1.4 + r() * 2.2;
      g.beginPath(); g.moveTo(x0, H); g.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.6, x0 + lean, H - h); g.stroke();
    }
  });
}
function grassClump() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const p = new THREE.PlaneGeometry(0.75, 0.6); p.translate(0, 0.3, 0); p.rotateY((k / 3) * Math.PI);
    parts.push(p);
  }
  return mergeGeometries(parts);
}

// ---- seaweed and driftwood
function wrackTexture() {
  return canvasTex(256, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const r = rng(73);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${40 + r() * 40},${42 + r() * 30},${18 + r() * 14},${0.6 + r() * 0.4})`;
      g.lineWidth = 2 + r() * 5;
      let x = W / 2 + (r() - 0.5) * 80, y = H / 2 + (r() - 0.5) * 50;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

// ---- footprints (a ring buffer of decals)
function footTexture() {
  return canvasTex(64, 128, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(70,58,44,0.85)';
    g.beginPath(); g.ellipse(W / 2, H * 0.62, W * 0.27, H * 0.3, 0, 0, Math.PI * 2); g.fill();      // sole
    g.beginPath(); g.ellipse(W / 2 + 2, H * 0.24, W * 0.24, H * 0.12, 0, 0, Math.PI * 2); g.fill(); // ball
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(W * (0.3 + i * 0.1), H * (0.09 + Math.abs(i - 1.5) * 0.012), 3.2 - i * 0.35, 0, Math.PI * 2); g.fill(); }
  });
}
export function createFootprints(scene) {
  const N = 260;
  const mat = new THREE.MeshStandardMaterial({ map: footTexture(), transparent: true, depthWrite: false, roughness: 0.95, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const geo = new THREE.PlaneGeometry(0.11, 0.26); geo.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.name = 'footprints';
  scene.add(im);
  let head = 0, walked = 0, left = false, last = null;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  return {
    get count() { return im.count; },
    // call every frame on foot: her position (m), facing yaw (rad, 0 = +Z), and whether she's on sand
    step(x, z, yaw, onSand) {
      if (!last) { last = [x, z]; return; }
      walked += Math.hypot(x - last[0], z - last[1]);
      last = [x, z];
      if (walked < 0.66) return;
      walked = 0; left = !left;
      if (!onSand) return;
      const side = left ? 0.1 : -0.1, rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const fx = x + rx * side, fz = z + rz * side;
      q.setFromAxisAngle(up, yaw + (left ? 0.08 : -0.08));
      m.compose(p.set(fx, groundHeight(fx, fz) + 0.035, fz), q, one);        // (the sand mesh is coarser than the ground function)
      im.setMatrixAt(head, m);
      head = (head + 1) % N; im.count = Math.min(N, im.count + 1);
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- roadside furniture
function kmStone(label) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, W, H) => {
    c.fillStyle = '#f2efe6'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1d1d1d'; c.textAlign = 'center'; c.font = 'bold 26px sans-serif'; c.fillText(label[0], W / 2, 52); c.font = 'bold 30px sans-serif'; c.fillText(label[1], W / 2, 92);
  }), roughness: 0.8 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf1c232, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.18), [white, white, white, white, white, white]); body.position.y = 0.275;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.18, 20, 1, false, 0, Math.PI), yellow);
  cap.rotation.set(Math.PI / 2, 0, Math.PI / 2); cap.position.y = 0.55;
  g.add(body, cap);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function speedSign(n) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), new THREE.MeshStandardMaterial({ color: 0x8d9095, metalness: 0.7, roughness: 0.4 }));
  pole.position.y = 1.15;
  const face = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, W, H) => {
    c.fillStyle = '#c62828'; c.beginPath(); c.arc(W / 2, H / 2, 62, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W / 2, H / 2, 48, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.textAlign = 'center'; c.font = 'bold 50px sans-serif'; c.fillText(String(n), W / 2, H / 2 + 18);
  }), roughness: 0.5, transparent: true });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), face); disc.position.set(0, 2.15, 0.04);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ color: 0x9a9da1, metalness: 0.6, roughness: 0.5 }));
  back.position.set(0, 2.15, 0.035); back.rotation.y = Math.PI;
  g.add(pole, disc, back);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function busShelter() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2f5d50, metalness: 0.5, roughness: 0.5 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.7), new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.7 }));
  roof.position.set(0, 2.55, -0.1); roof.rotation.x = -0.06;
  g.add(roof);
  for (const x of [-1.6, 1.6]) for (const z of [-0.75, 0.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.5, 0.07), steel); p.position.set(x, 1.25, z); g.add(p); }
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.04), new THREE.MeshPhysicalMaterial({ color: 0xcfe3e6, transparent: true, opacity: 0.35, roughness: 0.05 }));
  back.position.set(0, 1.5, -0.75); g.add(back);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.7 }));
  bench.position.set(0, 0.46, -0.5); g.add(bench);
  for (const x of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.35), steel); l.position.set(x, 0.23, -0.5); g.add(l); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: canvasTex(256, 86, (c, W, H) => {
    c.fillStyle = '#1f4e8c'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 30px sans-serif'; c.fillText('BUS STOP', W / 2, 54);
  }) }));
  sign.position.set(1.15, 2.3, 0.56); g.add(sign);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function chaiStall() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a35, roughness: 0.8 });
  const cart = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.9), wood); cart.position.y = 0.48; g.add(cart);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 1.0), new THREE.MeshStandardMaterial({ color: 0x6f6f6f, metalness: 0.6, roughness: 0.35 })); top.position.y = 0.97; g.add(top);
  // striped awning on four poles
  const stripes = canvasTex(256, 64, (c, W, H) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f4efe4' : '#c0392b'; c.fillRect(i * W / 8, 0, W / 8, H); } });
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 1.6), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }));
  awn.position.set(0, 2.25, 0.15); awn.rotation.x = 0.1; g.add(awn);
  for (const x of [-1.05, 1.05]) for (const z of [-0.5, 0.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.25, 6), wood); p.position.set(x, 1.12, z); g.add(p); }
  // a kettle, glasses and a sign
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.25 });
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 16), steel); kettle.position.set(-0.5, 1.1, 0); g.add(kettle);
  for (let i = 0; i < 5; i++) { const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.05 })); gl.position.set(0.2 + i * 0.09, 1.04, 0.1); g.add(gl); }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.32), new THREE.MeshStandardMaterial({ map: canvasTex(256, 70, (c, W, H) => {
    c.fillStyle = '#f1c232'; c.fillRect(0, 0, W, H); c.fillStyle = '#5a1f12'; c.textAlign = 'center'; c.font = 'bold 34px Georgia, serif'; c.fillText('CHAI · ₹15', W / 2, 47);
  }) }));
  board.position.set(0, 1.75, 0.95); g.add(board);
  for (const x of [-0.6, 0.6]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.6 })); st.position.set(x, 0.225, 1.5); g.add(st); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildDressing({ low = false, time }) {
  const objects = [], colliders = [];
  const r = rng(404);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // dune grass: denser towards the land, in patches
  const grassPos = [];
  for (const [x, z, nx, nz] of coastSamples(low ? 3.5 : 2.2)) {
    const patch = 0.5 + 0.5 * Math.sin(x * 0.07 + z * 0.05) * Math.sin(x * 0.023 - z * 0.04);
    const n = Math.floor(patch * (low ? 4 : 9) + r() * 2);
    for (let k = 0; k < n; k++) {
      const s = -BEACH + 0.5 + Math.pow(r(), 1.6) * 24;                     // most near the land
      const gx = x + nx * s + (r() - 0.5) * 2.5, gz = z + nz * s + (r() - 0.5) * 2.5;
      if (!clear(gx, gz)) continue;
      grassPos.push([gx, gz, 0.9 + r() * 1.3, r() * Math.PI]);
    }
  }
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85 });
  windSway(grassMat, time, 0.02, 'grass', 0.6);
  const grass = new THREE.InstancedMesh(grassClump(), grassMat, grassPos.length);
  grassPos.forEach(([x, z, s, a], i) => { q.setFromAxisAngle(up, a); m.compose(p.set(x, groundHeight(x, z) - 0.02, z), q, sc.set(s, s * (0.8 + (s % 0.3)), s)); grass.setMatrixAt(i, m); });
  grass.castShadow = true; grass.receiveShadow = true; grass.name = 'dune_grass';
  objects.push(grass);

  // the wrack line (seaweed) where the high tide reached, and driftwood
  const wrackPos = [];
  const wood = [];
  for (const [x, z, nx, nz] of coastSamples(4)) {
    if (r() < 0.55) {
      const s = -6.6 + r() * 1.4, wx = x + nx * s + (r() - 0.5) * 3, wz = z + nz * s + (r() - 0.5) * 3;
      if (clear(wx, wz) || roadDist(wx, wz) > ROAD_HALF + 3) wrackPos.push([wx, wz, 0.35 + r() * 0.8, r() * Math.PI * 2]);
    }
    if (r() < 0.025) {
      const s = -9 + r() * 4, wx = x + nx * s, wz = z + nz * s;
      if (!clear(wx, wz)) continue;
      const len = 0.8 + r() * 1.6, geo = new THREE.CylinderGeometry(0.05 + r() * 0.04, 0.07 + r() * 0.05, len, 8);
      geo.rotateZ(Math.PI / 2); geo.rotateY(r() * Math.PI); geo.translate(wx, groundHeight(wx, wz) + 0.04, wz);
      wood.push(geo.toNonIndexed());
    }
  }
  const wrack = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: wrackTexture(), transparent: true, alphaTest: 0.2, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), wrackPos.length);
  wrackPos.forEach(([x, z, s, a], i) => { q.setFromAxisAngle(up, a); m.compose(p.set(x, groundHeight(x, z) + 0.01, z), q, sc.set(s, 1, s)); wrack.setMatrixAt(i, m); });
  wrack.receiveShadow = true; wrack.name = 'wrack';
  objects.push(wrack);
  if (wood.length) {
    const dw = new THREE.Mesh(mergeGeometries(wood), new THREE.MeshStandardMaterial({ color: 0xb8a68a, roughness: 0.9 }));
    dw.castShadow = true; dw.receiveShadow = true; dw.name = 'driftwood';
    objects.push(dw);
  }

  // the roadside: placed on the inland (left) or beach (right) side of the road at a point along it
  const place = (obj, i, side, off = 1.6, faceRoad = true) => {
    const a = ROAD[(i + ROAD.length) % ROAD.length], nx = -a.tz * side, nz = a.tx * side;
    const x = a.x + nx * (ROAD_HALF + off), z = a.z + nz * (ROAD_HALF + off);
    obj.position.set(x, groundHeight(x, z), z);
    obj.rotation.y = faceRoad ? Math.atan2(-nx, -nz) : Math.atan2(a.tx, a.tz);
    objects.push(obj);
    return [x, z];
  };
  // ROAD index nearest a point
  const near = (x, z) => { let b = 0, bd = Infinity; ROAD.forEach((pt, i) => { const d = (pt.x - x) ** 2 + (pt.z - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  // kilometre stones every ~500 m on the inland side
  for (let i = 0, k = 1; i < ROAD.length; i += 250, k++) {
    const [x, z] = place(kmStone(['GOA COAST RD', `${(k * 0.5).toFixed(1)} km`]), i, 1, 0.9);
    colliders.push({ circle: [x, z, 0.3] });
  }
  // speed limits either side of GH-18
  for (const [x, side] of [[-45, 1], [60, -1]]) { const [sx, sz] = place(speedSign(40), near(x, 28), side, 0.9); colliders.push({ circle: [sx, sz, 0.12] }); }
  // a bus shelter on the beach side, and a chai stall a little further on
  const [bx, bz] = place(busShelter(), near(-70, 28), -1, 1.4);
  colliders.push({ poly: [[bx - 1.8, bz - 1.2], [bx + 1.8, bz - 1.2], [bx + 1.8, bz + 1.2], [bx - 1.8, bz + 1.2]] });
  const [cx, cz] = place(chaiStall(), near(-30, 28), -1, 2.2);
  colliders.push({ poly: [[cx - 1.3, cz - 1.0], [cx + 1.3, cz - 1.0], [cx + 1.3, cz + 1.9], [cx - 1.3, cz + 1.9]] });

  return { objects, colliders, counts: { grass: grassPos.length, wrack: wrackPos.length, driftwood: wood.length } };
}
void WATER_Y;
