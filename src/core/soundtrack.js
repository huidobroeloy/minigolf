import { sfx } from './audio.js';

// Your own soundtrack. Audio (or video) files you load in Settings are kept in this browser's
// IndexedDB, never uploaded anywhere and never part of the public repo. The host also streams
// its tracks to the friends in the room, in small chunks over the game connection.
// Anything without a track falls back to the procedural music.

export const SLOTS = [
  { key: 'intro', label: 'Intro', icon: '🎬', loop: false },
  { key: 'menu', label: 'Menu & lobby', icon: '🏠', loop: true },
  { key: 'levels', label: 'Levels', icon: '⛳', loop: true },
  { key: 'finale', label: 'Victory', icon: '🏆', loop: false },
  { key: 'xana', label: 'XANA wins', icon: '👁️', loop: false },
];

/** Which slot a music key uses (every sector style shares the "levels" slot). */
export function slotFor(key) {
  if (key === 'intro' || key === 'menu' || key === 'finale' || key === 'xana') return key;
  return 'levels';
}

const DB = 'lyokogolf-audio', STORE = 'tracks';
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbOp(mode, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

const CHUNK = 12000; // base64 characters per message (PeerJS's JSON channel caps a message near 16 KB)

class Soundtrack {
  constructor() {
    this.local = new Map(); // slot → { name, blob } (your files)
    this.remote = new Map(); // slot → { name, blob } (streamed from the host)
    this.incoming = new Map(); // slot → { parts[], got, total, name, mime }
    this.el = null;
    this.slot = null;
    this.listeners = new Set();
    this.ready = this.load();
  }

  async load() {
    try {
      const keys = await dbOp('readonly', (s) => s.getAllKeys());
      for (const k of keys || []) {
        const v = await dbOp('readonly', (s) => s.get(k));
        if (v?.blob) this.local.set(k, v);
      }
    } catch (e) { console.warn('[soundtrack] storage unavailable', e); }
    this.changed();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) { try { fn(); } catch { /* ignore */ } } }

  track(slot) { return this.local.get(slot) || this.remote.get(slot) || null; }
  has(slot) { return !!this.track(slot); }

  async set(slot, file) {
    const v = { name: file.name, blob: file };
    this.local.set(slot, v);
    try { await dbOp('readwrite', (s) => s.put(v, slot)); } catch (e) { console.warn('[soundtrack] could not save', e); }
    if (this.slot === slot) this.restart();
    this.changed();
  }

  async clear(slot) {
    this.local.delete(slot);
    try { await dbOp('readwrite', (s) => s.delete(slot)); } catch { /* ignore */ }
    if (this.slot === slot) this.stop();
    this.changed();
  }

  // ---------- playback (through the music bus, so the music slider and mutes apply) ----------
  play(slot, { loop } = {}) {
    const tr = this.track(slot);
    if (!tr) { this.stop(); return false; }
    if (this.slot === slot && this.el && this.blob === tr.blob) return true;
    this.stop();
    const ctx = sfx.ctx;
    if (!ctx) return false;
    const el = new Audio();
    el.src = URL.createObjectURL(tr.blob);
    el.loop = loop ?? SLOTS.find((s) => s.key === slot)?.loop ?? true;
    el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
    src.connect(this.gain).connect(this.out());
    el.play().catch(() => { /* waits for a click */ });
    this.el = el;
    this.slot = slot;
    this.blob = tr.blob;
    return true;
  }

  restart() { const s = this.slot; this.stop(false); if (s) this.play(s); }

  stop(fade = true) {
    const el = this.el, g = this.gain;
    this.el = null; this.slot = null; this.blob = null; this.gain = null;
    if (!el) return;
    if (g && fade && sfx.ctx) {
      const t = sfx.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      setTimeout(() => { el.pause(); URL.revokeObjectURL(el.src); try { g.disconnect(); } catch { /* gone */ } }, 800);
    } else { el.pause(); URL.revokeObjectURL(el.src); try { g?.disconnect(); } catch { /* gone */ } }
  }

  /** The music bus output shared with the procedural music (so volume/duck apply equally). */
  out() { return this.outNode || sfx.musicBus || sfx.master; }

  // ---------- sharing: host → friends ----------
  /** Encode every local track into chunk messages: [{ t:'track', slot, name, mime, seq, total, data }]. */
  async chunks() {
    const msgs = [];
    for (const [slot, tr] of this.local) {
      const b64 = await blobToBase64(tr.blob);
      const total = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < total; i++) msgs.push({ t: 'track', slot, name: tr.name, mime: tr.blob.type || 'audio/mpeg', seq: i, total, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    return msgs;
  }

  /** A friend receives a chunk; when a track is complete it becomes playable. */
  receive(m) {
    if (!SLOTS.some((s) => s.key === m.slot)) return;
    let inc = this.incoming.get(m.slot);
    if (!inc || inc.total !== m.total || inc.name !== m.name || (m.seq === 0 && inc.parts[0] !== undefined)) { // a new transfer
      inc = { parts: new Array(m.total), got: 0, total: m.total, name: m.name, mime: m.mime };
      this.incoming.set(m.slot, inc);
    }
    if (inc.parts[m.seq] === undefined) { inc.parts[m.seq] = m.data; inc.got++; if (inc.got % 25 === 0) this.changed(); }
    if (inc.got === inc.total) {
      this.incoming.delete(m.slot);
      const blob = base64ToBlob(inc.parts.join(''), inc.mime);
      this.remote.set(m.slot, { name: inc.name, blob, fromHost: true });
      if (this.slot === m.slot || (!this.slot && this.wantSlot === m.slot)) this.restart();
      this.changed();
    }
  }

  progress(slot) { const inc = this.incoming.get(slot); return inc ? inc.got / inc.total : null; }
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export const soundtrack = new Soundtrack();
