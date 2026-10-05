import * as THREE from 'three';

// Lyoko vehicles that carry your ball for a shot. Simple procedural shapes, nose along +z,
// sized for a ball of radius 1, drawn at 1.35x the ball radius (so the floor is at y = -0.74).

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3, ...extra });
const glow = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

/** Overbike: Ulrich's one-wheeler. A big hubless wheel at the back, a long nose and handlebars. */
function overbike() {
  const g = new THREE.Group();
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.2, 10, 28), std('#2a2a30'));
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0, 0.42, -1.3);
  wheel.name = 'wheel';
  g.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 28), glow('#ffd34a', 0.9));
  rim.rotation.y = Math.PI / 2;
  rim.position.copy(wheel.position);
  g.add(rim);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 2.6), std('#d6a23c'));
  body.position.set(0, -0.45, 0.4);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.1, 8), std('#e8c060'));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.36, 2.2);
  g.add(nose);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), std('#4a2f17'));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.5, 1.3);
  g.add(bar);
  return g;
}

/** Overboard: Odd's hover board. A flat purple deck with a glowing underside. */
function overboard() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.22, 24), std('#9a4dd6'));
  deck.scale.set(1.1, 1, 2.1);
  deck.position.y = -0.6;
  g.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 3.4), std('#f2d24a'));
  stripe.position.y = -0.47;
  g.add(stripe);
  const under = new THREE.Mesh(new THREE.CircleGeometry(1, 24), glow('#d48bff', 0.7));
  under.rotation.x = Math.PI / 2;
  under.scale.set(1.0, 1.9, 1);
  under.position.y = -0.72;
  under.name = 'glow';
  g.add(under);
  return g;
}

/** Overwing: Yumi's flying scooter. A slim body with two swept wings and a tail fin. */
function overwing() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.2, 4, 10), std('#e94b86'));
  body.rotation.x = Math.PI / 2;
  body.position.y = -0.3;
  g.add(body);
  const wingShape = new THREE.Shape([new THREE.Vector2(0, 0.6), new THREE.Vector2(2.1, -0.5), new THREE.Vector2(2.1, -0.85), new THREE.Vector2(0, -0.5)]);
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), std('#f8cfe0', { side: THREE.DoubleSide }));
    w.rotation.x = -Math.PI / 2;
    w.scale.x = s;
    w.position.set(0, -0.25, 0);
    g.add(w);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.6), std('#24132f'));
  fin.position.set(0, 0.1, -1.3);
  g.add(fin);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10), glow('#7fd8ff', 0.8));
  jet.rotation.x = -Math.PI / 2;
  jet.position.set(0, -0.3, -1.9);
  jet.name = 'glow';
  g.add(jet);
  return g;
}

export const VEHICLES = { overbike, overboard, overwing };

export function makeVehicle(kind) {
  const g = VEHICLES[kind]();
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
