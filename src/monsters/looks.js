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

// ---------- canvas textures for the monsters (all procedural) ----------
const _tex = new Map();
function canvasTex(key, size, draw) {
  if (_tex.has(key)) return _tex.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _tex.set(key, t);
  return t;
}
/** Swirly marbled shell (Kankrelat, Hornet head, Creeper skin). */
function marble(key, base, dark, light) {
  return canvasTex(key, 256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = i % 2 ? dark : light;
      g.globalAlpha = 0.18 + Math.random() * 0.2;
      g.lineWidth = 4 + Math.random() * 10;
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.3) * 60; g.quadraticCurveTo(x + 20, y - 20, x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}
/** Glossy lacquer with darker streaks (Krabe shell). */
function lacquer(key, base, streak) {
  return canvasTex(key, 128, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, base); grd.addColorStop(1, streak);
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.globalAlpha = 0.25;
    for (let i = 0; i < 12; i++) { g.fillStyle = streak; g.fillRect(Math.random() * s, 0, 2 + Math.random() * 4, s); }
    g.globalAlpha = 1;
  });
}
/** Wet, veiny flesh (Creeper arms, Megatank insides). */
function flesh(key, base, vein) {
  return canvasTex(key, 128, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.strokeStyle = vein; g.globalAlpha = 0.5; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1;
  });
}

/** A two-segment insect leg with a ball joint at the knee and a pointed foot. */
function insectLeg(parent, hip, knee, foot, mat, { r = 0.05, joint = null, tip = null, taper = 0.35 } = {}) {
  const g = new THREE.Group();
  g.position.set(...hip);
  parent.add(g);
  const k = [knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]];
  const f = [foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]];
  add(g, new THREE.SphereGeometry(r * 1.35, 10, 8), joint || mat);
  rod(g, [0, 0, 0], k, r, r * 0.9, mat);
  add(g, new THREE.SphereGeometry(r * 1.2, 10, 8), joint || mat, k);
  rod(g, k, f, r * 0.85, r * taper * 0.4, tip || mat);
  return g;
}

// ---------- Kankrelat: a marbled amber bell of a shell with the eye on its face, a red orb gun
// under the front lip between two little fangs, four stocky jointed legs on a hip frame ----------
export function kankrelatLook() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ map: marble('kank', '#e0a640', '#a8641c', '#f6d27a'), roughness: 0.38, metalness: 0.05 });
  const dark = std('#5a4a3c', { roughness: 0.5 }), legMat = std('#8d7c69', { metalness: 0.35, roughness: 0.45 }), joint = std('#6a5a4a', { metalness: 0.4 });
  const body = new THREE.Group();
  body.position.y = 0.38;
  g.add(body);
  // the bell: wide at the rim, bulging, rounded on top, leaning a little forward
  const prof = [[0.0, 0.6], [0.17, 0.58], [0.31, 0.5], [0.41, 0.36], [0.46, 0.2], [0.47, 0.06], [0.45, -0.03], [0.38, -0.07]].map(([r, y]) => new THREE.Vector2(r, y));
  const bell = add(body, new THREE.LatheGeometry(prof, 32), shell, [0, -0.06, -0.02], [0.12, 0, 0], [1, 1, 1.12]);
  bell.material.side = THREE.DoubleSide;
  add(body, new THREE.TorusGeometry(0.34, 0.045, 8, 28), std('#8f5a22', { roughness: 0.5 }), [0, -0.1, 0], [Math.PI / 2, 0, 0], [1, 1.12, 1]);
  // the eye, big on the front of the shell
  decal(body, [0, 0.2, 0.545], 0.4, [-0.28, 0, 0]);
  // underside, fangs and the red orb gun
  add(body, new THREE.CylinderGeometry(0.3, 0.24, 0.1, 16), dark, [0, -0.13, 0]);
  for (const s of [-1, 1]) add(body, new THREE.ConeGeometry(0.035, 0.16, 6), std('#c8a060'), [s * 0.14, -0.16, 0.36], [Math.PI - 0.3, 0, s * 0.2]);
  const gun = add(body, new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 0.7, roughness: 0.15 }), [0, -0.12, 0.38]);
  // hip frame and legs
  add(body, new THREE.CylinderGeometry(0.05, 0.05, 0.62, 8), joint, [0, -0.16, 0], [0, 0, Math.PI / 2]);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    legs.push(insectLeg(body, [sx * 0.3, -0.16, sz * 0.14], [sx * 0.5, -0.04, sz * 0.3], [sx * 0.6, -0.38, sz * 0.4], legMat, { r: 0.05, joint }));
  }
  return { g, body, legs, gun };
}

