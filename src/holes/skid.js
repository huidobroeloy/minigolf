import { rect, patrol, orbit, shuttle, loop } from './helpers.js';
import { makeSkid } from '../course/deco.js';

// SKIDBLADNIR & THE DIGITAL SEA DEPTHS (season 4): from the Skid's hangar down into the deep, where
// tow currents pull, the Skid's orbital hold ferries you over the void, Kongre's mouths wait beside
// the channels and the Replika gateway glows at the bottom. Everything floats a little underwater.

const tow = (x0, z0, x1, z1, dir, speed = 2, y = 0) => ({ t: 'zone', kind: 'current', rect: [x0, z0, x1, z1], dir, speed, y });
const coral = (x, z, r = 0.42, y = 0) => ({ t: 'bumper', p: [x, y, z], r, color: '#3fc6ff' });

/** A pack of Kongre eels swimming back and forth between a and b, one row behind another (they hunt in packs of 3–5). */
const kongres = (a, b, period, y = 0, n = 3, gap = 0.9) => Array.from({ length: n }, (_, k) => {
  const o = (k - (n - 1) / 2) * gap;
  return { t: 'monster', type: 'kongre', path: patrol([a[0], a[1] + o], [b[0], b[1] + o], period, y, k / n), phase: k / n };
});

// The openings (docs/lore.md): the Skid's garage in north Carthage (a lift, four pillars and five boarding pads: one for
// Aelita, four for the Navskids), and the end of the Skid: the Kolossus walks in the Digital Sea and smashes it (eps 92-93).

/** The Skidbladnir as decor, scaled and placed (its collider is a separate box). */
const skidDeco = (x, y, z, scale, ry = 0, tilt = 0) => ({
  t: 'deco',
  make: () => { const g = makeSkid(); g.scale.setScalar(scale); g.rotation.set(0, ry, tilt); g.position.set(x, y, z); return g; },
});
/** A boarding pad drawn on the floor (decor). */
const pad = (x, z, color) => ({
  t: 'deco',
  make: (THREE) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); return m; },
});
/** A blast-door leaf: slides from `open` (inside the wall) to `shut` and back. */
const leaf = (open, shut, period, phase) => ({ t: 'mover', kind: 'obst', s: [1.3, 0.8, 0.3], path: shuttle([open, 0.4, -8.6], [shut, 0.4, -8.6], period, phase, 0.5), look: 's5' });

// skid-1: the Skid garage. You start on Aelita's pad behind the docked Skid. Go round it: on the left two Navskid pads
// launch you at the garage's blast door (fast, but the door slides shut every 7 s and slams you back); on the right you
// walk it, under a Manta. The launch lane beyond the door runs into the hangar.
const OPEN1 = {
  par: 2, time: 60,
  tee: [0, 0, -24.5], route: [[0, -24.5], [-2.9, -21], [-2.9, -12.5], [0, -9.5], [0, -1.2]],
  parts: [
    // the garage and the launch lane, one slab
    { t: 'floor', poly: [[-5, -26], [5, -26], [5, -8], [2.5, -8], [2.5, -1.0], [-2.5, -1.0], [-2.5, -8], [-5, -8]], open: [4] },
    // the docked Skid (what you see is what you hit) and its four pillars
    skidDeco(0, 1.175, -17, 0.75),
    { t: 'box', p: [0, 0.25, -17], s: [2.4, 0.5, 4.4], kind: 'wall', look: 's5' }, // its docking cradle: the ball rolls under the pods into it
    ...[[-3.9, -22.4], [3.9, -22.4], [-3.9, -11.6], [3.9, -11.6]].map(([x, z]) => ({ t: 'cyl', p: [x, 0, z], r: 0.42, h: 3, look: 's5' })),
    // the five boarding pads: Aelita's (the tee) and four Navskid pads; the two on the left launch you
    pad(0, -24.5, '#ff9de2'), pad(-2.9, -20, '#6fe7ff'), pad(-2.9, -14, '#6fe7ff'), pad(2.9, -20, '#6fe7ff'), pad(2.9, -14, '#6fe7ff'),
    { t: 'zone', kind: 'boost', rect: [-3.5, -20.6, -2.3, -19.4], dir: [0, 1], speed: 7, align: 10, hidden: true },
    { t: 'zone', kind: 'boost', rect: [-3.5, -14.6, -2.3, -13.4], dir: [0.55, 0.84], speed: 8.5, align: 10, hidden: true },
    // the blast door: walls either side of a 2.6 opening, and two leaves that slide shut on a 7 s cycle
    { t: 'wall', pts: [[-5, -8.6], [-1.3, -8.6]], h: 0.8, thick: 0.4 },
    { t: 'wall', pts: [[1.3, -8.6], [5, -8.6]], h: 0.8, thick: 0.4 },
    leaf(-1.95, -0.65, 7, 0), leaf(1.95, 0.65, 7, 0),
    { t: 'monster', type: 'manta', path: patrol([1.6, -20.5], [4.4, -12.5], 6, 1.2), size: 0.8 },
  ],
};

