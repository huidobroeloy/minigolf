import { rect, patrol, orbit, spin, circlePoly, shuttle } from './helpers.js';

// THE NETWORK (season 4): the endless cyberspace the Skidbladnir sails through. Floating data
// highways, firewalls, packet traffic, docking bays and the great Hub. Most surfaces glow.

const packet = (a, b, period, phase = 0, s = [0.9, 0.5, 0.9]) => ({ t: 'mover', kind: 'obst', s, path: patrol(a, b, period, 0, phase), look: 'holo' });
const pillar = (x, z, r = 0.35, h = 1.6, y = 0) => ({ t: 'cyl', p: [x, y, z], r, h, look: 'neon' });
const stream = (x0, z0, x1, z1, dir, speed = 3, y = 0) => ({ t: 'zone', kind: 'conveyor', rect: [x0, z0, x1, z1], dir, speed, y });

export default [
  {
    id: 'network-1', name: 'Firewall Gate', sector: 'network', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 15],
    hio: 'Straight through the firewall’s moving gap. Time it.',
    parts: [
      { t: 'floor', poly: rect(-3, -1.2, 3, 18) },
      // the firewall: two slabs that slide together, leaving a gap that drifts across the lane
      { t: 'mover', kind: 'obst', s: [2.6, 0.6, 0.3], path: patrol([-3.6, 8], [-1.4, 8], 3.2), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [2.6, 0.6, 0.3], path: patrol([-0.4, 8], [1.8, 8], 3.2), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [2.6, 0.6, 0.3], path: patrol([2.8, 8], [5, 8], 3.2), look: 'holo' },
      pillar(-2, 12.5), pillar(2, 12.5),
    ],
  },
  {
    id: 'network-2', name: 'Data Highway', sector: 'network', par: 4, time: 150,
    tee: [0, 0, 0], cup: [-6, 0, 27],
    hio: 'Ride the data stream round the bend at just the right pace.',
    parts: [
      { t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 22], [0.5, 30], [-8.5, 30], [-8.5, 23.5], [-2.5, 23.5]] },
      // fast lanes: a stream up the middle, then one that bends left at the top
      stream(-0.8, 4, 0.8, 18, [0, 1], 4.5),
      stream(-5.5, 24.5, 0, 28.5, [-1, 0], 3),
      packet([-2, 10], [2, 10], 2.8),
      packet([2, 14.5], [-2, 14.5], 3.4, 0.3),
      packet([-7.5, 26], [-7.5, 29], 2.6),
      pillar(-1.5, 21), pillar(-3.5, 28.8, 0.3),
    ],
  },
  {
    id: 'network-3', name: 'Gravity Ramps', sector: 'network', par: 4, time: 150,
    tee: [0, 0, 0], cup: [1.7, 1.5, 28.2], yaw: 0,
    hio: 'Come up the ramp at a slight angle: the gravity launcher keeps your drift and drops you beside the cup.',
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 6), open: [2] },
      { t: 'zone', kind: 'boost', rect: [-0.9, 1.6, 0.9, 5.4], dir: [0, 1], speed: 12.5, align: 2 },
      { t: 'ramp', a: [0, 6], b: [0, 12], w: 4, ya: 0, yb: 2 },
      { t: 'floor', y: 2, poly: [[-2.5, 12], [2.5, 12], [2.5, 13], [2.5, 17], [2.5, 18.4], [-2.5, 18.4]], open: [0, 2, 4] },
      { t: 'zone', kind: 'vent', c: [0, 17.5], r: 0.75, y: 2, launch: 7, push: [0, 1], minSpeed: 6 },
      // the gap; anything that drops is lost in the Network
      { t: 'floor', y: 1.5, poly: rect(-3, 21.4, 3, 34), open: [0] },
      // a slow side route: a gravity lift up from a pad beside the gap
      { t: 'floor', y: 2, poly: rect(2.5, 13, 6, 17), open: [3] },
      { t: 'zone', kind: 'vent', c: [4.4, 16.2], r: 0.6, y: 2, launch: 9, push: [-0.4, 1], minSpeed: 6.5 },
      { t: 'mover', kind: 'obst', s: [0.9, 0.5, 0.9], path: patrol([-2, 26], [2, 26], 3, 1.5), look: 'holo' },
      pillar(-1.4, 29.6, 0.35, 1.6, 1.5), pillar(0.3, 31.2, 0.35, 1.6, 1.5), pillar(2.2, 31, 0.3, 1.6, 1.5),
    ],
  },
  {
    id: 'network-4', name: 'Skid Docking Bay', sector: 'network', par: 4, time: 150,
    tee: [0, 0, 0], cup: [12.5, 0, 17],
    hio: 'Bank off the docking clamp’s back wall into the bay.',
    parts: [
      { t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 13], [14.5, 13], [14.5, 21], [-2.5, 21]] },
      { t: 'wall', pts: [[-2.5, 14.2], [2.2, 21]], h: 0.5 },
      // the docking clamp: a big spinning cross in the corner
      { t: 'mover', kind: 'obst', s: [4.2, 0.5, 0.3], path: spin(4.5, 0.25, 17, 5), look: 'neon' },
      // the bay: walls with a mouth facing the corridor
      { t: 'wall', pts: [[10.5, 14.8], [10.5, 15.2]], h: 0.6 },
      { t: 'wall', pts: [[10.5, 18.8], [10.5, 19.2], [14.5, 19.2]], h: 0.6 },
      { t: 'wall', pts: [[10.5, 14.8], [14.5, 14.8]], h: 0.6 },
      { t: 'monster', type: 'manta', path: orbit([6.5, 17], 2.6, 12, 1.6), size: 0.9 },
    ],
  },
  {
    id: 'network-5', name: 'Packet Storm', sector: 'network', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 24],
    hio: 'Thread the packet traffic dead straight: every lane crosses your line at a different beat.',
    parts: [
      { t: 'floor', poly: rect(-4, -1.2, 4, 27) },
      packet([-3.5, 5], [3.5, 5], 3),
      packet([3.5, 9], [-3.5, 9], 2.4, 0.2),
      packet([-3.5, 13], [3.5, 13], 3.6, 0.5),
      packet([3.5, 17], [-3.5, 17], 2, 0.1),
      stream(-4, 19.5, 4, 21, [1, 0], 2.6),
      pillar(-2.6, 23), pillar(2.6, 23),
    ],
  },
  {
    id: 'network-6', name: 'The Hub', sector: 'network', par: 5, time: 170,
    tee: [0, 0, 0], cup: [0, 1, 30],
    hio: 'A secret warp hides at the end of the first highway. It sends you straight into the Hub.',
    parts: [
      // first highway, then a bend to the right
      { t: 'floor', poly: [[-2, -1.2], [2, -1.2], [2, 8], [9, 8], [9, 13], [8.6, 13], [7.4, 13], [-2, 13]], open: [5] },
      { t: 'warp', a: [-1.2, 0, 12.2], b: [0, 1, 23.6], dir: [0, 1], speed: 1.5, r: 0.35 },
      { t: 'zone', kind: 'slow', rect: [-1.3, 24.6, 1.3, 27.6], y: 1, mul: 4 }, // corrupted data: sticky
      // holographic bridge up to the Hub
      { t: 'tube', pts: [[8, 0, 12.5], [8, 0.3, 16], [6, 1, 19.5], [3.6, 1, 21.6], [2.2, 1, 23.6]], r: 0.6, color: '#7ac8ff' },
      // the Hub: a round platform with a ring of data pillars round the cup
      { t: 'floor', y: 1, poly: circlePoly(0, 29, 7, 40), open: [32, 33], holes: [{ c: [-0.4, 33.4], r: 0.75 }] },
      // the ring opens at the back: overshoot and you drop into the void
      ...[1, 2, 3, 4].map((k) => { const a = k / 6 * Math.PI * 2 + 0.3; return pillar(Math.sin(a) * 2.3, 30 + Math.cos(a) * 2.3, 0.4, 1.4, 1); }),
      { t: 'mover', kind: 'obst', s: [0.8, 0.5, 0.8], path: orbit([0, 30], 4, 7, 1.25), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [0.8, 0.5, 0.8], path: orbit([0, 30], 4, 7, 1.25, 0.5), look: 'holo' },
      { t: 'monster', type: 'megatank', path: patrol([-4.5, 25], [-4.5, 33], 9, 1) },
    ],
  },
];
