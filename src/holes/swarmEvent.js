import { RNG } from '../core/rng.js';
import { rollBoss } from './bossEvent.js';

// The Marabounta takeover (season 2, ep 36): Jérémie's own multi-agent program, a tide of small dark
// spheres that destroys XANA's monsters without discrimination and turns on the heroes too. On about one
// hole in eight in the green sectors it hatches from its mother cell behind the tee ~20 s in and rolls
// down the whole hole to the cup: race it. Never on a hole with a boss event. Rolled from the host's hole
// seed, so every client gets the same swarm at the same time.
export const SWARM_CHANCE = 1 / 8;
export const SWARM_SECTORS = new Set(['forest', 'mountain', 'sector5', 'carthage']);
export const SWARM_AT = 20;

/** null, or { at, dur, seed } for this hole and seed. `dur`: seconds for the front to reach the cup. */
export function rollSwarm(def, seed) {
  if (!SWARM_SECTORS.has(def.sector) || rollBoss(def, seed)) return null;
  const rng = new RNG(((seed >>> 0) ^ 0x6d2a77) >>> 0);
  if (!rng.chance(SWARM_CHANCE)) return null;
  return { at: SWARM_AT, dur: Math.max(90, Math.round(0.6 * (def.time || 150))), seed: rng.int(1, 1e9) };
}
