// Arcade fighting-game portraits, painted in code (nothing copied, safe for a public repo).
// Each character is drawn with vector shapes in a 128×128 space, rendered small, snapped to
// a tight palette and outlined in black: chunky 90s arcade sprite pixels when scaled up.

const OL = '#120a12'; // ink

// --- tiny drawing kit (all coordinates in 128-space) --------------------------------
// shape points: [x, y] = line, [cx, cy, x, y] = curve
function shape(g, pts, fill, ink = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 2) g.lineTo(p[0], p[1]); else g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
  }
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (ink) { g.strokeStyle = OL; g.stroke(); }
}
function line(g, pts, color = OL, w = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 2) g.lineTo(p[0], p[1]); else g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
  }
  const lw = g.lineWidth;
  g.lineWidth = lw * w;
  g.strokeStyle = color;
  g.stroke();
  g.lineWidth = lw;
}
function oval(g, x, y, rx, ry, fill, ink = true, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (ink) { g.strokeStyle = OL; g.stroke(); }
}

// --- shared anatomy (facing right, 3/4 view, light from the upper right) -------------
const SKIN = { base: '#f2c49b', shade: '#c4825a', deep: '#7e4a30', light: '#ffe6cc' };
const PALE = { base: '#f6d8c4', shade: '#d09a86', deep: '#94604f', light: '#fff2e8' };

