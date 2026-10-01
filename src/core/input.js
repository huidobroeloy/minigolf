// Keyboard + pointer state with simple event hooks.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.listeners = {};
    this.pointers = new Map();
    this.wheel = 0;

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.emit('keydown', e);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (!isTyping(e)) this.emit('keyup', e);
    });
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType });
      this.emit('pointerdown', e);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) { p.dx = e.clientX - p.x; p.dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; }
      this.emit('pointermove', e, p);
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.emit('pointerup', e, p);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.emit('wheel', e); }, { passive: false });
  }

  on(name, fn) {
    (this.listeners[name] ||= []).push(fn);
    return () => { this.listeners[name] = this.listeners[name].filter((f) => f !== fn); };
  }

  emit(name, ...args) {
    for (const fn of this.listeners[name] || []) fn(...args);
  }

  down(code) { return this.keys.has(code); }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
