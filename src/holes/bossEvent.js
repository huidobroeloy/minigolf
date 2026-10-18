import { RNG } from '../core/rng.js';

// Random boss events: on about one hole in six, XANA sends a boss into the hole ~20 s after it starts.
// It roams the green and attacks (telegraphed, like every monster); it can't be beaten, and it leaves
// when the hole ends. Rolled from the host's hole seed, so every client gets the same boss, at the
// same time, on the same path.
export const BOSS_CHANCE = 1 / 6;
export const BOSS_KINDS = ['kolossus', 'scyphozoa', 'megatanks'];
export const BOSS_AT = 20;

/** null, or { kind, at, seed } for this hole and seed. */
export function rollBoss(def, seed) {
  if (def.sector === 'fortune' || def.sector === 'core') return null;
  const rng = new RNG(((seed >>> 0) ^ 0x2b05e1) >>> 0);
  if (!rng.chance(BOSS_CHANCE)) return null;
  return { kind: rng.pick(BOSS_KINDS), at: BOSS_AT, seed: rng.int(1, 1e9) };
}
