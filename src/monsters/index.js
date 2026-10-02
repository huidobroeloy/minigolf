import * as THREE from 'three';
import { R } from '../physics/world.js';
import { TEX } from '../course/themes.js';
import { sfx } from '../core/audio.js';
import { makeKolossus } from '../fx/lyoko.js';
import { RNG } from '../core/rng.js';
import { Gun, MineLayer, canTarget, landHit, seededRng } from './attacks.js';

// XANA's monsters, built from primitives. Each one follows a time-based path so every
// client sees them in the same place; attacks are aimed at whoever is looking (your own ball).

const UP = new THREE.Vector3(0, 1, 0);
const HORNET_CHARGE = 0.9; // seconds of warning before a hornet fires
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });
let _eyeMat;
const eyeMat = () => (_eyeMat ||= new THREE.MeshBasicMaterial({ map: TEX.xanaEye(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));

function part(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function eye(parent, pos, size, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), eyeMat());
  m.position.set(...pos);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

function kinematic(physics, pos) {
  return physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
}

function collider(physics, body, desc, restitution = 0.6) {
  desc.setFriction(0).setRestitution(restitution).setCollisionGroups(physics.groupFor('monster'));
  const c = physics.world.createCollider(desc, body);
  physics.meta.set(c.handle, { kind: 'obst', collider: c, body });
  return c;
}

/** Shared behaviour: a model + optional kinematic body that follow spec.path(t). */
class Monster {
  constructor(spec, ctx, model, { yOff = 0, colliders = [] } = {}) {
    this.spec = spec;
    this.ctx = ctx;
    this.model = model;
    this.yOff = yOff;
    ctx.group.add(model);
    const s = this.at(0);
    this.body = null;
    if (colliders.length) {
      this.body = kinematic(ctx.physics, { x: s.x, y: s.y + yOff, z: s.z });
      for (const [desc, rest] of colliders) collider(ctx.physics, this.body, desc, rest);
    }
    this.q = new THREE.Quaternion();
    this.place(model, s);
    this.guns = [];
  }
  /** World position of something at (x, y, z) in the monster's local frame (for gun muzzles). */
  local(x, y, z) { return this.model.localToWorld(new THREE.Vector3(x, y, z)); }
  at(t) {
    if (this.spec.path) return this.spec.path(t);
    const p = this.spec.p;
    return { x: p[0], y: p[1], z: p[2], ry: this.spec.ry || 0 };
  }
  place(obj, s) {
    obj.position.set(s.x, s.y, s.z);
    obj.rotation.y = s.ry || 0;
  }
  update(t) {
    if (!this.body) return;
    const s = this.at(t);
    if (!s) return;
    this.body.setNextKinematicTranslation({ x: s.x, y: s.y + this.yOff, z: s.z });
    this.q.setFromAxisAngle(UP, s.ry || 0);
    this.body.setNextKinematicRotation(this.q);
  }
  frame(t) { this.place(this.model, this.at(t)); }
  dispose() {
    this.ctx.group.remove(this.model);
    if (this.body) { this.ctx.physics.removeBody(this.body); this.body = null; }
  }
}

// ---------- Kankrelat: the little roach ----------
class Kankrelat extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const shell = std('#c9b27c'), dark = std('#3a3226');
    const body = part(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, g, [0, 0.3, 0], [0, 0, 0], [1, 0.8, 1.15]);
    part(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), shell, g, [0, 0.3, 0], [0, 0, 0], [1, 1, 1.15]);
    eye(g, [0, 0.62, 0.05], 0.5, [-Math.PI / 2, 0, 0]);
    eye(g, [0, 0.36, 0.49], 0.36);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = part(new THREE.CylinderGeometry(0.05, 0.03, 0.42, 6), dark, g, [sx * 0.38, 0.16, sz * 0.28], [sz * 0.4, 0, sx * 0.6]);
      legs.push(leg);
    }
    super(spec, ctx, g, { yOff: 0.3, colliders: [[R.ColliderDesc.cuboid(0.4, 0.25, 0.46)]] });
    this.legs = legs;
    this.bodyMesh = body;
    this.guns.push(new Gun(this, { kind: 'laser', every: [8, 12], charge: 0.8, range: 6, knock: 120, muzzle: () => this.local(0, 0.4, 0.5) }));
  }
  frame(t) {
    super.frame(t);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 + i * 1.6) * 0.5; });
    this.model.position.y += Math.abs(Math.sin(t * 16)) * 0.03;
  }
}

