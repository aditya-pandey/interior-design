import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Her figure ("Modern Indian Woman" by Pixel_Monster, CC BY 4.0): a Mixamo-style skeleton with a standing idle.
//
// Moves: idle · walk · run · sit (a sofa, the floor cushions) · drive (in a car, hands on the wheel) · ride (the
// Vespa) · pedal (her bicycle). Motion-captured clips from Mixamo replace any of these when their files are in
// play/models/anims/ (walk.fbx, run.fbx, sit.fbx, drive.fbx: FBX, without skin, in place); until then each is
// made here, on top of her idle (the breathing and the small shifts of weight stay): legs and arms swing about
// her own left-right axis, knees and elbows bend, the hips bob. Every move fades into the next.
//
//   const her = await loadAvatar(url); scene.add(her.root);
//   her.update(dt, { mode, speed, crank })      root: her feet, facing +Z (turn it with root.rotation.y)

const strip = (n) => n.replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
const W = { idle: 0, walk: 0, run: 0, sit: 0, drive: 0, ride: 0, pedal: 0 };

export async function loadAvatar(url, height = 1.62) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene, root = new THREE.Group();
  root.add(model);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone || o.type === 'Bone' || /_\d+$/.test(o.name)) bones[strip(o.name)] = bones[strip(o.name)] || o;
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  // her height: the top of her head at `height`
  model.updateMatrixWorld(true);
  const top = new THREE.Vector3(); (bones.HeadTop_End || bones.Head).getWorldPosition(top);
  const foot = new THREE.Vector3(); (bones.LeftToe_End || bones.LeftFoot).getWorldPosition(foot);
  const k = height / Math.max(0.5, top.y - Math.min(0, foot.y));
  model.scale.multiplyScalar(k);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  // her idle, always playing underneath; Mixamo clips (if given) on top
  const mixer = new THREE.AnimationMixer(model);
  const idle = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]) : null;
  idle?.play();
  const clips = {};
  const hipsRest = bones.Hips.position.clone();
  const rest = Object.values(bones).map((b) => [b, b.quaternion.clone()]);     // (the made moves turn bones the clips may not touch)

  // ---- the moves made here: rotations about her own axes, applied after the idle
  const L = new THREE.Vector3(), F = new THREE.Vector3(), U = new THREE.Vector3(), tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), ax = new THREE.Vector3();
  const turn = (bone, axisW, a) => {          // rotate a bone about a world axis by a (its parent's frame)
    if (!bone || !a) return;
    bone.parent.getWorldQuaternion(pq);
    ax.copy(axisW).applyQuaternion(pq.invert());
    bone.quaternion.premultiply(tq.setFromAxisAngle(ax, a));
    bone.updateMatrixWorld(true);
  };
  let phase = 0;
  const w = { ...W, idle: 1 };
  let modeNow = 'idle';
  function update(dt, { mode = 'idle', speed = 0, crank = 0 } = {}) {
    modeNow = mode;
    for (const m in w) w[m] += ((m === mode ? 1 : 0) - w[m]) * (1 - Math.exp(-8 * dt));
    // a Mixamo clip, if there is one for this move, plays at its weight (the made move then stands aside)
    for (const [m, act] of Object.entries(clips)) { act.setEffectiveWeight(w[m]); if (m === 'walk' || m === 'run') act.setEffectiveTimeScale(Math.max(0.4, speed / (m === 'run' ? 3.6 : 1.4))); }
    let cw = 0; for (const m in clips) cw += w[m];
    if (idle) idle.setEffectiveWeight(Math.max(0.001, 1 - cw));          // (the mixer averages by weight: the idle steps aside)
    for (const [b, q] of rest) b.quaternion.copy(q);
    mixer.update(dt);
    model.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    // her axes in the world: L to her left, F ahead, U up
    root.getWorldQuaternion(tq); L.set(1, 0, 0).applyQuaternion(tq); F.set(0, 0, 1).applyQuaternion(tq); U.set(0, 1, 0).applyQuaternion(tq);
    const B = bones;
    // walking and running: a stride for every 1.3 m (walk) or 2.2 m (run)
    const gait = clips.walk ? 0 : w.walk, runW = clips.run ? 0 : w.run;
    const amp = gait + runW * 1.6;
    if (amp > 0.01) {
      phase += dt * Math.max(speed, 0.6) / (runW > 0.5 ? 2.2 : 1.3) * Math.PI * 2;
      const s = Math.sin(phase), c = Math.cos(phase);
      turn(B.LeftUpLeg, L, -s * 0.42 * amp); turn(B.RightUpLeg, L, s * 0.42 * amp);
      turn(B.LeftLeg, L, (0.12 + 0.6 * Math.max(0, Math.sin(phase + 1.3))) * amp); turn(B.RightLeg, L, (0.12 + 0.6 * Math.max(0, Math.sin(phase + 1.3 + Math.PI))) * amp);
      turn(B.LeftFoot, L, -0.15 * Math.max(0, -s) * amp); turn(B.RightFoot, L, -0.15 * Math.max(0, s) * amp);
      turn(B.LeftArm, L, s * 0.32 * amp); turn(B.RightArm, L, -s * 0.32 * amp);
      turn(B.LeftForeArm, L, -0.18 * amp - Math.max(0, s) * 0.2 * amp); turn(B.RightForeArm, L, -0.18 * amp - Math.max(0, -s) * 0.2 * amp);
      turn(B.Spine1, U, c * 0.05 * amp); turn(B.Spine, L, -0.05 * runW);
      B.Hips.position.y = hipsRest.y - (Math.abs(c) * 0.025 * amp + 0.07 * runW) / k;
    } else B.Hips.position.y = hipsRest.y;
    // seated (a car, the Vespa, the bicycle, a sofa)
    const sit = w.sit + w.drive + w.ride + w.pedal;
    if (sit > 0.01) {
      const knee = w.sit * 1.5 + w.drive * 1.3 + w.ride * 1.25 + w.pedal * 1.0;
      let lt = 0, rt = 0, lk = 0, rk = 0;
      if (w.pedal > 0.01) { lt = Math.sin(crank) * 0.32 * w.pedal; rt = -lt; lk = Math.sin(crank + 1.6) * 0.45 * w.pedal; rk = -lk; }
      turn(B.LeftUpLeg, L, -(1.45 * (w.sit + w.drive) + 1.3 * w.ride + 1.05 * w.pedal) + lt);
      turn(B.RightUpLeg, L, -(1.45 * (w.sit + w.drive) + 1.3 * w.ride + 1.05 * w.pedal) + rt);
      turn(B.LeftLeg, L, knee + lk); turn(B.RightLeg, L, knee + rk);
      // hands forward: on the wheel, on the handlebar
      const reach = w.drive * 0.95 + w.ride * 0.85 + w.pedal * 0.9;
      turn(B.LeftArm, L, -reach); turn(B.RightArm, L, -reach);
      turn(B.LeftForeArm, L, -reach * 0.45); turn(B.RightForeArm, L, -reach * 0.45);
      turn(B.Spine, L, 0.06 * w.pedal + 0.03 * w.ride);
      B.Hips.position.y = hipsRest.y - 0.02 * sit / k;
    }
  }
  // a Mixamo clip for a move (play/models/anims/<move>.fbx): its tracks renamed to her bones; in place
  function addClip(move, clip) {
    clip.tracks = clip.tracks.filter((t) => {
      const [node, prop] = t.name.split('.');
      const b = bones[strip(node)];
      if (!b) return false;
      if (prop === 'position' && strip(node) !== 'Hips') return false;
      t.name = b.name + '.' + prop;
      if (prop === 'position') { const f = hipsRest.y / (t.values[1] || 1); for (let i = 0; i < t.values.length; i += 3) { t.values[i] = 0; t.values[i + 2] = 0; t.values[i + 1] *= f; } }   // (her units, not Mixamo's; in place)
      return true;
    });
    const act = mixer.clipAction(clip); act.setEffectiveWeight(0); act.play();
    clips[move] = act;
  }
  // where her head is, seated in a move, from her feet (root) — to put her eyes where a vehicle's driver's eyes are
  const hv = new THREE.Vector3();
  function headIn(mode) {
    const keep = { ...w }, ph = phase, rp = root.position.clone(), rq = root.quaternion.clone();
    root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
    for (const m in w) w[m] = m === mode ? 1 : 0;
    update(0, { mode });
    bones.Head.getWorldPosition(hv);
    const out = hv.clone();
    Object.assign(w, keep); phase = ph; root.position.copy(rp); root.quaternion.copy(rq); root.updateMatrixWorld(true);
    return out;
  }
  return { root, model, bones, update, addClip, headIn, get mode() { return modeNow; }, height };
}
