import { rect, patrol, loop, kicker } from './helpers.js';

// Sector 1 — DESERT: sand, mesas, tumbleweeds, Kankrelats and a Megatank.
export default [
  {
    id: 'desert-1', name: 'Dune Drive', sector: 'desert', par: 2, time: 90,
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
    id: 'desert-2', name: 'Megatank Mesa', sector: 'desert', par: 3, time: 110,
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
    id: 'desert-3', name: 'Kankrelat Canyon', sector: 'desert', par: 4, time: 160,
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
    id: 'desert-4', name: 'Sandstorm Pass', sector: 'desert', par: 4, time: 150,
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
    id: 'desert-5', name: 'Tower Oasis', sector: 'desert', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 11.2],
    hio: 'Thread the gap between the two sinkholes at a gentle pace.',
    parts: [
      {
        t: 'floor', poly: rect(-5, -1.2, 5, 16),
        holes: [{ c: [-1.9, 8.6], r: 1.25 }, { c: [1.9, 8.6], r: 1.25 }, { c: [0, 13.6], r: 0.9 }, { c: [-3.6, 12.4], r: 0.8 }, { c: [3.6, 12.4], r: 0.8 }],
      },
      { t: 'zone', kind: 'slow', rect: [-5, 4, -3, 7], mul: 3 },
      { t: 'zone', kind: 'slow', rect: [3, 4, 5, 7], mul: 3 },
      { t: 'cyl', p: [-3, 0, 2.5], r: 0.45, h: 1.1, look: 'sandstone' },
      { t: 'cyl', p: [3, 0, 2.5], r: 0.45, h: 1.1, look: 'sandstone' },
      { t: 'monster', type: 'tumbleweed', path: loop([[-4, 5], [4, 5], [4, 6.5], [-4, 6.5]], 2.2) },
      { t: 'monster', type: 'kankrelat', path: patrol([-4, 14.8], [4, 14.8], 5) },
    ],
  },
  {
    id: 'desert-6', name: 'Mesa Switchbacks', sector: 'desert', par: 5, time: 170,
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