// ---------- Tumbleweed (desert) ----------
class Tumbleweed extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const ball = part(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: '#a07a45', wireframe: true }), g, [0, 0.42, 0]);
    part(new THREE.IcosahedronGeometry(0.3, 0), std('#8a6a3a', { transparent: true, opacity: 0.6 }), ball);
    super(spec, ctx, g, { yOff: 0.42, colliders: [[R.ColliderDesc.ball(0.38), 0.3]] });
    this.ball = ball;
    this.prev = this.at(0);
  }
  frame(t) {
    const s = this.at(t);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) {
      const axis = new THREE.Vector3(dz, 0, -dx).normalize();
      this.ball.rotateOnWorldAxis(axis, d / 0.42);
    }
    this.model.position.set(s.x, s.y + Math.abs(Math.sin(t * 5)) * 0.25, s.z);
    this.prev = s;
    if (Math.random() < 0.15 && this.ctx.course.decoration?.dust) {
      this.ctx.course.decoration.dust({ x: s.x, y: s.y + 0.05, z: s.z });
    }
  }
}

// ---------- Megatank: rolls along, opens its shell, charges and fires a flat beam ----------
// Its beam vaporizes a ball it touches. The aim locks when it starts charging (1.3 s of red
// warning line), so you can roll out of the line or hide behind a wall.
class Megatank extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const r = 0.85;
    const roller = new THREE.Group();
    roller.position.y = r;
    g.add(roller);
    const shellMat = std('#5d5f66', { metalness: 0.4, roughness: 0.4 });
    const top = part(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat, roller);
    const bottom = part(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat, roller);
    part(new THREE.TorusGeometry(r, 0.06, 6, 32), std('#c9b27c'), roller, [0, 0, 0], [Math.PI / 2, 0, 0]);
    const eyePlane = eye(roller, [0, 0, r + 0.01], 0.9);
    const core = part(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color: '#ff3b1f' }), roller);
    core.visible = false;
    super(spec, ctx, g, { yOff: r, colliders: [[R.ColliderDesc.ball(r), 0.7]] });
    Object.assign(this, { roller, top, bottom, core, r, eyePlane });
    this.prev = this.at(0);
    this.rng = seededRng(ctx, spec, 'megatank');
    this.nextT = 4 + this.rng.range(0, 6);
    this.mode = null; // null | charge | beam
    this.t0 = 0;
    this.aim = 0;
    this.BEAM_LEN = 11;
    // warning line and beam (both lie along +z of a pivot that we turn to the aim)
    this.pivot = new THREE.Group();
    ctx.group.add(this.pivot);
    const warnMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    this.warn = new THREE.Mesh(new THREE.PlaneGeometry(0.12, this.BEAM_LEN), warnMat);
    this.warn.rotation.x = -Math.PI / 2;
    this.warn.position.z = this.BEAM_LEN / 2 + 0.6;
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd0c0', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, this.BEAM_LEN), beamMat);
    this.beam.position.z = this.BEAM_LEN / 2 + 0.6;
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ff3b1f', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, this.BEAM_LEN), glowMat);
    this.glow.position.z = this.BEAM_LEN / 2 + 0.6;
    this.pivot.add(this.warn, this.beam, this.glow);
    this.pivot.visible = false;
  }
  update(t) {
    super.update(t);
    const course = this.ctx.course;
    if (this.mode === 'charge' && t - this.t0 >= 1.3) { this.mode = 'beam'; this.t0 = t; this.hitDone = false; sfx.play('laser'); course.onShake?.(0.4); }
    else if (this.mode === 'beam' && t - this.t0 >= 0.6) this.mode = null;
    if (this.mode || t < this.nextT) return;
    const enraged = t < (course.enrageUntil ?? -1);
    this.nextT = t + this.rng.range(9, 14) * (enraged ? 0.5 : 1);
    const ball = course.localBall;
    if (!canTarget(course, ball, t, { allowResting: true })) return;
    const s = this.at(t), bp = ball.pos;
    if (Math.hypot(bp.x - s.x, bp.z - s.z) > this.BEAM_LEN - 1) return;
    this.aim = Math.atan2(bp.x - s.x, bp.z - s.z);
    this.origin = { x: s.x, y: s.y, z: s.z }; // the beam's line is fixed the moment it starts charging
    this.mode = 'charge';
    this.t0 = t;
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y, s.z);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    const d = Math.hypot(dx, dz);
    if (this.mode) this.model.rotation.y = this.aim; // faces its target while firing
    else if (d > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    if (d > 1e-4 && !this.mode) this.roller.rotation.x += d / this.r;
    this.prev = s;
    // shell opens while charging/firing
    const open = this.mode === 'charge' ? Math.min(1, (t - this.t0) / 0.4) : this.mode === 'beam' ? 1 : 0;
    this.top.position.y = open * 0.35;
    this.bottom.position.y = -open * 0.12;
    this.core.visible = open > 0.1;
    if (this.mode === 'charge') this.core.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin((t - this.t0) * 12)));
    this.pivot.visible = !!this.mode;
    const o = this.mode && this.origin ? this.origin : s;
    this.pivot.position.set(o.x, o.y + this.r * 0.75, o.z);
    this.pivot.rotation.y = this.aim;
    this.warn.visible = this.mode === 'charge';
    this.warn.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin((t - this.t0) * 9));
    this.beam.visible = this.glow.visible = this.mode === 'beam';
    if (this.mode === 'beam') {
      const k = (t - this.t0) / 0.6;
      this.beam.scale.set(1, 1, 1);
      this.glow.material.opacity = 0.45 * (1 - k);
      this.beam.material.opacity = 0.9 * (1 - k * 0.6);
    }
  }
  force(ball, t, out) {
    if (this.mode !== 'beam' || this.hitDone) return;
    if (ball.state !== 'idle' && ball.state !== 'moving') return;
    const s = this.origin || this.at(t);
    const p = ball.pos;
    const fx = Math.sin(this.aim), fz = Math.cos(this.aim);
    const rx = p.x - s.x, rz = p.z - s.z;
    const along = rx * fx + rz * fz, perp = Math.abs(rx * fz - rz * fx);
    if (along > 0.4 && along < this.BEAM_LEN + 0.6 && perp < 0.6 + ball.radius && Math.abs(p.y - (s.y + this.r * 0.75)) < 1.2) {
      this.hitDone = true;
      landHit(this.ctx.course, 'vaporize', t);
    }
  }
  dispose() { super.dispose(); this.ctx.group.remove(this.pivot); }
}

