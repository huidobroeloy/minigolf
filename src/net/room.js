import { HOLES } from '../holes/index.js';
import { randomSeed, RNG } from '../core/rng.js';
import { signedArea } from '../course/geometry.js';
import { POWERUPS, pickPowerup, pickupCategories, CATEGORY_WEIGHTS } from '../powerups/registry.js';

import { CHARACTER_COLORS } from '../game/characters.js';

export const COLORS = CHARACTER_COLORS; // one per character: Ulrich, Odd, Yumi, Aelita, William, Jérémie, Franz Hopper, XANA
export const MAX_PLAYERS = 8;
const BETWEEN_HOLES_MS = 8000;
const ALL_HOLED_GRACE_MS = 2500;
const RESPAWN_EVERY_MS = 25000;
const PROTECT_MS = 5000;

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
    this.code = code;
    this.solo = solo;
    this.links = new Map();       // id -> send(msg)
    this.players = new Map();     // id -> player record
    this.phase = 'lobby';         // lobby | hole | between | final
    this.settings = { course: 'all', timeMul: 1, puLevel: 'normal' };
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
      case 'holed':
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
          if (tgt && performance.now() < (tgt.protectedUntil || 0)) {
            this.sendTo(id, { t: 'refund', pu: msg.pu, reason: `${tgt.name} was just hit — protected for a moment` });
            return;
          }
          if (tgt) { tgt.protectedUntil = performance.now() + PROTECT_MS; this.stat(tgt.id, 'targeted'); }
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
    const all = HOLES.map((_, i) => i);
    if (s === 'front') return all.slice(0, 9);
    if (s === 'back') return all.slice(9);
    if (s === 'random9') return all.sort(() => Math.random() - 0.5).slice(0, 9).sort((a, b) => a - b);
    if (typeof s === 'string' && s.startsWith('hole:')) return [Number(s.slice(5))];
    const bySector = all.filter((i) => HOLES[i].sector === s);
    return bySector.length ? bySector : all;
  }

  startMatch() {
    this.plan = this.buildPlan();
    this.holeNo = -1;
    for (const p of this.players.values()) { p.scores = this.plan.map(() => null); }
    // drop players who left in a previous match
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
    this.broadcast({ t: 'matchStart', plan: this.plan });
    this.nextHole();
  }

  activePlayers() { return [...this.players.values()].filter((p) => p.connected); }

  elapsed() { return performance.now() - this.holeStart; }

  holeMessage() {
    return {
      t: 'hole', holeNo: this.holeNo, total: this.plan.length, index: this.plan[this.holeNo],
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
    this.phase = 'final';
    const standings = this.playerList().sort((a, b) => a.total - b.total);
    this.finalMsg = { t: 'final', standings, plan: this.plan };
    this.broadcast(this.finalMsg);
    this.broadcastLobby();
  }

  tick() {
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
    this.links.clear();
  }
}
