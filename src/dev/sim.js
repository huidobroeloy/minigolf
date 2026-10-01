import * as THREE from 'three';
import { Physics, FIXED_DT } from '../physics/world.js';
import { Ball, BALL_R } from '../physics/ball.js';
import { buildCourse } from '../course/builder.js';
import { HOLES } from '../holes/index.js';

/**
 * Dev tool: simulate one shot headlessly (no rendering, no wobble) and report what happened.
 * Used to prove every hole has a hole-in-one line.
 */
export function simulateShot(def, { yaw, power, t0 = 0, chip = false, maxTime = 25, trace = false }) {
  const physics = new Physics();
  const scene = new THREE.Scene();
  const course = buildCourse(def, physics, scene);
  const ball = new Ball(physics, scene, '#fff');
  course.localBall = ball;
  course.noAttacks = true; // hornet lasers are random; leave them out of the search
  ball.place(course.tee.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
  let result = null;
  const out = { x: 0, y: 0, z: 0, wake: false };
  const env = {
    course,
    forces(b) { out.x = out.y = out.z = 0; out.wake = false; out.teleport = null; course.zoneForces(b, out); return out; },
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
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  ball.shoot(dir, power, { chip });
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
    if (trace && steps % 6 === 0) { const p = ball.pos; path.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]); }
    if (ball.state === 'idle') { result = 'rest'; break; }
  }
  const p = ball.state === 'holed' ? course.cup : ball.pos;
  const res = { result: result || 'timeout', pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], time: +(t - t0).toFixed(2) };
  if (trace) res.path = path;
  const cup = course.cup;
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
