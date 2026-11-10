// Pure game simulation. No DOM, no network. Fixed 60 Hz step. y grows downward.
import { CHARS, STAGE, PHYS, MAIN, platsFor, normalizeOpts, MAX_PLAYERS } from './config.js';
import { botInput, neutralInput } from './bot.js';

// ---------- pure helpers (unit tested) ----------
export function rand(g) {
  g.rs = (g.rs + 0x6D2B79F5) >>> 0;
  let t = g.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function knockback({ percent, dmg, base, scale, weight = 1 }) {
  return (base + (percent + dmg) * scale) / weight;
}
export function hitstunFrames(kb) { return Math.max(6, Math.min(60, Math.round(kb * 2.2))); }
export function launchVector(kb, angDeg, face) {
  const a = (angDeg * Math.PI) / 180;
  return { vx: Math.cos(a) * kb * face, vy: -Math.sin(a) * kb };
}
export function overlap(a, b) { // boxes {cx,cy,w,h}
  return Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h;
}
// Gravity + integration + one-way platform landing. Works for fighters and items.
export function moveBody(b, plats, o = {}) {
  const gm = o.gravMul ?? 1, maxFall = o.maxFall ?? PHYS.maxFall;
  const prevY = b.y;
  b.vy = Math.min(b.vy + PHYS.gravity * gm, maxFall);
  b.x += b.vx; b.y += b.vy;
  b.grounded = false;
  if (b.vy >= 0) {
    for (const p of plats) {
      if (p.thin && (b.dropT || 0) > 0) continue;
      if (prevY <= p.y + 0.5 && b.y >= p.y && b.x > p.x1 - 8 && b.x < p.x2 + 8) {
        b.y = p.y; b.vy = 0; b.grounded = true; b.onThin = !!p.thin; break;
      }
    }
  }
}
export const fw = (f) => 36 * f.scale;
export const fh = (f) => 64 * f.scale;
export const hurtbox = (f) => ({ cx: f.x, cy: f.y - fh(f) / 2, w: fw(f), h: fh(f) });
export const isAlive = (f) => f.state !== 'dead' && f.state !== 'out';
const BTN = ['jump', 'light', 'heavy', 'spc', 'shd', 'taunt'];

// ---------- creation ----------
export function createFighter(p, idx, n) {
  const f = {
    id: p.id, name: p.name || ('P' + p.id), char: p.char, bot: !!p.bot, diff: p.diff || 'normal', idx,
    x: 640 + (n > 1 ? (idx / (n - 1) - 0.5) * 460 : 0), y: 200, vx: 0, vy: 0, face: idx % 2 ? -1 : 1,
    grounded: false, onThin: false, jumps: 0, state: 'idle', sub: '', t: 0, percent: 0, stocks: 3,
    invuln: 90, cd: 0, dodgeCd: 0, sizeMode: '', sizeT: 0, scale: 1, noseLen: 0, fuel: 110, carpetUsed: false,
    wishes: 0, blind: 0, floatT: 0, item: '', charge: 0, shieldHP: 100, dropT: 0, hitstun: 0, respawn: 0,
    lastHit: 0, lastHitT: 0, gliding: false, mvO: '', counterT: 0, prev: {}, hitIds: [], ai: null,
    stats: { kos: 0, dealt: 0, pies: 0, fell: 0, steals: 0 },
  };
  return f;
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

// ---------- hitboxes ----------
export function activeHitbox(f) {
  const C = CHARS[f.char];
  const s = f.scale, face = f.face;
  const fwd = (w, h, yOff = 0.55) => ({ cx: f.x + face * (fw(f) / 2 + (w * s) / 2 - 6), cy: f.y - fh(f) * yOff, w: w * s, h: h * s });
  const within = (mv) => f.t >= mv.startup && f.t < mv.startup + mv.active;
  if (f.state === 'light') {
    const mv = f.mvO === 'ginger' ? GINGER : C.light;
    return within(mv) ? { ...fwd(mv.w, mv.h), ...pick(mv) } : null;
  }
  if (f.state === 'heavy') {
    const mv = C.heavy;
    if (!within(mv)) return null;
    const k = 1 + f.charge * mv.chargeMul;
    return { ...fwd(mv.w, mv.h), ...pick(mv), dmg: mv.dmg * k, base: mv.base * (0.8 + 0.2 * k) };
  }
  if (f.state === 'special') {
    const t = f.t;
    switch (f.sub) {
      case 'grow': return t >= 20 && t < 28 ? { cx: f.x, cy: f.y - 25 * s, w: 190, h: 80, dmg: 14, base: 7, scale: 0.14, ang: 72, radial: true } : null;
      case 'nose': { const len = 50 + f.noseLen; return t >= 10 && t < 16 ? { cx: f.x + face * (12 + len / 2), cy: f.y - fh(f) * 0.62, w: len + 24, h: 16, dmg: 8 + f.noseLen * 0.03, base: 4.5, scale: 0.09, ang: 25 } : null; }
      case 'wish': return t >= 14 && t < 22 ? { cx: f.x, cy: f.y - 40, w: 260, h: 130, dmg: 12, base: 8, scale: 0.14, ang: 60, radial: true } : null;
      case 'charge': return t >= 4 && t < 28 ? { ...fwd(56, 56), dmg: 8, base: 5, scale: 0.11, ang: 30 } : null;
      case 'flurry': return (t >= 3 && t < 9) ? { ...fwd(60, 34), dmg: 4, base: 3.5, scale: 0.08, ang: 35 } : (t >= 15 && t < 21) ? { ...fwd(70, 40), dmg: 5.5, base: 4.5, scale: 0.1, ang: 50 } : null;
      case 'counterstrike': return t >= 2 && t < 8 ? { cx: f.x, cy: f.y - 35, w: 160, h: 90, dmg: 9, base: 6, scale: 0.13, ang: 50, radial: true } : null;
    }
  }
  return null;
}
function pick(mv) { return { dmg: mv.dmg, base: mv.base, scale: mv.scale, ang: mv.ang }; }

// ---------- damage ----------
export function applyHit(g, atk, vic, mv, face, src = 'melee') {
  if (!isAlive(vic) || vic.invuln > 0) return false;
  const dmg = mv.dmg * (atk ? dmgMul(atk) : 1);
  // Warrior counter stance
  if (vic.state === 'counter' && vic.t < 22) {
    startState(vic, 'special', 'counterstrike'); vic.invuln = 12; vic.face = atk ? Math.sign(atk.x - vic.x) || vic.face : vic.face;
    ev(g, 'counter', vic.x, vic.y - 30);
    return true;
  }
  // shield
  if (vic.state === 'shield') {
    vic.shieldHP -= dmg * 2.2 + 3;
    ev(g, 'hit', vic.x, vic.y - 30, 0);
    if (vic.shieldHP <= 0) { startState(vic, 'stun'); vic.shieldHP = 60; vic.vy = -6; ev(g, 'shieldbreak', vic.x, vic.y - 30); }
    return true;
  }
  if (vic.state === 'dodge') return false;
  const armored = vic.char === 'demigod' && (vic.state === 'charge' || vic.state === 'heavy' || (vic.state === 'special' && vic.sub === 'charge'));
  vic.percent += armored ? dmg * 0.5 : dmg;
  if (atk) { atk.stats.dealt += dmg; vic.lastHit = atk.id; vic.lastHitT = 240; if (atk.char === 'thief' && atk.wishes < 3) atk.wishes++; }
  if (src === 'pie') { vic.blind = 60; vic.stats.pies++; }
  // steal
  if (atk && atk.char === 'outlaw' && vic.item && !atk.item) { atk.item = vic.item; vic.item = ''; atk.stats.steals++; ev(g, 'pick', vic.x, vic.y - 40); }
  if (armored) { ev(g, 'hit', vic.x, vic.y - 30, 3); return true; }
  const weight = CHARS[vic.char].weight * wtMul(vic);
  const kb = knockback({ percent: vic.percent - dmg, dmg, base: mv.base, scale: mv.scale, weight });
  const lv = launchVector(kb, mv.ang, face);
  vic.vx = lv.vx; vic.vy = lv.vy; vic.grounded = false;
  startState(vic, 'hit'); vic.hitstun = hitstunFrames(kb); vic.floatT = 0; vic.charge = 0;
  ev(g, 'hit', vic.x, vic.y - 30, kb);
  return true;
}

function startState(f, state, sub = '') {
  f.state = state; f.sub = sub; f.t = 0; f.hitIds = [];
}

// ---------- KO / respawn ----------
function ko(g, f) {
  const credit = f.lastHitT > 0 ? g.fighters.find((x) => x.id === f.lastHit) : null;
  if (credit) credit.stats.kos++; else f.stats.fell++;
  ev(g, 'ko', Math.max(STAGE.blast.l + 40, Math.min(STAGE.blast.r - 40, f.x)), Math.max(STAGE.blast.t + 40, Math.min(STAGE.blast.b - 40, f.y)), f.id);
  f.stocks--; f.percent = 0; f.item = ''; f.sizeMode = ''; f.noseLen = 0; f.wishes = 0; f.blind = 0; f.charge = 0; f.vx = f.vy = 0;
  if (f.stocks > 0) { f.state = 'dead'; f.t = 0; f.respawn = 75; }
  else { f.state = 'out'; checkOver(g); }
}
function respawn(g, f) {
  f.x = 640 + (rand(g) - 0.5) * 300; f.y = 60; f.vx = f.vy = 0; f.state = 'idle'; f.sub = ''; f.t = 0;
  f.invuln = 150; f.scale = 1; f.fuel = 150; f.jumps = 1; f.carpetUsed = false; f.lastHitT = 0;
  ev(g, 'respawn', f.x, f.y);
}
export function checkOver(g) {
  if (g.over) return;
  const alive = g.fighters.filter((f) => f.stocks > 0);
  if (g.fighters.length >= 2 && alive.length <= 1) { g.over = true; g.winner = alive[0] ? alive[0].id : null; g.reason = 'last'; ev(g, 'win', 640, 300, g.winner || 0); }
}
// 7-minute cap: no timer win. Sudden death: everyone to 1 stock at 300%, last one standing wins.
function suddenDeath(g) {
  g.sudden = true;
  for (const f of g.fighters) if (f.stocks > 0) { f.stocks = 1; f.percent = 300; f.invuln = Math.max(f.invuln, 60); }
  ev(g, 'flutter', 640, 200);
}

// ---------- entities ----------
function spawnEnt(g, k, o) { const e = { id: g.nextId++, k, t: 0, life: 90, hit: [], ...o }; g.ents.push(e); return e; }

// ---------- per-fighter step ----------
function stepFighter(g, f, inp) {
  const C = CHARS[f.char], pr = f.prev;
  const P = (k) => inp[k] && !pr[k];
  f.prev = { jump: !!inp.jump, light: !!inp.light, heavy: !!inp.heavy, spc: !!inp.spc, shd: !!inp.shd, taunt: !!inp.taunt };
  if (f.state === 'out') return;
  if (f.state === 'dead') { if (--f.respawn <= 0) respawn(g, f); return; }

  if (f.invuln > 0) f.invuln--; if (f.cd > 0) f.cd--; if (f.dodgeCd > 0) f.dodgeCd--; if (f.dropT > 0) f.dropT--;
  if (f.blind > 0) f.blind--; if (f.lastHitT > 0) f.lastHitT--;
  if (f.sizeT > 0 && --f.sizeT === 0) f.sizeMode = '';
  const tgtScale = f.sizeMode === 'small' ? 0.62 : f.sizeMode === 'big' ? 1.55 : 1;
  f.scale += (tgtScale - f.scale) * 0.2;
  f.charge = f.state === 'charge' ? f.charge : 0;
  const sp = C.speed * (f.sizeMode === 'small' ? 1.35 : f.sizeMode === 'big' ? 0.7 : 1);
  const ax = Math.abs(inp.x) < 0.15 ? 0 : inp.x;
  let gravMul = 1, maxFall = PHYS.maxFall, noGrav = false;
  f.gliding = false;
  f.t++;

  const control = (accG, accA) => {
    const target = ax * sp;
    f.vx += (target - f.vx) * (f.grounded ? accG : accA);
    if (ax === 0 && f.grounded) f.vx *= 0.75;
    if (Math.abs(ax) > 0.3) f.face = ax > 0 ? 1 : -1;
  };
  const tryJump = () => {
    if (!P('jump')) return;
    if (f.grounded) { f.vy = -C.jump; f.grounded = false; f.jumps = 1; ev(g, 'jump', f.x, f.y); }
    else if (f.jumps < 2) { f.vy = -C.dj; f.jumps = 2; ev(g, 'dj', f.x, f.y); }
  };

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
      if (!f.grounded) {
        // glide (Lost Boy) / carpet handled by special press
        if (f.char === 'lostboy' && inp.spc && f.fuel > 0 && f.vy > -1) { f.gliding = true; f.fuel--; gravMul = 0.25; maxFall = 1.8; f.vx += ax * 0.35; }
      }
      if (P('shd') && f.dodgeCd === 0) {
        if (f.grounded && Math.abs(ax) < 0.5) { startState(f, 'shield'); }
        else { startState(f, 'dodge'); f.invuln = Math.max(f.invuln, 16); f.dodgeCd = 40; f.vx = (ax || f.face) * 7; if (!f.grounded) f.vy = inp.y * 4; }
        break;
      }
      if (P('light')) {
        if (f.item === 'pie') { startState(f, 'throw'); f.item = ''; spawnEnt(g, 'pie', { owner: f.id, x: f.x + f.face * 20, y: f.y - 40 * f.scale, vx: f.face * 8 + f.vx * 0.3, vy: -4, life: 120 }); ev(g, 'throw', f.x, f.y); }
        else if (f.item === 'ginger') { startState(f, 'light'); f.mvO = 'ginger'; f.item = ''; }
        else { startState(f, 'light'); f.mvO = ''; }
        break;
      }
      if (P('heavy')) { startState(f, 'charge'); f.charge = 0; break; }
      if (P('taunt') && f.grounded) { startState(f, 'taunt'); if (f.char === 'wooden') f.noseLen = Math.min(200, f.noseLen + 30); break; }
      if (P('spc')) startSpecial(g, f, inp);
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
    case 'charge':
      control(0.1, 0.06); if (f.grounded) f.vx *= 0.8;
      f.charge = Math.min(1, f.t / C.heavy.chargeMax);
      if (!inp.heavy || f.t >= C.heavy.chargeMax) { const c = f.charge; startState(f, 'heavy'); f.charge = c; }
      break;
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
    case 'special': ({ gravMul, noGrav } = stepSpecial(g, f, inp, C, gravMul)); break;
  }
  if (f.state !== 'shield' && f.shieldHP < 100) f.shieldHP = Math.min(100, f.shieldHP + 0.3);
  if (f.grounded) { f.fuel = 110; f.carpetUsed = false; }

  // physics
  if (noGrav) { f.x += f.vx; f.y += f.vy; f.grounded = false; }
  else moveBody(f, g.plats, { gravMul, maxFall });
  if (f.grounded) f.jumps = 0;

  // item pickup
  for (const it of g.items) {
    if (it.taken || f.state === 'hit') continue;
    if (overlap(hurtbox(f), { cx: it.x, cy: it.y - 12, w: 30, h: 30 })) {
      if (it.kind === 'tea') { f.percent = Math.max(0, f.percent - 15); it.taken = true; ev(g, 'heal', f.x, f.y - 40); }
      else if (!f.item) { f.item = it.kind; it.taken = true; ev(g, 'pick', f.x, f.y - 40); }
    }
  }
  // blast zone
  const B = STAGE.blast;
  if (f.x < B.l || f.x > B.r || f.y > B.b || f.y < B.t) ko(g, f);
}

function startSpecial(g, f, inp) {
  const C = CHARS[f.char];
  if (f.cd > 0) return;
  const down = inp.y > 0.5;
  switch (C.special) {
    case 'sizeshift':
      if (down) { startState(f, 'special', 'grow'); f.cd = 150; f.vx = 0; }
      else { startState(f, 'special', 'shrink'); f.sizeMode = f.sizeMode === 'small' ? '' : 'small'; f.sizeT = f.sizeMode ? 300 : 0; f.cd = 60; }
      break;
    case 'shadow': if (f.grounded) { startState(f, 'special', 'shadow'); f.cd = 70; } break;
    case 'nose': startState(f, 'special', 'nose'); f.cd = 20; break;
    case 'volley': startState(f, 'special', 'volley'); f.cd = 80; break;
    case 'carpet':
      if (!f.grounded) { if (!f.carpetUsed) { startState(f, 'special', 'carpet'); f.carpetUsed = true; f.vy = -7.5; f.vx = (Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) : f.face) * 6; ev(g, 'carpet', f.x, f.y); } }
      else if (f.wishes >= 3) { startState(f, 'special', 'wish'); f.wishes = 0; f.cd = 60; ev(g, 'wish', f.x, f.y); }
      else { startState(f, 'special', 'spark'); f.cd = 40; }
      break;
    case 'charge': startState(f, 'special', 'charge'); f.cd = 80; break;
    case 'flurry':
      if (down) { startState(f, 'counter'); f.cd = 60; } else { startState(f, 'special', 'flurry'); f.cd = 70; }
      break;
    case 'bubble': startState(f, 'special', 'bubble'); f.cd = 90; break;
  }
}

