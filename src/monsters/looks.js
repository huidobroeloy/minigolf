import * as THREE from 'three';
import { TEX } from '../course/themes.js';

// Monster models, built from primitives after the show's designs (nothing copied).
// Each builder returns { g, ...named parts } so the classes can animate them.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
let _eyeMat;
const eyeMat = () => (_eyeMat ||= new THREE.MeshBasicMaterial({ map: TEX.xanaEye(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));

function add(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A flat XANA eye decal. */
function decal(parent, pos, size, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), eyeMat());
  m.position.set(...pos);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

/** A tube between two points (legs, rods, tentacle segments). */
function rod(parent, a, b, r0, r1, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), mat);
  m.position.copy(A).lerp(B, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A jointed leg (hip → knee → foot) as a group that can swing about the hip. */
function leg(parent, hip, knee, foot, mat, { r = 0.05, joint = null, claw = null } = {}) {
  const g = new THREE.Group();
  g.position.set(...hip);
  parent.add(g);
  const k = [knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]];
  const f = [foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]];
  rod(g, [0, 0, 0], k, r, r * 0.85, mat);
  rod(g, k, f, r * 0.85, r * 0.3, mat);
  if (joint) add(g, new THREE.SphereGeometry(r * 1.3, 8, 6), joint, k);
  if (claw) rod(g, f, [f[0] * 1.05, f[1] - 0.06, f[2] * 1.05], r * 0.3, 0.005, claw);
  return g;
}

let _sand;
function sandstone() {
  if (_sand) return _sand;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d6a95e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${80 + Math.random() * 40},30,${Math.random() * 0.25})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  g.strokeStyle = 'rgba(90,55,20,0.75)'; g.lineWidth = 2.2;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  _sand = new THREE.CanvasTexture(c);
  _sand.colorSpace = THREE.SRGBColorSpace;
  return _sand;
}

// ---------- Kankrelat: tan shell, XANA eye on top, red orb gun at the front, four legs ----------
export function kankrelatLook() {
  const g = new THREE.Group();
  const shell = std('#d9a34c', { roughness: 0.45 });
  const dark = std('#6e6052'), legMat = std('#8a7a68', { metalness: 0.3 });
  const body = new THREE.Group();
  body.position.y = 0.38;
  g.add(body);
  add(body, new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), shell, [0, -0.05, -0.05], [0.25, 0, 0], [1, 0.95, 1.25]);
  add(body, new THREE.TorusGeometry(0.4, 0.04, 6, 24), std('#9c6a2a'), [0, -0.08, 0], [Math.PI / 2 + 0.2, 0, 0], [1, 1.25, 1]);
  decal(body, [0, 0.34, 0.12], 0.42, [-Math.PI / 2 + 0.55, 0, 0]);
  add(body, new THREE.CylinderGeometry(0.22, 0.26, 0.12, 14), dark, [0, -0.12, 0.05]);
  const gun = add(body, new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 0.7, roughness: 0.2 }), [0, -0.12, 0.42]);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    legs.push(leg(body, [sx * 0.2, -0.14, sz * 0.18], [sx * 0.42, -0.08, sz * 0.32], [sx * 0.5, -0.38, sz * 0.4], legMat, { r: 0.045, joint: dark }));
  }
  return { g, body, legs, gun };
}

// ---------- Blok: a cracked sandstone cube with bulging eyes and red crab legs ----------
export function blokLook() {
  const g = new THREE.Group();
  const cubeMat = new THREE.MeshStandardMaterial({ map: sandstone(), roughness: 0.95 });
  const cube = new THREE.Group();
  cube.position.y = 0.95;
  g.add(cube);
  add(cube, new THREE.BoxGeometry(0.85, 0.85, 0.85), cubeMat);
  const eyeWhite = std('#f1ece0', { roughness: 0.3 });
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const face = new THREE.Group();
    face.rotation.y = ry;
    cube.add(face);
    add(face, new THREE.SphereGeometry(0.2, 16, 12), eyeWhite, [0, 0, 0.42], [0, 0, 0], [1, 1.3, 0.45]);
    decal(face, [0, 0, 0.515], 0.36);
  }
  const red = std('#b5352a', { roughness: 0.5 }), redDark = std('#7a1f18');
  add(g, new THREE.SphereGeometry(0.18, 12, 8), redDark, [0, 0.5, 0]);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const cx = Math.cos(a), cz = Math.sin(a);
    legs.push(leg(g, [cx * 0.1, 0.5, cz * 0.1], [cx * 0.38, 0.55, cz * 0.38], [cx * 0.5, 0.02, cz * 0.5], red, { r: 0.04, joint: redDark, claw: redDark }));
  }
  return { g, cube, legs };
}

