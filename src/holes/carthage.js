import { rect, patrol, orbit, spin, elevator } from './helpers.js';

// CARTHAGE · THE CORE (deep in Sector 5): the white halls round the Core of Lyoko. Data streams carry
// you sideways, rings of wall spin, lifts climb the shafts, Creepers crawl along the walls and the
// Guardians drift through the vault. The Core chamber itself is the last hole.

const stream = (x0, z0, x1, z1, dir, speed = 2.5, y = 0) => ({ t: 'zone', kind: 'conveyor', rect: [x0, z0, x1, z1], dir, speed, y });
const gate = (a, b, period, phase = 0, y = 0, w = 1.2) => ({ t: 'mover', kind: 'obst', s: [w, 0.4, 0.3], path: patrol(a, b, period, y, phase), look: 's5' });
// a Creeper crawling along the top of an inner wall (h 0.6) from a to b, facing `face`
const wallCreeper = (a, b, face, period = 7, phase = 0, y = 0) => ({ t: 'monster', type: 'creeper', wall: { a, b, y: y + 0.22, face }, period, phase });

// The openings (docs/lore.md, G15): the way to the Core. A fast circular elevator that never stops carries the heroes
// up to the Celestial Dome, where a path over the void leads to the interface (touching it hatches Mantas); the Core
// room is entered through huge snapping jaws: "ending up between its fangs means devirtualization".

/** The ring elevator: it never stops, it only slows at the top and the bottom (~0.5 s). */
const ringLift = (x, z, y0, y1, period, phase = 0) => (t) => {
  const u = ((((t / period) + phase) % 1) + 1) % 1;
  const k = u < 0.5 ? u * 2 : 2 - u * 2;
  const e = Math.min(1, Math.max(0, (k - 0.08) / 0.84));
  return { x, y: y0 + (y1 - y0) * e * e * (3 - 2 * e), z, ry: 0 };
};

