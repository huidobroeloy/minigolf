import { HOLES, buildPlan } from '../holes/index.js';
import { introDuration } from '../game/intro.js';
import { randomSeed, RNG } from '../core/rng.js';
import { signedArea } from '../course/geometry.js';
import { POWERUPS, pickPowerup, pickupCategories, CATEGORY_WEIGHTS } from '../powerups/registry.js';

import { CHARACTER_COLORS, characterByColor } from '../game/characters.js';

export const COLORS = CHARACTER_COLORS; // one per character: Ulrich, Odd, Yumi, Aelita, William, Jérémie, Franz Hopper, XANA
export const MAX_PLAYERS = 8;
const BETWEEN_HOLES_MS = 8000;
const ALL_HOLED_GRACE_MS = 3800; // long enough for the last ball's trip into the tower
const RESPAWN_EVERY_MS = 25000;
const PROTECT_MS = 12000;
const HOSTILE_WINDOW_MS = 20000; // at most 2 targeted attacks on one player in this window
const PLAYOFF_MS = 45000;

/**
 * Rank players with golf-style tiebreaks: total strokes, then countback (last 3 holes, then the
 * last hole), then most holes-in-one. Returns the ordered list, the rule that separated the
 * leader (or null), and the ids still tied for first (more than one → sudden-death playoff).
 */
export function rankStandings(list) {
  const key = (p) => {
    const s = p.scores.map((x) => x ?? 0);
    return { total: p.total, last3: s.slice(-3).reduce((a, b) => a + b, 0), last: s[s.length - 1] ?? 0, aces: p.stats?.hio || 0 };
  };
  const keyed = list.map((p) => ({ p, k: key(p) }));
  const STAGES = [
    ['total', (a, b) => a.total - b.total, null],
    ['last3', (a, b) => a.last3 - b.last3, 'Countback · last 3 holes'],
    ['last', (a, b) => a.last - b.last, 'Countback · last hole'],
    ['aces', (a, b) => b.aces - a.aces, 'Most holes-in-one'],
  ];
  keyed.sort((x, y) => { for (const [, cmp] of STAGES) { const d = cmp(x.k, y.k); if (d) return d; } return 0; });
  let rule = null;
  let tied = keyed.filter((x) => x.k.total === keyed[0].k.total);
  for (const [, cmp, label] of STAGES.slice(1)) {
    if (tied.length < 2) break;
    const next = tied.filter((x) => cmp(x.k, tied[0].k) === 0);
    if (next.length < tied.length) rule = label;
    tied = next;
  }
  return { ordered: keyed.map((x) => x.p), rule, tiedIds: tied.length > 1 ? tied.map((x) => x.p.id) : [] };
}

export const PU_LEVELS = { off: 0, few: 0.6, normal: 1, chaos: 1.7 };

/** Pickups for a hole: more players and bigger holes → more pickups; the host picks the level. */
export function pickupCount(def, players, level) {
  const mul = PU_LEVELS[level] ?? 1;
  if (!mul) return 0;
  let area = 0;
  for (const p of def.parts) if (p.t === 'floor') area += Math.abs(signedArea(p.poly));
  const size = Math.max(0.6, Math.min(1.5, area / 120));
  return Math.max(2, Math.min(12, Math.round((2 + 0.8 * players) * size * mul)));
}

// Running out of time: max(par, strokes) plus 1 per TIMEOUT_UNIT of track still left to the cup
// (at least 1, at most TIMEOUT_CAP). Shots under par are free and every shot that gets you closer
// lowers the penalty, so it always pays to keep playing until the clock runs out.
export const TIMEOUT_UNIT = 6;
export const TIMEOUT_CAP = 8;