// ---------- Hornet: flies around, fires laser pulses at your ball ----------
class Hornet extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const body = std('#b8892e'), dark = std('#3a2a12');
    part(new THREE.SphereGeometry(0.28, 14, 10), body, g, [0, 0, 0.15], [0, 0, 0], [1, 0.9, 1.2]);
    part(new THREE.ConeGeometry(0.22, 0.7, 12), body, g, [0, -0.05, -0.38], [-Math.PI / 2 - 0.2, 0, 0]);
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), dark, g, [0, -0.25, 0.3], [0.6, 0, 0]); // stinger-gun
    eye(g, [0, 0.05, 0.5], 0.3);
    const wings = [];
    for (const s of [-1, 1]) {
      const w = part(new THREE.PlaneGeometry(0.7, 0.28), new THREE.MeshStandardMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.55, side: THREE.DoubleSide }), g, [s * 0.4, 0.2, 0.05], [Math.PI / 2, 0, 0]);
      wings.push(w);
    }
    super(spec, ctx, g);
    this.wings = wings;
    this.shots = [];
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.9 });
    this.flashMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.8, depthWrite: false });
    // each hornet keeps its own unhurried, seeded rhythm (the same on every client)
    const s0 = spec.path ? spec.path(0) : { x: spec.p?.[0] ?? 0, z: spec.p?.[2] ?? 0 };
    this.rng = new RNG(`${ctx.course.def.id}:hornet:${s0.x.toFixed(2)},${s0.z.toFixed(2)}`);
    this.nextT = 2 + this.rng.range(0, 5);
    this.charge = null; // telegraph before a shot: { t0, to, ring }
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + Math.sin(t * 3) * 0.15, s.z);
    const ball = this.ctx.course.localBall;
    if (ball) this.model.lookAt(ball.mesh.position.x, s.y - 0.6, ball.mesh.position.z);
    this.wings.forEach((w, i) => { w.rotation.y = Math.sin(t * 60 + i * Math.PI) * 0.6; });
    for (const sh of this.shots) {
      const k = Math.min(1, (t - sh.t0) / 0.25);
      sh.beam.position.lerpVectors(sh.from, sh.to, k);
      if (k >= 1 && !sh.hit) {
        sh.hit = true;
        sh.flash.visible = true;
        sh.beam.visible = false;
      }
      if (sh.hit) {
        const f = (t - sh.t0 - 0.25) / 0.35;
        sh.flash.scale.setScalar(0.3 + f * 1.2);
        sh.flash.material.opacity = 0.8 * (1 - f);
      }
    }
    this.shots = this.shots.filter((sh) => {
      if (t - sh.t0 > 0.6 || t < sh.t0) { this.ctx.group.remove(sh.beam, sh.flash); return false; }
      return true;
    });
  }
  update(t) {
    const ball = this.ctx.course.localBall;
    // telegraph: a red ring marks where the shot will land ~0.9 s later, so a rolling ball can dodge
    if (this.charge) {
      const c = this.charge;
      const k = (t - c.t0) / HORNET_CHARGE;
      c.ring.scale.setScalar(1.2 - 0.6 * Math.min(1, k));
      c.ring.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(k * 9));
      if (k >= 1) { this.ctx.group.remove(c.ring); this.charge = null; this.fire(t, c.to); }
      return;
    }
    if (t < this.nextT) return;
    const enraged = t < (this.ctx.course.enrageUntil ?? -1); // XANA activated a tower
    this.nextT = t + (6 + this.rng.range(0, 4)) * (enraged ? 0.5 : 1);
    // hornets harass rolling balls; they never shoot a ball you're lining up
    if (!canTarget(this.ctx.course, ball, t) || ball.state !== 'moving') return;
    const s = this.at(t);
    const bp = ball.pos;
    const to = new THREE.Vector3(bp.x + ball.vel.x * HORNET_CHARGE * 0.6, bp.y - ball.radius + 0.02, bp.z + ball.vel.z * HORNET_CHARGE * 0.6);
    if (Math.hypot(to.x - s.x, to.z - s.z) > 9) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), this.ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(to).add(new THREE.Vector3(0, 0.03, 0));
    this.ctx.group.add(ring);
    this.charge = { t0: t, to, ring };
  }
  fire(t, to) {
    {
      const s = this.at(t);
      const from = new THREE.Vector3(s.x, s.y, s.z);
      const beam = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), this.beamMat);
      beam.scale.set(1, 1, 3);
      beam.lookAt(to);
      const flash = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), this.flashMat.clone());
      flash.rotation.x = -Math.PI / 2;
      flash.position.copy(to).add(new THREE.Vector3(0, 0.02, 0));
      flash.visible = false;
      this.ctx.group.add(beam, flash);
      this.shots.push({ t0: t, from, to, beam, flash, hit: false, applied: false });
      sfx.play('laser');
    }
  }
  force(ball, t, out) {
    for (const sh of this.shots) {
      if (!sh.hit || sh.applied) continue;
      sh.applied = true;
      const p = ball.pos;
      const dx = p.x - sh.to.x, dz = p.z - sh.to.z, d = Math.hypot(dx, dz);
      if (d < 0.6 && ball.state === 'moving' && !ball.mods.monsterProof) {
        out.x += (dx / (d || 1)) * 160 + (Math.random() - 0.5) * 30;
        out.z += (dz / (d || 1)) * 160 + (Math.random() - 0.5) * 30;
        out.y += 60;
        landHit(this.ctx.course, 'venom', t);
      }
    }
  }
  dispose() {
    super.dispose();
    for (const sh of this.shots) this.ctx.group.remove(sh.beam, sh.flash);
    if (this.charge) this.ctx.group.remove(this.charge.ring);
  }
}

