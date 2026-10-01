// Transports: an in-page link (solo / the host's own client) and PeerJS links for friends.
const PREFIX = 'lyokogolf-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

/** Host opens a PeerJS peer with a room code and pipes remote connections into the room. */
export function hostPeer(room, code) {
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(new Error('PeerJS failed to load (check your connection).'));
    const peer = new window.Peer(PREFIX + code, { debug: 1 });
    let opened = false;
    peer.on('open', () => { opened = true; resolve(peer); });
    peer.on('error', (err) => {
      console.warn('[host peer]', err.type, err);
      if (!opened) reject(err);
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        room.addClient(conn.peer, (msg) => { try { conn.send(msg); } catch (e) { /* closed */ } });
      });
      conn.on('data', (msg) => room.handle(conn.peer, msg));
      conn.on('close', () => room.removeClient(conn.peer));
      conn.on('error', () => room.removeClient(conn.peer));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  });
}

/** Friend joins a room by code. Resolves to a link once the data channel is open. */
export function joinPeer(code) {
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(new Error('PeerJS failed to load (check your connection).'));
    const peer = new window.Peer({ debug: 1 });
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Timed out connecting to room ' + code)); peer.destroy(); } }, 15000);
    peer.on('error', (err) => {
      console.warn('[client peer]', err.type, err);
      if (!done) {
        done = true; clearTimeout(timer);
        reject(new Error(err.type === 'peer-unavailable' ? `Room ${code} not found` : 'Connection error: ' + err.type));
        peer.destroy();
      }
    });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
      const link = {
        id: peer.id,
        onMessage: () => {},
        onClose: () => {},
        send(msg) { if (conn.open) conn.send(msg); },
        close() { conn.close(); peer.destroy(); },
      };
      conn.on('open', () => { done = true; clearTimeout(timer); resolve(link); });
      conn.on('data', (msg) => link.onMessage(msg));
      conn.on('close', () => link.onClose());
      conn.on('error', () => link.onClose());
    });
  });
}
