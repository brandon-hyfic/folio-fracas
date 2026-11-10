// Simple bot AI with 3 difficulty levels. Deterministic (uses game RNG). No DOM.
import { CHARS, MAIN, STAGE } from './config.js';

export const neutralInput = () => ({ x: 0, y: 0, jump: false, light: false, heavy: false, spc: false, shd: false, taunt: false });

const LEVELS = {
  easy:   { think: 14, aggro: 0.35, edge: 0.55, recover: 0.65, shield: 0.01, charge: 0.1 },
  normal: { think: 8,  aggro: 0.7,  edge: 0.85, recover: 0.9,  shield: 0.04, charge: 0.25 },
  hard:   { think: 3,  aggro: 1.0,  edge: 1.0,  recover: 1.0,  shield: 0.1,  charge: 0.4 },
};
const rnd = (g) => { g.rs = (g.rs + 0x6D2B79F5) >>> 0; let t = g.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const DASH = { demigod: 270, warrior: 150 };
const safeDash = (f) => { const d = DASH[f.char]; if (!d) return true; const x = f.x + f.face * d; return x > MAIN.x1 - 10 && x < MAIN.x2 + 10; };
const RANGED = { outlaw: 320, sea: 240, thief: 200 };

export function botInput(g, f) {
  const L = LEVELS[f.diff] || LEVELS.normal;
  const ai = f.ai || (f.ai = { x: 0, y: 0, pulse: {}, heavy: 0, shd: 0, next: 0, drift: 0 });
  const inp = neutralInput();
  const emit = () => {
    inp.x = ai.x; inp.y = ai.y;
    for (const k of ['jump', 'light', 'spc', 'taunt']) if (ai.pulse[k] > 0) { inp[k] = ai.pulse[k] > 1; ai.pulse[k]--; }
    if (ai.heavy > 0) { inp.heavy = true; ai.heavy--; }
    if (ai.shd > 0) { inp.shd = true; ai.shd--; }
    return inp;
  };
  if (f.state === 'dead' || f.state === 'out') return inp;
  const press = (k) => { ai.pulse[k] = 3; };

  // Recovery has priority and runs every frame (but quality depends on level).
  const offstage = !f.grounded && (f.x < MAIN.x1 - 4 || f.x > MAIN.x2 + 4 || f.y > MAIN.y + 20);
  if (offstage && f.state !== 'hit') {
    ai.x = f.x < STAGE.centerX ? 1 : -1; ai.y = 0;
    if (f.vy > 1 && (g.tick + f.id) % 8 === 0 && rnd(g) < L.recover) press('jump');
    if (f.char === 'lostboy' || (f.char === 'thief' && f.vy > 2 && !f.carpetUsed)) { if (rnd(g) < L.recover * 0.3) press('spc'); }
    if (f.char === 'lostboy' && f.vy > 0) ai.pulse.spc = 3;
    return emit();
  }
  if (g.tick < ai.next) return emit();
  ai.next = g.tick + L.think + ((rnd(g) * 3) | 0);

  // choose target
  let t = null, bd = 1e9;
  for (const o of g.fighters) {
    if (o === f || o.state === 'dead' || o.state === 'out') continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 0.7;
    if (d < bd) { bd = d; t = o; }
  }
  ai.y = 0;
  if (!t) { ai.x = 0; return emit(); }
  const dx = t.x - f.x, dy = t.y - f.y, adx = Math.abs(dx);
  const C = CHARS[f.char];
  const range = RANGED[f.char] && rnd(g) < 0.5 ? RANGED[f.char] : 55;

  // movement toward target, keep spacing
  if (rnd(g) < L.aggro) ai.x = adx > range ? Math.sign(dx) * (f.diff === 'easy' ? 0.7 : 1) : (adx < range * 0.5 && range > 100 ? -Math.sign(dx) : 0);
  else ai.drift = (rnd(g) - 0.5) * 2, ai.x = ai.drift;
  // edge awareness
  const nx = f.x + ai.x * 60;
  if (f.grounded && (nx < MAIN.x1 + 10 || nx > MAIN.x2 - 10) && rnd(g) < L.edge) ai.x = f.x < STAGE.centerX ? Math.abs(ai.x) : -Math.abs(ai.x);
  // reach other platforms
  if (f.grounded && dy < -70 && rnd(g) < 0.6) press('jump');
  if (!f.grounded && f.vy > 0 && dy < -90 && f.jumps < 2 && rnd(g) < 0.3) press('jump');
  if (f.grounded && f.onThin && dy > 60 && rnd(g) < 0.5) ai.y = 1;
  if (f.blind > 0) { ai.x = (rnd(g) - 0.5) * 2; return emit(); }

  // defend
  const threat = (t.state === 'light' || t.state === 'heavy' || t.state === 'special') && adx < 110 && Math.abs(dy) < 70;
  if (threat && f.grounded && rnd(g) < L.shield * 6) { ai.shd = 14; ai.x = 0; return emit(); }

  // items
  if (f.item === 'pie' && adx < 320 && Math.abs(dy) < 90 && rnd(g) < 0.5 * L.aggro) { ai.x = Math.sign(dx) * 0.4; press('light'); return emit(); }
  if (f.item === 'ginger' && adx < 70 && Math.abs(dy) < 60) { ai.x = Math.sign(dx); press('light'); return emit(); }

  // attack
  const near = adx < 85 && Math.abs(dy) < 70;
  if (near && f.state === 'idle' && rnd(g) < L.aggro * 0.8) {
    const r = rnd(g);
    if (r < L.charge * 0.5) ai.heavy = 10 + ((rnd(g) * 30) | 0);
    else if (r < 0.7) press('light');
    else if (f.cd === 0 && safeDash(f)) { press('spc'); }
    else press('light');
    if (Math.sign(dx) !== f.face) ai.x = Math.sign(dx) * 0.4;
  } else if (RANGED[f.char] && adx > 120 && adx < RANGED[f.char] + 80 && Math.abs(dy) < 80 && f.cd === 0 && f.state === 'idle' && rnd(g) < 0.35 * L.aggro) {
    if (Math.sign(dx) === f.face) press('spc'); else ai.x = Math.sign(dx);
  } else if (f.char === 'alice' && adx < 220 && f.cd === 0 && f.sizeMode === '' && rnd(g) < 0.05) press('spc');
  else if (f.char === 'demigod' && safeDash(f) && adx > 90 && adx < 240 && f.cd === 0 && Math.sign(dx) === f.face && rnd(g) < 0.2 * L.aggro) press('spc');
  else if (f.char === 'warrior' && safeDash(f) && adx > 60 && adx < 200 && f.cd === 0 && Math.sign(dx) === f.face && rnd(g) < 0.2 * L.aggro) press('spc');
  else if (rnd(g) < 0.01) press('taunt');
  return emit();
}
