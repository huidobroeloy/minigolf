import * as THREE from 'three';
import { TEX } from '../course/themes.js';
import { makeTower, makeAelita, makeKolossus, TOWER_BODY } from '../fx/lyoko.js';
import { makeLabel } from '../fx/models.js';
import { Emitter } from '../fx/particles.js';
import { sfx } from '../core/audio.js';
import { applyCharacter } from './characters.js';

const DUR = 20;

/**
 * XANA won. The catastrophic ending: Aelita runs for the tower and is thrown back by its red
 * shield, the Kolossus rises behind it and smashes the sector, the ground crumbles into the
 * Digital Sea, the screen glitches and the eye of XANA takes over everything.
 * Same interface as Finale (frame(dt) / finish()), fully scripted and local.
 */
export class XanaFinale {
  constructor(app, winners, onDone) {
    this.app = app;
    this.renderer = app.renderer;
    this.scene = app.renderer.scene;
    this.ui = app.ui;
    this.onDone = onDone;
    this.t = 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.fx = new Emitter(this.group, { max: 1200 });
    this.build(winners);
    const fake = { center: new THREE.Vector3(0, 0, 0), size: new THREE.Vector3(36, 4, 36), bounds: new THREE.Box3(new THREE.Vector3(-18, 0, -18), new THREE.Vector3(18, 4, 18)) };
    this.renderer.applyTheme('forest', fake);
    this.skip = () => { if (this.t > 1) this.finish(); };
    window.addEventListener('pointerdown', this.skip);
    window.addEventListener('keydown', this.skip);
    this.ui.finaleText('XANA HAS ACTIVATED A TOWER', 'Aelita has to reach it…');
    sfx.play('rumble');
    // the glitch / eye overlay
    this.ov = document.createElement('div');
    this.ov.className = 'xana-ov';
    this.ov.innerHTML = '<div class="xo-eye"></div><div class="xo-scan"></div>';
    document.body.appendChild(this.ov);
  }

