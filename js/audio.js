// Tiny synthesized blips (our own, no samples). Browser only.
let ctx = null, muted = false;
export const setMuted = (m) => { muted = m; };
export const isMuted = () => muted;
export function unlock() { try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch {} }
function blip(f0, f1, dur, type = 'square', vol = 0.05) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
}
const SFX = {
  hit: (v) => blip(220 + Math.min(v, 20) * 12, 90, 0.12, 'square'), ko: () => blip(500, 60, 0.5, 'sawtooth', 0.07),
  jump: () => blip(300, 520, 0.08, 'triangle'), dj: () => blip(400, 700, 0.1, 'triangle'),
  shieldbreak: () => blip(800, 100, 0.3, 'sawtooth'), throw: () => blip(300, 200, 0.1, 'triangle'),
  splat: () => blip(180, 60, 0.15, 'sawtooth'), pick: () => blip(600, 900, 0.1, 'triangle'), heal: () => blip(500, 1000, 0.25, 'sine', 0.06),
  shoot: () => blip(900, 400, 0.08, 'square', 0.03), respawn: () => blip(200, 600, 0.2, 'triangle'),
  win: () => { blip(500, 500, 0.15, 'triangle'); setTimeout(() => blip(750, 750, 0.3, 'triangle'), 150); },
  wish: () => blip(300, 1200, 0.5, 'sine', 0.07), carpet: () => blip(250, 500, 0.2, 'triangle'), flutter: () => blip(700, 300, 0.3, 'sine', 0.03),
  counter: () => blip(1000, 300, 0.2, 'square'), pop: () => blip(900, 200, 0.08, 'sine'), spawnitem: () => blip(400, 800, 0.08, 'sine', 0.03),
};
export function sfx(type, v = 0) { const f = SFX[type]; if (f) f(v); }
