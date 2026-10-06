import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';
import { slabGeometry } from '../course/geometry.js';
import {
  makeChicken, animateChicken, makeTornado, animateTornado, makeVolcano, makeMagmaPool, makeWave,
} from '../fx/models.js';

/**
 * A path through floor points, sampled by time at constant speed (ping-pong).
 * startPoint: where it begins; bias: [x,z] direction the path prefers to wander toward.
 */
function makePath(course, rng, n, speed, startPoint = null, bias = null) {
  const pts = [];
  if (startPoint) pts.push(startPoint.clone());
  while (pts.length < n) {
    const prev = pts[pts.length - 1];
    if (!prev || !bias) { pts.push(course.randomFloorPoint(rng)); continue; }
    // pick the candidate that best follows the bias, with a bit of seeded wobble
    let best = null, bestScore = -1e9;
    for (let k = 0; k < 6; k++) {
      const c = course.randomFloorPoint(rng);
      const dx = c.x - prev.x, dz = c.z - prev.z, L = Math.hypot(dx, dz) || 1;
      const score = (dx * bias[0] + dz * bias[1]) / L - Math.abs(L - 4) * 0.12 + rng.range(0, 0.5);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    pts.push(best);
  }
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


/** A big translucent arrow lying on the course, pointing along dir ([x,z]). */
function courseArrow(course, dir, color = '#9fe8ff') {
  const L = Math.max(course.size.x, course.size.z) * 0.5 + 3;
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.6, 0), new THREE.Vector2(0.6, 0), new THREE.Vector2(0.6, L - 2.4),
    new THREE.Vector2(1.6, L - 2.4), new THREE.Vector2(0, L), new THREE.Vector2(-1.6, L - 2.4), new THREE.Vector2(-0.6, L - 2.4),
  ]);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; // shape +y → world -z
  const holder = new THREE.Group();
  holder.add(m);
  holder.rotation.y = Math.atan2(-dir[0], -dir[1]);
  holder.position.set(course.center.x - dir[0] * L / 2, course.bounds.max.y + 0.15, course.center.z - dir[1] * L / 2);
  holder.renderOrder = 5;
  return holder;
}

/**
 * A drifting path that heads along `dir`, wobbles sideways and bounces back when it would
 * leave the course. Deterministic from the rng, sampled by time.
 */
