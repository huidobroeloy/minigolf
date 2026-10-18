import { rect, patrol, orbit, spin, elevator } from './helpers.js';

// CARTHAGE · THE CORE (deep in Sector 5): the white halls round the Core of Lyoko. Data streams carry
// you sideways, rings of wall spin, lifts climb the shafts, Creepers crawl along the walls and the
// Guardians drift through the vault. The Core chamber itself is the last hole.

const stream = (x0, z0, x1, z1, dir, speed = 2.5, y = 0) => ({ t: 'zone', kind: 'conveyor', rect: [x0, z0, x1, z1], dir, speed, y });
const gate = (a, b, period, phase = 0, y = 0, w = 1.2) => ({ t: 'mover', kind: 'obst', s: [w, 0.4, 0.3], path: patrol(a, b, period, y, phase), look: 's5' });
// a Creeper crawling along the top of an inner wall (h 0.6) from a to b, facing `face`
const wallCreeper = (a, b, face, period = 7, phase = 0, y = 0) => ({ t: 'monster', type: 'creeper', wall: { a, b, y: y + 0.22, face }, period, phase });

export default [
  {
    id: 'carthage-1', name: 'Data Stream Hall', sector: 'carthage', par: 3, time: 120,
    tee: [0, 0, 0], cup: [-1.6, 0, 18.5],
    parts: [
      { t: 'floor', poly: rect(-3.5, -1.2, 3.5, 21), holes: [{ c: [-1.6, 19.9], r: 0.5 }, { c: [0.1, 19.1], r: 0.4 }, { c: [-3.05, 17.6], r: 0.38 }] },
      // two data streams cross the hall, one each way
      stream(-3.5, 6, 3.5, 8, [1, 0]),
      stream(-3.5, 11, 3.5, 13, [-1, 0]),
      // a low wall makes you go round to the right before coming back to the cup
      { t: 'wall', pts: [[-3.5, 15.5], [1.2, 15.5]], h: 0.6, thick: 0.4 },
      wallCreeper([-3, 15.5], [0.6, 15.5], Math.PI, 6),
      { t: 'monster', type: 'manta', path: patrol([-3, 4], [3, 4], 6, 1.1) },
    ],
  },
  {
    id: 'carthage-2', name: 'Spinning Rings', sector: 'carthage', par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.2, 0, 20.5],
    parts: [
      { t: 'floor', poly: rect(-4.5, -1.2, 4.5, 23.5), holes: [{ c: [1.2, 22], r: 0.5 }, { c: [2.9, 20.2], r: 0.42 }, { c: [-0.4, 21.3], r: 0.4 }] },
      // the hall's wall rings turn: two spinning arms to slip past
      { t: 'mover', kind: 'obst', s: [3.6, 0.4, 0.3], path: spin(-1.6, 0.2, 8.5, 5), look: 's5' },
      { t: 'mover', kind: 'obst', s: [3.6, 0.4, 0.3], path: spin(1.6, 0.2, 14, 4.4, 0.3), look: 's5' },
      { t: 'bumper', p: [2.8, 0, 5], r: 0.4 }, { t: 'bumper', p: [-3, 0, 17], r: 0.4 },
      { t: 'monster', type: 'guardian', path: patrol([-3.6, 17.8], [3.6, 17.8], 7) },
      { t: 'monster', type: 'creeper', p: [-3.2, 0, 11.5], period: 4.4, phase: 0.2 },
    ],
  },
  {
    id: 'carthage-3', name: 'Lift Shafts', sector: 'carthage', par: 4, time: 150,
    tee: [0, 0, 0], cup: [-1.8, 2.4, 19.5],
    parts: [
      { t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 6], [-4, 6]], open: [2] },
      // two lifts climb to the upper deck, out of step
      { t: 'mover', s: [3, 0.4, 3], path: elevator(-2.2, 7.6, -0.2, 2.2, 8), sideLook: 's5' },
      { t: 'mover', s: [3, 0.4, 3], path: elevator(2.2, 7.6, -0.2, 2.2, 6.5, 0.5), sideLook: 's5' },
      { t: 'floor', y: 2.4, poly: [[-4, 9.1], [4, 9.1], [4, 22.5], [-4, 22.5]], open: [0], holes: [{ c: [-1.8, 21], r: 0.5 }, { c: [-3.35, 18.6], r: 0.4 }, { c: [-0.2, 19.8], r: 0.4 }] },
      gate([-3.4, 16.4], [1.2, 16.4], 4.6, 0, 2.4, 1.4),
      { t: 'monster', type: 'blok', path: patrol([1.4, 12], [3.2, 19], 6, 2.4) },
      { t: 'monster', type: 'manta', path: patrol([-3.5, 2.5], [3.5, 2.5], 6.5, 1.0, 0.3) },
    ],
  },
  {
    id: 'carthage-4', name: 'Creeper Walls', sector: 'carthage', par: 4, time: 150,
    tee: [0, 0, 0], cup: [2.6, 0, 25],
    parts: [
      { t: 'floor', poly: rect(-4, -1.2, 4, 27.5), holes: [{ c: [2.6, 26.5], r: 0.5 }, { c: [0.9, 25.6], r: 0.4 }] },
      // three walls make a zig-zag; Creepers crawl along their tops and fire down at you
      { t: 'wall', pts: [[-4, 8], [1.6, 8]], h: 0.6, thick: 0.4 },
      { t: 'wall', pts: [[-1.6, 15], [4, 15]], h: 0.6, thick: 0.4 },
      { t: 'wall', pts: [[-4, 21], [1.6, 21]], h: 0.6, thick: 0.4 },
      wallCreeper([-3.4, 8], [1, 8], Math.PI, 6.5),
      wallCreeper([-1, 15], [3.4, 15], Math.PI, 6, 0.5),
      wallCreeper([-3.4, 21], [1, 21], Math.PI, 7, 0.25),
      { t: 'bumper', p: [3, 0, 11.5], r: 0.4 }, { t: 'bumper', p: [-3, 0, 18], r: 0.4 },
    ],
  },
  {
    id: 'carthage-5', name: 'Guardian Vault', sector: 'carthage', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 17],
    parts: [
      { t: 'floor', poly: rect(-4.5, -1.2, 4.5, 20), holes: [{ c: [0, 18.5], r: 0.5 }, { c: [-1.6, 17.6], r: 0.42 }, { c: [1.6, 17.6], r: 0.42 }] },
      { t: 'bumper', p: [-2.2, 0, 6], r: 0.42 }, { t: 'bumper', p: [2.2, 0, 6], r: 0.42 }, { t: 'bumper', p: [0, 0, 11], r: 0.36 },
      // the vault's keepers: prison spheres drifting across your way
      { t: 'monster', type: 'guardian', path: orbit([0, 9.5], 2.6, 10) },
      { t: 'monster', type: 'guardian', path: patrol([-3.6, 14.2], [3.6, 14.2], 6.5, 0, 0.4), r: 0.7 },
      { t: 'monster', type: 'kankrelat', path: patrol([-3.6, 3], [3.6, 3], 4.5) },
    ],
  },
  {
    id: 'carthage-6', name: 'The Core Chamber', sector: 'carthage', par: 5, time: 170,
    tee: [0, 0, 0], cup: [0, 0, 20.5],
    parts: [
      { t: 'floor', poly: rect(-6, -1.2, 6, 23), holes: [{ c: [0, 22], r: 0.45 }, { c: [-1.7, 20.8], r: 0.42 }, { c: [1.7, 20.8], r: 0.42 }] },
      // the Core of Lyoko: a glowing column with a shield that spins round it; the cup is behind it
      { t: 'cyl', p: [0, 0, 14], r: 1.4, h: 3.2, look: 'neon' },
      { t: 'mover', kind: 'obst', s: [5.2, 0.5, 0.3], path: spin(0, 0.25, 14, 6), look: 's5' },
      stream(-6, 6, -2, 8, [1, 0], 2),
      stream(2, 6, 6, 8, [-1, 0], 2),
      { t: 'monster', type: 'manta', path: orbit([0, 14], 4.4, 12, 1.4) },
      { t: 'monster', type: 'tarantula', path: patrol([-4.6, 18], [-4.6, 21.5], 5) },
      { t: 'monster', type: 'creeper', p: [4.4, 0, 18.5], period: 4, phase: 0.6 },
    ],
  },
];
