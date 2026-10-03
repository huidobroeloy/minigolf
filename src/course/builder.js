import * as THREE from 'three';
import { makeJumpPad, makeChevrons } from '../fx/jumppad.js';
import { makeTowerHolo } from '../fx/towerCup.js';
import { themeMaterials, surfaceMaterial, TEX } from './themes.js';
import { slabGeometry, prismGeometry, trimeshData, signedArea, pointInPoly, circlePoly } from './geometry.js';
import { CUP_R, CUP_DEPTH } from '../physics/ball.js';
import { GRAVITY, FIXED_DT } from '../physics/world.js';
import { createMonster } from '../monsters/index.js';
import { decorate } from './deco.js';
import { RNG } from '../core/rng.js';

const WALL_H = 0.38;
const WALL_T = 0.24;

/**
 * Build a playable hole from its declarative definition.
 * def: { id, name, sector, par, time, tee:[x,y,z], cup:[x,y,z], parts:[...], pickups?:[[x,y,z]] }
 */
export function buildCourse(def, physics, scene) {
  const mats = themeMaterials(def.sector);
  const group = new THREE.Group();
  group.name = 'course:' + def.id;
  scene.add(group);

  const course = {
    def, mats, group, physics,
    tee: new THREE.Vector3(...def.tee),
    cup: { x: def.cup[0], y: def.cup[1], z: def.cup[2] },
    cups: null, // every cup you can finish in (the main one first)
    bounds: new THREE.Box3(),
    floors: [], // {poly, y, holes}
    bumpers: [],
    zones: [],
    pits: [],
    movers: [],
    monsters: [],
    crumbles: [],
    teleports: [],
    warps: [],
    animators: [],
    killY: -8,
  };
  course.cup.mod = def.cupMod ?? null;
  course.cups = [course.cup, ...(def.cups || []).map((c) => ({ x: c[0], y: c[1], z: c[2], mod: c[3] ?? null, extra: true }))];
  /** The cup closest to a point (for holes with several). */
  /** The tower hologram over a cup. */
  course.towerFor = (cup) => course.towers?.find((tw) => tw.cup === cup)?.holo ?? null;
  course.nearestCup = (pt) => {
    if (!pt || course.cups.length === 1) return course.cup;
    let best = course.cup, bd = Infinity;
    for (const c of course.cups) { const d = Math.hypot(pt.x - c.x, pt.z - c.z); if (d < bd) { bd = d; best = c; } }
    return best;
  };

  const addMesh = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    group.add(m);
    return m;
  };

  const floorMatFor = (p) => (p.mat ? surfaceMaterial(p.mat) : mats.floor);

  // ---------- walls ----------
  function addWallSegment(a, b, y, h = WALL_H, t = WALL_T, outward = null, opts = {}) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    let cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    if (outward) { cx += outward[0] * t / 2; cz += outward[1] * t / 2; }
    const ry = -Math.atan2(dz, dx);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const L = len + t;
    const geo = new THREE.BoxGeometry(L, h, t);
    const mesh = addMesh(geo, opts.material || mats.wall);
    mesh.position.set(cx, y + h / 2, cz);
    mesh.quaternion.copy(q);
    const trim = addMesh(new THREE.BoxGeometry(L + 0.02, 0.06, t + 0.06), mats.trim, { cast: false });
    trim.position.set(cx, y + h, cz);
    trim.quaternion.copy(q);
    physics.addBox([L / 2, h / 2 + 0.6, t / 2], { kind: 'wall', restitution: opts.restitution },
      { pos: [cx, y + h / 2 + 0.6 - 0.0, cz], quat: q });
    // collider is taller than the visual wall (invisible extension) so fast balls don't hop over
    expand(cx, y, cz, len / 2 + t);
  }

  function expand(x, y, z, r = 0) {
    course.bounds.expandByPoint(new THREE.Vector3(x - r, y, z - r));
    course.bounds.expandByPoint(new THREE.Vector3(x + r, y, z + r));
  }

  // ---------- part builders ----------
  const builders = {
    floor(p) {
      const y = p.y ?? 0, th = p.th ?? 0.6;
      const geo = slabGeometry(p.poly, p.holes, y, th);
      const mesh = addMesh(geo, [floorMatFor(p), mats.side]);
      mesh.castShadow = false;
      const { positions, indices } = trimeshData(geo);
      physics.addTrimesh(positions, indices, { kind: 'floor', mat: p.mat || mats.theme.floorMat, unsafe: p.unsafe });
      course.floors.push({ poly: p.poly, y, holes: p.holes || [] });
      for (const [x, z] of p.poly) expand(x, y, z);
      // holes → pits
      for (const h of p.holes || []) {
        if (!h.c) continue;
        const pit = { x: h.c[0], z: h.c[1], r: h.r, y, fortune: !!h.fortune, value: h.value, label: null };
        course.pits.push(pit);
        // ghost cover
        physics.addCylinder(0.05, h.r + 0.02, { kind: 'ghostfloor', mat: p.mat || mats.theme.floorMat }, { pos: [h.c[0], y - 0.05, h.c[1]] });
        // dark shaft
        const shaft = addMesh(new THREE.CylinderGeometry(h.r, h.r, 3, 28, 1, true),
          new THREE.MeshBasicMaterial({ color: h.fortune ? '#16001f' : '#000', side: THREE.BackSide }), { cast: false });
        shaft.position.set(h.c[0], y - 1.5, h.c[1]);
        if (h.fortune) pit.mesh = makePitSign(pit);
      }
      // auto walls along edges
      if (p.walls !== false) {
        const ccw = signedArea(p.poly) > 0;
        const open = new Set(p.open || []);
        const n = p.poly.length;
        for (let i = 0; i < n; i++) {
          if (open.has(i)) continue;
          const a = p.poly[i], b = p.poly[(i + 1) % n];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L = Math.hypot(dx, dz) || 1;
          // for a positive-area polygon the outward normal of edge (dx,dz) is (dz,-dx)
          const out = ccw ? [dz / L, -dx / L] : [-dz / L, dx / L];
          addWallSegment(a, b, y, p.wallH ?? WALL_H, WALL_T, out);
        }
      }
    },

    ramp(p) {
      const [ax, az] = p.a, [bx, bz] = p.b;
      const ya = p.ya, yb = p.yb, w = p.w ?? 3, th = p.th ?? 0.6;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, px = -uz * w / 2, pz = ux * w / 2;
      const top = [[ax + px, ya, az + pz], [ax - px, ya, az - pz], [bx - px, yb, bz - pz], [bx + px, yb, bz + pz]];
      const bottom = top.map(([x, y, z]) => [x, y - th, z]);
      const geo = prismGeometry(bottom, top);
      addMesh(geo, [floorMatFor(p), mats.side]).castShadow = false;
      physics.addConvex(new Float32Array([...bottom.flat(), ...top.flat()]), { kind: 'floor', mat: p.mat || mats.theme.floorMat });
      for (const [x, y, z] of top) expand(x, y, z);
      if (p.jump) {
        const chev = makeChevrons(mats.theme.flag, Math.min(1, w * 0.35));
        chev.position.set(bx, yb + 0.25, bz);
        group.add(chev);
        course.animators.push((t) => chev.userData.animate(t, course.camera));
      }
      if (p.walls !== false) {
        const h = p.wallH ?? WALL_H, t = WALL_T;
        for (const s of [1, -1]) {
          if (p.noWall === (s === 1 ? 'left' : 'right')) continue;
          const ox = (px / (w / 2)) * s, oz = (pz / (w / 2)) * s; // unit outward
          const e0 = [ax + px * s, az + pz * s], e1 = [bx + px * s, bz + pz * s];
          const bot = [
            [e0[0], ya - 0.1, e0[1]], [e1[0], yb - 0.1, e1[1]],
            [e1[0] + ox * t, yb - 0.1, e1[1] + oz * t], [e0[0] + ox * t, ya - 0.1, e0[1] + oz * t],
          ];
          const tp = bot.map(([x, y, z]) => [x, y + h + 0.1, z]);
          addMesh(prismGeometry(bot, tp), [mats.trim, mats.wall]);
          const tall = tp.map(([x, y, z]) => [x, y + 0.6, z]);
          physics.addConvex(new Float32Array([...bot.flat(), ...tall.flat()]), { kind: 'wall' });
        }
      }
    },

    wall(p) {
      const pts = p.pts, y = p.y ?? 0;
      const n = p.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) addWallSegment(pts[i], pts[(i + 1) % pts.length], y, p.h ?? WALL_H, p.thick ?? WALL_T, null);
    },

    box(p) {
      const [w, h, d] = p.s;
      const kind = p.kind || 'obst';
      const mat = kind === 'floor' ? [floorMatFor(p), mats.side] : lookMaterial(p.look, mats);
      let geo = new THREE.BoxGeometry(w, h, d);
      if (kind === 'floor') {
        // put the floor texture on top using world UVs
        geo = boxWithTopGroups(w, h, d);
      }
      const mesh = addMesh(geo, mat);
      mesh.position.set(...p.p);
      mesh.rotation.y = p.ry || 0;
      if (kind === 'floor') mesh.castShadow = false;
      physics.addBox([w / 2, h / 2, d / 2], { kind, mat: p.mat || mats.theme.floorMat, restitution: p.restitution },
        { pos: p.p, quat: mesh.quaternion });
      expand(p.p[0], p.p[1], p.p[2], Math.max(w, d) / 2);
    },

    cyl(p) {
      const kind = p.kind || 'obst';
      const r = p.r, h = p.h ?? 1.5;
      const look = p.look || 'pillar';
      const [x, y, z] = p.p;
      if (look === 'tree') {
        const trunk = addMesh(new THREE.CylinderGeometry(r * 0.9, r * 1.1, h, 14), treeBark());
        trunk.position.set(x, y + h / 2, z);
        const crown = addMesh(new THREE.IcosahedronGeometry(r * 3.2, 1), leafMat());
        crown.position.set(x, y + h + r * 2.2, z);
        crown.scale.set(1, 0.8, 1);
      } else {
        const m = addMesh(new THREE.CylinderGeometry(r, r, h, 20), lookMaterial(look, mats));
        m.position.set(x, y + h / 2, z);
      }
      physics.addCylinder(h / 2 + 0.3, r, { kind }, { pos: [x, y + h / 2 + 0.3, z] });
    },

    bumper(p) {
      const [x, y, z] = p.p, r = p.r ?? 0.42;
      const m = addMesh(new THREE.CylinderGeometry(r, r, 0.45, 24), new THREE.MeshStandardMaterial({
        color: p.color || '#ff3b6b', emissive: p.color || '#ff3b6b', emissiveIntensity: 0.35, roughness: 0.3,
      }));
      m.position.set(x, y + 0.225, z);
      const ring = addMesh(new THREE.TorusGeometry(r, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.45, z);
      const b = { x, y: y + 0.2, z, r, power: p.power ?? 1.25, mesh: m, hitT: 0 };
      course.bumpers.push(b);
      course.animators.push((t) => { const s = 1 + Math.max(0, b.hitT - t) * 1.2; m.scale.set(s, 1, s); });
    },

    mover(p) {
      const kind = p.kind || 'floor';
      const cylShape = p.shape === 'cyl';
      const [w, h, d] = cylShape ? [p.r * 2, p.h ?? 0.4, p.r * 2] : p.s;
      let geo;
      if (cylShape) {
        geo = new THREE.CylinderGeometry(p.r, p.r, h, 40);
        // world-ish UVs on the top cap so the floor texture tiles at the right scale
        const pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal;
        for (let i = 0; i < pos.count; i++) if (nor.getY(i) > 0.9) uv.setXY(i, pos.getX(i), pos.getZ(i));
        geo.clearGroups();
        geo.addGroup(0, 40 * 6, 1); // side
        geo.addGroup(40 * 6, 40 * 3, 0); // top cap
        geo.addGroup(40 * 9, 40 * 3, 1); // bottom cap
      } else geo = kind === 'floor' ? boxWithTopGroups(w, h, d) : new THREE.BoxGeometry(w, h, d);
      const mat = kind === 'floor' ? [floorMatFor(p), p.sideLook ? lookMaterial(p.sideLook, mats) : mats.trim] : lookMaterial(p.look || 'trim', mats);
      const mesh = addMesh(geo, mat);
      if (kind === 'floor') mesh.castShadow = false;
      const s0 = p.path(0);
      const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s0.ry || 0);
      const meta0 = { kind, mat: p.mat || mats.theme.floorMat };
      const opts0 = { pos: [s0.x, s0.y, s0.z], quat: q0, kinematic: true };
      const { body } = cylShape ? physics.addCylinder(h / 2, p.r, meta0, opts0) : physics.addBox([w / 2, h / 2, d / 2], meta0, opts0);
      const mover = {
        body, mesh, path: p.path,
        cur: { x: s0.x, y: s0.y, z: s0.z, ry: s0.ry || 0 },
        vel: { x: 0, y: 0, z: 0 }, w: 0,
        velocityAt(pt) {
          const rx = pt.x - this.cur.x, rz = pt.z - this.cur.z;
          return { x: this.vel.x + this.w * rz, y: this.vel.y, z: this.vel.z - this.w * rx };
        },
      };
      // all colliders on this body get mover metadata
      const meta = physics.meta.get(body.collider(0).handle);
      meta.mover = mover;
      meta.unsafe = true;
      mesh.position.set(s0.x, s0.y, s0.z);
      mesh.quaternion.copy(q0);
      course.movers.push(mover);
      expand(s0.x, s0.y, s0.z, Math.max(w, d));
      if (p.extent) for (const e of p.extent) expand(e[0], s0.y, e[1]);
    },

    zone(p) {
      const z = { ...p };
      if (p.rect) {
        const [x0, z0, x1, z1] = p.rect;
        z.contains = (pos) => pos.x >= Math.min(x0, x1) && pos.x <= Math.max(x0, x1) && pos.z >= Math.min(z0, z1) && pos.z <= Math.max(z0, z1);
      } else if (p.c) {
        z.contains = (pos) => Math.hypot(pos.x - p.c[0], pos.z - p.c[1]) <= p.r;
      } else if (p.poly) {
        z.contains = (pos) => pointInPoly(pos.x, pos.z, p.poly);
      }
      z.visual = makeZoneVisual(z);
      course.zones.push(z);
    },

    crumble(p) {
      const [x, y, z] = p.p, [w, d] = p.s, th = p.th ?? 0.5;
      const geo = boxWithTopGroups(w, th, d);
      const mat = [floorMatFor(p), mats.side];
      const mesh = addMesh(geo, mat);
      mesh.castShadow = false;
      const pos0 = [x, y - th / 2, z];
      mesh.position.set(...pos0);
      const { body } = physics.addBox([w / 2, th / 2, d / 2], { kind: 'floor', mat: p.mat || mats.theme.floorMat }, { pos: pos0, kinematic: true });
      const tile = { body, mesh, pos0, state: 'solid', t: 0, hits: 0, need: p.hits ?? 1, kind: p.kindLook || 'crumble' };
      const meta = physics.meta.get(body.collider(0).handle);
      meta.unsafe = true;
      meta.onTouch = () => {
        if (tile.state === 'solid' && !tile.touching) {
          tile.touching = true;
          tile.hits++;
          if (tile.hits >= tile.need) { tile.state = 'shaking'; tile.t = 0; }
        }
        tile.lastTouch = performance.now();
      };
      course.crumbles.push(tile);
      expand(x, y, z, Math.max(w, d) / 2);
    },

    /**
     * Warp pipe: roll over mouth `a` and you shoot out of mouth `b`, heading `dir` ([x,z]) at
     * least `speed` fast. Mouth a is flush with the floor; mouth b is a pipe end facing `dir`.
     */
    warp(p) {
      const [ax, ay, az] = p.a, [bx, by, bz] = p.b;
      const r = p.r ?? 0.5;
      const col = p.color || mats.theme.flag;
      const pipeMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.3 });
      const dark = new THREE.MeshBasicMaterial({ color: '#02040a' });
      // mouth a: a rim on the floor and a dark hole
      const rimA = addMesh(new THREE.TorusGeometry(r + 0.06, 0.09, 8, 28), pipeMat, { cast: false });
      rimA.rotation.x = Math.PI / 2; rimA.position.set(ax, ay + 0.04, az);
      const holeA = addMesh(new THREE.CircleGeometry(r, 28), dark, { cast: false });
      holeA.rotation.x = -Math.PI / 2; holeA.position.set(ax, ay + 0.012, az);
      const chev = makeChevrons(col, 0.4);
      chev.position.set(ax, ay + 0.5, az);
      chev.rotation.x = Math.PI; // pointing down into the pipe
      group.add(chev);
      // mouth b: a short pipe lying along dir, open end facing out
      const d = p.dir || [0, 1];
      const dl = Math.hypot(d[0], d[1]) || 1;
      const ux = d[0] / dl, uz = d[1] / dl;
      const pipeB = addMesh(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 1.2, 24, 1, true), pipeMat);
      pipeB.position.set(bx - ux * 0.7, by + r + 0.05, bz - uz * 0.7);
      pipeB.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz));
      const rimB = addMesh(new THREE.TorusGeometry(r + 0.1, 0.08, 8, 28), pipeMat);
      rimB.position.set(bx - ux * 0.1, by + r + 0.05, bz - uz * 0.1);
      rimB.quaternion.copy(pipeB.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      course.warps.push({ ax, ay, az, r, to: [bx, by, bz], dir: [ux, uz], speed: p.speed ?? 6, pipeB, rimA });
      course.animators.push((t) => { chev.userData.animate(t); pipeMat.emissiveIntensity = 0.3 + 0.15 * Math.sin(t * 4); });
      expand(ax, ay, az, r + 0.5);
      expand(bx, by, bz, r + 0.5);
    },

    /**
     * Bowl: a ring of floor sloping from radius r1 (height y1, the rim) down to radius r0 (y0),
     * like a roulette wheel. The flat middle is a separate floor (use circlePoly).
     */
    bowl(p) {
      const [cx, cz] = p.c, r0 = p.r0, r1 = p.r1, y0 = p.y0 ?? 0, y1 = p.y1, th = 0.6, n = p.seg ?? 56;
      const ring = [[r0, y0], [r1, y1], [r1, y1 - th], [r0, y0 - th]]; // cross-section: inner top, outer top, outer bottom, inner bottom
      const pos = [], idx = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (const [r, y] of ring) pos.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
      }
      for (let i = 0; i < n; i++) {
        const a0 = i * 4, b0 = ((i + 1) % n) * 4;
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) % 4;
          idx.push(a0 + k, b0 + k2, a0 + k2, a0 + k, b0 + k, b0 + k2); // wound so the top faces up
        }
      }
      physics.addTrimesh(new Float32Array(pos), new Uint32Array(idx), { kind: 'floor', mat: p.mat || mats.theme.floorMat });
      // visual: the same ring, with radial numbered-wheel colours
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = addMesh(geo, p.look ? lookMaterial(p.look, mats) : new THREE.MeshStandardMaterial({ color: '#5a1020', roughness: 0.5, side: THREE.DoubleSide }), { cast: false });
      m.castShadow = false;
      // gold rim
      const rim = addMesh(new THREE.TorusGeometry(r1, 0.12, 8, n), lookMaterial('gold', mats));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(cx, y1 + 0.05, cz);
      expand(cx, y1, cz, r1 + 0.5);
    },

    /** See-through tube the ball rolls inside, following a smooth path through `pts` ([x,y,z]). */
    tube(p) {
      const r = p.r ?? 0.5;
      const curve = new THREE.CatmullRomCurve3(p.pts.map((q) => new THREE.Vector3(q[0], q[1] + r, q[2])), false, 'centripetal');
      const segs = Math.max(16, Math.round(curve.getLength() * 6));
      const geo = new THREE.TubeGeometry(curve, segs, r, 16, false);
      // collider: a square duct made of four continuous closed slabs that follow the path
      // (floor, two walls, roof). Each slab is one trimesh solid, just like a normal floor.
      const N = Math.max(6, Math.round(curve.getLength() / 0.3));
      const frames = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const c = curve.getPointAt(u), d = curve.getTangentAt(u);
        const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, d).normalize();
        frames.push({ c, right, up });
      }
      const half = r * 0.82;
      // a slab: cross-section rectangle centred at (ox, oy) in the frame, size (w × h)
      const slab = (ox, oy, w, h, kind) => {
        const pos = [], idx = [];
        for (const f of frames) {
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const q = f.c.clone().addScaledVector(f.right, ox + sx * w / 2).addScaledVector(f.up, oy + sy * h / 2);
            pos.push(q.x, q.y, q.z);
          }
        }
        for (let i = 0; i < N; i++) {
          const a = i * 4, b = (i + 1) * 4;
          for (let k = 0; k < 4; k++) {
            const k2 = (k + 1) % 4;
            idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
          }
        }
        const e = N * 4;
        idx.push(0, 2, 1, 0, 3, 2, e, e + 1, e + 2, e, e + 2, e + 3); // end caps
        physics.addTrimesh(new Float32Array(pos), new Uint32Array(idx), { kind, mat: p.mat || 'glass' }); // slick glass inside
      };
      slab(0, -r - 0.08, half * 2 + 0.3, 0.16, 'floor'); // top flush with the path, so you roll straight in
      slab(half + 0.08, -0.05, 0.16, r * 2 + 0.1, 'wall');
      slab(-half - 0.08, -0.05, 0.16, r * 2 + 0.1, 'wall');
      if (p.roof !== false) slab(0, half + 0.12, half * 2 + 0.3, 0.16, 'wall');
      const glass = new THREE.MeshPhysicalMaterial({ color: p.color || '#bfefff', transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
      const m = addMesh(geo, glass, { cast: false, receive: false });
      m.renderOrder = 2;
      // glowing rings along it so its path reads at a glance
      const ringMat = new THREE.MeshBasicMaterial({ color: p.ring || mats.theme.flag });
      const L = curve.getLength();
      for (let s = 0.6; s < L; s += 1.6) {
        const u = s / L;
        const ring = addMesh(new THREE.TorusGeometry(r + 0.03, 0.03, 6, 24), ringMat, { cast: false });
        ring.position.copy(curve.getPointAt(u));
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(u));
      }
      for (const q of p.pts) expand(q[0], q[1], q[2], r + 0.3);
    },

    teleport(p) {
      const [x, y, z] = p.p;
      const pad = addMesh(new THREE.CylinderGeometry(p.r ?? 0.55, p.r ?? 0.55, 0.06, 32), new THREE.MeshStandardMaterial({
        color: '#18f0ff', emissive: '#18f0ff', emissiveIntensity: 1.2, transparent: true, opacity: 0.8,
      }), { cast: false });
      pad.position.set(x, y + 0.03, z);
      const beam = addMesh(new THREE.CylinderGeometry(p.r ?? 0.55, p.r ?? 0.55, 2.5, 32, 1, true), new THREE.MeshBasicMaterial({
        color: '#18f0ff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
      }), { cast: false, receive: false });
      beam.position.set(x, y + 1.25, z);
      course.teleports.push({ x, y, z, r: p.r ?? 0.55, to: p.to, mesh: pad, beam });
    },

    monster(p) {
      const m = createMonster(p, { group, physics, course, mats });
      if (m) course.monsters.push(m);
    },

    deco(p) {
      // free-form decorative object, no collision
      const fn = p.make;
      if (fn) { const obj = fn(THREE, mats); group.add(obj); }
    },
  };

  function makeZoneVisual(z) {
    if (z.hidden) return null;
    const y = (z.y ?? 0) + 0.012;
    let geo;
    if (z.rect) {
      const [x0, z0, x1, z1] = z.rect;
      geo = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
      geo.rotateX(-Math.PI / 2);
      geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    } else if (z.c) {
      geo = new THREE.CircleGeometry(z.r, 32);
      geo.rotateX(-Math.PI / 2);
      geo.translate(z.c[0], y, z.c[1]);
    } else return null;
    const colors = { conveyor: '#ffb800', vent: '#9ff0ff', boost: '#00ff88', slow: '#6b3d1f', magma: '#ff4a00', sand: '#d9a35f', ice: '#cbefff', current: '#6fe7ff', bubble: '#bff2ff' };
    let mat;
    if (z.kind === 'lava') {
      // molten rock: dark crust plates floating on glowing magma, slowly drifting
      const tex = lavaTexture().clone();
      tex.needsUpdate = true;
      const [sx, sz] = z.rect ? [Math.abs(z.rect[2] - z.rect[0]), Math.abs(z.rect[3] - z.rect[1])] : [z.r * 2, z.r * 2];
      tex.repeat.set(sx / 3, sz / 3);
      mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const m = new THREE.Mesh(geo, mat);
      group.add(m);
      const ph = (z.rect?.[0] ?? z.c?.[0] ?? 0) * 0.37;
      course.animators.push((t) => {
        tex.offset.set(Math.sin(t * 0.13 + ph) * 0.2, t * 0.035);
        const k = 0.8 + Math.sin(t * 2.1 + ph) * 0.12;
        mat.color.setRGB(k, k, k);
      });
      return m;
    }
    if (z.kind === 'bubble') {
      const cx = z.c[0], cz = z.c[1], h = z.height ?? 4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, h, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#bff2ff', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      col.position.set(cx, y + h / 2, cz);
      group.add(col);
      const chev = makeChevrons(mats.theme.flag, z.r * 0.8);
      chev.position.set(cx, y + 0.3, cz);
      group.add(chev);
      const bubbles = [];
      const bm = new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.7 });
      for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.03, 6, 4), bm); group.add(b); bubbles.push({ b, a: i * 2.4, o: i / 14 }); }
      course.animators.push((t) => {
        chev.userData.animate(t, course.camera);
        for (const q of bubbles) { const u = (t * 0.35 + q.o) % 1; q.b.position.set(cx + Math.cos(q.a + t) * z.r * 0.6, y + u * h, cz + Math.sin(q.a + t) * z.r * 0.6); }
      });
    }
    if (z.kind === 'conveyor' || z.kind === 'boost' || z.kind === 'current') {
      const tex = arrowTexture(colors[z.kind] || '#6fe7ff');
      tex.repeat.set(Math.max(1, Math.round((z.rect ? Math.abs(z.rect[2] - z.rect[0]) : 2) / 1)), Math.max(1, Math.round((z.rect ? Math.abs(z.rect[3] - z.rect[1]) : 2) / 1)));
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
      const dir = z.dir;
      const ang = Math.atan2(dir[0], dir[1]);
      tex.center.set(0.5, 0.5);
      tex.rotation = -ang + Math.PI;
      z.tex = tex;
    } else {
      const slowBySector = { desert: '#b9874a', forest: '#5b3a1e', ice: '#ffffff', mountain: '#4a3f38', sector5: '#3d6cff', fortune: '#ff2bd6', volcano: '#5a2414', sea: '#2a8fd6', network: '#3fa9ff' };
      const col = z.kind === 'slow' ? (z.color || slowBySector[def.sector] || colors.slow) : (colors[z.kind] || '#fff');
      const op = z.kind === 'vent' ? 0.35 : z.kind === 'slow' && def.sector === 'ice' ? 0.85 : 0.5;
      mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
    }
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
    if (z.kind === 'vent') {
      const cx = z.c ? z.c[0] : (z.rect[0] + z.rect[2]) / 2, cz = z.c ? z.c[1] : (z.rect[1] + z.rect[3]) / 2;
      const r = z.r ?? Math.min(Math.abs(z.rect[2] - z.rect[0]), Math.abs(z.rect[3] - z.rect[1])) / 2;
      // swirling column of air above it
      const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, z.height ?? 3, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#c8ffff', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      col.position.set(cx, y + (z.height ?? 3) / 2, cz);
      group.add(col);
      // a spring pad with "up" chevrons and the throw arc, so the jump is obvious
      const pad = makeJumpPad({ r, color: mats.theme.flag, dir: z.push || [0, 1], launch: z.launch ?? 10.5, minSpeed: z.minSpeed ?? 2.8 });
      pad.position.set(cx, y, cz);
      group.add(pad);
      z.pad = pad;
      course.animators.push((t) => {
        col.rotation.y = t * 2; col.material.opacity = 0.1 + 0.05 * Math.sin(t * 6);
        pad.userData.animate(t, course.camera);
      });
    }
    return m;
  }

  function makePitSign(pit) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.2, 0.6, 1);
    sprite.position.set(pit.x, pit.y + 1.3, pit.z);
    group.add(sprite);
    const ring = addMesh(new THREE.TorusGeometry(pit.r + 0.04, 0.05, 8, 40), new THREE.MeshStandardMaterial({
      color: '#ffe600', emissive: '#ffe600', emissiveIntensity: 1.5,
    }), { cast: false });
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pit.x, pit.y + 0.02, pit.z);
    let lastShown = -1;
    course.animators.push((t) => {
      const v = Math.floor(t * 7 + pit.x * 3 + pit.z) % 5 + 1;
      if (v !== lastShown) {
        lastShown = v;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 128, 64);
        g.font = 'bold 44px Orbitron, monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = '#ff2bd6'; g.shadowBlur = 12;
        g.fillStyle = '#ffe600';
        g.fillText('+' + v, 64, 34);
        tex.needsUpdate = true;
      }
      ring.material.emissiveIntensity = 1 + Math.sin(t * 8 + pit.x) * 0.6;
    });
    return sprite;
  }

  // Real cups: each cup that sits fully inside a flat floor gets a hole cut in that floor (the
  // extruded hole's side faces become the cup's liner) and a solid bottom. The ball then drops in,
  // rattles or lips out under the same physics as everything else. Cups anywhere else (sloped
  // trays, bowls) keep the old capture rule in Ball.cupWants.
  const parts = def.parts.slice();
  for (const cup of course.cups) {
    const ring = circlePoly(cup.x, cup.z, CUP_R, 28);
    const clear = circlePoly(cup.x, cup.z, CUP_R + 0.12, 16);
    cup.physical = false;
    parts.forEach((p, i) => {
      if (p.t !== 'floor' || Math.abs((p.y ?? 0) - cup.y) > 0.05) return;
      if (!clear.every(([x, z]) => pointInPoly(x, z, p.poly))) return;
      const blocked = (p.holes || []).some((h) => (h.c ? Math.hypot(h.c[0] - cup.x, h.c[1] - cup.z) < h.r + CUP_R + 0.1 : h.poly.some(([x, z]) => Math.hypot(x - cup.x, z - cup.z) < CUP_R + 0.1)));
      if (blocked) return;
      parts[i] = { ...p, holes: [...(p.holes || []), { poly: ring, cup: true }] };
      cup.physical = true;
    });
    if (cup.physical) {
      // the bottom of the cup (slightly wider than the hole so nothing slips past the liner)
      physics.addCylinder(0.06, CUP_R + 0.04, { kind: 'floor', mat: 'default' }, { pos: [cup.x, cup.y - CUP_DEPTH - 0.06, cup.z] });
    }
  }

  for (const part of parts) {
    const b = builders[part.t];
    if (!b) { console.warn('Unknown part', part.t); continue; }
    b(part);
  }

  // ---------- tee + cup ----------
  const teePad = addMesh(new THREE.BoxGeometry(1.1, 0.04, 1.1), new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.9 }), { cast: false });
  teePad.position.set(course.tee.x, course.tee.y + 0.02, course.tee.z);
  makeCup(course, group, mats);

  // ---------- derived data ----------
  course.bounds.expandByPoint(course.tee);
  for (const c of course.cups) course.bounds.expandByPoint(new THREE.Vector3(c.x, c.y, c.z));
  course.killY = Math.min(course.bounds.min.y - 6, def.killY ?? Infinity);
  course.center = course.bounds.getCenter(new THREE.Vector3());
  course.size = course.bounds.getSize(new THREE.Vector3());

  const decoRng = new RNG(def.id + ':deco');
  course.decoration = decorate(def.sector, course, group, decoRng);

  // ---------- runtime ----------
  course.randomFloorPoint = (rng) => {
    for (let tries = 0; tries < 200; tries++) {
      const f = rng.pick(course.floors);
      const xs = f.poly.map((p) => p[0]), zs = f.poly.map((p) => p[1]);
      const x = rng.range(Math.min(...xs), Math.max(...xs));
      const z = rng.range(Math.min(...zs), Math.max(...zs));
      if (!pointInPoly(x, z, f.poly)) continue;
      if (f.holes.some((h) => h.c && Math.hypot(x - h.c[0], z - h.c[1]) < h.r + 1)) continue;
      // keep away from edges
      let ok = true;
      for (const [ox, oz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) if (!pointInPoly(x + ox, z + oz, f.poly)) ok = false;
      if (!ok) continue;
      return new THREE.Vector3(x, f.y, z);
    }
    return course.tee.clone();
  };

  /** Height of the highest flat floor at (x,z), or null if there is none (ramps ignored). */
  course.floorYAt = (x, z) => {
    let best = null;
    for (const f of course.floors) {
      if (!pointInPoly(x, z, f.poly)) continue;
      if (f.holes.some((h) => h.c && Math.hypot(x - h.c[0], z - h.c[1]) < h.r + 0.3)) continue;
      if (best === null || f.y > best) best = f.y;
    }
    return best;
  };

  course.pitAt = (p, ball) => {
    if (ball?.mods.ghost) return null;
    for (const pit of course.pits) {
      if (p.y < pit.y - 0.6 && Math.hypot(p.x - pit.x, p.z - pit.z) < pit.r + 0.5) return pit; // + rim drops
    }
    return null;
  };

  course.zoneForces = (ball, out) => {
    const p = ball.pos, v = ball.vel;
    for (const z of course.zones) {
      if (!z.contains(p)) continue;
      const zy = z.y ?? 0;
      if (z.kind === 'conveyor') {
        // on a ramp the belt follows the slope; on flat ground it only acts at its own level
        if (!ball.grounded || (!z.ramp && Math.abs(p.y - zy - ball.radius) > 0.3)) continue;
        const sp = z.speed ?? 3;
        out.x += (z.dir[0] * sp - v.x) * 2.5 + z.dir[0] * 2;
        out.z += (z.dir[1] * sp - v.z) * 2.5 + z.dir[1] * 2;
        out.wake = true;
      } else if (z.kind === 'boost') {
        if (!ball.grounded) continue;
        const along = v.x * z.dir[0] + v.z * z.dir[1];
        const sp = z.speed ?? 12;
        // a booster brings the ball up to speed almost at once: a weak push could be balanced by
        // gravity at the pad's edge on a ramp, leaving the ball hovering there forever
        if (along < sp) { const a = (sp - along) / FIXED_DT; out.x += z.dir[0] * a; out.z += z.dir[1] * a; out.wake = true; }
        if (z.align) { // rails: bleed off sideways speed
          const px = -z.dir[1], pz = z.dir[0];
          const perp = v.x * px + v.z * pz;
          out.x -= px * perp * z.align; out.z -= pz * perp * z.align;
        }
      } else if (z.kind === 'vent') {
        // a geyser: fires the ball upward, keeping its own horizontal speed (with a minimum push)
        if ((ball.ventCool ?? 0) > 0 || p.y - zy > ball.radius + 0.35) continue;
        const d = z.push || [0, 1];
        const dl = Math.hypot(d[0], d[1]) || 1;
        const ux = d[0] / dl, uz = d[1] / dl;
        let nx = v.x, nz = v.z;
        const along = nx * ux + nz * uz;
        const minSp = z.minSpeed ?? 2.8;
        if (along < minSp) { nx += ux * (minSp - along); nz += uz * (minSp - along); }
        out.launch = { x: nx, y: z.launch ?? 10.5, z: nz };
        out.wake = true;
        z.pad?.userData.fire(course.time ?? 0);
      } else if (z.kind === 'wind') {
        out.x += z.dir[0] * (z.force ?? 4); out.z += z.dir[1] * (z.force ?? 4);
        if (ball.state === 'moving') out.wake = true;
      } else if (z.kind === 'current') {
        // a water current carries the ball along, on the floor or floating
        if (p.y < zy - 0.2 || p.y > zy + (z.height ?? 2.5)) continue;
        // it pushes along its flow only, so a ball cutting across keeps its own speed
        const sp = z.speed ?? 3;
        const along = v.x * z.dir[0] + v.z * z.dir[1];
        const k = Math.max(0, sp - along) * 1.2 + 1.5;
        out.x += z.dir[0] * k; out.z += z.dir[1] * k;
        out.wake = true;
      } else if (z.kind === 'bubble') {
        // a rising column of bubbles: carries the ball up at a steady speed, centred, and near
        // the top nudges it out sideways (push) so it lands on the ledge above
        const h = z.height ?? 4;
        if (p.y < zy - 0.2 || p.y > zy + h) continue;
        const rise = z.rise ?? 3.2;
        out.y += GRAVITY + (rise - v.y) * 5;
        const dx = z.c[0] - p.x, dz = z.c[1] - p.z;
        const top = p.y > zy + h * 0.7;
        if (top && z.push) { out.x += z.push[0] * 9 - v.x * 1.5; out.z += z.push[1] * 9 - v.z * 1.5; }
        else { out.x += dx * 4 - v.x * 3; out.z += dz * 4 - v.z * 3; }
        out.wake = true;
      }
    }
    if (def.water && !ball.grounded) { out.y += GRAVITY * 0.35; out.x -= v.x * 0.25; out.z -= v.z * 0.25; }
    if (!ball.mods.monsterProof) for (const m of course.monsters) if (!m.slashed) m.force?.(ball, course.time ?? 0, out);
    return out;
  };

  /** Belts, boosts, launchers, currents and lava aren't somewhere to respawn. */
  course.unsafeAt = (p) => course.zones.some((z) => ['conveyor', 'boost', 'vent', 'current', 'bubble', 'lava'].includes(z.kind) && z.contains(p));

  /** Is the ball touching lava? */
  course.lavaAt = (p, ball) => {
    if (ball?.mods.ghost || ball?.fly || ball?.glideT > 0 || ball?.groundMeta?.mover) return false; // rafts over lava are safe
    for (const z of course.zones) if (z.kind === 'lava' && z.contains(p) && p.y - ball.radius - (z.y ?? 0) < 0.12) return true;
    return false;
  };

  /** Warp pipes: entering a mouth returns where (and how fast) the ball comes out. */
  course.warpAt = (p, ball) => {
    if ((ball.warpCool ?? 0) > 0 || ball.fly) return null;
    for (const w of course.warps) {
      if (Math.hypot(p.x - w.ax, p.z - w.az) < w.r * 0.85 && Math.abs(p.y - ball.radius - w.ay) < 0.35) {
        const v = ball.vel;
        const sp = Math.max(Math.hypot(v.x, v.z), w.speed);
        return { to: [w.to[0] + w.dir[0] * 0.2, w.to[1] + ball.radius + 0.05, w.to[2] + w.dir[1] * 0.2], vel: { x: w.dir[0] * sp, y: 0.5, z: w.dir[1] * sp } };
      }
    }
    return null;
  };

  course.zoneDecel = (ball) => {
    const p = ball.pos;
    let m = 1;
    for (const z of course.zones) {
      if (!z.contains(p)) continue;
      if (z.kind === 'slow' || z.kind === 'sand') m *= z.mul ?? 3;
      if (z.kind === 'ice') m *= z.mul ?? 0.12;
    }
    return m;
  };

  /** physics-time update (called every fixed step with hole time t). */
  course.update = (t, dt) => {
    course.time = t;
    for (const mv of course.movers) {
      const s = mv.path(t + dt);
      const ry = s.ry || 0;
      mv.vel.x = (s.x - mv.cur.x) / dt; mv.vel.y = (s.y - mv.cur.y) / dt; mv.vel.z = (s.z - mv.cur.z) / dt;
      let dr = ry - mv.cur.ry;
      mv.w = dr / dt;
      // the speed estimate breaks when paths wrap or jump
      if (Math.hypot(mv.vel.x, mv.vel.y, mv.vel.z) > 40) { mv.vel.x = mv.vel.y = mv.vel.z = 0; }
      if (Math.abs(mv.w) > 20) mv.w = 0;
      mv.cur.x = s.x; mv.cur.y = s.y; mv.cur.z = s.z; mv.cur.ry = ry;
      mv.body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      mv.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    for (const tile of course.crumbles) updateCrumble(tile, dt);
    for (const m of course.monsters) m.update?.(t, dt);
  };

  /** render-time update. */
  course.frame = (t, dt) => {
    for (const mv of course.movers) {
      const p = mv.body.translation(), r = mv.body.rotation();
      mv.mesh.position.set(p.x, p.y, p.z);
      mv.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const z of course.zones) if (z.tex) z.tex.offset.y = (z.tex.offset.y - dt * (z.speed ?? 3) * 0.6) % 1;
    for (const a of course.animators) a(t, dt);
    for (const m of course.monsters) m.frame?.(t, dt);
    course.decoration?.frame?.(t, dt);
  };

  function updateCrumble(tile, dt) {
    if (tile.touching && performance.now() - tile.lastTouch > 120) tile.touching = false;
    if (tile.state === 'shaking') {
      tile.t += dt;
      const j = 0.04;
      const p = [tile.pos0[0] + (Math.random() - 0.5) * j, tile.pos0[1], tile.pos0[2] + (Math.random() - 0.5) * j];
      tile.body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
      tile.mesh.position.set(...p);
      if (tile.t > (tile.kind === 'thinice' ? 0.35 : 0.7)) { tile.state = 'falling'; tile.t = 0; tile.vy = 0; }
    } else if (tile.state === 'falling') {
      tile.t += dt;
      tile.vy -= 14 * dt;
      const y = tile.mesh.position.y + tile.vy * dt;
      tile.mesh.position.y = y;
      tile.mesh.rotation.x += dt * 0.8;
      tile.body.setNextKinematicTranslation({ x: tile.pos0[0], y, z: tile.pos0[2] });
      if (tile.t > 5) {
        tile.state = 'solid'; tile.hits = 0;
        tile.mesh.position.set(...tile.pos0); tile.mesh.rotation.set(0, 0, 0);
        tile.body.setNextKinematicTranslation({ x: tile.pos0[0], y: tile.pos0[1], z: tile.pos0[2] });
      }
    }
  }

  course.checkTeleport = (ball, rng) => {
    if (ball.teleportCooldown > 0) return null;
    const p = ball.pos;
    for (const tp of course.teleports) {
      if (Math.hypot(p.x - tp.x, p.z - tp.z) < tp.r && Math.abs(p.y - ball.radius - tp.y) < 0.4) {
        const dest = rng.pick(tp.to);
        return new THREE.Vector3(dest[0], dest[1] + ball.radius + 0.05, dest[2]);
      }
    }
    return null;
  };

  course.dispose = () => {
    for (const m of course.monsters) m.dispose?.();
    course.decoration?.dispose?.();
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  };

  return course;
}

// ---------- helpers ----------
function boxWithTopGroups(w, h, d) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const bottom = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]];
  const top = bottom.map(([x, , z]) => [x, hy, z]);
  return prismGeometry(bottom, top);
}