function driftPath(course, rng, start, dir, speed, dur) {
  const pts = [];
  let p = start.clone();
  let d = new THREE.Vector2(dir[0], dir[1]).normalize();
  const dt = 0.1;
  for (let t = 0; t <= dur + 0.2; t += dt) {
    pts.push(p.clone());
    const wob = Math.sin(t * 1.3 + rng.range(0, 0.4)) * 0.6;
    const nx = p.x + (d.x - d.y * wob) * speed * dt, nz = p.z + (d.y + d.x * wob) * speed * dt;
    const y = course.floorYAt(nx, nz);
    if (y === null) { d = d.multiplyScalar(-1).rotateAround(new THREE.Vector2(), rng.range(-0.6, 0.6)); continue; }
    p = new THREE.Vector3(nx, y, nz);
  }
  return {
    at(t, out = new THREE.Vector3()) {
      const f = Math.max(0, Math.min(pts.length - 1.001, t / dt));
      const i = Math.floor(f);
      return out.lerpVectors(pts[i], pts[i + 1], f - i);
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
    super(ctx, fx, 8);
    const d = fx.params.dir || [0, 1];
    this.dir = new THREE.Vector2(d[0], d[1]).normalize();
    this.arrow = courseArrow(ctx.course, [this.dir.x, this.dir.y], '#e8fbff');
    this.group.add(this.arrow);
    sfx.play('whoosh');
  }
  force(ball, t, out) {
    // a steady gust that beats rolling friction: every ball drifts the way you dragged
    const lt = this.local(t);
    const k = Math.min(1, lt / 0.5) * Math.min(1, (this.dur - lt) / 0.5);
    const gust = 6 * k * (0.85 + 0.15 * Math.sin(t * 3.1));
    out.x += this.dir.x * gust;
    out.z += this.dir.y * gust;
    if (k > 0.3) out.wake = true;
  }
  frame(t) {
    const lt = this.local(t);
    this.arrow.children[0].material.opacity = 0.32 * Math.min(1, lt * 2, (this.dur - lt) * 2) * (0.75 + 0.25 * Math.sin(t * 6));
    const c = this.ctx.course;
    for (let i = 0; i < 8; i++) {
      const p = [c.center.x + (Math.random() - 0.5) * c.size.x * 1.4, c.bounds.min.y + 0.2 + Math.random() * 2.5, c.center.z + (Math.random() - 0.5) * c.size.z * 1.4];
      this.ctx.particles.spawn({ pos: p, vel: [this.dir.x * 16, 0, this.dir.y * 16], color: '#ffffff', size: 0.14, life: 0.7 });
    }
  }
}

class Tornado extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 15);
    const p = fx.params.pos;
    const start = p ? new THREE.Vector3(p[0], p[1], p[2]) : ctx.course.randomFloorPoint(this.rng);
    const dir = fx.params.dir || [this.rng.range(-1, 1), this.rng.range(-1, 1)];
    this.path = driftPath(ctx.course, this.rng, start, dir, 2.4, this.dur);
    this.model = makeTornado();
    this.model.scale.setScalar(1.3);
    this.group.add(this.model);
    this.pos = new THREE.Vector3();
    this.R = 3.6;
    sfx.play('whoosh');
  }
  force(ball, t, out) {
    this.path.at(this.local(t), this.pos);
    const p = ball.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > this.R || Math.abs(p.y - this.pos.y) > 5) return;
    const k = 1 - d / this.R;
    const nx = dx / (d || 1), nz = dz / (d || 1);
    // suck in, spin around, lift — balls get caught, whirled and flung out
    out.x += (-nx * 14 - nz * 22) * k;
    out.z += (-nz * 14 + nx * 22) * k;
    out.y += (d < 1.6 ? 26 : 8) * k;
    out.wake = true;
  }
  frame(t) {
    const lt = this.local(t);
    this.path.at(lt, this.pos);
    this.model.position.copy(this.pos);
    const s = Math.min(1, lt * 2, (this.dur - lt) * 2);
    this.model.scale.setScalar(1.3 * Math.max(0.01, s));
    animateTornado(this.model, t);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 3;
      this.ctx.particles.spawn({
        pos: [this.pos.x + Math.cos(a) * r, this.pos.y + Math.random() * 5, this.pos.z + Math.sin(a) * r],
        vel: [-Math.sin(a) * 8, 3, Math.cos(a) * 8], color: Math.random() < 0.5 ? '#8d7a64' : '#cfd6dc', size: 0.18, life: 0.8,
      });
    }
  }
}

