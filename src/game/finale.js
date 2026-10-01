import * as THREE from 'three';
import { TEX } from '../course/themes.js';
import { makeTower, makeAelita, makeTowerInterior, TOWER_BODY } from '../fx/lyoko.js';
import { makeLabel } from '../fx/models.js';
import { Emitter } from '../fx/particles.js';
import { Physics } from '../physics/world.js';
import { createMonster } from '../monsters/index.js';
import { sfx } from '../core/audio.js';
import { applyCharacter } from './characters.js';

const DUR = 21;

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
    this.tower = makeTower('#ff2a2a', 15, TOWER_BODY.forest);
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
      applyCharacter(m.material, w.color);
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
    this.inside = makeTowerInterior();
    this.inside.visible = false;
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
      b.m.visible = b.label.visible = t < 10.5 || t >= 16;
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
    if (t < 2) { pos = new THREE.Vector3(14, 8, 18); look = new THREE.Vector3(0, 7, -12); }
    else if (t < 9) { pos = new THREE.Vector3(5.5, 2.4, ballZ + 4); look = new THREE.Vector3(0, 1, ballZ - 2); }
    else if (t < 10.5) { pos = new THREE.Vector3(4, 3, -7); look = new THREE.Vector3(0, 3.5, -15); }
    if (t >= 10.5 && t < 16) {
      // inside the tower: Aelita floats up to the top platform, then enters the code on the holo-panel
      const I = this.inside;
      if (!I.visible) {
        I.visible = true;
        this.insideAelita = makeAelita();
        this.insideAelita.userData.float(true);
        this.insideAelita.userData.eyesClosed(true);
        I.add(this.insideAelita);
        this.savedFog = this.scene.fog;
        this.scene.fog = null;
        this.ui.finaleText('', '');
        sfx.play('teleport');
      }
      I.userData.animate(t);
      const A = this.insideAelita;
      A.userData.animate(t, false);
      const u = Math.min(1, (t - 10.5) / 2.2);
      const s = u * u * (3 - 2 * u);
      A.position.y = s * 9;
      A.rotation.y = 0;
      if (t < 12.7) {
        pos = new THREE.Vector3(0, -60 + 1.2 + s * 9, 5.5);
        look = new THREE.Vector3(0, -60 + 1.4 + s * 9, 0);
      } else {
        if (!this.reaching) {
          this.reaching = true;
          A.userData.float(false);
          A.userData.eyesClosed(false);
          A.userData.reach(true);
          I.userData.panel.visible = true;
          this.typed = '';
        }
        // the panel floats in front of her raised hand and faces the camera
        const camPos = new THREE.Vector3(-1.7, -60 + 10.7, 3.2);
        I.userData.panel.position.set(1.35, 10.6, 0.3);
        I.userData.panel.lookAt(camPos);
        const full = 'AELITA\nCODE: LYOKO';
        const n = Math.min(full.length, Math.floor((t - 12.9) / 0.11));
        if (n > 0 && full.slice(0, n) !== this.typed) { this.typed = full.slice(0, n); I.userData.drawPanel(this.typed); sfx.play('roulette'); }
        pos = camPos;
        look = new THREE.Vector3(0.6, -60 + 10.3, 0.2);
      }
    } else if (t >= 16) {
      this.inside.visible = false;
      if (this.savedFog !== undefined) { this.scene.fog = this.savedFog; this.savedFog = undefined; }
      if (!this.deactivated) {
        this.deactivated = true;
        this.tower.userData.setColor('#ffffff');
        this.ui.finaleText('TOWER DEACTIVATED', 'XANA\'s attack has been stopped');
        sfx.play('hio');
      }
      pos = new THREE.Vector3(11, 7, 3);
      look = new THREE.Vector3(0, 7, -15);
      if (t > 18) {
        if (!this.rtp.visible) { this.rtp.visible = true; this.ui.finaleText('RETURN TO THE PAST, NOW!', ''); sfx.play('whoosh'); }
        const r = Math.pow((t - 18) / 2.4, 2.2) * 60;
        this.rtp.position.set(0, 6, -15);
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