// ---------- Blok: a cracked sandstone cube, a domed white eye with the XANA symbol on each side,
// riding a cluster of red segmented crab legs ----------
export function blokLook() {
  const g = new THREE.Group();
  const cubeMat = new THREE.MeshStandardMaterial({ map: sandstone(), roughness: 0.95, bumpMap: sandstone(), bumpScale: 0.02 });
  const cube = new THREE.Group();
  cube.position.y = 0.95;
  g.add(cube);
  add(cube, new THREE.BoxGeometry(0.85, 0.85, 0.85, 2, 2, 2), cubeMat);
  // chipped edges: a few darker chunks on the corners
  const chip = std('#a87a3a', { roughness: 1, flatShading: true });
  for (const [x, y, z] of [[0.4, 0.4, 0.3], [-0.38, 0.4, -0.35], [0.41, -0.38, -0.2], [-0.4, -0.4, 0.38]]) add(cube, new THREE.DodecahedronGeometry(0.07, 0), chip, [x, y, z]);
  const eyeWhite = std('#f4efe2', { roughness: 0.25 });
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const face = new THREE.Group();
    face.rotation.y = ry;
    cube.add(face);
    add(face, new THREE.TorusGeometry(0.21, 0.03, 8, 24), std('#9c7038', { roughness: 0.8 }), [0, 0, 0.425], [0, 0, 0], [1, 1.25, 1]);
    add(face, new THREE.SphereGeometry(0.2, 18, 14), eyeWhite, [0, 0, 0.41], [0, 0, 0], [1, 1.25, 0.55]);
    decal(face, [0, 0, 0.525], 0.34);
  }
  const red = std('#c0402c', { roughness: 0.45 }), redDark = std('#7a1f18', { roughness: 0.5 });
  add(g, new THREE.SphereGeometry(0.22, 14, 10), redDark, [0, 0.46, 0], [0, 0, 0], [1, 0.6, 1]);
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const cx = Math.cos(a), cz = Math.sin(a);
    legs.push(insectLeg(g, [cx * 0.16, 0.44, cz * 0.16], [cx * 0.58, 0.5, cz * 0.58], [cx * 0.74, 0.02, cz * 0.74], red, { r: 0.038, joint: redDark, tip: redDark }));
  }
  return { g, cube, legs };
}