class Volcano extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 22);
    const c = ctx.course;
    const p = fx.params.pos;
    this.pos = p ? new THREE.Vector3(p[0], p[1], p[2]) : c.randomFloorPoint(this.rng);
    this.model = makeVolcano();
    this.model.position.copy(this.pos);
    this.group.add(this.model);
    // a solid cone in this client's physics world
    this.body = ctx.physics.addCylinder(0.8, 1.1, { kind: 'obst' }, { pos: [this.pos.x, this.pos.y + 0.8, this.pos.z] }).body;
    this.pools = [];
    for (let k = 0; k < 14; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(1.4, k < 3 ? 3.2 : 4.5);
        const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
        const y = c.floorYAt(x, z);
        if (y === null) continue;
        const pool = { x, y, z, r: this.rng.range(0.9, 1.5), t0: k < 3 ? 0.3 + k * 0.45 : 1.6 + (k - 3) * 1.3, mesh: null, blob: null };
        this.pools.push(pool);
        break;
      }
    }
    sfx.play('rumble');
    ctx.course.onShake?.(0.8);
  }
  inPool(p, t) {
    const lt = this.local(t);
    for (const pl of this.pools) {
      if (lt < pl.t0 + 0.8) continue;
      if (Math.abs(p.y - pl.y) < 0.6 && Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r) return true;
    }
    return false;
  }
  decel(ball, t) {
    if (!this.inPool(ball.pos, t)) return 1;
    if (ball.state === 'moving' && (!this.sizzle || t - this.sizzle > 0.6)) { this.sizzle = t; sfx.play('stick'); }
    return 14; // stops dead
  }
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
        this.ctx.particles.spawn({ pos: [pl.blob.position.x, pl.blob.position.y, pl.blob.position.z], vel: [0, 0.5, 0], color: '#ffb000', size: 0.3, life: 0.35 });
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
    super(ctx, fx, 9);
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
    this.warn = 1.2;
    this.speed = (this.s1 - this.s0) / 7;
    this.model = makeWave(this.width);
    this.model.scale.set(1, 1.7, 1.4);
    this.model.rotation.y = Math.atan2(this.dir.x, this.dir.y);
    this.group.add(this.model);
    this.arrow = courseArrow(ctx.course, [this.dir.x, this.dir.y], '#3d9bff');
    this.group.add(this.arrow);
    this.y = b.min.y - 0.6;
    sfx.play('rumble');
  }
  front(t) { return this.s0 + Math.max(0, this.local(t) - this.warn) * this.speed; }
  force(ball, t, out) {
    if (this.local(t) < this.warn) return;
    const p = ball.pos;
    const s = p.x * this.dir.x + p.z * this.dir.y;
    const f = this.front(t);
    if (s > f - 2.8 && s < f + 0.5) {
      // carried along at the wave's speed
      const along = ball.vel.x * this.dir.x + ball.vel.z * this.dir.y;
      const push = Math.max(0, this.speed * 1.15 - along) * 9;
      out.x += this.dir.x * push; out.z += this.dir.y * push;
      out.y += 5;
      out.wake = true;
    }
  }
  frame(t) {
    const lt = this.local(t);
    this.arrow.visible = lt < this.warn + 0.6;
    this.arrow.children[0].material.opacity = 0.45 * (0.5 + 0.5 * Math.sin(t * 14));
    if (!this.whooshed && lt >= this.warn) { this.whooshed = true; sfx.play('whoosh'); }
    const f = this.front(t);
    const x = this.dir.x * f - this.dir.y * this.pMid;
    const z = this.dir.y * f + this.dir.x * this.pMid;
    this.model.position.set(x, this.y, z);
    const rise = Math.min(1, lt / this.warn);
    this.model.scale.y = 1.7 * Math.max(0.01, rise) * Math.min(1, (this.dur - lt) * 1.5 + 0.01);
    for (let i = 0; i < 5; i++) {
      const off = (Math.random() - 0.5) * this.width;
      this.ctx.particles.spawn({
        pos: [x - this.dir.y * off, this.y + 4.4 * rise, z + this.dir.x * off],
        vel: [this.dir.x * this.speed + (Math.random() - 0.5), 2.5, this.dir.y * this.speed], color: '#ffffff', size: 0.3, life: 0.7, gravity: 8,
      });
    }
  }
}

class Montapollos extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 18);
    const p = fx.params.pos;
    this.path = makePath(ctx.course, this.rng, 12, 5.2, p ? new THREE.Vector3(p[0], p[1], p[2]) : null);
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
      if (!this._hitSound || t - this._hitSound > 0.5) { sfx.play('cluck'); this._hitSound = t; if (ball === this.ctx.course.localBall) this.ctx.onStat?.('chicken'); }
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