/** Track left from p ([x, y, z]) to the cup: along the hole's route (lane, old tee, cup) when it has one. */
export function trackLeft(def, p) {
  const cups = [def.cup, ...(def.cups || [])];
  const straight = Math.min(...cups.map((c) => Math.hypot(p[0] - c[0], p[2] - c[2])));
  const r = def.route;
  if (!r || r.length < 2) return straight;
  const seg = (i) => Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
  let best = Infinity, bi = 0, bk = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const dx = r[i + 1][0] - r[i][0], dz = r[i + 1][1] - r[i][1], L2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((p[0] - r[i][0]) * dx + (p[2] - r[i][1]) * dz) / L2));
    const d = Math.hypot(p[0] - r[i][0] - dx * k, p[2] - r[i][1] - dz * k);
    if (d < best) { best = d; bi = i; bk = k; }
  }
  let rest = best + seg(bi) * (1 - bk);
  for (let i = bi + 1; i < r.length - 1; i++) rest += seg(i);
  return rest; // the route ends at the cup
}

/** Score for a player still out when the clock runs out (pos: their ball, or null if unknown). */
export function timeoutScore(def, strokes, pos) {
  const base = Math.max(def.par, strokes);
  if (!pos) return base + TIMEOUT_CAP;
  return base + Math.min(TIMEOUT_CAP, Math.max(1, Math.ceil(trackLeft(def, pos) / TIMEOUT_UNIT)));
}

/**
 * Host-authoritative room. Runs in the host's browser (or locally for solo play).
 * Clients simulate their own balls; the room owns the hole order, timer, pickups, effects routing and scores.
 */
export class HostRoom {
  constructor(code, { solo = false } = {}) {
    this.possess = new Map(); // victim id → { by, until }
    this.code = code;
    this.solo = solo;
    this.links = new Map();       // id -> send(msg)
    this.players = new Map();     // id -> player record
    this.phase = 'lobby';         // lobby | hole | between | final
    this.settings = { course: 'cup3', timeMul: 1, puLevel: 'normal', puSet: 'all', mode: 'ffa' }; // mode: ffa | teams | elim · puSet: all | lyoko
    this.plan = [];
    this.holeNo = -1;
    this.timer = setInterval(() => this.tick(), 200);
  }

  // ---------- connections ----------
  addClient(id, send) { this.links.set(id, send); }

  // ---------- the host's soundtrack, streamed to friends ----------
  /** The host loaded (or changed) its own music: keep the chunks and send them to everyone. */
  setTracks(msgs) {
    this.tracks = msgs;
    this.trackGen = (this.trackGen || 0) + 1;
    for (const id of this.links.keys()) if (id !== 'host' && id !== 'solo') this.streamTracks(id);
  }

  /** Paced so the music never crowds out the game's own messages (about 2 MB/s). */
  streamTracks(id) {
    const msgs = this.tracks;
    if (!msgs?.length) return;
    const gen = this.trackGen;
    let i = 0;
    const pump = () => {
      if (gen !== this.trackGen || !this.links.has(id) || this.disposed) return;
      for (let k = 0; k < 8 && i < msgs.length; k++) this.sendTo(id, msgs[i++]);
      if (i < msgs.length) setTimeout(pump, 45);
    };
    setTimeout(pump, 500);
  }

  removeClient(id) {
    this.links.delete(id);
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') this.players.delete(id);
    else p.connected = false;
    this.broadcast({ t: 'left', id, name: p.name });
    this.broadcastLobby();
  }

  sendTo(id, msg) { this.links.get(id)?.(msg); }

  broadcast(msg, except = null) {
    for (const [id, send] of this.links) if (id !== except) send(msg);
  }