// ---------- Hornet: a big pale-olive head with the eye, a long grey proboscis, a ridged green
// abdomen curling under with dark studs, two pairs of long see-through wings swept back ----------
export function hornetLook() {
  const g = new THREE.Group();
  const headMat = new THREE.MeshStandardMaterial({ map: marble('hornet', '#d8cf94', '#9da35a', '#efe9be'), roughness: 0.45 });
  const green = std('#7d9a3c', { roughness: 0.5 }), band = std('#55692a', { roughness: 0.5 }), grey = std('#b1b1aa', { metalness: 0.4, roughness: 0.3 }), stud = std('#2a2a24', { metalness: 0.3 });
  add(g, new THREE.SphereGeometry(0.34, 20, 16), headMat, [0, 0.02, 0.12], [0, 0, 0], [0.95, 0.88, 1.12]);
  add(g, new THREE.SphereGeometry(0.2, 14, 10), headMat, [0, -0.12, 0.3], [0, 0, 0], [0.8, 0.7, 1]); // snout
  decal(g, [0, 0.31, 0.36], 0.3, [-Math.PI / 2 + 0.85, 0, 0]);
  const sting = add(g, new THREE.ConeGeometry(0.045, 0.85, 10), grey, [0, -0.25, 0.62], [Math.PI / 2 + 0.6, 0, 0]);
  // ridged abdomen curling back and under
  const segs = [];
  let p = [0, -0.06, -0.16];
  for (let i = 0; i < 7; i++) {
    const a = 0.25 + i * 0.4;
    const r = 0.21 - i * 0.02;
    p = [0, p[1] - Math.sin(a) * 0.15, p[2] - Math.cos(a) * 0.15];
    const s = add(g, new THREE.SphereGeometry(r, 14, 10), i % 2 ? band : green, p, [a, 0, 0], [1, 0.85, 1]);
    segs.push(s);
    if (i < 5) for (const sx of [-1, 1]) add(g, new THREE.SphereGeometry(0.03, 6, 5), stud, [sx * r * 0.95, p[1], p[2]]);
  }
  const wingMat = new THREE.MeshStandardMaterial({ color: '#f6f6ee', transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, roughness: 0.1 });
  const wingShape = (len, wid) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -wid * 0.3); sh.quadraticCurveTo(len * 0.5, -wid * 0.8, len, 0); sh.quadraticCurveTo(len * 0.5, wid * 0.7, 0, wid * 0.3); sh.closePath();
    return new THREE.ShapeGeometry(sh);
  };
  const wings = [];
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const geo = wingShape(1.05 - k * 0.2, 0.24 - k * 0.04);
    if (s < 0) geo.scale(-1, 1, 1);
    const w = new THREE.Mesh(geo, wingMat);
    w.position.set(s * 0.14, 0.2 - k * 0.04, -0.05 - k * 0.12);
    w.rotation.set(-Math.PI / 2 + 0.5, s * (0.6 + k * 0.3), 0);
    g.add(w);
    wings.push(w);
  }
  return { g, wings, sting, segs };
}

// ---------- Krabe: a glossy red-orange oval shell with a brim, rows of white eye-windows above
// and below it, orange ball hips and four tall dark-red legs with orange markings ----------
export function krabeLook(bodyY = 1.45) {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ map: lacquer('krabe', '#e0582a', '#a8331a'), roughness: 0.3, metalness: 0.05 });
  const under = std('#c24a20', { roughness: 0.4 }), legMat = std('#6a2214', { roughness: 0.45 }), spot = std('#f39a48'), hip = std('#ef7a30', { roughness: 0.35 });
  const body = new THREE.Group();
  body.position.y = bodyY;
  g.add(body);
  add(body, new THREE.SphereGeometry(0.92, 32, 16), shell, [0, 0.05, 0], [0, 0, 0], [0.82, 0.3, 1.05]); // top shell, long front-to-back
  add(body, new THREE.TorusGeometry(0.92, 0.05, 8, 40), std('#8a2a12', { roughness: 0.4 }), [0, 0.0, 0], [Math.PI / 2, 0, 0], [0.82, 1.05, 1]); // the brim
  add(body, new THREE.SphereGeometry(0.72, 24, 12), under, [0, -0.16, 0], [0, 0, 0], [0.78, 0.38, 1.0]); // lower body
  const white = std('#f8f6ef', { roughness: 0.15, emissive: '#ffffff', emissiveIntensity: 0.12 });
  const dark = std('#3a1008');
  // windows round the brim (front and sides) and a lower row
  for (const [a, h, r, rad] of [[-0.55, 0.05, 0.13, 0.86], [0, 0.07, 0.14, 0.86], [0.55, 0.05, 0.13, 0.86], [-1.05, 0.04, 0.11, 0.86], [1.05, 0.04, 0.11, 0.86], [-0.45, -0.22, 0.09, 0.66], [0, -0.21, 0.1, 0.66], [0.45, -0.22, 0.09, 0.66]]) {
    const x = Math.sin(a) * rad * 0.82, z = Math.cos(a) * rad * 1.05;
    const w = add(body, new THREE.SphereGeometry(r, 14, 10), white, [x, h, z], [0, 0, 0], [1, 0.75, 0.45]);
    w.rotation.y = Math.atan2(x / 0.82, z / 1.05); // facing outward
    add(body, new THREE.SphereGeometry(r * 0.35, 8, 6), dark, [x * 1.03, h, z * 1.03]);
  }
  decal(body, [0, 0.33, 0.1], 0.62, [-Math.PI / 2, 0, 0]);
  const legs = [];
  for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    add(body, new THREE.SphereGeometry(0.15, 14, 10), hip, [lx * 0.5, -0.12, lz * 0.42]);
    const hipP = [lx * 0.55, -0.1, lz * 0.45], kneeP = [lx * 1.05, 0.5, lz * 0.85], footP = [lx * 1.4, -bodyY + 0.02, lz * 1.3];
    const l = insectLeg(body, hipP, kneeP, footP, legMat, { r: 0.07, joint: hip });
    const kk = kneeP.map((v, i) => v - hipP[i]), ff = footP.map((v, i) => v - hipP[i]);
    for (const k of [0.18, 0.4]) add(l, new THREE.SphereGeometry(0.045, 8, 6), spot, kk.map((v, i) => v + (ff[i] - v) * k), [0, 0, 0], [1, 1.6, 1]);
    legs.push(l);
  }
  return { g, body, legs };
}

