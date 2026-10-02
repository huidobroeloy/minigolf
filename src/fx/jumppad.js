import * as THREE from 'three';
import { GRAVITY } from '../physics/world.js';

// Jump signage: anything that launches the ball gets a spring pad, stacked "up" chevrons and a
// faint dashed arc showing roughly where it throws you. Players should never be surprised by a jump.

let _chevGeo;
function chevronGeometry() {
  if (_chevGeo) return _chevGeo;
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0, 0.42); s.lineTo(0.5, 0); s.lineTo(0.5, 0.16); s.lineTo(0, 0.58); s.lineTo(-0.5, 0.16);
  s.closePath();
  _chevGeo = new THREE.ShapeGeometry(s);
  return _chevGeo;
}

/** A stack of glowing upward chevrons that float up and fade, on repeat. */
export function makeChevrons(color = '#7dffb0', size = 0.6, count = 3) {
  const g = new THREE.Group();
  const items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    m.scale.setScalar(size);
    g.add(m);
    items.push(m);
  }
  g.userData.animate = (t, cam) => {
    items.forEach((m, i) => {
      const u = (t * 0.6 + i / count) % 1;
      m.position.y = u * size * 2.4;
      m.material.opacity = 0.85 * Math.sin(u * Math.PI);
    });
    if (cam) g.quaternion.copy(cam.quaternion); // billboard: always readable
  };
  return g;
}

/**
 * Spring launch pad for a vent/geyser zone.
 *   r      pad radius
 *   color  theme accent
 *   dir    [dx, dz] push direction
 *   launch upward speed, minSpeed horizontal push (for the arc preview)
 */
export function makeJumpPad({ r = 0.8, color = '#7dffb0', dir = [0, 1], launch = 10.5, minSpeed = 3 } = {}) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#c9d2dc', metalness: 0.8, roughness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.4 });
  // base ring
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.08, 32), metal);
  base.position.y = 0.04;
  g.add(base);
  // the spring: a helix tube
  const pts = [];
  const turns = 4, h = 0.32, cr = r * 0.55;
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * cr, 0.08 + (i / 80) * h, Math.sin(a) * cr));
  }
  const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.035, 6, false), metal);
  g.add(spring);
  // the plate the ball sits on
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.06, 32), glow);
  plate.position.y = 0.08 + h;
  g.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, 0.03, 6, 40), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  ring.rotation.x = Math.PI / 2;
  plate.add(ring);
  // up chevrons above the pad
  const chev = makeChevrons(color, r * 0.75);
  chev.position.y = 0.6;
  g.add(chev);
  // dashed arc preview of the throw
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / dl, uz = dir[1] / dl;
  const T = (2 * launch) / GRAVITY;
  const arcPts = [];
  for (let i = 0; i <= 28; i++) {
    const tt = (i / 28) * T;
    arcPts.push(new THREE.Vector3(ux * minSpeed * tt, 0.4 + launch * tt - 0.5 * GRAVITY * tt * tt, uz * minSpeed * tt));
  }
  const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.45 }));
  arc.computeLineDistances();
  g.add(arc);

  let firedAt = -10;
  g.userData = {
    fire(t) { firedAt = t; },
    animate(t, cam) {
      // compress → spring up after each launch, otherwise a gentle "ready" bob
      const k = t - firedAt;
      const squash = k < 0.12 ? 1 - k / 0.12 * 0.6 : k < 0.5 ? 0.4 + Math.sin(((k - 0.12) / 0.38) * Math.PI) * 0.9 : 1 + Math.sin(t * 4) * 0.04;
      spring.scale.y = Math.max(0.35, squash);
      plate.position.y = 0.08 + h * Math.max(0.35, squash);
      glow.emissiveIntensity = 0.6 + (k < 0.5 ? 1.2 * (1 - k / 0.5) : 0.2 * Math.sin(t * 3));
      chev.userData.animate(t, cam);
    },
  };
  return g;
}
