import { rect, patrol, shuttle, circlePoly } from './helpers.js';

// VOLCANO REPLIKA (season 4): basalt islands over lava. Touching lava is a fall (+1, back to your
// last safe spot). Rafts ferry you over rivers, magma geysers throw you about, basalt crumbles.

const lava = (x0, z0, x1, z1, y = 0) => ({ t: 'zone', kind: 'lava', rect: [x0, z0, x1, z1], y });

/** A boulder that rolls down a slope (z0→z1, height y0→y1), then sinks and comes back. */
function rolling(x, z0, z1, y0, y1, period, phase, r = 0.55) {
  return (t) => {
    const u = (((t / period) + phase) % 1 + 1) % 1;
    if (u < 0.6) {
      const k = u / 0.6;
      const z = z0 + (z1 - z0) * k * k;
      const y = y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
      return { x, y: y + r, z, ry: 0, roll: z / r };
    }
    const k = Math.min(1, (u - 0.6) / 0.05);
    return { x, y: y1 + r - k * 4, z: z1, ry: 0, roll: 0, hidden: k >= 1 };
  };
}

export default [
  {
    id: 'volcano-1', name: 'Magma Gate', sector: 'volcano', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 15],
    hio: 'Dead straight over both bridges, timed so the basalt bar is out of your way.',
    parts: [
      { t: 'floor', poly: rect(-3, -1.2, 3, 17) },
      lava(-3, 5, -0.7, 6.4), lava(0.7, 5, 3, 6.4),
      lava(-3, 9.4, -0.6, 10.6), lava(0.6, 9.4, 3, 10.6),
      { t: 'mover', kind: 'obst', s: [1.6, 0.5, 0.35], path: patrol([-2.1, 12.4], [2.1, 12.4], 2.6), look: 'rock' },
      { t: 'cyl', p: [-2.2, 0, 2.5], r: 0.4, h: 1.2, look: 'rock' },
      { t: 'cyl', p: [2.3, 0, 14], r: 0.45, h: 1.4, look: 'rock' },
    ],
  },
  {
    id: 'volcano-2', name: 'Lava River', sector: 'volcano', par: 4, time: 150,
    tee: [0, 2, 0], cup: [0, 0, 28.5],
    hio: 'Roll gently onto the magma geyser: it throws you clean over the river, onto the green.',
    parts: [
      { t: 'floor', y: 2, poly: [[-3, -1.2], [3, -1.2], [3, 8], [1.5, 8], [-1.5, 8], [-3, 8]], open: [3] },
      { t: 'ramp', a: [0, 8], b: [0, 13], w: 3, ya: 2, yb: 0 },
      { t: 'floor', poly: [[-6, 13], [-1.5, 13], [1.5, 13], [6, 13], [6, 32], [-6, 32]], open: [1] },
      lava(-6, 19, 6, 23.6),
      // basalt rafts that ferry you across (riding a raft over lava is safe)
      { t: 'mover', kind: 'floor', s: [1.7, 0.3, 1.7], path: shuttle([-3, -0.15, 18.1], [-3, -0.15, 24.5], 6, 0, 0.35), mat: 'basalt', sideLook: 'rock' },
      { t: 'mover', kind: 'floor', s: [1.7, 0.3, 1.7], path: shuttle([3, -0.15, 24.5], [3, -0.15, 18.1], 6, 0, 0.35), mat: 'basalt', sideLook: 'rock' },
      { t: 'zone', kind: 'vent', c: [0, 16.4], r: 0.75, y: 0, launch: 8.5, push: [0, 1], minSpeed: 4.6 },
      { t: 'cyl', p: [-4.5, 0, 27], r: 0.5, h: 1.2, look: 'rock' },
      { t: 'cyl', p: [3.8, 0, 29.5], r: 0.45, h: 1.1, look: 'rock' },
    ],
  },
  {
    id: 'volcano-3', name: 'Crumbling Basalt', sector: 'volcano', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 25.5],
    hio: 'Firm and straight over the crumbling stones: no stopping, no falling.',
    parts: [
      { t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 6.4], [-2.5, 6.4]], open: [2] },
      { t: 'floor', y: -1, poly: rect(-4, 6.4, 4, 22.4), open: [0, 2] },
      lava(-4, 6.4, 4, 22.4, -1),
      ...[7.2, 8.8, 10.4, 12, 13.6, 15.2, 16.8, 18.4, 20, 21.6].map((z) => ({ t: 'crumble', p: [0, 0, z], s: [1.5, 1.5], hits: 1 })),
      ...[[1.6, 11.2], [-1.6, 14.4], [1.6, 17.6]].map(([x, z]) => ({ t: 'crumble', p: [x, 0, z], s: [1.4, 1.4], hits: 1 })),
      { t: 'floor', poly: [[-2.5, 22.4], [2.5, 22.4], [2.5, 28], [-2.5, 28]], open: [0] },
      { t: 'monster', type: 'tarantula', path: patrol([-1.8, 26.6], [1.8, 26.6], 5, 0, 0.3) },
    ],
  },
  {
    id: 'volcano-4', name: 'Eruption Ridge', sector: 'volcano', par: 5, time: 170,
    tee: [0, 0, 0], cup: [-4.5, 2.5, 32],
    hio: 'A secret: the warp pipe in the first corner pops you out below the summit. Hit it hard enough to roll all the way up.',
    parts: [
      { t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 10], [-2.5, 10]], open: [2] },
      { t: 'warp', a: [-1.7, 0, 8.6], b: [-4.5, 2.5, 25.4], dir: [0, 1], speed: 1.5, r: 0.38 },
      { t: 'ramp', a: [0, 10], b: [0, 18], w: 5, ya: 0, yb: 2.5 },
      { t: 'monster', type: 'boulder', path: rolling(-1.2, 17.5, 10.4, 2.5, 0, 5.5, 0), size: 0.6 },
      { t: 'monster', type: 'boulder', path: rolling(1.2, 17.5, 10.4, 2.5, 0, 5.5, 0.5), size: 0.6 },
      { t: 'floor', y: 2.5, poly: [[-6, 18], [-2.5, 18], [2.5, 18], [2.5, 24], [-3, 24], [-3, 34], [-6, 34]], open: [1] },
      { t: 'zone', kind: 'vent', c: [0, 21], r: 0.7, y: 2.5, launch: 9, push: [-1, 0], minSpeed: 2 },
      lava(-6, 24.5, -5.2, 31, 2.5), lava(-6, 33, -3, 34, 2.5),
      { t: 'zone', kind: 'slow', rect: [-5.2, 27, -3, 30], y: 2.5, mul: 3 }, // ash drift // overshoot the summit cup and you're in the magma
      { t: 'monster', type: 'tarantula', path: patrol([-1, 22.6], [1.6, 20.2], 6, 2.5, 0.2) },
    ],
  },
  {
    id: 'volcano-5', name: 'Replika Core', sector: 'volcano', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 1.5, 12],
    hio: 'Roll softly onto the geyser at the cone\'s foot: it lobs you into the crater.',
    parts: [
      { t: 'floor', poly: [[-2, -1], [2, -1], [2, 4.5], [-2, 4.5]], open: [2] },
      { t: 'floor', poly: circlePoly(0, 12, 8, 40), holes: [{ poly: circlePoly(0, 12, 4.45, 32) }], open: [28, 29, 30, 31] },
      // the cone and its crater dish
      { t: 'bowl', c: [0, 12], r0: 1.35, r1: 4.5, y0: 1.7, y1: 0, look: '#3a2a26' },
      { t: 'bowl', c: [0, 12], r0: 0.6, r1: 1.35, y0: 1.5, y1: 1.7, look: '#ff6a1a' },
      { t: 'floor', y: 1.5, poly: circlePoly(0, 12, 0.65, 20), walls: false },
      // four geysers round the foot of the cone throw balls in toward the crater
      ...[[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dz]) => ({ t: 'zone', kind: 'vent', c: [-dx * 5.6, 12 - dz * 5.6], r: 0.7, y: 0, launch: 13, push: [dx, dz], minSpeed: 2.9 })),
      lava(-8, 16.5, -5, 19.5), lava(5, 4.5, 8, 7.5),
    ],
  },
  {
    id: 'volcano-6', name: 'Obsidian Maze', sector: 'volcano', par: 4, time: 150,
    tee: [-4.5, 0, 0], cup: [4.5, 0, 21.5],
    hio: 'The warp pipe hidden in the first dead end comes out just short of the cup.',
    parts: [
      { t: 'floor', poly: rect(-6, -1.2, 6, 24) },
      { t: 'wall', pts: [[-6, 7], [3, 7]], h: 0.6, thick: 0.4 },
      { t: 'wall', pts: [[-3, 14], [6, 14]], h: 0.6, thick: 0.4 },
      { t: 'wall', pts: [[0, 7], [0, 10.5]], h: 0.6, thick: 0.4 },
      lava(-6, 8.6, -4, 13.4), lava(-6, 15, -3.6, 17.6), lava(-2, 2.6, 1, 4.4), lava(3, 22.9, 6, 24),
      { t: 'warp', a: [4.6, 0, 3.4], b: [4.5, 0, 16.2], dir: [0, 1], speed: 4.3 },
      { t: 'monster', type: 'krabe', path: patrol([-2, 10.5], [4, 10.5], 6) },
      { t: 'monster', type: 'kankrelat', path: patrol([-5, 19], [1, 19], 4.5) },
    ],
  },
];
