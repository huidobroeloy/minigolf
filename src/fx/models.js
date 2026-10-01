import * as THREE from 'three';
import { makeTower } from './lyoko.js';
import { TEX } from '../course/themes.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Montapollos: a giant chaotic chicken. */
export function makeChicken() {
  const g = new THREE.Group();
  const white = std('#fbf7ee'), red = std('#e0262b'), yellow = std('#ffb000'), black = std('#111');
  const body = mesh(new THREE.SphereGeometry(0.9, 20, 16), white, g, [0, 1.3, 0], [0, 0, 0], [1, 0.9, 1.25]);
  mesh(new THREE.SphereGeometry(0.55, 16, 12), white, g, [0, 2.15, 0.75]);
  // comb
  for (let i = 0; i < 3; i++) mesh(new THREE.SphereGeometry(0.16, 8, 8), red, g, [0, 2.7 - Math.abs(i - 1) * 0.06, 0.55 + i * 0.2]);
  mesh(new THREE.SphereGeometry(0.12, 8, 8), red, g, [0, 1.85, 1.2], [0, 0, 0], [1, 1.6, 1]); // wattle
  mesh(new THREE.ConeGeometry(0.17, 0.42, 10), yellow, g, [0, 2.1, 1.35], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.09, 8, 8), black, g, [0.3 * s, 2.3, 1.1]);
    const wing = mesh(new THREE.SphereGeometry(0.5, 12, 10), white, g, [0.85 * s, 1.35, -0.05], [0, 0, 0], [0.35, 0.8, 1.1]);
    wing.name = 'wing' + (s > 0 ? 'R' : 'L');
    const leg = new THREE.Group();
    leg.position.set(0.35 * s, 0.6, 0);
    leg.name = 'leg' + (s > 0 ? 'R' : 'L');
    g.add(leg);
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.65, 8), yellow, leg, [0, -0.3, 0]);
    mesh(new THREE.BoxGeometry(0.35, 0.06, 0.45), yellow, leg, [0, -0.62, 0.12]);
  }
  // tail
  mesh(new THREE.ConeGeometry(0.4, 0.8, 8), white, g, [0, 1.75, -1.0], [-0.8, 0, 0]);
  body.name = 'body';
  return g;
}

export function animateChicken(g, t, speed) {
  const k = Math.min(1, speed / 3);
  g.getObjectByName('legL').rotation.x = Math.sin(t * 18) * 0.7 * k;
  g.getObjectByName('legR').rotation.x = -Math.sin(t * 18) * 0.7 * k;
  g.getObjectByName('wingL').rotation.z = -0.3 - Math.abs(Math.sin(t * 22)) * 0.8;
  g.getObjectByName('wingR').rotation.z = 0.3 + Math.abs(Math.sin(t * 22)) * 0.8;
  g.children.forEach((c) => { if (!c.name.startsWith('leg')) c.position.y += 0; });
}

/** The leash lady (sunglasses, handbag, absolutely not in a hurry). */
export function makeLeashLady(color = '#c43b8f') {
  const g = new THREE.Group();
  const skin = std('#f1c27d'), dress = std(color), hair = std('#3b2412'), dark = std('#111', { metalness: 0.5 });
  mesh(new THREE.ConeGeometry(0.42, 1.15, 16), dress, g, [0, 0.75, 0]);
  mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 12), dress, g, [0, 1.45, 0]);
  mesh(new THREE.SphereGeometry(0.2, 16, 12), skin, g, [0, 1.85, 0]);
  mesh(new THREE.SphereGeometry(0.23, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, g, [0, 1.9, -0.02]);
  mesh(new THREE.SphereGeometry(0.12, 10, 8), hair, g, [0, 1.92, -0.2]); // bun
  mesh(new THREE.BoxGeometry(0.3, 0.06, 0.04), dark, g, [0, 1.87, 0.18]); // sunglasses
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), skin, g, [0.28 * s, 1.35, 0.1], [0.5, 0, 0.35 * s]);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), skin, g, [0.12 * s, 0.1, 0]);
  }
  mesh(new THREE.BoxGeometry(0.25, 0.2, 0.1), std('#e8d29a'), g, [-0.42, 1.1, 0.1]); // handbag
  const hand = new THREE.Object3D();
  hand.position.set(0.42, 1.12, 0.32);
  hand.name = 'hand';
  g.add(hand);
  return g;
}

/** A leash line between two points (updated each frame). */
export function makeLeashLine() {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#d42c2c' }));
}

