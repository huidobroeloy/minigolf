import * as THREE from 'three';
import { Physics, FIXED_DT } from '../physics/world.js';
import { Ball, BALL_R, CUP_R } from '../physics/ball.js';
import { buildCourse } from '../course/builder.js';
import { slabGeometry, pointInPoly, circlePoly } from '../course/geometry.js';
import { HOLES } from '../holes/index.js';

/**
 * Dev tool: simulate one shot headlessly (no rendering, no wobble) and report what happened.
 * Used to prove every hole has a hole-in-one line.
 */
export function simulateShot(def, { yaw, power, t0 = 0, chip = false, maxTime = 16, trace = false, from = null, vel = null, onWarp = null, setup = null, onStep = null }) {
  const physics = new Physics();
  const scene = new THREE.Scene();
  const course = buildCourse(def, physics, scene);
  const ball = new Ball(physics, scene, '#fff');
  course.localBall = ball;
  course.noAttacks = true; // hornet lasers are random; leave them out of the search
  if (onWarp) { const wa = course.warpAt; course.warpAt = (p, b) => { const r = wa(p, b); if (r) onWarp(Math.hypot(b.vel.x, b.vel.z), t); return r; }; } // t: the hole clock below
  ball.place(from ? new THREE.Vector3(from[0], from[1] + BALL_R + 0.05, from[2]) : course.tee.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
  setup?.(ball, course); // e.g. a ghost or resized ball for the cup tests
  let result = null;
  const out = { x: 0, y: 0, z: 0, wake: false };
  const env = {
    course,
    forces(b) { out.x = out.y = out.z = 0; out.wake = false; out.teleport = null; out.launch = null; course.zoneForces(b, out); return out; },
    decelMul: 1,
    zoneDecel: (b) => course.zoneDecel(b),
    stickyWalls: false,
    bumpers: course.bumpers,
    onHole: () => { result = 'hole'; },
    onFall: () => { result = 'fall'; },
    onPit: (b, pit) => { result = pit.fortune ? 'pit' : 'fall'; },
  };
  let t = t0;
  // settle kinematic bodies at t0
  course.update(t - FIXED_DT, FIXED_DT);
  physics.step();
  for (let i = 0; i < 10; i++) { ball.preStep(FIXED_DT, env); physics.step(); ball.postStep(FIXED_DT, env); }
  ball.state = 'idle';
  if (vel) { ball.shoot(new THREE.Vector3(1, 0, 0), 0.05); ball.body.setLinvel({ x: vel[0], y: vel[1], z: vel[2] }, true); ball.launchTimer = 0.15; }
  else ball.shoot(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), power, { chip });
  const path = [];
  let steps = 0;
  let tpCool = 0;
  while (!result && steps < maxTime / FIXED_DT) {
    course.update(t, FIXED_DT);
    ball.preStep(FIXED_DT, env);
    physics.step();
    ball.postStep(FIXED_DT, env);
    if (ball.state === 'sinking') { while (ball.state === 'sinking') ball.updateSink(FIXED_DT, env); }
    if (tpCool > 0) tpCool -= FIXED_DT;
    else {
      const dest = course.checkTeleport(ball, { pick: (a) => a[0] });
      if (dest) { ball.place(dest, { safe: false }); ball.state = 'moving'; tpCool = 1.2; }
    }
    t += FIXED_DT;
    steps++;
    onStep?.(ball, course);
    if (trace && steps % 6 === 0) { const p = ball.pos; path.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]); }
    if (ball.state === 'idle') { result = 'rest'; break; }
  }
  const p = ball.state === 'holed' ? ball.sinkCup : ball.pos;
  const res = { result: result || 'timeout', pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], time: +(t - t0).toFixed(2) };
  if (trace) res.path = path;
  const cup = course.nearestCup(p);
  res.cupDist = +Math.hypot(p.x - cup.x, p.z - cup.z).toFixed(2);
  ball.dispose();
  course.dispose();
  physics.dispose();
  return res;
}

/**
 * Grid search for hole-in-one shots. Yields to the browser between rows so the page stays alive.
 * Returns the list of [yawDeg, power, t0] combos that hole out.
 */
