import { rect, circlePoly, patrol, orbit, spin, elevator, shuttle } from './helpers.js';

// Sector 5 — CARTHAGE: sliding bridges, closing walls, Creepers, Mantas and the Scyphozoa.
export default [
  {
    id: 'sector5-1', name: 'Arena Entry', sector: 'sector5', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 22.5],
    hio: 'Wait for both sliding bridges to line up, then one long straight putt.',
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 4), open: [2] },
      { t: 'mover', s: [2.2, 0.4, 6.4], path: shuttle([-3.6, -0.2, 7], [3.6, -0.2, 7], 6.4, 0, 0.3), extent: [[-4.7, 7], [4.7, 7]] },
      { t: 'floor', poly: rect(-3, 10, 3, 14), open: [0, 2] },
      { t: 'mover', s: [2.2, 0.4, 4.4], path: shuttle([3.6, -0.2, 16], [-3.6, -0.2, 16], 5.2, 0.15, 0.3), extent: [[-4.7, 16], [4.7, 16]] },
      { t: 'floor', poly: rect(-3, 18, 3, 25.5), open: [0] },
      { t: 'monster', type: 'manta', path: patrol([-4.5, 12], [4.5, 12], 7, 1.1) },
      { t: 'monster', type: 'creeper', p: [1.6, 0, 20.5], period: 4.5, phase: 0 },
      { t: 'monster', type: 'creeper', p: [-1.7, 0, 23.6], period: 4.5, phase: 0.5 },
    ],
  },
  {
    id: 'sector5-2', name: 'Closing Walls', sector: 'sector5', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 25.8],
    hio: 'Frogger: time one straight putt through all three gates and past the sweeper.',
    parts: [
      { t: 'floor', poly: rect(-1.5, -1.2, 1.5, 20), open: [2] },
      ...[[5, 3.0, 0], [10, 4.0, 0.35], [15, 5.0, 0.7]].flatMap(([z, P, ph]) => [
        { t: 'mover', kind: 'wall', s: [1.6, 0.55, 0.4], path: shuttle([-2.35, 0.27, z], [-0.78, 0.27, z], P, ph, 0.4), look: 's5' },
        { t: 'mover', kind: 'wall', s: [1.6, 0.55, 0.4], path: shuttle([2.35, 0.27, z], [0.78, 0.27, z], P, ph, 0.4), look: 's5' },
      ]),
      { t: 'monster', type: 'creeper', p: [0.65, 0, 7.5], period: 3.6, phase: 0.2 },
      { t: 'monster', type: 'creeper', p: [-0.65, 0, 12.5], period: 3.6, phase: 0.7 },
      { t: 'floor', poly: [[-4, 20], [-1.5, 20], [1.5, 20], [4, 20], [4, 28.5], [-4, 28.5]], open: [1] },
      { t: 'mover', kind: 'obst', s: [3.4, 0.4, 0.3], path: spin(0, 0.2, 23, 4.5), look: 's5' },
    ],
  },
  {
    id: 'sector5-3', name: 'Celestial Dome', sector: 'sector5', par: 4, time: 150,
    tee: [0, 0, 0], cup: [1.3, 3, 15.2],
    hio: 'Hit the boost pad on the right: up the steep ramp, into the dome while the fence gap faces you.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 6], [2.7, 6], [1.3, 6], [1.2, 6], [-1.2, 6], [-3, 6]], open: [3, 5] },
      { t: 'zone', kind: 'boost', rect: [1.3, 1.5, 2.7, 4.5], dir: [0, 1], speed: 12.5 },
      { t: 'ramp', a: [2, 6], b: [2, 10.5], w: 1.4, ya: 0, yb: 3 },
      { t: 'mover', s: [2.4, 0.4, 2.9], path: elevator(0, 7.55, -0.2, 2.8, 8), sideLook: 's5' },
      { t: 'floor', y: 3, poly: circlePoly(0, 14, 5, 24), open: [17, 18, 19] },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2.4], path: orbit([1.3, 15.2], 1.9, 6, 3.25, 0), look: 's5' },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2.4], path: orbit([1.3, 15.2], 1.9, 6, 3.25, 0.5), look: 's5' },
      { t: 'monster', type: 'scyphozoa', path: orbit([0, 14.5], 2.6, 14, 5.2), grab: [0, 3.3, 10.2] },
      { t: 'monster', type: 'manta', path: patrol([-3.5, 3], [3.5, 3], 6, 1.0, 0.25) },
    ],
  },
];
