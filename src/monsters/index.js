import * as THREE from 'three';
import { R } from '../physics/world.js';
import { TEX } from '../course/themes.js';
import { sfx } from '../core/audio.js';
import { makeKolossus } from '../fx/lyoko.js';
import { RNG } from '../core/rng.js';
import { Gun, MineLayer, canTarget, landHit, seededRng, damageFor } from './attacks.js';
import { kankrelatLook, blokLook, hornetLook, krabeLook, tarantulaLook, creeperLook, mantaLook, scyphozoaLook, swayTentacle, megatankLook, sharkLook, kongreEelLook, ninjaLook, kalamarLook, guardianLook, marabountaLook } from './looks.js';
import { patrol } from '../holes/helpers.js';

// XANA's monsters, built from primitives. Each one follows a time-based path so every
// client sees them in the same place; attacks are aimed at whoever is looking (your own ball).

const UP = new THREE.Vector3(0, 1, 0);
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
  physics.meta.set(c.handle, { kind: 'obst', monster: true, collider: c, body });
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

// ---------- Kankrelat: the little roach with a red orb gun ----------
class Kankrelat extends Monster {
  constructor(spec, ctx) {
    const L = kankrelatLook();
    super(spec, ctx, L.g, { yOff: 0.3, colliders: [[R.ColliderDesc.cuboid(0.4, 0.25, 0.5)]] });
    this.L = L;
    this.guns.push(new Gun(this, { kind: 'laser', every: [6, 9], charge: 0.7, range: 6, knock: 110, muzzle: () => L.gun.getWorldPosition(new THREE.Vector3()) }));
  }
  frame(t) {
    super.frame(t);
    this.L.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 + i * 1.6) * 0.35; });
    this.L.body.position.y = 0.38 + Math.abs(Math.sin(t * 16)) * 0.025;
    this.L.gun.material.emissiveIntensity = 0.5 + 0.4 * Math.abs(Math.sin(t * 3));
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
    const L = megatankLook(0.85);
    const r = L.r;
    super(spec, ctx, L.g, { yOff: r, colliders: [[R.ColliderDesc.ball(r), 0.7]] });
    Object.assign(this, { L, roller: L.roller, r });
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
    this.warn.position.z = 0;
    this.warn.scale.y = 2; // warns both ways: the blade grows from the eye in both directions
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd0c0', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    // the Megatank's laser: a vertical half-disc of red light, a blade standing along the aim
    const blade = new THREE.CircleGeometry(1, 48, 0, Math.PI);
    blade.rotateY(-Math.PI / 2); // into the vertical plane that contains the aim (+z)
    this.beam = new THREE.Mesh(blade, beamMat);
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ff3b1f', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 48, 1, 0, Math.PI).rotateY(-Math.PI / 2), glowMat);
    this.pivot.add(this.warn, this.beam, this.glow);
    this.pivot.visible = false;
  }
  update(t) {
    super.update(t);
    const course = this.ctx.course;
    if (this.mode === 'charge' && t - this.t0 >= 1.3) {
      this.mode = 'beam'; this.t0 = t; this.hitDone = false; sfx.play('laser'); course.onShake?.(0.4);
      // so strong it breaks the ground: crumbling tiles in its line give way
      const o = this.origin, fx = Math.sin(this.aim), fz = Math.cos(this.aim);
      for (const tile of course.crumbles) {
        const [x, , z] = tile.pos0;
        const along = (x - o.x) * fx + (z - o.z) * fz, perp = Math.abs((x - o.x) * fz - (z - o.z) * fx);
        if (Math.abs(along) < this.BEAM_LEN && perp < 1 && tile.state === 'solid') { tile.state = 'shaking'; tile.t = 0; }
      }
    }
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
    course.onMegatank?.();
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
    // the two halves slide apart sideways on the axle while charging/firing
    const open = this.mode === 'charge' ? Math.min(1, (t - this.t0) / 0.4) : this.mode === 'beam' ? 1 : 0;
    this.L.halves[0].position.x = -open * 0.45;
    this.L.halves[1].position.x = open * 0.45;
    this.L.inside.visible = open > 0.05;
    if (open > 0) this.roller.rotation.x = 0; // face forward to fire
    if (this.mode === 'charge') this.L.core.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin((t - this.t0) * 12)));
    this.pivot.visible = !!this.mode;
    const o = this.mode && this.origin ? this.origin : s;
    this.pivot.position.set(o.x, o.y + this.r * 0.75, o.z);
    this.pivot.rotation.y = this.aim;
    this.warn.visible = this.mode === 'charge';
    this.warn.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin((t - this.t0) * 9));
    this.beam.visible = this.glow.visible = this.mode === 'beam';
    if (this.mode === 'beam') {
      const k = (t - this.t0) / 0.6;
      const R = this.BEAM_LEN * Math.min(1, k * 3); // the blade sweeps out fast
      this.beam.scale.setScalar(Math.max(0.01, R));
      this.glow.scale.setScalar(Math.max(0.01, R));
      this.glow.material.opacity = 0.8 * (1 - k);
      this.beam.material.opacity = 0.75 * (1 - k * 0.6);
    }
  }
  force(ball, t, out) {
    if (ball.state !== 'idle' && ball.state !== 'moving') return;
    // running a ball over hurts (50 LP) and flings it aside; only the opened beam devirtualizes
    if (!this.mode && !ball.mods.ghost) {
      const s0 = this.at(t), s1 = this.at(t + 0.1);
      const rolling = Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.05;
      const bp = ball.pos;
      const dx = bp.x - s0.x, dz = bp.z - s0.z, d = Math.hypot(dx, dz);
      if (rolling && d < this.r + ball.radius + 0.05 && t - (this.ctx.course.monsterHitAt ?? -99) > 1) {
        out.x += (dx / (d || 1)) * 420; out.z += (dz / (d || 1)) * 420; out.y += 120; out.wake = true;
        landHit(this.ctx.course, 'megatank', t, damageFor('megatank', 'roll'));
        return;
      }
    }
    if (this.mode !== 'beam' || this.hitDone) return;
    const s = this.origin || this.at(t);
    const p = ball.pos;
    const fx = Math.sin(this.aim), fz = Math.cos(this.aim);
    const rx = p.x - s.x, rz = p.z - s.z;
    const along = rx * fx + rz * fz, perp = Math.abs(rx * fz - rz * fx);
    const R = this.BEAM_LEN * Math.min(1, ((t - this.t0) / 0.6) * 3);
    if (Math.abs(along) < R && perp < 0.35 + ball.radius && Math.abs(p.y - (s.y + this.r * 0.75)) < 1.2) {
      this.hitDone = true;
      landHit(this.ctx.course, 'vaporize', t, 100);
    }
  }
  dispose() { super.dispose(); this.ctx.group.remove(this.pivot); }
}

// ---------- Hornet: flies around; classic laser, charged laser, or a poison spit ----------
class Hornet extends Monster {
  constructor(spec, ctx) {
    const L = hornetLook();
    super(spec, ctx, L.g, { colliders: [[R.ColliderDesc.ball(0.36).setTranslation(0, -0.14, 0), 0.6]] });
    this.L = L;
    this.wings = L.wings;
    const tip = () => this.L.sting.localToWorld(new THREE.Vector3(0, 0.42, 0));
    this.guns.push(new Gun(this, { every: [6, 10], range: 9, muzzle: tip, modes: [
      { w: 3, kind: 'laser', charge: 0.8, speed: 10, knock: 160 },
      { w: 2, kind: 'charged', charge: 1.2, speed: 10, knock: 260 },
      // its strongest ability: a lobbed acid spit that leaves a slowing, venomous puddle
      { w: 2, kind: 'poison', charge: 1.0, speed: 6, knock: 0, allowResting: true },
      // a dive: it swoops low and strafes a quick burst
      { w: 1, kind: 'rapid', charge: 0.9, speed: 14, knock: 70, burst: 3, burstGap: 0.12, dive: true },
    ] }));
    this.diveT = -9;
  }
  onCharge(t, cfg) { if (cfg.dive) this.diveT = t; }
  /** Bob and dive: the model and its body are both placed from this. */
  lift(t) { return Math.sin(t * 3) * 0.15 - Math.max(0, 1 - Math.abs(t - this.diveT - 0.9) / 0.9) * 1.3; }
  update(t) {
    const s = this.at(t);
    if (s) this.body.setNextKinematicTranslation({ x: s.x, y: s.y + this.lift(t), z: s.z });
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + this.lift(t), s.z);
    const ball = this.ctx.course.localBall;
    if (ball) this.model.lookAt(ball.mesh.position.x, s.y - 0.6, ball.mesh.position.z);
    this.wings.forEach((w, i) => { w.rotation.z = Math.sin(t * 60 + i * 1.3) * 0.5; });
  }
}

