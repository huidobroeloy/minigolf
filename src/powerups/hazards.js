import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';
import { slabGeometry } from '../course/geometry.js';
import {
  makeChicken, animateChicken, makeTornado, animateTornado, makeVolcano, makeMagmaPool, makeWave,
} from '../fx/models.js';

/** A path through random floor points, sampled by time at constant speed. */
function makePath(course, rng, n, speed, startPoint = null) {
  const pts = [];
  if (startPoint) pts.push(startPoint.clone());
  while (pts.length < n) pts.push(course.randomFloorPoint(rng));
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = pts[i].distanceTo(pts[i + 1]);
    seg.push({ a: pts[i], b: pts[i + 1], L, s0: total });
    total += L;
  }
  return {
    at(t, out = new THREE.Vector3()) {
      let s = (t * speed) % (total * 2 || 1);
      if (s > total) s = 2 * total - s; // ping-pong
      for (const sg of seg) {
        if (s <= sg.s0 + sg.L) return out.lerpVectors(sg.a, sg.b, sg.L ? (s - sg.s0) / sg.L : 0);
      }
      return out.copy(pts[pts.length - 1]);
    },
  };
}

class Hazard {
  constructor(ctx, fx, dur) {
    this.ctx = ctx;
    this.fx = fx;
    this.rng = new RNG(fx.seed);
    this.start = fx.at / 1000;
    this.dur = dur;
    this.group = new THREE.Group();
    ctx.group.add(this.group);
  }
  local(t) { return t - this.start; }
  done(t) { return this.local(t) > this.dur; }
  force() {}
  decel() { return 1; }
  frame() {}
  dispose() { this.ctx.group.remove(this.group); }
}

class Wind extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 10);
    const d = fx.params.dir || [0, 1];
    this.dir = new THREE.Vector2(d[0], d[1]).normalize();
    sfx.play('whoosh');
  }
  force(ball, t, out) {
    const k = Math.min(1, this.local(t) / 0.8) * Math.min(1, (this.dur - this.local(t)) / 0.8);
    const gust = 3.2 * k * (0.75 + 0.25 * Math.sin(t * 3.1));
    out.x += this.dir.x * gust;
    out.z += this.dir.y * gust;
    if (gust > 2.6) out.wake = true;
  }
  frame(t, dt) {
    const c = this.ctx.course;
    const em = this.ctx.particles;
    for (let i = 0; i < 4; i++) {
      const p = [c.center.x + (Math.random() - 0.5) * c.size.x * 1.3, c.bounds.min.y + Math.random() * 2.5, c.center.z + (Math.random() - 0.5) * c.size.z * 1.3];
      em.spawn({ pos: p, vel: [this.dir.x * 14, 0, this.dir.y * 14], color: '#ffffff', size: 0.12, life: 0.9 });
    }
  }
}

class Tornado extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 15);
    this.path = makePath(ctx.course, this.rng, 7, 2.8);
    this.model = makeTornado();
    this.group.add(this.model);
    this.pos = new THREE.Vector3();
    this.R = 2.8;
    sfx.play('whoosh');
  }
  force(ball, t, out) {
    this.path.at(this.local(t), this.pos);
    const p = ball.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > this.R || Math.abs(p.y - this.pos.y) > 4) return;
    const k = 1 - d / this.R;
    const nx = dx / (d || 1), nz = dz / (d || 1);
    out.x += (nx * 9 - nz * 16) * k;
    out.z += (nz * 9 + nx * 16) * k;
    out.y += 10 * k;
    out.wake = true;
  }
  frame(t, dt) {
    const lt = this.local(t);
    this.path.at(lt, this.pos);
    this.model.position.copy(this.pos);
    const s = Math.min(1, lt * 2, (this.dur - lt) * 2);
    this.model.scale.setScalar(Math.max(0.01, s));
    animateTornado(this.model, t);
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2;
      this.ctx.particles.spawn({
        pos: [this.pos.x + Math.cos(a) * r, this.pos.y + Math.random() * 4, this.pos.z + Math.sin(a) * r],
        vel: [-Math.sin(a) * 6, 2, Math.cos(a) * 6], color: '#8d7a64', size: 0.15, life: 0.8,
      });
    }
  }
}

