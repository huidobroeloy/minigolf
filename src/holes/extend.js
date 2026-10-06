import { patrol } from './helpers.js';
import { pointInPoly } from '../course/geometry.js';

// Longer holes. Every hole keeps its own layout, but now you reach it through a winding approach
// lane: the new tee is at the far end of a dogleg corridor that joins the old start through its
// back edge. Each lane carries its sector's hazards and monsters. There is no shortcut: you play
// the whole lane.

// Corridor shapes, as points walking BACK from the old start's back edge (local frame: +z is
// forward into the hole, +x right). Long lanes ≈ 41–55 (holes up to par 4); the short ones (≈ 22–40,
// suffix 0) go in front of par-5 holes and are the fallback when a long lane doesn't fit.
export const SHAPES = {
  S: [[0, 0], [0, -5], [8, -5], [8, -15], [0, -15], [0, -25]],
  Z: [[0, 0], [0, -4], [-6, -10], [-6, -20], [2, -28], [2, -36]],
  U: [[0, 0], [0, -6], [-8, -6], [-8, -14], [0, -14], [0, -22], [8, -22], [8, -14]],
  L: [[0, 0], [0, -11], [-11, -11], [-11, -22], [-1, -22], [-1, -30]],
  zig: [[0, 0], [0, -4], [5, -9], [0, -14], [5, -19], [0, -24], [5, -29], [5, -35]],
  hook: [[0, 0], [0, -6], [-8, -6], [-8, -15], [2, -15], [2, -23], [-5, -23], [-5, -30]],
  S0: [[0, 0], [0, -5], [8, -5], [8, -15]],
  U0: [[0, 0], [0, -8], [9, -8], [9, -2]],
  Z0: [[0, 0], [0, -4], [-6, -10], [-6, -18]],
  L0: [[0, 0], [0, -11], [-11, -11]],
  zig0: [[0, 0], [0, -4], [5, -9], [0, -14], [5, -19], [5, -23]],
  hook0: [[0, 0], [0, -6], [-8, -6], [-8, -16], [2, -16], [2, -22]],
};

// Each sector's typical monsters (its lanes use these; holes/monsterRoll.js mixes in guests each match).
export const ROSTER = {
  desert: ['kankrelat', 'tarantula'],
  forest: ['hornet', 'kankrelat', 'blok'],
  ice: ['krabe', 'blok'],
  mountain: ['tarantula', 'manta', 'hornet'],
  sector5: ['creeper', 'manta'],
  volcano: ['tarantula', 'krabe', 'blok'],
  sea: ['shark', 'manta'],
  network: ['manta', 'creeper'],
};

// What each sector puts in its lanes: the floor look comes from the theme; these are the extras.
const FLAVOUR = {
  desert: { hazard: 'sand', prop: 'sandstone' },
  forest: { hazard: 'trees', prop: 'tree' },
  ice: { hazard: 'snow', prop: 'ice' },
  mountain: { hazard: 'wind', prop: 'rock' },
  sector5: { hazard: 'bumpers', prop: 's5' },
  volcano: { hazard: 'lava', prop: 'rock' },
  sea: { hazard: 'current', prop: 'neon' },
  network: { hazard: 'bumpers', prop: 'neon' },
};

/**
 * A lane monster of any type on a lane slot: { a, b } its patrol ends across the lane, y the floor,
 * k its index (phase). The slot is kept on the spec (lane) so the type can be re-rolled each match.
 */
export function laneMonster(type, slot) {
  const { a, b, y, k } = slot;
  if (type === 'creeper') return { t: 'monster', type, p: [b[0], y, b[1]], period: 4.2, phase: k * 0.37, lane: slot };
  const spec = {
    t: 'monster', type, lane: slot,
    path: patrol(a, b, type === 'krabe' ? 5.5 : 3.6, y + (type === 'manta' ? 1.4 : type === 'hornet' ? 2.3 : 0), k * 0.4),
  };
  if (type === 'hornet') spec.aim = 'ball';
  if (type === 'manta') spec.size = 0.8;
  return spec;
}
const SHOOTERS = new Set(['kankrelat', 'hornet', 'blok', 'krabe', 'tarantula', 'creeper', 'manta', 'shark', 'megatank', 'scyphozoa']);