// ---------- Blok: a cube with legs ----------
class Blok extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const skin = std('#d8c79e'), dark = std('#4a3c2a');
    const cube = part(new THREE.BoxGeometry(0.8, 0.8, 0.8), skin, g, [0, 0.7, 0]);
    for (const [pos, rot] of [[[0, 0.7, 0.41], [0, 0, 0]], [[0, 0.7, -0.41], [0, Math.PI, 0]], [[0.41, 0.7, 0], [0, Math.PI / 2, 0]], [[-0.41, 0.7, 0], [0, -Math.PI / 2, 0]]]) eye(g, pos, 0.6, rot);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(part(new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6), dark, g, [sx * 0.28, 0.17, sz * 0.28]));
    super(spec, ctx, g, { yOff: 0.55, colliders: [[R.ColliderDesc.cuboid(0.42, 0.55, 0.42)]] });
    this.cube = cube;
    this.legs = legs;
    this.guns.push(new Gun(this, { kind: 'firering', every: [9, 13], charge: 0.9, range: 7, speed: 6, knock: 200, muzzle: () => this.local(0, 0.7, 0.45) }));
    this.guns.push(new Gun(this, { kind: 'ice', every: [11, 15], charge: 1.1, range: 7, knock: 0, status: 'freeze', allowResting: true, muzzle: () => this.local(0, 0.7, 0.45) }));
  }
  frame(t) {
    super.frame(t);
    this.cube.rotation.y = Math.sin(t * 1.5) * 0.4;
    this.legs.forEach((l, i) => { l.position.y = 0.17 + Math.max(0, Math.sin(t * 10 + i * 1.6)) * 0.05; });
  }
}

