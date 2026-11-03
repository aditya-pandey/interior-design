import * as THREE from 'three';

// Clouds for /play/ (world step 2): fair-weather cumulus at ~1.6 km and a high, thin streak layer of
// cirrus, drifting on the wind. Drawn on a sphere that follows the camera; each pixel's view ray is
// carried up to the cloud layers, where a few octaves of drifting noise give the shapes. Lighting:
//   - each cloud is darker where more cloud lies between it and the sun (a second noise sample a little
//     way towards the sun), so they get bright tops and grey-blue undersides
//   - a silver lining and a glow round the sun (forward scattering)
//   - the sun's colour of the moment: white at noon, gold in the evening; after sunset the clouds stay
//     lit pink and orange from below for a while (they're higher than you), then go grey and dark
//   - near the horizon they thin and take on the haze colour
// Coverage changes slowly through the day. Seen in the sea's reflection too.

const R = 3000;

const FRAG = /* glsl */`
uniform float uTime, uCover, uNight;
uniform vec3 uSunDir, uSunCol, uAmb, uHaze, uMoonDir;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 6; i++) { s += a * noise(p); p = m * p; a *= 0.5; } return s; }
// cumulus density at a point on the layer (metres)
float cumulus(vec2 p) {
  vec2 q = p * 0.00042 + vec2(uTime * 0.0045, uTime * 0.0012);
  vec2 w = vec2(fbm(q * 0.7 + 3.1), fbm(q * 0.7 + 7.7));             // domain warp: billowy edges
  float n = fbm(q + w * 0.9);
  float lo = 0.62 - uCover * 0.42;
  return smoothstep(lo, lo + 0.2, n);
}
float cirrus(vec2 p) {
  vec2 q = p * vec2(0.00012, 0.00035) + vec2(uTime * 0.002, 0.0);
  return smoothstep(0.55, 0.85, fbm(q + fbm(q * 2.0)));
}
void main() {
  vec3 d = normalize(vDir);
  if (d.y < 0.012) discard;
  float lift = 1.0 / d.y;
  vec2 p = d.xz * 1600.0 * lift;                                  // where the ray meets the cumulus layer
  vec2 ph = d.xz * 9000.0 * lift;                                 // and the cirrus layer
  float c = cumulus(p);
  float ci = cirrus(ph) * 0.35 * (1.0 - c);
  if (c + ci < 0.005) discard;
  vec3 L = normalize(uSunDir);
  vec2 toSun = normalize(L.xz + 1e-4);
  // self-shadowing: how much cloud lies towards the sun
  float occ = cumulus(p + toSun * 160.0) * 0.6 + cumulus(p + toSun * 420.0) * 0.4;
  float lit = exp(-occ * 1.4);
  float sunUp = smoothstep(-0.13, 0.04, L.y);                     // clouds stay lit a while after sunset
  float lowSun = 1.0 - smoothstep(0.02, 0.35, L.y);
  vec3 sunCol = uSunCol * sunUp;
  float mu = max(dot(d, L), 0.0);
  float glow = pow(mu, 6.0) * 0.8 + pow(mu, 40.0) * 1.6;           // forward scattering, silver lining
  float edge = (1.0 - smoothstep(0.0, 0.45, c)) * pow(mu, 3.0);
  // light bounced around inside the cloud (keeps shaded parts from going grey at noon) + direct light
  vec3 col = uAmb * (0.7 + 0.3 * (1.0 - c)) + sunCol * (0.32 * (1.0 - lowSun * 0.6) + lit * (0.8 + glow) + edge * 2.2 + lowSun * 0.25 * lit);
  // moonlight at night: faint silver
  vec3 M = normalize(uMoonDir);
  col += vec3(0.5, 0.58, 0.75) * uNight * 0.09 * (0.4 + 0.6 * exp(-occ * 2.0)) * (1.0 + pow(max(dot(d, M), 0.0), 20.0) * 3.0);
  vec3 ciCol = uAmb * 0.9 + sunCol * (1.1 + glow);
  vec3 outCol = (col * c + ciCol * ci) / max(c + ci, 1e-3);
  float a = clamp(c * 1.15 + ci, 0.0, 0.97);
  // thinner and hazier towards the horizon
  float far = smoothstep(0.012, 0.22, d.y);
  a *= far;
  outCol = mix(uHaze, outCol, smoothstep(0.02, 0.3, d.y));
  gl_FragColor = vec4(outCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildClouds() {
  const uniforms = {
    uTime: { value: 0 }, uCover: { value: 0.42 }, uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uAmb: { value: new THREE.Color(0.6, 0.65, 0.75) }, uHaze: { value: new THREE.Color(0.8, 0.8, 0.8) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2 + 0.05), mat);
  mesh.name = 'clouds';
  mesh.renderOrder = -6;                       // over the sky, stars and moon; under everything else
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    // sunDir: the real sun (even below the horizon); sunCol: its colour × strength; amb: sky light
    update(t, camera, { sunDir, sunCol, amb, haze, moonDir, night, cover }) {
      mesh.position.copy(camera.position);
      uniforms.uTime.value = t;
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunCol.value.copy(sunCol);
      uniforms.uAmb.value.copy(amb);
      uniforms.uHaze.value.copy(haze);
      uniforms.uMoonDir.value.copy(moonDir);
      uniforms.uNight.value = night;
      if (cover != null) uniforms.uCover.value = cover;
    },
  };
}
