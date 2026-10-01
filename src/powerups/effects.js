import * as THREE from 'three';
import { POWERUPS } from './registry.js';
import { HAZARDS } from './hazards.js';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';
import { BALL_R } from '../physics/ball.js';
import { Emitter, emojiTexture } from '../fx/particles.js';
import { makeLeashLady, makeLeashLine, makeBlackHole, makeSpawnBumper } from '../fx/models.js';
import { CATEGORY_COLORS } from './registry.js';
import { createMonster } from '../monsters/index.js';
import { loop } from '../holes/helpers.js';

const NEXT_SHOT = ['steady', 'magnet', 'ghost', 'chip', 'aelita', 'funsize', 'supersize', 'sticky', 'zany', 'leash', 'triplicate', 'scanner', 'possession'];

/**
 * Applies power-up effects on this client. Every client receives every `fx` message and decides
 * locally whether (and how) it is affected, so global hazards stay in sync without streaming.
 */
export class EffectManager {
  constructor(client) {
    this.client = client;
    this.pending = {};
    this.active = {};
    this.hazards = [];
    this.placed = [];
    this.auras = [];
    this.stickyWalls = false;
    this.adUntil = 0;
    this.group = null;
    this.shield = false;
    this.swarms = [];
    this.creations = [];
  }

  reset(course, physics, scene) {
    this.clear();
    this.course = course;
    this.physics = physics;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.scene = scene;
    this.particles = new Emitter(this.group, { max: 1500 });
    this.hearts = new Emitter(this.group, { max: 120, texture: emojiTexture('💔'), sizeScale: 1 });
  }

  clear() {
    for (const h of this.hazards) h.dispose();
    for (const s of this.swarms) for (const m of s.monsters) m.dispose();
    for (const c of this.creations) { this.physics?.removeBody(c.body); }
    this.swarms = [];
    this.creations = [];
    this.setShield(false);
    this.hazards = [];
    this.placed = [];
    this.auras = [];
    this.pending = {};
    this.active = {};
    this.stickyWalls = false;
    this.removeLady();
    if (this.group) { this.scene.remove(this.group); this.group = null; }
    this.particles?.dispose(); this.hearts?.dispose();
    this.particles = this.hearts = null;
    this.client.ui?.setAelita(false);
  }

  has(id) { return !!(this.pending[id] || this.active[id]); }
  get locked() { return performance.now() < this.adUntil; }

  ctx() {
    return { group: this.group, course: this.course, physics: this.physics, particles: this.particles, onStat: (k) => this.client.stat(k) };
  }

