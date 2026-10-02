import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';

// Monster attacks, shared rules (they apply to the LOCAL ball; every client runs its own):
//  - each monster fires on its own seeded, unhurried rhythm (faster while a tower is active)
//  - every shot is telegraphed: the monster charges and a red ring marks where it will land
//  - never at a ball whose player is lining up a shot, and not within 2 s of it coming to rest
//  - a ball can only be hit once every 4 s
//  - knockback only ever applies to a ball that is already rolling; resting balls only get
//    the monster's status effect (venom, freeze, vaporize…)

const HIT_COOLDOWN = 4;
const REST_GRACE = 2;

/** May a monster start an attack on this ball right now? */
export function canTarget(course, ball, t, { allowResting = false } = {}) {
  if (!ball || course.noAttacks) return false;
  if (ball.state !== 'idle' && ball.state !== 'moving') return false;
  if (ball.mods?.monsterProof || ball.frozen) return false;
  if (t - (course.monsterHitAt ?? -99) < HIT_COOLDOWN) return false;
  if (ball.state === 'idle') {
    if (!allowResting || course.aiming) return false;
    if (t - (course.restAt ?? -99) < REST_GRACE) return false;
  }
  return true;
}

/** Register a hit (cooldown + status callback). */
export function landHit(course, kind, t) {
  course.monsterHitAt = t;
  course.onMonsterHit?.(kind);
}

export function seededRng(ctx, spec, tag) {
  const s0 = spec.path ? spec.path(0) : { x: spec.p?.[0] ?? 0, z: spec.p?.[2] ?? 0 };
  return new RNG(`${ctx.course.def.id}:${tag}:${s0.x.toFixed(2)},${s0.z.toFixed(2)}`);
}

const PROJ_COLORS = { laser: '#ff2a2a', venom: '#7dff3a', firering: '#ff8a1a', ice: '#9fe8ff' };

/**
 * A monster's gun. cfg:
 *   kind      laser | venom | firering | ice
 *   every     [min, max] seconds between attacks
 *   charge    telegraph seconds
 *   range     max distance to target
 *   speed     projectile speed (u/s); ice is an instant beam
 *   knock     impulse for rolling balls
 *   burst     shots per attack (tarantula)
 *   status    'venom' | 'freeze' | null — applied on hit (also to resting balls if allowResting)
 *   muzzle(t) → THREE.Vector3 world position of the gun
 *   ready(t)  optional → false while the monster can't shoot (creeper underground)
 */
export class Gun {
  constructor(monster, cfg) {
    this.m = monster;
    this.ctx = monster.ctx;
    this.cfg = { every: [8, 12], charge: 0.9, range: 7, speed: 9, knock: 140, burst: 1, status: null, allowResting: false, ...cfg };
    this.rng = seededRng(this.ctx, monster.spec, `gun:${cfg.kind}`);
    this.nextT = 2.5 + this.rng.range(0, this.cfg.every[1]);
    this.charge = null;
    this.shots = [];
    this.color = PROJ_COLORS[this.cfg.kind] || '#ff2a2a';
    this.mat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.95, depthWrite: false });
  }

  update(t) {
    const course = this.ctx.course;
    const ball = course.localBall;
    if (this.charge) {
      const c = this.charge;
      const k = (t - c.t0) / this.cfg.charge;
      c.ring.scale.setScalar(1.25 - 0.55 * Math.min(1, k));
      c.ring.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(k * 10));
      if (k >= 1) {
        this.ctx.group.remove(c.ring);
        this.charge = null;
        for (let i = 0; i < this.cfg.burst; i++) this.fire(t + i * 0.22, c.to, i);
      }
      return;
    }
    if (t < this.nextT) return;
    const enraged = t < (course.enrageUntil ?? -1);
    this.nextT = t + this.rng.range(this.cfg.every[0], this.cfg.every[1]) * (enraged ? 0.5 : 1);
    if (this.cfg.ready && !this.cfg.ready(t)) return;
    if (!canTarget(course, ball, t, { allowResting: this.cfg.allowResting })) return;
    const from = this.cfg.muzzle(t);
    const bp = ball.pos;
    const lead = ball.state === 'moving' ? this.cfg.charge * 0.5 : 0;
    const to = new THREE.Vector3(bp.x + ball.vel.x * lead, bp.y - ball.radius + 0.02, bp.z + ball.vel.z * lead);
    if (Math.hypot(to.x - from.x, to.z - from.z) > this.cfg.range) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(to).add(new THREE.Vector3(0, 0.03, 0));
    this.ctx.group.add(ring);
    this.charge = { t0: t, to, ring };
    this.m.onCharge?.(t);
  }

  fire(t0, to, i) {
    const from = this.cfg.muzzle(t0);
    const dist = from.distanceTo(to);
    const dur = this.cfg.kind === 'ice' ? 0.12 : Math.max(0.2, dist / this.cfg.speed);
    let mesh;
    if (this.cfg.kind === 'firering') {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 18), this.mat);
    } else if (this.cfg.kind === 'ice') {
      // an instant beam from the gun to the spot
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, dist, 6, 1, true), this.mat);
      mesh.position.copy(from).lerp(to, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), this.mat);
      mesh.scale.set(1, 1, 3.5);
      mesh.lookAt(to);
    }
    if (this.cfg.kind !== 'ice') mesh.position.copy(from);
    const flash = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.8, depthWrite: false }));
    flash.rotation.x = -Math.PI / 2;
    flash.position.copy(to).add(new THREE.Vector3(0, 0.03, 0));
    flash.visible = false;
    this.ctx.group.add(mesh, flash);
    // a burst scatters a little around the marked spot
    const spot = i ? to.clone().add(new THREE.Vector3(this.rng.range(-0.5, 0.5), 0, this.rng.range(-0.5, 0.5))) : to;
    this.shots.push({ t0, dur, from, to: spot, mesh, flash, landed: false, applied: false });
    if (i === 0) sfx.play('laser');
  }

  frame(t) {
    for (const s of this.shots) {
      const k = (t - s.t0) / s.dur;
      if (k < 0) { s.mesh.visible = false; continue; }
      s.mesh.visible = !s.landed;
      if (this.cfg.kind !== 'ice') s.mesh.position.lerpVectors(s.from, s.to, Math.min(1, k));
      if (this.cfg.kind === 'firering') { s.mesh.rotation.x = t * 8; s.mesh.scale.setScalar(1 + k * 1.5); }
      if (k >= 1 && !s.landed) { s.landed = true; s.flash.visible = true; }
      if (s.landed) {
        const f = (t - s.t0 - s.dur) / 0.4;
        s.flash.scale.setScalar(0.3 + f * 1.2);
        s.flash.material.opacity = 0.8 * Math.max(0, 1 - f);
      }
    }
    this.shots = this.shots.filter((s) => {
      if (t - s.t0 > s.dur + 0.5 || t < s.t0 - 2) { this.ctx.group.remove(s.mesh, s.flash); return false; }
      return true;
    });
  }

  force(ball, t, out) {
    for (const s of this.shots) {
      if (!s.landed || s.applied) continue;
      s.applied = true;
      const p = ball.pos;
      const dx = p.x - s.to.x, dz = p.z - s.to.z, d = Math.hypot(dx, dz);
      if (d > 0.6 + ball.radius || Math.abs(p.y - s.to.y) > 1) continue;
      if (t - (this.ctx.course.monsterHitAt ?? -99) < 0.5 && !s.first) { /* same burst keeps hitting */ }
      if (ball.state === 'moving' && this.cfg.knock) {
        const k = this.cfg.knock;
        out.x += (dx / (d || 1)) * k + (this.rng.next() - 0.5) * k * 0.2;
        out.z += (dz / (d || 1)) * k + (this.rng.next() - 0.5) * k * 0.2;
        out.y += k * 0.35;
      }
      landHit(this.ctx.course, this.cfg.status || this.m.spec.type, t);
    }
  }

  dispose() {
    for (const s of this.shots) this.ctx.group.remove(s.mesh, s.flash);
    if (this.charge) this.ctx.group.remove(this.charge.ring);
  }
}

