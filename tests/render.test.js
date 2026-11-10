import { test, expect } from 'bun:test';
import { createGame, tick } from '../js/sim.js';
import { CHAR_IDS, STATES } from '../js/config.js';

// Render with a mock 2D context: catches runtime errors (typos, undefined vars) without a browser.
function mockCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 50 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
test('renderer draws every character in every state without throwing', async () => {
  globalThis.window = { devicePixelRatio: 1 };
  const { createRenderer } = await import('../js/render.js');
  const ctx = mockCtx();
  const canvas = { getContext: () => ctx, clientWidth: 1280, clientHeight: 720, width: 0, height: 0 };
  const r = createRenderer(canvas); r.resize();
  const g = createGame({ players: CHAR_IDS.map((c, i) => ({ id: i + 1, name: 'P' + i, char: c, bot: true })), opts: {}, seed: 3 });
  const roster = Object.fromEntries(g.fighters.map((f, i) => [f.id, { name: f.name, color: i, bot: true, diff: 'hard' }]));
  g.items.push({ id: 1, kind: 'pie', x: 500, y: 470 }, { id: 2, kind: 'tea', x: 600, y: 470 }, { id: 3, kind: 'ginger', x: 700, y: 470 });
  for (let n = 0; n < 600; n++) { tick(g, {}); r.fx(g.events.filter((e) => e[0] === g.tick), roster); r.draw(g, { roster, myId: 1 }); }
  for (const f of g.fighters) for (const st of STATES) for (const sub of ['', 'grow', 'volley', 'carpet', 'flurry', 'nose', 'wish', 'bubble']) {
    Object.assign(f, { state: st, sub, t: 8, floatT: 1, blind: 10, item: 'pie', gliding: true }); r.draw(g, { roster, myId: f.id });
  }
  expect(true).toBe(true);
});
