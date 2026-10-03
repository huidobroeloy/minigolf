import * as THREE from 'three';
import { HOLES, SECTOR_NAMES } from '../holes/index.js';
import { Physics, FIXED_DT } from '../physics/world.js';
import { Ball, BALL_R, aimWobble } from '../physics/ball.js';
import { buildCourse } from '../course/builder.js';
import { ChaseCam, VIEWS, VIEW_INFO } from '../camera/chaseCam.js';
import { Ghosts } from './ghosts.js';
import { Pickups } from './pickups.js';
import { EffectManager } from '../powerups/effects.js';
import { POWERUPS } from '../powerups/registry.js';
import { scoreName, savePrefs } from '../ui/ui.js';
import { sfx } from '../core/audio.js';
import { music } from '../core/music.js';
import { soundtrack } from '../core/soundtrack.js';
import { makeLabel } from '../fx/models.js';
import { Targeting } from './targeting.js';
import { Scanner } from './scanner.js';
import { Finale } from './finale.js';
import { TowerTrip } from '../fx/towerCup.js';
import { stats, trailParticle } from './stats.js';
import { XanaFinale } from './xanaFinale.js';
import { characterByColor } from './characters.js';
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
    this.ghosts.onTrail = (p, color, r, id) => this.trail(p, color, r, this.players.get(id)?.trail);
    this.effects = new EffectManager(this);
    this.sendTimer = 0;
    this.simTime = 0;
    this.aim = null; // {sx, sy, power}
    this.spaceCharge = null;
    this.rotating = false;
    this.targeting = null;
    this.fallId = 0;
    this.trip = null;
    this.preShot = null;
    this.spectate = null;
    this.lastBeep = 99;
    this.disposers = [];
    this.emotes = [];
    this.lastEmote = 0;
    this.makeAimLine();

    link.onMessage = (m) => this.onMessage(m);
    link.onClose = () => this.app.onDisconnect();
    link.send({ t: 'join', name: me.name, color: me.color, token: app.token, trail: app.ui.prefs.trail || 'default' });
    this.bindInput();
    this.ui.on({
      use: (i) => this.useSlot(i),
      discard: (i) => this.discardSlot(i),
      toggleCam: () => this.cycleView(),
      spectate: () => this.cycleSpectate(),
      cancelTarget: () => this.cancelTargeting(),
      start: () => this.link.send({ t: 'start', intro: this.app.ui.prefs.intro !== false }),
      trail: (k) => this.link.send({ t: 'trail', trail: k }),
      settings: (s) => this.link.send({ t: 'settings', settings: s }),
      pick: (color) => this.link.send({ t: 'pick', color }),
      skip: () => this.link.send({ t: 'skip' }),
      unstick: () => this.unstick(),
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
    if (this.playoff && this.strokes >= 1) return false;
    if (this.possessing) return !this.flyover && this.phase === 'hole' && !this.targeting && this.cam.mode === 'chase' && !this.ui.overlayOpen;
    if (this.possessedBy || this.ball?.frozen) return false;
    return !this.flyover && this.phase === 'hole' && this.ball && this.ball.state === 'idle' && !this.effects.locked && !this.targeting && this.cam.mode === 'chase' && !this.ui.overlayOpen && !this.falling;
  }

  // ---------- network ----------
  onMessage(m) {
    switch (m.t) {
      case 'track':
        soundtrack.receive(m);
        break;
      case 'welcome':
        this.myId = m.you;
        this.code = m.code;
        this.me.color = m.color;
        break;
      case 'lobby': {
        this.lobby = m;
        for (const p of m.players) this.upsertPlayer(p);
        const mine = m.players.find((p) => p.id === this.myId);
        if (mine) this.me.color = mine.color;
        if (this.phase === 'connecting' || this.phase === 'lobby' || (this.phase === 'final' && m.phase === 'lobby')) {
          this.phase = 'lobby';
          if (!m.solo) this.ui.showLobby(m, this.myId);
          else if (m.phase === 'lobby') this.link.send({ t: 'start', intro: this.app.ui.prefs.intro !== false });
        }
        break;
      }
      case 'reject':
        this.app.leave(m.reason);
        break;
      case 'matchStart':
        this.inventory = [];
        this.plan = m.plan;
        if (m.intro) {
          this.ui.setScreen('');
          this.app.startIntro({ players: m.players || [...this.players.values()], firstHole: m.plan[0], isHost: this.isHost, onSkip: () => this.link.send({ t: 'skipIntro' }) });
        } else this.ui.showVS(m.players || [...this.players.values()]);
        break;
      case 'hole':
        this.app.endIntro();
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
        const it = this.pickups?.take(m.pid, this.simTime);
        if (it) this.effects.burst(it.pos, it.cat);
        if (m.by === this.myId && m.pu) this.addPowerup(m.pu, 'pickup');
        break;
      }
      case 'respawn': {
        const it = this.pickups?.respawn(m.pid, m.cat, this.simTime);
        if (it) this.effects.burst(it.pos, it.cat);
        break;
      }
      case 'fx':
        this.effects.apply(m);
        break;
      case 'xanaAttack':
        this.effects.xanaAttack(m);
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
        if (m.id !== this.myId) {
          this.ui.feed(`${p?.name} holed out in ${m.strokes}${m.hio ? ' — HOLE IN ONE!' : ''}`);
          if (this.course) this.cupCelebration(p?.color || '#ffffff', true, this.course.nearestCup(this.ghosts.lastPos(m.id)));
        }
        break;
      }
      case 'emote':
        this.showEmote(m.id, m.e);
        break;
      case 'feed':
        this.ui.feed(m.text);
        break;
      case 'possessShot':
        this.onPossessShot(m);
        break;
      case 'rejoined':
        this.ui.feed(`${m.name} reconnected`);
        break;
      case 'resume':
        // we reconnected mid-hole: keep the strokes we already had
        if (this.ball && this.phase === 'hole') {
          this.strokes = m.strokes || 0;
          this.ui.setStrokes(this.strokes, this.def.par);
          if (m.holed) {
            this.ball.state = 'holed';
            this.ball.mesh.visible = false;
            this.ball.body.setEnabled(false);
            this.ui.setHint('You already holed out · <kbd>Tab</kbd> to spectate');
          }
          this.ui.toast('Reconnected — welcome back!');
        }
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
      case 'final': {
        this.phase = 'final';
        this.teardownHole();
        this.ui.hideHud();
        this.ui.setScreen('');
        const winners = m.winnerId ? m.standings.filter((p) => p.id === m.winnerId) : m.standings.slice(0, 1);
        stats.add('matches');
        if (winners[0]?.id === this.myId) { stats.add('wins'); if (characterByColor(this.me.color)?.id === 'xana') stats.add('xanaWins'); }
        if ((m.plan?.length ?? 0) >= 54) stats.add('worldcups');
        // XANA won: the catastrophic ending instead of the tower being saved
        const xanaWins = characterByColor(winners[0]?.color)?.id === 'xana';
        const show = () => {
          this.finale = null;
          this.app.showBackdrop();
          this.ui.showScoreboard({ players: m.standings, plan: m.plan, holeNo: m.plan.length - 1, myId: this.myId, final: true, isHost: this.isHost, tiebreak: m.tiebreak, xana: xanaWins });
        };
        this.app.hideBackdrop();
        music.play(xanaWins ? 'xana' : 'finale');
        const F = xanaWins ? XanaFinale : Finale;
        this.finale = new F(this.app, winners, () => { music.play('menu'); show(); });
        break;
      }
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
    for (const c of this.celebrations || []) this.scene.remove(c.g);
    this.celebrations = [];
    for (const em of this.emotes) this.scene.remove(em.s);
    this.emotes = [];
    if (this.virt) { this.scene.remove(this.virt.g); this.virt = null; }
    if (this.targeting) { this.targeting.dispose(); this.targeting = null; }
    this.endTrip(true);
    if (this.towerTrip) { this.towerTrip.dispose(); this.towerTrip = null; }
    if (this.scanner) { this.scanner.dispose(); this.scanner = null; }
    this.preShot = null;
    this.clearMarkers();
    this.effects.clear();
    this.ghosts.clear();
    if (this.course) { this.course.dispose(); this.course = null; }
    if (this.ball) { this.ball.dispose(); this.ball = null; }
    if (this.physics) { this.physics.dispose(); this.physics = null; }
    this.pickups = null;
    this.aimGroup.visible = false;
    if (this.iceBlock) { this.scene.remove(this.iceBlock); this.iceBlock = null; }
    this.possessing = null; this.possessedBy = null; this.possessQueued = null;
    this.ui.setPossessing?.(null);
  }

  loadHole(m) {
    this.teardownHole();
    this.app.hideBackdrop();
    const def = HOLES[m.index];
    this.def = def;
    this.holeMsg = m;
    this.phase = 'hole';
    this.playoff = m.playoff || null;
    this.playoffSent = false;
    for (const p of m.players) this.upsertPlayer(p);
    this.physics = new Physics();
    this.course = buildCourse(def, this.physics, this.scene);
    this.renderer.applyTheme(def.sector, this.course);
    music.play(def.sector);
    this.ball = new Ball(this.physics, this.scene, this.me.color);
    this.ball.onEvent = (type, data) => this.onBallEvent(type, data);
    this.course.localBall = this.ball;
    this.course.camera = this.cam.camera;
    this.course.onShake = (k) => { this.cam.shake = Math.max(this.cam.shake, k); };
    this.course.onMonsterHit = (kind, dmg) => this.onMonsterHit(kind, dmg);
    this.course.onMegatank = () => this.ui.comms.say('megatank', {}, { force: true });
    this.ball.place(this.course.tee.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
    this.ball.teleportCooldown = 0;
    this.strokes = 0;
    this.lp = 100; // Lyoko life points, refilled every hole
    this.ui.setLP(100);
    this.shotInProgress = false;
    this.falling = false;
    this.spectate = null;
    this.holeStartLocal = performance.now() - m.elapsed;
    this.duration = m.duration;
    this.simTime = m.elapsed / 1000;
    this.cam.mode = 'chase';
    this.cam.view = VIEWS.includes(this.app.ui.prefs.camView) ? this.app.ui.prefs.camView : 'chase';
    this.ui.setCamButton(this.cam.view);
    this.cam.yaw = def.yaw ?? Math.atan2(this.course.cup.x - this.course.tee.x, this.course.cup.z - this.course.tee.z);
    this.cam.pitch = 0.32; this.cam.dist = 3.4;
    this.cam.snapTo(this.ball.mesh.position);
    this.cam.setOverhead(this.course);
    this.effects.reset(this.course, this.physics, this.scene);
    this.pickups = new Pickups(this.course, m.seed, m.pickupCount, m.taken, m.cats);
    this.env = this.makeEnv();
    for (const p of this.players.values()) if (p.id !== this.myId && p.connected !== false) this.ghosts.ensure(p);
    this.ui.showHud({ holeNo: m.holeNo, total: m.total, name: def.name, par: def.par, sectorName: SECTOR_NAMES[def.sector] });
    {
      const prev = this.plan?.[m.holeNo - 1] !== undefined ? HOLES[this.plan[m.holeNo - 1]] : null;
      setTimeout(() => {
        if (!prev || prev.sector !== def.sector) this.ui.comms.say('courseStart', { sector: SECTOR_NAMES[def.sector] }, { force: true });
        else if (Math.random() < 0.35) this.ui.comms.say('holeStart');
      }, 2600);
    }
    this.ui.renderInventory(this.inventory);
    this.ui.setHostControls(this.isHost && !this.lobby?.solo);
    this.ui.setStrokes(0, def.par);
    this.ui.setStatus([]);
    if (this.playoff) {
      const shooting = this.playoff.shooters.includes(this.myId);
      this.ui.banner('SUDDEN DEATH', shooting ? `One shot · closest to the pin wins · ${def.name}` : `Tiebreak: ${this.playoff.shooters.map((id) => this.nameOf(id)).join(' vs ')}`);
      if (!shooting) { this.ball.state = 'holed'; this.ball.mesh.visible = false; this.ball.body.setEnabled(false); }
    } else {
      // a new course starts: big title card
      const plan = this.plan || [m.index];
      const prev = m.holeNo > 0 ? HOLES[plan[m.holeNo - 1]] : null;
      if (!prev || prev.sector !== def.sector) {
        const starts = plan.filter((hi, i) => i === 0 || HOLES[plan[i - 1]].sector !== HOLES[hi].sector).length;
        const n = plan.slice(0, m.holeNo + 1).filter((hi, i) => i === 0 || HOLES[plan[i - 1]].sector !== HOLES[hi].sector).length;
        const holes = plan.filter((hi) => HOLES[hi].sector === def.sector).length;
        if (plan.length > 1) this.ui.courseCard(n, starts, SECTOR_NAMES[def.sector], holes);
      }
      const inCourse = plan.slice(0, m.holeNo + 1).reverse().findIndex((hi) => HOLES[hi].sector !== def.sector);
      const k = inCourse < 0 ? m.holeNo + 1 : inCourse;
      this.ui.banner(`HOLE ${k} · ${def.name}`, `${SECTOR_NAMES[def.sector]} · Par ${def.par}`);
    }
    this.playersDirty = true;
    this.lastBeep = 99;
    this.virtualize(this.ball.mesh.position);
    // a short flyover from the cup back to the tee so everyone can read the layout
    this.flyover = m.elapsed < 4000 ? { t: 0, dur: 3.2 } : null;
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
    if (mine?.timeout && this.phase === 'hole') { sfx.play('buzzer'); stats.add('holes'); }
    this.phase = 'between';
    music.play('menu');
    this.teardownHole();
    this.app.showBackdrop();
    this.ui.showScoreboard({ players: m.players, plan: m.plan, holeNo: m.holeNo, results: m.results, myId: this.myId, final: false, isHost: this.isHost });
    // shot of the hole: the best score (an ace beats everything)
    const done = (m.results || []).filter((r) => !r.timeout && r.score > 0);
    if (done.length >= 2) {
      const best = Math.min(...done.map((r) => r.score));
      const who = done.filter((r) => r.score === best).map((r) => this.nameOf(r.id));
      const par = HOLES[m.plan[m.holeNo]]?.par ?? 3;
      this.ui.bigToast('🏅 SHOT OF THE HOLE', `${who.join(' & ')} · ${best === 1 ? 'HOLE IN ONE' : scoreName(best, par)}`, 'good');
    }
  }

  // ---------- ball events ----------
  onBallEvent(type, data) {
    if (type === 'wall') sfx.play('wall', data.strength);
    else if (type === 'bumper') { sfx.play('bumper'); data.bumper.hitT = this.simTime + 0.25; }
    else if (type === 'stick') sfx.play('stick');
    else if (type === 'vent') sfx.play('whoosh');
    else if (type === 'warp') { sfx.play('teleport'); this.cam.snapTo(this.ball.mesh.position); }
    else if (type === 'lava') { this.ui.toast('🌋 Into the lava!'); this.lavaFall = true; this.ui.comms.say('lava'); }
    else if (type === 'grabbed') { sfx.play('teleport'); this.ui.bigToast('SCYPHOZOA!', 'grabbed your ball and dropped it back', 'bad'); this.cam.snapTo(this.ball.mesh.position); }
    else if (type === 'sinkStart') { sfx.play('cup'); this.cupCelebration(this.me.color, false, this.ball?.sinkCup); }
    else if (type === 'rest') this.onRest();
  }

  /** Playoff: report how close your one shot finished. */
  sendPlayoff(holed) {
    if (!this.playoff || this.playoffSent || this.strokes < 1) return;
    this.playoffSent = true;
    const p = this.ball.pos, c = this.course.nearestCup(p);
    this.link.send({ t: 'playoffShot', dist: holed ? 0 : Math.hypot(p.x - c.x, p.z - c.z) });
  }

  onRest() {
    if (this.course) this.course.restAt = this.simTime;
    this.sendPlayoff(false);
    if (this.shotInProgress) {
      this.shotInProgress = false;
      this.effects.onShotEnd();
    }
  }

  onHoled() {
    if (this.shotInProgress) { this.shotInProgress = false; this.effects.onShotEnd(); }
    // Fortune cups add or take strokes (never below 1)
    const mod = this.ball.sinkCup?.mod;
    this.rawStrokes = this.strokes;
    if (mod) {
      this.strokes = Math.max(1, this.strokes + mod);
      this.ui.setStrokes(this.strokes, this.def.par);
      this.ui.bigToast(mod < 0 ? `🍀 ${mod} STROKE${mod < -1 ? 'S' : ''}` : `💸 +${mod} STROKE${mod > 1 ? 'S' : ''}`, `the cup says ${mod > 0 ? '+' : ''}${mod}`, mod < 0 ? 'good' : 'bad');
    }
    const name = scoreName(this.strokes, this.def.par);
    this.ui.stamp(name, `${this.strokes} stroke${this.strokes === 1 ? '' : 's'}`, this.strokes <= this.def.par ? 'good' : '');
    if (this.rawStrokes === 1) this.aceFireworks();
    if (this.rawStrokes === 1) { sfx.play('hio'); this.stat('hio'); }
    // lifetime stats (achievements)
    stats.add('holes'); stats.add('towers'); stats.add('strokes', this.strokes);
    if (this.rawStrokes === 1) stats.add('aces');
    if (this.strokes <= this.def.par - 3) stats.add('under3');
    if ((this.lp ?? 100) <= 10) stats.add('survivor');
    if (mod < 0) stats.add('fortuneWon', -mod);
    if (this.preShot) { const c = this.ball.sinkCup || this.course.cup; stats.max('longest', Math.hypot(this.preShot.pos.x - c.x, this.preShot.pos.z - c.z)); }
    if (this.rawStrokes === 1) this.ui.comms.say('ace', {}, { force: true });
    else if (this.strokes < this.def.par) this.ui.comms.say('birdie', {}, { force: true });
    else if (this.strokes >= this.def.par + 2) this.ui.comms.say('bogey');
    if (this.strokes < this.def.par || this.strokes === 1) this.confetti(this.strokes === 1 ? 160 : 70);
    this.endTrip(true);
    if (this.playoff) this.sendPlayoff(true);
    else this.link.send({ t: 'holed', strokes: this.strokes });
    const me = this.players.get(this.myId);
    if (me) { me.holed = true; me.strokes = this.strokes; }
    this.playersDirty = true;
    this.sendState(true);
    this.ui.setHint('You\'re in! Keep using power-ups on the others · <kbd>Tab</kbd> to spectate');
    // down the hole and into the tower, to deactivate it
    if (!this.playoff) this.towerTrip = new TowerTrip(this, this.ball.sinkCup || this.course.cup, this.me.color);
  }

  /** Glowing dotted trail behind fast balls (yours and the ghosts'). */
  trail(p, color, r, style = 'default') {
    this.effects.particles?.spawn(trailParticle(style, p, color, r, this.simTime ?? 0));
  }

  /** Rings in the player's colour rise out of the cup, sparkles burst, the flag spins. */
  cupCelebration(color, isGhost, at = null) {
    const c = at || this.course.cup;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 36), mat);
      r.rotation.x = Math.PI / 2;
      g.add(r);
    }
    g.position.set(c.x, c.y, c.z);
    this.scene.add(g);
    (this.celebrations ||= []).push({ g, mat, t: 0 });
    for (let i = 0; i < (isGhost ? 20 : 40); i++) {
      const a = Math.random() * Math.PI * 2;
      this.effects.particles?.spawn({ pos: [c.x, c.y + 0.1, c.z], vel: [Math.cos(a) * 1.6, 2 + Math.random() * 3, Math.sin(a) * 1.6], color: i % 2 ? color : '#ffffff', size: 0.14, life: 1.1, gravity: 2 });
    }
    this.course.towerFor(this.course.nearestCup(c))?.userData.flash(this.simTime);
    if (!isGhost) this.cam.dist = Math.max(2.2, this.cam.dist * 0.75);
  }

  updateCelebrations(dt) {
    if (!this.celebrations) return;
    for (const c of this.celebrations) {
      c.t += dt;
      c.g.children.forEach((r, i) => {
        const k = Math.max(0, c.t - i * 0.12);
        r.position.y = k * 1.8;
        r.scale.setScalar(1 + k * 0.8);
      });
      c.mat.opacity = Math.min(c.maxOp ?? 0.9, Math.max(0, 0.9 - c.t * 0.6));
    }
    this.celebrations = this.celebrations.filter((c) => { if (c.t > 1.6) { this.scene.remove(c.g); return false; } return true; });
  }

  /** Hole-in-one: a tower-style pillar of light and fireworks over the cup. */
  aceFireworks() {
    const c = this.ball?.sinkCup || this.course.cup;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 16, 32, 1, true), new THREE.MeshBasicMaterial({ color: this.me.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    pillar.position.set(c.x, c.y + 7, c.z);
    this.scene.add(pillar);
    (this.celebrations ||= []).push({ g: pillar, mat: pillar.material, t: -1.2, maxOp: 0.28 });
    for (let burst = 0; burst < 5; burst++) {
      setTimeout(() => {
        if (!this.course) return;
        const h = 3 + Math.random() * 3, ox = (Math.random() - 0.5) * 3, oz = (Math.random() - 0.5) * 3;
        const cols = ['#ffd24d', '#ff4dc4', '#4dfff3', this.me.color, '#ffffff'];
        for (let i = 0; i < 50; i++) {
          const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = 3 + Math.random() * 2;
          this.effects.particles?.spawn({ pos: [c.x + ox, c.y + h, c.z + oz], vel: [Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s], color: cols[burst % cols.length], size: 0.2, life: 1.4, gravity: 3, drag: 0.8 });
        }
        sfx.play('bumper');
      }, burst * 260);
    }
  }

  confetti(n) {
    const c = this.ball?.sinkCup || this.course.cup;
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

  stat(k, n = 1) { this.link.send({ t: 'stat', k, n }); }

  /** While Triplicate clones are still rolling, losing the main ball isn't final yet. */
  mainLostDuringTrip() {
    if (!this.trip || !this.trip.clones.some((c) => !c.dead && !c.holed)) return false;
    this.trip.mainDead = true;
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.ball.mesh.visible = false;
    return true;
  }

  onFall() {
    if (this.falling) return;
    if (this.mainLostDuringTrip()) return;
    if (!this.lavaFall) this.ui.comms.say('fall');
    this.lavaFall = false;
    this.falling = true;
    const fid = ++this.fallId;
    this.stat('falls');
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.addStrokes(1);
    sfx.play('splash');
    this.ui.bigToast('SPLASH!', 'Lost in the Digital Sea · +1', 'bad');
    this.sendState(true);
    const ball = this.ball;
    setTimeout(() => {
      if (this.ball !== ball || fid !== this.fallId) return;
      this.falling = false;
      this.ball.respawnAtSafe();
      this.cam.snapTo(this.ball.mesh.position);
      this.onRest();
    }, 1000);
  }

  onSwallowed(b = this.ball) {
    if (b !== this.ball) { b.dead = true; b.state = 'gone'; b.body.setEnabled(false); b.mesh.visible = false; return; }
    if (this.falling) return;
    if (this.mainLostDuringTrip()) return;
    this.falling = true;
    const fid = ++this.fallId;
    this.stat('swallowed');
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.ball.mesh.visible = false;
    this.addStrokes(1);
    sfx.play('teleport');
    this.ui.bigToast('🕳️ SWALLOWED', 'Black hole · +1', 'bad');
    const ball = this.ball;
    setTimeout(() => {
      if (this.ball !== ball || fid !== this.fallId) return;
      this.falling = false;
      this.ball.respawnAtSafe();
      this.cam.snapTo(this.ball.mesh.position);
      this.onRest();
    }, 900);
  }

  onPit(pit) {
    if (this.falling) return;
    if (!pit.fortune) return this.onFall();
    if (this.mainLostDuringTrip()) return;
    this.falling = true;
    const fid = ++this.fallId;
    this.ball.state = 'gone';
    this.ball.body.setEnabled(false);
    this.ball.mesh.visible = false;
    this.cancelAim();
    // weighted fortune: small penalties are more common, rare jackpot
    const r = Math.random();
    const v = r < 0.04 ? 0 : r < 0.32 ? 1 : r < 0.56 ? 2 : r < 0.76 ? 3 : r < 0.9 ? 4 : 5;
    const ball = this.ball;
    this.ui.roulette(v, () => {
      if (this.ball !== ball || fid !== this.fallId) return;
      this.addStrokes(v);
      this.stat('fortune', v);
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
    if (this.possessing) { // XANA Possession: this shot is fired on the victim's ball
      const yaw = this.cam.yaw + this.currentWobble(power);
      this.link.send({ t: 'possessShot', target: this.possessing.target, yaw, power });
      this.ui.bigToast('👁️ XANA strikes', `you shot ${this.nameOf(this.possessing.target)}'s ball`, 'good');
      this.endPossessing();
      return;
    }
    this.fireShot(this.cam.yaw + this.currentWobble(power), power);
  }

  /** Fire my ball at an exact yaw/power (my own shot, or one XANA took for me). */
  fireShot(yaw, power) {
    this.cam.aerial.off.set(0, 0, 0);
    this.addStrokes(1);
    const p0 = this.ball.pos;
    this.preShot = { pos: new THREE.Vector3(p0.x, p0.y + 0.02, p0.z), safe: this.ball.lastSafe.clone() };
    const opts = this.effects.onShoot();
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.ball.shoot(dir, power * opts.powerMul, { chip: opts.chip });
    if (opts.glide) this.ball.startGlide(2.5);
    if (opts.fly) this.ball.startFly(8);
    if (opts.triplicate) this.spawnClones(yaw, power * opts.powerMul, opts.chip);
    this.shotInProgress = true;
    sfx.play('putt', power);
    this.sendState(true);
  }

  // ---------- Triplicate ----------
  spawnClones(yaw, power, chip) {
    const from = this.preShot.pos;
    const clones = [];
    for (const off of [-0.21, 0.21]) {
      const c = new Ball(this.physics, this.scene, this.me.color);
      c.material.transparent = true;
      c.material.opacity = 0.65;
      c.setRadius(this.ball.radius);
      Object.assign(c.mods, { ...this.ball.mods, leash: null });
      c.place(from, { safe: false });
      c.onEvent = (type, data) => { if (type === 'wall') sfx.play('wall', data.strength); };
      c.shoot(new THREE.Vector3(Math.sin(yaw + off), 0, Math.cos(yaw + off)), power, { chip });
      clones.push(c);
    }
    const env = Object.create(this.env);
    env.onHole = (b) => { b.holed = true; };
    env.onFall = (b) => { b.dead = true; b.state = 'gone'; b.body.setEnabled(false); b.mesh.visible = false; };
    env.onPit = (b) => env.onFall(b);
    this.trip = { clones, env, mainDead: false };
  }

  stepClones(dt, phase) {
    if (!this.trip) return;
    for (const c of this.trip.clones) {
      if (c.dead || c.holed) continue;
      if (phase === 'pre') c.preStep(dt, this.trip.env);
      else { c.postStep(dt, this.trip.env); c.syncMesh(dt); }
    }
    if (phase === 'post') this.checkTrip();
  }

  /** When every ball has settled: a clone in the cup wins, else the one closest to the cup is kept. */
  checkTrip() {
    const t = this.trip;
    const main = this.ball;
    if (main.state === 'sinking' || main.state === 'holed') return this.endTrip(true);
    const mainSettled = t.mainDead || main.state === 'idle';
    if (!mainSettled || t.clones.some((c) => !c.dead && !c.holed && c.state !== 'idle')) return;
    const winner = t.clones.find((c) => c.holed);
    const cup = winner?.sinkCup || this.course.cup;
    if (winner) {
      this.endTrip(true);
      main.place(new THREE.Vector3(cup.x, cup.y + main.radius, cup.z), { safe: false });
      main.startSink(cup);
      return;
    }
    const cands = t.clones.filter((c) => !c.dead).map((c) => ({ b: c, p: c.pos }));
    if (!t.mainDead) cands.push({ b: main, p: main.pos });
    if (!cands.length) {
      this.endTrip(true);
      main.state = 'moving';
      return this.onFall(); // every ball fell: normal penalty
    }
    cands.sort((a, b) => Math.hypot(a.p.x - cup.x, a.p.z - cup.z) - Math.hypot(b.p.x - cup.x, b.p.z - cup.z));
    const best = cands[0];
    if (best.b !== main) {
      const p = best.p;
      main.place(new THREE.Vector3(p.x, p.y, p.z));
      this.cam.snapTo(main.mesh.position);
      this.ui.toast('🔱 The best of three is kept');
    }
    this.endTrip(true);
    this.onRest();
  }

  endTrip() {
    if (!this.trip) return;
    for (const c of this.trip.clones) c.dispose();
    this.trip = null;
  }

  // ---------- XANA's monsters ----------
  onMonsterHit(kind, dmg = 20) {
    const e = this.effects;
    if (['venom', 'freeze', 'xanafy', 'shark'].includes(kind)) this.ui.comms.say(kind);
    if (kind !== 'vaporize') this.damageLP(dmg);
    switch (kind) {
      case 'venom':
        e.pending.venom = true; e.applyBallMods();
        this.ui.toast('🟢 Hornet venom: your next shot is weaker and shakier');
        sfx.play('debuff');
        break;
      case 'freeze':
        this.freezeBall(3, 'ice', 'a Blok');
        break;
      case 'xanafy':
        e.pending.xanafied = true; e.applyBallMods();
        this.ui.bigToast('🔴 XANA-FIED', 'the Scyphozoa scrambled your controls for one shot', 'bad');
        sfx.play('debuff');
        break;
      case 'vaporize':
        this.lp = 0;
        this.ui.setLP(0, 100);
        this.vaporize();
        break;
      case 'shark':
        this.ui.toast('🦈 Rammed by a Shark!');
        sfx.play('wall', 4);
        break;
      default:
        sfx.play('wall', 3);
    }
  }

  /** Lyoko life points: monster hits cost the show's values; at 0 you're devirtualized. */
  damageLP(dmg) {
    if (!this.ball || this.ball.state === 'holed' || this.falling) return;
    const before = this.lp ?? 100;
    this.lp = Math.max(0, before - dmg);
    this.ui.setLP(this.lp, dmg);
    if (this.lp <= 0) {
      this.ui.bigToast('💥 DEVIRTUALIZED', 'your life points hit zero · +1 stroke', 'bad');
      this.vaporize(true);
    } else if (this.lp <= 30 && before > 30) {
      this.ui.toast('⚠️ Life points low! One more hit and you\'re devirtualized');
      this.ui.comms.say('lowLP', {}, { force: true });
      sfx.play('beep');
    } else this.ui.comms.say('hit', { lp: this.lp });
  }

  healLP(n) {
    this.lp = Math.min(100, (this.lp ?? 100) + n);
    this.ui.setLP(this.lp, -n);
  }

  /** The Megatank's beam: the ball is vaporized, +1 stroke, back to the last safe spot. */
  vaporize(quiet = false) {
    const b = this.ball;
    if (b && b.state !== 'holed') { this.ui.comms.say('vaporized', {}, { force: true }); stats.add('devirt'); }
    if (!b || b.state === 'holed' || b.state === 'sinking' || this.falling) return;
    this.endTrip();
    const fid = ++this.fallId;
    this.falling = true;
    const p = b.mesh.position.clone();
    for (let i = 0; i < 70; i++) {
      this.effects.particles?.spawn({ pos: [p.x + (Math.random() - 0.5) * 0.3, p.y + Math.random() * 0.3, p.z + (Math.random() - 0.5) * 0.3], vel: [(Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3], color: i % 3 ? '#ff3b1f' : '#ffd0c0', size: 0.13, life: 1.1, gravity: 1 });
    }
    b.state = 'gone';
    b.body.setEnabled(false);
    b.mesh.visible = false;
    if (this.shotInProgress) { this.shotInProgress = false; this.effects.onShotEnd(); }
    this.cancelAim();
    this.addStrokes(1);
    this.stat('vaporized');
    sfx.play('splash');
    if (!quiet) this.ui.bigToast('☢️ VAPORIZED', 'XANA devirtualized your ball · +1 stroke', 'bad');
    this.sendState(true);
    setTimeout(() => {
      if (this.ball !== b || fid !== this.fallId) return;
      this.falling = false;
      b.respawnAtSafe();
      this.lp = 100;
      this.ui.setLP(100);
      this.cam.snapTo(b.mesh.position);
      this.virtualize(b.mesh.position);
      this.onRest();
    }, 1000);
  }

  // ---------- Freeze / Lyoko Guardian ----------
  freezeBall(secs, kind, fromName) {
    const b = this.ball;
    if (!b || b.state === 'holed' || b.state === 'sinking') return;
    this.cancelAim();
    b.frozen = true;
    this.frozenUntil = performance.now() + secs * 1000;
    if (this.iceBlock) this.scene.remove(this.iceBlock);
    const g = new THREE.Group();
    if (kind === 'guardian') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.35, roughness: 0.1, transmission: 0.4, depthWrite: false })));
      for (let i = 0; i < 2; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.015, 6, 40), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
        r.rotation.x = Math.PI / 2 + i * 0.9;
        g.add(r);
      }
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshPhysicalMaterial({ color: '#bfeaff', transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false })));
    }
    g.userData.kind = kind;
    this.iceBlock = g;
    this.scene.add(g);
    sfx.play('debuff');
    this.ui.bigToast(kind === 'guardian' ? '🔮 TRAPPED IN A GUARDIAN' : '🧊 FROZEN', `${fromName} · ${secs} s`, 'bad');
  }

  unfreeze() {
    if (!this.ball?.frozen) return;
    this.ball.frozen = false;
    this.frozenUntil = 0;
    if (this.iceBlock) {
      const p = this.iceBlock.position;
      for (let i = 0; i < 30; i++) this.effects.particles?.spawn({ pos: [p.x, p.y, p.z], vel: [(Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3], color: this.iceBlock.userData.kind === 'guardian' ? '#ffffff' : '#bfeaff', size: 0.12, life: 0.8, gravity: 6 });
      this.scene.remove(this.iceBlock);
      this.iceBlock = null;
    }
    sfx.play('stick');
  }

  updateFrozen(t) {
    if (!this.iceBlock) return;
    this.iceBlock.position.copy(this.ball.mesh.position);
    this.iceBlock.rotation.y = this.iceBlock.userData.kind === 'guardian' ? t * 1.5 : 0;
    if (performance.now() > this.frozenUntil) this.unfreeze();
  }

  // ---------- Telekinesis ----------
  nudgeBall(pos) {
    const b = this.ball;
    if (!b || b.state !== 'idle' || !pos) return;
    const p = b.pos;
    const dx = pos[0] - p.x, dz = pos[2] - p.z, d = Math.hypot(dx, dz);
    const k = d > 1.5 ? 1.5 / d : 1;
    const x = p.x + dx * k, z = p.z + dz * k;
    const y = this.course.floorYAt(x, z);
    if (y === null) return this.ui.toast('🌀 Telekinesis needs solid ground');
    b.place(new THREE.Vector3(x, y + b.radius + 0.02, z));
    this.cam.snapTo(b.mesh.position);
    sfx.play('teleport');
    this.ui.toast('🌀 Telekinesis');
    this.sendState(true);
  }

  // ---------- XANA Possession ----------
  /** I'm XANA: aim from my victim's ball and take their next shot. */
  startPossessing(target) {
    this.cancelAim();
    this.possessing = { target, until: performance.now() + 15000, yaw0: this.cam.yaw };
    this.ui.setPossessing?.(this.nameOf(target));
    this.ui.bigToast('👁️ YOU ARE XANA', `aim and shoot for ${this.nameOf(target)} · 15 s`, 'good');
  }

  endPossessing() {
    if (!this.possessing) return;
    this.possessing = null;
    this.ui.setPossessing?.(null);
  }

  /** XANA has my ball: I can't shoot until it fires (or 15 s pass and it fires at random). */
  becomePossessed(from, fromName) {
    this.cancelAim();
    this.possessedBy = from;
    this.possessedUntil = performance.now() + 15500;
    this.ui.bigToast('👁️ POSSESSED', `${fromName} controls your ball`, 'bad');
    sfx.play('debuff');
  }

  endPossessed() {
    this.possessedBy = null;
    this.possessedUntil = 0;
    delete this.effects.pending.possession;
    this.effects.applyBallMods();
  }

  /** XANA's shot arrives (or time ran out): fire it on my ball as soon as it's still. */
  onPossessShot(m) {
    if (!this.possessedBy || !this.ball || this.ball.state === 'holed') return;
    this.possessQueued = m;
  }

  updatePossession() {
    if (this.possessing && performance.now() > this.possessing.until) { this.endPossessing(); this.ui.toast('👁️ Possession over'); }
    if (!this.possessedBy) return;
    const b = this.ball;
    if (!b || b.state === 'holed' || b.state === 'sinking') return this.endPossessed();
    if (!this.possessQueued && performance.now() > this.possessedUntil) {
      this.possessQueued = { yaw: Math.random() * Math.PI * 2, power: 0.3 + Math.random() * 0.5, random: true };
    }
    if (this.possessQueued && b.state === 'idle' && !this.falling && !b.frozen) {
      const q = this.possessQueued;
      this.possessQueued = null;
      this.endPossessed();
      this.cam.yaw = q.yaw;
      this.fireShot(q.yaw, Math.max(0.05, Math.min(1, q.power)));
      this.ui.bigToast('👁️ XANA SHOT FOR YOU', q.random ? 'nobody aimed… it went somewhere' : 'hope you like where it went', 'bad');
    }
  }

  // ---------- Return to the Past / Devirtualize ----------
  undoShot() {
    const b = this.ball;
    if (!b || b.state === 'holed' || b.state === 'sinking') return;
    if (!this.preShot) return this.ui.toast('Nothing to undo yet');
    this.endTrip();
    this.fallId++;
    this.falling = false;
    this.ui.closeOverlay();
    b.place(this.preShot.pos, { safe: false });
    b.lastSafe.copy(this.preShot.safe);
    if (this.shotInProgress) { this.shotInProgress = false; this.effects.onShotEnd(); }
    this.cam.snapTo(b.mesh.position);
    this.ui.flash();
    this.ui.bigToast('⏪ RETURN TO THE PAST', 'your last shot never happened (the stroke did)', 'good');
    sfx.play('teleport');
    this.sendState(true);
  }

  devirtualize(fromName) {
    const b = this.ball;
    if (!b || b.state === 'holed' || b.state === 'sinking') return;
    this.endTrip();
    const fid = ++this.fallId;
    this.falling = true;
    const p = b.mesh.position.clone();
    for (let i = 0; i < 60; i++) {
      this.effects.particles?.spawn({ pos: [p.x + (Math.random() - 0.5) * 0.4, p.y + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.4], vel: [(Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2], color: Math.random() < 0.5 ? this.me.color : '#9fe8ff', size: 0.12, life: 1.2, gravity: 1 });
    }
    b.state = 'gone';
    b.body.setEnabled(false);
    b.mesh.visible = false;
    if (this.shotInProgress) { this.shotInProgress = false; this.effects.onShotEnd(); }
    this.cancelAim();
    sfx.play('debuff');
    this.ui.bigToast('💥 DEVIRTUALIZED', `${fromName} sent you back to the tee`, 'bad');
    this.sendState(true);
    setTimeout(() => {
      if (this.ball !== b || fid !== this.fallId) return;
      this.falling = false;
      b.place(this.course.tee.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
      this.cam.snapTo(b.mesh.position);
      this.virtualize(b.mesh.position);
    }, 900);
  }

  /** The sway the aim line is showing right now (the shot uses exactly this). */
  currentWobble(power) {
    const t = performance.now() / 1000;
    let w = aimWobble(t, power, this.effects.has('steady'));
    if (this.effects.has('venom')) w *= 2;
    if (!this.effects.has('stun')) return w;
    // stunned: a big lurching sway on top
    return w * 4 + Math.sin(t * 5.3) * 0.25 + Math.sin(t * 11.7 + 2) * 0.12;
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
    const consume = () => { this.inventory.splice(i, 1); this.ui.renderInventory(this.inventory); sfx.play('use'); stats.add('powerups'); };
    if ((def.kind === 'self' || def.kind === 'aura' || def.needSelf) && !myActive) return this.ui.toast('Your ball is already in the cup');
    if (id === 'returnpast' && !this.preShot) return this.ui.toast('Nothing to undo yet — take a shot first');
    if (id === 'firewall' && this.effects.shield) return this.ui.toast('Your Firewall is already up');
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
    if (def.aim) { this.cancelAim(); this.startTargeting(id, i); return; }
    consume();
    this.link.send({ t: 'use', pu: id, params: {} });
  }

  // ---------- aerial targeting ----------
  startTargeting(id, slot) {
    if (this.targeting) this.targeting.dispose();
    this.targeting = new Targeting(this, id, slot);
  }

  finishTargeting(params) {
    const t = this.targeting;
    if (!t) return;
    if (t.id === 'arrow') { const p = this.ball.pos; params = { ...params, from: [p.x, p.y, p.z] }; }
    if (t.id === 'telekinesis') {
      const p = this.ball.pos, q = params.pos;
      if (!q || this.ball.state !== 'idle' || Math.hypot(q[0] - p.x, q[2] - p.z) > 1.6) { this.ui.toast('🌀 Pick a spot within reach of your resting ball'); return; }
    }
    if (this.inventory[t.slot] === t.id) {
      this.inventory.splice(t.slot, 1);
      this.ui.renderInventory(this.inventory);
      sfx.play('use');
      this.link.send({ t: 'use', pu: t.id, params });
    }
    this.cancelTargeting();
  }

  cancelTargeting() {
    if (!this.targeting) return;
    this.targeting.dispose();
    this.targeting = null;
  }

  /** Camera button / C: chase → first person → aerial. */
  cycleView() {
    if (this.targeting) return;
    if (this.cam.mode === 'tactical') this.cam.mode = 'chase';
    const v = this.cam.cycleView();
    this.app.ui.prefs.camView = v;
    savePrefs(this.app.ui.prefs);
    this.ui.setCamButton(v);
    this.ui.toast(`${VIEW_INFO[v].icon} ${VIEW_INFO[v].name}`);
  }

  /** Free map view (power-up targeting uses it). */
  toggleOverhead() {
    if (this.targeting) return;
    if (this.cam.mode === 'tactical') this.cam.mode = 'chase';
    else { this.cancelAim(); this.cam.resetTactical(); this.cam.mode = 'tactical'; }
  }

  /** Big rings + names over every ball while in the aerial view. */
  updateMarkers(t) {
    const show = this.cam.mode === 'tactical' || (this.cam.view === 'aerial' && this.cam.aerial.h > 12);
    if (!this.markers) this.markers = new Map();
    const want = new Map();
    if (show) {
      if (this.ball && this.ball.state !== 'holed') want.set(this.myId, { p: this.ball.mesh.position, color: this.me.color, name: 'YOU' });
      for (const id of this.ghosts.map.keys()) {
        const pos = this.ghosts.position(id);
        if (pos) want.set(id, { p: pos, color: this.players.get(id)?.color || '#fff', name: null });
      }
    }
    for (const [id, m] of this.markers) if (!want.has(id)) { this.scene.remove(m.ring); if (m.label) this.scene.remove(m.label); this.markers.delete(id); }
    for (const [id, w] of want) {
      let m = this.markers.get(id);
      if (!m) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 40), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 19;
        this.scene.add(ring);
        let label = null;
        if (w.name) { label = makeLabel(w.name, w.color); this.scene.add(label); }
        m = { ring, label };
        this.markers.set(id, m);
      }
      const s = 1 + 0.25 * Math.sin(t * 5);
      m.ring.scale.setScalar(s * Math.max(1, (this.cam.mode === 'tactical' ? this.cam.tac.height : this.cam.aerial.h) / 18));
      m.ring.position.set(w.p.x, w.p.y - 0.15, w.p.z);
      if (m.label) m.label.position.set(w.p.x, w.p.y + 0.6, w.p.z);
    }
  }

  clearMarkers() {
    if (!this.markers) return;
    for (const m of this.markers.values()) { this.scene.remove(m.ring); if (m.label) this.scene.remove(m.label); }
    this.markers.clear();
  }

  // ---------- input ----------
  bindInput() {
    const inp = this.input;
    const tactical = () => this.cam.mode === 'tactical';
    this.disposers.push(inp.on('pointerdown', (e) => {
      sfx.unlock();
      if (this.phase !== 'hole') return;
      if (this.flyover) { this.flyover.t = this.flyover.dur; return; }
      if (inp.pointers.size >= 2) {
        this.cancelAim();
        this.rotating = true;
        if (this.targeting) this.targeting.dragging = false;
        this.pinch = this.pinchDist();
        return;
      }
      if (this.targeting && e.button === 0) { this.targeting.down(e); return; }
      if (e.button === 2) this.rightDown = { x: e.clientX, y: e.clientY };
      if (e.button === 0 && this.canShoot()) {
        this.aim = { sx: e.clientX, sy: e.clientY, power: 0 };
      } else if (e.button === 0 || e.button === 2 || e.button === 1) {
        this.rotating = true;
      }
    }));
    this.disposers.push(inp.on('pointermove', (e, p) => {
      if (this.targeting && this.course && inp.pointers.size < 2 && !(p && p.button === 2)) this.targeting.move(e);
      if (!p) return;
      const ts = this.effects.timeScale();
      if (inp.pointers.size >= 2 && tactical()) {
        const d = this.pinchDist();
        if (this.pinch && d) this.cam.tacZoom(this.pinch / d);
        this.pinch = d;
        this.cam.pan((p.dx || 0) * 0.5, (p.dy || 0) * 0.5);
        return;
      }
      if (inp.pointers.size >= 2 && this.cam.view === 'aerial') {
        const d = this.pinchDist();
        if (this.pinch && d) this.cam.aerialZoom(this.pinch / d);
        this.pinch = d;
        this.cam.aerialPan((p.dx || 0) * 0.5, (p.dy || 0) * 0.5);
        return;
      }
      const inv = this.effects.has('xanafied') ? 1 : -1; // XANA flips your controls
      if (this.aim) {
        if (!this.canShoot()) { this.cancelAim(); return; }
        // full power always arrives before the screen edge, wherever you pressed (phones!)
        const h = window.innerHeight;
        const room = inv > 0 ? this.aim.sy : h - this.aim.sy; // Possession flips it: drag up
        const range = Math.max(70, Math.min(220, h * 0.22, room * 0.8));
        let pw = (e.clientY - this.aim.sy) / range;
        if (inv > 0) pw = -pw;
        if (this.effects.has('stun')) pw += Math.sin(performance.now() / 95) * 0.3; // the bar won't sit still
        this.aim.power = Math.max(0, Math.min(1, pw));
        this.cam.rotate(inv * (p.dx || 0) * 0.0022 * ts);
        this.ui.setPower(this.aim.power);
      } else if (this.rotating) {
        if (tactical()) this.cam.pan(p.dx || 0, p.dy || 0);
        else if (this.cam.view === 'aerial') this.cam.aerialPan(p.dx || 0, p.dy || 0);
        else {
          this.cam.rotate(inv * (p.dx || 0) * 0.006 * ts);
          this.cam.tilt((p.dy || 0) * 0.004 * ts);
        }
      }
    }));
    this.disposers.push(inp.on('pointerup', (e) => {
      if (this.targeting && e.button === 0 && inp.pointers.size === 0) this.targeting.up(e);
      if (e.button === 2 && this.rightDown && this.targeting) {
        // a right click without dragging cancels targeting (the item is kept)
        if (Math.hypot(e.clientX - this.rightDown.x, e.clientY - this.rightDown.y) < 6) this.cancelTargeting();
      }
      this.rightDown = null;
      if (this.aim) {
        const pw = this.aim.power;
        this.cancelAim();
        if (pw > 0.03) this.shoot(pw);
      }
      if (inp.pointers.size === 0) { this.rotating = false; this.pinch = null; }
    }));
    this.disposers.push(inp.on('wheel', (e) => {
      if (tactical()) this.cam.tacZoom(e.deltaY > 0 ? 1.12 : 0.89);
      else if (this.cam.view === 'aerial') this.cam.aerialZoom(e.deltaY > 0 ? 1.12 : 0.89);
      else this.cam.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    }));
    this.disposers.push(inp.on('keydown', (e) => this.onKey(e)));
    this.disposers.push(inp.on('keyup', (e) => {
      if (e.code === 'Space' && this.spaceCharge) {
        const pw = this.spaceCharge.power;
        this.cancelAim();
        if (pw > 0.03) this.shoot(pw);
      }
    }));
  }

  pinchDist() {
    const pts = [...this.input.pointers.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : null;
  }

  onKey(e) {
    sfx.unlock();
    if (this.flyover && this.phase === 'hole') { this.flyover.t = this.flyover.dur; return; }
    if (e.code === 'KeyH') return this.ui.toggleHelp();
    if (e.code === 'KeyM') return this.app.toggleMute();
    if (e.code === 'Escape') {
      if (this.targeting) return this.cancelTargeting();
      if (this.possessing) { this.endPossessing(); return this.ui.toast('👁️ You let go'); }
      if (this.cam.mode === 'tactical') { this.cam.mode = 'chase'; return; }
      if (this.ui.overlayOpen && !this.effects.locked && !this.falling) return this.ui.closeOverlay();
      if (this.aim || this.spaceCharge) return this.cancelAim();
      return this.ui.toggleSettings();
    }
    if (this.phase !== 'hole') return;
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (digit !== undefined) return e.shiftKey ? this.discardSlot(digit) : this.useSlot(digit);
    if (e.code === 'KeyC') return this.cycleView();
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

  /** Safety net: a ball that has barely moved for a while but still isn't shootable. */
  watchStuck(dt) {
    const b = this.ball;
    const p = b.pos;
    if (b.state !== 'moving' || this.falling) { this.stuck = null; this.ui.showUnstick(false); return; }
    const s = this.stuck || (this.stuck = { x: p.x, z: p.z, t: 0 });
    if (Math.hypot(p.x - s.x, p.z - s.z) > 0.5) { s.x = p.x; s.z = p.z; s.t = 0; this.ui.showUnstick(false); return; }
    s.t += dt;
    if (s.t > 5) this.ui.showUnstick(true);
  }

  unstick() {
    if (!this.ball || this.ball.state !== 'moving') return;
    this.stuck = null;
    this.ui.showUnstick(false);
    this.ball.respawnAtSafe();
    this.cam.snapTo?.(this.ball.mesh.position);
    sfx.play('teleport');
    this.ui.toast('Ball reset to its last safe spot');
    this.onRest();
  }

  // ---------- per-frame ----------
  /** Jérémie warns you when a monster is right next to your ball. */
  watchMonsters(dt) {
    this.monsterCheckT = (this.monsterCheckT ?? 0) - dt;
    if (this.monsterCheckT > 0 || !this.ball || this.ball.state === 'holed' || !this.course) return;
    this.monsterCheckT = 1;
    const p = this.ball.pos;
    let best = null, bd = 4.5;
    for (const m of this.course.monsters) {
      if (!m.guns?.length && m.spec.type !== 'megatank') continue;
      const q = m.model?.position;
      if (!q || m.slashed) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd && Math.abs(q.y - p.y) < 4) { bd = d; best = m; }
    }
    if (best) this.ui.comms.say('monsterNear', { monster: best.spec.type[0].toUpperCase() + best.spec.type.slice(1) });
  }

  frame(dt) {
    this.watchMonsters(dt);
    if (this.phase !== 'hole' || !this.course) return;
    const ts = this.effects.timeScale();
    // keyboard camera
    const k = this.input;
    const lr = (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0) - (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0);
    const ud = (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0) - (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0);
    if (this.cam.mode === 'tactical') {
      if (lr || ud) this.cam.pan(-lr * dt * 700, -ud * dt * 700);
      const qe = (k.down('KeyQ') ? 1 : 0) - (k.down('KeyE') ? 1 : 0);
      if (qe) this.cam.tacRotate(qe * dt * 1.5);
    } else {
      const inv = this.effects.has('xanafied') ? -1 : 1;
      if (lr) this.cam.rotate(inv * lr * dt * (k.down('ShiftLeft') ? 0.4 : 1.6) * ts);
      if (ud) this.cam.tilt(ud * dt * 0.8);
    }
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

    this.watchStuck(dt);
    this.course.aiming = !!(this.aim || this.spaceCharge);
    this.updateFrozen(this.simTime);
    this.updatePossession();

    // visuals
    this.ball.syncMesh(dt * ts);
    const bv = this.ball.vel;
    if ((this.ball.state === 'moving') && Math.hypot(bv.x, bv.y, bv.z) > 2.5) this.trail(this.ball.mesh.position, this.me.color, this.ball.radius, this.app.ui.prefs.trail);
    this.course.frame(this.simTime, dt);
    this.effects.frame(this.simTime, dt);
    this.pickups.frame(this.simTime);
    this.ghosts.update(dt);
    this.updateCamera(dt);
    this.updateAimLine();
    this.updateScanner();
    this.updateEmotes(dt);
    this.updateCelebrations(dt);
    this.updateMarkers(this.simTime);
    this.course.tactical = this.cam.mode === 'tactical';
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
    if (!this.targeting) {
      if (this.cam.mode === 'tactical') this.ui.setHint('Aerial view · drag/WASD pan · wheel zoom · Q/E rotate · <kbd>C</kbd> back');
      else if (this.ball.state === 'idle' && !this.aim && this.strokes === 0) this.ui.setHint('Drag down to set power · sideways to aim · release to putt');
      else if (this.ball.state !== 'holed' && this.strokes > 0) this.ui.setHint('');
    }

    // network
    this.sendTimer += dt;
    if (this.sendTimer >= SEND_INTERVAL) { this.sendTimer = 0; this.sendState(); }
    if (this.playersDirty) { this.playersDirty = false; this.renderPlayers(); }
    this.chipTimer = (this.chipTimer || 0) + dt;
    if (this.chipTimer > 0.25) { this.chipTimer = 0; this.ui.setChips(this.effects.chips(this.simTime)); }
  }

  step(dt) {
    const ball = this.ball;
    this.course.update(this.simTime, dt);
    this.effects.update(this.simTime);
    ball.preStep(dt, this.env);
    this.stepClones(dt, 'pre');
    this.physics.step();
    ball.postStep(dt, this.env);
    this.stepClones(dt, 'post');
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
    if (this.towerTrip) {
      if (this.towerTrip.frame(dt)) return;
      this.towerTrip = null;
      this.cam.snapTo(this.ball?.mesh.position || this.cam.target);
    }
    if (this.flyover) {
      const f = this.flyover;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      const k = u * u * (3 - 2 * u);
      const cup = new THREE.Vector3(this.course.cup.x, this.course.cup.y, this.course.cup.z);
      const ball = this.ball.mesh.position;
      const d = this.cam.dir;
      const from = cup.clone().addScaledVector(d, 4).add(new THREE.Vector3(0, 6, 0));
      const to = ball.clone().addScaledVector(d, -Math.cos(this.cam.pitch) * this.cam.dist).add(new THREE.Vector3(0, Math.sin(this.cam.pitch) * this.cam.dist + 0.25, 0));
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, Math.max(this.course.size.x, this.course.size.z) * 0.45, 0));
      const pos = from.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(mid, 2 * k * (1 - k)).addScaledVector(to, k * k);
      const look = cup.clone().lerp(ball.clone().addScaledVector(d, 1.6), k);
      this.renderer.camera.position.copy(pos);
      this.renderer.camera.lookAt(look);
      if (u >= 1) { this.flyover = null; this.cam.snapTo(ball); }
      return;
    }
    let target = this.ball.mesh.position;
    const victim = this.possessing && this.ghosts.position(this.possessing.target);
    if (victim) target = victim;
    else if (this.ball.state === 'holed') {
      const sp = this.spectate && this.ghosts.position(this.spectate);
      if (sp) target = sp;
      else { const c = this.ball.sinkCup || this.course.cup; target = new THREE.Vector3(c.x, c.y + 0.2, c.z); }
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
      s: this.falling || this.trip?.mainDead ? 'gone' : this.ball.state, k: this.strokes, g: this.ball.mods.ghost ? 1 : 0,
      cl: this.trip ? this.trip.clones.filter((c) => !c.dead && !c.holed).map((c) => { const q = c.pos; return [r3(q.x), r3(q.y), r3(q.z)]; }) : undefined,
    });
    const me = this.players.get(this.myId);
    if (me && me.strokes !== this.strokes) { me.strokes = this.strokes; this.playersDirty = true; }
  }

  /** Live leaderboard: rank, score against par so far, and strokes on this hole. */
  renderPlayers() {
    const plan = this.plan || [];
    const list = [...this.players.values()].filter((p) => p.connected !== false).map((p) => {
      const sc = p.scores || [];
      let total = 0, par = 0;
      sc.forEach((s, i) => { if (s !== null && s !== undefined) { total += s; par += HOLES[plan[i]]?.par ?? 0; } });
      return { ...p, total, toPar: total - par };
    }).sort((a, b) => a.toPar - b.toPar || a.total - b.total);
    let rank = 0, prev = null;
    list.forEach((p, i) => { if (p.toPar !== prev) { rank = i + 1; prev = p.toPar; } p.rank = rank; });
    this.ui.renderPlayers(list, this.myId);
  }

  updateScanner() {
    const pw = this.aim?.power ?? this.spaceCharge?.power ?? 0;
    const on = this.effects.has('scanner') && this.ball.state === 'idle' && this.cam.mode === 'chase' && !this.targeting && pw > 0.03;
    if (!on) { this.scanner?.hide(); return; }
    this.scanner ||= new Scanner(this.def, this.scene);
    const m = this.ball.mods;
    this.scanner.update(this.ball.pos, this.cam.yaw, pw, this.simTime,
      { radius: this.ball.radius, speedMul: m.speedMul, decelMul: m.decelMul, sticky: m.sticky, magnet: m.magnet, ghost: m.ghost, chip: this.effects.has('chip'), powerMul: this.effects.has('leash') ? 0.5 : 1 },
      { decelMul: this.env.decelMul, stickyWalls: this.env.stickyWalls, bumpers: this.env.bumpers });
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
    const show = this.ball && this.ball.state === 'idle' && this.cam.mode === 'chase' && !this.targeting;
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
    if (this.finale) { const f = this.finale; this.finale = null; f.onDone = () => {}; f.finish(); }
    this.teardownHole();
    for (const d of this.disposers) d();
    this.scene.remove(this.aimGroup);
    this.link.onMessage = () => {};
    this.link.onClose = () => {};
  }
}
