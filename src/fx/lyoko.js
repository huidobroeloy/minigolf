import * as THREE from 'three';
import { TEX } from '../course/themes.js';

// Lyoko set pieces built from primitives: towers, the tower interior, Aelita and the Kolossus.

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

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let dotTex;
function wispTexture() {
  return dotTex ||= canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
}

// ---------------------------------------------------------------------------
// Tower: a tall slender cylinder in the sector's colour, darker rounded crown,
// black roots gripping the ground, and a wispy particle aura.
//   aura: '#ffffff' neutral · '#ff2a2a' activated by XANA · '#2aff6a' Aelita
// ---------------------------------------------------------------------------
export const TOWER_BODY = {
  desert: '#d8b27e', forest: '#d8d6c6', ice: '#cfe4f4', mountain: '#cbbfb2', sector5: '#e6ecff', fortune: '#d9c6f2',
};

export function makeTower(aura = '#ffffff', h = 14, body = '#d8d6c6') {
  const g = new THREE.Group();
  const r = 0.85;
  const skin = new THREE.MeshStandardMaterial({ color: body, roughness: 0.35, metalness: 0.05 });
  const crownMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(body).multiplyScalar(0.45), roughness: 0.4 });
  part(new THREE.CylinderGeometry(r, r, h, 40), skin, g, [0, h / 2, 0]);
  // a slightly lighter vertical band like the show's shading
  part(new THREE.CylinderGeometry(r * 1.004, r * 1.004, h * 0.96, 40, 1, true, -0.35, 0.7),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(body).lerp(new THREE.Color('#ffffff'), 0.35), roughness: 0.3 }), g, [0, h / 2, 0]);
  part(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.35, 40), crownMat, g, [0, h + 0.05, 0]);
  part(new THREE.SphereGeometry(r * 1.02, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), crownMat, g, [0, h + 0.22, 0], [0, 0, 0], [1, 0.35, 1]);
  // black roots
  const rootMat = new THREE.MeshStandardMaterial({ color: '#111014', roughness: 0.35, metalness: 0.4 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3;
    const reach = 1.4 + ((i * 37) % 10) / 10 * 1.4;
    const up = 1.2 + ((i * 53) % 10) / 10 * 1.6;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.9, up, Math.sin(a) * r * 0.9),
      new THREE.Vector3(Math.cos(a + 0.25) * (r + 0.35), up * 0.55, Math.sin(a + 0.25) * (r + 0.35)),
      new THREE.Vector3(Math.cos(a - 0.15) * (r + reach * 0.6), 0.25, Math.sin(a - 0.15) * (r + reach * 0.6)),
      new THREE.Vector3(Math.cos(a) * (r + reach), -0.05, Math.sin(a) * (r + reach)),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.12 + (i % 3) * 0.05, 6, false), rootMat);
    tube.castShadow = true;
    g.add(tube);
  }
  part(new THREE.CylinderGeometry(r * 1.15, r * 1.5, 0.9, 20), rootMat, g, [0, 0.4, 0]);

  // aura: wisps drifting up and around the tower
  const N = 70;
  const pos = new Float32Array(N * 3);
  const seeds = Array.from({ length: N }, (_, i) => ({ a: i * 2.399, sp: 0.4 + ((i * 17) % 10) / 12, off: ((i * 31) % 100) / 100, rr: r + 0.15 + ((i * 13) % 10) / 18 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const wisps = new THREE.Points(geo, new THREE.PointsMaterial({
    color: aura, map: wispTexture(), size: 0.75, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  wisps.frustumCulled = false;
  g.add(wisps);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.7, h * 0.9, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: aura, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.position.y = h * 0.5;
  g.add(glow);

  g.userData = {
    setColor(c) { wisps.material.color.set(c); glow.material.color.set(c); },
    animate(t) {
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        const u = ((t * s.sp * 0.12 + s.off) % 1);
        const ang = s.a + t * s.sp * 0.6;
        const rr = s.rr + Math.sin(t * 2 + i) * 0.12;
        pos[i * 3] = Math.cos(ang) * rr;
        pos[i * 3 + 1] = 0.6 + u * h * 1.02;
        pos[i * 3 + 2] = Math.sin(ang) * rr;
      }
      geo.attributes.position.needsUpdate = true;
      glow.material.opacity = 0.08 + 0.05 * Math.sin(t * 2.2);
    },
  };
  g.userData.animate(0);
  return g;
}

// ---------------------------------------------------------------------------
// Tower interior: a cylinder of glowing data screens, a white platform with the
// Lyoko symbol, and a floating holo-panel that types the code.
// ---------------------------------------------------------------------------
let screensTex;
function screensTexture() {
  if (screensTex) return screensTex;
  screensTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#04102a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = x * 64 + 5, py = y * 64 + 6, pw = 54, ph = 46;
      const k = (x * 7 + y * 3) % 5;
      g.fillStyle = `rgba(${60 + k * 12},${140 + k * 15},255,0.55)`;
      g.fillRect(px, py, pw, ph);
      g.strokeStyle = 'rgba(190,230,255,0.9)'; g.lineWidth = 1.5; g.strokeRect(px, py, pw, ph);
      g.fillStyle = 'rgba(220,245,255,0.85)';
      for (let l = 0; l < 4; l++) g.fillRect(px + 5, py + 7 + l * 9, 14 + ((x + y + l) * 11) % 32, 2);
      if (k === 2) { g.beginPath(); g.arc(px + 40, py + 30, 7, 0, 7); g.stroke(); }
    }
  });
  screensTex.wrapS = screensTex.wrapT = THREE.RepeatWrapping;
  return screensTex;
}

export function makeTowerInterior() {
  const g = new THREE.Group();
  // a dark shell so no sky leaks in
  g.add(new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), new THREE.MeshBasicMaterial({ color: '#020716', side: THREE.BackSide, fog: false })));
  const tex = screensTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(6, 4);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 34, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, color: '#8fb8e8', fog: false }));
  wall.position.y = 14;
  g.add(wall);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.3, 48), new THREE.MeshStandardMaterial({ color: '#d6e8f6', emissive: '#6fb8ef', emissiveIntensity: 0.2, roughness: 0.4 }));
  floor.position.y = -0.15;
  g.add(floor);
  const top = floor.clone();
  top.position.y = 9;
  g.add(top);
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: TEX.xanaEye(), transparent: true, color: '#3d8bff', depthWrite: false }));
  eye.rotation.x = -Math.PI / 2;
  eye.position.y = 0.02;
  g.add(eye);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.25 + i * 0.5, 4.35 + i * 0.5, 64), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.7 - i * 0.2, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    g.add(ring);
    rings.push(ring);
  }
  const light = new THREE.PointLight('#bfe6ff', 40, 30);
  light.position.set(0, 7, 5);
  g.add(light);
  // the holo-panel Aelita touches
  const pc = document.createElement('canvas');
  pc.width = 512; pc.height = 256;
  const ptex = new THREE.CanvasTexture(pc);
  ptex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({
    map: ptex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, color: '#ffffff',
  }));
  panel.visible = false;
  g.add(panel);
  const drawPanel = (text) => {
    const c = pc.getContext('2d');
    c.clearRect(0, 0, 512, 256);
    const grd = c.createLinearGradient(0, 0, 512, 256);
    grd.addColorStop(0, 'rgba(255,170,230,0.55)'); grd.addColorStop(1, 'rgba(170,120,255,0.45)');
    c.fillStyle = grd; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4; c.strokeRect(4, 4, 504, 248);
    c.fillStyle = '#ffffff'; c.font = 'bold 54px "Courier New", monospace';
    c.textBaseline = 'middle';
    text.split('\n').forEach((line, i) => c.fillText(line, 28, 80 + i * 90));
    ptex.needsUpdate = true;
  };
  drawPanel('');
  g.userData = {
    panel, drawPanel,
    animate(t) {
      tex.offset.y = (t * 0.03) % 1;
      rings.forEach((r, i) => { r.rotation.z = t * (0.2 + i * 0.15); });
    },
  };
  return g;
}

