import * as THREE from 'three';
import { TEX } from '../course/themes.js';
import { makeTowerInterior } from './lyoko.js';
import { applyCharacter } from '../game/characters.js';
import { sfx } from '../core/audio.js';

// Every cup leads into a tower XANA has activated. Over the hole floats a see-through red tower
// hologram (no collision: the hole stays readable under it, joined to it by a beam of light).
// Holing out takes your ball down the shaft into the tower, up to its platform, and the tower
// turns white: deactivated (for you).

const XANA_RED = '#ff2a2a';

/** A hologram tower for a cup. `mini` for the extra Fortune cups. */
export function makeTowerHolo({ aura = XANA_RED, mini = false } = {}) {
  const g = new THREE.Group();
  const h = mini ? 1.3 : 2.5, r = mini ? 0.15 : 0.24, base = mini ? 0.55 : 0.75;
  const add = (m) => { m.renderOrder = 3; g.add(m); return m; };
  const glass = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const body = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), glass(aura, 0.45)));
  body.position.y = base + h / 2;
  const core = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, h * 0.96, 16, 1, true), glass('#ffffff', 0.12)));
  core.position.y = base + h / 2;
  const cap = add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass(aura, 0.45)));
  cap.scale.y = 0.4;
  cap.position.y = base + h;
  const rimMat = glass(aura, 0.9);
  for (const y of [base, base + h]) {
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.018, 6, 32), rimMat));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
  }
  // the beam that joins the tower to the hole
  const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, 0.3, base, 24, 1, true), glass(aura, 0.18)));
  beam.position.y = base / 2;
  // data rings climbing the tower
  const climbers = [0, 1, 2].map((i) => {
    const m = add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, 0.012, 6, 28), glass(aura, 0.7)));
    m.rotation.x = Math.PI / 2;
    return { m, off: i / 3 };
  });
  // the eye of XANA on the tower (it goes when the tower is deactivated)
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.xanaEye(), color: aura, transparent: true, depthWrite: false }));
  eye.scale.setScalar(mini ? 0.5 : 0.8);
  eye.position.y = base + h * 0.62;
  eye.renderOrder = 4;
  g.add(eye);
  const mats = [body.material, cap.material, rimMat, beam.material, ...climbers.map((c) => c.m.material)];
  let flashAt = -99, deactivated = false;
  g.userData = {
    /** Deactivated by you: white, no eye. */
    deactivate() {
      if (deactivated) return;
      deactivated = true;
      for (const m of mats) m.color.set('#ffffff');
      eye.visible = false;
    },
    /** Someone else holed out here: a white pulse. */
    flash(t) { flashAt = t; },
    animate(t) {
      g.position.y = Math.sin(t * 1.6) * 0.04;
      for (const c of climbers) {
        const u = (t * 0.35 + c.off) % 1;
        c.m.position.y = base + u * h;
        c.m.material.opacity = 0.7 * Math.sin(u * Math.PI);
      }
      const f = Math.max(0, 1 - (t - flashAt) / 0.8);
      body.material.opacity = 0.4 + 0.07 * Math.sin(t * 3) + f * 0.5;
      g.scale.setScalar(1 + f * 0.15);
      eye.material.rotation = Math.sin(t * 0.8) * 0.15;
    },
  };
  return g;
}

/**
 * Your ball's trip into the tower (about 3.4 s, click or a key skips it). Drives the camera
 * while it runs; frame(dt) returns false when it's over.
 */
export class TowerTrip {
  constructor(client, cup, color) {
    this.c = client;
    this.cup = cup;
    this.t = 0;
    this.cam = client.renderer.camera;
    this.from = this.cam.position.clone();
    this.scene = client.scene;
    this.color = color;
    this.skip = () => { if (this.t > 0.3) this.t = Math.max(this.t, 3.0); };
    addEventListener('pointerdown', this.skip);
    addEventListener('keydown', this.skip);
  }

  buildInside() {
    this.inside = makeTowerInterior();
    this.inside.position.set(this.cup.x, -120, this.cup.z);
    this.scene.add(this.inside);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 28, 20), new THREE.MeshPhysicalMaterial({ color: this.color, clearcoat: 1, roughness: 0.2, emissive: this.color, emissiveIntensity: 0.25 }));
    applyCharacter(m.material, this.color);
    this.ball = m;
    this.inside.add(m);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(glow);
    this.savedFog = this.scene.fog;
    this.scene.fog = null;
  }

  frame(dt) {
    this.t += dt;
    const t = this.t, c = this.cup, cam = this.cam;
    if (t < 0.75) {
      // dive down the shaft
      const k = t / 0.75, e = k * k;
      const above = new THREE.Vector3(c.x, c.y + 1.2, c.z + 0.01);
      const down = new THREE.Vector3(c.x, c.y - 0.25, c.z + 0.01);
      cam.position.copy(k < 0.5 ? this.from.clone().lerp(above, k * 2) : above.clone().lerp(down, (k - 0.5) * 2));
      cam.lookAt(c.x, c.y - 1, c.z);
      if (t + dt >= 0.6 && t < 0.6) this.c.ui.flash?.();
      return true;
    }
    if (!this.inside) { this.buildInside(); sfx.play('teleport'); }
    const I = this.inside;
    I.userData.animate(t);
    if (t < 2.5) {
      // up through the data rings to the platform
      const k = Math.min(1, (t - 0.75) / 1.6), e = k * k * (3 - 2 * k);
      this.ball.position.set(Math.sin(t * 3) * 0.3 * (1 - e), 0.4 + e * 9.1, Math.cos(t * 3) * 0.3 * (1 - e));
      this.ball.rotation.y += dt * 4;
      const a = t * 0.9;
      const wp = I.localToWorld(new THREE.Vector3(Math.cos(a) * 5, 1.5 + e * 9, Math.sin(a) * 5));
      cam.position.copy(wp);
      cam.lookAt(I.localToWorld(this.ball.position.clone()));
      return true;
    }
    if (!this.done1) {
      this.done1 = true;
      this.c.course?.towerFor?.(c)?.userData.deactivate();
      this.c.ui.bigToast?.('TOWER DEACTIVATED', 'XANA’s attack here is over', 'good');
      sfx.play('hio');
    }
    const wp = I.localToWorld(new THREE.Vector3(3.2, 10.4, 3.2));
    cam.position.copy(wp);
    cam.lookAt(I.localToWorld(new THREE.Vector3(0, 9.5, 0)));
    this.ball.position.y = 9.5 + Math.sin(t * 3) * 0.1;
    if (t < 3.4) return true;
    this.dispose();
    return false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    removeEventListener('pointerdown', this.skip);
    removeEventListener('keydown', this.skip);
    if (this.inside) { this.scene.remove(this.inside); this.scene.fog = this.savedFog; }
    if (this.done1 === undefined) this.c.course?.towerFor?.(this.cup)?.userData.deactivate();
  }
}