function torso(g, c1, c2) {
  shape(g, [[40, 98], [16, 112], [6, 128], [124, 128], [118, 112], [92, 98]], c1);
  shape(g, [[40, 98], [16, 112], [6, 128], [44, 128], [40, 112]], c2, false); // shadow side
}
function neck(g, s) {
  shape(g, [[54, 82], [56, 104], [80, 104], [80, 84]], s.base);
  shape(g, [[54, 82], [56, 104], [66, 104], [64, 90], [80, 88], [80, 84]], s.shade, false);
  shape(g, [[54, 82], [80, 84], [80, 90], [66, 92], [56, 96]], s.deep, false);
}
function face(g, s, { jaw = 1, female = false } = {}) {
  const chinY = female ? 92 : 94 + jaw * 2;
  const jx = female ? 54 : 52 - jaw * 2;
  // head shape
  shape(g, [[45, 40], [39, 54, 40, 64], [42, 80, jx, 88], [64, chinY + 6, 76, chinY], [86, 86, 88, 74], [92, 66, 89, 58], [92, 48, 88, 38], [70, 22, 45, 40]], s.base);
  // cel shadow on the far side + under the cheekbone
  shape(g, [[45, 40], [39, 54, 40, 64], [42, 80, jx, 88], [62, chinY + 4, 64, chinY + 2], [56, 82, 54, 70], [50, 56, 54, 44]], s.shade, false);
  shape(g, [[84, 70], [88, 66, 88, 74], [86, 84, 78, chinY - 2], [82, 82, 84, 70]], s.shade, false);
  shape(g, [[41, 60], [42, 80, jx, 88], [60, chinY + 4, 63, chinY + 3], [52, 84, 47, 72], [44, 62]], s.deep, false);
  // eye sockets under the brow ridge (lighter for the softer faces)
  shape(g, female
    ? [[54, 56], [62, 52, 71, 56], [70, 59], [62, 55, 54, 58]]
    : [[52, 55], [62, 50, 72, 55], [76, 61], [79, 55], [84, 52, 90, 54], [90, 58], [84, 56, 79, 61], [74, 63], [64, 56, 52, 58]], s.shade, false);
  if (!female) {
    line(g, [[81, 71], [84, 76, 81, 81]], s.deep, 1.1); // cheek line
    line(g, [[69, 88], [73, 89.5, 77, 88]], s.shade, 1.3); // chin dimple
  }
  // light on the cheekbone and the bridge of the nose
  shape(g, [[78, 62], [84, 58, 87, 62], [84, 66, 78, 62]], s.light, false);
  // redraw the outline on top of the fills
  line(g, [[45, 40], [39, 54, 40, 64], [42, 80, jx, 88], [64, chinY + 6, 76, chinY], [86, 86, 88, 74], [92, 66, 89, 58], [92, 48, 88, 38]]);
}
function ear(g, s, x = 44, y = 62, elf = false) {
  if (elf) shape(g, [[46, 56], [30, 44], [36, 62], [40, 70, 47, 70]], s.base);
  else shape(g, [[46, 56], [36, 54, 37, 63], [38, 72, 47, 70]], s.base);
  line(g, [[43, 59], [40, 63, 44, 66]], s.deep);
}
function nose(g, s, small = false) {
  if (small) { line(g, [[78, 66], [80, 70], [77, 71]], s.deep); return; }
  shape(g, [[77, 58], [80, 68], [76, 72], [74, 70]], s.shade, false);
  line(g, [[78, 58], [82, 68, 77, 72]], OL);
}
/** eyes: kind 'fierce' | 'calm' | 'grin' | 'female' | 'glasses' */
function eyes(g, kind, iris = '#2a2a3a') {
  const near = [62, 61], far = [83, 60];
  const female = kind === 'female';
  for (const [i, [x, y]] of [near, far].entries()) {
    const w = i ? 4.2 : 7, h = female ? 4.4 : 3;
    shape(g, [[x - w, y], [x, y - h * 1.3, x + w, y - 0.5], [x, y + h, x - w, y]], '#ffffff', false);
    oval(g, x + (i ? 1 : 1.5), y - 0.2, female ? 2.6 : 1.9, female ? 3.4 : 2.4, iris, false);
    oval(g, x + (i ? 1 : 1.5), y - 0.2, 0.9, 1.3, OL, false);
    if (female) oval(g, x + 2.2, y - 1.6, 0.9, 0.9, '#ffffff', false);
    line(g, [[x - w - 0.5, y + 0.4], [x, y - h * 1.4, x + w + 0.5, y - 0.6]], OL, female ? 1.8 : 1.4); // upper lid
    if (female) line(g, [[x + w - 1, y - 1.2], [x + w + 2.5, y - 3]], OL, 1.2); // lash flick
  }
  // brows: fighters slope down toward the nose
  const slope = kind === 'fierce' ? 5 : kind === 'grin' ? 1 : kind === 'calm' ? -1 : 0;
  const bw = female ? 1.1 : 2.4;
  line(g, [[53, 52 - slope * 0.4], [61, 50, 70, 53 + slope * 0.4]], OL, bw);
  line(g, [[78, 53 + slope * 0.3], [84, 50, 89, 51 - slope * 0.3]], OL, bw);
}
function mouth(g, kind, s) {
  switch (kind) {
    case 'grim': line(g, [[66, 80], [72, 79.5], [79, 79]], OL, 1.2); line(g, [[69, 84], [76, 84]], s.shade, 1.4); break;
    case 'smirk': line(g, [[66, 81], [74, 81], [80, 77]], OL, 1.2); line(g, [[69, 85], [76, 85]], s.shade, 1.4); break;
    case 'grin':
      shape(g, [[64, 78], [72, 80], [81, 76], [78, 86, 70, 85]], '#ffffff');
      line(g, [[66, 81], [79, 79.5]], '#c9c0c8', 0.8);
      break;
    case 'soft': line(g, [[68, 81], [74, 82], [78, 80]], s.deep, 1.1); break;
    case 'open': shape(g, [[67, 79], [78, 78], [75, 85, 70, 84]], '#5a1a22'); break;
  }
}

