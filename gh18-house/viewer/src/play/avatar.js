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

const strip = (n) => n.replace(/^mixamorig\d*:?/, '').replace(/_\d+$/, '');          // (Mixamo: mixamorig:Hips, mixamorig2Hips…)
// her figure is drawn on its own layer: the camera and the sun's shadows see it, the sea's reflection doesn't
export const AVATAR_LAYER = 2;
const MIXAMO_HIPS = 98;           // Mixamo's standing hip height (cm), for scaling the clips' hip height to hers
const W = { idle: 0, walk: 0, run: 0, sit: 0, drive: 0, ride: 0, pedal: 0, jump: 0, climb: 0 };

export async function loadAvatar(url, height = 1.62) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene, root = new THREE.Group();
  root.add(model);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone || o.type === 'Bone' || /_\d+$/.test(o.name)) bones[strip(o.name)] = bones[strip(o.name)] || o;
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.layers.set(AVATAR_LAYER); }
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
  model.updateMatrixWorld(true);
  // bounds for skipping her when she's off screen: each part's, from her standing pose, grown by 0.8 m (her
  // arms out, her legs bent, sitting)
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.computeBoundingSphere();
    o.boundingSphere.radius += 0.8 / o.matrixWorld.getMaxScaleOnAxis();
  });
  // her idle, always playing underneath; Mixamo clips (if given) on top
  const mixer = new THREE.AnimationMixer(model);
  const idle = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]) : null;
  idle?.play();
  const clips = {};
  const hipsRest = bones.Hips.position.clone();
  const rest = Object.values(bones).map((b) => [b, b.quaternion.clone()]);
  const wp1 = new THREE.Vector3(), wp2 = new THREE.Vector3(), len = (a, b) => (bones[a] && bones[b] ? bones[a].getWorldPosition(wp1).distanceTo(bones[b].getWorldPosition(wp2)) : 0);
  const palmLen = len('LeftHand', 'LeftHandMiddle1') || 0.09, footLen = len('LeftFoot', 'LeftToeBase') || 0.1;
  const armLen = len('LeftArm', 'LeftForeArm') + len('LeftForeArm', 'LeftHand');
  // first person on a two-wheeler: her eyes (between the eyeballs, in the head's own frame) and the parts of her
  // that would be in front of them (head, hair, eyes, sunglasses) hidden; her body, arms and hands stay
  const headParts = [], eyes = [];
  model.traverse((o) => {
    const n = o.material?.name || '';
    if (!o.isMesh) return;
    if (/AvatarHead|haircut|Cornea|Eyeball|glasses|Eyelashes|Teeth/.test(n)) headParts.push(o);
    if (/Eyeball/.test(n)) eyes.push(new THREE.Box3().setFromObject(o, true).getCenter(new THREE.Vector3()));
  });
  const eyeLocal = eyes.length ? bones.Head.worldToLocal(eyes.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / eyes.length)) : null;
  let fp = false;
  const firstPerson = (on) => { if (on === fp) return; fp = on; for (const o of headParts) o.visible = !on; };
  const eyeWorld = (out) => (eyeLocal ? bones.Head.localToWorld(out.copy(eyeLocal)) : bones.Head.getWorldPosition(out));     // (the made moves turn bones the clips may not touch)

  // ---- the moves made here: rotations about her own axes, applied after the idle
  const L = new THREE.Vector3(), F = new THREE.Vector3(), U = new THREE.Vector3(), tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), ax = new THREE.Vector3();
  const turn = (bone, axisW, a) => {          // rotate a bone about a world axis by a (its parent's frame)
    if (!bone || !a) return;
    bone.parent.getWorldQuaternion(pq);
    ax.copy(axisW).applyQuaternion(pq.invert());
    bone.quaternion.premultiply(tq.setFromAxisAngle(ax, a));
    bone.updateMatrixWorld(true);
  };
  // aim a bone so that a point now at `from` (world; on a child) lies on the line to `to`
  const bp = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3(), qd = new THREE.Quaternion(), qw = new THREE.Quaternion();
  const aim = (bone, from, to) => {
    bone.getWorldPosition(bp);
    va.subVectors(from, bp).normalize(); vb.subVectors(to, bp).normalize();
    qd.setFromUnitVectors(va, vb);
    bone.getWorldQuaternion(qw); qw.premultiply(qd);
    bone.parent.getWorldQuaternion(pq);
    bone.quaternion.copy(pq.invert().multiply(qw));
    bone.updateMatrixWorld(true);
  };
  // two-bone IK: upper → mid → end reaches `target` (world), the bend towards `pole` (a world direction)
  const A = new THREE.Vector3(), Bm = new THREE.Vector3(), C = new THREE.Vector3(), T = new THREE.Vector3(), Kn = new THREE.Vector3(), D = new THREE.Vector3(), Pp = new THREE.Vector3();
  const ik = (upper, mid, end, target, pole) => {
    upper.getWorldPosition(A); mid.getWorldPosition(Bm); end.getWorldPosition(C);
    const l1 = A.distanceTo(Bm), l2 = Bm.distanceTo(C);
    T.copy(target); D.subVectors(T, A);
    const dist = THREE.MathUtils.clamp(D.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    D.normalize(); T.copy(A).addScaledVector(D, dist);
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    Pp.copy(pole).addScaledVector(D, -pole.dot(D)).normalize();
    Kn.copy(A).addScaledVector(D, cosA * l1).addScaledVector(Pp, sinA * l1);
    aim(upper, Bm, Kn);
    end.getWorldPosition(C);
    aim(mid, C, T);
  };
  const tgt = new THREE.Vector3(), pole = new THREE.Vector3(), sh = new THREE.Vector3(), gr = new THREE.Vector3(), sp0 = new THREE.Vector3();
  // turn a hand so that wrist → knuckles lies along d and pinky → index along t (both world directions)
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), qa = new THREE.Quaternion(), va2 = new THREE.Vector3(), vb2 = new THREE.Vector3(), vc2 = new THREE.Vector3(), vd2 = new THREE.Vector3();
  const orient = (hand, mid, index, pinky, d, t) => {
    if (!hand || !mid || !index || !pinky) return;
    hand.getWorldPosition(bp);
    va2.copy(mid.getWorldPosition(vd2)).sub(bp).normalize();
    vb2.copy(index.getWorldPosition(vd2)).sub(pinky.getWorldPosition(vc2)); vb2.addScaledVector(va2, -vb2.dot(va2)).normalize();
    m1.makeBasis(va2, vb2, vc2.crossVectors(va2, vb2));
    const tt = vd2.copy(t).addScaledVector(d, -t.dot(d)).normalize();
    m2.makeBasis(d, tt, new THREE.Vector3().crossVectors(d, tt));
    qa.setFromRotationMatrix(m2.multiply(m1.transpose()));            // (current frame → wanted frame)
    hand.getWorldQuaternion(qw); qw.premultiply(qa);
    hand.parent.getWorldQuaternion(pq); hand.quaternion.copy(pq.invert().multiply(qw));
    hand.updateMatrixWorld(true);
  };
  // bend a finger joint towards the palm (n: the way the palm faces)
  const curl = (bone, child, n, a) => {
    if (!bone || !child) return;
    bone.getWorldPosition(bp); child.getWorldPosition(vd2);
    turn(bone, vc2.subVectors(vd2, bp).normalize().cross(n).normalize(), a);
  };
  let phase = 0;
  const w = { ...W, idle: 1 };
  let modeNow = 'idle';
  function update(dt, { mode = 'idle', speed = 0, crank = 0, rig = null, enter = null } = {}) {
    modeNow = enter ? 'enter' : mode;
    if (enter) {
      // getting into a car: the clip at time enter.t (mirrored for a right-hand drive), nothing else
      for (const m in w) w[m] = 0;
      for (const act of Object.values(clips)) act.setEffectiveWeight(0);
      const a = enter.mirror ? once.enterM : once.enter;
      (enter.mirror ? once.enter : once.enterM).setEffectiveWeight(0);
      a.setEffectiveWeight(1); a.time = Math.min(enter.t, a.getClip().duration - 1e-3);
      if (idle) idle.setEffectiveWeight(0.001);
      for (const [b, q] of rest) b.quaternion.copy(q);
      mixer.update(0);
      model.updateMatrixWorld(true);
      return;
    }
    if (once.enter) { once.enter.setEffectiveWeight(0); once.enterM.setEffectiveWeight(0); }
    for (const m in w) w[m] += ((m === mode ? 1 : 0) - w[m]) * (1 - Math.exp(-(m === 'jump' || m === 'climb' || mode === 'jump' ? 16 : 8) * dt));
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
    // in the air: knees drawn up, arms forward for balance; climbing: arms reaching up over the ledge, a knee up
    const wj = clips.jump ? 0 : w.jump, wc = clips.climb ? 0 : w.climb;
    if (wj > 0.01) {
      turn(B.LeftUpLeg, L, -0.75 * wj); turn(B.RightUpLeg, L, -0.3 * wj); turn(B.LeftLeg, L, 1.15 * wj); turn(B.RightLeg, L, 0.55 * wj);
      turn(B.LeftArm, L, -0.8 * wj); turn(B.RightArm, L, -0.5 * wj); turn(B.LeftForeArm, L, -0.4 * wj); turn(B.RightForeArm, L, -0.5 * wj);
      turn(B.Spine, L, 0.12 * wj);
    }
    if (wc > 0.01) {
      turn(B.LeftArm, L, -2.5 * wc); turn(B.RightArm, L, -2.5 * wc); turn(B.LeftForeArm, L, -0.35 * wc); turn(B.RightForeArm, L, -0.35 * wc);
      turn(B.LeftUpLeg, L, -1.1 * wc); turn(B.LeftLeg, L, 1.5 * wc); turn(B.RightUpLeg, L, -0.3 * wc); turn(B.RightLeg, L, 0.5 * wc);
      turn(B.Spine, L, 0.3 * wc);
    }
    // seated (a car, the Vespa, the bicycle, a sofa)
    // (a move with a Mixamo clip is the clip's alone: the made one stands aside)
    const ws = clips.sit ? 0 : w.sit, wd = clips.drive ? 0 : w.drive;
    const sit = ws + wd + w.ride + w.pedal;
    if (sit > 0.01) {
      const knee = ws * 1.5 + wd * 1.3 + w.ride * 1.25 + w.pedal * 1.0;
      let lt = 0, rt = 0, lk = 0, rk = 0;
      if (w.pedal > 0.01) { lt = Math.sin(crank) * 0.32 * w.pedal; rt = -lt; lk = Math.sin(crank + 1.6) * 0.45 * w.pedal; rk = -lk; }
      turn(B.LeftUpLeg, L, -(1.45 * (ws + wd) + 1.3 * w.ride + 1.05 * w.pedal) + lt);
      turn(B.RightUpLeg, L, -(1.45 * (ws + wd) + 1.3 * w.ride + 1.05 * w.pedal) + rt);
      turn(B.LeftLeg, L, knee + lk); turn(B.RightLeg, L, knee + rk);
      // hands forward: on the wheel, on the handlebar
      const reach = wd * 0.95 + w.ride * 0.85 + w.pedal * 0.9;
      turn(B.LeftArm, L, -reach); turn(B.RightArm, L, -reach);
      turn(B.LeftForeArm, L, -reach * 0.45); turn(B.RightForeArm, L, -reach * 0.45);
      turn(B.Spine, L, 0.06 * w.pedal + 0.03 * w.ride);
      B.Hips.position.y = hipsRest.y - 0.02 * sit / k;
    }
    // on a two-wheeler (rig: world-space targets, worked out by main.js from the vehicle as it is this frame):
    //   hip       where her hips go (on the saddle; or, stopped on the bicycle, standing astride it)
    //   hands[i]  { c: the grip's centre, g: along the grip, outward } (left, right): the grip runs through her
    //             palm, the palm on top of it, index finger on its inner end, fingers and thumb closed round it
    //   feet[i]   { ball: where the ball of her foot goes, dir: the way her foot points }
    if (rig) {
      B.Hips.position.copy(B.Hips.parent.worldToLocal(tgt.copy(rig.hip)));
      B.Hips.updateMatrixWorld(true);
      // where her wrists must be, and how her hands must be turned, for each grip
      const hands = rig.hands.map((h, i) => {
        const g = h.g.clone().normalize(), n = new THREE.Vector3(0, -1, 0).addScaledVector(g, g.y).normalize();   // palm faces down onto it
        const t = g.clone().negate();                                  // the index finger's side: inward along the grip
        const d = i === 0 ? t.clone().cross(n) : n.clone().cross(t);   // wrist → knuckles (a left hand is the mirror of a right)
        const wrist = h.c.clone().addScaledVector(n, -0.032).addScaledVector(d, -palmLen * 0.82);
        return { n, t, d, wrist };
      });
      // lean forward from the hips until the grips are in comfortable reach (elbows a little bent)
      gr.copy(hands[0].wrist).add(hands[1].wrist).multiplyScalar(0.5);
      for (let i = 0; i < 16; i++) {
        B.LeftArm.getWorldPosition(sh); B.RightArm.getWorldPosition(sp0); sh.add(sp0).multiplyScalar(0.5);
        if (sh.distanceTo(gr) <= armLen * 0.9) break;
        turn(B.Spine, L, 0.035); turn(B.Spine1, L, 0.02); turn(B.Spine2, L, 0.01);
      }
      turn(B.Neck, L, -0.12); turn(B.Head, L, -0.12);                // (eyes up the road)
      for (const [side, i] of [['Left', 0], ['Right', 1]]) {
        const s = i ? -1 : 1, f = rig.feet[i], h = hands[i];
        // the leg: the ankle where the ball of the foot lands on its spot, the knee forward and a little out
        tgt.copy(f.ball).addScaledVector(f.dir, -footLen).addScaledVector(U, 0.045);
        pole.copy(F).addScaledVector(L, s * 0.12).addScaledVector(U, 0.2);
        ik(B[side + 'UpLeg'], B[side + 'Leg'], B[side + 'Foot'], tgt, pole);
        B[side + 'ToeBase'].getWorldPosition(sp0); tgt.copy(f.ball).addScaledVector(U, 0.045);
        aim(B[side + 'Foot'], sp0, tgt);
        // the arm: elbows down and a little out
        pole.copy(L).multiplyScalar(s * 0.6).addScaledVector(U, -1).addScaledVector(F, -0.2);
        ik(B[side + 'Arm'], B[side + 'ForeArm'], B[side + 'Hand'], h.wrist, pole);
        // the hand turned onto the grip: its knuckles along d, its thumb side along t
        orient(B[side + 'Hand'], B[side + 'HandMiddle1'], B[side + 'HandIndex1'], B[side + 'HandPinky1'], h.d, h.t);
        // fingers closed round the grip, the thumb under it
        for (const fg of ['Index', 'Middle', 'Ring', 'Pinky']) [1.0, 1.25, 0.85].forEach((a, j) => curl(B[side + 'Hand' + fg + (j + 1)], B[side + 'Hand' + fg + (j + 2)], h.n, a));
        [0.25, 0.55, 0.45].forEach((a, j) => curl(B[side + 'HandThumb' + (j + 1)], B[side + 'HandThumb' + (j + 2)], h.n, a));
      }
    }
  }
  // a Mixamo clip for a move (play/models/anims/<move>.fbx): its tracks renamed to her bones; in place
  const once = {};
  function addClip(move, clip) {
    if (move === 'enter') return addOnce(clip);
    clip.tracks = clip.tracks.filter((t) => {
      const [node, prop] = t.name.split('.');
      const b = bones[strip(node)];
      if (!b) return false;
      if (prop === 'position' && strip(node) !== 'Hips') return false;
      t.name = b.name + '.' + prop;
      if (prop === 'position') { const f = hipsRest.y / MIXAMO_HIPS; for (let i = 0; i < t.values.length; i += 3) { t.values[i] = 0; t.values[i + 2] = 0; t.values[i + 1] *= f; } }   // (her units; in place; sitting stays lower)
      return true;
    });
    const act = mixer.clipAction(clip); act.setEffectiveWeight(0); act.play();
    clips[move] = act;
  }
  // getting into a car: the hips keep their path (she walks up, turns, sits), in her units. A mirrored copy for
  // a right-hand drive car: left and right swapped, reflected across her own left-right (x)
  function addOnce(clip) {
    const f = hipsRest.y / MIXAMO_HIPS;
    clip.tracks = clip.tracks.filter((t) => {
      const [node, prop] = t.name.split('.');
      const b = bones[strip(node)];
      if (!b) return false;
      if (prop === 'position' && strip(node) !== 'Hips') return false;
      t.name = strip(node) + '.' + prop;                                     // (canonical for now: mirrored below)
      if (prop === 'position') for (let i = 0; i < t.values.length; i++) t.values[i] *= f;
      return true;
    });
    const mir = clip.clone();
    for (const t of mir.tracks) {
      const [node, prop] = t.name.split('.');
      t.name = node.replace(/^Left/, '#').replace(/^Right/, 'Left').replace(/^#/, 'Right') + '.' + prop;
      const v = t.values;
      if (prop === 'position') for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
      else for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
    }
    for (const c of [clip, mir]) for (const t of c.tracks) { const [node, prop] = t.name.split('.'); t.name = bones[node].name + '.' + prop; }
    for (const [k, c] of [['enter', clip], ['enterM', mir]]) {
      const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(0); a.play(); a.paused = true;
      once[k] = a;
    }
  }
  // where her hips are at the end of getting in (her root at the origin, facing +Z), to line it up with a seat
  const hv2 = new THREE.Vector3();
  function enterEnd(mirror) {
    const rp = root.position.clone(), rq = root.quaternion.clone();
    root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
    update(0, { enter: { t: 1e9, mirror } });
    bones.Hips.getWorldPosition(hv2);
    const out = hv2.clone();
    root.position.copy(rp); root.quaternion.copy(rq); root.updateMatrixWorld(true);
    return out;
  }
  function snap(mode) { for (const m in w) w[m] = m === mode ? 1 : 0; }
  // where her head is, seated in a move, from her feet (root) — to put her eyes where a vehicle's driver's eyes are
  const hv = new THREE.Vector3();
  function headIn(mode) {
    const keep = { ...w }, ph = phase, rp = root.position.clone(), rq = root.quaternion.clone();
    root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
    for (const m in w) w[m] = m === mode ? 1 : 0;
    update(0, { mode });
    bones.Head.getWorldPosition(hv);
    const out = hv.clone();
    out.hips = bones.Hips.getWorldPosition(new THREE.Vector3());
    Object.assign(w, keep); phase = ph; root.position.copy(rp); root.quaternion.copy(rq); root.updateMatrixWorld(true);
    return out;
  }
  return { root, model, bones, update, addClip, headIn, enterEnd, snap, firstPerson, eyeWorld, get canEnter() { return !!once.enter; }, get enterDur() { return once.enter?.getClip().duration || 0; }, get mode() { return modeNow; }, height };
}
