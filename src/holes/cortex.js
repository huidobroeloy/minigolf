import { rect, patrol, orbit, spin, elevator } from './helpers.js';
import { makeTower, TOWER_BODY } from '../fx/lyoko.js';

// THE CORTEX (season 4): XANA's own world inside a sphere floating in the Digital Sea. Its ground is
// made of blocks that keep shifting, rising and falling away, and at its heart sits the Core.
// Ninjas guard it, with Krabes, Tarantulas and Mantas.

const block = (a, b, period, phase = 0) => ({ t: 'mover', kind: 'obst', s: [2.4, 0.6, 0.5], path: patrol(a, b, period, 0, phase), look: 'holo' });

// The openings (docs/lore.md; Évolution, from codelyoko.fr): the Cortex "est instable et subit en permanence des
// mouvements sismiques", its plates keep moving; and XANA walls a tower off with Bloks (ep 7).

const smooth = (u) => u * u * (3 - 2 * u);
/** A plate of ground that holds still, shakes for a second, falls away into the void and reforms. */
const quakePlate = (x, z, period, phase) => (t) => {
  const T = ((((t / period) + phase) % 1) + 1) % 1 * period;
  const fall = period - 2.2;
  if (T < fall - 1) return { x, y: -0.2, z, ry: 0 };
  if (T < fall) return { x: x + Math.sin(T * 55) * 0.05, y: -0.2, z, ry: 0 }; // the warning shake
  if (T < fall + 0.5) { const k = (T - fall) / 0.5; return { x, y: -0.2 - 12 * k * k, z, ry: 0 }; }
  if (T < fall + 1.6) return { x, y: -12.2, z, ry: 0 };
  // it reforms just under the surface and eases up into place (a plate rising from the depths would launch a falling ball)
  return { x, y: -0.8 + 0.6 * smooth(Math.min(1, (T - fall - 1.6) / 0.6)), z, ry: 0 };
};
const plate = (x, z, period, phase) => ({ t: 'mover', kind: 'floor', s: [2.6, 0.4, 2.6], path: quakePlate(x, z, period, phase), mat: 'netgrid', sideLook: 'holo' });

// cortex-3: seismic plates. A 3 x 4 grid of cells over the void. Six are anchored ground that never moves: down the
// left, across the second row (the right wall stops you on the far cell) and down the right, the safe way in three
// careful shots. The other six are plates that shake, fall away and reform, each on its own beat; the straight middle
// line crosses three of them, so time one roll. A Ninja paces the third row, plates and anchors alike.
const OPEN3 = {
  par: 2, time: 60,
  tee: [0, 0, -19.5], route: [[0, -19.5], [-2.6, -17.2], [-2.6, -13.3], [2.6, -13.3], [2.6, -6.8], [0, -1.2]],
  parts: [
    // the start, the six anchors and the landing are one slab; every edge it shares with a plate is open
    { t: 'floor', poly: [[-4, -21], [4, -21], [4, -17.2], [-1.3, -17.2], [-1.3, -14.6], [3.9, -14.6], [3.9, -6.8], [4, -6.8], [4, -1.0], [-4, -1.0], [-4, -6.8], [1.3, -6.8], [1.3, -12], [-3.9, -12], [-3.9, -17.2], [-4, -17.2]],
      open: [2, 3, 4, 8, 10, 11, 12] },
    plate(0, -15.9, 8, 0), plate(2.6, -15.9, 10, 0.55),
    plate(-2.6, -10.7, 11, 0.8), plate(0, -10.7, 7, 0.3), plate(-2.6, -8.1, 9, 0.35), plate(0, -8.1, 12, 0.65),
    // the pit's open sides
    { t: 'box', p: [4.05, -0.3, -15.9], s: [0.3, 1.4, 2.6], kind: 'wall', look: 'holo' },
    { t: 'box', p: [-4.05, -0.3, -9.4], s: [0.3, 1.4, 5.2], kind: 'wall', look: 'holo' },
    { t: 'monster', type: 'ninja', path: patrol([-2.6, -10.7], [2.6, -10.7], 6) },
  ],
};

