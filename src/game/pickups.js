import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { CATEGORY_COLORS, pickupCategories } from '../powerups/registry.js';
import { makePickup } from '../fx/models.js';

/**
 * Pickups are placed identically on every client from the hole seed. Each shows its
 * category (halo colour); the host rolls the exact power-up when someone claims it.
 */
export class Pickups {
  constructor(course, seed, count, taken = [], cats = null) {
    this.course = course;
    this.items = [];
    const rng = new RNG(seed ^ 0x9e3779b9);
    const categories = cats || pickupCategories(seed, count, RNG);
    const spots = course.def.pickups ? course.def.pickups.map((p) => new THREE.Vector3(...p)) : [];
    for (let i = 0; i < count; i++) {
      let pos;
      if (i < spots.length) pos = spots[i];
      else {
        pos = course.randomFloorPoint(rng);
        let guard = 0;
        while (guard++ < 20 && (pos.distanceTo(course.tee) < 2 || Math.hypot(pos.x - course.cup.x, pos.z - course.cup.z) < 1.5)) pos = course.randomFloorPoint(rng);
      }
      const item = { i, pos: pos.clone(), cat: categories[i], mesh: null, taken: !!taken[i], claimed: false, phase: rng.range(0, 6), born: -10 };
      this.makeMesh(item);
      this.items.push(item);
    }
  }

  makeMesh(item) {
    if (item.mesh) this.course.group.remove(item.mesh);
    item.mesh = makePickup(CATEGORY_COLORS[item.cat]);
    item.mesh.position.set(item.pos.x, item.pos.y + 0.5, item.pos.z);
    item.mesh.visible = !item.taken;
    this.course.group.add(item.mesh);
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

  respawn(i, cat, t) {
    const it = this.items[i];
    if (!it) return null;
    it.taken = false;
    it.claimed = false;
    it.cat = cat;
    it.born = t;
    this.makeMesh(it);
    return it;
  }

  frame(t) {
    for (const it of this.items) {
      if (it.taken) continue;
      const u = it.mesh.userData;
      const grow = Math.min(1, Math.max(0.01, (t - it.born) / 0.6));
      it.mesh.scale.setScalar(grow);
      it.mesh.position.y = it.pos.y + 0.5 + Math.sin(t * 2 + it.phase) * 0.06;
      u.orb.position.y = Math.sin(t * 2.6 + it.phase) * 0.05;
      u.orb.rotation.y = t * 1.3 + it.phase;
      u.cage.rotation.y = -t * 0.4;
      u.halo.scale.setScalar(1 + Math.sin(t * 4 + it.phase) * 0.08);
      u.column.material.opacity = 0.18 + Math.sin(t * 3 + it.phase) * 0.06;
    }
  }
}