// --- the cast --------------------------------------------------------------------------
const ART = {
  ulrich(g) {
    const s = SKIN, hair = ['#5b3519', '#3a1f0c', '#86582c'];
    // headband tails flying behind
    shape(g, [[42, 44], [18, 40, 6, 52], [20, 46, 30, 52], [14, 58, 8, 70], [28, 58, 44, 50]], '#3a2410');
    torso(g, '#e2b443', '#a87a22');
    shape(g, [[52, 98], [66, 128], [80, 98], [74, 98], [66, 114], [58, 98]], '#5a3a1a'); // gi lapels
    shape(g, [[58, 98], [66, 114], [74, 98], [66, 104]], s.shade, false);
    neck(g, s);
    // back hair
    shape(g, [[38, 70], [30, 46, 46, 26], [64, 12, 88, 24], [100, 34, 92, 52], [86, 44, 76, 40], [56, 40, 46, 60]], hair[0]);
    face(g, s);
    ear(g, s);
    eyes(g, 'fierce', '#4a3018');
    nose(g, s);
    mouth(g, 'grim', s);
    // headband across the forehead
    shape(g, [[42, 42], [66, 36, 92, 42], [92, 48], [66, 42, 42, 49]], '#3a2410');
    // spiky fringe over the band
    shape(g, [[44, 40], [50, 22, 70, 18], [92, 22, 96, 38], [88, 34], [86, 46], [80, 36], [74, 48], [68, 36], [62, 47], [58, 36], [50, 46]], hair[0]);
    line(g, [[60, 24], [70, 22, 80, 26]], hair[2], 2);
    line(g, [[52, 30], [58, 26, 64, 28]], hair[2], 1.6);
    shape(g, [[44, 40], [50, 22, 56, 22], [52, 32, 50, 46]], hair[1], false);
    for (const [a, b] of [[[62, 30], [60, 44]], [[72, 28], [72, 44]], [[82, 28], [84, 42]]]) line(g, [a, b], hair[1], 1.2);
  },

  odd(g) {
    const s = SKIN, hair = ['#f3d34a', '#c39a1e', '#fff09a'];
    torso(g, '#9c54d8', '#64288f');
    shape(g, [[48, 98], [66, 110], [86, 98], [80, 96], [66, 104], [54, 96]], '#c99cf2'); // collar
    neck(g, s);
    face(g, s);
    ear(g, s);
    // purple Lyoko cheek marks
    line(g, [[50, 70], [56, 71]], '#9c54d8', 1.8);
    line(g, [[85, 69], [88, 68]], '#9c54d8', 1.6);
    eyes(g, 'grin', '#6a2fa0');
    nose(g, s, true);
    mouth(g, 'grin', s);
    // the famous spike, blond with a purple spot
    shape(g, [[42, 50], [36, 30, 50, 22], [52, 8, 58, -2], [66, 10, 70, 18], [84, 14, 94, 26], [96, 42, 90, 48], [84, 38], [80, 46], [74, 38], [68, 46], [62, 38], [56, 48], [50, 40]], hair[0]);
    shape(g, [[54, 18], [58, 6, 60, 4], [64, 12, 64, 20], [58, 22, 54, 18]], '#9c54d8', false);
    line(g, [[70, 22], [80, 20, 88, 28]], hair[2], 1.8);
    for (const [a, b] of [[[64, 22], [64, 40]], [[76, 24], [76, 40]], [[86, 30], [86, 42]]]) line(g, [a, b], hair[1], 1.2);
    shape(g, [[42, 50], [36, 30, 50, 22], [46, 36, 50, 40]], hair[1], false);
    // cat-ear headpiece
    shape(g, [[48, 30], [42, 12], [58, 24]], '#9c54d8');
    shape(g, [[80, 22], [90, 6], [94, 26]], '#9c54d8');
  },

  yumi(g) {
    const s = PALE, hair = ['#1c1626', '#0c0a12', '#4a4060'];
    // hair bun with a fan ornament
    shape(g, [[52, 22], [56, 4, 74, 6], [86, 10, 82, 24]], hair[0]);
    shape(g, [[70, 8], [86, -2, 98, 6], [92, 12, 80, 16]], '#e9467e');
    line(g, [[74, 10], [92, 4]], '#ffffff', 0.9);
    torso(g, '#2a1838', '#140a1e');
    shape(g, [[46, 98], [64, 120], [84, 98], [78, 98], [64, 110], [52, 98]], '#e9467e'); // kimono collar
    neck(g, s);
    // back hair falling to the shoulders
    shape(g, [[36, 98], [28, 60, 42, 32], [60, 16, 86, 24], [100, 36, 98, 60], [100, 80, 96, 96], [90, 90], [92, 60, 86, 44], [56, 44, 50, 98]], hair[0]);
    face(g, s, { female: true });
    eyes(g, 'female', '#3a2a40');
    nose(g, s, true);
    mouth(g, 'soft', s);
    // straight fringe swept to one side
    shape(g, [[44, 46], [44, 26, 64, 22], [88, 20, 94, 34], [92, 46], [84, 36, 70, 40], [64, 44, 58, 50], [54, 42, 48, 52]], hair[0]);
    line(g, [[56, 30], [70, 24, 84, 28]], hair[2], 1.8);
    line(g, [[94, 40], [98, 70, 94, 96]], hair[2], 1.2);
  },

  aelita(g) {
    const s = PALE, hair = ['#ff8bc9', '#d9539a', '#ffd0ea'];
    torso(g, '#8c1f3f', '#5a0f26');
    shape(g, [[50, 98], [66, 112], [84, 98], [66, 104]], '#ffb3d9'); // pink trim
    neck(g, s);
    shape(g, [[38, 82], [30, 56, 42, 34], [62, 16, 88, 24], [102, 38, 98, 62], [98, 78, 94, 86], [88, 70], [56, 50, 50, 84]], hair[0]); // back of the bob
    face(g, s, { female: true });
    ear(g, s, 44, 62, true); // elf ear
    eyes(g, 'female', '#3aa860');
    nose(g, s, true);
    mouth(g, 'soft', s);
    // curly bob fringe
    shape(g, [[42, 50], [40, 28, 58, 22], [84, 18, 96, 34], [98, 46, 92, 54], [86, 42, 80, 44], [76, 38, 70, 44], [64, 36, 58, 46], [52, 40, 46, 54]], hair[0]);
    line(g, [[56, 28], [68, 22, 82, 26]], hair[2], 2);
    for (const [a, b] of [[[64, 30], [62, 42]], [[76, 28], [76, 40]], [[88, 32], [90, 46]]]) line(g, [a, b], hair[1], 1.2);
    shape(g, [[42, 50], [40, 28, 50, 26], [46, 40, 46, 54]], hair[1], false);
    oval(g, 64, 18, 3, 3, '#ffffff', true); // hair ornament
  },

  william(g) {
    const s = PALE, hair = ['#1a1a24', '#08080c', '#5a5a78'];
    torso(g, '#1c1c26', '#0a0a10');
    shape(g, [[44, 98], [66, 126], [88, 98], [82, 98], [66, 116], [50, 98]], '#e6e6f0'); // white trim
    // XANA eye on the chest
    oval(g, 66, 122, 5, 4, null, false);
    line(g, [[61, 122], [66, 118, 71, 122], [66, 126, 61, 122]], '#8a8a9c', 1.2);
    neck(g, s);
    face(g, s, { jaw: 1.5 });
    ear(g, s);
    eyes(g, 'fierce', '#2a2a3a');
    nose(g, s);
    mouth(g, 'smirk', s);
    // big shaggy dark hair
    shape(g, [[38, 74], [30, 52, 38, 34], [42, 14, 66, 10], [94, 10, 102, 30], [104, 44, 96, 52], [92, 42], [88, 52], [84, 40], [78, 50], [72, 40], [64, 50], [60, 40], [54, 52], [50, 44], [46, 70]], hair[0]);
    line(g, [[54, 20], [70, 14, 88, 20]], hair[2], 2);
    line(g, [[44, 30], [48, 22, 56, 20]], hair[2], 1.4);
    for (const [a, b] of [[[60, 26], [58, 46]], [[70, 24], [72, 44]], [[82, 24], [86, 42]], [[92, 26], [96, 44]]]) line(g, [a, b], hair[1], 1.3);
  },

  jeremie(g) {
    const s = SKIN, hair = ['#f1d77a', '#c7a748', '#fff3b8'];
    torso(g, '#2f5ad8', '#1a3796');
    shape(g, [[48, 98], [58, 108], [66, 100], [74, 108], [86, 98], [66, 96]], '#ffffff'); // shirt collar
    neck(g, s);
    face(g, s, { jaw: 0 });
    ear(g, s);
    eyes(g, 'calm', '#3a5a9a');
    nose(g, s, true);
    mouth(g, 'smirk', s);
    // round glasses with a lens glare
    oval(g, 62, 61, 8, 7, 'rgba(210,235,255,0.35)');
    oval(g, 83, 60, 5, 6.5, 'rgba(210,235,255,0.35)');
    line(g, [[70, 60], [78, 60]]);
    line(g, [[54, 60], [46, 58]]);
    line(g, [[58, 57], [64, 63]], '#ffffff', 1.4);
    // tidy side-parted hair
    shape(g, [[42, 60], [36, 36, 52, 24], [72, 14, 92, 26], [98, 36, 94, 46], [82, 38, 70, 40], [58, 40, 50, 48], [46, 52, 44, 62]], hair[0]);
    line(g, [[56, 30], [70, 22, 86, 30]], hair[2], 1.8);
    shape(g, [[42, 60], [36, 36, 48, 28], [46, 44, 44, 62]], hair[1], false);
    for (const [a, b] of [[[64, 24], [60, 38]], [[76, 22], [74, 38]], [[86, 28], [86, 38]]]) line(g, [a, b], hair[1], 1.2);
  },

  franz(g) {
    const s = { base: '#eecfb4', shade: '#c49a80', deep: '#8a6050', light: '#fff0e2' }, grey = ['#c9ccd6', '#8a8e9c', '#f2f4fa'];
    torso(g, '#e9eef6', '#a8b4c8'); // lab coat
    shape(g, [[52, 98], [66, 128], [80, 98], [74, 98], [66, 112], [58, 98]], '#3a4a6a');
    neck(g, s);
    face(g, s);
    ear(g, s);
    eyes(g, 'calm', '#3a6a9a');
    nose(g, s);
    // full grey beard and moustache
    shape(g, [[46, 74], [50, 92, 62, 102], [76, 106, 86, 92], [90, 80, 88, 70], [84, 78, 78, 76], [70, 74, 62, 78], [54, 80, 48, 70]], grey[0]);
    shape(g, [[46, 74], [50, 92, 62, 102], [60, 92, 52, 80]], grey[1], false);
    shape(g, [[64, 77], [72, 74, 82, 76], [80, 80, 74, 80], [68, 80, 64, 77]], grey[1]);
    line(g, [[68, 92], [74, 90, 80, 92]], grey[2], 1.2);
    // receding grey hair, long at the back
    shape(g, [[38, 80], [30, 56, 40, 36], [52, 20, 70, 20], [62, 26, 52, 34], [48, 46, 46, 72]], grey[0]);
    shape(g, [[70, 20], [84, 18, 92, 30], [86, 28, 78, 26]], grey[0]);
    line(g, [[42, 50], [44, 38, 52, 30]], grey[2], 1.4);
    line(g, [[56, 48], [62, 46, 68, 48]], grey[1], 1.6);
  },

  xana(g) {
    // a hooded spectre: no face, only the eyes and the sign
    torso(g, '#18121c', '#08060a');
    shape(g, [[26, 128], [36, 96, 66, 92], [96, 96, 106, 128]], '#100c14', false);
    shape(g, [[30, 110], [26, 60, 40, 34], [60, 6, 88, 18], [112, 36, 104, 80], [100, 104, 96, 128], [36, 128]], '#1e1824');
    shape(g, [[44, 98], [40, 70, 48, 50], [66, 34, 88, 44], [98, 62, 92, 90], [80, 104, 62, 104]], '#050307');
    shape(g, [[30, 110], [26, 60, 40, 34], [60, 6, 70, 10], [44, 40, 40, 110]], '#0e0a12', false);
    // glowing red eyes
    shape(g, [[56, 68], [64, 63], [68, 68], [62, 70]], '#ff2a2a', false);
    shape(g, [[78, 67], [85, 62], [88, 66], [82, 69]], '#ff2a2a', false);
    oval(g, 63, 67, 1.2, 1, '#ffd0d0', false);
    oval(g, 84, 65.5, 1, 0.9, '#ffd0d0', false);
    // XANA sign on the hood
    line(g, [[70, 32], [70, 22]], '#ff2a2a', 1.6);
    oval(g, 70, 38, 6, 6, null, false);
    g.strokeStyle = '#ff2a2a'; g.lineWidth *= 1.6; g.stroke(); g.lineWidth /= 1.6;
    oval(g, 70, 38, 2, 2, '#ff2a2a', false);
    line(g, [[70, 44], [70, 54]], '#ff2a2a', 1.6);
    line(g, [[66, 42], [62, 52]], '#ff2a2a', 1.6);
    line(g, [[74, 42], [78, 52]], '#ff2a2a', 1.6);
    // smoke wisps
    line(g, [[20, 124], [12, 104, 22, 92]], '#3a2e44', 1.6);
    line(g, [[112, 120], [122, 100, 112, 86]], '#3a2e44', 1.6);
  },
};