// cortex-5: the Blok wall (ep 7: XANA walls a tower off with Bloks). Three stages: an S-bend between two Cortex blocks
// with a sliding block in the second gap; the wall itself, two staggered rows of Bloks with no straight line through
// (thread it on a diagonal, or hit the front middle Blok square in the eye at speed: it devirtualizes for 20 s and opens
// the middle); then the tower's plaza, where two Ninjas cross between data pillars.
const OPEN5 = {
  par: 2, time: 60,
  tee: [0, 0, -25.5], route: [[0, -25.5], [2.8, -21.5], [0, -20], [-2.8, -18.5], [-1.2, -16.5], [0, -11], [0, -1.2]],
  parts: [
    { t: 'floor', poly: rect(-4.5, -27, 4.5, -1.0), open: [2] },
    // the S-bend
    { t: 'wall', pts: [[-4.5, -21.5], [1.2, -21.5]], h: 0.6, thick: 0.4 },
    { t: 'wall', pts: [[-1.2, -18.5], [4.5, -18.5]], h: 0.6, thick: 0.4 },
    { t: 'mover', kind: 'obst', s: [2.0, 0.6, 0.5], path: patrol([-3.4, -18.5], [-2.3, -18.5], 3), look: 'holo' },
    // the wall of Bloks, narrowed by two Cortex blocks
    { t: 'box', p: [-4, 0.3, -14], s: [1, 0.6, 6], kind: 'wall', look: 'holo' },
    { t: 'box', p: [4, 0.3, -14], s: [1, 0.6, 6], kind: 'wall', look: 'holo' },
    ...[-2.4, 0, 2.4].map((x) => ({ t: 'monster', type: 'blok', p: [x, 0, -15.5], ry: Math.PI })),
    ...[-1.2, 1.2].map((x) => ({ t: 'monster', type: 'blok', p: [x, 0, -13], ry: Math.PI })),
    // the tower's plaza
    { t: 'deco', make: (THREE) => { const g = makeTower('#ff2a2a', 12, TOWER_BODY.cortex, { wisps: 24, shadows: false }); g.position.set(7.2, 0, -6.5); return g; } },
    { t: 'cyl', p: [-2.1, 0, -7.6], r: 0.35, h: 1.4, look: 'neon' },
    { t: 'cyl', p: [2.2, 0, -5.8], r: 0.35, h: 1.4, look: 'neon' },
    { t: 'cyl', p: [-0.7, 0, -3.6], r: 0.35, h: 1.4, look: 'neon' },
    { t: 'monster', type: 'ninja', path: patrol([-3.6, -9.6], [3.6, -4.2], 6) },
    { t: 'monster', type: 'ninja', path: patrol([3.6, -9.6], [-3.6, -4.2], 6, 0, 0.5) },
  ],
};

