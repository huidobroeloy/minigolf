import { rect, patrol } from './helpers.js';

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
export default [
  {
    id: 'mountain-1', name: 'Crumbling Ledge', sector: 'mountain', par: 4, time: 150,
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
    id: 'mountain-2', name: 'Avalanche Alley', sector: 'mountain', par: 3, time: 120,
    tee: [0, 3, 0], cup: [1.5, 0, 21.5],
    hio: 'Gentle tap down the slope between boulders, drifting right toward the cup.',
    parts: [
      { t: 'floor', y: 3, poly: rect(-2.5, -1.2, 2.5, 4), open: [2] },
      { t: 'ramp', a: [0, 4], b: [0, 16], w: 5, ya: 3, yb: 0 },
      { t: 'floor', poly: [[-4, 16], [-2.5, 16], [2.5, 16], [4, 16], [4, 25], [-4, 25]], open: [1] },
      rock(-2.6, 20.5, 0.6), rock(3.0, 18.4, 0.5, 1.2), rock(-0.6, 23.4, 0.45, 1.1),
      { t: 'zone', kind: 'slow', rect: [-4, 23.8, 4, 25], mul: 3 },
      { t: 'monster', type: 'boulder', path: avalanche(-1.4, 4.4, 16, 3, 0, 19.5, 5.5, 0.0) },
      { t: 'monster', type: 'boulder', path: avalanche(1.3, 4.4, 16, 3, 0, 18.5, 5.5, 0.5) },
      { t: 'monster', type: 'boulder', path: avalanche(0.0, 4.4, 16, 3, 0, 20.5, 7.3, 0.25, 0.7), size: 0.7 },
    ],
  },
  {
    id: 'mountain-3', name: 'Updraft Peaks', sector: 'mountain', par: 4, time: 150,
    tee: [0, 0, 0], cup: [-1.4, 5, 19.5],
    hio: 'Ride vent one slightly left so you land in line with vent two, then roll to the cup.',
    parts: [
      { t: 'floor', poly: rect(-2.5, -1.2, 2.5, 7) },
      { t: 'zone', kind: 'vent', c: [0, 5.6], r: 0.9, y: 0, height: 3.2, launch: 10.5, push: [0, 1], minSpeed: 3 },
      rock(-1.6, 3.2, 0.45, 1.2), rock(1.7, 4.0, 0.4, 1.0),
      { t: 'floor', y: 2.5, poly: rect(-3, 7.2, 3, 15), open: [0], holes: [{ poly: rect(0.4, 10.4, 2.6, 12.6) }] },
      { t: 'zone', kind: 'vent', c: [-1.0, 13.8], r: 0.85, y: 2.5, height: 3.2, launch: 10.5, push: [0, 1], minSpeed: 3 },
      { t: 'crumble', p: [1.5, 2.5, 11.5], s: [2.2, 2.2] },
      { t: 'monster', type: 'tarantula', path: patrol([2.3, 10.5], [-2.3, 10.5], 5, 2.5) },
      { t: 'floor', y: 5, poly: rect(-3, 15.4, 3, 22), open: [0] },
      rock(1.6, 18.0, 0.5, 1.2, 5),
      { t: 'monster', type: 'tarantula', path: patrol([2.2, 20.8], [-0.2, 20.8], 4, 5, 0.5) },
    ],
  },
];