  playerList() {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, host: p.host, connected: p.connected, trail: p.trail || 'default', team: p.team || null, out: !!p.out,
      scores: p.scores, total: p.scores.reduce((a, b) => a + (b ?? 0), 0), holed: p.holed, strokes: p.strokes, stats: p.stats || {}, specialUsed: p.specialUsed || null, lp: p.lp ?? 100,
    }));
  }

  broadcastLobby() {
    this.broadcast({ t: 'lobby', code: this.code, phase: this.phase, settings: this.settings, players: this.playerList(), solo: this.solo });
  }

  // ---------- message handling ----------
  handle(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    const p = this.players.get(id);
    switch (msg.t) {
      case 'join': return this.onJoin(id, msg);
      case 'settings':
        if (p?.host && this.phase === 'lobby') { Object.assign(this.settings, msg.settings); this.broadcastLobby(); }
        return;
      case 'team':
        // Teams mode: Lyoko Warriors or XANA's side (whoever plays XANA is always on XANA's side)
        if (!p || (this.phase !== 'lobby' && this.phase !== 'final') || !['lyoko', 'xana'].includes(msg.team)) return;
        if (characterByColor(p.color)?.id === 'xana') return;
        p.team = msg.team; p.teamPicked = true;
        this.broadcastLobby();
        return;
      case 'trail':
        if (p && typeof msg.trail === 'string') { p.trail = msg.trail.slice(0, 16); this.broadcastLobby(); }
        return;
      case 'pick': {
        // change character in the lobby (one player per character)
        if (!p || (this.phase !== 'lobby' && this.phase !== 'final')) return;
        if (!COLORS.includes(msg.color)) return;
        const used = [...this.players.values()].some((q) => q.id !== id && q.color === msg.color);
        if (!used) {
          if (characterByColor(p.color)?.id === 'xana' && characterByColor(msg.color)?.id !== 'xana') { p.team = null; p.teamPicked = false; }
          p.color = msg.color;
        }
        this.broadcastLobby();
        return;
      }
      case 'start':
        if (p?.host && (this.phase === 'lobby' || this.phase === 'final')) this.startMatch({ intro: msg.intro !== false });
        return;
      case 'skipIntro':
        if (p?.host && this.phase === 'intro') { clearTimeout(this.introTimer); this.nextHole(); }
        return;
      case 'skip':
        if (p?.host && this.phase === 'hole') this.endHole();
        else if (p?.host && this.phase === 'between') this.nextHole();
        return;
      case 'st':
        if (!p) return;
        p.strokes = msg.k ?? p.strokes;
        p.pos = msg.p;
        if (typeof msg.lp === 'number') p.lp = Math.max(0, Math.min(100, msg.lp));
        this.broadcast({ ...msg, id }, id);
        return;
      case 'possessShot': {
        // XANA's shot for a possessed player: only the one who possessed them, only once
        const ps = this.possess.get(msg.target);
        if (!p || !ps || ps.by !== id || performance.now() > ps.until) return;
        this.possess.delete(msg.target);
        this.sendTo(msg.target, { t: 'possessShot', from: id, yaw: Number(msg.yaw) || 0, power: Math.max(0.03, Math.min(1, Number(msg.power) || 0)) });
        return;
      }
      case 'playoffShot':
        if (!p || !this.playoff || !this.playoff.shooters.includes(id) || id in this.playoff.results) return;
        this.playoff.results[id] = Math.max(0, Number(msg.dist) || 0);
        this.broadcast({ t: 'feed', text: `${p.name}: ${this.playoff.results[id] === 0 ? 'IN THE HOLE!' : this.playoff.results[id].toFixed(2) + ' from the pin'}` });
        if (this.playoff.shooters.every((s) => s in this.playoff.results)) this.resolvePlayoff();
        return;
      case 'holed':
        if (this.playoff) return;
        if (!p || this.phase !== 'hole' || p.holed) return;
        p.holed = true;
        p.strokes = msg.strokes;
        p.scores[this.holeNo] = msg.strokes;
        this.broadcast({ t: 'holed', id, strokes: msg.strokes, hio: msg.strokes === 1 });
        if (this.playing().every((q) => q.holed)) this.allHoledAt = performance.now();
        return;
      case 'claim': {
        if (!p || this.phase !== 'hole') return;
        const pk = this.pickups[msg.pid];
        if (!pk || pk.taken) return;
        pk.taken = id;
        const pu = pickPowerup(pk.cat, this.rankFactor(id), Math.random, this.settings.puSet);
        this.stat(id, 'pickups');
        this.broadcast({ t: 'picked', pid: msg.pid, by: id, pu });
        return;
      }
      case 'use': {
        if (!p) return;
        if (this.phase !== 'hole') { this.sendTo(id, { t: 'refund', pu: msg.pu, special: !!msg.special, reason: 'Too late — the hole is over' }); return; }
        const def = POWERUPS[msg.pu];
        if (!def) return;
        const fx = { t: 'fx', pu: msg.pu, from: id, target: msg.target ?? null, params: msg.params ?? {}, seed: randomSeed(), at: this.elapsed() };
        if (def.kind === 'one') {
          const tgt = this.players.get(msg.target);
          const now = performance.now();
          if (tgt) tgt.hits = (tgt.hits || []).filter((h) => now - h < HOSTILE_WINDOW_MS);
          if (tgt && msg.pu !== 'steal' && (now < (tgt.protectedUntil || 0) || tgt.hits.length >= 2)) {
            this.sendTo(id, { t: 'refund', pu: msg.pu, special: !!msg.special, reason: `${tgt.name} was just hit — protected for a moment` });
            return;
          }
          if (tgt) { tgt.protectedUntil = now + PROTECT_MS; tgt.hits.push(now); this.stat(tgt.id, 'targeted'); }
          if (tgt && msg.pu === 'possession') this.possess.set(tgt.id, { by: id, until: now + 17000 });
        }
        // black holes and bumpers can't be dropped on top of a tee or a ball (that's how traps happen)
        if ((msg.pu === 'blackhole' || msg.pu === 'bumper') && Array.isArray(fx.params.pos)) {
          const [x, , z] = fx.params.pos;
          const tee = HOLES[this.plan[this.holeNo]].tee;
          const clear = msg.pu === 'blackhole' ? 3.2 : 1.2;
          const near = (q) => q && Math.hypot(q[0] - x, q[2] - z) < clear;
          const blocked = near(tee) || [...this.players.values()].some((q) => !q.holed && near(q.pos));
          if (blocked) { this.sendTo(id, { t: 'refund', pu: msg.pu, special: !!msg.special, reason: 'Too close to a ball or the tee — place it somewhere else' }); return; }
        }
        this.stat(id, 'used');
        // a character's special is once per course: the room remembers which course it was used on
        if (msg.special && !this.playoff) p.specialUsed = HOLES[this.plan[this.holeNo]]?.sector ?? null;
        if (msg.pu === 'switch') {
          const tgt = this.players.get(msg.target);
          if (!tgt || tgt.holed || p.holed || !tgt.pos || !p.pos) { this.sendTo(id, { t: 'refund', pu: msg.pu, special: !!msg.special, reason: 'Switch failed: target unavailable' }); return; }
          fx.params = { a: p.pos, b: tgt.pos };
        }
        this.broadcast(fx);
        return;
      }
      case 'specialBack':
        // the client couldn't carry out its special after all (e.g. Telekinesis lost its footing)
        if (p) p.specialUsed = null;
        return;
      case 'reflect': {
        // a Firewall bounced an effect: send it back at the original sender, once
        const f = msg.fx;
        if (!p || !f || f.reflected || this.phase !== 'hole' || !POWERUPS[f.pu]) return;
        if (f.pu === 'switch') return;
        if (f.pu === 'possession') this.possess.set(f.from, { by: id, until: performance.now() + 17000 });
        this.broadcast({ ...f, t: 'fx', from: id, target: f.from, reflected: true, seed: randomSeed(), at: this.elapsed() });
        return;
      }
      case 'stat':
        if (p && typeof msg.k === 'string') this.stat(id, msg.k, Number(msg.n) || 1);
        return;
      case 'give':
        // response to a steal: forward the stolen item (or nothing) to the thief
        this.sendTo(msg.to, { t: 'gift', pu: msg.pu, from: id });
        return;
      case 'emote':
        this.broadcast({ t: 'emote', id, e: String(msg.e).slice(0, 8) });
        return;
    }
  }

  onJoin(id, msg) {
    if (this.players.has(id)) return;
    const token = typeof msg.token === 'string' ? msg.token.slice(0, 48) : null;
    const old = token && [...this.players.values()].find((p) => p.token === token && p.id !== id);
    if (old) return this.rejoin(old, id);
    if (this.players.size >= MAX_PLAYERS) { this.sendTo(id, { t: 'reject', reason: 'Room is full (8 players)' }); return; }
    const used = new Set([...this.players.values()].map((p) => p.color));
    let color = msg.color && COLORS.includes(msg.color) && !used.has(msg.color) ? msg.color : COLORS.find((c) => !used.has(c)) || COLORS[0];
    const name = String(msg.name || 'Player').slice(0, 16);
    const isHost = this.players.size === 0;
    const scores = this.plan.map((hi, i) => (i < this.holeNo ? timeoutScore(HOLES[hi], 0, null) : null));
    const trail = typeof msg.trail === 'string' ? msg.trail.slice(0, 16) : 'default';
    this.players.set(id, { id, name, color, host: isHost, connected: true, scores, holed: false, strokes: 0, pos: null, token, trail });
    this.sendTo(id, { t: 'welcome', you: id, code: this.code, color });
    this.broadcastLobby();
    if (id !== 'host' && id !== 'solo') this.streamTracks(id);
    if (this.phase === 'hole') this.sendTo(id, this.holeMessage());
    if (this.phase === 'between') this.sendTo(id, { t: 'holeEnd', results: this.lastResults, players: this.playerList(), holeNo: this.holeNo, plan: this.plan });
  }

  /** A player came back (reload, flaky Wi-Fi): same record, same scores, new connection id. */
  rejoin(old, id) {
    const oldId = old.id;
    this.players.delete(oldId);
    this.links.delete(oldId);
    old.id = id;
    old.connected = true;
    this.players.set(id, old);
    for (const pk of this.pickups || []) if (pk.taken === oldId) pk.taken = id;
    this.sendTo(id, { t: 'welcome', you: id, code: this.code, color: old.color });
    this.broadcastLobby();
    if (id !== 'host' && id !== 'solo') this.streamTracks(id);
    this.broadcast({ t: 'rejoined', name: old.name }, id);
    if (this.phase === 'hole') {
      this.sendTo(id, this.holeMessage());
      this.sendTo(id, { t: 'resume', strokes: old.strokes, holed: old.holed });
    } else if (this.phase === 'between') {
      this.sendTo(id, { t: 'holeEnd', results: this.lastResults, players: this.playerList(), holeNo: this.holeNo, plan: this.plan });
    } else if (this.phase === 'final' && this.finalMsg) {
      this.sendTo(id, this.finalMsg);
    }
  }

  stat(id, k, n = 1) {
    const p = this.players.get(id);
    if (!p) return;
    p.stats ||= {};
    p.stats[k] = (p.stats[k] || 0) + n;
  }

  /** 0 = leading … 1 = last (by total so far). Solo: middle of the road. */
  rankFactor(id) {
    const list = this.activePlayers();
    if (list.length < 2) return 0.5;
    const tot = (q) => q.scores.reduce((a, b) => a + (b ?? 0), 0);
    const sorted = [...list].sort((a, b) => tot(a) - tot(b));
    const me = this.players.get(id);
    const better = sorted.filter((q) => tot(q) < tot(me)).length;
    const same = sorted.filter((q) => tot(q) === tot(me)).length;
    return (better + (same - 1) / 2) / (list.length - 1);
  }

  // ---------- match flow ----------
  buildPlan() {
    const s = this.settings.course;
    if (s === 'all') return HOLES.map((_, i) => i);
    return buildPlan(s);
  }

  startMatch({ intro = true } = {}) {
    this.playoff = null;
    this.plan = this.buildPlan();
    this.holeNo = -1;
    for (const p of this.players.values()) { p.scores = this.plan.map(() => null); p.out = false; p.outAt = null; p.specialUsed = null; p.lp = 100; }
    // drop players who left in a previous match
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
    this.endEarly = false;
    this.matchMode = this.mode;
    if (this.matchMode === 'teams') this.assignTeams();
    else for (const p of this.players.values()) p.team = null;
    // the intro (transfer, scanner, virtualization) before hole 1; single-hole practice skips it
    const players = this.playerList();
    const playIntro = intro && !String(this.settings.course).startsWith('hole:');
    const introMs = playIntro ? introDuration(players) : 3600;
    this.broadcast({ t: 'matchStart', plan: this.plan, players, intro: playIntro, introMs });
    this.phase = 'intro';
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => { if (this.phase === 'intro') this.nextHole(); }, introMs);
  }

  activePlayers() { return [...this.players.values()].filter((p) => p.connected); }

  /** Connected and not eliminated. */
  playing() { return this.activePlayers().filter((p) => !p.out); }

  get mode() {
    const m = this.settings.mode || 'ffa';
    if (this.solo) return 'ffa';
    if (m === 'elim' && this.players.size < 3) return 'ffa';
    if (m === 'teams' && this.players.size < 2) return 'ffa';
    return m;
  }

  /** Teams mode: XANA's player joins XANA's side; everyone who didn't choose evens the teams out. */
  assignTeams() {
    const list = [...this.players.values()];
    for (const p of list) {
      if (characterByColor(p.color)?.id === 'xana') { p.team = 'xana'; p.teamPicked = true; }
      else if (!p.teamPicked) p.team = null;
    }
    const count = (t) => list.filter((p) => p.team === t).length;
    for (const p of list) if (!p.team) p.team = count('lyoko') <= count('xana') ? 'lyoko' : 'xana';
    // nobody on one side: move someone who didn't choose
    for (const [empty, full] of [['xana', 'lyoko'], ['lyoko', 'xana']]) {
      if (count(empty) === 0 && list.length >= 2) {
        const mover = list.find((p) => p.team === full && !p.teamPicked) || list.find((p) => p.team === full && characterByColor(p.color)?.id !== 'xana');
        if (mover) mover.team = empty;
      }
    }
  }

  /** Teams ranked by the average total of their members (lower is better). */
  teamResults() {
    const teams = ['lyoko', 'xana'].map((team) => {
      const members = this.playerList().filter((p) => p.team === team);
      const avg = members.length ? members.reduce((a, p) => a + p.total, 0) / members.length : Infinity;
      return { team, avg: Number.isFinite(avg) ? +avg.toFixed(1) : null, members: members.map((p) => p.id), best: Math.min(...members.map((p) => p.total)) };
    }).filter((t) => t.members.length);
    teams.sort((a, b) => (a.avg ?? 1e9) - (b.avg ?? 1e9) || a.best - b.best);
    return teams;
  }

  /** Elimination: after each course, the worst player on that course is devirtualized. */
  eliminate() {
    const sector = HOLES[this.plan[this.holeNo]].sector;
    const nextSector = this.plan[this.holeNo + 1] !== undefined ? HOLES[this.plan[this.holeNo + 1]].sector : null;
    if (nextSector === sector) return null; // the course isn't over yet
    const idx = [];
    for (let i = this.holeNo; i >= 0 && HOLES[this.plan[i]].sector === sector; i--) idx.push(i);
    const alive = this.playerList().filter((p) => !p.out && p.connected);
    if (alive.length < 2) return null;
    // the course subtotal is the score; the usual tiebreaks (countback, aces) pick between equals
    const sub = alive.map((p) => ({ ...p, total: idx.reduce((a, i) => a + (p.scores[i] ?? 0), 0), scores: idx.slice().reverse().map((i) => p.scores[i]) }));
    const { ordered } = rankStandings(sub);
    const loser = this.players.get(ordered[ordered.length - 1].id);
    loser.out = true;
    loser.outAt = this.holeNo;
    this.stat(loser.id, 'eliminated');
    return { id: loser.id, name: loser.name, course: sector, left: alive.length - 1 };
  }

  elapsed() { return performance.now() - this.holeStart; }

  holeMessage() {
    return {
      t: 'hole', holeNo: this.holeNo, total: this.plan.length, index: this.playoff ? this.playoff.index : this.plan[this.holeNo],
      playoff: this.playoff ? { shooters: this.playoff.shooters } : null,
      seed: this.holeSeed, duration: this.duration, elapsed: this.elapsed(),
      pickupCount: this.pickups.length,
      taken: this.pickups.map((p) => p.taken || null),
      cats: this.pickups.map((p) => p.cat),
      players: this.playerList(),
    };
  }

  nextHole() {
    this.holeNo++;
    if (this.holeNo >= this.plan.length || this.endEarly) return this.finish();
    const def = HOLES[this.plan[this.holeNo]];
    // life points carry over from hole to hole; a new course re-virtualizes everyone at full LP
    const prevDef = this.holeNo > 0 ? HOLES[this.plan[this.holeNo - 1]] : null;
    if (!prevDef || prevDef.sector !== def.sector) for (const p of this.players.values()) p.lp = 100;
    this.phase = 'hole';
    this.holeSeed = randomSeed();
    this.duration = Math.round(def.time * 1000 * (this.settings.timeMul || 1));
    this.holeStart = performance.now();
    this.allHoledAt = null;
    const n = pickupCount(def, this.activePlayers().length, this.settings.puLevel);
    const cats = pickupCategories(this.holeSeed, n, RNG);
    this.pickups = cats.map((cat) => ({ taken: null, cat }));
    this.lastRespawn = performance.now();
    for (const p of this.players.values()) { p.holed = false; p.strokes = 0; p.pos = null; }
    // XANA attack: about one hole in three, somewhere between 20% and 55% of the way through
    this.xanaAt = !this.playoff && Math.random() < 0.34 ? this.duration * (0.2 + Math.random() * 0.35) : null;
    this.broadcast(this.holeMessage());
  }

  /** XANA launches an attack on everyone for 20 s (rage, glitched floor, mirror world or a swarm). */
  xanaAttack() {
    this.xanaAt = null;
    const kinds = ['rage', 'glitch', 'mirror', 'swarm'];
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    // the swarm goes after the leader (best total among players still playing)
    let pos = null;
    if (kind === 'swarm') {
      const live = this.playing().filter((q) => !q.holed && q.pos).sort((a, b) => a.scores.reduce((s, v) => s + (v ?? 0), 0) - b.scores.reduce((s, v) => s + (v ?? 0), 0));
      pos = live[0]?.pos ? [live[0].pos[0], live[0].pos[1] - 0.18, live[0].pos[2]] : null;
      if (!pos) kind = 'rage';
    }
    this.broadcast({ t: 'xanaAttack', kind, pos, seed: randomSeed(), at: this.elapsed(), dur: 20000 });
  }

  endHole() {
    if (this.phase !== 'hole') return;
    const def = HOLES[this.plan[this.holeNo]];
    const results = [];
    for (const p of this.players.values()) {
      if (p.out) { results.push({ id: p.id, score: null, out: true }); continue; } // eliminated: no score
      if (!p.holed) {
        this.stat(p.id, 'timeouts');
        p.scores[this.holeNo] = timeoutScore(def, p.strokes, p.pos);
        results.push({ id: p.id, score: p.scores[this.holeNo], timeout: true, left: p.pos ? Math.round(trackLeft(def, p.pos)) : null });
      } else results.push({ id: p.id, score: p.scores[this.holeNo], timeout: false });
    }
    this.phase = 'between';
    this.betweenStart = performance.now();
    this.lastResults = results;
    const eliminated = this.matchMode === 'elim' ? this.eliminate() : null;
    if (eliminated && this.playing().length <= 1) this.endEarly = true;
    this.broadcast({ t: 'holeEnd', results, players: this.playerList(), holeNo: this.holeNo, plan: this.plan, eliminated, mode: this.matchMode });
  }

  respawnPickups() {
    this.lastRespawn = performance.now();
    const taken = this.pickups.map((p, i) => [p, i]).filter(([p]) => p.taken);
    const mul = PU_LEVELS[this.settings.puLevel] ?? 1;
    const n = Math.min(taken.length, Math.max(1, Math.round(Math.ceil(this.activePlayers().length / 2) * mul)));
    const cats = Object.keys(CATEGORY_WEIGHTS);
    for (let k = 0; k < n; k++) {
      const j = Math.floor(Math.random() * taken.length);
      const [pk, i] = taken.splice(j, 1)[0];
      pk.taken = null;
      pk.cat = cats[Math.floor(Math.random() * cats.length)];
      this.broadcast({ t: 'respawn', pid: i, cat: pk.cat });
    }
  }

  /** Standings for the mode: in Elimination the survivors come first, then the rest by how long they lasted. */
  standings() {
    const list = this.playerList();
    if (this.matchMode !== 'elim') return rankStandings(list);
    const alive = list.filter((p) => !p.out);
    const r = rankStandings(alive);
    const out = list.filter((p) => p.out).sort((a, b) => (this.players.get(b.id).outAt ?? -1) - (this.players.get(a.id).outAt ?? -1));
    return { ...r, ordered: [...r.ordered, ...out] };
  }

  finish() {
    if (this.matchMode === 'teams') {
      // the winning side's best player gets the finale; no playoff between teams
      const teams = this.teamResults();
      const { ordered, rule } = rankStandings(this.playerList());
      const winner = ordered.find((p) => p.team === teams[0]?.team) || ordered[0];
      return this.finalize(ordered, winner?.id, rule, teams);
    }
    const { ordered, rule, tiedIds } = this.standings();
    if (tiedIds.length > 1 && !this.solo) return this.startPlayoff(tiedIds);
    this.finalize(ordered, ordered[0]?.id, rule);
  }

  finalize(ordered, winnerId, rule, teams = null) {
    this.phase = 'final';
    this.playoff = null;
    this.finalMsg = { t: 'final', standings: ordered, plan: this.plan, winnerId, tiebreak: rule, teams, mode: this.matchMode };
    this.broadcast(this.finalMsg);
    this.broadcastLobby();
  }

  /** Still tied after every countback: one shot each on a par 3, closest to the pin wins. */
  startPlayoff(ids) {
    const par3 = HOLES.map((h, i) => [h, i]).filter(([h]) => h.par === 3 && !h.cups);
    const [, index] = par3[Math.floor(Math.random() * par3.length)];
    this.playoff = { shooters: ids, results: {}, index, round: (this.playoff?.round || 0) + 1 };
    this.phase = 'hole';
    this.holeSeed = randomSeed();
    this.duration = PLAYOFF_MS;
    this.holeStart = performance.now();
    this.allHoledAt = null;
    this.pickups = [];
    for (const p of this.players.values()) { p.holed = false; p.strokes = 0; p.pos = null; }
    this.broadcast(this.holeMessage());
  }

  resolvePlayoff() {
    const po = this.playoff;
    const dist = (id) => (id in po.results ? po.results[id] : Infinity);
    const best = Math.min(...po.shooters.map(dist));
    const still = po.shooters.filter((id) => dist(id) === best);
    if (still.length > 1 && po.round < 4) return this.startPlayoff(still); // dead heat: go again
    const { ordered } = this.standings();
    const winnerId = still[0];
    const rest = ordered.filter((p) => p.id !== winnerId);
    const winner = ordered.find((p) => p.id === winnerId);
    this.finalize([winner, ...rest], winnerId, 'Sudden death · closest to the pin');
  }

  tick() {
    if (this.phase === 'hole' && this.playoff) {
      if (this.elapsed() >= this.duration || this.activePlayers().every((q) => !this.playoff.shooters.includes(q.id) || q.id in this.playoff.results)) this.resolvePlayoff();
      return;
    }
    if (this.phase === 'hole') {
      if (this.pickups.length && performance.now() - this.lastRespawn > RESPAWN_EVERY_MS) this.respawnPickups();
      if (this.xanaAt !== null && this.xanaAt !== undefined && this.elapsed() >= this.xanaAt && !this.allHoledAt) this.xanaAttack();
      if (this.elapsed() >= this.duration) this.endHole();
      else if (this.allHoledAt && performance.now() - this.allHoledAt > ALL_HOLED_GRACE_MS) this.endHole();
      else if (this.playing().length === 0) this.endHole();
    } else if (this.phase === 'between') {
      if (performance.now() - this.betweenStart > BETWEEN_HOLES_MS) this.nextHole();
    }
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    clearTimeout(this.introTimer);
    this.links.clear();
  }
}