// --- pixelate: palette snap + outer outline ------------------------------------------
function hexRgb(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function paint(id, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  const used = new Set([OL]);
  // record every solid colour the art uses: that's the sprite's palette
  const proxy = new Proxy(g, {
    set(t, k, v) { if ((k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string') used.add(v); t[k] = v; return true; },
    get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
  });
  const zoom = 1.13;
  g.scale(size / 128, size / 128);
  g.translate(64, 82); g.scale(zoom, zoom); g.translate(-64, -76);
  g.lineWidth = 1.15 * (128 / size) / zoom;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  (ART[id] || ART.xana)(proxy);
  const pal = [...used].map(hexRgb).filter(Boolean);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    if (d[o + 3] < 110) { d[o + 3] = 0; continue; }
    let best = 0, bd = 1e9;
    for (let k = 0; k < pal.length; k++) {
      const p = pal[k];
      const dd = (d[o] - p[0]) ** 2 * 3 + (d[o + 1] - p[1]) ** 2 * 4 + (d[o + 2] - p[2]) ** 2 * 2;
      if (dd < bd) { bd = dd; best = k; }
    }
    d[o] = pal[best][0]; d[o + 1] = pal[best][1]; d[o + 2] = pal[best][2]; d[o + 3] = 255;
    solid[i] = 1;
  }
  // a 1-pixel ink outline around the whole sprite
  const ink = hexRgb(OL);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (solid[i]) continue;
    const n = (x > 0 && solid[i - 1]) || (x < size - 1 && solid[i + 1]) || (y > 0 && solid[i - size]) || (y < size - 1 && solid[i + size]);
    if (n) { const o = i * 4; d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

const cache = new Map();
/** Small select-grid portrait (data URL). */
export function portrait(id) {
  const k = `${id}:s`;
  if (!cache.has(k)) cache.set(k, paint(id, 64));
  return cache.get(k);
}
/** Big portrait for the detail panel and the VS screen (data URL). */
export function portraitBig(id) {
  const k = `${id}:b`;
  if (!cache.has(k)) cache.set(k, paint(id, 112));
  return cache.get(k);
}
