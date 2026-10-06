import { RNG } from '../core/rng.js';
import { ROSTER, laneMonster } from './extend.js';

// Monster variety: each sector keeps its typical monsters, but every match rolls some guests from
// other sectors. Rolled from the host's hole seed, so every client builds the same monsters in the
// same order.
export const GUEST_CHANCE = 0.3;
const GUESTS = ['kankrelat', 'hornet', 'blok', 'krabe', 'tarantula', 'manta'];
// hand-placed walkers that can stand in for one another (same height, similar size)
const WALKERS = ['kankrelat', 'blok', 'tarantula'];

/** The hole with this match's monsters: lane monsters re-rolled, maybe one hand-placed walker swapped. */
export function rollMonsters(def, seed) {
  if (!def.parts.some((p) => p.t === 'monster')) return def;
  const rng = new RNG(((seed >>> 0) ^ 0x6d0f27) >>> 0);
  const own = ROSTER[def.sector];
  const guests = GUESTS.filter((t) => !own?.includes(t));
  const walkers = def.parts.map((p, i) => [p, i]).filter(([p]) => p.t === 'monster' && !p.lane && WALKERS.includes(p.type)).map(([, i]) => i);
  const swapAt = walkers.length && rng.chance(0.5) ? rng.pick(walkers) : -1;
  const parts = def.parts.map((p, i) => {
    if (p.t !== 'monster') return p;
    if (p.lane && own) return laneMonster(rng.chance(GUEST_CHANCE) ? rng.pick(guests) : rng.pick(own), p.lane);
    if (i === swapAt) return { ...p, type: rng.pick(WALKERS.filter((t) => t !== p.type)) };
    return p;
  });
  return { ...def, parts };
}