// ---------------------------------------------------------------------------
// Aelita (Lyoko form, seasons 1–3): pink bob, elf ears, dark-red top and skirt,
// mint leggings with bands, arm wraps. ~1.75 units tall, big stylised head.
// ---------------------------------------------------------------------------
export function makeAelita() {
  const g = new THREE.Group();
  const skin = std('#f7d4bd'), hair = std('#ff86c8', { roughness: 0.55 }), top = std('#8c1f3f'), skirt = std('#7d1b38'),
    legs = std('#cfe6cf'), band = std('#6e8f72'), wrap = std('#a7b8a6'), boot = std('#d07aa8');
  const body = new THREE.Group();
  g.add(body);
  // torso: crop top over a bare midriff, layered skirt
  part(new THREE.CylinderGeometry(0.17, 0.2, 0.32, 14), top, body, [0, 1.17, 0]);
  part(new THREE.CylinderGeometry(0.15, 0.16, 0.14, 12), skin, body, [0, 0.95, 0]);
  part(new THREE.CylinderGeometry(0.2, 0.31, 0.3, 16), skirt, body, [0, 0.76, 0]);
  part(new THREE.TorusGeometry(0.2, 0.025, 6, 20), std('#e6a3c2'), body, [0, 0.89, 0], [Math.PI / 2, 0, 0]);
  const legsArr = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.09 * s, 0.66, 0);
    body.add(leg);
    part(new THREE.CylinderGeometry(0.065, 0.05, 0.6, 10), legs, leg, [0, -0.3, 0]);
    part(new THREE.TorusGeometry(0.062, 0.02, 6, 14), band, leg, [0, -0.12, 0], [Math.PI / 2, 0, 0]);
    part(new THREE.TorusGeometry(0.056, 0.02, 6, 14), band, leg, [0, -0.38, 0], [Math.PI / 2, 0, 0]);
    part(new THREE.BoxGeometry(0.11, 0.1, 0.2), boot, leg, [0, -0.62, 0.03]);
    legsArr.push(leg);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.22 * s, 1.3, 0);
    body.add(arm);
    part(new THREE.SphereGeometry(0.06, 10, 8), top, arm, [0, 0, 0]); // short sleeve
    part(new THREE.CylinderGeometry(0.04, 0.035, 0.22, 8), skin, arm, [0, -0.13, 0]);
    part(new THREE.CylinderGeometry(0.045, 0.04, 0.24, 8), wrap, arm, [0, -0.34, 0]); // arm wraps
    part(new THREE.SphereGeometry(0.048, 8, 6), skin, arm, [0, -0.49, 0]);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.y = 1.56;
  body.add(head);
  part(new THREE.SphereGeometry(0.21, 20, 16), skin, head, [0, 0, 0.01]);
  // full bob with volume and a few spikes
  part(new THREE.SphereGeometry(0.25, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, head, [0, 0.03, -0.03], [0, 0, 0], [1.08, 1, 1.05]);
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.3;
    part(new THREE.ConeGeometry(0.07, 0.18, 6), hair, head, [Math.sin(a) * 0.2, 0.12, Math.cos(a) * 0.16], [0.9, a, 0]); // bangs
  }
  for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.13, 12, 10), hair, head, [0.2 * s, -0.08, -0.04], [0, 0, 0], [0.6, 1.1, 1]);
  for (const s of [-1, 1]) {
    part(new THREE.ConeGeometry(0.04, 0.2, 6), skin, head, [0.22 * s, 0.02, 0.02], [0, 0, -s * 1.25]); // elf ears
    const eye = part(new THREE.SphereGeometry(0.035, 10, 8), std('#2e7d4a'), head, [0.075 * s, 0.0, 0.19]);
    eye.name = 'eye';
  }
  part(new THREE.SphereGeometry(0.03, 8, 6), std('#d98c8c'), head, [0, -0.1, 0.19], [0, 0, 0], [1.3, 0.5, 0.5]);
  const eyes = head.children.filter((c) => c.name === 'eye');
  g.userData = {
    animate(t, running) {
      const k = running ? 1 : 0.12;
      legsArr[0].rotation.x = Math.sin(t * 12) * 0.7 * k;
      legsArr[1].rotation.x = -Math.sin(t * 12) * 0.7 * k;
      if (!g.userData.reaching) {
        arms[0].rotation.x = -Math.sin(t * 12) * 0.6 * k;
        arms[1].rotation.x = Math.sin(t * 12) * 0.6 * k;
      }
      body.position.y = running ? Math.abs(Math.sin(t * 12)) * 0.06 : Math.sin(t * 2) * 0.01;
    },
    float(on) { arms.forEach((a, i) => { a.rotation.z = on ? (i ? -1 : 1) * 0.45 : 0; }); legsArr.forEach((l) => { l.rotation.x = on ? 0.15 : 0; }); },
    eyesClosed(on) { eyes.forEach((e) => e.scale.set(1, on ? 0.15 : 1, 1)); },
    reach(on) {
      g.userData.reaching = on;
      arms[1].rotation.set(on ? -1.45 : 0, 0, on ? -0.15 : 0); // right hand up to the panel
    },
  };
  return g;
}

