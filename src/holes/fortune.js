import { rect, patrol, spin, kicker, shuttle } from './helpers.js';

const pit = (x, z, r = 0.5) => ({ c: [x, z], r, fortune: true });

// Fortune Falls board: staggered neon pegs on the slope, a few bumpers, two shuttling paddles.
const boardY = (z) => 1.7 - (z - 16) * (3.7 / 16);
function board() {
  const parts = [];
  const bumpers = new Set(['2:0', '4:-2.4', '4:2.4', '6:0']);
  for (let row = 0; row < 7; row++) {
    const z = 18 + row * 1.8;
    const xs = row % 2 ? [-4, -2.4, -0.8, 0.8, 2.4, 4] : [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8];
    // a faint cross-breeze, alternating row by row, so no ball can balance on top of a peg
    parts.push({ t: 'zone', kind: 'wind', rect: [-6, z - 0.9, 6, z + 0.9], dir: [row % 2 ? 1 : -1, 0], force: 0.7, hidden: true });
    for (const x of xs) {
      if (bumpers.has(`${row}:${x}`)) parts.push({ t: 'bumper', p: [x, boardY(z), z], r: 0.36, power: 1.05, color: '#ff2bd6' });
      else parts.push({ t: 'cyl', p: [x, boardY(z) - 0.2, z], r: 0.19, h: 0.8, look: 'neon' });
    }
  }
  for (const [z, period, phase] of [[22.5, 3.4, 0], [26.1, 4.1, 0.5]]) {
    const y = boardY(z) + 0.22;
    parts.push({ t: 'mover', kind: 'obst', s: [1.8, 0.5, 0.25], path: shuttle([-4, y, z], [4, y, z], period, phase, 0.1), look: 'neon' });
  }
  return parts;
}

