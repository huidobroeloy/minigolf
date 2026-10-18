// Green audit (?debug=1 → __greenAudit({ holes })): how easy is the hole itself (not its approach lane)?
// From the old tee (where the lane joins the hole) it fires a fan of shots at the cup and reports how
// many hole out and how many stop within 1.2 of the cup. A high score means a hole is a gimme.
import * as THREE from 'three';
import { Physics } from '../physics/world.js';
import { buildCourse } from '../course/builder.js';
import { HOLES } from '../holes/index.js';
import { simulateShot } from './sim.js';

/** Where the hole proper starts: the old tee on lengthened holes, else the tee. */
export function greenStart(def) {
  const r = def.route;
  if (!r || r.length < 2) return def.tee;
  const [x, z] = r[r.length - 2];
  const physics = new Physics();
  const course = buildCourse(def, physics, new THREE.Scene());
  const y = course.floorYAt(x, z) ?? def.tee[1];
  course.dispose(); physics.dispose();
  return [x, y, z];
}

export async function greenAudit({ holes = null, yawRange = 30, yawStep = 3, pStep = 0.05, onProgress = null } = {}) {
  const out = [];
  const list = holes ?? HOLES.map((_, i) => i).filter((i) => HOLES[i].sector !== 'fortune' && HOLES[i].sector !== 'core');
  for (const i of list) {
    const def = HOLES[i];
    const from = greenStart(def);
    const yaw0 = Math.atan2(def.cup[0] - from[0], def.cup[2] - from[2]);
    let n = 0, holed = 0, near = 0;
    for (let dy = -yawRange; dy <= yawRange + 1e-6; dy += yawStep) {
      for (let pw = 0.1; pw <= 1 + 1e-6; pw += pStep) {
        const r = simulateShot(def, { yaw: yaw0 + (dy * Math.PI) / 180, power: pw, from, maxTime: 14 });
        n++;
        if (r.result === 'hole') holed++;
        else if (r.result === 'rest' && r.cupDist <= 1.2) near++;
      }
      await new Promise((res) => setTimeout(res, 0)); // keep the page alive
    }
    const row = { i, id: def.id, par: def.par, dist: +Math.hypot(def.cup[0] - from[0], def.cup[2] - from[2]).toFixed(1), shots: n, holed: +(holed / n * 100).toFixed(1), near: +(near / n * 100).toFixed(1) };
    row.ease = +(row.holed * 3 + row.near).toFixed(1);
    out.push(row);
    onProgress?.(row);
  }
  return out.sort((a, b) => b.ease - a.ease);
}

/**
 * Putting test (?debug=1 → __puttAudit({ holes })): from 8 spots 3 units round the cup (those on the
 * green, about the cup's height), a fan of putts. A high holed % means the cup has nothing guarding it.
 */
export async function puttAudit({ holes = null, r = 3, onProgress = null } = {}) {
  const out = [];
  const list = holes ?? HOLES.map((_, i) => i).filter((i) => HOLES[i].sector !== 'fortune' && HOLES[i].sector !== 'core');
  for (const i of list) {
    const def = HOLES[i];
    const physics = new Physics();
    const course = buildCourse(def, physics, new THREE.Scene());
    const spots = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = def.cup[0] + Math.sin(a) * r, z = def.cup[2] + Math.cos(a) * r;
      const y = course.floorYAt(x, z);
      if (y !== null && Math.abs(y - def.cup[1]) < 0.6 && !course.lavaAt?.({ x, y: y + 0.18, z }, { radius: 0.18, mods: {} }) && !course.unsafeAt?.({ x, y: y + 0.2, z })) spots.push([x, y, z]);
    }
    course.dispose(); physics.dispose();
    let n = 0, holed = 0;
    for (const from of spots) {
      const yaw0 = Math.atan2(def.cup[0] - from[0], def.cup[2] - from[2]);
      for (let dy = -12; dy <= 12; dy += 3) {
        for (let pw = 0.1; pw <= 0.6 + 1e-6; pw += 0.05) {
          const res = simulateShot(def, { yaw: yaw0 + (dy * Math.PI) / 180, power: pw, from, maxTime: 10 });
          n++;
          if (res.result === 'hole') holed++;
        }
      }
      await new Promise((res) => setTimeout(res, 0));
    }
    const row = { i, id: def.id, spots: spots.length, shots: n, putt: n ? +(holed / n * 100).toFixed(1) : null };
    out.push(row);
    onProgress?.(row);
  }
  return out.sort((a, b) => (b.putt ?? 0) - (a.putt ?? 0));
}
