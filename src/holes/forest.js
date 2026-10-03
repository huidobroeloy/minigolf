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
  {
    id: 'forest-4', name: 'Data Stream Falls', sector: 'forest', par: 4, time: 150,
    tee: [0, 1.5, 0], cup: [2.2, 0, 23.5],
    hio: 'Let the stream carry you down the falls, aimed a touch right, and it rolls into the basin cup.',
    parts: [
      { t: 'floor', y: 1.5, poly: [[-3, -1.2], [3, -1.2], [3, 10], [1.2, 10], [-1.2, 10], [-3, 10]], open: [3] },
      // the stream down the middle of the upper meadow
      { t: 'zone', kind: 'current', rect: [-1.2, 2.5, 1.2, 10], dir: [0, 1], speed: 4, y: 1.5 },
      { t: 'ramp', a: [0, 10], b: [0, 14], w: 2.4, ya: 1.5, yb: 0, mat: 'wood' },
      { t: 'floor', poly: [[-5, 14], [-1.2, 14], [1.2, 14], [5, 14], [5, 27], [-5, 27]], open: [1] },
      tree(-1.8, 18, 0.5), tree(3.6, 17.2, 0.45), tree(-3.4, 23.6, 0.5), tree(0.2, 21, 0.4),
      { t: 'zone', kind: 'slow', c: [-2.6, 20.4], r: 1.2, mul: 3 },
      tree(-2.2, 5.5, 0.45, 2.2, 1.5), tree(2.3, 7.2, 0.45, 2.2, 1.5),
      { t: 'monster', type: 'hornet', path: patrol([-3.5, 19], [3.5, 19], 8, 2.4), aim: 'ball' },
      { t: 'monster', type: 'kankrelat', path: patrol([-4, 25.5], [4, 25.5], 5, 0, 0.3) },
    ],
  },
  {
    id: 'forest-5', name: 'Treehouse Ring', sector: 'forest', par: 3, time: 120,
    tee: [0, 0, 2.6], cup: [0.4, 0, 15.6], yaw: 0.45,
    hio: 'Bank round the trunk off the outer ring wall, between the roots.',
    parts: [
      { t: 'floor', poly: circlePoly(0, 9, 7.4, 8, Math.PI / 8) }, // straight sides: no round bank funnelling into the cup
      { t: 'cyl', p: [0, 0, 9], r: 2.3, h: 3.2, look: 'bark' },
      { t: 'deco', make: (THREE) => {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 9, 16), new THREE.MeshStandardMaterial({ color: '#5a3b22', roughness: 1 }));
        trunk.position.set(0, 7.6, 9); trunk.castShadow = true; g.add(trunk);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), new THREE.MeshStandardMaterial({ color: '#2f8f3a', roughness: 0.9, flatShading: true }));
        crown.position.set(0, 14, 9); crown.scale.set(1, 0.6, 1); crown.castShadow = true; g.add(crown);
        const house = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 3.2), new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.9 }));
        house.position.set(0, 10.5, 9); house.castShadow = true; g.add(house);
        return g;
      } },
      { t: 'box', p: [3.6, 0.15, 7.2], s: [2.4, 0.3, 0.4], ry: 0.9, look: 'bark' },
      { t: 'box', p: [-3.4, 0.15, 12.2], s: [2.4, 0.3, 0.4], ry: -0.8, look: 'bark' },
      { t: 'box', p: [-2.6, 0.15, 5], s: [2, 0.3, 0.4], ry: 0.6, look: 'bark' },
      { t: 'zone', kind: 'slow', c: [3.8, 13.2], r: 1.1, mul: 3 },
      { t: 'monster', type: 'blok', path: orbit([0, 9], 4.6, 14, 0, 0.25) },
    ],
  },
  {
    id: 'forest-6', name: 'Kankrelat Hollow', sector: 'forest', par: 5, time: 170,
    tee: [0, 0, 0], cup: [10, 0, 30],
    hio: 'The hollow log at the first bend is a shortcut: come out of it fast enough to reach the clearing.',
    parts: [
      { t: 'floor', poly: [[-2.5, -1.2], [2.5, -1.2], [2.5, 8], [12, 8], [12, 33], [8, 33], [8, 25.3], [8, 23.7], [8, 12], [-0.5, 12], [-1.9, 12], [-2.5, 12]], open: [6, 9] },
      tree(1.4, 5, 0.5), tree(5, 9.5, 0.45), tree(10.5, 14.5, 0.5), tree(9, 21, 0.45),
      // the hollow log: a shortcut from the first bend straight up to the clearing
      { t: 'tube', pts: [[-1.2, 0, 11.2], [-1.2, 0.1, 14], [1, 0.3, 19], [5.5, 0.2, 23], [8.4, 0, 24.5], [9.6, 0, 25.6], [10, 0, 26.8]], r: 0.55, color: '#8a5a2b', ring: '#5a3b22' },
      { t: 'zone', kind: 'slow', c: [10, 18], r: 1.1, mul: 3 },
      { t: 'monster', type: 'kankrelat', path: patrol([3.5, 10], [7, 10], 3) },
      { t: 'monster', type: 'kankrelat', path: patrol([8.6, 17], [11.4, 17], 2.6, 0, 0.4) },
      { t: 'monster', type: 'hornet', path: patrol([8.5, 27], [11.5, 27], 6, 2.2), aim: 'ball' },
    ],
  },
];
