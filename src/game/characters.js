import * as THREE from 'three';

/**
 * Playable balls styled after the Lyoko warriors (and friends, and foes).
 * `ui` is the bright identity colour used for names, rings, trails and the HUD;
 * `base`/`c2`/`c3` paint the ball itself.
 */
export const CHARACTERS = [
  { id: 'ulrich', name: 'Ulrich', ui: '#e0b04a', base: '#d6a23c', c2: '#4a2f17', c3: '#f4e6b8' },
  { id: 'odd', name: 'Odd', ui: '#b26bff', base: '#9a4dd6', c2: '#f2d24a', c3: '#ead9ff' },
  { id: 'yumi', name: 'Yumi', ui: '#ff5c9a', base: '#24132f', c2: '#e94b86', c3: '#f8cfe0' },
  { id: 'aelita', name: 'Aelita', ui: '#ff8ccc', base: '#ff86c8', c2: '#8c1f3f', c3: '#cfe6cf' },
  { id: 'william', name: 'William', ui: '#e6e6f0', base: '#ececf4', c2: '#18181f', c3: '#8a8a9c' },
  { id: 'jeremie', name: 'Jérémie', ui: '#4d8bff', base: '#3d6cff', c2: '#f2d24a', c3: '#ffffff' },
  { id: 'franz', name: 'Franz Hopper', ui: '#9fe8ff', base: '#c8eeff', c2: '#ffffff', c3: '#5fc8ff', glow: '#6fd8ff' },
  { id: 'xana', name: 'XANA', ui: '#ff3b3b', base: '#141018', c2: '#ff2a2a', c3: '#4a0a12', glow: '#ff2a2a' },
];

export const CHARACTER_COLORS = CHARACTERS.map((c) => c.ui);
export const characterByColor = (color) => CHARACTERS.find((c) => c.ui === color) || null;

const texCache = new Map();