/**
 * Manta energy mines: dropped along its flight path on a seeded rhythm (so everyone sees the same
 * mines), they arm after a second and blow up when a ball rolls close.
 */
export class MineLayer {
  constructor(monster, { every = [6, 9], life = 14 } = {}) {
    this.m = monster;
    this.ctx = monster.ctx;
    this.rng = seededRng(this.ctx, monster.spec, 'mines');
    this.every = every;
    this.life = life;
    this.nextT = 3 + this.rng.range(0, every[1]);
    this.mines = [];
    this.mat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ff2a2a', emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.4 });
  }
  update(t) {
    if (t < this.nextT) return;
    this.nextT = t + this.rng.range(this.every[0], this.every[1]);
    const s = this.m.at(t);
    const y = this.ctx.course.floorYAt(s.x, s.z);
    if (y === null) return;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), this.mat));
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), this.mat);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
      spike.rotation.z = -Math.PI / 2;
      spike.rotation.y = -a;
      g.add(spike);
    }
    g.position.set(s.x, y + 0.2, s.z);
    this.ctx.group.add(g);
    this.mines.push({ g, x: s.x, y, z: s.z, born: t, armed: false, gone: false });
  }
  frame(t) {
    for (const mn of this.mines) {
      mn.armed = t - mn.born > 1;
      const blink = mn.armed && Math.floor(t * 4) % 2 === 0;
      mn.g.children[0].material.emissiveIntensity = blink ? 1.4 : 0.3;
      mn.g.position.y = mn.y + 0.2 + Math.sin(t * 3 + mn.x) * 0.04;
    }
    this.mines = this.mines.filter((mn) => {
      if (!mn.gone && t - mn.born < this.life) return true;
      this.ctx.group.remove(mn.g);
      return false;
    });
  }
  force(ball, t, out) {
    if (ball.state !== 'moving' && ball.state !== 'idle') return;
    const p = ball.pos;
    for (const mn of this.mines) {
      if (!mn.armed || mn.gone) continue;
      const dx = p.x - mn.x, dz = p.z - mn.z, d = Math.hypot(dx, dz);
      if (d > 0.75 || Math.abs(p.y - mn.y) > 1) continue;
      mn.gone = true;
      for (let i = 0; i < 30; i++) this.ctx.particles?.spawn?.({ pos: [mn.x, mn.y + 0.2, mn.z], vel: [(Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5], color: i % 2 ? '#ff2a2a' : '#ffb36a', size: 0.2, life: 0.7, gravity: 6 });
      sfx.play('rumble');
      if (ball.state === 'moving') { out.x += (dx / (d || 1)) * 420; out.z += (dz / (d || 1)) * 420; out.y += 220; out.wake = true; }
      landHit(this.ctx.course, 'mine', t);
    }
  }
  dispose() { for (const mn of this.mines) this.ctx.group.remove(mn.g); }
}
