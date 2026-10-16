// Fallback relay for friends whose phones can't open a direct WebRTC link (carrier NAT on mobile data
// and no working TURN relay). The same game messages go through a free public MQTT broker over secure
// WebSockets instead. The host listens on every broker; a guest uses the first one that answers.
// Messages are JSON on public topics: harmless for a minigolf game, but don't send anything private.

const MQTT_URL = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.esm.js';
export const BROKERS = [
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' }, // port 443
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
];
const ROOT = 'lyokogolf-v1/';
const PING = 5000;     // guests say they're still here this often
const GONE = 20000;    // and the host drops a relayed guest it hasn't heard from for this long

let lib = null;
const loadMqtt = () => (lib ??= import(MQTT_URL).then((m) => m.default || m).catch((e) => { lib = null; throw e; }));
const rid = () => Math.random().toString(36).slice(2, 10);

/** Connects to one broker; rejects if it doesn't answer within `timeout` ms. */
async function connect(broker, timeout) {
  const mqtt = await loadMqtt();
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(broker.url, {
      username: broker.username, password: broker.password, clientId: 'lg-' + rid(),
      clean: true, keepalive: 30, connectTimeout: timeout, reconnectPeriod: 2000,
    });
    const t = setTimeout(() => { c.end(true); reject(new Error('relay timeout')); }, timeout);
    c.once('connect', () => { clearTimeout(t); resolve(c); });
  });
}

/** Host side: relayed guests join the room like any other client. Returns { dispose() }. */
export function hostRelay(room, code) {
  const clients = [];
  const seen = new Map(); // guest id → last time we heard from it
  let disposed = false;
  const base = ROOT + code.toUpperCase();
  for (const b of BROKERS) {
    connect(b, 10000).then((c) => {
      if (disposed) return c.end(true);
      clients.push(c);
      const sub = () => c.subscribe(base + '/h');
      sub();
      c.on('connect', sub); // after an automatic reconnect
      c.on('message', (_, buf) => {
        let w;
        try { w = JSON.parse(buf.toString()); } catch { return; }
        const id = typeof w?.f === 'string' && w.f.startsWith('r-') ? w.f.slice(0, 24) : null;
        if (!id) return;
        if (w.k === 'bye') { seen.delete(id); if (room.links.has(id)) room.removeClient(id); return; }
        seen.set(id, Date.now());
        if (!room.links.has(id)) {
          room.addClient(id, (msg) => { try { c.publish(base + '/g/' + id, JSON.stringify(msg)); } catch { /* offline */ } }, { relay: true });
        }
        if (w.k === 'hello') c.publish(base + '/g/' + id, JSON.stringify({ t: '_welcome' }));
        else if (w.k === 'm') room.handle(id, w.m);
      });
    }).catch(() => { /* this broker is down: the others still listen */ });
  }
  const watch = setInterval(() => {
    for (const [id, t] of seen) if (Date.now() - t > GONE) { seen.delete(id); if (room.links.has(id)) room.removeClient(id); }
  }, PING);
  return {
    dispose() {
      disposed = true;
      clearInterval(watch);
      for (const c of clients) c.end(true);
    },
  };
}

/** Guest side, at the start of a join: load the library and open the first broker in the background,
 * so a fallback to the relay doesn't start from scratch. */
let warm = null;
export function warmRelay() {
  warm = connect(BROKERS[0], 8000);
  warm.catch(() => { /* joinRelay tries the next broker */ });
}

/** Guest side: resolves to a link ({ id, send, onMessage, onClose, close, relay: true }) or rejects. */
export async function joinRelay(code, { signal } = {}) {
  const base = ROOT + code.toUpperCase();
  const id = 'r-' + rid();
  for (const b of BROKERS) {
    if (signal?.aborted) break;
    let c;
    const pre = b === BROKERS[0] ? warm : null;
    warm = null;
    try { c = await (pre || connect(b, 6000)); } catch { continue; }
    const link = await new Promise((resolve) => {
      let hello = null, done = false, l = null;
      const finish = (v) => { if (done) return; done = true; clearInterval(hello); clearTimeout(t); if (!v) clearInterval(l?.ping); resolve(v); };
      const t = setTimeout(() => finish(null), 6000); // no host on this broker
      signal?.addEventListener('abort', () => finish(null));
      const say = (k, m) => c.publish(base + '/h', JSON.stringify({ f: id, k, m }));
      c.subscribe(base + '/g/' + id, () => { say('hello'); hello = setInterval(() => say('hello'), 1000); });
      l = {
        id, relay: true,
        onMessage: () => {},
        onClose: () => {},
        send(msg) { if (c.connected) say('m', msg); },
        close() { clearInterval(l.ping); clearTimeout(l.lost); try { say('bye'); } catch { /* offline */ } setTimeout(() => c.end(true), 200); },
      };
      c.on('message', (_, buf) => {
        let msg;
        try { msg = JSON.parse(buf.toString()); } catch { return; }
        if (msg?.t === '_welcome') return finish(l);
        if (done) l.onMessage(msg);
      });
      // keep the host's watchdog happy, and give up if the broker stays unreachable
      l.ping = setInterval(() => { if (c.connected) say('ping'); }, PING);
      c.on('offline', () => { clearTimeout(l.lost); l.lost = setTimeout(() => l.onClose(), 15000); });
      c.on('connect', () => clearTimeout(l.lost));
    });
    if (link) return link;
    c.end(true);
  }
  throw new Error('relay unavailable');
}
