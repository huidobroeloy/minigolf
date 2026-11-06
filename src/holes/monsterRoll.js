import { RNG } from '../core/rng.js';

// Monster variety: every match may swap one hand-placed walker for another. Rolled from the host's hole
// seed, so every client builds the same monsters in the same order.
// hand-placed walkers that can stand in for one another (same height, similar size)
const WALKERS = ['kankrelat', 'blok', 'tarantula'];

/** The hole with this match's monsters: maybe one hand-placed walker swapped. */
export function rollMonsters(def, seed) {
  if (!def.parts.some((p) => p.t === 'monster')) return def;
  const rng = new RNG(((seed >>> 0) ^ 0x6d0f27) >>> 0);
  const walkers = def.parts.map((p, i) => [p, i]).filter(([p]) => p.t === 'monster' && WALKERS.includes(p.type)).map(([, i]) => i);
  const swapAt = walkers.length && rng.chance(0.5) ? rng.pick(walkers) : -1;
  const parts = def.parts.map((p, i) => (i === swapAt ? { ...p, type: rng.pick(WALKERS.filter((t) => t !== p.type)) } : p));
  return { ...def, parts };
}
