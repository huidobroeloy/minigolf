import desert from './desert.js';
import forest from './forest.js';
import ice from './ice.js';
import mountain from './mountain.js';
import sector5 from './sector5.js';
import fortune from './fortune.js';
import volcano from './volcano.js';
import sea from './sea.js';
import network from './network.js';
import { extendHole } from './extend.js';
import boss from './boss.js';

// Longer holes: everything up to par 4 gets a winding approach lane in front of it (see extend.js).
// Per-hole overrides tune the lane shape and the secret warp; the rest cycle through the shapes.
const LANES = ['S', 'Z', 'U', 'L', 'zig', 'hook'];
export const APPROACH = {
  // secret warps: a drop point near the cup and a speed gain, tuned with __tuneWarp to ~8 aces in the search grid
  'desert-1': { warp: { exit: [4.1, 0, 12.6], dirVec: [1, 0], gain: 1.92 } },
  'desert-2': { warp: { exit: [-3, 1.5, 14.2], dirVec: [0.5, 0.866], gain: 3.5 } },
  'desert-3': { warp: { exit: [1.9, 0, 35.3], dirVec: [-0.5, 0.866], gain: 4.18 } },
  'desert-4': { warp: { exit: [-6.4, 0, 15], dirVec: [0, 1], gain: 2.76 } },
  'desert-5': { warp: { exit: [0, 0, 5.2], dirVec: [0, 1], gain: 2.78 } },
  'forest-1': { warp: { exit: [-2.55, 0, 30.7], dirVec: [0.5, 0.866], gain: 4.76 } },
  'forest-2': { warp: { exit: [2.25, 1.5, 27.2], dirVec: [-0.5, -0.866], gain: 3.56 } },
  'forest-4': { warp: { exit: [-4.3, 0, 19.75], dirVec: [0.866, 0.5], gain: 4.04 } },
  'forest-5': { warp: { exit: [-6.1, 0, 11.85], dirVec: [0.866, 0.5], gain: 2.5 } },
  'ice-1': { warp: { exit: [-3, 0, 15.8], dirVec: [0.5, 0.866], gain: 0.36 } },
  'ice-2': { warp: { exit: [1.8, 0, 23.3], dirVec: [0, 1], gain: 0.36 } },
  'ice-3': { warp: { exit: [-3.2, 0, 15], dirVec: [0.866, -0.5], gain: 2.7 } },
  'ice-4': { warp: { exit: [4, 0, 27], dirVec: [-0.866, 0.5], gain: 0.32 } },
  'ice-5': { warp: { exit: [-3.9, 0, 29.25], dirVec: [0.866, -0.5], gain: 0.3 } },
  'ice-6': { warp: { exit: [6.5, 0, 30.75], dirVec: [-0.866, -0.5], gain: 0.38 } },
  'mountain-1': { warp: { exit: [-3, 0, 20.3], dirVec: [0.5, 0.866], gain: 4.98 } },
  'mountain-2': { warp: { exit: [-3.7, 0, 18.5], dirVec: [0.866, 0.5], gain: 4 } },
  'mountain-3': { warp: { exit: [0.85, 5, 15.6], dirVec: [-0.5, 0.866], gain: 4.46 } },
  'mountain-4': { warp: { exit: [-1.5, 0, 28.6], dirVec: [0.5, -0.866], gain: 3.8 } },
  'mountain-5': { warp: { exit: [-1.4, 2, 18.8], dirVec: [0.5, 0.866], gain: 2.94 } },
  'sector5-1': { warp: { exit: [1.5, 0, 27.4], dirVec: [-0.5, 0.866], gain: 3.22 } },
  'sector5-2': { warp: { exit: [0, 0, 19.8], dirVec: [0, 1], gain: 4.48 } },
  'sector5-3': { warp: { exit: [-3.2, 3, 12], dirVec: [0.866, 0.5], gain: 3.64 } },
  'sector5-4': { warp: { exit: [-0.25, 2.4, 14.6], dirVec: [0.5, 0.866], gain: 4.7 } },
  'sector5-5': { warp: { exit: [-3.5, 0, 18.25], dirVec: [0.866, 0.5], gain: 4.4 } },
  'volcano-1': { warp: { exit: [2.25, 0, 11.1], dirVec: [-0.5, 0.866], gain: 4.48 } },
  'volcano-2': { warp: { exit: [-3.9, 0, 30.75], dirVec: [0.866, -0.5], gain: 4.3 } },
  'volcano-3': { warp: { exit: [-1.5, 0, 22.9], dirVec: [0.5, 0.866], gain: 3.28 } },
  'volcano-6': { warp: { exit: [0.75, 0, 15], dirVec: [0.5, 0.866], gain: 3.84 } },
  'sea-1': { warp: { exit: [-1.5, 0.8, 25], dirVec: [0.5, -0.866], gain: 3.74 } },
  'sea-2': { warp: { exit: [-2.25, 0, 19.1], dirVec: [0.5, 0.866], gain: 3.36 } },
  'sea-3': { warp: { exit: [-2.6, 0, 19.5], dirVec: [0.866, 0.5], gain: 3.32 } },
  'sea-4': { warp: { exit: [7.1, 0, 12.75], dirVec: [0.866, 0.5], gain: 0.66 } },
  'sea-5': { warp: { exit: [2.05, 2.2, 17.1], dirVec: [-0.5, -0.866], gain: 2.32 } },
  'network-1': { warp: { exit: [-1.5, 0, 17.6], dirVec: [0.5, -0.866], gain: 3.82 } },
  'network-2': { warp: { exit: [-2.1, 0, 29.25], dirVec: [-0.866, -0.5], gain: 2.7 } },
  'network-3': { warp: { exit: [-2.05, 1.5, 21.7], dirVec: [0.5, 0.866], gain: 4.96 } },
  'network-4': { warp: { exit: [8.6, 0, 14.75], dirVec: [0.866, 0.5], gain: 2.84 } },
  'network-5': { warp: { exit: [0, 0, 16.5], dirVec: [0, 1], gain: 1.38 } },
  'volcano-5': { warp: { dir: -22, speed: 1.5, r: 0.2 } }, // the crater cup: the old ace line from the old tee (no clear drop point near it)
};
const lengthen = (holes) => holes.map((h, i) => (h.par >= 5 || h.sector === 'fortune' ? h
  : extendHole(h, { shape: LANES[i % LANES.length], mirror: i % 2 === 1, extraPar: 1, ...APPROACH[h.id] })));

