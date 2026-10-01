import * as THREE from 'three';
import { initPhysics, Physics } from './physics/world.js';
import { Renderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { UI, savePrefs } from './ui/ui.js';
import { sfx } from './core/audio.js';
import { HostRoom } from './net/room.js';
import { LocalLink, hostPeer, joinPeer, makeCode } from './net/transport.js';
import { GameClient } from './game/client.js';
import { buildCourse } from './course/builder.js';
import { HOLES } from './holes/index.js';

class App {
  async boot() {
    const bootMsg = document.querySelector('.boot-msg');
    try {
      await initPhysics();
    } catch (e) {
      bootMsg.textContent = 'Failed to load physics: ' + e.message;
      throw e;
    }
    this.renderer = new Renderer(document.getElementById('game'));
    this.input = new Input(this.renderer.renderer.domElement);
    this.ui = new UI(document.getElementById('ui'));
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.has('debug');
    sfx.setMuted(this.ui.prefs.muted);
    this.ui.on({
      create: (me) => this.create(me),
      join: (code, me) => this.join(code, me),
      solo: (course, me) => this.solo(course, me),
      leave: () => this.leave(),
      toggleMute: () => this.toggleMute(),
    });
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
    document.getElementById('boot').remove();

    const holeParam = this.params.get('hole');
    if (holeParam) {
      const i = Math.max(0, Math.min(HOLES.length - 1, Number(holeParam) - 1));
      this.solo('hole:' + i, { name: this.ui.prefs.name || 'Tester', color: this.ui.prefs.color });
    } else {
      this.showMenu();
    }

    this.last = performance.now();
    this.fps = 0;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__app = this;
    if (this.debug) {
      import('./dev/sim.js').then((m) => { window.__sim = m.simulateShot; window.__hio = m.searchHIO; window.__holes = HOLES; });
    }
  }

  frame(dt) {
    if (this.client && this.client.course) {
      this.client.frame(dt);
    } else if (this.backdrop) {
      this.backdropFrame(dt);
    }
    this.renderer.render(dt);
  }

  // ---------- menu backdrop: a slowly orbiting random hole ----------
  showBackdrop() {
    this.hideBackdrop();
    const def = HOLES[Math.floor(Math.random() * HOLES.length)];
    const physics = new Physics();
    const course = buildCourse(def, physics, this.renderer.scene);
    this.renderer.applyTheme(def.sector, course);
    this.backdrop = { physics, course, t: 0 };
  }

  backdropFrame(dt) {
    const b = this.backdrop;
    b.t += dt;
    b.course.update(b.t, dt);
    b.physics.step();
    b.course.frame(b.t, dt);
    const c = b.course.center, R = Math.max(b.course.size.x, b.course.size.z) * 0.7 + 6;
    const cam = this.renderer.camera;
    cam.position.set(c.x + Math.cos(b.t * 0.08) * R, c.y + R * 0.55, c.z + Math.sin(b.t * 0.08) * R);
    cam.lookAt(c);
  }

  hideBackdrop() {
    if (!this.backdrop) return;
    this.backdrop.course.dispose();
    this.backdrop.physics.dispose();
    this.backdrop = null;
  }

  showMenu(error = '') {
    this.showBackdrop();
    this.ui.showMenu(error);
  }

  // ---------- sessions ----------
  startClient(link, me, opts) {
    this.hideBackdrop();
    this.client = new GameClient(this, link, me, { debug: this.debug, ...opts });
  }

  async create(me) {
    this.ui.showConnecting('Opening a room…');
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeCode();
      const room = new HostRoom(code);
      try {
        this.peer = await hostPeer(room, code);
        this.room = room;
        this.link = new LocalLink(room, 'host');
        this.startClient(this.link, me, { isHost: true });
        return;
      } catch (e) {
        room.dispose();
        if (e.type !== 'unavailable-id') return this.showMenu('Could not open a room: ' + (e.message || e.type));
      }
    }
    this.showMenu('Could not get a free room code, try again');
  }

  async join(code, me) {
    this.ui.showConnecting(`Joining room ${code}…`);
    try {
      this.link = await joinPeer(code);
      this.startClient(this.link, me, {});
    } catch (e) {
      this.showMenu(e.message);
    }
  }

  solo(course, me) {
    const room = new HostRoom('SOLO', { solo: true });
    room.settings.course = course;
    this.room = room;
    this.link = new LocalLink(room, 'solo');
    this.startClient(this.link, me, { isHost: true });
  }

  leave(reason = '') {
    this.client?.dispose();
    this.client = null;
    try { this.link?.close(); } catch { /* ignore */ }
    this.link = null;
    this.room?.dispose();
    this.room = null;
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
    if (this.params.has('hole')) history.replaceState(null, '', location.pathname + (this.debug ? '?debug=1' : ''));
    this.showMenu(reason);
  }

  toggleMute() {
    const m = !sfx.muted;
    sfx.setMuted(m);
    this.ui.prefs.muted = m;
    savePrefs(this.ui.prefs);
    this.ui.toast(m ? 'Sound off' : 'Sound on');
    const b = document.querySelector('[data-act="mute"]');
    if (b) b.textContent = m ? '🔇' : '🔊';
  }
}

new App().boot();
