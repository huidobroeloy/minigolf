import * as THREE from 'three';
import { characterTexture } from '../game/characters.js';

// A glossy render of a character's ball for the select screen, snapshotted once per character.
let R = null;
const cache = new Map();

function setup() {
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(160, 160, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#30304a', 1.3));
  const key = new THREE.DirectionalLight('#ffffff', 2.6);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#6fe7ff', 2);
  rim.position.set(3, 1, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.35, 4.2);
  camera.lookAt(0, 0, 0);
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  scene.add(ball);
  R = { renderer, scene, camera, ball, mat };
  return R;
}

/** Data URL of a shiny orb wearing the character's ball texture. */
export function ballOrb(ch) {
  if (cache.has(ch.id)) return cache.get(ch.id);
  try {
    const r = setup();
    r.mat.map = characterTexture(ch);
    r.mat.emissive = new THREE.Color(ch.glow || '#000000');
    r.mat.emissiveIntensity = ch.glow ? 0.35 : 0;
    r.mat.needsUpdate = true;
    r.ball.rotation.set(0.2, -0.6, 0); // show the "face" of the texture
    r.renderer.render(r.scene, r.camera);
    const url = r.renderer.domElement.toDataURL('image/png');
    cache.set(ch.id, url);
    return url;
  } catch {
    return '';
  }
}
