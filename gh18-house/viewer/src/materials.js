import * as THREE from 'three';

// PBR materials. Textured sets come from assets/textures/manifest.json (procedural CC0 sets
// made by tools/gen_textures.py). If tools/fetch_polyhaven.py has been run, the manifest
// points at the Poly Haven files instead and nothing here changes.
// All generated geometry carries UVs in metres, so a texture repeats every `size_m`.

const loader = new THREE.TextureLoader();

function tex(url, size, srgb, aniso) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let manifest = {};
  try {
    manifest = await (await fetch('textures/manifest.json')).json();
  } catch (e) {
    console.warn('texture manifest missing, using flat colours', e);
  }

  const M = {};
  function textured(key, opts = {}, texKey = key) {
    const m = manifest[texKey];
    const p = { roughness: 1, metalness: 0, ...opts };
    if (m) {
      p.map = tex(m.color, m.size_m, true, aniso);
      p.normalMap = tex(m.normal, m.size_m, false, aniso);
      p.roughnessMap = tex(m.rough, m.size_m, false, aniso);
      p.normalScale = new THREE.Vector2(opts.normal ?? 0.6, opts.normal ?? 0.6);
    }
    delete p.normal;
    M[key] = new THREE.MeshStandardMaterial(p);
    M[key].name = key;
    return M[key];
  }
  function flat(key, color, opts = {}) {
    M[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
    M[key].name = key;
    return M[key];
  }

  // stone, wood, tiles (PDF finishing schedule + brief palette)
  textured('marble_beige', { roughness: 1.7, normal: 0.25 });
  textured('marble_white', { roughness: 1.4, normal: 0.25 });
  textured('walnut', { normal: 0.5 });
  textured('walnut_fluted', { normal: 1.0 });
  textured('plaster', { normal: 0.25 });
  textured('plaster_ext', { color: 0xf1ece4, normal: 0.3 }, 'plaster');
  textured('tile_matte_lg', { normal: 0.6 });
  textured('tile_matte_dark', { normal: 0.6 });
  textured('vitrified', { normal: 0.6 });
  textured('deck_tile', { normal: 0.8 });
  textured('granite_flamed', { normal: 0.8 });
  textured('cobble', { normal: 1.0 });
  textured('grass', { normal: 1.0 });
  textured('pebbles', { normal: 1.0 });
  textured('concrete', { normal: 0.4 });
  textured('boundary', { color: 0xd9d4cc, normal: 0.4 }, 'plaster');

  flat('pop_white', 0xfbfaf6, { roughness: 0.95, side: THREE.DoubleSide });
  flat('slab_edge', 0xece7df, { roughness: 0.9 });
  flat('black_metal', 0x1c1c1c, { roughness: 0.45, metalness: 0.6 });
  flat('brass', 0xb08d57, { roughness: 0.35, metalness: 1.0 });
  flat('steel', 0x9ea3a8, { roughness: 0.3, metalness: 1.0 });
  flat('ceramic', 0xf7f7f5, { roughness: 0.12 });
  flat('linen', 0xe8e1d4, { roughness: 0.95 });
  flat('linen_white', 0xf3f0ea, { roughness: 0.95 });
  flat('fabric_taupe', 0xb7a893, { roughness: 0.95 });
  flat('fabric_olive', 0x7d7a5a, { roughness: 0.95 });
  flat('fabric_rust', 0xa86a46, { roughness: 0.95 });
  flat('fabric_blue', 0x5f7387, { roughness: 0.95 });
  flat('leather', 0x7a4f32, { roughness: 0.55 });
  flat('rug', 0xd8ccb8, { roughness: 1.0 });
  flat('rug_dark', 0x8c8173, { roughness: 1.0 });
  flat('lacquer_white', 0xf1eee8, { roughness: 0.35 });
  flat('lacquer_greige', 0xcfc6b8, { roughness: 0.4 });
  flat('terracotta', 0xa5623f, { roughness: 0.85 });
  flat('foliage', 0x4f7a3a, { roughness: 0.9 });
  flat('foliage_dark', 0x355c2a, { roughness: 0.9 });
  flat('mattress', 0xf5f2ec, { roughness: 0.95 });
  flat('appliance', 0xd9dadb, { roughness: 0.3, metalness: 0.4 });
  flat('car_paint', 0x4a525b, { roughness: 0.35, metalness: 0.5 });
  flat('tyre', 0x1a1a1a, { roughness: 0.9 });
  flat('asphalt', 0x5d5d5b, { roughness: 0.95 });
  flat('ground', 0xc9c4b8, { roughness: 1.0 });
  flat('lift_steel', 0xb9bcbf, { roughness: 0.25, metalness: 1.0 });
  flat('mirror', 0xdfe6ea, { roughness: 0.02, metalness: 1.0 });

  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xcfe2e6, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6, ior: 1.52, reflectivity: 0.6,
  });
  M.glass.name = 'glass';
  M.glass_frosted = new THREE.MeshPhysicalMaterial({
    color: 0xeef3f4, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
  M.polycarbonate = new THREE.MeshStandardMaterial({
    color: 0xf2f5f6, roughness: 0.5, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
  });

  // emissive light sources (switched on at dusk)
  M.cove = new THREE.MeshStandardMaterial({ color: 0xfff2dc, emissive: 0xffc27a, emissiveIntensity: 0, side: THREE.DoubleSide });
  M.downlight = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, emissive: 0xffd9a0, emissiveIntensity: 0, side: THREE.DoubleSide });
  M.lamp = new THREE.MeshStandardMaterial({ color: 0xf3e6cf, emissive: 0xffb866, emissiveIntensity: 0, side: THREE.DoubleSide });
  M.jaali_glow = new THREE.MeshStandardMaterial({ color: 0xffe1b0, emissive: 0xffa646, emissiveIntensity: 0.6 });
  for (const k of ['cove', 'downlight', 'lamp', 'jaali_glow']) M[k].name = k;

  // per-floor cutaway copies of wall materials are made on demand
  return M;
}

// Material key for a room finish string from house.json.
export function finishKey(s) {
  if (!s) return null;
  if (s.startsWith('marble_beige')) return 'marble_beige';
  if (s.startsWith('tile_matte_lg')) return 'tile_matte_lg';
  if (s.startsWith('tile_matte_dark')) return 'tile_matte_dark';
  if (s.startsWith('vitrified')) return 'vitrified';
  if (s.startsWith('granite')) return 'granite_flamed';
  if (s.startsWith('deck')) return 'deck_tile';
  if (s.startsWith('pebbles')) return 'pebbles';
  if (s.startsWith('walnut')) return 'walnut';
  if (s.startsWith('tile')) return 'tile_matte_lg';
  return 'marble_beige';
}

export const SURFACE_KEY = {
  grass: 'grass', deck_tile: 'deck_tile', granite_flamed: 'granite_flamed', cobble: 'cobble',
  grating: 'black_metal', pebbles: 'pebbles',
};
