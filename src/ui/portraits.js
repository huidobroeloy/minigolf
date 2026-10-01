import * as THREE from 'three';
import { makeFigurine } from '../fx/figurines.js';
import { CHARACTERS } from '../game/characters.js';

// One small WebGL renderer for the character select: it snapshots each figurine into a
// portrait image, and drives the big live spinning preview.
let R = null;
const cache = new Map();

function setup() {
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(256, 256, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3550', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#6fe7ff', 1.8);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.08, 3.2);
  camera.lookAt(0, 1.0, 0);
  R = { renderer, scene, camera, figs: new Map(), live: null };
  return R;
}

function figure(id) {
  const r = setup();
  if (!r.figs.has(id)) r.figs.set(id, makeFigurine(id));
  return r.figs.get(id);
}

function renderOnce(id, yaw = 0) {
  const r = setup();
  const fig = figure(id);
  fig.rotation.y = yaw;
  r.scene.add(fig);
  r.renderer.render(r.scene, r.camera);
  r.scene.remove(fig);
}

/** Portrait image (data URL) for a character id. */
export function portrait(id) {
  if (cache.has(id)) return cache.get(id);
  try {
    renderOnce(id, 0.35);
    const url = setup().renderer.domElement.toDataURL('image/png');
    cache.set(id, url);
    return url;
  } catch {
    return '';
  }
}

export function preloadPortraits() { for (const c of CHARACTERS) portrait(c.id); }

/** Show a spinning figurine inside `container` (replaces any previous live view). */
export function mountLive(container, id) {
  const r = setup();
  stopLive();
  const canvas = r.renderer.domElement;
  canvas.className = 'live-fig';
  container.appendChild(canvas);
  const fig = figure(id);
  r.scene.add(fig);
  const t0 = performance.now();
  const tick = () => {
    if (!canvas.isConnected) return stopLive();
    const t = (performance.now() - t0) / 1000;
    fig.rotation.y = Math.sin(t * 0.9) * 0.7;
    fig.position.y = Math.sin(t * 2) * 0.03;
    fig.traverse((o) => { if (o.userData.spin) o.rotation.y = t; });
    r.renderer.render(r.scene, r.camera);
    r.live.raf = requestAnimationFrame(tick);
  };
  r.live = { fig, raf: 0 };
  tick();
}

export function stopLive() {
  if (!R || !R.live) return;
  cancelAnimationFrame(R.live.raf);
  R.scene.remove(R.live.fig);
  R.live.fig.position.y = 0;
  R.live = null;
}
