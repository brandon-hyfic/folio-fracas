// Bot AI with 3 difficulty levels. Uses each fighter's own Q/W/E/R kit. Deterministic (game RNG). No DOM.
import { CHARS, MAIN, STAGE } from './config.js';
import { METER } from './aim.js';

export const neutralInput = () => ({ x: 0, y: 0, ax: 0, ay: 0, jump: false, atk: false, q: false, w: false, e: false, r: false, shd: false, taunt: false });

const LEVELS = {
  easy:   { think: 14, aggro: 0.35, edge: 0.55, recover: 0.65, shield: 0.01, charge: 0.1, abil: 0.35 },
  normal: { think: 8,  aggro: 0.7,  edge: 0.85, recover: 0.9,  shield: 0.04, charge: 0.25, abil: 0.7 },
  hard:   { think: 3,  aggro: 1.0,  edge: 1.0,  recover: 1.0,  shield: 0.1,  charge: 0.4, abil: 1.0 },
};
const rnd = (g) => { g.rs = (g.rs + 0x6D2B79F5) >>> 0; let t = g.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const norm = (dx, dy) => { const m = Math.hypot(dx, dy) || 1; return { x: dx / m, y: dy / m }; };
// How far a dash travels, to avoid dashing off the page.
const dashLen = (d) => d.frames * d.speed;

export function botInput(g, f) {
  const L = LEVELS[f.diff] || LEVELS.normal;
  const ai = f.ai || (f.ai = { x: 0, y: 0, ax: 1, ay: 0, pulse: {}, heavy: 0, shd: 0, next: 0 });
  const inp = neutralInput();
  const emit = () => {
    inp.x = ai.x; inp.y = ai.y; inp.ax = ai.ax; inp.ay = ai.ay;
    for (const k of ['jump', 'atk', 'q', 'w', 'e', 'r', 'taunt']) if (ai.pulse[k] > 0) { inp[k] = ai.pulse[k] > 1; ai.pulse[k]--; }
    if (ai.heavy > 0) { inp.atk = true; ai.heavy--; }
    if (ai.shd > 0) { inp.shd = true; ai.shd--; }
    // hold-type abilities
    if (ai.hold && ai.hold > 0) { inp[ai.holdKey] = true; ai.hold--; }
    return inp;
  };
  const press = (k) => { ai.pulse[k] = 3; };
  const kit = CHARS[f.char].kit;
  const keys = ['q', 'w', 'e'];
  if (f.state === 'dead' || f.state === 'out') return inp;

  // Recovery runs every frame
  const offstage = !f.grounded && (f.x < MAIN.x1 - 4 || f.x > MAIN.x2 + 4 || f.y > MAIN.y + 20);
  if (offstage && f.state !== 'hit') {
    ai.x = f.x < STAGE.centerX ? 1 : -1; ai.y = 0;
    const toC = norm(STAGE.centerX - f.x, MAIN.y - 80 - f.y); ai.ax = toC.x; ai.ay = toC.y;
    if (f.vy > 1 && (g.tick + f.id) % 8 === 0 && rnd(g) < L.recover) press('jump');
    for (const k of keys) {
      const d = kit[k];
      if (d.type === 'glide' && f.vy > 0) { ai.hold = 3; ai.holdKey = k; }
      else if (d.rec && d.type !== 'glide' && f.cds[k] === 0 && f.jumps >= 2 && f.vy > 1 && rnd(g) < L.recover * 0.4 && !(d.carpet && f.carpetUsed)) press(k);
    }
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
  const a = norm(dx, dy - 32 + 32 * 0); ai.ax = a.x; ai.ay = a.y;   // aim at the target
  const ranged = kit.q.type === 'proj' || kit.e.type === 'proj' || kit.w.type === 'proj';
  const range = ranged && rnd(g) < 0.5 ? 260 : 55;

  if (rnd(g) < L.aggro) ai.x = adx > range ? Math.sign(dx) * (f.diff === 'easy' ? 0.7 : 1) : (adx < range * 0.5 && range > 100 ? -Math.sign(dx) : 0);
  else ai.x = (rnd(g) - 0.5) * 2;
  const nx = f.x + ai.x * 60;
  if (f.grounded && (nx < MAIN.x1 + 10 || nx > MAIN.x2 - 10) && rnd(g) < L.edge) ai.x = f.x < STAGE.centerX ? Math.abs(ai.x) : -Math.abs(ai.x);
  if (f.grounded && dy < -70 && rnd(g) < 0.6) press('jump');
  if (!f.grounded && f.vy > 0 && dy < -90 && f.jumps < 2 && rnd(g) < 0.3) press('jump');
  if (f.grounded && f.onThin && dy > 60 && rnd(g) < 0.5) ai.y = 1;
  if (f.blind > 0) { ai.x = (rnd(g) - 0.5) * 2; return emit(); }

  const threat = (t.state === 'light' || t.state === 'heavy' || t.state === 'special') && adx < 110 && Math.abs(dy) < 70;
  if (threat && f.grounded && rnd(g) < L.shield * 6) { ai.shd = 14; ai.x = 0; return emit(); }

  if (f.item === 'pie' && adx < 320 && Math.abs(dy) < 120 && rnd(g) < 0.5 * L.aggro) { press('atk'); return emit(); }
  if (f.item === 'ginger' && adx < 80 && Math.abs(dy) < 60) { press('atk'); return emit(); }
  if (f.state !== 'idle') return emit();

  // Ultimate: when meter is full and rivals are in range
  const rd = kit.r;
  if (f.meter >= METER.max && adx <= rd.rng[1] && rnd(g) < 0.3 * L.abil + 0.1) { press('r'); return emit(); }

  // abilities from the kit
  if (rnd(g) < L.abil * 0.6) {
    const k = keys[(rnd(g) * 3) | 0], d = kit[k];
    if (f.cds[k] === 0 && d.rng) {
      const [lo, hi] = d.rng, inR = adx >= lo && adx <= hi && Math.abs(dy) < (d.type === 'proj' ? 90 : 80);
      const facing = Math.sign(dx) === f.face;
      let use = false;
      switch (d.type) {
        case 'shrink': use = adx < 220 && f.sizeMode === ''; break;
        case 'grow': case 'blast': case 'melee': case 'nose': case 'shadow': case 'flurry': case 'counter': use = inR; break;
        case 'dash': use = d.dmg > 0 && inR && (!d.horizontal || (facing && f.x + Math.sign(dx) * dashLen(d) > MAIN.x1 - 10 && f.x + Math.sign(dx) * dashLen(d) < MAIN.x2 + 10)) && f.x + a.x * dashLen(d) > MAIN.x1 - 10 && f.x + a.x * dashLen(d) < MAIN.x2 + 10; break;
        case 'proj': case 'zone': case 'wave': use = inR; break;
        case 'buff': use = adx < 160 && f.armorT === 0; break;
      }
      if (use) { press(k); if (d.type === 'counter') ai.shd = 0; return emit(); }
    }
  }

  // basic attack: tap for light, hold for charged heavy
  const near = adx < 85 && Math.abs(dy) < 70;
  if (near && rnd(g) < L.aggro * 0.8) {
    if (rnd(g) < L.charge * 0.5) ai.heavy = 14 + ((rnd(g) * 30) | 0); else press('atk');
  } else if (rnd(g) < 0.01) press('taunt');
  return emit();
}
