import * as THREE from 'three';

// Wheel effects for /play/ (driving phase 5): tyre smoke on tarmac when the tyres slide, sand thrown up
// behind the wheels on the beach, dust on dry ground, splashes in the shallows. One pool of particles,
// moved on the GPU: each is written once when it's emitted (where, which way, when, what kind) and the
// shader works out where it is now: smoke rises, spreads and drifts with the breeze; sand and water fly
// out and fall back.

const KINDS = { smoke: 0, sand: 1, dust: 2, water: 3 };

export function createParticles(scene, { max = 1600 } = {}) {
  const pos = new Float32Array(max * 3), vel = new Float32Array(max * 3), info = new Float32Array(max * 4);
  for (let i = 0; i < max; i++) info[i * 4] = -1e4;                // born long ago: invisible
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('vel', new THREE.BufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('info', new THREE.BufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage));   // birth, kind, size, seed
  const uniforms = { uTime: { value: 0 }, uSun: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.55) }, uPx: { value: window.devicePixelRatio || 1 }, uWind: { value: new THREE.Vector2(0.15, -0.6) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 vel; attribute vec4 info;
      uniform float uTime, uPx; uniform vec2 uWind;
      varying float vA; varying float vKind; varying float vSeed;
      void main() {
        float age = uTime - info.x, kind = info.y, size = info.z;
        float life = kind < 0.5 ? 2.6 : kind < 1.5 ? 0.9 : kind < 2.5 ? 2.2 : 0.8;
        float k = age / life;
        vec3 p = position; float landed = 0.0;
        if (kind < 0.5) {                                   // smoke: slows, rises, spreads, drifts
          p += vel * (1.0 - exp(-age * 2.0)) / 2.0 + vec3(uWind.x, 0.0, uWind.y) * age * 0.6 + vec3(0.0, 0.35 * age, 0.0);
        } else if (kind < 2.5 && kind > 1.5) {              // dust: hangs, drifts
          p += vel * (1.0 - exp(-age * 3.0)) / 3.0 + vec3(uWind.x, 0.0, uWind.y) * age * 0.5 + vec3(0.0, 0.15 * age, 0.0);
        } else {                                            // sand, water: thrown, falling back
          p += vel * age + vec3(0.0, -4.9 * age * age, 0.0);
          if (p.y < position.y - 0.1) { p.y = position.y - 0.1; landed = 1.0; }   // (lands on the surface and fades)
        }
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float grow = kind < 0.5 ? 1.0 + k * 7.0 : kind < 1.5 ? 1.0 : kind < 2.5 ? 1.0 + k * 3.0 : 1.0 + k;
        vA = (k < 0.0 || k > 1.0) ? 0.0 : (1.0 - k) * smoothstep(0.0, 0.08, k) * (1.0 - landed * 0.85);
        vKind = kind; vSeed = info.w;
        gl_PointSize = size * grow * uPx * (300.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uAmb;
      varying float vA; varying float vKind; varying float vSeed;
      void main() {
        if (vA <= 0.001) discard;
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float soft = smoothstep(0.5, 0.0, d);
        vec3 base; float a;
        if (vKind < 0.5) { base = vec3(0.82, 0.82, 0.84); a = soft * soft * soft * (0.5 + 0.5 * sin(vSeed * 40.0 + c.x * 6.0 + c.y * 5.0)) * 0.5; }
        else if (vKind < 1.5) {                            // a clump of churned-up, damper sand: three grains, shaded underneath
          vec2 o = vec2(fract(vSeed * 7.1), fract(vSeed * 13.7)) - 0.5;
          float g = min(min(length(c - o * 0.5), length(c + o.yx * 0.5)), length(c - vec2(o.y, -o.x) * 0.4));
          base = vec3(0.5, 0.44, 0.34) * (1.1 - gl_PointCoord.y * 0.45); a = smoothstep(0.2, 0.12, g) * 0.95;
        }
        else if (vKind < 2.5) { base = vec3(0.78, 0.7, 0.56); a = soft * soft * 0.5; }
        else { base = vec3(0.74, 0.84, 0.88) * (1.12 - gl_PointCoord.y * 0.4); a = smoothstep(0.5, 0.3, d) * 0.8; }   // droplets: lit on top
        gl_FragColor = vec4(base * (uAmb + uSun * 0.55), a * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false; points.renderOrder = 4; points.name = 'wheel_fx';
  scene.add(points);
  let head = 0, dirtyFrom = max, dirtyTo = -1;
  const acc = {};
  return {
    uniforms,
    // emit `rate` particles per second of `kind` at (x, y, z) with base velocity (vx, vy, vz) and spread;
    // key: who is emitting (a wheel), so fractional rates accumulate between frames
    emit(key, kind, rate, dt, t, x, y, z, vx, vy, vz, spread, size) {
      acc[key] = (acc[key] || 0) + rate * dt;
      while (acc[key] >= 1) {
        acc[key] -= 1;
        const i = head; head = (head + 1) % max;
        pos.set([x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2], i * 3);
        vel.set([vx + (Math.random() - 0.5) * spread, vy + Math.random() * spread * 0.6, vz + (Math.random() - 0.5) * spread], i * 3);
        info.set([t - Math.random() * dt, KINDS[kind], size * (0.7 + Math.random() * 0.6), Math.random()], i * 4);
        dirtyFrom = Math.min(dirtyFrom, i); dirtyTo = Math.max(dirtyTo, i);
      }
    },
    update(t, sunColor, sunI, amb) {
      uniforms.uTime.value = t;
      uniforms.uSun.value.copy(sunColor).multiplyScalar(sunI);
      if (amb) uniforms.uAmb.value.copy(amb);
      if (dirtyTo >= 0) {
        for (const [name, n] of [['position', 3], ['vel', 3], ['info', 4]]) {
          const a = g.attributes[name];
          a.clearUpdateRanges(); a.addUpdateRange(dirtyFrom * n, (dirtyTo - dirtyFrom + 1) * n); a.needsUpdate = true;
        }
        dirtyFrom = max; dirtyTo = -1;
      }
    },
  };
}
