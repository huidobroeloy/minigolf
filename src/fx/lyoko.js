import * as THREE from 'three';
import { TEX } from '../course/themes.js';

// Lyoko set pieces built from primitives: towers, Aelita and the Kolossus.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function part(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

let haloTex;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x += 8) {
    const grd = g.createLinearGradient(0, 128, 0, 0);
    const a = 0.25 + Math.random() * 0.6;
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 3 + Math.random() * 3, 128);
  }
  haloTex = new THREE.CanvasTexture(c);
  haloTex.wrapS = THREE.RepeatWrapping;
  return haloTex;
}

/**
 * A Lyoko tower: white body, dark crown, and the swirling aura around it.
 * color: aura colour — '#ffffff' neutral, '#ff2a2a' XANA, '#2aff6a' Aelita, '#3d8bff' Franz Hopper.
 */
export function makeTower(color = '#9fd8ff', h = 7) {
  const g = new THREE.Group();
  const white = std('#e9eef5', { roughness: 0.45 });
  const dark = std('#2a2f3a', { roughness: 0.5, metalness: 0.3 });
  part(new THREE.CylinderGeometry(1.1, 1.25, h, 32), white, g, [0, h / 2, 0]);
  part(new THREE.CylinderGeometry(1.25, 1.1, 0.5, 32), dark, g, [0, h + 0.25, 0]);
  part(new THREE.CylinderGeometry(0.9, 1.25, 0.6, 32), white, g, [0, h + 0.8, 0]);
  // vertical seams
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(new THREE.BoxGeometry(0.06, h * 0.9, 0.06), dark, g, [Math.cos(a) * 1.17, h * 0.47, Math.sin(a) * 1.17]);
  }
  // the aura: two counter-rotating streaked cylinders + a glowing base ring
  const tex = haloTexture();
  const auraMat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, h * 0.8, 32, 1, true), auraMat);
  a1.position.y = h * 0.4;
  const a2 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.75, h * 0.6, 32, 1, true), auraMat.clone());
  a2.position.y = h * 0.3;
  g.add(a1, a2);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.06, 8, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);
  g.userData = {
    aura: [a1, a2], ring,
    setColor(c) { a1.material.color.set(c); a2.material.color.set(c); ringMat.color.set(c); },
    animate(t) {
      a1.rotation.y = t * 0.6; a2.rotation.y = -t * 0.9;
      tex.offset.y = (t * 0.25) % 1;
      a1.material.opacity = 0.55 + 0.25 * Math.sin(t * 2.3);
      a2.material.opacity = 0.45 + 0.25 * Math.sin(t * 3.1 + 1);
    },
  };
  return g;
}

/** Aelita (Lyoko form): pink hair, elf ears, pink outfit. About 1.7 units tall. */
export function makeAelita() {
  const g = new THREE.Group();
  const skin = std('#f6d2b8'), hair = std('#ff7fc8', { roughness: 0.5 }), dress = std('#e8559c'), light = std('#ffc4e3'), boot = std('#7a2a55');
  const body = new THREE.Group();
  g.add(body);
  part(new THREE.CylinderGeometry(0.18, 0.24, 0.55, 12), dress, body, [0, 1.0, 0]);
  part(new THREE.ConeGeometry(0.34, 0.42, 14), light, body, [0, 0.72, 0]);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.09 * s, 0.6, 0);
    body.add(leg);
    part(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), skin, leg, [0, -0.25, 0]);
    part(new THREE.BoxGeometry(0.12, 0.12, 0.2), boot, leg, [0, -0.52, 0.03]);
    legs.push(leg);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.24 * s, 1.22, 0);
    body.add(arm);
    part(new THREE.CylinderGeometry(0.045, 0.04, 0.48, 8), dress, arm, [0, -0.22, 0]);
    part(new THREE.SphereGeometry(0.05, 8, 6), skin, arm, [0, -0.48, 0]);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.y = 1.45;
  body.add(head);
  part(new THREE.SphereGeometry(0.17, 18, 14), skin, head, [0, 0, 0]);
  part(new THREE.SphereGeometry(0.19, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, head, [0, 0.03, -0.01]);
  part(new THREE.BoxGeometry(0.3, 0.07, 0.08), hair, head, [0, 0.1, 0.14]); // bangs
  for (const s of [-1, 1]) {
    part(new THREE.ConeGeometry(0.035, 0.18, 6), skin, head, [0.17 * s, 0.03, 0], [0, 0, -s * 1.2]); // elf ears
    part(new THREE.SphereGeometry(0.025, 8, 6), std('#2a6a3a'), head, [0.06 * s, 0.01, 0.15]); // green eyes
  }
  g.userData = {
    animate(t, running) {
      const k = running ? 1 : 0.15;
      legs[0].rotation.x = Math.sin(t * 12) * 0.7 * k;
      legs[1].rotation.x = -Math.sin(t * 12) * 0.7 * k;
      arms[0].rotation.x = -Math.sin(t * 12) * 0.6 * k;
      arms[1].rotation.x = Math.sin(t * 12) * 0.6 * k;
      body.position.y = running ? Math.abs(Math.sin(t * 12)) * 0.06 : Math.sin(t * 2) * 0.01;
    },
    float(on) { arms.forEach((a, i) => { a.rotation.z = on ? (i ? -1 : 1) * 0.5 : 0; }); },
  };
  return g;
}

