// The season / trophy cabinet: every finished multiplayer match the host plays is kept in the host's
// browser (localStorage), so a group of friends can follow a whole season: standings by finish points,
// records and head-to-head. Export/import moves it to another device; "new season" starts over.

const KEY = 'lyokogolf.season';
export const FINISH_POINTS = [10, 7, 5, 3, 1];

const fresh = (no = 1) => ({ v: 1, no, started: new Date().toISOString(), matches: [] });

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && Array.isArray(d.matches)) return d;
  } catch { /* storage blocked or corrupt */ }
  return fresh();
}

const key = (name) => String(name || '').trim().toLowerCase();

export const season = {
  data: load(),

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage blocked */ } },

  /** Record a finished match from the room's `final` message (host only, once per match). */
  record(m, { format, pars }) {
    const at = m.at || Date.now();
    if (this.data.matches.some((x) => x.at === at)) return false;
    const par = pars.reduce((a, b) => a + b, 0);
    this.data.matches.push({
      at, format: format || '', mode: m.mode || 'ffa', holes: pars.length, par,
      winner: m.teams ? m.teams[0]?.team : null,
      players: m.standings.map((p, i) => ({
        name: String(p.name || '').trim(), color: p.color, rank: i + 1, total: p.total, team: p.team || null,
        aces: (p.scores || []).filter((s) => s === 1).length,
      })),
    });
    this.save();
    return true;
  },

  /** Standings, records and head-to-head for the current season. */
  summary() {
    const rows = new Map();
    const row = (p) => {
      const k = key(p.name);
      if (!rows.has(k)) rows.set(k, { name: p.name, color: p.color, pts: 0, played: 0, wins: 0, podiums: 0, aces: 0, best: null });
      const r = rows.get(k);
      r.name = p.name; r.color = p.color;
      return r;
    };
    const h2h = new Map();
    const records = { bestRound: null, mostAces: null, biggestWin: null };
    for (const m of this.data.matches) {
      const ps = m.players;
      for (const p of ps) {
        const r = row(p);
        r.played++;
        r.pts += FINISH_POINTS[p.rank - 1] || 0;
        if (p.rank === 1) r.wins++;
        if (p.rank <= 3) r.podiums++;
        r.aces += p.aces;
        // rounds are compared by score to par (full matches only, not single holes)
        const toPar = p.total - m.par;
        if (m.holes >= 6 && (r.best == null || toPar < r.best)) r.best = toPar;
        if (m.holes >= 6 && (!records.bestRound || toPar < records.bestRound.toPar)) records.bestRound = { name: p.name, toPar, holes: m.holes, at: m.at };
        if (p.aces && (!records.mostAces || p.aces > records.mostAces.aces)) records.mostAces = { name: p.name, aces: p.aces, at: m.at };
      }
      if (ps.length > 1) {
        const margin = ps[1].total - ps[0].total;
        if (!records.biggestWin || margin > records.biggestWin.margin) records.biggestWin = { name: ps[0].name, margin, at: m.at };
      }
      for (const a of ps) for (const b of ps) if (a !== b && a.rank < b.rank) {
        const k = key(a.name) + '|' + key(b.name);
        h2h.set(k, (h2h.get(k) || 0) + 1);
      }
    }
    const table = [...rows.values()].sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.played - b.played || (a.best ?? 99) - (b.best ?? 99));
    return { table, records, h2h: (a, b) => h2h.get(key(a) + '|' + key(b)) || 0, matches: this.data.matches.length };
  },

  exportJSON() { return JSON.stringify(this.data, null, 1); },

  /** Merge an exported season into this one (matches already here are skipped). Returns how many were added. */
  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.matches)) throw new Error('Not a Lyoko Minigolf season file');
    let n = 0;
    for (const m of d.matches) {
      if (!m || !Array.isArray(m.players) || typeof m.at !== 'number') continue;
      if (this.data.matches.some((x) => x.at === m.at)) continue;
      this.data.matches.push(m);
      n++;
    }
    this.data.matches.sort((a, b) => a.at - b.at);
    this.save();
    return n;
  },

  newSeason() {
    this.data = fresh((this.data.no || 1) + 1);
    this.save();
  },
};