// ---------- Hornet: beige head with the eye, needle stinger, curled green abdomen, long wings ----------
export function hornetLook() {
  const g = new THREE.Group();
  const head = std('#d3c48c', { roughness: 0.5 }), green = std('#7f9a3f'), band = std('#55692a'), grey = std('#a9a9a2', { metalness: 0.3 });
  add(g, new THREE.SphereGeometry(0.3, 16, 12), head, [0, 0, 0.1], [0, 0, 0], [1, 0.9, 1.1]);
  decal(g, [0, 0.27, 0.12], 0.3, [-Math.PI / 2 + 0.3, 0, 0]);
  const sting = add(g, new THREE.ConeGeometry(0.045, 0.85, 8), grey, [0, -0.22, 0.5], [Math.PI / 2 + 0.55, 0, 0]);
  // curled abdomen: segments going back and down, then under
  const segs = [];
  let p = [0, -0.05, -0.18];
  for (let i = 0; i < 6; i++) {
    const a = 0.3 + i * 0.42;
    const r = 0.2 - i * 0.022;
    p = [0, p[1] - Math.sin(a) * 0.16, p[2] - Math.cos(a) * 0.16];
    segs.push(add(g, new THREE.SphereGeometry(r, 12, 8), i % 2 ? band : green, p));
  }
  for (let i = 0; i < 4; i++) add(g, new THREE.SphereGeometry(0.035, 6, 4), std('#2a2a2a'), [0.18 * (i % 2 ? 1 : -1), 0.05 - i * 0.08, -0.15 - i * 0.07]);
  const wingMat = new THREE.MeshStandardMaterial({ color: '#f4f4ee', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const wings = [];
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9 - k * 0.15, 0.13), wingMat);
    w.geometry.translate((0.45 - k * 0.07) * s, 0, 0);
    w.position.set(s * 0.12, 0.15 - k * 0.04, -0.02 - k * 0.12);
    w.rotation.y = s * (0.35 + k * 0.25);
    g.add(w);
    wings.push(w);
  }
  return { g, wings, sting, segs };
}

// ---------- Krabe: red-orange carapace with round white windows, four tall jointed legs ----------
export function krabeLook(bodyY = 1.45) {
  const g = new THREE.Group();
  const shell = std('#d24e26', { roughness: 0.45 }), under = std('#a8381a'), legMat = std('#6e2416'), spot = std('#f08a3a');
  const body = new THREE.Group();
  body.position.y = bodyY;
  g.add(body);
  add(body, new THREE.SphereGeometry(0.9, 24, 12), shell, [0, 0.05, 0], [0, 0, 0], [1, 0.32, 0.78]);
  add(body, new THREE.SphereGeometry(0.75, 20, 10), under, [0, -0.12, 0], [0, 0, 0], [1, 0.35, 0.8]);
  add(body, new THREE.TorusGeometry(0.9, 0.04, 6, 32), std('#7a2410'), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.78, 1]);
  const white = std('#f7f4ec', { roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.15 });
  for (const [a, h] of [[-0.35, 0.02], [0, 0.04], [0.35, 0.02], [-0.6, -0.1], [0.6, -0.1]]) {
    add(body, new THREE.SphereGeometry(0.1, 10, 8), white, [Math.sin(a) * 0.86, h, Math.cos(a) * 0.66], [0, 0, 0], [1, 0.8, 0.5]);
  }
  decal(body, [0, 0.3, 0.05], 0.6, [-Math.PI / 2, 0, 0]);
  const legs = [];
  for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const l = leg(body, [lx * 0.45, -0.05, lz * 0.35], [lx * 1.0, 0.45, lz * 0.8], [lx * 1.35, -bodyY + 0.02, lz * 1.25], legMat, { r: 0.07, joint: legMat });
    add(l, new THREE.SphereGeometry(0.035, 6, 4), spot, [lx * 0.75, 0.32, lz * 0.62]);
    legs.push(l);
  }
  return { g, body, legs };
}

