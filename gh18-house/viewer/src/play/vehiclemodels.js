import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { bake, subset, contactShadow } from './carmodel.js';

// The other rides in the garage (models from Sketchfab, CC BY 4.0, credited in-game; prepared by
// tools/vehicles: compressed, the Ferrari's 984 parts joined by material, the bicycle's grass mound taken off).
// Each is given the same shape as the Baleno (carmodel.js) so the driving code can use any of them:
//   { root, body, model, wheels[{ q, front, left, axle, steer, spin, radius, rest }], mats, beams, eye, cabin, dims,
//     steering, wheelbase, track, kind }
// root: position and yaw; body: pitch and roll (a car's suspension; a two-wheeler's lean).

const loader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const lampMat = (color, emissive) => new THREE.MeshPhysicalMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });

// ---- a car whose wheels (with their brakes) are one group, to be split into four by quadrant
export async function loadCar(url, { length, front = 1, eye, lamps = {}, beamY = 0.68, beamX = 0.6 }) {
  const gltf = await loader().loadAsync(url);
  const model = gltf.scene;
  if (front < 0) model.rotation.y = Math.PI;
  model.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(model), s0 = b0.getSize(new THREE.Vector3());
  const k = length / s0.z;
  model.scale.setScalar(k);
  model.updateMatrixWorld(true);
  const b1 = new THREE.Box3().setFromObject(model);
  model.position.set(-(b1.min.x + b1.max.x) / 2, -b1.min.y, -(b1.min.z + b1.max.z) / 2);
  model.updateMatrixWorld(true);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(model); root.updateMatrixWorld(true);
  // the wheels: every mesh under WHEELS, triangle by triangle into four corners; the brake calipers (yellow)
  // turn with the steering but don't spin
  const quads = { FL: [], FR: [], RL: [], RR: [] }, remove = [];
  const wheelsNode = model.getObjectByName('WHEELS');
  wheelsNode?.traverse((o) => {
    if (!o.isMesh) return;
    const g = bake(o.geometry, o.matrixWorld), pos = g.attributes.position, tri = { FL: [], FR: [], RL: [], RR: [] };
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      tri[(cz > 0 ? 'F' : 'R') + (cx > 0 ? 'L' : 'R')].push(i);
    }
    const c = o.material.color, caliper = c && c.r > 0.45 && c.g > 0.4 && c.b < 0.25;
    for (const [q, idx] of Object.entries(tri)) if (idx.length) quads[q].push({ geo: subset(g, idx), material: o.material, fixed: caliper });
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const wheels = [];
  for (const [q, pieces] of Object.entries(quads)) {
    if (!pieces.length) continue;
    const bb = new THREE.Box3();
    for (const p of pieces) if (!p.fixed) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
    const c = bb.getCenter(new THREE.Vector3());
    const axle = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
    axle.position.copy(c); axle.add(steer); steer.add(spin);
    for (const p of pieces) {
      p.geo.translate(-c.x, -c.y, -c.z);
      const m = new THREE.Mesh(p.geo, p.material); m.castShadow = true;
      (p.fixed ? steer : spin).add(m);
    }
    root.add(axle);
    wheels.push({ q, front: q[0] === 'F', left: q[1] === 'L', axle, steer, spin, radius: (bb.max.y - bb.min.y) / 2, rest: c.clone() });
  }
  // lamps: the head lamps (front half of the light material), the tail lamps (the red glass, or the rear half)
  const mats = { head: lampMat(0xf4f4f0, 0xfff6e8), tail: lampMat(0x6e0d0d, 0xff2a1a), reverse: lampMat(0xdddddd, 0xffffff) };
  const swap = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !(o.material.transparent || o.material.transmission > 0); o.receiveShadow = true;
    const n = o.material.name || '';
    if (lamps.light?.test(n)) swap.push(o);
    else if (lamps.tail?.test(n)) { const m = o.material.clone(); m.emissive = new THREE.Color(0xff2a1a); m.emissiveIntensity = 0; o.material = m; mats.tailGlass = m; }
  });
  for (const o of swap) {                                   // (one mesh for all the lights: front half head, rear half tail)
    o.updateMatrixWorld(true);
    const g = bake(o.geometry, o.matrixWorld), pos = g.attributes.position, F = [], R = [];
    for (let i = 0; i < pos.count; i += 3) ((pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 > 0 ? F : R).push(i);
    const inv = new THREE.Matrix4().copy(o.parent.matrixWorld).invert();
    const head = new THREE.Mesh(subset(g, F).applyMatrix4(inv), mats.head), tail = new THREE.Mesh(subset(g, R).applyMatrix4(inv), mats.tail);
    o.parent.add(head, tail); o.parent.remove(o);
  }
  const bb = new THREE.Box3().setFromObject(model), dims = bb.getSize(new THREE.Vector3());
  root.add(contactShadow(dims.x + 0.25, dims.z + 0.35));
  const fr = wheels.filter((w) => w.front), re = wheels.filter((w) => !w.front);
  const zf = fr.reduce((s, w) => s + w.rest.z, 0) / fr.length, zr = re.reduce((s, w) => s + w.rest.z, 0) / re.length;
  const beams = [];
  for (const sx of [-1, 1]) {
    const sl = new THREE.SpotLight(0xfff1dd, 0, 0, 0.48, 0.5, 2);
    sl.position.set(sx * beamX, beamY, dims.z / 2 - 0.25); sl.target.position.set(sx * 0.9, 0, dims.z / 2 + 14);
    body.add(sl, sl.target); beams.push(sl);
  }
  const eyeO = new THREE.Object3D(); eyeO.position.set(...eye); body.add(eyeO);
  const cabin = new THREE.PointLight(0xfff4e8, 0, 2.6, 2); cabin.position.set(0, eye[1] + 0.05, eye[2] + 0.3); body.add(cabin);
  return { root, body, model, wheels, mats, beams, eye: eyeO, cabin, dims, steering: null, wheelbase: zf - zr, track: Math.abs(fr[0].rest.x - fr[1].rest.x), kind: 'car' };
}

