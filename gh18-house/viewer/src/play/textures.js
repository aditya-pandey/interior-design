import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// The photo-scanned textures and sky images for /play/ (Poly Haven, CC0), if they have been fetched
// with tools/fetch_play_textures.py into play/textures/. Without them nothing changes: the generated
// textures (surfaces.js and the builders' own) stay.
//
// A scan replaces a material's colour, relief, roughness and AO maps. Its colour is balanced against the
// tone the material was designed with (the average colour of the scan is divided out and the designed
// tone put back), so a scanned oak keeps the shade of oak each piece was given, only now with real
// grain; the white sand stays white.

const BASE = 'play/textures/';

function meanColour(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  const m = new THREE.Color(0, 0, 0), t = new THREE.Color();
  for (let i = 0; i < 256; i++) { t.setRGB(d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255, THREE.SRGBColorSpace); m.r += t.r; m.g += t.g; m.b += t.b; }
  return m.multiplyScalar(1 / 256);
}

export async function loadScans() {
  let manifest;
  try {
    const r = await fetch(BASE + 'manifest.json');
    if (!r.ok) return null;
    manifest = await r.json();
  } catch { return null; }
  const loader = new THREE.TextureLoader();
  const pending = {};
  const load = (file, srgb) => new Promise((res) => loader.load(BASE + file, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    res(t);
  }, undefined, () => res(null)));
  const get = (key) => {
    const e = manifest.textures?.[key];
    if (!e) return Promise.resolve(null);
    return (pending[key] ||= Promise.all([e.color && load(e.color, true), e.normal && load(e.normal), e.rough && load(e.rough), e.ao && load(e.ao)])
      .then(([map, normalMap, roughnessMap, aoMap]) => (map ? { map, normalMap, roughnessMap, aoMap, size: e.size_m || 1, mean: meanColour(map.image), asset: e.asset } : null)));
  };
  return {
    manifest,
    get,
    // put scan `key` on material `mat`.
    //   tone: the colour the surface should average to (default: the material's own colour; for
    //         vertex-coloured materials white, as the vertices carry the tone)
    //   repeat: UV repeats per scan tile (default 1 / size, for UVs in metres); uv: false keeps the
    //         generated maps' repeat (for models with 0..1 UVs)
    async apply(mat, key, { tone, repeat, normalScale = 1, roughness } = {}) {
      const s = await get(key);
      if (!s) return false;
      const rep = repeat ?? 1 / s.size;
      const prep = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(rep, rep); c.needsUpdate = true; return c; };
      // what it should average to: the given tone, else what the material looked like before
      // (its generated texture's average times its colour), else its colour
      const target = tone ? new THREE.Color(tone) : mat.map?.image ? meanColour(mat.map.image).multiply(mat.color) : mat.color.clone();
      mat.map = prep(s.map);
      mat.color.setRGB(Math.min(4, target.r / Math.max(0.02, s.mean.r)), Math.min(4, target.g / Math.max(0.02, s.mean.g)), Math.min(4, target.b / Math.max(0.02, s.mean.b)));
      if (s.normalMap) { mat.normalMap = prep(s.normalMap); mat.normalScale = new THREE.Vector2(normalScale, normalScale); }
      if (s.roughnessMap) { mat.roughnessMap = prep(s.roughnessMap); mat.roughness = roughness ?? 1; }
      if (s.aoMap) { mat.aoMap = prep(s.aoMap); mat.aoMap.channel = 0; mat.aoMapIntensity = 0.7; }
      mat.needsUpdate = true;
      return true;
    },
    // an HDR sky: { texture (for lighting), background, phi (the angle of its sun, three's equirect
    // convention atan2(z, x)), meanUp (average brightness of its upper half, capped at 8) } or null
    async sky(key, renderer) {
      const e = manifest.hdri?.[key];
      if (!e) return null;
      const tex = await new Promise((res) => new RGBELoader().load(BASE + e.file, res, undefined, () => res(null)));
      if (!tex) return null;
      // find the sun: the brightest pixel in the upper half
      const { data, width, height } = tex.image;
      let best = -1, bi = 0, sum = 0, n = 0;
      const isHalf = data instanceof Uint16Array;
      const val = (i) => (isHalf ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
      // rows run bottom-up once flipped; RGBELoader's data is top row first, so the sky is y < height / 2
      for (let y = 0; y < height / 2; y += 2) for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4, L = val(i) * 0.2 + val(i + 1) * 0.7 + val(i + 2) * 0.1;
        if (L > best) { best = L; bi = x; }
        const w = Math.cos(((y + 0.5) / height - 0.5) * Math.PI);    // equal-area weight (row latitude)
        sum += Math.min(L, 8) * Math.abs(w); n += Math.abs(w);
      }
      // equirect u -> direction angle phi = atan2(z, x) = (u - 0.5) * 2pi (three's equirectUv)
      const phi = ((bi + 0.5) / width - 0.5) * Math.PI * 2;
      // cap the sun in the photo: the scene's own sunlight is the directional light, so the photo only
      // adds the sky's light (and the visible disc stays bright without flooding the glow)
      const CAP = 16;
      for (let i = 0; i < data.length; i++) {
        if ((i & 3) === 3) continue;
        if (isHalf) { if (THREE.DataUtils.fromHalfFloat(data[i]) > CAP) data[i] = THREE.DataUtils.toHalfFloat(CAP); } else if (data[i] > CAP) data[i] = CAP;
      }
      tex.needsUpdate = true;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const rt = pmrem.fromEquirectangular(tex);
      pmrem.dispose();
      return { texture: rt.texture, background: tex, phi, meanUp: sum / Math.max(1, n), asset: e.asset };
    },
  };
}