// ---------- Tarantula: tall and spindly; a small white head with the eye, a pale-green striped
// thorax hanging under it, and six very long thin tan legs with dark joints and points ----------
export function tarantulaLook() {
  const g = new THREE.Group();
  const white = std('#efeee6', { roughness: 0.35 }), green = std('#a6c56a', { roughness: 0.5 }), stripe = std('#4f7a2a', { roughness: 0.5 });
  const legMat = std('#b49c74', { roughness: 0.5 }), dark = std('#3a3326', { metalness: 0.3 }), tipMat = std('#5a4a32');
  const body = new THREE.Group();
  body.position.y = 1.2;
  g.add(body);
  add(body, new THREE.SphereGeometry(0.24, 18, 14), white, [0, 0.1, 0.16], [0, 0, 0], [1, 0.95, 1.15]);
  decal(body, [0, 0.13, 0.44], 0.32);
  add(body, new THREE.CylinderGeometry(0.07, 0.09, 0.14, 10), dark, [0, -0.06, 0.08]); // neck
  // the thorax: striped segments hanging down and back
  for (let i = 0; i < 5; i++) {
    const r = 0.2 - Math.abs(i - 1.5) * 0.03;
    add(body, new THREE.SphereGeometry(r, 14, 10), i % 2 ? stripe : green, [0, -0.18 - i * 0.13, -0.02 - i * 0.05], [0, 0, 0], [1, 0.62, 0.95]);
  }
  const legs = [];
  for (const [lx, lz] of [[1, 1], [-1, 1], [1, 0], [-1, 0], [1, -1], [-1, -1]]) {
    legs.push(insectLeg(body, [lx * 0.15, -0.02, lz * 0.1], [lx * 0.82, 0.55, lz * 0.62], [lx * 1.05, -1.2, lz * 0.95], legMat, { r: 0.035, joint: dark, tip: tipMat, taper: 0.25 }));
  }
  return { g, body, legs };
}

