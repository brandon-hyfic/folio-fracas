// Keyboard + Gamepad -> one input state. Browser only.
const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'ArrowUp', 'KeyW'], light: ['KeyJ', 'KeyZ'], heavy: ['KeyK', 'KeyX'], spc: ['KeyL', 'KeyC'],
  shd: ['ShiftLeft', 'ShiftRight', 'KeyI', 'KeyV'], taunt: ['KeyT'],
};
export function createInput() {
  const down = new Set();
  const block = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; down.add(e.code); if (block.has(e.code)) e.preventDefault(); });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());
  const any = (names) => names.some((c) => down.has(c));
  return {
    read() {
      const s = { x: 0, y: 0, jump: any(KEYS.jump), light: any(KEYS.light), heavy: any(KEYS.heavy), spc: any(KEYS.spc), shd: any(KEYS.shd), taunt: any(KEYS.taunt) };
      s.x = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
      s.y = any(KEYS.down) ? 1 : 0;
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        const ax = Math.abs(p.axes[0]) > 0.25 ? p.axes[0] : 0, ay = Math.abs(p.axes[1]) > 0.35 ? p.axes[1] : 0;
        s.x = s.x || ax || (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
        s.y = s.y || (ay > 0 ? ay : 0) || (b(13) ? 1 : 0);
        s.jump = s.jump || b(0); s.light = s.light || b(2); s.heavy = s.heavy || b(3); s.spc = s.spc || b(1);
        s.shd = s.shd || b(4) || b(5) || b(6) || b(7); s.taunt = s.taunt || b(8) || b(12);
        break;
      }
      return s;
    },
    anyStart() { return down.has('Enter'); },
  };
}
export function encodeInput(s) {
  const bits = (s.jump ? 1 : 0) | (s.light ? 2 : 0) | (s.heavy ? 4 : 0) | (s.spc ? 8 : 0) | (s.shd ? 16 : 0) | (s.taunt ? 32 : 0);
  return { b: bits, x: Math.round(s.x * 100), y: Math.round(s.y * 100) };
}
export function decodeInput(m) {
  const b = m.b | 0;
  return { x: (m.x | 0) / 100, y: (m.y | 0) / 100, jump: !!(b & 1), light: !!(b & 2), heavy: !!(b & 4), spc: !!(b & 8), shd: !!(b & 16), taunt: !!(b & 32) };
}
