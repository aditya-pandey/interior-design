import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// The Baleno glTF (assets/models/baleno.glb, CC BY 4.0, BHP3D) made drivable:
// - the four wheels are one merged mesh in the file, so their triangles are split by quadrant into
//   four wheels that can spin and steer, each about its own axle
// - head, tail and reverse lamps get their own materials so they can light up
// - the body sits on a pivot that pitches and rolls with the car's accelerations and the bumps.
//
// Hierarchy: root (position, yaw) -> body (suspension pitch / roll) -> model
//                                 -> wheel[i] (axle) -> steer -> spin -> wheel meshes

const SPIN = /^wheel_(wheel|reflector|grill)/;

export async function loadBaleno(url, length) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;
  model.rotation.y = Math.PI;                       // the file's front is -Z; ours is +Z
  model.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(model);
  const size0 = box0.getSize(new THREE.Vector3());
  // The file's car is 3.79 m long; like the tour, stretch it to the real 3.99 m and keep its width and
  // height. The wheels are un-stretched again after they are split off, so they stay round.
  const k = length / size0.z;
  model.scale.set(1, 1, k);
  model.position.set(-(box0.min.x + box0.max.x) / 2, -box0.min.y, -(box0.min.z + box0.max.z) / 2 * k);
  model.updateMatrixWorld(true);

  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'baleno';
  root.add(body);
  body.add(model);
  root.updateMatrixWorld(true);

  // ---- split the wheels
  const quads = { FL: [], FR: [], RL: [], RR: [] };   // L = +X (the car's left), F = +Z
  const remove = [];
  model.traverse((o) => {
    if (!o.isMesh || !SPIN.test(o.name)) return;
    const g = bake(o.geometry, o.matrixWorld);
    const pos = g.attributes.position;
    const tri = { FL: [], FR: [], RL: [], RR: [] };
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      tri[(cz > 0 ? 'F' : 'R') + (cx > 0 ? 'L' : 'R')].push(i);
    }
    for (const [q, idx] of Object.entries(tri)) if (idx.length) quads[q].push({ geo: subset(g, idx), material: o.material });
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const wheels = [];
  for (const [q, pieces] of Object.entries(quads)) {
    if (!pieces.length) continue;
    const bb = new THREE.Box3();
    for (const p of pieces) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
    const c = bb.getCenter(new THREE.Vector3());
    const axle = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
    axle.position.copy(c);
    axle.add(steer); steer.add(spin);
    for (const p of pieces) {
      p.geo.translate(-c.x, -c.y, -c.z);
      p.geo.scale(1, 1, 1 / k);
      const m = new THREE.Mesh(p.geo, wheelMaterial(p.material));
      m.castShadow = true;
      spin.add(m);
    }
    root.add(axle);
    wheels.push({ q, front: q[0] === 'F', left: q[1] === 'L', axle, steer, spin, radius: (bb.max.y - bb.min.y) / 2, rest: c.clone() });
  }

  // ---- lamps
  const lamp = (color, emissive) => new THREE.MeshPhysicalMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });      // under a clear lens
  const mats = { head: lamp(0xf4f4f0, 0xfff6e8), tail: lamp(0x6e0d0d, 0xff2a1a), reverse: lamp(0xdddddd, 0xffffff) };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !(o.material.transparent || /glass/.test(o.material.name));
    o.receiveShadow = true;
    const n = o.material.name || '';
    if (n === 'left_front_light') o.material = mats.head;
    else if (n === 'tailght.1') o.material = mats.tail;
    else if (n === 'revsf.4') o.material = mats.reverse;
  });

  const steering = extractSteeringWheel(model, body);
  finish(model);
  root.add(contactShadow(size0.x + 0.25, length + 0.35));

  const bb = new THREE.Box3().setFromObject(model);
  const dims = bb.getSize(new THREE.Vector3());
  const front = wheels.filter((w) => w.front), rear = wheels.filter((w) => !w.front);
  const zf = front.reduce((s, w) => s + w.rest.z, 0) / front.length, zr = rear.reduce((s, w) => s + w.rest.z, 0) / rear.length;
  const track = Math.abs(front[0].rest.x - front[1].rest.x);

  // headlamp beams
  const beams = [];
  for (const sx of [-1, 1]) {
    const sl = new THREE.SpotLight(0xfff1dd, 0, 0, 0.48, 0.5, 2);
    sl.position.set(sx * 0.58, 0.72, dims.z / 2 - 0.2);
    sl.target.position.set(sx * 0.9, 0.0, dims.z / 2 + 14);
    body.add(sl, sl.target);
    beams.push(sl);
  }
  // driver's eye (right-hand drive: the driver sits on the car's right, -X): a normal seated position,
  // ~0.6 m behind the wheel's centre and a little above it
  const eye = new THREE.Object3D();
  eye.position.set(-0.335, 1.2, -0.27);
  body.add(eye);
  // daylight through the glass, filling the cabin (shadows from the roof would leave it black)
  const cabin = new THREE.PointLight(0xfff4e8, 0, 2.6, 2);
  cabin.position.set(-0.1, 1.28, 0.05);
  body.add(cabin);

  return { root, body, model, wheels, mats, beams, eye, cabin, dims, steering, wheelbase: zf - zr, track, axleZ: (zf + zr) / 2, scale: k, nativeSize: size0 };
}

