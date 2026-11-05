import { rect, patrol, orbit, shuttle } from './helpers.js';
import { corridorPoly } from './extend.js';

// Sector 3 — ICE: almost no friction. Snow patches are your brakes. Krabes stomp across.
// The openings (docs/lore.md): in the show the Ice sector is night, slippery plateaus and long frozen paths,
// icebergs with tunnels that are long slides ending on a cliff, lakes at path height where monsters sink,
// towers hidden in caves behind waterfalls guarded by Tarantulas, and Hornet squadrons over the plateaus.

const snow = (x, z, r = 0.9, y = 0) => ({ t: 'zone', kind: 'slow', c: [x, z], r, y, mul: 8 });
const pillar = (x, z, r = 0.45, y = 0) => ({ t: 'cyl', p: [x, y, z], r, h: 1.6, look: 'ice' });

// ice-1: the iceberg tunnel. Slide down the tunnel through the berg (its mouth is guarded), or down the
// open ice ramp beside it, no walls and nothing to slow you.
const OPEN1 = {
  par: 1, time: 30,
  tee: [0, 4, -14.5], route: [[0, -14.5], [0, -10.6], [0, -2.6], [0, -1.2]],
  parts: [
    { t: 'floor', y: 4, poly: [[-4, -16.5], [4, -16.5], [4, -10], [3.8, -10], [2.2, -10], [0.6, -10], [-0.6, -10], [-4, -10]], open: [3, 5] },
    { t: 'monster', type: 'blok', path: patrol([-2.6, -11.6], [2.0, -11.6], 5, 4) },
    // the tunnel turns at the bottom and spits you sideways into the snowbank, never down the slope
    { t: 'tube', pts: [[0, 4, -10.6], [0, 3.4, -8.6], [-1.0, 3.0, -6.6], [-1.3, 2.4, -5.0], [0.4, 1.5, -3.8]], r: 0.5, color: '#cfefff', ring: '#ffffff' },
    { t: 'ramp', a: [3, -10], b: [3, -4.6], w: 1.6, ya: 4, yb: 1.5, walls: false },
    // the landing below the berg: a snowbank to stop you
    { t: 'floor', y: 1.5, poly: [[-2.6, -4.8], [-2.0, -4.8], [0, -4.8], [2.2, -4.8], [3.8, -4.8], [3.8, -1.0], [2, -1.0], [-2, -1.0], [-2.6, -1.0]], open: [1, 3, 6] },
    { t: 'zone', kind: 'slow', rect: [-2.6, -3.4, 3.8, -1.6], y: 1.5, mul: 9 }, // clear of the tunnel above it
    { t: 'zone', kind: 'slow', rect: [1.2, -4.8, 3.8, -3.4], y: 1.5, mul: 9 },
    { t: 'monster', type: 'hornet', path: patrol([-2, -3.6], [3, -3.6], 5, 3.8), aim: 'ball' },
  ],
};

// ice-3: the lake. Ride an ice floe across (wait for it to dock), or take the long snowy path round.
const lakeWay = corridorPoly([[3.2, -12.2], [5.4, -10.2], [5.4, -7.0], [3.2, -4.8]], 1.6);
const floe = (x, phase) => ({ t: 'mover', kind: 'floor', s: [2.2, 0.3, 2.2], path: shuttle([x, -0.15, -10.9], [x, -0.15, -6.1], 8, phase, 0.35), mat: 'sand', sideLook: 'ice', safeRim: true }); // snow-crusted: you stop on it
const OPEN3 = {
  par: 1, time: 40,
  tee: [-1.5, 0, -15], route: [[-1.5, -15], [-1.5, -12], [-1.5, -5], [-2, -1.2]],
  parts: [
    { t: 'floor', poly: [[-4, -17], [4, -17], [4, -12], [-2.7, -12], [-4, -12]], open: [2] },
    floe(-1.5, 0), floe(1.5, 0.5),
    { t: 'floor', poly: lakeWay.poly, open: [lakeWay.startEdge, lakeWay.endEdge] },
    snow(5.4, -9.4, 0.8), snow(4.3, -6, 0.7),
    { t: 'floor', poly: [[-4, -5], [-2.7, -5], [4, -5], [4, -1.0], [-4, -1.0]], open: [1, 3] },
    { t: 'monster', type: 'hornet', path: patrol([-2.8, -8.5], [2.8, -8.5], 6, 2.3), aim: 'ball' },
  ],
};

