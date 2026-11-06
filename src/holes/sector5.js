import { rect, circlePoly, patrol, orbit, spin, elevator, shuttle } from './helpers.js';

// Sector 5 — CARTHAGE: sliding bridges, closing walls, Creepers, Mantas and the Scyphozoa.
// The openings (docs/lore.md) are the way in, as in the show: the Arena with the XANA eye on its floor, whose
// way out changes every time you come (the labyrinth reconfigures), and the Key's room with its rising blocks
// (ep 65), Creepers crawling over its walls.

/** The Eye of XANA drawn on the floor (decor): a ring, its pupil and the four strokes. */
const floorEye = (x, z, r, y = 0) => ({
  t: 'deco',
  make: (THREE) => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: '#b3122a', transparent: true, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.72, 48), m);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.2, 32), m);
    g.add(ring, pupil);
    for (const [len, ox, oz, a] of [[r * 0.9, 0, r * 0.95, 0], [r * 0.5, 0, -r * 0.92, 0], [r * 0.5, -r * 0.6, -r * 0.75, 0.6], [r * 0.5, r * 0.6, -r * 0.75, -0.6]]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.09, len), m);
      bar.position.set(ox, 0, oz);
      bar.rotation.z = a;
      g.add(bar);
    }
    g.children.forEach((c) => { c.rotation.x = -Math.PI / 2; });
    g.position.set(x, y + 0.02, z);
    return g;
  },
});

// sector5-2: the Arena. Three ways out, and their doors open and shut in turn: wait for the one in line with
// you, or go for whichever is open now. Creepers pop up across the hall.
const door = (x, phase) => ({ t: 'mover', kind: 'obst', s: [1.6, 0.6, 0.3], path: shuttle([x, -0.62, -6.4], [x, 0.3, -6.4], 9, phase, 0.6), look: 's5' });
const OPEN2 = {
  par: 1, time: 30,
  tee: [0, 0, -14.5], route: [[0, -14.5], [0, -7], [0, -4.5], [0, -1.2]],
  parts: [
    { t: 'floor', poly: [[-4, -16.5], [4, -16.5], [5, -15.5], [5, -8], [4, -7], [3.8, -7], [2.2, -7], [0.8, -7], [-0.8, -7], [-2.2, -7], [-3.8, -7], [-4, -7], [-5, -8], [-5, -15.5]], open: [5, 7, 9] },
    floorEye(0, -11.2, 3.2),
    ...[-3, 0, 3].map((x) => ({ t: 'floor', poly: rect(x - 0.8, -7.2, x + 0.8, -4.3), open: [0, 2] })),
    door(-3, 0), door(0, 1 / 3), door(3, 2 / 3),
    { t: 'monster', type: 'creeper', p: [-2.6, 0, -10], period: 4.2, phase: 0.1 },
    { t: 'monster', type: 'creeper', p: [2.6, 0, -12.4], period: 4.2, phase: 0.6 },
    { t: 'floor', poly: [[-4, -4.5], [-3.8, -4.5], [-2.2, -4.5], [-0.8, -4.5], [0.8, -4.5], [2.2, -4.5], [3.8, -4.5], [4, -4.5], [4, -1.0], [1.5, -1.0], [-1.5, -1.0], [-4, -1.0]], open: [1, 3, 5, 9] },
  ],
};