// ---- a leather three-spoke steering wheel, in the pivot's frame: the wheel in the XY plane, the
// driver on the -Z side. Rim with thicker grips and a flattened bottom, satin-silver spoke inserts,
// piano-black switch panels, a padded hub with a chrome emblem.
function steeringWheel(R) {
  const g = new THREE.Group();
  g.name = 'steering_wheel';
  const grain = leatherNormal();
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x1b1b1d, roughness: 0.58, normalMap: grain, normalScale: new THREE.Vector2(0.22, 0.22), sheen: 0.4, sheenRoughness: 0.5, sheenColor: 0x444444 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xb9bcc0, metalness: 0.9, roughness: 0.32 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12 });
  const btn = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.6, roughness: 0.4 });
  // rim: a torus whose tube swells at the 9-and-3 grips, flattened at the bottom
  const rim = new THREE.TorusGeometry(R, 0.0185, 18, 120);
  const p = rim.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(y, x);
    c.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const grip = 1 + 0.16 * Math.exp(-Math.pow((Math.abs(Math.cos(a)) - 1) * 9, 2)) * (Math.sin(a) > -0.2 ? 1 : 0.6);
    let nx = c.x + (x - c.x) * grip, ny = c.y + (y - c.y) * grip;
    const flat = -R * 0.86;                                         // flat-bottomed
    if (ny < flat) ny = flat + (ny - flat) * 0.35;
    p.setXYZ(i, nx, ny, z * grip);
  }
  rim.computeVertexNormals();
  g.add(new THREE.Mesh(rim, leather));
  // spokes: left, right, and a bottom one, from the hub out to the rim
  const spoke = (ang, w, len, mat, z0, dz) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -w / 2); sh.lineTo(len, -w * 0.38); sh.lineTo(len, w * 0.38); sh.lineTo(0, w / 2); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: dz, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    geo.rotateZ(ang); geo.translate(0, 0, z0);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
  };
  for (const side of [1, -1]) {
    const ang = side > 0 ? -0.12 : Math.PI + 0.12;
    spoke(ang, 0.06, R - 0.004, plastic, -0.026, 0.016);
    spoke(ang, 0.012, R - 0.03, silver, -0.031, 0.004);               // the silver insert
    // switch panel on the spoke, facing the driver
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.042, 0.006), gloss);
    pnl.position.set(Math.cos(ang) * 0.095, Math.sin(ang) * 0.095 + 0.004, -0.034);
    pnl.rotation.z = ang + (side > 0 ? 0 : Math.PI);
    g.add(pnl);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.002, 12), btn);
      b.rotation.x = Math.PI / 2;
      b.position.set(pnl.position.x + ((k % 2) - 0.5) * 0.026 * side, pnl.position.y + (Math.floor(k / 2) - 0.5) * 0.018, -0.0385);
      g.add(b);
    }
  }
  spoke(-Math.PI / 2, 0.05, R - 0.004, plastic, -0.024, 0.016);
  spoke(-Math.PI / 2, 0.01, R - 0.05, silver, -0.029, 0.004);
  // hub (the airbag cover), with a chrome emblem
  const hs = new THREE.Shape();
  const hw = 0.056, hh = 0.047, r = 0.02;
  hs.moveTo(-hw + r, -hh); hs.lineTo(hw - r, -hh); hs.quadraticCurveTo(hw, -hh, hw, -hh + r); hs.lineTo(hw, hh - r); hs.quadraticCurveTo(hw, hh, hw - r, hh);
  hs.lineTo(-hw + r, hh); hs.quadraticCurveTo(-hw, hh, -hw, hh - r); hs.lineTo(-hw, -hh + r); hs.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const hub = new THREE.ExtrudeGeometry(hs, { depth: 0.022, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.012, bevelSegments: 5, curveSegments: 10 });
  hub.translate(0, 0.006, -0.05);
  const hubM = new THREE.Mesh(hub, leather); hubM.castShadow = true; g.add(hubM);
  const emb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 32), chrome);
  emb.scale.set(1.3, 1, 0.85); emb.rotation.x = Math.PI / 2; emb.position.set(0, 0.008, -0.0635);
  g.add(emb);
  // a fine highlight line of stitching round the inside of the rim
  const st = new THREE.Mesh(new THREE.TorusGeometry(R - 0.012, 0.0012, 4, 120), new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.7 }));
  st.position.z = -0.006; g.add(st);
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}
function leatherNormal() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
  const h = new Float32Array(S * S);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {                           // pebbled grain: soft bumps
    const x = rnd() * S, y = rnd() * S, rr = 2 + rnd() * 4;
    for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
      const d = Math.hypot(xx, yy) / rr; if (d > 1) continue;
      const k = ((Math.floor(y + yy) + S) % S) * S + ((Math.floor(x + xx) + S) % S);
      h[k] += (1 - d * d) * 0.5;
    }
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + (x + 1) % S] - h[y * S + (x - 1 + S) % S], dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-dx, dy, 1).normalize(), i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 3);
  return t;
}

