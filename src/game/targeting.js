import * as THREE from 'three';
import { POWERUPS } from '../powerups/registry.js';
import { emojiTexture } from '../fx/particles.js';

const CUP_KEEPOUT = 1.2;
const LINE_MAX = 5;
const LINE_MIN = 1.2;

/**
 * Aerial targeting for power-ups that need a place, a direction or a line.
 * Left button / one finger = aim gesture, right-drag / WASD / two fingers = pan,
 * wheel = zoom, Q/E = rotate, Esc / right-click without dragging = cancel (item kept).
 */
export class Targeting {
  constructor(client, id, slot) {
    this.client = client;
    this.id = id;
    this.slot = slot;
    this.def = POWERUPS[id];
    this.aim = this.def.aim;
    this.course = client.course;
    this.cam = client.cam;
    this.prevMode = this.cam.mode;
    this.cam.mode = 'tactical';
    this.cam.resetTactical();
    this.group = new THREE.Group();
    this.group.renderOrder = 20;
    client.scene.add(this.group);
    this.anchor = null;   // first point of a gesture
    this.cursor = null;   // current point under the pointer
    this.dragging = false;
    this.buildPreview();
    const verb = { point: 'Click a spot', pointdir: 'Click where it starts and drag where it drifts', dir: 'Drag an arrow across the course', line: 'Drag a line: over floor = wall, across a gap = bridge' }[this.aim];
    client.ui.setHint(`${this.def.icon} <b>${this.def.name}</b> — ${verb} · right-drag/WASD pan · wheel zoom · <kbd>Esc</kbd> cancel`);
    client.ui.setTargeting(true);
  }

