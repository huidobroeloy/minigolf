import { HOLES, buildPlan } from '../holes/index.js';
import { randomSeed, RNG } from '../core/rng.js';
import { signedArea } from '../course/geometry.js';
import { POWERUPS, pickPowerup, pickupCategories, CATEGORY_WEIGHTS } from '../powerups/registry.js';

import { CHARACTER_COLORS } from '../game/characters.js';

export const COLORS = CHARACTER_COLORS; // one per character: Ulrich, Odd, Yumi, Aelita, William, Jérémie, Franz Hopper, XANA
export const MAX_PLAYERS = 8;
const BETWEEN_HOLES_MS = 8000;
const ALL_HOLED_GRACE_MS = 2500;
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

export function timeoutScore(par, strokes) {
  return Math.max(par, strokes) + 10;
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
    this.settings = { course: 'cup3', timeMul: 1, puLevel: 'normal' };
    this.plan = [];
    this.holeNo = -1;
    this.timer = setInterval(() => this.tick(), 200);
  }

  // ---------- connections ----------
  addClient(id, send) { this.links.set(id, send); }

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
      id: p.id, name: p.name, color: p.color, host: p.host, connected: p.connected,
      scores: p.scores, total: p.scores.reduce((a, b) => a + (b ?? 0), 0), holed: p.holed, strokes: p.strokes, stats: p.stats || {},
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
      case 'pick': {
        // change character in the lobby (one player per character)
        if (!p || (this.phase !== 'lobby' && this.phase !== 'final')) return;
        if (!COLORS.includes(msg.color)) return;
        const used = [...this.players.values()].some((q) => q.id !== id && q.color === msg.color);
        if (!used) p.color = msg.color;
        this.broadcastLobby();
        return;
      }
      case 'start':
        if (p?.host && (this.phase === 'lobby' || this.phase === 'final')) this.startMatch();
        return;
      case 'skip':
        if (p?.host && this.phase === 'hole') this.endHole();
        else if (p?.host && this.phase === 'between') this.nextHole();
        return;
      case 'st':
        if (!p) return;
        p.strokes = msg.k ?? p.strokes;
        p.pos = msg.p;
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
        if (this.activePlayers().every((q) => q.holed)) this.allHoledAt = performance.now();
        return;
      case 'claim': {
        if (!p || this.phase !== 'hole') return;
        const pk = this.pickups[msg.pid];
        if (!pk || pk.taken) return;
        pk.taken = id;
        const pu = pickPowerup(pk.cat, this.rankFactor(id));
        this.stat(id, 'pickups');
        this.broadcast({ t: 'picked', pid: msg.pid, by: id, pu });
        return;
      }
      case 'use': {
        if (!p) return;
        if (this.phase !== 'hole') { this.sendTo(id, { t: 'refund', pu: msg.pu, reason: 'Too late — the hole is over' }); return; }
        const def = POWERUPS[msg.pu];
        if (!def) return;
        const fx = { t: 'fx', pu: msg.pu, from: id, target: msg.target ?? null, params: msg.params ?? {}, seed: randomSeed(), at: this.elapsed() };
        if (def.kind === 'one') {
          const tgt = this.players.get(msg.target);
          const now = performance.now();
          if (tgt) tgt.hits = (tgt.hits || []).filter((h) => now - h < HOSTILE_WINDOW_MS);
          if (tgt && msg.pu !== 'steal' && (now < (tgt.protectedUntil || 0) || tgt.hits.length >= 2)) {
            this.sendTo(id, { t: 'refund', pu: msg.pu, reason: `${tgt.name} was just hit — protected for a moment` });
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
          if (blocked) { this.sendTo(id, { t: 'refund', pu: msg.pu, reason: 'Too close to a ball or the tee — place it somewhere else' }); return; }
        }
        this.stat(id, 'used');
        if (msg.pu === 'switch') {
          const tgt = this.players.get(msg.target);
          if (!tgt || tgt.holed || p.holed || !tgt.pos || !p.pos) { this.sendTo(id, { t: 'refund', pu: msg.pu, reason: 'Switch failed: target unavailable' }); return; }
          fx.params = { a: p.pos, b: tgt.pos };
        }
        this.broadcast(fx);
        return;
      }
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
    let color = msg.color && !used.has(msg.color) ? msg.color : COLORS.find((c) => !used.has(c)) || COLORS[0];
    const name = String(msg.name || 'Player').slice(0, 16);
    const isHost = this.players.size === 0;
    const scores = this.plan.map((hi, i) => (i < this.holeNo ? timeoutScore(HOLES[hi].par, 0) : null));
    this.players.set(id, { id, name, color, host: isHost, connected: true, scores, holed: false, strokes: 0, pos: null, token });
    this.sendTo(id, { t: 'welcome', you: id, code: this.code, color });
    this.broadcastLobby();
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

  startMatch() {
    this.playoff = null;
    this.plan = this.buildPlan();
    this.holeNo = -1;
    for (const p of this.players.values()) { p.scores = this.plan.map(() => null); }
    // drop players who left in a previous match
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
    this.broadcast({ t: 'matchStart', plan: this.plan, players: this.playerList() });
    // leave time for the VS intro before hole 1
    this.phase = 'intro';
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => { if (this.phase === 'intro') this.nextHole(); }, 3600);
  }

  activePlayers() { return [...this.players.values()].filter((p) => p.connected); }

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
    if (this.holeNo >= this.plan.length) return this.finish();
    const def = HOLES[this.plan[this.holeNo]];
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
    this.broadcast(this.holeMessage());
  }

  endHole() {
    if (this.phase !== 'hole') return;
    const def = HOLES[this.plan[this.holeNo]];
    const results = [];
    for (const p of this.players.values()) {
      if (!p.holed) {
        this.stat(p.id, 'timeouts');
        p.scores[this.holeNo] = timeoutScore(def.par, p.strokes);
        results.push({ id: p.id, score: p.scores[this.holeNo], timeout: true });
      } else results.push({ id: p.id, score: p.scores[this.holeNo], timeout: false });
    }
    this.phase = 'between';
    this.betweenStart = performance.now();
    this.lastResults = results;
    this.broadcast({ t: 'holeEnd', results, players: this.playerList(), holeNo: this.holeNo, plan: this.plan });
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

  finish() {
    const { ordered, rule, tiedIds } = rankStandings(this.playerList());
    if (tiedIds.length > 1 && !this.solo) return this.startPlayoff(tiedIds);
    this.finalize(ordered, ordered[0]?.id, rule);
  }

  finalize(ordered, winnerId, rule) {
    this.phase = 'final';
    this.playoff = null;
    this.finalMsg = { t: 'final', standings: ordered, plan: this.plan, winnerId, tiebreak: rule };
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
    const { ordered } = rankStandings(this.playerList());
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
      if (this.elapsed() >= this.duration) this.endHole();
      else if (this.allHoledAt && performance.now() - this.allHoledAt > ALL_HOLED_GRACE_MS) this.endHole();
      else if (this.activePlayers().length === 0) this.endHole();
    } else if (this.phase === 'between') {
      if (performance.now() - this.betweenStart > BETWEEN_HOLES_MS) this.nextHole();
    }
  }

  dispose() {
    clearInterval(this.timer);
    clearTimeout(this.introTimer);
    this.links.clear();
  }
}