export async function searchHIO(holeIndex, {
  yawRange = 70, yawStep = 1.5, pMin = 0.15, pMax = 1, pStep = 0.04, t0s = [0], chip = false, centerYaw = null, onProgress = null,
} = {}) {
  const def = HOLES[holeIndex];
  const tee = def.tee, cup = def.cup;
  const base = centerYaw ?? (def.yaw ?? Math.atan2(cup[0] - tee[0], cup[2] - tee[2])) * 180 / Math.PI;
  const hits = [];
  let best = { cupDist: 1e9 };
  let n = 0;
  for (const t0 of t0s) {
    for (let dy = -yawRange; dy <= yawRange + 1e-6; dy += yawStep) {
      const yawDeg = base + dy;
      for (let p = pMin; p <= pMax + 1e-6; p += pStep) {
        const r = simulateShot(def, { yaw: yawDeg * Math.PI / 180, power: p, t0, chip });
        n++;
        if (r.result === 'hole') hits.push([+yawDeg.toFixed(2), +p.toFixed(3), t0]);
        else if (r.result === 'rest' && r.cupDist < best.cupDist) best = { ...r, yawDeg: +yawDeg.toFixed(2), power: +p.toFixed(3), t0 };
      }
      onProgress?.(n, hits.length);
      await yieldNow();
    }
  }
  return { hole: holeIndex + 1, name: def.name, sims: n, hits, best };
}

// MessageChannel yields aren't throttled in background tabs like setTimeout is.
function yieldNow() {
  return new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });
}

/** Run a coarse search on every hole, then refine around the closest miss when nothing holed. */
export async function searchAllHIO(indices = HOLES.map((_, i) => i), log = console.log) {
  const out = {};
  for (const i of indices) {
    const t = performance.now();
    let r = await searchHIO(i, { yawRange: 60, yawStep: 2, pMin: 0.12, pMax: 1, pStep: 0.05, t0s: [0, 2.1] });
    if (!r.hits.length && r.best.yawDeg !== undefined) {
      const b = r.best;
      const r2 = await searchHIO(i, { centerYaw: b.yawDeg, yawRange: 3, yawStep: 0.25, pMin: Math.max(0.05, b.power - 0.08), pMax: Math.min(1, b.power + 0.08), pStep: 0.01, t0s: [b.t0, b.t0 + 0.7, b.t0 + 1.4] });
      r = { ...r, hits: r2.hits, refined: true, sims: r.sims + r2.sims, best: r2.best.cupDist < b.cupDist ? r2.best : b };
    }
    out[i + 1] = { name: r.name, hits: r.hits.length, sample: r.hits.slice(0, 4), best: r.best, refined: !!r.refined, sec: Math.round((performance.now() - t) / 1000) };
    log(`HIO ${i + 1} ${r.name}: ${r.hits.length} hits`, out[i + 1]);
    try { localStorage.setItem('lyokogolf.hio', JSON.stringify(out)); } catch { /* ignore */ }
  }
  return out;
}

/**
 * Ramp check: drop balls (resting, nudged up, nudged down) at points along every ramp of every
 * hole and flag any that end up stopped on a slope with nothing holding them, or hovering in
 * place for 10 s without ever coming to rest (e.g. a booster balanced against gravity).
 */
export async function rampTest(holes = HOLES) {
  const flags = [];
  let n = 0;
  for (const def of holes) {
    const ramps = def.parts.filter((p) => p.t === 'ramp');
    if (!ramps.length) continue;
    const physics = new Physics();
    const scene = new THREE.Scene();
    const course = buildCourse(def, physics, scene);
    course.noAttacks = true;
    const out = { x: 0, y: 0, z: 0, wake: false };
    const env = {
      course, decelMul: 1, bumpers: course.bumpers, zoneDecel: (b) => course.zoneDecel(b),
      forces(b) { out.x = out.y = out.z = 0; out.wake = false; out.launch = null; out.teleport = null; course.zoneForces(b, out); return out; },
      onHole() {}, onFall() {}, onPit() {},
    };
    let t = 0;
    course.update(t, FIXED_DT);
    physics.step();
    for (const r of ramps) {
      const [ax, az] = r.a, [bx, bz] = r.b;
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, w = r.w ?? 3;
      for (const u of [0.15, 0.5, 0.85]) for (const off of [0, 0.3]) for (const kick of [0, 1, -1]) {
        const ball = new Ball(physics, scene, '#fff');
        const x = ax + (bx - ax) * u - uz * off * w / 2, z = az + (bz - az) * u + ux * off * w / 2;
        ball.place(new THREE.Vector3(x, r.ya + (r.yb - r.ya) * u + BALL_R + 0.05, z));
        ball.state = 'moving';
        if (kick) ball.shoot(new THREE.Vector3(ux * kick, 0, uz * kick), 0.08);
        let steps = 0;
        const start = ball.pos;
        let lastMove = 0, ref = new THREE.Vector3(start.x, start.y, start.z);
        while (ball.state === 'moving' && steps < 1200) {
          course.update(t, FIXED_DT); ball.preStep(FIXED_DT, env); physics.step(); ball.postStep(FIXED_DT, env);
          t += FIXED_DT; steps++;
          const p = ball.pos;
          if (ref.distanceTo(p) > 0.5) { ref.set(p.x, p.y, p.z); lastMove = steps; }
        }
        n++;
        const p = ball.pos, where = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
        const tag = `${def.id} ramp@${r.a} u=${u} off=${off} kick=${kick}`;
        if (ball.state === 'idle' && ball.groundNormal.y < 0.99 && !ball.touchingWall() && !ball.groundMeta?.mover) flags.push(`${tag}: stopped on a slope at ${where}`);
        else if (ball.state === 'moving' && steps - lastMove > 600) flags.push(`${tag}: hovering at ${where}`);
        ball.dispose();
      }
      await yieldNow();
    }
    course.dispose();
    physics.dispose();
  }
  return { tested: n, flags };
}