// ---------- Blok: a cube with legs ----------
class Blok extends Monster {
  constructor(spec, ctx) {
    const L = blokLook();
    super(spec, ctx, L.g, { yOff: 0.7, colliders: [[R.ColliderDesc.cuboid(0.43, 0.7, 0.43)]] });
    this.L = L;
    const eyeAt = () => this.L.cube.localToWorld(new THREE.Vector3(0, 0, 0.55));
    // four eyes, one ability each: classic laser, freeze spray, fire ring (its strongest), rapid laser
    this.guns.push(new Gun(this, { every: [8, 12], range: 7, muzzle: eyeAt, modes: [
      { w: 3, kind: 'laser', charge: 0.8, knock: 150 },
      { w: 2, kind: 'ice', charge: 1.1, knock: 0, status: 'freeze', allowResting: true },
      { w: 2, kind: 'firering', charge: 1.0, speed: 6, knock: 340 },
      { w: 2, kind: 'rapid', charge: 0.7, speed: 13, knock: 70, burst: 4, burstGap: 0.12 },
    ] }));
  }
  frame(t) {
    super.frame(t);
    this.L.cube.position.y = 0.95 + Math.abs(Math.sin(t * 5)) * 0.06;
    this.L.cube.rotation.y = Math.sin(t * 1.2) * 0.25;
    this.L.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 10 + i * 1.1) * 0.25; });
  }
}

// ---------- Krabe: a tall walker; roll under it between its legs ----------
class Krabe extends Monster {
  constructor(spec, ctx) {
    const bodyY = 1.45;
    const L = krabeLook(bodyY);
    const legPos = [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    const cols = legPos.map(([lx, lz]) => [R.ColliderDesc.cylinder(0.5, 0.09).setTranslation(lx * 1.35, 0, lz * 1.25), 0.6]);
    cols.push([R.ColliderDesc.cylinder(0.2, 0.85).setTranslation(0, bodyY - 0.5, 0), 0.5]);
    super(spec, ctx, L.g, { yOff: 0.5, colliders: cols });
    this.L = L;
    const partner = (t) => this.ctx.course.monsters.some((o) => o !== this && o.spec.type === 'krabe' && !o.slashed && Math.hypot(o.at(t).x - this.at(t).x, o.at(t).z - this.at(t).z) < 7);
    this.guns.push(new Gun(this, { every: [8, 12], range: 8, muzzle: () => this.L.body.localToWorld(new THREE.Vector3(0, -0.15, 0.7)), modes: [
      { w: 3, kind: 'laser', charge: 0.9, knock: 170 },
      { w: 2, kind: 'charged', charge: 1.3, knock: 340 },
      // two Krabes together fire the combined beam: the heaviest hit, but not an instant devirtualization
      { w: 1, kind: 'mixed', charge: 1.6, knock: 260, allowResting: true, when: partner },
    ] }));
  }
  frame(t) {
    super.frame(t);
    this.L.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 6 + i * 1.7) * 0.15; l.rotation.x = Math.max(0, Math.sin(t * 6 + i * 1.7)) * 0.08; });
    this.L.body.position.y = 1.45 + Math.sin(t * 12) * 0.03;
  }
}

// ---------- Tarantula: tall and spindly; rears up and fires rapid bursts ----------
class Tarantula extends Monster {
  constructor(spec, ctx) {
    const L = tarantulaLook();
    const cols = [[1, 1], [-1, 1], [1, 0], [-1, 0], [1, -1], [-1, -1]].map(([lx, lz]) => [R.ColliderDesc.cylinder(0.5, 0.07).setTranslation(lx * 1.05, 0, lz * 0.95), 0.6]);
    cols.push([R.ColliderDesc.cuboid(0.4, 0.5, 0.45).setTranslation(0, 0.4, 0)]);
    super(spec, ctx, L.g, { yOff: 0.5, colliders: cols });
    this.L = L;
    this.rearT = -9;
    this.guns.push(new Gun(this, { kind: 'rapid', every: [9, 13], charge: 1.25, range: 8, speed: 16, knock: 80, burst: 6, burstGap: 1 / 6, lead: 1, muzzle: () => this.L.body.localToWorld(new THREE.Vector3(0, 0.12, 0.5)) }));
  }
  onCharge(t) { this.rearT = t; }
  frame(t) {
    super.frame(t);
    const rear = Math.max(0, 1 - Math.abs(t - this.rearT - 0.9) / 1.0);
    this.L.body.rotation.x = -rear * 0.45;
    this.L.body.position.y = 1.2 + rear * 0.2;
    this.L.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 7 + i * 1.6) * 0.18 * (1 - rear); });
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

// ---------- Creeper: pops out of the floor, or (spec.wall) crawls along the top of a wall ----------
// spec.wall: { a: [x,z], b: [x,z], y, face } – it patrols a→b on the wall top (y + wall height),
// facing `face` (towards the lane), and fires its charged laser down at you, as in the show.
const CREEPER_WALL_TOP = 0.38;
class Creeper extends Monster {
  constructor(spec, ctx) {
    if (spec.wall) return new WallCreeper(spec, ctx);
    const g = new THREE.Group();
    const L = creeperLook();
    const neck = L.g; // the whole creature rises out of its hole
    g.add(neck);
    const holeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: '#0a1a4a' }));
    holeMesh.rotation.x = -Math.PI / 2;
    holeMesh.position.y = 0.012;
    g.add(holeMesh);
    super(spec, ctx, g, { colliders: [[R.ColliderDesc.cylinder(0.8, 0.32).setTranslation(0, 0.8, 0), 0.8]] });
    this.neck = neck;
    this.L = L;
    this.period = spec.period ?? 4;
    this.guns.push(new Gun(this, { kind: 'laser', every: [5, 8], charge: 0.7, range: 7, knock: 180, ready: (t) => this.rise(t) > 0.95 && this.rise(t + 0.8) > 0.95, muzzle: () => this.L.head.localToWorld(new THREE.Vector3(0, -0.05, 0.45)) }));
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
    this.L.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 3 + i * Math.PI) * 0.15; });
    this.L.body.forEach((b, i) => { b.rotation.z = Math.sin(t * 2 + i * 0.7) * 0.12; });
  }
}