// ---------- Creeper: a lumpy beige head with a gaping mouth, two long thin rust-coloured arms it
// stands on, and a segmented grey metal body ending in a curled tail ----------
export function creeperLook() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ map: marble('creeper', '#cfa97a', '#8f6a44', '#e6caa0'), roughness: 0.6, flatShading: true });
  const arm = new THREE.MeshStandardMaterial({ map: flesh('creeperArm', '#9a5a3a', '#5a2a1a'), roughness: 0.55 });
  const seg = std('#8d9095', { metalness: 0.55, roughness: 0.35 }), segDark = std('#4a4d52', { metalness: 0.5 });
  const head = new THREE.Group();
  head.position.set(0, 1.55, 0.2);
  g.add(head);
  add(head, new THREE.IcosahedronGeometry(0.32, 2), skin, [0, 0, 0], [0, 0, 0], [1.05, 0.85, 1.25]);
  for (const [x, y, z, r] of [[0.18, 0.14, 0.1, 0.14], [-0.17, 0.16, 0.05, 0.13], [0, 0.2, -0.15, 0.15], [0.2, -0.05, -0.12, 0.12]]) add(head, new THREE.IcosahedronGeometry(r, 1), skin, [x, y, z]);
  add(head, new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#3a1610', { roughness: 0.8 }), [0, -0.08, 0.36], [Math.PI / 2 + 0.2, 0, 0], [1.15, 0.5, 0.75]); // mouth
  for (const s of [-1, 1]) add(head, new THREE.ConeGeometry(0.025, 0.09, 5), std('#efe6cc'), [s * 0.1, -0.02, 0.44], [Math.PI, 0, 0]); // teeth
  decal(head, [0, 0.29, 0.1], 0.24, [-Math.PI / 2 + 0.35, 0, 0]);
  const legs = [];
  for (const s of [-1, 1]) legs.push(insectLeg(head, [s * 0.3, 0, 0.05], [s * 0.62, -0.15, 0.45], [s * 0.48, -1.53, 0.62], arm, { r: 0.045, taper: 0.2 }));
  const body = [];
  for (let i = 0; i < 7; i++) {
    const r = 0.16 - i * 0.015;
    body.push(add(g, new THREE.CylinderGeometry(r, r * 0.92, 0.2, 14), i % 2 ? segDark : seg, [0, 1.25 - i * 0.2, -0.05 - i * 0.09], [0.35 + i * 0.08, 0, 0]));
  }
  // the tail curling along the ground behind it
  const tailPts = [[0, -0.08, -0.7], [0, -0.18, -1.0], [0.1, -0.2, -1.3], [0.35, -0.15, -1.45]].map((q) => new THREE.Vector3(q[0], q[1] + 0.3, q[2]));
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts), 16, 0.05, 8), seg);
  return { g, head, legs, body };
}

// ---------- Manta: a flat pale blue-violet ray with swept, pointed wings, a white stripe from nose
// to tail with the ringed eye of XANA on it, two little horns and a long banded whip tail ----------
export function mantaLook() {
  const g = new THREE.Group();
  const top = std('#9eaad2', { roughness: 0.3 }), pale = std('#f4f5fb', { roughness: 0.3 });
  const wing = new THREE.Shape();
  wing.moveTo(0, 1.05);
  wing.quadraticCurveTo(0.35, 0.75, 0.75, 0.3);
  wing.quadraticCurveTo(1.25, 0.05, 1.7, -0.45);   // the pointed wing tip, swept back
  wing.quadraticCurveTo(1.0, -0.15, 0.5, -0.7);
  wing.lineTo(0.12, -0.6);
  wing.lineTo(-0.12, -0.6);
  wing.lineTo(-0.5, -0.7);
  wing.quadraticCurveTo(-1.0, -0.15, -1.7, -0.45);
  wing.quadraticCurveTo(-1.25, 0.05, -0.75, 0.3);
  wing.quadraticCurveTo(-0.35, 0.75, 0, 1.05);
  const geo = new THREE.ExtrudeGeometry(wing, { depth: 0.05, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 });
  geo.rotateX(Math.PI / 2);
  const body = add(g, geo, top);
  // a gentle hump down the middle
  add(g, new THREE.SphereGeometry(0.38, 18, 10), top, [0, 0.0, 0.2], [0, 0, 0], [0.75, 0.09, 2]);
  // the white stripe and the ringed eye
  const stripe = new THREE.Shape();
  stripe.moveTo(0, 1.0); stripe.lineTo(0.5, 0.15); stripe.lineTo(0.12, -0.55); stripe.lineTo(-0.12, -0.55); stripe.lineTo(-0.5, 0.15); stripe.closePath();
  const sg = new THREE.ShapeGeometry(stripe);
  sg.rotateX(Math.PI / 2); // same orientation as the wings: nose forward (+z)
  add(g, sg, new THREE.MeshStandardMaterial({ color: '#f4f5fb', roughness: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), [0, 0.07, 0]);
  decal(g, [0, 0.08, 0.1], 0.5, [-Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.035, 0.28, 6), top, [s * 0.1, 0, 1.12], [Math.PI / 2, 0, s * -0.15]);
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.6);
  g.add(tail);
  for (let i = 0; i < 8; i++) add(tail, new THREE.CylinderGeometry(0.022 - i * 0.002, 0.026 - i * 0.002, 0.3, 6), i % 3 === 1 ? pale : top, [0, 0, -0.15 - i * 0.29], [Math.PI / 2, 0, 0]);
  return { g, body, tail };
}