  // ---------- previews ----------
  buildPreview() {
    const mk = (geo, color, opacity = 0.75) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 20;
      return m;
    };
    const r = this.def.range ?? 0.6;
    this.ring = mk(new THREE.RingGeometry(Math.max(0.05, r - 0.08), r, 64), '#ffffff');
    this.ring.rotation.x = -Math.PI / 2;
    this.disc = mk(new THREE.CircleGeometry(r, 64), '#ffffff', 0.15);
    this.disc.rotation.x = -Math.PI / 2;
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(this.def.icon, 128), depthTest: false, transparent: true }));
    this.icon.renderOrder = 21;
    this.icon.scale.set(1.2, 1.2, 1);
    // arrow: shaft + head, built along +z and scaled
    this.arrow = new THREE.Group();
    const shaft = mk(new THREE.PlaneGeometry(0.35, 1), '#18f0ff', 0.85);
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.z = 0.5;
    const headShape = new THREE.Shape([new THREE.Vector2(-0.6, 0), new THREE.Vector2(0.6, 0), new THREE.Vector2(0, 0.9)]);
    const head = mk(new THREE.ShapeGeometry(headShape), '#18f0ff', 0.9);
    head.rotation.x = Math.PI / 2;
    this.arrowShaft = shaft;
    this.arrowHead = head;
    this.arrow.add(shaft, head);
    // tsunami front / creativity line
    this.bar = mk(new THREE.BoxGeometry(1, 0.5, 0.25), '#ff8ad8', 0.8);
    this.group.add(this.ring, this.disc, this.icon, this.arrow, this.bar);
    this.arrow.visible = false;
    this.bar.visible = false;
    this.setVisible(false);
  }

  setVisible(v) {
    this.ring.visible = this.disc.visible = this.icon.visible = v && this.aim !== 'dir' && this.aim !== 'line';
  }

  tint(ok) {
    const c = ok ? '#ffffff' : '#ff3b3b';
    this.ring.material.color.set(c);
    this.disc.material.color.set(c);
  }

  placeArrow(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    this.arrow.visible = L > 0.2;
    if (!this.arrow.visible) return;
    this.arrow.position.set(a.x, a.y + 0.08, a.z);
    this.arrow.rotation.y = Math.atan2(dx, dz);
    this.arrowShaft.scale.set(1, Math.max(0.1, L - 0.9), 1);
    this.arrowShaft.position.z = Math.max(0.1, L - 0.9) / 2;
    this.arrowHead.position.set(0, 0, Math.max(0.1, L - 0.9));
  }

  // ---------- picking ----------
  floorHit(e) {
    const rect = this.client.renderer.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.client.renderer.camera);
    for (const h of ray.intersectObjects(this.course.group.children, true)) {
      if (!h.face || h.object.isSprite) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.y < 0.8) continue;
      const fy = this.course.floorYAt(h.point.x, h.point.z);
      // only accept the floor itself (not tree crowns, monsters or walls above it)
      if (fy !== null && Math.abs(h.point.y - fy) < 0.3) return new THREE.Vector3(h.point.x, fy, h.point.z);
    }
    // fall back to the plane of the lowest floor (for arrows that start off the course)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.course.bounds.min.y);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, p) ? Object.assign(p, { offCourse: true }) : null;
  }

  okPoint(p) {
    if (!p || p.offCourse) return false;
    // Telekinesis: judge the spot the ball would really move to (reach, cup, solid ground)
    if (this.id === 'telekinesis') return !this.client.telekinesisSpot([p.x, p.y, p.z]).err;
    return this.course.cups.every((c) => Math.hypot(p.x - c.x, p.z - c.z) >= CUP_KEEPOUT);
  }

  /** Wall or bridge? A bridge if part of the segment has no floor under it. */
  lineKind(a, b) {
    let gaps = 0;
    for (let i = 1; i < 8; i++) {
      const k = i / 8;
      if (this.course.floorYAt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k) === null) gaps++;
    }
    return gaps ? 'bridge' : 'wall';
  }

  segCupDist(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    let best = Infinity;
    for (const c of this.course.cups) {
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / L2));
      best = Math.min(best, Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z));
    }
    return best;
  }

  clampLine(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L <= LINE_MAX) return b;
    return new THREE.Vector3(a.x + (dx / L) * LINE_MAX, a.y, a.z + (dz / L) * LINE_MAX);
  }

  // ---------- input (called by the client) ----------
  down(e) {
    if (e.button !== 0) return;
    const p = this.floorHit(e);
    if (!p) return;
    this.dragging = true;
    this.downScreen = [e.clientX, e.clientY];
    if (this.aim === 'point') { this.cursor = p; return; }
    if ((this.aim === 'pointdir' || this.aim === 'line') && !this.okPoint(p)) { this.dragging = false; this.client.ui.toast('Pick a spot on the course, away from the cup'); return; }
    this.anchor = p;
  }

  move(e) {
    const p = this.floorHit(e);
    this.cursor = p;
    if (!p) { this.setVisible(false); return; }
    if (this.aim === 'point') {
      this.setVisible(!p.offCourse);
      this.tint(this.okPoint(p));
      this.ring.position.set(p.x, p.y + 0.05, p.z);
      this.disc.position.copy(this.ring.position);
      this.icon.position.set(p.x, p.y + 1.1, p.z);
      return;
    }
    if (this.aim === 'pointdir') {
      const at = this.anchor || p;
      this.setVisible(!at.offCourse);
      this.tint(this.okPoint(at));
      this.ring.position.set(at.x, at.y + 0.05, at.z);
      this.disc.position.copy(this.ring.position);
      this.icon.position.set(at.x, at.y + 1.4, at.z);
      if (this.anchor) this.placeArrow(this.anchor, p);
      return;
    }
    if (this.aim === 'dir' && this.anchor) {
      this.placeArrow(this.anchor, p);
      if (this.id === 'tsunami') {
        // show the wave front, perpendicular to the drag
        const dx = p.x - this.anchor.x, dz = p.z - this.anchor.z;
        this.bar.visible = Math.hypot(dx, dz) > 0.5;
        this.bar.material.color.set('#2f8fff');
        this.bar.scale.set(Math.max(this.course.size.x, this.course.size.z), 1, 1);
        this.bar.position.set(this.anchor.x, this.anchor.y + 0.3, this.anchor.z);
        this.bar.rotation.y = Math.atan2(dx, dz);
      }
      return;
    }
    if (this.aim === 'line' && this.anchor) {
      const b = this.clampLine(this.anchor, p);
      const dx = b.x - this.anchor.x, dz = b.z - this.anchor.z, L = Math.hypot(dx, dz);
      this.bar.visible = L > 0.2;
      const kind = this.lineKind(this.anchor, b);
      const ok = L >= LINE_MIN && this.segCupDist(this.anchor, b) >= 0.9;
      this.bar.material.color.set(!ok ? '#ff3b3b' : kind === 'bridge' ? '#7fe3ff' : '#ff8ad8');
      this.bar.scale.set(1, kind === 'bridge' ? 0.3 : 1, L);
      this.bar.rotation.y = Math.atan2(dx, dz);
      this.bar.position.set((this.anchor.x + b.x) / 2, this.anchor.y + (kind === 'bridge' ? -0.15 : 0.25), (this.anchor.z + b.z) / 2);
      this.bar.geometry = this.barGeo ||= new THREE.BoxGeometry(0.28, 0.5, 1);
    }
  }

  up(e) {
    if (e.button !== 0 || !this.dragging) return;
    this.dragging = false;
    const p = this.floorHit(e) || this.cursor;
    if (!p) return;
    const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    if (this.aim === 'point') {
      const moved = Math.hypot(e.clientX - this.downScreen[0], e.clientY - this.downScreen[1]);
      if (moved > 12) return;
      if (this.id === 'telekinesis') { const s = this.client.telekinesisSpot([p.x, p.y, p.z]); if (s.err) return this.client.ui.toast(s.err); }
      if (!this.okPoint(p)) return this.client.ui.toast('Too close to the cup (or off the course)');
      return this.client.finishTargeting({ pos: r3(p) });
    }
    if (!this.anchor) return;
    const a = this.anchor;
    this.anchor = null;
    const dx = p.x - a.x, dz = p.z - a.z, L = Math.hypot(dx, dz);
    if (this.aim === 'pointdir') {
      let dir;
      if (L > 0.4) dir = [dx / L, dz / L];
      else { const c = this.course.center; const l = Math.hypot(c.x - a.x, c.z - a.z) || 1; dir = [(c.x - a.x) / l, (c.z - a.z) / l]; }
      return this.client.finishTargeting({ pos: r3(a), dir });
    }
    if (this.aim === 'dir') {
      if (L < 0.5) { this.arrow.visible = false; return this.client.ui.toast('Drag further to set a direction'); }
      return this.client.finishTargeting({ dir: [dx / L, dz / L], pos: r3(a) });
    }
    if (this.aim === 'line') {
      const b = this.clampLine(a, p);
      const Lb = Math.hypot(b.x - a.x, b.z - a.z);
      if (Lb < LINE_MIN) { this.bar.visible = false; return this.client.ui.toast('Draw a longer line'); }
      if (this.segCupDist(a, b) < 0.9) { this.bar.visible = false; return this.client.ui.toast('You can\'t seal the cup!'); }
      return this.client.finishTargeting({ a: r3(a), b: r3(b), kind: this.lineKind(a, b) });
    }
  }

  dispose() {
    this.client.scene.remove(this.group);
    this.cam.mode = this.prevMode === 'tactical' ? 'tactical' : 'chase';
    this.client.ui.setHint('');
    this.client.ui.setTargeting(false);
  }
}
