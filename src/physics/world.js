import RAPIER from '@dimforge/rapier3d-compat';

export let R = null;

export async function initPhysics() {
  if (R) return R;
  await RAPIER.init();
  R = RAPIER;
  return R;
}

// Collision groups: high 16 bits = membership, low 16 bits = filter.
// GHOSTFLOOR: invisible covers over pits that only Ghost balls roll on.
export const GROUP = { FLOOR: 1, WALL: 2, OBST: 4, BALL: 8, GHOSTFLOOR: 16 };
export const cg = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const GRAVITY = 16;
export const FIXED_DT = 1 / 120;

// Rolling deceleration (units/s²) and other surface properties.
export const SURFACES = {
  default: { decel: 2.3 },
  grass: { decel: 2.6 },
  sand: { decel: 2.9 },
  ice: { decel: 0.32 },
  rock: { decel: 2.4 },
  wood: { decel: 2.3 },
  s5: { decel: 2.1 },
  neon: { decel: 2.0 },
  glass: { decel: 0.8 }, // Fortune Falls board: you never stop on it
  carpet: { decel: 3.0 },
};

export class Physics {
  constructor() {
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
    this.meta = new Map(); // collider handle -> metadata
    this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  _finish(body, desc, meta, group) {
    desc.setCollisionGroups(group);
    const col = this.world.createCollider(desc, body);
    this.meta.set(col.handle, { ...meta, collider: col, body });
    return { body, collider: col };
  }

  _body(kinematic, pos, quat) {
    const bd = kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed();
    bd.setTranslation(pos[0], pos[1], pos[2]);
    if (quat) bd.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    return this.world.createRigidBody(bd);
  }

  groupFor(kind) {
    if (kind === 'floor') return cg(GROUP.FLOOR, GROUP.BALL);
    if (kind === 'wall') return cg(GROUP.WALL, GROUP.BALL);
    if (kind === 'ghostfloor') return cg(GROUP.GHOSTFLOOR, GROUP.BALL);
    return cg(GROUP.OBST, GROUP.BALL);
  }

  restitutionFor(kind) {
    return kind === 'floor' || kind === 'ghostfloor' ? 0.0 : kind === 'wall' ? 0.72 : 0.6;
  }

  /** Static or kinematic trimesh from flat position array (x,y,z,...) in local space. */
  addTrimesh(positions, indices, meta, { pos = [0, 0, 0], quat = null, kinematic = false } = {}) {
    const body = this._body(kinematic, pos, quat);
    const desc = R.ColliderDesc.trimesh(
      positions instanceof Float32Array ? positions : new Float32Array(positions),
      indices instanceof Uint32Array ? indices : new Uint32Array(indices),
      R.TriMeshFlags.FIX_INTERNAL_EDGES
    );
    desc.setFriction(0).setRestitution(meta.restitution ?? this.restitutionFor(meta.kind));
    return this._finish(body, desc, meta, this.groupFor(meta.kind));
  }

  addConvex(points, meta, { pos = [0, 0, 0], quat = null, kinematic = false } = {}) {
    const body = this._body(kinematic, pos, quat);
    const desc = R.ColliderDesc.convexHull(points instanceof Float32Array ? points : new Float32Array(points));
    desc.setFriction(0).setRestitution(meta.restitution ?? this.restitutionFor(meta.kind));
    return this._finish(body, desc, meta, this.groupFor(meta.kind));
  }

  addBox(half, meta, { pos = [0, 0, 0], quat = null, kinematic = false } = {}) {
    const body = this._body(kinematic, pos, quat);
    const desc = R.ColliderDesc.cuboid(half[0], half[1], half[2]);
    desc.setFriction(0).setRestitution(meta.restitution ?? this.restitutionFor(meta.kind));
    return this._finish(body, desc, meta, this.groupFor(meta.kind));
  }

  addCylinder(halfH, radius, meta, { pos = [0, 0, 0], quat = null, kinematic = false } = {}) {
    const body = this._body(kinematic, pos, quat);
    const desc = R.ColliderDesc.cylinder(halfH, radius);
    desc.setFriction(0).setRestitution(meta.restitution ?? this.restitutionFor(meta.kind));
    return this._finish(body, desc, meta, this.groupFor(meta.kind));
  }

  addSphere(radius, meta, { pos = [0, 0, 0], kinematic = false } = {}) {
    const body = this._body(kinematic, pos, null);
    const desc = R.ColliderDesc.ball(radius);
    desc.setFriction(0).setRestitution(meta.restitution ?? this.restitutionFor(meta.kind));
    return this._finish(body, desc, meta, this.groupFor(meta.kind));
  }

  /** Raycast straight down from origin, ignoring `excludeBody`. */
  raycastDown(origin, maxDist, excludeBody, groups) {
    this._ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this._ray.dir = { x: 0, y: -1, z: 0 };
    const hit = this.world.castRayAndGetNormal(
      this._ray, maxDist, true, undefined, groups, undefined, excludeBody
    );
    if (!hit) return null;
    const meta = this.meta.get(hit.collider.handle) || {};
    return { dist: hit.timeOfImpact ?? hit.toi, normal: hit.normal, collider: hit.collider, meta };
  }

  removeBody(body) {
    if (!body) return;
    const n = body.numColliders();
    for (let i = 0; i < n; i++) this.meta.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  step() {
    this.world.step();
  }

  dispose() {
    this.world.free();
    this.meta.clear();
  }
}
