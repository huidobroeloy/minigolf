import * as THREE from 'three';
import { stats } from '../game/stats.js';
import { POWERUPS } from './registry.js';
import { HAZARDS } from './hazards.js';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';
import { music } from '../core/music.js';
import { BALL_R } from '../physics/ball.js';
import { Emitter, emojiTexture } from '../fx/particles.js';
import { makeLeashLady, makeLeashLine, makeBlackHole, makeSpawnBumper } from '../fx/models.js';
import { CATEGORY_COLORS } from './registry.js';
import { createMonster } from '../monsters/index.js';
import { loop } from '../holes/helpers.js';
import { makeVehicle } from '../fx/vehicles.js';

const BH_CORE = 0.45, BH_MAX_BOUNCES = 3, BH_LIFE = 20;

const NEXT_SHOT = ['steady', 'magnet', 'ghost', 'chip', 'aelita', 'funsize', 'supersize', 'sticky', 'zany', 'leash', 'triplicate', 'scanner', 'possession',
  'stun', 'gas', 'sprint', 'wings', 'overwing', 'overbike', 'overboard', 'venom', 'xanafied'];
// statuses that monsters give (not power-ups)
const STATUS_ICONS = { venom: '🟢', xanafied: '🔴' };
// effects Hopper's Light washes off
const NEGATIVE = ['aelita', 'funsize', 'supersize', 'sticky', 'zany', 'leash', 'possession', 'stun', 'gas', 'venom', 'xanafied'];

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
    this.bhBounces = new Map();
    this.auras = [];
    this.stickyWalls = false;
    this.adUntil = 0;
    this.group = null;
    this.shield = false;
    this.swarms = [];
    this.creations = [];
    this.immuneUntil = 0;
    this.slashed = []; // Zweihänder: { thing, until }
    this.nextBurp = 0;
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
    // a XANA attack never outlives its hole
    clearTimeout(this.mirrorT); clearTimeout(this.alertT);
    document.body.classList.remove('mirror-world', 'xana-alert');
    for (const gl of this.glitches || []) this.group.remove(gl.mesh);
    this.glitches = [];
    for (const h of this.hazards) h.dispose();
    for (const s of this.swarms) for (const m of s.monsters) m.dispose();
    for (const c of this.creations) { this.physics?.removeBody(c.body); }
    this.swarms = [];
    this.creations = [];
    this.setShield(false);
    this.hazards = [];
    this.placed = [];
    this.bhBounces = new Map();
    this.auras = [];
    this.pending = {};
    this.active = {};
    this.stickyWalls = false;
    this.immuneUntil = 0;
    this.slashed = [];
    this.removeLady();
    this.setVehicle(null);
    if (this.group) { this.scene.remove(this.group); this.group = null; }
    this.particles?.dispose(); this.hearts?.dispose();
    this.particles = this.hearts = null;
    this.client.ui?.setAelita(false);
  }

  has(id) { return !!(this.pending[id] || this.active[id]); }
  get locked() { return performance.now() < this.adUntil; }

  ctx() {
    return {
      group: this.group, course: this.course, physics: this.physics, particles: this.particles, onStat: (k) => this.client.stat(k),
      myId: this.client.myId, positionOf: (id) => this.client.positionOf(id),
    };
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
    if (aimedAtMe && performance.now() < this.immuneUntil) {
      c.ui.bigToast('🌟 HOPPER\'S LIGHT', `${label} from ${fromName} dissolved`, 'good');
      return;
    }
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
        if (fx.pu === 'hopper') { this.cleanse(); break; }
        if (fx.pu === 'telekinesis') { c.nudgeBall(fx.params.pos); break; }
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
        if (isMe && fx.pu === 'possession') c.startPossessing(fx.target);
        break;
      case 'aura':
        this.auras.push({ from: fx.from, start: fx.at / 1000, dur: 10, r: 3.8 });
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
    c.ui.comms?.say('targeted', { power: label });
    const active = c.ball && c.ball.state !== 'holed' && c.ball.state !== 'sinking';
    switch (fx.pu) {
      case 'zany': case 'leash': case 'stun': case 'gas':
        if (!active) return;
        this.pending[fx.pu] = true;
        if (fx.pu === 'gas') this.nextBurp = performance.now() + 1200;
        this.applyBallMods();
        c.ui.bigToast(label + '!', `courtesy of ${fromName}`, 'bad');
        sfx.play('debuff');
        break;
      case 'possession':
        if (!active) return;
        this.pending.possession = true;
        this.applyBallMods();
        c.becomePossessed(fx.from, fromName);
        break;
      case 'freeze':
        if (!active) return;
        c.freezeBall(6, 'ice', fromName);
        break;
      case 'guardian':
        if (!active) return;
        c.freezeBall(8, 'guardian', fromName);
        break;
      case 'steal': {
        const inv = c.inventory;
        let stolen = null;
        if (inv.length) {
          const i = Math.floor(Math.random() * inv.length);
          stolen = inv.splice(i, 1)[0];
          c.renderInventory();
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
        // a meme video over most of the screen for 20 s: annoying, but you can still play
        const rng = new RNG(fx.seed);
        c.ui.showMemeAd(20, rng, fromName);
        sfx.play('ad');
        music.duck(true);
        setTimeout(() => music.duck(false), 20000);
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

  /** Hopper's Light: wash off every bad effect and shrug off new ones for a while. */
  cleanse() {
    const c = this.client;
    for (const k of NEGATIVE) { delete this.pending[k]; delete this.active[k]; }
    this.leash = null;
    this.immuneUntil = performance.now() + 10000;
    c.unfreeze();
    c.endPossessed();
    this.applyBallMods();
    c.ui.flash();
    c.healLP?.(50);
    c.ui.bigToast('🌟 HOPPER\'S LIGHT', 'cleansed · +50 life points · immune for 10 s', 'good');
    sfx.play('hio');
  }

  /** William's Zweihänder: the monster or moving obstacle nearest the point is cut out for 25 s. */
  slash(fx) {
    const p = fx.params.pos;
    const t = fx.at / 1000;
    let best = null, bd = 3.5;
    const consider = (thing, x, z) => { const d = Math.hypot(x - p[0], z - p[2]); if (d < bd) { bd = d; best = thing; } };
    for (const m of this.course.monsters) { const s = m.model?.position; if (s && !m.slashed) consider(m, s.x, s.z); }
    for (const mv of this.course.movers) if (!mv.slashed) consider(mv, mv.cur.x, mv.cur.z);
    if (!best) { this.client.ui.toast('🗡️ The Zweihänder hit nothing'); return; }
    best.slashed = true;
    if (best.spec) stats.add('slashed'); // a monster (not a moving platform)
    const body = best.body;
    if (body) body.setEnabled(false);
    const mesh = best.model || best.mesh;
    if (mesh) mesh.visible = false;
    const at = mesh ? mesh.position : new THREE.Vector3(p[0], p[1], p[2]);
    for (let i = 0; i < 40; i++) this.particles?.spawn({ pos: [at.x, at.y + 0.4, at.z], vel: [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4], color: i % 2 ? '#ffffff' : '#9fe8ff', size: 0.14, life: 0.9, gravity: 4 });
    this.slashed.push({ thing: best, body, mesh, until: t + 25 });
    sfx.play('laser');
  }

  place(fx) {
    if (fx.pu === 'creativity') return this.create(fx);
    if (fx.pu === 'zweihander') return this.slash(fx);
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
      const range = 3;
      const model = makeBlackHole(range);
      model.position.set(p[0], p[1], p[2]);
      this.group.add(model);
      this.placed.push({ type: 'blackhole', x: p[0], y: p[1], z: p[2], range, model, until: fx.at / 1000 + BH_LIFE });
    }
    sfx.play('use');
  }

  /** XANA attack (from the room, everyone at once). */
  xanaAttack(m) {
    const c = this.client;
    if (!this.course) return;
    const t0 = m.at / 1000, dur = (m.dur ?? 20000) / 1000;
    const sub = { rage: 'every monster is enraged', glitch: 'the floor is glitching', mirror: 'the world is mirrored', swarm: 'a Kankrelat swarm is loose' }[m.kind] || '';
    c.ui.bigToast('⚠️ XANA ATTACK', sub, 'bad');
    c.ui.comms?.say('xanaAttack', {}, { force: true });
    sfx.play('buzzer');
    document.body.classList.add('xana-alert');
    clearTimeout(this.alertT);
    this.alertT = setTimeout(() => document.body.classList.remove('xana-alert'), dur * 1000);
    for (const tw of this.course.towers || []) tw.holo.userData.flash(t0);
    if (m.kind === 'rage') this.course.enrageUntil = t0 + dur;
    if (m.kind === 'swarm' && m.pos) this.spawnSwarm({ params: { pos: m.pos }, seed: m.seed, at: m.at });
    if (m.kind === 'mirror') {
      document.body.classList.add('mirror-world');
      clearTimeout(this.mirrorT);
      this.mirrorT = setTimeout(() => document.body.classList.remove('mirror-world'), 15000);
    }
    if (m.kind === 'glitch') {
      // patches of corrupted floor: some slick as ice, some sticky as sludge
      const rng = new RNG(m.seed);
      for (let i = 0; i < 6; i++) {
        const pt = this.course.randomFloorPoint(rng);
        if (!pt) continue;
        const slick = i % 2 === 0, r = 1.1 + rng.next() * 0.6;
        if ((this.course.cups || [this.course.cup]).some((cp) => cp && Math.hypot(cp.x - pt.x, cp.z - pt.z) < r + 1)) continue; // never over a cup
        const zone = { kind: 'slow', mul: slick ? 0.15 : 4, contains: (p) => Math.hypot(p.x - pt.x, p.z - pt.z) <= r, glitch: true };
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 6), new THREE.MeshBasicMaterial({ color: slick ? '#7ff6ff' : '#ff2a6a', transparent: true, opacity: 0.45, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(pt.x, pt.y + 0.03, pt.z);
        this.group.add(mesh);
        this.course.zones.push(zone);
        (this.glitches ||= []).push({ zone, mesh, until: t0 + dur });
      }
    }
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
    this.resetBounces();
    this.active = { ...this.pending };
    this.pending = {};
    const a = this.active;
    const res = { chip: !!a.chip, powerMul: (a.leash ? 0.5 : 1) * (a.venom ? 0.75 : 1), steady: !!a.steady, triplicate: !!a.triplicate, glide: !!a.wings, fly: !!a.overwing, hover: !!a.overboard, stun: !!a.stun };
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
    ball.mods.speedMul = (e.zany ? 2.4 : 1) * (e.sprint ? 1.35 : 1) * (e.overbike ? 1.4 : 1) * (e.overboard ? 1.15 : 1);
    const proof = !!(e.sprint || e.overbike);
    if (ball.mods.monsterProof !== proof) ball.setMonsterProof(proof);
    this.setVehicle(e.overwing ? 'overwing' : e.overbike ? 'overbike' : e.overboard ? 'overboard' : null);
    ball.mods.decelMul = (e.zany ? 0.55 : 1) * (e.sticky ? 1.5 : 1);
    ball.mods.sticky = !!e.sticky;
    ball.mods.magnet = !!e.magnet;
    ball.mods.leash = this.active.leash ? this.leash : null;
    if (ball.mods.ghost !== !!e.ghost) ball.setGhost(!!e.ghost);
    const size = e.supersize ? 2.35 : e.funsize ? 0.55 : 1;
    if (ball.state !== 'holed' && ball.state !== 'sinking') ball.setRadius(BALL_R * size);
    this.client.ui.setAelita(!!e.aelita);
    this.client.ui.setPossession(!!e.possession);
    this.client.ui.setStatus(Object.keys(e).filter((k) => e[k] && NEXT_SHOT.includes(k)).map((k) => STATUS_ICONS[k] || POWERUPS[k].icon));
    if (e.leash && !this.lady) this.spawnLady();
    if (!e.leash && this.lady) this.removeLady();
  }

  /** The vehicle your ball is riding (pending or during the shot), or none. */
  setVehicle(kind) {
    if ((this.vehicle?.kind ?? null) === kind) return;
    if (this.vehicle) {
      const m = this.vehicle.mesh;
      m.parent?.remove(m);
      m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.vehicle = null;
    if (!kind || !this.group) return;
    const mesh = makeVehicle(kind);
    this.group.add(mesh);
    this.vehicle = { kind, mesh, yaw: this.client.cam?.yaw ?? 0 };
  }

  timeScale() { return this.has('aelita') ? 0.35 : 1; }

  /** A new shot: black holes may bounce you again. */
  resetBounces() { this.bhBounces.clear(); }

  /** Accelerations applied to the local ball. */
  forces(ball, out, t) {
    const myId = this.client.myId;
    for (const h of this.hazards) h.force(ball, t, out);
    // magnet toward cup
    if (ball.mods.magnet && ball.state === 'moving') {
      const p = ball.pos, cup = this.course.nearestCup(p);
      const dx = cup.x - p.x, dz = cup.z - p.z, d = Math.hypot(dx, dz);
      if (d < 7 && d > 0.05) { const k = 11 * (1 - d / 7) + 2.5; out.x += (dx / d) * k; out.z += (dz / d) * k; }
    }
    // black hole bumpers: pull balls that are rolling past, then fling them out of the core.
    // They never grab a resting ball, and let go after a few bounces, so nobody gets trapped.
    for (const o of this.placed) {
      if (o.type !== 'blackhole' || ball.mods.ghost || ball.state !== 'moving' || t > o.until) continue;
      const p = ball.pos;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d >= o.range || Math.abs(p.y - o.y) > 1.5) continue;
      const bounces = this.bhBounces.get(o) || 0;
      if (bounces >= BH_MAX_BOUNCES || t < (o.coolUntil || 0)) continue;
      if (d < BH_CORE) {
        // bumper kick: back out at a random angle, faster than it came in
        const v = ball.vel;
        const sp = Math.max(Math.hypot(v.x, v.z), 5) * 1.25;
        const a = Math.atan2(-v.z, -v.x) + (Math.random() - 0.5) * 1.6;
        ball.body.setLinvel({ x: Math.cos(a) * sp, y: v.y, z: Math.sin(a) * sp }, true);
        this.bhBounces.set(o, bounces + 1);
        o.coolUntil = t + 0.6;
        o.kick = 1;
        this.client.stat('swallowed');
        sfx.play('bumper');
        continue;
      }
      const k = 18 * (1 - d / o.range) + 3;
      out.x += (dx / (d || 1)) * k; out.z += (dz / (d || 1)) * k;
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
    // Zweihänder cuts heal after 15 s
    for (let i = this.slashed.length - 1; i >= 0; i--) {
      const s = this.slashed[i];
      if (t < s.until) continue;
      s.thing.slashed = false;
      s.body?.setEnabled(true);
      if (s.mesh) s.mesh.visible = true;
      this.slashed.splice(i, 1);
    }
    // Gas Giant: the waiting ball burps
    const c = this.client, ball = c.ball;
    if (this.pending.gas && ball && ball.state === 'idle' && !c.aim && !ball.frozen && performance.now() > this.nextBurp) {
      this.nextBurp = performance.now() + 1500 + Math.random() * 1500;
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 1.4;
      ball.pinned = false;
      ball.state = 'moving';
      ball.body.setLinvel({ x: Math.cos(a) * sp, y: 1.2, z: Math.sin(a) * sp }, true);
      const p = ball.pos;
      for (let i = 0; i < 18; i++) this.particles?.spawn({ pos: [p.x, p.y, p.z], vel: [(Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5], color: i % 2 ? '#9bd86a' : '#c9f08a', size: 0.22, life: 1.1 });
      sfx.play('burp');
    }
    for (const s of this.swarms) for (const m of s.monsters) m.update(t);
    // XANA's glitched floor patches flicker and expire
    for (let i = (this.glitches?.length ?? 0) - 1; i >= 0; i--) {
      const gl = this.glitches[i];
      gl.mesh.material.opacity = 0.25 + 0.3 * Math.abs(Math.sin(t * 9 + i));
      gl.mesh.rotation.z = Math.floor(t * 6 + i) * 0.5;
      if (t > gl.until) { this.group.remove(gl.mesh); this.course.zones.splice(this.course.zones.indexOf(gl.zone), 1); this.glitches.splice(i, 1); }
    }
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
    if (this.vehicle && this.client.ball) {
      // ride under the ball, facing where it's rolling (or where you're aiming while it waits)
      const ball = this.client.ball, v = this.vehicle, m = v.mesh;
      const vel = ball.vel, sp = Math.hypot(vel.x, vel.z);
      const want = sp > 0.4 ? Math.atan2(vel.x, vel.z) : (this.client.cam?.yaw ?? v.yaw);
      let d = want - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      v.yaw += d * Math.min(1, dt * 10);
      m.visible = ball.mesh.visible && ball.state !== 'holed' && ball.state !== 'sinking';
      m.position.copy(ball.mesh.position);
      m.rotation.set(0, v.yaw, 0);
      m.scale.setScalar(ball.radius * 1.35);
      const wheel = m.getObjectByName('wheel');
      if (wheel) wheel.rotation.x += sp * dt * 4;
      const gl = m.getObjectByName('glow');
      if (gl) gl.material.opacity = 0.5 + 0.3 * Math.sin(t * 12);
      if (v.kind === 'overboard') m.position.y += (0.5 + 0.5 * Math.sin(t * 5)) * ball.radius * 0.08;
    }
    if (this.shieldMesh && this.client.ball) {
      this.shieldMesh.position.copy(this.client.ball.mesh.position);
      this.shieldMesh.rotation.y = t * 1.5;
      this.shieldMesh.scale.setScalar((this.client.ball.radius / 0.18) * (1 + Math.sin(t * 6) * 0.04));
    }
    for (const o of this.placed) {
      if (o.type === 'blackhole') {
        o.model.getObjectByName('disk').rotation.z = t * 3;
        // collapse and vanish when its time is up; pulse on each kick
        const left = o.until - t;
        const k = left < 1 ? Math.max(0, left) : 1;
        o.kick = Math.max(0, (o.kick || 0) - dt * 3);
        o.model.scale.setScalar(k * (1 + o.kick * 0.25));
        o.model.visible = k > 0;
      }
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

  /** What's active right now, for the HUD chips. */
  chips(t) {
    const out = [];
    for (const h of this.hazards) out.push({ icon: POWERUPS[h.fx.pu].icon, text: `${Math.max(0, Math.ceil(h.dur - h.local(t)))}s` });
    for (const s of this.swarms) out.push({ icon: '🪲', text: `${Math.max(0, Math.ceil(s.until - t))}s` });
    for (const c of this.creations) out.push({ icon: '✨', text: `${Math.max(0, Math.ceil(c.until - t))}s` });
    if (this.stickyWalls) out.push({ icon: '🪤', text: 'all hole' });
    if (this.shield) out.push({ icon: '🛡️', text: 'ready', good: true });
    const mine = this.auras.find((a) => a.from === this.client.myId && t - a.start <= a.dur);
    if (mine) out.push({ icon: '💔', text: `${Math.ceil(mine.dur - (t - mine.start))}s`, good: true });
    return out;
  }

  /** Marks a bumper hit for the squash animation. */
  bumperHit(b, t) { b.hitT = t + 0.25; }
}