// Sector 6 — CYBERPUNK FORTUNE FALLS: neon rooftops, fortune pits (+1…+5), conveyors, teleporters.
export default [
  {
    id: 'fortune-1', name: 'Neon Jackpot', sector: 'fortune', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 20.5],
    fortuneDrops: [[0, 0, 1.5], [3.6, 0, 20.5], [-3.6, 0, 9.2], [0, 0, 18.4], [-3.8, 0, 21.2], [3.5, 0, 1]],
    hio: 'Angle left of the centre pit and let both conveyors bend it back to the cup.',
    parts: [
      {
        t: 'floor', poly: rect(-4.5, -1.2, 4.5, 22.4),
        holes: [pit(-2, 4.5), pit(2, 4.5), pit(0, 7, 0.55), pit(-3.2, 12), pit(-1, 12.4), pit(1.2, 11.8), pit(3.3, 12.3),
          pit(0, 15.6, 0.6), pit(-2.2, 18), pit(2.2, 17.8)],
      },
      { t: 'zone', kind: 'conveyor', rect: [-4.5, 8.6, 3.2, 10.2], dir: [1, 0], speed: 3 }, // stops short of the wall
      { t: 'zone', kind: 'conveyor', rect: [-3.2, 13.3, 4.5, 14.5], dir: [-1, 0], speed: 3 },
      { t: 'monster', type: 'drone', path: patrol([-3.8, 6], [3.8, 6], 5, 0.45) },
      { t: 'monster', type: 'drone', path: patrol([3.8, 19.3], [-3.8, 19.3], 6, 0.45, 0.4) },
    ],
  },
  {
    id: 'fortune-2', name: 'Slot Alley', sector: 'fortune', par: 5, time: 170,
    tee: [0, 0, 0], cup: [11.5, 0, 29],
    fortuneDrops: [[0, 0, 0.5], [10.5, 0, 26.9], [1.5, 0, 15], [6, 0, 27.4], [1.8, 0, 3], [13, 0, 27]],
    hio: 'Over the boost pad, threading every pit, off the corner kicker onto the booster, which fires you down the neon arm.',
    parts: [
      {
        t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 25.5], [14, 25.5], [14, 30.5], [-2.5, 30.5]],
        holes: [pit(-1.2, 6), pit(1.3, 8.5), pit(-0.2, 12.6), pit(-1.4, 17), pit(1.5, 19.5), pit(0.6, 23.4, 0.45),
          pit(5.5, 27.2, 0.45), pit(8.2, 26.9, 0.45), pit(9.6, 26.6, 0.4)],
      },
      kicker([-2.5, 27.6], [0.4, 30.5]),
      { t: 'zone', kind: 'boost', rect: [0.6, 27.8, 2.4, 30.4], dir: [1, 0], speed: 9, align: 2 },
      { t: 'zone', kind: 'boost', rect: [-0.6, 1.8, 0.6, 3.2], dir: [0, 1], speed: 9 },
      { t: 'zone', kind: 'conveyor', rect: [6.6, 26.5, 7.6, 30.5], dir: [0, -1], speed: 2.2 },
      { t: 'teleport', p: [-1.5, 0, 14.2], to: [[10.5, 0, 26.9], [0, 0, 0.5], [1.6, 0, 11]] },
      { t: 'teleport', p: [1.6, 0, 22.6], to: [[6.2, 0, 29.4], [0, 0, 9.6], [1.8, 0, 2]] },
      { t: 'mover', kind: 'obst', s: [1.8, 0.7, 0.2], path: patrol([-1.5, 10.2], [1.5, 10.2], 3, 0.35), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [1.8, 0.7, 0.2], path: patrol([1.5, 21.2], [-1.5, 21.2], 2.6, 0.35, 0.3), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [0.2, 0.7, 1.8], path: patrol([4.2, 26.5], [4.2, 29.5], 2.8, 0.35, 0.5), look: 'holo' },
      { t: 'monster', type: 'drone', path: patrol([9.5, 26.2], [9.5, 29.8], 3.4, 0.45, 0.2) },
    ],
  },
  {
    // A pachinko drop: climb to the deck, fall down a board of pegs, bumpers and paddles,
    // and land in one of seven lanes. Three lanes hold a cup; others hide fortune pits.
    id: 'fortune-3', name: 'Fortune Falls', sector: 'fortune', par: 4, time: 170,
    tee: [0, 0, 0], cup: [0, -2, 37.6],
    cups: [[-3.43, -2, 37.2], [3.43, -2, 37.2]],
    fortuneDrops: [[0, 0, 1], [-4.2, 1.9, 14.2], [4.2, 1.9, 14.2], [-1.71, -2, 38.6], [1.71, -2, 38.6], [0, 0, 4.5]],
    hio: 'Climb to the deck with pace, dodge the spinner and let the board decide — the centre lane is the jackpot.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 6], [2, 6], [-2, 6], [-3, 6]], open: [3] },
      { t: 'mover', kind: 'obst', s: [1.0, 0.5, 0.25], path: patrol([-2.2, 3.6], [2.2, 3.6], 3.6, 0.25), look: 'neon' },
      { t: 'ramp', a: [0, 6], b: [0, 13], w: 4, ya: 0, yb: 2 },
      // the deck at the top of the board, tilted toward it, with a spinner that sends you left or right
      { t: 'ramp', a: [0, 13], b: [0, 16], w: 12, ya: 2, yb: 1.7, mat: 'glass' },
      { t: 'wall', pts: [[-6, 13], [-2, 13]], y: 2 },
      { t: 'wall', pts: [[2, 13], [6, 13]], y: 2 },
      { t: 'mover', kind: 'obst', s: [2.6, 0.5, 0.25], path: spin(0, 2.1, 14.6, 2.4), look: 'neon' },
      // the board
      { t: 'ramp', a: [0, 16], b: [0, 32], w: 12, ya: 1.7, yb: -2, mat: 'glass' },
      ...board(),
      // the landing: seven lanes, then cups and fortune pits
      {
        t: 'floor', y: -2, poly: [[-6, 32], [6, 32], [6, 40.5], [-6, 40.5]], open: [0],
        holes: [pit(-5.14, 37.2), pit(-1.71, 36.4, 0.42), pit(1.71, 37.4), pit(5.14, 37.2)],
      },
      ...[1, 2, 3, 4, 5, 6].map((k) => ({ t: 'wall', pts: [[-6 + k * 12 / 7, 32.2], [-6 + k * 12 / 7, 35]], y: -2, h: 0.45 })),
    ],
  },
];
