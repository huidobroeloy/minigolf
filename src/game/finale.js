import * as THREE from 'three';
import { TEX } from '../course/themes.js';
import { makeTower, makeAelita } from '../fx/lyoko.js';
import { makeLabel } from '../fx/models.js';
import { Emitter } from '../fx/particles.js';
import { Physics } from '../physics/world.js';
import { createMonster } from '../monsters/index.js';
import { sfx } from '../core/audio.js';

const DUR = 19;

/**
 * The winner's finale: their ball escorts Aelita through the Forest Sector to a tower XANA
 * has activated, she enters it, types CODE: LYOKO, the tower turns white, and a Return to
 * the Past swallows everything. Fully scripted and local (every client plays its own copy).
 */
export class Finale {
  constructor(app, winners, onDone) {
    this.app = app;
    this.renderer = app.renderer;
    this.scene = app.renderer.scene;
    this.ui = app.ui;
    this.onDone = onDone;
    this.t = 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.physics = new Physics();
    this.fx = new Emitter(this.group, { max: 800 });
    this.build(winners);
    const fake = { center: new THREE.Vector3(0, 0, 0), size: new THREE.Vector3(36, 4, 36), bounds: new THREE.Box3(new THREE.Vector3(-18, 0, -18), new THREE.Vector3(18, 4, 18)) };
    this.renderer.applyTheme('forest', fake);
    this.skip = () => this.finish();
    window.addEventListener('pointerdown', this.skip);
    window.addEventListener('keydown', this.skip);
    this.ui.finaleText('XANA HAS ACTIVATED A TOWER', 'Escort Aelita to deactivate it · click to skip');
    sfx.play('rumble');
  }

