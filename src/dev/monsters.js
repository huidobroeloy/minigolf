// Monster collision audit (?debug=1 → __monsterAudit()). "What you see is what you hit":
// - a ball rolled straight at a ground monster must bounce off it, never reach the middle of its body;
// - a walking monster that reaches a resting ball must push it, never slide through it;
// - flyers must clear rolling balls (and be solid for airborne ones).
import * as THREE from 'three';
import { Physics, FIXED_DT } from '../physics/world.js';
import { Ball, BALL_R } from '../physics/ball.js';
import { buildCourse } from '../course/builder.js';
import { rect, patrol } from '../holes/helpers.js';

// one spec per type; `walk` gives it a patrol for the resting-ball test
const GROUND = {
  kankrelat: {}, blok: {}, megatank: {}, ninja: {}, kalamar: {}, shark: {}, tumbleweed: {}, drone: { y: 0.5 },
  krabe: { under: true }, tarantula: { under: true }, // tall walkers: roll under the belly between the solid legs
  guardian: { r: 0.8 },
  creeper: { period: 4, phase: 0.15, still: true }, boulder: { size: 0.6, y: 0.6 },
};
const FLYERS = { hornet: { y: 2.3, aim: 'ball' }, manta: { y: 1.2, size: 0.8 }, scyphozoa: { y: 2.6, grab: [0, 0.3, -6], grabs: true } }; // its tentacles grab instead of bouncing
// not tested: background giants, sweeping arms (force-based by design), bombs without a body, the boss hole
const SKIP = ['kolossus', 'kongre', 'magma', 'kolossusBoss'];

const floorDef = (monster) => ({
  id: 'audit', name: 'audit', sector: 'sector5', par: 3, tee: [0, 0, -7], cup: [7, 0, 7],
  parts: [{ t: 'floor', poly: rect(-9, -9, 9, 9) }, monster],
});

function rig(def) {
  const physics = new Physics();
  const scene = new THREE.Scene();
  const course = buildCourse(def, physics, scene);
  course.noAttacks = true;
  const ball = new Ball(physics, scene, '#fff');
  course.localBall = ball;
  const out = { x: 0, y: 0, z: 0, wake: false };
  const env = {
    course,
    forces(b) { out.x = out.y = out.z = 0; out.wake = false; out.teleport = null; out.launch = null; course.zoneForces(b, out); return out; },
    decelMul: 1, zoneDecel: (b) => course.zoneDecel(b), stickyWalls: false, bumpers: course.bumpers,
    onHole() {}, onFall() {}, onPit() {},
  };
  let t = 0;
  const step = () => {
    course.time = t;
    course.update(t, FIXED_DT);
    ball.preStep(FIXED_DT, env);
    physics.step();
    ball.postStep(FIXED_DT, env);
    t += FIXED_DT;
  };
  const dispose = () => { ball.dispose(); course.dispose(); physics.dispose(); };
  return { physics, course, ball, step, dispose, get t() { return t; } };
}

/** The monster's visible body: footprint centre, half-extents and height range, at time t. */
function shape(m, t) {
  m.frame?.(t);
  m.model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.model);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  return { c, hx: s.x / 2, hz: s.z / 2, y0: box.min.y, y1: box.max.y };
}

const dims = (sh, y = 0) => ({ hx: +sh.hx.toFixed(2), hz: +sh.hz.toFixed(2), y0: +(sh.y0 - y).toFixed(2), y1: +(sh.y1 - y).toFixed(2), cy: +(sh.c.y - y).toFixed(2) });

function rollAt(type, extra) {
  const spec = { t: 'monster', type, p: [0, extra.y ?? 0, 0], ...extra };
  let reached = 0, bounced = 0, through = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = rig(floorDef(spec));
    const m = r.course.monsters[0];
    const sh = shape(m, 0);
    r.ball.place(new THREE.Vector3(-dx * 4.5, BALL_R + 0.02, -dz * 4.5));
    for (let i = 0; i < 10; i++) r.step();
    r.ball.state = 'idle';
    r.ball.shoot(new THREE.Vector3(dx, 0, dz), 0.42);
    let inside = false, turned = false;
    for (let i = 0; i < 4 / FIXED_DT; i++) {
      r.step();
      const p = r.ball.pos, v = r.ball.vel;
      // the middle 50% of the visible footprint, at a height the body covers
      if (Math.abs(p.x - sh.c.x) < sh.hx * 0.5 && Math.abs(p.z - sh.c.z) < sh.hz * 0.5 && p.y < sh.y1 && p.y + BALL_R > sh.y0) inside = true;
      if (v.x * dx + v.z * dz < -0.3) turned = true;
    }
    if (inside) reached++;
    if (turned) bounced++;
    if (inside && !turned) through++;
    r.dispose();
  }
  return { reached, bounced, through };
}

function restPush(type, extra) {
  if (extra.still) return 'n/a';
  const spec = { t: 'monster', type, path: patrol([-3, 0], [3, 0], 6, extra.y ?? 0), ...extra };
  const r = rig(floorDef(spec));
  const m = r.course.monsters[0];
  r.ball.place(new THREE.Vector3(0, BALL_R + 0.02, 0));
  for (let i = 0; i < 10; i++) r.step();
  r.ball.state = 'idle';
  const q = r.ball.pos, p0 = { x: q.x, z: q.z };
  let overlapT = 0, moved = 0;
  for (let i = 0; i < 6 / FIXED_DT; i++) {
    r.step();
    const s = m.at(r.t), p = r.ball.pos;
    moved = Math.max(moved, Math.hypot(p.x - p0.x, p.z - p0.z));
    if (Math.hypot(p.x - s.x, p.z - s.z) < 0.15) overlapT += FIXED_DT; // the monster's centre sits on the ball
  }
  r.dispose();
  return overlapT > 0.1 ? `walked through (${overlapT.toFixed(2)} s)` : moved > 0.1 ? 'pushed' : 'no contact';
}

export function monsterAudit() {
  const rows = [];
  for (const [type, extra] of Object.entries(GROUND)) {
    const r0 = rig(floorDef({ t: 'monster', type, p: [0, extra.y ?? 0, 0], ...extra }));
    const m = r0.course.monsters[0];
    const collider = !!m.body;
    const sh = shape(m, 0);
    r0.dispose();
    const roll = rollAt(type, extra);
    const rest = restPush(type, extra);
    const issues = [];
    if (!collider) issues.push('no collider');
    if (!extra.under && roll.through) issues.push(`ball rolled through its middle ${roll.through}/4`);
    if (rest.startsWith('walked') && !extra.under) issues.push(`resting ball: ${rest}`);
    rows.push({ type, collider, reached: roll.reached, bounced: roll.bounced, rest, issues: issues.join('; ') || 'ok', dims: dims(sh) });
  }
  for (const [type, extra] of Object.entries(FLYERS)) {
    const r0 = rig(floorDef({ t: 'monster', type, p: [0, extra.y, 0], ...extra }));
    const m = r0.course.monsters[0];
    const sh = shape(m, 0);
    const issues = [];
    if (!m.body) issues.push('no collider (airborne balls fly through it)');
    if (sh.y0 < 2 * BALL_R + 0.05 && !extra.grabs) issues.push(`hangs down to ${sh.y0.toFixed(2)}: rolling balls would clip it`);
    rows.push({ type, collider: !!m.body, flyer: true, bottom: +sh.y0.toFixed(2), issues: issues.join('; ') || 'ok', dims: dims(sh, extra.y) });
    r0.dispose();
  }
  for (const type of SKIP) rows.push({ type, skipped: true, issues: 'by design' });
  return rows;
}