class Volcano extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 22);
    const c = ctx.course;
    this.pos = c.randomFloorPoint(this.rng);
    this.model = makeVolcano();
    this.model.position.copy(this.pos);
    this.group.add(this.model);
    // a solid cone in this client's physics world
    this.body = ctx.physics.addCylinder(0.8, 1.1, { kind: 'obst' }, { pos: [this.pos.x, this.pos.y + 0.8, this.pos.z] }).body;
    this.pools = [];
    for (let k = 0; k < 14; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(1.8, 6.5);
        const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
        const y = c.floorYAt(x, z);
        if (y === null) continue;
        const pool = { x, y, z, r: this.rng.range(0.8, 1.4), t0: 1.2 + k * 1.1, mesh: null, blob: null };
        this.pools.push(pool);
        break;
      }
    }
    sfx.play('rumble');
  }
  inPool(p, t) {
    const lt = this.local(t);
    for (const pl of this.pools) {
      if (lt < pl.t0 + 0.8) continue;
      if (Math.abs(p.y - pl.y) < 0.6 && Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r) return true;
    }
    return false;
  }
  decel(ball, t) { return this.inPool(ball.pos, t) ? 9 : 1; }
  frame(t, dt) {
    const lt = this.local(t);
    const fade = Math.min(1, (this.dur - lt) / 1.5);
    this.model.scale.setScalar(Math.min(1, lt * 2) * Math.max(0.01, fade));
    const glow = this.model.getObjectByName('glow');
    glow.intensity = 4 + Math.sin(t * 12) * 2;
    for (const pl of this.pools) {
      if (lt < pl.t0) continue;
      const f = (lt - pl.t0) / 0.8;
      if (f < 1) {
        if (!pl.blob) {
          pl.blob = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff6a00' }));
          this.group.add(pl.blob);
          sfx.play('rumble');
        }
        pl.blob.position.set(
          THREE.MathUtils.lerp(this.pos.x, pl.x, f),
          THREE.MathUtils.lerp(this.pos.y + 1.6, pl.y, f) + Math.sin(f * Math.PI) * 4,
          THREE.MathUtils.lerp(this.pos.z, pl.z, f)
        );
      } else {
        if (pl.blob) { this.group.remove(pl.blob); pl.blob = null; }
        if (!pl.mesh) {
          pl.mesh = makeMagmaPool(pl.r);
          pl.mesh.position.set(pl.x, pl.y + 0.015, pl.z);
          this.group.add(pl.mesh);
        }
        pl.mesh.material.emissiveIntensity = 1.2 + Math.sin(t * 5 + pl.x) * 0.4;
        pl.mesh.scale.setScalar(Math.max(0.01, fade));
      }
    }
    if (Math.random() < 0.4) {
      this.ctx.particles.spawn({
        pos: [this.pos.x, this.pos.y + 1.7, this.pos.z], vel: [(Math.random() - 0.5) * 2, 4 + Math.random() * 3, (Math.random() - 0.5) * 2],
        color: Math.random() < 0.5 ? '#ff7a00' : '#555555', size: 0.35, life: 1.4, gravity: 3,
      });
    }
  }
  dispose() {
    super.dispose();
    this.ctx.physics.removeBody(this.body);
  }
}

class IceRink extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 20);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#d8f4ff', roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.55, depthWrite: false });
    for (const f of ctx.course.floors) {
      const geo = slabGeometry(f.poly, f.holes, f.y + 0.02, 0.02);
      const m = new THREE.Mesh(geo, mat);
      this.group.add(m);
    }
    this.mat = mat;
    sfx.play('whoosh');
  }
  decel() { return 0.07; }
  frame(t) {
    const lt = this.local(t);
    this.mat.opacity = 0.55 * Math.min(1, lt * 2, (this.dur - lt) * 1.5);
    if (Math.random() < 0.5) {
      const c = this.ctx.course;
      this.ctx.particles.spawn({
        pos: [c.center.x + (Math.random() - 0.5) * c.size.x, c.bounds.min.y + 0.2 + Math.random(), c.center.z + (Math.random() - 0.5) * c.size.z],
        vel: [0, 0.3, 0], color: '#ffffff', size: 0.1, life: 1,
      });
    }
  }
}