// sector5-3: the Key's room (ep 65): rows of blocks rise and sink across two lanes. The left lane's rhythm is
// slow and forgiving, the right lane's fast and tight; a Creeper crawls along the wall between them. The Key,
// a XANA eye, waits at the far end.
const blocks = (x, period, n = 3) => Array.from({ length: n }, (_, k) => ({
  t: 'mover', kind: 'obst', s: [2.6, 0.7, 0.6], path: shuttle([x, -0.4, -13 + k * 3.4], [x, 0.35, -13 + k * 3.4], period, k / n, 0.5), look: 's5',
}));
const OPEN3 = {
  par: 1, time: 30,
  tee: [0, 0, -16.8], route: [[0, -16.8], [-1.5, -15], [-1.5, -3], [0, -1.2]],
  parts: [
    { t: 'floor', poly: rect(-3, -18.5, 3, -1.0), open: [2] },
    { t: 'wall', pts: [[0, -15.2], [0, -3.6]], h: 0.6, thick: 0.4 },
    ...blocks(-1.5, 7.5), ...blocks(1.5, 4.2),
    { t: 'monster', type: 'creeper', wall: { a: [0, -14], b: [0, -5], y: 0.22, face: Math.PI / 2 }, period: 6.5 },
    floorEye(0, -2.4, 1.1),
  ],
};