  build(winners) {
    const g = this.group;
    // the sector: a disc of grass cut into chunks, so it can break apart
    const grass = TEX.grass(); grass.repeat.set(0.25, 0.25);
    const top = new THREE.MeshStandardMaterial({ map: grass, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 1 });
    this.chunks = [];
    const rings = [0, 5.5, 11, 17];
    for (let ri = 0; ri < rings.length - 1; ri++) {
      const r0 = rings[ri], r1 = rings[ri + 1];
      const n = 4 + ri * 5;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        const sh = new THREE.Shape();
        sh.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
        sh.absarc(0, 0, r1, a0, a1, false);
        if (r0 > 0) { sh.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0); sh.absarc(0, 0, r0, a1, a0, true); } else sh.lineTo(0, 0);
        sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.5, bevelEnabled: false, curveSegments: 6 });
        geo.rotateX(Math.PI / 2); // the shape's face becomes the top, extruded downward
        const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
        const cx = Math.cos(am) * rm, cz = Math.sin(am) * rm;
        geo.translate(-cx, 0, -cz); // pivot on its own centre so it tumbles in place
        const m = new THREE.Mesh(geo, [top, side]);
        m.position.set(cx, 0, cz);
        m.receiveShadow = true;
        g.add(m);
        this.chunks.push({ m, cx, cz, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6), vy: 0, fall: null });
      }
    }
    // the Digital Sea far below
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#0b3a9a' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -60;
    g.add(sea);
    // trees on the outer ring (they go down with it)
    const bark = new THREE.MeshStandardMaterial({ map: TEX.bark(), roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: '#2f8f3a', flatShading: true });
    for (const c of this.chunks.filter((c) => Math.hypot(c.cx, c.cz) > 12).filter((_, i) => i % 2 === 0)) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 14, 8), bark);
      trunk.position.set(0, 7, 0);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), leaf);
      crown.position.set(0, 14, 0); crown.scale.y = 0.6;
      c.m.add(trunk, crown); // they go down with their chunk
    }
    // the tower, blazing red
    this.tower = makeTower('#ff2a2a', 15, TOWER_BODY.forest);
    this.tower.position.set(0, 0, -8);
    g.add(this.tower);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 20), new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shield.position.set(0, 2, -8);
    g.add(this.shield);
    // Aelita
    this.aelita = makeAelita();
    this.aelita.position.set(0, 0, 9);
    this.aelita.rotation.y = Math.PI;
    g.add(this.aelita);
    // the winning XANA ball, hovering by the tower
    const w = winners[0] || { color: '#ff3b3b', name: 'XANA' };
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 20), new THREE.MeshPhysicalMaterial({ color: w.color, clearcoat: 1, roughness: 0.2 }));
    applyCharacter(this.ball.material, w.color);
    this.label = makeLabel(w.name, w.color);
    this.label.scale.multiplyScalar(1.4);
    g.add(this.ball, this.label);
    // the Kolossus, waiting under the ground behind the tower
    this.kolossus = makeKolossus();
    this.kolossus.scale.setScalar(0.85);
    this.kolossus.position.set(0, -34, -22);
    g.add(this.kolossus);
  }

  frame(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const cam = this.renderer.camera;
    this.tower.userData.animate?.(t);
    this.kolossus.userData.breathe?.(t);
    this.fx.update(dt);
    this.ball.position.set(Math.sin(t * 1.3) * 1.2, 2.6 + Math.sin(t * 2) * 0.3, -4.5);
    this.ball.rotation.y += dt * 2;
    this.label.position.set(this.ball.position.x, this.ball.position.y + 1, this.ball.position.z);

    // 0.5–4.6 s: Aelita runs for the tower… 4.6 s: the shield throws her back
    if (t < 4.6) {
      const k = THREE.MathUtils.clamp((t - 0.5) / 4.1, 0, 1);
      this.aelita.position.set(0, 0, THREE.MathUtils.lerp(9, -4.4, k));
      this.aelita.userData.animate?.(t, k > 0 && k < 1);
    } else {
      if (!this.repelled) {
        this.repelled = true;
        sfx.play('laser'); sfx.play('wall', 4);
        this.ui.finaleText('ACCESS DENIED', 'XANA’s shield throws Aelita back');
        for (let i = 0; i < 60; i++) this.fx.spawn({ pos: [0, 1.5, -4.6], vel: [(Math.random() - 0.5) * 8, Math.random() * 5, Math.random() * 6], color: i % 2 ? '#ff2a2a' : '#ffb0b0', size: 0.25, life: 0.8, gravity: 4 });
      }
      const u = Math.min(1, (t - 4.6) / 1.1);
      this.aelita.position.set(0, Math.sin(u * Math.PI) * 2.2, THREE.MathUtils.lerp(-4.4, 4, u));
      this.aelita.rotation.x = u < 1 ? -u * 1.2 : -Math.PI / 2;
      this.aelita.position.y = u < 1 ? this.aelita.position.y : 0.25;
      this.aelita.userData.animate?.(t, false);
    }
    this.shield.material.opacity = t > 4.4 && t < 6 ? 0.45 * (1 - Math.abs(t - 4.8) / 1.2) : 0.06 + 0.04 * Math.sin(t * 5);

    // 6.4–10 s: the Kolossus rises behind the tower
    const rise = THREE.MathUtils.smoothstep(t, 6.4, 10);
    this.kolossus.position.y = THREE.MathUtils.lerp(-34, -3, rise);
    if (t > 6.4 && !this.risen) { this.risen = true; sfx.play('rumble'); this.ui.finaleText('THE KOLOSSUS', 'XANA’s ultimate monster'); }
    // 10–12 s: arm up… SMASH
    if (t > 10) this.kolossus.userData.slam?.(t < 11.4 ? THREE.MathUtils.lerp(0.77, 0, THREE.MathUtils.smoothstep(t, 10, 11.2)) : THREE.MathUtils.lerp(0, 1, THREE.MathUtils.smoothstep(t, 11.4, 11.9)));
    if (t > 11.9 && !this.smashed) {
      this.smashed = true;
      sfx.play('rumble'); sfx.play('splash');
      this.app.ui.flash?.();
      this.ui.finaleText('THE SECTOR IS FALLING', '');
      const impact = new THREE.Vector2(0, -6);
      for (const c of this.chunks) c.fall = 11.9 + new THREE.Vector2(c.cx, c.cz).distanceTo(impact) * 0.09 + Math.random() * 0.25;
      for (let i = 0; i < 120; i++) this.fx.spawn({ pos: [(Math.random() - 0.5) * 6, 0.5, -6 + (Math.random() - 0.5) * 6], vel: [(Math.random() - 0.5) * 14, Math.random() * 12, (Math.random() - 0.5) * 14], color: i % 3 ? '#6b4a2a' : '#ff7a1a', size: 0.35, life: 1.6, gravity: 9 });
    }
    // the ground breaks up and drops into the Digital Sea; the tower topples with it
    for (const c of this.chunks) {
      if (c.fall === null || t < c.fall) continue;
      c.vy -= 22 * dt;
      c.m.position.y += c.vy * dt;
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.z += c.spin.z * dt;
    }
    if (this.smashed) {
      const u = Math.max(0, t - 12.4);
      this.tower.rotation.x = -Math.min(1.4, u * u * 0.5);
      this.tower.position.y = -u * u * 5;
      this.aelita.position.y = Math.min(this.aelita.position.y, -(Math.max(0, t - 12.6) ** 2) * 8);
    }

    // camera: chase Aelita, frame the tower, pull back for the Kolossus, then high above the fall
    let pos, look;
    if (t < 4.4) { pos = new THREE.Vector3(4.5, 2.6, this.aelita.position.z + 5); look = new THREE.Vector3(0, 2.5, -8); }
    else if (t < 6.4) { pos = new THREE.Vector3(5, 3, 6); look = new THREE.Vector3(0, 1.5, 0); }
    else if (t < 12) { pos = new THREE.Vector3(5, 3.5, 9); look = new THREE.Vector3(0, 11 * rise + 2, -16); }
    else { pos = new THREE.Vector3(22, 26, 30); look = new THREE.Vector3(0, -12, -4); }
    cam.position.lerp(pos, t < 0.05 ? 1 : 1 - Math.exp(-dt * 2.5));
    if (this.smashed && t < 14) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, 0));
    cam.lookAt(look);

    // 15 s on: the glitch, then the eye of XANA everywhere
    if (t > 15 && !this.glitched) {
      this.glitched = true;
      this.ov.classList.add('glitch');
      document.body.classList.add('xana-glitch');
      sfx.play('buzzer');
      this.ui.finaleText('XANA HAS ESCAPED INTO THE NETWORK', 'Lyoko is lost… for now');
    }
    if (t > 16.5) this.ov.classList.add('eye');
    if (t > DUR) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    window.removeEventListener('pointerdown', this.skip);
    window.removeEventListener('keydown', this.skip);
    this.ui.finaleText(null);
    document.body.classList.remove('xana-glitch');
    this.ov.remove();
    this.fx.dispose();
    this.scene.remove(this.group);
    this.onDone();
  }
}