class WallCreeper extends Monster {
  constructor(spec, ctx) {
    const W = spec.wall;
    const top = (W.y ?? 0) + CREEPER_WALL_TOP;
    const L = creeperLook();
    const g = new THREE.Group();
    g.add(L.g);
    L.g.scale.setScalar(0.8);
    super({ ...spec, path: patrol(W.a, W.b, spec.period ?? 7, top, spec.phase ?? 0) }, ctx, g,
      { colliders: [[R.ColliderDesc.cylinder(0.6, 0.3).setTranslation(0, 0.6, 0), 0.8]] });
    this.L = L;
    this.face = W.face ?? 0;
    this.guns.push(new Gun(this, { every: [6, 9], range: 8, speed: 10, muzzle: () => this.L.head.localToWorld(new THREE.Vector3(0, -0.05, 0.45)), modes: [
      { w: 2, kind: 'laser', charge: 0.8, knock: 180 },
      { w: 1, kind: 'charged', charge: 1.2, knock: 300 },
    ] }));
  }
  update(t) {
    const s = this.at(t);
    if (!s) return;
    this.body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y, s.z);
    this.model.rotation.y = this.face;
    this.L.head.rotation.x = 0.35; // peering down into the lane
    this.L.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 6 + i * Math.PI) * 0.25; });
    this.L.body.forEach((b, i) => { b.rotation.z = Math.sin(t * 3 + i * 0.7) * 0.15; });
  }
}