/**
 * Where could a hole's secret warp drop the ball so that only a narrow band of speeds rolls into
 * the cup? Tries exits on a ring round the cup (clear floor all the way, same height), rolls a
 * ball from each at a range of speeds aimed at the cup, and ranks them: fewest holing speeds
 * (but at least one), then farthest out. Returns the candidates, best first.
 */
export async function probeWarp(holeIndex, { radii = [3.5, 4.5, 5.5], step = 30, speeds = null } = {}) {
  const def = HOLES[holeIndex];
  const physics = new Physics();
  const course = buildCourse(def, physics, new THREE.Scene());
  const cup = course.cup;
  const sp = speeds || Array.from({ length: 28 }, (_, i) => 1.2 + i * 0.3);
  const cands = [];
  for (let a = 0; a < 360; a += step) for (const R of radii) {
    const dx = Math.sin(a * Math.PI / 180), dz = Math.cos(a * Math.PI / 180);
    const ex = [cup.x - dx * R, cup.y, cup.z - dz * R];
    let clear = true;
    for (let k = 0; k <= R; k += 0.25) {
      const y = course.floorYAt(cup.x - dx * (R - k), cup.z - dz * (R - k));
      if (y === null || Math.abs(y - cup.y) > 0.03) { clear = false; break; }
    }
    if (clear) cands.push({ angle: a, R, exit: ex, dir: [dx, dz] });
  }
  course.dispose(); physics.dispose();
  const res = [];
  for (const c of cands) {
    const holed = [];
    for (const s of sp) {
      const r = simulateShot(def, { from: [c.exit[0] + c.dir[0] * 0.2, c.exit[1], c.exit[2] + c.dir[1] * 0.2], vel: [c.dir[0] * s, 0.5, c.dir[1] * s], maxTime: 8 });
      if (r.result === 'hole') holed.push(+s.toFixed(2));
    }
    res.push({ ...c, holed });
    await yieldNow();
  }
  return res.filter((c) => c.holed.length).sort((a, b) => a.holed.length - b.holed.length || b.R - a.R);
}

/**
 * Run the standard ace-search grid on a hole and note every shot that drops into a warp mouth:
 * its entry speed, the hole time it entered, and how much of its 16 s it had left.
 */
export async function warpEntries(holeIndex) {
  const def = HOLES[holeIndex];
  const tee = def.tee, cupP = def.cup;
  const base = (def.yaw ?? Math.atan2(cupP[0] - tee[0], cupP[2] - tee[2])) * 180 / Math.PI;
  const list = [];
  let hits = 0;
  for (const t0 of [0, 2.1]) {
    for (let dy = -60; dy <= 60 + 1e-6; dy += 2) {
      for (let p = 0.12; p <= 1 + 1e-6; p += 0.05) {
        let e = null;
        const r = simulateShot(def, { yaw: (base + dy) * Math.PI / 180, power: p, t0, onWarp: (v, t) => { if (!e) e = [+v.toFixed(3), +t.toFixed(4), +(16 - (t - t0)).toFixed(3)]; } });
        if (r.result === 'hole') hits++;
        if (e) list.push(e);
      }
      await yieldNow();
    }
  }
  return { hits, entries: list.length, list };
}

