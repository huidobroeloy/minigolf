import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';

// Monster attacks, shared rules (they apply to the LOCAL ball; every client runs its own):
//  - each monster fires on its own seeded rhythm, every ~4–7 s (twice as often while a tower is active)
//  - every shot is telegraphed: the monster charges and a red ring marks where it will land
//  - never at a ball whose player is lining up a shot, and not within 2 s of it coming to rest;
//    when it can't shoot at you (or you're out of range) it fires at the ground nearby instead,
//    so monsters always look like they're fighting
//  - a ball can only be hit once every 4 s
//  - a rolling ball takes the full knock, a resting one 40% of it; every hit costs Lyoko life
//    points (the show's values, see DAMAGE) and applies the monster's status (venom, freeze…)

const HIT_COOLDOWN = 4;
const REST_GRACE = 2;
const FIRE_SCALE = 0.55; // monsters' `every` intervals were written for a slower game
const MIN_RANGE = 8.5;

/** Life points each attack costs (from the show). 100 = devirtualized outright. */
export const DAMAGE = {
  kankrelat: { laser: 10 },
  hornet: { laser: 15, charged: 20, poison: 10 },
  blok: { laser: 20, ice: 10, firering: 80, rapid: 20 },
  krabe: { laser: 20, charged: 40, mixed: 100 },
  tarantula: { rapid: 15, laser: 15 },
  creeper: { laser: 20 },
  manta: { laser: 40, mine: 100 },
  shark: { laser: 25, ram: 25 },
  scyphozoa: { grab: 30 },
  megatank: { beam: 100 },
};
export const damageFor = (type, kind) => DAMAGE[type]?.[kind] ?? 20;

/** May a monster start an attack on this ball right now? */
export function canTarget(course, ball, t, { allowResting = false } = {}) {
  if (!ball || course.noAttacks) return false;
  if (ball.state !== 'idle' && ball.state !== 'moving') return false;
  if (ball.mods?.monsterProof || ball.frozen) return false;
  if (t - (course.monsterHitAt ?? -99) < HIT_COOLDOWN) return false;
  if (t < (course.calmUntil ?? -1)) return false; // you activated the tower: XANA's monsters spare you
  if (ball.state === 'idle') {
    if (!allowResting || course.aiming) return false;
    if (t - (course.restAt ?? -99) < REST_GRACE) return false;
  }
  return true;
}

/** Register a hit (cooldown + status callback + life points). */
export function landHit(course, kind, t, dmg = 20) {
  if (t < (course.calmUntil ?? -1)) return; // you activated the tower: nothing of XANA's hurts you
  course.monsterHitAt = t;
  course.onMonsterHit?.(kind, dmg);
}

export function seededRng(ctx, spec, tag) {
  const s0 = spec.path ? spec.path(0) : { x: spec.p?.[0] ?? 0, z: spec.p?.[2] ?? 0 };
  return new RNG(`${ctx.course?.def?.id ?? 'scene'}:${tag}:${s0.x.toFixed(2)},${s0.z.toFixed(2)}`);
}

const PROJ_COLORS = { laser: '#ff2a2a', charged: '#ff6a2a', rapid: '#ff4a4a', venom: '#7dff3a', poison: '#7dff3a', firering: '#ff8a1a', ice: '#9fe8ff', mixed: '#ff2a8a' };

/**
 * A monster's gun. It can have several abilities (cfg.modes, each with a weight `w`); one is picked
 * per attack. Ability fields:
 *   kind      laser | charged | rapid | poison | firering | ice | mixed (the look)
 *   every     [min, max] seconds between attacks (gun level)
 *   charge    telegraph seconds
 *   range     max distance to target
 *   speed     projectile speed (u/s); ice/mixed are instant beams
 *   knock     impulse for rolling balls
 *   burst     shots per attack, burstGap seconds apart
 *   status    'venom' | 'freeze' | 'vaporize' | null — applied on hit
 *   allowResting  may target a resting ball (status-only hits)
 *   when(t)   optional → false if this ability can't be used now (e.g. no partner for the mixed laser)
 *   muzzle(t) → THREE.Vector3 world position of the gun (gun level)
 *   ready(t)  optional → false while the monster can't shoot at all (creeper underground)
 */