// ---------- Krabe: a tall walker; roll under it between its legs ----------
class Krabe extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const skin = std('#d9c9a3'), dark = std('#5b4b35');
    const bodyY = 1.45;
    part(new THREE.CylinderGeometry(0.75, 0.9, 0.35, 20), skin, g, [0, bodyY, 0]);
    part(new THREE.SphereGeometry(0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin, g, [0, bodyY + 0.15, 0], [0, 0, 0], [1, 0.5, 1]);
    eye(g, [0, bodyY + 0.1, 0.92], 0.55);
    const legs = [];
    const legPos = [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    for (const [lx, lz] of legPos) {
      const leg = new THREE.Group();
      leg.position.set(lx * 0.8, bodyY, lz * 0.8);
      g.add(leg);
      part(new THREE.CylinderGeometry(0.07, 0.05, 1.0, 8), dark, leg, [lx * 0.3, -0.35, lz * 0.3], [lz * 0.5, 0, -lx * 0.5]);
      part(new THREE.CylinderGeometry(0.05, 0.02, 1.0, 8), dark, leg, [lx * 0.55, -0.95, lz * 0.55]);
      legs.push(leg);
    }
    const cols = legPos.map(([lx, lz]) => [R.ColliderDesc.cylinder(0.5, 0.09).setTranslation(lx * 1.35, 0, lz * 1.35), 0.6]);
    cols.push([R.ColliderDesc.cylinder(0.2, 0.85).setTranslation(0, bodyY - 0.5, 0), 0.5]);
    super(spec, ctx, g, { yOff: 0.5, colliders: cols });
    this.legs = legs;
    this.guns.push(new Gun(this, { kind: 'laser', every: [8, 12], charge: 1.0, range: 8, knock: 260, muzzle: () => this.local(0, 1.25, 0.6) }));
  }
  frame(t) {
    super.frame(t);
    this.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 6 + i * 1.7) * 0.2; l.position.y = 1.45 + Math.max(0, Math.sin(t * 6 + i * 1.7)) * 0.06; });
    this.model.position.y += Math.sin(t * 12) * 0.03;
  }
}

// ---------- Tarantula: four-legged, fires bursts forward ----------
class Tarantula extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const skin = std('#6b4a32'), dark = std('#2a1c12');
    part(new THREE.SphereGeometry(0.45, 16, 12), skin, g, [0, 0.75, -0.2], [0, 0, 0], [1, 0.8, 1.4]);
    part(new THREE.SphereGeometry(0.32, 14, 10), skin, g, [0, 0.85, 0.45]);
    eye(g, [0, 0.9, 0.78], 0.38);
    for (const s of [-1, 1]) part(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), dark, g, [s * 0.18, 0.75, 0.75], [Math.PI / 2, 0, 0]); // arm cannons
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = part(new THREE.CylinderGeometry(0.05, 0.03, 0.95, 6), dark, g, [sx * 0.5, 0.4, sz * 0.35], [sz * 0.3, 0, sx * 0.55]);
      legs.push(leg);
    }
    super(spec, ctx, g, { yOff: 0.55, colliders: [[R.ColliderDesc.cuboid(0.45, 0.4, 0.7)]] });
    this.legs = legs;
    this.guns.push(new Gun(this, { kind: 'laser', every: [9, 13], charge: 1.0, range: 8, knock: 120, burst: 3, muzzle: () => this.local(0.18, 0.75, 0.95) }));
  }
  frame(t) {
    super.frame(t);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 9 + i * 1.6) * 0.35; });
  }
}