/**
 * The Lyoko World Cup: every course is a sector of (up to) 6 holes. A match plays whole courses:
 * the course order is shuffled, but you finish all of a course's holes before the next one.
 * A hole's `sector` is its course key (it also picks the theme).
 */
export const COURSES = [
  { key: 'desert', name: 'Desert Sector', holes: lengthen(desert) },
  { key: 'forest', name: 'Forest Sector', holes: lengthen(forest) },
  { key: 'ice', name: 'Ice Sector', holes: lengthen(ice) },
  { key: 'mountain', name: 'Mountain Sector', holes: lengthen(mountain) },
  { key: 'sector5', name: 'Sector 5 · Carthage', holes: lengthen(sector5) },
  { key: 'volcano', name: 'Volcano Replika', holes: lengthen(volcano) },
  { key: 'sea', name: 'The Digital Sea', holes: lengthen(sea) },
  { key: 'network', name: 'The Network', holes: lengthen(network) },
  { key: 'fortune', name: 'Fortune Falls Casino', holes: fortune },
].filter((c) => c.holes.length);

// kept for older code: a course is a sector
export const SECTORS = COURSES.map(({ key, name }) => ({ key, name }));
export const SECTOR_NAMES = { ...Object.fromEntries(COURSES.map((c) => [c.key, c.name])), core: 'Sector 5 · Core' };

// every hole, course by course, then the Kolossus boss (network messages use indices into this)
export const HOLES = [...COURSES.flatMap((c) => c.holes), boss];
export const BOSS_INDEX = HOLES.length - 1;

/** Global hole indices of a course, in play order. */
export const courseHoles = (key) => HOLES.map((h, i) => [h, i]).filter(([h]) => h.sector === key).map(([, i]) => i);

/**
 * Turn a match format into a list of hole indices:
 *   worldcup      every course, shuffled
 *   cupN          N random courses
 *   course:KEY    one course
 *   hole:N        one hole
 */
export function buildPlan(format, rand = Math.random) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const keys = COURSES.map((c) => c.key);
  const f = String(format || 'cup3');
  if (f.startsWith('hole:')) return [Number(f.slice(5))];
  if (f.startsWith('course:')) { const h = courseHoles(f.slice(7)); if (h.length) return h; }
  if (keys.includes(f)) return courseHoles(f); // old-style sector key
  let order = shuffle([...keys]);
  if (f.startsWith('cup')) order = order.slice(0, Math.max(1, Math.min(keys.length, Number(f.slice(3)) || 3)));
  const plan = order.flatMap(courseHoles);
  // the World Cup ends at the Sector 5 core, against the Kolossus
  return f === 'worldcup' ? [...plan, BOSS_INDEX] : plan;
}

/** The format choices offered in the lobby and the menu. */
export function formatOptions() {
  const total = HOLES.length;
  const per = Math.round((total - 1) / COURSES.length);
  const cups = [2, 3, 4, 6].filter((n) => n < COURSES.length);
  return [
    ['worldcup', `🏆 World Cup · all ${COURSES.length} courses + the Kolossus (${total} holes)`],
    ...cups.map((n) => [`cup${n}`, `Cup · ${n} random courses (~${n * per} holes)`]),
    ...COURSES.map((c) => [`course:${c.key}`, `${c.name} (${c.holes.length} holes)`]),
    [`hole:${BOSS_INDEX}`, '🗿 Boss · the Kolossus at the Sector 5 Core (1 hole)'],
  ];
}
