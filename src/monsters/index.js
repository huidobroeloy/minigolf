import * as THREE from 'three';
import { TEX } from '../course/themes.js';

// Placeholder monster: a kinematic block following its path. Replaced by real models later.
export function createMonster(spec, { group, physics }) {
  const size = spec.size ?? 0.8;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: '#c2b49a', map: TEX.xanaEye() })
  );
  mesh.castShadow = true;
  group.add(mesh);
  const s0 = spec.path ? spec.path(0) : { x: spec.p[0], y: spec.p[1], z: spec.p[2] };
  const { body } = physics.addBox([size / 2, size / 2, size / 2], { kind: 'obst' }, { pos: [s0.x, s0.y + size / 2, s0.z], kinematic: true });
  return {
    update(t) {
      if (!spec.path) return;
      const s = spec.path(t);
      body.setNextKinematicTranslation({ x: s.x, y: s.y + size / 2, z: s.z });
    },
    frame() {
      const p = body.translation();
      mesh.position.set(p.x, p.y, p.z);
    },
  };
}