// ---- a two-wheeler from one or a few meshes: its wheels, the steering (fork, handlebar, lamp, basket) and the
// pedal cranks are cut out of the triangles by where they are (positions in the file's own units).
//   o: { scale, flip (the file faces −Z), front: [z, y, r], rear: [z, y, r], halfWidth (of a wheel), axis: { at: [z, y],
//        dir: [dz, dy] } (the steering axis, up), steerBehind (how far behind the axis still turns), crank: [z, y, r], eye }
export async function loadTwoWheeler(url, o) {
  const gltf = await loader().loadAsync(url);
  const src = gltf.scene; src.updateMatrixWorld(true);
  const S = o.scale, F = o.flip ? -1 : 1;
  const ground = o.front[1] - o.front[2], midZ = (o.front[0] + o.rear[0]) / 2;
  // native → metres, facing +Z, the wheels' contact on y = 0, centred between the axles
  const M = new THREE.Matrix4().makeScale(S * F, S, S * F).multiply(new THREE.Matrix4().makeTranslation(0, -ground, -midZ));
  // stood upright and centred, if it's modelled leaning on its stand (o.upright: [x at the ground, lean per metre up])
  if (o.upright) M.premultiply(new THREE.Matrix4().makeRotationZ(Math.atan(o.upright[1]))).premultiply(new THREE.Matrix4().makeTranslation(-o.upright[0], 0, 0));
  const P = (z, y) => new THREE.Vector3(0, y, z).applyMatrix4(M);
  const ax = new THREE.Vector2(o.axis.dir[0], o.axis.dir[1]).normalize();      // (z, y) along the steering axis, up
  const sets = { body: [], bars: [], front: [], rear: [], crank: [] };
  src.traverse((m) => {
    if (!m.isMesh) return;
    const g = bake(m.geometry, m.matrixWorld), p = g.attributes.position, idx = { body: [], bars: [], front: [], rear: [], crank: [] };
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const inWheel = (w) => Math.abs(x) < o.halfWidth && Math.hypot(z - w[0], y - w[1]) < w[2];
      // ahead of the steering axis (less steerBehind) = turns with the handlebar; (z, y) measured across the axis
      const dz = z - o.axis.at[0], dy = y - o.axis.at[1], across = (dz * ax.y - dy * ax.x) * (o.flip ? -1 : 1);
      if (inWheel(o.front)) idx.front.push(i);
      else if (inWheel(o.rear)) idx.rear.push(i);
      else if (o.crank && Math.hypot(z - o.crank[0], y - o.crank[1]) < o.crank[2]) idx.crank.push(i);
      else if ((o.steerBehind != null && across > -o.steerBehind) || (o.barsAbove != null && y > o.barsAbove && across > -o.barsBehind)) idx.bars.push(i);
      else idx.body.push(i);
    }
    for (const [k, list] of Object.entries(idx)) if (list.length) sets[k].push({ geo: subset(g, list).applyMatrix4(M), material: m.material });
  });
  // the steering as modelled may be turned a little (the bicycle's is, 13°): turned straight about its axis
  const turnBack = o.steerRest ? new THREE.Matrix4().makeTranslation(...P(o.axis.at[0], o.axis.at[1]).toArray())
    .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, ax.y, ax.x * F).normalize(), o.steerRest))
    .multiply(new THREE.Matrix4().makeTranslation(...P(o.axis.at[0], o.axis.at[1]).negate().toArray())) : null;
  if (turnBack) for (const pc of [...sets.bars, ...sets.front]) pc.geo.applyMatrix4(turnBack);
  // the saddle lowered for her (o.saddleDrop: { box: [x0, x1, y0, y1, z0, z1] in metres, dy }): the triangles
  // of the saddle and the top of the seatpost slide down, the post into the frame's tube
  if (o.saddleDrop) {
    const [x0, x1, y0, y1, z0, z1] = o.saddleDrop.box;
    for (const pc of sets.body) {
      const p = pc.geo.attributes.position, a = p.array;
      for (let i = 0; i < p.count; i += 3) {
        const cx = (a[i * 3] + a[i * 3 + 3] + a[i * 3 + 6]) / 3, cy = (a[i * 3 + 1] + a[i * 3 + 4] + a[i * 3 + 7]) / 3, cz = (a[i * 3 + 2] + a[i * 3 + 5] + a[i * 3 + 8]) / 3;
        if (cx > x0 && cx < x1 && cy > y0 && cy < y1 && cz > z0 && cz < z1) for (let k = 0; k < 3; k++) a[(i + k) * 3 + 1] += o.saddleDrop.dy;
      }
      p.needsUpdate = true;
    }
  }
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const add = (parent, pieces, at) => { for (const pc of pieces) { if (at) pc.geo.translate(-at.x, -at.y, -at.z); const mesh = new THREE.Mesh(pc.geo, pc.material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); } };
  add(body, sets.body);
  // the steering: a frame on the axis (its local Y along it), turning about Y; the front wheel and the bars on it
  const pivot = P(o.axis.at[0], o.axis.at[1]), dirW = new THREE.Vector3(0, ax.y, ax.x * F).normalize();
  const steerBase = new THREE.Group(); steerBase.position.copy(pivot); steerBase.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirW);
  const steerRot = new THREE.Group(); steerBase.add(steerRot); body.add(steerBase);
  steerBase.updateMatrixWorld(true);
  const toSteer = new THREE.Matrix4().copy(steerBase.matrixWorld).invert();
  for (const pc of sets.bars) pc.geo.applyMatrix4(toSteer);
  add(steerRot, sets.bars);
  const wheelOf = (w, parent, frontWheel) => {
    const c = P(w[0], w[1]), axle = new THREE.Group(), spin = new THREE.Group();
    if (frontWheel && turnBack) c.applyMatrix4(turnBack);
    const pieces = frontWheel ? sets.front : sets.rear;
    for (const pc of pieces) pc.geo.translate(-c.x, -c.y, -c.z);                // (in the bike's own frame, about the hub)
    axle.position.copy(frontWheel ? c.clone().applyMatrix4(toSteer) : c);
    // (the axle frame: spin about its local X, the bike's across)
    if (frontWheel) axle.quaternion.copy(steerBase.quaternion).invert();
    axle.add(spin); add(spin, pieces); parent.add(axle);
    return { q: frontWheel ? 'F' : 'R', front: frontWheel, left: false, axle, steer: new THREE.Group(), spin, radius: w[2] * S, rest: c.clone() };
  };
  const wheels = [wheelOf(o.front, steerRot, true), wheelOf(o.rear, body, false)];
  let crank = null;
  if (sets.crank.length) { const c = P(o.crank[0], o.crank[1]); crank = new THREE.Group(); crank.position.copy(c); for (const pc of sets.crank) pc.geo.translate(-c.x, -c.y, -c.z); add(crank, sets.crank); body.add(crank); }
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root), dims = bb.getSize(new THREE.Vector3());
  root.add(contactShadow(0.7, dims.z + 0.2));
  const mats = { head: lampMat(0xf4f4f0, 0xfff6e8), tail: lampMat(0x6e0d0d, 0xff2a1a), reverse: lampMat(0xdddddd, 0xffffff) };
  const beams = [];
  if (o.lamp) { const lp = P(o.lamp[0], o.lamp[1]); if (turnBack) lp.applyMatrix4(turnBack); const sl = new THREE.SpotLight(0xfff1dd, 0, 0, 0.42, 0.5, 2); sl.position.copy(lp).applyMatrix4(toSteer); sl.target.position.set(lp.x, 0, lp.z + 14).applyMatrix4(toSteer); steerRot.add(sl, sl.target); beams.push(sl); }
  const eye = new THREE.Object3D(); eye.position.set(...o.eye); body.add(eye);
  return { root, body, model: body, wheels, mats, beams, eye, cabin: null, dims, steering: null, steerRot, crank, wheelbase: Math.abs(P(o.front[0], 0).z - P(o.rear[0], 0).z), track: 0.12, kind: o.kind };
}
