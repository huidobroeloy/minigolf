import { rect, circlePoly, patrol, orbit, spin, elevator } from './helpers.js';

const tree = (x, z, r = 0.5, h = 2.4, y = 0) => ({ t: 'cyl', p: [x, y, z], r, h, look: 'tree' });

// Sector 2 — FOREST: giant trees, log ramps, Hornets and a Blok on a turntable.
export default [
  {
    id: 'forest-1', name: 'Hornet Grove', sector: 'forest', par: 4, time: 160,
    tee: [0, 0, 0], cup: [1.2, 0, 37.2],
    hio: 'Bank around the trees into the root slingshot, across the log bridge and into the far clearing.',
    parts: [
      { t: 'floor', poly: [[-4.2, -1.2], [4.2, -1.2], [4.2, 22], [0.9, 22], [-0.9, 22], [-4.2, 22]], open: [3] },
      tree(0, 7.2, 0.55), tree(-2.4, 10.4), tree(2.3, 10.1, 0.45),
      tree(-0.4, 13.6, 0.6), tree(2.9, 15.6, 0.5), tree(-2.8, 16.2, 0.55),
      tree(1.5, 17.2, 0.4), tree(-2.0, 19.6, 0.45),
      { t: 'zone', kind: 'slow', c: [-3.0, 4.5], r: 1.0, mul: 3 },
      // root slingshot into the log bridge
      { t: 'zone', kind: 'boost', rect: [-0.6, 20.2, 0.6, 22], dir: [0, 1], speed: 10, align: 2 },
      { t: 'floor', poly: rect(-0.9, 22, 0.9, 29.2), walls: false, mat: 'wood' },
      { t: 'floor', poly: circlePoly(0, 34, 5, 24), open: [17, 18] },
      tree(-2.6, 33.2, 0.5), tree(3.0, 32.4, 0.45), tree(-0.8, 36.6, 0.4),
      { t: 'monster', type: 'hornet', path: orbit([0, 10], 3.2, 9, 2.4), aim: 'ball' },
      { t: 'monster', type: 'hornet', path: patrol([-3, 17.5], [3, 17.5], 7, 2.6), aim: 'ball' },
      { t: 'monster', type: 'hornet', path: patrol([-2.5, 25.5], [2.5, 25.5], 5, 2.2, 0.5), aim: 'ball' },
    ],
  },
  {
    id: 'forest-2', name: 'The Log Flume', sector: 'forest', par: 3, time: 120,
    tee: [0, 0, 0], cup: [0, 1.5, 23.3],
    hio: 'Hard up the log ramp, across the turntable when the fence swings away from the centre.',
    parts: [
      { t: 'floor', poly: rect(-2, -1.2, 2, 5), open: [2] },
      { t: 'ramp', a: [0, 5], b: [0, 12], w: 2.4, ya: 0, yb: 1.5, mat: 'wood' },
      { t: 'floor', y: 1.5, poly: [[-3, 12], [-1.2, 12], [1.2, 12], [3, 12], [3, 15], [1.6, 15], [-1.6, 15], [-3, 15]], open: [1, 5] },
      { t: 'mover', shape: 'cyl', r: 3, h: 0.5, path: spin(0, 1.25, 18, 9), mat: 'wood', sideLook: 'wood' },
      { t: 'mover', kind: 'obst', s: [0.3, 0.5, 2.6], path: orbit([0, 18], 2.5, 9, 1.75), look: 'wood' },
      { t: 'monster', type: 'blok', path: orbit([0, 18], 1.4, 9, 1.5, 0.5) },
      { t: 'floor', y: 1.5, poly: [[-3, 21], [-1.6, 21], [1.6, 21], [3, 21], [3, 27.5], [-3, 27.5]], open: [1] },
      tree(-2.2, 24.2, 0.45, 2.2, 1.5), tree(2.3, 23.4, 0.4, 2.2, 1.5),
    ],
  },
  {
    id: 'forest-3', name: 'Ancient Tree', sector: 'forest', par: 3, time: 140,
    tee: [0, 0, 0.4], cup: [0, 0, 18],
    hio: 'Straight through the hollow trunk while the root-door is lifted.',
    parts: [
      { t: 'floor', poly: circlePoly(0, 9.6, 10, 32) },
      // the giant trunk, split by a tunnel
      { t: 'box', p: [-1.65, 1.6, 10], s: [2.2, 3.2, 5], look: 'bark' },
      { t: 'box', p: [1.65, 1.6, 10], s: [2.2, 3.2, 5], look: 'bark' },
      { t: 'deco', make: (THREE) => {
        const g = new THREE.Group();
        const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.8, 5), new THREE.MeshStandardMaterial({ color: '#4b311b', roughness: 1 }));
        roof.position.set(0, 3.5, 10); roof.castShadow = true; g.add(roof);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 12, 16), new THREE.MeshStandardMaterial({ color: '#5a3b22', roughness: 1 }));
        trunk.position.set(0, 9.9, 10); trunk.castShadow = true; g.add(trunk);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 1), new THREE.MeshStandardMaterial({ color: '#2f8f3a', roughness: 0.9, flatShading: true }));
        crown.position.set(0, 18, 10); crown.scale.set(1, 0.6, 1); crown.castShadow = true; g.add(crown);
        return g;
      } },
      { t: 'mover', kind: 'obst', s: [1.2, 0.6, 0.3], path: elevator(0, 12.65, 0.3, 1.25, 4.5), look: 'wood' },
      // roots around the trunk
      { t: 'box', p: [-4.2, 0.15, 8.4], s: [2.4, 0.3, 0.4], ry: 0.5, look: 'bark' },
      { t: 'box', p: [4.0, 0.15, 11.8], s: [2.6, 0.3, 0.4], ry: -0.6, look: 'bark' },
      { t: 'box', p: [-3.6, 0.15, 13.4], s: [2.0, 0.3, 0.4], ry: -0.9, look: 'bark' },
      tree(-6.5, 6.2, 0.45), tree(6.2, 6.8, 0.45), tree(-5.5, 15.2, 0.5), tree(5.4, 15.5, 0.5),
      { t: 'monster', type: 'hornet', path: orbit([0, 10], 6.3, 11, 2.6), aim: 'ball' },
      { t: 'monster', type: 'kankrelat', path: patrol([-2.2, 15.4], [2.2, 15.4], 3.6) },
    ],
  },
];