// ---------- Manta: swoops low, its wings blow balls along ----------
class Manta extends Monster {
  constructor(spec, ctx) {
    const L = mantaLook();
    const g = L.g;
    const body = L.body;
    super(spec, ctx, g, { colliders: [[R.ColliderDesc.cuboid(1.4, 0.1, 0.7), 0.6]] });
    this.body3d = body;
    this.L = L;
    this.prev = this.at(0);
    this.guns.push(new MineLayer(this));
    this.guns.push(new Gun(this, { every: [9, 13], range: 9, muzzle: () => this.model.localToWorld(new THREE.Vector3(0, -0.1, 0.9)), modes: [
      { w: 3, kind: 'laser', charge: 0.9, speed: 11, knock: 260 },
      { w: 2, kind: 'rapid', charge: 0.8, speed: 14, knock: 90, burst: 3, burstGap: 0.15 }, // a strafing pass
    ] }));
  }
  update(t) {
    const s = this.at(t), s2 = this.at(t + 0.05);
    if (!s) return;
    this.body.setNextKinematicTranslation({ x: s.x, y: s.y + Math.sin(t * 2.5) * 0.25, z: s.z });
    const dx = s2.x - s.x, dz = s2.z - s.z;
    if (Math.hypot(dx, dz) > 1e-4) { this.q.setFromAxisAngle(UP, Math.atan2(dx, dz)); this.body.setNextKinematicRotation(this.q); }
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + Math.sin(t * 2.5) * 0.25, s.z);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    if (Math.hypot(dx, dz) > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    this.model.rotation.z = Math.sin(t * 3) * 0.25;
    if (this.L) this.L.tail.rotation.y = Math.sin(t * 2.4) * 0.35;
    this.prev = s;
  }
  force(ball, t, out) {
    const s = this.at(t), s2 = this.at(t + 0.05);
    const p = ball.pos;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    // the wings only catch a ball that's already rolling, and only in one short gust per pass:
    // otherwise its patrol shoves a ball to and fro forever and it can never be played
    const v = ball.vel;
    if (ball.state !== 'moving' || Math.hypot(v.x, v.z) < 0.6) return;
    if (d < 1.3 && p.y < s.y + 0.5) {
      if (t - (this.gustT ?? -9) > 2) this.gustT = t;
      if (t - this.gustT > 0.3) return;
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
    const L = scyphozoaLook();
    const k = spec.scale ?? 1; // the boss version is a giant
    L.g.scale.setScalar(k);
    super(spec, ctx, L.g, { colliders: [[R.ColliderDesc.ball(0.6 * k).setTranslation(0, 0.35 * k, 0), 0.6]] });
    this.L = L;
    this.k = k;
    this.bell = L.bell;
    this.period = spec.period ?? 7;
  }
  grabbing(t) { const u = ((t / this.period) % 1 + 1) % 1; return u > 0.72 && u < 0.86; }
  update(t) {
    const s = this.at(t);
    if (s) this.body.setNextKinematicTranslation({ x: s.x, y: s.y + Math.sin(t * 1.3) * 0.2, z: s.z });
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + Math.sin(t * 1.3) * 0.2, s.z);
    const pulse = 1 + Math.sin(t * 2.5) * 0.06;
    this.bell.scale.set(pulse, 1 / pulse, pulse);
    const reach = this.grabbing(t) ? 1.5 : 1;
    // re-shape the tentacles a few times a second (cheap, and it reads as flowing)
    if (!this.lastSway || t - this.lastSway > 0.08) { this.lastSway = t; for (const ten of this.L.tentacles) swayTentacle(ten, t, reach); }
    this.L.tentMat.emissiveIntensity = this.grabbing(t) ? 0.9 : 0.35;
  }
  force(ball, t, out) {
    if (!this.grabbing(t) || ball.state === 'holed' || this.slashed) return;
    const s = this.at(t);
    const p = ball.pos;
    if (Math.hypot(p.x - s.x, p.z - s.z) < 1.3 * this.k && p.y < s.y) {
      if (!canTarget(this.ctx.course, ball, t, { allowResting: true })) return;
      // it grabs the ball, drops it back near the entrance and keeps one of your power-ups
      out.teleport = this.spec.grab;
      out.tpBy = 'scyphozoa';
      landHit(this.ctx.course, 'xanafy', t, damageFor('scyphozoa', 'grab'));
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

// ---------- Kolossus boss (Sector 5 Core): fist slams, a glowing ankle and the gate to the core ----------
// spec: { p: feet [x,y,z], ry, ankle: [x,y,z], gate: { a: [x,z], b: [x,z], y }, zone: [x0,z0,x1,z1], every }
// Everything except the stun is a function of the shared clock. The stun is your own. As in the show
// (ep 94: its eye and its blade arm, hit together), it has two weak points: the glowing eye low on its
// leg, and its blade, which stays planted for a few seconds after each slam. Hit both within 8 s and it
// kneels: the gate drops for 15 s (on your screen).
const BOSS_BOTH = 8, BOSS_STUN = 15, SLAM_TELL = 2, SLAM_R = 1.5, PLANT = 3.5, BLADE_R = 0.8;
class KolossusBoss extends Monster {
  constructor(spec, ctx) {
    const g = makeKolossus();
    g.scale.setScalar(spec.scale ?? 0.6);
    super(spec, ctx, g);
    const s = this.at(0), sc = spec.scale ?? 0.6, ry = spec.ry || 0;
    // the feet are solid
    this.body = kinematic(ctx.physics, { x: s.x, y: s.y, z: s.z });
    this.q.setFromAxisAngle(UP, ry);
    this.body.setRotation(this.q, true);
    for (const side of [-1, 1]) collider(ctx.physics, this.body, R.ColliderDesc.cuboid(1.6 * sc, 0.8 * sc + 0.4, 2.1 * sc).setTranslation(3.4 * sc * side, 0.4, 0.5 * sc), 0.5);
    // the ankle: a glowing weak point you can hit
    const [axw, ayw, azw] = spec.ankle;
    this.ankle = { x: axw, y: ayw + 0.45, z: azw, r: 0.45 };
    this.ankleBody = kinematic(ctx.physics, this.ankle);
    collider(ctx.physics, this.ankleBody, R.ColliderDesc.ball(this.ankle.r), 0.9);
    this.ankleMat = new THREE.MeshStandardMaterial({ color: '#ff9a20', emissive: '#ff6a10', emissiveIntensity: 1.6, roughness: 0.4 });
    this.ankleMesh = new THREE.Mesh(new THREE.SphereGeometry(this.ankle.r, 20, 14), this.ankleMat);
    this.ankleMesh.position.set(this.ankle.x, this.ankle.y, this.ankle.z);
    ctx.group.add(this.ankleMesh);
    this.ankleRing = new THREE.Mesh(new THREE.TorusGeometry(this.ankle.r + 0.15, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.8 }));
    this.ankleRing.position.copy(this.ankleMesh.position);
    ctx.group.add(this.ankleRing);
    // the gate: a red energy wall with a solid collider
    const G = spec.gate, gx = (G.a[0] + G.b[0]) / 2, gz = (G.a[1] + G.b[1]) / 2, gl = Math.hypot(G.b[0] - G.a[0], G.b[1] - G.a[1]);
    this.gateY = G.y ?? 0;
    this.gate = { x: gx, z: gz, len: gl, ang: Math.atan2(G.b[0] - G.a[0], G.b[1] - G.a[1]), drop: 0 };
    this.gateBody = kinematic(ctx.physics, { x: gx, y: this.gateY + 0.6, z: gz });
    const gq = new THREE.Quaternion().setFromAxisAngle(UP, this.gate.ang + Math.PI / 2);
    this.gateBody.setRotation(gq, true);
    // an obstacle, not a monster: Super Sprint and the Overbike ignore monsters, but not the gate
    const gd = R.ColliderDesc.cuboid(gl / 2, 0.6, 0.15).setFriction(0).setRestitution(0.4).setCollisionGroups(ctx.physics.groupFor('obst'));
    const gc = ctx.physics.world.createCollider(gd, this.gateBody);
    ctx.physics.meta.set(gc.handle, { kind: 'obst', collider: gc, body: this.gateBody });
    this.gateMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.gateMesh = new THREE.Mesh(new THREE.PlaneGeometry(gl, 1.2, 8, 3), this.gateMat);
    this.gateMesh.quaternion.copy(gq);
    this.gateMesh.position.set(gx, this.gateY + 0.6, gz);
    ctx.group.add(this.gateMesh);
    const eyeP = eye(ctx.group, [gx, this.gateY + 0.65, gz], 0.9);
    eyeP.quaternion.copy(gq);
    this.gateEye = eyeP;
    // slams: a target ring that tightens, then a fist from the sky
    this.tellMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    this.tell = new THREE.Mesh(new THREE.RingGeometry(SLAM_R - 0.12, SLAM_R, 40), this.tellMat);
    this.tell.rotation.x = -Math.PI / 2;
    this.tell.visible = false;
    ctx.group.add(this.tell);
    // its weapon is a blade in place of a hand (EN-WIKI): a long magma-rock blade that strikes point-first
    this.fist = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.05, 2.4, 4, 1), g.userData.mats[0]);
    this.fist.scale.set(1, 1, 0.4);
    this.fist.visible = false;
    ctx.group.add(this.fist);
    this.every = spec.every ?? 7;
    // the planted blade: a solid, glowing target where the last slam landed
    this.bladeBody = kinematic(ctx.physics, { x: 0, y: -50, z: 0 });
    collider(ctx.physics, this.bladeBody, R.ColliderDesc.cuboid(BLADE_R, 1.1, 0.35), 0.9);
    this.bladeBody.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, 0.6), true); // as the blade is drawn
    this.bladeRing = new THREE.Mesh(new THREE.TorusGeometry(BLADE_R + 0.25, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.85 }));
    this.bladeRing.visible = false;
    ctx.group.add(this.bladeRing);
    this.eyeHitT = -99;
    this.bladeHitT = -99;
    this.hitT = -9;
    this.stunUntil = -1;
    this.lastSlam = -1;
    this.base = s;
  }
  stunned(t) { return t < this.stunUntil; }
  /** The last slam, while its blade is still planted (null otherwise). */
  planted(t) {
    const n = Math.floor(t / this.every), sl = this.slam(n - 1);
    return n > 0 && t - sl.at < PLANT && !this.stunned(t) ? sl : null;
  }
  gateOpen(t) { return this.stunned(t) || t < (this.holdUntil ?? -1); }
  /** The n-th slam: where and when (the same on every screen). */
  slam(n) {
    // asked for every frame and every physics step: keep the last few
    const cache = (this.slams ||= new Map());
    if (cache.has(n)) return cache.get(n);
    const rng = new RNG(`${this.ctx.course?.def?.id ?? 'boss'}:slam:${n}`);
    const [x0, z0, x1, z1] = this.spec.zone;
    const sl = { x: x0 + rng.next() * (x1 - x0), z: z0 + rng.next() * (z1 - z0), at: (n + 1) * this.every };
    cache.set(n, sl);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    return sl;
  }
  frame(t) {
    const st = this.stunned(t);
    this.place(this.model, this.base);
    this.model.visible = !this.ctx.course.tactical; // don't block the aerial view
    // kneels while stunned, otherwise winds up for the next slam
    const n = Math.floor(t / this.every), u = (t - n * this.every) / this.every;
    const k = st ? 1 : u > 1 - SLAM_TELL / this.every ? THREE.MathUtils.lerp(0.77, 0, (u - (1 - SLAM_TELL / this.every)) / (SLAM_TELL / this.every)) : u < 0.06 ? 1 : 0.77;
    this.model.userData.slam(k);
    this.model.userData.breathe(t);
    this.model.position.y = this.base.y - (st ? 1.2 : 0) + Math.sin(t * 0.8) * 0.08;
    this.model.rotation.z = st ? 0.12 : 0;
    // eye glow: brighter right after you hit it; dark while stunned
    this.ankleMat.emissiveIntensity = st ? 0.3 : 1.2 + (t - this.eyeHitT < BOSS_BOTH ? 1.6 : 0) + 0.4 * Math.sin(t * 6);
    this.ankleRing.rotation.x = t * 2; this.ankleRing.rotation.y = t * 1.3;
    this.ankleRing.visible = !st;
    // gate
    const want = this.gateOpen(t) ? 1 : 0;
    this.gate.drop += (want - this.gate.drop) * 0.15;
    this.gateMesh.position.y = this.gateY + 0.6 - this.gate.drop * 1.5;
    this.gateEye.position.y = this.gateY + 0.65 - this.gate.drop * 1.5;
    this.gateMat.opacity = 0.35 + 0.2 * Math.sin(t * 8) - this.gate.drop * 0.3;
    // slam telegraph and fist
    const sl = this.slam(n);
    const left = sl.at - t;
    this.tell.visible = !st && left < SLAM_TELL && left > 0;
    if (this.tell.visible) {
      this.tell.position.set(sl.x, this.gateY + 0.03, sl.z);
      this.tell.scale.setScalar(1 + left * 0.6);
      this.tellMat.opacity = 0.5 + 0.4 * Math.abs(Math.sin(t * (8 + (SLAM_TELL - left) * 8)));
    }
    const pl = this.planted(t);
    this.fist.visible = !st && (left < 0.45 || !!pl);
    if (pl && !(left < 0.45)) {
      // planted: the blade sits where it struck, glowing, until it pulls back up
      this.fist.position.set(pl.x, this.gateY + 1.0, pl.z);
      this.fist.rotation.set(0, 0.6, 0);
    } else if (this.fist.visible) {
      const fall = Math.max(0, left) / 0.45;
      this.fist.position.set(sl.x, this.gateY + 1.0 + fall * fall * 14, sl.z);
      this.fist.rotation.set(0, 0.6, 0);
    }
    this.bladeRing.visible = !!pl && !(left < 0.45);
    if (this.bladeRing.visible) {
      this.bladeRing.position.set(pl.x, this.gateY + 0.4, pl.z);
      this.bladeRing.rotation.x = t * 2.2; this.bladeRing.rotation.y = t * 1.5;
      this.bladeRing.material.opacity = t - this.bladeHitT < BOSS_BOTH ? 1 : 0.55 + 0.3 * Math.sin(t * 8);
    }
  }
  update(t) {
    const st = this.stunned(t);
    // gate collider follows the drop (but never rises into a ball sitting under it)
    const ball = this.ctx.course.localBall;
    const under = ball && Math.hypot(ball.pos.x - this.gate.x, ball.pos.z - this.gate.z) < this.gate.len / 2 + 0.4 && Math.abs((ball.pos.x - this.gate.x) * Math.cos(this.gate.ang) - (ball.pos.z - this.gate.z) * Math.sin(this.gate.ang)) < 0.5;
    if (!st && this.gate.drop > 0.5 && under) this.holdUntil = t + 0.5; // hold it open a moment
    const gy = this.gateY + 0.6 - (this.gateOpen(t) ? 1.5 : 0);
    this.gateBody.setNextKinematicTranslation({ x: this.gate.x, y: gy, z: this.gate.z });
    // the planted blade's collider follows the last slam
    const pl = this.planted(t);
    this.bladeBody.setNextKinematicTranslation(pl ? { x: pl.x, y: this.gateY + 1.0, z: pl.z } : { x: 0, y: -50, z: 0 });
    // the weak points: hard hits from your own ball (the speed just before contact: it may have bounced already)
    const sp = ball ? Math.hypot(ball.vel.x, ball.vel.z) : 0, impact = Math.max(sp, this.prevSp ?? 0);
    this.prevSp = sp;
    if (ball && ball.state === 'moving' && !st && impact > 1.2 && t - this.hitT > 0.6) {
      const p = ball.pos;
      const onEye = Math.hypot(p.x - this.ankle.x, p.y - this.ankle.y, p.z - this.ankle.z) < this.ankle.r + ball.radius + 0.08;
      const onBlade = pl && p.y < this.gateY + 2.2 && Math.hypot(p.x - pl.x, p.z - pl.z) < BLADE_R + ball.radius + 0.12;
      if (onEye || onBlade) {
        this.hitT = t;
        if (onEye) this.eyeHitT = t; else this.bladeHitT = t;
        sfx.play('bumper');
        this.ctx.course.onShake?.(0.5);
        if (Math.abs(this.eyeHitT - this.bladeHitT) <= BOSS_BOTH) {
          this.eyeHitT = this.bladeHitT = -99;
          this.stunUntil = t + BOSS_STUN;
          sfx.play('rumble');
          this.ctx.course.onBoss?.('stun', BOSS_STUN);
        } else this.ctx.course.onBoss?.('hit', onEye ? 'eye' : 'blade', BOSS_BOTH);
      }
    }
    if (this.wasStunned && !this.stunned(t)) this.ctx.course.onBoss?.('recover');
    this.wasStunned = this.stunned(t);
    // slam impact
    const n = Math.floor(t / this.every);
    const sl = this.slam(n - 1);
    if (n - 1 !== this.lastSlam && t - sl.at < 0.3 && t >= sl.at) {
      this.lastSlam = n - 1;
      if (!st && t > 1) {
        sfx.play('rumble');
        this.ctx.course.onShake?.(1.0);
        if (ball && canTarget(this.ctx.course, ball, t, { allowResting: true }) && Math.hypot(ball.pos.x - sl.x, ball.pos.z - sl.z) < SLAM_R) {
          landHit(this.ctx.course, 'vaporize', t, 100);
        }
      }
    }
  }
  dispose() {
    super.dispose();
    for (const o of [this.ankleMesh, this.ankleRing, this.gateMesh, this.gateEye, this.tell, this.fist, this.bladeRing]) this.ctx.group.remove(o);
    for (const b of [this.ankleBody, this.gateBody, this.bladeBody]) this.ctx.physics.removeBody(b);
  }
}