// ---------- Boulder (avalanche) ----------
class Boulder extends Monster {
  constructor(spec, ctx) {
    const r = spec.size ?? 0.6;
    const g = new THREE.Group();
    const rock = part(new THREE.DodecahedronGeometry(r, 1), std('#7d6f62', { flatShading: true, roughness: 1 }), g);
    super(spec, ctx, g, { colliders: [[R.ColliderDesc.ball(r * 0.95), 0.4]] });
    this.rock = rock;
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y, s.z);
    this.rock.rotation.x = s.roll || 0;
    this.model.visible = !s.hidden;
    if (!s.hidden && Math.random() < 0.3 && this.ctx.course.decoration?.dust) this.ctx.course.decoration.dust({ x: s.x, y: s.y - 0.5, z: s.z });
  }
}

// ---------- Creeper: pops out of the floor ----------
class Creeper extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const skin = std('#e8e4da'), dark = std('#8a8577');
    const neck = new THREE.Group();
    g.add(neck);
    for (let i = 0; i < 5; i++) part(new THREE.SphereGeometry(0.3 - i * 0.02, 12, 8), i % 2 ? dark : skin, neck, [0, 0.25 + i * 0.28, 0]);
    part(new THREE.SphereGeometry(0.34, 14, 10), skin, neck, [0, 1.65, 0.1], [0, 0, 0], [1, 0.8, 1.3]);
    eye(neck, [0, 1.7, 0.55], 0.4);
    const holeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: '#0a1a4a' }));
    holeMesh.rotation.x = -Math.PI / 2;
    holeMesh.position.y = 0.012;
    g.add(holeMesh);
    super(spec, ctx, g, { colliders: [[R.ColliderDesc.cylinder(0.8, 0.32).setTranslation(0, 0.8, 0), 0.8]] });
    this.neck = neck;
    this.period = spec.period ?? 4;
    this.guns.push(new Gun(this, { kind: 'laser', every: [5, 8], charge: 0.7, range: 7, knock: 180, ready: (t) => this.rise(t) > 0.95 && this.rise(t + 0.8) > 0.95, muzzle: () => this.neck.localToWorld(new THREE.Vector3(0, 1.65, 0.5)) }));
  }
  rise(t) {
    const u = ((((t / this.period) + (this.spec.phase ?? 0)) % 1) + 1) % 1;
    if (u < 0.15) return u / 0.15;
    if (u < 0.55) return 1;
    if (u < 0.7) return 1 - (u - 0.55) / 0.15;
    return 0;
  }
  update(t) {
    const s = this.at(t);
    const k = this.rise(t);
    this.body.setNextKinematicTranslation({ x: s.x, y: s.y - 1.75 + k * 1.75, z: s.z });
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y, s.z);
    const k = this.rise(t);
    this.neck.position.y = -1.9 + k * 1.9;
    this.neck.visible = k > 0.02;
    this.neck.rotation.y = Math.sin(t * 2) * 0.6;
  }
}

// ---------- Manta: swoops low, its wings blow balls along ----------
class Manta extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const skin = std('#2a2622', { roughness: 0.5 }), belly = std('#d9c9a3');
    const wing = new THREE.Shape();
    wing.moveTo(0, 0.9); wing.lineTo(1.4, -0.2); wing.lineTo(0.3, -0.5); wing.lineTo(0, -0.9); wing.lineTo(-0.3, -0.5); wing.lineTo(-1.4, -0.2); wing.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.08, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);
    const body = part(wingGeo, skin, g);
    part(new THREE.SphereGeometry(0.25, 12, 8), belly, g, [0, -0.05, 0.4]);
    eye(g, [0, 0.03, 0.2], 0.45, [-Math.PI / 2, 0, 0]);
    super(spec, ctx, g);
    this.body3d = body;
    this.prev = this.at(0);
    this.guns.push(new MineLayer(this));
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + Math.sin(t * 2.5) * 0.25, s.z);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    if (Math.hypot(dx, dz) > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    this.model.rotation.z = Math.sin(t * 3) * 0.25;
    this.prev = s;
  }
  force(ball, t, out) {
    const s = this.at(t), s2 = this.at(t + 0.05);
    const p = ball.pos;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < 1.3 && p.y < s.y + 0.5) {
      const vx = (s2.x - s.x) / 0.05, vz = (s2.z - s.z) / 0.05;
      const sp = Math.hypot(vx, vz) || 1;
      out.x += (vx / sp) * 14; out.z += (vz / sp) * 14;
      out.wake = true;
    }
  }
}

