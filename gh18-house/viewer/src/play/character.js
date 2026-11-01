import * as THREE from 'three';

// Her: a stylised figure built from simple shapes (no scan of her face), dressed and styled from the
// owner's photos: long dark-brown hair with a side-swept fringe and locks falling over the front,
// translucent mauve rectangular glasses, a small bindi, a warm smile; black turtleneck under a cream
// knit vest, black trousers, black sneakers with white soles, a rose-gold watch on her left wrist.
// ~1.60 m tall. Local +Z is her front; feet at y = 0.
//
// A small joint hierarchy is animated by hand: walk, idle (breathing, blinking), sit, drive, lie.

const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0xd8a385, roughness: 0.62 }),
  skinShade: new THREE.MeshStandardMaterial({ color: 0xc98f72, roughness: 0.65 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x2a1913, roughness: 0.42, metalness: 0.05 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.85 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.95, side: THREE.DoubleSide }),
  sole: new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.6 }),
  lips: new THREE.MeshStandardMaterial({ color: 0xb85a5e, roughness: 0.45 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.25 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  bindi: new THREE.MeshStandardMaterial({ color: 0x2a0a0d, roughness: 0.5 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x8d7a88, roughness: 0.35, transparent: true, opacity: 0.85 }),
  lens: new THREE.MeshPhysicalMaterial({ color: 0xe4ecf2, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }),
  watch: new THREE.MeshStandardMaterial({ color: 0xcf9f86, roughness: 0.25, metalness: 0.9 }),
};

const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
const ellipsoid = (rx, ry, rz, seg = 20) => { const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)); g.scale(rx, ry, rz); return g; };
const capsule = (r, len, down = true) => { const g = new THREE.CapsuleGeometry(r, len, 6, 14); if (down) g.translate(0, -len / 2 - r * 0.4, 0); return g; };

function lathe(profile, sz, seg = 28) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(1, 1, sz);
  return g;
}