// ---------- Shark (Digital Sea): cruises its lane, then rams you ----------
class Shark extends Monster {
  constructor(spec, ctx) {
    const L = sharkLook();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    super(spec, ctx, L.g, { yOff: 0.32, colliders: [[R.ColliderDesc.capsule(0.32, 0.3).setRotation(q), 0.9]] });
    this.L = L;
    this.rng = seededRng(ctx, spec, 'shark');
    this.nextT = 3 + this.rng.range(0, 5);
    this.ram = null; // { t0, from, to }
    this.prev = super.at(0);
    // between rams, Sharks fire their laser (as in the show)
    this.guns.push(new Gun(this, { every: [9, 13], range: 8, ready: () => !this.ram, muzzle: () => this.model.localToWorld(new THREE.Vector3(0, 0.05, 0.62)), modes: [
      { w: 2, kind: 'laser', charge: 0.8, speed: 11, knock: 150 },
      { w: 2, kind: 'torpedo', charge: 1.0, speed: 4.5, knock: 220, homing: true }, // slow, and it follows you
    ] }));
  }
  /** The path position, with a ram lunge (telegraph 0.8 s, dash 0.45 s, swim back 1.2 s) on top. */
  at(t) {
    const s = super.at(t);
    const r = this.ram;
    if (!r) return s;
    const u = t - r.t0;
    if (u < 0.8) return { ...s, x: s.x + Math.sin(u * 60) * 0.04, ry: r.ry, wiggle: true };
    if (u < 1.25) { const k = (u - 0.8) / 0.45; const e = k * k; return { x: r.from.x + (r.to.x - r.from.x) * e, y: s.y, z: r.from.z + (r.to.z - r.from.z) * e, ry: r.ry, dash: true }; }
    if (u < 2.45) { const k = (u - 1.25) / 1.2; const e = k * k * (3 - 2 * k); return { x: r.to.x + (s.x - r.to.x) * e, y: s.y, z: r.to.z + (s.z - r.to.z) * e, ry: Math.atan2(s.x - r.to.x, s.z - r.to.z) }; }
    return s;
  }
  update(t) {
    if (this.ram && t - this.ram.t0 > 2.45) this.ram = null;
    super.update(t);
    if (this.ram || t < this.nextT || this.slashed) return;
    const course = this.ctx.course;
    const enraged = t < (course.enrageUntil ?? -1);
    this.nextT = t + this.rng.range(7, 11) * (enraged ? 0.5 : 1);
    const ball = course.localBall;
    if (!canTarget(course, ball, t, { allowResting: true })) return;
    const s = super.at(t), bp = ball.pos;
    const dx = bp.x - s.x, dz = bp.z - s.z, d = Math.hypot(dx, dz);
    if (d > (this.spec.range ?? 5) || Math.abs(bp.y - s.y) > 1.5) return;
    // aim a little past the ball, so it really rams through
    const reach = Math.min(d + 0.8, (this.spec.range ?? 5) + 0.8);
    this.ram = { t0: t, from: { x: s.x, z: s.z }, to: { x: s.x + (dx / d) * reach, z: s.z + (dz / d) * reach }, ry: Math.atan2(dx, dz), dir: [dx / d, dz / d], hit: false };
    sfx.play('whoosh');
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + 0.32 + Math.sin(t * 2.2) * 0.04, s.z);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    if (s.ry !== undefined && this.ram) this.model.rotation.y = s.ry;
    else if (Math.hypot(dx, dz) > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    this.prev = s;
    this.L.tail.rotation.y = Math.sin(t * (s.dash ? 30 : s.wiggle ? 18 : 7)) * 0.45;
    this.L.eye.scale.setScalar(s.wiggle ? 1 + Math.abs(Math.sin(t * 14)) * 0.5 : 1);
  }
  force(ball, t, out) {
    const r = this.ram;
    if (!r || r.hit || this.slashed || ball.state === 'holed') return;
    const s = this.at(t);
    if (!s.dash) return;
    const p = ball.pos;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 0.75 + ball.radius || Math.abs(p.y - s.y - 0.32) > 0.8) return;
    r.hit = true;
    out.x += r.dir[0] * 420; out.z += r.dir[1] * 420; out.y += 90;
    out.wake = true;
    landHit(this.ctx.course, 'shark', t, damageFor('shark', 'ram'));
  }
}