// ---------------------------------------------------------------------------
// The Kolossus: squat charcoal-rock giant, lava chevrons across the chest,
// a lava belt and spirals on shoulders/knees, a small white XANA mask with
// root-like tentacles. ~24 units tall. userData.slam(k): 0 = arm raised · 1 = smashed.
// ---------------------------------------------------------------------------
let chevTex, spiralTex, crackTex2, maskEye;
function chevrons() {
  return chevTex ||= canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round'; g.shadowColor = '#ffb000'; g.shadowBlur = 14;
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 52;
      const grd = g.createLinearGradient(0, y, 0, y + 50);
      grd.addColorStop(0, '#ffd34a'); grd.addColorStop(1, '#ff7a12');
      g.strokeStyle = grd; g.lineWidth = 15 - i * 1.5;
      g.beginPath(); g.moveTo(28 + i * 6, y - 6); g.lineTo(112, y + 34); g.stroke();
      g.beginPath(); g.moveTo(228 - i * 6, y - 6); g.lineTo(144, y + 34); g.stroke();
    }
    g.strokeStyle = '#ff9a20'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(128, 20); g.lineTo(128, 240); g.stroke();
  });
}
function spiral() {
  return spiralTex ||= canvasTex(128, 128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ffb020'; g.shadowColor = '#ff8000'; g.shadowBlur = 8; g.lineWidth = 7;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.1) { const r = 4 + a * 3.4; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.stroke();
  });
}
function cracks() {
  return crackTex2 ||= (() => {
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#ff7a1a'; g.shadowColor = '#ffb000'; g.shadowBlur = 6;
      for (let i = 0; i < 14; i++) {
        g.lineWidth = 1 + Math.random() * 2.5;
        g.beginPath();
        let x = Math.random() * 256, y = Math.random() * 256;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
}
function maskTexture() {
  return maskEye ||= canvasTex(128, 160, (g) => {
    g.clearRect(0, 0, 128, 160);
    g.strokeStyle = '#1b1b1b'; g.fillStyle = '#1b1b1b'; g.lineWidth = 7;
    g.beginPath(); g.arc(64, 62, 22, 0, 7); g.stroke();
    g.beginPath(); g.arc(64, 62, 8, 0, 7); g.fill();
    g.beginPath(); g.moveTo(64, 40); g.lineTo(64, 18); g.moveTo(64, 84); g.lineTo(64, 140);
    g.moveTo(48, 78); g.lineTo(40, 112); g.moveTo(80, 78); g.lineTo(88, 112); g.stroke();
    g.beginPath(); g.arc(26, 52, 5, 0, 7); g.fill(); g.beginPath(); g.arc(102, 52, 5, 0, 7); g.fill();
  });
}

export function makeKolossus() {
  const g = new THREE.Group();
  const base = '#2b2827';
  const rock = new THREE.MeshStandardMaterial({ color: base, roughness: 0.95, flatShading: true, emissive: '#ff5a10', emissiveMap: cracks(), emissiveIntensity: 0.45 });
  const chest = new THREE.MeshStandardMaterial({ color: base, roughness: 0.9, emissive: '#ffffff', emissiveMap: chevrons(), emissiveIntensity: 1.3 });
  const swirl = new THREE.MeshStandardMaterial({ color: base, roughness: 0.9, emissive: '#ffffff', emissiveMap: spiral(), emissiveIntensity: 1.3 });
  const lava = new THREE.MeshStandardMaterial({ color: '#ff9a20', emissive: '#ffa21a', emissiveIntensity: 1.4, roughness: 0.5 });
  const mats = [rock, chest, swirl, lava];

  // legs: squat stance
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(3.2, 1.3, 4.2), rock, g, [3.4 * s, 0.65, 0.5]);
    part(new THREE.CylinderGeometry(1.7, 2.1, 4.2, 8), rock, g, [3.4 * s, 3.2, 0]);
    const knee = part(new THREE.SphereGeometry(1.9, 12, 10), swirl, g, [3.3 * s, 5.6, 0.5], [0, 0, 0], [1, 1, 0.95]);
    knee.rotation.y = s * 0.3;
    part(new THREE.CylinderGeometry(2.0, 1.8, 4.2, 8), rock, g, [3.0 * s, 7.8, 0], [0, 0, s * 0.18]);
  }
  // pelvis with the lava T, the belt, the abdomen and the chevron chest
  const pelvis = part(new THREE.BoxGeometry(6.4, 3, 4.4), rock, g, [0, 10, 0]);
  part(new THREE.BoxGeometry(0.9, 2.4, 0.2), lava, pelvis, [0, -0.2, 2.21]);
  part(new THREE.BoxGeometry(8.2, 0.9, 5.2), lava, g, [0, 11.9, 0]);
  part(new THREE.BoxGeometry(7.6, 2.0, 4.8), rock, g, [0, 13.3, 0]);
  part(new THREE.BoxGeometry(10.2, 6.2, 5.6), [rock, rock, rock, rock, chest, rock], g, [0, 17.4, 0]);
  // shoulders with lava spirals
  for (const s of [-1, 1]) part(new THREE.SphereGeometry(2.7, 14, 10), swirl, g, [6.2 * s, 19.2, 0], [0, s * 1.3, 0]);
  // head: small white mask sunk between the shoulders, root tentacles rising behind
  const head = new THREE.Group();
  head.position.set(0, 21.4, 1.6);
  g.add(head);
  part(new THREE.SphereGeometry(1.2, 16, 12), rock, head, [0, 0.2, -0.6]);
  const mask = part(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.3 }), head, [0, 0, 0.3], [0, 0, 0], [0.95, 1.3, 0.45]);
  part(new THREE.ConeGeometry(0.45, 1.1, 10), mask.material, head, [0, -1.55, 0.35], [Math.PI, 0, 0]);
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.1), new THREE.MeshBasicMaterial({ map: maskTexture(), transparent: true, depthWrite: false }));
  eye.position.set(0, 0, 0.78);
  head.add(eye);
  const hairMat = new THREE.MeshStandardMaterial({ color: '#2a1f18', roughness: 0.8 });
  const tentacles = [];
  for (let i = 0; i < 9; i++) {
    const a = -1.3 + i * 0.32;
    const len = 4 + (i % 3) * 1.6;
    const pts = [new THREE.Vector3(0, 0.8, -0.4)];
    for (let k = 1; k <= 4; k++) {
      const f = k / 4;
      pts.push(new THREE.Vector3(Math.sin(a) * len * f + Math.sin(k * 2 + i) * 0.5, 0.8 + Math.cos(a) * len * f * 0.9, -0.4 - f * 1.5 + Math.cos(k + i) * 0.4));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.16, 6, false), hairMat);
    head.add(tube);
    tentacles.push(tube);
  }
  // arms: massive forearms; the right one slams
  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(6.6 * s, 19.2, 0);
    g.add(arm);
    part(new THREE.CylinderGeometry(1.5, 1.7, 4.6, 8), rock, arm, [0.6 * s, -3.0, 0]);
    part(new THREE.SphereGeometry(1.6, 10, 8), rock, arm, [0.8 * s, -5.4, 0]);
    part(new THREE.CylinderGeometry(2.5, 2.1, 5.6, 8), rock, arm, [0.9 * s, -8.4, 0.2]);
    for (const y of [-7.2, -9.6]) part(new THREE.TorusGeometry(2.35, 0.22, 6, 18), lava, arm, [0.9 * s, y, 0.2], [Math.PI / 2, 0, 0]);
    const fist = part(new THREE.DodecahedronGeometry(2.4, 0), rock, arm, [1.0 * s, -12.0, 0.4]);
    return { arm, fist };
  };
  const left = makeArm(-1);
  left.arm.rotation.z = -0.12;
  const right = makeArm(1);
  right.fist.name = 'fist';
  g.userData = {
    arm: right.arm, head, mats,
    slam(k) {
      // k: 0 = arm raised high behind · ~0.77 = hanging · 1 = smashed forward and down
      right.arm.rotation.x = THREE.MathUtils.lerp(2.4, -0.7, k);
      head.rotation.x = THREE.MathUtils.lerp(-0.25, 0.25, k);
    },
    breathe(t) {
      cracks().offset.y = (t * 0.03) % 1;
      const pulse = Math.sin(t * 1.7) * 0.35;
      chest.emissiveIntensity = 1.2 + pulse * 0.6;
      swirl.emissiveIntensity = 1.2 + pulse * 0.6;
      lava.emissiveIntensity = 1.3 + pulse * 0.6;
      left.arm.rotation.x = Math.sin(t * 0.7) * 0.08;
      tentacles.forEach((tb, i) => { tb.rotation.z = Math.sin(t * 0.9 + i) * 0.06; });
    },
  };
  g.userData.slam(0.77);
  return g;
}
