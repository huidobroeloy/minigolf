import * as THREE from 'three';
import { TEX } from '../course/themes.js';

// Chibi busts of the cast for the character select screen (built from primitives).
// Each figurine is ~1.6 units tall, faces +z, origin at the bottom of the shoulders.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

function add(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  parent.add(m);
  return m;
}

/** Shared chibi base: shoulders + big head + eyes. Returns { g, head }. */
function base(outfit, skin = '#f6d2ba', eyes = '#3b2a20', opts = {}) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.42, 0.55, 0.5, 20), mat(outfit), [0, 0.25, 0]);
  add(g, new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(outfit), [0, 0.48, 0], [0, 0, 0], [1, 0.45, 0.8]);
  add(g, new THREE.CylinderGeometry(0.12, 0.13, 0.18, 12), mat(skin), [0, 0.6, 0]);
  const head = new THREE.Group();
  head.position.y = 1.02;
  g.add(head);
  add(head, new THREE.SphereGeometry(0.42, 28, 22), mat(skin), [0, 0, 0], [0, 0, 0], [1, 1.02, 0.96]);
  if (!opts.noEyes) {
    for (const s of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.075, 14, 10), mat('#ffffff', { roughness: 0.3 }), [0.15 * s, -0.02, 0.36], [0, 0, 0], [1, 1.25, 0.5]);
      add(head, new THREE.SphereGeometry(0.052, 14, 10), mat(eyes, { roughness: 0.25 }), [0.15 * s, -0.03, 0.395], [0, 0, 0], [1, 1.25, 0.45]);
      add(head, new THREE.SphereGeometry(0.016, 8, 6), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), [0.14 * s + 0.02, 0.0, 0.42]);
    }
    add(head, new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), mat('#a4505a'), [0, -0.2, 0.39], [0, 0, Math.PI]); // smile
  }
  return { g, head };
}

