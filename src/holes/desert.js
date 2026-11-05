import { rect, patrol, loop, kicker } from './helpers.js';
import { corridorPoly } from './extend.js';

// Sector 1 — DESERT: sand, mesas, tumbleweeds, Kankrelats and a Megatank.
// The openings (docs/lore.md): in the show the Desert is huge sandy plateaus joined only by small bridges,
// cut by canyons where Megatanks run you over, pits that drop into the Digital Sea, and tall rock slabs
// that Kankrelats hide behind and Tarantulas shoot round.

/** Sandstone cliff walls either side of a sunken path (pts at floor height y0, rim at y1). */
function cliffs(pts, w, y0, y1) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux, o = w / 2 + 0.75;
    for (const sd of [1, -1]) {
      out.push({ t: 'box', p: [(ax + bx) / 2 + nx * o * sd, (y0 + y1) / 2, (az + bz) / 2 + nz * o * sd], s: [1.3, y1 - y0, L + 1.2], ry: Math.atan2(ux, uz), look: 'sandstone' });
    }
  }
  return out;
}

// desert-1: the plateau and its bridge. Straight over the unwalled bridge, or the long way round the side.
const bridgeWay = corridorPoly([[4.6, -10.2], [4.6, -7.2], [2.75, -5.6], [2.75, -4.4]], 1.7);
const OPEN1 = {
  par: 1, time: 30,
  tee: [0, 0, -16.5], route: [[0, -16.5], [0, -4.6], [0, -1.2]],
  parts: [
    // the start plateau: walled, but for the bridge and the path round
    { t: 'floor', poly: [[-6, -18], [6, -18], [6, -10], [5.45, -10], [3.75, -10], [0.6, -10], [-0.6, -10], [-6, -10]], open: [3, 5] },
    { t: 'cyl', p: [-3.2, 0, -12.8], r: 0.9, h: 2.4, look: 'sandstone' },
    { t: 'cyl', p: [2.3, 0, -14.2], r: 0.7, h: 1.8, look: 'sandstone' },
    // the bridge: straight, no walls, a ball and a half wide, the Digital Sea either side
    { t: 'floor', poly: rect(-0.6, -10.2, 0.6, -4.4), walls: false },
    // the long way round, through soft sand
    { t: 'floor', poly: bridgeWay.poly, open: [bridgeWay.startEdge, bridgeWay.endEdge] },
    { t: 'zone', kind: 'slow', c: [4.3, -7.6], r: 0.75, mul: 3 },
    // the landing both ways meet on, before the old tee
    { t: 'floor', poly: [[-1.6, -4.6], [-0.6, -4.6], [0.6, -4.6], [1.9, -4.6], [3.6, -4.6], [3.6, -1.2], [1.6, -1.2], [-1.6, -1.2]], open: [1, 3, 6] },
    // Kankrelats hiding behind the rocks
    { t: 'monster', type: 'kankrelat', path: patrol([-4.8, -11.2], [-1.6, -11.2], 3.4) },
    { t: 'monster', type: 'kankrelat', path: patrol([0.8, -12.4], [4.8, -12.4], 3.8, 0, 0.5) },
  ],
};

// desert-2: a Megatank canyon across your way. Jump it from the ramp, or go down, past the Megatank, and up.
const OPEN2 = {
  par: 1, time: 40,
  tee: [0, 0, -19.5], route: [[0, -19.5], [0, -13.5], [0, -8], [0, -1.2]],
  parts: [
    { t: 'floor', poly: rect(-4, -21.5, 4, -13.5), open: [2] },
    { t: 'ramp', a: [-1.5, -16.3], b: [-1.5, -13.5], w: 1.8, ya: 0, yb: 0.6, jump: true },
    { t: 'ramp', a: [3, -13.5], b: [3, -10.4], w: 1.6, ya: 0, yb: -1.8 },
    // the canyon floor (deep enough that its walls stay below the plateaus): walled but for the two ramps
    { t: 'floor', y: -1.8, poly: [[-7, -13.5], [2.2, -13.5], [3.8, -13.5], [7, -13.5], [7, -8], [1.6, -8], [-1.6, -8], [-7, -8]], open: [1, 5] },
    { t: 'ramp', a: [0, -12], b: [0, -8], w: 3.2, ya: -1.8, yb: 0 },
    { t: 'box', p: [-7.6, -0.9, -10.75], s: [1.2, 1.8, 5.9], look: 'sandstone' },
    { t: 'box', p: [7.6, -0.9, -10.75], s: [1.2, 1.8, 5.9], look: 'sandstone' },
    // the far side: the jump lands here
    { t: 'floor', poly: rect(-2, -8, 2, -1.0), open: [0, 2] },
    { t: 'monster', type: 'megatank', path: patrol([-6, -12.8], [1.0, -12.8], 7, -1.8) },
    { t: 'monster', type: 'kankrelat', path: patrol([-1.5, -4.6], [1.5, -4.6], 3.2) },
  ],
};