let crackTex;
function lavaCracks() {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ff7a1a'; g.shadowColor = '#ffb000'; g.shadowBlur = 8;
  for (let i = 0; i < 22; i++) {
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  crackTex = new THREE.CanvasTexture(c);
  crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping;
  return crackTex;
}

/**
 * The Kolossus: a towering monster of dark rock veined with lava, one colossal arm.
 * Built ~25 units tall. userData.slam(k) poses the arm (0 = raised … 1 = smashed down).
 */
export function makeKolossus() {
  const g = new THREE.Group();
  const cracks = lavaCracks();
  const rock = new THREE.MeshStandardMaterial({ color: '#2b2522', roughness: 1, flatShading: true, emissive: '#ff5a10', emissiveMap: cracks, emissiveIntensity: 1.6 });
  const chunk = (r, pos, parent, s = [1, 1, 1]) => part(new THREE.DodecahedronGeometry(r, 0), rock, parent, pos, [Math.random(), Math.random(), Math.random()], s);
  // legs
  for (const s of [-1, 1]) {
    chunk(2.0, [3 * s, 2.2, 0], g, [1, 1.4, 1]);
    chunk(1.8, [3.2 * s, 6.5, 0], g, [1, 1.3, 1]);
  }
  // torso and shoulders
  chunk(4.2, [0, 12, 0], g, [1.3, 1.25, 0.9]);
  chunk(2.6, [0, 16.8, 0.4], g);
  chunk(2.4, [-5.4, 15.6, 0], g);
  chunk(2.8, [5.6, 15.8, 0], g);
  // head with XANA's eye
  const head = new THREE.Group();
  head.position.set(0, 20, 0.6);
  g.add(head);
  chunk(1.9, [0, 0, 0], head, [1, 1.1, 1]);
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: TEX.xanaEye(), transparent: true, color: '#ffffff', depthWrite: false }));
  eye.position.set(0, 0.1, 1.95);
  head.add(eye);
  // the small left arm
  chunk(1.3, [-6.4, 11.5, 0.5], g, [1, 1.6, 1]);
  // the colossal right arm (pivot at the shoulder)
  const arm = new THREE.Group();
  arm.position.set(6.2, 16, 0);
  g.add(arm);
  chunk(1.9, [0.8, -3, 0], arm, [1, 1.7, 1]);
  chunk(2.2, [1.4, -7.8, 0.3], arm, [1, 1.6, 1]);
  const fist = chunk(3.0, [1.8, -12, 0.6], arm, [1.2, 1.1, 1.2]);
  fist.name = 'fist';
  g.userData = {
    arm, head, rock, cracks,
    slam(k) {
      // 0: arm raised high, 1: fist smashed forward and down
      arm.rotation.x = THREE.MathUtils.lerp(-2.2, 0.5, k);
      head.rotation.x = THREE.MathUtils.lerp(-0.2, 0.25, k);
    },
    breathe(t) {
      cracks.offset.y = (t * 0.03) % 1;
      rock.emissiveIntensity = 1.3 + Math.sin(t * 1.7) * 0.4;
    },
  };
  return g;
}