// ---------- Kongre (the Digital Sea): eel-like, swims in packs of 3–5 and fires a double laser from its eyes ----------
class Kongre extends Monster {
  constructor(spec, ctx) {
    const L = kongreEelLook();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    // the body lies along z, snout at +0.62, tail at -0.9
    super(spec, ctx, L.g, { yOff: 0.42, colliders: [[R.ColliderDesc.capsule(0.5, 0.2).setRotation(q).setTranslation(0, 0, -0.14), 0.8]] });
    this.L = L;
    this.prev = super.at(0);
    this.guns.push(new Gun(this, { kind: 'laser', every: [7, 10], charge: 0.8, range: 7, speed: 11, knock: 130, burst: 2, burstGap: 0.12, muzzle: () => this.L.segs[0].localToWorld(new THREE.Vector3(0, 0.06, 0.26)) }));
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + 0.42 + Math.sin(t * 2.6 + (this.spec.phase ?? 0) * 5) * 0.05, s.z);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    if (Math.hypot(dx, dz) > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    this.prev = s;
    // it swims: a wave runs down the body to the tail
    this.L.segs.forEach((j, i) => { if (i) j.rotation.y = Math.sin(t * 7 - i * 0.8) * 0.16 * Math.min(1, i / 3); });
  }
}

// ---------- Ninja (the Cortex): fast; dashes at you and slashes with its sword, or fires a palm laser ----------
class Ninja extends Monster {
  constructor(spec, ctx) {
    const L = ninjaLook();
    super(spec, ctx, L.g, { colliders: [[R.ColliderDesc.cuboid(0.22, 0.75, 0.22).setTranslation(0, 0.75, 0), 0.6]] });
    this.L = L;
    this.rng = seededRng(ctx, spec, 'ninja');
    this.nextT = 3 + this.rng.range(0, 4);
    this.dash = null; // { t0, from, to, ry, hit }
    this.prev = super.at(0);
    this.guns.push(new Gun(this, { kind: 'laser', every: [8, 12], charge: 0.7, range: 8, speed: 13, knock: 140, ready: () => !this.dash, muzzle: () => this.L.armL.localToWorld(new THREE.Vector3(-0.26, -0.4, 0.2)) }));
  }
  /** The path, with a dash on top: raise the sword (0.6 s), dash (0.25 s), slash, walk back (1 s). */
  at(t) {
    const s = super.at(t);
    const d = this.dash;
    if (!d) return s;
    const u = t - d.t0;
    if (u < 0.6) return { ...s, ry: d.ry };
    if (u < 0.85) { const k = (u - 0.6) / 0.25; return { x: d.from.x + (d.to.x - d.from.x) * k, y: s.y, z: d.from.z + (d.to.z - d.from.z) * k, ry: d.ry }; }
    if (u < 1.25) return { x: d.to.x, y: s.y, z: d.to.z, ry: d.ry };
    if (u < 2.25) { const k = (u - 1.25); const e = k * k * (3 - 2 * k); return { x: d.to.x + (s.x - d.to.x) * e, y: s.y, z: d.to.z + (s.z - d.to.z) * e, ry: Math.atan2(s.x - d.to.x, s.z - d.to.z) }; }
    return s;
  }
  update(t) {
    if (this.dash && t - this.dash.t0 > 2.25) this.dash = null;
    super.update(t);
    if (this.dash || t < this.nextT || this.slashed) return;
    const course = this.ctx.course;
    this.nextT = t + this.rng.range(5, 8) * (t < (course.enrageUntil ?? -1) ? 0.5 : 1);
    const ball = course.localBall;
    if (!canTarget(course, ball, t, { allowResting: true })) return;
    const s = super.at(t), bp = ball.pos;
    const dx = bp.x - s.x, dz = bp.z - s.z, d = Math.hypot(dx, dz);
    if (d > 4 || d < 0.6 || Math.abs(bp.y - s.y) > 1.2) return;
    // stop just short of the ball, so the slash (not the body) is what hits
    const k = (d - 0.55) / d;
    this.dash = { t0: t, from: { x: s.x, z: s.z }, to: { x: s.x + dx * k, z: s.z + dz * k }, ry: Math.atan2(dx, dz), hit: false };
    sfx.play('whoosh');
  }
  force(ball, t, out) {
    const d = this.dash;
    if (!d || d.hit || t - d.t0 < 0.85 || t - d.t0 > 1.1 || this.slashed) return;
    const p = ball.pos, dx = p.x - d.to.x, dz = p.z - d.to.z, dist = Math.hypot(dx, dz);
    if (dist > 0.95 || Math.abs(p.y - this.at(t).y) > 1.2) return;
    d.hit = true;
    out.x += (Math.sin(d.ry) + dx / (dist || 1)) * 200; out.z += (Math.cos(d.ry) + dz / (dist || 1)) * 200; out.y += 90; out.wake = true;
    if (canTarget(this.ctx.course, ball, t, { allowResting: true })) landHit(this.ctx.course, 'ninja', t, damageFor('ninja', 'slash'));
    sfx.play('laser');
  }
  frame(t) {
    super.frame(t);
    const d = this.dash, u = d ? t - d.t0 : 9;
    // sword up while it winds up, a big swing on the slash
    this.L.armR.rotation.x = u < 0.6 ? -2.2 * (u / 0.6) : u < 1.1 ? -2.2 + 3.4 * Math.min(1, (u - 0.6) / 0.35) : Math.sin(t * 4) * 0.15;
    const run = d && u > 0.6 && u < 0.85 ? 3 : 1;
    this.L.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 9 * run + i * Math.PI) * 0.35; });
    this.L.body.position.y = Math.abs(Math.sin(t * 9 * run)) * 0.03;
  }
}

// ---------- Kalamar (the Digital Sea): drifts and fires its laser; get close and its pincers grip your ball and drag it
// along for a moment before flinging it off (ep 88: it grips the Skid with its drill and pincers) ----------
const GRIP = 1.6;
class Kalamar extends Monster {
  constructor(spec, ctx) {
    const L = kalamarLook();
    super(spec, ctx, L.g, { colliders: [[R.ColliderDesc.cuboid(0.36, 0.48, 0.62).setTranslation(0, 0.48, 0.25), 0.7]] });
    this.L = L;
    this.prev = super.at(0);
    this.grip = null;
    this.lastGrip = -99;
    this.guns.push(new Gun(this, { kind: 'laser', every: [9, 13], charge: 0.8, range: 8, speed: 11, knock: 140, ready: () => !this.grip, muzzle: () => this.model.localToWorld(new THREE.Vector3(0, 0, 0.9)) }));
  }
  /** Where its pincers are at time t (in front of it, the way it's swimming). */
  claws(t) {
    const s = this.at(t), b = this.at(t - 0.15);
    let dx = s.x - b.x, dz = s.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) { dx = Math.sin(this.model.rotation.y); dz = Math.cos(this.model.rotation.y); } else { dx /= d; dz /= d; }
    return { x: s.x + dx * 0.95, y: s.y, z: s.z + dz * 0.95, fx: dx, fz: dz };
  }
  force(ball, t, out) {
    if (this.slashed || ball.state === 'holed') { this.grip = null; return; }
    const c = this.claws(t), p = ball.pos, g = this.grip;
    if (g) {
      if (t < g.until) {
        // held in the pincers: pulled to them, dragged along as the Kalamar swims
        const v = ball.vel;
        out.x += (c.x - p.x) * 70 - v.x * 9; out.z += (c.z - p.z) * 70 - v.z * 9;
        out.wake = true;
      } else {
        this.grip = null;
        out.x += c.fx * 260; out.z += c.fz * 260; out.y += 70;
        out.wake = true;
      }
      return;
    }
    if (t - this.lastGrip < 9) return;
    if (Math.hypot(p.x - c.x, p.z - c.z) > 0.55 + ball.radius || Math.abs(p.y - c.y) > 1.4) return;
    if (!canTarget(this.ctx.course, ball, t, { allowResting: true })) return;
    this.lastGrip = t;
    this.grip = { until: t + GRIP };
    landHit(this.ctx.course, 'grip', t, damageFor('kalamar', 'grip'));
    sfx.play('whoosh');
  }
  frame(t) {
    const s = this.at(t);
    this.model.position.set(s.x, s.y + 0.6 + Math.sin(t * 2) * 0.15, s.z);
    const dx = s.x - this.prev.x, dz = s.z - this.prev.z;
    if (Math.hypot(dx, dz) > 1e-4) this.model.rotation.y = Math.atan2(dx, dz);
    this.prev = s;
    const gripping = this.grip && t < this.grip.until;
    this.L.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * (gripping ? 12 : 4) + i) * (gripping ? 0.6 : 0.35); a.rotation.y = Math.cos(t * 3 + i) * 0.25; });
  }
}