class Tsunami extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 7);
    const d = fx.params.dir || [0, 1];
    this.dir = new THREE.Vector2(d[0], d[1]).normalize();
    const b = ctx.course.bounds;
    const corners = [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z]];
    const proj = corners.map(([x, z]) => x * this.dir.x + z * this.dir.y);
    const perp = corners.map(([x, z]) => -x * this.dir.y + z * this.dir.x);
    this.s0 = Math.min(...proj) - 3;
    this.s1 = Math.max(...proj) + 3;
    this.pMid = (Math.min(...perp) + Math.max(...perp)) / 2;
    this.width = Math.max(...perp) - Math.min(...perp) + 4;
    this.speed = (this.s1 - this.s0) / 5.5;
    this.model = makeWave(this.width);
    this.model.rotation.y = Math.atan2(this.dir.x, this.dir.y);
    this.group.add(this.model);
    this.y = b.min.y - 0.5;
    sfx.play('rumble');
    sfx.play('whoosh');
  }
  front(t) { return this.s0 + Math.max(0, this.local(t) - 0.6) * this.speed; }
  force(ball, t, out) {
    const p = ball.pos;
    const s = p.x * this.dir.x + p.z * this.dir.y;
    const f = this.front(t);
    if (s > f - 2.2 && s < f + 0.4) {
      const along = ball.vel.x * this.dir.x + ball.vel.z * this.dir.y;
      if (along < this.speed * 1.25) { out.x += this.dir.x * 45; out.z += this.dir.y * 45; }
      out.y += 6;
      out.wake = true;
    }
  }
  frame(t) {
    const f = this.front(t);
    const x = this.dir.x * f - this.dir.y * this.pMid;
    const z = this.dir.y * f + this.dir.x * this.pMid;
    this.model.position.set(x, this.y, z);
    const lt = this.local(t);
    this.model.scale.y = Math.min(1, lt * 1.5) * Math.min(1, (this.dur - lt) * 1.5 + 0.01);
    for (let i = 0; i < 3; i++) {
      const off = (Math.random() - 0.5) * this.width;
      this.ctx.particles.spawn({
        pos: [x - this.dir.y * off, this.y + 2.6, z + this.dir.x * off],
        vel: [this.dir.x * this.speed + (Math.random() - 0.5), 2, this.dir.y * this.speed], color: '#ffffff', size: 0.25, life: 0.6, gravity: 8,
      });
    }
  }
}

class Montapollos extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 18);
    this.path = makePath(ctx.course, this.rng, 12, 5.2);
    this.model = makeChicken();
    this.model.scale.setScalar(1.3);
    this.group.add(this.model);
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.nextCluck = 0;
    sfx.play('cluck');
  }
  force(ball, t, out) {
    const lt = this.local(t);
    this.path.at(lt, this.pos);
    this.path.at(lt + 0.05, this.prev);
    this.vel.subVectors(this.prev, this.pos).multiplyScalar(20);
    const p = ball.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const R = 1.7 + ball.radius;
    if (d < R && p.y < this.pos.y + 2) {
      out.x += (dx / (d || 1)) * 140 + this.vel.x * 6;
      out.z += (dz / (d || 1)) * 140 + this.vel.z * 6;
      out.y += 26;
      out.wake = true;
      if (!this._hitSound || t - this._hitSound > 0.5) { sfx.play('cluck'); this._hitSound = t; }
    }
  }
  frame(t) {
    const lt = this.local(t);
    this.path.at(lt, this.pos);
    this.path.at(lt + 0.05, this.prev);
    this.model.position.copy(this.pos);
    this.model.position.y += Math.abs(Math.sin(t * 18)) * 0.15;
    const dx = this.prev.x - this.pos.x, dz = this.prev.z - this.pos.z;
    if (Math.hypot(dx, dz) > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    animateChicken(this.model, t, 5);
    const s = Math.min(1, lt * 3, (this.dur - lt) * 3);
    this.model.scale.setScalar(1.3 * Math.max(0.01, s));
    if (t > this.nextCluck) { sfx.play('cluck'); this.nextCluck = t + 1.5 + Math.random() * 2; }
    if (Math.random() < 0.3) {
      this.ctx.particles.spawn({ pos: [this.pos.x, this.pos.y + 1.2, this.pos.z], vel: [(Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3], color: '#ffffff', size: 0.18, life: 1.2, gravity: 2 });
    }
  }
}

export const HAZARDS = { wind: Wind, tornado: Tornado, volcano: Volcano, icerink: IceRink, tsunami: Tsunami, montapollos: Montapollos };
