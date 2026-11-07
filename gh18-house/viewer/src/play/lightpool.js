import * as THREE from 'three';

// A fixed pool of point lights standing in for all the point lights the world describes (the studio's rooms,
// the reading nook, the candles and diyas, the fire, the court's floodlights, the house's rooms, the street
// lamps...). Every point light costs on every pixel, lit or not, so with dozens the frame slows down; and
// switching them on and off changes the shaders. Instead the described lights are taken out of the scene and
// a constant number of real ones (8; 5 on low-end) are given, each frame, the place, colour, reach and
// brightness of the ones that matter most where the camera is (brightness over distance), re-chosen a few
// times a second. The code that sets a light's intensity (night, flicker) still sets the described light.

export function poolLights(scene, n = 8) {
  scene.updateMatrixWorld(true);
  const sources = [];
  scene.traverse((o) => { if (o.isPointLight && !o.userData.pooled) sources.push(o); });
  for (const l of sources) { l.userData.parent = l.parent; l.userData.parentMatrix = l.parent.matrixWorld.clone(); l.parent.remove(l); }
  const pool = Array.from({ length: n }, () => {
    const p = new THREE.PointLight(0xffffff, 0, 10, 2);
    p.userData.pooled = true; scene.add(p); return { p, src: null };
  });
  const wp = new THREE.Vector3();
  const worldOf = (l, out) => {
    const par = l.userData.parent;
    if (par && par !== scene && par.matrixWorldNeedsUpdate === false) l.userData.parentMatrix.copy(par.matrixWorld);
    return out.copy(l.position).applyMatrix4(l.userData.parentMatrix);
  };
  let timer = 0;
  return {
    count: sources.length,
    reset() { timer = 0; },            // (re-choose on the next update: the camera jumped)
    update(dt, cam) {
      timer -= dt;
      if (timer <= 0) {
        timer = 0.25;
        const scored = [];
        for (const l of sources) {
          if (l.intensity <= 0.001) continue;
          const d = worldOf(l, wp).distanceTo(cam);
          if (l.distance && d > l.distance + 12) continue;
          scored.push({ l, s: l.intensity / (1 + (d * d) / 25) });
        }
        scored.sort((a, b) => b.s - a.s);
        pool.forEach((q, i) => { q.src = scored[i]?.l || null; });
      }
      for (const q of pool) {
        const l = q.src;
        if (!l) { q.p.intensity = 0; continue; }
        worldOf(l, q.p.position);
        q.p.color.copy(l.color); q.p.distance = l.distance; q.p.decay = l.decay; q.p.intensity = l.intensity;
      }
    },
  };
}
