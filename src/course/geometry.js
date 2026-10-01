import * as THREE from 'three';

/** Signed area of a polygon given as [[x,z],...]. Positive = counter-clockwise in (x,z). */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** Regular polygon approximating a circle (for round platforms). */
export function circlePoly(cx, cz, r, n = 24, start = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** Arc band polygon (a curved lane) centred at c from angle a0 to a1 between radii r0..r1. */
export function arcPoly(cx, cz, r0, r1, a0, a1, n = 16) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    outer.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]);
    inner.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]);
  }
  return outer.concat(inner.reverse());
}

/**
 * Extruded floor slab: shape in (x,z) with optional holes, top surface at y, thickness th.
 * Returns a BufferGeometry in world space with groups: 0 = caps, 1 = sides.
 */
export function slabGeometry(poly, holes, y, th) {
  // Shape coordinates are (x, -z) so that after rotateX(-PI/2) the cap faces up and maps to (x, z).
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes || []) {
    const pts = h.poly ? h.poly : circlePoly(h.c[0], h.c[1], h.r, 28);
    shape.holes.push(new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 1 });
  // extrusion goes along +Z (shape-space) → after rotateX(-PI/2) it goes along +Y; shift down so top = y
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y - th, 0);
  // fix cap UVs to world (x,z)
  const pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nor.getY(i)) > 0.9) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else uv.setXY(i, pos.getX(i) + pos.getZ(i), pos.getY(i));
  }
  return geo;
}

/**
 * Generic 6-faced prism from 4 bottom + 4 top points (each ordered around the face).
 * Faces get world-space UVs. Group 0 = top, group 1 = everything else.
 */
export function prismGeometry(bottom, top) {
  const P = [...bottom, ...top].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const faces = [
    [4, 5, 6, 7, 0], // top
    [3, 2, 1, 0, 1], // bottom
    [0, 1, 5, 4, 1],
    [1, 2, 6, 5, 1],
    [2, 3, 7, 6, 1],
    [3, 0, 4, 7, 1],
  ];
  const positions = [], uvs = [], normals = [];
  const geo = new THREE.BufferGeometry();
  let topCount = 0;
  const center = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / 8);
  for (const [a, b, c, d, grp] of faces) {
    const quad = [P[a], P[b], P[c], P[d]];
    const n = new THREE.Vector3().subVectors(quad[1], quad[0]).cross(new THREE.Vector3().subVectors(quad[2], quad[0])).normalize();
    // make normal point outward
    const fc = quad.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(0.25);
    let flip = n.dot(new THREE.Vector3().subVectors(fc, center)) < 0;
    if (flip) n.negate();
    const tris = flip ? [[0, 2, 1], [0, 3, 2]] : [[0, 1, 2], [0, 2, 3]];
    for (const t of tris) {
      for (const k of t) {
        const p = quad[k];
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        if (Math.abs(n.y) > 0.6) uvs.push(p.x, p.z);
        else uvs.push(p.x + p.z, p.y);
      }
    }
    if (grp === 0) topCount += 6;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.addGroup(0, topCount, 0);
  geo.addGroup(topCount, positions.length / 3 - topCount, 1);
  return geo;
}

/** Flatten geometry positions/indices for a Rapier trimesh. */
export function trimeshData(geo) {
  const pos = geo.attributes.position.array;
  let idx;
  if (geo.index) idx = new Uint32Array(geo.index.array);
  else {
    idx = new Uint32Array(pos.length / 3);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
  }
  return { positions: new Float32Array(pos), indices: idx };
}
