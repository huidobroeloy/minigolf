// Tiny WebAudio synth: every sound effect is generated, no files needed.
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxVolume = 0.6;   // sound effects
    this.muted = false;     // everything off
    this.musicMuted = false;
    this.loops = new Map();
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // master → speakers; effects and music each get their own bus so they have separate volumes
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicMuted ? 0 : 1;
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.onUnlock?.();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxBus) this.sfxBus.gain.value = v;
  }

  setMusicMuted(m) {
    this.musicMuted = m;
    if (this.musicBus) this.musicBus.gain.value = m ? 0 : 1;
  }

  tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.15, vol = 0.3, delay = 0, attack = 0.005 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss({ dur = 0.2, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, f1 = null, out = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name, k = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'putt':
        this.tone({ type: 'triangle', f0: 900, f1: 300, dur: 0.08, vol: 0.25 + 0.3 * k });
        this.hiss({ dur: 0.05, vol: 0.2 * k, freq: 3000 });
        break;
      case 'wall':
        this.tone({ type: 'square', f0: 260 + Math.random() * 60, f1: 140, dur: 0.06, vol: Math.min(0.25, 0.04 * k) });
        break;
      case 'bumper':
        this.tone({ type: 'sine', f0: 300, f1: 900, dur: 0.18, vol: 0.3 });
        this.tone({ type: 'square', f0: 600, f1: 1200, dur: 0.1, vol: 0.08 });
        break;
      case 'cup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.22, delay: i * 0.08 }));
        this.tone({ type: 'sine', f0: 200, f1: 80, dur: 0.25, vol: 0.4 });
        break;
      case 'hio':
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.25, vol: 0.12, delay: i * 0.07 }));
        break;
      case 'splash': // into the Digital Sea
        this.hiss({ dur: 0.6, vol: 0.35, freq: 800, f1: 200, type: 'lowpass' });
        this.tone({ type: 'sine', f0: 600, f1: 120, dur: 0.5, vol: 0.2 });
        break;
      case 'pickup':
        this.tone({ type: 'sine', f0: 880, f1: 1760, dur: 0.15, vol: 0.2 });
        this.tone({ type: 'sine', f0: 1320, f1: 2640, dur: 0.15, vol: 0.12, delay: 0.06 });
        break;
      case 'discard':
        this.tone({ type: 'sawtooth', f0: 300, f1: 120, dur: 0.2, vol: 0.12 });
        break;
      case 'use':
        this.hiss({ dur: 0.35, vol: 0.25, freq: 600, f1: 3000, q: 2 });
        this.tone({ type: 'sine', f0: 400, f1: 1200, dur: 0.25, vol: 0.15 });
        break;
      case 'debuff':
        this.tone({ type: 'sawtooth', f0: 500, f1: 200, dur: 0.35, vol: 0.12 });
        this.tone({ type: 'square', f0: 250, f1: 100, dur: 0.35, vol: 0.06, delay: 0.05 });
        break;
      case 'beep':
        this.tone({ type: 'square', f0: 880, dur: 0.08, vol: 0.08 });
        break;
      case 'buzzer':
        this.tone({ type: 'sawtooth', f0: 120, dur: 0.6, vol: 0.2 });
        break;
      case 'stick':
        this.hiss({ dur: 0.15, vol: 0.25, freq: 400, type: 'lowpass' });
        break;
      case 'laser':
        this.tone({ type: 'sawtooth', f0: 1800, f1: 200, dur: 0.18, vol: 0.08 });
        break;
      case 'cluck':
        for (let i = 0; i < 3; i++) this.tone({ type: 'square', f0: 700 + Math.random() * 300, f1: 400, dur: 0.07, vol: 0.12, delay: i * 0.09 });
        break;
      case 'roulette':
        this.tone({ type: 'square', f0: 1200, dur: 0.03, vol: 0.06 });
        break;
      case 'jackpot':
        [784, 659, 523, 392].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.18, vol: 0.12, delay: i * 0.1 }));
        break;
      case 'whoosh':
        this.hiss({ dur: 0.5, vol: 0.3, freq: 300, f1: 2000, q: 0.7 });
        break;
      case 'teleport':
        this.tone({ type: 'sine', f0: 200, f1: 2000, dur: 0.3, vol: 0.15 });
        break;
      case 'rumble':
        this.hiss({ dur: 1.0, vol: 0.4, freq: 120, type: 'lowpass' });
        break;
      case 'heart':
        this.tone({ type: 'sine', f0: 660, f1: 330, dur: 0.3, vol: 0.12 });
        break;
      case 'burp':
        this.tone({ type: 'sawtooth', f0: 95 + Math.random() * 30, f1: 60, dur: 0.45, vol: 0.18, attack: 0.03 });
        this.hiss({ dur: 0.35, vol: 0.12, freq: 250, type: 'lowpass' });
        break;
      case 'ad':
        [392, 523, 659, 523].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.12, delay: i * 0.18 }));
        break;
    }
  }
}

export const sfx = new Sfx();
