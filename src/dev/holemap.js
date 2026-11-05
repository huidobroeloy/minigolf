// Top-down SVG maps of holes, for reviewing designs before they're built in 3D (debug: __holeMap(i | def)).
// +z (forward into the hole) points up the page. Floors are shaded by height; the opening's parts are
// outlined in cyan; the route is the dashed line from the tee (green) to the cup (red).

const ZONE = { slow: '#c9a35a', wind: '#9fd8ff', lava: '#ff6a1a', vent: '#ffb347', conveyor: '#6fe7ff', boost: '#46ff9a', current: '#3fa8ff', bubble: '#bfe9ff', mud: '#7a5a3a' };
const MON = { kankrelat: 'K', blok: 'B', krabe: 'Kr', hornet: 'H', megatank: 'M', tarantula: 'T', creeper: 'C', manta: 'Ma', shark: 'S', kalamar: 'Ka', guardian: 'G', scyphozoa: 'Sc', ninja: 'N', tumbleweed: 'tw', magma: '☄', kongre: 'Ko', kongreMouth: 'Ko' };

export function holeMap(def, { px = 18, title = true } = {}) {
  const xs = [], zs = [];
  const add = (x, z) => { xs.push(x); zs.push(z); };
  for (const p of def.parts) {
    if (p.poly) p.poly.forEach(([x, z]) => add(x, z));
    if (p.t === 'ramp') { add(p.a[0], p.a[1]); add(p.b[0], p.b[1]); }
  }
  add(def.tee[0], def.tee[2]); add(def.cup[0], def.cup[2]);
  const pad = 2, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
  const W = (x1 - x0) * px, H = (z1 - z0) * px + (title ? 34 : 0), top = title ? 34 : 0;
  const X = (x) => ((x - x0) * px).toFixed(1), Z = (z) => (top + (z1 - z) * px).toFixed(1);
  const pts = (arr) => arr.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ');
  const ys = def.parts.filter((p) => p.t === 'floor').map((p) => p.y ?? 0);
  const ymin = Math.min(0, ...ys), ymax = Math.max(0.01, ...ys);
  const shade = (y) => { const k = (y - ymin) / (ymax - ymin || 1); return `hsl(${def.sector === 'desert' ? 38 : 200}, 30%, ${22 + k * 30}%)`; };
  const op = new Set(def.opening?.parts || []);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" font-family="sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="#0b1626"/>`);
  if (title) out.push(`<text x="8" y="22" fill="#e8f0ff" font-size="16" font-weight="700">${def.name} · par ${def.par} · ${def.time}s</text>`);
  const level = (p) => (p.t === 'ramp' ? Math.max(p.ya, p.yb) + 0.01 : p.y ?? 0); // a ramp shows over the floor it climbs from
  const ordered = [...def.parts].sort((a, b) => level(a) - level(b));
  for (const p of ordered) {
    const mine = op.has(p) ? ' stroke="#2ee6ff" stroke-width="2"' : ' stroke="#000" stroke-width="0.5"';
    if (p.t === 'crumble') {
      // a tile that breaks (thin ice, crumbling rock): centre p, size s
      const [cx, , cz] = p.p, [w, d] = p.s;
      out.push(`<rect x="${X(cx - w / 2)}" y="${Z(cz + d / 2)}" width="${(w * px).toFixed(1)}" height="${(d * px).toFixed(1)}" fill="${p.kindLook === 'thinice' ? '#9fd8ff' : '#8a6a4a'}" fill-opacity="0.7"${mine}/>`);
    } else if (p.t === 'floor') {
      out.push(`<polygon points="${pts(p.poly)}" fill="${shade(p.y ?? 0)}"${mine}/>`);
      for (const h of p.holes || []) {
        if (h.c) out.push(`<circle cx="${X(h.c[0])}" cy="${Z(h.c[1])}" r="${(h.r * px).toFixed(1)}" fill="#02060c"/>`);
        else if (h.poly) out.push(`<polygon points="${pts(h.poly)}" fill="#02060c"/>`);
      }
      if ((p.y ?? 0) !== 0) { const c = p.poly[0]; out.push(`<text x="${X(c[0]) * 1 + 3}" y="${Z(c[1]) * 1 - 3}" fill="#cde" font-size="10">y${p.y}</text>`); }
    } else if (p.t === 'ramp') {
      const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * (p.w ?? 3) / 2, nz = dx / L * (p.w ?? 3) / 2;
      out.push(`<polygon points="${pts([[p.a[0] + nx, p.a[1] + nz], [p.b[0] + nx, p.b[1] + nz], [p.b[0] - nx, p.b[1] - nz], [p.a[0] - nx, p.a[1] - nz]])}" fill="#5a6f88"${mine}/>`);
      out.push(`<text x="${X((p.a[0] + p.b[0]) / 2)}" y="${Z((p.a[1] + p.b[1]) / 2)}" fill="#fff" font-size="10" text-anchor="middle">${p.jump ? 'jump' : 'ramp'} ${p.ya}→${p.yb}</text>`);
    }
  }
  for (const p of def.parts) {
    const mine = op.has(p) ? '#2ee6ff' : '#000';
    if (p.t === 'wall') out.push(`<polyline points="${pts(p.pts)}" fill="none" stroke="#d9c7a0" stroke-width="${((p.thick ?? 0.3) * px).toFixed(1)}"/>`);
    else if (p.t === 'box') out.push(`<rect x="${X(p.p[0] - p.s[0] / 2)}" y="${Z(p.p[2] + p.s[2] / 2)}" width="${(p.s[0] * px).toFixed(1)}" height="${(p.s[2] * px).toFixed(1)}" fill="#6b5a46" stroke="${mine}"/>`);
    else if (p.t === 'cyl' || p.t === 'bumper') out.push(`<circle cx="${X(p.p[0])}" cy="${Z(p.p[2])}" r="${(p.r * px).toFixed(1)}" fill="${p.t === 'bumper' ? '#ff4fd8' : '#a07c52'}" stroke="${mine}"/>`);
    else if (p.t === 'zone') {
      const col = ZONE[p.kind] || '#ffffff';
      if (p.rect) out.push(`<rect x="${X(p.rect[0])}" y="${Z(p.rect[3])}" width="${((p.rect[2] - p.rect[0]) * px).toFixed(1)}" height="${((p.rect[3] - p.rect[1]) * px).toFixed(1)}" fill="${col}" fill-opacity="0.45" stroke="${col}"/>`);
      else if (p.c) out.push(`<circle cx="${X(p.c[0])}" cy="${Z(p.c[1])}" r="${(p.r * px).toFixed(1)}" fill="${col}" fill-opacity="0.45" stroke="${col}"/>`);
      const c = p.rect ? [(p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2] : p.c;
      if (c && p.dir) out.push(`<line x1="${X(c[0])}" y1="${Z(c[1])}" x2="${X(c[0] + p.dir[0] * 1.2)}" y2="${Z(c[1] + p.dir[1] * 1.2)}" stroke="#fff" stroke-width="2" marker-end="url(#ar)"/>`);
      if (c) out.push(`<text x="${X(c[0])}" y="${Z(c[1]) * 1 + 4}" fill="#fff" font-size="9" text-anchor="middle">${p.kind}</text>`);
    } else if (p.t === 'tube') {
      out.push(`<polyline points="${pts(p.pts.map((q) => [q[0], q[2]]))}" fill="none" stroke="#bfe9ff" stroke-opacity="0.55" stroke-width="${((p.r ?? 0.5) * 2 * px).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      const q = p.pts[0];
      out.push(`<text x="${X(q[0])}" y="${Z(q[2]) * 1 - 4}" fill="#fff" font-size="9" text-anchor="middle">tube</text>`);
    } else if (p.t === 'mover' && typeof p.path === 'function') {
      const tr = []; for (let t = 0; t <= 24; t += 0.25) { const s = p.path(t); tr.push([s.x, s.z]); }
      out.push(`<polyline points="${pts(tr)}" fill="none" stroke="#ffd23a" stroke-dasharray="3 3"/>`);
      const s = p.path(0), w = (p.s?.[0] ?? 1), d = (p.s?.[2] ?? 1);
      out.push(`<rect x="${X(s.x - w / 2)}" y="${Z(s.z + d / 2)}" width="${(w * px).toFixed(1)}" height="${(d * px).toFixed(1)}" fill="#ffd23a" fill-opacity="0.6"/>`);
    } else if (p.t === 'monster') {
      let at = p.p ? [p.p[0], p.p[2]] : null;
      if (typeof p.path === 'function') {
        const tr = []; for (let t = 0; t <= 24; t += 0.25) { const s = p.path(t); tr.push([s.x, s.z]); }
        out.push(`<polyline points="${pts(tr)}" fill="none" stroke="#ff2a55" stroke-opacity="0.6"/>`);
        at = tr[0];
      } else if (p.wall) { at = p.wall.a; out.push(`<line x1="${X(p.wall.a[0])}" y1="${Z(p.wall.a[1])}" x2="${X(p.wall.b[0])}" y2="${Z(p.wall.b[1])}" stroke="#ff2a55" stroke-width="2"/>`); }
      if (at) {
        out.push(`<circle cx="${X(at[0])}" cy="${Z(at[1])}" r="8" fill="#ff2a55"/>`);
        out.push(`<text x="${X(at[0])}" y="${Z(at[1]) * 1 + 3.5}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle">${MON[p.type] || p.type[0].toUpperCase()}</text>`);
      }
    }
  }
  if (def.route) out.push(`<polyline points="${pts(def.route)}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-dasharray="6 5" stroke-width="1.5"/>`);
  out.push(`<circle cx="${X(def.tee[0])}" cy="${Z(def.tee[2])}" r="6" fill="#46ff9a" stroke="#000"/>`);
  for (const c of [def.cup, ...(def.cups || [])]) out.push(`<circle cx="${X(c[0])}" cy="${Z(c[2])}" r="6" fill="#ff2a2a" stroke="#fff"/>`);
  // 5-unit scale bar
  out.push(`<line x1="8" y1="${H - 10}" x2="${8 + 5 * px}" y2="${H - 10}" stroke="#fff" stroke-width="2"/><text x="${12 + 5 * px}" y="${H - 6}" fill="#fff" font-size="10">5 units</text>`);
  out.push(`<defs><marker id="ar" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#fff"/></marker></defs>`);
  out.push('</svg>');
  return out.join('\n');
}
