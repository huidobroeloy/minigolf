import * as THREE from 'three';
import { R, GROUP, cg, SURFACES, GRAVITY } from './world.js';
import { applyCharacter } from '../game/characters.js';

export const BALL_R = 0.18;
export const MAX_SHOT_SPEED = 17;
export const CUP_R = 0.36;
export const CUP_DEPTH = 0.42; // real cups (see buildCourse): how deep the hole is

export const BALL_NORMAL = cg(GROUP.BALL, GROUP.FLOOR | GROUP.WALL | GROUP.OBST | GROUP.MONSTER);
export const BALL_GHOST = cg(GROUP.BALL, GROUP.FLOOR | GROUP.GHOSTFLOOR);
export const BALL_SPRINT = cg(GROUP.BALL, GROUP.FLOOR | GROUP.WALL | GROUP.OBST); // Super Sprint: monsters can't touch it
export const BALL_FLYING = cg(GROUP.BALL, 0); // Overwing: above everything

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
    this.warpCool = 0;
    this.lastSafe = new THREE.Vector3();
    this.pinned = false; // held still by forces (conveyor into a wall, slope against a post…)
    this.pinRef = new THREE.Vector3();
    this.pinT = 0;
    this.prevVel = new THREE.Vector3();
    this.mods = {
      decelMul: 1, speedMul: 1, sticky: false, ghost: false, magnet: false, leash: null, monsterProof: false,
    };
    this.frozen = false; // Freeze / Lyoko Guardian
    this.glideT = 0;     // Angel Wings: seconds of glide left
    this.fly = null;     // Overwing: { left, y }
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
    this.material = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, emissive: color, emissiveIntensity: 0.12 });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(this.radius);
    // a stripe so you can see it roll
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.06, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 })
    );
    this.mesh.add(stripe);
    this.stripe = stripe;
    if (applyCharacter(this.material, color)) stripe.visible = false;
    scene.add(this.mesh);
  }

  get pos() { return this.body.translation(); }
  get vel() { return this.body.linvel(); }

  setColor(c) { this.material.color.set(c); if (applyCharacter(this.material, c)) this.stripe.visible = false; }

  setRadius(r) {
    if (Math.abs(r - this.radius) < 1e-4) return;
    const p = this.body.translation();
    const dy = r - this.radius;
    this.radius = r;
    this.collider.setRadius(r);
    if (dy > 0) this.body.setTranslation({ x: p.x, y: p.y + dy + 0.01, z: p.z }, true);
    this.mesh.scale.setScalar(r);
  }

  /** The collision groups this ball should use right now. */
  groups() {
    if (this.fly) return BALL_FLYING;
    if (this.mods.ghost) return BALL_GHOST;
    return this.mods.monsterProof ? BALL_SPRINT : BALL_NORMAL;
  }

  setMonsterProof(on) {
    this.mods.monsterProof = on;
    this.collider.setCollisionGroups(this.groups());
  }

  /** Angel Wings: glide level for a while. Overwing: fly straight over everything. */
  startGlide(secs) { this.glideT = secs; }
  startFly(dist, lift = 1.1) {
    const p = this.body.translation();
    this.fly = { left: dist, y: p.y + lift };
    this.collider.setCollisionGroups(this.groups());
  }
  endFly() {
    if (!this.fly) return;
    this.fly = null;
    this.collider.setCollisionGroups(this.groups());
  }

  setGhost(on) {
    this.mods.ghost = on;
    this.collider.setCollisionGroups(this.groups());
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
    this.pinned = false;
    this.pinT = 0;
    this.glideT = 0;
    this.rimT = 99;
    if (this.fly) this.endFly();
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
    this.pinned = false;
    this.pinT = 0;
    // the shot itself isn't a wall impact: without this, a ball stuck to a sticky wall would
    // re-stick the moment it's hit away from it
    this.prevVel.set(v.x + pv.x, v.y + pv.y, v.z + pv.z);
    this.stickGrace = 0.25;
  }

  platformVel() {
    const m = this.groundMeta;
    if (this.grounded && m && m.mover) return m.mover.velocityAt(this.pos);
    return { x: 0, y: 0, z: 0 };
  }

  /** env: { forces(ball, dt) -> {x,y,z,wake}, decelMul, stickyWalls } */
  preStep(dt, env) {
    if (this.state !== 'idle' && this.state !== 'moving') return;
    if (this.frozen) { // encased in ice: nothing moves it
      const fv = this.body.linvel();
      this.body.setLinvel({ x: 0, y: Math.min(0, fv.y), z: 0 }, true);
      if (this.state === 'moving') { this.state = 'idle'; this.restTimer = 0; }
      return;
    }
    if (this.fly) { // Overwing: a straight, level flight, then it drops
      const fv = this.body.linvel();
      const hs = Math.max(7, Math.hypot(fv.x, fv.z));
      const a = Math.atan2(fv.z, fv.x);
      const p = this.body.translation();
      this.body.setLinvel({ x: Math.cos(a) * hs, y: (this.fly.y - p.y) * 6, z: Math.sin(a) * hs }, true);
      this.fly.left -= hs * dt;
      this.launchTimer = 0.1;
      this.state = 'moving';
      if (this.fly.left <= 0) this.endFly();
      return;
    }
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
    if (this.warpCool > 0) this.warpCool -= dt;
    const warp = env.course?.warpAt?.(this.body.translation(), this);
    if (warp) {
      this.body.setTranslation({ x: warp.to[0], y: warp.to[1], z: warp.to[2] }, true);
      this.body.setLinvel(warp.vel, true);
      this.state = 'moving';
      this.restTimer = 0;
      this.pinned = false;
      this.warpCool = 0.6;
      this.launchTimer = 0.15;
      this.onEvent('warp', { to: warp.to });
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
      if (acc.wake && !this.pinned) {
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
      let decel = (surf.decel + 0.015 * s * s) * this.mods.decelMul * (env.decelMul ?? 1) * (env.zoneDecel?.(this) ?? 1);
      // on a slope steeper than the surface can hold, the ball must roll down decisively instead
      // of creeping (a creeping ball used to be frozen mid-ramp by the stuck detector)
      const slopeAcc = GRAVITY * Math.sqrt(Math.max(0, 1 - n.y * n.y));
      if (slopeAcc >= decel && slopeAcc > 0.3) {
        const downhill = tx * n.x * n.y + tz * n.z * n.y - ty * (1 - n.y * n.y); // velocity · gravity's slope component
        if (s < 1 || downhill > 0) decel = Math.min(decel, 0.5 * slopeAcc);
      }
      const ns = Math.max(0, s - decel * dt);
      const k = s > 1e-6 ? ns / s : 0;
      rx = tx * k + n.x * dn; ry = ty * k + n.y * dn; rz = tz * k + n.z * dn;
      vx = rx + pv.x; vy = ry + pv.y; vz = rz + pv.z;
    }
    vx += acc.x * dt; vy += acc.y * dt; vz += acc.z * dt;
    if (this.glideT > 0) { // Angel Wings: hold altitude (no sinking) until the glide runs out
      this.glideT -= dt;
      vy = Math.max(vy, 0) + GRAVITY * dt;
      if (vy > 0.5) vy = 0.5;
      this.launchTimer = Math.max(this.launchTimer, 0.05);
    }

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
    if (this.stickGrace > 0) this.stickGrace -= dt;
    if (dvh > 1.2 && this.state === 'moving') {
      const sticky = this.mods.sticky || env.stickyWalls;
      // the wall pushed back along dv: how hard was the ball coming into it?
      const into = -(this.prevVel.x * dvx + this.prevVel.z * dvz) / dvh;
      if (sticky && !(this.stickGrace > 0) && into > 1 && this.touchingWall()) {
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
    const cups = env.course?.cups || (env.course?.cup ? [env.course.cup] : []);
    let inCup = false;
    this.rimT = (this.rimT ?? 99) + dt;
    for (const cup of cups) {
      if (!cup.physical) {
        if (this.cupWants(cup, p, v, dt)) { this.startSink(cup); return; }
        continue;
      }
      const dx = p.x - cup.x, dz = p.z - cup.z, d = Math.hypot(dx, dz);
      if (this.mods.magnet && d < CUP_R + 0.8 && d > 0.02 && Math.abs(p.y - this.radius - cup.y) < 0.3 && Math.hypot(v.x, v.z) < 9) {
        // Magnet: steer the ball onto the hole
        const k = 22 * dt;
        this.body.setLinvel({ x: v.x - (dx / d) * k - v.x * 4 * dt, y: v.y, z: v.z - (dz / d) * k - v.z * 4 * dt }, true);
      }
      // the lip: a real cup's edge is rounded, so a slow ball over (or right at) the rim is
      // tipped inward rather than skating across a knife edge
      const sp = Math.hypot(v.x, v.z);
      if (d < CUP_R + 0.07 && d > 0.02 && sp < 3 && Math.abs(p.y - this.radius - cup.y) < 0.12 && this.radius < CUP_R * 0.92) {
        const k = 10 * (1 - sp / 3) * dt;
        this.body.setLinvel({ x: v.x - (dx / d) * k, y: v.y, z: v.z - (dz / d) * k }, true);
      }
      // at the rim (it can only get into the hole from here; a ball rolling on a level below the
      // cup never passes this)
      if (d < CUP_R + this.radius && p.y >= cup.y - 0.02 && p.y < cup.y + this.radius + 0.15) { this.rimCup = cup; this.rimT = 0; }
      // in the hole: once the ball's centre is below the floor inside a real cup it came in through,
      // it can't come back out, so it's holed right away. This runs before every fall check, and a
      // ball that somehow slipped into the cup's wall or under it is put back on the bottom: a ball
      // that went in the hole is never lost in the Digital Sea.
      if (this.rimCup === cup && this.rimT < 0.6 && d < CUP_R + 0.1 && p.y < cup.y - 0.02 && p.y > cup.y - 1.5 && this.radius < CUP_R * 0.92) {
        if (d > CUP_R - this.radius + 0.03 || p.y < cup.y - CUP_DEPTH + this.radius - 0.05) {
          this.body.setTranslation({ x: cup.x, y: cup.y - CUP_DEPTH + this.radius + 0.02, z: cup.z }, true);
          this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        this.holeOut(cup, env);
        return;
      }
      if (d < CUP_R && p.y < cup.y + this.radius * 0.4) {
        inCup = true;
        if (!this.cupDropped) { this.cupDropped = true; this.onEvent('sinkStart', {}); }
        this.cupT = (this.cupT || 0) + dt;
        if (this.cupT > 0.12) { this.holeOut(cup, env); return; }
      }
    }
    if (!inCup) { this.cupT = 0; this.cupDropped = false; }

    // falling / out of bounds
    const course = env.course;
    if (course) {
      if (course.lavaAt?.(p, this)) { this.onEvent('lava', {}); env.onFall?.(this); return; }
      const pit = this.glideT > 0 || this.fly ? null : course.pitAt?.(p, this);
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
      // rests only where the surface really holds it (the same limit preStep uses to make it roll)
      const canRest = this.grounded && slopeAcc < surf.decel * this.mods.decelMul * (env.decelMul ?? 1);
      if (canRest && rs < 0.16) {
        this.restTimer += dt;
        if (this.restTimer > 0.25) {
          this.state = 'idle';
          this.body.setLinvel({ x: pv.x, y: 0, z: pv.z }, true);
          if (!this.groundMeta?.unsafe && !this.groundMeta?.mover && !env.course?.unsafeAt?.(p)) this.lastSafe.set(p.x, p.y, p.z);
          this.onEvent('rest', {});
        }
      } else {
        this.restTimer = 0;
      }
      // pinned: something keeps pushing (a belt into a wall, a slope against a post) but the
      // ball isn't going anywhere. Call it at rest so the player can shoot.
      if (this.state === 'moving') {
        if (this.pinRef.distanceToSquared(_v.set(p.x, p.y, p.z)) > 0.1 * 0.1) { this.pinRef.copy(_v); this.pinT = 0; }
        else if ((this.pinT += dt) > 1.0 && this.launchTimer <= 0 && !this.groundMeta?.mover && (this.pinT > 2.5 || this.groundNormal.y > 0.995 || this.touchingWall())) {
          this.state = 'idle';
          this.pinned = true;
          this.restTimer = 0;
          this.body.setLinvel({ x: 0, y: Math.min(0, v.y), z: 0 }, true);
          this.onEvent('rest', {});
        }
      }
    }
    this.prevVel.set(v.x, v.y, v.z);
  }

  /**
   * Does the ball drop into this cup? The hole is treated like a real one: while the ball's
   * centre is over it, the ball falls under gravity, and it drops in if it falls a full radius
   * before reaching the far rim. So slow balls drop even near the edge, fast ones lip out.
   * Near the rim a gentle funnel (the lip's slope) pulls slow balls inward.
   */
  cupWants(cup, p, v, dt) {
    const dx = p.x - cup.x, dz = p.z - cup.z;
    const d = Math.hypot(dx, dz);
    if (d > CUP_R + this.radius + 0.2) return false;
    if (Math.abs(p.y - this.radius - cup.y) > 0.25) return false; // not at cup level (flying over)
    if (this.radius >= CUP_R * 0.92) return false; // supersized: doesn't fit
    const sp = Math.hypot(v.x, v.z);
    if (this.mods.magnet) return d < CUP_R + 0.45 && sp < 9;
    // the lip: a slow ball whose edge overhangs the hole is tipped inward
    if (sp < 2.5 && d < CUP_R + 0.15 && d > 1e-3 && this.state === 'moving') {
      const k = 3.2 * (1 - sp / 2.5) * dt;
      this.body.setLinvel({ x: v.x - (dx / d) * k, y: v.y, z: v.z - (dz / d) * k }, true);
    }
    // resting on (or creeping over) the lip with the centre almost over the hole
    if (sp < 0.35 && d < CUP_R + this.radius * 0.4) return true;
    if (d >= CUP_R) return false;
    // time over the hole along this path → how far it falls in that time
    const b = sp > 1e-4 ? Math.abs(dx * v.z - dz * v.x) / sp : d;
    const chord = 2 * Math.sqrt(Math.max(0, CUP_R * CUP_R - b * b));
    const t = chord / Math.max(sp, 1e-3);
    return 0.5 * GRAVITY * t * t >= this.radius;
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

  /** A real cup: the ball is down in it. It stays visible, settling at the bottom. */
  holeOut(cup, env) {
    this.state = 'holed';
    this.sinkCup = cup;
    this.holedT = 0;
    this.physicalHole = true;
    this.cupT = 0;
    this.cupDropped = false;
    env.onHole?.(this);
  }

  startSink(cup) {
    this.state = 'sinking';
    this.sinkT = 0;
    const p = this.body.translation(), v = this.body.linvel();
    this.sinkFrom = new THREE.Vector3(p.x, p.y, p.z);
    this.sinkCup = cup;
    // roll around the rim the way the ball was travelling, then drop
    const rx = p.x - cup.x, rz = p.z - cup.z;
    this.sinkA0 = Math.atan2(rz, rx);
    this.sinkR0 = Math.max(CUP_R * 0.6, Math.hypot(rx, rz));
    this.sinkSpin = (rx * v.z - rz * v.x) >= 0 ? 1 : -1;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setEnabled(false);
    this.onEvent('sinkStart', {});
  }

  updateSink(dt, env) {
    this.sinkT += dt;
    const c = this.sinkCup;
    const ROLL = 0.55, DROP = 0.35;
    if (this.sinkT < ROLL) {
      const u = this.sinkT / ROLL;
      const a = this.sinkA0 + this.sinkSpin * u * Math.PI * 1.5;
      const r = THREE.MathUtils.lerp(this.sinkR0, CUP_R * 0.35, u * u);
      this.mesh.position.set(c.x + Math.cos(a) * r, c.y + this.radius - u * u * this.radius * 0.6, c.z + Math.sin(a) * r);
      this.mesh.rotateY(dt * 18 * this.sinkSpin);
    } else {
      const u = Math.min(1, (this.sinkT - ROLL) / DROP);
      const bounce = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 0.06 * (1 - u);
      this.mesh.position.set(c.x, c.y + this.radius * 0.4 - u * u * 0.7 + bounce, c.z);
      if (u >= 1) {
        this.state = 'holed';
        this.mesh.visible = false;
        env.onHole?.(this);
      }
    }
  }

  syncMesh(dt) {
    if (this.state === 'holed' && this.physicalHole && this.body.isEnabled()) {
      // rattle down to the bottom of the real cup, then rest there
      this.holedT += dt;
      const hp = this.body.translation();
      this.mesh.position.set(hp.x, hp.y, hp.z);
      if (this.holedT > 0.7) { this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setEnabled(false); }
      return;
    }
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
