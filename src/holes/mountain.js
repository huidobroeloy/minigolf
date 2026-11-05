import { rect, patrol, elevator } from './helpers.js';

const rock = (x, z, r = 0.6, h = 1.6, y = 0) => ({ t: 'cyl', p: [x, y, z], r, h, look: 'rock' });

/** A boulder that rolls down a ramp (z0→z1, height y0→y1), across the floor, then sinks and respawns. */
function avalanche(x, z0, z1, y0, y1, zEnd, period, phase, r = 0.6) {
  return (t) => {
    const u = (((t / period) + phase) % 1 + 1) % 1;
    if (u < 0.55) {
      const k = u / 0.55;
      const z = z0 + (z1 - z0) * k * k;
      const y = y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
      return { x, y: y + r, z, ry: 0, roll: z / r };
    }
    if (u < 0.7) {
      const k = (u - 0.55) / 0.15;
      const z = z1 + (zEnd - z1) * (1 - (1 - k) * (1 - k));
      return { x, y: y1 + r, z, ry: 0, roll: z / r };
    }
    // sink and wait out of sight
    const k = Math.min(1, (u - 0.7) / 0.05);
    return { x, y: y1 + r - k * 4, z: zEnd, ry: 0, roll: 0, hidden: k >= 1 };
  };
}

// Sector 4 — MOUNTAIN: crumbling plateaus, avalanches and updraft vents. Tarantulas guard the ledges.
// The openings (docs/lore.md): in the show the Mountain is mist, long bridges between plateaus, narrow passages
// between rocks where Megatanks block the way, floating mountains you reach only by teleport, platforms that
// rise and fall to reach a tower, and a maze (ep 15).

// mountain-1: a floating mountain. Ride the teleport up onto it and drop off its edge onto the landing, or
// take the narrow ledge round the side where a Megatank rolls.
const OPEN1 = {
  par: 1, time: 30,
  tee: [0, 0, -16.5], route: [[0, -16.5], [-2.4, -14.2], [-2.4, -9.6], [0, -4], [0, -1.2]],
  parts: [
    { t: 'floor', poly: [[-4, -18.5], [4, -18.5], [4, -13], [3.8, -13], [2.2, -13], [-4, -13]], open: [3] },
    { t: 'teleport', p: [-2.4, 0, -14.6], r: 0.55, to: [[-2.6, 3.2, -10.2]] },
    rock(-0.6, -14.2, 0.5, 1.4),
    // the floating mountain: walled but for its front, where you drop off onto the landing
    { t: 'floor', y: 3, poly: rect(-4, -11.5, -1, -8), open: [2] },
    rock(-3.4, -10.9, 0.4, 1.2, 3),
    // the ledge: narrow, no walls, a Megatank rolling up and down it
    { t: 'floor', poly: rect(2.2, -13.2, 3.8, -6.8), walls: false },
    { t: 'monster', type: 'megatank', path: patrol([3, -12.2], [3, -7.8], 6) },
    { t: 'floor', poly: [[-4, -7], [2.2, -7], [3.8, -7], [4, -7], [4, -1.0], [2, -1.0], [-2, -1.0], [-4, -1.0]], open: [0, 1, 5] },
    { t: 'monster', type: 'hornet', path: patrol([-3, -5], [3, -5], 6, 2.4), aim: 'ball' },
  ],
};