/** Equirectangular texture for a sphere (u wraps around, v goes top → bottom). */
export function characterTexture(ch) {
  if (texCache.has(ch.id)) return texCache.get(ch.id);
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = ch.base; g.fillRect(0, 0, W, H);
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, y0 * H, W, (y1 - y0) * H); };
  // the "face" sits at u≈0.25 and the back at u≈0.75 (both visible as the ball rolls)
  const faces = [W * 0.25, W * 0.75];
  switch (ch.id) {
    case 'ulrich':
      band(0, 0.2, ch.c2);                    // dark hair
      band(0.24, 0.3, ch.c2);                 // headband
      band(0.62, 0.7, ch.c2);                 // belt
      band(0.7, 1, '#8c6a2e');
      for (const x of faces) { g.strokeStyle = ch.c3; g.lineWidth = 7; g.beginPath(); g.moveTo(x - 40, 0.58 * H); g.lineTo(x + 40, 0.36 * H); g.stroke(); } // katana slash
      break;
    case 'odd':
      band(0, 0.26, ch.c2);                   // blond hair…
      for (const x of faces) {
        g.fillStyle = ch.base; g.beginPath(); g.ellipse(x, 0.12 * H, 22, 14, 0, 0, 7); g.fill(); // …with the purple spot
        g.fillStyle = '#ffffff';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 20, 0.42 * H, 11, 15, 0, 0, 7); g.fill(); }
        g.fillStyle = '#2a1040';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 20, 0.43 * H, 4, 10, 0, 0, 7); g.fill(); }
        g.strokeStyle = ch.c3; g.lineWidth = 2.5;
        for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(x + s * 12, 0.55 * H); g.lineTo(x + s * 50, 0.55 * H + k * 9); g.stroke(); } // whiskers
      }
      break;
    case 'yumi':
      band(0.55, 0.66, ch.c2);                // obi
      g.fillStyle = ch.c3;
      for (let i = 0; i < 26; i++) { // sakura petals
        const x = (i * 97) % W, y = 0.12 * H + ((i * 53) % 90);
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4.5, 0, 7); g.fill(); }
      }
      for (const x of faces) { // a fan
        g.fillStyle = ch.c2; g.beginPath(); g.moveTo(x, 0.92 * H); g.arc(x, 0.92 * H, 46, Math.PI * 1.15, Math.PI * 1.85); g.closePath(); g.fill();
      }
      break;
    case 'aelita':
      band(0.5, 0.78, ch.c2);                 // dark-red top and skirt
      band(0.78, 1, ch.c3);                   // mint leggings
      band(0.86, 0.89, '#6e8f72');
      for (const x of faces) { // her pink emblem
        g.fillStyle = '#ffd6ec'; g.beginPath(); g.ellipse(x, 0.62 * H, 14, 19, 0, 0, 7); g.fill();
        g.fillStyle = ch.base; g.beginPath(); g.ellipse(x, 0.62 * H, 7, 11, 0, 0, 7); g.fill();
      }
      break;
    case 'william':
      g.fillStyle = ch.c2;                    // white and black, split by a smoky swirl
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, 0.5 * H + Math.sin(x / 40) * 26);
      g.lineTo(W, H); g.closePath(); g.fill();
      g.strokeStyle = ch.c3; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 0.62 * H + i * 14 + Math.sin(x / 30 + i) * 8); g.stroke(); }
      break;
    case 'jeremie':
      band(0, 0.24, ch.c2);                   // blond
      for (const x of faces) { // glasses
        g.strokeStyle = '#1b1b1b'; g.lineWidth = 5;
        for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * 24, 0.4 * H, 16, 0, 7); g.stroke(); }
        g.beginPath(); g.moveTo(x - 8, 0.4 * H); g.lineTo(x + 8, 0.4 * H); g.stroke();
        g.fillStyle = 'rgba(200,230,255,0.6)';
        for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * 24, 0.4 * H, 13, 0, 7); g.fill(); }
      }
      band(0.75, 0.8, '#2a4fbf');
      break;
    case 'franz': {
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, ch.base);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.strokeStyle = ch.c3; g.lineWidth = 3;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo((i * 61) % W, 0); g.bezierCurveTo(i * 40, H * 0.4, i * 70, H * 0.6, (i * 83) % W, H); g.stroke(); }
      break;
    }
    case 'xana':
      g.strokeStyle = ch.c3; g.lineWidth = 3;
      for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo((i * 41) % W, (i * 71) % H); for (let k = 0; k < 5; k++) g.lineTo((i * 41 + k * 23) % W, ((i * 71) + k * 19) % H); g.stroke(); }
      for (const x of faces) { // the eye of XANA
        const y = 0.45 * H;
        g.strokeStyle = ch.c2; g.fillStyle = ch.c2; g.lineWidth = 6;
        g.beginPath(); g.arc(x, y, 24, 0, 7); g.stroke();
        g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
        g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x, y - 46); g.moveTo(x, y + 24); g.lineTo(x, y + 64);
        g.moveTo(x - 17, y + 17); g.lineTo(x - 28, y + 58); g.moveTo(x + 17, y + 17); g.lineTo(x + 28, y + 58); g.stroke();
      }
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(ch.id, t);
  return t;
}

/** Dress a ball material as the character that owns this colour (if any). */
export function applyCharacter(material, color) {
  const ch = characterByColor(color);
  if (!ch) return null;
  material.map = characterTexture(ch);
  material.color.set('#ffffff');
  if (material.emissive) {
    material.emissive.set(ch.glow || '#000000');
    material.emissiveIntensity = ch.glow ? 0.35 : 0;
  }
  material.needsUpdate = true;
  return ch;
}

/** CSS for a little sphere preview in the menus. */
export function characterCss(ch) {
  return `radial-gradient(circle at 35% 30%, #ffffffcc 0 8%, transparent 9%), radial-gradient(circle at 50% 40%, ${ch.base} 0 45%, ${ch.c2} 46% 62%, ${ch.base} 63%)`;
}
