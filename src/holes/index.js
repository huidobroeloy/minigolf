import desert from './desert.js';
import forest from './forest.js';
import ice from './ice.js';
import mountain from './mountain.js';
import sector5 from './sector5.js';
import fortune from './fortune.js';
import volcano from './volcano.js';
import sea from './sea.js';
import network from './network.js';
import cortex from './cortex.js';
import carthage from './carthage.js';
import skid from './skid.js';
import { attachOpening } from './extend.js';
import boss from './boss.js';

// Hand-designed openings (see extend.js): a hole with `opening` gets it laid out behind its tee;
// `opening: false` (and Fortune Falls, which has none) keeps the hole as it is.
const withOpening = (h) => (h.opening ? attachOpening(h, h.opening) : h);
const lengthen = (holes) => holes.map(withOpening);

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
  { key: 'cortex', name: 'The Cortex', holes: lengthen(cortex) },
  { key: 'carthage', name: 'Carthage · The Core', holes: lengthen(carthage) },
  { key: 'skid', name: 'Skidbladnir · The Depths', holes: lengthen(skid) },
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

// Fortune Falls Casino is luck by design: it only plays in its own format, Feeling Lucky
export const LUCKY = 'fortune';

/** Holes in a World Cup: every course except the casino, then the Kolossus. */
export const worldCupLength = () => COURSES.filter((c) => c.key !== LUCKY).reduce((a, c) => a + c.holes.length, 0) + 1;

/**
 * Turn a match format into a list of hole indices:
 *   worldcup      every course (not the casino), shuffled
 *   cupN          N random courses (not the casino)
 *   lucky         Feeling Lucky: the Fortune Falls Casino
 *   course:KEY    one course
 *   hole:N        one hole
 */
export function buildPlan(format, rand = Math.random) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const keys = COURSES.map((c) => c.key).filter((k) => k !== LUCKY);
  const f = String(format || 'cup3');
  if (f.startsWith('hole:')) return [Number(f.slice(5))];
  if (f === 'lucky') return courseHoles(LUCKY);
  if (f.startsWith('course:')) { const h = courseHoles(f.slice(7)); if (h.length) return h; }
  if (keys.includes(f) || f === LUCKY) return courseHoles(f); // old-style sector key
  let order = shuffle([...keys]);
  if (f.startsWith('cup')) order = order.slice(0, Math.max(1, Math.min(keys.length, Number(f.slice(3)) || 3)));
  const plan = order.flatMap(courseHoles);
  // the World Cup ends at the Sector 5 core, against the Kolossus
  return f === 'worldcup' ? [...plan, BOSS_INDEX] : plan;
}

/** The format choices offered in the lobby and the menu. */
export function formatOptions() {
  const main = COURSES.filter((c) => c.key !== LUCKY);
  const lucky = COURSES.find((c) => c.key === LUCKY);
  const per = Math.round((worldCupLength() - 1) / main.length);
  const cups = [2, 3, 4, 6].filter((n) => n < main.length);
  return [
    ['worldcup', `🏆 World Cup · all ${main.length} courses + the Kolossus (${worldCupLength()} holes)`],
    ...cups.map((n) => [`cup${n}`, `Cup · ${n} random courses (~${n * per} holes)`]),
    ...(lucky ? [['lucky', `🎰 Feeling Lucky · ${lucky.name} (${lucky.holes.length} holes)`]] : []),
    ...main.map((c) => [`course:${c.key}`, `${c.name} (${c.holes.length} holes)`]),
    [`hole:${BOSS_INDEX}`, '🗿 Boss · the Kolossus at the Sector 5 Core (1 hole)'],
  ];
}