export function buildCharacter() {
  const root = new THREE.Group();
  root.name = 'her';
  const J = {};
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); J[name] = g; return g; };

  // ---- hips and legs
  const hips = joint('hips', root, 0, 0.82, 0);
  hips.add(mesh(ellipsoid(0.15, 0.1, 0.105), MAT.black));
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const thigh = joint('thigh' + side, hips, s * 0.082, -0.02, 0);
    const tg = capsule(0.066, 0.34); tg.scale(1, 1, 1.05);
    thigh.add(mesh(tg, MAT.black));
    const knee = joint('knee' + side, thigh, 0, -0.39, 0);
    knee.add(mesh(capsule(0.052, 0.33), MAT.black));
    const ankle = joint('ankle' + side, knee, 0, -0.38, 0);
    const shoe = new THREE.Group();
    const upper = new THREE.BoxGeometry(0.09, 0.07, 0.24, 2, 2, 4);
    roundBox(upper, 0.03);
    upper.translate(0, -0.005, 0.055);
    shoe.add(mesh(upper, MAT.black));
    const sole = new THREE.BoxGeometry(0.096, 0.022, 0.25); roundBox(sole, 0.01); sole.translate(0, -0.04, 0.055);
    shoe.add(mesh(sole, MAT.sole));
    ankle.add(shoe);
  }

  // ---- torso: black turtleneck, cream knit vest over it
  const spine = joint('spine', hips, 0, 0.03, 0);
  spine.add(mesh(lathe([[0.001, -0.01], [0.13, -0.005], [0.125, 0.08], [0.108, 0.17], [0.12, 0.26], [0.142, 0.33], [0.138, 0.4], [0.1, 0.455], [0.045, 0.47]], 0.7), MAT.black));
  const vest = lathe([[0.138, -0.07], [0.134, 0.06], [0.118, 0.17], [0.13, 0.26], [0.152, 0.33], [0.148, 0.39], [0.12, 0.43], [0.06, 0.445]], 0.72, 32);
  spine.add(mesh(vest, MAT.cream));
  // the vest's side buttons, a detail from her photo
  for (const y of [0.0, 0.06, 0.12]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), MAT.sole); b.position.set(0.124, y, 0.03); spine.add(b); }
  const neck = joint('neck', spine, 0, 0.455, 0);
  neck.add(mesh(new THREE.CylinderGeometry(0.047, 0.052, 0.085, 18).translate(0, 0.035, 0), MAT.black));

  // ---- arms: black sleeves, hands; watch on the left wrist
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const sh = joint('shoulder' + side, spine, s * 0.168, 0.405, 0);
    sh.add(mesh(ellipsoid(0.047, 0.045, 0.046, 14), MAT.black));
    sh.add(mesh(capsule(0.044, 0.23), MAT.black));
    const el = joint('elbow' + side, sh, 0, -0.27, 0);
    el.add(mesh(capsule(0.037, 0.22), MAT.black));
    const wr = joint('wrist' + side, el, 0, -0.245, 0);
    const hand = ellipsoid(0.03, 0.075, 0.018, 14); hand.translate(0, -0.06, 0);
    wr.add(mesh(hand, MAT.skin));
    const thumb = capsule(0.011, 0.035); thumb.rotateZ(s * 0.5); thumb.translate(s * 0.02, -0.01, 0.012);
    wr.add(mesh(thumb, MAT.skin));
    if (side === 'L') { const w = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 8, 20), MAT.watch); w.rotation.x = Math.PI / 2; w.position.y = 0.012; wr.add(w); }
  }

  // ---- head
  const head = joint('head', neck, 0, 0.07, 0);
  const face = new THREE.Group(); face.position.y = 0.11; head.add(face);
  const skull = ellipsoid(0.092, 0.112, 0.1, 32);
  // a softer jaw: pull the lower front in a little
  const p = skull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.03) { const k = 1 - Math.min(1, (-0.03 - y) / 0.08) * 0.18; p.setX(i, p.getX(i) * k); }
  }
  skull.computeVertexNormals();
  face.add(mesh(skull, MAT.skin));
  for (const s of [1, -1]) {
    const ear = mesh(ellipsoid(0.014, 0.024, 0.01, 10), MAT.skinShade); ear.position.set(s * 0.09, 0.0, 0.0); face.add(ear);
    const eye = new THREE.Mesh(ellipsoid(0.0115, 0.0095, 0.006, 12), MAT.eye); eye.position.set(s * 0.032, 0.006, 0.091); face.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 4), MAT.white); glint.position.set(s * 0.032 + 0.004, 0.0095, 0.097); face.add(glint);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0045, 0.006), MAT.hair); brow.position.set(s * 0.034, 0.033, 0.091); brow.rotation.z = -s * 0.12; face.add(brow);
    J['eye' + (s > 0 ? 'L' : 'R')] = eye;
  }
  const nose = mesh(ellipsoid(0.0075, 0.014, 0.009, 12), MAT.skin); nose.position.set(0, -0.012, 0.097); face.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0042, 6, 16, Math.PI * 0.85), MAT.lips);
  smile.rotation.z = Math.PI + Math.PI * 0.075; smile.position.set(0, -0.039, 0.089); smile.scale.set(1, 0.55, 1); face.add(smile);
  const bindi = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 12), MAT.bindi); bindi.position.set(0, 0.052, 0.0905); bindi.rotation.x = -0.45; face.add(bindi);
  // glasses: two soft rectangles, a bridge, the arms back to the ears
  const frameShape = (w, h, r) => {
    const s = new THREE.Shape(); roundRect(s, -w / 2, -h / 2, w, h, r);
    const hole = new THREE.Path(); roundRect(hole, -w / 2 + 0.004, -h / 2 + 0.004, w - 0.008, h - 0.008, r * 0.7); s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: 6 });
  };
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(frameShape(0.05, 0.038, 0.01), MAT.frame); f.position.set(s * 0.034, 0.006, 0.1); face.add(f);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.032), MAT.lens); lens.position.set(s * 0.034, 0.006, 0.102); face.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.1), MAT.frame); arm.position.set(s * 0.087, 0.012, 0.055); face.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.004), MAT.frame); bridge.position.set(0, 0.012, 0.102); face.add(bridge);

  // ---- hair: a cap, a side-swept fringe, the long fall down her back, and locks over the front
  const hair = new THREE.Group(); face.add(hair);
  // crown: the top of the head down to the hairline at the front
  const cap = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.3);
  cap.scale(0.1, 0.121, 0.108); cap.translate(0, 0.006, -0.004);
  hair.add(mesh(cap, MAT.hair));
  // back and sides of the head, behind the ears (SphereGeometry: phi = pi/2 is the front, +Z)
  const shell = new THREE.SphereGeometry(1, 32, 20, Math.PI * 0.82, Math.PI * 1.36, Math.PI * 0.1, Math.PI * 0.62);
  shell.scale(0.102, 0.12, 0.106); shell.translate(0, 0.004, -0.008);
  hair.add(mesh(shell, MAT.hair));
  // fringe: a shell over the forehead, parted on her right and swept across to her left
  // (phi < pi/2 is her right, -X; she parts it on her right and it falls lower over her left brow)
  const fringe = new THREE.SphereGeometry(1, 28, 10, Math.PI * 0.28, Math.PI * 0.7, Math.PI * 0.2, Math.PI * 0.17);
  fringe.scale(0.105, 0.124, 0.113); fringe.rotateZ(-0.32); fringe.translate(0.004, 0.0, -0.002);
  hair.add(mesh(fringe, MAT.hair));
  const fall = new THREE.Group(); hair.add(fall); J.hairFall = fall;
  const back = new THREE.BoxGeometry(0.2, 0.6, 0.05, 8, 16, 2);
  const bp = back.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const t = Math.min(1, Math.max(0, (0.3 - bp.getY(i)) / 0.6));
    const x = bp.getX(i) * (0.95 + 0.4 * t) * (1 - 0.15 * Math.pow(t, 6));
    const bulge = Math.cos((bp.getX(i) / 0.12) * Math.PI / 2) * 0.012;
    bp.setXYZ(i, x, bp.getY(i) - 0.3, bp.getZ(i) - 0.07 - 0.045 * t - bulge * (bp.getZ(i) < 0 ? 1 : 0));
  }
  back.computeVertexNormals();
  fall.add(mesh(back, MAT.hair));
  for (const s of [1, -1]) {
    // locks that frame her face and fall forward over the shoulders onto the chest
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.078, 0.05, 0.05), new THREE.Vector3(s * 0.096, -0.04, 0.045),
      new THREE.Vector3(s * 0.108, -0.14, 0.05), new THREE.Vector3(s * 0.122, -0.26, 0.085), new THREE.Vector3(s * 0.112, -0.44, 0.112),
    ]);
    const lock = new THREE.TubeGeometry(curve, 24, 0.03, 10, false);
    const lp = lock.attributes.position;
    for (let i = 0; i < lp.count; i++) {        // taper towards the ends, flatten against her
      const y = lp.getY(i), t = Math.min(1, Math.max(0, (0.03 - y) / 0.5));
      const c = curve.getPointAt(Math.min(1, t));
      const k = 1 - 0.55 * t * t;
      lp.setXYZ(i, c.x + (lp.getX(i) - c.x) * k * 1.35, y, c.z + (lp.getZ(i) - c.z) * k * 0.45);
    }
    lock.computeVertexNormals();
    hair.add(mesh(lock, MAT.hair));
  }

  // ---- state and animation
  const st = { phase: 0, t: 0, blink: 2.5, pose: 'stand', speed: 0, sway: 0 };
  const R = (name, x = 0, y = 0, z = 0) => J[name].rotation.set(x, y, z);
  function update(dt, { speed = 0, pose = 'stand' } = {}) {
    st.t += dt;
    st.pose = pose;
    st.speed += (speed - st.speed) * Math.min(1, dt * 8);
    const v = st.speed;
    for (const n of Object.keys(J)) if (J[n].isGroup && n !== 'hairFall') J[n].rotation.set(0, 0, 0);
    hips.position.set(0, 0.82, 0);
    const breathe = Math.sin(st.t * 1.6) * 0.012;
    if (pose === 'walk' || pose === 'stand') {
      const amp = Math.min(1, v / 1.4);
      st.phase += dt * (2.4 + v * 2.6);
      const s = Math.sin(st.phase), c = Math.cos(st.phase);
      R('thighL', -s * 0.48 * amp); R('thighR', s * 0.48 * amp);
      R('kneeL', Math.max(0, Math.sin(st.phase + 1.4)) * 0.85 * amp); R('kneeR', Math.max(0, Math.sin(st.phase + 1.4 + Math.PI)) * 0.85 * amp);
      R('ankleL', Math.max(0, -s) * 0.2 * amp); R('ankleR', Math.max(0, s) * 0.2 * amp);
      R('shoulderL', s * 0.4 * amp, 0, 0.07); R('shoulderR', -s * 0.4 * amp, 0, -0.07);
      R('elbowL', -0.18 - Math.max(0, s) * 0.3 * amp); R('elbowR', -0.18 - Math.max(0, -s) * 0.3 * amp);
      hips.position.y = 0.82 + Math.abs(c) * 0.018 * amp - 0.008 * amp;
      R('spine', 0.04 * amp + breathe * (1 - amp), s * 0.06 * amp, 0);
      R('head', -0.03, -s * 0.04 * amp, 0);
      if (amp < 0.05) { R('shoulderL', 0.04, 0, 0.08); R('shoulderR', 0.04, 0, -0.08); R('elbowL', -0.12); R('elbowR', -0.12); R('head', -0.04 + breathe, Math.sin(st.t * 0.4) * 0.12, 0); }
    } else if (pose === 'sit' || pose === 'drive') {
      hips.position.y = 0.5;
      R('thighL', -1.5, 0, -0.04); R('thighR', -1.5, 0, 0.04);
      R('kneeL', 1.45); R('kneeR', 1.45);
      R('spine', -0.08 + breathe);
      if (pose === 'drive') { R('shoulderL', -1.05, 0, -0.18); R('shoulderR', -1.05, 0, 0.18); R('elbowL', -0.55); R('elbowR', -0.55); R('head', 0.04); }
      else { R('shoulderL', -0.45, 0, 0.1); R('shoulderR', -0.45, 0, -0.1); R('elbowL', -1.2); R('elbowR', -1.2); R('head', 0.28); }   // a book in her lap
    } else if (pose === 'nook') {                     // curled up in the reading nook: legs along the seat, a book in her hands
      hips.position.y = 0.47;
      R('thighL', -1.35, 0, 0.05); R('thighR', -1.25, 0, -0.08);
      R('kneeL', 0.55); R('kneeR', 0.75);
      R('spine', -0.42 + breathe);
      R('head', 0.42);
      R('shoulderL', -0.55, 0, 0.18); R('shoulderR', -0.55, 0, -0.18); R('elbowL', -1.35); R('elbowR', -1.35);
    } else if (pose === 'lie') {
      hips.position.y = 0.42;
      R('thighL', -1.5, 0, 0.03); R('thighR', -1.5, 0, -0.03);
      R('spine', -0.95 + breathe);
      R('head', 0.55);
      R('shoulderL', 0.25, 0, 0.12); R('shoulderR', 0.25, 0, -0.12); R('elbowL', -1.7); R('elbowR', -1.7);
    }
    // hair swings a little behind her as she moves
    st.sway += ((pose === 'walk' ? v * 0.08 : 0) - st.sway) * Math.min(1, dt * 4);
    fall.rotation.x = -st.sway + (pose === 'lie' ? 0.9 : 0);
    // blink now and then
    st.blink -= dt;
    const closed = st.blink < 0.12;
    if (st.blink < 0) st.blink = 2 + Math.random() * 3.5;
    for (const e of [J.eyeL, J.eyeR]) e.scale.y = closed ? 0.15 : 1;
  }
  update(0);
  root.traverse((o) => { if (o.isMesh && o.material.transparent) o.castShadow = false; });
  return { root, update, joints: J, head };
}

function roundRect(s, x, y, w, h, r) {
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
}

// soften a box's corners by pulling its vertices towards a rounded shape
function roundBox(g, r) {
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, v = new THREE.Vector3();
  const hx = (b.max.x - b.min.x) / 2 - r, hy = (b.max.y - b.min.y) / 2 - r, hz = (b.max.z - b.min.z) / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const d = v.clone().sub(c);
    if (d.length() > 1e-6) d.setLength(r);
    p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  g.computeVertexNormals();
}
