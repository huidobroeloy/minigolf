import { patrol, orbit, spin, elevator } from './helpers.js';

// THE CORTEX (season 4): XANA's own world inside a sphere floating in the Digital Sea. Its ground is
// made of blocks that keep shifting, rising and falling away, and at its heart sits the Core.
// Ninjas guard it, with Krabes, Tarantulas and Mantas.

const block = (a, b, period, phase = 0) => ({ t: 'mover', kind: 'obst', s: [2.4, 0.6, 0.5], path: patrol(a, b, period, 0, phase), look: 'holo' });

export default [
  {
    id: 'cortex-1', name: 'Shifting Grid', sector: 'cortex', par: 3, time: 120,
    tee: [0, 0, 0], cup: [1.4, 0, 21],
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 23], [-3, 23]] },
      // the terrain rearranges itself: blocks slide across the lane
      block([-3.8, 7], [3.8, 7], 4.2),
      block([3.8, 12], [-3.8, 12], 3.6, 0.3),
      block([-3.8, 16.5], [3.8, 16.5], 5, 0.6),
      { t: 'monster', type: 'ninja', path: patrol([-2.2, 9.5], [2.2, 9.5], 4.5) },
      { t: 'monster', type: 'krabe', path: patrol([-1.8, 19], [1.8, 19], 6, 0, 0.4) },
    ],
  },
  {
    id: 'cortex-2', name: 'Vanishing Bridge', sector: 'cortex', par: 4, time: 150,
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
    id: 'cortex-3', name: 'Data Current', sector: 'cortex', par: 3, time: 120,
    tee: [0, 0, 0], cup: [-2, 0, 17.5],
    parts: [
      { t: 'floor', poly: [[-4, -1.2], [4, -1.2], [4, 20], [-4, 20]] },
      // a stream of data pushes everything to the right
      { t: 'zone', kind: 'conveyor', rect: [-4, 7, 4, 11], dir: [1, 0], speed: 3 },
      { t: 'wall', pts: [[-4, 13.5], [1, 13.5]], h: 0.5 },
      { t: 'monster', type: 'ninja', path: patrol([-3, 4], [3, 4], 4) },
      { t: 'monster', type: 'tarantula', path: patrol([2.2, 16], [2.2, 19], 5) },
    ],
  },
  {
    id: 'cortex-4', name: 'Terrain Shift', sector: 'cortex', par: 4, time: 150,
    tee: [0, 0, 0], cup: [1.5, 2.4, 19],
    parts: [
      { t: 'floor', poly: [[-3, -1.2], [3, -1.2], [3, 6], [-3, 6]], open: [2] },
      // a block of ground that rises to the upper level and sinks back
      { t: 'mover', s: [3, 0.4, 3], path: elevator(0, 7.6, -0.2, 2.2, 8), sideLook: 's5' },
      { t: 'floor', y: 2.4, poly: [[-3, 9.1], [3, 9.1], [3, 22], [-3, 22]], open: [0] },
      { t: 'mover', kind: 'obst', s: [3.4, 0.4, 0.3], path: spin(0, 2.6, 14, 5), look: 'holo' },
      { t: 'monster', type: 'krabe', path: patrol([-2, 17], [2, 17], 6, 2.4) },
      { t: 'monster', type: 'manta', path: patrol([-3, 3], [3, 3], 6.5, 1.0, 0.2), size: 0.8 },
    ],
  },
  {
    id: 'cortex-5', name: 'Guardian Field', sector: 'cortex', par: 4, time: 150,
    tee: [0, 0, 0], cup: [0, 0, 21.5],
    parts: [
      { t: 'floor', poly: [[-4.5, -1.2], [4.5, -1.2], [4.5, 24], [-4.5, 24]] },
      // XANA's prison spheres drift across the field: roll into one and you're stuck for a while
      { t: 'monster', type: 'guardian', path: patrol([-3.4, 8], [3.4, 8], 7) },
      { t: 'monster', type: 'guardian', path: patrol([3.4, 13.5], [-3.4, 13.5], 6, 0, 0.5) },
      { t: 'wall', pts: [[-4.5, 18], [-1, 18]], h: 0.5 },
      { t: 'wall', pts: [[1.6, 18], [4.5, 18]], h: 0.5 },
      { t: 'monster', type: 'tarantula', path: patrol([-3, 11], [3, 11], 7, 0, 0.3) },
    ],
  },
  {
    id: 'cortex-6', name: 'The Core', sector: 'cortex', par: 5, time: 170,
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
