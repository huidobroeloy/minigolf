import * as THREE from 'three';
import { HOLES, SECTOR_NAMES } from '../holes/index.js';
import { Physics, FIXED_DT } from '../physics/world.js';
import { Ball, BALL_R, aimWobble } from '../physics/ball.js';
import { buildCourse } from '../course/builder.js';
import { ChaseCam } from '../camera/chaseCam.js';
import { Ghosts } from './ghosts.js';
import { Pickups } from './pickups.js';
import { EffectManager } from '../powerups/effects.js';
import { POWERUPS } from '../powerups/registry.js';
import { scoreName } from '../ui/ui.js';
import { sfx } from '../core/audio.js';
import { makeSpawnBumper, makeBlackHole } from '../fx/models.js';
import { emojiTexture } from '../fx/particles.js';

export const EMOTES = ['😂', '😡', '👏', '💀'];

const SEND_INTERVAL = 1 / 15;
const MAX_INV = 3;

export class GameClient {
  constructor(app, link, me, { debug = false, isHost = false } = {}) {
    this.app = app;
    this.renderer = app.renderer;
    this.scene = app.renderer.scene;
    this.ui = app.ui;
    this.input = app.input;
    this.link = link;
    this.me = me;
    this.debug = debug;
    this.isHostPage = isHost;
    this.myId = null;
    this.players = new Map();
    this.phase = 'connecting';
    this.inventory = [];
    this.cam = new ChaseCam(this.renderer.camera);
    this.ghosts = new Ghosts(this.scene);
    this.effects = new EffectManager(this);
    this.sendTimer = 0;
    this.simTime = 0;
    this.aim = null; // {sx, sy, power}
    this.spaceCharge = null;
    this.rotating = false;
    this.placing = null;
    this.spectate = null;
    this.lastBeep = 99;
    this.disposers = [];
    this.emotes = [];
    this.lastEmote = 0;
    this.makeAimLine();

    link.onMessage = (m) => this.onMessage(m);
    link.onClose = () => this.app.leave('Connection to the host was lost');
    link.send({ t: 'join', name: me.name, color: me.color });
    this.bindInput();
    this.ui.on({
      use: (i) => this.useSlot(i),
      discard: (i) => this.discardSlot(i),
      toggleCam: () => this.toggleOverhead(),
      spectate: () => this.cycleSpectate(),
      start: () => this.link.send({ t: 'start' }),
      settings: (s) => this.link.send({ t: 'settings', settings: s }),
      skip: () => this.link.send({ t: 'skip' }),
      tick: () => sfx.play('roulette'),
    });
  }

  // ---------- helpers ----------
  nameOf(id) { return id === this.myId ? 'You' : this.players.get(id)?.name ?? '???'; }

  positionOf(id) {
    if (id === this.myId) return this.ball && this.ball.state !== 'holed' ? this.ball.mesh.position : null;
    return this.ghosts.position(id);
  }

  get isHost() { return !!this.players.get(this.myId)?.host; }

  canShoot() {
    return this.phase === 'hole' && this.ball && this.ball.state === 'idle' && !this.effects.locked && !this.placing && !this.ui.overlayOpen && !this.falling;
  }

