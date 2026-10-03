import { rect, patrol, spin, kicker, shuttle, orbit, circlePoly } from './helpers.js';

// Sector 6 — FORTUNE FALLS CASINO: cyberpunk gambling machines. Every hole has several cups,
// each labelled with a stroke modifier (green = fewer strokes, red = more). Every cup finishes
// the hole, but which one you fall into is up to the machine. Fortune pits midway roll a
// random penalty and drop you somewhere else.

const pit = (x, z, r = 0.5) => ({ c: [x, z], r, fortune: true });

// Pachinko board: staggered neon pegs on the slope, a few bumpers, two shuttling paddles.
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

/** Evenly spaced lanes across [x0, x1]: divider walls plus the lane centres. */
function lanes(x0, x1, n, z0, z1, y = 0) {
  const w = (x1 - x0) / n;
  const walls = [];
  for (let k = 1; k < n; k++) walls.push({ t: 'wall', pts: [[x0 + k * w, z0], [x0 + k * w, z1]], y, h: 0.45 });
  const centres = Array.from({ length: n }, (_, k) => x0 + (k + 0.5) * w);
  return { walls, centres };
}

/** A straight lane floor from a to b ([x,z]), w wide; edge 0 is the start, edge 2 the end. */
function lanePoly(a, b, w) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, px = -uz * w / 2, pz = ux * w / 2;
  return [[a[0] + px, a[1] + pz], [a[0] - px, a[1] - pz], [b[0] - px, b[1] - pz], [b[0] + px, b[1] + pz]];
}

// Pachinko landing: a slick, gently sloping tray; each lane ends in a V funnel round its cup
const PACH_Y = (z) => -2 - (z - 32) * (0.5 / 7.2);
const pachinkoLanes = lanes(-6, 6, 9, 32.2, 39.2, -2.6);
const PACH_CUP_Z = 38.55;
function funnels() {
  const w = 12 / 9, out = [];
  for (const x of pachinkoLanes.centres) {
    out.push({ t: 'wall', pts: [[x - w / 2 + 0.12, 37.2], [x - 0.36, 38.95]], y: -2.6, h: 0.75, thick: 0.12 });
    out.push({ t: 'wall', pts: [[x + w / 2 - 0.12, 37.2], [x + 0.36, 38.95]], y: -2.6, h: 0.75, thick: 0.12 });
  }
  return out;
}
const PACHINKO_MODS = [3, 1, 2, 0, -2, 0, 2, 1, 3];
const SLOT_Y = (z) => -(z - 24) * (0.4 / 6);
const slotBins = lanes(-6, 6, 7, 25.5, 30, -0.5);
const SLOT_CUP_Z = 29.35;
function slotFunnels() {
  const w = 12 / 7, out = [];
  for (const x of slotBins.centres) {
    out.push({ t: 'wall', pts: [[x - w / 2 + 0.12, 28.0], [x - 0.36, 29.75]], y: -0.5, h: 0.75, thick: 0.12 });
    out.push({ t: 'wall', pts: [[x + w / 2 - 0.12, 28.0], [x + 0.36, 29.75]], y: -0.5, h: 0.75, thick: 0.12 });
  }
  return out;
}
const SLOT_MODS = [2, 0, 1, -2, 1, 0, 2];
const ROULETTE_MODS = [-2, 2, 0, 3, 1, 2, 0, 4];
const roulettePockets = ROULETTE_MODS.map((mod, i) => { const a = ((i + 0.5) / 8) * Math.PI * 2; return [Math.cos(a) * 1.85, 0, 14 + Math.sin(a) * 1.85, mod]; });
// frets between the pockets stop a ball sliding round the trough, like a real wheel
const rouletteFrets = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { t: 'cyl', p: [Math.cos(a) * 1.85, 0, 14 + Math.sin(a) * 1.85], r: 0.11, h: 0.32, look: 'gold' }; });
const RIM = 6.62;
// the entry lane runs along the inside of the rim (its outer edge on the rim), so the rim wall
// only opens where the lane crosses it (around 240°–268°)
const rimArc = []; for (let a = 268; a <= 600; a += 8) rimArc.push([Math.cos(a * Math.PI / 180) * RIM, 14 + Math.sin(a * Math.PI / 180) * RIM]);
const GAP = [Math.cos(225 * Math.PI / 180) * 5.8, 14 + Math.sin(225 * Math.PI / 180) * 5.8]; // where the lane ends, inside the bowl
const LANE_START = [GAP[0] + 0.7071 * 9.5, GAP[1] - 0.7071 * 9.5]; // the lane runs in along the rim's tangent
const pinY = (z) => (z - 4) * (3.5 / 20); // the pinball table's height along its slope