// desert-4: a sunken canyon dotted with rock columns to zigzag through (the Desert Replika, ep 83), Hornets overhead.
const trench = [[0, -25], [0, -20.5], [-5, -15.5], [-5, -11.5], [0, -7], [0, -5.2]];
const trenchPoly = corridorPoly(trench, 4);
const OPEN4 = {
  par: 1, time: 30,
  tee: [0, -1.2, -24], route: [...trench, [0, -1.2]],
  parts: [
    { t: 'floor', y: -1.2, poly: trenchPoly.poly, open: [trenchPoly.endEdge] },
    { t: 'ramp', a: [0, -5.6], b: [0, -1.0], w: 4, ya: -1.2, yb: 0 },
    ...cliffs(trench.slice(0, -1), 4, -1.2, 0.3),
    { t: 'cyl', p: [0.9, -1.2, -21.6], r: 0.5, h: 2.6, look: 'sandstone' },
    { t: 'cyl', p: [-3.2, -1.2, -17.0], r: 0.5, h: 2.6, look: 'sandstone' },
    { t: 'cyl', p: [-1.8, -1.2, -18.4], r: 0.45, h: 2.2, look: 'sandstone' },
    { t: 'cyl', p: [-5.9, -1.2, -13.4], r: 0.5, h: 2.6, look: 'sandstone' },
    { t: 'cyl', p: [-3.9, -1.2, -12.6], r: 0.45, h: 2.2, look: 'sandstone' },
    { t: 'cyl', p: [-1.8, -1.2, -8.6], r: 0.5, h: 2.6, look: 'sandstone' },
    { t: 'monster', type: 'hornet', path: patrol([-1.2, -19.6], [-3.8, -16.4], 4.4, 1.1), aim: 'ball' },
    { t: 'monster', type: 'hornet', path: patrol([-4.6, -10.6], [-0.8, -8.0], 4.0, 1.1, 0.5), aim: 'ball' },
  ],
};

// desert-5: Tarantula flats. The open middle is short but under fire; the slabs give cover on a longer zigzag.
const slab = (x, z, ry) => ({ t: 'box', p: [x, 0.8, z], s: [2.6, 1.6, 0.45], ry, look: 'sandstone' });
const OPEN5 = {
  par: 1, time: 30,
  tee: [0, 0, -15], route: [[0, -15], [0, -1.2]],
  parts: [
    { t: 'floor', poly: rect(-5, -17, 5, -1.0), open: [2] },
    slab(-2.6, -12.4, 0.55), slab(2.7, -11.2, -0.55), slab(-2.9, -7.4, -0.5), slab(2.8, -6.2, 0.5), slab(-1.2, -3.4, 0.2),
    // deep sand across the open middle
    { t: 'zone', kind: 'slow', rect: [-1.1, -10.2, 1.1, -5.4], mul: 2.5 },
    { t: 'monster', type: 'tarantula', path: patrol([-4.2, -9.2], [-4.2, -4.4], 5.2) },
    { t: 'monster', type: 'tarantula', path: patrol([4.2, -13.8], [4.2, -8.8], 5.6, 0, 0.5) },
  ],
};

