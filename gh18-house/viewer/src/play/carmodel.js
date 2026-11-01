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
      const m = new THREE.Mesh(p.geo, p.material);
      m.castShadow = true;
      spin.add(m);
    }
    root.add(axle);
    wheels.push({ q, front: q[0] === 'F', left: q[1] === 'L', axle, steer, spin, radius: (bb.max.y - bb.min.y) / 2, rest: c.clone() });
  }

  // ---- lamps
  const lamp = (color, emissive) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
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
  // driver's eye (right-hand drive: the driver sits on the car's right, -X)
  const eye = new THREE.Object3D();
  eye.position.set(-0.37, 1.16, -0.18);
  body.add(eye);

  return { root, body, model, wheels, mats, beams, eye, dims, wheelbase: zf - zr, track, axleZ: (zf + zr) / 2, scale: k, nativeSize: size0 };
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
