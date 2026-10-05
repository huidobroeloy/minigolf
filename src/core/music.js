import { sfx } from './audio.js';
import { soundtrack, slotFor } from './soundtrack.js';

// Procedural sector music: a tiny step sequencer (pad chords, arpeggio, bass, soft drums).
// Every sector gets its own scale, tempo and voices. No samples, nothing copyrighted.
// If you loaded your own track for a slot in Settings (see soundtrack.js), that plays instead.

const SCALES = {
  phrygianDom: [0, 1, 4, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

const STYLES = {
  menu:     { bpm: 84,  root: 57, scale: 'dorian',      prog: [0, 5, 3, 4], pad: 'triangle', arp: 'sine',     arpEvery: 2, bass: 'half',   drums: 'none',  bright: 1600 },
  desert:   { bpm: 92,  root: 50, scale: 'phrygianDom', prog: [0, 1, 0, 6], pad: 'sawtooth', arp: 'triangle', arpEvery: 2, bass: 'half',   drums: 'hand',  bright: 1400 },
  forest:   { bpm: 100, root: 55, scale: 'dorian',      prog: [0, 3, 4, 3], pad: 'triangle', arp: 'sine',     arpEvery: 2, bass: 'walk',   drums: 'soft',  bright: 1800 },
  ice:      { bpm: 80,  root: 60, scale: 'lydian',      prog: [0, 1, 4, 1], pad: 'sine',     arp: 'bell',     arpEvery: 1, bass: 'whole',  drums: 'none',  bright: 2600 },
  mountain: { bpm: 74,  root: 45, scale: 'minor',       prog: [0, 5, 6, 4], pad: 'sawtooth', arp: 'triangle', arpEvery: 4, bass: 'drone',  drums: 'boom',  bright: 1000 },
  sector5:  { bpm: 112, root: 57, scale: 'minor',       prog: [0, 5, 2, 6], pad: 'sawtooth', arp: 'square',   arpEvery: 1, bass: 'eighth', drums: 'synth', bright: 2200 },
  fortune:  { bpm: 118, root: 52, scale: 'phrygian',    prog: [0, 6, 5, 1], pad: 'square',   arp: 'sawtooth', arpEvery: 1, bass: 'eighth', drums: 'synth', bright: 2800 },
  volcano:  { bpm: 96,  root: 43, scale: 'phrygianDom', prog: [0, 1, 4, 1], pad: 'sawtooth', arp: 'square',   arpEvery: 2, bass: 'drone',  drums: 'boom',  bright: 1200 },
  sea:      { bpm: 70,  root: 50, scale: 'lydian',      prog: [0, 4, 5, 3], pad: 'sine',     arp: 'bell',     arpEvery: 2, bass: 'whole',  drums: 'none',  bright: 1500 },
  network:  { bpm: 124, root: 57, scale: 'dorian',      prog: [0, 3, 5, 4], pad: 'triangle', arp: 'square',   arpEvery: 1, bass: 'eighth', drums: 'synth', bright: 3200 },
  intro:    { bpm: 132, root: 52, scale: 'minor',       prog: [0, 5, 3, 6], pad: 'sawtooth', arp: 'square',   arpEvery: 1, bass: 'eighth', drums: 'synth', bright: 3400 },
  finale:   { bpm: 104, root: 55, scale: 'lydian',      prog: [0, 4, 5, 3], pad: 'triangle', arp: 'bell',     arpEvery: 1, bass: 'walk',   drums: 'soft',  bright: 2600 },
  core:     { bpm: 136, root: 45, scale: 'phrygian',    prog: [0, 1, 5, 6], pad: 'sawtooth', arp: 'square',   arpEvery: 1, bass: 'eighth', drums: 'synth', bright: 2000 },
  xana:     { bpm: 62,  root: 38, scale: 'phrygian',    prog: [0, 1, 0, 6], pad: 'sawtooth', arp: 'triangle', arpEvery: 4, bass: 'drone',  drums: 'boom',  bright: 700 },
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Music {
  constructor() {
    this.volume = 0.5;
    this.key = null;
    this.want = null;
    this.duckK = 1;
  }

  ensure() {
    const ctx = sfx.ctx;
    if (!ctx) return false;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.volume * 0.35;
      this.out.connect(sfx.musicBus || sfx.master);
      // your own tracks are mastered loud already: their own gain on the same bus
      this.fileOut = ctx.createGain();
      this.fileOut.gain.value = this.volume * 0.9;
      this.fileOut.connect(sfx.musicBus || sfx.master);
      soundtrack.outNode = this.fileOut;
      soundtrack.onChange(() => this.refresh());
    }
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v * 0.35 * this.duckK, sfx.ctx.currentTime, 0.1);
    if (this.fileOut) this.fileOut.gain.setTargetAtTime(v * 0.9 * this.duckK, sfx.ctx.currentTime, 0.1);
  }

  /** Re-pick what plays now (a track was loaded, cleared or arrived from the host). */
  refresh() {
    const want = this.want;
    if (!want) return;
    const slot = slotFor(want), tr = soundtrack.track(slot);
    if (tr ? soundtrack.slot === slot && soundtrack.blob === tr.blob : !!this.timer) return; // nothing changed
    if (this.timer) this.stop(true);
    this.key = null;
    this.play(want);
  }

  duck(on) {
    this.duckK = on ? 0.3 : 1;
    this.setVolume(this.volume);
  }

  /** Switch to a style (crossfades). Safe to call before audio is unlocked. */
  play(key) {
    this.want = key;
    if (!this.ensure()) return;
    const slot = slotFor(key);
    soundtrack.wantSlot = slot;
    if (soundtrack.has(slot)) {
      if (this.timer) this.stop(true);
      this.key = key;
      soundtrack.play(slot);
      return;
    }
    soundtrack.stop();
    if (this.key === key && this.timer) return;
    this.stop(true);
    const st = STYLES[key] || STYLES.menu;
    this.key = key;
    this.st = st;
    const ctx = sfx.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = st.bright;
    this.bus.connect(this.filter).connect(this.out);
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(fade = true) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const bus = this.bus;
    if (bus && sfx.ctx) {
      const t = sfx.ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + (fade ? 0.8 : 0.05));
      setTimeout(() => { try { bus.disconnect(); } catch { /* gone */ } }, 1200);
    }
    this.bus = null;
    this.key = null;
  }

  /** Lookahead scheduler: queue every 16th note that falls in the next 120 ms. */
  schedule() {
    const ctx = sfx.ctx;
    if (!ctx || !this.bus) return;
    const st = this.st;
    const sixteenth = 60 / st.bpm / 4;
    while (this.next < ctx.currentTime + 0.12) {
      this.note(this.step, this.next, sixteenth);
      this.next += sixteenth;
      this.step = (this.step + 1) % 64; // 4 bars
    }
  }

  degree(deg, octave = 0) {
    const sc = SCALES[this.st.scale];
    const i = ((deg % 7) + 7) % 7;
    return this.st.root + sc[i] + 12 * (Math.floor(deg / 7) + octave);
  }

  note(step, t, len) {
    const st = this.st;
    const bar = Math.floor(step / 16), s = step % 16;
    const chordRoot = st.prog[bar];
    const chord = [chordRoot, chordRoot + 2, chordRoot + 4];
    // pad: the chord, held for the bar
    if (s === 0) for (const d of chord) this.voice(st.pad === 'sine' ? 'sine' : st.pad, midi(this.degree(d)), t, len * 16, 0.045, 0.6, 0.8);
    // arpeggio
    if (s % st.arpEvery === 0) {
      const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
      const k = pattern[(s / st.arpEvery) % pattern.length];
      const d = k === 3 ? chord[0] + 7 : chord[k];
      if (st.arp === 'bell') this.bell(midi(this.degree(d, 1)), t, 0.05);
      else this.voice(st.arp, midi(this.degree(d, 1)), t, len * 1.6, 0.03, 0.005, 0.15);
    }
    // bass
    const b = midi(this.degree(chordRoot, -1));
    if (st.bass === 'eighth' && s % 2 === 0) this.voice('sawtooth', b, t, len * 1.5, 0.06, 0.005, 0.05);
    if (st.bass === 'half' && s % 8 === 0) this.voice('triangle', b, t, len * 7, 0.09, 0.01, 0.3);
    if (st.bass === 'walk' && s % 4 === 0) this.voice('triangle', midi(this.degree(chordRoot + [0, 2, 4, 2][s / 4], -1)), t, len * 3.5, 0.08, 0.01, 0.2);
    if ((st.bass === 'whole' || st.bass === 'drone') && s === 0) this.voice('sine', b, t, len * 16, 0.1, 0.4, 0.8);
    // drums
    const kick = () => this.kick(t);
    const hat = (v) => sfx.hiss({ dur: 0.04, vol: v, freq: 8000, type: 'highpass', delay: t - sfx.ctx.currentTime, out: this.bus });
    switch (st.drums) {
      case 'soft': if (s % 8 === 0) kick(); if (s % 4 === 2) hat(0.03); break;
      case 'hand': if (s === 0 || s === 6 || s === 10) this.tom(t, 160); if (s === 12) this.tom(t, 220); break;
      case 'boom': if (s === 0) this.kick(t, 0.25); break;
      case 'synth': if (s % 4 === 0) kick(); if (s % 8 === 4) sfx.hiss({ dur: 0.12, vol: 0.06, freq: 1800, delay: t - sfx.ctx.currentTime, out: this.bus }); if (s % 2 === 1) hat(0.025); break;
    }
  }

  voice(type, f, t, dur, vol, attack, release) {
    const ctx = sfx.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.005, attack));
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + release + 0.05);
  }

  bell(f, t, vol) {
    const ctx = sfx.ctx;
    const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    m.type = 'sine'; m.frequency.value = f * 3.5; mg.gain.value = f * 0.8;
    m.connect(mg).connect(o.frequency);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(this.bus);
    o.start(t); m.start(t); o.stop(t + 1.5); m.stop(t + 1.5);
  }

  kick(t, vol = 0.18) {
    const ctx = sfx.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.3);
  }

  tom(t, f) {
    const ctx = sfx.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.2);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.25);
  }
}

export const music = new Music();
