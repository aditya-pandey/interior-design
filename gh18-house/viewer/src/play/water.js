import * as THREE from 'three';
import { coastDist, WATER_Y } from './beach.js';
import { SHORE_GLSL } from './shorewave.js';

// The sea for /play/: a calm, clear tropical sea over white sand.
//   - a dense grid that follows the camera, lifted by a few long, low Gerstner swells, so the waterline
//     creeps up and slides back down the sloping beach
//   - real reflections: the scene is rendered from below the surface (a planar mirror) and the ripples
//     bend it; sun or moon glitter on top
//   - colour by depth: clear over the shallows (the sand shows through, tinted turquoise), deep teal
//     further out; the depth comes from the beach profile and a baked map of the distance to the coast
//   - lacy foam where the water thins out on the sand
// Sunlight and moonlight come from the scene's main directional light (set each frame).

const DEG = Math.PI / 180;

// distance to the waterline, baked into a texture over the part of the coast you can reach
const BOX = { x0: -1000, z0: -1400, w: 1700, h: 1700 };
function coastTexture(N = 768) {
  const data = new Uint16Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = BOX.z0 + ((j + 0.5) / N) * BOX.h;
    for (let i = 0; i < N; i++) {
      const x = BOX.x0 + ((i + 0.5) / N) * BOX.w;
      const s = Math.max(-200, Math.min(400, coastDist(x, z)));
      data[j * N + i] = THREE.DataUtils.toHalfFloat(s);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// a polar grid around the camera: rings ~0.3 m apart near you, spreading out to the horizon
function seaGrid(low) {
  const A = low ? 128 : 192, q = low ? 1.06 : 1.045, r0 = low ? 0.45 : 0.3;
  const rings = [0];
  while (rings[rings.length - 1] < 7000) rings.push(r0 * (Math.pow(q, rings.length) - 1) / (q - 1));
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < rings.length; i++) for (let a = 0; a < A; a++) {
    const t = (a / A) * Math.PI * 2;
    pos.push(Math.cos(t) * rings[i], 0, Math.sin(t) * rings[i]);
  }
  for (let a = 0; a < A; a++) idx.push(0, 1 + ((a + 1) % A), 1 + a);
  for (let i = 1; i < rings.length - 1; i++) for (let a = 0; a < A; a++) {
    const p = 1 + (i - 1) * A, n = 1 + i * A, a1 = (a + 1) % A;
    idx.push(p + a, p + a1, n + a, p + a1, n + a1, n + a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // flat normals: the shader makes its own, but other passes (ambient occlusion) draw the plain grid
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// swells: [direction (deg, the way they travel), wavelength m, amplitude m, steepness]
// (they come in from the open sea to the north and north-west, towards the beach)
const WAVES = [
  [175, 21, 0.055, 0.3], [158, 13.5, 0.032, 0.35], [192, 8.2, 0.02, 0.4], [140, 5.1, 0.01, 0.4], [168, 33, 0.04, 0.2],
];

const VERT = /* glsl */`
uniform float uTime;
uniform mat4 uTexMatrix;
uniform vec4 uWaves[${WAVES.length}];     // dir.xy, k, amp
uniform float uSteep[${WAVES.length}];
uniform sampler2D uCoast;
uniform vec4 uBox;
varying vec3 vWorld;
varying vec4 vMirror;
varying vec3 vGN;
#include <fog_pars_vertex>
${SHORE_GLSL}
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;               // the grid sits under the camera
  float dist = length(position.xz);
  float fade = 1.0 - smoothstep(180.0, 650.0, dist);             // calm, and no shimmer far away
  vec3 o = p;
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < ${WAVES.length}; i++) {
    vec2 d = uWaves[i].xy; float k = uWaves[i].z, A = uWaves[i].w * fade, Q = uSteep[i];
    float c = sqrt(9.81 / k);
    float f = k * (dot(d, p.xz) - c * uTime);
    float cf = cos(f), sf = sin(f);
    o.x += Q * A * d.x * cf; o.z += Q * A * d.y * cf; o.y += A * sf;
    n.x -= d.x * k * A * cf; n.z -= d.y * k * A * cf; n.y -= Q * k * A * sf;
  }
  // the waves coming in to the beach: they follow the coast (its distance map), steepen and run up the sand
  vec2 cuv = (p.xz - uBox.xy) * uBox.zw;
  if (fade > 0.0 && cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) {
    float s = texture2D(uCoast, cuv).r;
    if (s < 50.0) {
      vec2 ex = vec2(1.5 * uBox.z, 0.0), ez = vec2(0.0, 1.5 * uBox.w);
      vec2 g = vec2(texture2D(uCoast, cuv + ex).r - texture2D(uCoast, cuv - ex).r, texture2D(uCoast, cuv + ez).r - texture2D(uCoast, cuv - ez).r);
      g = g / max(length(g), 1e-4);                               // towards the sea
      float h = swHeight(s, uTime, p.xz);
      float dh = (swHeight(s + 0.3, uTime, p.xz) - swHeight(s - 0.3, uTime, p.xz)) / 0.6;
      o.y += h * fade;
      n.xz -= g * dh * fade;
    }
  }
  vWorld = o;
  vGN = normalize(n);
  vMirror = uTexMatrix * vec4(o, 1.0);
  vec4 mvPosition = viewMatrix * vec4(o, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
}`;

const FRAG = /* glsl */`
uniform float uTime;
uniform sampler2D uMirror;
uniform sampler2D uNormals;
uniform sampler2D uCoast;
uniform vec4 uBox;                  // x0, z0, 1/w, 1/h
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform vec3 uLight;                // colour x intensity of the sun (or the moon)
uniform vec3 uAmb;                  // sky light on the water body
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uGlitter;
uniform float uReflect;
uniform int uDebug;
varying vec3 vWorld;
varying vec4 vMirror;
varying vec3 vGN;
#include <fog_pars_fragment>
${SHORE_GLSL}

float seabed(float s) {                       // the beach profile (beach.js sandHeight)
  if (s < -6.0) return -0.15;
  return -0.15 - (s + 6.0) * 0.047;
}
vec3 ripple(vec2 uv, float scale, vec2 drift) {
  return texture2D(uNormals, uv / scale + drift * uTime).rgb * 2.0 - 1.0;
}

void main() {
  vec3 toEye = uEye - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;

  vec2 cuv = (vWorld.xz - uBox.xy) * uBox.zw;
  float inside = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
  float s = mix(400.0, texture2D(uCoast, clamp(cuv, 0.0, 1.0)).r, inside);
  float depth = vWorld.y - seabed(s);

  // fine ripples: four layers of the normal map drifting different ways, calmer with distance
  vec2 uv = vWorld.xz;
  vec3 r1 = ripple(uv, 9.0, vec2(0.010, 0.006));
  vec3 r2 = ripple(uv, 5.3, vec2(-0.008, 0.011));
  vec3 r3 = ripple(uv, 2.1, vec2(0.021, -0.015));
  vec3 r4 = ripple(uv, 23.0, vec2(-0.004, -0.006));
  vec2 slope = (r1.xy + r2.xy * 0.8 + r3.xy * 0.45 + r4.xy * 0.9);
  float detail = mix(0.075, 0.02, smoothstep(25.0, 500.0, dist)) * mix(0.55, 1.0, smoothstep(0.0, 1.5, depth));
  vec3 N = normalize(vGN + vec3(slope.x, 0.0, slope.y) * detail);

  // Fresnel from a smoothed normal: the fine ripples shouldn't let the deep colour show at grazing angles
  float NdV = max(dot(normalize(mix(N, vGN, 0.65)), V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  F = min(F, 0.92) * (0.3 + 0.7 * smoothstep(0.0, 0.1, depth));     // a few cm of swash: you see the sand, not the sky

  // reflection: the mirror image, bent by the surface
  vec2 mUV = vMirror.xy / vMirror.w + N.xz * (0.5 / (dist + 3.0)) * 6.0 * (1.0 - smoothstep(60.0, 900.0, dist) * 0.7);
  vec3 refl = texture2D(uMirror, mUV).rgb * uReflect;

  // the water body: clear over the shallows, deep teal further out
  float a = 1.0 - exp(-max(depth, 0.0) * 0.3);            // the sand below does the colouring in the shallows
  a = mix(a, 1.0, smoothstep(70.0, 85.0, s));               // past the end of the modelled sea floor
  vec3 body = mix(uShallow, uDeep, smoothstep(0.6, 4.5, depth));
  float sunUp = clamp(uLightDir.y, 0.0, 1.0);
  vec3 lit = body * (uAmb * 0.7 + uLight * (0.14 + 0.06 * sunUp));   // clear water scatters little light back

  // sun / moon glitter: a sharp highlight on the ripples and a broader sheen
  vec3 H = normalize(uLightDir + V);
  float NdH = max(dot(N, H), 0.0);
  float vis = smoothstep(-0.04, 0.03, uLightDir.y);
  // the glitter stays in a path towards the light: only ripples on swells already facing it can flash
  float path = smoothstep(0.93, 0.995, dot(vGN, H));
  vec3 spec = uLight * vis * (pow(NdH, 1400.0) * uGlitter * path + pow(NdH, 120.0) * 0.35) * F * 8.0;

  vec3 col = lit * a * (1.0 - F) + refl * F + spec;
  float alpha = a + (1.0 - a) * F;

  // foam where the water thins out on the sand: lacy, drifting, coming and going with the swell
  float thin = 1.0 - smoothstep(0.0, 0.035, depth);
  float lace = texture2D(uNormals, uv * 0.45 + vec2(uTime * 0.013, -uTime * 0.01)).b;
  float lace2 = texture2D(uNormals, uv * 0.21 - vec2(uTime * 0.008, uTime * 0.012)).g;
  float foam = thin * smoothstep(0.62, 0.98, lace * 0.6 + lace2 * 0.55 + thin * 0.15) * 0.7;      // lacy, mostly clear
  // the thin white line where each swell runs out on the sand, broken up by the lace
  float edge = smoothstep(0.035, 0.01, depth) * smoothstep(0.0, 0.008, depth);
  foam += edge * (0.25 + 0.45 * smoothstep(0.35, 0.75, lace));
  // whitewater from the breaking shore waves, broken up by the lace
  float ww = swFoam(s, uTime, vWorld.xz) * smoothstep(0.2, 0.6, lace * 0.6 + lace2 * 0.5 + 0.25);
  foam += ww * 1.2;
  foam = clamp(foam, 0.0, 0.92) * inside;
  vec3 foamCol = vec3(0.92, 0.95, 0.96) * (uAmb * 0.6 + uLight * (0.06 + 0.3 * sunUp));   // about as bright as white sand
  col = mix(col, foamCol, foam);
  alpha = mix(alpha, 1.0, foam);

  gl_FragColor = vec4(col, alpha);
  if (uDebug == 1) gl_FragColor = vec4(refl, 1.0);
  if (uDebug == 2) gl_FragColor = vec4(vec3(F), 1.0);
  if (uDebug == 3) gl_FragColor = vec4(vec3(a), 1.0);
  if (uDebug == 4) gl_FragColor = vec4(fract(s / 10.0), depth / 5.0, 0.0, 1.0);
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * gl_FragColor.a, fogFactor);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildSea(renderer, { low = false, normals } = {}) {
  let rtScale = low ? 0.35 : 0.5;
  const mirrorRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: low ? 0 : 4 });
  const textureMatrix = new THREE.Matrix4();
  const coast = coastTexture(low ? 512 : 768);

  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.colorSpace = THREE.NoColorSpace;
  normals.anisotropy = 8;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uTexMatrix: { value: textureMatrix },
    uWaves: { value: WAVES.map(([dir, L, A]) => new THREE.Vector4(Math.sin(dir * DEG) * -1, Math.cos(dir * DEG), (2 * Math.PI) / L, A)) },
    uSteep: { value: WAVES.map((w) => w[3]) },
    uMirror: { value: null }, uNormals: { value: null }, uCoast: { value: null },
    uBox: { value: new THREE.Vector4(BOX.x0, BOX.z0, 1 / BOX.w, 1 / BOX.h) },
    uEye: { value: new THREE.Vector3() }, uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLight: { value: new THREE.Color(1, 1, 1) },
    uAmb: { value: new THREE.Color(0.3, 0.35, 0.4) },
    uShallow: { value: new THREE.Color(0x1aa3a6) }, uDeep: { value: new THREE.Color(0x084a66) },
    uGlitter: { value: 1 }, uReflect: { value: 1 }, uDebug: { value: 0 },
  }]);
  // textures can't go through UniformsUtils.merge (it clones them)
  uniforms.uMirror.value = mirrorRT.texture;
  uniforms.uNormals.value = normals;
  uniforms.uCoast.value = coast;
  uniforms.uTexMatrix.value = textureMatrix;

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, depthWrite: true,
  });
  const mesh = new THREE.Mesh(seaGrid(low), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'sea';

  // planar mirror (as three's Water.js): a camera reflected in the plane y = WATER_Y, with an oblique
  // near plane at the surface so nothing below the water ends up in the reflection
  const mirrorCam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const n = new THREE.Vector3(0, 1, 0);
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3(), rot = new THREE.Matrix4(), size = new THREE.Vector2();

  function reflect(scene, camera) {
    camera.updateMatrixWorld();                 // the camera may have moved since the last render
    camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < WATER_Y + 0.05) return;
    const view = camPos.clone();
    view.y = 2 * WATER_Y - camPos.y;
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.copy(look); target.y = 2 * WATER_Y - look.y;
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
    mirrorCam.lookAt(target);
    mirrorCam.far = camera.far;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, WATER_Y - 0.12, 0)).applyMatrix4(mirrorCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = mirrorCam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1; pm[14] = clip.w;
    mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();

    renderer.getDrawingBufferSize(size);
    const w = Math.max(64, Math.round(size.x * rtScale)), h = Math.max(64, Math.round(size.y * rtScale));
    if (mirrorRT.width !== w || mirrorRT.height !== h) mirrorRT.setSize(w, h);
    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
    mesh.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(mirrorRT);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow;
    mesh.visible = true;
  }

  return {
    mesh, material, uniforms, _rt: mirrorRT,
    // light: the main directional light; amb: a colour for the sky's light on the water
    update(t, scene, camera, light, amb) {
      uniforms.uTime.value = t;
      camera.getWorldPosition(uniforms.uEye.value);
      // follow the camera (the grid is a flat disc at the still-water level, so other passes such as
      // ambient occlusion see the water where it is)
      mesh.position.set(uniforms.uEye.value.x, WATER_Y, uniforms.uEye.value.z);
      mesh.updateMatrixWorld();
      uniforms.uLightDir.value.copy(light.userData.dir || n).normalize();
      uniforms.uLight.value.copy(light.color).multiplyScalar(light.intensity);
      if (amb) uniforms.uAmb.value.copy(amb);
      reflect(scene, camera);
    },
    // reflection resolution, as a fraction of the screen's (lowered if the frame rate suffers)
    setScale(s) { rtScale = s; },
  };
}
