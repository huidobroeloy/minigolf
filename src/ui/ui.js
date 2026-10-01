import { POWERUPS, POWERUP_IDS } from '../powerups/registry.js';
import { COLORS } from '../net/room.js';
import { HOLES, SECTORS } from '../holes/index.js';
import { runAd } from './fakeAd.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtTime = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const JOKES = [
  'Jérémie reminds you: a Return to the Past does not undo strokes.',
  'XANA has possessed the Megatank. Again.',
  'Odd ate the last pickup. Probably.',
  'Fun fact: falling into the Digital Sea is only +1 here. In the show it was… worse.',
  'Ulrich insists the wall moved.',
  'Montapollos: now 30% more chicken.',
  'Yumi did not need the Steady Aim. Yumi is always steady.',
  'Jim would rather not talk about that last hole.',
  'The Scyphozoa just wants a hug. And your ball.',
  'Aelita says: slow is smooth, smooth is fast.',
  'Principal Delmas has noticed nothing.',
  'Kankrelats: 0 brain cells, 100% commitment.',
  'Fortune Falls takes all major currencies, mostly strokes.',
];

export function scoreName(strokes, par) {
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  return { '-4': 'CONDOR!', '-3': 'ALBATROSS!', '-2': 'EAGLE!', '-1': 'BIRDIE!', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY', 3: 'TRIPLE BOGEY' }[d] ?? (d < 0 ? 'UNBELIEVABLE!' : `+${d}`);
}

export class UI {
  constructor(root) {
    this.root = root;
    this.h = {}; // handlers
    this.screen = null;
    this.prefs = loadPrefs();
    root.innerHTML = `
      <div id="screen"></div>
      <div id="hud" class="hidden">
        <div class="hud-top">
          <div class="hud-hole"><div class="hole-no"></div><div class="hole-name"></div><div class="hole-par"></div></div>
          <div class="hud-timer"><div class="timer">2:00</div><div class="timer-bar"><i></i></div></div>
          <div class="hud-strokes"><div class="lbl">STROKES</div><div class="val">0</div></div>
        </div>
        <div class="hud-players"></div>
        <div class="hud-feed"></div>
        <div class="hud-status"></div>
        <div class="hud-inventory"></div>
        <div class="hud-power hidden"><div class="power-fill"></div><div class="power-lbl">POWER</div></div>
        <div class="hud-hint"></div>
        <div class="hud-buttons">
          <button class="icon-btn" data-act="cam" title="Overhead view (C)">🗺️</button>
          <button class="icon-btn" data-act="spec" title="Spectate next player (Tab)">👁️</button>
          <button class="icon-btn" data-act="help" title="Help (H)">❔</button>
          <button class="icon-btn" data-act="mute" title="Mute (M)">🔊</button>
          <button class="icon-btn host-only hidden" data-act="skip" title="Host: end this hole now">⏭️</button>
          <button class="icon-btn" data-act="leave" title="Leave game">🚪</button>
        </div>
      </div>
      <div id="toasts"></div>
      <div id="overlay"></div>
      <div id="aelita" class="hidden"><span>🌸 A E L I T A · slow motion</span></div>
    `;
    this.$ = (s) => root.querySelector(s);
    this.$('.hud-buttons').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'cam') this.h.toggleCam?.();
      if (a === 'spec') this.h.spectate?.();
      if (a === 'skip' && confirm('End this hole for everyone now?')) this.h.skip?.();
      if (a === 'leave' && confirm('Leave the game?')) this.h.leave?.();
      if (a === 'help') this.toggleHelp();
      if (a === 'mute') this.h.toggleMute?.();
    });
    this.$('.hud-inventory').addEventListener('click', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot || slot.classList.contains('empty')) return;
      if (e.target.closest('.discard')) this.h.discard?.(Number(slot.dataset.i));
      else this.h.use?.(Number(slot.dataset.i));
    });
  }

  on(handlers) { Object.assign(this.h, handlers); }

  // ---------- screens ----------
  setScreen(html) {
    const s = this.$('#screen');
    s.innerHTML = html;
    s.classList.toggle('hidden', !html);
    return s;
  }

  showMenu(error = '') {
    this.hideHud();
    const p = this.prefs;
    const params = new URLSearchParams(location.search);
    const roomFromUrl = (params.get('room') || '').toUpperCase();
    const s = this.setScreen(`
      <div class="panel menu">
        <div class="logo">LYOKO<span>MINIGOLF</span></div>
        <div class="tagline">18 holes · 6 sectors · way too many power-ups</div>
        ${error ? `<div class="error">${esc(error)}</div>` : ''}
        <label>Your name</label>
        <input id="name" maxlength="16" value="${esc(p.name)}" placeholder="Ulrich" />
        <label>Ball colour</label>
        <div class="swatches">${COLORS.map((c) => `<button class="swatch ${c === p.color ? 'sel' : ''}" data-c="${c}" style="--c:${c}"></button>`).join('')}</div>
        <div class="row">
          <button class="btn primary" id="create">Create room</button>
        </div>
        <div class="row join">
          <input id="code" maxlength="5" placeholder="CODE" value="${esc(roomFromUrl)}" />
          <button class="btn" id="join">Join</button>
        </div>
        <div class="row solo">
          <select id="soloCourse">
            <option value="all">Solo · full 18</option>
            ${SECTORS.map((sc) => `<option value="${sc.key}">Solo · ${esc(sc.name)}</option>`).join('')}
            ${HOLES.map((hh, i) => `<option value="hole:${i}">Hole ${i + 1} · ${esc(hh.name)}</option>`).join('')}
          </select>
          <button class="btn" id="solo">Practice</button>
        </div>
        <div class="small">Drag down from anywhere to set power, sideways to aim, release to putt. Press H in game for all controls.</div>
      </div>`);
    s.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
      s.querySelectorAll('.swatch').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      this.prefs.color = b.dataset.c;
    }));
    const getMe = () => {
      this.prefs.name = s.querySelector('#name').value.trim() || 'Player';
      savePrefs(this.prefs);
      return { name: this.prefs.name, color: this.prefs.color };
    };
    s.querySelector('#create').onclick = () => this.h.create?.(getMe());
    s.querySelector('#join').onclick = () => {
      const code = s.querySelector('#code').value.trim().toUpperCase();
      if (code.length < 4) return this.showMenu('Enter the 5-letter room code');
      this.h.join?.(code, getMe());
    };
    s.querySelector('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') s.querySelector('#join').click(); });
    s.querySelector('#solo').onclick = () => this.h.solo?.(s.querySelector('#soloCourse').value, getMe());
  }

  showConnecting(text) {
    this.setScreen(`<div class="panel menu"><div class="logo small">LYOKO<span>MINIGOLF</span></div><div class="spinner"></div><div class="tagline">${esc(text)}</div>
      <button class="btn" id="cancel">Cancel</button></div>`).querySelector('#cancel').onclick = () => this.h.leave?.();
  }

  showLobby(lobby, myId) {
    this.hideHud();
    const me = lobby.players.find((p) => p.id === myId);
    const isHost = !!me?.host;
    const st = lobby.settings;
    const url = `${location.origin}${location.pathname}?room=${lobby.code}`;
    const courseOpts = [
      ['all', 'All 18 holes'], ['front', 'Front 9 (Desert · Forest · Ice)'], ['back', 'Back 9 (Mountain · Sector 5 · Fortune Falls)'], ['random9', 'Random 9'],
      ...SECTORS.map((sc) => [sc.key, sc.name + ' (3 holes)']),
    ];
    const s = this.setScreen(`
      <div class="panel lobby">
        <div class="logo small">LYOKO<span>MINIGOLF</span></div>
        <div class="code-box">
          <div class="lbl">ROOM CODE</div>
          <div class="code">${esc(lobby.code)}</div>
          <button class="btn tiny" id="copy">Copy invite link</button>
        </div>
        <div class="players-list">
          ${lobby.players.map((p) => `<div class="pl"><i style="background:${p.color}"></i>${esc(p.name)}${p.host ? ' <b>HOST</b>' : ''}${p.id === myId ? ' <em>(you)</em>' : ''}</div>`).join('')}
          <div class="small">${lobby.players.length}/8 players</div>
        </div>
        <div class="settings ${isHost ? '' : 'readonly'}">
          <label>Course</label>
          <select id="course" ${isHost ? '' : 'disabled'}>${courseOpts.map(([v, n]) => `<option value="${v}" ${st.course === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
          <label>Time limit</label>
          <select id="timeMul" ${isHost ? '' : 'disabled'}>${[[0.75, 'Short (×0.75)'], [1, 'Normal'], [1.5, 'Relaxed (×1.5)'], [2, 'Chill (×2)']].map(([v, n]) => `<option value="${v}" ${Number(st.timeMul) === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label class="check"><input type="checkbox" id="powerups" ${st.powerups ? 'checked' : ''} ${isHost ? '' : 'disabled'} /> Power-ups</label>
        </div>
        <div class="row">
          ${isHost ? '<button class="btn primary" id="start">Start game</button>' : '<div class="tagline">Waiting for the host to start…</div>'}
          <button class="btn" id="leave">Leave</button>
        </div>
      </div>`);
    s.querySelector('#copy').onclick = () => { navigator.clipboard?.writeText(url); this.toast('Invite link copied'); };
    s.querySelector('#leave').onclick = () => this.h.leave?.();
    if (isHost) {
      const send = () => this.h.settings?.({
        course: s.querySelector('#course').value,
        timeMul: Number(s.querySelector('#timeMul').value),
        powerups: s.querySelector('#powerups').checked,
      });
      s.querySelectorAll('select, input').forEach((i) => i.addEventListener('change', send));
      s.querySelector('#start').onclick = () => this.h.start?.();
    }
  }

  // ---------- HUD ----------
  showHud(info) {
    this.setScreen('');
    this.$('#hud').classList.remove('hidden');
    this.$('.hole-no').textContent = `HOLE ${info.holeNo + 1}/${info.total}`;
    this.$('.hole-name').textContent = info.name;
    this.$('.hole-par').textContent = `${info.sectorName} · PAR ${info.par}`;
    this.$('.hud-feed').innerHTML = '';
    this.setHint('');
  }

  setHostControls(isHost) {
    this.$('[data-act="skip"]').classList.toggle('hidden', !isHost);
  }

  hideHud() { this.$('#hud').classList.add('hidden'); this.setAelita(false); this.closeOverlay(); }

  setTimer(msLeft, msTotal) {
    const t = this.$('.timer');
    t.textContent = fmtTime(msLeft);
    t.classList.toggle('urgent', msLeft < 15000);
    this.$('.timer-bar i').style.width = `${Math.max(0, Math.min(100, (msLeft / msTotal) * 100))}%`;
  }

  setStrokes(n, par) {
    const v = this.$('.hud-strokes .val');
    v.textContent = n;
    v.className = 'val ' + (n > par ? 'over' : '');
  }

  renderPlayers(list, myId) {
    this.$('.hud-players').innerHTML = list.map((p) => `
      <div class="hp ${p.holed ? 'holed' : ''} ${p.connected === false ? 'gone' : ''}">
        <i style="background:${p.color}"></i><span class="n">${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span>
        <span class="s">${p.holed ? '⛳ ' + p.strokes : p.strokes}</span><span class="tot">${p.total}</span>
      </div>`).join('');
  }

  renderInventory(inv) {
    const slots = [0, 1, 2].map((i) => {
      const id = inv[i];
      if (!id) return `<div class="slot empty" data-i="${i}"><kbd>${i + 1}</kbd></div>`;
      const d = POWERUPS[id];
      return `<div class="slot" data-i="${i}" title="${esc(d.name)}: ${esc(d.desc)}">
        <kbd>${i + 1}</kbd><div class="ic">${d.icon}</div><div class="nm">${esc(d.name)}</div><button class="discard" title="Discard (Shift+${i + 1})">✕</button></div>`;
    });
    this.$('.hud-inventory').innerHTML = slots.join('');
  }

  flashSlot(i) {
    const s = this.$(`.hud-inventory .slot[data-i="${i}"]`);
    if (!s) return;
    s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
  }

  setStatus(icons) {
    this.$('.hud-status').innerHTML = icons.length ? `<span class="lbl">NEXT SHOT</span>${icons.map((i) => `<span>${i}</span>`).join('')}` : '';
  }

  setPower(p) {
    const box = this.$('.hud-power');
    if (p === null) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const f = box.querySelector('.power-fill');
    f.style.height = `${Math.round(p * 100)}%`;
    f.style.background = `hsl(${120 - p * 120}, 90%, 50%)`;
  }

  setHint(text) { this.$('.hud-hint').innerHTML = text; }

  setAelita(on) { this.$('#aelita').classList.toggle('hidden', !on); }

  feed(text) {
    const f = this.$('.hud-feed');
    const item = el(`<div class="fi">${esc(text)}</div>`);
    f.prepend(item);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => item.classList.add('fade'), 6000);
    setTimeout(() => item.remove(), 7000);
  }

  toast(text) {
    const t = el(`<div class="toast">${esc(text)}</div>`);
    this.$('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('fade'), 2200);
    setTimeout(() => t.remove(), 2800);
  }

  bigToast(title, sub = '', mood = '') {
    const t = el(`<div class="big-toast ${mood}"><div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`);
    this.$('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('fade'), 2400);
    setTimeout(() => t.remove(), 3000);
  }

  banner(title, sub) {
    const b = el(`<div class="banner"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>`);
    this.$('#toasts').appendChild(b);
    setTimeout(() => b.classList.add('fade'), 2600);
    setTimeout(() => b.remove(), 3300);
  }

  // ---------- overlays ----------
  overlay(html, cls = '') {
    const o = this.$('#overlay');
    o.className = cls;
    o.innerHTML = html;
    return o;
  }
  closeOverlay() { const o = this.$('#overlay'); o.innerHTML = ''; o.className = ''; this.adStop?.(); this.adStop = null; }
  get overlayOpen() { return !!this.$('#overlay').innerHTML; }

  toggleHelp() {
    if (this.$('#overlay').classList.contains('help')) return this.closeOverlay();
    this.overlay(`
      <div class="panel help-panel">
        <h2>Controls</h2>
        <table>
          <tr><td>Hold left mouse + drag down</td><td>Set power (release to putt, drag back up to cancel)</td></tr>
          <tr><td>Drag sideways while aiming</td><td>Fine-tune aim</td></tr>
          <tr><td>Right-drag / A D / ← →</td><td>Rotate camera &amp; aim</td></tr>
          <tr><td>W S / ↑ ↓ · mouse wheel</td><td>Tilt · zoom</td></tr>
          <tr><td>Space (hold)</td><td>Charge power, release to putt</td></tr>
          <tr><td>1 2 3</td><td>Use power-up (Shift+number discards)</td></tr>
          <tr><td>C</td><td>Overhead view</td></tr>
          <tr><td>Tab</td><td>Spectate others after you hole out</td></tr>
          <tr><td>7 8 9 0</td><td>Emotes 😂 😡 👏 💀</td></tr>
          <tr><td>M · H · Esc</td><td>Mute · help · cancel</td></tr>
        </table>
        <h2>Rules</h2>
        <p>Everyone plays at the same time. Lowest total strokes wins. Falling into the Digital Sea costs +1.
        Run out of time and you score <b>max(par, strokes) + 10</b>. Fortune Falls pits add a random +1…+5 and drop you somewhere random.</p>
        <h2>Power-ups</h2>
        <div class="pu-grid">${POWERUP_IDS.map((id) => `<div><span>${POWERUPS[id].icon}</span><b>${esc(POWERUPS[id].name)}</b> ${esc(POWERUPS[id].desc)}</div>`).join('')}</div>
        <button class="btn" id="closeHelp">Close</button>
      </div>`, 'help').querySelector('#closeHelp').onclick = () => this.closeOverlay();
  }

  pickTarget(title, players, cb) {
    const o = this.overlay(`
      <div class="panel picker">
        <h2>${esc(title)}</h2>
        <div class="targets">${players.map((p) => `<button class="btn target" data-id="${esc(p.id)}"><i style="background:${p.color}"></i>${esc(p.name)}${p.holed ? ' ⛳' : ''}</button>`).join('')}</div>
        <button class="btn" id="cancelPick">Cancel (Esc)</button>
      </div>`, 'picker');
    o.querySelectorAll('.target').forEach((b) => b.onclick = () => { this.closeOverlay(); cb(b.dataset.id); });
    o.querySelector('#cancelPick').onclick = () => { this.closeOverlay(); cb(null); };
  }

  showAd(secs, rng, fromName) {
    const o = this.overlay(`
      <div class="ad-box">
        <div class="ad-top"><span class="ad-tag">AD</span> Sponsored by ${esc(fromName)} <span class="ad-left"></span></div>
        <canvas width="640" height="360"></canvas>
        <div class="ad-bottom"><button class="btn tiny" disabled>Skip ad in ∞</button></div>
      </div>`, 'ad');
    const left = o.querySelector('.ad-left');
    this.adStop = runAd(o.querySelector('canvas'), secs, rng, (s) => {
      left.textContent = `0:${String(Math.ceil(s)).padStart(2, '0')}`;
      if (s <= 0) setTimeout(() => this.closeOverlay(), 100);
    });
  }

  roulette(final, onDone) {
    const o = this.overlay(`<div class="roulette"><div class="r-title">FORTUNE FALLS</div><div class="r-val">+?</div><div class="r-sub">stroke penalty</div></div>`, 'fortune');
    const v = o.querySelector('.r-val');
    let i = 0, delay = 40;
    const spin = () => {
      i++;
      v.textContent = '+' + ((i % 5) + 1);
      this.h.tick?.();
      delay *= 1.12;
      if (delay < 260) setTimeout(spin, delay);
      else {
        v.textContent = final === 0 ? 'JACKPOT +0' : '+' + final;
        v.classList.add('final');
        setTimeout(() => { this.closeOverlay(); onDone(); }, 900);
      }
    };
    spin();
  }

  showScoreboard({ players, plan, holeNo, results, myId, final, isHost }) {
    this.hideHud();
    const pars = plan.map((i) => HOLES[i].par);
    const sorted = [...players].sort((a, b) => a.total - b.total);
    const parSum = pars.slice(0, holeNo + 1).reduce((a, b) => a + b, 0);
    const resultMap = new Map((results || []).map((r) => [r.id, r]));
    const cell = (s, i) => {
      if (s === null || s === undefined) return '<td class="na">·</td>';
      const d = s - pars[i];
      return `<td class="${s === 1 ? 'hio' : d < 0 ? 'under' : d > 0 ? (d >= 10 ? 'timeout' : 'over') : 'par'}">${s}</td>`;
    };
    const s = this.setScreen(`
      <div class="panel scoreboard">
        <h1>${final ? '🏆 FINAL STANDINGS' : `HOLE ${holeNo + 1} COMPLETE`}</h1>
        <div class="joke">${esc(JOKES[Math.floor(Math.random() * JOKES.length)])}</div>
        ${final ? podium(sorted) : ''}
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Player</th>${plan.map((hi, i) => `<th title="${esc(HOLES[hi].name)}">${hi + 1}</th>`).join('')}<th>Total</th><th>±Par</th></tr>
            <tr class="pars"><td></td><td>Par</td>${pars.map((p) => `<td>${p}</td>`).join('')}<td>${pars.reduce((a, b) => a + b, 0)}</td><td></td></tr></thead>
          <tbody>${sorted.map((p, rank) => {
            const r = resultMap.get(p.id);
            const rel = p.total - parSum;
            return `<tr class="${p.id === myId ? 'me' : ''}"><td>${rank + 1}</td><td><i style="background:${p.color}"></i>${esc(p.name)}${r?.timeout ? ' ⏰' : ''}</td>
              ${plan.map((_, i) => cell(p.scores[i], i)).join('')}<td class="tot">${p.total}</td><td>${rel > 0 ? '+' + rel : rel}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
        <div class="row">
          ${final ? (isHost ? '<button class="btn primary" id="again">Play again</button>' : '') + '<button class="btn" id="menu">Back to menu</button>'
            : `<div class="tagline next-in">Next hole in a few seconds…</div>${isHost ? '<button class="btn" id="next">Next now</button>' : ''}`}
        </div>
      </div>`);
    s.querySelector('#again')?.addEventListener('click', () => this.h.start?.());
    s.querySelector('#menu')?.addEventListener('click', () => this.h.leave?.());
    s.querySelector('#next')?.addEventListener('click', () => this.h.skip?.());
  }

  debugGrant(cb) {
    const o = this.overlay(`<div class="panel picker"><h2>Debug: grant power-up</h2><div class="pu-pick">${POWERUP_IDS.map((id) => `<button class="btn" data-id="${id}">${POWERUPS[id].icon} ${esc(POWERUPS[id].name)}</button>`).join('')}</div>
      <button class="btn" id="cancelPick">Close</button></div>`, 'picker');
    o.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => cb(b.dataset.id));
    o.querySelector('#cancelPick').onclick = () => this.closeOverlay();
  }
}

function podium(sorted) {
  const top = sorted.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  return `<div class="podium">${order.map((i) => `<div class="pod p${i + 1}"><div class="pn"><i style="background:${top[i].color}"></i>${esc(top[i].name)}</div><div class="pb">${i + 1}<small>${top[i].total}</small></div></div>`).join('')}</div>`;
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('lyokogolf.prefs') || '{}');
    return { name: p.name || '', color: p.color || COLORS[Math.floor(Math.random() * COLORS.length)], muted: !!p.muted };
  } catch { return { name: '', color: COLORS[0], muted: false }; }
}

export function savePrefs(p) {
  try { localStorage.setItem('lyokogolf.prefs', JSON.stringify(p)); } catch { /* storage blocked */ }
}