const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** Floor polygon of a corridor of width w along pts (miter joins). Returns { poly, startEdge, endEdge }. */
export function corridorPoly(pts, w) {
  const n = pts.length - 1;
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n, i + 1)];
    const d1 = i > 0 ? norm([b[0] - a[0], b[1] - a[1]]) : null, d2 = i < n ? norm([c[0] - b[0], c[1] - b[1]]) : null;
    const dirs = [d1, d2].filter(Boolean);
    let nx = 0, nz = 0;
    for (const d of dirs) { nx += -d[1]; nz += d[0]; }
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    // miter length so the walls stay w apart round the bend
    const dd = dirs[0];
    const cos = dirs.length === 2 ? Math.max(0.35, (-dd[1]) * nx + dd[0] * nz) : 1;
    const h = w / 2 / cos;
    left.push([b[0] + nx * h, b[1] + nz * h]);
    right.push([b[0] - nx * h, b[1] - nz * h]);
  }
  const poly = [...left, ...right.reverse()];
  return { poly, endEdge: n, startEdge: 2 * n + 1 };
}
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k);
};

/** Does a point of a new lane (at height y) land on a floor, ramp, tube or bowl of the hole? */
function laneBlocker(def, y) {
  const near = (h) => Math.abs(h - y) < 2.5;
  const tests = [];
  for (const p of def.parts) {
    if (p.poly && near(p.y ?? 0)) tests.push((x, z) => pointInPoly(x, z, p.poly));
    if (p.t === 'ramp' && (near(p.ya) || near(p.yb))) tests.push((x, z) => segDist(x, z, p.a, p.b) < (p.w ?? 3) / 2 + 0.2);
    if (p.t === 'tube' && p.pts.some((q) => near(q[1]))) {
      const r = (p.r ?? 0.5) + 0.3;
      tests.push((x, z) => p.pts.some((q, i) => i > 0 && segDist(x, z, [p.pts[i - 1][0], p.pts[i - 1][2]], [q[0], q[2]]) < r));
    }
    if (p.t === 'bowl') tests.push((x, z) => Math.hypot(x - p.c[0], z - p.c[1]) < Math.max(p.r0, p.r1) + 0.3);
  }
  return (x, z) => tests.some((f) => f(x, z));
}

/** The floor the tee stands on, and its back edge (behind the tee, facing −z). */
function backEdge(def) {
  const [tx, ty, tz] = def.tee;
  for (const [pi, p] of def.parts.entries()) {
    if (p.t !== 'floor' || Math.abs((p.y ?? 0) - ty) > 0.05 || !pointInPoly(tx, tz, p.poly)) continue;
    const zs = p.poly.map((q) => q[1]);
    const zmin = Math.min(...zs);
    for (let i = 0; i < p.poly.length; i++) {
      const a = p.poly[i], b = p.poly[(i + 1) % p.poly.length];
      if (Math.abs(a[1] - zmin) > 0.01 || Math.abs(b[1] - zmin) > 0.01) continue;
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      if (tx - x0 < 1.2 || x1 - tx < 1.2) continue;
      return { pi, edge: i, x0, x1, z: zmin, y: ty };
    }
  }
  return null;
}

/**
 * Extend a hole with an approach lane. spec: { shape, mirror, extraPar }
 * Returns a new def (the original is untouched), or the original if it can't be extended.
 */
