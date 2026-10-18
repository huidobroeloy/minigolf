import * as THREE from 'three';

// Devirtualization, the show's way: the ball breaks into glowing pixel cubes that drift up and fade.
// Played backwards, the same cubes fall together into the ball as it re-materializes. One instanced
// mesh for every burst (additive, so fading the colour to black fades the cube); fewer cubes on low quality.

const MAX = 320;
const LIFE = 1.1;

function lowQuality() {
  try { return JSON.parse(localStorage.getItem('lyokogolf.prefs') || '{}').quality === 'low'; } catch { return false; }
}

export class Dissolve {
  constructor(scene) {
    this.scene = scene;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.cubes = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  /** Break a ball of radius `r` at `p` into cubes (`reverse`: gather them into it instead). */
  burst(p, color, { r = 0.18, reverse = false, n = 56 } = {}) {
    if (lowQuality()) n = Math.ceil(n / 2);
    const cols = [new THREE.Color(color), new THREE.Color('#9fe8ff'), new THREE.Color('#ffffff')];
    for (let i = 0; i < n; i++) {
      if (this.cubes.length >= MAX) this.cubes.shift();
      // a voxel on the ball's surface, snapped to a pixel grid
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u);
      const g = r / 3;
      const o = [Math.round(Math.cos(a) * k * r / g) * g, Math.round(u * r / g) * g, Math.round(Math.sin(a) * k * r / g) * g];
      const out = 0.5 + Math.random() * 1.1;
      this.cubes.push({
        o: [p.x + o[0], p.y + o[1], p.z + o[2]],
        d: [o[0] * out * 4, 0.9 + Math.random() * 1.6, o[2] * out * 4],
        spin: [Math.random() * 6, Math.random() * 6],
        size: g * (0.8 + Math.random() * 0.6),
        col: cols[i % 5 === 0 ? 2 : i % 2],
        delay: Math.random() * 0.25,
        t: 0, reverse,
      });
    }
  }

  update(dt) {
    if (!this.cubes.length) { this.mesh.count = 0; return; }
    let j = 0;
    this.cubes = this.cubes.filter((c) => (c.t += dt) < LIFE + c.delay);
    for (const c of this.cubes) {
      let u = Math.max(0, c.t - c.delay) / LIFE;
      if (c.reverse) u = 1 - u;
      const e = 1 - (1 - u) * (1 - u);
      this.v.set(c.o[0] + c.d[0] * e, c.o[1] + c.d[1] * e, c.o[2] + c.d[2] * e);
      this.q.setFromEuler(this.e.set(c.spin[0] * u, c.spin[1] * u, 0));
      this.s.setScalar(c.size * (1 - u * 0.6));
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(j, this.m);
      this.mesh.setColorAt(j, this.c.copy(c.col).multiplyScalar(1 - u));
      j++;
    }
    this.mesh.count = j;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.cubes = []; this.mesh.count = 0; }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