export class Gun {
  constructor(monster, cfg) {
    this.m = monster;
    this.ctx = monster.ctx;
    const base = { every: [8, 12], charge: 0.9, range: 7, speed: 9, knock: 140, burst: 1, burstGap: 0.22, status: null, allowResting: true };
    this.base = { ...base, ...cfg };
    this.base.every = [Math.max(3.5, this.base.every[0] * FIRE_SCALE), Math.max(5.5, this.base.every[1] * FIRE_SCALE)];
    this.base.range = Math.max(MIN_RANGE, this.base.range);
    this.modes = (cfg.modes || [{ w: 1 }]).map((m) => ({ ...this.base, ...m, range: Math.max(MIN_RANGE, m.range ?? this.base.range) }));
    this.cfg = this.modes[0];
    this.rng = seededRng(this.ctx, monster.spec, `gun:${this.modes.map((m) => m.kind).join('+')}`);
    this.nextT = 2.5 + this.rng.range(0, this.base.every[1]);
    this.charge = null;
    this.shots = [];
    this.puddles = [];
    this.mats = {};
  }

  mat(kind) {
    return (this.mats[kind] ||= new THREE.MeshBasicMaterial({ color: PROJ_COLORS[kind] || '#ff2a2a', transparent: true, opacity: 0.95, depthWrite: false }));
  }

  pickMode(t) {
    const ok = this.modes.filter((m) => !m.when || m.when(t));
    const total = ok.reduce((a, m) => a + (m.w ?? 1), 0);
    let r = this.rng.next() * total;
    for (const m of ok) { r -= m.w ?? 1; if (r <= 0) return m; }
    return ok[ok.length - 1];
  }