export function extendHole(def, spec = {}) {
  const be = backEdge(def);
  if (!be) return def;
  const fl = FLAVOUR[def.sector] || FLAVOUR.desert;
  const mirror = spec.mirror ? -1 : 1;
  const local = SHAPES[spec.shape || 'S'];
  if (!local) { console.warn(`[lanes] ${def.id}: unknown lane shape ${spec.shape}`); return def; }
  const w = Math.min(4, Math.max(2.6, be.x1 - be.x0 - 0.01));
  const ex = Math.max(be.x0 + w / 2, Math.min(be.x1 - w / 2, def.tee[0]));
  // path from the new tee to the old start (overlapping it a little so there's no seam)
  const back = local.map(([x, z]) => [ex + x * mirror, be.z + z]);
  const pts = [[back[0][0], be.z + 0.4], ...back.slice(1)].reverse();
  // refuse if the lane (its full width, plus a margin) would run into anything of the old hole
  const blocked = laneBlocker(def, be.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let u = 0; u <= L; u += 0.5) {
      const cx = ax + (bx - ax) * u / L, cz = az + (bz - az) * u / L;
      for (const o of [0, w / 2 + 0.4, -(w / 2 + 0.4)]) {
        const x = cx + nx * o, z = cz + nz * o;
        if (z > be.z - 0.3) continue;
        if (blocked(x, z)) return def;
      }
    }
  }
  const { poly, endEdge } = corridorPoly(pts, w);
  const y = be.y;
  const parts = def.parts.map((p, i) => (i === be.pi ? { ...p, open: [...(p.open || []), be.edge] } : p));
  parts.push({ t: 'floor', y, poly, open: [endEdge] });

  // the new tee, a little way into the first leg
  const d0 = norm([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]);
  const tee = [pts[0][0] + d0[0] * 0.9, y, pts[0][1] + d0[1] * 0.9];

  // hazards and props at the corners and along the legs
  const segs = pts.slice(0, -1).map((p, i) => ({ a: p, b: pts[i + 1], d: norm([pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]]), L: Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]) }));
  const at = (s, u) => [s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u];
  segs.forEach((s, i) => {
    if (i === 0) return;
    const [cx, cz] = at(s, 0.5), nx = -s.d[1], nz = s.d[0];
    if (fl.hazard === 'sand') parts.push({ t: 'zone', kind: 'slow', c: [cx + nx * w * 0.25, cz + nz * w * 0.25], r: 0.9, y, mul: 3 });
    if (fl.hazard === 'snow') parts.push({ t: 'zone', kind: 'slow', rect: [cx - 0.8, cz - 0.8, cx + 0.8, cz + 0.8], y, mul: 6 });
    if (fl.hazard === 'trees' || fl.hazard === 'bumpers') {
      const side = i % 2 ? 1 : -1;
      if (fl.hazard === 'trees') parts.push({ t: 'cyl', p: [cx + nx * w * 0.28 * side, y, cz + nz * w * 0.28 * side], r: 0.38, h: 2.2, look: 'tree' });
      else parts.push({ t: 'bumper', p: [cx + nx * w * 0.25 * side, y, cz + nz * w * 0.25 * side], r: 0.36 });
    }
    if (fl.hazard === 'wind' && s.L > 5) parts.push({ t: 'zone', kind: 'wind', rect: [cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5], dir: [nx, nz], force: 1.1 });
    if (fl.hazard === 'lava' && s.L > 5) {
      // a lava gutter along one side of the leg
      const side = i % 2 ? 1 : -1, ox = nx * w * 0.36 * side, oz = nz * w * 0.36 * side;
      const [ax2, az2] = at(s, 0.25), [bx2, bz2] = at(s, 0.75);
      parts.push({ t: 'zone', kind: 'lava', rect: [Math.min(ax2, bx2) + ox - 0.35, Math.min(az2, bz2) + oz - 0.35, Math.max(ax2, bx2) + ox + 0.35, Math.max(az2, bz2) + oz + 0.35], y });
    }
    if (fl.hazard === 'current' && s.L > 5) parts.push({ t: 'zone', kind: 'current', rect: [Math.min(s.a[0], s.b[0]) - w / 2 + 0.2, Math.min(s.a[1], s.b[1]) - w / 2 + 0.2, Math.max(s.a[0], s.b[0]) + w / 2 - 0.2, Math.max(s.a[1], s.b[1]) + w / 2 - 0.2].map((v, k) => v), dir: [-s.d[0], -s.d[1]], speed: 2, y });
  });

  // monsters: enough shooters so every hole has at least two (the lane always gets one)
  const shooters = def.parts.filter((p) => p.t === 'monster' && SHOOTERS.has(p.type)).length;
  const want = Math.max(1, 2 - shooters) + (len(pts) > 30 ? 1 : 0);
  const legs = segs.filter((s) => s.L > 4).sort((a, b) => b.L - a.L);
  const roster = ROSTER[def.sector] || ROSTER.desert;
  for (let k = 0; k < Math.min(want, legs.length); k++) {
    const s = legs[k], type = roster[k % roster.length];
    // not right next to the tee: slide along the leg until it's at least 4.5 away
    let u = k === 0 ? 0.55 : 0.4;
    while (u < 0.9 && Math.hypot(at(s, u)[0] - tee[0], at(s, u)[1] - tee[2]) < 4.5 + w * 0.32) u += 0.05;
    const [cx, cz] = at(s, u), nx = -s.d[1], nz = s.d[0], r = w * 0.32;
    parts.push(laneMonster(type, { a: [cx - nx * r, cz - nz * r], b: [cx + nx * r, cz + nz * r], y, k }));
  }

  const extra = spec.extraPar ?? (len(pts) > 30 ? 2 : 1);
  return {
    ...def, parts, tee,
    yaw: Math.atan2(d0[0], d0[1]),
    par: def.par + extra,
    time: (def.time ?? 120) + extra * 30,
    route: [...pts.map(([x, z]) => [x, z]), [def.tee[0], def.tee[2]], [def.cup[0], def.cup[2]]],
    approach: { shape: spec.shape || 'S', length: +len(pts).toFixed(1) },
  };
}
