import * as THREE from 'three';
import { R, GROUP, cg, SURFACES, GRAVITY } from './world.js';

export const BALL_R = 0.18;
export const MAX_SHOT_SPEED = 17;
export const CUP_R = 0.36;

export const BALL_NORMAL = cg(GROUP.BALL, GROUP.FLOOR | GROUP.WALL | GROUP.OBST);
export const BALL_GHOST = cg(GROUP.BALL, GROUP.FLOOR | GROUP.GHOSTFLOOR);

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Aim wobble: the aim line sways while you line up a shot, and the putt goes wherever the
 * line points at the moment you release. Returns an angle offset in RADIANS added to the aim yaw.
 *   t       – time in seconds (keeps swaying while you hold)
 *   power01 – current power 0..1 (harder shots are harder to control)
 *   steady  – true when the Steady Aim power-up is active
 */
export function aimWobble(t, power01, steady) {
  if (steady) return 0;
  // two incommensurate sines → a sway that never quite repeats, so it can't be memorised
  const sway = Math.sin(t * 2.1) * 0.7 + Math.sin(t * 3.7 + 1.3) * 0.3;
  const maxDeg = 1.0 + 3.5 * power01 * power01;
  return THREE.MathUtils.degToRad(sway * maxDeg);
}

export class Ball {
  constructor(physics, scene, color = '#ffffff') {
    this.physics = physics;
    this.scene = scene;
    this.baseRadius = BALL_R;
    this.radius = BALL_R;
    this.state = 'idle'; // idle | moving | sinking | holed | gone
    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundMeta = null;
    this.restTimer = 0;
    this.launchTimer = 0;
    this.ventCool = 0;
    this.lastSafe = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.mods = {
      decelMul: 1, speedMul: 1, sticky: false, ghost: false, magnet: false, leash: null,
    };
    this.onEvent = () => {};

    const bd = R.RigidBodyDesc.dynamic()
      .setTranslation(0, 1, 0)
      .setCcdEnabled(true)
      .setCanSleep(false)
      .lockRotations();
    this.body = physics.world.createRigidBody(bd);
    const cd = R.ColliderDesc.ball(this.radius)
      .setFriction(0)
      .setRestitution(0.72)
      .setDensity(2)
      .setCollisionGroups(BALL_NORMAL)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    this.collider = physics.world.createCollider(cd, this.body);

    const geo = new THREE.SphereGeometry(1, 28, 20);
    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(this.radius);
    // a stripe so you can see it roll
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.06, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 })
    );
    this.mesh.add(stripe);
    scene.add(this.mesh);
  }

  get pos() { return this.body.translation(); }
  get vel() { return this.body.linvel(); }

  setColor(c) { this.material.color.set(c); }

  setRadius(r) {
    if (Math.abs(r - this.radius) < 1e-4) return;
    const p = this.body.translation();
    const dy = r - this.radius;
    this.radius = r;
    this.collider.setRadius(r);
    if (dy > 0) this.body.setTranslation({ x: p.x, y: p.y + dy + 0.01, z: p.z }, true);
    this.mesh.scale.setScalar(r);
  }

  setGhost(on) {
    this.mods.ghost = on;
    this.collider.setCollisionGroups(on ? BALL_GHOST : BALL_NORMAL);
    this.material.transparent = on;
    this.material.opacity = on ? 0.45 : 1;
  }

  place(p, { safe = true } = {}) {
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel.set(0, 0, 0);
    if (safe) this.lastSafe.set(p.x, p.y, p.z);
    this.state = 'idle';
    this.restTimer = 0;
    this.mesh.visible = true;
    this.body.setEnabled(true);
    this.syncMesh(0);
  }

  respawnAtSafe() {
    this.place(this.lastSafe.clone().add(new THREE.Vector3(0, 0.05, 0)));
  }

  shoot(dir, power01, { chip = false } = {}) {
    const speed = MAX_SHOT_SPEED * Math.max(0.03, power01) * this.mods.speedMul;
    const v = { x: dir.x * speed, y: 0, z: dir.z * speed };
    if (chip) {
      v.x *= 0.8; v.z *= 0.8;
      v.y = 5.5 + 4 * power01;
      this.launchTimer = 0.2;
    }
    const pv = this.platformVel();
    this.body.setLinvel({ x: v.x + pv.x, y: v.y + pv.y, z: v.z + pv.z }, true);
    this.state = 'moving';
    this.restTimer = 0;
  }

  platformVel() {
    const m = this.groundMeta;
    if (this.grounded && m && m.mover) return m.mover.velocityAt(this.pos);
    return { x: 0, y: 0, z: 0 };
  }

  /** env: { forces(ball, dt) -> {x,y,z,wake}, decelMul, stickyWalls } */
  preStep(dt, env) {
    if (this.state !== 'idle' && this.state !== 'moving') return;
    if (this.launchTimer > 0) this.launchTimer -= dt;
    const v = this.body.linvel();
    const acc = env.forces ? env.forces(this, dt) : { x: 0, y: 0, z: 0, wake: false };
    // something is lifting the ball (vent, tornado, laser hit…): don't glue it to the floor
    if (acc.y > GRAVITY * 0.4) this.launchTimer = Math.max(this.launchTimer, 0.12);
    if (this.ventCool > 0) this.ventCool -= dt;
    if (acc.launch) {
      const L = acc.launch;
      acc.launch = null;
      this.body.setLinvel(L, true);
      this.state = 'moving';
      this.restTimer = 0;
      this.launchTimer = 0.25;
      this.ventCool = 0.8;
      this.onEvent('vent', {});
      return;
    }
    if (acc.teleport) {
      const tp = acc.teleport;
      acc.teleport = null;
      this.body.setTranslation({ x: tp[0], y: tp[1], z: tp[2] }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.state = 'moving';
      this.restTimer = 0;
      this.onEvent('grabbed', {});
      return;
    }
    const pv = this.platformVel();

    if (this.state === 'idle') {
      if (acc.wake) {
        this.state = 'moving';
        this.restTimer = 0;
      } else {
        // hold position (carried by platform if on one)
        this.body.setLinvel({ x: pv.x, y: Math.min(v.y, pv.y), z: pv.z }, true);
        return;
      }
    }

    let vx = v.x, vy = v.y, vz = v.z;
    if (this.grounded && this.launchTimer <= 0) {
      let rx = vx - pv.x, ry = vy - pv.y, rz = vz - pv.z;
      const n = this.groundNormal;
      const dn = rx * n.x + ry * n.y + rz * n.z;
      const tx = rx - n.x * dn, ty = ry - n.y * dn, tz = rz - n.z * dn;
      const s = Math.hypot(tx, ty, tz);
      const surf = SURFACES[this.groundMeta?.mat] || SURFACES.default;
      const decel = (surf.decel + 0.015 * s * s) * this.mods.decelMul * (env.decelMul ?? 1) * (env.zoneDecel?.(this) ?? 1);
      const ns = Math.max(0, s - decel * dt);
      const k = s > 1e-6 ? ns / s : 0;
      rx = tx * k + n.x * dn; ry = ty * k + n.y * dn; rz = tz * k + n.z * dn;
      vx = rx + pv.x; vy = ry + pv.y; vz = rz + pv.z;
    }
    vx += acc.x * dt; vy += acc.y * dt; vz += acc.z * dt;

    // leash: tether to an anchor
    const L = this.mods.leash;
    if (L) {
      const p = this.body.translation();
      const dx = p.x - L.anchor.x, dz = p.z - L.anchor.z;
      const d = Math.hypot(dx, dz);
      if (d > L.len) {
        const ux = dx / d, uz = dz / d;
        const out = vx * ux + vz * uz;
        if (out > 0) { vx -= ux * out * 1.6; vz -= uz * out * 1.6; }
        this.body.setTranslation({ x: L.anchor.x + ux * L.len, y: p.y, z: L.anchor.z + uz * L.len }, true);
      }
    }
    this.body.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  /** env: { course, stickyWalls, bumpers[], onHole, onFall } */
  postStep(dt, env) {
    if (this.state === 'sinking') return this.updateSink(dt, env);
    if (this.state !== 'idle' && this.state !== 'moving') return;
    const p = this.body.translation();
    let v = this.body.linvel();

    // ground probe
    _v.set(p.x, p.y + 0.02, p.z);
    const groups = this.mods.ghost ? BALL_GHOST : BALL_NORMAL;
    const hit = this.physics.raycastDown(_v, this.radius + 0.25, this.body, groups);
    this.grounded = !!hit && hit.dist <= this.radius + 0.08 && hit.normal.y > 0.35;
    if (this.grounded) {
      this.groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      this.groundMeta = hit.meta;
      // snap: kill small hops caused by seams / landing
      const pv = this.platformVel();
      const rn = (v.x - pv.x) * hit.normal.x + (v.y - pv.y) * hit.normal.y + (v.z - pv.z) * hit.normal.z;
      if (this.launchTimer <= 0 && rn > 0 && rn < 3.2) {
        v = { x: v.x - hit.normal.x * rn, y: v.y - hit.normal.y * rn, z: v.z - hit.normal.z * rn };
        this.body.setLinvel(v, true);
      }
      if (hit.meta.onTouch) hit.meta.onTouch(this, hit);
    } else {
      this.groundMeta = null;
    }

    // wall impact detection (velocity flip in the horizontal plane)
    const dvx = v.x - this.prevVel.x, dvz = v.z - this.prevVel.z;
    const dvh = Math.hypot(dvx, dvz);
    if (dvh > 1.2 && this.state === 'moving') {
      const sticky = this.mods.sticky || env.stickyWalls;
      if (sticky && this.touchingWall()) {
        this.body.setLinvel({ x: 0, y: Math.min(v.y, 0), z: 0 }, true);
        v = this.body.linvel();
        this.onEvent('stick', { pos: p });
      } else {
        this.onEvent('wall', { strength: dvh });
      }
    }

    // custom bumpers (level bumpers + spawned ones)
    if (!this.mods.ghost && env.bumpers) {
      for (const b of env.bumpers) {
        const dx = p.x - b.x, dz = p.z - b.z;
        const d = Math.hypot(dx, dz);
        const lim = b.r + this.radius;
        if (d < lim && Math.abs(p.y - b.y) < (b.h ?? 0.6)) {
          const nx = dx / (d || 1), nz = dz / (d || 1);
          const approach = v.x * nx + v.z * nz;
          let nvx, nvz;
          if (b.reverse) {
            const sp = Math.max(Math.hypot(v.x, v.z), 4) * 1.15;
            const vn = Math.hypot(v.x, v.z) || 1;
            nvx = (-v.x / vn) * sp; nvz = (-v.z / vn) * sp;
            if (Math.hypot(v.x, v.z) < 0.5) { nvx = nx * sp; nvz = nz * sp; }
          } else {
            if (approach >= 0) continue;
            const boost = b.power ?? 1.25;
            nvx = (v.x - 2 * approach * nx) * boost; nvz = (v.z - 2 * approach * nz) * boost;
            const minOut = 3.5;
            const out = nvx * nx + nvz * nz;
            if (out < minOut) { nvx += nx * (minOut - out); nvz += nz * (minOut - out); }
          }
          this.body.setTranslation({ x: b.x + nx * (lim + 0.01), y: p.y, z: b.z + nz * (lim + 0.01) }, true);
          this.body.setLinvel({ x: nvx, y: v.y, z: nvz }, true);
          v = this.body.linvel();
          this.state = 'moving';
          this.onEvent('bumper', { bumper: b });
        }
      }
    }

    // cup
    const cup = env.course?.cup;
    if (cup) {
      const dx = p.x - cup.x, dz = p.z - cup.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.hypot(v.x, v.z);
      const fits = this.radius < CUP_R * 0.92;
      const near = Math.abs(p.y - this.radius - cup.y) < 0.25;
      const capR = this.mods.magnet ? CUP_R + 0.45 : CUP_R - this.radius * 0.25;
      const spLim = (this.mods.magnet ? 9 : 4.3) * Math.sqrt(BALL_R / this.radius);
      if (fits && near && d < capR && sp < spLim) {
        this.startSink(cup);
        return;
      }
    }

    // falling / out of bounds
    const course = env.course;
    if (course) {
      const pit = course.pitAt?.(p, this);
      if (pit) { env.onPit?.(this, pit); return; }
      if (p.y < course.killY) { env.onFall?.(this); return; }
    }

    // rest detection
    if (this.state === 'moving') {
      const pv = this.platformVel();
      const rs = Math.hypot(v.x - pv.x, v.y - pv.y, v.z - pv.z);
      const surf = SURFACES[this.groundMeta?.mat] || SURFACES.default;
      const ny = this.groundNormal.y;
      const slopeAcc = GRAVITY * Math.sqrt(Math.max(0, 1 - ny * ny));
      const canRest = this.grounded && slopeAcc < surf.decel * this.mods.decelMul * (env.decelMul ?? 1) * 0.9 + 0.05;
      if (canRest && rs < 0.16) {
        this.restTimer += dt;
        if (this.restTimer > 0.25) {
          this.state = 'idle';
          this.body.setLinvel({ x: pv.x, y: 0, z: pv.z }, true);
          if (!this.groundMeta?.unsafe && !this.groundMeta?.mover) this.lastSafe.set(p.x, p.y, p.z);
          this.onEvent('rest', {});
        }
      } else {
        this.restTimer = 0;
      }
    }
    this.prevVel.set(v.x, v.y, v.z);
  }

  touchingWall() {
    let touching = false;
    this.physics.world.contactPairsWith(this.collider, (other) => {
      if (touching) return;
      const m = this.physics.meta.get(other.handle);
      if (!m || m.kind === 'floor') return;
      this.physics.world.contactPair(this.collider, other, (manifold) => {
        if (manifold.numContacts() > 0) touching = true;
      });
    });
    return touching;
  }

  startSink(cup) {
    this.state = 'sinking';
    this.sinkT = 0;
    this.sinkFrom = new THREE.Vector3().copy(this.body.translation());
    this.sinkCup = cup;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setEnabled(false);
    this.onEvent('sinkStart', {});
  }

  updateSink(dt, env) {
    this.sinkT += dt;
    const t = Math.min(1, this.sinkT / 0.45);
    const c = this.sinkCup;
    const x = THREE.MathUtils.lerp(this.sinkFrom.x, c.x, Math.min(1, t * 2));
    const z = THREE.MathUtils.lerp(this.sinkFrom.z, c.z, Math.min(1, t * 2));
    const y = c.y + this.radius - t * t * 0.6;
    this.mesh.position.set(x, y, z);
    if (t >= 1) {
      this.state = 'holed';
      this.mesh.visible = false;
      env.onHole?.(this);
    }
  }

  syncMesh(dt) {
    if (this.state === 'sinking' || this.state === 'holed') return;
    const p = this.body.translation();
    const v = this.body.linvel();
    this.mesh.position.set(p.x, p.y, p.z);
    const sp = Math.hypot(v.x, v.z);
    if (sp > 1e-3 && dt > 0) {
      _v.set(v.z, 0, -v.x).normalize();
      _q.setFromAxisAngle(_v, (sp * dt) / this.radius);
      this.mesh.quaternion.premultiply(_q);
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.physics.world.removeRigidBody(this.body);
  }
}
