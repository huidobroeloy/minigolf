import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Low chase camera behind the ball, looking along the aim direction. */
export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;          // aim direction: (sin yaw, 0, cos yaw)
    this.pitch = 0.32;
    this.dist = 3.4;
    this.mode = 'chase';   // chase | overhead
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
  }

  rotate(d) { this.yaw += d; }
  tilt(d) { this.pitch = THREE.MathUtils.clamp(this.pitch + d, 0.05, 1.35); }
  zoom(f) { this.dist = THREE.MathUtils.clamp(this.dist * f, 1.4, 14); }

  update(dt) {
    const k = 1 - Math.exp(-dt * 10);
    this.smoothTarget.lerp(this.target, k);
    if (this.mode === 'overhead') {
      const c = this.overhead.center;
      this._pos.set(c.x - Math.sin(this.yaw) * 6, c.y + this.overhead.height, c.z - Math.cos(this.yaw) * 6);
      this.camera.position.lerp(this._pos, k);
      this.camera.lookAt(c);
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