// ---------- Guardian: a drifting prison sphere; roll into it and you're trapped for a few seconds ----------
class Guardian extends Monster {
  constructor(spec, ctx) {
    const L = guardianLook(spec.r ?? 0.8);
    super(spec, ctx, L.g, { colliders: [[R.ColliderDesc.ball(spec.r ?? 0.8).setTranslation(0, spec.r ?? 0.8, 0), 0.5]] });
    this.L = L;
    this.r = spec.r ?? 0.8;
    this.lastT = -99;
  }
  force(ball, t, out) {
    if (t - this.lastT < 6 || ball.frozen || this.slashed) return;
    const s = this.at(t), p = ball.pos;
    if (Math.hypot(p.x - s.x, p.z - s.z) > this.r + ball.radius + 0.08 || Math.abs(p.y - s.y - this.r) > this.r + 0.3) return;
    if (!canTarget(this.ctx.course, ball, t, { allowResting: true })) return;
    this.lastT = t;
    landHit(this.ctx.course, 'guardian', t, 0);
  }
  frame(t) {
    super.frame(t);
    this.L.rings.forEach((r, i) => { r.rotation.z = t * (0.8 + i * 0.4); });
    this.L.shell.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
  }
}

// ---------- Magma bombs (Volcano lanes): the volcano lobs a bomb onto the leg every few seconds.
// A red ring marks the landing spot 1.5 s ahead; a ball caught under it takes 20 LP and a knock.
// Spots and timing come from a seeded rhythm on the shared hole clock, so everyone sees the same bombs.
const BOMB_WARN = 1.5;
class MagmaBombs extends Monster {
  constructor(spec, ctx) {
    super(spec, ctx, new THREE.Group());
    this.rng = seededRng(ctx, spec, 'magma');
    this.period = this.rng.range(6, 9);
    this.phase = this.rng.range(0, this.period);
    this.seedBase = `${ctx.course?.def?.id ?? 'x'}:${spec.p[0].toFixed(2)},${spec.p[2].toFixed(2)}`;
    const glow = new THREE.MeshBasicMaterial({ color: '#ff3b1f', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 32), glow);
    this.ring.rotation.x = -Math.PI / 2;
    this.bomb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshStandardMaterial({ color: '#3a1408', emissive: '#ff5a14', emissiveIntensity: 1.1, roughness: 0.5 }));
    this.flash = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: '#ffb36a', transparent: true, opacity: 0.8, depthWrite: false }));
    this.flash.rotation.x = -Math.PI / 2;
    for (const m of [this.ring, this.bomb, this.flash]) { m.visible = false; ctx.group.add(m); }
    this.hitK = -1;
  }
  /** Which bomb this is (k) and how far into its cycle we are (u, seconds). */
  cycle(t) {
    const s = t - this.phase;
    const k = Math.floor(s / this.period);
    return { k, u: s - k * this.period };
  }
  /** Where bomb k lands: somewhere along the middle 80% of the leg, off the centre line by up to 0.6 of the half-width. */
  spot(k) {
    const r = new RNG(`${this.seedBase}:${k}`);
    const { a, b, w } = this.spec;
    const u = r.range(0.1, 0.9), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const off = r.range(-0.6, 0.6) * Math.max(0, w / 2 - 0.5);
    const x = a[0] + dx * u - (dz / L) * off, z = a[1] + dz * u + (dx / L) * off;
    return { x, y: this.ctx.course.floorYAt(x, z) ?? this.spec.p[1], z };
  }
  force(ball, t, out) {
    const { k, u } = this.cycle(t);
    if (u < BOMB_WARN || u > BOMB_WARN + 0.15 || this.hitK === k || this.slashed) return;
    this.hitK = k;
    const s = this.spot(k), p = ball.pos;
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
    if (d > 0.8 + ball.radius || Math.abs(p.y - ball.radius - s.y) > 0.8) return;
    if (!canTarget(this.ctx.course, ball, t, { allowResting: true })) return;
    out.x += (dx / (d || 1)) * 260; out.z += (dz / (d || 1)) * 260; out.y += 140; out.wake = true;
    landHit(this.ctx.course, 'magma', t, damageFor('magma', 'bomb'));
  }
  frame(t) {
    const { k, u } = this.cycle(t);
    const s = this.spot(k);
    const warn = u < BOMB_WARN, falling = u > BOMB_WARN - 0.45 && u < BOMB_WARN, boom = u >= BOMB_WARN && u < BOMB_WARN + 0.45;
    this.ring.visible = warn && !this.slashed;
    if (warn) {
      this.ring.position.set(s.x, s.y + 0.03, s.z);
      this.ring.scale.setScalar(1.3 - 0.3 * (u / BOMB_WARN));
      this.ring.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(u * 10));
    }
    this.bomb.visible = falling && !this.slashed;
    if (falling) { const f = (BOMB_WARN - u) / 0.45; this.bomb.position.set(s.x, s.y + 0.28 + f * f * 7, s.z); }
    this.flash.visible = boom && !this.slashed;
    if (boom) {
      const f = (u - BOMB_WARN) / 0.45;
      this.flash.position.set(s.x, s.y + 0.04, s.z);
      this.flash.scale.setScalar(0.4 + f * 1.1);
      this.flash.material.opacity = 0.85 * (1 - f);
      if (this.boomK !== k) { this.boomK = k; sfx.play('rumble'); }
    }
  }
  dispose() { super.dispose(); for (const m of [this.ring, this.bomb, this.flash]) this.ctx.group.remove(m); }
}