// ---- the finish: the file's materials are flat; give them what a real car's surfaces do
const finished = new Map();
function finish(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material, n = m.name || '';
    if (finished.has(m)) { o.material = finished.get(m); return; }
    let out = m;
    if (n === 'primary') out = paint(m);
    else if (/^glass/.test(n)) {
      // glazing: clear, mirror-smooth, reflecting the sky
      out = new THREE.MeshPhysicalMaterial({ name: n, color: m.color, transparent: true, opacity: Math.max(0.28, m.opacity), roughness: 0.02, metalness: 0, envMapIntensity: 1.8, depthWrite: false, side: m.side });
    } else if (n === 'grill2.2') out = new THREE.MeshPhysicalMaterial({ name: n, color: 0xd9dbde, metalness: 1, roughness: 0.16 });          // chrome garnish
    else if (n === 'mirhanl.7' || n === 'hd.7') { out = m.clone(); out.roughness = 0.35; out.envMapIntensity = 1.2; }
    finished.set(m, out);
    o.material = out;
  });
}
// metallic paint under a clear coat: the base layer has metal flakes (a fine sparkle that fades with
// distance; the file's body has no UVs, so the flakes come from the surface position), the clear coat on
// top is smooth and mirror-like
function paint(m) {
  const p = new THREE.MeshPhysicalMaterial({
    name: 'paint', color: m.color.clone().multiplyScalar(1.25), metalness: 0.62, roughness: 0.34,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.35,
  });
  p.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vFlake;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFlake = position;');
    sh.fragmentShader = 'varying vec3 vFlake;\nvec3 flakeHash(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.xxy + p.yzz) * p.zyx); }\n' +
      sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float flakeFade = 1.0 - smoothstep(0.8, 7.0, length(vViewPosition));
        vec3 fl = flakeHash(floor(vFlake * 1400.0)) - 0.5;
        normal = normalize(normal + fl * 0.22 * flakeFade);`);
  };
  p.customProgramCacheKey = () => 'gh18-paint';
  return p;
}
// the wheels: alloy rims (bright, metallic), rubber tyres (matt)
function wheelMaterial(m) {
  const n = m.name || '';
  if (finished.has(m)) return finished.get(m);
  let out = m;
  if (n === 'reflector.5') out = new THREE.MeshPhysicalMaterial({ name: 'alloy', color: 0xc9cdd2, metalness: 0.95, roughness: 0.24, map: m.map || null, clearcoat: 0.5, clearcoatRoughness: 0.1 });
  else if (/^wheel\./.test(n)) { out = m.clone(); out.roughness = 0.88; out.metalness = 0; }
  finished.set(m, out);
  return out;
}
// a soft dark patch under the car where the sky can't reach (the sun's shadow is separate)
function contactShadow(w, l) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = Math.abs(x - 31.5) / 32, v = Math.abs(y - 63.5) / 64;
    const d = Math.max(0, 1 - Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25));    // rounded rectangle falloff
    img.data.set([0, 0, 0, Math.min(255, Math.pow(d, 0.7) * 255 * 1.6)], (y * 64 + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  mesh.name = 'contact_shadow';
  return mesh;
}

// Turn a (possibly quantized, indexed) glTF geometry into a plain float, non-indexed one in the
// coordinate frame given by `matrix`.
function bake(src, matrix) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name];
    if (!a) continue;
    const n = a.count, size = a.itemSize, arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      arr[i * size] = a.getX(i);
      if (size > 1) arr[i * size + 1] = a.getY(i);
      if (size > 2) arr[i * size + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  const out = g.index ? g.toNonIndexed() : g;
  out.applyMatrix4(matrix);
  return out;
}

function subset(g, starts) {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const size = a.itemSize, arr = new Float32Array(starts.length * 3 * size);
    starts.forEach((i, t) => arr.set(a.array.subarray(i * size, (i + 3) * size), t * 3 * size));
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// The steering wheel is not a separate part in the file: it is merged into the interior. Its hub badge
// is separate, though, and gives the wheel's centre and the steering column's axis (the normal of the
// badge's plane, found once with a PCA of its vertices: tilted ~21 degrees). Every interior triangle
// inside a thin disc around that axis (rim, spokes, buttons) is moved into a group that turns about it.
const WHEEL_C = new THREE.Vector3(-0.311, 0.998, 0.375), WHEEL_N = new THREE.Vector3(0.01, -0.353, 0.935).normalize();
function extractSteeringWheel(model, body) {
  model.updateMatrixWorld(true);
  const pivot = new THREE.Group(), turn = new THREE.Group();
  pivot.position.copy(WHEEL_C);
  pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), WHEEL_N);
  body.add(pivot);
  pivot.add(turn);
  body.updateMatrixWorld(true);
  const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  const moved = [];
  model.traverse((o) => {
    if (!o.isMesh || /glass/.test(o.material.name || '')) return;
    const g = bake(o.geometry, new THREE.Matrix4());
    const p = g.attributes.position, keep = [], move = [];
    for (let i = 0; i < p.count; i += 3) {
      let inside = true;
      for (let k = 0; k < 3 && inside; k++) {
        v.fromBufferAttribute(p, i + k).applyMatrix4(o.matrixWorld).sub(WHEEL_C);
        const a = v.dot(WHEEL_N);
        d.copy(v).addScaledVector(WHEEL_N, -a);
        inside = a > -0.10 && a < 0.045 && d.length() < 0.215;
      }
      (inside ? move : keep).push(i);
    }
    if (!move.length) return;
    const mg = subset(g, move);
    mg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toPivot, o.matrixWorld));
    moved.push(new THREE.Mesh(mg, o.material));
    o.geometry = subset(g, keep);
  });
  // centre on the rim (not the badge), so the wheel turns without wobbling
  const bb = new THREE.Box3();
  for (const m of moved) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); }
  const c = bb.getCenter(new THREE.Vector3());
  for (const m of moved) { m.geometry.translate(-c.x, -c.y, 0); m.castShadow = true; m.visible = false; turn.add(m); }
  turn.position.set(c.x, c.y, 0);
  // the file's wheel is low on detail: a modelled one takes its place (same size, same pivot)
  const R = Math.max(0.16, Math.min(0.2, ((bb.max.x - bb.min.x) + (bb.max.y - bb.min.y)) / 4 - 0.016));
  turn.add(steeringWheel(R));
  return turn;           // rotation.z turns the wheel (+ = anticlockwise, as the driver sees it = steering left)
}
