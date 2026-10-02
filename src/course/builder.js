import * as THREE from 'three';
import { makeJumpPad, makeChevrons } from '../fx/jumppad.js';
import { themeMaterials, surfaceMaterial, TEX } from './themes.js';
import { slabGeometry, prismGeometry, trimeshData, signedArea, pointInPoly } from './geometry.js';
import { CUP_R } from '../physics/ball.js';
import { GRAVITY } from '../physics/world.js';
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
    animators: [],
    killY: -8,
  };
  course.cups = [course.cup, ...(def.cups || []).map((c) => ({ x: c[0], y: c[1], z: c[2], extra: true }))];
  /** The cup closest to a point (for holes with several). */
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
    const colors = { conveyor: '#ffb800', vent: '#9ff0ff', boost: '#00ff88', slow: '#6b3d1f', magma: '#ff4a00', sand: '#d9a35f', ice: '#cbefff' };
    let mat;
    if (z.kind === 'conveyor' || z.kind === 'boost') {
      const tex = arrowTexture(colors[z.kind]);
      tex.repeat.set(Math.max(1, Math.round((z.rect ? Math.abs(z.rect[2] - z.rect[0]) : 2) / 1)), Math.max(1, Math.round((z.rect ? Math.abs(z.rect[3] - z.rect[1]) : 2) / 1)));
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
      const dir = z.dir;
      const ang = Math.atan2(dir[0], dir[1]);
      tex.center.set(0.5, 0.5);
      tex.rotation = -ang + Math.PI;
      z.tex = tex;
    } else {
      const slowBySector = { desert: '#b9874a', forest: '#5b3a1e', ice: '#ffffff', mountain: '#4a3f38', sector5: '#3d6cff', fortune: '#ff2bd6' };
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

  for (const part of def.parts) {
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
        if (along < sp) { out.x += z.dir[0] * 60; out.z += z.dir[1] * 60; out.wake = true; }
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
      }
    }
    if (!ball.mods.monsterProof) for (const m of course.monsters) m.force?.(ball, course.time ?? 0, out);
    return out;
  };

  /** Belts, boosts and launchers aren't somewhere to respawn. */
  course.unsafeAt = (p) => course.zones.some((z) => (z.kind === 'conveyor' || z.kind === 'boost' || z.kind === 'vent') && z.contains(p));

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
    if (course.flag) {
      const spin = course.flagSpin !== undefined ? Math.max(0, 1.2 - (t - course.flagSpin)) : 0;
      course.flag.rotation.y = Math.sin(t * 2) * 0.25 + (spin > 0 ? (1.2 - spin) * 14 : 0);
      const pos = course.flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = course.flagBase[i * 3];
        pos.setZ(i, Math.sin(t * 6 + x * 6) * 0.05 * x);
      }
      pos.needsUpdate = true;
    }
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
    default: m = new THREE.MeshStandardMaterial({ color: look, roughness: 0.6 });
  }
  lookCache.set(look, m);
  return m;
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

function makeCupAt(course, group, mats, cup) {
  const { x, y, z } = cup;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshBasicMaterial({ color: '#050505' }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, y + 0.006, z);
  group.add(hole);
  const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.06, 32), new THREE.MeshStandardMaterial({ color: '#f5f5f5' }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(x, y + 0.007, z);
  group.add(rim);
  // glow ring so it's visible from far
  const glow = new THREE.Mesh(new THREE.RingGeometry(CUP_R + 0.1, CUP_R + 0.2, 40), new THREE.MeshBasicMaterial({
    color: mats.theme.flag, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, y + 0.008, z);
  group.add(glow);
  course.animators.push((t) => { glow.material.opacity = 0.35 + 0.3 * Math.sin(t * 3); glow.scale.setScalar(1 + 0.08 * Math.sin(t * 3)); });

  if (cup.extra) { // extra cups: a short neon marker instead of a full flag
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), new THREE.MeshBasicMaterial({ color: mats.theme.flag }));
    post.position.set(x, y + 0.55, z);
    group.add(post);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: mats.theme.flag }));
    tip.position.set(x, y + 1.2, z);
    group.add(tip);
    course.animators.push((t) => { tip.rotation.y = t * 2; tip.position.y = y + 1.2 + Math.sin(t * 2 + x) * 0.06; });
    return;
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#dddddd', metalness: 0.6, roughness: 0.3 }));
  pole.position.set(x, y + 1.1, z);
  pole.castShadow = true;
  group.add(pole);
  const fgeo = new THREE.PlaneGeometry(0.8, 0.5, 10, 4);
  fgeo.translate(0.4, 0, 0);
  const flag = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ color: mats.theme.flag, side: THREE.DoubleSide, emissive: mats.theme.flag, emissiveIntensity: 0.3 }));
  flag.position.set(x + 0.02, y + 1.95, z);
  flag.castShadow = true;
  group.add(flag);
  course.flag = flag;
  course.flagBase = Float32Array.from(fgeo.attributes.position.array);
}
