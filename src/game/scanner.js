import * as THREE from 'three';
import { Physics, FIXED_DT } from '../physics/world.js';
import { Ball } from '../physics/ball.js';
import { buildCourse } from '../course/builder.js';

/**
 * Jérémie's Scanner: predicts the next shot by replaying it in a private, invisible copy
 * of the course (same physics, same monster clock), then draws the path as holo dots.
 */
export class Scanner {
  constructor(def, scene) {
    this.def = def;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.dotGeo = new THREE.SphereGeometry(0.05, 6, 4);
    this.dotMat = new THREE.MeshBasicMaterial({ color: '#7fffd4', transparent: true, opacity: 0.85, depthWrite: false });
    this.endMat = new THREE.MeshBasicMaterial({ color: '#7fffd4', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.last = { t: 0, yaw: NaN, power: NaN };
  }

  ensure() {
    if (this.physics) return;
    this.physics = new Physics();
    this.dummy = new THREE.Scene();
    this.course = buildCourse(this.def, this.physics, this.dummy);
    this.course.noAttacks = true;
    this.ball = new Ball(this.physics, this.dummy, '#fff');
    this.course.localBall = this.ball;
    const out = { x: 0, y: 0, z: 0, wake: false };
    const course = this.course;
    this.env = {
      course,
      forces: (b) => { out.x = out.y = out.z = 0; out.wake = false; out.teleport = null; out.launch = null; course.zoneForces(b, out); return out; },
      decelMul: 1,
      zoneDecel: (b) => course.zoneDecel(b),
      stickyWalls: false,
      bumpers: course.bumpers,
      onHole: () => { this.result = 'hole'; },
      onFall: () => { this.result = 'fall'; },
      onPit: () => { this.result = 'fall'; },
    };
  }

  /** Recompute only when the aim changed meaningfully (and at most every 150 ms). */
  update(from, yaw, power, t0, mods, env) {
    const now = performance.now();
    if (now - this.last.t < 150) return;
    if (Math.abs(yaw - this.last.yaw) < 0.004 && Math.abs(power - this.last.power) < 0.01) return;
    this.last = { t: now, yaw, power };
    this.ensure();
    const b = this.ball;
    b.setRadius(mods.radius);
    Object.assign(b.mods, { speedMul: mods.speedMul, decelMul: mods.decelMul, sticky: mods.sticky, magnet: mods.magnet, leash: null });
    b.setGhost(mods.ghost);
    this.env.decelMul = env.decelMul;
    this.env.stickyWalls = env.stickyWalls;
    this.env.bumpers = env.bumpers;
    b.place(from);
    let t = t0;
    this.course.update(t - FIXED_DT, FIXED_DT);
    this.physics.step();
    b.state = 'idle';
    b.shoot(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), power * (mods.powerMul ?? 1), { chip: mods.chip });
    this.result = null;
    const pts = [];
    for (let i = 0; i < 480 && !this.result; i++) {
      this.course.update(t, FIXED_DT);
      b.preStep(FIXED_DT, this.env);
      this.physics.step();
      b.postStep(FIXED_DT, this.env);
      if (b.state === 'sinking') { this.result = 'hole'; }
      if (b.state === 'idle') { this.result = 'rest'; }
      t += FIXED_DT;
      if (i % 5 === 0) { const p = b.pos; pts.push(new THREE.Vector3(p.x, p.y - b.radius + 0.06, p.z)); }
    }
    const end = b.state === 'sinking' ? b.sinkFrom : b.pos;
    this.draw(pts, end && new THREE.Vector3(end.x, end.y - b.radius + 0.03, end.z));
  }

  draw(pts, end) {
    this.group.clear();
    for (let i = 0; i < pts.length; i++) {
      const d = new THREE.Mesh(this.dotGeo, this.dotMat);
      d.position.copy(pts[i]);
      d.scale.setScalar(1 - (i / pts.length) * 0.5);
      this.group.add(d);
    }
    if (end && this.result !== 'fall') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), this.endMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(end);
      this.group.add(ring);
    }
  }

  hide() { this.group.clear(); this.last.yaw = NaN; }

  dispose() {
    this.scene.remove(this.group);
    if (this.physics) { this.ball.dispose(); this.course.dispose(); this.physics.dispose(); this.physics = null; }
  }
}