// ice-4: a cave behind a waterfall, guarded by a Tarantula (eps 9 and 41). Punch through the falling water
// into the cave, or take the bare ledge round the berg under a Hornet.
const OPEN4 = {
  par: 1, time: 30,
  tee: [0, 3, -15.5], route: [[0, -15.5], [0, -12], [0, -6], [0, -1.2]],
  parts: [
    { t: 'floor', y: 3, poly: [[-4, -17], [4, -17], [4, -12], [1, -12], [-1, -12], [-2.8, -12], [-3.8, -12], [-4, -12]], open: [3, 5] },
    // the waterfall over the cave mouth pushes everything sideways
    { t: 'zone', kind: 'wind', rect: [-1, -13.2, 1, -11.6], dir: [1, 0], force: 1.6, y: 3 },
    { t: 'floor', y: 3, poly: rect(-1, -12.2, 1, -5.8), open: [0, 2] },
    { t: 'box', p: [2.6, 4.2, -9], s: [3.2, 2.4, 6.4], look: 'ice' },
    { t: 'box', p: [-1.9, 4.2, -9], s: [1.8, 2.4, 6.4], look: 'ice' },
    { t: 'box', p: [0, 5.0, -9], s: [2.0, 0.8, 6.4], look: 'ice' },
    { t: 'monster', type: 'tarantula', path: patrol([0, -10.6], [0, -7.4], 5, 3) },
    // the ledge: no walls, and a long way down
    { t: 'floor', y: 3, poly: rect(-3.8, -12.2, -2.8, -5.8), walls: false },
    { t: 'monster', type: 'hornet', path: patrol([-3.3, -11], [-3.3, -7], 4.4, 5.3), aim: 'ball' },
    { t: 'floor', y: 3, poly: [[-3.8, -6], [-2.8, -6], [-1, -6], [1, -6], [4, -6], [4, -1.0], [2, -1.0], [-2, -1.0], [-3.8, -1.0]], open: [0, 2, 6] },
  ],
};

// ice-6: a Hornet squadron over an open ice plateau. Slide straight up the middle under their fire, or
// work from pillar to pillar, braking in the snow.
const OPEN6 = {
  par: 1, time: 30,
  tee: [2.2, 0, -16], route: [[2.2, -16], [0.5, -2]],
  parts: [
    { t: 'floor', poly: rect(-2.5, -18, 7, -1.0), open: [2] },
    pillar(0.2, -12.5), pillar(4.6, -11), pillar(1.4, -8.2), pillar(5.4, -6.4), pillar(-1, -5.4), pillar(3, -4),
    snow(-0.6, -12.4), snow(5.4, -10.6), snow(2.2, -7.6, 0.8), snow(-1.6, -4.4, 0.8),
    ...[0, 1, 2].map((k) => ({ t: 'monster', type: 'hornet', path: patrol([-1.5 + k * 0.9, -12 - Math.abs(k - 1) * 1.1], [6 + k * 0.9 - 1.8, -9 - Math.abs(k - 1) * 1.1], 7, 2.4, 0), aim: 'ball' })),
  ],
};