// ---------- Scyphozoa: grabs your ball and drops it back near the entrance ----------
class Scyphozoa extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const bell = part(new THREE.SphereGeometry(1.0, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#f2c6e6', transparent: true, opacity: 0.75, roughness: 0.3, emissive: '#ff8ad8', emissiveIntensity: 0.25 }), g);
    eye(g, [0, 0.55, 0.85], 0.5, [-0.5, 0, 0]);
    const tentacles = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ten = new THREE.Group();
      ten.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
      g.add(ten);
      for (let k = 0; k < 6; k++) part(new THREE.SphereGeometry(0.07, 6, 4), std('#e7a8d6'), ten, [0, -0.3 - k * 0.32, 0]);
      tentacles.push(ten);
    }
    super(spec, ctx, g);
    this.bell = bell;
    this.tentacles = tentacles;
    this.period = spec.period ?? 7;
  }
  grabbing(t) { const u = ((t / this.period) % 1 + 1) % 1; return u > 0.72 && u < 0.86; }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + Math.sin(t * 1.3) * 0.2, s.z);
    const pulse = 1 + Math.sin(t * 2.5) * 0.06;
    this.bell.scale.set(pulse, 1 / pulse, pulse);
    const reach = this.grabbing(t) ? 1.6 : 1;
    this.tentacles.forEach((ten, i) => { ten.rotation.x = Math.sin(t * 2 + i) * 0.25; ten.scale.y = reach; });
  }
  force(ball, t, out) {
    if (!this.grabbing(t) || ball.state === 'holed') return;
    const s = this.at(t);
    const p = ball.pos;
    if (Math.hypot(p.x - s.x, p.z - s.z) < 1.3 && p.y < s.y) {
      out.teleport = this.spec.grab;
      if (t - (this.ctx.course.monsterHitAt ?? -99) > 4) landHit(this.ctx.course, 'xanafy', t);
    }
  }
}

// ---------- Drone (cyberpunk) ----------
class Drone extends Monster {
  constructor(spec, ctx) {
    const g = new THREE.Group();
    const shell = std('#1d1d28', { metalness: 0.6, roughness: 0.3 });
    part(new THREE.SphereGeometry(0.3, 16, 10), shell, g, [0, 0, 0], [0, 0, 0], [1, 0.6, 1]);
    const light = part(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2bd6' }), g, [0, 0, 0.27]);
    const rotors = [];
    for (const [x, z] of [[0.38, 0.38], [-0.38, 0.38], [0.38, -0.38], [-0.38, -0.38]]) {
      part(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), shell, g, [x / 2, 0.02, z / 2], [0, Math.atan2(x, z), Math.PI / 2]);
      const rot = part(new THREE.BoxGeometry(0.4, 0.01, 0.05), new THREE.MeshBasicMaterial({ color: '#18f0ff' }), g, [x, 0.1, z]);
      rotors.push(rot);
    }
    super(spec, ctx, g, { colliders: [[R.ColliderDesc.ball(0.32), 0.8]] });
    this.rotors = rotors;
    this.light = light;
  }
  frame(t) {
    super.frame(t);
    this.model.position.y += Math.sin(t * 4) * 0.04;
    this.rotors.forEach((r, i) => { r.rotation.y = t * 40 + i; });
    this.light.material.color.set(Math.floor(t * 3) % 2 ? '#ff2bd6' : '#18f0ff');
  }
}

