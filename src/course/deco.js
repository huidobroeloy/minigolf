import * as THREE from 'three';
import { TEX } from './themes.js';
import { Emitter } from '../fx/particles.js';
import { makeTower, TOWER_BODY } from '../fx/lyoko.js';

// Scenery around the course (no collisions) + ambient particles, per sector.
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

function ringPoints(course, rng, n, rMin, rMax) {
  const c = course.center;
  const base = Math.max(course.size.x, course.size.z) / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = base + rng.range(rMin, rMax);
    pts.push(new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r));
  }
  return pts;
}

let windowTex;
function neonWindows() {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#07020f'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    if (Math.random() < 0.45) { g.fillStyle = ['#ff2bd6', '#18f0ff', '#ffe600', '#7a5cff'][Math.floor(Math.random() * 4)]; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 4, 4); }
  }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.colorSpace = THREE.SRGBColorSpace;
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  return windowTex;
}

export function decorate(sector, course, group, rng) {
  const deco = new THREE.Group();
  group.add(deco);
  const c = course.center, size = course.size;
  const minY = course.bounds.min.y;
  const em = new Emitter(deco, { max: 700 });
  const area = { x: c.x, z: c.z, w: size.x + 10, d: size.z + 10 };
  const rand = () => Math.random();
  const anim = [];
  let ambient = () => {};

  const add = (m, castShadow = false) => { m.castShadow = castShadow; m.receiveShadow = false; deco.add(m); return m; };

  if (sector === 'desert') {
    const mat = new THREE.MeshStandardMaterial({ map: TEX.sandstone(), roughness: 1 });
    for (const p of ringPoints(course, rng, 9, 6, 26)) {
      const r = rng.range(1.5, 4), h = rng.range(6, 22);
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 9), mat));
      m.position.set(p.x, minY - h / 2 - rng.range(1.5, 9), p.z);
      const top = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 0.85, 0.6, 9), std('#e2b878')));
      top.position.set(p.x, m.position.y + h / 2 + 0.3, p.z);
    }
    ambient = (dt) => {
      if (rand() < 0.7) em.spawn({ pos: [area.x - area.w / 2, minY + rand() * 3, area.z + (rand() - 0.5) * area.d], vel: [4 + rand() * 3, 0.3, (rand() - 0.5)], color: '#e8c48e', size: 0.25 + rand() * 0.3, life: area.w / 5, drag: 0 });
    };
  } else if (sector === 'forest') {
    const bark = new THREE.MeshStandardMaterial({ map: TEX.bark(), roughness: 1 });
    const leaf = std('#2f8f3a', { flatShading: true });
    for (const p of ringPoints(course, rng, 10, 9, 26)) {
      const r = rng.range(1.2, 2.6), h = rng.range(30, 40);
      const t = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 1.1, h, 10), bark));
      t.position.set(p.x, minY + h / 2 - 22, p.z);
      const crown = add(new THREE.Mesh(new THREE.IcosahedronGeometry(r * 4, 1), leaf));
      crown.position.set(p.x, t.position.y + h / 2, p.z);
      crown.scale.y = 0.5;
    }
    ambient = (dt) => {
      if (rand() < 0.25) em.spawn({ pos: [area.x + (rand() - 0.5) * area.w, minY + 0.5 + rand() * 3, area.z + (rand() - 0.5) * area.d], vel: [(rand() - 0.5) * 0.6, 0.2, (rand() - 0.5) * 0.6], color: '#d6ff6a', size: 0.12, life: 3 });
      if (rand() < 0.15) em.spawn({ pos: [area.x + (rand() - 0.5) * area.w, minY + 6, area.z + (rand() - 0.5) * area.d], vel: [0.6, -0.8, 0.2], color: '#7fbf3a', size: 0.22, life: 7 });
    };
  } else if (sector === 'ice') {
    const ice = new THREE.MeshPhysicalMaterial({ color: '#bfe6ff', roughness: 0.1, transmission: 0.4, thickness: 1, flatShading: true });
    for (const p of ringPoints(course, rng, 12, 5, 24)) {
      const h = rng.range(4, 14), r = rng.range(0.8, 2.2);
      const m = add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), ice));
      m.position.set(p.x, minY - h / 2 + rng.range(-2, 5), p.z);
      m.rotation.z = rng.range(-0.15, 0.15);
    }
    // slippery glints skating across the ice floors
    const glintMat = new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glints = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(glintMat.clone());
      s.scale.set(0.5, 0.08, 1);
      deco.add(s);
      glints.push({ s, t: rand() * 3 });
    }
    anim.push((t, dt) => {
      for (const g of glints) {
        g.t -= dt;
        if (g.t <= 0) {
          const p = course.randomFloorPoint({ pick: (a) => a[Math.floor(rand() * a.length)], range: (a, b) => a + rand() * (b - a) });
          g.s.position.set(p.x, p.y + 0.03, p.z);
          g.t = 0.8 + rand() * 1.5;
          g.vx = (rand() - 0.5) * 3;
        }
        g.s.position.x += (g.vx || 0) * dt;
        g.s.material.opacity = Math.sin(Math.min(1, g.t / 0.8) * Math.PI) * 0.9;
      }
    });
    ambient = (dt) => {
      for (let i = 0; i < 2; i++) em.spawn({ pos: [area.x + (rand() - 0.5) * area.w, minY + 9, area.z + (rand() - 0.5) * area.d], vel: [0.3, -1.2 - rand(), 0], color: '#ffffff', size: 0.12 + rand() * 0.1, life: 9 });
    };
  } else if (sector === 'mountain') {
    const rockMat = new THREE.MeshStandardMaterial({ map: TEX.rock(), roughness: 1, flatShading: true });
    for (const p of ringPoints(course, rng, 11, 6, 26)) {
      const h = rng.range(8, 20);
      let y = minY - 16;
      while (y < minY - 16 + h) {
        const s = rng.range(1.5, 3.5);
        const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat));
        m.position.set(p.x + rng.range(-1, 1), y, p.z + rng.range(-1, 1));
        m.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
        y += s * 1.4;
      }
    }
    ambient = (dt) => {
      if (rand() < 0.3) em.spawn({ pos: [area.x + (rand() - 0.5) * area.w, minY - 1 + rand() * 2, area.z + (rand() - 0.5) * area.d], vel: [0.5, 0.15, 0], color: '#e8dcd8', size: 1.2 + rand() * 1.5, life: 6 });
    };
  } else if (sector === 'sector5') {
    const white = std('#f4f7ff', { roughness: 0.35, emissive: '#2a4cff', emissiveIntensity: 0.15 });
    const blue = new THREE.MeshBasicMaterial({ color: '#3d6cff' });
    for (const p of ringPoints(course, rng, 14, 4, 22)) {
      const s = rng.range(1.5, 5);
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), white));
      m.position.set(p.x, minY + rng.range(-6, 10), p.z);
      m.rotation.set(rng.range(0, 1), rng.range(0, 3), 0);
      const edges = add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#3d6cff' })));
      edges.position.copy(m.position); edges.rotation.copy(m.rotation);
      const spd = rng.range(0.05, 0.2);
      anim.push((t) => { m.rotation.y += spd * 0.016; edges.rotation.copy(m.rotation); });
    }
    // the great dome ring of Carthage
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(Math.max(size.x, size.z) * 0.8 + 14, 0.6, 8, 80), blue));
    ring.position.set(c.x, minY + 12, c.z);
    ring.rotation.x = Math.PI / 2;
    anim.push((t) => { ring.rotation.z = t * 0.03; });
    ambient = (dt) => {
      if (rand() < 0.4) em.spawn({ pos: [area.x + (rand() - 0.5) * area.w, minY - 3, area.z + (rand() - 0.5) * area.d], vel: [0, 1.2, 0], color: '#7fa6ff', size: 0.18, life: 8 });
    };
  } else if (sector === 'fortune') {
    const tex = neonWindows();
    const neonColors = ['#ff2bd6', '#18f0ff', '#ffe600', '#7a5cff'];
    for (const p of ringPoints(course, rng, 18, 6, 30)) {
      const w = rng.range(3, 7), h = rng.range(15, 38);
      const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(w / 4, h / 8);
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ map: t2, emissive: '#ffffff', emissiveMap: t2, emissiveIntensity: 0.9, roughness: 0.6 })));
      m.position.set(p.x, minY - 25 + h / 2, p.z);
      const strip = add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.25, w + 0.1), new THREE.MeshBasicMaterial({ color: rng.pick(neonColors) })));
      strip.position.set(p.x, m.position.y + h / 2 - 0.3, p.z);
    }
    // holographic slot-machine sign
    const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: fortuneSign(), transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    sign.position.set(c.x, minY + 9, course.bounds.max.z + 6);
    sign.rotation.y = Math.PI; // face the tee
    anim.push((t) => { sign.material.opacity = 0.75 + Math.sin(t * 13) * 0.1 + (Math.random() < 0.03 ? -0.5 : 0); });
    ambient = (dt) => {
      for (let i = 0; i < 3; i++) em.spawn({ pos: [area.x + (rand() - 0.5) * area.w, minY + 10, area.z + (rand() - 0.5) * area.d], vel: [0, -14, 0], color: rand() < 0.5 ? '#7a9cff' : '#ff7ae8', size: 0.08, life: 0.9 });
    };
  }

  // Lyoko towers on floating platforms around the course (one may be XANA-activated)
  const towerColor = { fortune: '#ff7ae8' }[sector] || '#ffffff';
  const platMat = new THREE.MeshStandardMaterial({ color: '#c9ccd6', roughness: 0.8 });
  const towers = [];
  ringPoints(course, rng, 2, 8, 20).forEach((p, i) => {
    const y = minY + rng.range(-4, 1);
    const plat = add(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 2.4, 1.2, 24), platMat));
    plat.position.set(p.x, y - 0.6, p.z);
    const red = i === 0 && rng.chance(0.35);
    const tw = makeTower(red ? '#ff2a2a' : towerColor, 14, TOWER_BODY[sector]);
    tw.position.set(p.x, y, p.z);
    deco.add(tw);
    towers.push(tw);
  });
  anim.push((t) => { for (const tw of towers) tw.userData.animate(t); });

  return {
    frame(t, dt) {
      ambient(dt);
      for (const a of anim) a(t, dt);
      em.update(dt);
    },
    dust(p) {
      em.spawn({ pos: [p.x + (rand() - 0.5) * 0.4, p.y + 0.1, p.z + (rand() - 0.5) * 0.4], vel: [(rand() - 0.5), 0.6 + rand() * 0.5, (rand() - 0.5)], color: sector === 'mountain' ? '#9a8b7c' : '#e2c08c', size: 0.3 + rand() * 0.3, life: 1.0, drag: 1 });
    },
    dispose() { em.dispose(); group.remove(deco); },
  };
}

function fortuneSign() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.strokeStyle = '#ff2bd6'; g.lineWidth = 8; g.shadowColor = '#ff2bd6'; g.shadowBlur = 20;
  g.strokeRect(10, 10, 492, 172);
  g.font = '900 64px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffe600'; g.shadowColor = '#ffe600';
  g.fillText('FORTUNE', 256, 70);
  g.fillStyle = '#18f0ff'; g.shadowColor = '#18f0ff'; g.font = '700 46px Orbitron, sans-serif';
  g.fillText('★ FALLS ★', 256, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