  /** Every fx message from the host lands here. */
  apply(fx) {
    const c = this.client;
    const def = POWERUPS[fx.pu];
    if (!def || !this.course) return;
    const me = c.myId;
    const fromName = c.nameOf(fx.from);
    const isMe = fx.from === me;
    const targetMe = fx.target === me;
    const label = `${def.icon} ${def.name}`;

    // announcement for everyone
    if (def.kind === 'one') c.ui.feed(`${fromName} used ${label} on ${c.nameOf(fx.target)}`);
    else c.ui.feed(`${fromName} used ${label}`);

    const myBallActive = c.ball && c.ball.state !== 'holed' && c.ball.state !== 'sinking';
    // Firewall: bounce the first sabotage aimed at me back to its sender
    const aimedAtMe = def.kind === 'one' ? targetMe : def.kind === 'others' ? (fx.reflected ? targetMe : !isMe) : false;
    if (aimedAtMe && this.shield && !fx.reflected && fx.pu !== 'switch') {
      this.setShield(false);
      c.link.send({ t: 'reflect', fx });
      c.ui.bigToast('🛡️ FIREWALL', `${label} bounced back at ${fromName}`, 'good');
      sfx.play('bumper');
      return;
    }
    if (fx.reflected && targetMe) c.ui.feed(`${fromName}'s Firewall reflected your ${label}!`);
    switch (def.kind) {
      case 'self':
        if (!isMe || !myBallActive) break;
        if (fx.pu === 'returnpast') { c.undoShot(); break; }
        if (fx.pu === 'firewall') { this.setShield(true); c.ui.bigToast('🛡️ Firewall up', 'the next attack on you bounces back', 'good'); break; }
        this.pending[fx.pu] = true;
        this.applyBallMods();
        break;
      case 'others':
        if (fx.reflected ? (targetMe && myBallActive) : (!isMe && myBallActive)) {
          this.pending[fx.pu] = true;
          if (fx.pu === 'funsize') { this.pending.supersize = false; }
          if (fx.pu === 'supersize') { this.pending.funsize = false; }
          this.applyBallMods();
          c.ui.bigToast(`${label}!`, `courtesy of ${fromName}`, 'bad');
          sfx.play('debuff');
        }
        break;
      case 'one':
        if (targetMe) this.applyTargeted(fx, fromName, label);
        if (isMe && fx.pu === 'switch') this.doSwitch(fx.params.b);
        break;
      case 'aura':
        this.auras.push({ from: fx.from, start: fx.at / 1000, dur: 10, r: 3.2 });
        if (!isMe) sfx.play('heart');
        break;
      case 'place':
        this.place(fx);
        break;
      case 'global':
        if (fx.pu === 'stickywalls') {
          this.stickyWalls = true;
          c.ui.bigToast('🪤 Sticky Walls!', 'until the hole ends', 'bad');
        } else {
          const H = HAZARDS[fx.pu];
          if (H) this.hazards.push(new H(this.ctx(), fx));
          c.ui.bigToast(label, isMe ? 'you unleashed it' : `unleashed by ${fromName}`, isMe ? 'good' : 'bad');
        }
        break;
    }
  }

  applyTargeted(fx, fromName, label) {
    const c = this.client;
    const active = c.ball && c.ball.state !== 'holed' && c.ball.state !== 'sinking';
    switch (fx.pu) {
      case 'zany': case 'leash': case 'possession':
        if (!active) return;
        this.pending[fx.pu] = true;
        this.applyBallMods();
        c.ui.bigToast(label + '!', `courtesy of ${fromName}`, 'bad');
        sfx.play('debuff');
        break;
      case 'steal': {
        const inv = c.inventory;
        let stolen = null;
        if (inv.length) {
          const i = Math.floor(Math.random() * inv.length);
          stolen = inv.splice(i, 1)[0];
          c.ui.renderInventory(inv);
        }
        c.link.send({ t: 'give', to: fx.from, pu: stolen });
        c.ui.bigToast('🦝 Robbed!', stolen ? `${fromName} stole your ${POWERUPS[stolen].name}` : `${fromName} found nothing to steal`, 'bad');
        break;
      }
      case 'switch':
        if (!active) return;
        this.doSwitch(fx.params.a);
        c.ui.bigToast('🔄 Switched!', `${fromName} swapped places with you`, 'bad');
        break;
      case 'devirtualize':
        if (!active) return;
        c.devirtualize(fromName);
        break;
      case 'ad': {
        const rng = new RNG(fx.seed);
        const secs = rng.int(5, 10);
        this.adUntil = performance.now() + secs * 1000;
        c.cancelAim();
        c.ui.showAd(secs, rng, fromName);
        sfx.play('ad');
        break;
      }
    }
  }

  doSwitch(p) {
    const c = this.client;
    if (!p || !c.ball || c.ball.state === 'holed') return;
    c.ball.place(new THREE.Vector3(p[0], p[1] + 0.05, p[2]));
    c.cam.snapTo(c.ball.mesh.position);
    sfx.play('teleport');
  }

  place(fx) {
    if (fx.pu === 'creativity') return this.create(fx);
    const p = fx.params.pos;
    if (!p) return;
    if (fx.pu === 'swarm') return this.spawnSwarm(fx);
    if (fx.pu === 'bumper') {
      const r = 0.5;
      const model = makeSpawnBumper(r);
      model.position.set(p[0], p[1], p[2]);
      this.group.add(model);
      const b = { x: p[0], y: p[1] + 0.25, z: p[2], r, reverse: true, model, hitT: 0 };
      this.placed.push({ type: 'bumper', b, model });
    } else if (fx.pu === 'blackhole') {
      const range = 3.2;
      const model = makeBlackHole(range);
      model.position.set(p[0], p[1], p[2]);
      this.group.add(model);
      this.placed.push({ type: 'blackhole', x: p[0], y: p[1], z: p[2], range, model });
    }
    sfx.play('use');
  }