export default [
  {
    id: 'cortex-1', opening: false, name: 'Shifting Grid', sector: 'cortex', par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.4, 0, 21],
    parts: [
      // green: the grid has holes into the void behind and beside the cup
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 23], [-3, 23]], holes: [{ c: [1.4, 22.3], r: 0.5 }, { c: [-0.5, 21.4], r: 0.45 }, { c: [2.75, 20.4], r: 0.4 }] },
      // the terrain rearranges itself: blocks slide across the lane
      block([-3.8, 7], [3.8, 7], 4.2),
      block([3.8, 12], [-3.8, 12], 3.6, 0.3),
      block([-3.8, 16.5], [3.8, 16.5], 5, 0.6),
      { t: 'cyl', p: [1.2, 0, 18], r: 0.4, h: 1.2, look: 'neon' }, // a data pillar on the straight line to the cup
      { t: 'monster', type: 'ninja', path: patrol([-2.2, 9.5], [2.2, 9.5], 4.5) },
      { t: 'monster', type: 'krabe', path: patrol([-1.8, 19], [1.8, 19], 6, 0, 0.4) },
    ],
  },
  {
    id: 'cortex-2', opening: false, name: 'Vanishing Bridge', sector: 'cortex', par: 4, time: 150,
    tee: [0, 0, 0], cup: [-1.2, 0, 24],
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 7], [-3, 7]], open: [2] },
      // a bridge of blocks that fall away under you (they come back after a few seconds)
      ...[7.8, 9.4, 11, 12.6, 14.2].map((z) => ({ t: 'crumble', p: [0, 0, z], s: [2.4, 1.6], hits: 2 })),
      { t: 'floor', poly: [[-3, 15], [3, 15], [3, 27], [-3, 27]], open: [0] },
      { t: 'monster', type: 'manta', path: patrol([-3, 11], [3, 11], 6, 1.2), size: 0.8 },
      { t: 'monster', type: 'tarantula', path: patrol([-2, 20.5], [2, 20.5], 6) },
    ],
  },
  {
    id: 'cortex-3', opening: OPEN3, name: 'Data Current', sector: 'cortex', par: 3, time: 120,
    tee: [0, 0, 0], cup: [-2, 0, 17.5],
    parts: [
      { t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 20], [-4, 20]], holes: [{ c: [-2, 18.9], r: 0.5 }, { c: [-3.45, 16.9], r: 0.4 }, { c: [-0.4, 17.3], r: 0.4 }] },
      // a stream of data pushes everything to the right
      { t: 'zone', kind: 'conveyor', rect: [-4, 7, 4, 11], dir: [1, 0], speed: 3 },
      { t: 'wall', pts: [[-4, 13.5], [1, 13.5]], h: 0.5 },
      { t: 'monster', type: 'ninja', path: patrol([-3, 4], [3, 4], 4) },
      { t: 'monster', type: 'tarantula', path: patrol([2.2, 16], [2.2, 19], 5) },
    ],
  },
  {
    id: 'cortex-4', opening: false, name: 'Terrain Shift', sector: 'cortex', par: 4, time: 150,
    tee: [0, 0, 0], cup: [1.5, 2.4, 19],
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 6], [-3, 6]], open: [2] },
      // a block of ground that rises to the upper level and sinks back
      { t: 'mover', s: [3, 0.4, 3], path: elevator(0, 7.6, -0.2, 2.2, 8), sideLook: 's5' },
      { t: 'floor', y: 2.4, poly: [[-3, 9.1], [3, 9.1], [3, 22], [-3, 22]], open: [0], holes: [{ c: [1.5, 20.4], r: 0.5 }, { c: [2.55, 17.9], r: 0.36 }, { c: [0, 19.3], r: 0.4 }] },
      { t: 'mover', kind: 'obst', s: [3.4, 0.4, 0.3], path: spin(0, 2.6, 14, 5), look: 'holo' },
      { t: 'monster', type: 'krabe', path: patrol([-2, 17], [2, 17], 6, 2.4) },
      { t: 'monster', type: 'manta', path: patrol([-3, 3], [3, 3], 6.5, 1.0, 0.2), size: 0.8 },
    ],
  },
  {
    id: 'cortex-5', opening: OPEN5, name: 'Ninja Field', sector: 'cortex', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 21.5],
    parts: [
      { t: 'floor', poly: [[-4.5, -1.2], [4.5, -1.2], [4.5, 24], [-4.5, 24]] },
      // Tyron's ninjas pace the field and dash at anything that stops near them
      { t: 'monster', type: 'ninja', path: patrol([-3.4, 8], [3.4, 8], 7) },
      { t: 'monster', type: 'ninja', path: patrol([3.4, 13.5], [-3.4, 13.5], 6, 0, 0.5) },
      { t: 'wall', pts: [[-4.5, 18], [-1, 18]], h: 0.5 },
      { t: 'wall', pts: [[1.6, 18], [4.5, 18]], h: 0.5 },
      { t: 'monster', type: 'tarantula', path: patrol([-3, 11], [3, 11], 7, 0, 0.3) },
    ],
  },
  {
    id: 'cortex-6', opening: false, name: 'The Core', sector: 'cortex', par: 5, time: 170,
    tee: [0, 0, 0], cup: [0, 1.5, 26],
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 10], [-3, 10]], open: [2] },
      { t: 'ramp', a: [0, 10], b: [0, 16], w: 3, ya: 0, yb: 1.5 },
      { t: 'floor', y: 1.5, poly: [[-3, 16], [-1.5, 16], [1.5, 16], [3, 16], [7, 19], [7, 27], [3, 30], [-3, 30], [-7, 27], [-7, 19]], open: [1] },
      // the Core: XANA's heart, a glowing sphere hanging over the last cup
      { t: 'deco', make: (THREE) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 20), new THREE.MeshBasicMaterial({ color: '#f4eeff' })));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(2.3, 32, 20), new THREE.MeshBasicMaterial({ color: '#9a6bff', transparent: true, opacity: 0.25, depthWrite: false })));
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(3 + i * 0.5, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: '#c8b0ff' }));
          r.rotation.set(Math.PI / 2 + i * 0.5, i * 0.7, 0);
          g.add(r);
        }
        g.position.set(0, 8, 23);
        return g;
      } },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2], path: orbit([0, 26], 2.4, 7, 1.75), look: 'holo' },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2], path: orbit([0, 26], 2.4, 7, 1.75, 0.5), look: 'holo' },
      { t: 'monster', type: 'ninja', path: patrol([-4, 21], [4, 21], 5, 1.5) },
      { t: 'monster', type: 'manta', path: orbit([0, 23], 5, 12, 2.8), size: 0.9 },
    ],
  },
];