// ---------- Roaming Kolossus (boss event): walks the green and stomps ----------
// Every 7–9 s (seeded) a red ring marks where it will stamp 1.5 s ahead (where it will be standing);
// a ball inside takes 25 LP and is flung away by the shockwave. Its feet are solid.
const STOMP_WARN = 1.5, STOMP_R = 2.6;
class RoamingKolossus extends Monster {
  constructor(spec, ctx) {
    const g = makeKolossus();
    const sc = spec.scale ?? 0.45;
    g.scale.setScalar(sc);
    const feet = [-1, 1].map((side) => [R.ColliderDesc.cuboid(1.6 * sc, 0.8 * sc + 0.4, 2.1 * sc).setTranslation(3.4 * sc * side, 0.4, 0.5 * sc), 0.5]);
    super(spec, ctx, g, { colliders: feet });
    this.rng = seededRng(ctx, spec, 'stomp');
    this.period = this.rng.range(7, 9);
    this.phase = this.rng.range(0, this.period);
    this.tellMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.tell = new THREE.Mesh(new THREE.RingGeometry(STOMP_R - 0.14, STOMP_R, 48), this.tellMat);
    this.tell.rotation.x = -Math.PI / 2;
    this.waveMat = new THREE.MeshBasicMaterial({ color: '#ffb36a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), this.waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    for (const m of [this.tell, this.wave]) { m.visible = false; ctx.group.add(m); }
    this.hitK = -1;
  }
  cycle(t) { const s = t - this.phase, k = Math.floor(s / this.period); return { k, u: s - k * this.period }; }
  frame(t) {
    const s = this.at(t);
    this.place(this.model, s);
    this.model.visible = !this.ctx.course.tactical;
    const { k, u } = this.cycle(t);
    const warn = this.period - u; // seconds to the next stomp
    this.model.userData.slam?.(warn < STOMP_WARN ? THREE.MathUtils.lerp(0.77, 0, 1 - warn / STOMP_WARN) : u < 0.3 ? 1 : 0.77);
    this.model.userData.breathe?.(t);
    this.model.position.y = s.y + Math.abs(Math.sin(t * 2.2)) * 0.06;
    const at = this.at(t + warn);
    this.tell.visible = warn < STOMP_WARN;
    if (this.tell.visible) {
      this.tell.position.set(at.x, at.y + 0.03, at.z);
      this.tellMat.opacity = 0.35 + 0.45 * Math.abs(Math.sin(t * (8 + (STOMP_WARN - warn) * 8)));
    }
    this.wave.visible = u < 0.9;
    if (this.wave.visible) {
      const w = this.at(t - u);
      this.wave.position.set(w.x, w.y + 0.05, w.z);
      this.wave.scale.setScalar(0.6 + (u / 0.9) * STOMP_R);
      this.waveMat.opacity = 0.8 * (1 - u / 0.9);
    }
  }
  update(t) {
    super.update(t);
    const { k, u } = this.cycle(t);
    if (u < 0.15 && this.hitK !== k && t > 1) {
      this.hitK = k;
      sfx.play('rumble');
      this.ctx.course.onShake?.(1.0);
      const ball = this.ctx.course.localBall, s = this.at(t);
      if (!ball) return;
      const p = ball.pos, dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
      if (d < STOMP_R + ball.radius && Math.abs(p.y - ball.radius - s.y) < 1 && canTarget(this.ctx.course, ball, t, { allowResting: true })) {
        this.pendingKnock = { x: (dx / (d || 1)) * 320, z: (dz / (d || 1)) * 320 };
        landHit(this.ctx.course, 'stomp', t, damageFor('kolossusRoam', 'stomp'));
      }
    }
  }
  force(ball, t, out) {
    if (!this.pendingKnock) return;
    out.x += this.pendingKnock.x; out.z += this.pendingKnock.z; out.y += 160; out.wake = true;
    this.pendingKnock = null;
  }
  dispose() { super.dispose(); this.ctx.group.remove(this.tell); this.ctx.group.remove(this.wave); }
}

// ---------- Marabounta (season 3): a creeping plant mass that spreads over the floor and recedes ----------
// spec: { p: [x,y,z], r }. Seeded cycle: grows for 8 s, holds 6 s, recedes 6 s, gone 6 s. Inside it a
// rolling ball is heavily slowed, and a ball resting in it loses 5 LP a second.
const MARA_GROW = 8, MARA_HOLD = 6, MARA_SHRINK = 6, MARA_GONE = 6;
class Marabounta extends Monster {
  constructor(spec, ctx) {
    const maxR = spec.r ?? 1.8;
    const L = marabountaLook(maxR);
    super(spec, ctx, L.g);
    this.L = L;
    this.maxR = maxR;
    this.rng = seededRng(ctx, spec, 'marabounta');
    this.period = MARA_GROW + MARA_HOLD + MARA_SHRINK + MARA_GONE;
    this.phase = this.rng.range(0, this.period);
    this.m4 = new THREE.Matrix4(); this.q4 = new THREE.Quaternion(); this.e4 = new THREE.Euler(); this.v4 = new THREE.Vector3(); this.s4 = new THREE.Vector3();
    this.drainT = -9;
  }
  radius(t) {
    const u = (((t + this.phase) % this.period) + this.period) % this.period;
    if (u < MARA_GROW) return this.maxR * (u / MARA_GROW);
    if (u < MARA_GROW + MARA_HOLD) return this.maxR;
    if (u < MARA_GROW + MARA_HOLD + MARA_SHRINK) return this.maxR * (1 - (u - MARA_GROW - MARA_HOLD) / MARA_SHRINK);
    return 0;
  }
  update() {}
  frame(t) {
    const s = this.at(t), R0 = this.radius(t);
    this.model.position.set(s.x, s.y, s.z);
    this.model.visible = R0 > 0.05 && !this.slashed;
    this.L.veins.scale.setScalar(Math.max(0.01, R0 * 1.05));
    this.L.mat.emissiveIntensity = 0.35 + 0.25 * Math.abs(Math.sin(t * 2));
    const mesh = this.L.mesh;
    this.L.spots.forEach((sp, i) => {
      const k = Math.max(0, Math.min(1, (R0 - sp.r) / 0.4)); // shoots near the edge are still sprouting
      this.e4.set(sp.tilt + Math.sin(t * 1.7 + i) * 0.08, i, 0);
      this.q4.setFromEuler(this.e4);
      this.s4.setScalar(Math.max(0.001, k * sp.s));
      this.m4.compose(this.v4.set(sp.x, 0, sp.z), this.q4, this.s4);
      mesh.setMatrixAt(i, this.m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  force(ball, t, out) {
    if (this.slashed || (ball.state !== 'idle' && ball.state !== 'moving')) return;
    const s = this.at(t), p = ball.pos, R0 = this.radius(t);
    if (R0 < 0.1 || Math.hypot(p.x - s.x, p.z - s.z) > R0 || Math.abs(p.y - ball.radius - s.y) > 0.4) return;
    if (ball.state === 'moving') { const v = ball.vel; out.x -= v.x * 4; out.z -= v.z * 4; return; }
    // it gnaws at a ball left in it
    if (t - this.drainT >= 1 && canTarget(this.ctx.course, ball, t, { allowResting: true })) {
      this.drainT = t;
      landHit(this.ctx.course, 'marabounta', t, damageFor('marabounta', 'drain'));
    }
  }
}

const TYPES = {
  kankrelat: Kankrelat, tumbleweed: Tumbleweed, megatank: Megatank, hornet: Hornet, blok: Blok,
  krabe: Krabe, tarantula: Tarantula, boulder: Boulder, creeper: Creeper, manta: Manta, scyphozoa: Scyphozoa, drone: Drone, kolossus: Kolossus, shark: Shark, kongre: Kongre,
  kolossusBoss: KolossusBoss, ninja: Ninja, kalamar: Kalamar, guardian: Guardian, magma: MagmaBombs,
  marabounta: Marabounta, kolossusRoam: RoamingKolossus,
};

/** Monsters XANA's Agent can't take over (bosses, sweeping arms, swimmers, rolling rocks). */
export const AGENT_PROOF = new Set(['kolossusBoss', 'kolossus', 'kongre', 'shark', 'boulder', 'guardian', 'magma', 'marabounta', 'kolossusRoam']);

export function createMonster(spec, ctx) {
  const T = TYPES[spec.type];
  if (!T) { console.warn('Unknown monster', spec.type); return null; }
  const m = new T(spec, ctx);
  // XANA's Agent: while a player drives it, the monster is wherever they steer it
  const pathAt = m.at.bind(m);
  m.at = (t) => (m.agent && t < m.agent.until ? m.agent.pos : pathAt(t));
  if (m.guns?.length) {
    const up = m.update.bind(m), fr = m.frame.bind(m), fo = m.force?.bind(m), di = m.dispose.bind(m);
    m.update = (t) => { up(t); if (!m.slashed) for (const g of m.guns) g.update(t); };
    m.frame = (t) => {
      fr(t);
      for (const g of m.guns) g.frame(t);
      // charging up: the monster swells and throbs, so you can see who's about to fire
      const ch = m.guns.find((g) => g.charge)?.charge;
      if (ch) { const k = Math.min(1, (t - ch.t0) / ch.cfg.charge); m.model.scale.setScalar(1 + 0.09 * k * Math.abs(Math.sin(t * 16))); m.charged = true; }
      else if (m.charged) { m.model.scale.setScalar(1); m.charged = false; }
    };
    m.force = (ball, t, out) => { fo?.(ball, t, out); for (const g of m.guns) g.force(ball, t, out); };
    m.dispose = () => { di(); for (const g of m.guns) g.dispose(); };
  }
  return m;
}
