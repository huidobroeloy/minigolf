import * as THREE from 'three';
import { initPhysics, Physics } from './physics/world.js';
import { Renderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { UI, savePrefs } from './ui/ui.js';
import { sfx } from './core/audio.js';
import { music } from './core/music.js';
import { soundtrack } from './core/soundtrack.js';
import { Intro } from './game/intro.js';
import { stats } from './game/stats.js';
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
    let quality = 'high';
    try { quality = JSON.parse(localStorage.getItem('lyokogolf.prefs') || '{}').quality || 'high'; } catch { /* storage blocked */ }
    this.renderer = new Renderer(document.getElementById('game'), quality);
    this.input = new Input(this.renderer.renderer.domElement);
    this.ui = new UI(document.getElementById('ui'));
    this.params = new URLSearchParams(location.search);
    this.token = this.loadToken();
    this.debug = this.params.has('debug');
    sfx.setMuted(this.ui.prefs.muted);
    sfx.setSfxVolume(this.ui.prefs.sfx ?? 0.6);
    sfx.setMusicMuted(!!this.ui.prefs.musicMuted);
    music.volume = this.ui.prefs.music ?? 0.5;
    sfx.onUnlock = () => { if (music.want) music.play(music.want); };
    this.ui.on({
      create: (me) => this.create(me),
      join: (code, me) => this.join(code, me),
      solo: (course, me) => this.solo(course, me),
      leave: () => this.leave(),
      toggleMute: () => this.toggleMute(),
      musicVol: (v) => { music.setVolume(v); this.ui.prefs.music = v; savePrefs(this.ui.prefs); },
      sfxVol: (v) => { sfx.setSfxVolume(v); this.ui.prefs.sfx = v; savePrefs(this.ui.prefs); sfx.play('beep'); },
      muteMusic: (m) => { sfx.setMusicMuted(m); this.ui.prefs.musicMuted = m; savePrefs(this.ui.prefs); },
      quality: (q) => { this.renderer.setQuality(q); this.ui.prefs.quality = q; savePrefs(this.ui.prefs); },
    });
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
    stats.onUnlock = (a) => { this.ui.bigToast(`${a.icon} ACHIEVEMENT`, `${a.name}${a.trail ? ' · new ball trail unlocked!' : ''}`, 'good'); sfx.play('hio'); };
    // the host shares its own soundtrack with the room
    soundtrack.onChange(() => { clearTimeout(this.shareT); this.shareT = setTimeout(() => this.shareTracks(), 400); });

    const holeParam = this.params.get('hole');
    const session = this.loadSession();
    if (!holeParam && session && session.code === (this.params.get('room') || '').toUpperCase()) {
      // the page was reloaded while in a room: hop straight back in
      this.join(session.code, { name: this.ui.prefs.name || 'Player', color: this.ui.prefs.color });
    } else if (holeParam) {
      const i = Math.max(0, Math.min(HOLES.length - 1, Number(holeParam) - 1));
      this.solo('hole:' + i, { name: this.ui.prefs.name || 'Tester', color: this.ui.prefs.color });
    } else {
      this.clickToStart();
    }
    if (holeParam || session) document.getElementById('boot')?.remove();

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
      import('./dev/sim.js').then((m) => { window.__sim = m.simulateShot; window.__hio = m.searchHIO; window.__hioAll = m.searchAllHIO; window.__rampTest = m.rampTest; window.__probeWarp = m.probeWarp; window.__tuneWarp = m.tuneWarp; window.__warpEntries = m.warpEntries; window.__cupWalls = m.cupWalls; window.__cupTest = m.cupTest; window.__holes = HOLES; });
    }
  }

  /** The boot screen waits for a click (that also unlocks audio), then the intro or the menu. */
  clickToStart() {
    const boot = document.getElementById('boot');
    boot.classList.add('ready');
    boot.querySelector('.boot-msg').textContent = 'CLICK TO START';
    const eye = document.createElement('div');
    eye.className = 'boot-eye';
    boot.prepend(eye);
    const go = () => {
      removeEventListener('keydown', go);
      boot.removeEventListener('pointerdown', go);
      sfx.unlock();
      boot.classList.add('out');
      setTimeout(() => boot.remove(), 400);
      this.showMenu();
    };
    boot.addEventListener('pointerdown', go);
    addEventListener('keydown', go);
  }

  /** The match intro (see Intro): the client starts it on matchStart and ends it on hole 1. */
  startIntro(opts) {
    this.endIntro();
    this.intro = new Intro(this, { ...opts, onDone: () => { this.intro = null; } });
  }

  endIntro() {
    if (!this.intro) return;
    const it = this.intro;
    this.intro = null;
    it.finish();
  }

  async shareTracks() {
    if (!this.room || this.room.solo) return;
    await soundtrack.ready;
    this.room?.setTracks(await soundtrack.chunks());
  }

  frame(dt) {
    if (this.intro) {
      this.intro.frame(dt);
    } else if (this.client?.finale) {
      this.client.finale.frame(dt);
    } else if (this.client && this.client.course) {
      this.client.frame(dt);
    } else if (this.backdrop) {
      this.backdropFrame(dt);
    }
    this.renderer.render(dt);
  }

  // ---------- menu backdrop: a slowly orbiting random hole ----------
  showBackdrop(pool = HOLES) {
    if (this.backdrop) return;
    const def = pool[Math.floor(Math.random() * pool.length)];
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
    music.play('menu');
    this.ui.showMenu(error);
  }

  // ---------- sessions ----------
  startClient(link, me, opts) {
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
        this.shareTracks();
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
      this.joined = { code, me };
      this.saveSession({ code });
      history.replaceState(null, '', `${location.pathname}?room=${code}${this.debug ? '&debug=1' : ''}`);
      this.startClient(this.link, me, {});
    } catch (e) {
      this.clearSession();
      this.showMenu(e.message);
    }
  }

  /** A friend's connection dropped: try to get back into the same room a few times. */
  async onDisconnect() {
    if (this.room || !this.joined) return this.leave('Connection to the host was lost');
    if (this.reconnecting) return;
    this.reconnecting = true;
    const { code, me } = this.joined;
    this.client?.dispose();
    this.client = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      this.ui.showConnecting(`Connection lost — reconnecting to ${code} (${attempt}/3)…`);
      try {
        this.link = await joinPeer(code);
        this.reconnecting = false;
        this.startClient(this.link, me, {});
        return;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    this.reconnecting = false;
    this.leave('Could not reconnect to the host');
  }

  loadToken() {
    try {
      let t = sessionStorage.getItem('lyokogolf.token');
      if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('lyokogolf.token', t); }
      return t;
    } catch { return Math.random().toString(36).slice(2); }
  }

  loadSession() { try { return JSON.parse(sessionStorage.getItem('lyokogolf.session') || 'null'); } catch { return null; } }
  saveSession(s) { try { sessionStorage.setItem('lyokogolf.session', JSON.stringify(s)); } catch { /* ignore */ } }
  clearSession() { try { sessionStorage.removeItem('lyokogolf.session'); } catch { /* ignore */ } }

  solo(course, me) {
    const room = new HostRoom('SOLO', { solo: true });
    room.settings.course = course;
    this.room = room;
    this.link = new LocalLink(room, 'solo');
    this.startClient(this.link, me, { isHost: true });
  }

  leave(reason = '') {
    this.joined = null;
    this.clearSession();
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
