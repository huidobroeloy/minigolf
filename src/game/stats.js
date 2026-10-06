// Lifetime stats and achievements, kept on this device (localStorage). Some achievements unlock
// cosmetic ball trails, which the other players see too.

const KEY = 'lyokogolf.stats';

export const TRAILS = {
  default: { name: 'Standard', desc: 'dots in your colour' },
  sparkle: { name: 'Sparkle', desc: 'white stars' },
  data: { name: 'Data stream', desc: 'green code bits' },
  fire: { name: 'Fire', desc: 'embers' },
  rainbow: { name: 'Rainbow', desc: 'every colour' },
  xana: { name: 'Eye of XANA', desc: 'red sparks' },
};

export const ACHIEVEMENTS = [
  { id: 'first', icon: '⛳', name: 'Virtualized', desc: 'Play your first hole', test: (s) => s.holes >= 1 },
  { id: 'ace', icon: '🎯', name: 'Straight to the tower', desc: 'Score a hole in one', test: (s) => s.aces >= 1, trail: 'sparkle' },
  { id: 'aces5', icon: '🌈', name: 'Lyoko legend', desc: 'Score 5 holes in one', test: (s) => s.aces >= 5, trail: 'rainbow' },
  { id: 'holes50', icon: '💾', name: 'Regular', desc: 'Play 50 holes', test: (s) => s.holes >= 50, trail: 'data' },
  { id: 'holes200', icon: '🔥', name: 'Veteran warrior', desc: 'Play 200 holes', test: (s) => s.holes >= 200, trail: 'fire' },
  { id: 'towers25', icon: '🗼', name: 'Tower buster', desc: 'Deactivate 25 towers', test: (s) => s.towers >= 25 },
  { id: 'under3', icon: '🦅', name: 'Albatross', desc: 'Finish a hole 3 under par', test: (s) => s.under3 >= 1 },
  { id: 'putt15', icon: '📏', name: 'Long distance', desc: 'Hole a shot from 15+ units away', test: (s) => s.longest >= 15 },
  { id: 'devirt10', icon: '💥', name: 'Devirtualized', desc: 'Lose all your life points 10 times', test: (s) => s.devirt >= 10 },
  { id: 'survivor', icon: '🩹', name: 'Last life point', desc: 'Hole out with 10 LP or less', test: (s) => s.survivor >= 1 },
  { id: 'slayer', icon: '🗡️', name: 'Monster slayer', desc: 'Cut down 10 monsters with the Zweihänder', test: (s) => s.slashed >= 10 },
  { id: 'powerups', icon: '🧪', name: 'Power user', desc: 'Use 100 power-ups', test: (s) => s.powerups >= 100 },
  { id: 'specials', icon: '★', name: 'Signature move', desc: 'Use your character’s special move 10 times', test: (s) => s.specials >= 10 },
  { id: 'fortune', icon: '🍀', name: 'Lucky streak', desc: 'Win 5 strokes back from Fortune Falls cups', test: (s) => s.fortuneWon >= 5 },
  { id: 'win1', icon: '🏆', name: 'Return to the past', desc: 'Win a match', test: (s) => s.wins >= 1 },
  { id: 'win5', icon: '👑', name: 'Code: Lyoko', desc: 'Win 5 matches', test: (s) => s.wins >= 5 },
  { id: 'worldcup', icon: '🌍', name: 'World Cup', desc: 'Finish a full World Cup', test: (s) => s.worldcups >= 1 },
  { id: 'xana', icon: '👁️', name: 'XANA wins', desc: 'Win a match as XANA', test: (s) => s.xanaWins >= 1, trail: 'xana' },
];

const BLANK = { holes: 0, aces: 0, towers: 0, under3: 0, longest: 0, devirt: 0, survivor: 0, slashed: 0, powerups: 0, specials: 0, fortuneWon: 0, wins: 0, matches: 0, worldcups: 0, xanaWins: 0, strokes: 0 };

export class Stats {
  constructor() {
    this.data = { ...BLANK, unlocked: [] };
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }
    this.onUnlock = null;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } }
  add(k, n = 1) { this.data[k] = (this.data[k] || 0) + n; this.check(); this.save(); }
  max(k, v) { if (v > (this.data[k] || 0)) { this.data[k] = v; this.check(); this.save(); } }
  check() {
    for (const a of ACHIEVEMENTS) {
      if (this.data.unlocked.includes(a.id) || !a.test(this.data)) continue;
      this.data.unlocked.push(a.id);
      this.onUnlock?.(a);
    }
  }
  unlockedTrails() {
    return ['default', ...ACHIEVEMENTS.filter((a) => a.trail && this.data.unlocked.includes(a.id)).map((a) => a.trail)];
  }
}

export const stats = new Stats();

/** A trail particle for a ball moving fast, in its style. */
export function trailParticle(style, p, color, r, t) {
  const base = { pos: [p.x, p.y, p.z], size: 0.22 * (r / 0.18), life: 0.35 };
  switch (style) {
    case 'sparkle': return { ...base, color: Math.random() < 0.5 ? '#ffffff' : color, size: base.size * 0.8, life: 0.6, vel: [(Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6] };
    case 'data': return { ...base, color: Math.random() < 0.5 ? '#6dff9a' : '#18c060', size: base.size * 0.7, life: 0.55, gravity: -0.6 };
    case 'fire': return { ...base, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23a', life: 0.5, vel: [0, 0.9, 0] };
    case 'rainbow': return { ...base, color: `hsl(${(t * 240) % 360}, 95%, 60%)`, life: 0.5 };
    case 'xana': return { ...base, color: Math.random() < 0.7 ? '#ff2a2a' : '#200000', life: 0.45, vel: [(Math.random() - 0.5), 0.3, (Math.random() - 0.5)] };
    default: return { ...base, color };
  }
}