// ---------- Scyphozoa: a translucent teal bell with a pink brain-like body inside, a magenta cone
// hanging in a green frame that carries the eye, and long flowing cyan tentacles ----------
export function scyphozoaLook() {
  const g = new THREE.Group();
  const bell = add(g, new THREE.SphereGeometry(0.85, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshPhysicalMaterial({ color: '#a9e8ee', transparent: true, opacity: 0.42, roughness: 0.08, transmission: 0.3, depthWrite: false, side: THREE.DoubleSide }), [0, 0.12, 0], [0, 0, 0], [1, 0.85, 1]);
  const brainMat = new THREE.MeshStandardMaterial({ map: flesh('scyBrain', '#ea8cbe', '#b04a86'), emissive: '#ff6fbf', emissiveIntensity: 0.3, roughness: 0.5 });
  add(g, new THREE.IcosahedronGeometry(0.42, 3), brainMat, [0, 0.32, 0], [0, 0, 0], [1, 0.55, 1]);
  add(g, new THREE.TorusGeometry(0.66, 0.05, 8, 32), std('#6fd0a8', { metalness: 0.4, roughness: 0.3 }), [0, 0.06, 0], [Math.PI / 2, 0, 0]);
  add(g, new THREE.ConeGeometry(0.3, 1.5, 20), std('#a02c8e', { emissive: '#ff2fb0', emissiveIntensity: 0.3, roughness: 0.35 }), [0, -0.75, 0], [Math.PI, 0, 0]);
  const frame = std('#4fc89a', { metalness: 0.4, roughness: 0.3 });
  for (const s of [-1, 1]) { rod(g, [s * 0.4, 0.04, 0], [s * 0.14, -0.95, 0], 0.035, 0.02, frame); rod(g, [0, 0.04, s * 0.4], [0, -0.7, s * 0.12], 0.03, 0.02, frame); }
  add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20), frame, [0, -0.28, 0.2], [Math.PI / 2, 0, 0]);
  decal(g, [0, -0.28, 0.22], 0.26);
  const tentMat = new THREE.MeshStandardMaterial({ color: '#86e8e4', emissive: '#3fc6d6', emissiveIntensity: 0.4, roughness: 0.25 });
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 9; k++) pts.push(new THREE.Vector3(Math.cos(a) * (0.55 + k * 0.1), -0.08 - k * 0.36, Math.sin(a) * (0.55 + k * 0.1)));
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.022, 5), tentMat);
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