  /** Kankrelat Swarm: five Kankrelats skitter on seeded loops around the chosen spot. */
  spawnSwarm(fx) {
    const [px, py, pz] = fx.params.pos;
    const rng = new RNG(fx.seed);
    const start = fx.at / 1000;
    const monsters = [];
    for (let k = 0; k < 5; k++) {
      const pts = [];
      for (let j = 0; j < 4; j++) {
        let x = px, z = pz;
        for (let tries = 0; tries < 8; tries++) {
          const a = rng.range(0, Math.PI * 2), r = rng.range(0.6, 3.5);
          const cx = px + Math.cos(a) * r, cz = pz + Math.sin(a) * r;
          const fy = this.course.floorYAt(cx, cz);
          if (fy !== null && Math.abs(fy - py) < 0.3) { x = cx; z = cz; break; }
        }
        pts.push([x, z]);
      }
      const path = loop(pts, rng.range(1.4, 2.2), py, rng.next());
      const spec = { type: 'kankrelat', path: (t) => path(Math.max(0, t - start)) };
      const m = createMonster(spec, { group: this.group, physics: this.physics, course: this.course });
      if (m) monsters.push(m);
    }
    this.swarms.push({ monsters, until: start + 20 });
    sfx.play('cluck');
  }

  /** Aelita's Creativity: a wall over floor, or a bridge across a gap. Lasts 30s. */
  create(fx) {
    const { a, b, kind } = fx.params;
    if (!a || !b) return;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const L = Math.hypot(dx, dz);
    if (L < 0.5 || L > 5.5) return;
    const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, y = Math.min(a[1], b[1]);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ffd1f0', emissive: '#ff6ad5', emissiveIntensity: 0.6, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.85 });
    let mesh, body;
    if (kind === 'bridge') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, L + 0.6), mat);
      mesh.position.set(cx, y - 0.15, cz);
      body = this.physics.addBox([0.75, 0.15, L / 2 + 0.3], { kind: 'floor', mat: 'default' }, { pos: [cx, y - 0.15, cz], quat: q }).body;
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, L), mat);
      mesh.position.set(cx, y + 0.3, cz);
      body = this.physics.addBox([0.14, 0.9, L / 2], { kind: 'wall' }, { pos: [cx, y + 0.9, cz], quat: q }).body;
    }
    mesh.quaternion.copy(q);
    mesh.castShadow = true;
    this.group.add(mesh);
    const start = fx.at / 1000;
    this.creations.push({ mesh, body, start, until: start + 30, mat });
    for (let i = 0; i < 40; i++) {
      const k = Math.random();
      this.particles?.spawn({ pos: [a[0] + dx * k, y + 0.3, a[2] + dz * k], vel: [(Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5)], color: '#ff8ad8', size: 0.2, life: 1, gravity: 1 });
    }
    sfx.play('use');
  }

  setShield(on) {
    this.shield = on;
    if (on && !this.shieldMesh && this.group) {
      this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: '#5fd4ff', wireframe: true, transparent: true, opacity: 0.7 }));
      this.group.add(this.shieldMesh);
    }
    if (!on && this.shieldMesh) { this.shieldMesh.parent?.remove(this.shieldMesh); this.shieldMesh = null; }
  }

  /** Pickup collected / respawned: a burst of data particles in its category colour. */
  burst(pos, cat) {
    const col = CATEGORY_COLORS[cat] || '#ffffff';
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles?.spawn({ pos: [pos.x, pos.y + 0.5, pos.z], vel: [Math.cos(a) * 2, 1 + Math.random() * 2.5, Math.sin(a) * 2], color: i % 3 ? col : '#ffffff', size: 0.14, life: 0.8, gravity: 3 });
    }
  }

  /** Called when the local player shoots. Moves pending next-shot effects to active. */
  onShoot() {
    this.active = { ...this.pending };
    this.pending = {};
    const a = this.active;
    const res = { chip: !!a.chip, powerMul: a.leash ? 0.5 : 1, steady: !!a.steady, triplicate: !!a.triplicate };
    if (a.leash) {
      const p = this.client.ball.pos;
      this.leash = { anchor: new THREE.Vector3(p.x, p.y, p.z), len: 3.2 };
    }
    this.applyBallMods();
    return res;
  }

  onShotEnd() {
    this.active = {};
    this.leash = null;
    this.applyBallMods();
  }

  applyBallMods() {
    const ball = this.client.ball;
    if (!ball) return;
    const e = { ...this.active, ...this.pending };
    ball.mods.speedMul = e.zany ? 2.4 : 1;
    ball.mods.decelMul = (e.zany ? 0.55 : 1) * (e.sticky ? 1.5 : 1);
    ball.mods.sticky = !!e.sticky;
    ball.mods.magnet = !!e.magnet;
    ball.mods.leash = this.active.leash ? this.leash : null;
    if (ball.mods.ghost !== !!e.ghost) ball.setGhost(!!e.ghost);
    const size = e.supersize ? 2.35 : e.funsize ? 0.55 : 1;
    if (ball.state !== 'holed' && ball.state !== 'sinking') ball.setRadius(BALL_R * size);
    this.client.ui.setAelita(!!e.aelita);
    this.client.ui.setPossession(!!e.possession);
    this.client.ui.setStatus(Object.keys(e).filter((k) => e[k] && NEXT_SHOT.includes(k)).map((k) => POWERUPS[k].icon));
    if (e.leash && !this.lady) this.spawnLady();
    if (!e.leash && this.lady) this.removeLady();
  }

  timeScale() { return this.has('aelita') ? 0.35 : 1; }

  /** Accelerations applied to the local ball. */
  forces(ball, out, t) {
    const myId = this.client.myId;
    for (const h of this.hazards) h.force(ball, t, out);
    // magnet toward cup
    if (ball.mods.magnet && ball.state === 'moving') {
      const cup = this.course.cup, p = ball.pos;
      const dx = cup.x - p.x, dz = cup.z - p.z, d = Math.hypot(dx, dz);
      if (d < 5 && d > 0.05) { const k = 9 * (1 - d / 5) + 2; out.x += (dx / d) * k; out.z += (dz / d) * k; }
    }
    // black holes
    for (const o of this.placed) {
      if (o.type !== 'blackhole' || ball.mods.ghost) continue;
      const p = ball.pos;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d < o.range && Math.abs(p.y - o.y) < 1.5) {
        const k = 18 * (1 - d / o.range) + 3;
        out.x += (dx / (d || 1)) * k; out.z += (dz / (d || 1)) * k;
        out.wake = true;
        if (d < 0.38) this.client.onSwallowed(ball);
      }
    }
    // unlovaball auras from other players push me away
    for (const a of this.auras) {
      if (a.from === myId || t - a.start > a.dur) continue;
      const src = this.client.positionOf(a.from);
      if (!src) continue;
      const p = ball.pos;
      const dx = p.x - src.x, dz = p.z - src.z, d = Math.hypot(dx, dz);
      if (d < a.r && Math.abs(p.y - src.y) < 1.5) {
        const k = 24 * (1 - d / a.r) + 3;
        out.x += (dx / (d || 1)) * k; out.z += (dz / (d || 1)) * k;
        out.wake = true;
      }
    }
  }

  decelMul(t) {
    let m = 1;
    for (const h of this.hazards) if (h.fx.pu === 'icerink') m *= h.decel();
    return m;
  }

  zoneDecel(ball, t) {
    let m = 1;
    for (const h of this.hazards) if (h.fx.pu === 'volcano') m *= h.decel(ball, t);
    return m;
  }

  bumpers(courseBumpers) {
    if (!this.placed.length) return courseBumpers;
    return courseBumpers.concat(this.placed.filter((o) => o.type === 'bumper').map((o) => o.b));
  }

  /** Physics-rate update: expire hazards, move swarms, expire creations. */
  update(t) {
    for (const s of this.swarms) for (const m of s.monsters) m.update(t);
    for (let i = this.swarms.length - 1; i >= 0; i--) {
      if (t > this.swarms[i].until) { for (const m of this.swarms[i].monsters) m.dispose(); this.swarms.splice(i, 1); }
    }
    for (let i = this.creations.length - 1; i >= 0; i--) {
      const c = this.creations[i];
      if (t > c.until) { this.group?.remove(c.mesh); this.physics.removeBody(c.body); this.creations.splice(i, 1); }
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (this.hazards[i].done(t)) { this.hazards[i].dispose(); this.hazards.splice(i, 1); }
    }
  }

  frame(t, dt) {
    if (!this.group) return;
    for (const h of this.hazards) h.frame(t, dt);
    for (const s of this.swarms) for (const m of s.monsters) m.frame(t);
    for (const c of this.creations) {
      const age = t - c.start, left = c.until - t;
      c.mesh.scale.y = Math.min(1, Math.max(0.01, age * 2.5));
      c.mat.opacity = left < 2 ? 0.85 * (0.5 + 0.5 * Math.sin(t * 20)) : 0.85;
    }
    if (this.shieldMesh && this.client.ball) {
      this.shieldMesh.position.copy(this.client.ball.mesh.position);
      this.shieldMesh.rotation.y = t * 1.5;
      this.shieldMesh.scale.setScalar((this.client.ball.radius / 0.18) * (1 + Math.sin(t * 6) * 0.04));
    }
    for (const o of this.placed) {
      if (o.type === 'blackhole') o.model.getObjectByName('disk').rotation.z = t * 3;
      if (o.type === 'bumper') { const s = 1 + Math.max(0, o.b.hitT - t) * 1.5; o.model.scale.set(s, 1, s); }
    }
    // hearts for active auras
    for (const a of this.auras) {
      if (t - a.start > a.dur || t < a.start) continue;
      const p = this.client.positionOf(a.from);
      if (p && Math.random() < 0.35) {
        const ang = Math.random() * Math.PI * 2;
        this.hearts.spawn({
          pos: [p.x + Math.cos(ang) * a.r * 0.6, p.y + 0.3, p.z + Math.sin(ang) * a.r * 0.6],
          vel: [Math.cos(ang) * 1.5, 1.2, Math.sin(ang) * 1.5], size: 0.45, life: 1.2, color: '#ffffff',
        });
      }
    }
    this.auras = this.auras.filter((a) => t - a.start <= a.dur);
    // leash lady and line
    if (this.lady) {
      const ball = this.client.ball;
      const anchor = this.leash?.anchor;
      if (anchor) this.lady.position.set(anchor.x - 0.45, anchor.y - ball.radius, anchor.z - 0.45);
      else { const p = ball.mesh.position; this.lady.position.set(p.x - 0.45, p.y - ball.radius, p.z - 0.45); }
      const bp = ball.mesh.position;
      this.lady.lookAt(bp.x, this.lady.position.y, bp.z);
      const hand = new THREE.Vector3();
      this.lady.getObjectByName('hand').getWorldPosition(hand);
      const arr = this.leashLine.geometry.attributes.position;
      arr.setXYZ(0, hand.x, hand.y, hand.z);
      arr.setXYZ(1, bp.x, bp.y, bp.z);
      arr.needsUpdate = true;
    }
    this.particles.update(dt);
    this.hearts.update(dt);
  }

  spawnLady() {
    this.lady = makeLeashLady();
    this.lady.scale.setScalar(0.6);
    this.leashLine = makeLeashLine();
    this.group.add(this.lady);
    this.group.add(this.leashLine);
  }

  removeLady() {
    if (this.lady && this.group) { this.group.remove(this.lady); this.group.remove(this.leashLine); }
    this.lady = null;
    this.leashLine = null;
  }

  /** Marks a bumper hit for the squash animation. */
  bumperHit(b, t) { b.hitT = t + 0.25; }
}