  build(winners) {
    const g = this.group;
    // forest clearing with a path to the tower
    const grass = TEX.grass(); grass.repeat.set(4, 4);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(20, 16, 2, 48), [new THREE.MeshStandardMaterial({ color: '#6b4a2a' }), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#4a3220' })]);
    ground.position.y = -1;
    ground.receiveShadow = true;
    g.add(ground);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 30), new THREE.MeshStandardMaterial({ color: '#c9a36a', roughness: 1 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, 1);
    path.receiveShadow = true;
    g.add(path);
    const bark = new THREE.MeshStandardMaterial({ map: TEX.bark(), roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: '#2f8f3a', flatShading: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const r = 13 + (i % 3) * 2;
      if (Math.abs(Math.cos(a)) < 0.25 && Math.sin(a) < 0) continue; // keep the tower view clear
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 22, 10), bark);
      trunk.position.set(Math.cos(a) * r, 11, Math.sin(a) * r);
      trunk.castShadow = true;
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 1), leaf);
      crown.position.set(trunk.position.x, 22, trunk.position.z);
      crown.scale.y = 0.6;
      g.add(crown);
    }
    // the tower, activated by XANA
    this.tower = makeTower('#ff2a2a', 9);
    this.tower.position.set(0, 0, -15);
    g.add(this.tower);
    // Aelita
    this.aelita = makeAelita();
    this.aelita.position.set(0, 0, 15.5);
    this.aelita.rotation.y = Math.PI;
    g.add(this.aelita);
    // the winners' balls
    this.balls = winners.slice(0, 3).map((w, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 28, 20), new THREE.MeshPhysicalMaterial({ color: w.color, clearcoat: 1, roughness: 0.2, emissive: w.color, emissiveIntensity: 0.25 }));
      m.castShadow = true;
      const label = makeLabel(w.name, w.color);
      label.scale.multiplyScalar(1.4);
      g.add(m, label);
      return { m, label, x: (i - (Math.min(3, winners.length) - 1) / 2) * 0.9, color: w.color };
    });
    // Kankrelats guarding the path
    this.guards = [[0.4, 3], [-1.6, -4], [1.5, -8]].map(([x, z]) => {
      const mon = createMonster({ type: 'kankrelat', p: [x, 0, z], ry: Math.PI }, { group: g, physics: this.physics, course: {} });
      return { mon, x, z, dead: false };
    });
    // tower interior (shown later)
    this.inside = new THREE.Group();
    this.inside.visible = false;
    const dark = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: '#040b22', side: THREE.BackSide }));
    this.inside.add(dark);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5 + i * 1.8, 1.6 + i * 1.8, 64), new THREE.MeshBasicMaterial({ color: '#6fd8ff', transparent: true, opacity: 0.8 - i * 0.15, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.userData.i = i;
      this.inside.add(ring);
    }
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: TEX.xanaEye(), transparent: true, color: '#6fd8ff' }));
    eye.rotation.x = -Math.PI / 2;
    eye.position.y = 0.02;
    this.inside.add(eye);
    const glow = new THREE.PointLight('#9fe8ff', 30, 30);
    glow.position.set(0, 6, 4);
    this.inside.add(glow);
    this.inside.position.set(0, -60, 0);
    g.add(this.inside);
    // the Return to the Past bubble
    this.rtp = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }));
    this.rtp.visible = false;
    g.add(this.rtp);
  }

  // position along the walk (0 → 1) from the start of the path to the tower door
  walkZ(k) { return THREE.MathUtils.lerp(15, -12.6, k); }

  frame(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const cam = this.renderer.camera;
    this.tower.userData.animate(t);
    this.fx.update(dt);
    for (const gd of this.guards) if (!gd.dead) { gd.mon.update(t); gd.mon.frame(t); }

    // 2–9s: the escort
    const k = THREE.MathUtils.clamp((t - 2) / 7, 0, 1);
    const ballZ = this.walkZ(k);
    this.balls.forEach((b, i) => {
      b.m.position.set(b.x + Math.sin(t * 2 + i) * 0.15, 0.35, ballZ - 1.4);
      b.m.rotation.x -= dt * 8 * (k > 0 && k < 1 ? 1 : 0);
      b.label.position.set(b.m.position.x, 1.2, b.m.position.z);
      b.m.visible = b.label.visible = t < 13.5;
    });
    for (const gd of this.guards) {
      if (!gd.dead && ballZ - 1.4 < gd.z + 0.6) {
        gd.dead = true;
        gd.mon.dispose();
        sfx.play('bumper');
        for (let i = 0; i < 50; i++) this.fx.spawn({ pos: [gd.x, 0.5, gd.z], vel: [(Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6], color: Math.random() < 0.5 ? '#c9b27c' : '#ff6a2a', size: 0.25, life: 1, gravity: 6 });
      }
    }
    // Aelita runs, then walks into the tower and fades
    const az = t < 9 ? this.walkZ(k) : THREE.MathUtils.lerp(-12.6, -14.8, Math.min(1, (t - 9) / 1.2));
    this.aelita.position.set(0, 0, az);
    this.aelita.userData.animate(t, t > 2 && t < 10.2);
    this.aelita.visible = t < 10.2;

    // camera choreography
    let pos, look;
    if (t < 2) { pos = new THREE.Vector3(14, 9, 18); look = new THREE.Vector3(0, 4, -12); }
    else if (t < 9) { pos = new THREE.Vector3(5.5, 2.4, ballZ + 4); look = new THREE.Vector3(0, 1, ballZ - 2); }
    else if (t < 10.5) { pos = new THREE.Vector3(4, 3, -7); look = new THREE.Vector3(0, 2.5, -15); }
    if (t >= 10.5 && t < 14) {
      // inside the tower: Aelita floats up the platform and enters the code
      if (!this.inside.visible) {
        this.inside.visible = true;
        this.insideAelita = makeAelita();
        this.insideAelita.userData.float(true);
        this.inside.add(this.insideAelita);
        this.savedFog = this.scene.fog;
        this.scene.fog = null;
        this.ui.finaleCode();
        sfx.play('teleport');
      }
      const u = (t - 10.5) / 3.5;
      this.insideAelita.position.y = u * 6;
      this.insideAelita.rotation.y = Math.sin(t) * 0.2;
      this.insideAelita.userData.animate(t, false);
      this.inside.children.forEach((c) => { if (c.userData.i !== undefined) c.rotation.z = t * (0.3 + c.userData.i * 0.1); });
      pos = new THREE.Vector3(0, -60 + 2 + u * 5.5, 6);
      look = new THREE.Vector3(0, -60 + 1.5 + u * 6, 0);
    } else if (t >= 14) {
      this.inside.visible = false;
      if (this.savedFog !== undefined) { this.scene.fog = this.savedFog; this.savedFog = undefined; }
      if (!this.deactivated) {
        this.deactivated = true;
        this.tower.userData.setColor('#ffffff');
        this.ui.finaleText('TOWER DEACTIVATED', 'XANA\'s attack has been stopped');
        sfx.play('hio');
      }
      pos = new THREE.Vector3(10, 6, 2);
      look = new THREE.Vector3(0, 5, -15);
      if (t > 16) {
        if (!this.rtp.visible) { this.rtp.visible = true; this.ui.finaleText('RETURN TO THE PAST, NOW!', ''); sfx.play('whoosh'); }
        const r = Math.pow((t - 16) / 2.2, 2.2) * 60;
        this.rtp.position.set(0, 4, -15);
        this.rtp.scale.setScalar(Math.max(0.01, r));
      }
    }
    if (pos) { cam.position.lerp(pos, t < 0.05 ? 1 : 1 - Math.exp(-dt * 3)); cam.lookAt(look); }
    if (t > DUR) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    window.removeEventListener('pointerdown', this.skip);
    window.removeEventListener('keydown', this.skip);
    this.ui.finaleText(null);
    if (this.savedFog !== undefined) this.scene.fog = this.savedFog;
    this.ui.flash();
    for (const gd of this.guards) if (!gd.dead) gd.mon.dispose();
    this.fx.dispose();
    this.scene.remove(this.group);
    this.physics.dispose();
    this.onDone();
  }
}