/**
 * Tune a hole's secret warp so it aces about `target` times on the standard search grid.
 * The warp's exit speed is max(entry × gain, minSpeed). For exits on rings round the cup (clear,
 * level floor all the way in, aimed at the cup):
 *  1. a quick model: which exit speeds hole from there (sampled every 0.05), and so how many of
 *     the recorded entries each gain would ace;
 *  2. the best few (exit, gain) pairs are then checked exactly: every recorded entry is replayed
 *     from the exit at its own speed × gain, at the moment it entered, with the time it had left.
 * Returns the validated pairs, closest to the target first. `entries` is warpEntries()'s result.
 */
export async function tuneWarp(holeIndex, {
  entries = null, radii = [3, 4.5, 6, 7.5], step = 30, minSpeed = 0.5, target = 8, shortlist = 10,
  gains = Array.from({ length: 236 }, (_, i) => +(0.3 + i * 0.02).toFixed(2)),
} = {}) {
  const def = HOLES[holeIndex];
  const ent = entries || await warpEntries(holeIndex);
  const physics = new Physics();
  const course = buildCourse(def, physics, new THREE.Scene());
  const cup = course.cup;
  const cands = [];
  for (let a = 0; a < 360; a += step) for (const R of radii) {
    const dx = Math.sin(a * Math.PI / 180), dz = Math.cos(a * Math.PI / 180);
    let clear = true;
    for (let k = 0; k <= R; k += 0.25) {
      const y = course.floorYAt(cup.x - dx * (R - k), cup.z - dz * (R - k));
      if (y === null || Math.abs(y - cup.y) > 0.03) { clear = false; break; }
    }
    if (clear) cands.push({ angle: a, R, exit: [+(cup.x - dx * R).toFixed(2), cup.y, +(cup.z - dz * R).toFixed(2)], dir: [+dx.toFixed(3), +dz.toFixed(3)] });
  }
  course.dispose(); physics.dispose();
  const roll = (c, sp, t0 = 0, maxTime = 16) => simulateShot(def, { from: [c.exit[0] + c.dir[0] * 0.2, c.exit[1], c.exit[2] + c.dir[1] * 0.2], vel: [c.dir[0] * sp, 0.5, c.dir[1] * sp], t0, maxTime });
  // 1. the quick model
  const STEP = 0.05, MAX = 14;
  const model = [];
  for (const c of cands) {
    const H = [];
    for (let sp = minSpeed; sp <= MAX + 1e-6; sp += STEP) H.push(roll(c, sp).result === 'hole');
    await yieldNow();
    if (!H.some(Boolean)) continue;
    const count = (g) => {
      let n = 0;
      for (const [s] of ent.list) if (H[Math.min(H.length - 1, Math.round((Math.max(minSpeed, s * g) - minSpeed) / STEP))]) n++;
      return n;
    };
    for (const g of gains) {
      const ns = [count(g - 0.02), count(g), count(g + 0.02)];
      model.push({ ...c, gain: g, model: ns[1], score: ns.reduce((a, n) => a + Math.abs(n - target), 0) });
    }
  }
  model.sort((a, b) => a.score - b.score || b.R - a.R);
  // 2. check the best few exactly (at most two gains per exit)
  const perExit = new Map(), picks = [];
  for (const m of model) {
    const k = m.exit.join(), n = perExit.get(k) || 0;
    if (n >= 2) continue;
    perExit.set(k, n + 1);
    picks.push(m);
    if (picks.length >= shortlist) break;
  }
  const best = [];
  for (const m of picks) {
    let hits = 0;
    for (const [s, te, left] of ent.list) if (roll(m, Math.max(minSpeed, s * m.gain), te, left).result === 'hole') hits++;
    best.push({ exit: m.exit, dir: m.dir, R: m.R, gain: m.gain, model: m.model, hits });
    await yieldNow();
  }
  best.sort((a, b) => Math.abs(a.hits - target) - Math.abs(b.hits - target) || b.R - a.R);
  return { hole: holeIndex, id: def.id, hits: ent.hits, entries: ent.entries, list: ent.list, best };
}

const segDist = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + dx * u), pz - (az + dz * u));
};

/**
 * Regression check for the "ball falls through the cup" bug: every side triangle of every hole in
 * every floor slab (cups, sinkholes, polygon holes) must face into its hole. The floor collider is a
 * one-sided trimesh, so a wall facing into the slab pushes a ball in the hole straight through it.
 */
