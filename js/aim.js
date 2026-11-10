// Pure aim / charge / meter math (no DOM). Unit tested.
export const ATTACK = { tap: 10, chargeFrames: 40 };   // press+release within `tap` frames = light; else charged heavy
export const METER = { max: 100, dealt: 0.5, taken: 0.4 };

// Unit vector from (fx,fy) to (tx,ty). Falls back to the facing direction when the cursor sits on the fighter.
export function aimFromPoints(fx, fy, tx, ty, face = 1) {
  const dx = tx - fx, dy = ty - fy, m = Math.hypot(dx, dy);
  if (!(m > 4)) return { x: face >= 0 ? 1 : -1, y: 0 };
  return { x: dx / m, y: dy / m };
}
export const aimAngle = (a) => Math.atan2(a.y, a.x);
// Quantize aim to one byte for the network (0..255 maps to 0..2PI). 255 = no aim.
export function packAim(a) { if (!a) return 255; let t = Math.atan2(a.y, a.x); if (t < 0) t += Math.PI * 2; return Math.round((t / (Math.PI * 2)) * 254) % 255; }
export function unpackAim(b, face = 1) { if (b == null || b === 255) return { x: face, y: 0 }; const t = (b / 254) * Math.PI * 2; return { x: Math.cos(t), y: Math.sin(t) }; }
// Charge fraction 0..1 for a heavy released after `t` frames of holding.
export function chargeFraction(t) { return Math.max(0, Math.min(1, (t - ATTACK.tap) / ATTACK.chargeFrames)); }
export const isTap = (t) => t < ATTACK.tap;
export function addMeter(m, amount) { return Math.max(0, Math.min(METER.max, m + amount)); }
export const meterReady = (m) => m >= METER.max;