// mountain-2: platforms that rise and fall to reach the tower (ep 20). Ride the first lift up to the ledge, or
// climb the narrow passage between the rocks; the second lift takes you up to the tower's plateau.
const OPEN2 = {
  par: 1, time: 30,
  tee: [0, 0, -17.5], route: [[0, -17.5], [-1.6, -14], [-1.6, -10], [1.6, -8.5], [1.6, -4], [0, -1.2]],
  parts: [
    { t: 'floor', poly: [[-4.5, -19.5], [4.5, -19.5], [4.5, -14], [4.3, -14], [2.9, -14], [-0.4, -14], [-2.8, -14], [-4.5, -14]], open: [3, 5] },
    // lift one: from the ground up to the ledge
    { t: 'mover', s: [2.4, 0.4, 2.5], path: elevator(-1.6, -12.75, -0.2, 1.3, 7), sideLook: 'rock' },
    // the passage: narrow, between the rocks, up to the same ledge
    { t: 'ramp', a: [3.6, -17], b: [3.6, -11.5], w: 1.4, ya: 0, yb: 1.5 },
    rock(4.9, -13.4, 0.45, 1.8, 0.6), rock(2.3, -15.2, 0.4, 1.4),
    { t: 'floor', y: 1.5, poly: [[-3, -11.5], [-2.8, -11.5], [-0.4, -11.5], [2.9, -11.5], [4.3, -11.5], [4.3, -8.5], [2.8, -8.5], [0.4, -8.5], [-3, -8.5]], open: [1, 3, 6] },
    { t: 'monster', type: 'kankrelat', path: patrol([-2.4, -10], [3.6, -10], 5, 1.5) },
    // lift two: from the ledge up to the tower's plateau, out of step with the first
    { t: 'mover', s: [2.4, 0.4, 2.5], path: elevator(1.6, -7.25, 1.3, 2.8, 7, 0.5), sideLook: 'rock' },
    { t: 'floor', y: 3, poly: [[-2.5, -6], [0.4, -6], [2.8, -6], [2.8, -1.0], [2.5, -1.0], [-2.5, -1.0]], open: [1, 4] },
    { t: 'monster', type: 'blok', path: patrol([-2, -3.4], [2, -3.4], 5, 3) },
  ],
};

// mountain-5: the maze (ep 15). Bank your way through its turns; dead ends wait for the careless.
const wall = (a, b) => ({ t: 'wall', pts: [a, b], h: 0.6, thick: 0.3 });
const OPEN5 = {
  par: 1, time: 40,
  tee: [0, 0, -15.5], route: [[0, -15.5], [4, -15], [4, -11], [-4, -11], [-4, -7], [3.4, -7], [3.4, -3], [0, -1.2]],
  parts: [
    { t: 'floor', poly: rect(-5, -17, 5, -1.0), open: [2] },
    wall([-5, -13], [3, -13]), wall([-3, -9], [5, -9]), wall([-5, -5], [1.6, -5]),
    // dead ends: pockets off the main way
    wall([-1, -13], [-1, -10.6]), wall([1.6, -9], [1.6, -6.6]), wall([-2.6, -5], [-2.6, -2.8]),
    rock(-3.6, -15.2, 0.5, 1.6), rock(2.6, -11, 0.4, 1.3), rock(-3.8, -3.6, 0.45, 1.4),
    { t: 'monster', type: 'blok', path: patrol([-4.2, -11], [-1.6, -11], 4.4) },
    { t: 'monster', type: 'kankrelat', path: patrol([3.6, -7.4], [3.6, -5.4], 3) },
  ],
};

