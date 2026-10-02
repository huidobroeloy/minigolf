import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export const VIEWS = ['chase', 'pov', 'aerial'];
export const VIEW_INFO = {
  chase: { icon: '🎥', name: 'Chase camera' },
  pov: { icon: '🔭', name: 'First person' },
  aerial: { icon: '🛰️', name: 'Aerial view' },
};

/**
 * The player camera. `view` is the player's choice (chase / first-person / aerial, all of which
 * can aim and shoot); `mode` 'tactical' is the free map view used while placing power-ups.
 */
export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;          // aim direction: (sin yaw, 0, cos yaw)
    this.pitch = 0.32;
    this.dist = 3.4;
    this.mode = 'chase';   // chase | tactical (power-up targeting map)
    this.view = 'chase';   // chase | pov | aerial
    this.aerial = { h: 14, min: 4, max: 45, off: new THREE.Vector3() };
    this.tac = { center: new THREE.Vector3(), height: 30, min: 6, max: 60, bounds: null };
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.overhead = { center: new THREE.Vector3(), height: 30 };
    this.shake = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  get dir() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  snapTo(p) {
    this.target.copy(p);
    this.smoothTarget.copy(p);
  }

  setOverhead(course) {
    this.overhead.center.copy(course.center);
    this.overhead.height = Math.max(course.size.x, course.size.z) * 0.95 + 8;
    this.tac.bounds = course.bounds.clone().expandByScalar(4);
    this.resetTactical();
  }

  /** Aerial view framing the whole course. */
  resetTactical() {
    this.tac.center.copy(this.overhead.center);
    this.tac.height = this.overhead.height;
    this.tac.max = this.overhead.height * 1.6;
    this.tac.yaw = this.yaw;
  }

  /** Drag the map: screen pixels → ground movement (the course follows your finger). */
  pan(dx, dy) {
    const k = this.tac.height * 0.0016;
    const y = this.tac.yaw;
    const fx = Math.sin(y), fz = Math.cos(y);
    const rx = -Math.cos(y), rz = Math.sin(y);
    this.tac.center.x += -rx * dx * k + fx * dy * k;
    this.tac.center.z += -rz * dx * k + fz * dy * k;
    const b = this.tac.bounds;
    if (b) {
      this.tac.center.x = THREE.MathUtils.clamp(this.tac.center.x, b.min.x, b.max.x);
      this.tac.center.z = THREE.MathUtils.clamp(this.tac.center.z, b.min.z, b.max.z);
    }
  }

  tacZoom(f) { this.tac.height = THREE.MathUtils.clamp(this.tac.height * f, this.tac.min, this.tac.max); }
  tacRotate(d) { this.tac.yaw += d; }

  rotate(d) { this.yaw += d; }

  cycleView() {
    this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length];
    this.aerial.off.set(0, 0, 0);
    return this.view;
  }

  aerialZoom(f) { this.aerial.h = THREE.MathUtils.clamp(this.aerial.h * f, this.aerial.min, this.aerial.max); }

  /** Aerial view: drag the map around your ball (screen pixels → ground). */
  aerialPan(dx, dy) {
    const k = this.aerial.h * 0.0018;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    this.aerial.off.x += -rx * dx * k + fx * dy * k;
    this.aerial.off.z += -rz * dx * k + fz * dy * k;
    const L = this.aerial.off.length(), max = this.aerial.h * 1.5;
    if (L > max) this.aerial.off.multiplyScalar(max / L);
  }
  tilt(d) { this.pitch = THREE.MathUtils.clamp(this.pitch + d, 0.05, 1.35); }
  zoom(f) { this.dist = THREE.MathUtils.clamp(this.dist * f, 1.4, 14); }

  applyShake(dt) {
    if (this.shake <= 0) return;
    this.shake = Math.max(0, this.shake - dt * 2);
    this._pos.x += (Math.random() - 0.5) * this.shake * 0.4;
    this._pos.y += (Math.random() - 0.5) * this.shake * 0.4;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 10);
    this.smoothTarget.lerp(this.target, k);
    if (this.mode === 'tactical') {
      const c = this.tac.center, h = this.tac.height, y = this.tac.yaw;
      this._pos.set(c.x - Math.sin(y) * h * 0.42, c.y + h, c.z - Math.cos(y) * h * 0.42);
      this.camera.position.lerp(this._pos, k);
      this._look.lerp(c, k);
      this.camera.lookAt(this._look);
      return;
    }
    const d = this.dir;
    if (this.view === 'pov') {
      // first person: just behind and above the ball, looking along the aim (tilt looks up/down)
      this._pos.copy(this.smoothTarget).addScaledVector(d, -0.5).addScaledVector(UP, 0.3);
      this.applyShake(dt);
      this.camera.position.copy(this._pos);
      this._look.copy(this.smoothTarget).addScaledVector(d, 4).addScaledVector(UP, 0.35 - (this.pitch - 0.32) * 4);
      this.camera.lookAt(this._look);
      return;
    }
    if (this.view === 'aerial') {
      // high above the ball (zoom with wheel/pinch, drag to look around), facing the aim
      const a = this.aerial;
      const c = this._look.copy(this.smoothTarget).add(a.off);
      this._pos.copy(c).addScaledVector(d, -a.h * 0.32).addScaledVector(UP, a.h);
      this.applyShake(dt);
      this.camera.position.lerp(this._pos, Math.min(1, k * 1.5));
      this.camera.lookAt(c.addScaledVector(d, a.h * 0.06));
      return;
    }
    const h = Math.cos(this.pitch) * this.dist;
    const v = Math.sin(this.pitch) * this.dist + 0.25;
    this._pos.copy(this.smoothTarget).addScaledVector(d, -h).addScaledVector(UP, v);
    this.applyShake(dt);
    this.camera.position.copy(this._pos);
    this._look.copy(this.smoothTarget).addScaledVector(d, 1.6).addScaledVector(UP, 0.15);
    this.camera.lookAt(this._look);
  }
}
