import * as THREE from 'three';
import { makeTower, TOWER_BODY } from '../fx/lyoko.js';
import { CHARACTERS, applyCharacter } from './characters.js';
import { portraitBig } from '../ui/portraits.js';
import { SECTOR_NAMES, HOLES } from '../holes/index.js';
import { sfx } from '../core/audio.js';
import { music } from '../core/music.js';

// The opening cinematic (about 24 s, click or any key skips):
//   1. the supercomputer screen: XANA has activated a tower
//   2. TRANSFER… SCANNER… VIRTUALIZATION! with each hero cut in over pink rings and data rain
//   3. Lyoko: the balls virtualize one by one inside scanning rings, the camera swoops to the red tower
//   4. the title card
// All drawn in code: canvases, CSS and the game's own 3D scenery.

const HEROES = ['ulrich', 'yumi', 'odd', 'aelita', 'william'];
const T_SCAN = 4.6, T_LYOKO = 12.2, T_TITLE = 19.6, T_END = 24.5;

export class Intro {
  constructor(app, onDone) {
    this.app = app;
    this.onDone = onDone;
    this.t = 0;
    this.heroes = HEROES.map((id) => CHARACTERS.find((c) => c.id === id)).filter(Boolean);
    // the overlay
    this.el = document.createElement('div');
    this.el.className = 'intro';
    this.el.innerHTML = `
      <canvas class="in-cv"></canvas>
      <div class="in-layer in-comp hidden"><div class="in-head">SUPERCOMPUTER · LYOKO SCAN</div><div class="in-alert">⚠ ACTIVATED TOWER DETECTED</div><div class="in-sub"></div></div>
      <div class="in-layer in-cut hidden"><div class="in-rings"></div><img class="in-face px" alt="" /><div class="in-name"></div><div class="in-cmd"></div></div>
      <div class="in-layer in-virt hidden"><div class="in-big">VIRTUALIZATION!</div></div>
      <div class="in-layer in-bars hidden"><div class="in-bar top"></div><div class="in-bar bot"></div><div class="in-cap"></div></div>
      <div class="in-layer in-title hidden">
        <div class="in-logo">LYOKO<span>MINIGOLF</span></div>
        <div class="in-row">${this.heroes.map((h) => `<img class="px" alt="" src="${portraitBig(h.id)}" />`).join('')}</div>
        <div class="in-tag">XANA is attacking. Get every ball to the cup.</div>
      </div>
      <button class="in-skip">Skip ▸</button>`;
    document.body.appendChild(this.el);
    this.cv = this.el.querySelector('.in-cv');
    this.g = this.cv.getContext('2d');
    this.resize = () => { this.cv.width = innerWidth; this.cv.height = innerHeight; };
    this.resize();
    addEventListener('resize', this.resize);
    // which sector XANA hit: the one the 3D part shows
    // XANA strikes one of the four outer sectors (the ones on the supercomputer map)
    app.hideBackdrop();
    app.showBackdrop(HOLES.filter((h) => ['desert', 'forest', 'ice', 'mountain'].includes(h.sector)));
    this.b = app.backdrop;
    this.sector = this.b.course.def?.sector || 'forest';
    this.el.querySelector('.in-sub').textContent = `SECTOR: ${(SECTOR_NAMES[this.sector] || this.sector).toUpperCase()}`;
    this.rain = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.2 + Math.random() * 0.6, s: 10 + Math.random() * 10 }));
    this.skip = (e) => { if (e.type === 'keydown' || e.target.closest?.('.in-skip') || this.t > 1) this.finish(); };
    addEventListener('keydown', this.skip);
    this.el.addEventListener('pointerdown', this.skip);
    music.play('intro');
    this.cutIdx = -1;
    this.nextBeep = 0;
  }

  show(cls, on) { this.el.querySelector(cls).classList.toggle('hidden', !on); }

  frame(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const g = this.g, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H);
    if (t < T_SCAN) this.computer(t, g, W, H);
    else if (t < T_LYOKO) this.transfer(t - T_SCAN, g, W, H);
    else if (t < T_TITLE) this.lyoko(t - T_LYOKO, dt);
    else this.title(t - T_TITLE, dt);
    if (t > T_END) this.finish();
  }

  // ---------- 1. the supercomputer screen ----------
  computer(t, g, W, H) {
    this.show('.in-comp', true);
    g.fillStyle = '#030a1c'; g.fillRect(0, 0, W, H);
    // grid
    g.strokeStyle = 'rgba(46,160,255,0.12)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // scrolling code down the side
    g.font = '12px monospace'; g.fillStyle = 'rgba(120,200,255,0.5)';
    for (let i = 0; i < H / 16; i++) {
      const n = Math.floor(t * 9) + i;
      g.fillText(`0x${((n * 2654435761) >>> 0).toString(16).padStart(8, '0')}  ${['SCAN', 'SYNC', 'PING', 'LOAD', 'XANA?'][n % 5]}`, 14, 20 + i * 16);
    }
    // the map of Lyoko: four sectors around Sector 5
    const cx = W / 2, cy = H / 2 + 20, R = Math.min(W, H) * 0.24;
    const order = ['ice', 'desert', 'forest', 'mountain'];
    const hit = this.sector;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(120,220,255,0.6)'; g.beginPath(); g.arc(cx, cy, R * 0.32, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(120,220,255,0.7)'; g.font = 'bold 12px monospace'; g.textAlign = 'center';
    g.fillText('SECTOR 5', cx, cy + 4);
    order.forEach((s, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 2;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const isHit = s === hit;
      g.strokeStyle = isHit ? `rgba(255,60,60,${0.5 + 0.5 * Math.abs(Math.sin(t * 6))})` : 'rgba(120,220,255,0.6)';
      g.beginPath(); g.arc(x, y, R * 0.36, 0, Math.PI * 2); g.stroke();
      g.fillStyle = isHit ? '#ff5050' : 'rgba(120,220,255,0.7)';
      g.fillText(s.toUpperCase(), x, y + R * 0.36 + 16);
      if (isHit && t > 1.2) {
        const p = 6 + 10 * Math.abs(Math.sin(t * 5));
        g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(x + R * 0.1, y - R * 0.08, p, 0, Math.PI * 2); g.fill();
      }
    });
    // a sweeping scan line
    const sweep = (t * 1.6) % (Math.PI * 2);
    g.strokeStyle = 'rgba(120,255,255,0.35)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sweep) * R * 1.5, cy + Math.sin(sweep) * R * 1.5); g.stroke();
    g.textAlign = 'left';
    this.el.querySelector('.in-alert').classList.toggle('on', t > 1.2);
    if (t > 1.2 && t > this.nextBeep) { this.nextBeep = t + 0.7; sfx.play('buzzer'); }
  }

  // ---------- 2. transfer, scanner, virtualization ----------
  transfer(u, g, W, H) {
    this.show('.in-comp', false);
    // blue data rain
    g.fillStyle = '#04103a'; g.fillRect(0, 0, W, H);
    g.font = 'bold 16px monospace';
    for (const d of this.rain) {
      d.y += d.v * 0.016;
      if (d.y > 1.1) { d.y = -0.1; d.x = Math.random(); }
      g.fillStyle = `rgba(90,170,255,${0.25 + d.v * 0.5})`;
      for (let k = 0; k < 6; k++) g.fillText(String.fromCharCode(0x30a0 + ((d.x * 999 + k * 7 + Math.floor(u * 8)) % 90)), d.x * W, (d.y - k * 0.025) * H);
    }
    const per = 1.25, n = this.heroes.length;
    const i = Math.floor(u / per);
    const cut = this.el.querySelector('.in-cut');
    if (i < n) {
      this.show('.in-cut', true);
      this.show('.in-virt', false);
      if (i !== this.cutIdx) {
        this.cutIdx = i;
        const h = this.heroes[i];
        cut.querySelector('.in-face').src = portraitBig(h.id);
        cut.querySelector('.in-name').textContent = h.full || h.name;
        cut.style.setProperty('--hc', h.ui);
        cut.classList.toggle('flip', i % 2 === 1);
        cut.classList.remove('go'); void cut.offsetWidth; cut.classList.add('go');
        sfx.play('whoosh');
      }
      const k = (u - i * per) / per;
      const nm = this.heroes[i].name.toUpperCase();
      cut.querySelector('.in-cmd').textContent = k < 0.5 ? `TRANSFER ${nm}` : `SCANNER ${nm}`;
    } else {
      this.show('.in-cut', false);
      if (!this.virtShown) { this.virtShown = true; sfx.play('teleport'); this.app.ui.flash?.(); }
      this.show('.in-virt', true);
    }
  }

  // ---------- 3. Lyoko: the balls virtualize, the camera swoops to the red tower ----------
  lyoko(u, dt) {
    if (!this.scene3d) this.build3d();
    this.cv.style.opacity = '0';
    this.show('.in-cut', false);
    this.show('.in-virt', false);
    this.show('.in-bars', true);
    const b = this.b;
    b.t += dt;
    b.course.update(b.t, dt);
    b.physics.step();
    b.course.frame(b.t, dt);
    this.tower.userData.animate?.(b.t);
    const c = b.course;
    const tee = c.tee;
    this.balls.forEach((o, i) => {
      const t0 = 0.4 + i * 0.6;
      const k = THREE.MathUtils.clamp((u - t0) / 1.0, 0, 1);
      // rings sweep down from above, the ball builds up inside them, then drops onto the course
      o.rings.forEach((r, j) => {
        r.visible = k > 0 && k < 1;
        r.position.set(o.x, tee.y + 2.6 - k * 2.4 + j * 0.25, o.z);
        r.material.opacity = 0.8 * (1 - k);
      });
      o.m.visible = k > 0.15;
      o.m.scale.setScalar(Math.min(1, k * 1.3));
      o.m.material.wireframe = k < 0.7;
      if (k >= 1) {
        o.vy = (o.vy ?? 0) - 16 * dt;
        o.y = Math.max(tee.y + 0.18, (o.y ?? tee.y + 1.2) + o.vy * dt);
        if (o.y <= tee.y + 0.18 && !o.landed) { o.landed = true; sfx.play('stick'); }
      } else o.y = tee.y + 1.2;
      o.m.position.set(o.x, o.y, o.z);
      if (k > 0 && !o.pinged) { o.pinged = true; sfx.play('teleport'); }
    });
    // camera: low by the balls, then a swoop up and over towards the tower
    const cam = this.app.renderer.camera;
    const s = THREE.MathUtils.smoothstep(u, 3.4, 7.2);
    const from = new THREE.Vector3(tee.x + 1.4, tee.y + 1.0, tee.z + 3.1);
    const to = new THREE.Vector3((tee.x + this.tower.position.x) / 2 + 6, tee.y + 9, (tee.z + this.tower.position.z) / 2);
    cam.position.copy(from.lerp(to, s));
    const lookA = new THREE.Vector3(tee.x, tee.y + 0.55, tee.z);
    const lookB = this.tower.position.clone().add(new THREE.Vector3(0, 7, 0));
    cam.lookAt(lookA.lerp(lookB, s));
    this.el.querySelector('.in-cap').textContent = u < 3.4 ? `LYOKO · ${(SECTOR_NAMES[this.sector] || '').toUpperCase()}` : 'XANA HAS ACTIVATED A TOWER';
  }

  build3d() {
    this.scene3d = true;
    const c = this.b.course;
    const g = (this.group = new THREE.Group());
    this.app.renderer.scene.add(g);
    // XANA's tower beyond the far end of the course
    this.tower = makeTower('#ff2a2a', 14, TOWER_BODY[this.sector] || TOWER_BODY.forest);
    this.tower.position.set(c.center.x, c.bounds.min.y, c.bounds.max.z + 10);
    g.add(this.tower);
    const tee = c.tee;
    this.balls = this.heroes.map((h, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), new THREE.MeshPhysicalMaterial({ color: h.ui, clearcoat: 1, roughness: 0.25 }));
      applyCharacter(m.material, h.ui);
      m.visible = false;
      g.add(m);
      const rings = [0, 1, 2].map(() => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 32), new THREE.MeshBasicMaterial({ color: '#d8fbff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        r.rotation.x = Math.PI / 2;
        r.visible = false;
        g.add(r);
        return r;
      });
      return { m, rings, x: tee.x + (i - 2) * 0.55, z: tee.z + Math.abs(i - 2) * -0.25 };
    });
  }

  // ---------- 4. the title card ----------
  title(u, dt) {
    this.show('.in-bars', false);
    const el = this.el.querySelector('.in-title');
    if (el.classList.contains('hidden')) { this.show('.in-title', true); sfx.play('hio'); }
    // keep the 3D scene turning gently behind the card
    const b = this.b;
    b.t += dt;
    b.course.update(b.t, dt);
    b.physics.step();
    b.course.frame(b.t, dt);
    const cam = this.app.renderer.camera;
    const cc = b.course.center, R = Math.max(b.course.size.x, b.course.size.z) * 0.7 + 6;
    cam.position.set(cc.x + Math.cos(b.t * 0.08) * R, cc.y + R * 0.55, cc.z + Math.sin(b.t * 0.08) * R);
    cam.lookAt(cc);
    el.style.opacity = String(Math.min(1, u / 0.6, (T_END - T_TITLE - u) / 0.6));
  }

  finish() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.skip);
    removeEventListener('resize', this.resize);
    if (this.group) this.app.renderer.scene.remove(this.group);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 500);
    this.onDone();
  }
}

