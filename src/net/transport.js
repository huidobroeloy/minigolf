// Transports: an in-page link (solo / the host's own client), PeerJS links for friends, and the
// public relay (relay.js) for friends whose phones can't open a direct link.
import { ICE_SERVERS } from './ice.js';
import { hostRelay, joinRelay, warmRelay } from './relay.js';

const PREFIX = 'lyokogolf-v1-';
const PEER_OPTS = { debug: 1, config: { iceServers: ICE_SERVERS } };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_TIMEOUT = 30000; // the whole join, relay included
const RELAY_AFTER = 6000;   // no direct link by then: try the relay as well

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/** Client-side link interface: { id, send(msg), onMessage, onClose, close() } */
export class LocalLink {
  constructor(room, id = 'local') {
    this.id = id;
    this.room = room;
    this.onMessage = () => {};
    this.onClose = () => {};
    room.addClient(id, (msg) => queueMicrotask(() => this.onMessage(msg)));
  }
  send(msg) { queueMicrotask(() => this.room.handle(this.id, msg)); }
  close() { this.room.removeClient(this.id); }
}

/**
 * Host opens a PeerJS peer with the room code and pipes remote connections into the room, plus the
 * relay listener. On a phone the tab is suspended whenever the host switches apps (to send the code),
 * which drops the link to the PeerJS server; the room then re-registers the same code as soon as the
 * page is back (or the network returns), with backoff. Friends already connected keep their links.
 * Resolves to { destroy(), open } once the code is registered; onStatus('open' | 'reconnecting').
 */
export function hostPeer(room, code, onStatus = () => {}) {
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(new Error('PeerJS failed to load (check your connection).'));
    const ctl = { open: false, destroyed: false, peer: null, old: [], relay: null };
    let first = true, retry = 0, timer = null, check = null;
    const status = (open) => { if (ctl.open !== open || first) { ctl.open = open; onStatus(open ? 'open' : 'reconnecting'); } };

    const make = () => {
      const peer = new window.Peer(PREFIX + code, PEER_OPTS);
      ctl.peer = peer;
      peer.on('open', () => {
        retry = 0; clearTimeout(check);
        if (first) { first = false; ctl.open = true; ctl.relay = hostRelay(room, code); resolve(ctl); onStatus('open'); } else status(true);
      });
      peer.on('error', (err) => {
        console.warn('[host peer]', err.type, err);
        if (first) { first = false; peer.destroy(); return reject(err); }
        if (peer === ctl.peer && ['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id', 'disconnected'].includes(err.type)) { status(false); schedule(); }
      });
      peer.on('disconnected', () => { if (peer === ctl.peer && !ctl.destroyed) { status(false); schedule(); } });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          room.addClient(conn.peer, (msg) => { try { conn.send(msg); } catch (e) { /* closed */ } });
        });
        conn.on('data', (msg) => room.handle(conn.peer, msg));
        conn.on('close', () => room.removeClient(conn.peer));
        conn.on('error', () => room.removeClient(conn.peer));
      });
    };

    /** Back online: reconnect the same peer; if it isn't registered again within 5 s, start a new one
     * with the same code (the old peer stays alive for the friends it's already linked to). */
    const revive = () => {
      timer = null;
      if (ctl.destroyed || ctl.open) return;
      const p = ctl.peer;
      if (p && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch { /* replaced below */ } }
      clearTimeout(check);
      check = setTimeout(() => {
        if (ctl.destroyed || ctl.open || ctl.peer !== p) return;
        if (p) { ctl.old.push(p); try { p.disconnect(); } catch { /* already gone */ } }
        make();
        schedule();
      }, 5000);
    };
    const schedule = (now = false) => {
      if (ctl.destroyed || ctl.open) return;
      if (now) { clearTimeout(timer); timer = null; retry = 0; }
      if (timer) return;
      timer = setTimeout(revive, now ? 0 : Math.min(15000, 1000 * 2 ** retry++));
    };
    const wake = () => {
      if (document.visibilityState === 'hidden' || ctl.destroyed) return;
      if (ctl.peer?.disconnected || ctl.peer?.destroyed) status(false);
      if (!ctl.open) schedule(true);
    };
    addEventListener('visibilitychange', wake);
    addEventListener('online', wake);
    addEventListener('pageshow', wake);

    ctl.destroy = () => {
      ctl.destroyed = true;
      clearTimeout(timer); clearTimeout(check);
      removeEventListener('visibilitychange', wake);
      removeEventListener('online', wake);
      removeEventListener('pageshow', wake);
      ctl.relay?.dispose();
      for (const p of [ctl.peer, ...ctl.old]) { try { p?.destroy(); } catch { /* ignore */ } }
    };
    make();
  });
}

