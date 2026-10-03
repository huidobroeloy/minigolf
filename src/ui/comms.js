import { portrait } from './portraits.js';

// Jérémie on comms: short lines from the supercomputer when something happens to you.
// At most one line every 8 s, and the same kind of line at most every 30 s.

const LINES = {
  holeStart: [
    'Okay, I’ve got you on screen. The tower’s just past the cup.',
    'Virtualization complete. Get to that tower!',
    'XANA’s waiting for you on this one. Be careful.',
    'I’m reading a lot of monster activity on this course.',
  ],
  courseStart: [
    'New sector: {sector}. I’ll guide you from here.',
    'Transferring you to {sector}… done. Good luck!',
    'This is {sector}. Watch your step out there.',
  ],
  monsterNear: [
    'Careful, a {monster} right next to you!',
    'I’ve got a {monster} on your position!',
    '{monster} incoming. Don’t just stand there!',
    'Watch out: {monster}, very close.',
  ],
  megatank: [
    'The Megatank’s charging! Get out of its line!',
    'Megatank! Move, move, move!',
  ],
  hit: [
    'You took a hit! {lp} life points left.',
    'Ouch. Down to {lp} life points.',
    'That one hurt. {lp} LP.',
  ],
  lowLP: [
    'Your life points are dangerously low!',
    'One more hit and you’re devirtualized!',
    'Careful! You can’t take much more.',
  ],
  vaporized: [
    'You’ve been devirtualized! I’m sending you back in.',
    'Lost you there… rematerializing now.',
  ],
  venom: ['Hornet venom! Your next shot will be weak.', 'You’re poisoned. Go easy on the power.'],
  freeze: ['You’re frozen solid! Hang on…', 'Ice beam! Give it a few seconds.'],
  xanafy: ['The Scyphozoa got you! Your controls are scrambled!', 'XANA’s in your head. Reverse everything!'],
  shark: ['A Shark rammed you!', 'Sharks in the Digital Sea! Keep moving!'],
  fall: ['You fell into the Digital Sea! Back to your last position.', 'Whoa, careful with the edges!', 'That’s the Digital Sea down there. Stay on the platforms!'],
  lava: ['That’s lava! You’re lucky it only cost one stroke.', 'Hot! Stay off the magma.'],
  ace: ['A hole in one?! Even I couldn’t calculate that!', 'INCREDIBLE! Straight into the tower!', 'Hole in one! XANA won’t believe it.'],
  birdie: ['Nice shot! Tower deactivated in record time.', 'Under par. I knew you could do it.'],
  bogey: ['Well… the tower’s deactivated. Eventually.', 'We got there. Let’s not tell Aelita how many strokes.'],
  tower: ['Tower deactivated!', 'Good job! That tower’s clean.'],
  lastPlace: ['You’re last… but there’s still time to turn it around.', 'Don’t give up! XANA wants you to give up.'],
  xanaAttack: ['XANA’s launching an attack! Hang on!', 'Activated tower detected! Everything’s going crazy!'],
  targeted: ['Someone used {power} on you!', '{power}! Somebody doesn’t like you.'],
};

export class Comms {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'comms hidden';
    this.el.innerHTML = '<img class="px" alt="" /><div class="cm-body"><div class="cm-who">JÉRÉMIE</div><div class="cm-text"></div></div>';
    this.el.querySelector('img').src = portrait('jeremie');
    root.appendChild(this.el);
    this.last = -1e9;
    this.byKind = new Map();
    this.enabled = true;
  }

  /** Say a line of this kind (if not too soon). vars fill {placeholders}. Returns true if spoken. */
  say(kind, vars = {}, { force = false } = {}) {
    if (!this.enabled) return false;
    const pool = LINES[kind];
    if (!pool) return false;
    const now = performance.now();
    if (!force && (now - this.last < 8000 || now - (this.byKind.get(kind) ?? -1e9) < 30000)) return false;
    this.last = now;
    this.byKind.set(kind, now);
    const line = pool[Math.floor(Math.random() * pool.length)].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    this.el.querySelector('.cm-text').textContent = line;
    this.el.classList.remove('hidden', 'go');
    void this.el.offsetWidth;
    this.el.classList.add('go');
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => this.el.classList.add('hidden'), 4200);
    return true;
  }

  hide() { clearTimeout(this.hideT); this.el.classList.add('hidden'); }
}
