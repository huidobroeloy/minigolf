import { rect, patrol } from './helpers.js';

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
      { t: 'zone', kind: 'slow', rect: [-3, 15, 3, 16.6], mul: 9 },
      { t: 'zone', kind: 'slow', c: [0, 21], r: 1.7, mul: 5 },
      { t: 'zone', kind: 'slow', rect: [-3, 22.6, 3, 24], mul: 12 },
      { t: 'monster', type: 'krabe', path: patrol([-2.2, 11.5], [2.2, 11.5], 5) },
    ],
  },
  {
    id: 'ice-2', name: 'Krabe Crossing', sector: 'ice', par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.8, 0, 23.8],
    hio: 'Dead straight a touch right of centre: over the bridge, up the right fork past the Krabe, into the snow ring.',
    parts: [
      { t: 'floor', poly: [[-2, -1.2], [2, -1.2], [2, 3], [1, 3], [-1, 3], [-2, 3]], open: [3] },
      { t: 'floor', poly: rect(-1, 3, 1, 9), walls: false },
      {
        t: 'floor',
        poly: [[-3, 9], [-1, 9], [1, 9], [3, 9], [3, 13], [2.2, 13], [0.6, 13], [-0.6, 13], [-2.2, 13], [-3, 13]],
        open: [1, 5, 7],
      },
      // left fork: thin ice that cracks on the second pass
      { t: 'crumble', p: [-1.4, 0, 13.75], s: [1.6, 1.5], hits: 2, kindLook: 'thinice' },
      { t: 'crumble', p: [-1.4, 0, 15.25], s: [1.6, 1.5], hits: 2, kindLook: 'thinice' },
      { t: 'crumble', p: [-1.4, 0, 16.75], s: [1.6, 1.5], hits: 2, kindLook: 'thinice' },
      { t: 'crumble', p: [-1.4, 0, 18.25], s: [1.6, 1.5], hits: 2, kindLook: 'thinice' },
      // right fork: solid, but a Krabe lives there
      { t: 'floor', poly: rect(0.6, 13, 2.2, 19), walls: false },
      { t: 'monster', type: 'krabe', path: patrol([1.4, 14.5], [1.4, 18], 4.4) },
      { t: 'floor', poly: [[-3, 19], [-2.2, 19], [-0.6, 19], [0.6, 19], [2.2, 19], [3, 19], [3, 26.5], [-3, 26.5]], open: [1, 3] },
      { t: 'zone', kind: 'slow', c: [1.8, 23.8], r: 2.0, mul: 6 },
      { t: 'zone', kind: 'slow', rect: [-3, 25.4, 3, 26.5], mul: 12 },
      { t: 'monster', type: 'krabe', path: patrol([-2.4, 21], [2.4, 21], 6, 0, 0.3) },
    ],
  },
  {
    id: 'ice-3', name: 'Frozen U-Turn', sector: 'ice', par: 3, time: 140,
    tee: [-2, 0, 0], cup: [1.9, 0, 19.2],
    hio: 'Up the left lane at just the right line: the round ice bank swings it straight back down into the cup.',
    parts: [
      {
        t: 'floor',
        poly: [[-4, -1.2], [4, -1.2], [4, 18], ...Array.from({ length: 15 }, (_, i) => {
          const a = ((i + 1) / 16) * Math.PI;
          return [Math.cos(a) * 4, 18 + Math.sin(a) * 4];
        }), [-4, 18]],
      },
      // the divider between the two lanes
      { t: 'wall', pts: [[0, -1.2], [0, 15.5]], h: 0.6 },
      { t: 'zone', kind: 'slow', rect: [-4, 5, -2.6, 7], mul: 8 },
      { t: 'zone', kind: 'slow', c: [1.9, 19.2], r: 1.4, mul: 6 },
      { t: 'zone', kind: 'slow', rect: [0.1, -1.2, 4, 2], mul: 10 },
      { t: 'monster', type: 'krabe', path: patrol([-3.3, 11.5], [-0.8, 11.5], 4.2) },
      { t: 'monster', type: 'krabe', path: patrol([0.8, 6.5], [3.3, 6.5], 5.2, 0, 0.5) },
    ],
  },
];