// carthage-1: the Celestial Dome. Ride the ring elevator that never stops up to the dome (time getting on and off), then
// cross over the void to the interface: jump the gap off the lip in the middle (a Manta patrols over it), or take the
// rim path round the left, railed on the outside but open to the void inside: three careful shots. Mantas hatch over it. A long slope brings you down to the hall.
const OPEN1 = {
  par: 2, time: 60,
  tee: [0, 0, -31], route: [[0, -31], [0, -27.5], [0, -24], [-5.2, -23], [-5.2, -17], [0, -15], [0, -8], [0, -1.2]],
  parts: [
    // the shaft's foot (y 0) and the elevator
    { t: 'floor', poly: rect(-3.5, -33, 3.5, -29), open: [2] },
    // it rides 0.15 past the floor at the bottom and past the deck at the top, so you can step on and off as it turns
    { t: 'mover', s: [3, 0.4, 3], path: ringLift(0, -27.5, -0.35, 2.95, 7), sideLook: 's5' },
    // the dome (y 3): the landing, the rim path round the left (2.2 wide, railed on the outside, open to the void inside)
    // and the interface's platform, one slab
    { t: 'floor', y: 3, poly: [[-3.5, -26], [3.5, -26], [3.5, -22], [-3.5, -22], [-4.4, -22], [-4.4, -18.6], [-3.5, -18.6], [3.5, -18.6], [3.5, -12], [-3.5, -12], [-3.5, -16], [-6.6, -16], [-6.6, -24], [-3.5, -24]],
      open: [0, 2, 3, 4, 5, 6, 8] },
    // the jump: a lip in the middle of the landing's edge, 3.4 of void to the interface's platform
    { t: 'ramp', a: [0, -23.2], b: [0, -22], w: 1.8, ya: 3, yb: 3.35, jump: true, walls: false },
    // the interface (decor) and the Mantas it hatches
    { t: 'deco', make: (THREE) => { const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: '#7ad7ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), m); scr.position.set(2.8, 4.7, -15); scr.rotation.y = -Math.PI / 2; g.add(scr);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 10), new THREE.MeshStandardMaterial({ color: '#f4f7ff', emissive: '#1a3cff', emissiveIntensity: 0.3 })); col.position.set(2.8, 3.8, -15); g.add(col); return g; } },
    { t: 'monster', type: 'manta', path: patrol([-3.4, -20.3], [3.4, -20.3], 6, 3.9), size: 0.8 }, // over the gap
    { t: 'monster', type: 'manta', path: patrol([-3, -14.5], [3, -14.5], 8, 4.2, 0.5), size: 0.8 },
    // down to the hall
    { t: 'ramp', a: [0, -12], b: [0, -5], w: 3, ya: 3, yb: 0 },
    { t: 'floor', poly: rect(-3.5, -5, 3.5, -1.0), open: [0, 2] },
  ],
};

// carthage-6: the jaws. A hall split by a wall: on the left a data stream rushes you to the Core room's door, arriving
// when the stream says; on the right you go at your own pace past a Creeper on the wall. Then the jaws: two fangs that
// hold open, snap shut and reopen. Be in the mouth when they snap and you're devirtualized.
const OPEN6 = {
  par: 2, time: 60,
  tee: [1.5, 0, -24.5], route: [[1.5, -24.5], [2, -20], [2, -12], [0, -8.5], [0, -1.2]],
  parts: [
    { t: 'floor', poly: [[-4, -26], [4, -26], [4, -11], [1.8, -9.6], [1.8, -7.4], [6, -7.4], [6, -1.0], [-6, -1.0], [-6, -7.4], [-1.8, -7.4], [-1.8, -9.6], [-4, -11]], open: [6] },
    { t: 'wall', pts: [[0, -20.5], [0, -12]], h: 0.6, thick: 0.4 },
    stream(-3.6, -19.5, -0.4, -12.2, [0, 1], 3.6),
    wallCreeper([0, -19.5], [0, -13], Math.PI / 2, 6.5),
    { t: 'bumper', p: [2.6, 0, -16.2], r: 0.38 },
    // the jaws
    // the mouth is never a safe spot to come back to (or the jaws would bite you again and again)
    { t: 'zone', kind: 'slow', rect: [-1.8, -9.6, 1.8, -7.4], mul: 1, hidden: true, unsafe: true },
    { t: 'monster', type: 'fang', open: [-2.9, -8.5], shut: [-1.1, -8.5], period: 4.5, phase: 0 },
    { t: 'monster', type: 'fang', open: [2.9, -8.5], shut: [1.1, -8.5], period: 4.5, phase: 0 },
    { t: 'monster', type: 'creeper', p: [-4.2, 0, -4.2], period: 4.4, phase: 0.3 },
  ],
};

export default [
  {
    id: 'carthage-1', opening: OPEN1, name: 'Data Stream Hall', sector: 'carthage', par: 3, time: 120,
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
    id: 'carthage-2', opening: false, name: 'Spinning Rings', sector: 'carthage', par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.2, 0, 20.5],
    parts: [
      { t: 'floor', poly: rect(-4.5, -1.2, 4.5, 23.5), holes: [{ c: [1.2, 22], r: 0.5 }, { c: [2.9, 20.2], r: 0.42 }, { c: [-0.4, 21.3], r: 0.4 }] },
      // the hall's wall rings turn: two spinning arms to slip past
      { t: 'mover', kind: 'obst', s: [3.6, 0.4, 0.3], path: spin(-1.6, 0.2, 8.5, 5), look: 's5' },
      { t: 'mover', kind: 'obst', s: [3.6, 0.4, 0.3], path: spin(1.6, 0.2, 14, 4.4, 0.3), look: 's5' },
      { t: 'bumper', p: [2.8, 0, 5], r: 0.4 }, { t: 'bumper', p: [-3, 0, 17], r: 0.4 },
      { t: 'monster', type: 'blok', path: patrol([-3.6, 17.8], [3.6, 17.8], 7) },
      { t: 'monster', type: 'creeper', p: [-3.2, 0, 11.5], period: 4.4, phase: 0.2 },
    ],
  },
  {
    id: 'carthage-3', opening: false, name: 'Lift Shafts', sector: 'carthage', par: 4, time: 150,
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
    id: 'carthage-4', opening: false, name: 'Creeper Walls', sector: 'carthage', par: 4, time: 150,
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
    id: 'carthage-5', opening: false, name: 'The Key Vault', sector: 'carthage', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 0, 17],
    parts: [
      { t: 'floor', poly: rect(-4.5, -1.2, 4.5, 20), holes: [{ c: [0, 18.5], r: 0.5 }, { c: [-1.6, 17.6], r: 0.42 }, { c: [1.6, 17.6], r: 0.42 }] },
      { t: 'bumper', p: [-2.2, 0, 6], r: 0.42 }, { t: 'bumper', p: [2.2, 0, 6], r: 0.42 }, { t: 'bumper', p: [0, 0, 11], r: 0.36 },
      // the Key's room: Creepers guard it (ep 34), a Blok circles the middle
      { t: 'monster', type: 'blok', path: orbit([0, 9.5], 2.6, 10) },
      { t: 'monster', type: 'creeper', p: [-1.9, 0, 14.2], period: 4.6, phase: 0.1 },
      { t: 'monster', type: 'creeper', p: [1.9, 0, 14.2], period: 4.6, phase: 0.6 },
      { t: 'monster', type: 'kankrelat', path: patrol([-3.6, 3], [3.6, 3], 4.5) },
    ],
  },
  {
    id: 'carthage-6', opening: OPEN6, name: 'The Core Chamber', sector: 'carthage', par: 5, time: 170,
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
