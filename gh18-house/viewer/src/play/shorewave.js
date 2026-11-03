// The waves that come in to the beach (world step 3), shared by the sea, the sand and the spray so they
// agree: a train of swells with crests parallel to the shore, ~24 m apart, arriving every ~8.5 s. They
// grow as the water shallows, steepen (a peaked crest with a steep face), break into whitewater a few
// metres out, and run up the sloping sand as a thin sheet that drains back down.
// s: signed distance to the coastline in metres (+ = out to sea); t: seconds; xz: world position.

export const SHORE_GLSL = /* glsl */`
const float SW_K = 6.2831853 / 24.0;     // wavenumber: crests 24 m apart
const float SW_W = 6.2831853 / 8.5;      // a wave every 8.5 s
float swPhase(float s, float t, vec2 xz) {
  // crests not quite straight, and sets that come and go
  return SW_K * s + SW_W * t + 0.6 * sin(dot(xz, vec2(0.031, 0.022)) + t * 0.05) + 0.25 * sin(dot(xz, vec2(-0.09, 0.07)));
}
float swAmp(float s, float t, vec2 xz) {
  float set = 0.75 + 0.25 * sin(t * 0.11 + dot(xz, vec2(0.004, 0.003)));        // bigger and smaller sets
  return (0.02 + 0.075 * smoothstep(42.0, 4.0, s)) * set * (1.0 - smoothstep(-6.0, -4.0, s));
}
// height of the shore wave (m)
float swHeight(float s, float t, vec2 xz) {
  float x = 0.5 + 0.5 * sin(swPhase(s, t, xz));
  return swAmp(s, t, xz) * (pow(x, 2.4) - 0.3);              // peaked crests, long shallow troughs
}
// whitewater: on the face of a breaking crest in the surf zone, and trailing behind it as it runs in
float swFoam(float s, float t, vec2 xz) {
  float ph = swPhase(s, t, xz);
  float breaking = smoothstep(13.0, 5.0, s) * smoothstep(0.0, 2.5, s);     // in the surf, not on the sand
  float face = pow(0.5 + 0.5 * sin(ph + 0.55), 5.0);
  float trail = pow(0.5 + 0.5 * sin(ph + 1.4), 2.5) * 0.55;
  return breaking * clamp(face + trail, 0.0, 1.0);
}
`;
