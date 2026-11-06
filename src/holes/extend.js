import { pointInPoly } from '../course/geometry.js';

// Hand-designed openings. Every hole keeps its own layout; most get an opening laid out behind their tee
// (def.opening, see attachOpening), and the rest stand alone (opening: false). There is no shortcut: you
// play the whole opening.

const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

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
 * A hand-designed opening (def.opening): { parts, tee: [x,y,z], route: [[x,z]…], par, time, yaw? }.
 * Its parts are laid out behind the hole's start (z below the tee floor's back edge), which is opened so the
 * opening's last floor joins it; its route runs from the new tee to that edge. Returns a new def.
 */
export function attachOpening(def, op) {
  const be = backEdge(def);
  const parts = def.parts.map((p, i) => (be && i === be.pi && op.join !== false ? { ...p, open: [...(p.open || []), be.edge] } : p));
  parts.push(...op.parts);
  const r = op.route;
  return {
    ...def, parts,
    tee: op.tee,
    yaw: op.yaw ?? Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]),
    par: def.par + (op.par ?? 1),
    time: (def.time ?? 120) + (op.time ?? 30),
    route: [...r, [def.tee[0], def.tee[2]], [def.cup[0], def.cup[2]]],
  };
}