export default [
  {
    id: 'sector5-1', opening: false, name: 'Arena Entry', sector: 'sector5', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 30],
    hio: 'The bridges pause in the middle one after another — putt hard and straight right as the first one locks in.',
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 4), open: [2] },
      { t: 'mover', s: [2.2, 0.4, 6.4], path: shuttle([-3.8, -0.2, 7], [0, -0.2, 7], 6, 0.4, 0.4), extent: [[-4.7, 7], [4.7, 7]] },
      { t: 'floor', poly: rect(-3, 10, 3, 14), open: [0, 2] },
      { t: 'mover', s: [2.2, 0.4, 4.4], path: shuttle([3.8, -0.2, 16], [0, -0.2, 16], 6, 0.25, 0.4), extent: [[-4.7, 16], [4.7, 16]] },
      { t: 'floor', poly: rect(-3, 18, 3, 22), open: [0, 2] },
      { t: 'mover', s: [2.2, 0.4, 4.4], path: shuttle([-3.8, -0.2, 24], [0, -0.2, 24], 6, 0.1, 0.4), extent: [[-4.7, 24], [4.7, 24]] },
      { t: 'floor', poly: rect(-3, 26, 3, 33.5), open: [0] },
      { t: 'monster', type: 'manta', path: patrol([-4.5, 12], [4.5, 12], 7, 1.1) },
      { t: 'monster', type: 'manta', path: patrol([4.5, 20], [-4.5, 20], 6, 1.1, 0.4) },
      { t: 'monster', type: 'creeper', p: [1.6, 0, 28.2], period: 4.5, phase: 0 },
      { t: 'monster', type: 'creeper', p: [-1.7, 0, 31.4], period: 4.5, phase: 0.5 },
    ],
  },
  {
    id: 'sector5-2', opening: OPEN2, name: 'Closing Walls', sector: 'sector5', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 25.8],
    hio: 'Frogger: time one straight putt through all three gates and past the sweeper.',
    parts: [
      { t: 'floor', poly: rect(-1.5, -1.2, 1.5, 20), open: [2] },
      ...[[5, 3.0, 0], [10, 4.0, 0.35], [15, 5.0, 0.7]].flatMap(([z, P, ph]) => [
        { t: 'mover', kind: 'wall', s: [1.6, 0.55, 0.4], path: shuttle([-2.35, 0.27, z], [-0.78, 0.27, z], P, ph, 0.4), look: 's5' },
        { t: 'mover', kind: 'wall', s: [1.6, 0.55, 0.4], path: shuttle([2.35, 0.27, z], [0.78, 0.27, z], P, ph, 0.4), look: 's5' },
      ]),
      { t: 'monster', type: 'creeper', p: [0.65, 0, 7.5], period: 3.6, phase: 0.2 },
      { t: 'monster', type: 'creeper', p: [-0.65, 0, 12.5], period: 3.6, phase: 0.7 },
      { t: 'floor', poly: [[-4, 20], [-1.5, 20], [1.5, 20], [4, 20], [4, 28.5], [-4, 28.5]], open: [1] },
      { t: 'mover', kind: 'obst', s: [3.4, 0.4, 0.3], path: spin(0, 0.2, 23, 4.5), look: 's5' },
    ],
  },
  {
    id: 'sector5-3', opening: OPEN3, name: 'Celestial Dome', sector: 'sector5', par: 4, time: 150,
    tee: [0, 0, 0], cup: [2, 3, 15],
    hio: 'Hit the boost pad on the right: up the steep ramp, into the dome while the fence gap faces you.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 6], [2.7, 6], [1.3, 6], [1.2, 6], [-1.2, 6], [-3, 6]], open: [3, 5] },
      { t: 'zone', kind: 'boost', rect: [1.3, 0.8, 2.7, 3.8], dir: [0, 1], speed: 12.5, align: 3 },
      { t: 'ramp', a: [2, 4], b: [2, 9.45], w: 1.4, ya: 0, yb: 3 }, // tops out exactly at the dome's edge
      // a second booster near the crest so balls arrive on the dome at a holeable pace
      { t: 'zone', kind: 'boost', rect: [1.3, 6.8, 2.7, 8.6], y: 2, dir: [0, 1], speed: 6.6 },
      { t: 'mover', s: [2.4, 0.4, 2.9], path: elevator(0, 7.55, -0.2, 2.8, 8), sideLook: 's5' },
      { t: 'floor', y: 3, poly: circlePoly(0, 14, 5, 24), open: [17, 18, 19] },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2.4], path: orbit([2, 15], 1.9, 6, 3.25, 0), look: 's5' },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2.4], path: orbit([2, 15], 1.9, 6, 3.25, 0.5), look: 's5' },
      { t: 'monster', type: 'scyphozoa', path: orbit([0, 14.5], 2.6, 14, 5.2), grab: [0, 3.3, 10.2] },
      { t: 'monster', type: 'manta', path: patrol([-3.5, 3], [3.5, 3], 6, 1.0, 0.25) },
    ],
  },
  {
    id: 'sector5-4', opening: false, name: 'Core Elevator', sector: 'sector5', par: 4, time: 150,
    tee: [0, 0, 0], cup: [2, 2.4, 18.5],
    hio: 'The narrow boost ramp on the right shoots you onto the upper deck, past the spinner, into the cup.',
    parts: [
      { t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 6], [3.4, 6], [1.8, 6], [0.6, 6], [-2.6, 6], [-4, 6]], open: [3, 5] },
      // the lift: ride it up, then putt off it
      { t: 'mover', s: [3.2, 0.4, 3], path: elevator(-1, 7.6, -0.2, 2.2, 9), sideLook: 's5' },
      // the shortcut: a boosted ramp
      { t: 'zone', kind: 'boost', rect: [1.9, 1, 3.3, 5], dir: [0, 1], speed: 14, align: 3 },
      { t: 'ramp', a: [2.6, 6], b: [2.6, 10.5], w: 1.4, ya: 0, yb: 2.4 },
      { t: 'zone', kind: 'boost', rect: [1.9, 6.4, 3.3, 10.2], dir: [0, 1], speed: 7.5, hidden: true }, // keeps you climbing
      { t: 'floor', y: 2.4, poly: [[-4, 9.1], [-2.6, 9.1], [0.6, 9.1], [1.9, 9.1], [1.9, 10.5], [3.3, 10.5], [4, 10.5], [4, 21], [-4, 21]], open: [1, 4], holes: [{ c: [2, 19.9], r: 0.5 }, { c: [3.4, 18.2], r: 0.4 }] },
      // green: a data gate slides across the line from the boost ramp to the cup
      { t: 'mover', kind: 'obst', s: [1.3, 0.4, 0.3], path: patrol([0.6, 16.9], [3.4, 16.9], 4.2, 2.4), look: 's5' },
      { t: 'mover', kind: 'obst', s: [3.4, 0.4, 0.3], path: spin(1, 2.6, 14.5, 4.5), look: 's5' },
      { t: 'monster', type: 'creeper', p: [-2.4, 2.4, 18], period: 4, phase: 0.3 },
      { t: 'monster', type: 'manta', path: patrol([-3.5, 3], [3.5, 3], 6.5, 1.0, 0.2) },
    ],
  },
  {
    id: 'sector5-5', opening: false, name: 'Firewall Maze', sector: 'sector5', par: 4, time: 150,
    tee: [-3, 0, 0], cup: [3, 0, 22],
    hio: 'Straight diagonal through both gates at the moment they line up.',
    parts: [
      { t: 'floor', poly: rect(-5, -1.2, 5, 25) },
      // fixed maze walls
      { t: 'wall', pts: [[-5, 7], [-1, 7]], h: 0.6 },
      { t: 'wall', pts: [[1.4, 7], [5, 7]], h: 0.6 },
      { t: 'wall', pts: [[-5, 15], [0.6, 15]], h: 0.6 },
      { t: 'wall', pts: [[3, 15], [5, 15]], h: 0.6 },
      // sliding gate blocks in the gaps
      { t: 'mover', kind: 'wall', s: [2.4, 0.6, 0.4], path: shuttle([0.2, 0.3, 7], [-2.2, 0.3, 7], 5, 0, 0.5), look: 's5' },
      { t: 'mover', kind: 'wall', s: [2.4, 0.6, 0.4], path: shuttle([1.8, 0.3, 15], [4.2, 0.3, 15], 4, 0.25, 0.5), look: 's5' },
      { t: 'monster', type: 'creeper', p: [-2.6, 0, 11], period: 4.2, phase: 0 },
      { t: 'monster', type: 'creeper', p: [2.8, 0, 11.4], period: 4.2, phase: 0.5 },
      { t: 'monster', type: 'creeper', p: [0, 0, 19.5], period: 3.8, phase: 0.25 },
    ],
  },
  {
    id: 'sector5-6', opening: false, name: 'Core of Lyoko', sector: 'sector5', par: 5, time: 170,
    tee: [0, 0, 0], cup: [0, 0, 33],
    hio: 'Ride the turning disc and the sliding bridge without stopping: one long, perfectly timed putt.',
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 5), open: [2] },
      { t: 'mover', shape: 'cyl', r: 3, h: 0.5, path: spin(0, -0.25, 8, 8), sideLook: 's5' },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2.6], path: orbit([0, 8], 2.4, 8, 0.25), look: 's5' },
      { t: 'floor', poly: rect(-2, 11, 2, 15), open: [0, 2] },
      { t: 'mover', s: [2.2, 0.4, 4.4], path: shuttle([3.8, -0.2, 17.2], [0, -0.2, 17.2], 6, 0.2, 0.4), extent: [[-4.7, 17.2], [4.7, 17.2]] },
      { t: 'floor', poly: circlePoly(0, 28, 8.6, 40), open: [29, 30] },
      // the Core: a great white sphere you circle round
      { t: 'deco', make: (THREE) => {
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 20), new THREE.MeshStandardMaterial({ color: '#f4f7ff', emissive: '#4a8cff', emissiveIntensity: 0.6, roughness: 0.3 }));
        core.position.set(0, 7, 28); g.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: '#7ac8ff' }));
        ring.position.set(0, 7, 28); ring.rotation.x = Math.PI / 2; g.add(ring);
        return g;
      } },
      ...[[-2.6, 23.6], [2.8, 23.2], [-3.6, 31], [3.5, 31.4]].map(([x, z]) => ({ t: 'cyl', p: [x, 0, z], r: 0.35, h: 1.4, look: 's5' })),
      { t: 'monster', type: 'scyphozoa', path: orbit([0, 28], 5, 16, 2.6), grab: [0, 0.3, 21.6] },
      { t: 'monster', type: 'creeper', p: [-1.6, 0, 33.5], period: 4.4, phase: 0.6 },
    ],
  },
];
