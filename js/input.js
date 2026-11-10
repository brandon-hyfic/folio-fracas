// Keyboard + mouse + Gamepad -> one input state. Browser only.
// A/D move, S down (fast-fall / drop through), Space jump, Shift shield/dodge, T taunt, Q/W/E abilities, R ultimate.
// Mouse: left = attack aimed at the cursor (hold to charge), right = unbound (hook: onRightClick).
import { packAim, unpackAim } from './aim.js';

export const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space'], q: ['KeyQ'], w: ['KeyW'], e: ['KeyE'], r: ['KeyR'],
  shd: ['ShiftLeft', 'ShiftRight'], taunt: ['KeyT'],
};
export function createInput(canvas) {
  const down = new Set();
  const block = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
  const mouse = { x: 0, y: 0, moved: false, left: false, right: false };
  const hooks = { onRightClick: null };
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; down.add(e.code); if (block.has(e.code)) e.preventDefault(); });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); mouse.left = mouse.right = false; });
  if (canvas) {
    const rel = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.moved = true; };
    canvas.addEventListener('mousemove', rel);
    canvas.addEventListener('mousedown', (e) => { rel(e); if (e.button === 0) mouse.left = true; if (e.button === 2) { mouse.right = true; if (hooks.onRightClick) hooks.onRightClick(mouse); } e.preventDefault(); });
    addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const any = (names) => names.some((c) => down.has(c));
  return {
    hooks, mouse,
    read() {
      const s = { x: 0, y: 0, jump: any(KEYS.jump), atk: mouse.left, q: any(KEYS.q), w: any(KEYS.w), e: any(KEYS.e), r: any(KEYS.r), shd: any(KEYS.shd), taunt: any(KEYS.taunt), alt: mouse.right, padAim: null };
      s.x = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
      s.y = any(KEYS.down) ? 1 : 0;
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        const ax = Math.abs(p.axes[0]) > 0.25 ? p.axes[0] : 0, ay = Math.abs(p.axes[1]) > 0.35 ? p.axes[1] : 0;
        s.x = s.x || ax || (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
        s.y = s.y || (ay > 0 ? ay : 0) || (b(13) ? 1 : 0);
        s.jump = s.jump || b(0); s.atk = s.atk || b(2); s.q = s.q || b(3); s.w = s.w || b(1); s.e = s.e || b(4); s.r = s.r || b(5);
        s.shd = s.shd || b(6) || b(7); s.taunt = s.taunt || b(8) || b(12);
        const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
        if (Math.hypot(rx, ry) > 0.4) s.padAim = { x: rx, y: ry };
        break;
      }
      return s;
    },
  };
}
// Network encoding: buttons as bits, move axes as int8-ish, aim as one byte.
export function encodeInput(s) {
  const bits = (s.jump ? 1 : 0) | (s.atk ? 2 : 0) | (s.q ? 4 : 0) | (s.w ? 8 : 0) | (s.e ? 16 : 0) | (s.r ? 32 : 0) | (s.shd ? 64 : 0) | (s.taunt ? 128 : 0);
  return { b: bits, x: Math.round(s.x * 100), y: Math.round(s.y * 100), a: packAim({ x: s.ax, y: s.ay }) };
}
export function decodeInput(m) {
  const b = m.b | 0, a = unpackAim(m.a);
  return { x: (m.x | 0) / 100, y: (m.y | 0) / 100, ax: a.x, ay: a.y, jump: !!(b & 1), atk: !!(b & 2), q: !!(b & 4), w: !!(b & 8), e: !!(b & 16), r: !!(b & 32), shd: !!(b & 64), taunt: !!(b & 128) };
}