export default [
  {
    id: 'desert-1', opening: OPEN1, name: 'Dune Drive', sector: 'desert', par: 2, time: 90,
    tee: [0, 0, 0], cup: [8.6, 0, 12.6],
    hio: 'Straight up the lane into the 45° kicker, ~75% power, between the Kankrelats.',
    parts: [
      { t: 'floor', poly: [[-1.6, -1.2], [1.6, -1.2], [1.6, 11], [10.5, 11], [10.5, 14.2], [-1.6, 14.2]] },
      kicker([-1.6, 11.9], [0.7, 14.2]),
      { t: 'zone', kind: 'slow', c: [4.2, 13.5], r: 0.75, mul: 3 },
      { t: 'monster', type: 'kankrelat', path: patrol([-1.0, 6], [1.0, 6], 3.4) },
      { t: 'monster', type: 'kankrelat', path: patrol([5.6, 11.5], [5.6, 13.7], 2.6, 0, 0.5) },
      { t: 'monster', type: 'tumbleweed', path: loop([[-1.2, 2.5], [1.2, 3.5], [-1.2, 4.5], [1.2, 2.0]], 1.6) },
    ],
  },
  {
    id: 'desert-2', opening: OPEN2, name: 'Megatank Mesa', sector: 'desert', par: 3, time: 110,
    tee: [0, 0, 0], cup: [0, 1.5, 19.4],
    hio: 'Up the ramp after the Megatank passes, bank off the right wall around the centre rock.',
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 6), open: [2] },
      { t: 'ramp', a: [0, 6], b: [0, 11], w: 4, ya: 0, yb: 1.5 },
      { t: 'floor', y: 1.5, poly: [[-5, 11], [-2, 11], [2, 11], [5, 11], [5, 21.2], [-5, 21.2]], open: [1] },
      { t: 'cyl', p: [0, 1.5, 17.2], r: 0.75, h: 1.4, look: 'sandstone' },
      { t: 'cyl', p: [-3.0, 1.5, 15.8], r: 0.6, h: 1.8, look: 'sandstone' },
      { t: 'cyl', p: [3.1, 1.5, 15.2], r: 0.55, h: 1.2, look: 'sandstone' },
      { t: 'zone', kind: 'slow', c: [-3.4, 19.5], r: 1.1, mul: 3.5 },
      { t: 'monster', type: 'megatank', path: patrol([-3.7, 13.4], [3.7, 13.4], 5.5, 1.5) },
      { t: 'monster', type: 'tumbleweed', path: loop([[-4.4, 12], [4.4, 20.5], [-4.4, 20.5], [4.4, 12]], 2.0, 1.5) },
    ],
  },
  {
    id: 'desert-3', opening: false, name: 'Kankrelat Canyon', sector: 'desert', par: 4, time: 160,
    tee: [0, 0, 0], cup: [-1.1, 0, 40.5],
    hio: 'Clear the chasm, hit the sand geyser fast and fly the canyon straight onto the far mesa.',
    parts: [
      {
        t: 'floor',
        poly: [[-1.6, -1.2], [1.6, -1.2], [1.6, 9], [4.5, 9], [4.5, 24], [2.6, 24], [-5.5, 24], [-5.5, 9], [-1.6, 9]],
        open: [5],
        holes: [{ poly: [[-2.2, 13], [4.0, 13], [4.0, 16.6], [-2.2, 16.6]] }],
      },
      { t: 'ramp', a: [0, 10.2], b: [0, 12.8], w: 2.2, ya: 0, yb: 0.75, jump: true },
      // the canyon rim: an unwalled S-bend
      { t: 'floor', poly: rect(2.6, 24, 4.5, 30), walls: false },
      { t: 'floor', poly: rect(-3.5, 30, 4.5, 31.8), walls: false },
      { t: 'floor', poly: rect(-3.5, 31.8, -1.7, 34), walls: false },
      { t: 'zone', kind: 'wind', rect: [-3.5, 30, 2.6, 31.8], dir: [0, 1], force: 0.8 },
      // the risky shortcut: a sand geyser at the canyon edge
      { t: 'zone', kind: 'vent', c: [-0.6, 22.9], r: 0.8, y: 0, launch: 13.5, push: [0, 1], minSpeed: 3 },
      { t: 'floor', poly: [[-6, 34], [-3.5, 34], [-1.7, 34], [2, 34], [2, 44], [-6, 44]], open: [1] },
      { t: 'cyl', p: [-4.5, 0, 38.5], r: 0.55, h: 1.4, look: 'sandstone' },
      { t: 'cyl', p: [0.6, 0, 42], r: 0.5, h: 1.1, look: 'sandstone' },
      { t: 'cyl', p: [-1.6, 0, 19.5], r: 0.55, h: 1.5, look: 'sandstone' },
      { t: 'monster', type: 'kankrelat', path: patrol([-4.7, 20.8], [3.7, 20.8], 4.2) },
      { t: 'monster', type: 'kankrelat', path: patrol([-5.0, 14.8], [-2.7, 14.8], 2.4, 0, 0.3) },
      { t: 'monster', type: 'kankrelat', path: patrol([-5.4, 38.5], [1.5, 38.5], 4.6, 0, 0.6) },
      { t: 'monster', type: 'tumbleweed', path: loop([[4, 30.9], [-3, 30.9]], 2.2) },
      { t: 'monster', type: 'tumbleweed', path: loop([[-5, 18], [4, 19], [3.5, 23], [-5, 22]], 2.4) },
    ],
  },
  {
    id: 'desert-4', opening: OPEN4, name: 'Sandstorm Pass', sector: 'desert', par: 4, time: 150,
    tee: [0, 0, 0], cup: [-6.4, 0, 22.5],
    hio: 'Off both kickers: right side of the lane, left along the ridge, then straight up into the storm.',
    parts: [
      { t: 'floor', poly: [[-2, -1.2], [2, -1.2], [2, 16], [-4, 16], [-4, 25], [-8.5, 25], [-8.5, 11.5], [-2, 11.5]] },
      kicker([2, 13.6], [-0.4, 16]),
      kicker([-8.5, 16], [-5.6, 13.1]),
      // the sandstorm blows down the last lane
      { t: 'zone', kind: 'wind', rect: [-8.5, 17.5, -4, 21], dir: [0, -1], force: 1.6 },
      { t: 'monster', type: 'kankrelat', path: patrol([-8, 24], [-4.6, 24], 3.6) },
      { t: 'monster', type: 'tumbleweed', path: loop([[-8, 12], [-3, 15.5], [-8, 15.5], [-3, 12]], 2.2) },
      { t: 'monster', type: 'tumbleweed', path: loop([[-1.5, 3], [1.5, 10], [-1.5, 10], [1.5, 3]], 1.8) },
    ],
  },
  {
    id: 'desert-5', opening: OPEN5, name: 'Tower Oasis', sector: 'desert', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 11.2],
    hio: 'Thread the gap between the two sinkholes at a gentle pace.',
    parts: [
      {
        t: 'floor', poly: rect(-5, -1.2, 5, 16),
        holes: [{ c: [-1.9, 8.6], r: 1.25 }, { c: [1.9, 8.6], r: 1.25 }, { c: [0, 13.6], r: 0.9 }, { c: [-3.6, 12.4], r: 0.8 }, { c: [3.6, 12.4], r: 0.8 }, { c: [1.3, 11.9], r: 0.4 }, { c: [-1.3, 11.9], r: 0.4 }],
      },
      { t: 'zone', kind: 'slow', rect: [-5, 4, -3, 7], mul: 3 },
      { t: 'zone', kind: 'slow', rect: [3, 4, 5, 7], mul: 3 },
      { t: 'cyl', p: [-3, 0, 2.5], r: 0.45, h: 1.1, look: 'sandstone' },
      { t: 'cyl', p: [3, 0, 2.5], r: 0.45, h: 1.1, look: 'sandstone' },
      { t: 'cyl', p: [0, 0, 10.1], r: 0.3, h: 0.9, look: 'sandstone' }, // through the gap, then round the post
      { t: 'monster', type: 'tumbleweed', path: loop([[-4, 5], [4, 5], [4, 6.5], [-4, 6.5]], 2.2) },
      { t: 'monster', type: 'kankrelat', path: patrol([-4, 14.8], [4, 14.8], 5) },
    ],
  },
  {
    id: 'desert-6', opening: false, name: 'Mesa Switchbacks', sector: 'desert', par: 5, time: 170,
    tee: [-3, 0, 0], cup: [3, 3, 27.5],
    parts: [
      { t: 'floor', poly: [[-6, -1.2], [6, -1.2], [6, 6], [3, 6], [-6, 6]], open: [2] },
      { t: 'ramp', a: [4.5, 6], b: [4.5, 12], w: 3, ya: 0, yb: 1.5 },
      { t: 'floor', y: 1.5, poly: [[-6, 12], [3, 12], [6, 12], [6, 18], [-3, 18], [-6, 18]], open: [1, 4] },
      { t: 'ramp', a: [-4.5, 18], b: [-4.5, 24], w: 3, ya: 1.5, yb: 3 },
      { t: 'floor', y: 3, poly: [[-6, 24], [-3, 24], [6, 24], [6, 30], [-6, 30]], open: [0] },
      { t: 'cyl', p: [0, 0, 3], r: 0.6, h: 1.4, look: 'sandstone' },
      { t: 'cyl', p: [0.4, 3, 28.7], r: 0.5, h: 1.2, look: 'sandstone' },
      { t: 'zone', kind: 'slow', c: [-1, 15], y: 1.5, r: 1.2, mul: 3 },
      { t: 'monster', type: 'megatank', path: patrol([-4, 15], [2, 15], 8, 1.5) },
      { t: 'monster', type: 'kankrelat', path: patrol([1, 28.8], [5, 28.8], 3.2, 3) },
    ],
  },
];
