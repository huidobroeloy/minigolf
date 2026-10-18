import { rect, patrol, orbit, shuttle } from './helpers.js';

// SKIDBLADNIR & THE DIGITAL SEA DEPTHS (season 4): from the Skid's hangar down into the deep, where
// tow currents pull, the Skid's orbital hold ferries you over the void, Kongre's mouths wait beside
// the channels and the Replika gateway glows at the bottom. Everything floats a little underwater.

const tow = (x0, z0, x1, z1, dir, speed = 2, y = 0) => ({ t: 'zone', kind: 'current', rect: [x0, z0, x1, z1], dir, speed, y });
const coral = (x, z, r = 0.42, y = 0) => ({ t: 'bumper', p: [x, y, z], r, color: '#3fc6ff' });

export default [
  {
    id: 'skid-1', name: 'Skid Hangar', sector: 'skid', water: true, par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.4, 0, 19],
    parts: [
      // the hangar floor, then a launch ramp over the drop into the sea
      { t: 'floor', poly: rect(-2.5, -1.2, 2.5, 6), open: [2] },
      { t: 'ramp', a: [0, 6], b: [0, 8.6], w: 2.4, ya: 0, yb: 0.7, jump: true },
      { t: 'floor', poly: rect(-4, 12.5, 4, 22), open: [0], holes: [{ c: [1.4, 20.5], r: 0.5 }, { c: [-0.3, 19.6], r: 0.4 }, { c: [3.1, 18.2], r: 0.4 }] },
      coral(-2.6, 15.4), coral(2.6, 14.8),
      { t: 'monster', type: 'kalamar', path: patrol([-3, 17], [3, 17], 6) },
    ],
  },
  {
    id: 'skid-2', name: 'Tow Current Trench', sector: 'skid', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 25],
    parts: [
      { t: 'floor', poly: rect(-2.8, -1.2, 2.8, 27.5), holes: [{ c: [0, 26.5], r: 0.5 }, { c: [-1.6, 25.4], r: 0.4 }, { c: [1.6, 25.4], r: 0.4 }] },
      // tow currents down the middle (the water along the walls is calm): one against you, one with you
      tow(-1.1, 5, 1.1, 11, [0, -1], 2.2),
      tow(-1.1, 14, 1.1, 20, [0, 1], 1.8),
      coral(-1.9, 12.5, 0.38), coral(1.9, 21.5, 0.38),
      { t: 'monster', type: 'shark', path: patrol([-2.2, 9], [2.2, 9], 5), range: 3.5 },
      { t: 'monster', type: 'shark', path: patrol([2.2, 17.5], [-2.2, 17.5], 5.5, 0, 0.5), range: 3.5 },
    ],
  },
  {
    id: 'skid-3', name: 'Orbital Hold', sector: 'skid', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [-1.2, 0, 24],
    parts: [
      // the void between two decks: the Skid's orbital hold ferries you over; a narrow catwalk for the brave
      { t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 8], [3.4, 8], [2.6, 8], [-4, 8]], open: [3] },
      { t: 'mover', kind: 'floor', s: [2, 0.3, 2], path: shuttle([-1.5, -0.15, 9.1], [-1.5, -0.15, 14.9], 7, 0, 0.6), sideLook: 's5' },
      { t: 'floor', poly: rect(2.6, 8, 3.4, 16), walls: false },
      { t: 'floor', poly: [[-4, 16], [2.6, 16], [3.4, 16], [4, 16], [4, 27], [-4, 27]], open: [0, 1], holes: [{ c: [-1.2, 25.5], r: 0.5 }, { c: [0.5, 24.6], r: 0.4 }, { c: [-2.9, 23.2], r: 0.4 }] },
      coral(2.4, 20), coral(-3, 18.5),
      { t: 'monster', type: 'shark', path: patrol([-3, 21], [3, 21], 6), range: 3.5 },
    ],
  },
  {
    id: 'skid-4', name: 'Kongre’s Gullet', sector: 'skid', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [-2.4, 0, 23.5],
    parts: [
      { t: 'floor', poly: rect(-4, -1.2, 4, 26), holes: [{ c: [-2.4, 25], r: 0.5 }, { c: [-0.7, 24.2], r: 0.4 }] },
      { t: 'wall', pts: [[-4, 8], [1.8, 8]], h: 0.6, thick: 0.4 },
      { t: 'wall', pts: [[-1.8, 16], [4, 16]], h: 0.6, thick: 0.4 },
      // the channel bends past two of Kongre's mouths; a tentacle sweeps the middle
      { t: 'monster', type: 'kongreMouth', p: [2.3, 0, 11.6] },
      { t: 'monster', type: 'kongreMouth', p: [-2.3, 0, 19.6] },
      { t: 'monster', type: 'kongre', p: [-5.4, 0, 12], len: 5, sweep: [0.4, 2.6], period: 9 },
      { t: 'monster', type: 'kalamar', path: patrol([-3, 4], [3, 4], 5.5) },
    ],
  },
  {
    id: 'skid-5', name: 'Kalamar Reef', sector: 'skid', water: true, par: 3, time: 120,
    tee: [0, 0, 0], cup: [-2, 1.2, 19.5],
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 10), open: [2] },
      { t: 'ramp', a: [0, 10], b: [0, 14], w: 4, ya: 0, yb: 1.2 },
      { t: 'floor', y: 1.2, poly: [[-4.5, 14], [-2, 14], [2, 14], [4.5, 14], [4.5, 22], [-4.5, 22]], open: [1], holes: [{ c: [-2, 21], r: 0.5 }, { c: [-3.7, 18.6], r: 0.4 }, { c: [-0.3, 19.9], r: 0.4 }] },
      coral(-1.2, 4), coral(1.2, 7), coral(2.8, 18, 0.45, 1.2), coral(0.6, 16.4, 0.36, 1.2),
      { t: 'monster', type: 'kalamar', path: patrol([-3.5, 16.2], [3.5, 16.2], 6, 1.2) },
      { t: 'monster', type: 'shark', path: patrol([-1.4, 2], [1.4, 2], 4.5), range: 3 },
    ],
  },
  {
    id: 'skid-6', name: 'Replika Gateway', sector: 'skid', water: true, par: 5, time: 170,
    tee: [0, 0, 0], cup: [1.6, 3, 21],
    parts: [
      { t: 'floor', poly: rect(-5, -1.2, 5, 14), open: [2] },
      tow(-1.2, 4, 1.2, 9, [0, -1], 1.6),
      coral(-3, 6), coral(3, 9),
      // the bubble column up to the gateway deck
      { t: 'zone', kind: 'bubble', c: [0, 13], r: 0.9, height: 4.4, lift: 1.8, push: [0, 2.2] },
      { t: 'floor', y: 3, poly: rect(-4, 14, 4, 24), open: [0], holes: [{ c: [1.6, 22.5], r: 0.5 }, { c: [-0.1, 21.6], r: 0.4 }, { c: [3.3, 20], r: 0.4 }] },
      { t: 'box', p: [0, 1.5, 14.1], s: [8, 3, 0.2], kind: 'wall', look: '#123a6a' },
      { t: 'monster', type: 'shark', path: patrol([-4, 11], [4, 11], 6), range: 3.5 },
      { t: 'monster', type: 'kalamar', path: orbit([0, 19], 2.4, 11, 3) },
    ],
  },
];
