// kind:
//   self   – affects your own next shot / your own ball
//   aura   – timed effect around your own ball
//   others – every opponent's next shot
//   one    – a single chosen player
//   place  – put something on the course (lasts a while)
//   global – timed, affects everyone including you
// aim (opens the aerial tactical view):
//   point    – click a spot
//   pointdir – click a spot, drag a direction
//   dir      – drag an arrow
//   line     – drag a segment
// cat: pickup halo colour — self (blue), sabotage (red), chaos (purple)
// tier: 1 mild … 3 brutal (catch-up luck gives trailing players higher tiers)
export const POWERUPS = {
  steady:      { name: 'Steady Aim',        icon: '🎯', kind: 'self',   tier: 1, desc: 'No aim wobble on your next shot.' },
  magnet:      { name: 'Magnet',            icon: '🧲', kind: 'self',   tier: 2, desc: 'Next shot is pulled toward the cup and grabbed when close.' },
  ghost:       { name: 'Ghost',             icon: '👻', kind: 'self',   tier: 2, desc: 'Next shot passes through walls, monsters and pits. Don\'t overshoot into the Digital Sea!' },
  chip:        { name: 'Chip Shot',         icon: '🦘', kind: 'self',   tier: 1, desc: 'Next shot jumps over obstacles.' },
  returnpast:  { name: 'Return to the Past', icon: '⏪', kind: 'self',  tier: 2, desc: 'Undo your last shot: your ball goes back where it was (the stroke still counts).' },
  firewall:    { name: 'Firewall',          icon: '🛡️', kind: 'self',   tier: 1, desc: 'Shields you until the hole ends: the next power-up aimed at you bounces back to its sender.' },
  triplicate:  { name: 'Triplicate',        icon: '🔱', kind: 'self',   tier: 2, desc: 'Next shot splits into three balls. The best one is kept.' },
  scanner:     { name: 'Jérémie\'s Scanner', icon: '🖥️', kind: 'self',  tier: 1, desc: 'Shows the full path of your next shot, bounces included.' },
  unlovaball:  { name: 'Unlovaball',        icon: '💔', kind: 'aura',   tier: 1, desc: 'For 10s, other balls are pushed away from yours. Nobody loves you.' },
  aelita:      { name: 'Aelita',            icon: '🌸', kind: 'others', tier: 2, desc: 'Everyone else moves in slow motion for their next shot.' },
  funsize:     { name: 'Fun Size',          icon: '🐜', kind: 'others', tier: 1, desc: 'Shrinks everyone else for their next shot.' },
  supersize:   { name: 'Super Size',        icon: '🍔', kind: 'others', tier: 2, desc: 'Enlarges everyone else so their ball won\'t fit in the cup.' },
  sticky:      { name: 'Sticky Ball',       icon: '🍯', kind: 'others', tier: 2, desc: 'Everyone else sticks to walls on their next shot.' },
  zany:        { name: 'Zanyball',          icon: '⚡', kind: 'one',    tier: 2, desc: 'One player\'s next shot is WAY too fast.' },
  steal:       { name: 'Steal',             icon: '🦝', kind: 'one',    tier: 1, desc: 'Take a random power-up from a player.', allowHoled: true },
  switch:      { name: 'Switch',            icon: '🔄', kind: 'one',    tier: 2, desc: 'Swap ball positions with a player still on the course.', needSelf: true },
  leash:       { name: 'Leash',             icon: '🐕', kind: 'one',    tier: 1, desc: 'A lady walks their ball on a leash: weaker, tethered next shot.' },
  ad:          { name: 'Unskippable Ad',    icon: '📺', kind: 'one',    tier: 2, desc: 'Forces a player to watch a 5–10s ad. No shooting, no power-ups.', allowHoled: true },
  possession:  { name: 'XANA Possession',   icon: '👁️', kind: 'one',    tier: 2, desc: 'XANA possesses a player: their aim and power controls are inverted for their next shot.' },
  devirtualize: { name: 'Devirtualize',     icon: '💥', kind: 'one',    tier: 3, desc: 'Sends a player\'s ball back to the tee (no extra stroke).' },
  bumper:      { name: 'Bumper Spawn',      icon: '🔴', kind: 'place',  tier: 1, aim: 'point', range: 0.5, desc: 'Place a bumper that sends balls back the way they came.' },
  blackhole:   { name: 'Black Hole Bumper', icon: '🕳️', kind: 'place',  tier: 2, aim: 'point', range: 3, desc: 'Place a black hole for 20 s: it drags passing balls in and flings them out of its core like a bumper.' },
  swarm:       { name: 'Kankrelat Swarm',   icon: '🪲', kind: 'place',  tier: 2, aim: 'point', range: 3.5, desc: 'Five Kankrelats skitter around a spot for 20s.' },
  creativity:  { name: 'Aelita\'s Creativity', icon: '✨', kind: 'place', tier: 1, aim: 'line', desc: 'Draw a wall to block a lane — or a bridge across a gap. Lasts 30s.' },
  stickywalls: { name: 'Sticky Walls',      icon: '🪤', kind: 'global', tier: 2, desc: 'All walls are sticky for everyone (you too) until the hole ends.' },
  wind:        { name: 'Wind',              icon: '🌬️', kind: 'global', tier: 1, aim: 'dir', desc: 'A 10s gust blows the way you drag.' },
  tornado:     { name: 'Tornado',           icon: '🌪️', kind: 'global', tier: 2, aim: 'pointdir', range: 2.8, desc: 'Drop a tornado and drag where it should drift. 15s of flinging.' },
  volcano:     { name: 'Volcano',           icon: '🌋', kind: 'global', tier: 2, aim: 'point', range: 6.5, desc: 'A volcano erupts magma pools that stop balls dead.' },
  icerink:     { name: 'Ice Rink',          icon: '⛸️', kind: 'global', tier: 2, desc: 'The floor freezes for 20s. Everything slides.' },
  tsunami:     { name: 'Tsunami',           icon: '🌊', kind: 'global', tier: 3, aim: 'dir', desc: 'A giant wave sweeps the course the way you drag.' },
  montapollos: { name: 'Montapollos',       icon: '🐔', kind: 'global', tier: 3, aim: 'point', range: 1.8, desc: 'A giant chicken spawns where you click and runs around shoving balls.' },
};