function stepSpecial(g, f, inp, C, gravMul) {
  const t = f.t; let noGrav = false;
  const done = (n) => { if (t >= n) { f.vx *= 0.5; startState(f, 'idle'); } };
  f.vx *= f.grounded ? 0.8 : 0.97;
  switch (f.sub) {
    case 'shrink': done(10); break;
    case 'grow': f.sizeMode = 'big'; f.sizeT = Math.max(f.sizeT, 70); done(50); break;
    case 'shadow': if (t === 4) spawnEnt(g, 'shadow', { owner: f.id, x: f.x + f.face * 110, y: f.y, face: f.face, life: 28 }); done(16); break;
    case 'nose': done(32); break;
    case 'volley':
      if (t === 8 || t === 12 || t === 16) {
        const i = (t - 8) / 4;
        spawnEnt(g, 'arrow', { owner: f.id, x: f.x + f.face * 20, y: f.y - 38 * f.scale, vx: f.face * 13, vy: (i - 1) * 1.4, life: 60 });
        ev(g, 'shoot', f.x, f.y);
      }
      done(26); break;
    case 'carpet': noGrav = t < 14; f.vy += t < 14 ? 0.35 : 0; if (t >= 20) startState(f, 'idle'); break;
    case 'wish': done(34); break;
    case 'spark': if (t === 6) { spawnEnt(g, 'spark', { owner: f.id, x: f.x + f.face * 24, y: f.y - 36 * f.scale, vx: f.face * 10, vy: 0, life: 50 }); ev(g, 'shoot', f.x, f.y); } done(18); break;
    case 'charge': f.vx = t < 30 ? f.face * 9 : f.vx * 0.7; done(38); break;
    case 'flurry': f.vx = (t < 10 || (t >= 14 && t < 24)) ? f.face * 7 : f.vx * 0.6; if (t === 14) f.hitIds = []; done(32); break;
    case 'counterstrike': done(22); break;
    case 'bubble': if (t === 8) spawnEnt(g, 'bubble', { owner: f.id, x: f.x + f.face * 26, y: f.y - 40 * f.scale, vx: f.face * 3, vy: -0.3, life: 150 }); done(22); break;
    default: startState(f, 'idle');
  }
  return { gravMul, noGrav };
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
function stepEnts(g) {
  const B = STAGE.blast;
  for (const e of g.ents) {
    e.t++; e.life--;
    const owner = g.fighters.find((f) => f.id === e.owner) || null;
    if (e.k === 'shadow') {
      if (e.t >= 10 && e.t < 20) {
        const box = { cx: e.x + e.face * 30, cy: e.y - 32, w: 80, h: 34 };
        for (const v of g.fighters) if (v.id !== e.owner && !e.hit.includes(v.id) && isAlive(v) && overlap(box, hurtbox(v)))
          if (applyHit(g, owner, v, { dmg: 6, base: 4.5, scale: 0.09, ang: 30 }, e.face)) e.hit.push(v.id);
      }
      continue;
    }
    if (e.k === 'pie') { e.vy += 0.35; }
    if (e.k === 'arrow') e.vy += 0.04;
    if (e.k === 'bubble') { e.vy -= 0.004; e.vx *= 0.995; }
    const py = e.y; e.x += e.vx; e.y += e.vy;
    if (e.k === 'pie' && e.vy > 0) for (const p of g.plats) if (py <= p.y && e.y >= p.y && e.x > p.x1 && e.x < p.x2) { e.life = 0; ev(g, 'splat', e.x, p.y); }
    const r = e.k === 'bubble' ? 34 : e.k === 'pie' ? 16 : 14;
    for (const v of g.fighters) {
      if (e.life <= 0) break;
      if (v.id === e.owner || !isAlive(v) || !overlap({ cx: e.x, cy: e.y, w: r * 2, h: r * 2 }, hurtbox(v))) continue;
      const face = e.vx >= 0 ? 1 : -1;
      if (e.k === 'bubble') {
        if (v.invuln > 0) continue;
        v.percent += 6; startState(v, 'hit'); v.hitstun = 80; v.floatT = 80; v.vx = 0; v.vy = -1.5; v.lastHit = e.owner; v.lastHitT = 240;
        ev(g, 'hit', v.x, v.y - 30, 2); e.life = 0; ev(g, 'pop', e.x, e.y);
      } else {
        const mv = e.k === 'arrow' ? { dmg: 3, base: 3.2, scale: 0.07, ang: 18 } : e.k === 'spark' ? { dmg: 3.5, base: 3.4, scale: 0.08, ang: 25 } : { dmg: 6, base: 5, scale: 0.08, ang: 35 };
        if (applyHit(g, owner, v, mv, face, e.k)) { e.life = 0; if (e.k === 'pie') ev(g, 'splat', e.x, e.y); }
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
// inputs: map id -> {x,y,jump,light,heavy,spc,shd,taunt}. Bots (fighter.bot) are filled automatically.
export function tick(g, inputs = {}) {
  if (g.over) return g;
  g.tick++;
  for (const f of g.fighters) {
    let inp = inputs[f.id];
    if (f.bot) inp = botInput(g, f);
    else inp = cleanInput(inp);
    stepFighter(g, f, inp);
  }
  resolveMelee(g);
  stepEnts(g);
  stepItems(g);
  if (g.opts.flutter && --g.flutterTimer <= 0) { g.flutterTimer = g.opts.flutterEvery; g.layout ^= 1; g.plats = platsFor(g.layout); ev(g, 'flutter', 640, 200); }
  if (g.timeLeft > 0 && --g.timeLeft === 0) suddenDeath(g);
  // trim old events
  if (g.events.length && g.events[0][0] < g.tick - 180) g.events = g.events.filter((e) => e[0] >= g.tick - 180);
  return g;
}
export function cleanInput(i) {
  if (!i) return neutralInput();
  const c = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return { x: c(i.x), y: c(i.y), jump: !!i.jump, light: !!i.light, heavy: !!i.heavy, spc: !!i.spc, shd: !!i.shd, taunt: !!i.taunt };
}
export { MAX_PLAYERS };
