import { rect, patrol, spin, kicker } from './helpers.js';

const pit = (x, z, r = 0.5) => ({ c: [x, z], r, fortune: true });

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
      { t: 'zone', kind: 'conveyor', rect: [-4.5, 8.6, 4.5, 10.2], dir: [1, 0], speed: 3 },
      { t: 'zone', kind: 'conveyor', rect: [-4.5, 13.3, 4.5, 14.5], dir: [-1, 0], speed: 3 },
      { t: 'monster', type: 'drone', path: patrol([-3.8, 6], [3.8, 6], 5, 0.45) },
      { t: 'monster', type: 'drone', path: patrol([3.8, 19.3], [-3.8, 19.3], 6, 0.45, 0.4) },
    ],
  },
  {
    id: 'fortune-2', name: 'Slot Alley', sector: 'fortune', par: 5, time: 170,
    tee: [0, 0, 0], cup: [11.5, 0, 29],
    fortuneDrops: [[0, 0, 0.5], [10.5, 0, 26.9], [1.5, 0, 15], [6, 0, 27.4], [1.8, 0, 3], [13, 0, 27]],
    hio: 'Over the boost pad, threading every pit, into the corner kicker — it fires you down the neon arm.',
    parts: [
      {
        t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 25.5], [14, 25.5], [14, 30.5], [-2.5, 30.5]],
        holes: [pit(-1.2, 6), pit(1.3, 8.5), pit(-0.2, 12.6), pit(-1.4, 17), pit(1.5, 19.5), pit(0.6, 23.4, 0.45),
          pit(5.5, 27.2, 0.45), pit(8.2, 26.9, 0.45), pit(9.6, 26.6, 0.4)],
      },
      kicker([-2.5, 27.6], [0.4, 30.5]),
      { t: 'zone', kind: 'boost', rect: [-0.6, 1.8, 0.6, 3.2], dir: [0, 1], speed: 9 },
      { t: 'zone', kind: 'conveyor', rect: [6.6, 25.5, 7.6, 30.5], dir: [0, -1], speed: 2.2 },
      { t: 'teleport', p: [-1.5, 0, 14.2], to: [[10.5, 0, 26.9], [0, 0, 0.5], [1.6, 0, 11]] },
      { t: 'teleport', p: [1.6, 0, 22.6], to: [[6.2, 0, 29.4], [0, 0, 9.6], [1.8, 0, 2]] },
      { t: 'mover', kind: 'obst', s: [1.8, 0.7, 0.2], path: patrol([-1.5, 10.2], [1.5, 10.2], 3, 0.35), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [1.8, 0.7, 0.2], path: patrol([1.5, 21.2], [-1.5, 21.2], 2.6, 0.35, 0.3), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [0.2, 0.7, 1.8], path: patrol([4.2, 26.5], [4.2, 29.5], 2.8, 0.35, 0.5), look: 'holo' },
      { t: 'monster', type: 'drone', path: patrol([9.5, 26.2], [9.5, 29.8], 3.4, 0.45, 0.2) },
    ],
  },
  {
    id: 'fortune-3', name: 'Fortune Falls', sector: 'fortune', par: 5, time: 170,
    tee: [0, 0, 0], cup: [0, -1, 36.5],
    fortuneDrops: [[0, 0, 0.5], [0, 2, 16.2], [-4.4, -1, 38.6], [4.4, -1, 31.4], [0, -1, 33.6], [5.2, 2, 23.2], [-3.4, 0, 8.6]],
    hio: 'Up the ramp off-centre, bank past the big pit between the sweepers, down the falls and through the pit ring.',
    parts: [
      {
        t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 10], [1.5, 10], [-1.5, 10], [-4, 10]], open: [3],
        holes: [pit(-2.5, 4), pit(2.5, 4), pit(0, 6.8, 0.55)],
      },
      { t: 'teleport', p: [3, 0, 8.2], to: [[0, 2, 16.4], [0, 0, 0.5], [-3, -1, 32]] },
      { t: 'ramp', a: [0, 10], b: [0, 15], w: 3, ya: 0, yb: 2 },
      {
        t: 'floor', y: 2, poly: [[-6, 15], [-1.5, 15], [1.5, 15], [6, 15], [6, 24], [1.5, 24], [-1.5, 24], [-6, 24]], open: [1, 5],
        holes: [pit(0, 19.5, 0.75), pit(-4.8, 22.3), pit(4.8, 16.6), pit(-3, 16.6, 0.45), pit(3, 22.4, 0.45)],
      },
      { t: 'mover', kind: 'obst', s: [3.6, 0.4, 0.3], path: spin(-3.4, 2.2, 19.5, 4), look: 'neon' },
      { t: 'mover', kind: 'obst', s: [3.6, 0.4, 0.3], path: spin(3.4, 2.2, 19.5, -4.6), look: 'neon' },
      { t: 'ramp', a: [0, 24], b: [0, 30], w: 3, ya: 2, yb: -1 },
      {
        t: 'floor', y: -1, poly: [[-5, 30], [-1.5, 30], [1.5, 30], [5, 30], [5, 40], [-5, 40]], open: [1],
        holes: [30, 100, 170, 250, 320].map((a) => pit(Math.cos(a * Math.PI / 180) * 1.9, 36.5 + Math.sin(a * Math.PI / 180) * 1.9, 0.42)),
      },
      { t: 'zone', kind: 'conveyor', rect: [-5, 32, 5, 33.3], dir: [1, 0], speed: 2.5 },
      { t: 'monster', type: 'drone', path: patrol([-4.3, 38.8], [4.3, 38.8], 5, -0.55) },
      { t: 'monster', type: 'drone', path: patrol([5.2, 21], [5.2, 17], 3.4, 2.45) },
    ],
  },
];
