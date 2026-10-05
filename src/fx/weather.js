import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { Emitter } from './particles.js';

// Weather per sector. Everything is a pure function of the hole seed and the shared hole clock,
// so every player gets the same gusts at the same moment without any network traffic.
//   desert   sandstorm gusts (a strong wind for 5 s every 20–30 s, thick dust)
//   ice      blizzard (a light crosswind that slowly swings, driving snow)
//   mountain rolling fog banks (visibility only)
//   volcano  rising embers and drifting ash; three ash patches on the floor that slow the ball
//   forest   falling leaves (visual)
//   sea      bubble streams (visual)
//   network  data storms (visual bursts)

const GUST_EVERY = 25, GUST_LEN = 5;

/** A deterministic 0..1 value for (seed, k). */
const hash01 = (seed, k) => new RNG((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0).next();

export class Weather {
  constructor(scene, course, sector, seed, fog) {
    this.sector = sector;
    this.seed = (seed ^ 0x77e4a1) >>> 0;
    this.course = course;
    this.fog = fog;
    this.baseFog = fog?.density ?? 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.scene = scene;
    this.fx = new Emitter(this.group, { max: 900 });
    this.patches = [];
    const rng = new RNG(this.seed);
    if (sector === 'volcano') {
      // ash patches: ordinary course 'slow' zones, kept well clear of the cups
      const cups = course.cups || [course.cup];
      for (let i = 0, tries = 0; i < 3 && tries < 30; tries++) {
        const pt = course.randomFloorPoint?.(rng);
        if (!pt) break;
        const r = 1.0 + rng.next() * 0.5;
        if (cups.some((c) => c && Math.hypot(c.x - pt.x, c.z - pt.z) < r + 1.2)) continue;
        i++;
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: '#3a3433', transparent: true, opacity: 0.75, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(pt.x, pt.y + 0.025, pt.z);
        this.group.add(mesh);
        const zone = { kind: 'slow', mul: 2.2, contains: (p) => Math.abs(p.y - pt.y) < 0.6 && Math.hypot(p.x - pt.x, p.z - pt.z) < r };
        course.zones.push(zone);
        this.patches.push({ x: pt.x, r, mesh, zone });
      }
    }
    if (sector === 'sea') {
      this.streams = Array.from({ length: 5 }, () => {
        const pt = course.randomFloorPoint?.(rng);
        return pt ? [pt.x, pt.y, pt.z] : null;
      }).filter(Boolean);
    }
    this.blizzardDir = rng.next() * Math.PI * 2;
  }

  /** Sandstorm gust at time t: { dir, k (0..1 strength) } or null. */
  gust(t) {
    if (this.sector !== 'desert' && this.sector !== 'network') return null;
    const k = Math.floor(t / GUST_EVERY);
    const start = k * GUST_EVERY + 6 + hash01(this.seed, k) * (GUST_EVERY - GUST_LEN - 6);
    if (t < start || t > start + GUST_LEN) return null;
    const u = (t - start) / GUST_LEN;
    return { dir: hash01(this.seed, k + 1000) * Math.PI * 2, k: Math.sin(u * Math.PI) };
  }

  /** The current wind on the ball (acceleration). Only moving balls feel it. */
  force(ball, out, t) {
    if (ball.state !== 'moving' || ball.mods?.ghost) return;
    let a = 0, dir = 0;
    if (this.sector === 'desert') { const g = this.gust(t); if (g) { a = 1.5 * g.k; dir = g.dir; } }
    if (this.sector === 'ice') { a = 0.4; dir = this.blizzardDir + Math.sin(t / 17) * 0.6; }
    if (!a) return;
    out.x += Math.sin(dir) * a;
    out.z += Math.cos(dir) * a;
  }

  chips(t) {
    if (this.sector === 'desert' && this.gust(t)) return [{ icon: '🌪️', text: 'Sandstorm' }];
    if (this.sector === 'network' && this.gust(t)) return [{ icon: '⚡', text: 'Data storm' }];
    if (this.sector === 'ice') return [{ icon: '❄️', text: 'Blizzard' }];
    return [];
  }

  frame(t, dt, center) {
    const c = center || this.course.center;
    const R = 14;
    const rnd = Math.random;
    const at = (h = 0) => [c.x + (rnd() - 0.5) * R * 2, c.y + h, c.z + (rnd() - 0.5) * R * 2];
    const g = this.gust(t);
    let fogMul = 1;
    switch (this.sector) {
      case 'desert': {
        const n = g ? 10 : 1;
        for (let i = 0; i < n; i++) {
          const d = g ? g.dir : 0, s = g ? 7 * g.k + 1 : 0.6;
          this.fx.spawn({ pos: at(rnd() * 2.5), vel: [Math.sin(d) * s, 0.2, Math.cos(d) * s], color: rnd() < 0.5 ? '#e8c48c' : '#c9995a', size: 0.12 + rnd() * 0.12, life: 2 });
        }
        if (g) fogMul = 1 + 2.2 * g.k;
        break;
      }
      case 'ice': {
        const d = this.blizzardDir + Math.sin(t / 17) * 0.6;
        for (let i = 0; i < 5; i++) this.fx.spawn({ pos: at(4 + rnd() * 3), vel: [Math.sin(d) * 3, -2.2, Math.cos(d) * 3], color: '#ffffff', size: 0.08 + rnd() * 0.08, life: 3 });
        fogMul = 1.4;
        break;
      }
      case 'mountain': {
        const bank = 0.5 + 0.5 * Math.sin((t / 40) * Math.PI * 2 + hash01(this.seed, 7) * 6);
        fogMul = 1 + 2.6 * bank * bank;
        if (rnd() < 0.3) this.fx.spawn({ pos: at(0.3 + rnd()), vel: [0.4, 0, 0.1], color: '#efe6e2', size: 0.9, life: 4 });
        break;
      }
      case 'volcano':
        for (let i = 0; i < 2; i++) this.fx.spawn({ pos: at(0), vel: [(rnd() - 0.5) * 0.5, 1.2 + rnd(), (rnd() - 0.5) * 0.5], color: rnd() < 0.6 ? '#ff7a1a' : '#ffd04a', size: 0.06 + rnd() * 0.06, life: 3 });
        if (rnd() < 0.5) this.fx.spawn({ pos: at(5), vel: [0.3, -0.6, 0.2], color: '#6b6260', size: 0.1, life: 6 });
        for (const p of this.patches) p.mesh.material.opacity = 0.6 + 0.1 * Math.sin(t * 2 + p.x);
        break;
      case 'forest':
        if (rnd() < 0.5) this.fx.spawn({ pos: at(5 + rnd() * 2), vel: [Math.sin(t) * 0.6, -0.8, 0.3], color: rnd() < 0.5 ? '#e0a020' : '#c05a1a', size: 0.14, life: 6 });
        break;
      case 'sea':
        for (const s of this.streams) if (rnd() < 0.35) this.fx.spawn({ pos: [s[0] + (rnd() - 0.5) * 0.4, s[1] + 0.1, s[2] + (rnd() - 0.5) * 0.4], vel: [0, 1.4 + rnd(), 0], color: '#bff4ff', size: 0.07 + rnd() * 0.07, life: 3 });
        break;
      case 'network':
        if (g) {
          for (let i = 0; i < 8; i++) this.fx.spawn({ pos: at(rnd() * 4), vel: [Math.sin(g.dir) * 12, 0, Math.cos(g.dir) * 12], color: rnd() < 0.5 ? '#3fa9ff' : '#9fe8ff', size: 0.07, life: 1 });
          fogMul = 1 + 1.5 * g.k * (0.6 + 0.4 * Math.sin(t * 30));
        }
        break;
    }
    if (this.fog) this.fog.density += (this.baseFog * fogMul - this.fog.density) * Math.min(1, dt * 2);
    this.fx.update(dt);
  }

  dispose() {
    if (this.fog) this.fog.density = this.baseFog;
    for (const p of this.patches) { const i = this.course.zones.indexOf(p.zone); if (i >= 0) this.course.zones.splice(i, 1); }
    this.fx.dispose();
    this.scene.remove(this.group);
  }
}