// ---------- Tarantula: tall and spindly, white head with the eye, green segmented body ----------
export function tarantulaLook() {
  const g = new THREE.Group();
  const white = std('#ecebe4', { roughness: 0.4 }), green = std('#79a24a'), stripe = std('#4f7a2a'), legMat = std('#9d8d6e'), dark = std('#3a3326');
  const body = new THREE.Group();
  body.position.y = 1.2;
  g.add(body);
  add(body, new THREE.SphereGeometry(0.26, 16, 12), white, [0, 0.08, 0.15], [0, 0, 0], [1, 1, 1.2]);
  decal(body, [0, 0.12, 0.47], 0.32);
  for (let i = 0; i < 3; i++) add(body, new THREE.SphereGeometry(0.2 - i * 0.03, 12, 8), i % 2 ? stripe : green, [0, -0.15 - i * 0.18, 0.02 - i * 0.04]);
  const legs = [];
  for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    legs.push(leg(body, [lx * 0.18, 0.05, lz * 0.1], [lx * 0.75, 0.45, lz * 0.55], [lx * 1.0, -1.2, lz * 0.85], legMat, { r: 0.045, joint: dark }));
  }
  return { g, body, legs };
}

// ---------- Creeper: a gaping head on two long forelegs, a segmented body curling into a tail ----------
export function creeperLook() {
  const g = new THREE.Group();
  const skin = std('#c8a477', { roughness: 0.7 }), legMat = std('#9a6a48'), seg = std('#8d8f93', { metalness: 0.4, roughness: 0.4 });
  const head = new THREE.Group();
  head.position.set(0, 1.55, 0.2);
  g.add(head);
  add(head, new THREE.SphereGeometry(0.32, 16, 12), skin, [0, 0, 0], [0, 0, 0], [1, 0.85, 1.3]);
  add(head, new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#3a1610'), [0, -0.05, 0.36], [Math.PI / 2, 0, 0], [1.1, 0.4, 0.7]); // mouth
  decal(head, [0, 0.26, 0.05], 0.26, [-Math.PI / 2 + 0.3, 0, 0]);
  const legs = [];
  for (const s of [-1, 1]) legs.push(leg(head, [s * 0.28, 0, 0.05], [s * 0.55, -0.2, 0.45], [s * 0.45, -1.53, 0.6], legMat, { r: 0.04, joint: legMat }));
  const body = [];
  for (let i = 0; i < 6; i++) body.push(add(g, new THREE.CylinderGeometry(0.16 - i * 0.018, 0.16 - i * 0.018, 0.22, 10), seg, [0, 1.25 - i * 0.24, -0.05 - i * 0.07], [0.3, 0, 0]));
  return { g, head, legs, body };
}

// ---------- Manta: swept lavender-and-white wings, XANA eye on the back, striped whip tail ----------
export function mantaLook() {
  const g = new THREE.Group();
  const top = std('#9aa6cf', { roughness: 0.35 }), pale = std('#f2f4fa', { roughness: 0.35 });
  const wing = new THREE.Shape();
  wing.moveTo(0, 1.0);
  wing.quadraticCurveTo(0.5, 0.55, 1.55, -0.15);
  wing.quadraticCurveTo(0.9, -0.2, 0.45, -0.75);
  wing.lineTo(0, -0.55);
  wing.lineTo(-0.45, -0.75);
  wing.quadraticCurveTo(-0.9, -0.2, -1.55, -0.15);
  wing.quadraticCurveTo(-0.5, 0.55, 0, 1.0);
  const geo = new THREE.ExtrudeGeometry(wing, { depth: 0.07, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.rotateX(Math.PI / 2);
  const body = add(g, geo, top);
  // pale centre stripe on the back
  const stripe = new THREE.Shape();
  stripe.moveTo(0, 0.9); stripe.lineTo(0.42, -0.2); stripe.lineTo(0, -0.5); stripe.lineTo(-0.42, -0.2); stripe.closePath();
  const sg = new THREE.ShapeGeometry(stripe);
  sg.rotateX(-Math.PI / 2);
  add(g, sg, pale, [0, 0.045, 0]);
  decal(g, [0, 0.06, 0.15], 0.5, [-Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.04, 0.25, 6), top, [s * 0.1, 0, 1.05], [Math.PI / 2, 0, 0]);
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.55);
  g.add(tail);
  for (let i = 0; i < 6; i++) add(tail, new THREE.CylinderGeometry(0.025 - i * 0.003, 0.03 - i * 0.003, 0.32, 6), i % 2 ? pale : top, [0, 0, -0.16 - i * 0.31], [Math.PI / 2, 0, 0]);
  return { g, body, tail };
}

// ---------- Scyphozoa: glass bell, magenta body, long cyan tentacles ----------
export function scyphozoaLook() {
  const g = new THREE.Group();
  const bell = add(g, new THREE.SphereGeometry(0.8, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshPhysicalMaterial({ color: '#a8e6ee', transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }), [0, 0.15, 0]);
  add(g, new THREE.SphereGeometry(0.38, 16, 12), std('#e57fb6', { emissive: '#ff6fbf', emissiveIntensity: 0.35 }), [0, 0.3, 0], [0, 0, 0], [1, 0.6, 1]);
  add(g, new THREE.CylinderGeometry(0.62, 0.62, 0.08, 24), std('#6fd0a8', { metalness: 0.3 }), [0, 0.05, 0]);
  add(g, new THREE.ConeGeometry(0.3, 1.5, 16), std('#9c2a8a', { emissive: '#ff2fb0', emissiveIntensity: 0.25 }), [0, -0.75, 0], [Math.PI, 0, 0]);
  for (const s of [-1, 1]) rod(g, [s * 0.35, 0.02, 0], [s * 0.12, -0.9, 0], 0.03, 0.02, std('#4fc89a'));
  decal(g, [0, -0.25, 0.27], 0.22);
  const tentMat = new THREE.MeshStandardMaterial({ color: '#7ee3e0', emissive: '#3fc6d6', emissiveIntensity: 0.35, roughness: 0.3 });
  const tentacles = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(Math.cos(a) * (0.5 + k * 0.08), -0.1 - k * 0.38, Math.sin(a) * (0.5 + k * 0.08)));
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.025, 5), tentMat);
    t.userData.base = pts;
    t.userData.a = a;
    g.add(t);
    tentacles.push(t);
  }
  return { g, bell, tentacles, tentMat };
}

