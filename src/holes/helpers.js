// Motion helpers for hole definitions. Each returns (t) => {x, y, z, ry}.
export { rect, circlePoly, arcPoly } from '../course/geometry.js';

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

/** Back-and-forth between a and b ([x,z]), full cycle `period` seconds. Faces its direction of travel. */
export function patrol(a, b, period, y = 0, phase = 0, { ease = true } = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const fwd = Math.atan2(dx, dz);
  return (t) => {
    const u = (((t + phase * period) / period) % 1 + 1) % 1;
    const going = u < 0.5;
    let k = going ? u * 2 : 2 - u * 2;
    if (ease) k = smooth(k);
    return { x: a[0] + dx * k, y, z: a[1] + dz * k, ry: going ? fwd : fwd + Math.PI };
  };
}

/**
 * Circle around c ([x,z]) with radius r, turning the same way as spin() with the same period,
 * so objects can ride a turntable. Local x points outward (radial), local z is tangent.
 */
export function orbit(c, r, period, y = 0, phase = 0) {
  return (t) => {
    const th = ((t / period) + phase) * TAU;
    return { x: c[0] + Math.cos(-th) * r, y, z: c[1] + Math.sin(-th) * r, ry: th };
  };
}

/** Rotate in place. */
export function spin(x, y, z, period, phase = 0) {
  return (t) => ({ x, y, z, ry: ((t / period) + phase) * TAU });
}

/** Vertical lift between y0 and y1 with pauses at both ends. */
export function elevator(x, z, y0, y1, period, phase = 0) {
  return (t) => {
    const u = (((t / period) + phase) % 1 + 1) % 1;
    let k;
    if (u < 0.2) k = 0;
    else if (u < 0.5) k = smooth((u - 0.2) / 0.3);
    else if (u < 0.7) k = 1;
    else k = 1 - smooth((u - 0.7) / 0.3);
    return { x, y: y0 + (y1 - y0) * k, z, ry: 0 };
  };
}

/** Slide between two 3D points with pauses (moving platforms). */
export function shuttle(a, b, period, phase = 0, pause = 0.2) {
  return (t) => {
    const u = (((t / period) + phase) % 1 + 1) % 1;
    const p = pause / 2;
    let k;
    if (u < p) k = 0;
    else if (u < 0.5) k = smooth((u - p) / (0.5 - p));
    else if (u < 0.5 + p) k = 1;
    else k = 1 - smooth((u - 0.5 - p) / (0.5 - p));
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, ry: 0 };
  };
}

/** Follow a closed loop of [x,z] points at constant speed. */
export function loop(points, speed, y = 0, phase = 0) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, L, s0: total });
    total += L;
  }
  return (t) => {
    let s = ((t * speed + phase * total) % total + total) % total;
    for (const sg of segs) {
      if (s <= sg.s0 + sg.L) {
        const k = (s - sg.s0) / sg.L;
        return { x: sg.a[0] + (sg.b[0] - sg.a[0]) * k, y, z: sg.a[1] + (sg.b[1] - sg.a[1]) * k, ry: Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) };
      }
    }
    return { x: points[0][0], y, z: points[0][1], ry: 0 };
  };
}

/** Diagonal "kicker" wall from a to b — a bank board. */
export const kicker = (a, b, y = 0, h = 0.4) => ({ t: 'wall', pts: [a, b], y, h });