/** Odd's Laser Arrow: flies from the shooter's ball along the dragged direction; the first ball it meets gets launched. */
class LaserArrow extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 1.8);
    const f = fx.params.from || [ctx.course.tee.x, ctx.course.tee.y, ctx.course.tee.z];
    this.from = new THREE.Vector3(f[0], f[1] + 0.25, f[2]);
    const d = fx.params.dir || [0, 1];
    this.dir = new THREE.Vector3(d[0], 0, d[1]).normalize();
    this.speed = 16;
    const g = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ color: '#c58bff' });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), glow);
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.55;
    g.add(tip);
    g.lookAt(this.dir.clone().add(g.position));
    this.model = g;
    this.group.add(g);
    this.hit = false;
    this.head = new THREE.Vector3();
    sfx.play('laser');
  }
  headAt(t) { return this.head.copy(this.from).addScaledVector(this.dir, Math.min(this.local(t), this.dur) * this.speed); }
  force(ball, t, out) {
    if (this.hit || this.fx.from === this.ctx.myId || ball.mods.ghost) return;
    const h = this.headAt(t);
    const p = ball.pos;
    if (Math.hypot(p.x - h.x, p.z - h.z) < 0.5 + ball.radius && Math.abs(p.y - h.y) < 1) {
      this.hit = true;
      out.x += this.dir.x * 950; out.z += this.dir.z * 950; out.y += 380;
      out.wake = true;
      this.ctx.onStat?.('arrowed');
      sfx.play('bumper');
    }
  }
  frame(t) {
    const h = this.headAt(t);
    this.model.position.copy(h);
    this.model.visible = !this.hit && this.local(t) < this.dur;
    this.ctx.particles.spawn({ pos: [h.x, h.y, h.z], color: '#c58bff', size: 0.16, life: 0.35 });
  }
}

/** Aelita's Energy Field: one pink shockwave from the user's ball. */
class EnergyField extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 1.0);
    const c = ctx.positionOf?.(fx.from);
    this.center = c ? new THREE.Vector3(c.x, c.y, c.z) : null;
    this.R = 4;
    this.done1 = false;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: '#ff8ccc', transparent: true, opacity: 0.9 }));
    this.ring.rotation.x = Math.PI / 2;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb3dc', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    if (this.center) { this.ring.position.copy(this.center); this.dome.position.copy(this.center); this.group.add(this.ring, this.dome); }
    sfx.play('whoosh');
  }
  force(ball, t, out) {
    if (this.done1 || !this.center) return;
    this.done1 = true;
    if (this.fx.from === this.ctx.myId || ball.mods.ghost) return;
    const p = ball.pos;
    const dx = p.x - this.center.x, dz = p.z - this.center.z, d = Math.hypot(dx, dz);
    if (d > this.R || Math.abs(p.y - this.center.y) > 1.5) return;
    const k = (9 * (1 - d / this.R) + 3) * 120;
    out.x += (dx / (d || 1)) * k; out.z += (dz / (d || 1)) * k; out.y += 150;
    out.wake = true;
  }
  frame(t) {
    const k = Math.min(1, this.local(t) / this.dur);
    const r = 0.3 + k * this.R;
    this.ring.scale.setScalar(r);
    this.dome.scale.setScalar(r);
    this.ring.material.opacity = 0.9 * (1 - k);
    this.dome.material.opacity = 0.25 * (1 - k);
  }
}

/** XANA activates a tower: monsters get aggressive for a while, and leave the one who activated it alone. */
class TowerActivation extends Hazard {
  constructor(ctx, fx) {
    super(ctx, fx, 15);
    // each client's monsters only ever attack its own ball, so this is per player
    if (fx.from === ctx.myId) ctx.course.calmUntil = this.start + this.dur;
    else ctx.course.enrageUntil = Math.max(ctx.course.enrageUntil ?? -1, this.start + this.dur);
    sfx.play('jackpot');
  }
  frame() {}
}

export const HAZARDS = { wind: Wind, tornado: Tornado, volcano: Volcano, icerink: IceRink, tsunami: Tsunami, montapollos: Montapollos, arrow: LaserArrow, energyfield: EnergyField, tower: TowerActivation };