// ---------- Shark (Digital Sea): steel-blue torpedo with fins and a XANA eye on its snout ----------
export function sharkLook() {
  const g = new THREE.Group();
  const hull = std('#5d7fa6', { metalness: 0.4, roughness: 0.35 }), belly = std('#dfe8f2', { roughness: 0.4 });
  const body = add(g, new THREE.SphereGeometry(0.34, 20, 14), hull, [0, 0, 0], [0, 0, 0], [0.75, 0.7, 1.9]);
  add(g, new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly, [0, 0.02, 0.02], [0, 0, 0], [0.78, 0.72, 1.85]);
  const fin = (w, h) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-w, 0); s.quadraticCurveTo(-w * 0.2, h * 0.4, w * 0.25, h); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); };
  // dorsal fin
  add(g, fin(0.35, 0.32), hull, [-0.015, 0.2, 0.05], [0, -Math.PI / 2, 0]);
  // side fins
  for (const s of [-1, 1]) add(g, fin(0.28, 0.22), hull, [s * 0.2, -0.08, 0.15], [Math.PI / 2, 0, s * 0.9]);
  // tail: a forked fin on a wagging joint
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.62);
  g.add(tail);
  const tg = new THREE.Shape();
  tg.moveTo(0, 0); tg.lineTo(-0.32, 0.3); tg.lineTo(-0.2, 0); tg.lineTo(-0.32, -0.26); tg.closePath();
  const tfin = add(tail, new THREE.ExtrudeGeometry(tg, { depth: 0.03, bevelEnabled: false }), hull, [-0.015, 0, 0.05], [0, Math.PI / 2, 0]);
  // red gill slits and the eye on the snout
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(0.01, 0.12, 0.02), std('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.6 }), [s * 0.245, 0.02, 0.28 - i * 0.07]);
  const eyeM = decal(g, [0, 0.12, 0.5], 0.22, [-0.5, 0, 0]);
  return { g, body, tail, tfin, eye: eyeM };
}

// ---------- Kongre (Digital Sea): one of its giant tentacles, reaching up out of the deep ----------
export function kongreArmLook(len) {
  const g = new THREE.Group();
  const mat = std('#3a2a63', { emissive: '#7a3cff', emissiveIntensity: 0.25, roughness: 0.4 });
  const sucker = std('#e0b8ff', { emissive: '#ff6fe0', emissiveIntensity: 0.4 });
  // lies along +z from the pivot, thinning to a curled tip
  const n = 10;
  for (let i = 0; i < n; i++) {
    const r = 0.42 - (i / n) * 0.3;
    add(g, new THREE.SphereGeometry(r, 12, 8), mat, [0, r * 0.7, (i + 0.5) * (len / n)], [0, 0, 0], [1, 0.8, 1.15]);
    if (i % 2 === 0) for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(r * 0.25, 8, 6), sucker, [s * r * 0.75, r * 0.5, (i + 0.5) * (len / n)]);
  }
  const tip = add(g, new THREE.TorusGeometry(0.16, 0.06, 6, 12, Math.PI * 1.4), mat, [0, 0.25, len + 0.1], [0, Math.PI / 2, 0]);
  return { g, mat, tip };
}

// ---------- Kongre: the colossal squid of the Digital Sea (background scenery) ----------
export function kongreLook() {
  const g = new THREE.Group();
  const mat = std('#2a1d4a', { emissive: '#5a2cbf', emissiveIntensity: 0.3, roughness: 0.5 });
  add(g, new THREE.SphereGeometry(3, 24, 16), mat, [0, 4, 0], [0, 0, 0], [1, 1.9, 1]);
  add(g, new THREE.ConeGeometry(2.6, 3, 4), mat, [0, 10, 0], [0, Math.PI / 4, 0]);
  decal(g, [0, 3.2, 2.85], 2.2);
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3(Math.cos(a) * (1.5 + k * 1.1), -k * 1.4, Math.sin(a) * (1.5 + k * 1.1)));
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.5, 8), mat);
    t.userData = { a, pts };
    g.add(t);
    arms.push(t);
  }
  return { g, arms };
}