/** Rebuild a tentacle tube with a sway (cheap enough for 6 tentacles). */
export function swayTentacle(t, time, reach = 1) {
  const pts = t.userData.base.map((p, k) => new THREE.Vector3(
    p.x * reach + Math.sin(time * 1.6 + k * 0.6 + t.userData.a) * 0.08 * k,
    p.y * reach,
    p.z * reach + Math.cos(time * 1.3 + k * 0.5 + t.userData.a) * 0.08 * k,
  ));
  t.geometry.dispose();
  t.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.025, 5);
}

// ---------- Megatank: grey sphere that splits left/right on a white axle, red organic core, glowing eye ----------
export function megatankLook(r = 0.85) {
  const g = new THREE.Group();
  const roller = new THREE.Group();
  roller.position.y = r;
  g.add(roller);
  const shellMat = std('#4b5058', { metalness: 0.35, roughness: 0.5 });
  const rim = std('#d9d9d4', { roughness: 0.4 });
  const halves = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    roller.add(h);
    // a hemisphere whose open side faces the middle
    const hemi = add(h, new THREE.SphereGeometry(r, 28, 16, 0, Math.PI), shellMat, [0, 0, 0], [0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0]);
    add(h, new THREE.TorusGeometry(r * 0.99, 0.035, 6, 36), rim, [0, 0, 0], [0, Math.PI / 2, 0]);
    // XANA eyes on the outside of each half
    for (const [y, z] of [[0.15, 0.55], [0.15, -0.55]]) decal(h, [s * (r * 0.78), y, z], 0.32, [0, s * Math.PI / 2, 0]);
    decal(h, [s * (r + 0.005), 0, 0], 0.45, [0, s * Math.PI / 2, 0]);
    halves.push(h);
  }
  // the inside: a white axle with gold joints, red veiny core, white rings and the eye disc
  const axle = rod(roller, [-r * 1.1, -r * 0.55, 0], [r * 1.1, -r * 0.55, 0], 0.05, 0.05, rim);
  const inside = new THREE.Group();
  roller.add(inside);
  const flesh = std('#a3352c', { emissive: '#ff3a2a', emissiveIntensity: 0.25, roughness: 0.5 });
  add(inside, new THREE.SphereGeometry(r * 0.62, 16, 12), flesh, [0, 0, -0.05], [0, 0, 0], [0.8, 1, 1]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rod(inside, [Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0], [Math.cos(a) * 0.55 * 0.8, Math.sin(a) * 0.6, -0.25], 0.035, 0.02, flesh);
  }
  for (const ry of [0.4, -0.4]) add(inside, new THREE.TorusGeometry(r * 0.72, 0.03, 6, 30, Math.PI * 1.4), rim, [0, 0, 0], [0, ry, 0.3]);
  const eyeDisc = new THREE.Group();
  eyeDisc.position.z = r * 0.55;
  inside.add(eyeDisc);
  const glow = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  add(eyeDisc, new THREE.CircleGeometry(0.34, 32), glow('#ffb35a', 0.85));
  add(eyeDisc, new THREE.RingGeometry(0.16, 0.22, 32), glow('#fff2c8', 0.9), [0, 0, 0.01]);
  add(eyeDisc, new THREE.CircleGeometry(0.09, 20), glow('#ffffff', 1), [0, 0, 0.02]);
  const core = eyeDisc;
  inside.visible = false;
  return { g, roller, halves, inside, core, axle, r };
}