export default [
  {
    id: 'mountain-1', opening: OPEN1, name: 'Crumbling Ledge', sector: 'mountain', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 25.5],
    hio: 'Fast and dead straight over all eight crumbling tiles — they fall a moment after you touch them.',
    parts: [
      { t: 'floor', poly: [[-2, -1.2], [2, -1.2], [2, 2], [2, 3.2], [2, 4], [1, 4], [-1, 4], [-2, 4]], open: [2, 5] },
      ...[5, 7, 9, 11, 13, 15, 17, 19].map((z) => ({ t: 'crumble', p: [0, 0, z], s: [2, 2] })),
      // the long, windy switchback ledge
      { t: 'floor', poly: rect(2, 2, 6.2, 3.2), walls: false },
      { t: 'floor', poly: rect(5, 3.2, 6.2, 12), walls: false },
      { t: 'floor', poly: rect(6.2, 10.8, 9, 12), walls: false },
      { t: 'floor', poly: rect(7.8, 12, 9, 20), walls: false },
      { t: 'floor', poly: rect(5, 18.8, 7.8, 20), walls: false },
      { t: 'zone', kind: 'wind', rect: [5, 3.2, 6.2, 10.8], dir: [1, 0], force: 1.1 },
      { t: 'zone', kind: 'wind', rect: [7.8, 12, 9, 18.8], dir: [-1, 0], force: 1.1 },
      { t: 'floor', poly: [[-3, 20], [-1, 20], [1, 20], [5, 20], [6.2, 20], [6.2, 28], [-3, 28]], open: [1, 3] },
      rock(-2.2, 23.5, 0.55), rock(3.4, 26.2, 0.5, 1.3), rock(4.2, 22.0, 0.45, 1.1),
      { t: 'monster', type: 'tarantula', path: patrol([-2.2, 22.6], [3.6, 22.6], 6) },
      { t: 'monster', type: 'tarantula', path: patrol([8.4, 13], [8.4, 18], 5, 0, 0.5) },
    ],
  },
  {
    id: 'mountain-2', opening: OPEN2, name: 'Avalanche Alley', sector: 'mountain', par: 3, time: 120,
    tee: [0, 3, 0], cup: [1.5, 0, 21.5],
    hio: 'Gentle tap down the slope between boulders, drifting right toward the cup.',
    parts: [
      { t: 'floor', y: 3, poly: rect(-2.5, -1.2, 2.5, 4), open: [2] },
      { t: 'ramp', a: [0, 4], b: [0, 16], w: 5, ya: 3, yb: 0 },
      { t: 'floor', poly: [[-4, 16], [-2.5, 16], [2.5, 16], [4, 16], [4, 25], [-4, 25]], open: [1], holes: [{ c: [1.6, 23.2], r: 0.55 }, { c: [3.0, 21.2], r: 0.45 }, { c: [-0.1, 22.4], r: 0.45 }] }, // miss the cup and you're in a crevasse
      rock(-2.6, 20.5, 0.6), rock(3.0, 18.4, 0.5, 1.2), rock(-0.6, 23.4, 0.45, 1.1), rock(1.3, 19.3, 0.42, 1.0),
      { t: 'zone', kind: 'slow', rect: [-4, 23.8, 4, 25], mul: 3 },
      { t: 'monster', type: 'boulder', path: avalanche(-1.4, 4.4, 16, 3, 0, 19.5, 5.5, 0.0) },
      { t: 'monster', type: 'boulder', path: avalanche(1.3, 4.4, 16, 3, 0, 18.5, 5.5, 0.5) },
      { t: 'monster', type: 'boulder', path: avalanche(0.0, 4.4, 16, 3, 0, 20.5, 7.3, 0.25, 0.7), size: 0.7 },
    ],
  },
  {
    id: 'mountain-3', opening: false, name: 'Updraft Peaks', sector: 'mountain', par: 4, time: 150,
    tee: [0, 0, 0], cup: [-1.4, 5, 19.5],
    hio: 'Ride vent one slightly left so you land in line with vent two, then roll to the cup.',
    parts: [
      { t: 'floor', poly: rect(-2.5, -1.2, 2.5, 7) },
      { t: 'zone', kind: 'vent', c: [0, 5.6], r: 0.9, y: 0, height: 3.2, launch: 10.5, push: [0, 1], minSpeed: 3 },
      rock(-1.6, 3.2, 0.45, 1.2), rock(1.7, 4.0, 0.4, 1.0),
      { t: 'floor', y: 2.5, poly: rect(-3, 7.2, 3, 15), open: [0], holes: [{ poly: rect(0.4, 10.4, 2.6, 12.6) }] },
      { t: 'zone', kind: 'vent', c: [-1.0, 13.8], r: 0.7, y: 2.5, height: 3.2, launch: 10.5, push: [0, 1], minSpeed: 3 },
      { t: 'crumble', p: [1.5, 2.5, 11.5], s: [2.2, 2.2] },
      { t: 'monster', type: 'tarantula', path: patrol([2.3, 10.5], [-2.3, 10.5], 5, 2.5) },
      { t: 'floor', y: 5, poly: rect(-3, 15.4, 3, 22), open: [0] },
      rock(1.6, 18.0, 0.5, 1.2, 5),
      { t: 'monster', type: 'tarantula', path: patrol([2.2, 20.8], [-0.2, 20.8], 4, 5, 0.5) },
    ],
  },
  {
    id: 'mountain-4', opening: false, name: 'Ridge Bridges', sector: 'mountain', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 26],
    hio: 'Firm and straight along the narrow centre bridge, against the gusts.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 5], [-3, 5]], open: [2] },
      // three narrow bridges over the abyss; the outer two are wider but windier
      { t: 'floor', poly: rect(-0.6, 5, 0.6, 20), walls: false },
      { t: 'floor', poly: rect(-3, 5, -1.8, 20), walls: false },
      { t: 'floor', poly: rect(1.8, 5, 3, 20), walls: false },
      ...[9, 13, 17].map((z) => ({ t: 'floor', poly: rect(-1.8, z - 0.5, 1.8, z + 0.5), walls: false })),
      { t: 'zone', kind: 'wind', rect: [-3, 7, 3, 11], dir: [1, 0], force: 1.4 },
      { t: 'zone', kind: 'wind', rect: [-3, 15, 3, 19], dir: [-1, 0], force: 1.4 },
      { t: 'floor', poly: [[-4, 20], [4, 20], [4, 29], [-4, 29]], open: [0], holes: [{ c: [0, 27.4], r: 0.5 }, { c: [-1.6, 26.4], r: 0.4 }, { c: [1.7, 25.6], r: 0.4 }] },
      rock(-2.4, 23, 0.5), rock(2.6, 24.5, 0.45, 1.1),
      { t: 'monster', type: 'tarantula', path: patrol([-3, 27.6], [3, 27.6], 6) },
    ],
  },
  {
    id: 'mountain-5', opening: OPEN5, name: 'Boulder Climb', sector: 'mountain', par: 4, time: 150,
    tee: [0, 0, 0], cup: [1.6, 2, 24],
    hio: 'Hard up the slope between the boulders, then the summit funnel does the rest.',
    parts: [
      { t: 'floor', poly: rect(-3, -1.2, 3, 4), open: [2] },
      { t: 'ramp', a: [0, 4], b: [0, 17], w: 6, ya: 0, yb: 2 },
      { t: 'floor', y: 2, poly: [[-4, 17], [-3, 17], [3, 17], [4, 17], [4, 27], [-4, 27]], open: [1] },
      { t: 'monster', type: 'boulder', path: avalanche(-1.4, 16.6, 4.4, 2, 0, 2, 7, 0) },
      { t: 'monster', type: 'boulder', path: avalanche(1.5, 16.6, 4.4, 2, 0, 2, 7, 0.5) },
      rock(-2.2, 22, 0.5, 1.4, 2), rock(3, 20.5, 0.45, 1.2, 2),
      { t: 'zone', kind: 'slow', rect: [-4, 25.8, 4, 27], y: 2, mul: 3 },
      { t: 'monster', type: 'tarantula', path: patrol([-3.2, 25.8], [0, 25.8], 4, 2) },
    ],
  },
  {
    id: 'mountain-6', opening: false, name: 'The Summit', sector: 'mountain', par: 5, time: 170,
    tee: [-3, 0, 0], cup: [3, 3, 27.5],
    hio: 'The hidden updraft behind the first rock throws you all the way up to the summit.',
    parts: [
      { t: 'floor', poly: [[-6, -1.2], [6, -1.2], [6, 6], [3, 6], [-6, 6]], open: [2] },
      { t: 'ramp', a: [4.5, 6], b: [4.5, 12], w: 3, ya: 0, yb: 1.5 },
      { t: 'floor', y: 1.5, poly: [[-6, 12], [3, 12], [6, 12], [6, 18], [-3, 18], [-6, 18]], open: [1, 4] },
      ...[13, 14.6, 16.2].map((z) => ({ t: 'crumble', p: [-1.5, 1.5, z], s: [1.6, 1.6] })),
      { t: 'ramp', a: [-4.5, 18], b: [-4.5, 24], w: 3, ya: 1.5, yb: 3 },
      { t: 'floor', y: 3, poly: [[-6, 24], [-3, 24], [6, 24], [6, 31], [-6, 31]], open: [0] },
      rock(-1.6, 1.8, 0.55, 1.6),
      { t: 'zone', kind: 'vent', c: [-1.6, 4.2], r: 0.6, y: 0, launch: 15.5, push: [0.4, 1], minSpeed: 5, hidden: false },
      rock(1, 28.8, 0.45, 1.1, 3),
      { t: 'monster', type: 'tarantula', path: patrol([-4, 15], [2, 15], 7, 1.5) },
      // a Guardian drifts across the foot of the climb (ep 10)
      { t: 'monster', type: 'guardian', path: patrol([0.6, 3.6], [5.2, 3.6], 7) },
      { t: 'monster', type: 'boulder', path: avalanche(-4.5, 23.6, 18.4, 3, 1.5, 17, 5, 0) },
    ],
  },
];