export function cupWalls(holes = HOLES) {
  const bad = [];
  let checked = 0;
  for (const def of holes) {
    const physics = new Physics();
    const course = buildCourse(def, physics, new THREE.Scene());
    for (const f of course.floors) {
      if (!f.holes.length) continue;
      const geo = slabGeometry(f.poly, f.holes, f.y, f.th ?? 0.6);
      const pos = geo.attributes.position, idx = geo.index;
      const n = (idx ? idx.count : pos.count) / 3;
      const polys = f.holes.map((h) => h.poly || circlePoly(h.c[0], h.c[1], h.r, 28));
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), mid = new THREE.Vector3();
      for (let t = 0; t < n; t++) {
        const k = (j) => (idx ? idx.getX(t * 3 + j) : t * 3 + j);
        a.fromBufferAttribute(pos, k(0)); b.fromBufferAttribute(pos, k(1)); c.fromBufferAttribute(pos, k(2));
        nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
        if (Math.abs(nrm.y) > 0.1) continue; // top / bottom caps
        mid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
        for (const hp of polys) {
          let onEdge = false;
          for (let e = 0; e < hp.length && !onEdge; e++) onEdge = segDist(mid.x, mid.z, hp[e], hp[(e + 1) % hp.length]) < 0.01;
          if (!onEdge) continue;
          checked++;
          if (!pointInPoly(mid.x + nrm.x * 0.02, mid.z + nrm.z * 0.02, hp)) bad.push(`${def.id} @${mid.x.toFixed(2)},${mid.z.toFixed(2)}`);
        }
      }
      geo.dispose();
    }
    course.dispose(); physics.dispose();
  }
  return { checked, bad: bad.length, sample: bad.slice(0, 10) };
}

const CUP_VARIANTS = {
  normal: null,
  ghost: (b) => b.setGhost(true),
  fun: (b) => b.setRadius(BALL_R * 0.55),
  super: (b) => b.setRadius(BALL_R * 2.35),
};

/**
 * Roll balls at every real (physical) cup from all around, at a range of offsets and speeds, and
 * report the outcomes. A ball whose centre ever gets below the floor inside the cup must hole out:
 * anything else (a fall into the Digital Sea above all) is a leak. Super-sized balls must never hole.
 */
export async function cupTest({
  holes = HOLES, dirs = 8, offsets = [0, 0.1, 0.2, 0.3, 0.42], speeds = [0.5, 1, 2, 3, 4.5, 6, 8, 10, 12],
  variants = ['normal', 'ghost', 'fun', 'super'],
} = {}) {
  const out = { cups: 0, shots: 0, counts: {}, leaks: [], superHoled: 0 };
  for (const def of holes) {
    const physics = new Physics();
    const course = buildCourse(def, physics, new THREE.Scene());
    const cups = course.cups.filter((c) => c.physical).map((c) => ({ x: c.x, y: c.y, z: c.z }));
    const floorAt = (x, z) => course.floorYAt(x, z);
    const starts = [];
    for (const cup of cups) {
      for (let k = 0; k < dirs; k++) {
        const a = (k / dirs) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
        for (const off of offsets) {
          const sx = cup.x - dx * 2.5 - dz * off, sz = cup.z - dz * 2.5 + dx * off;
          const fy = floorAt(sx, sz);
          if (fy === null || Math.abs(fy - cup.y) > 0.05) continue; // no level floor to roll from
          starts.push({ cup, from: [sx, cup.y, sz], dir: [dx, dz], off });
        }
      }
    }
    course.dispose(); physics.dispose();
    out.cups += cups.length;
    for (const s of starts) {
      for (const v of variants) {
        // the odd balls (ghost, resized) get a smaller grid: two offsets, four speeds
        if (v !== 'normal' && s.off !== 0 && s.off !== 0.2) continue;
        const sps = v === 'normal' ? speeds : [1, 3, 6, 10];
        for (const sp of sps) {
          let entered = false;
          const r = simulateShot(def, {
            from: s.from, vel: [s.dir[0] * sp, 0, s.dir[1] * sp], maxTime: 6, setup: CUP_VARIANTS[v],
            onStep: (b) => { const p = b.pos; if (Math.hypot(p.x - s.cup.x, p.z - s.cup.z) < CUP_R && p.y < s.cup.y) entered = true; },
          });
          out.shots++;
          const key = `${v}:${r.result}`;
          out.counts[key] = (out.counts[key] || 0) + 1;
          if (v === 'super' && r.result === 'hole') out.superHoled++;
          if (entered && r.result !== 'hole' && v !== 'super') out.leaks.push({ id: def.id, v, from: s.from.map((x) => +x.toFixed(2)), sp, result: r.result, end: r.pos });
        }
      }
      await yieldNow();
    }
  }
  return out;
}
