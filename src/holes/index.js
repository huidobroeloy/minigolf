import desert from './desert.js';
import forest from './forest.js';
import ice from './ice.js';
import mountain from './mountain.js';
import sector5 from './sector5.js';
import fortune from './fortune.js';
import volcano from './volcano.js';
import sea from './sea.js';
import network from './network.js';

/**
 * The Lyoko World Cup: every course is a sector of (up to) 6 holes. A match plays whole courses:
 * the course order is shuffled, but you finish all of a course's holes before the next one.
 * A hole's `sector` is its course key (it also picks the theme).
 */
export const COURSES = [
  { key: 'desert', name: 'Desert Sector', holes: desert },
  { key: 'forest', name: 'Forest Sector', holes: forest },
  { key: 'ice', name: 'Ice Sector', holes: ice },
  { key: 'mountain', name: 'Mountain Sector', holes: mountain },
  { key: 'sector5', name: 'Sector 5 · Carthage', holes: sector5 },
  { key: 'volcano', name: 'Volcano Replika', holes: volcano },
  { key: 'sea', name: 'The Digital Sea', holes: sea },
  { key: 'network', name: 'The Network', holes: network },
  { key: 'fortune', name: 'Fortune Falls Casino', holes: fortune },
].filter((c) => c.holes.length);

// kept for older code: a course is a sector
export const SECTORS = COURSES.map(({ key, name }) => ({ key, name }));
export const SECTOR_NAMES = Object.fromEntries(COURSES.map((c) => [c.key, c.name]));

// every hole, course by course (network messages use indices into this)
export const HOLES = COURSES.flatMap((c) => c.holes);

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
  return order.flatMap(courseHoles);
}

/** The format choices offered in the lobby and the menu. */
export function formatOptions() {
  const total = HOLES.length;
  const per = Math.round(total / COURSES.length);
  const cups = [2, 3, 4, 6].filter((n) => n < COURSES.length);
  return [
    ['worldcup', `🏆 World Cup · all ${COURSES.length} courses (${total} holes)`],
    ...cups.map((n) => [`cup${n}`, `Cup · ${n} random courses (~${n * per} holes)`]),
    ...COURSES.map((c) => [`course:${c.key}`, `${c.name} (${c.holes.length} holes)`]),
  ];
}
