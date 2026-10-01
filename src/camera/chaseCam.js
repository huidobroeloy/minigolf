import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Low chase camera behind the ball, looking along the aim direction. */
export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;          // aim direction: (sin yaw, 0, cos yaw)
    this.pitch = 0.32;
    this.dist = 3.4;
    this.mode = 'chase';   // chase | tactical (aerial, pan/zoom/rotate)
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
  tilt(d) { this.pitch = THREE.MathUtils.clamp(this.pitch + d, 0.05, 1.35); }
  zoom(f) { this.dist = THREE.MathUtils.clamp(this.dist * f, 1.4, 14); }

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
    const h = Math.cos(this.pitch) * this.dist;
    const v = Math.sin(this.pitch) * this.dist + 0.25;
    this._pos.copy(this.smoothTarget).addScaledVector(d, -h).addScaledVector(UP, v);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this._pos.x += (Math.random() - 0.5) * this.shake * 0.4;
      this._pos.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    this.camera.position.copy(this._pos);
    this._look.copy(this.smoothTarget).addScaledVector(d, 1.6).addScaledVector(UP, 0.15);
    this.camera.lookAt(this._look);
  }
}