/** One direct (PeerJS) join attempt. Returns { promise, cancel() }; the promise resolves to a link. */
function peerAttempt(code, onStatus) {
  let peer = null, cancelled = false;
  const promise = new Promise((resolve, reject) => {
    if (!window.Peer) return reject(new Error('PeerJS failed to load (check your connection).'));
    peer = new window.Peer(PEER_OPTS);
    peer.on('error', (err) => {
      console.warn('[client peer]', err.type, err);
      reject(Object.assign(new Error(err.type), { type: err.type }));
    });
    peer.on('open', () => {
      if (cancelled) return;
      onStatus('Connecting to the host…');
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      const link = {
        id: peer.id,
        onMessage: () => {},
        onClose: () => {},
        send(msg) { if (conn.open) conn.send(msg); },
        close() { conn.close(); peer.destroy(); },
      };
      conn.on('open', () => resolve(link));
      conn.on('data', (msg) => link.onMessage(msg));
      conn.on('close', () => link.onClose());
      conn.on('error', () => link.onClose());
      // the direct link can't be made (no relay between the two networks): don't wait for the timer
      conn.on('iceStateChanged', (s) => { if (s === 'failed') reject(Object.assign(new Error('ice-failed'), { type: 'ice-failed' })); });
    });
  });
  return { promise, cancel() { cancelled = true; try { peer?.destroy(); } catch { /* ignore */ } } };
}

/**
 * Friend joins a room by code: the direct link first; if it isn't up after 6 s (or can't be made),
 * the public relay as well, and whichever opens first wins. A room that isn't found is retried once
 * after 3 s (the host may be re-registering after switching apps). onStatus(text) narrates progress.
 */
export function joinPeer(code, onStatus = () => {}) {
  code = code.toUpperCase();
  return new Promise((resolve, reject) => {
    let done = false, notFound = 0, direct = null, relayTried = false, relayLive = false, directLive = true;
    const abort = new AbortController();
    const finish = (err, link) => {
      if (done) { if (link) link.close(); return; }
      done = true;
      clearTimeout(overall); clearTimeout(relayTimer);
      abort.abort();
      if (err) { direct?.cancel(); reject(err); } else { if (link.relay) direct?.cancel(); resolve(link); }
    };
    const fail = () => {
      if (directLive || relayLive) return;
      finish(new Error(notFound
        ? `Room ${code} not found. Check the code, and ask the host to keep the game open on screen.`
        : `Couldn't reach room ${code}. Try again, or switch one phone to Wi-Fi.`));
    };
    const tryRelay = () => {
      if (relayTried || done) return;
      relayTried = true; relayLive = true;
      onStatus('Direct link is slow, trying the relay…');
      joinRelay(code, { signal: abort.signal })
        .then((link) => finish(null, link))
        .catch(() => { relayLive = false; fail(); });
    };
    const tryDirect = () => {
      directLive = true;
      direct = peerAttempt(code, onStatus);
      const mine = direct;
      direct.promise.then((link) => finish(null, link)).catch((e) => {
        directLive = false;
        mine.cancel();
        if (done) return;
        if (e.type === 'peer-unavailable') {
          notFound++;
          if (notFound === 1) { onStatus(`Looking for room ${code}…`); return setTimeout(() => !done && tryDirect(), 3000); }
        }
        tryRelay();
        fail();
      });
    };
    onStatus('Reaching the server…');
    warmRelay();
    const relayTimer = setTimeout(tryRelay, RELAY_AFTER);
    const overall = setTimeout(() => { directLive = relayLive = false; fail(); }, JOIN_TIMEOUT);
    tryDirect();
  });
}
