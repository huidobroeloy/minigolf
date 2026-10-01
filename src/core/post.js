import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Bloom so neon, tower halos, lava cracks and emissive trims actually glow. */
export class Post {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  setSector(key) {
    // neon-heavy sectors get a stronger glow
    // bright sectors only bloom their emissives; neon sectors glow harder
    const [strength, threshold] = { fortune: [0.9, 0.55], sector5: [0.7, 0.8], ice: [0.35, 0.97], desert: [0.45, 0.94], forest: [0.5, 0.9], mountain: [0.5, 0.9] }[key] ?? [0.5, 0.9];
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  render() { this.composer.render(); }
}