const hairCap = (head, color, scale = [1.06, 1, 1.04], y = 0.05) =>
  add(head, new THREE.SphereGeometry(0.44, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(color, { roughness: 0.6 }), [0, y, -0.02], [0, 0, 0], scale);

const spike = (head, color, pos, rot, size = [0.09, 0.3]) => add(head, new THREE.ConeGeometry(size[0], size[1], 6), mat(color, { roughness: 0.6 }), pos, rot);

const BUILDERS = {
  ulrich() {
    const { g, head } = base('#d6a23c', '#f3cfb2', '#4a2f17');
    add(g, new THREE.TorusGeometry(0.36, 0.06, 8, 24), mat('#4a2f17'), [0, 0.52, 0], [Math.PI / 2, 0, 0]); // samurai collar
    hairCap(head, '#3b2414');
    for (let i = 0; i < 6; i++) spike(head, '#3b2414', [-0.3 + i * 0.12, 0.28, 0.22], [0.9, 0, (i - 2.5) * 0.15]);
    add(head, new THREE.TorusGeometry(0.43, 0.035, 8, 32), mat('#c9a24a'), [0, 0.16, 0], [Math.PI / 2 - 0.15, 0, 0]); // headband
    add(head, new THREE.BoxGeometry(0.05, 0.3, 0.02), mat('#c9a24a'), [0.1, 0.0, -0.44], [0, 0, 0.3]); // headband tail
    return g;
  },
  odd() {
    const { g, head } = base('#9a4dd6', '#f3cfb2', '#2f57b8');
    hairCap(head, '#f2d24a', [1.04, 0.9, 1.0]);
    add(head, new THREE.ConeGeometry(0.2, 0.75, 10), mat('#f2d24a'), [0, 0.6, 0], [0, 0, 0]); // the famous spike
    add(head, new THREE.SphereGeometry(0.09, 10, 8), mat('#8a3fd0'), [0, 0.5, 0.13], [0, 0, 0], [1, 1.4, 0.6]); // purple spot
    for (const s of [-1, 1]) {
      spike(head, '#9a4dd6', [0.3 * s, 0.32, -0.02], [0, 0, -s * 0.5], [0.11, 0.28]); // cat ears
      for (const k of [-1, 0, 1]) add(head, new THREE.BoxGeometry(0.2, 0.012, 0.012), mat('#7a2fb0'), [0.3 * s, -0.12 + k * 0.04, 0.3], [0, s * 0.4, k * 0.15 * s]); // whiskers
    }
    return g;
  },
  yumi() {
    const { g, head } = base('#24132f', '#f6dcca', '#2a1a14');
    add(g, new THREE.TorusGeometry(0.36, 0.05, 8, 24), mat('#e94b86'), [0, 0.52, 0], [Math.PI / 2, 0, 0]);
    hairCap(head, '#120d16', [1.1, 1.05, 1.08]);
    for (const s of [-1, 1]) add(head, new THREE.BoxGeometry(0.16, 0.5, 0.42), mat('#120d16'), [0.36 * s, -0.12, -0.02]); // bob sides
    add(head, new THREE.BoxGeometry(0.62, 0.14, 0.12), mat('#120d16'), [0, 0.26, 0.33]); // fringe
    add(head, new THREE.SphereGeometry(0.07, 10, 8), mat('#e94b86', { emissive: '#e94b86', emissiveIntensity: 0.2 }), [0.28, 0.3, 0.2]); // hair ornament
    return g;
  },
  aelita() {
    const { g, head } = base('#8c1f3f', '#f7d4bd', '#2e7d4a');
    add(g, new THREE.SphereGeometry(0.07, 12, 8), mat('#ffd6ec'), [0, 0.42, 0.42], [0, 0, 0], [0.8, 1.1, 0.4]); // emblem
    hairCap(head, '#ff86c8', [1.12, 1.02, 1.08]);
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.2, 14, 10), mat('#ff86c8'), [0.34 * s, -0.12, -0.04], [0, 0, 0], [0.6, 1.1, 1]);
    for (let i = 0; i < 6; i++) spike(head, '#ff86c8', [-0.27 + i * 0.11, 0.24, 0.3], [1.1, 0, (i - 2.5) * 0.12], [0.08, 0.2]); // bangs
    for (const s of [-1, 1]) spike(head, '#f7d4bd', [0.44 * s, 0.02, 0.0], [0, 0, -s * 1.25], [0.06, 0.32]); // elf ears
    return g;
  },
  william() {
    const { g, head } = base('#18181f', '#efd2bf', '#1c1c24');
    add(g, new THREE.BoxGeometry(0.16, 0.52, 0.02), mat('#ececf4'), [0, 0.28, 0.5]); // white stripe
    hairCap(head, '#101016', [1.06, 1, 1.04]);
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + i * 0.3;
      spike(head, '#101016', [Math.sin(a) * 0.3, 0.36, Math.cos(a) * 0.12 - 0.05], [-0.4 + Math.cos(a) * 0.5, 0, -a * 0.5], [0.09, 0.36]);
    }
    return g;
  },
  jeremie() {
    const { g, head } = base('#3d6cff', '#f6d6bf', '#2a4a8a');
    add(g, new THREE.TorusGeometry(0.3, 0.05, 8, 24), mat('#ffffff'), [0, 0.53, 0.05], [Math.PI / 2, 0, 0]); // collar
    hairCap(head, '#f2d24a', [1.05, 0.95, 1.04]);
    add(head, new THREE.BoxGeometry(0.5, 0.1, 0.2), mat('#f2d24a'), [0.06, 0.27, 0.28], [0.3, 0, -0.2]); // side-swept fringe
    const glass = mat('#1b1b1b', { metalness: 0.5, roughness: 0.3 });
    for (const s of [-1, 1]) {
      add(head, new THREE.TorusGeometry(0.11, 0.018, 8, 24), glass, [0.15 * s, -0.02, 0.41]);
      add(head, new THREE.CircleGeometry(0.1, 20), new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.35, roughness: 0.05 }), [0.15 * s, -0.02, 0.415]);
      add(head, new THREE.BoxGeometry(0.2, 0.018, 0.018), glass, [0.33 * s, 0.0, 0.3], [0, s * 0.9, 0]);
    }
    add(head, new THREE.BoxGeometry(0.08, 0.018, 0.018), glass, [0, 0.0, 0.42]);
    return g;
  },
  franz() {
    const { g, head } = base('#f0f2f6', '#efd0b8', '#4a5a7a');
    hairCap(head, '#a8a8ae', [1.04, 0.8, 1.04], 0.08);
    add(head, new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat('#b8b8be'), [0, -0.12, 0.12], [0, 0, 0], [1, 0.9, 0.9]); // beard
    // the sphere of light he became
    const orb = add(g, new THREE.SphereGeometry(1.0, 32, 24), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }), [0, 0.85, 0]);
    orb.userData.spin = true;
    return g;
  },
  xana() {
    const g = new THREE.Group();
    add(g, new THREE.SphereGeometry(0.55, 24, 16), mat('#0b080e', { roughness: 0.4 }), [0, 1.0, 0]);
    const eye = add(g, new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: TEX.xanaEyeGlow(), color: '#ff2a2a', transparent: true, depthWrite: false }), [0, 1.02, 0.56]);
    eye.renderOrder = 2;
    const smoke = mat('#0d0a10', { roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const pts = [];
      for (let k = 0; k <= 4; k++) pts.push(new THREE.Vector3(Math.cos(a + k * 0.5) * (0.4 + k * 0.15), 0.8 - k * 0.22, Math.sin(a + k * 0.5) * (0.4 + k * 0.15)));
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07 - i * 0.003, 6, false), smoke);
    }
    return g;
  },
};

export function makeFigurine(id) {
  const build = BUILDERS[id];
  const g = build ? build() : new THREE.Group();
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}
