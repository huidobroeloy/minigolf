import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { POWERUP_IDS, WEIGHTS } from '../powerups/registry.js';
import { makePickup } from '../fx/models.js';

/**
 * Pickups are generated identically on every client from the hole seed,
 * so the host only arbitrates who claimed which index first.
 */
export class Pickups {
  constructor(course, seed, count, taken = []) {
    this.course = course;
    this.items = [];
    const rng = new RNG(seed ^ 0x9e3779b9);
    const spots = course.def.pickups ? course.def.pickups.map((p) => new THREE.Vector3(...p)) : [];
    for (let i = 0; i < count; i++) {
      let pos;
      if (i < spots.length) pos = spots[i];
      else {
        pos = course.randomFloorPoint(rng);
        // not right on the tee or cup
        let guard = 0;
        while (guard++ < 20 && (pos.distanceTo(course.tee) < 2 || Math.hypot(pos.x - course.cup.x, pos.z - course.cup.z) < 1.5)) pos = course.randomFloorPoint(rng);
      }
      const type = rng.weighted(POWERUP_IDS, (id) => WEIGHTS[id] ?? 5);
      const mesh = makePickup();
      mesh.position.set(pos.x, pos.y + 0.45, pos.z);
      course.group.add(mesh);
      const item = { i, pos: pos.clone(), type, mesh, taken: !!taken[i], claimed: false, phase: rng.range(0, 6) };
      mesh.visible = !item.taken;
      this.items.push(item);
    }
  }

  /** Returns indices the local ball touches this step (to claim with the host). */
  touching(ballPos, radius) {
    const out = [];
    for (const it of this.items) {
      if (it.taken || it.claimed) continue;
      const dx = ballPos.x - it.pos.x, dz = ballPos.z - it.pos.z, dy = ballPos.y - (it.pos.y + 0.2);
      if (dx * dx + dz * dz < (0.45 + radius) ** 2 && Math.abs(dy) < 0.9) { it.claimed = true; out.push(it.i); }
    }
    return out;
  }

  take(i) {
    const it = this.items[i];
    if (!it) return null;
    it.taken = true;
    it.mesh.visible = false;
    return it;
  }

  frame(t) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y = t * 1.6 + it.phase;
      it.mesh.rotation.x = Math.sin(t + it.phase) * 0.3;
      it.mesh.position.y = it.pos.y + 0.45 + Math.sin(t * 2.2 + it.phase) * 0.08;
    }
  }
}
