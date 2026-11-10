// Pure game simulation. No DOM, no network. Fixed 60 Hz step. y grows downward.
import { CHARS, STAGE, PHYS, MAIN, platsFor, normalizeOpts, MAX_PLAYERS } from './config.js';
import { botInput, neutralInput } from './bot.js';
import { ATTACK, METER, addMeter, chargeFraction } from './aim.js';

// ---------- pure helpers (unit tested) ----------
export function rand(g) {
  g.rs = (g.rs + 0x6D2B79F5) >>> 0;
  let t = g.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function knockback({ percent, dmg, base, scale, weight = 1 }) { return (base + (percent + dmg) * scale) / weight; }
export function hitstunFrames(kb) { return Math.max(6, Math.min(60, Math.round(kb * 2.2))); }
export function launchVector(kb, angDeg, face) { const a = (angDeg * Math.PI) / 180; return { vx: Math.cos(a) * kb * face, vy: -Math.sin(a) * kb }; }
// Launch along an aim direction with an upward lift so grounded hits still pop up.
export function aimLaunch(kb, dir) {
  let dx = dir.x, dy = dir.y - 0.35; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  return { vx: dx * kb, vy: dy * kb };
}
export function overlap(a, b) { return Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h; }
export function moveBody(b, plats, o = {}) {
  const gm = o.gravMul ?? 1, maxFall = o.maxFall ?? PHYS.maxFall;
  const prevY = b.y;
  b.vy = Math.min(b.vy + PHYS.gravity * gm, maxFall);
  b.x += b.vx; b.y += b.vy;
  b.grounded = false;
  if (b.vy >= 0) {
    for (const p of plats) {
      if (p.thin && (b.dropT || 0) > 0) continue;
      if (prevY <= p.y + 0.5 && b.y >= p.y && b.x > p.x1 - 8 && b.x < p.x2 + 8) { b.y = p.y; b.vy = 0; b.grounded = true; b.onThin = !!p.thin; break; }
    }
  }
}
export const fw = (f) => 36 * f.scale;
export const fh = (f) => 64 * f.scale;
export const hurtbox = (f) => ({ cx: f.x, cy: f.y - fh(f) / 2, w: fw(f), h: fh(f) });
export const isAlive = (f) => f.state !== 'dead' && f.state !== 'out';
export { addMeter };

// ---------- creation ----------
export function createFighter(p, idx, n) {
  const face = idx % 2 ? -1 : 1;
  return {
    id: p.id, name: p.name || ('P' + p.id), char: p.char, bot: !!p.bot, diff: p.diff || 'normal', idx,
    x: 640 + (n > 1 ? (idx / (n - 1) - 0.5) * 460 : 0), y: 200, vx: 0, vy: 0, face, aim: { x: face, y: 0 },
    grounded: false, onThin: false, jumps: 0, state: 'idle', sub: '', t: 0, percent: 0, stocks: 3,
    invuln: 90, cds: { q: 0, w: 0, e: 0 }, meter: 0, dodgeCd: 0, sizeMode: '', sizeT: 0, scale: 1, noseLen: 0, fuel: 110, carpetUsed: false,
    armorT: 0, blind: 0, floatT: 0, item: '', charge: 0, shieldHP: 100, dropT: 0, hitstun: 0, respawn: 0, wishFx: -1,
    lastHit: 0, lastHitT: 0, gliding: false, mvO: '', def: null, prev: {}, hitIds: [], ai: null,
    stats: { kos: 0, dealt: 0, pies: 0, fell: 0, steals: 0, ults: 0 },
  };
}
export function createGame({ players, opts, seed = 1 }) {
  const o = normalizeOpts(opts);
  const g = {
    tick: 0, rs: seed >>> 0, opts: o, fighters: [], ents: [], items: [], events: [], nextId: 1000,
    itemTimer: o.itemEvery, flutterTimer: o.flutterEvery, layout: 0, plats: platsFor(0),
    over: false, winner: null, reason: '', sudden: false, timeLeft: o.minutes * 3600,
  };
  players.forEach((p, i) => { const f = createFighter(p, i, players.length); f.stocks = o.stocks; g.fighters.push(f); });
  return g;
}
export function removeFighter(g, id) {
  const f = g.fighters.find((x) => x.id === id);
  if (f) { f.stocks = 0; f.state = 'out'; f.item = ''; checkOver(g); }
}

const ev = (g, type, x = 0, y = 0, v = 0) => g.events.push([g.tick, type, Math.round(x), Math.round(y), Math.round(v)]);
const dmgMul = (f) => (f.sizeMode === 'small' ? 0.7 : f.sizeMode === 'big' ? 1.3 : 1);
const wtMul = (f) => (f.sizeMode === 'small' ? 0.7 : f.sizeMode === 'big' ? 1.5 : 1);
const GINGER = { startup: 8, active: 5, recover: 16, dmg: 16, base: 9, scale: 0.16, ang: 40, w: 90, h: 70 };
const PIE = { dmg: 6, base: 5, scale: 0.08 };
const sgn = (v, d = 1) => (v > 0.15 ? 1 : v < -0.15 ? -1 : d);

// ---------- hitboxes ----------
function aimBox(f, w, h, yOff = 0.55) {
  const s = f.scale, ax = f.aim.x, ay = f.aim.y;
  const aax = Math.abs(ax), aay = Math.abs(ay);
  return {
    cx: f.x + ax * (fw(f) / 2 + (w * s) / 2 - 6), cy: f.y - fh(f) * yOff + ay * (fh(f) / 4 + (w * s) / 2),
    w: (w * aax + h * aay) * s, h: (h * aax + w * aay) * s, dir: { x: ax, y: ay },
  };
}
const pick = (mv) => ({ dmg: mv.dmg, base: mv.base, scale: mv.scale, ang: mv.ang });
export function activeHitbox(f) {
  const C = CHARS[f.char], s = f.scale, t = f.t;
  const within = (mv) => t >= mv.startup && t < mv.startup + mv.active;
  if (f.state === 'light') {
    const mv = f.mvO === 'ginger' ? GINGER : C.light;
    return within(mv) ? { ...aimBox(f, mv.w, mv.h), ...pick(mv) } : null;
  }
  if (f.state === 'heavy') {
    const mv = C.heavy;
    if (!within(mv)) return null;
    const k = 1 + f.charge * mv.chargeMul;
    return { ...aimBox(f, mv.w, mv.h), ...pick(mv), dmg: mv.dmg * k, base: mv.base * (0.8 + 0.2 * k) };
  }
  if (f.state !== 'special') return null;
  const d = f.def || {};
  switch (f.sub) {
    case 'grow': return t >= 20 && t < 28 ? { cx: f.x, cy: f.y - 25 * s, w: 190, h: 80, dmg: 14, base: 7, scale: 0.14, ang: 72, radial: true } : null;
    case 'blast': return t >= d.startup && t < d.startup + d.active ? { cx: f.x, cy: f.y - 32 * s, w: d.w * s, h: d.h * s, dmg: d.dmg, base: d.base, scale: d.scale, ang: d.ang, radial: true } : null;
    case 'nose': {
      const len = 50 + f.noseLen, ax = f.aim.x, ay = f.aim.y;
      return t >= 10 && t < 16 ? { cx: f.x + ax * (12 + len / 2), cy: f.y - fh(f) * 0.62 + ay * (len / 2), w: Math.abs(ax) * (len + 24) + 18, h: Math.abs(ay) * (len + 24) + 18, dmg: 8 + f.noseLen * 0.03, base: 4.5, scale: 0.09, dir: { x: ax, y: ay } } : null;
    }
    case 'melee': return t >= d.startup && t < d.startup + d.active ? { ...aimBox(f, d.w, d.h), dmg: d.dmg, base: d.base, scale: d.scale, steal: d.steal } : null;
    case 'dash': return d.dmg > 0 && t < d.frames ? { cx: f.x + f.aim.x * 14, cy: f.y - fh(f) * 0.5 + f.aim.y * 14, w: d.w * s, h: d.h * s, dmg: d.dmg, base: d.base, scale: d.scale, dir: d.horizontal ? { x: f.face, y: 0 } : { x: f.aim.x, y: f.aim.y }, ang: d.ang } : null;
    case 'flurry': return (t >= 3 && t < 9) ? { ...aimBox(f, 60, 34), dmg: 4, base: 3.5, scale: 0.08, ang: 35, dir: undefined, cx: f.x + f.face * 40, cy: f.y - fh(f) * 0.55 } : (t >= 15 && t < 21) ? { cx: f.x + f.face * 46, cy: f.y - fh(f) * 0.55, w: 70 * s, h: 40 * s, dmg: 5.5, base: 4.5, scale: 0.1, ang: 50 } : null;
    case 'counterstrike': return t >= 2 && t < 8 ? { cx: f.x, cy: f.y - 35, w: 160, h: 90, dmg: 9, base: 6, scale: 0.13, ang: 50, radial: true } : null;
    case 'wishblast': return t >= 0 && t < 8 ? { cx: f.x, cy: f.y - 40, w: 320, h: 160, dmg: 14, base: 9, scale: 0.15, ang: 60, radial: true } : null;
    case 'titanland': return t < 8 ? { cx: f.x, cy: f.y - 40, w: 320, h: 130, dmg: 15, base: 8, scale: 0.15, ang: 65, radial: true } : null;
    case 'whirl':
      if (t >= 56 && t < 62) return { cx: f.x, cy: f.y - 34, w: 150, h: 100, dmg: 9, base: 8, scale: 0.15, ang: 45, radial: true };
      return t % 8 < 4 ? { cx: f.x, cy: f.y - 34, w: 130, h: 90, dmg: 4, base: 3.8, scale: 0.06, ang: 70, radial: true } : null;
  }
  return null;
}

// ---------- damage ----------
export function applyHit(g, atk, vic, mv, face, src = 'melee') {
  if (!isAlive(vic) || vic.invuln > 0) return false;
  const dmg = mv.dmg * (atk ? dmgMul(atk) : 1);
  if (vic.state === 'counter' && vic.t < 22) {
    startState(vic, 'special', 'counterstrike'); vic.invuln = 12; vic.face = atk ? Math.sign(atk.x - vic.x) || vic.face : vic.face;
    ev(g, 'counter', vic.x, vic.y - 30);
    return true;
  }
  if (vic.state === 'shield') {
    vic.shieldHP -= dmg * 2.2 + 3;
    ev(g, 'hit', vic.x, vic.y - 30, 0);
    if (vic.shieldHP <= 0) { startState(vic, 'stun'); vic.shieldHP = 60; vic.vy = -6; ev(g, 'shieldbreak', vic.x, vic.y - 30); }
    return true;
  }
  if (vic.state === 'dodge') return false;
  const armored = vic.armorT > 0 || (vic.char === 'demigod' && (vic.state === 'charge' || vic.state === 'heavy' || (vic.state === 'special' && (vic.sub === 'titan' || (vic.sub === 'dash' && vic.def && vic.def.armor)))));
  const taken = armored ? dmg * 0.5 : dmg;
  vic.percent += taken;
  vic.meter = addMeter(vic.meter, taken * METER.taken);
  if (atk) {
    atk.stats.dealt += dmg; atk.meter = addMeter(atk.meter, dmg * METER.dealt);
    vic.lastHit = atk.id; vic.lastHitT = 240;
  }
  if (src === 'pie') { vic.blind = 60; vic.stats.pies++; }
  if (atk && vic.item && !atk.item && (atk.char === 'outlaw' || mv.steal)) { atk.item = vic.item; vic.item = ''; atk.stats.steals++; ev(g, 'pick', vic.x, vic.y - 40); }
  if (atk && mv.steal) { const m = Math.min(vic.meter, 25); vic.meter -= m; atk.meter = addMeter(atk.meter, m); }
  if (armored) { ev(g, 'hit', vic.x, vic.y - 30, 3); return true; }
  const weight = CHARS[vic.char].weight * wtMul(vic);
  const kb = knockback({ percent: vic.percent - taken, dmg: taken, base: mv.base, scale: mv.scale, weight });
  let lv;
  if (mv.dir) { lv = aimLaunch(kb, mv.dir); if (vic.grounded && lv.vy > 0) lv.vy = -kb * 0.35; }
  else lv = launchVector(kb, mv.ang ?? 40, face);
  vic.vx = lv.vx; vic.vy = lv.vy; vic.grounded = false;
  startState(vic, 'hit'); vic.hitstun = hitstunFrames(kb); vic.floatT = 0; vic.charge = 0;
  ev(g, 'hit', vic.x, vic.y - 30, kb);
  return true;
}
function startState(f, state, sub = '') { f.state = state; f.sub = sub; f.t = 0; f.hitIds = []; }

// ---------- KO / respawn ----------
function ko(g, f) {
  const credit = f.lastHitT > 0 ? g.fighters.find((x) => x.id === f.lastHit) : null;
  if (credit) credit.stats.kos++; else f.stats.fell++;
  ev(g, 'ko', Math.max(STAGE.blast.l + 40, Math.min(STAGE.blast.r - 40, f.x)), Math.max(STAGE.blast.t + 40, Math.min(STAGE.blast.b - 40, f.y)), f.id);
  f.stocks--; f.percent = 0; f.item = ''; f.sizeMode = ''; f.noseLen = 0; f.blind = 0; f.charge = 0; f.vx = f.vy = 0; f.armorT = 0; f.floatT = 0;
  if (f.stocks > 0) { f.state = 'dead'; f.t = 0; f.respawn = 75; } else { f.state = 'out'; checkOver(g); }
}
function respawn(g, f) {
  f.x = 640 + (rand(g) - 0.5) * 300; f.y = 60; f.vx = f.vy = 0; f.state = 'idle'; f.sub = ''; f.t = 0;
  f.invuln = 150; f.scale = 1; f.fuel = 110; f.jumps = 1; f.carpetUsed = false; f.lastHitT = 0;
  ev(g, 'respawn', f.x, f.y);
}
export function checkOver(g) {
  if (g.over) return;
  const alive = g.fighters.filter((f) => f.stocks > 0);
  if (g.fighters.length >= 2 && alive.length <= 1) { g.over = true; g.winner = alive[0] ? alive[0].id : null; g.reason = 'last'; ev(g, 'win', 640, 300, g.winner || 0); }
}
function suddenDeath(g) {
  g.sudden = true;
  for (const f of g.fighters) if (f.stocks > 0) { f.stocks = 1; f.percent = 300; f.invuln = Math.max(f.invuln, 60); }
  ev(g, 'flutter', 640, 200);
}

function spawnEnt(g, k, o) { const e = { id: g.nextId++, k, t: 0, life: 90, hit: [], grav: 0, r: 14, ...o }; g.ents.push(e); return e; }
const enemies = (g, f) => g.fighters.filter((o) => o !== f && isAlive(o));

// ---------- per-fighter step ----------
function stepFighter(g, f, inp) {
  const C = CHARS[f.char], pr = f.prev;
  const P = (k) => inp[k] && !pr[k];
  const rel = (k) => !inp[k] && pr[k];
  f.prev = { jump: !!inp.jump, atk: !!inp.atk, q: !!inp.q, w: !!inp.w, e: !!inp.e, r: !!inp.r, shd: !!inp.shd, taunt: !!inp.taunt };
  if (f.state === 'out') return;
  if (f.state === 'dead') { if (--f.respawn <= 0) respawn(g, f); return; }
  const aim = { x: inp.ax, y: inp.ay };
  if (Math.hypot(aim.x, aim.y) < 0.1) { aim.x = f.face; aim.y = 0; }

  if (f.invuln > 0) f.invuln--;
  for (const k of ['q', 'w', 'e']) if (f.cds[k] > 0) f.cds[k]--;
  if (f.dodgeCd > 0) f.dodgeCd--; if (f.dropT > 0) f.dropT--; if (f.blind > 0) f.blind--; if (f.lastHitT > 0) f.lastHitT--;
  if (f.armorT > 0) f.armorT--;
  if (f.sizeT > 0 && --f.sizeT === 0) f.sizeMode = '';
  const tgtScale = f.sizeMode === 'small' ? 0.62 : f.sizeMode === 'big' ? 1.55 : 1;
  f.scale += (tgtScale - f.scale) * 0.2;
  const sp = C.speed * (f.sizeMode === 'small' ? 1.35 : f.sizeMode === 'big' ? 0.7 : 1);
  const ax = Math.abs(inp.x) < 0.15 ? 0 : inp.x;
  let gravMul = 1, maxFall = PHYS.maxFall;
  f.gliding = false;
  f.t++;
  const faceAim = () => { if (Math.abs(f.aim.x) > 0.2) f.face = f.aim.x > 0 ? 1 : -1; };

  const control = (accG, accA) => {
    f.vx += (ax * sp - f.vx) * (f.grounded ? accG : accA);
    if (ax === 0 && f.grounded) f.vx *= 0.75;
    if (Math.abs(ax) > 0.3) f.face = ax > 0 ? 1 : -1;
  };
  const tryJump = () => {
    if (!P('jump')) return;
    if (f.grounded) { f.vy = -C.jump; f.grounded = false; f.jumps = 1; ev(g, 'jump', f.x, f.y); }
    else if (f.jumps < 2) { f.vy = -C.dj; f.jumps = 2; ev(g, 'dj', f.x, f.y); }
  };
  const launchAttack = (state, mvO = '') => { startState(f, state); f.mvO = mvO; f.aim = aim; faceAim(); };

  switch (f.state) {
    case 'hit':
      f.vx *= PHYS.hitDrag; gravMul = f.floatT > 0 ? 0 : PHYS.hitGravMul;
      if (f.floatT > 0) { f.floatT--; f.vy = f.vy * 0.9 - 0.08; f.vx *= 0.95; if (f.floatT === 0) ev(g, 'pop', f.x, f.y - 30); }
      if (--f.hitstun <= 0 && f.floatT <= 0) startState(f, 'idle');
      if (f.grounded) f.vx *= 0.9;
      break;
    case 'stun': f.vx *= 0.85; if (f.t >= 100) startState(f, 'idle'); break;
    case 'idle': {
      control(0.3, 0.12);
      if (ax === 0 && !f.grounded) f.vx *= 0.995;
      tryJump();
      if (inp.y > 0.65 && f.grounded && f.onThin) { f.dropT = 14; f.grounded = false; }
      if (inp.y > 0.65 && !f.grounded && f.vy > 0) maxFall = PHYS.fastFall;
      if (f.char === 'lostboy' && !f.grounded && inp.w && f.fuel > 0 && f.vy > -1) { f.gliding = true; f.fuel--; gravMul = 0.25; maxFall = 1.8; f.vx += ax * 0.35; }
      if (P('shd') && f.dodgeCd === 0) {
        if (f.grounded && Math.abs(ax) < 0.5) startState(f, 'shield');
        else { startState(f, 'dodge'); f.invuln = Math.max(f.invuln, 16); f.dodgeCd = 40; f.vx = (ax || f.face) * 7; if (!f.grounded) f.vy = inp.y * 4; }
        break;
      }
      if (P('atk')) {
        if (f.item === 'pie') {
          startState(f, 'throw'); f.item = ''; f.aim = aim; faceAim();
          spawnEnt(g, 'pie', { owner: f.id, x: f.x + aim.x * 20, y: f.y - 40 * f.scale + aim.y * 20, vx: aim.x * 9 + f.vx * 0.3, vy: aim.y * 9 - 2, grav: 0.35, life: 120, r: 16, mv: PIE });
          ev(g, 'throw', f.x, f.y);
        } else if (f.item === 'ginger') { launchAttack('light', 'ginger'); f.item = ''; }
        else { startState(f, 'charge'); f.mvO = ''; f.aim = aim; f.charge = 0; faceAim(); }
        break;
      }
      for (const k of ['r', 'q', 'w', 'e']) if (P(k) && startAbility(g, f, k, aim)) break;
      if (f.state !== 'idle') break;
      if (P('taunt') && f.grounded) { startState(f, 'taunt'); if (f.char === 'wooden') f.noseLen = Math.min(200, f.noseLen + 30); }
      break;
    }
    case 'taunt': control(0.3, 0.12); f.vx *= 0.8; if (f.t >= 24) startState(f, 'idle'); break;
    case 'throw': control(0.2, 0.1); if (f.t >= 10) startState(f, 'idle'); break;
    case 'light': {
      control(0.1, 0.08); if (f.grounded) f.vx *= 0.8;
      const mv = f.mvO === 'ginger' ? GINGER : C.light;
      if (f.t >= mv.startup + mv.active + mv.recover) startState(f, 'idle');
      break;
    }
    case 'charge': { // press = start; quick release = light; hold then release = charged heavy toward the cursor
      control(0.1, 0.06); if (f.grounded) f.vx *= 0.8;
      f.aim = aim; faceAim();
      f.charge = chargeFraction(f.t);
      if (!inp.atk && f.t < ATTACK.tap) { launchAttack('light'); }
      else if (!inp.atk || f.t >= ATTACK.tap + ATTACK.chargeFrames) { const c = chargeFraction(f.t); launchAttack('heavy'); f.charge = c; }
      break;
    }
    case 'heavy':
      control(0.08, 0.06); if (f.grounded) f.vx *= 0.8;
      if (f.t >= C.heavy.startup + C.heavy.active + C.heavy.recover) startState(f, 'idle');
      break;
    case 'shield':
      f.vx *= 0.7; f.shieldHP -= 0.5;
      if (!inp.shd || !f.grounded) startState(f, 'idle');
      else if (f.shieldHP <= 0) { startState(f, 'stun'); f.shieldHP = 60; ev(g, 'shieldbreak', f.x, f.y - 30); }
      break;
    case 'dodge': f.vx *= 0.9; if (!f.grounded) { f.vy *= 0.8; gravMul = 0.2; } if (f.t >= 20) startState(f, 'idle'); break;
    case 'counter': f.vx *= 0.7; if (f.t >= 40) startState(f, 'idle'); break;
    case 'special': ({ gravMul, maxFall } = stepSpecial(g, f, inp, C, gravMul, maxFall)); break;
  }
  if (f.state !== 'shield' && f.shieldHP < 100) f.shieldHP = Math.min(100, f.shieldHP + 0.3);
  if (f.grounded) { f.fuel = 110; f.carpetUsed = false; }

  moveBody(f, g.plats, { gravMul, maxFall });
  if (f.grounded) f.jumps = 0;

  for (const it of g.items) {
    if (it.taken || f.state === 'hit') continue;
    if (overlap(hurtbox(f), { cx: it.x, cy: it.y - 12, w: 30, h: 30 })) {
      if (it.kind === 'tea') { f.percent = Math.max(0, f.percent - 15); it.taken = true; ev(g, 'heal', f.x, f.y - 40); }
      else if (!f.item) { f.item = it.kind; it.taken = true; ev(g, 'pick', f.x, f.y - 40); }
    }
  }
  const B = STAGE.blast;
  if (f.x < B.l || f.x > B.r || f.y > B.b || f.y < B.t) ko(g, f);
}

// ---------- abilities ----------
export function abilityDef(f, key) { return CHARS[f.char].kit[key]; }
// Returns true if the ability started. Q/W/E use per-key cooldowns; R spends a full ultimate meter.
export function startAbility(g, f, key, aim) {
  const d = abilityDef(f, key);
  if (!d) return false;
  if (key === 'r') { if (f.meter < METER.max) return false; }
  else if (f.cds[key] > 0) return false;
  if (d.type === 'glide') return false;                       // handled while held
  if (d.carpet && !f.grounded && f.carpetUsed) return false;
  if (d.type === 'shadow' || d.type === 'melee' || d.type === 'dash' || d.type === 'proj' || d.type === 'flurry' || d.type === 'nose' || d.type === 'wave' || d.type === 'zone') { f.aim = aim; if (Math.abs(aim.x) > 0.2) f.face = aim.x > 0 ? 1 : -1; }
  else f.aim = aim;
  if (key === 'r') { f.meter = 0; f.stats.ults++; ev(g, 'ult', f.x, f.y - 40, f.id); } else f.cds[key] = d.cd;
  f.def = d;
  if (d.type === 'counter') { startState(f, 'counter'); return true; }
  if (d.type === 'ult') { startState(f, 'special', 'ult'); return true; }
  startState(f, 'special', d.type);
  if (d.type === 'shrink') { f.sizeMode = f.sizeMode === 'small' ? '' : 'small'; f.sizeT = f.sizeMode ? 300 : 0; }
  if (d.type === 'grow') f.vx = 0;
  if (d.carpet && !f.grounded) { f.carpetUsed = true; ev(g, 'carpet', f.x, f.y); }
  if (d.type === 'melee' && d.lunge) f.vx += f.aim.x * d.lunge;
  return true;
}

function stepSpecial(g, f, inp, C, gravMul, maxFall) {
  const t = f.t, d = f.def || {};
  const done = (n) => { if (t >= n) { f.vx *= 0.5; startState(f, 'idle'); } };
  f.vx *= f.grounded ? 0.8 : 0.97;
  const face = f.face, ax = f.aim.x, ay = f.aim.y;
  switch (f.sub) {
    case 'shrink': done(10); break;
    case 'grow': f.sizeMode = 'big'; f.sizeT = Math.max(f.sizeT, 70); done(50); break;
    case 'shadow': if (t === 4) spawnEnt(g, 'shadow', { owner: f.id, x: f.x + face * 110, y: f.y, face, life: 28 }); done(16); break;
    case 'nose': done(32); break;
    case 'blast': done(d.startup + d.active + d.recover); break;
    case 'melee': done(d.startup + d.active + d.recover); break;
    case 'dash': {
      if (t < d.frames) {
        if (d.horizontal) f.vx = face * d.speed; else { f.vx = ax * d.speed; f.vy = ay * d.speed; gravMul = 0; maxFall = 99; }
        if (d.invuln) f.invuln = Math.max(f.invuln, 2);
        if (d.carpet) f.carpetUsed = true;
      } else if (t === d.frames) { f.vx *= 0.4; f.vy = Math.min(f.vy, 1) * 0.3; if (d.size) { f.sizeMode = d.size; f.sizeT = d.sizeT; } }
      done(d.frames + 6);
      break;
    }
    case 'proj':
      if (t === (d.at || 8)) {
        for (let i = 0; i < d.n; i++) {
          const a = Math.atan2(ay, ax) + (i - (d.n - 1) / 2) * d.spread;
          const e = spawnEnt(g, d.kind, { owner: f.id, x: f.x + Math.cos(a) * 20, y: f.y - 38 * f.scale + Math.sin(a) * 20, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed, grav: d.grav, life: d.life, r: d.r, mv: { dmg: d.dmg, base: d.base, scale: d.scale } });
          if (d.kind === 'bubble') e.trap = true;
        }
        ev(g, 'shoot', f.x, f.y);
      }
      done(d.end || 22); break;
    case 'zone':
      if (t === (d.at || 6)) { const dir = f.face; spawnEnt(g, 'zone', { owner: f.id, x: f.x + dir * d.ahead, y: f.y - d.h / 2, w: d.w, h: d.h, sty: d.style, life: d.life }); }
      done(16); break;
    case 'buff':
      if (t === 5) { if (d.armor) f.armorT = Math.max(f.armorT, d.armor); ev(g, 'pick', f.x, f.y - 40); }
      done(14); break;
    case 'flurry': f.vx = (t < 10 || (t >= 14 && t < 24)) ? f.face * 7 : f.vx * 0.6; if (t === 14) f.hitIds = []; done(32); break;
    case 'wave':
      if (t === 6) spawnEnt(g, 'card', { owner: f.id, x: f.x + f.face * 30, y: MAIN.y, vx: f.face * 5.5, w: 70, h: 130, sty: 'wave', life: 110, mv: { dmg: 8, base: 6, scale: 0.12, ang: 55 } });
      done(18); break;
    case 'counterstrike': done(22); break;
    case 'ult': stepUlt(g, f, d); break;
    case 'wishblast': done(16); break;
    case 'titan':
      f.invuln = Math.max(f.invuln, 1); gravMul = 0; maxFall = 99;
      if (t < 16) { f.vy = -13; f.vx = f.aim.x * 3; }
      else { f.vy = 17; f.vx = f.aim.x * 2; if (f.grounded || t > 90) { startState(f, 'special', 'titanland'); f.vy = 0; ev(g, 'hit', f.x, f.y, 14);
        spawnEnt(g, 'card', { owner: f.id, x: f.x - 30, y: f.y, vx: -6, w: 50, h: 60, sty: 'wave', life: 40, mv: { dmg: 7, base: 5, scale: 0.1, ang: 55 } });
        spawnEnt(g, 'card', { owner: f.id, x: f.x + 30, y: f.y, vx: 6, w: 50, h: 60, sty: 'wave', life: 40, mv: { dmg: 7, base: 5, scale: 0.1, ang: 55 } }); } }
      break;
    case 'titanland': done(26); break;
    case 'whirl': {
      f.invuln = Math.max(f.invuln, 2); gravMul = 0; maxFall = 99;
      const tg = enemies(g, f).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
      if (tg) { f.vx = Math.max(-5, Math.min(5, (tg.x - f.x) * 0.12)); f.vy = Math.max(-5, Math.min(5, (tg.y - 20 - f.y) * 0.12)); f.face = tg.x >= f.x ? 1 : -1; } else { f.vx *= 0.9; f.vy = 0; }
      if (t % 8 === 0) f.hitIds = [];
      if (t >= 62) { f.vy = 0; startState(f, 'idle'); }
      break;
    }
    default: startState(f, 'idle');
  }
  return { gravMul, maxFall };
}

// Ultimates (one-shot effects at fixed frames after a short wind-up)
function stepUlt(g, f, d) {
  const t = f.t, dir = f.aim.x >= 0 ? 1 : -1;
  const done = (n) => { if (t >= n) startState(f, 'idle'); };
  f.vx *= 0.8;
  switch (d.id) {
    case 'stampede':
      if (t === 10) for (let i = 0; i < 5; i++) spawnEnt(g, 'card', { owner: f.id, x: (dir > 0 ? MAIN.x1 - 200 : MAIN.x2 + 200) - dir * i * 120, y: MAIN.y, vx: dir * 7, w: 56, h: 170, sty: 'card', life: 260, mv: { dmg: 10, base: 7, scale: 0.13, ang: 50 } });
      done(24); break;
    case 'rain':
      if (t === 10) for (let i = 0; i < 16; i++) spawnEnt(g, 'arrow', { owner: f.id, x: 340 + rand(g) * 600, y: -60 - rand(g) * 260, vx: 0, vy: 8 + rand(g) * 3, grav: 0.04, life: 120, r: 14, mv: { dmg: 5, base: 4.5, scale: 0.09, ang: 78 } });
      done(24); break;
    case 'swarm':
      if (t === 6) for (const v of enemies(g, f)) { const fc = rand(g) < 0.5 ? 1 : -1; spawnEnt(g, 'shadow', { owner: f.id, x: v.x - fc * 60, y: v.y, face: fc, life: 28, mv: { dmg: 12, base: 7, scale: 0.14, ang: 40 } }); }
      done(20); break;
    case 'wishes':
      if (t === 8) {
        const r = Math.floor(rand(g) * 3); f.wishFx = r; ev(g, 'wishfx', f.x, f.y - 60, r);
        if (r === 0) { startState(f, 'special', 'wishblast'); ev(g, 'wish', f.x, f.y); return; }
        if (r === 1) { f.percent = Math.max(0, f.percent - 35); f.invuln = 180; ev(g, 'heal', f.x, f.y - 40); }
        else for (const v of enemies(g, f)) spawnEnt(g, 'pie', { owner: f.id, x: v.x, y: Math.min(v.y - 320, 100), vx: 0, vy: 6, grav: 0.35, life: 120, r: 16, mv: PIE });
      }
      done(22); break;
    case 'titan': startState(f, 'special', 'titan'); f.def = d; break;
    case 'whirl': startState(f, 'special', 'whirl'); f.def = d; break;
    case 'realboy':
      if (t === 6) { f.sizeMode = 'big'; f.sizeT = 420; f.armorT = 420; f.noseLen = 200; f.percent = Math.max(0, f.percent - 25); ev(g, 'heal', f.x, f.y - 40); }
      done(18); break;
    case 'parade':
      if (t === 8) for (const v of enemies(g, f)) if (v.invuln <= 0 && Math.abs(v.x - f.x) < 700) { v.percent += 8; startState(v, 'hit'); v.hitstun = 110; v.floatT = 110; v.vx = 0; v.vy = -1.5; v.lastHit = f.id; v.lastHitT = 240; ev(g, 'pop', v.x, v.y - 30); }
      done(22); break;
    default: startState(f, 'idle');
  }
}

// ---------- hits between fighters and entities ----------
function resolveMelee(g) {
  for (const f of g.fighters) {
    if (!isAlive(f)) continue;
    const hb = activeHitbox(f);
    if (!hb) continue;
    for (const v of g.fighters) {
      if (v === f || !isAlive(v) || f.hitIds.includes(v.id)) continue;
      if (overlap(hb, hurtbox(v))) {
        const face = hb.radial ? (v.x >= f.x ? 1 : -1) : f.face;
        if (applyHit(g, f, v, hb, face)) f.hitIds.push(v.id);
      }
    }
  }
}
const normDir = (e) => { const m = Math.hypot(e.vx, e.vy) || 1; return { x: e.vx / m, y: e.vy / m }; };
function stepEnts(g) {
  const B = STAGE.blast;
  for (const e of g.ents) {
    e.t++; e.life--;
    const owner = g.fighters.find((f) => f.id === e.owner) || null;
    if (e.k === 'shadow') {
      if (e.t >= 10 && e.t < 20) {
        const box = { cx: e.x + e.face * 30, cy: e.y - 32, w: 80, h: 34 };
        const mv = { ...(e.mv || { dmg: 6, base: 4.5, scale: 0.09, ang: 30 }) };
        for (const v of g.fighters) if (v.id !== e.owner && !e.hit.includes(v.id) && isAlive(v) && overlap(box, hurtbox(v))) if (applyHit(g, owner, v, mv, e.face)) e.hit.push(v.id);
      }
      continue;
    }
    if (e.k === 'zone') {
      const box = { cx: e.x, cy: e.y + e.h / 2 * 0 + 0, w: e.w, h: e.h };
      for (const v of g.fighters) {
        if (v.id === e.owner || !isAlive(v) || !overlap(box, hurtbox(v))) continue;
        if (e.sty === 'sand') { v.blind = Math.max(v.blind, 20); v.vx *= 0.92; }
        else if (e.sty === 'whirl' && v.state !== 'hit') { v.vx += Math.max(-0.9, Math.min(0.9, (e.x - v.x) * 0.03)); v.vy -= 0.05; }
        else if (e.sty === 'whirl') { v.vx += Math.max(-0.5, Math.min(0.5, (e.x - v.x) * 0.02)); }
      }
      continue;
    }
    if (e.k === 'card') {
      e.x += e.vx;
      const box = { cx: e.x, cy: e.y - e.h / 2, w: e.w, h: e.h };
      for (const v of g.fighters) if (v.id !== e.owner && !e.hit.includes(v.id) && isAlive(v) && overlap(box, hurtbox(v)))
        if (applyHit(g, owner, v, { ...e.mv, dir: { x: Math.sign(e.vx) || 1, y: 0 } }, Math.sign(e.vx) || 1)) e.hit.push(v.id);
      if (e.x < B.l || e.x > B.r) e.life = 0;
      continue;
    }
    e.vy += e.grav;
    const py = e.y; e.x += e.vx; e.y += e.vy;
    if (e.k === 'pie' && e.vy > 0) for (const p of g.plats) if (py <= p.y && e.y >= p.y && e.x > p.x1 && e.x < p.x2) { e.life = 0; ev(g, 'splat', e.x, p.y); }
    for (const v of g.fighters) {
      if (e.life <= 0) break;
      if (v.id === e.owner || !isAlive(v) || !overlap({ cx: e.x, cy: e.y, w: e.r * 2, h: e.r * 2 }, hurtbox(v))) continue;
      if (e.trap) {
        if (v.invuln > 0) continue;
        v.percent += 6; startState(v, 'hit'); v.hitstun = 80; v.floatT = 80; v.vx = 0; v.vy = -1.5; v.lastHit = e.owner; v.lastHitT = 240;
        if (owner) owner.meter = addMeter(owner.meter, 6 * METER.dealt);
        ev(g, 'hit', v.x, v.y - 30, 2); e.life = 0; ev(g, 'pop', e.x, e.y);
      } else {
        const mv = { ...(e.mv || { dmg: 3, base: 3.2, scale: 0.07 }) };
        if (mv.ang !== undefined) { /* fixed-angle (rain etc.) */ } else mv.dir = normDir(e);
        if (applyHit(g, owner, v, mv, e.vx >= 0 ? 1 : -1, e.k)) { e.life = 0; if (e.k === 'pie') ev(g, 'splat', e.x, e.y); }
      }
    }
    if (e.x < B.l || e.x > B.r || e.y > B.b || e.y < B.t) e.life = 0;
  }
  g.ents = g.ents.filter((e) => e.life > 0 && !(e.k === 'shadow' && e.t >= 28));
}
function stepItems(g) {
  const o = g.opts;
  if (o.items && --g.itemTimer <= 0) {
    g.itemTimer = o.itemEvery;
    if (g.items.filter((i) => !i.taken).length < 3) {
      const r = rand(g);
      const kind = r < 0.5 ? 'pie' : r < 0.8 ? 'tea' : 'ginger';
      g.items.push({ id: g.nextId++, kind, x: 380 + rand(g) * 520, y: 40, vx: 0, vy: 0, life: 1500, taken: false });
      ev(g, 'spawnitem', 640, 40);
    }
  }
  for (const it of g.items) { moveBody(it, g.plats); it.life--; if (it.y > STAGE.blast.b) it.life = 0; }
  g.items = g.items.filter((i) => !i.taken && i.life > 0);
}

// ---------- main tick ----------
// inputs: map id -> {x,y,ax,ay,jump,atk,q,w,e,r,shd,taunt}. Bots (fighter.bot) are filled automatically.
export function tick(g, inputs = {}) {
  if (g.over) return g;
  g.tick++;
  for (const f of g.fighters) {
    const inp = f.bot ? botInput(g, f) : cleanInput(inputs[f.id]);
    stepFighter(g, f, inp);
  }
  resolveMelee(g);
  stepEnts(g);
  stepItems(g);
  if (g.opts.flutter && --g.flutterTimer <= 0) { g.flutterTimer = g.opts.flutterEvery; g.layout ^= 1; g.plats = platsFor(g.layout); ev(g, 'flutter', 640, 200); }
  if (g.timeLeft > 0 && --g.timeLeft === 0) suddenDeath(g);
  if (g.events.length && g.events[0][0] < g.tick - 180) g.events = g.events.filter((e) => e[0] >= g.tick - 180);
  return g;
}
export function cleanInput(i) {
  if (!i) return neutralInput();
  const c = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return { x: c(i.x), y: c(i.y), ax: c(i.ax), ay: c(i.ay), jump: !!i.jump, atk: !!i.atk, q: !!i.q, w: !!i.w, e: !!i.e, r: !!i.r, shd: !!i.shd, taunt: !!i.taunt };
}
export { MAX_PLAYERS };