// skid-2: the Kolossus walks (eps 92-93: it strides through the Digital Sea and smashes the Skid). An abyssal plain:
// straight up the middle, where the Kolossus walks its loop and stomps (25 LP and a knock; its feet are solid); the
// left coral corridor against a tow current, through a Kongre pack; or the right corridor, round the Skid's wreck.
const OPEN2 = {
  par: 2, time: 60,
  tee: [0, 0, -28], route: [[0, -28], [0, -20], [0, -10], [0, -1.2]],
  parts: [
    { t: 'floor', poly: [[-7, -30], [7, -30], [7, -6], [2.8, -3], [2.8, -1.0], [-2.8, -1.0], [-2.8, -3], [-7, -6]], open: [4] },
    // the coral walls that make the two corridors
    { t: 'box', p: [-4.6, 0.5, -17], s: [0.6, 1, 15], kind: 'wall', look: '#1e5f7a' },
    { t: 'box', p: [4.6, 0.5, -17], s: [0.6, 1, 15], kind: 'wall', look: '#1e5f7a' },
    // the middle: the Kolossus and a few coral heads
    { t: 'monster', type: 'kolossusRoam', path: loop([[-2.6, -22], [2.6, -22], [2.6, -13], [-2.6, -13]], 0.9), boss: true, scale: 0.45 },
    coral(-1.6, -26), coral(2.2, -9.4, 0.38),
    // the left corridor: a tow current against you and a Kongre pack across it
    // it runs down the corridor's inner half: hug the outer wall to slip past it
    tow(-5.9, -22.5, -5.0, -11.5, [0, -1], 1.2),
    // the pack swims right across (through the coral), so the corridor is clear for part of each pass
    ...kongres([-10, -17], [-2, -17], 7, 0, 3, 0.8),
    // the right corridor: the Skid's wreck lies across it, nose down; bank round it
    skidDeco(6.56, 0.4, -18, 0.6, 0, -0.3),
    { t: 'box', p: [6.3, 0.5, -18], s: [1.4, 1, 3.8], kind: 'wall', hidden: true }, // the hull at ball height; a 0.7 gap by the coral wall
    coral(5.4, -12.5, 0.36), coral(6.4, -23.5, 0.36),
  ],
};

