import { rect, patrol } from './helpers.js';

// The World Cup finale: Sector 5's core, guarded by a Kolossus. Its fist slams the arena (watch the
// red rings), and a XANA gate seals the corridor to the core. As in ep 94, hit both its weak points
// with your ball within 8 s, the glowing eye low on its leg and its blade while it stays planted after
// a slam: the giant kneels and the gate drops for 15 s.
export default {
  id: 'core-boss', name: 'Sector 5 Core', sector: 'core', par: 5, time: 210, boss: true,
  tee: [0, 0, 0], cup: [0, 0, 38.5],
  parts: [
    { t: 'floor', poly: rect(-2, -1.2, 2, 14.2), open: [2] },
    // the arena, with an alcove on the right where the Kolossus plants its foot
    {
      t: 'floor',
      poly: [[-8, 14], [-2, 14], [2, 14], [8, 14], [8, 22.6], [9.8, 22.6], [9.8, 25.4], [8, 25.4], [8, 30], [2, 30], [-2, 30], [-8, 30]],
      open: [1, 9],
    },
    // the corridor to the core
    { t: 'floor', poly: rect(-2, 29.9, 2, 41), open: [0] },
    { t: 'box', p: [-5, 0.3, 22], s: [1.2, 0.6, 1.2], look: 's5' },
    { t: 'box', p: [4.5, 0.3, 18], s: [1.2, 0.6, 1.2], look: 's5' },
    {
      t: 'monster', type: 'kolossusBoss', p: [11, 0, 22], ry: -Math.PI / 2, scale: 0.6,
      ankle: [8.9, 0, 24], gate: { a: [-2, 30], b: [2, 30], y: 0 }, zone: [-7.2, 15, 7.2, 29.2], every: 7,
    },
    { t: 'monster', type: 'manta', path: patrol([-1.6, 5], [1.6, 9], 5, 1.0) },
    { t: 'monster', type: 'creeper', p: [-1.3, 0, 35], period: 4.4, phase: 0.3 },
  ],
};
