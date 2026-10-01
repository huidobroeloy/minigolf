import { HOLES } from '../holes/index.js';
import { randomSeed } from '../core/rng.js';

export const COLORS = ['#ff4d4d', '#4da6ff', '#ffd24d', '#3ddc84', '#c04dff', '#ff8f3d', '#4dfff3', '#ff4dc4'];
export const MAX_PLAYERS = 8;
const BETWEEN_HOLES_MS = 8000;
const ALL_HOLED_GRACE_MS = 2500;

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
    this.settings = { course: 'all', timeMul: 1, powerups: true };
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
      scores: p.scores, total: p.scores.reduce((a, b) => a + (b ?? 0), 0), holed: p.holed, strokes: p.strokes,
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
        this.broadcast({ t: 'picked', pid: msg.pid, by: id });
        return;
      }
      case 'use': {
        if (!p || this.phase !== 'hole') return;
        const fx = { t: 'fx', pu: msg.pu, from: id, target: msg.target ?? null, params: msg.params ?? {}, seed: randomSeed(), at: this.elapsed() };
        if (msg.pu === 'switch') {
          const tgt = this.players.get(msg.target);
          if (!tgt || tgt.holed || p.holed || !tgt.pos || !p.pos) { this.sendTo(id, { t: 'refund', pu: msg.pu, reason: 'Switch failed: target unavailable' }); return; }
          fx.params = { a: p.pos, b: tgt.pos };
        }
        this.broadcast(fx);
        return;
      }
      case 'give':
        // response to a steal: forward the stolen item (or nothing) to the thief
        this.sendTo(msg.to, { t: 'gift', pu: msg.pu, from: id });
        return;
      case 'emote':
        this.broadcast({ t: 'emote', id, e: String(msg.e).slice(0, 4) });
        return;
    }
  }

  onJoin(id, msg) {
    if (this.players.has(id)) return;
    if (this.players.size >= MAX_PLAYERS) { this.sendTo(id, { t: 'reject', reason: 'Room is full (8 players)' }); return; }
    const used = new Set([...this.players.values()].map((p) => p.color));
    let color = msg.color && !used.has(msg.color) ? msg.color : COLORS.find((c) => !used.has(c)) || COLORS[0];
    const name = String(msg.name || 'Player').slice(0, 16);
    const isHost = this.players.size === 0;
    const scores = this.plan.map((hi, i) => (i < this.holeNo ? timeoutScore(HOLES[hi].par, 0) : null));
    this.players.set(id, { id, name, color, host: isHost, connected: true, scores, holed: false, strokes: 0, pos: null });
    this.sendTo(id, { t: 'welcome', you: id, code: this.code, color });
    this.broadcastLobby();
    if (this.phase === 'hole') this.sendTo(id, this.holeMessage());
    if (this.phase === 'between') this.sendTo(id, { t: 'holeEnd', results: this.lastResults, players: this.playerList(), holeNo: this.holeNo, plan: this.plan });
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
      pickupCount: this.settings.powerups ? this.pickups.length : 0,
      taken: this.pickups.map((p) => p.taken || null),
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
    const n = this.settings.powerups ? Math.min(16, Math.round(4 + this.activePlayers().length * 1.5)) : 0;
    this.pickups = Array.from({ length: n }, () => ({ taken: null }));
    for (const p of this.players.values()) { p.holed = false; p.strokes = 0; p.pos = null; }
    this.broadcast(this.holeMessage());
  }

  endHole() {
    if (this.phase !== 'hole') return;
    const def = HOLES[this.plan[this.holeNo]];
    const results = [];
    for (const p of this.players.values()) {
      if (!p.holed) {
        p.scores[this.holeNo] = timeoutScore(def.par, p.strokes);
        results.push({ id: p.id, score: p.scores[this.holeNo], timeout: true });
      } else results.push({ id: p.id, score: p.scores[this.holeNo], timeout: false });
    }
    this.phase = 'between';
    this.betweenStart = performance.now();
    this.lastResults = results;
    this.broadcast({ t: 'holeEnd', results, players: this.playerList(), holeNo: this.holeNo, plan: this.plan });
  }

  finish() {
    this.phase = 'final';
    const standings = this.playerList().sort((a, b) => a.total - b.total);
    this.broadcast({ t: 'final', standings, plan: this.plan });
    this.broadcastLobby();
  }

  tick() {
    if (this.phase === 'hole') {
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
