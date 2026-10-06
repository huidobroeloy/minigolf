import { rect, patrol, orbit, circlePoly } from './helpers.js';

// THE DIGITAL SEA (season 4): the gang crosses it in the Skidbladnir. Underwater the ball floats
// a little when airborne. Glass tubes and warp pipes (very Mario), currents that carry you,
// bubble columns that lift you, Sharks that ram and Kongre's tentacles sweeping the lanes.

const current = (x0, z0, x1, z1, dir, speed = 3, y = 0) => ({ t: 'zone', kind: 'current', rect: [x0, z0, x1, z1], dir, speed, y });
const coral = (x, z, r = 0.45, y = 0) => ({ t: 'bumper', p: [x, y, z], r, color: '#3fc6ff' });

/** A ring gateway (decor) facing along z. */
const gateway = (x, y, z, r = 1.6) => ({
  t: 'deco',
  make: (THREE) => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 10, 40), new THREE.MeshBasicMaterial({ color: '#6fe7ff' }));
    const film = new THREE.Mesh(new THREE.CircleGeometry(r - 0.05, 40), new THREE.MeshBasicMaterial({ color: '#2a7fff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    g.add(ring, film);
    g.position.set(x, y + r + 0.1, z);
    return g;
  },
});

export default [
  {
    id: 'sea-1', name: 'Skid Launch Bay', sector: 'sea', water: true, par: 3, time: 120,
    tee: [0, 2, 0], cup: [0, 0.8, 22.4],
    hio: 'Down the launch tube with just enough speed to climb onto the landing pad.',
    parts: [
      // the docking bay, up on the Skid's deck
      { t: 'floor', y: 2, poly: [[-2, -1.2], [2, -1.2], [2, 4], [0.6, 4], [-0.6, 4], [-2, 4]], open: [3] },
      { t: 'tube', pts: [[0, 2, 3.7], [0, 1.8, 6.5], [0, 0.9, 9.5], [0, 0.1, 12.2], [0, 0, 14]], r: 0.5 },
      { t: 'floor', poly: [[-4, 13.6], [-0.6, 13.6], [0.6, 13.6], [4, 13.6], [4, 19], [-4, 19]], open: [1, 4] },
      { t: 'ramp', a: [0, 19], b: [0, 20.6], w: 8, ya: 0, yb: 0.8 },
      { t: 'floor', y: 0.8, poly: rect(-4, 20.6, 4, 25), open: [0] },
      coral(-2.4, 16.2), coral(2.2, 17.2), coral(-1.6, 23.6, 0.35, 0.8), coral(1.9, 22.2, 0.35, 0.8),
      { t: 'monster', type: 'shark', path: patrol([-3, 17.6], [3, 17.6], 5.5), range: 4 },
    ],
  },
  {
    id: 'sea-2', name: 'Data Current', sector: 'sea', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 23],
    hio: 'Hard enough to cut straight through both currents before they carry you off.',
    parts: [
      // the river banks are open where the currents flow out: drift too long and you're swept away
      { t: 'floor', poly: [[-5, -1.2], [5, -1.2], [5, 8], [5, 11], [5, 26], [-5, 26], [-5, 19], [-5, 16]], open: [2, 6] },
      current(-5, 8, 5, 11, [1, 0], 3.2),
      current(-5, 16, 5, 19, [-1, 0], 3.2),
      coral(-2.5, 5), coral(2.8, 13.5), coral(-1.5, 13.8, 0.35), coral(2.7, 21.2),
      { t: 'monster', type: 'kongre', p: [-5.6, 0, 21], len: 6.5, sweep: [0.35, 2.75], period: 9 },
    ],
  },
  {
    id: 'sea-3', name: 'Warp Pipe Maze', sector: 'sea', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 21],
    parts: [
      { t: 'floor', poly: [[-4.5, -1.2], [4.5, -1.2], [4.5, 8], [-4.5, 8], [-4.5, 7], [-4.5, 5]], open: [4] },
      { t: 'wall', pts: [[-1.25, 3.5], [-1.25, 8]], h: 0.5 },
      { t: 'wall', pts: [[1.25, 3.5], [1.25, 8]], h: 0.5 },
      { t: 'warp', a: [-2.9, 0, 6.6], b: [-3, 0, 15.2], dir: [0.45, 1], speed: 3.2, color: '#3ad14a' },
      { t: 'warp', a: [0, 0, 6.6], b: [3.4, 0, 15.2], dir: [-0.45, 1], speed: 3, color: '#3ad14a' }, // the far side of the island, never next to the cup
      { t: 'warp', a: [2.9, 0, 6.6], b: [3.4, 0, 0.6], dir: [0, 1], speed: 2.5, color: '#3ad14a' }, // back to the start!
      // the island with the cup, out across open water
      { t: 'floor', poly: [[-4.5, 14], [-3.3, 14], [4.5, 14], [4.5, 25], [-4.5, 25]], open: [0] },
      { t: 'wall', pts: [[-0.9, 18.4], [1.8, 18.4]], h: 0.5 },
      coral(-2.4, 20.6), coral(2.4, 20.4),
      // a slow glass bridge for the patient: a long way round
      { t: 'tube', pts: [[-3.4, 0, 5.8], [-5.4, 0, 6.3], [-6.3, 0, 9.5], [-6.1, 0, 12.5], [-3.9, 0, 14.7]], r: 0.55 },
    ],
  },
  {
    id: 'sea-4', name: 'Shark Reef', sector: 'sea', water: true, par: 4, time: 150,
    tee: [0, 0, 0], cup: [11, 0, 15],
    hio: 'Bank off the angled reef wall in the corner and let it roll down the channel.',
    parts: [
      { t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 12], [14, 12], [14, 18], [-2.5, 18]] },
      { t: 'wall', pts: [[-2.5, 15.5], [0, 18]], h: 0.5, thick: 0.35 }, // bank
      coral(-1, 5.5), coral(1.2, 8.5), coral(5.5, 13.2), coral(7.5, 16.8), coral(9.2, 13.5, 0.35),
      { t: 'monster', type: 'shark', path: patrol([-1.8, 10.5], [1.8, 10.5], 4.5), range: 4 },
      { t: 'monster', type: 'shark', path: patrol([6.5, 12.8], [6.5, 17.2], 5, 0, 0.5), range: 4 },
    ],
  },
  {
    id: 'sea-5', name: 'Replika Gateway', sector: 'sea', water: true, par: 3, time: 120,
    tee: [0, 0, 0], cup: [-0.2, 2.2, 13.2], yaw: 0,
    hio: 'The bubble lift is the safe way up. The spiral tube, at the right speed, rolls you straight in.',
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 2.4], [3, 5.6], [3, 10.5], [-3, 10.5]], open: [2] },
      // bubble lift up to the gateway deck
      { t: 'zone', kind: 'bubble', c: [-1.9, 9.3], r: 0.8, height: 3.4, lift: 1.8, push: [0, 2.2] },
      { t: 'floor', y: 2.2, poly: [[-3, 10.5], [3, 10.5], [3, 11.6], [3, 14.2], [3, 18.5], [-3, 18.5]], open: [0, 2] }, // the lift drops you over the front edge
      { t: 'box', p: [0, 1.1, 10.6], s: [6, 2.2, 0.2], kind: 'wall', look: '#123a6a' },
      // the long way: a glass tube spiralling up round the side
      { t: 'tube', pts: [[2.2, 0, 3.4], [4.4, 0.2, 4.6], [5.2, 0.9, 8], [4.6, 1.9, 11.4], [3.6, 2.2, 12.7], [2.2, 2.2, 13]], r: 0.55 },
      coral(1.2, 16.2, 0.35, 2.2), coral(-2.2, 16.8, 0.35, 2.2),
      gateway(0, 2.2, 17.6),
    ],
  },
  {
    id: 'sea-6', name: 'Kongre’s Abyss', sector: 'sea', water: true, par: 5, time: 170,
    tee: [0, 0, 0], cup: [1.8, 0, 41],
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 12], [0.6, 12], [-0.6, 12], [-3, 12]], open: [3] },
      // dive tube down into the abyss
      { t: 'tube', pts: [[0, 0, 11.6], [0, -0.5, 14], [0, -2.2, 17], [0, -3, 19.5]], r: 0.55 },
      { t: 'floor', y: -3, poly: [[-6, 19], [-0.6, 19], [0.6, 19], [6, 19], [6, 34], [-6, 34]], open: [1] },
      { t: 'monster', type: 'kongre', p: [-6.4, -3, 24.5], len: 7, sweep: [0.3, 2.8], period: 8 },
      { t: 'monster', type: 'kongre', p: [6.4, -3, 29.5], len: 7, sweep: [-0.3, -2.8], period: 8, phase: 0.5 },
      current(-6, 26.5, 6, 27.5, [1, 0], 2.4, -3),
      coral(-3, 22), coral(3.5, 32),
      // the bubble lift back up to the final deck
      { t: 'zone', kind: 'bubble', c: [0, 33], r: 0.9, height: 4.4, lift: 1.8, push: [0, 2.2] },
      { t: 'floor', poly: rect(-3, 34, 3, 44), open: [0], holes: [{ c: [-0.4, 43], r: 0.8 }, { c: [-2.2, 42.6], r: 0.55 }, { c: [2.4, 43.3], r: 0.55 }] },
      { t: 'box', p: [0, -1.5, 34.1], s: [6, 3, 0.2], kind: 'wall', look: '#123a6a' },
      { t: 'monster', type: 'shark', path: orbit([0, 38], 2.2, 9), range: 3.5 },
    ],
  },
];
