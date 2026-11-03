import * as THREE from 'three';

// The night sky for /play/: a dark gradient dome with a soft Milky Way band, ~9,000 twinkling stars
// (brighter ones rarer, slightly blue or warm), the moon with a halo, and a shooting star now and then.
// Everything sits on a sphere that follows the camera; `k` (0 = day, 1 = full night) fades it in.

const R = 3400;                       // inside the Sky box (half-size 4000) so the stars draw over the dusk sky

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// a direction from azimuth (deg from north, clockwise) and elevation; north = +Z, east = -X
function dir(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

// the galactic band: a great circle tilted across the sky
const BAND = new THREE.Vector3(0.35, 0.55, -0.76).normalize();      // the band's pole

export function buildNightSky() {
  const group = new THREE.Group();
  group.name = 'night_sky';
  const uniforms = { uTime: { value: 0 }, uK: { value: 0 } };

  // ---- dome: gradient + Milky Way glow (drawn behind everything)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R + 200, 64, 32), new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uBand: { value: BAND } },
    side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
    // premultiplied: the dark night gradient only covers the sky late (alpha), the Milky Way adds light
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float uK; uniform vec3 uBand; varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(vec3(0.035,0.055,0.11), vec3(0.006,0.010,0.028), smoothstep(-0.05, 0.75, up));   // lighter at the horizon
        float b = 1.0 - abs(dot(d, uBand));                     // near the band's great circle
        float band = pow(smoothstep(0.82, 1.0, b), 2.0);
        float dust = fbm(d * 7.0) * fbm(d * 2.3 + 3.1);
        float lanes = smoothstep(0.35, 0.65, fbm(d * 11.0 + 7.0));
        vec3 milky = vec3(0.11,0.11,0.14) * band * dust * (0.55 + 0.45 * lanes) * 1.3 * smoothstep(-0.02, 0.15, d.y);
        float a = smoothstep(0.55, 1.0, uK);
        gl_FragColor = vec4(col * a + milky * uK, a);
      }`,
  }));
  dome.renderOrder = -10;
  group.add(dome);

  // ---- stars
  const N = 9000, rnd = rng(42);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  const v = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tint = [new THREE.Color(0xbfd4ff), new THREE.Color(0xffffff), new THREE.Color(0xfff1d6), new THREE.Color(0xffd6b0)];
  for (let i = 0; i < N; i++) {
    // two thirds spread evenly, a third crowded along the Milky Way
    if (i % 3) {
      v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
      v.normalize();
    } else {
      const a = rnd() * Math.PI * 2;
      tmp.set(1, 0, 0).cross(BAND).normalize();
      const w = new THREE.Vector3().crossVectors(BAND, tmp);
      v.copy(tmp).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(BAND, (rnd() - 0.5) * 0.22 * (rnd() + rnd())).normalize();
    }
    if (v.y < -0.05) v.y = -v.y;                                   // keep them above the horizon
    pos.set([v.x * R, v.y * R, v.z * R], i * 3);
    const m = Math.pow(rnd(), 7);                                   // most stars faint, a few bright
    size[i] = 0.9 + m * 3.6;
    const c = tint[Math.floor(rnd() * tint.length)];
    const b = 0.35 + m * 0.65;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    phase[i] = rnd() * 100;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
  sg.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uPx: { value: window.devicePixelRatio || 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute float size; attribute float phase; attribute vec3 color; uniform float uTime; uniform float uPx; varying vec3 vCol; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.75 + 0.25 * sin(uTime * (1.3 + fract(phase) * 2.0) + phase);
        float alt = normalize(position).y;
        vA = tw * smoothstep(0.0, 0.12, alt);                       // fainter low in the haze
        vCol = color;
        gl_PointSize = size * uPx * (0.8 + 0.2 * tw);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uK; varying vec3 vCol; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a *= a;
        gl_FragColor = vec4(vCol * a * vA * uK * 1.6, 1.0); }`,
  }));
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  group.add(stars);

  // ---- the moon and its halo
  const moonTex = moonTexture();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  moon.scale.setScalar(R * 0.034);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xbfd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.setScalar(R * 0.22);
  group.add(halo, moon);
  moon.renderOrder = halo.renderOrder = -8;

  // ---- shooting star: a short bright streak with a fading tail
  const streakGeo = new THREE.PlaneGeometry(1, 1);
  const streakMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uA; varying vec2 vUv;
      void main(){ float along = vUv.x; float across = abs(vUv.y - 0.5) * 2.0;
        float a = pow(along, 2.2) * smoothstep(1.0, 0.0, across) * uA; float head = smoothstep(0.9, 1.0, along) * smoothstep(0.6, 0.0, across);
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * (a + head * uA * 2.0), 1.0); }`,
  });
  const streak = new THREE.Mesh(streakGeo, streakMat);
  streak.visible = false;
  streak.renderOrder = -7;
  group.add(streak);
  let next = 8 + rnd() * 10, shot = null;

  const moonDir = new THREE.Vector3(), fwd = new THREE.Vector3();
  return {
    group,
    setMoon(az, el) { moonDir.copy(dir(az, el)); },
    // returns true on the frame a shooting star begins
    update(dt, t, k, camera) {
      uniforms.uTime.value = t;
      uniforms.uK.value = k;
      group.visible = k > 0.01;
      group.position.copy(camera.position);
      moon.position.copy(moonDir).multiplyScalar(R * 0.95);
      halo.position.copy(moon.position);
      moon.material.opacity = Math.min(1, k * 1.2);
      halo.material.opacity = k * 0.5;
      let began = false;
      if (k > 0.6) {
        next -= dt;
        if (!shot && next <= 0) {
          // in front of her, up in the sky, sliding down towards the horizon
          camera.getWorldDirection(fwd);
          const camAz = THREE.MathUtils.radToDeg(Math.atan2(-fwd.x, fwd.z));
          const camEl = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, fwd.y))));
          const az = camAz + (rnd() - 0.5) * 50, el = Math.max(18, Math.min(70, camEl + 12 + rnd() * 18));
          const p0 = dir(az, el).multiplyScalar(R * 0.9);
          const side = dir(az + (rnd() < 0.5 ? 25 : -25), el - 12).multiplyScalar(R * 0.9);
          shot = { p0, p1: side, t: 0, dur: 0.7 + rnd() * 0.5 };
          next = 45 + rnd() * 30;
          began = true;
        }
      }
      if (shot) {
        shot.t += dt / shot.dur;
        const e = Math.min(1, shot.t);
        const head = shot.p0.clone().lerp(shot.p1, e);
        const tail = shot.p0.clone().lerp(shot.p1, Math.max(0, e - 0.35));
        const mid = head.clone().add(tail).multiplyScalar(0.5);
        streak.position.copy(mid);
        // face the camera (at the group's origin), long side from tail to head
        const zA = mid.clone().negate().normalize();
        const xA = head.clone().sub(tail);
        xA.addScaledVector(zA, -xA.dot(zA)).normalize();
        const yA = new THREE.Vector3().crossVectors(zA, xA);
        streak.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
        streak.scale.set(Math.max(1, head.distanceTo(tail)), R * 0.0032, 1);
        streakMat.uniforms.uA.value = Math.sin(Math.PI * e) * k;
        streak.visible = true;
        if (shot.t >= 1) { shot = null; streak.visible = false; }
      }
      return began;
    },
    // test hook: fire one now
    shoot() { next = 0; },
  };
}

function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(7);
  const grd = g.createRadialGradient(118, 116, 10, 128, 128, 120);
  grd.addColorStop(0, '#fbfaf3'); grd.addColorStop(0.85, '#e6e3d6'); grd.addColorStop(1, '#cfcbbd');
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  // maria and craters
  g.save(); g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.clip();
  for (const [x, y, rr, a] of [[100, 95, 38, 0.16], [150, 120, 30, 0.14], [120, 160, 26, 0.12], [165, 80, 18, 0.1], [80, 140, 20, 0.1]]) {
    g.fillStyle = `rgba(120,118,110,${a})`; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 60; i++) {
    const x = 20 + r() * 216, y = 20 + r() * 216, rr = 1 + r() * 6;
    g.strokeStyle = `rgba(110,105,95,${0.08 + r() * 0.12})`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.35)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