export default [
  {
    id: 'skid-1', opening: OPEN1, name: 'Skid Hangar', sector: 'skid', water: true, par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.4, 0, 19],
    parts: [
      // the hangar floor, then a launch ramp over the drop into the sea
      { t: 'floor', poly: rect(-2.5, -1.2, 2.5, 6), open: [2] },
      { t: 'ramp', a: [0, 6], b: [0, 8.6], w: 2.4, ya: 0, yb: 0.7, jump: true },
      { t: 'floor', poly: rect(-4, 12.5, 4, 22), open: [0], holes: [{ c: [1.4, 20.5], r: 0.5 }, { c: [-0.3, 19.6], r: 0.4 }, { c: [3.1, 18.2], r: 0.4 }] },
      coral(-2.6, 15.4), coral(2.6, 14.8),
      { t: 'monster', type: 'kalamar', path: patrol([-3, 17], [3, 17], 6) },
    ],
  },
  {
    id: 'skid-2', opening: OPEN2, name: 'Tow Current Trench', sector: 'skid', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 25],
    parts: [
      { t: 'floor', poly: rect(-2.8, -1.2, 2.8, 27.5), holes: [{ c: [0, 26.5], r: 0.5 }, { c: [-1.6, 25.4], r: 0.4 }, { c: [1.6, 25.4], r: 0.4 }] },
      // tow currents down the middle (the water along the walls is calm): one against you, one with you
      tow(-1.1, 5, 1.1, 11, [0, -1], 2.2),
      tow(-1.1, 14, 1.1, 20, [0, 1], 1.8),
      coral(-1.9, 12.5, 0.38), coral(1.9, 21.5, 0.38),
      { t: 'monster', type: 'shark', path: patrol([-2.2, 9], [2.2, 9], 5), range: 3.5 },
      { t: 'monster', type: 'shark', path: patrol([2.2, 17.5], [-2.2, 17.5], 5.5, 0, 0.5), range: 3.5 },
    ],
  },
  {
    id: 'skid-3', opening: false, name: 'Orbital Hold', sector: 'skid', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [-1.2, 0, 24],
    parts: [
      // the void between two decks: the Skid's orbital hold ferries you over; a narrow catwalk for the brave
      { t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 8], [3.4, 8], [2.6, 8], [-4, 8]], open: [3] },
      { t: 'mover', kind: 'floor', s: [2, 0.3, 2], path: shuttle([-1.5, -0.15, 9.1], [-1.5, -0.15, 14.9], 7, 0, 0.6), sideLook: 's5' },
      { t: 'floor', poly: rect(2.6, 8, 3.4, 16), walls: false },
      { t: 'floor', poly: [[-4, 16], [2.6, 16], [3.4, 16], [4, 16], [4, 27], [-4, 27]], open: [0, 1], holes: [{ c: [-1.2, 25.5], r: 0.5 }, { c: [0.5, 24.6], r: 0.4 }, { c: [-2.9, 23.2], r: 0.4 }] },
      coral(2.4, 20), coral(-3, 18.5),
      { t: 'monster', type: 'shark', path: patrol([-3, 21], [3, 21], 6), range: 3.5 },
    ],
  },
  {
    id: 'skid-4', opening: false, name: 'Kongre’s Gullet', sector: 'skid', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [-2.4, 0, 23.5],
    parts: [
      { t: 'floor', poly: rect(-4, -1.2, 4, 26), holes: [{ c: [-2.4, 25], r: 0.5 }, { c: [-0.7, 24.2], r: 0.4 }] },
      { t: 'wall', pts: [[-4, 8], [1.8, 8]], h: 0.6, thick: 0.4 },
      { t: 'wall', pts: [[-1.8, 16], [4, 16]], h: 0.6, thick: 0.4 },
      // the channel bends past two packs of Kongre eels
      ...kongres([0.4, 11.8], [3.6, 11.8], 5, 0, 3, 0.75),
      ...kongres([-3.6, 19.8], [-0.4, 19.8], 5.5, 0, 3, 0.75),
      { t: 'monster', type: 'kalamar', path: patrol([-3, 4], [3, 4], 5.5) },
    ],
  },
  {
    id: 'skid-5', opening: false, name: 'Kalamar Reef', sector: 'skid', water: true, par: 3, time: 120,
    tee: [0, 0, 0], cup: [-2, 1.2, 19.5],
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 10), open: [2] },
      { t: 'ramp', a: [0, 10], b: [0, 14], w: 4, ya: 0, yb: 1.2 },
      { t: 'floor', y: 1.2, poly: [[-4.5, 14], [-2, 14], [2, 14], [4.5, 14], [4.5, 22], [-4.5, 22]], open: [1], holes: [{ c: [-2, 21], r: 0.5 }, { c: [-3.7, 18.6], r: 0.4 }, { c: [-0.3, 19.9], r: 0.4 }] },
      coral(-1.2, 4), coral(1.2, 7), coral(2.8, 18, 0.45, 1.2), coral(0.6, 16.4, 0.36, 1.2),
      { t: 'monster', type: 'kalamar', path: patrol([-3.5, 16.2], [3.5, 16.2], 6, 1.2) },
      { t: 'monster', type: 'shark', path: patrol([-1.4, 2], [1.4, 2], 4.5), range: 3 },
    ],
  },
  {
    id: 'skid-6', opening: false, name: 'Replika Gateway', sector: 'skid', water: true, par: 5, time: 170,
    tee: [0, 0, 0], cup: [1.6, 3, 21],
    parts: [
      { t: 'floor', poly: rect(-5, -1.2, 5, 14), open: [2] },
      tow(-1.2, 4, 1.2, 9, [0, -1], 1.6),
      coral(-3, 6), coral(3, 9),
      // the bubble column up to the gateway deck
      { t: 'zone', kind: 'bubble', c: [0, 13], r: 0.9, height: 4.4, lift: 1.8, push: [0, 2.2] },
      { t: 'floor', y: 3, poly: rect(-4, 14, 4, 24), open: [0], holes: [{ c: [1.6, 22.5], r: 0.5 }, { c: [-0.1, 21.6], r: 0.4 }, { c: [3.3, 20], r: 0.4 }] },
      { t: 'box', p: [0, 1.5, 14.1], s: [8, 3, 0.2], kind: 'wall', look: '#123a6a' },
      { t: 'monster', type: 'shark', path: patrol([-4, 11], [4, 11], 6), range: 3.5 },
      { t: 'monster', type: 'kalamar', path: orbit([0, 19], 2.4, 11, 3) },
    ],
  },
];
