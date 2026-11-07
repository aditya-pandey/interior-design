import * as THREE from 'three';

// Life in GH-18 for /play/ (added on top of the tour's house, whose own code and geometry are untouched):
//   - the lights: after dark the room she walks into lights up, warm, and the one she left fades (like smart lights)
//   - the lift: E at its door on any floor, choose a floor; the doors, a hum, a chime, and she steps out there
//   - the mandir: E lights the diya, with a soft bell; it burns on for the visit
//   - the kitchen: E at the hob makes chai: the kettle steams, and a cup is waiting on the counter
//   - ceiling fans turning in the bedrooms
//   - her photographs in standing frames on the consoles and bedside tables
//   - small sounds: a fridge hum in the kitchen, a clock ticking in the family lounge (Web Audio, by distance)
// main.js asks it each frame where she is; the lift and "go to" move her through main.js's placeHer.

const mm = (v) => v / 1000;

export function buildHouseLife({ house, rooms, pack }) {
  const group = new THREE.Group(); group.name = 'house_life';
  const interact = [];
  const items = (fid) => (house.floors.find((f) => f.id === fid)?.furniture || []);
  const ffl = (fid) => house.levels[fid].ffl / 1000;
  const roomOf = (fid, code) => rooms.find((r) => r.floor === fid && r.id === code);
  const toward = (x, z, r) => { const dx = r ? mm(r.at[0]) - x : 0, dz = r ? mm(r.at[1]) - z : 1, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };

  // ---- the smart lights: two warm lights, one in the room she's in, one fading out where she was
  const L = [0, 1].map(() => { const l = new THREE.PointLight(0xffd6a0, 0, 9, 1.6); group.add(l); return { l, target: 0, room: null }; });

  // ---- the mandir and its diya
  const mandir = items('GF').find((i) => i.type === 'mandir_open');
  const diya = { lit: false, flame: null, light: null };
  if (mandir) {
    // its own two brass diya stands, either side of the ledge (as furniture.js builds the open mandir): a flame on
    // each wick when lit
    const a = ((mandir.rot || 0) * Math.PI) / 180, w = mandir.size[0] / 1000, y = ffl('GF');
    const fx = -Math.sin(a), fz = Math.cos(a), ux = Math.cos(a), uz = Math.sin(a);           // front, and the mandir's own x
    const cx = mm(mandir.pos[0]), cz = mm(mandir.pos[1]);
    diya.flames = [-1, 1].map((sx) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8).scale(1, 2.6, 1), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
      f.position.set(cx + fx * 0.08 + ux * sx * (w / 2 - 0.12), y + 1.17, cz + fz * 0.08 + uz * sx * (w / 2 - 0.12));
      f.visible = false; group.add(f); return f;
    });
    diya.flame = diya.flames[0];
    diya.light = new THREE.PointLight(0xffb36b, 0, 3.5, 2); diya.light.position.set(cx + fx * 0.35, y + 1.35, cz + fz * 0.35); group.add(diya.light);
    interact.push({ kind: 'diya', label: 'Light the diyas', pos: [cx + fx * 0.2, y + 1.0, cz + fz * 0.2], normal: [fx, fz], r: 1.9 });
  }

  // ---- the hob: chai
  const hob = items('GF').find((i) => i.type === 'hob');
  const chai = { t: -1, kettle: null, cup: null, steam: null };
  if (hob) {
    const hx = mm(hob.pos[0]), hz = mm(hob.pos[1]), y = ffl('GF') + 0.92;
    const [fx, fz] = toward(hx, hz, rooms.find((r) => r.floor === 'GF' && r.name === 'Kitchen'));
    const brass = new THREE.MeshStandardMaterial({ color: 0xb8894a, metalness: 1, roughness: 0.35 });
    chai.kettle = new THREE.Group(); chai.kettle.position.set(hx + fx * 0.05, y, hz + fz * 0.05); group.add(chai.kettle);
    chai.kettle.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16).scale(1, 0.8, 1).translate(0, 0.08, 0), brass));           // a round brass kettle
    chai.kettle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 18).translate(0, 0.165, 0), brass));               // its lid
    chai.kettle.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8).translate(0, 0.19, 0), new THREE.MeshStandardMaterial({ color: 0x2a1f16 })));
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.13, 10), brass); spout.position.set(0.12, 0.12, 0); spout.rotation.z = -0.9; chai.kettle.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a1f16 })); handle.position.y = 0.15; chai.kettle.add(handle);
    chai.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 16).translate(0, 0.04, 0), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.5 }));
    chai.cup.position.set(hx + fx * 0.25 - fz * 0.45, y, hz + fz * 0.25 + fx * 0.45); chai.cup.visible = false; group.add(chai.cup);
    const N = 40, sp = new Float32Array(N * 3), seed = new Float32Array(N); for (let i = 0; i < N; i++) seed[i] = Math.random();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const steamU = { uTime: { value: 0 }, uOn: { value: 0 }, uC: { value: new THREE.Vector3(chai.kettle.position.x + 0.2, y + 0.2, chai.kettle.position.z) } };
    chai.steam = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: steamU, transparent: true, depthWrite: false,
      vertexShader: `attribute float seed; uniform float uTime, uOn; uniform vec3 uC; varying float vA;
        void main(){ float life = fract(uTime * 0.35 + seed); vec3 p = uC + vec3(sin(seed * 30.0 + uTime) * 0.06 * life, life * 0.7, cos(seed * 17.0 + uTime * 0.8) * 0.06 * life);
          vA = (1.0 - life) * life * 4.0 * uOn * 0.6; vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = (60.0 + life * 140.0) / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0), vA * smoothstep(0.5, 0.0, d)); }' }));
    chai.steam.frustumCulled = false; chai.steamU = steamU; group.add(chai.steam);
    interact.push({ kind: 'chai', label: 'Make chai', pos: [hx, y, hz], normal: [fx, fz], r: 1.8 });
  }

  // ---- ceiling fans in the bedrooms
  const fans = [];
  const oak = new THREE.MeshStandardMaterial({ color: 0x9c7450, roughness: 0.55 }), white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 });
  for (const r of rooms.filter((q) => /Bed|Guest Room|Kids|Servant/.test(q.name))) {
    const y = r.ffl + 2.95, x = mm(r.at[0]), z = mm(r.at[1]);
    const fan = new THREE.Group(); fan.position.set(x, y, z); group.add(fan);
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25).translate(0, -0.125, 0), white));
    const rot = new THREE.Group(); rot.position.y = -0.3; fan.add(rot);
    rot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.08, 20), white));
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.13).translate(0.4, 0, 0), oak); b.rotation.set(0.08, (k / 3) * Math.PI * 2, 0); rot.add(b); }
    fans.push(rot);
  }

  // ---- her photographs in standing frames
  const photos = pack?.album?.photos || [];
  if (photos.length) {
    const loader = new THREE.TextureLoader(), base = pack.base || 'play/deepti/';
    const spots = [];
    for (const fid of ['GF', 'FF']) for (const it of items(fid).filter((i) => ['console', 'side_table', 'dresser'].includes(i.type))) spots.push({ fid, it });
    spots.slice(0, 9).forEach(({ fid, it }, k) => {
      const ph = photos[k % photos.length], ratio = ph.w / ph.h, h = ratio > 1.1 ? 0.17 : 0.22, w = h * ratio;
      const x = mm(it.pos[0]), z = mm(it.pos[1]), y = ffl(fid) + it.size[2] / 1000;
      const [fx, fz] = toward(x, z, roomOf(fid, it.room));
      const f = new THREE.Group(); f.position.set(x + fx * 0.02, y, z + fz * 0.02); f.rotation.y = Math.atan2(fx, fz) + (k % 2 ? 0.25 : -0.2); group.add(f);
      const frameM = new THREE.MeshStandardMaterial({ color: [0x2a1f16, 0xb08d57, 0xf2ece0][k % 3], roughness: 0.4, metalness: k % 3 === 1 ? 0.8 : 0 });
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.015), frameM); fr.rotation.x = -0.18; fr.position.y = (h + 0.04) / 2; f.add(fr);
      const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm); pic.position.set(0, (h + 0.04) / 2 + 0.0, 0.009); pic.rotation.x = -0.18; f.add(pic);
      loader.load(base + ph.file, (t) => { t.colorSpace = THREE.SRGBColorSpace; pm.map = t; pm.needsUpdate = true; });
    });
  }

  // ---- the lift: a call button by its door on each floor
  const liftDoors = [];
  for (const f of house.floors) for (const w of f.walls) for (const o of (w.openings || [])) {
    if (o.type !== 'lift_door' || !w.a) continue;
    const [ax, ay] = w.a, [bx, by] = w.b, Ln = Math.hypot(bx - ax, by - ay), t = (o.offset + o.width / 2) / Ln;
    const x = mm(ax + (bx - ax) * t), z = mm(ay + (by - ay) * t);
    const lift = rooms.find((r) => r.floor === f.id) && house.floors.find((q) => q.id === f.id).rooms.find((r) => r.name === 'Lift');
    let nx = -(by - ay) / Ln, nz = (bx - ax) / Ln;
    if (lift) { const cx = lift.polygon.reduce((m, p) => m + p[0], 0) / lift.polygon.length / 1000, cz = lift.polygon.reduce((m, p) => m + p[1], 0) / lift.polygon.length / 1000; if ((cx - x) * nx + (cz - z) * nz > 0) { nx = -nx; nz = -nz; } }   // out of the lift
    liftDoors.push({ floor: f.id, x, z, nx, nz, y: ffl(f.id) });
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.015), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.9, roughness: 0.3 }));
    btn.position.set(x + nx * 0.02 + nz * 0.62, ffl(f.id) + 1.15, z + nz * 0.02 - nx * 0.62); btn.rotation.y = Math.atan2(nx, nz); group.add(btn);
    interact.push({ kind: 'lift', floor: f.id, label: 'Take the lift', pos: [x, ffl(f.id) + 1.1, z], normal: [nx, nz], r: 1.8 });
  }

  // ---- small sounds (started once audio is running)
  let snd = null;
  const kitchen = rooms.find((r) => r.floor === 'GF' && r.name === 'Kitchen'), lounge = rooms.find((r) => r.floor === 'GF' && r.name === 'Family Lounge');
  const startSounds = (ctx, out) => {
    if (snd || !ctx) return;
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 140;
    const hg = ctx.createGain(); hg.gain.value = 0; hum.connect(hf).connect(hg).connect(out); hum.start();
    const tg = ctx.createGain(); tg.gain.value = 0; tg.connect(out);
    snd = { ctx, hg, tg, next: ctx.currentTime + 0.5 };
  };
  const tick = () => {
    const { ctx } = snd; const t0 = snd.next; snd.next += 1;
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.0015));
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    s.connect(f).connect(snd.tg); s.start(t0);
  };
  const bell = (ctx, out) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [fq, a] of [[1180, 0.18], [2950, 0.07], [4410, 0.04]]) { const o = ctx.createOscillator(); o.frequency.value = fq; const g = ctx.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6); o.connect(g).connect(out); o.start(t); o.stop(t + 2.7); }
  };
  const chime = (ctx, out) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    [[880, 0], [660, 0.35]].forEach(([fq, dt]) => { const o = ctx.createOscillator(); o.frequency.value = fq; const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 1.2); o.connect(g).connect(out); o.start(t + dt); o.stop(t + dt + 1.3); });
  };

  return {
    group, interact, liftDoors,
    lightDiya(ctx, out) { if (!diya.flame) return; diya.lit = true; for (const f of diya.flames) f.visible = true; bell(ctx, out); },
    makeChai() { if (chai.kettle) chai.t = 0; },
    chime,
    // each frame: where she is (room: the ROOMS entry or null), whether it's night, audio
    update(t, dt, { x, z, foot, room, night, ctx, out, indoors }) {
      // lights: the room she's in, warm, at night
      const want = night && room && room.ffl != null ? room : null;
      if (want !== L[0].room) { [L[0], L[1]] = [L[1], L[0]]; L[0].room = want; if (want) L[0].l.position.set(mm(want.at[0]), want.ffl + 2.6, mm(want.at[1])); }
      L[0].l.intensity = THREE.MathUtils.damp(L[0].l.intensity, want ? 9 : 0, 3, dt);
      L[1].l.intensity = THREE.MathUtils.damp(L[1].l.intensity, 0, 2, dt);
      for (const f of fans) f.rotation.y += dt * 3.2;
      if (diya.lit) { diya.flames.forEach((f, i) => { f.scale.y = 0.85 + 0.25 * Math.sin(t * 17 + i * 2); }); diya.light.intensity = 1.6 * (0.85 + 0.15 * Math.sin(t * 13)); }
      if (chai.t >= 0) {
        chai.t += dt; chai.steamU.uTime.value = t; chai.steamU.uOn.value = Math.min(1, chai.t / 1.5) * (chai.t < 12 ? 1 : Math.max(0, 1 - (chai.t - 12) / 3));
        if (chai.t > 4) chai.cup.visible = true;
        if (chai.t > 15) chai.t = -1;
      }
      // sounds
      if (ctx && out) startSounds(ctx, out);
      if (snd) {
        const ct = snd.ctx.currentTime;
        while (snd.next < ct + 0.2) tick();
        const dk = kitchen && indoors && Math.abs(foot - kitchen.ffl) < 1.2 ? Math.hypot(x - mm(kitchen.at[0]), z - mm(kitchen.at[1])) : 99;
        const dl = lounge && indoors && Math.abs(foot - lounge.ffl) < 1.2 ? Math.hypot(x - mm(lounge.at[0]), z - mm(lounge.at[1])) : 99;
        snd.hg.gain.setTargetAtTime(Math.max(0, 1 - dk / 6) * 0.018, ct, 0.4);
        snd.tg.gain.setTargetAtTime(Math.max(0, 1 - dl / 7) * 0.12, ct, 0.3);
      }
      return chai.t > 4 && chai.t < 4.2;
    },
  };
}