// ---------- Kolossus: a giant in the Digital Sea that slams it every ~20s ----------
class Kolossus extends Monster {
  constructor(spec, ctx) {
    const g = makeKolossus();
    g.scale.setScalar(spec.scale ?? 2.2);
    g.traverse((o) => { o.castShadow = false; });
    super(spec, ctx, g);
    this.period = spec.period ?? 20;
    this.lastSlam = -1;
    this.waveMat = new THREE.MeshBasicMaterial({ color: '#ffb36a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), this.waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.visible = false;
    ctx.group.add(this.wave);
  }
  /** 0..1 arm pose and the moment of impact within each cycle. */
  pose(t) {
    const u = (((t + (this.spec.phase ?? 0) * this.period) / this.period) % 1 + 1) % 1;
    const idle = 0.77;
    if (u < 0.1) return { k: idle - (u / 0.1) * idle, u };           // wind up: raise the arm
    if (u < 0.13) return { k: (u - 0.1) / 0.03, u };                 // SLAM
    if (u < 0.25) return { k: 1, u };                                // hold
    if (u < 0.4) return { k: 1 - ((u - 0.25) / 0.15) * (1 - idle), u }; // recover
    return { k: idle, u };
  }
  frame(t) {
    super.frame(t);
    this.model.visible = !this.ctx.course.tactical; // don't block the aerial view
    const { k, u } = this.pose(t);
    this.model.userData.slam(k);
    this.model.userData.breathe(t);
    this.model.position.y += Math.sin(t * 0.8) * 0.3;
    const sinceHit = (u - 0.13) * this.period;
    this.wave.visible = sinceHit >= 0 && sinceHit < 2.5;
    if (this.wave.visible) {
      const fist = this.model.getObjectByName('fist');
      const p = new THREE.Vector3();
      fist.getWorldPosition(p);
      this.wave.position.set(p.x, this.spec.p[1] + 0.3, p.z);
      this.wave.scale.setScalar(2 + sinceHit * 30);
      this.waveMat.opacity = 0.8 * (1 - sinceHit / 2.5);
    }
  }
  update(t) {
    const cycle = Math.floor((t + (this.spec.phase ?? 0) * this.period) / this.period);
    const { u } = this.pose(t);
    if (u >= 0.13 && cycle !== this.lastSlam) {
      this.lastSlam = cycle;
      this.impactAt = t;
      if (t > 1) {
        sfx.play('rumble');
        this.ctx.course.onShake?.(1.2);
        // the quake cracks thin ice
        for (const tile of this.ctx.course.crumbles) if (tile.kind === 'thinice' && tile.state === 'solid') {
          tile.hits++;
          if (tile.hits >= tile.need) { tile.state = 'shaking'; tile.t = 0; }
        }
      }
    }
  }
  force(ball, t, out) {
    if (this.impactAt === undefined || t - this.impactAt > 0.7 || t < 1) return;
    // the whole sector trembles: a short jolt pushing away from the giant
    const s = this.at(t);
    const p = ball.pos;
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz) || 1;
    const k = 4 * (1 - (t - this.impactAt) / 0.7);
    out.x += (dx / d) * k + Math.sin(t * 60) * k * 0.5;
    out.z += (dz / d) * k + Math.cos(t * 55) * k * 0.5;
    out.wake = true;
  }
  dispose() { super.dispose(); this.ctx.group.remove(this.wave); }
}

const TYPES = {
  kankrelat: Kankrelat, tumbleweed: Tumbleweed, megatank: Megatank, hornet: Hornet, blok: Blok,
  krabe: Krabe, tarantula: Tarantula, boulder: Boulder, creeper: Creeper, manta: Manta, scyphozoa: Scyphozoa, drone: Drone, kolossus: Kolossus,
};

export function createMonster(spec, ctx) {
  const T = TYPES[spec.type];
  if (!T) { console.warn('Unknown monster', spec.type); return null; }
  const m = new T(spec, ctx);
  if (m.guns?.length) {
    const up = m.update.bind(m), fr = m.frame.bind(m), fo = m.force?.bind(m), di = m.dispose.bind(m);
    m.update = (t) => { up(t); if (!m.slashed) for (const g of m.guns) g.update(t); };
    m.frame = (t) => { fr(t); for (const g of m.guns) g.frame(t); };
    m.force = (ball, t, out) => { fo?.(ball, t, out); for (const g of m.guns) g.force(ball, t, out); };
    m.dispose = () => { di(); for (const g of m.guns) g.dispose(); };
  }
  return m;
}
