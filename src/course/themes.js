import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// ---------- procedural canvas textures ----------
const texCache = new Map();

function canvasTexture(key, size, draw, { repeat = 1, srgb = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, new RNG(key));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

function speckle(g, s, rng, base, colors, n, rmin, rmax, alpha = 0.5) {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = rng.range(alpha * 0.3, alpha);
    g.fillStyle = rng.pick(colors);
    const r = rng.range(rmin, rmax);
    g.beginPath();
    g.arc(rng.range(0, s), rng.range(0, s), r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

export const TEX = {
  sand: () => canvasTexture('sand', 256, (g, s, rng) => {
    speckle(g, s, rng, '#e2b878', ['#d4a160', '#f0cf96', '#c99556', '#f7dcaa'], 2600, 0.6, 2.2, 0.6);
    g.strokeStyle = 'rgba(160,110,60,0.18)';
    g.lineWidth = 3;
    for (let i = 0; i < 7; i++) { // dune ripples
      g.beginPath();
      const y0 = rng.range(0, s);
      for (let x = 0; x <= s; x += 8) g.lineTo(x, y0 + Math.sin(x / 22 + i) * 6);
      g.stroke();
    }
  }),
  grass: () => canvasTexture('grass', 256, (g, s, rng) => {
    speckle(g, s, rng, '#3f9a3a', ['#4fb247', '#2f7f2c', '#5ec455', '#367f31'], 4000, 0.5, 1.6, 0.6);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 64, s, 32); // mowing stripes
  }),
  ice: () => canvasTexture('ice', 256, (g, s, rng) => {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, '#cfeeff'); grd.addColorStop(1, '#a6d8f5');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 14; i++) {
      g.lineWidth = rng.range(0.5, 1.6);
      g.beginPath();
      let x = rng.range(0, s), y = rng.range(0, s);
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rng.range(-30, 30); y += rng.range(-30, 30); g.lineTo(x, y); }
      g.stroke();
    }
  }),
  rock: () => canvasTexture('rock', 256, (g, s, rng) => {
    speckle(g, s, rng, '#8a7b6c', ['#6e6155', '#a29483', '#7d6f62', '#5d5248'], 1800, 1, 5, 0.5);
    g.strokeStyle = 'rgba(40,30,25,0.45)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      let x = rng.range(0, s), y = rng.range(0, s);
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rng.range(-40, 40); y += rng.range(-40, 40); g.lineTo(x, y); }
      g.stroke();
    }
  }),
  s5: () => canvasTexture('s5', 256, (g, s) => {
    g.fillStyle = '#eef3ff'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#3d6cff'; g.lineWidth = 4;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(61,108,255,0.5)';
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.fillStyle = 'rgba(61,108,255,0.15)';
    g.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
  }),
  neon: () => canvasTexture('neon', 256, (g, s) => {
    g.fillStyle = '#140a2a'; g.fillRect(0, 0, s, s);
    g.shadowBlur = 10;
    g.strokeStyle = '#ff2bd6'; g.shadowColor = '#ff2bd6'; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
    g.strokeStyle = '#18f0ff'; g.shadowColor = '#18f0ff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  }),
  wood: () => canvasTexture('wood', 128, (g, s, rng) => {
    g.fillStyle = '#7a4b27'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = rng.pick(['rgba(60,35,15,0.5)', 'rgba(150,95,50,0.4)']);
      g.lineWidth = rng.range(1, 3);
      g.beginPath();
      const y = rng.range(0, s);
      g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + rng.range(-4, 4), s * 0.6, y + rng.range(-4, 4), s, y);
      g.stroke();
    }
  }),
  sandstone: () => canvasTexture('sandstone', 128, (g, s, rng) => {
    speckle(g, s, rng, '#c98a4b', ['#b5773c', '#dba062', '#a96c35'], 600, 1, 3, 0.5);
    g.fillStyle = 'rgba(120,70,30,0.25)';
    for (let y = 0; y < s; y += 22) g.fillRect(0, y, s, 3);
  }),
  stone: () => canvasTexture('stone', 128, (g, s, rng) => {
    speckle(g, s, rng, '#6f6a66', ['#5a5552', '#86807a', '#4c4845'], 700, 1, 4, 0.5);
    g.strokeStyle = 'rgba(30,25,25,0.6)'; g.lineWidth = 2;
    for (let y = 0; y < s; y += 32) {
      g.strokeRect(-2, y, s + 4, 32);
      for (let x = (y / 32) % 2 ? 0 : 32; x < s; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
    }
  }),
  bark: () => canvasTexture('bark', 128, (g, s, rng) => {
    g.fillStyle = '#5a3b22'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = rng.pick(['#3f2814', '#6d4a2c', '#4b311b']);
      g.fillRect(rng.range(0, s), 0, rng.range(2, 6), s);
    }
  }),
  xanaEye: () => canvasTexture('xanaEye', 128, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = '#1a0000'; g.fillStyle = '#1a0000';
    g.lineWidth = 10;
    const cx = s / 2, cy = s * 0.42, r = s * 0.24;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.32, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(cx, cy - r); g.lineTo(cx, cy - r - s * 0.14); // top
    g.moveTo(cx, cy + r); g.lineTo(cx, s * 0.95); // bottom centre
    g.moveTo(cx - r * 0.75, cy + r * 0.65); g.lineTo(cx - r * 1.15, s * 0.92);
    g.moveTo(cx + r * 0.75, cy + r * 0.65); g.lineTo(cx + r * 1.15, s * 0.92);
    g.stroke();
  }, { srgb: true }),
  xanaEyeGlow: () => canvasTexture('xanaEyeGlow', 128, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff';
    g.shadowColor = '#ffffff'; g.shadowBlur = 10;
    g.lineWidth = 9;
    const cx = s / 2, cy = s * 0.42, r = s * 0.22;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.32, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(cx, cy - r); g.lineTo(cx, cy - r - s * 0.13);
    g.moveTo(cx, cy + r); g.lineTo(cx, s * 0.94);
    g.moveTo(cx - r * 0.75, cy + r * 0.65); g.lineTo(cx - r * 1.15, s * 0.9);
    g.moveTo(cx + r * 0.75, cy + r * 0.65); g.lineTo(cx + r * 1.15, s * 0.9);
    g.stroke();
  }),
  digitalSea: () => canvasTexture('sea', 256, (g, s, rng) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, '#0a2a7a'); grd.addColorStop(1, '#0b4ab0');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.font = 'bold 14px monospace';
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(140,220,255,${rng.range(0.1, 0.5)})`;
      g.fillText(rng.chance(0.5) ? '1' : '0', rng.range(0, s), rng.range(0, s));
    }
  }),
};

// ---------- themes ----------
export const THEMES = {
  desert: {
    name: 'Desert Sector',
    sky: ['#f0a85e', '#ffe2b0'], fog: '#efcf9c', fogDensity: 0.012,
    sun: { color: '#fff1d6', intensity: 2.3, dir: [-0.5, 1, -0.35] }, hemi: ['#fff3dd', '#b3793d', 0.9],
    floorMat: 'sand', floorTex: 'sand', floorColor: '#ffffff',
    wallTex: 'sandstone', wallColor: '#ffffff', wallTrim: '#8b5a2b',
    sideColor: '#a8743c', particles: 'dust', flag: '#ff7a1a',
  },
  forest: {
    name: 'Forest Sector',
    sky: ['#5fb0db', '#d2f3ff'], fog: '#bfe3d0', fogDensity: 0.014,
    sun: { color: '#fff8e0', intensity: 2.0, dir: [0.4, 1, -0.3] }, hemi: ['#e6fff0', '#2f5d22', 1.0],
    floorMat: 'grass', floorTex: 'grass', floorColor: '#ffffff',
    wallTex: 'wood', wallColor: '#ffffff', wallTrim: '#4a2c14',
    sideColor: '#4a3220', particles: 'leaves', flag: '#2bd14a',
  },
  ice: {
    name: 'Ice Sector',
    sky: ['#8cc8f5', '#f0faff'], fog: '#dff1ff', fogDensity: 0.013,
    sun: { color: '#ffffff', intensity: 2.1, dir: [0.3, 1, 0.4] }, hemi: ['#ffffff', '#7fb0d8', 1.1],
    floorMat: 'ice', floorTex: 'ice', floorColor: '#ffffff', floorGloss: true,
    wallTex: 'ice', wallColor: '#bfe6ff', wallTrim: '#ffffff', wallGlass: true,
    sideColor: '#7fb6e0', particles: 'snow', flag: '#22c6ff',
  },
  mountain: {
    name: 'Mountain Sector',
    sky: ['#8577b8', '#f1c9a0'], fog: '#c9b0a8', fogDensity: 0.012,
    sun: { color: '#ffd9b0', intensity: 2.2, dir: [-0.6, 0.9, 0.2] }, hemi: ['#f2dcc9', '#4b3d3a', 0.9],
    floorMat: 'rock', floorTex: 'rock', floorColor: '#ffffff',
    wallTex: 'stone', wallColor: '#ffffff', wallTrim: '#3a3330',
    sideColor: '#5b4f47', particles: 'mist', flag: '#b06cff',
  },
  sector5: {
    name: 'Sector 5 · Carthage',
    sky: ['#06103a', '#1d3c9c'], fog: '#13286e', fogDensity: 0.016,
    sun: { color: '#dfe8ff', intensity: 1.9, dir: [0.2, 1, 0.3] }, hemi: ['#cfe0ff', '#0b1850', 1.2],
    floorMat: 's5', floorTex: 's5', floorColor: '#ffffff',
    wallTex: null, wallColor: '#f4f7ff', wallTrim: '#3d6cff', wallEmissive: '#1a3cff',
    sideColor: '#c6d3ff', particles: 'cubes', flag: '#3d6cff',
  },
  fortune: {
    name: 'Cyberpunk Fortune Falls',
    sky: ['#05010f', '#3a0d5e'], fog: '#1a0630', fogDensity: 0.02,
    sun: { color: '#c9a0ff', intensity: 1.2, dir: [0.2, 1, 0.1] }, hemi: ['#ff7ae8', '#140028', 0.9],
    floorMat: 'neon', floorTex: 'neon', floorColor: '#ffffff',
    wallTex: null, wallColor: '#1d0b33', wallTrim: '#ff2bd6', wallEmissive: '#ff2bd6',
    sideColor: '#120624', particles: 'rain', flag: '#ffe600',
  },
};

const matCache = new Map();

export function themeMaterials(themeKey) {
  if (matCache.has(themeKey)) return matCache.get(themeKey);
  const th = THEMES[themeKey];
  const floorMap = TEX[th.floorTex]();
  floorMap.repeat.set(0.25, 0.25);
  const floor = th.floorGloss
    ? new THREE.MeshPhysicalMaterial({ map: floorMap, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.9, metalness: 0 });
  if (themeKey === 'fortune') { floor.emissive = new THREE.Color('#ffffff'); floor.emissiveMap = floorMap; floor.emissiveIntensity = 0.55; }
  if (themeKey === 'sector5') { floor.roughness = 0.4; }

  const side = new THREE.MeshStandardMaterial({ color: th.sideColor, roughness: 0.9 });
  let wall;
  if (th.wallGlass) {
    wall = new THREE.MeshPhysicalMaterial({ color: th.wallColor, roughness: 0.05, transmission: 0.6, thickness: 0.4, transparent: true, opacity: 0.85 });
  } else if (th.wallTex) {
    const m = TEX[th.wallTex]();
    m.repeat.set(0.5, 0.5);
    wall = new THREE.MeshStandardMaterial({ map: m, color: th.wallColor, roughness: 0.85 });
  } else {
    wall = new THREE.MeshStandardMaterial({ color: th.wallColor, roughness: 0.4, metalness: 0.2 });
  }
  const trim = new THREE.MeshStandardMaterial({
    color: th.wallTrim, roughness: 0.4,
    emissive: th.wallEmissive ? new THREE.Color(th.wallEmissive) : new THREE.Color(0),
    emissiveIntensity: th.wallEmissive ? 1.4 : 0,
  });
  const mats = { floor, side, wall, trim, theme: th };
  matCache.set(themeKey, mats);
  return mats;
}

/** Floor material for a specific surface override (e.g. an ice patch in the mountain sector). */
export function surfaceMaterial(mat) {
  const key = 'surf:' + mat;
  if (matCache.has(key)) return matCache.get(key);
  const byMat = { sand: 'desert', grass: 'forest', ice: 'ice', rock: 'mountain', s5: 'sector5', neon: 'fortune', glass: 'fortune' };
  let m;
  if (byMat[mat]) m = themeMaterials(byMat[mat]).floor;
  else if (mat === 'wood') {
    const t = TEX.wood(); t.repeat.set(0.5, 0.5);
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  } else if (mat === 'carpet') {
    m = new THREE.MeshStandardMaterial({ color: '#9b1d3a', roughness: 1 });
  } else m = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.8 });
  matCache.set(key, m);
  return m;
}
