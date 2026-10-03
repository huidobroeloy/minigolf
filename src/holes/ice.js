import { rect, patrol, orbit } from './helpers.js';

// Sector 3 — ICE: almost no friction. Snow patches are your brakes. Krabes stomp across.
export default [
  {
    id: 'ice-1', name: 'Slippery Slope', sector: 'ice', par: 2, time: 90,
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
    id: 'ice-2', name: 'Krabe Crossing', sector: 'ice', par: 4, time: 150,
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
    id: 'ice-3', name: 'Frozen U-Turn', sector: 'ice', par: 3, time: 140,
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
    id: 'ice-4', name: 'Bobsled Run', sector: 'ice', par: 4, time: 150,
    tee: [0, 3, 0], cup: [-1.2, 0, 30],
    hio: 'Down the bobsled tube at just the right pace: it shoots you straight at the snow ring.',
    parts: [
      { t: 'floor', y: 3, poly: [[-2, -1.2], [2, -1.2], [2, 4], [0.6, 4], [-0.6, 4], [-2, 4]], open: [3] },
      { t: 'tube', pts: [[0, 3, 3.6], [0, 2.7, 7], [-3, 2, 10], [-3.2, 1.2, 13.5], [-0.6, 0.4, 16.5], [-0.6, 0, 19.2]], r: 0.5, color: '#cfefff', ring: '#ffffff' },
      { t: 'floor', poly: [[-5, 18], [-1.4, 18], [0.2, 18], [5, 18], [5, 34], [-5, 34]], open: [1] },
      { t: 'zone', kind: 'slow', c: [-1.2, 30], r: 2, mul: 6 },
      { t: 'zone', kind: 'slow', rect: [-5, 32.6, 5, 34], mul: 12 },
      { t: 'zone', kind: 'slow', rect: [2.6, 18, 5, 34], mul: 9 },
      { t: 'cyl', p: [1.6, 0, 25], r: 0.4, h: 1.4, look: 'ice' },
      { t: 'monster', type: 'krabe', path: patrol([-4, 24.5], [3.5, 24.5], 6) },
      { t: 'monster', type: 'kolossus', p: [-40, -30, 20], ry: Math.PI / 2, phase: 0.45 },
    ],
  },
  {
    id: 'ice-5', name: 'Crevasse Field', sector: 'ice', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 27],
    hio: 'A soft, dead-straight slide between every crevasse.',
    parts: [
      {
        t: 'floor', poly: rect(-5, -1.2, 5, 30),
        holes: [{ c: [-2.4, 7], r: 1.1 }, { c: [1.8, 10.5], r: 1.2 }, { c: [-1.3, 14.5], r: 0.95 }, { c: [3, 18], r: 1.1 }, { c: [-3, 21], r: 1.2 }, { c: [1.2, 23.4], r: 0.8 }],
      },
      { t: 'zone', kind: 'slow', rect: [-5, 28.4, 5, 30], mul: 12 },
      { t: 'zone', kind: 'slow', c: [-3.6, 12], r: 1.2, mul: 8 },
      { t: 'zone', kind: 'slow', c: [3.6, 25.5], r: 1.2, mul: 8 },
      { t: 'zone', kind: 'slow', c: [0, 27], r: 1.4, mul: 5 },
      { t: 'monster', type: 'krabe', path: patrol([-4.2, 16.8], [4.2, 16.8], 6.5) },
      { t: 'monster', type: 'krabe', path: patrol([4, 4], [-4, 4], 5.5, 0, 0.4) },
      { t: 'monster', type: 'kolossus', p: [40, -30, 14], ry: -Math.PI / 2, phase: 0.8 },
    ],
  },
  {
    id: 'ice-6', name: 'Thin Ice Crossing', sector: 'ice', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 27],
    hio: 'Straight across the thin-ice bridge, firm enough that it never breaks under you.',
    parts: [
      // a wide glacier with a deep crevasse cut into the left side; the safe way round is on the right
      { t: 'floor', poly: [[-2.5, -1.2], [7, -1.2], [7, 31], [-2.5, 31], [-2.5, 16], [2.5, 16], [2.5, 10], [-2.5, 10]], open: [4, 6] },
      ...[10.75, 12.25, 13.75, 15.25].map((z) => ({ t: 'crumble', p: [0, 0, z], s: [1.5, 1.5], hits: 1, kindLook: 'thinice' })),
      { t: 'zone', kind: 'slow', c: [0, 27], r: 1.8, mul: 6 },
      { t: 'zone', kind: 'slow', rect: [-2.5, 29.6, 7, 31], mul: 12 },
      { t: 'zone', kind: 'slow', rect: [4.6, 3, 7, 22], mul: 6 },
      { t: 'cyl', p: [4.8, 0, 13], r: 0.5, h: 1.4, look: 'ice' },
      { t: 'monster', type: 'krabe', path: patrol([3.2, 7], [6.5, 7], 4) },
      { t: 'monster', type: 'krabe', path: patrol([-2, 21], [6.4, 21], 6, 0, 0.5) },
      { t: 'monster', type: 'kolossus', p: [-40, -30, 14], ry: Math.PI / 2, phase: 0.2 },
    ],
  },
];