export function makeTornado() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#cfd6dc', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const r = 0.35 + i * 0.32;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12 + i * 0.03, 6, 24), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3 + i * 0.55;
    ring.userData.i = i;
    g.add(ring);
  }
  const core = new THREE.Mesh(new THREE.ConeGeometry(3, 5.5, 20, 1, true), new THREE.MeshBasicMaterial({
    color: '#9aa6b0', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
  }));
  core.rotation.x = Math.PI;
  core.position.y = 2.8;
  g.add(core);
  return g;
}

export function animateTornado(g, t) {
  g.children.forEach((c, k) => {
    if (c.userData.i !== undefined) {
      c.rotation.z = t * (6 - c.userData.i * 0.3);
      c.position.x = Math.sin(t * 3 + k) * 0.15 * c.userData.i;
      c.position.z = Math.cos(t * 2.5 + k) * 0.15 * c.userData.i;
    } else c.rotation.y = t * 4;
  });
}

export function makeVolcano() {
  const g = new THREE.Group();
  const rock = std('#3a2a22', { flatShading: true, roughness: 1 });
  const cone = mesh(new THREE.CylinderGeometry(0.5, 1.6, 1.6, 10, 1, true), rock, g, [0, 0.8, 0]);
  cone.material.side = THREE.DoubleSide;
  const lava = mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: '#ff5a00' }), g, [0, 1.55, 0], [-Math.PI / 2, 0, 0]);
  lava.name = 'lava';
  const light = new THREE.PointLight('#ff6a00', 6, 8);
  light.position.y = 2.2;
  light.name = 'glow';
  g.add(light);
  return g;
}

export function makeMagmaPool(r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshStandardMaterial({
    color: '#ff4a00', emissive: '#ff3300', emissiveIntensity: 1.6, roughness: 0.5,
  }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

export function makeWave(width) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1.6, 1.6, width, 24, 1, true, 0, Math.PI * 1.2);
  geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#1e7fd6', transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide,
  }));
  m.position.y = 1.2;
  m.rotation.x = -0.3;
  g.add(m);
  const foam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }));
  foam.position.set(0, 2.7, 0.6);
  g.add(foam);
  return g;
}

export function makeBlackHole(range) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshBasicMaterial({ color: '#000' }));
  core.position.y = 0.35;
  g.add(core);
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.0, 40), new THREE.MeshBasicMaterial({
    color: '#a64dff', transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  }));
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 0.35;
  disk.name = 'disk';
  g.add(disk);
  const area = new THREE.Mesh(new THREE.RingGeometry(range - 0.08, range, 64), new THREE.MeshBasicMaterial({
    color: '#a64dff', transparent: true, opacity: 0.35, depthWrite: false,
  }));
  area.rotation.x = -Math.PI / 2;
  area.position.y = 0.02;
  g.add(area);
  return g;
}

export function makeSpawnBumper(r) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.5, 24), std('#ff2b5e', { emissive: '#ff2b5e', emissiveIntensity: 0.5 }));
  base.position.y = 0.25;
  base.castShadow = true;
  g.add(base);
  const top = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#ffffff'));
  top.position.y = 0.5;
  g.add(top);
  const arrow = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.05, 6, 24), std('#ffe600', { emissive: '#ffe600', emissiveIntensity: 1 }));
  arrow.rotation.x = Math.PI / 2;
  arrow.position.y = 0.52;
  g.add(arrow);
  g.userData.base = base;
  return g;
}

/**
 * Pickup: a mini Lyoko tower (slender body, dark crown, black roots) wrapped in wisps of the
 * category colour, with the XANA eye glowing above it. The exact item is a surprise.
 */
const eyeMats = new Map();
export function makePickup(color = '#3da5ff') {
  const g = new THREE.Group();
  const tower = makeTower(color, 1.25, '#eef2fa', { r: 0.12, wisps: 26, wispSize: 0.16, shadows: false });
  g.add(tower);
  if (!eyeMats.has(color)) {
    eyeMats.set(color, new THREE.SpriteMaterial({ map: TEX.xanaEyeGlow(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  const eye = new THREE.Sprite(eyeMats.get(color));
  eye.scale.set(0.55, 0.55, 1);
  eye.position.y = 1.75;
  g.add(eye);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  g.userData = { tower, eye, ring };
  return g;
}

/** Name tag sprite for ghost balls. */
export function makeLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Rajdhani, sans-serif';
  const w = Math.min(250, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 12); g.fill();
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(0.16, 0.04, 1);
  s.renderOrder = 10;
  return s;
}
