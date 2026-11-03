import * as THREE from 'three';
import { coastSamples, WATER_Y } from './beach.js';
import { SHORE_GLSL } from './shorewave.js';

// Spray where the shore waves break (world step 3): fine droplets thrown up off each crest as it tips
// over in the surf zone, drifting shoreward and falling back. All on the GPU: each droplet has a place
// on the coastline and a random seed; the shared wave timing (shorewave.js) says when its crest breaks.

export function buildSpray({ low = false } = {}) {
  const pts = coastSamples(low ? 2.4 : 1.1).filter(([x, z]) => x > -1000 && x < 700 && z > -1400 && z < 300);
  const per = low ? 2 : 4, n = pts.length * per;
  const base = new Float32Array(n * 4), seed = new Float32Array(n * 3);
  let k = 0;
  for (const [x, z, nx, nz] of pts) for (let j = 0; j < per; j++, k++) {
    const r1 = Math.random(), r2 = Math.random(), r3 = Math.random();
    const along = (r1 - 0.5) * 1.6;                         // spread along the coast between samples
    base.set([x - nz * along, z + nx * along, nx, nz], k * 4);
    seed.set([r1, r2, r3], k * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // (unused: placed in the shader)
  g.setAttribute('base', new THREE.BufferAttribute(base, 4));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  const uniforms = { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.4, 0.45, 0.5) }, uPx: { value: window.devicePixelRatio || 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      attribute vec4 base; attribute vec3 seed;
      uniform float uTime, uPx;
      varying float vA;
      #include <fog_pars_vertex>
      ${SHORE_GLSL}
      void main() {
        float s = 4.0 + seed.x * 5.0;                       // out in the surf zone
        vec2 xz = base.xy + base.zw * s;
        float ph = swPhase(s, uTime, xz);
        float burst = pow(0.5 + 0.5 * sin(ph + 0.2), 10.0) * swAmp(s, uTime, xz) / 0.13;
        float up = burst * (0.25 + seed.y * 0.55);            // thrown up off the crest
        xz -= base.zw * burst * (0.4 + seed.z * 1.2);         // carried towards the beach
        vec3 p = vec3(xz.x, ${WATER_Y.toFixed(2)} + swHeight(s, uTime, xz) + up, xz.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = clamp(burst * 1.4, 0.0, 1.0) * smoothstep(160.0, 40.0, -mv.z);
        gl_PointSize = (2.0 + seed.z * 5.0) * uPx * (30.0 / max(2.0, -mv.z)) * (0.6 + burst);
        gl_Position = projectionMatrix * mv;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uAmb;
      varying float vA;
      #include <fog_pars_fragment>
      void main() {
        if (vA < 0.01) discard;
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vA * 0.55;
        gl_FragColor = vec4((uAmb * 0.8 + uLight * 0.35) * 1.1, a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]);
  for (const k2 of Object.keys(uniforms)) mat.uniforms[k2] = uniforms[k2];
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.name = 'spray';
  return {
    points,
    update(t, light, amb) {
      uniforms.uTime.value = t;
      uniforms.uLight.value.copy(light.color).multiplyScalar(light.intensity * Math.max(0.15, light.userData.dir?.y ?? 1));
      if (amb) uniforms.uAmb.value.copy(amb);
    },
  };
}
