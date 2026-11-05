import * as THREE from 'three';
import { pointInPoly } from '../course/geometry.js';

// The Marabounta takeover (see holes/swarmEvent.js): a tide of small dark spheres that hatches from its
// mother cell behind the tee and rolls down the hole along its route until it has covered everything,
// cup included. The front is a pure function of the hole clock (arc length along the route, with a
// ragged edge), so every client sees the same coverage without any messages.

function lowQuality() {
  try { return JSON.parse(localStorage.getItem('lyokogolf.prefs') || '{}').quality === 'low'; } catch { return false; }
}

const GROW = 0.6; // seconds for a cell's spheres to swell in
const FRESH = '#b0183c', DARK = '#1b1222';

export class MarabountaSwarm {
  constructor(ev, def, course, scene) {
    this.ev = ev;
    this.course = course;
    this.scene = scene;
    const r = def.route && def.route.length >= 2 ? def.route : [[def.tee[0], def.tee[2]], [def.cup[0], def.cup[2]]];
    this.route = r;
    this.cum = [0];
    for (let i = 1; i < r.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]));
    this.cupS = this.arc(def.cup[0], def.cup[2]);
    // the front leaves the mother cell (2 behind the tee) at `at` and reaches the cup `dur` seconds later
    this.s0 = -2;
    this.speed = (this.cupS - this.s0) / ev.dur;
    this.a = (ev.seed % 1000) / 159; // phase of the ragged edge
    this.g = new THREE.Group();
    scene.add(this.g);
    this.buildCells(def);
    this.buildMother();
    this.done = false;
  }

  /** Arc length along the route of the point nearest (x, z). */
  arc(x, z) {
    const r = this.route;
    let best = Infinity, s = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const dx = r[i + 1][0] - r[i][0], dz = r[i + 1][1] - r[i][1], L2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - r[i][0]) * dx + (z - r[i][1]) * dz) / L2));
      const d = Math.hypot(x - r[i][0] - dx * k, z - r[i][1] - dz * k);
      if (d < best) { best = d; s = this.cum[i] + Math.sqrt(L2) * k; }
    }
    return s;
  }

  /** The point on the route at arc length s. */
  pointAt(s) {
    const r = this.route, c = this.cum;
    let i = 0;
    while (i < r.length - 2 && c[i + 1] < s) i++;
    const L = c[i + 1] - c[i] || 1, k = Math.max(0, Math.min(1, (s - c[i]) / L));
    return [r[i][0] + (r[i + 1][0] - r[i][0]) * k, r[i][1] + (r[i + 1][1] - r[i][1]) * k];
  }

  /** The ragged edge: a smooth, deterministic ±1.2 offset. */
  jitter(x, z) { return 1.2 * Math.sin(x * 1.3 + this.a) * Math.cos(z * 1.1 - this.a * 0.7); }
  front(t) { return this.s0 + Math.max(0, t - this.ev.at) * this.speed; }
  coverTime(x, z) { return this.ev.at + (this.arc(x, z) + this.jitter(x, z) - this.s0) / this.speed; }
  covered(x, z, t) { return t >= this.ev.at && this.arc(x, z) + this.jitter(x, z) < this.front(t); }
  /** Has the tide reached the cup (and so everything)? */
  full(t) { return this.front(t) > this.cupS + 1.5; }

  /** Where Jérémie rematerializes a ball the swarm got: on the route just ahead of the front. null: nowhere left. */
  spawnAhead(t) {
    for (let s = this.front(t) + 2.5; s < this.cupS - 2.5; s += 0.5) {
      const [x, z] = this.pointAt(s);
      if (this.covered(x, z, t + 3)) continue;
      const y = this.course.floorYAt(x, z);
      if (y == null) continue;
      const p = { x, y: y + 0.2, z };
      if (this.course.lavaAt?.(p, { radius: 0.18, mods: {} }) || this.course.unsafeAt?.(p)) continue;
      return [x, y, z];
    }
    return null;
  }

  buildCells(def) {
    const step = lowQuality() ? 0.8 : 0.55, per = lowQuality() ? 2 : 3;
    const cells = [];
    for (const f of this.course.floors) {
      const xs = f.poly.map((p) => p[0]), zs = f.poly.map((p) => p[1]);
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
        for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
          if (!pointInPoly(x, z, f.poly)) continue;
          if (f.holes.some((h) => h.c && Math.hypot(x - h.c[0], z - h.c[1]) < h.r + 0.05)) continue;
          cells.push({ x, z, y: f.y, t: this.coverTime(x, z) });
        }
      }
    }
    cells.sort((a, b) => a.t - b.t);
    this.cells = cells;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.25, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cells.length * per));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.g.add(this.mesh);
    // each instance: a little sphere at a fixed offset in its cell
    this.inst = [];
    let h = 1;
    const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
    for (const c of cells) {
      for (let k = 0; k < per; k++) {
        const size = 0.12 + rnd() * 0.12; // big enough to overlap into a carpet
        this.inst.push({ x: c.x + (rnd() - 0.5) * step * 0.8, y: c.y + size * 0.8, z: c.z + (rnd() - 0.5) * step * 0.8, size, t: c.t + rnd() * 0.3 });
      }
    }
    this.inst.sort((a, b) => a.t - b.t);
    this.shown = 0;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.fresh = new THREE.Color(FRESH);
    this.dark = new THREE.Color(DARK);
    this.mesh.setColorAt(0, this.dark);
  }

  buildMother() {
    const [x, z] = this.pointAt(this.s0);
    const y = (this.course.floorYAt(...this.pointAt(0)) ?? 0) + 1.1;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: '#1b1222', emissive: FRESH, emissiveIntensity: 0.4, flatShading: true, roughness: 0.5 }));
    g.add(core);
    const kids = [];
    for (let i = 0; i < 6; i++) {
      const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: '#1b1222', flatShading: true }));
      g.add(k);
      kids.push(k);
    }
    g.scale.setScalar(0.001);
    this.g.add(g);
    this.mother = { g, core, kids };
  }

  frame(t, dt) {
    // the mother cell hatches 2 s before the tide and hovers there, pulsing
    const mo = this.mother;
    const hatch = Math.max(0, Math.min(1, (t - this.ev.at + 2) / 2));
    mo.g.scale.setScalar(Math.max(0.001, hatch));
    mo.core.rotation.y += dt * 0.8;
    mo.core.material.emissiveIntensity = 0.35 + 0.3 * Math.sin(t * 4);
    mo.kids.forEach((k, i) => { const a = t * 1.6 + i * 1.047; k.position.set(Math.cos(a) * 0.7, Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.7); });
    // spheres swell in as the front passes, flash red, then darken
    const inst = this.inst, prev = this.shown;
    while (this.shown < inst.length && inst[this.shown].t <= t) this.shown++;
    let first = prev; // everything new is placed at least once, even after a long frame

    while (first > 0 && t - inst[first - 1].t < GROW + 0.6) first--;
    for (let i = first; i < this.shown; i++) this.place(i, t);
    if (this.shown !== this.mesh.count || first < this.shown) {
      this.mesh.count = this.shown;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  place(i, t) {
    const o = this.inst[i], age = t - o.t;
    const k = Math.min(1, age / GROW), grow = 1 - (1 - k) * (1 - k);
    this.v.set(o.x, o.y + (1 - grow) * -o.size, o.z);
    this.s.setScalar(o.size * Math.max(0.05, grow));
    this.m4.compose(this.v, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m4);
    this.mesh.setColorAt(i, this.c.copy(this.fresh).lerp(this.dark, Math.min(1, age / (GROW + 0.6))));
  }

  dispose() {
    this.scene.remove(this.g);
    this.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }
}