export default [
  {
    id: 'ice-1', opening: OPEN1, name: 'Slippery Slope', sector: 'ice', par: 2, time: 90,
    tee: [0, 1.5, 0], cup: [0, 0, 21],
    hio: 'A feather-light tap a hair left of the pillar: gravity does the rest, the snow bleeds the speed.',
    parts: [
      { t: 'cyl', p: [0.42, 0, 18.4], r: 0.42, h: 1.6, look: 'ice' },
      { t: 'cyl', p: [-1.9, 0, 13.2], r: 0.4, h: 1.2, look: 'ice' },
      { t: 'floor', y: 1.5, poly: rect(-2, -1.2, 2, 3), open: [2] },
      { t: 'ramp', a: [0, 3], b: [0, 8], w: 4, ya: 1.5, yb: 0 },
      { t: 'floor', poly: [[-3, 8], [-2, 8], [2, 8], [3, 8], [3, 24], [-3, 24]], open: [1] },
      { t: 'zone', kind: 'slow', rect: [-1.2, 15, 1.2, 16.6], mul: 9 },
      // snowbanks on both sides: only the central ice lane stays slippery
      { t: 'zone', kind: 'slow', rect: [-3, 8, -1.2, 24], mul: 9 },
      { t: 'zone', kind: 'slow', rect: [1.2, 8, 3, 24], mul: 9 },
      { t: 'zone', kind: 'slow', rect: [-3, 22.6, 3, 24], mul: 12 },
      { t: 'monster', type: 'krabe', path: patrol([-2.2, 11.5], [2.2, 11.5], 5) },
      { t: 'monster', type: 'kolossus', p: [42, -30, 12], ry: -Math.PI / 2, phase: 0.3 },
    ],
  },
  {
    id: 'ice-2', opening: false, name: 'Krabe Crossing', sector: 'ice', par: 4, time: 150,
    tee: [0, 0, 0], cup: [1.8, 0, 30.8],
    hio: 'Dead straight a touch right of centre: down the long bridge, up the right fork past the Krabe, into the snow ring.',
    parts: [
      { t: 'floor', poly: [[-2, -1.2], [2, -1.2], [2, 3], [1, 3], [-1, 3], [-2, 3]], open: [3] },
      { t: 'floor', poly: rect(-1, 3, 1, 13), walls: false },
      {
        t: 'floor',
        poly: [[-3, 13], [-1, 13], [1, 13], [3, 13], [3, 17], [2.2, 17], [0.6, 17], [-0.6, 17], [-2.2, 17], [-3, 17]],
        open: [1, 5, 7],
      },
      // left fork: thin ice that cracks on the second pass
      ...[17.75, 19.25, 20.75, 22.25, 23.75, 25.25].map((z) => ({ t: 'crumble', p: [-1.4, 0, z], s: [1.6, 1.5], hits: 2, kindLook: 'thinice' })),
      // right fork: solid, but a Krabe lives there
      { t: 'floor', poly: rect(0.6, 17, 2.2, 26), walls: false },
      { t: 'monster', type: 'krabe', path: patrol([1.4, 18.5], [1.4, 24.5], 5.4) },
      { t: 'floor', poly: [[-3, 26], [-2.2, 26], [-0.6, 26], [0.6, 26], [2.2, 26], [3, 26], [3, 33.5], [-3, 33.5]], open: [1, 3] },
      { t: 'zone', kind: 'slow', c: [1.8, 30.8], r: 2.0, mul: 6 },
      { t: 'zone', kind: 'slow', rect: [-3, 32.4, 3, 33.5], mul: 12 },
      { t: 'monster', type: 'krabe', path: patrol([-2.4, 28], [2.4, 28], 6, 0, 0.3) },
      { t: 'monster', type: 'krabe', path: patrol([-0.4, 7], [0.4, 7], 3, 0, 0.5) },
      { t: 'monster', type: 'kolossus', p: [-42, -30, 18], ry: Math.PI / 2, phase: 0.6 },
    ],
  },
  {
    id: 'ice-3', opening: OPEN3, name: 'Frozen U-Turn', sector: 'ice', par: 3, time: 140,
    tee: [-2, 0, 0], cup: [2, 0, 12], yaw: 0,
    hio: 'Up the left lane and bank off both walls of the frozen end so it slides back down the right lane into the cup.',
    parts: [
      {
        t: 'floor',
        // a squared-off end: the line you hit it at decides the line you come back on
        poly: [[-4, -1.2], [4, -1.2], [4, 22], [-4, 22]],
      },
      // the divider between the two lanes
      { t: 'wall', pts: [[0, -1.2], [0, 15.5]], h: 0.6 },
      { t: 'zone', kind: 'slow', rect: [-4, 5, -2.6, 7], mul: 8 },
      { t: 'zone', kind: 'slow', c: [2, 12], r: 0.8, mul: 4 },
      { t: 'zone', kind: 'slow', rect: [0.1, -1.2, 4, 2], mul: 10 },
      { t: 'monster', type: 'krabe', path: patrol([-3.3, 11.5], [-0.8, 11.5], 4.2) },
      { t: 'monster', type: 'krabe', path: patrol([0.8, 6.5], [3.3, 6.5], 5.2, 0, 0.5) },
      { t: 'monster', type: 'kolossus', p: [36, -30, 11], ry: -Math.PI / 2, scale: 2.5, phase: 0.1 },
    ],
  },
  {
    id: 'ice-4', opening: OPEN4, name: 'Bobsled Run', sector: 'ice', par: 4, time: 150,
    tee: [0, 3, 0], cup: [-1.2, 0, 30],
    hio: 'Down the bobsled tube at just the right pace: it shoots you straight at the snow ring.',
    parts: [
      { t: 'floor', y: 3, poly: [[-2, -1.2], [2, -1.2], [2, 4], [0.6, 4], [-0.6, 4], [-2, 4]], open: [3] },
      { t: 'tube', pts: [[0, 3, 3.6], [0, 2.7, 7], [-3, 2, 10], [-3.2, 1.2, 13.5], [-0.6, 0.4, 16.5], [-0.6, 0, 19.2]], r: 0.5, color: '#cfefff', ring: '#ffffff' },
      { t: 'floor', poly: [[-5, 18], [-1.4, 18], [0.2, 18], [5, 18], [5, 34], [-5, 34]], open: [1], holes: [{ c: [-1.2, 31.5], r: 0.55 }, { c: [0.4, 30.5], r: 0.42 }, { c: [-2.8, 29.4], r: 0.42 }] },
      { t: 'zone', kind: 'slow', c: [-1.2, 30], r: 1.0, mul: 3 },
      { t: 'zone', kind: 'slow', rect: [-5, 32.6, 5, 34], mul: 12 },
      { t: 'zone', kind: 'slow', rect: [2.6, 18, 5, 34], mul: 9 },
      { t: 'cyl', p: [1.6, 0, 25], r: 0.4, h: 1.4, look: 'ice' },
      { t: 'monster', type: 'krabe', path: patrol([-4, 24.5], [3.5, 24.5], 6) },
      { t: 'monster', type: 'kolossus', p: [-40, -30, 20], ry: Math.PI / 2, phase: 0.45 },
    ],
  },
  {
    id: 'ice-5', opening: false, name: 'Crevasse Field', sector: 'ice', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 27],
    hio: 'A soft, dead-straight slide between every crevasse.',
    parts: [
      {
        t: 'floor', poly: rect(-5, -1.2, 5, 30),
        holes: [{ c: [-2.4, 7], r: 1.1 }, { c: [1.8, 10.5], r: 1.2 }, { c: [-1.3, 14.5], r: 0.95 }, { c: [3, 18], r: 1.1 }, { c: [-3, 21], r: 1.2 }, { c: [1.2, 23.4], r: 0.8 }, { c: [0, 28.5], r: 0.5 }, { c: [-1.6, 27.5], r: 0.42 }],
      },
      { t: 'zone', kind: 'slow', rect: [-5, 28.4, 5, 30], mul: 12 },
      { t: 'zone', kind: 'slow', c: [-3.6, 12], r: 1.2, mul: 8 },
      { t: 'zone', kind: 'slow', c: [3.6, 25.5], r: 1.2, mul: 8 },
      { t: 'monster', type: 'krabe', path: patrol([-4.2, 16.8], [4.2, 16.8], 6.5) },
      // a Guardian drifts between the crevasses: roll into it and it traps you (ep 7)
      { t: 'monster', type: 'guardian', path: patrol([-4, 12.4], [4, 12.4], 8) },
      { t: 'monster', type: 'krabe', path: patrol([4, 4], [-4, 4], 5.5, 0, 0.4) },
      { t: 'monster', type: 'kolossus', p: [40, -30, 14], ry: -Math.PI / 2, phase: 0.8 },
    ],
  },
  {
    id: 'ice-6', opening: OPEN6, name: 'Thin Ice Crossing', sector: 'ice', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 27],
    hio: 'Straight across the thin-ice bridge, firm enough that it never breaks under you.',
    parts: [
      // a wide glacier with a deep crevasse cut into the left side; the safe way round is on the right
      { t: 'floor', poly: [[-2.5, -1.2], [7, -1.2], [7, 31], [-2.5, 31], [-2.5, 16], [2.5, 16], [2.5, 10], [-2.5, 10]], open: [4, 6], holes: [{ c: [0, 28.5], r: 0.5 }, { c: [1.6, 27.4], r: 0.42 }, { c: [-1.5, 26.2], r: 0.4 }] },
      ...[10.75, 12.25, 13.75, 15.25].map((z) => ({ t: 'crumble', p: [0, 0, z], s: [1.5, 1.5], hits: 1, kindLook: 'thinice' })),
      { t: 'zone', kind: 'slow', rect: [-2.5, 29.6, 7, 31], mul: 12 },
      { t: 'zone', kind: 'slow', rect: [4.6, 3, 7, 22], mul: 6 },
      { t: 'cyl', p: [4.8, 0, 13], r: 0.5, h: 1.4, look: 'ice' },
      { t: 'monster', type: 'krabe', path: patrol([3.2, 7], [6.5, 7], 4) },
      { t: 'monster', type: 'krabe', path: patrol([-2, 21], [6.4, 21], 6, 0, 0.5) },
      { t: 'monster', type: 'kolossus', p: [-40, -30, 14], ry: Math.PI / 2, phase: 0.2 },
    ],
  },
];