  // ---------- network ----------
  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.myId = m.you;
        this.code = m.code;
        this.me.color = m.color;
        break;
      case 'lobby':
        this.lobby = m;
        for (const p of m.players) this.upsertPlayer(p);
        if (this.phase === 'connecting' || this.phase === 'lobby' || (this.phase === 'final' && m.phase === 'lobby')) {
          this.phase = 'lobby';
          if (!m.solo) this.ui.showLobby(m, this.myId);
          else this.link.send({ t: 'start' });
        }
        break;
      case 'reject':
        this.app.leave(m.reason);
        break;
      case 'matchStart':
        this.inventory = [];
        this.plan = m.plan;
        break;
      case 'hole':
        this.loadHole(m);
        break;
      case 'st': {
        const p = this.players.get(m.id);
        if (p) { p.strokes = m.k; }
        this.ghosts.setState(m.id, m);
        this.playersDirty = true;
        break;
      }
      case 'picked': {
        const it = this.pickups?.take(m.pid);
        if (m.by === this.myId && it) this.addPowerup(it.type, 'pickup');
        break;
      }
      case 'fx':
        this.effects.apply(m);
        break;
      case 'gift':
        if (m.pu) { this.addPowerup(m.pu, 'steal'); this.ui.bigToast('🦝 Got it!', `stole ${POWERUPS[m.pu].name} from ${this.nameOf(m.from)}`, 'good'); }
        else this.ui.toast(`${this.nameOf(m.from)} had nothing to steal`);
        break;
      case 'refund':
        this.addPowerup(m.pu, 'refund');
        this.ui.toast(m.reason);
        break;
      case 'holed': {
        const p = this.players.get(m.id);
        if (p) { p.holed = true; p.strokes = m.strokes; }
        this.playersDirty = true;
        if (m.id !== this.myId) this.ui.feed(`${p?.name} holed out in ${m.strokes}${m.hio ? ' — HOLE IN ONE!' : ''}`);
        break;
      }
      case 'emote':
        this.showEmote(m.id, m.e);
        break;
      case 'left':
        this.ghosts.remove(m.id);
        if (this.players.get(m.id)) this.players.get(m.id).connected = false;
        this.ui.feed(`${m.name} left`);
        this.playersDirty = true;
        break;
      case 'holeEnd':
        this.endHole(m);
        break;
      case 'final':
        this.phase = 'final';
        this.teardownHole();
        this.app.showBackdrop();
        this.ui.showScoreboard({ players: m.standings, plan: m.plan, holeNo: m.plan.length - 1, myId: this.myId, final: true, isHost: this.isHost });
        if (m.standings[0]?.id === this.myId && m.standings.length > 1) sfx.play('hio');
        break;
    }
  }

  upsertPlayer(p) {
    const cur = this.players.get(p.id) || {};
    this.players.set(p.id, { ...cur, ...p });
    if (this.phase === 'hole' && p.id !== this.myId && p.connected !== false) this.ghosts.ensure(this.players.get(p.id));
    this.playersDirty = true;
  }

  // ---------- hole lifecycle ----------
  teardownHole() {
    this.cancelAim();
    for (const em of this.emotes) this.scene.remove(em.s);
    this.emotes = [];
    if (this.virt) { this.scene.remove(this.virt.g); this.virt = null; }
    this.placing = null;
    this.effects.clear();
    this.ghosts.clear();
    if (this.course) { this.course.dispose(); this.course = null; }
    if (this.ball) { this.ball.dispose(); this.ball = null; }
    if (this.physics) { this.physics.dispose(); this.physics = null; }
    this.pickups = null;
    this.aimGroup.visible = false;
  }

  loadHole(m) {
    this.teardownHole();
    this.app.hideBackdrop();
    const def = HOLES[m.index];
    this.def = def;
    this.holeMsg = m;
    this.phase = 'hole';
    for (const p of m.players) this.upsertPlayer(p);
    this.physics = new Physics();
    this.course = buildCourse(def, this.physics, this.scene);
    this.renderer.applyTheme(def.sector, this.course);
    this.ball = new Ball(this.physics, this.scene, this.me.color);
    this.ball.onEvent = (type, data) => this.onBallEvent(type, data);
    this.course.localBall = this.ball;
    this.ball.place(this.course.tee.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
    this.ball.teleportCooldown = 0;
    this.strokes = 0;
    this.shotInProgress = false;
    this.falling = false;
    this.spectate = null;
    this.holeStartLocal = performance.now() - m.elapsed;
    this.duration = m.duration;
    this.simTime = m.elapsed / 1000;
    this.cam.mode = 'chase';
    this.cam.yaw = def.yaw ?? Math.atan2(this.course.cup.x - this.course.tee.x, this.course.cup.z - this.course.tee.z);
    this.cam.pitch = 0.32; this.cam.dist = 3.4;
    this.cam.snapTo(this.ball.mesh.position);
    this.cam.setOverhead(this.course);
    this.effects.reset(this.course, this.physics, this.scene);
    this.pickups = new Pickups(this.course, m.seed, m.pickupCount, m.taken);
    this.env = this.makeEnv();
    for (const p of this.players.values()) if (p.id !== this.myId && p.connected !== false) this.ghosts.ensure(p);
    this.ui.showHud({ holeNo: m.holeNo, total: m.total, name: def.name, par: def.par, sectorName: SECTOR_NAMES[def.sector] });
    this.ui.renderInventory(this.inventory);
    this.ui.setHostControls(this.isHost && !this.lobby?.solo);
    this.ui.setStrokes(0, def.par);
    this.ui.setStatus([]);
    this.ui.banner(`HOLE ${m.holeNo + 1} · ${def.name}`, `${SECTOR_NAMES[def.sector]} · Par ${def.par}`);
    this.playersDirty = true;
    this.lastBeep = 99;
    this.virtualize(this.ball.mesh.position);
  }

  /** Lyoko-style virtualization: rings sweep down around the ball as it materializes. */
  virtualize(p) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 32), mat);
      r.rotation.x = Math.PI / 2;
      g.add(r);
    }
    g.position.copy(p);
    this.scene.add(g);
    this.virt = { g, t: 0, mat };
    sfx.play('teleport');
  }

  makeEnv() {
    const self = this;
    const out = { x: 0, y: 0, z: 0, wake: false };
    return {
      course: this.course,
      forces(ball) {
        out.x = out.y = out.z = 0; out.wake = false; out.teleport = null; out.launch = null;
        self.course.zoneForces(ball, out);
        self.effects.forces(ball, out, self.simTime);
        return out;
      },
      get decelMul() { return self.effects.decelMul(self.simTime); },
      zoneDecel: (ball) => this.course.zoneDecel(ball) * this.effects.zoneDecel(ball, this.simTime),
      get stickyWalls() { return self.effects.stickyWalls; },
      get bumpers() { return self.effects.bumpers(self.course.bumpers); },
      onHole: () => this.onHoled(),
      onFall: () => this.onFall(),
      onPit: (ball, pit) => this.onPit(pit),
    };
  }

  endHole(m) {
    // record results
    for (const p of m.players) this.upsertPlayer(p);
    const mine = m.results.find((r) => r.id === this.myId);
    if (mine?.timeout && this.phase === 'hole') { sfx.play('buzzer'); }
    this.phase = 'between';
    this.teardownHole();
    this.app.showBackdrop();
    this.ui.showScoreboard({ players: m.players, plan: m.plan, holeNo: m.holeNo, results: m.results, myId: this.myId, final: false, isHost: this.isHost });
  }

  // ---------- ball events ----------
  onBallEvent(type, data) {
    if (type === 'wall') sfx.play('wall', data.strength);
    else if (type === 'bumper') { sfx.play('bumper'); data.bumper.hitT = this.simTime + 0.25; }
    else if (type === 'stick') sfx.play('stick');
    else if (type === 'vent') sfx.play('whoosh');
    else if (type === 'grabbed') { sfx.play('teleport'); this.ui.bigToast('SCYPHOZOA!', 'grabbed your ball and dropped it back', 'bad'); this.cam.snapTo(this.ball.mesh.position); }
    else if (type === 'sinkStart') sfx.play('cup');
    else if (type === 'rest') this.onRest();
  }

  onRest() {
    if (this.shotInProgress) {
      this.shotInProgress = false;
      this.effects.onShotEnd();
    }
  }

  onHoled() {
    if (this.shotInProgress) { this.shotInProgress = false; this.effects.onShotEnd(); }
    const name = scoreName(this.strokes, this.def.par);
    this.ui.bigToast(name, `${this.strokes} stroke${this.strokes === 1 ? '' : 's'}`, this.strokes <= this.def.par ? 'good' : '');
    if (this.strokes === 1) sfx.play('hio');
    if (this.strokes < this.def.par || this.strokes === 1) this.confetti(this.strokes === 1 ? 160 : 70);
    this.link.send({ t: 'holed', strokes: this.strokes });
    const me = this.players.get(this.myId);
    if (me) { me.holed = true; me.strokes = this.strokes; }
    this.playersDirty = true;
    this.sendState(true);
    this.ui.setHint('You\'re in! Keep using power-ups on the others · <kbd>Tab</kbd> to spectate');
  }

  confetti(n) {
    const c = this.course.cup;
    const cols = ['#ff4d4d', '#ffd24d', '#3ddc84', '#4da6ff', '#ff4dc4', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      this.effects.particles?.spawn({ pos: [c.x, c.y + 0.3, c.z], vel: [Math.cos(a) * s * 0.5, 4 + Math.random() * 6, Math.sin(a) * s * 0.5], color: cols[i % cols.length], size: 0.18, life: 2.2, gravity: 7, drag: 0.6 });
    }
  }

  addStrokes(n) {
    this.strokes += n;
    this.ui.setStrokes(this.strokes, this.def.par);
  }

  onFall() {
    if (this.falling) return;
    this.falling = true;
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.addStrokes(1);
    sfx.play('splash');
    this.ui.bigToast('SPLASH!', 'Lost in the Digital Sea · +1', 'bad');
    this.sendState(true);
    const ball = this.ball;
    setTimeout(() => {
      if (this.ball !== ball) return;
      this.falling = false;
      this.ball.respawnAtSafe();
      this.cam.snapTo(this.ball.mesh.position);
      this.onRest();
    }, 1000);
  }

  onSwallowed() {
    if (this.falling) return;
    this.falling = true;
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.ball.mesh.visible = false;
    this.addStrokes(1);
    sfx.play('teleport');
    this.ui.bigToast('🕳️ SWALLOWED', 'Black hole · +1', 'bad');
    const ball = this.ball;
    setTimeout(() => {
      if (this.ball !== ball) return;
      this.falling = false;
      this.ball.respawnAtSafe();
      this.cam.snapTo(this.ball.mesh.position);
      this.onRest();
    }, 900);
  }

  onPit(pit) {
    if (this.falling) return;
    if (!pit.fortune) return this.onFall();
    this.falling = true;
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.ball.mesh.visible = false;
    this.cancelAim();
    // weighted fortune: small penalties are more common, rare jackpot
    const r = Math.random();
    const v = r < 0.04 ? 0 : r < 0.32 ? 1 : r < 0.56 ? 2 : r < 0.76 ? 3 : r < 0.9 ? 4 : 5;
    const ball = this.ball;
    this.ui.roulette(v, () => {
      if (this.ball !== ball) return;
      this.addStrokes(v);
      sfx.play(v === 0 ? 'hio' : 'jackpot');
      this.ui.bigToast(v === 0 ? 'JACKPOT!' : `+${v} STROKE${v > 1 ? 'S' : ''}`, 'Fortune Falls drops you… somewhere', v === 0 ? 'good' : 'bad');
      const drops = this.def.fortuneDrops;
      let dest;
      if (drops?.length) { const d = drops[Math.floor(Math.random() * drops.length)]; dest = new THREE.Vector3(d[0], d[1], d[2]); }
      else dest = this.course.randomFloorPoint({ pick: (a) => a[Math.floor(Math.random() * a.length)], range: (a, b) => a + Math.random() * (b - a) });
      this.falling = false;
      this.ball.place(dest.add(new THREE.Vector3(0, this.ball.radius + 0.6, 0)), { safe: false });
      this.ball.state = 'moving';
      this.cam.snapTo(this.ball.mesh.position);
      sfx.play('teleport');
      this.onRest();
    });
    this.sendState(true);
  }

  // ---------- shooting ----------
  shoot(power) {
    if (!this.canShoot()) return;
    this.addStrokes(1);
    const yaw = this.cam.yaw + this.currentWobble(power);
    const opts = this.effects.onShoot();
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.ball.shoot(dir, power * opts.powerMul, { chip: opts.chip });
    this.shotInProgress = true;
    sfx.play('putt', power);
    this.sendState(true);
  }

  /** The sway the aim line is showing right now (the shot uses exactly this). */
  currentWobble(power) {
    return aimWobble(performance.now() / 1000, power, this.effects.has('steady'));
  }

  cancelAim() {
    this.aim = null;
    this.spaceCharge = null;
    this.ui.setPower(null);
  }

  // ---------- power-ups ----------
  addPowerup(id, source) {
    if (this.inventory.length >= MAX_INV) {
      this.ui.toast(`Inventory full — ${POWERUPS[id].icon} ${POWERUPS[id].name} discarded`);
      sfx.play('discard');
      return;
    }
    this.inventory.push(id);
    this.ui.renderInventory(this.inventory);
    this.ui.flashSlot(this.inventory.length - 1);
    if (source === 'pickup') { sfx.play('pickup'); this.ui.toast(`${POWERUPS[id].icon} ${POWERUPS[id].name}`); }
  }

  discardSlot(i) {
    if (!this.inventory[i]) return;
    const id = this.inventory.splice(i, 1)[0];
    this.ui.renderInventory(this.inventory);
    this.ui.toast(`Discarded ${POWERUPS[id].name}`);
    sfx.play('discard');
  }

  useSlot(i) {
    const id = this.inventory[i];
    if (!id || this.phase !== 'hole') return;
    if (this.effects.locked) return this.ui.toast('You can\'t skip this ad 📺');
    const def = POWERUPS[id];
    const myActive = this.ball && this.ball.state !== 'holed' && this.ball.state !== 'sinking';
    const consume = () => { this.inventory.splice(i, 1); this.ui.renderInventory(this.inventory); sfx.play('use'); };
    if ((def.kind === 'self' || def.kind === 'aura' || def.needSelf) && !myActive) return this.ui.toast('Your ball is already in the cup');
    if (def.kind === 'one') {
      const targets = [...this.players.values()].filter((p) => p.id !== this.myId && p.connected !== false && (def.allowHoled || !p.holed));
      if (!targets.length) return this.ui.toast('No valid targets');
      this.cancelAim();
      this.ui.pickTarget(`${def.icon} ${def.name} — choose a player`, targets, (tid) => {
        if (!tid || this.inventory[i] !== id) return;
        consume();
        this.link.send({ t: 'use', pu: id, target: tid });
      });
      return;
    }
    if (def.kind === 'place') { this.cancelAim(); return this.startPlacing(id, i); }
    const params = {};
    if (def.dir) params.dir = [Math.sin(this.cam.yaw), Math.cos(this.cam.yaw)];
    consume();
    this.link.send({ t: 'use', pu: id, params });
  }

  startPlacing(id, slot) {
    const model = id === 'bumper' ? makeSpawnBumper(0.5) : makeBlackHole(3.2);
    model.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; } });
    this.scene.add(model);
    this.placing = { id, slot, model, pos: null, prevMode: this.cam.mode };
    this.cam.mode = 'overhead';
    this.ui.setHint(`Click on the course to place ${POWERUPS[id].icon} ${POWERUPS[id].name} · <kbd>Esc</kbd> to cancel`);
  }

  stopPlacing() {
    if (!this.placing) return;
    this.scene.remove(this.placing.model);
    this.cam.mode = this.placing.prevMode;
    this.placing = null;
    this.ui.setHint('');
  }

  placementRay(e) {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.renderer.camera);
    const hits = ray.intersectObjects(this.course.group.children, false);
    for (const h of hits) {
      if (!h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.y > 0.8) return h.point;
    }
    return null;
  }

  toggleOverhead() {
    if (this.placing) return;
    this.cam.mode = this.cam.mode === 'overhead' ? 'chase' : 'overhead';
  }

  // ---------- input ----------
  bindInput() {
    const inp = this.input;
    this.disposers.push(inp.on('pointerdown', (e) => {
      sfx.unlock();
      if (this.phase !== 'hole') return;
      if (this.placing) {
        if (e.button !== 0) return;
        const p = this.placementRay(e);
        if (p) {
          const { id, slot } = this.placing;
          if (this.inventory[slot] === id) {
            this.inventory.splice(slot, 1);
            this.ui.renderInventory(this.inventory);
            this.link.send({ t: 'use', pu: id, params: { pos: [p.x, p.y, p.z] } });
          }
          this.stopPlacing();
        }
        return;
      }
      if (inp.pointers.size >= 2) { this.cancelAim(); this.rotating = true; return; }
      if (e.button === 0 && this.canShoot() && this.cam.mode === 'chase') {
        this.aim = { sx: e.clientX, sy: e.clientY, power: 0 };
      } else if (e.button === 0 || e.button === 2 || e.button === 1) {
        this.rotating = true;
      }
    }));
    this.disposers.push(inp.on('pointermove', (e, p) => {
      if (this.placing && this.course) {
        const hit = this.placementRay(e);
        this.placing.model.visible = !!hit;
        if (hit) this.placing.model.position.copy(hit);
        return;
      }
      if (!p) return;
      const ts = this.effects.timeScale();
      if (this.aim) {
        if (!this.canShoot()) { this.cancelAim(); return; }
        const range = window.innerHeight * 0.32;
        this.aim.power = Math.max(0, Math.min(1, (e.clientY - this.aim.sy) / range));
        this.cam.rotate(-(p.dx || 0) * 0.0022 * ts);
        this.ui.setPower(this.aim.power);
      } else if (this.rotating) {
        this.cam.rotate(-(p.dx || 0) * 0.006 * ts);
        this.cam.tilt((p.dy || 0) * 0.004 * ts);
      }
    }));
    this.disposers.push(inp.on('pointerup', () => {
      if (this.aim) {
        const pw = this.aim.power;
        this.cancelAim();
        if (pw > 0.03) this.shoot(pw);
      }
      if (this.input.pointers.size === 0) this.rotating = false;
    }));
    this.disposers.push(inp.on('wheel', (e) => this.cam.zoom(e.deltaY > 0 ? 1.1 : 0.9)));
    this.disposers.push(inp.on('keydown', (e) => this.onKey(e)));
    this.disposers.push(inp.on('keyup', (e) => {
      if (e.code === 'Space' && this.spaceCharge) {
        const pw = this.spaceCharge.power;
        this.cancelAim();
        if (pw > 0.03) this.shoot(pw);
      }
    }));
  }

  onKey(e) {
    sfx.unlock();
    if (e.code === 'KeyH') return this.ui.toggleHelp();
    if (e.code === 'KeyM') return this.app.toggleMute();
    if (e.code === 'Escape') {
      if (this.placing) return this.stopPlacing();
      if (this.ui.overlayOpen && !this.effects.locked && !this.falling) return this.ui.closeOverlay();
      return this.cancelAim();
    }
    if (this.phase !== 'hole') return;
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (digit !== undefined) return e.shiftKey ? this.discardSlot(digit) : this.useSlot(digit);
    if (e.code === 'KeyC') return this.toggleOverhead();
    const emo = { Digit7: 0, Digit8: 1, Digit9: 2, Digit0: 3 }[e.code];
    if (emo !== undefined && performance.now() - this.lastEmote > 1200) {
      this.lastEmote = performance.now();
      return this.link.send({ t: 'emote', e: EMOTES[emo] });
    }
    if (e.code === 'Tab') return this.cycleSpectate();
    if (e.code === 'Space' && this.canShoot() && !this.aim) {
      this.spaceCharge = { t: 0, power: 0 };
    }
    if (this.debug) {
      if (e.code === 'KeyP') this.ui.debugGrant((id) => { this.inventory.length >= MAX_INV && this.inventory.shift(); this.addPowerup(id, 'debug'); });
      if (e.code === 'KeyK' && this.ball) { const c = this.course.cup; this.ball.place(new THREE.Vector3(c.x - Math.sin(this.cam.yaw) * 1.5, c.y + 0.25, c.z - Math.cos(this.cam.yaw) * 1.5)); }
      if (e.code === 'KeyL' && this.ball) { const p = this.ball.pos; console.log('ball', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'yaw', this.cam.yaw.toFixed(3)); }
    }
  }

  showEmote(id, e) {
    if (!EMOTES.includes(e) || !this.course) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(e, 128), transparent: true, depthTest: false }));
    s.renderOrder = 11;
    s.scale.set(0.7, 0.7, 1);
    this.scene.add(s);
    this.emotes.push({ id, s, t: 0 });
    if (id !== this.myId) this.ui.feed(`${this.nameOf(id)}: ${e}`);
  }

  updateEmotes(dt) {
    for (const em of this.emotes) {
      em.t += dt;
      const p = this.positionOf(em.id) || (em.id === this.myId ? this.ball?.mesh.position : null);
      if (p) em.s.position.set(p.x, p.y + 0.7 + em.t * 0.4, p.z);
      em.s.material.opacity = Math.min(1, (2.2 - em.t) * 2);
      em.s.scale.setScalar(0.7 * (1 + Math.min(0.3, em.t)));
    }
    this.emotes = this.emotes.filter((em) => { if (em.t > 2.2) { this.scene.remove(em.s); return false; } return true; });
  }

  cycleSpectate() {
    if (!this.ball || this.ball.state !== 'holed') return this.ui.toast('Hole out first, then you can spectate');
    const ids = [...this.ghosts.map.keys()].filter((id) => this.ghosts.position(id));
    if (!ids.length) { this.spectate = null; return; }
    const i = ids.indexOf(this.spectate);
    this.spectate = ids[(i + 1) % ids.length];
    this.ui.toast(`Spectating ${this.nameOf(this.spectate)}`);
  }

  // ---------- per-frame ----------
  frame(dt) {
    if (this.phase !== 'hole' || !this.course) return;
    const ts = this.effects.timeScale();
    // keyboard camera
    const k = this.input;
    const rot = (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0) - (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0);
    if (rot) this.cam.rotate(rot * dt * (k.down('ShiftLeft') ? 0.4 : 1.6) * ts);
    const tilt = (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0) - (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0);
    if (tilt) this.cam.tilt(tilt * dt * 0.8);
    if (k.down('Equal') || k.down('NumpadAdd')) this.cam.zoom(1 - dt);
    if (k.down('Minus') || k.down('NumpadSubtract')) this.cam.zoom(1 + dt);
    if (this.spaceCharge) {
      if (!this.canShoot()) this.cancelAim();
      else {
        this.spaceCharge.t += dt * ts;
        const ph = (this.spaceCharge.t / 1.6) % 2;
        this.spaceCharge.power = ph < 1 ? ph : 2 - ph;
        this.ui.setPower(this.spaceCharge.power);
      }
    }

    // fixed-step physics (Aelita slows this client's whole world)
    this.acc = (this.acc || 0) + Math.min(dt, 0.1) * ts;
    // catch up with the shared hole clock after slow motion ends
    const holeT = (performance.now() - this.holeStartLocal) / 1000;
    if (ts === 1 && holeT - this.simTime > 0.05) this.acc += Math.min(holeT - this.simTime - 0.05, dt * 0.5);
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 10) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps >= 10) this.acc = 0;

    // visuals
    this.ball.syncMesh(dt * ts);
    this.course.frame(this.simTime, dt);
    this.effects.frame(this.simTime, dt);
    this.pickups.frame(this.simTime);
    this.ghosts.update(dt);
    this.updateCamera(dt);
    this.updateAimLine();
    this.updateEmotes(dt);
    if (this.virt) {
      const v = this.virt;
      v.t += dt;
      v.g.children.forEach((r, i) => { r.position.y = 1.4 - Math.min(1, v.t * 1.1 + i * 0.12) * 1.5; r.scale.setScalar(1 + Math.sin(v.t * 8 + i) * 0.1); });
      v.mat.opacity = Math.max(0, 0.9 - Math.max(0, v.t - 0.8) * 2);
      this.ball.mesh.scale.setScalar(this.ball.radius * Math.min(1, v.t * 1.5));
      if (v.t > 1.3) { this.scene.remove(v.g); this.ball.mesh.scale.setScalar(this.ball.radius); this.virt = null; }
    }

    // timer
    const left = this.duration - (performance.now() - this.holeStartLocal);
    this.ui.setTimer(left, this.duration);
    const secLeft = Math.ceil(left / 1000);
    if (secLeft <= 10 && secLeft > 0 && secLeft !== this.lastBeep && this.ball.state !== 'holed') { this.lastBeep = secLeft; sfx.play('beep'); }

    // hints
    if (this.ball.state === 'idle' && !this.aim && !this.placing && this.strokes === 0) this.ui.setHint('Drag down to set power · sideways to aim · release to putt');
    else if (this.strokes === 1 && !this.placing && this.ball.state !== 'holed') this.ui.setHint('');

    // network
    this.sendTimer += dt;
    if (this.sendTimer >= SEND_INTERVAL) { this.sendTimer = 0; this.sendState(); }
    if (this.playersDirty) { this.playersDirty = false; this.renderPlayers(); }
  }

  step(dt) {
    const ball = this.ball;
    this.course.update(this.simTime, dt);
    this.effects.update(this.simTime);
    ball.preStep(dt, this.env);
    this.physics.step();
    ball.postStep(dt, this.env);
    if (ball.state === 'idle' || ball.state === 'moving') {
      for (const pid of this.pickups.touching(ball.pos, ball.radius)) this.link.send({ t: 'claim', pid });
      if (ball.teleportCooldown > 0) ball.teleportCooldown -= dt;
      const dest = this.course.checkTeleport(ball, { pick: (a) => a[Math.floor(Math.random() * a.length)] });
      if (dest) {
        ball.place(dest, { safe: false });
        ball.state = 'moving';
        ball.teleportCooldown = 1.2;
        this.cam.snapTo(ball.mesh.position);
        sfx.play('teleport');
      }
    }
    this.simTime += dt;
  }

  updateCamera(dt) {
    let target = this.ball.mesh.position;
    if (this.ball.state === 'holed') {
      const sp = this.spectate && this.ghosts.position(this.spectate);
      if (sp) target = sp;
      else target = new THREE.Vector3(this.course.cup.x, this.course.cup.y + 0.2, this.course.cup.z);
    }
    this.cam.target.copy(target);
    this.cam.update(dt);
  }

  sendState(force = false) {
    if (!this.ball || this.phase !== 'hole') return;
    const p = this.ball.state === 'sinking' || this.ball.state === 'holed' ? this.ball.mesh.position : this.ball.pos;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    this.link.send({
      t: 'st', p: [r3(p.x), r3(p.y), r3(p.z)], r: r3(this.ball.radius),
      s: this.falling ? 'gone' : this.ball.state, k: this.strokes, g: this.ball.mods.ghost ? 1 : 0,
    });
    const me = this.players.get(this.myId);
    if (me && me.strokes !== this.strokes) { me.strokes = this.strokes; this.playersDirty = true; }
  }

  renderPlayers() {
    const list = [...this.players.values()].filter((p) => p.connected !== false)
      .map((p) => ({ ...p, total: (p.scores || []).reduce((a, b) => a + (b ?? 0), 0) }))
      .sort((a, b) => a.total - b.total);
    this.ui.renderPlayers(list, this.myId);
  }

  // ---------- aim line ----------
  makeAimLine() {
    this.aimGroup = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
    this.aimDots = [];
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat);
      this.aimGroup.add(d);
      this.aimDots.push(d);
    }
    this.aimMat = mat;
    this.scene.add(this.aimGroup);
  }

  updateAimLine() {
    const show = this.ball && this.ball.state === 'idle' && this.cam.mode === 'chase' && !this.placing;
    this.aimGroup.visible = !!show;
    if (!show) return;
    const power = this.aim?.power ?? this.spaceCharge?.power ?? 0;
    const len = 0.8 + power * 5;
    const p = this.ball.mesh.position;
    const yaw = this.cam.yaw + this.currentWobble(power);
    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    const t = performance.now() / 1000;
    this.aimDots.forEach((d, i) => {
      const f = ((i + (t * 2) % 1) / this.aimDots.length);
      d.position.set(p.x + sx * (this.ball.radius + f * len), p.y - this.ball.radius + 0.05, p.z + sz * (this.ball.radius + f * len));
      d.scale.setScalar(1 - f * 0.5);
    });
    this.aimMat.color.setHSL((120 - power * 120) / 360, 0.9, power > 0 ? 0.55 : 0.95);
    this.aimMat.opacity = power > 0 ? 0.95 : 0.55;
  }

  dispose() {
    this.teardownHole();
    for (const d of this.disposers) d();
    this.scene.remove(this.aimGroup);
    this.link.onMessage = () => {};
    this.link.onClose = () => {};
  }
}