export const POWERUP_IDS = Object.keys(POWERUPS);

export const CATEGORY_OF = (id) => {
  const k = POWERUPS[id].kind;
  return k === 'self' || k === 'aura' ? 'self' : k === 'others' || k === 'one' ? 'sabotage' : 'chaos';
};

export const CATEGORY_COLORS = { self: '#3da5ff', sabotage: '#ff3b4e', chaos: '#b04dff' };

// Relative spawn weights (rarer = more chaotic).
export const WEIGHTS = {
  steady: 10, magnet: 6, ghost: 6, chip: 8, returnpast: 6, firewall: 7, triplicate: 5, scanner: 7, unlovaball: 6,
  aelita: 6, funsize: 7, supersize: 6, sticky: 7, zany: 7, steal: 6, switch: 4, leash: 6, ad: 5, possession: 6, devirtualize: 2,
  bumper: 7, blackhole: 5, swarm: 5, creativity: 6, stickywalls: 4, wind: 6, tornado: 4, volcano: 4, icerink: 4, tsunami: 3, montapollos: 3,
};

// Category mix for pickups.
export const CATEGORY_WEIGHTS = { self: 4, sabotage: 4, chaos: 3 };

/**
 * Catch-up luck: rankFactor 0 = leading, 1 = last. Trailing players lean toward high tiers.
 */
export function pickPowerup(category, rankFactor, rand = Math.random) {
  const ids = POWERUP_IDS.filter((id) => CATEGORY_OF(id) === category);
  const w = (id) => {
    const t = POWERUPS[id].tier;
    const lean = t === 1 ? 1 + (1 - rankFactor) * 0.8 : 1 + (t - 1) * rankFactor * 1.5;
    return (WEIGHTS[id] ?? 5) * lean;
  };
  let total = 0;
  for (const id of ids) total += w(id);
  let r = rand() * total;
  for (const id of ids) { r -= w(id); if (r <= 0) return id; }
  return ids[ids.length - 1];
}

/** Deterministic pickup categories for a hole (same on host and every client). */
export function pickupCategories(seed, n, RNGClass) {
  const rng = new RNGClass((seed ^ 0x51ed27) >>> 0);
  const cats = Object.keys(CATEGORY_WEIGHTS);
  return Array.from({ length: n }, () => rng.weighted(cats, (c) => CATEGORY_WEIGHTS[c]));
}
