// "Unskippable Ad": procedurally animated joke commercials drawn on a canvas.
const ADS = [
  {
    brand: 'XANA-COLA', tag: 'Now with 0% Return to the Past.', bg: ['#2a0000', '#a00000'], accent: '#ff3030',
    draw(g, w, h, t) {
      const y = h * 0.55 + Math.sin(t * 4) * 12;
      g.fillStyle = '#300'; g.fillRect(w / 2 - 34, y - 90, 68, 150);
      g.fillStyle = '#c00'; g.fillRect(w / 2 - 34, y - 40, 68, 50);
      g.fillStyle = '#fff'; g.font = 'bold 14px Orbitron'; g.textAlign = 'center'; g.fillText('XANA', w / 2, y - 10);
      g.fillStyle = '#300'; g.fillRect(w / 2 - 14, y - 120, 28, 32);
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(w / 2 - 20 + ((i * 37) % 40), y - 80 - ((t * 60 + i * 23) % 80), 3, 0, 7); g.fill(); }
    },
  },
  {
    brand: 'MONTAPOLLOS', tag: 'Fried chicken so fresh it runs away.', bg: ['#3a1d00', '#ff9a1a'], accent: '#ffe600',
    draw(g, w, h, t) {
      const x = ((t * 220) % (w + 200)) - 100;
      const y = h * 0.62 - Math.abs(Math.sin(t * 14)) * 18;
      g.font = '90px "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; g.textAlign = 'center';
      g.save(); g.translate(x, y); g.scale(-1, 1); g.fillText('🐔', 0, 0); g.restore();
      g.font = '60px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      g.fillText('🪣', x - 160, h * 0.66);
      g.fillStyle = '#fff'; g.font = 'bold 18px Rajdhani'; g.fillText('come back!!', x - 160, h * 0.66 - 60);
    },
  },
  {
    brand: 'SUPERCOMPUTER INSURANCE', tag: 'Because someone has to shut it down.', bg: ['#001033', '#0b4ab0'], accent: '#7fd0ff',
    draw(g, w, h, t) {
      g.strokeStyle = '#7fd0ff'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w / 2, h * 0.58, 30 + i * 18 + (t * 40) % 18, 0, 7); g.globalAlpha = 0.6 - i * 0.09; g.stroke(); }
      g.globalAlpha = 1;
      g.fillStyle = '#ddd'; g.fillRect(w / 2 - 30, h * 0.58 - 45, 60, 90);
      g.fillStyle = '#ff2d2d'; g.beginPath(); g.arc(w / 2, h * 0.58 - 20, 10, 0, 7); g.fill();
      g.fillStyle = '#7fd0ff'; g.font = 'bold 15px Rajdhani'; g.textAlign = 'center';
      g.fillText('Plans from 0.99 € / Return to the Past', w / 2, h * 0.88);
    },
  },
  {
    brand: "ODD'S HAIR GEL", tag: 'Purple spikes. Gravity optional.', bg: ['#1a0033', '#7a1fbf'], accent: '#ff7ae8',
    draw(g, w, h, t) {
      const cx = w / 2, cy = h * 0.66;
      g.fillStyle = '#f1c27d'; g.beginPath(); g.arc(cx, cy, 46, 0, 7); g.fill();
      g.fillStyle = '#ffde59';
      for (let i = -3; i <= 3; i++) {
        const len = 70 + Math.sin(t * 6 + i) * 18;
        g.beginPath(); g.moveTo(cx + i * 12 - 8, cy - 30); g.lineTo(cx + i * 22, cy - 30 - len); g.lineTo(cx + i * 12 + 8, cy - 30); g.fill();
      }
      g.fillStyle = '#7a1fbf'; g.beginPath(); g.moveTo(cx - 4, cy - 40); g.lineTo(cx, cy - 120 - Math.sin(t * 6) * 10); g.lineTo(cx + 4, cy - 40); g.fill();
    },
  },
  {
    brand: 'KADIC ACADEMY', tag: 'Our principal notices absolutely nothing.', bg: ['#0a2a10', '#3a8a3a'], accent: '#c8ffb0',
    draw(g, w, h, t) {
      g.fillStyle = '#e8dcc0'; g.fillRect(w / 2 - 120, h * 0.45, 240, 110);
      g.fillStyle = '#8a3a2a'; g.beginPath(); g.moveTo(w / 2 - 135, h * 0.45); g.lineTo(w / 2, h * 0.3); g.lineTo(w / 2 + 135, h * 0.45); g.fill();
      g.fillStyle = '#4a6a9a';
      for (let i = 0; i < 5; i++) g.fillRect(w / 2 - 105 + i * 45, h * 0.5, 26, 30);
      const blink = Math.floor(t * 3) % 2;
      g.font = '40px "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; g.textAlign = 'center';
      g.fillText(blink ? '🙈' : '🫣', w / 2, h * 0.42);
    },
  },
  {
    brand: 'JIM MORALES LIFE COACHING', tag: '"I\'d rather not talk about it."', bg: ['#2a1a0a', '#8a5a2a'], accent: '#ffd28a',
    draw(g, w, h, t) {
      g.font = '80px "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; g.textAlign = 'center';
      g.fillText('🧔', w / 2, h * 0.66 + Math.sin(t * 2) * 4);
      g.fillStyle = '#fff'; g.font = 'bold 18px Rajdhani';
      const msgs = ['Session 1: ...', 'Session 2: ......', "Session 3: I'd rather not."];
      g.fillText(msgs[Math.floor(t / 1.5) % msgs.length], w / 2, h * 0.86);
    },
  },
];

export function runAd(canvas, secs, rng, onTick) {
  const g = canvas.getContext('2d');
  const order = [...ADS].sort(() => rng.next() - 0.5);
  const per = secs > 7 ? secs / 2 : secs;
  const t0 = performance.now();
  let raf;
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    const left = Math.max(0, secs - t);
    const ad = order[Math.min(order.length - 1, Math.floor(t / per))];
    const w = canvas.width, h = canvas.height;
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, ad.bg[0]); grd.addColorStop(1, ad.bg[1]);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    ad.draw(g, w, h, t);
    g.textAlign = 'center';
    g.fillStyle = ad.accent; g.font = '900 30px Orbitron, sans-serif';
    g.fillText(ad.brand, w / 2, h * 0.15);
    g.fillStyle = '#fff'; g.font = '600 18px Rajdhani, sans-serif';
    g.fillText(ad.tag, w / 2, h * 0.24);
    onTick(left);
    if (left > 0) raf = requestAnimationFrame(loop);
  };
  loop();
  return () => cancelAnimationFrame(raf);
}