let _bark, _leaf;
function treeBark() {
  if (!_bark) { const t = TEX.bark(); t.repeat.set(1, 2); _bark = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); }
  return _bark;
}
function leafMat() {
  if (!_leaf) _leaf = new THREE.MeshStandardMaterial({ color: '#2f8f3a', roughness: 0.9, flatShading: true });
  return _leaf;
}

const lookCache = new Map();
export function lookMaterial(look, mats) {
  if (!look || look === 'wall') return mats.wall;
  if (look === 'trim') return mats.trim;
  if (lookCache.has(look)) return lookCache.get(look);
  let m;
  switch (look) {
    case 'rock': { const t = TEX.rock(); t.repeat.set(0.5, 0.5); m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, flatShading: true }); break; }
    case 'wood': { const t = TEX.wood(); t.repeat.set(0.5, 0.5); m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); break; }
    case 'ice': m = new THREE.MeshPhysicalMaterial({ color: '#c9ecff', roughness: 0.05, transmission: 0.5, thickness: 0.5, transparent: true, opacity: 0.9 }); break;
    case 'pillar': m = new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.6 }); break;
    case 's5': m = new THREE.MeshStandardMaterial({ color: '#f4f7ff', roughness: 0.35, emissive: '#1a3cff', emissiveIntensity: 0.25 }); break;
    case 'neon': m = new THREE.MeshStandardMaterial({ color: '#1d0b33', emissive: '#18f0ff', emissiveIntensity: 0.8, roughness: 0.3 }); break;
    case 'sandstone': { const t = TEX.sandstone(); t.repeat.set(0.5, 0.5); m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); break; }
    case 'cactus': m = new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.8, flatShading: true }); break;
    case 'bark': { const t = TEX.bark(); t.repeat.set(0.5, 0.5); m = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); break; }
    case 'stone': { const t = TEX.stone(); t.repeat.set(0.5, 0.5); m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); break; }
    case 'holo': m = new THREE.MeshStandardMaterial({ color: '#18f0ff', emissive: '#18f0ff', emissiveIntensity: 1.2, transparent: true, opacity: 0.7, roughness: 0.2 }); break;
    case 'snow': m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }); break;
    case 'dice': m = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: diceFace(n), roughness: 0.3 })); break;
    case 'gold': m = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 0.8, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.3 }); break;
    case 'chip': m = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.5, emissive: '#3a0008', emissiveIntensity: 0.3 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: look, roughness: 0.6 });
  }
  lookCache.set(look, m);
  return m;
}

