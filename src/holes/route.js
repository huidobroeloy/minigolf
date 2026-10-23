import { pointInPoly } from '../course/geometry.js';

// The track a ball really has to cover inside a hole, for the time-out score (room.js `trackLeft`).
// A straight line from the old tee to the cup cuts through walls on switchbacks, so a ball that went
// the wrong way could look closer than one that followed the course. Instead: a shortest path on a
// grid over the hole's floors and ramps, where gaps (jumps, lifts, moving platforms) cost extra and
// walls and closed floor edges cost a lot (a ball only gets over one through the air: bubble lifts,
// launchers), simplified to a few waypoints. Computed once per hole.

const CELL = 0.4;
const GAP_COST = 6;
const WALL_COST = 40;

const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k);
};
const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crosses = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

/** Can a ball roll on (x, z)? Floors (minus their holes), ramps, crumbling tiles, tubes and bowls. */
function surfaceTest(def) {
  const tests = [];
  for (const q of def.parts) {
    if (q.t === 'floor' && q.poly) tests.push((x, z) => pointInPoly(x, z, q.poly) && !(q.holes || []).some((h) => (h.c && Math.hypot(x - h.c[0], z - h.c[1]) < h.r) || (h.poly && pointInPoly(x, z, h.poly))));
    else if (q.t === 'ramp' && q.a && q.b) tests.push((x, z) => segDist(x, z, q.a, q.b) < (q.w ?? 3) / 2);
    else if (q.t === 'crumble' && q.p && q.s) tests.push((x, z) => Math.abs(x - q.p[0]) < q.s[0] / 2 && Math.abs(z - q.p[2]) < q.s[1] / 2);
    else if (q.t === 'tube' && q.pts) tests.push((x, z) => q.pts.some((p, i) => i > 0 && segDist(x, z, [q.pts[i - 1][0], q.pts[i - 1][2]], [p[0], p[2]]) < (q.r ?? 0.5)));
    else if (q.t === 'bowl' && q.c) tests.push((x, z) => Math.hypot(x - q.c[0], z - q.c[1]) < Math.max(q.r0, q.r1));
  }
  return (x, z) => tests.some((f) => f(x, z));
}

/** Everything a ball can't roll through: walls, the closed edges of floors, and boxes. */
function blockers(def) {
  const segs = [];
  for (const q of def.parts) {
    if (q.t === 'wall' && q.pts) for (let i = 1; i < q.pts.length; i++) segs.push([q.pts[i - 1], q.pts[i]]);
    if (q.t === 'floor' && q.poly && q.walls !== false) {
      const open = new Set(q.open || []);
      for (let i = 0; i < q.poly.length; i++) if (!open.has(i)) segs.push([q.poly[i], q.poly[(i + 1) % q.poly.length]]);
    }
    if (q.t === 'box' && q.p && q.s && q.s[1] > 0.3) {
      const [x, , z] = q.p, hx = q.s[0] / 2, hz = q.s[2] / 2;
      const c = [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];
      for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]]);
    }
  }
  return segs;
}

/** Waypoints [x, z] from `from` to `to` (both [x, z]) inside the hole, or null if the hole is too big to grid. */
export function holePath(def, from, to) {
  const onSurface = surfaceTest(def);
  const segs = blockers(def);
  const xs = [from[0], to[0]], zs = [from[1], to[1]];
  for (const q of def.parts) {
    for (const p of q.poly || []) { xs.push(p[0]); zs.push(p[1]); }
    if (q.t === 'ramp' && q.a) { xs.push(q.a[0], q.b[0]); zs.push(q.a[1], q.b[1]); }
  }
  const x0 = Math.min(...xs) - 1, z0 = Math.min(...zs) - 1;
  const W = Math.ceil((Math.max(...xs) + 1 - x0) / CELL), H = Math.ceil((Math.max(...zs) + 1 - z0) / CELL);
  if (W * H > 250000) return null;
  const cx = (i) => x0 + (i % W + 0.5) * CELL, cz = (i) => z0 + (Math.floor(i / W) + 0.5) * CELL;
  const cellOf = (x, z) => Math.min(H - 1, Math.max(0, Math.floor((z - z0) / CELL))) * W + Math.min(W - 1, Math.max(0, Math.floor((x - x0) / CELL)));
  const ground = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) ground[i] = onSurface(cx(i), cz(i)) ? 1 : 0;
  // which blockers touch each cell, so a move only tests its neighbourhood
  const near = new Map();
  segs.forEach(([a, b], si) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / (CELL / 2)));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      const c = cellOf(x, z);
      for (const d of [0, 1, -1, W, -W]) { const cc = c + d; if (cc < 0 || cc >= W * H) continue; if (!near.has(cc)) near.set(cc, new Set()); near.get(cc).add(si); }
    }
  });
  const blocked = (a, b) => {
    const pa = [cx(a), cz(a)], pb = [cx(b), cz(b)];
    for (const c of [a, b]) for (const si of near.get(c) || []) if (crosses(pa, pb, segs[si][0], segs[si][1])) return true;
    return false;
  };
  // Dijkstra (the grid is small); a gap cell costs GAP_COST times a floor cell, getting over a wall WALL_COST
  const start = cellOf(from[0], from[1]), goal = cellOf(to[0], to[1]);
  const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
  dist[start] = 0;
  const heap = [[0, start]];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    if (i === goal) break;
    const ix = i % W, iz = Math.floor(i / W);
    for (const [sx, sz] of steps) {
      const jx = ix + sx, jz = iz + sz;
      if (jx < 0 || jz < 0 || jx >= W || jz >= H) continue;
      const j = jz * W + jx;
      let nd = d + Math.hypot(sx, sz) * CELL * (ground[j] ? 1 : GAP_COST);
      if (nd >= dist[j]) continue;
      if (blocked(i, j)) { nd += WALL_COST; if (nd >= dist[j]) continue; }
      dist[j] = nd; prev[j] = i; push(nd, j);
    }
  }
  if (!isFinite(dist[goal])) return null;
  const cells = [];
  for (let i = goal; i !== -1; i = prev[i]) cells.push(i);
  cells.reverse();
  // string-pulling: keep a corner only where a straight line would leave the floor or hit a blocker
  // (a path across a gap keeps its cells there: neighbouring cells always connect)
  const clear = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let u = CELL; u <= L - CELL; u += CELL / 2) {
      const x = a[0] + (b[0] - a[0]) * u / L, z = a[1] + (b[1] - a[1]) * u / L;
      if (!ground[cellOf(x, z)]) return false;
    }
    return !segs.some(([c, d]) => crosses(a, b, c, d));
  };
  const pts = [from, ...cells.slice(1, -1).map((i) => [cx(i), cz(i)]), to];
  const out = [from];
  let k = 0;
  while (k < pts.length - 1) {
    let j = pts.length - 1;
    while (j > k + 1 && !clear(pts[k], pts[j])) j--;
    out.push(pts[j]);
    k = j;
  }
  return out;
}

const cache = new Map();
/** The whole time-out route of a lengthened hole: its lane, then the path through the hole to the cup. */
export function timeoutRoute(def) {
  if (!def.route || def.route.length < 2) return def.route;
  const key = def.id + ':' + def.route.length;
  if (cache.has(key)) return cache.get(key);
  const r = def.route, oldTee = r[r.length - 2], cup = r[r.length - 1];
  const inside = holePath(def, oldTee, cup);
  const route = inside ? [...r.slice(0, -2), ...inside] : r;
  cache.set(key, route);
  return route;
}
