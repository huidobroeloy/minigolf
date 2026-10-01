import * as THREE from 'three';
import { makeLabel } from '../fx/models.js';
import { applyCharacter } from './characters.js';

/** Other players' balls: interpolated from their ~15Hz state broadcasts. No collisions with yours. */
export class Ghosts {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.geo = new THREE.SphereGeometry(1, 20, 14);
  }

  ensure(p) {
    let g = this.map.get(p.id);
    if (g) return g;
    const mat = new THREE.MeshPhysicalMaterial({ color: p.color, roughness: 0.25, clearcoat: 1, emissive: p.color, emissiveIntensity: 0.12, transparent: true, opacity: 0.8 });
    applyCharacter(mat, p.color);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.castShadow = true;
    mesh.scale.setScalar(0.18);
    const label = makeLabel(p.name, p.color);
    this.scene.add(mesh);
    this.scene.add(label);
    g = { id: p.id, mesh, label, target: null, state: 'idle', radius: 0.18, seen: false, trailColor: new THREE.Color(p.color) };
    this.map.set(p.id, g);
    return g;
  }

  setState(id, msg) {
    const g = this.map.get(id);
    if (!g) return;
    g.target = new THREE.Vector3(msg.p[0], msg.p[1], msg.p[2]);
    if (!g.seen) { g.mesh.position.copy(g.target); g.seen = true; }
    g.state = msg.s;
    g.radius = msg.r ?? 0.18;
    g.ghostMode = !!msg.g;
    const cl = Array.isArray(msg.cl) ? msg.cl : [];
    g.clones ||= [];
    while (g.clones.length < cl.length) {
      const m = new THREE.Mesh(this.geo, g.mesh.material.clone());
      m.material.opacity = 0.45;
      m.scale.setScalar(0.18);
      this.scene.add(m);
      g.clones.push(m);
    }
    g.clones.forEach((m, i) => { m.visible = i < cl.length; if (cl[i]) m.position.set(cl[i][0], cl[i][1], cl[i][2]); });
  }

  /** Teleports (switch, respawn) jump instead of sliding across the map. */
  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (const g of this.map.values()) {
      if (g.target) {
        const before = g.mesh.position.clone();
        if (g.mesh.position.distanceTo(g.target) > 4) g.mesh.position.copy(g.target);
        else g.mesh.position.lerp(g.target, k);
        const sp = dt > 0 ? before.distanceTo(g.mesh.position) / dt : 0;
        if (sp > 2.5 && sp < 60 && g.state !== 'holed') this.onTrail?.(g.mesh.position, g.trailColor, g.radius);
      }
      const visible = g.seen && g.state !== 'holed' && g.state !== 'gone';
      g.mesh.visible = visible;
      g.label.visible = visible;
      g.mesh.scale.setScalar(g.radius);
      g.mesh.material.opacity = g.ghostMode ? 0.35 : 0.8;
      g.label.position.set(g.mesh.position.x, g.mesh.position.y + g.radius + 0.4, g.mesh.position.z);
    }
  }

  position(id) {
    const g = this.map.get(id);
    return g && g.seen && g.state !== 'holed' ? g.mesh.position : null;
  }

  remove(id) {
    const g = this.map.get(id);
    if (!g) return;
    this.scene.remove(g.mesh);
    this.scene.remove(g.label);
    for (const m of g.clones || []) this.scene.remove(m);
    g.mesh.material.dispose();
    g.label.material.map.dispose();
    g.label.material.dispose();
    this.map.delete(id);
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }
}
