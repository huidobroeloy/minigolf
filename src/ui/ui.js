import { POWERUPS, POWERUP_IDS } from '../powerups/registry.js';
import { COLORS } from '../net/room.js';
import { HOLES, SECTORS, COURSES, SECTOR_NAMES, formatOptions } from '../holes/index.js';
import { runAd } from './fakeAd.js';
import { CHARACTERS, characterByColor, characterCss } from '../game/characters.js';
import { portrait, portraitBig } from './portraits.js';
import { ballOrb } from './orb.js';
import { soundtrack, SLOTS } from '../core/soundtrack.js';
import { Comms } from './comms.js';
import { stats, ACHIEVEMENTS, TRAILS } from '../game/stats.js';

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
          <div class="hud-strokes"><div class="lbl">STROKES</div><div class="val">0</div>
            <div class="hud-lp" title="Lyoko life points: monster hits cost LP, at 0 you're devirtualized"><div class="lp-bar"><i></i></div><span class="lp-n">100</span><em class="lp-pop"></em></div></div>
        </div>
        <div class="hud-players"></div>
        <div class="hud-feed"></div>
        <div class="hud-status"></div>
        <div class="hud-chips"></div>
        <div class="hud-inventory"></div>
        <div class="hud-power hidden"><div class="power-fill"></div><div class="power-lbl">POWER</div></div>
        <div class="hud-hint"></div>
        <button class="btn target-cancel hidden" data-act="cancelTarget">✖ Cancel</button>
        <button class="btn unstick hidden" data-act="unstick">↺ Ball stuck? Reset it (no penalty)</button>
        <div class="hud-buttons">
          <button class="icon-btn" data-act="cam" title="Camera: chase / first person / aerial (C)">🎥</button>
          <button class="icon-btn" data-act="spec" title="Spectate next player (Tab)">👁️</button>
          <button class="icon-btn" data-act="help" title="Help (H)">❔</button>
          <button class="icon-btn" data-act="mute" title="Mute (M)">🔊</button>
          <button class="icon-btn" data-act="settings" title="Settings (Esc)">⚙️</button>
          <button class="icon-btn host-only hidden" data-act="skip" title="Host: end this hole now">⏭️</button>
          <button class="icon-btn" data-act="leave" title="Leave game">🚪</button>
        </div>
      </div>
      <div id="toasts"></div>
      <div id="overlay"></div>
      <div id="aelita" class="hidden"><span>🌸 A E L I T A · slow motion</span></div>
      <div id="possessed" class="hidden"><span>👁️ POSSESSED · XANA is taking your next shot</span></div>
      <div id="possessing" class="hidden"><span></span></div>
      <div id="meme" class="hidden"></div>
      <div id="flash" class="hidden"></div>
      <div id="vs" class="hidden"></div>
      <div id="finale" class="hidden"><div class="ft"></div><div class="fs"></div></div>
      <div id="codepanel" class="hidden"><div class="cp-head">TOWER INTERFACE</div><div class="cp-body"></div></div>
    `;
    this.comms = new Comms(root);
    this.$ = (s) => root.querySelector(s);
    this.$('.target-cancel').addEventListener('click', () => this.h.cancelTarget?.());
    this.$('.unstick').addEventListener('click', () => this.h.unstick?.());
    this.$('.hud-buttons').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'cam') this.h.toggleCam?.();
      if (a === 'spec') this.h.spectate?.();
      if (a === 'skip' && confirm('End this hole for everyone now?')) this.h.skip?.();
      if (a === 'leave' && confirm('Leave the game?')) this.h.leave?.();
      if (a === 'help') this.toggleHelp();
      if (a === 'mute') this.h.toggleMute?.();
      if (a === 'settings') this.toggleSettings();
    });
    this.$('.hud-inventory').addEventListener('click', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot || slot.classList.contains('empty')) return;
      const i = slot.dataset.i === 'S' ? 'S' : Number(slot.dataset.i);
      if (e.target.closest('.discard')) this.h.discard?.(i);
      else this.h.use?.(i);
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
        <div class="tagline">The Lyoko World Cup · ${COURSES.length} sectors · ${HOLES.length} holes · way too many power-ups</div>
        ${error ? `<div class="error">${esc(error)}</div>` : ''}
        <label>Your name</label>
        <input id="name" maxlength="16" value="${esc(p.name)}" placeholder="Ulrich" />
        <label>Choose your fighter</label>
        <div class="cs-host"></div>
        <div class="row">
          <button class="btn primary" id="create">Create room</button>
        </div>
        <div class="row join">
          <input id="code" maxlength="5" placeholder="CODE" value="${esc(roomFromUrl)}" />
          <button class="btn" id="join">Join</button>
        </div>
        <div class="row solo">
          <select id="soloCourse">
            ${formatOptions().map(([v, n]) => `<option value="${v}">Solo · ${esc(n)}</option>`).join('')}
            ${COURSES.map((c) => `<optgroup label="${esc(c.name)}">${c.holes.map((hh) => { const i = HOLES.indexOf(hh); return `<option value="hole:${i}">Practice · ${esc(hh.name)} (par ${hh.par})</option>`; }).join('')}</optgroup>`).join('')}
          </select>
          <button class="btn" id="solo">Practice</button>
        </div>
        <div class="row"><button class="btn" id="settingsBtn">⚙️ Sound &amp; graphics</button><button class="btn" id="achBtn">🏆 Achievements</button></div>
        <div class="small">Drag down from anywhere to set power, sideways to aim, release to putt. Press H in game for all controls.</div>
      </div>`);
    this.charSelect(s.querySelector('.cs-host'), {
      selected: p.color,
      onPick: (c) => { this.prefs.color = c; savePrefs(this.prefs); },
    });
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
    s.querySelector('#settingsBtn').onclick = () => this.toggleSettings();
    s.querySelector('#achBtn').onclick = () => this.showAchievements();
  }

  /** Lifetime stats, achievements and the ball-trail picker. */
  showAchievements() {
    const d = stats.data, have = new Set(d.unlocked), trails = stats.unlockedTrails();
    const cur = this.prefs.trail || 'default';
    const o = this.overlay(`<div class="panel achievements">
      <h2>🏆 Achievements <small>${have.size}/${ACHIEVEMENTS.length}</small></h2>
      <div class="ach-stats">
        <span><b>${d.holes}</b> holes</span><span><b>${d.aces}</b> aces</span><span><b>${d.towers}</b> towers</span>
        <span><b>${d.wins}</b>/${d.matches} wins</span><span><b>${d.devirt}</b> devirtualized</span><span><b>${(d.longest || 0).toFixed(1)}</b> longest putt</span>
      </div>
      <div class="ach-list">${ACHIEVEMENTS.map((a) => `<div class="ach ${have.has(a.id) ? 'got' : ''}"><span class="ai">${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}${a.trail ? ` · unlocks the ${esc(TRAILS[a.trail].name)} trail` : ''}</small></div></div>`).join('')}</div>
      <h3>Ball trail</h3>
      <div class="trail-pick">${Object.entries(TRAILS).map(([k, t]) => `<button class="btn ${k === cur ? 'primary' : ''}" data-trail="${k}" ${trails.includes(k) ? '' : 'disabled title="Locked"'}>${trails.includes(k) ? '' : '🔒 '}${esc(t.name)}</button>`).join('')}</div>
      <div class="row"><button class="btn primary" id="achClose">Done</button></div>
    </div>`, 'ach-ov');
    o.querySelector('.trail-pick').onclick = (e) => {
      const k = e.target.closest('[data-trail]')?.dataset.trail;
      if (!k || !trails.includes(k)) return;
      this.prefs.trail = k;
      savePrefs(this.prefs);
      this.h.trail?.(k);
      o.querySelectorAll('[data-trail]').forEach((b) => b.classList.toggle('primary', b.dataset.trail === k));
    };
    o.querySelector('#achClose').onclick = () => this.closeOverlay();
  }

  /** Sound & graphics settings (menu button, ⚙️ in the HUD, or Esc). */
  toggleSettings() {
    if (this.$('#overlay').classList.contains('settings-ov')) { this.closeOverlay(); return; }
    const p = this.prefs;
    const o = this.overlay(`<div class="panel settings">
      <h2>⚙️ Settings</h2>
      <div class="set-row"><label>🎵 Music</label><input id="setMusic" type="range" min="0" max="1" step="0.05" value="${p.music ?? 0.5}" />
        <button class="btn tog ${p.musicMuted ? 'off' : ''}" id="setMusicMute">${p.musicMuted ? 'OFF' : 'ON'}</button></div>
      <div class="set-row"><label>💥 Sound FX</label><input id="setSfx" type="range" min="0" max="1" step="0.05" value="${p.sfx ?? 0.6}" /></div>
      <div class="set-row"><label>🔇 Mute everything</label><button class="btn tog ${p.muted ? 'off' : ''}" id="setMute">${p.muted ? 'MUTED' : 'SOUND ON'}</button></div>
      <div class="set-row"><label>🖥️ Graphics</label><select id="setQuality"><option value="high" ${p.quality !== 'low' ? 'selected' : ''}>High (glow + shadows)</option><option value="low" ${p.quality === 'low' ? 'selected' : ''}>Low (faster)</option></select></div>
      <div class="set-row"><label>🎬 Intro before matches</label><button class="btn tog ${p.intro === false ? 'off' : ''}" id="setIntro">${p.intro === false ? 'OFF' : 'ON'}</button></div>
      <h3 class="st-h">🎧 Soundtrack</h3>
      <div class="st-note">Load your own music (audio or video files). It stays in this browser, and when you host, your friends hear it too.</div>
      <div class="st-slots"></div>
      <div class="row"><button class="btn primary" id="setClose">Done</button></div>
    </div>`, 'settings-ov');
    const slotsEl = o.querySelector('.st-slots');
    const renderSlots = () => {
      if (!slotsEl.isConnected) { off(); return; }
      slotsEl.innerHTML = SLOTS.map((sl) => {
        const tr = soundtrack.track(sl.key);
        const prog = soundtrack.progress(sl.key);
        const status = prog !== null ? `receiving from host… ${Math.round(prog * 100)}%`
          : tr ? `${tr.fromHost ? 'from host: ' : ''}${tr.name}` : 'built-in synth';
        return `<div class="st-slot" data-k="${sl.key}">
          <span class="st-ic">${sl.icon}</span><span class="st-l">${sl.label}</span>
          <span class="st-s ${tr ? 'on' : ''}" title="${esc(status)}">${esc(status)}</span>
          <label class="btn st-load">Load<input type="file" accept="audio/*,video/*" hidden /></label>
          ${soundtrack.local.has(sl.key) ? '<button class="btn st-clear" title="Back to the built-in music">✕</button>' : ''}
        </div>`;
      }).join('');
    };
    const off = soundtrack.onChange(renderSlots);
    renderSlots();
    slotsEl.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      const k = e.target.closest('.st-slot')?.dataset.k;
      if (f && k) soundtrack.set(k, f);
    });
    slotsEl.addEventListener('click', (e) => {
      if (!e.target.closest('.st-clear')) return;
      soundtrack.clear(e.target.closest('.st-slot').dataset.k);
    });
    o.querySelector('#setIntro').onclick = (e) => {
      const on = this.prefs.intro === false;
      this.prefs.intro = on;
      savePrefs(this.prefs);
      e.target.textContent = on ? 'ON' : 'OFF'; e.target.classList.toggle('off', !on);
    };
    o.querySelector('#setMusic').oninput = (e) => this.h.musicVol?.(Number(e.target.value));
    o.querySelector('#setSfx').oninput = (e) => this.h.sfxVol?.(Number(e.target.value));
    o.querySelector('#setMusicMute').onclick = (e) => {
      const m = !this.prefs.musicMuted;
      this.h.muteMusic?.(m);
      e.target.textContent = m ? 'OFF' : 'ON'; e.target.classList.toggle('off', m);
    };
    o.querySelector('#setMute').onclick = (e) => {
      this.h.toggleMute?.();
      const m = !!this.prefs.muted;
      e.target.textContent = m ? 'MUTED' : 'SOUND ON'; e.target.classList.toggle('off', m);
    };
    o.querySelector('#setQuality').onchange = (e) => this.h.quality?.(e.target.value);
    o.querySelector('#setClose').onclick = () => this.toggleSettings();
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
    const courseOpts = formatOptions();
    const s = this.setScreen(`
      <div class="panel lobby">
        <div class="logo small">LYOKO<span>MINIGOLF</span></div>
        <div class="code-box">
          <div class="lbl">ROOM CODE</div>
          <div class="code">${esc(lobby.code)}</div>
          <button class="btn tiny" id="copy">Copy invite link</button>
        </div>
        <div class="cs-host"></div>
        <div class="players-list">
          ${lobby.players.map((p) => { const ch = characterByColor(p.color); const tm = st.mode === 'teams' ? (ch?.id === 'xana' || p.team === 'xana' ? ' 👁️' : p.team === 'lyoko' ? ' 🛡️' : ' ❔') : ''; return `<div class="pl"><i class="ball" style="background:${ch ? characterCss(ch) : p.color}"></i>${esc(p.name)} <span class="as">as ${esc(ch?.name || '')}</span>${tm}${p.host ? ' <b>HOST</b>' : ''}${p.id === myId ? ' <em>(you)</em>' : ''}</div>`; }).join('')}
          <div class="small">${lobby.players.length}/8 players</div>
        </div>
        <div class="settings ${isHost ? '' : 'readonly'}">
          <label>Format</label>
          <select id="course" ${isHost ? '' : 'disabled'}>${courseOpts.map(([v, n]) => `<option value="${v}" ${st.course === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
          <label>Time limit</label>
          <select id="timeMul" ${isHost ? '' : 'disabled'}>${[[0.75, 'Short (×0.75)'], [1, 'Normal'], [1.5, 'Relaxed (×1.5)'], [2, 'Chill (×2)']].map(([v, n]) => `<option value="${v}" ${Number(st.timeMul) === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label>Power-ups</label>
          <select id="puLevel" ${isHost ? '' : 'disabled'}>${[['off', 'Off'], ['few', 'Few'], ['normal', 'Normal'], ['chaos', 'Chaos 🌪️']].map(([v, n]) => `<option value="${v}" ${(st.puLevel || 'normal') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label>Power-up set</label>
          <select id="puSet" ${isHost ? '' : 'disabled'}>${[['all', 'All power-ups'], ['lyoko', 'Lyoko only 🗼']].map(([v, n]) => `<option value="${v}" ${(st.puSet || 'all') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label>Mode</label>
          <select id="mode" ${isHost ? '' : 'disabled'}>${[['ffa', 'Everyone for themselves'], ['teams', 'Teams · Lyoko vs XANA'], ['elim', 'Elimination (3+ players)']].map(([v, n]) => `<option value="${v}" ${(st.mode || 'ffa') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        ${st.mode === 'teams' ? `<div class="team-pick">
          <div class="lbl">YOUR SIDE</div>
          ${characterByColor(me?.color)?.id === 'xana' ? '<div class="small">XANA always plays for XANA’s side 👁️</div>' : `
          <button class="btn tiny ${me?.team === 'lyoko' ? 'primary' : ''}" data-team="lyoko">🛡️ Lyoko Warriors</button>
          <button class="btn tiny ${me?.team === 'xana' ? 'primary' : ''}" data-team="xana">👁️ XANA’s side</button>
          <div class="small">Undecided players even out the teams when the game starts. Team score = average total.</div>`}
        </div>` : ''}
        <div class="row">
          ${isHost ? '<button class="btn primary" id="start">Start game</button>' : '<div class="tagline">Waiting for the host to start…</div>'}
          <button class="btn" id="leave">Leave</button>
        </div>
      </div>`);
    const taken = new Map(lobby.players.filter((p) => p.id !== myId).map((p) => [p.color, p.name]));
    this.charSelect(s.querySelector('.cs-host'), {
      selected: me?.color, taken, compact: true,
      onPick: (c) => { this.prefs.color = c; savePrefs(this.prefs); this.h.pick?.(c); },
    });
    s.querySelector('#copy').onclick = () => { navigator.clipboard?.writeText(url); this.toast('Invite link copied'); };
    s.querySelectorAll('[data-team]').forEach((b) => { b.onclick = () => this.h.team?.(b.dataset.team); });
    s.querySelector('#leave').onclick = () => this.h.leave?.();
    if (isHost) {
      const send = () => this.h.settings?.({
        course: s.querySelector('#course').value,
        timeMul: Number(s.querySelector('#timeMul').value),
        puLevel: s.querySelector('#puLevel').value,
        puSet: s.querySelector('#puSet').value,
        mode: s.querySelector('#mode').value,
      });
      s.querySelectorAll('select, input').forEach((i) => i.addEventListener('change', send));
      s.querySelector('#start').onclick = () => this.h.start?.();
    }
  }

  // ---------- character select (arcade style) ----------
  charSelect(host, { selected, taken = new Map(), onPick, compact = false }) {
    const render = (sel) => {
      const ch = characterByColor(sel) || CHARACTERS[0];
      host.innerHTML = `
        <div class="cs ${compact ? 'compact' : ''}">
          <div class="cs-detail" style="--c:${ch.ui}">
            <div class="cs-big"><img class="px" alt="" src="${portraitBig(ch.id)}" /></div>
            <div class="cs-info">
              <div class="cs-full sf-name">${esc(ch.full)}</div>
              <div class="cs-tag">${esc(ch.tag)}</div>
              <div class="cs-ballrow"><img class="cs-orb" alt="" src="${ballOrb(ch)}" /><span class="cs-orbname" style="--c:${ch.ui}">${esc(ch.orb)}</span></div>
            </div>
          </div>
          <div class="cs-grid">${CHARACTERS.map((c) => {
            const who = taken.get(c.ui);
            return `<button class="cs-tile ${c.ui === ch.ui ? 'sel' : ''} ${who ? 'taken' : ''}" data-c="${c.ui}" style="--c:${c.ui}" ${who ? 'disabled' : ''}>
              <img class="px" alt="" src="${portrait(c.id)}" /><span>${esc(c.name)}</span>${who ? `<em>${esc(who)}</em>` : ''}</button>`;
          }).join('')}</div>
        </div>`;
      host.querySelectorAll('.cs-tile:not(.taken)').forEach((b) => b.addEventListener('click', () => {
        render(b.dataset.c);
        onPick?.(b.dataset.c);
      }));
    };
    render(selected);
  }

  /** Fighting-game VS intro before the first hole. */
  showVS(players) {
    const cards = players.map((p, i) => {
      const ch = characterByColor(p.color);
      return `<div class="vs-card" style="--c:${p.color}; animation-delay:${i * 0.12}s">
        <img class="px" alt="" src="${ch ? portraitBig(ch.id) : ''}" />
        <div class="vs-full sf-name">${esc(ch?.full || '')}</div><div class="vs-player">${esc(p.name)}</div></div>`;
    });
    const mid = Math.ceil(cards.length / 2);
    const html = cards.length === 1
      ? `${cards[0]}<div class="vs-bolt">VS</div><div class="vs-card xana-card" style="--c:#ff3b3b"><img class="px" alt="" src="${portraitBig('xana')}" /><div class="vs-full sf-name">XANA</div><div class="vs-player">the course</div></div>`
      : `<div class="vs-side">${cards.slice(0, mid).join('')}</div><div class="vs-bolt">VS</div><div class="vs-side">${cards.slice(mid).join('')}</div>`;
    const vs = this.$('#vs');
    vs.innerHTML = `<div class="vs-wrap">${html}</div>`;
    vs.classList.remove('hidden');
    const hide = () => { vs.classList.add('hidden'); vs.innerHTML = ''; };
    vs.onclick = hide;
    clearTimeout(this.vsTimer);
    this.vsTimer = setTimeout(hide, 3500);
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

  setTargeting(on) {
    this.$('#hud').classList.toggle('targeting', on);
    this.$('.target-cancel').classList.toggle('hidden', !on);
  }

  setHostControls(isHost) {
    this.$('[data-act="skip"]').classList.toggle('hidden', !isHost);
  }

  hideHud() { this.$('#hud').classList.add('hidden'); this.setAelita(false); this.closeOverlay(); this.hideMeme(); this.setPossessing(null); }

  setTimer(msLeft, msTotal) {
    const t = this.$('.timer');
    t.textContent = fmtTime(msLeft);
    t.classList.toggle('urgent', msLeft < 15000);
    this.$('.timer-bar i').style.width = `${Math.max(0, Math.min(100, (msLeft / msTotal) * 100))}%`;
  }

  /** Life points bar; `delta` > 0 shows a red "−delta" pop, < 0 a green heal. */
  setLP(lp, delta = 0) {
    const el = this.$('.hud-lp');
    if (!el) return;
    el.querySelector('.lp-bar i').style.width = `${Math.max(0, Math.min(100, lp))}%`;
    el.querySelector('.lp-n').textContent = Math.round(lp);
    el.classList.toggle('low', lp <= 30);
    if (delta) {
      const pop = el.querySelector('.lp-pop');
      pop.textContent = delta > 0 ? `−${delta}` : `+${-delta}`;
      pop.className = 'lp-pop ' + (delta > 0 ? 'hit' : 'heal');
      void pop.offsetWidth;
      pop.classList.add('go');
      el.classList.remove('shake'); void el.offsetWidth; if (delta > 0) el.classList.add('shake');
    }
  }

  setStrokes(n, par) {
    const v = this.$('.hud-strokes .val');
    v.textContent = n;
    v.className = 'val ' + (n > par ? 'over' : '');
  }

  renderPlayers(list, myId) {
    const rel = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${-n}`);
    this.$('.hud-players').innerHTML = list.map((p) => `
      <div class="hp ${p.holed ? 'holed' : ''} ${p.connected === false ? 'gone' : ''} ${p.id === myId ? 'me' : ''}" title="Total ${p.total}">
        <span class="rk">${p.rank ?? ''}</span><i style="background:${p.color}"></i><span class="n">${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span>
        <span class="s">${p.holed ? '⛳ ' + p.strokes : p.strokes}</span><span class="tot ${p.toPar < 0 ? 'under' : p.toPar > 0 ? 'over' : ''}">${rel(p.toPar ?? 0)}</span>
      </div>`).join('');
  }

  renderInventory(inv, special = null) {
    const slots = [0, 1, 2].map((i) => {
      const id = inv[i];
      if (!id) return `<div class="slot empty" data-i="${i}"><kbd>${i + 1}</kbd></div>`;
      const d = POWERUPS[id];
      return `<div class="slot" data-i="${i}" title="${esc(d.name)}: ${esc(d.desc)}">
        <kbd>${i + 1}</kbd><div class="ic">${d.icon}</div><div class="nm">${esc(d.name)}</div><button class="discard" title="Discard (Shift+${i + 1})">✕</button></div>`;
    });
    if (special) {
      const d = POWERUPS[special.id];
      slots.push(`<div class="slot special ${special.used ? 'used' : ''}" data-i="S" title="Special move (once per course): ${esc(d.name)}: ${esc(d.desc)}">
        <kbd>4 ★</kbd><div class="ic">${d.icon}</div><div class="nm">${special.used ? 'Used' : esc(d.name)}</div></div>`);
    }
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

  setChips(list) {
    const html = list.map((c) => `<span class="chip ${c.good ? 'good' : ''}">${c.icon} ${esc(c.text)}</span>`).join('');
    const el2 = this.$('.hud-chips');
    if (el2.innerHTML !== html) el2.innerHTML = html;
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
  showUnstick(on) { this.$('.unstick').classList.toggle('hidden', !on); }
  setCamButton(view) {
    const b = this.$('[data-act="cam"]');
    if (b) b.textContent = { chase: '🎥', pov: '🔭', aerial: '🛰️' }[view] || '🎥';
  }

  setAelita(on) { this.$('#aelita').classList.toggle('hidden', !on); }

  setPossession(on) { this.$('#possessed').classList.toggle('hidden', !on); }

  /** I'm XANA and I have someone's ball. */
  setPossessing(name) {
    const el = this.$('#possessing');
    el.classList.toggle('hidden', !name);
    if (name) el.querySelector('span').textContent = `👁️ YOU CONTROL ${name.toUpperCase()}'S BALL · drag to shoot · Esc to let go`;
  }

  /**
   * Unskippable Ad: a low-res meme video over most of the screen. It ignores clicks and touches,
   * so the victim can still aim and shoot underneath it — badly.
   */
  showMemeAd(secs, rng, fromName) {
    this.hideMeme();
    const el = this.$('#meme');
    const clip = MEMES[rng.int(0, MEMES.length - 1)];
    const online = navigator.onLine !== false;
    el.innerHTML = `<div class="meme-frame">
        <div class="meme-top"><span class="ad-tag">AD</span> Sponsored by ${esc(fromName)} · <span class="meme-left">0:${secs}</span></div>
        <div class="meme-vid">${online
          ? `<iframe src="https://www.youtube-nocookie.com/embed/${clip.id}?autoplay=1&controls=0&disablekb=1&fs=0&modestbranding=1&playsinline=1&rel=0&start=${clip.start || 0}&vq=tiny" allow="autoplay; encrypted-media" title="ad"></iframe>`
          : '<canvas width="640" height="360"></canvas>'}</div>
        <div class="meme-bottom">Skip ad in ∞</div>
      </div>`;
    el.classList.remove('hidden');
    // a 256×144 player scaled up: YouTube streams it at potato quality, which is the point
    const fit = () => { const v = el.querySelector('.meme-vid'); if (v) v.style.setProperty('--k', v.clientWidth / 256); };
    fit();
    window.addEventListener('resize', fit);
    const stopCanvas = online ? null : runAd(el.querySelector('canvas'), secs, rng, () => {});
    const left = el.querySelector('.meme-left');
    const end = performance.now() + secs * 1000;
    const timer = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      left.textContent = `0:${String(s).padStart(2, '0')}`;
      if (s <= 0) this.hideMeme();
    }, 250);
    this.memeStop = () => { clearInterval(timer); window.removeEventListener('resize', fit); stopCanvas?.(); };
  }

  hideMeme() {
    this.memeStop?.();
    this.memeStop = null;
    const el = this.$('#meme');
    el.innerHTML = '';
    el.classList.add('hidden');
  }

  finaleText(title, sub = '') {
    const f = this.$('#finale');
    if (!title) { f.classList.add('hidden'); this.$('#codepanel').classList.add('hidden'); return; }
    f.classList.remove('hidden');
    f.querySelector('.ft').textContent = title;
    f.querySelector('.fs').textContent = sub;
    f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop');
  }

  /** The tower interface: types AELITA, then CODE: LYOKO. */
  finaleCode() {
    const panel = this.$('#codepanel');
    const body = panel.querySelector('.cp-body');
    panel.classList.remove('hidden');
    this.finaleText('', '');
    this.$('#finale').classList.add('hidden');
    const lines = ['> AELITA', '> CODE: LYOKO'];
    body.textContent = '';
    let li = 0, ci = 0;
    const tick = () => {
      if (panel.classList.contains('hidden')) return;
      if (li >= lines.length) return;
      if (ci === 0 && li > 0) body.textContent += '\n';
      body.textContent += lines[li][ci++];
      if (ci >= lines[li].length) { li++; ci = 0; setTimeout(tick, 450); } else setTimeout(tick, 70);
    };
    setTimeout(tick, 300);
    setTimeout(() => panel.classList.add('hidden'), 3400);
  }

  /** White "Return to the Past" flash. */
  flash() {
    const f = this.$('#flash');
    f.classList.remove('hidden', 'go');
    void f.offsetWidth;
    f.classList.add('go');
    setTimeout(() => f.classList.add('hidden'), 900);
  }

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

  /** The score name slams onto the screen like a stamp. */
  stamp(title, sub = '', mood = '') {
    const t = el(`<div class="stamp ${mood}"><div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`);
    this.$('#toasts').appendChild(t);
    document.getElementById('ui').classList.remove('shake'); void document.getElementById('ui').offsetWidth;
    document.getElementById('ui').classList.add('shake');
    setTimeout(() => t.classList.add('fade'), 2400);
    setTimeout(() => t.remove(), 3000);
  }

  /** Big title card when a new course starts. */
  courseCard(n, total, name, holes) {
    const c = el(`<div class="course-card"><div class="cc-n">COURSE ${n} / ${total}</div><div class="cc-name">${esc(name)}</div><div class="cc-s">${holes} holes</div></div>`);
    this.$('#toasts').appendChild(c);
    setTimeout(() => c.classList.add('fade'), 2800);
    setTimeout(() => c.remove(), 3500);
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
          <tr><td>4 / ★</td><td>Your character’s special move (once per course)</td></tr>
          <tr><td>C · 🎥 button</td><td>Camera: chase → first person → aerial (aerial: wheel/pinch zoom, right-drag or two fingers to look around)</td></tr>
          <tr><td>Placing power-ups</td><td>Click a spot · drag an arrow or line · right-click / Esc cancels</td></tr>
          <tr><td>Tab</td><td>Spectate others after you hole out</td></tr>
          <tr><td>7 8 9 0</td><td>Emotes 😂 😡 👏 💀</td></tr>
          <tr><td>M · H · Esc</td><td>Mute · help · cancel / settings</td></tr>
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

  showScoreboard({ players, plan, holeNo, results, myId, final, isHost, tiebreak, xana, teams }) {
    this.hideHud();
    const pars = plan.map((i) => HOLES[i].par);
    // the final order comes from the host (it already applied the tiebreaks)
    const sorted = final ? [...players] : [...players].sort((a, b) => a.total - b.total);
    const parSum = pars.slice(0, holeNo + 1).reduce((a, b) => a + b, 0);
    const resultMap = new Map((results || []).map((r) => [r.id, r]));
    // group the plan into its courses (consecutive holes of the same sector)
    const groups = [];
    plan.forEach((hi, i) => {
      const key = HOLES[hi].sector;
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, name: SECTOR_NAMES[key] || key, idx: [] });
      groups[groups.length - 1].idx.push(i);
    });
    const cell = (s, i) => {
      if (s === null || s === undefined) return '<td class="na">·</td>';
      const d = s - pars[i];
      return `<td class="${s === 1 ? 'hio' : d < 0 ? 'under' : d > 0 ? (d >= 10 ? 'timeout' : 'over') : 'par'}">${s}</td>`;
    };
    const s = this.setScreen(`
      <div class="panel scoreboard${xana ? ' xana-board' : ''}">
        <h1>${xana ? '👁️ XANA WINS · LYOKO HAS FALLEN' : final ? '🏆 FINAL STANDINGS' : `HOLE ${holeNo + 1} COMPLETE`}</h1>
        <div class="joke">${esc(JOKES[Math.floor(Math.random() * JOKES.length)])}</div>
        ${final && tiebreak && !teams ? `<div class="tiebreak">⚔️ TIEBREAK · ${esc(tiebreak)}</div>` : ''}
        ${final && teams?.length ? `<div class="team-result ${teams[0].team}">${teams[0].team === 'xana' ? '👁️ XANA’S SIDE WINS' : '🛡️ THE LYOKO WARRIORS WIN'}
          <span>${teams.map((t) => `${t.team === 'xana' ? '👁️ XANA' : '🛡️ Lyoko'} avg ${t.avg}`).join(' · ')}</span></div>` : ''}
        ${final ? podium(sorted) + awards(players) : ''}
        <div class="table-wrap"><table>
          <thead><tr class="courses"><th></th><th></th>${groups.map((g) => `<th colspan="${g.idx.length + 1}" class="cg">${esc(g.name)}</th>`).join('')}<th></th><th></th></tr>
            <tr><th>#</th><th>Player</th>${groups.map((g) => g.idx.map((i, k) => `<th title="${esc(HOLES[plan[i]].name)}">${k + 1}</th>`).join('') + '<th class="sub">Σ</th>').join('')}<th>Total</th><th>±Par</th></tr>
            <tr class="pars"><td></td><td>Par</td>${groups.map((g) => g.idx.map((i) => `<td>${pars[i]}</td>`).join('') + `<td class="sub">${g.idx.reduce((a, i) => a + pars[i], 0)}</td>`).join('')}<td>${pars.reduce((a, b) => a + b, 0)}</td><td></td></tr></thead>
          <tbody>${sorted.map((p, rank) => {
            const r = resultMap.get(p.id);
            const rel = p.total - parSum;
            const subt = (g) => { const v = g.idx.map((i) => p.scores[i]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) : '·'; };
            return `<tr class="${p.id === myId ? 'me' : ''} ${p.out ? 'out' : ''}"><td>${rank + 1}</td><td><i style="background:${p.color}"></i>${p.team === 'xana' ? '👁️ ' : p.team === 'lyoko' ? '🛡️ ' : ''}${esc(p.name)}${r?.timeout ? ' ⏰' : ''}${p.out ? ' <span class="out-tag">OUT</span>' : ''}</td>
              ${groups.map((g) => g.idx.map((i) => cell(p.scores[i], i)).join('') + `<td class="sub">${subt(g)}</td>`).join('')}<td class="tot">${p.total}</td><td>${rel > 0 ? '+' + rel : rel}</td></tr>`;
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

// Unskippable Ad clips: classic, family-friendly memes (each checked to exist and allow embedding)
const MEMES = [
  { id: 'J---aiyznGQ' },              // Keyboard Cat
  { id: 'dQw4w9WgXcQ' },              // Never Gonna Give You Up
  { id: 'oavMtUWDBTM', start: 20 },   // Trololo
  { id: 'EIyixC9NsLI' },              // Badger Badger Badger
  { id: 'jofNR_WkoCE', start: 40 },   // What Does The Fox Say
  { id: '9bZkp7q19f0', start: 60 },   // Gangnam Style
  { id: 'k85mRPqvMbE' },              // Crazy Frog
  { id: 'feA64wXhbjo', start: 40 },   // Shooting Stars
  { id: '_OBlgSz8sSM' },              // Charlie bit my finger
  { id: 'eRBOgtp0Hac' },              // Peanut Butter Jelly Time
  { id: 'j9V78UbdzWI' },              // Coffin Dance
  { id: 'ZZ5LpwO-An4' },              // HEYYEYAAEYAAAEYAEYAA
  { id: 'hFZFjoX2cGg', start: 60 },   // Backyard squirrel maze
  { id: 'Ct6BUPvE2sM' },              // PPAP
];

const AWARDS = [
  ['falls', '🌊', 'Digital Sea Diver', 'fell into the Digital Sea'],
  ['targeted', '🎯', 'XANA\'s Favourite Victim', 'got hit by power-ups'],
  ['used', '🔫', 'Trigger Happy', 'power-ups used'],
  ['fortune', '🎰', 'Fortune\'s Fool', 'strokes donated to Fortune Falls'],
  ['hio', '⛳', 'Ace', 'holes in one'],
  ['chicken', '🐔', 'Montapollos Magnet', 'chicken hits'],
  ['timeouts', '⏰', 'Clockwatcher', 'holes timed out'],
  ['swallowed', '🕳️', 'Event Horizon', 'flung by black holes'],
  ['vaporized', '☢️', 'Megatank Snack', 'vaporized by Megatanks'],
  ['pickups', '🧺', 'Hoarder', 'pickups grabbed'],
];

function awards(players) {
  const cards = [];
  for (const [k, icon, title, what] of AWARDS) {
    let best = null;
    for (const p of players) { const v = p.stats?.[k] || 0; if (v > 0 && (!best || v > best.v)) best = { p, v }; }
    if (best) cards.push(`<div class="award"><div class="ai">${icon}</div><div class="at">${esc(title)}</div><div class="an"><i style="background:${best.p.color}"></i>${esc(best.p.name)}</div><div class="aw">${best.v} ${esc(what)}</div></div>`);
  }
  return cards.length ? `<div class="awards">${cards.slice(0, 6).join('')}</div>` : '';
}

function podium(sorted) {
  const top = sorted.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  return `<div class="podium">${order.map((i) => `<div class="pod p${i + 1}"><div class="pn"><i style="background:${top[i].color}"></i>${esc(top[i].name)}</div><div class="pb">${i + 1}<small>${top[i].total}</small></div></div>`).join('')}</div>`;
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('lyokogolf.prefs') || '{}');
    const color = COLORS.includes(p.color) ? p.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    const num = (v, d) => (typeof v === 'number' ? v : d);
    return { name: p.name || '', color, muted: !!p.muted, musicMuted: !!p.musicMuted, quality: p.quality || 'high', music: num(p.music, 0.5), sfx: num(p.sfx, 0.6), camView: p.camView || 'chase' };
  } catch { return { name: '', color: COLORS[0], muted: false, musicMuted: false, quality: 'high', music: 0.5, sfx: 0.6 }; }
}

export function savePrefs(p) {
  try { localStorage.setItem('lyokogolf.prefs', JSON.stringify(p)); } catch { /* storage blocked */ }
}