// ---------- Ninja (the Cortex): a slim dark-red humanoid with the eye on its head and a sword ----------
export function ninjaLook() {
  const g = new THREE.Group();
  const skin = std('#3a0d14', { roughness: 0.35, metalness: 0.3 }), trim = std('#c81e2e', { roughness: 0.3, emissive: '#5a0008', emissiveIntensity: 0.6 });
  const body = new THREE.Group();
  g.add(body);
  add(body, new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), skin, [0, 0.95, 0]);
  add(body, new THREE.TorusGeometry(0.17, 0.03, 6, 18), trim, [0, 1.05, 0], [Math.PI / 2, 0, 0]);
  const head = add(body, new THREE.SphereGeometry(0.15, 16, 12), skin, [0, 1.42, 0]);
  decal(body, [0, 1.43, 0.155], 0.2);
  const legs = [-1, 1].map((s) => leg(body, [s * 0.09, 0.66, 0], [s * 0.12, 0.35, 0.06], [s * 0.12, 0.02, 0], skin, { r: 0.06 }));
  const armL = leg(body, [-0.22, 1.18, 0], [-0.3, 0.95, 0.08], [-0.26, 0.78, 0.2], skin, { r: 0.05 });
  // the sword arm: a group we can swing, holding a thin glowing blade
  const armR = new THREE.Group();
  armR.position.set(0.22, 1.18, 0);
  body.add(armR);
  rod(armR, [0, 0, 0], [0.08, -0.32, 0.12], 0.05, 0.04, skin);
  const sword = new THREE.Group();
  sword.position.set(0.08, -0.34, 0.14);
  armR.add(sword);
  add(sword, new THREE.BoxGeometry(0.03, 0.04, 0.12), trim, [0, 0, 0]);
  add(sword, new THREE.BoxGeometry(0.035, 0.012, 0.75), new THREE.MeshStandardMaterial({ color: '#e8ecf4', emissive: '#ff2a3a', emissiveIntensity: 0.35, metalness: 0.8, roughness: 0.2 }), [0, 0, 0.42]);
  return { g, body, head, legs, armL, armR, sword };
}

// ---------- Kalamar (the Digital Sea): a squid with a pointed mantle, the eye, trailing arms ----------
export function kalamarLook() {
  const g = new THREE.Group();
  const skin = std('#6a3fb0', { roughness: 0.35, emissive: '#1a0a3a', emissiveIntensity: 0.4 }), pale = std('#d9c6ff', { roughness: 0.4 });
  const body = new THREE.Group();
  g.add(body);
  // the mantle points forward (+z), fins at the tip
  const mantle = add(body, new THREE.ConeGeometry(0.32, 1.1, 18), skin, [0, 0, 0.35], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) add(body, new THREE.ConeGeometry(0.2, 0.36, 3), skin, [s * 0.24, 0, 0.75], [0, 0, s * Math.PI / 2], [1, 1, 0.25]);
  add(body, new THREE.SphereGeometry(0.33, 16, 12), pale, [0, 0, -0.15], [0, 0, 0], [1, 1, 0.8]);
  decal(body, [0, 0.33, -0.12], 0.36, [-Math.PI / 2, 0, 0]);
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, arm = new THREE.Group();
    arm.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, -0.38);
    body.add(arm);
    for (let k = 0; k < 4; k++) add(arm, new THREE.SphereGeometry(0.06 - k * 0.01, 8, 6), k % 2 ? pale : skin, [0, 0, -0.1 - k * 0.14]);
    arms.push(arm);
  }
  return { g, body, mantle, arms };
}

// ---------- Guardian: XANA's translucent prison sphere with red rings ----------
export function guardianLook(r = 0.8) {
  const g = new THREE.Group();
  const shell = add(g, new THREE.SphereGeometry(r, 28, 18), new THREE.MeshPhysicalMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.32, roughness: 0.08, transmission: 0.4, depthWrite: false }), [0, r, 0]);
  shell.castShadow = false;
  const rings = [0, 1, 2].map((i) => add(g, new THREE.TorusGeometry(r * 1.06, 0.02, 6, 48), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), [0, r, 0], [Math.PI / 2 + i * 0.7, i * 0.9, 0]));
  return { g, shell, rings };
}