  update(t) {
    const course = this.ctx.course;
    const ball = course.localBall;
    if (this.charge) {
      const c = this.charge, cfg = c.cfg;
      const k = (t - c.t0) / cfg.charge;
      c.ring.scale.setScalar(1.25 - 0.55 * Math.min(1, k));
      c.ring.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(k * (cfg.kind === 'charged' || cfg.kind === 'mixed' ? 16 : 10)));
      if (k >= 1) {
        this.ctx.group.remove(c.ring);
        this.charge = null;
        for (let i = 0; i < cfg.burst; i++) this.fire(t + i * cfg.burstGap, c.to, i, cfg);
      }
      return;
    }
    if (t < this.nextT) return;
    if (course.noAttacks) { this.nextT = t + 1; return; }
    // can't shoot right now (a Creeper underground…): try again shortly, never skip the turn
    if (this.base.ready && !this.base.ready(t)) { this.nextT = t + 0.6; return; }
    const cfg = this.pickMode(t);
    const from = this.base.muzzle(t);
    let to = null, ambient = false;
    const bp = ball?.pos;
    const driven = this.m.agent && t < this.m.agent.until;
    const inRange = ball && Math.hypot(bp.x - from.x, bp.z - from.z) <= cfg.range && Math.abs(bp.y - from.y) < 4 && !(driven && this.m.agent.by === course.myId);
    // a resting ball is only targeted half the time (it can't dodge); a rolling one always
    if (inRange && canTarget(course, ball, t, { allowResting: cfg.allowResting }) && (ball.state === 'moving' || this.rng.next() < 0.5)) {
      const lead = ball.state === 'moving' ? cfg.charge * 0.5 : 0;
      to = new THREE.Vector3(bp.x + ball.vel.x * lead, bp.y - ball.radius + 0.02, bp.z + ball.vel.z * lead);
    } else {
      // not at you (you're aiming, just stopped, out of range…): it still fights, at the
      // ground nearby, well clear of your ball
      to = this.ambientSpot(from, bp);
      ambient = true;
      if (!to) { this.nextT = t + 0.6; return; }
    }
    const enraged = t < (course.enrageUntil ?? -1) || driven;
    this.nextT = t + this.rng.range(this.base.every[0], this.base.every[1]) * (enraged ? 0.5 : 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), new THREE.MeshBasicMaterial({ color: PROJ_COLORS[cfg.kind] || '#ff2a2a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(to).add(new THREE.Vector3(0, 0.03, 0));
    this.ctx.group.add(ring);
    if (ambient) ring.material.opacity = 0.35;
    this.charge = { t0: t, to, ring, cfg };
    this.cfg = cfg;
    this.m.onCharge?.(t, cfg);
  }

  /** A floor spot 2–5 units from the monster, at least 2.5 from the ball (null if none). */
  ambientSpot(from, bp) {
    const course = this.ctx.course;
    for (let k = 0; k < 8; k++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(2, 5);
      const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
      const y = course.floorYAt?.(x, z);
      if (y === null || y === undefined || Math.abs(y - from.y) > 4) continue;
      if (bp && Math.hypot(x - bp.x, z - bp.z) < 2.5) continue;
      return new THREE.Vector3(x, y + 0.02, z);
    }
    return null;
  }

  fire(t0, to, i, cfg) {
    const from = this.base.muzzle(t0);
    const beam = cfg.kind === 'ice' || cfg.kind === 'mixed';
    // a burst scatters a little around the marked spot
    const spot = i ? to.clone().add(new THREE.Vector3(this.rng.range(-0.55, 0.55), 0, this.rng.range(-0.55, 0.55))) : to;
    const dist = from.distanceTo(spot);
    const dur = beam ? 0.15 : Math.max(0.15, dist / cfg.speed);
    let mesh;
    const m = this.mat(cfg.kind);
    if (cfg.kind === 'firering') {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 18), m);
    } else if (beam) {
      const w = cfg.kind === 'mixed' ? 0.12 : 0.05;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(w, w, dist, 6, 1, true), m);
      mesh.position.copy(from).lerp(spot, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spot.clone().sub(from).normalize());
    } else if (cfg.kind === 'poison') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m);
    } else {
      const big = cfg.kind === 'charged' ? 1.9 : cfg.kind === 'rapid' ? 0.7 : 1;
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08 * big, 8, 6), m);
      mesh.scale.set(1, 1, 3.5);
      mesh.lookAt(spot);
    }
    if (!beam) mesh.position.copy(from);
    const flash = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: PROJ_COLORS[cfg.kind] || '#ff2a2a', transparent: true, opacity: 0.8, depthWrite: false }));
    flash.rotation.x = -Math.PI / 2;
    flash.position.copy(spot).add(new THREE.Vector3(0, 0.03, 0));
    flash.visible = false;
    this.ctx.group.add(mesh, flash);
    this.shots.push({ t0, dur, from, to: spot, mesh, flash, landed: false, applied: false, cfg });
    if (i === 0 || cfg.kind === 'rapid') sfx.play('laser');
  }

  frame(t) {
    for (const s of this.shots) {
      const k = (t - s.t0) / s.dur;
      if (k < 0) { s.mesh.visible = false; continue; }
      const beam = s.cfg.kind === 'ice' || s.cfg.kind === 'mixed';
      s.mesh.visible = !s.landed || beam && t - s.t0 < s.dur + 0.25;
      if (!beam) {
        s.mesh.position.lerpVectors(s.from, s.to, Math.min(1, k));
        if (s.cfg.kind === 'poison') s.mesh.position.y += Math.sin(Math.min(1, k) * Math.PI) * 0.8; // lobbed
      }
      if (s.cfg.kind === 'firering') { s.mesh.rotation.x = t * 8; s.mesh.scale.setScalar(1 + k * 1.5); }
      if (k >= 1 && !s.landed) {
        s.landed = true;
        s.flash.visible = true;
        if (s.cfg.kind === 'poison') this.addPuddle(s.to, t);
      }
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
    for (const pd of this.puddles) {
      const left = pd.until - t;
      pd.mesh.material.opacity = 0.65 * Math.min(1, left / 1.5) * (0.85 + 0.15 * Math.sin(t * 5 + pd.x));
      pd.mesh.scale.setScalar(Math.min(1, (t - pd.born) * 4));
    }
    this.puddles = this.puddles.filter((pd) => { if (t < pd.until) return true; this.ctx.group.remove(pd.mesh); return false; });
  }

  /** Hornet poison: a green puddle that lingers, slows whatever rolls through and envenoms it. */
  addPuddle(at, t) {
    const y = this.ctx.course.floorYAt(at.x, at.z);
    if (y === null) return;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: '#6fe03a', transparent: true, opacity: 0.6, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, y + 0.02, at.z);
    this.ctx.group.add(mesh);
    this.puddles.push({ x: at.x, y, z: at.z, r: 0.9, born: t, until: t + 9, mesh, stung: false });
  }

  force(ball, t, out) {
    const p = ball.pos;
    for (const pd of this.puddles) {
      if (Math.hypot(p.x - pd.x, p.z - pd.z) > pd.r || Math.abs(p.y - ball.radius - pd.y) > 0.4) continue;
      if (ball.state === 'moving') { const v = ball.vel; out.x -= v.x * 5; out.z -= v.z * 5; }
      if (!pd.stung) { pd.stung = true; landHit(this.ctx.course, 'venom', t, damageFor(this.m.spec.type, 'poison')); }
    }
    for (const s of this.shots) {
      if (!s.landed || s.applied) continue;
      s.applied = true;
      const dx = p.x - s.to.x, dz = p.z - s.to.z, d = Math.hypot(dx, dz);
      const reach = (s.cfg.kind === 'firering' ? 0.9 : 0.6) + ball.radius;
      if (d > reach || Math.abs(p.y - s.to.y) > 1) continue;
      if (s.cfg.kind === 'poison') continue; // the puddle does the work
      if ((ball.state === 'moving' || ball.state === 'idle') && s.cfg.knock && !ball.frozen) {
        // full knock on a rolling ball, a nudge (40%) on a resting one
        const k = s.cfg.knock * (ball.state === 'moving' ? 1 : 0.4);
        out.x += (dx / (d || 1)) * k + (this.rng.next() - 0.5) * k * 0.2;
        out.z += (dz / (d || 1)) * k + (this.rng.next() - 0.5) * k * 0.2;
        out.y += k * 0.35;
        out.wake = true;
      }
      // a burst only counts as one hit (the cooldown starts with the first)
      if (s.cfg.status || t - (this.ctx.course.monsterHitAt ?? -99) > 1) landHit(this.ctx.course, s.cfg.status || this.m.spec.type, t, damageFor(this.m.spec.type, s.cfg.kind));
    }
  }

  dispose() {
    for (const s of this.shots) this.ctx.group.remove(s.mesh, s.flash);
    for (const pd of this.puddles) this.ctx.group.remove(pd.mesh);
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
    if (ball.state !== 'moving') return; // only a ball rolling into a mine sets it off
    const p = ball.pos;
    for (const mn of this.mines) {
      if (!mn.armed || mn.gone) continue;
      const dx = p.x - mn.x, dz = p.z - mn.z, d = Math.hypot(dx, dz);
      if (d > 0.75 || Math.abs(p.y - mn.y) > 1) continue;
      mn.gone = true;
      for (let i = 0; i < 30; i++) this.ctx.particles?.spawn?.({ pos: [mn.x, mn.y + 0.2, mn.z], vel: [(Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5], color: i % 2 ? '#ff2a2a' : '#ffb36a', size: 0.2, life: 0.7, gravity: 6 });
      sfx.play('rumble');
      landHit(this.ctx.course, 'vaporize', t, 100);
    }
  }
  dispose() { for (const mn of this.mines) this.ctx.group.remove(mn.g); }
}