let lavaTex = null;
function lavaTexture() {
  if (lavaTex) return lavaTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, '#ff5a00'); grd.addColorStop(0.5, '#ff2a00'); grd.addColorStop(1, '#ff7a10');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  // hot yellow veins
  g.strokeStyle = 'rgba(255,220,80,0.7)'; g.lineWidth = 3;
  for (let i = 0; i < 18; i++) {
    g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  // dark crust plates (drawn wrapped so the texture tiles)
  for (let i = 0; i < 26; i++) {
    const cx = Math.random() * 256, cy = Math.random() * 256, r = 10 + Math.random() * 22;
    const pts = Array.from({ length: 7 }, (_, a) => { const ang = (a / 7) * Math.PI * 2, rr = r * (0.7 + Math.random() * 0.4); return [Math.cos(ang) * rr, Math.sin(ang) * rr]; });
    g.fillStyle = `rgba(${40 + Math.random() * 30},${10 + Math.random() * 10},8,0.92)`;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      g.beginPath();
      for (const [px, py] of pts) g.lineTo(cx + ox + px, cy + oy + py);
      g.closePath(); g.fill();
    }
  }
  lavaTex = new THREE.CanvasTexture(c);
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  return lavaTex;
}

function diceFace(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#d8cfbf'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[n];
  g.fillStyle = n === 1 ? '#c8102e' : '#141414';
  for (const [x, y] of P) { g.beginPath(); g.arc(x, y, n === 1 ? 16 : 12, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function arrowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(32, 8); g.lineTo(56, 36); g.lineTo(42, 36); g.lineTo(42, 56); g.lineTo(22, 56); g.lineTo(22, 36); g.lineTo(8, 36); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCup(course, group, mats) {
  for (const c of course.cups.slice(1)) makeCupAt(course, group, mats, c);
  makeCupAt(course, group, mats, course.cup);
}

/** A floating "+2" / "−1" sign over a Fortune cup. */
function modLabel(mod) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  const txt = mod === 0 ? '±0' : mod > 0 ? `+${mod}` : `−${-mod}`;
  const col = mod < 0 ? '#3dff8a' : mod > 0 ? '#ff3b4e' : '#ffe600';
  g.font = 'italic 900 64px Orbitron, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 18;
  g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(txt, 64, 50);
  g.fillStyle = col; g.fillText(txt, 64, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.1, 0.82, 1);
  return s;
}

function makeCupAt(course, group, mats, cup) {
  const { x, y, z } = cup;
  if (cup.mod !== null && cup.mod !== undefined) {
    const lbl = modLabel(cup.mod);
    lbl.position.set(x, y + 1.6, z);
    group.add(lbl);
    course.animators.push((t) => { lbl.position.y = y + 1.6 + Math.sin(t * 2.5 + x) * 0.08; });
  }
  if (cup.physical) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R - 0.004, CUP_R - 0.004, CUP_DEPTH, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: '#e9eef2', roughness: 0.6, side: THREE.BackSide }));
    liner.position.set(x, y - CUP_DEPTH / 2, z);
    liner.receiveShadow = true;
    group.add(liner);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.9 }));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(x, y - CUP_DEPTH + 0.002, z);
    bottom.receiveShadow = true;
    group.add(bottom);
  } else {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshBasicMaterial({ color: '#050505' }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, y + 0.006, z);
    group.add(hole);
  }
  const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.06, 32), new THREE.MeshStandardMaterial({ color: '#f5f5f5' }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(x, y + 0.007, z);
  group.add(rim);
  // glow ring so it's visible from far
  const ringCol = cup.mod === null || cup.mod === undefined ? mats.theme.flag : cup.mod < 0 ? '#3dff8a' : cup.mod > 0 ? '#ff3b4e' : '#ffe600';
  const glow = new THREE.Mesh(new THREE.RingGeometry(CUP_R + 0.1, CUP_R + 0.2, 40), new THREE.MeshBasicMaterial({
    color: ringCol, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, y + 0.008, z);
  group.add(glow);
  course.animators.push((t) => { glow.material.opacity = 0.35 + 0.3 * Math.sin(t * 3); glow.scale.setScalar(1 + 0.08 * Math.sin(t * 3)); });

  // the cup leads into a tower XANA has activated: its hologram floats over the hole
  const holo = makeTowerHolo({ mini: !!cup.extra, aura: cup.extra && cup.mod !== null && cup.mod !== undefined ? ringCol : '#ff2a2a' });
  holo.position.set(x, y, z);
  group.add(holo);
  (course.towers ||= []).push({ cup, holo });
  course.animators.push((t) => holo.userData.animate(t));
}
