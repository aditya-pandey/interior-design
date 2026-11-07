import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// The camera's finish for laptops and desktops: the scene is drawn in high dynamic range (half-float,
// 4x multisampled), then ambient occlusion darkens the creases and contact points (GTAO), the bright
// things glow a little (the sun on the water, the moon, lamps, fairy lights), and the result is tone
// mapped. If the frame rate suffers, quality steps down by itself: AO off first, then a lower pixel ratio,
// then a coarser reflection on the sea.

export function createPost(renderer, scene, camera, { low = false } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: low ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (!low) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 1;          // the pass's own defaults (radius 0.25 m) suit this scale
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.55, 2.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const quality = { level: low ? 1 : 0, samples: [], waitUntil: performance.now() + 4000 };
  return {
    composer, bloom, gtao,
    render() { composer.render(); },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    rest() { quality.waitUntil = performance.now() + 4000; quality.samples.length = 0; },
    setBloom(strength, threshold) { bloom.strength = strength; bloom.threshold = threshold; },
    // call once a frame with the frame time; returns a message when it steps quality down
    watch(dt, onPixelRatio, onReflection) {
      const now = performance.now();
      if (now < quality.waitUntil || document.hidden) return null;
      quality.samples.push(dt);
      if (quality.samples.length < 90) return null;
      const avg = quality.samples.reduce((a, b) => a + b, 0) / quality.samples.length;
      quality.samples.length = 0;
      if (avg < 1 / 38) return null;
      quality.waitUntil = now + 3000;
      if (gtao && gtao.enabled) { gtao.enabled = false; return 'ao-off'; }
      if (renderer.getPixelRatio() > 1.01) { onPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.3)); return 'pixel-ratio'; }
      if (!quality.reflLow && onReflection) { quality.reflLow = true; onReflection(); return 'reflection'; }
      return null;
    },
  };
}
