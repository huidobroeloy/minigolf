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
    id: 'desert-3', name: 'Kankrelat Canyon', sector: 'desert', par: 3, time: 130,
    tee: [0, 0, 0], cup: [0.8, 0, 27.5],
    hio: 'Full-ish power off the jump ramp, clear the chasm, then thread the Kankrelat patrol.',
    parts: [
      {
        t: 'floor',
        poly: [[-1.6, -1.2], [1.6, -1.2], [1.6, 9], [4.5, 9], [4.5, 31], [-5.5, 31], [-5.5, 9], [-1.6, 9]],
        holes: [{ poly: [[-2.2, 13], [4.0, 13], [4.0, 16.6], [-2.2, 16.6]] }],
      },
      { t: 'ramp', a: [0, 10.2], b: [0, 12.8], w: 2.2, ya: 0, yb: 0.75 },
      { t: 'zone', kind: 'slow', rect: [-5.5, 23.5, -2.5, 26.5], mul: 3 },
      { t: 'cyl', p: [-1.6, 0, 25.2], r: 0.55, h: 1.5, look: 'sandstone' },
      { t: 'cyl', p: [2.7, 0, 24.4], r: 0.5, h: 1.1, look: 'sandstone' },
      { t: 'monster', type: 'kankrelat', path: patrol([-4.7, 21], [3.7, 21], 4.2) },
      { t: 'monster', type: 'kankrelat', path: patrol([-5.0, 14.8], [-2.7, 14.8], 2.4, 0, 0.3) },
      { t: 'monster', type: 'kankrelat', path: patrol([3.7, 29.6], [-4.7, 29.6], 5.0, 0, 0.6) },
      { t: 'monster', type: 'tumbleweed', path: loop([[-5, 18], [4, 19], [3.5, 26], [-5, 27]], 2.4) },
    ],
  },
];