export default [
  {
    // a pachinko drop: climb to the deck, fall down a board of pegs, bumpers and paddles,
    // and land in one of nine lanes, each ending in its own cup
    id: 'fortune-pachinko', name: 'Pachinko Falls', sector: 'fortune', par: 3, time: 150,
    tee: [0, 0, 0], cup: [pachinkoLanes.centres[4], PACH_Y(PACH_CUP_Z), PACH_CUP_Z], cupMod: PACHINKO_MODS[4],
    cups: pachinkoLanes.centres.map((x, k) => [x, PACH_Y(PACH_CUP_Z), PACH_CUP_Z, PACHINKO_MODS[k]]).filter((_, k) => k !== 4),
    fortuneDrops: [[0, 0, 1], [-4.2, 1.9, 14.2], [4.2, 1.9, 14.2]],
    hio: 'Any lane finishes the hole. The centre lane is the −2 jackpot.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 6], [2, 6], [-2, 6], [-3, 6]], open: [3] },
      { t: 'mover', kind: 'obst', s: [1.0, 0.5, 0.25], path: patrol([-2.2, 3.6], [2.2, 3.6], 3.6, 0.25), look: 'neon' },
      { t: 'ramp', a: [0, 6], b: [0, 13], w: 4, ya: 0, yb: 2 },
      { t: 'ramp', a: [0, 13], b: [0, 16], w: 12, ya: 2, yb: 1.7, mat: 'glass' },
      { t: 'wall', pts: [[-6, 13], [-2, 13]], y: 2 },
      { t: 'wall', pts: [[2, 13], [6, 13]], y: 2 },
      { t: 'mover', kind: 'obst', s: [2.6, 0.5, 0.25], path: spin(0, 2.1, 14.6, 2.4), look: 'neon' },
      { t: 'ramp', a: [0, 16], b: [0, 32], w: 12, ya: 1.7, yb: -2, mat: 'glass' },
      ...board(),
      { t: 'ramp', a: [0, 32], b: [0, 39.2], w: 12, ya: -2, yb: -2.5, mat: 'glass' },
      { t: 'wall', pts: [[-6, 39.2], [6, 39.2]], y: -2.6, h: 0.8 },
      ...pachinkoLanes.walls.map((w) => ({ ...w, h: 0.75 })),
      ...funnels(),
    ],
  },
  {
    // a roulette wheel: roll in along the rim, spiral down the bowl, the spinner swats you
    // into one of eight pockets
    id: 'fortune-roulette', name: 'Roulette', sector: 'fortune', par: 3, time: 120,
    tee: [LANE_START[0] - 0.7071 * 0.8, 1.4, LANE_START[1] + 0.7071 * 0.8], cup: roulettePockets[0].slice(0, 3), cupMod: ROULETTE_MODS[0],
    cups: roulettePockets.slice(1),
    yaw: -Math.PI / 4,
    fortuneDrops: [[LANE_START[0] - 1.5, 1.4, LANE_START[1] + 1.5]],
    hio: 'Enter the wheel with pace: the rim swings you round, the spinner picks your pocket. Green −2 is the jackpot.',
    parts: [
      { t: 'floor', y: 1.4, poly: lanePoly(LANE_START, GAP, 1.4), open: [2] },
      // the wheel: the big bowl slopes down to the pocket ring, a small cone slopes down to it
      // from the hub, so every ball ends up in the trough of pockets
      { t: 'bowl', c: [0, 14], r0: 2.2, r1: 6.5, y0: 0, y1: 1.4 },
      { t: 'bowl', c: [0, 14], r0: 0.9, r1: 1.5, y0: 0.32, y1: 0 },
      { t: 'floor', poly: circlePoly(0, 14, 2.25, 40), holes: [{ poly: circlePoly(0, 14, 1.45, 32) }], walls: false, mat: 'felt' },
      { t: 'floor', y: 0.32, poly: circlePoly(0, 14, 0.95, 24), walls: false },
      ...rouletteFrets,
      { t: 'wall', pts: rimArc, y: 1.4, h: 0.45 },
      { t: 'mover', kind: 'obst', s: [2.4, 0.3, 0.16], path: spin(0, 0.5, 14, 1.6), look: 'gold' },
      { t: 'mover', kind: 'obst', s: [2.4, 0.3, 0.16], path: spin(0, 0.5, 14, 1.6, 0.25), look: 'gold' },
      { t: 'cyl', p: [0, 0.32, 14], r: 0.3, h: 0.7, look: 'gold' },
    ],
  },
  {
    // a slot machine: pull the lever (boost), the coin splits into three spinning reels,
    // then drops into the payout tray's seven bins
    id: 'fortune-slots', name: 'Slot Machine', sector: 'fortune', par: 4, time: 150,
    tee: [0, 0, 0.5], cup: [slotBins.centres[3], SLOT_Y(SLOT_CUP_Z), SLOT_CUP_Z], cupMod: SLOT_MODS[3],
    cups: slotBins.centres.map((x, k) => [x, SLOT_Y(SLOT_CUP_Z), SLOT_CUP_Z, SLOT_MODS[k]]).filter((_, k) => k !== 3),
    fortuneDrops: [[0, 0, 1], [-4, 0, 10], [4, 0, 10], [0, 0, 23]],
    hio: 'Pull the lever, split at the coin slot, spin through a reel and pray for the middle bin.',
    parts: [
      { t: 'floor', poly: [[-2, -1], [2, -1], [2, 8], [-2, 8]], open: [2] },
      { t: 'zone', kind: 'boost', rect: [-0.6, 3.5, 0.6, 6.5], dir: [0, 1], speed: 11, align: 2 },
      {
        t: 'floor', poly: [[-6, 8], [-2, 8], [2, 8], [6, 8], [6, 24], [-6, 24]], open: [1, 4],
        holes: [pit(-4, 22), pit(4, 22), pit(0, 21.6, 0.45)],
      },
      { t: 'bumper', p: [0, 0, 10.4], r: 0.5, power: 1.2, color: '#ffe600' },
      { t: 'wall', pts: [[-2, 12], [-2, 20]], h: 0.45 },
      { t: 'wall', pts: [[2, 12], [2, 20]], h: 0.45 },
      // the three reels: spinning crosses with different speeds
      ...[[-4, 2.2], [0, 1.7], [4, 2.9]].flatMap(([x, per]) => [
        { t: 'mover', kind: 'obst', s: [3.0, 0.4, 0.2], path: spin(x, 0.2, 16, per), look: 'neon' },
        { t: 'mover', kind: 'obst', s: [3.0, 0.4, 0.2], path: spin(x, 0.2, 16, per, 0.25), look: 'neon' },
      ]),
      // the payout tray tips toward the back: every coin rolls into a bin
      { t: 'ramp', a: [0, 24], b: [0, 30], w: 12, ya: 0, yb: -0.4, mat: 'glass' },
      { t: 'wall', pts: [[-6, 30], [6, 30]], y: -0.5, h: 0.8 },
      ...slotBins.walls.map((w) => ({ ...w, h: 0.75 })),
      ...slotFunnels(),
    ],
  },
  {
    // neon pinball: plunge up the right lane, the top deflector throws you left, bumpers do
    // the rest; the apron has four cups and the centre drain is a fortune pit. A sneaky −2
    // jackpot sits up on the top deck.
    id: 'fortune-pinball', name: 'Neon Pinball', sector: 'fortune', par: 4, time: 150,
    tee: [4.6, 0, 0], cup: [-3.6, 3.5 + (25.9 - 24) / 3.5 * 0.5, 25.9], cupMod: -2, yaw: 0,
    cups: [[-4.2, 0, 2.4, 3], [-2.3, 0, 1.4, -1], [1.6, 0, 1.4, 0], [3.2, 0, 2.4, 2]],
    fortuneDrops: [[4.6, 0, 0], [-2, 0, 2.6], [2, 0, 2.6]],
    hio: 'Plunge hard, ride the deflector left along the top deck and stop right in the jackpot cup.',
    parts: [
      { t: 'floor', poly: [[-5, -1], [4, -1], [4, 4], [-5, 4]], open: [2], holes: [pit(-0.4, 2.2, 0.55)] },
      { t: 'floor', poly: [[4.05, -1], [5.15, -1], [5.15, 1], [4.05, 1]], open: [2] },
      // the plunger: whatever you hit it with, it fires the ball up the lane
      { t: 'zone', kind: 'boost', rect: [4.05, 0.2, 5.15, 6.5], dir: [0, 1], speed: 16, align: 3 },
      { t: 'ramp', a: [4.6, 1], b: [4.6, 24], w: 1.1, ya: 0, yb: 3.5, mat: 'glass' },
      { t: 'ramp', a: [-0.5, 4], b: [-0.5, 24], w: 9, ya: 0, yb: 3.5 },
      // the top deck tilts back toward the table, so balls always come back down
      { t: 'ramp', a: [0.075, 27.5], b: [0.075, 24], w: 10.15, ya: 4.0, yb: 3.5 },
      { t: 'wall', pts: [[-5.1, 27.5], [5.2, 27.5]], y: 3.9, h: 0.6 },
      kicker([3.0, 27.5], [5.15, 25.0], 3.5, 1.0),
      // pop bumpers and slingshots
      ...[[-2.5, 14, '#ff2bd6'], [1, 15.5, '#18f0ff'], [-0.5, 18.5, '#ffe600'], [2.5, 19.2, '#ff2bd6'], [-3.2, 20.2, '#18f0ff'], [-3.8, 7.5, '#ffe600'], [2.8, 7.5, '#ffe600']]
        .map(([x, z, color]) => ({ t: 'bumper', p: [x, pinY(z), z], r: 0.45, power: 1.35, color })),
      { t: 'mover', kind: 'obst', s: [2.4, 0.3, 0.2], path: spin(-0.5, pinY(11) + 0.2, 11, 1.4), look: 'neon' },
    ],
  },
  {
    // the dice table: green felt, three huge tumbling dice and a craps layout of cups
    id: 'fortune-dice', name: 'Dice Table', sector: 'fortune', par: 4, time: 150,
    tee: [0, 0, 0.5], cup: [0, 0, 25.2], cupMod: -2,
    cups: [[-3, 0, 22.5, 1], [3, 0, 22.5, 0], [-3, 0, 25.2, 2], [3, 0, 25.2, -1], [-3, 0, 27.9, 3], [3, 0, 27.9, 1]],
    fortuneDrops: [[0, 0, 1], [-4, 0, 6], [4, 0, 6], [0, 0, 19]],
    hio: 'Thread the dice, dodge the pits and roll dead centre into the double-six.',
    parts: [
      { t: 'floor', poly: rect(-6, -1, 6, 30), mat: 'felt', holes: [pit(-4, 15.5), pit(4, 15.5), pit(0, 10.6, 0.45)] },
      { t: 'mover', kind: 'obst', s: [1.1, 1.1, 1.1], path: patrol([-4.5, 8], [4.5, 8], 4.0, 0.55), look: 'dice' },
      { t: 'mover', kind: 'obst', s: [1.1, 1.1, 1.1], path: patrol([4.5, 13], [-4.5, 13], 3.2, 0.55, 0.3), look: 'dice' },
      { t: 'mover', kind: 'obst', s: [1.1, 1.1, 1.1], path: orbit([0, 18.8], 2.8, 5, 0.55, 0), look: 'dice' },
      { t: 'bumper', p: [-3, 0, 11], r: 0.4, power: 1.2, color: '#ffe600' },
      { t: 'bumper', p: [3, 0, 11], r: 0.4, power: 1.2, color: '#ffe600' },
      { t: 'cyl', p: [-1.5, 0, 24], r: 0.18, h: 0.5, look: 'chip' },
      { t: 'cyl', p: [1.5, 0, 26.6], r: 0.18, h: 0.5, look: 'chip' },
    ],
  },
  {
    // neon rooftops: every rooftop has its own cup. The first is safe and costly, the last
    // is the jackpot, and between them are jumps over the Digital Sea
    id: 'fortune-rooftops', name: 'Cyberpunk Rooftops', sector: 'fortune', par: 5, time: 170,
    tee: [0, 0, 0], cup: [0, -1.2, 35.5], cupMod: -2,
    cups: [[2.2, 0, 7.5, 2], [-3.6, -0.6, 23.5, 0], [3.6, -0.6, 17.2, 1], [-2.4, -1.2, 36.8, 1]],
    fortuneDrops: [[0, 0, 1], [0, -0.6, 16.5], [-3, -0.6, 21], [0, -1.2, 32]],
    hio: 'Two clean jumps over the Digital Sea onto the last roof, straight into the jackpot.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 10], [1, 10], [-1, 10], [-3, 10]], open: [3] },
      { t: 'ramp', a: [0, 10], b: [0, 12], w: 2, ya: 0, yb: 0.7, jump: true },
      {
        t: 'floor', y: -0.6, poly: [[-4.5, 15], [4.5, 15], [4.5, 25], [1, 25], [-1, 25], [-4.5, 25]], open: [0, 3], // open where you land
        holes: [pit(0, 19.5, 0.55)],
      },
      { t: 'mover', kind: 'obst', s: [3.4, 0.4, 0.25], path: spin(0, -0.4, 22.2, 3), look: 'holo' },
      { t: 'ramp', a: [0, 25], b: [0, 27], w: 2, ya: -0.6, yb: 0.1, jump: true },
      { t: 'floor', y: -1.2, poly: rect(-3.5, 30.5, 3.5, 38), open: [0] },
    ],
  },
];
