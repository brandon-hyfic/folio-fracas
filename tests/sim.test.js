import { test, expect } from 'bun:test';
import { knockback, hitstunFrames, launchVector, moveBody, createGame, tick, applyHit, removeFighter, activeHitbox, overlap, aimLaunch } from '../js/sim.js';
import { aimFromPoints, packAim, unpackAim, chargeFraction, addMeter, ATTACK, METER } from '../js/aim.js';
import { CHARS, CHAR_IDS } from '../js/config.js';
import { encodeInput, decodeInput } from '../js/input.js';
import { MAIN, LAYOUTS } from '../js/config.js';
import { encodeSnapshot, decodeSnapshot, lerpView } from '../js/snapshot.js';
import { computeAwards } from '../js/awards.js';

const mk = (n = 2, opts = {}, chars = ['alice', 'wooden', 'lostboy', 'outlaw', 'thief', 'demigod', 'warrior', 'sea']) =>
  createGame({ players: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), char: chars[i % 8] })), opts: { items: false, flutter: false, ...opts }, seed: 7 });
const settle = (g, n = 120) => { for (let i = 0; i < n; i++) tick(g, {}); };

test('knockback grows with percent and shrinks with weight', () => {
  const a = knockback({ percent: 0, dmg: 5, base: 4, scale: 0.1 });
  const b = knockback({ percent: 100, dmg: 5, base: 4, scale: 0.1 });
  expect(b).toBeGreaterThan(a);
  expect(knockback({ percent: 50, dmg: 5, base: 4, scale: 0.1, weight: 1.4 })).toBeLessThan(knockback({ percent: 50, dmg: 5, base: 4, scale: 0.1, weight: 1 }));
  expect(a).toBeCloseTo(4.5);
});
test('hitstun clamps and launch vector direction', () => {
  expect(hitstunFrames(0)).toBe(6); expect(hitstunFrames(1000)).toBe(60);
  const v = launchVector(10, 45, -1);
  expect(v.vx).toBeLessThan(0); expect(v.vy).toBeLessThan(0);
});
test('physics: gravity lands on solid page; thin page is pass-through from below', () => {
  const b = { x: 600, y: 300, vx: 0, vy: 0, dropT: 0 };
  for (let i = 0; i < 100; i++) moveBody(b, [MAIN]);
  expect(b.y).toBe(MAIN.y); expect(b.grounded).toBe(true);
  const thin = { x1: 0, x2: 200, y: 300, thin: true };
  const up = { x: 100, y: 400, vx: 0, vy: -15, dropT: 0 };
  for (let i = 0; i < 10; i++) moveBody(up, [thin]);
  expect(up.y).toBeLessThan(300);
  const drop = { x: 100, y: 300, vx: 0, vy: 0, dropT: 10 };
  moveBody(drop, [thin]); expect(drop.grounded).toBe(false);
});
test('damage raises knockback; invulnerable fighters are immune', () => {
  const g = mk(); settle(g, 150);
  const [a, b] = g.fighters;
  const mv = { dmg: 5, base: 4, scale: 0.1, ang: 40 };
  b.invuln = 0; b.state = 'idle';
  applyHit(g, a, b, mv, 1); const v1 = Math.hypot(b.vx, b.vy); expect(b.percent).toBe(5);
  b.state = 'idle'; b.percent = 150;
  applyHit(g, a, b, mv, 1); expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(v1);
  b.state = 'idle'; b.invuln = 30; const p = b.percent;
  expect(applyHit(g, a, b, mv, 1)).toBe(false); expect(b.percent).toBe(p);
});
test('stocks and respawn invulnerability', () => {
  const g = mk(3); settle(g, 150);
  const f = g.fighters[0]; f.x = 5000; tick(g, {});
  expect(f.stocks).toBe(2); expect(f.state).toBe('dead'); expect(f.percent).toBe(0);
  for (let i = 0; i < 80; i++) tick(g, {});
  expect(f.state).toBe('idle'); expect(f.invuln).toBeGreaterThan(100);
});
test('last stock out eliminates; last survivor wins', () => {
  const g = mk(2); settle(g, 150);
  const f = g.fighters[0]; f.stocks = 1; f.y = 5000; tick(g, {});
  expect(f.state).toBe('out'); expect(g.over).toBe(true); expect(g.winner).toBe(2);
});
test('disconnect removes fighter, match continues with others', () => {
  const g = mk(3); settle(g, 10); removeFighter(g, 2);
  expect(g.over).toBe(false); expect(g.fighters.find((f) => f.id === 2).state).toBe('out');
  removeFighter(g, 3); expect(g.over).toBe(true); expect(g.winner).toBe(1);
});
test('7-minute cap triggers sudden death (no timer win)', () => {
  const g = mk(3); settle(g, 150); g.fighters[1].stocks = 2; g.timeLeft = 1; tick(g, {});
  expect(g.sudden).toBe(true); expect(g.over).toBe(false);
  expect(g.fighters.every((f) => f.stocks === 1 && f.percent === 300)).toBe(true);
  g.fighters[0].y = 5000; tick(g, {}); g.fighters[2].y = 5000; tick(g, {});
  expect(g.over).toBe(true); expect(g.winner).toBe(2);
});
test('pages flutter swaps layout', () => {
  const g = mk(2, { flutter: true, flutterEvery: 5 }); for (let i = 0; i < 6; i++) tick(g, {});
  expect(g.layout).toBe(1); expect(g.plats[1].y).toBe(LAYOUTS[1][0].y);
});
test('items: tea heals 15, pie pickup & throw blinds', () => {
  const g = mk(2); settle(g, 150);
  const [a, b] = g.fighters; a.percent = 40;
  g.items.push({ id: 1, kind: 'tea', x: a.x, y: a.y, vx: 0, vy: 0, life: 99, taken: false }); tick(g, {});
  expect(a.percent).toBe(25);
  g.items.push({ id: 2, kind: 'pie', x: a.x, y: a.y, vx: 0, vy: 0, life: 99, taken: false }); tick(g, {});
  expect(a.item).toBe('pie');
  b.x = a.x + 100; b.y = a.y; b.vx = 0; a.face = 1;
  tick(g, { 1: { atk: true, ax: 1, ay: 0 } });
  for (let i = 0; i < 40 && !b.blind; i++) tick(g, {});
  expect(b.blind).toBeGreaterThan(0); expect(b.stats.pies).toBe(1);
});
test('outlaw steals held item on hit', () => {
  const g = mk(2, {}, ['outlaw', 'alice']); settle(g, 150);
  const [a, b] = g.fighters; b.item = 'pie'; a.item = ''; b.invuln = 0; a.invuln = 0;
  applyHit(g, a, b, { dmg: 4, base: 3, scale: 0.08, ang: 40 }, 1);
  expect(a.item).toBe('pie'); expect(b.item).toBe('');
});
test('light attack hitbox only during active frames', () => {
  const g = mk(2); settle(g, 150); const a = g.fighters[0];
  tick(g, { 1: { atk: true, ax: 1, ay: 0 } }); expect(a.state).toBe('charge');
  tick(g, {}); expect(a.state).toBe('light'); expect(activeHitbox(a)).toBeNull();
  for (let i = 0; i < 4; i++) tick(g, {});
  expect(activeHitbox(a)).not.toBeNull();
});
test('demigod armor: no knockback during heavy', () => {
  const g = mk(2, {}, ['alice', 'demigod']); settle(g, 150);
  const [a, d] = g.fighters; d.state = 'charge'; d.invuln = 0; a.invuln = 0;
  applyHit(g, a, d, { dmg: 6, base: 8, scale: 0.1, ang: 40 }, 1);
  expect(d.state).toBe('charge'); expect(d.percent).toBe(3);
});
test('warrior counter stance reflects a hit', () => {
  const g = mk(2, {}, ['alice', 'warrior']); settle(g, 150);
  const [a, w] = g.fighters; w.state = 'counter'; w.t = 5; w.invuln = 0; a.invuln = 0;
  applyHit(g, a, w, { dmg: 6, base: 5, scale: 0.1, ang: 40 }, 1);
  expect(w.state).toBe('special'); expect(w.sub).toBe('counterstrike'); expect(w.percent).toBe(0);
});
test('snapshot encode/decode round trip and interpolation', () => {
  const g = mk(4, { items: true }); for (let i = 0; i < 200; i++) tick(g, {});
  const s = JSON.parse(JSON.stringify(encodeSnapshot(g, 0)));
  const d = decodeSnapshot(s);
  expect(d.tick).toBe(g.tick); expect(d.fighters.length).toBe(4);
  const f = g.fighters[1], df = d.fighters[1];
  expect(Math.abs(df.x - f.x)).toBeLessThan(0.6); expect(df.state).toBe(f.state); expect(df.stocks).toBe(f.stocks); expect(df.char).toBeUndefined(); expect(df.meter).toBe(Math.round(f.meter)); expect(Math.abs(df.aim.x - f.aim.x)).toBeLessThan(0.01);
  const b = { ...d, fighters: d.fighters.map((x) => ({ ...x, x: x.x + 10 })) };
  expect(lerpView(d, b, 0.5).fighters[0].x).toBeCloseTo(d.fighters[0].x + 5);
  expect(lerpView(null, b, 0.5)).toBe(b);
});
test('awards', () => {
  const a = computeAwards([{ id: 1, name: 'A', stats: { kos: 2, dealt: 50, pies: 3, fell: 0, steals: 0 } }, { id: 2, name: 'B', stats: { kos: 0, dealt: 0, pies: 0, fell: 1, steals: 2 } }]);
  const titles = a.map((x) => x.title);
  expect(titles).toContain('Most Pies Eaten'); expect(titles).toContain('Pacifist'); expect(titles).toContain('Stole Everything');
});
test('headless smoke: 8 bots, 30 s, no NaN, KOs happen (all difficulty mixes)', () => {
  const ids = ['alice', 'wooden', 'lostboy', 'outlaw', 'thief', 'demigod', 'warrior', 'sea'];
  const diffs = ['easy', 'normal', 'hard'];
  const g = createGame({ players: ids.map((c, i) => ({ id: i + 1, name: 'Bot' + i, char: c, bot: true, diff: diffs[i % 3] })), opts: { items: true, flutter: true, flutterEvery: 600, itemEvery: 200 }, seed: 123 });
  let kos = 0, sawAttack = false;
  for (let i = 0; i < 1800; i++) {
    tick(g, {});
    for (const f of g.fighters) {
      for (const k of ['x', 'y', 'vx', 'vy', 'percent']) expect(Number.isFinite(f[k])).toBe(true);
      if (f.state === 'light' || f.state === 'heavy' || f.state === 'special') sawAttack = true;
    }
    if (g.over) break;
  }
  kos = g.events.filter((e) => e[1] === 'ko').length;
  const total = g.fighters.reduce((s, f) => s + (3 - f.stocks), 0);
  console.log('smoke: ticks', g.tick, 'KOs', total, 'over', g.over, 'winner', g.winner);
  expect(sawAttack).toBe(true); expect(total).toBeGreaterThan(0);
});
test('4-bot match plays to a result within 7 minutes', () => {
  const g = createGame({ players: ['alice', 'sea', 'demigod', 'warrior'].map((c, i) => ({ id: i + 1, name: 'B' + i, char: c, bot: true, diff: 'hard' })), opts: {}, seed: 9 });
  while (!g.over && g.tick < 7 * 3600 + 5) tick(g, {});
  console.log('4-bot match ended tick', g.tick, 'reason', g.reason, 'winner', g.winner);
  expect(g.over).toBe(true);
});

// ---------- new controls: aim, charge, meter, kits ----------
const near = (g, a, b, d = 90) => { a.x = 600; a.y = 470; b.x = 600 + d; b.y = 470; a.vx = a.vy = b.vx = b.vy = 0; a.face = 1; b.invuln = 0; a.invuln = 0; a.grounded = b.grounded = true; };

test('cursor aim direction math', () => {
  const a = aimFromPoints(0, 0, 100, 0); expect(a.x).toBeCloseTo(1); expect(a.y).toBeCloseTo(0);
  const b = aimFromPoints(0, 0, 0, -50); expect(b.x).toBeCloseTo(0); expect(b.y).toBeCloseTo(-1);
  const c = aimFromPoints(10, 10, 40, 50); expect(Math.hypot(c.x, c.y)).toBeCloseTo(1); expect(c.y / c.x).toBeCloseTo(40 / 30);
  expect(aimFromPoints(5, 5, 6, 5, -1)).toEqual({ x: -1, y: 0 });   // cursor on the fighter: use facing
  for (const deg of [0, 45, 90, 180, 270, 333]) { const r = (deg * Math.PI) / 180, u = unpackAim(packAim({ x: Math.cos(r), y: Math.sin(r) })); expect(Math.hypot(u.x - Math.cos(r), u.y - Math.sin(r))).toBeLessThan(0.03); }
  expect(unpackAim(255, -1)).toEqual({ x: -1, y: 0 });
});
test('input encode/decode keeps every button and aim', () => {
  const s = { x: -1, y: 1, ax: 0, ay: -1, jump: true, atk: true, q: true, w: false, e: true, r: true, shd: true, taunt: true };
  const d = decodeInput(JSON.parse(JSON.stringify(encodeInput(s))));
  for (const k of ['jump', 'atk', 'q', 'w', 'e', 'r', 'shd', 'taunt']) expect(d[k]).toBe(s[k]);
  expect(d.x).toBe(-1); expect(d.y).toBe(1); expect(d.ay).toBeLessThan(-0.95);
});
test('aimed hit launches along the aim (up, right) with lift', () => {
  const up = aimLaunch(10, { x: 0, y: -1 }); expect(up.vy).toBeLessThan(-9); expect(Math.abs(up.vx)).toBeLessThan(0.1);
  const right = aimLaunch(10, { x: 1, y: 0 }); expect(right.vx).toBeGreaterThan(8); expect(right.vy).toBeLessThan(0);
  const g = mk(); settle(g, 150); const [a, b] = g.fighters; near(g, a, b, 8);
  tick(g, { 1: { atk: true, ax: 0, ay: -1 } });
  expect(a.aim.y).toBeLessThan(-0.9);
  tick(g, { 1: { atk: false, ax: 0, ay: -1 } });
  expect(a.state).toBe('light');
  for (let i = 0; i < 5; i++) tick(g, { 1: { ax: 0, ay: -1 } });
  expect(b.vy).toBeLessThan(0);   // popped upward by an upward-aimed attack
});
test('charge timing: tap = light, hold = charged heavy, auto-fire at max', () => {
  expect(chargeFraction(0)).toBe(0); expect(chargeFraction(ATTACK.tap)).toBe(0);
  expect(chargeFraction(ATTACK.tap + ATTACK.chargeFrames / 2)).toBeCloseTo(0.5); expect(chargeFraction(999)).toBe(1);
  let g = mk(); settle(g, 150); let a = g.fighters[0];
  for (let i = 0; i < 4; i++) tick(g, { 1: { atk: true, ax: 1, ay: 0 } }); tick(g, {});
  expect(a.state).toBe('light');
  g = mk(); settle(g, 150); a = g.fighters[0];
  for (let i = 0; i < 30; i++) tick(g, { 1: { atk: true, ax: 1, ay: 0 } });
  expect(a.state).toBe('charge'); expect(a.charge).toBeGreaterThan(0.3); tick(g, {});
  expect(a.state).toBe('heavy'); expect(a.charge).toBeGreaterThan(0.3);
  g = mk(); settle(g, 150); a = g.fighters[0];
  for (let i = 0; i < ATTACK.tap + ATTACK.chargeFrames + 2; i++) tick(g, { 1: { atk: true, ax: 1, ay: 0 } });
  expect(a.state).toBe('heavy'); expect(a.charge).toBe(1);
});
test('ultimate meter fills from dealing and taking damage, gates and consumes R', () => {
  expect(addMeter(95, 20)).toBe(METER.max); expect(addMeter(5, -20)).toBe(0);
  const g = mk(2, {}, ['alice', 'wooden']); settle(g, 150); const [a, b] = g.fighters; near(g, a, b);
  applyHit(g, a, b, { dmg: 10, base: 4, scale: 0.08, ang: 40 }, 1);
  expect(a.meter).toBeCloseTo(10 * METER.dealt); expect(b.meter).toBeCloseTo(10 * METER.taken);
  // R is gated
  a.state = 'idle'; a.meter = 99; tick(g, { 1: { r: true } }); expect(a.state).not.toBe('special');
  a.meter = METER.max; a.prev = {}; tick(g, { 1: { r: true } });
  expect(a.state).toBe('special'); expect(a.meter).toBe(0); expect(a.stats.ults).toBe(1);
  // ~once per stock: dealing ~100 and taking ~120 should fill it
  const g2 = mk(2); settle(g2, 150); let m = 0; m = addMeter(m, 100 * METER.dealt + 120 * METER.taken); expect(m).toBeGreaterThanOrEqual(METER.max * 0.95);
});
test('every fighter Q/W/E/R runs headless: no NaN, returns to idle, cooldown/meter spent', () => {
  for (const id of CHAR_IDS) for (const key of ['q', 'w', 'e', 'r']) {
    const g = createGame({ players: [{ id: 1, name: 'A', char: id }, { id: 2, name: 'B', char: 'alice' }, { id: 3, name: 'C', char: 'demigod' }], opts: { items: false, flutter: false }, seed: 5 });
    settle(g, 150); const [a, b, c] = g.fighters; near(g, a, b, 100); c.x = 800; c.y = 470; c.invuln = 0;
    a.meter = METER.max; a.cds = { q: 0, w: 0, e: 0 };
    const aim = { ax: 1, ay: 0 };
    tick(g, { 1: { [key]: true, ...aim } });
    const started = a.state !== 'idle' || (key !== 'r' && a.cds[key] > 0) || (key === 'w' && id === 'lostboy');
    for (let i = 0; i < 160; i++) {
      tick(g, { 1: { ...aim, w: key === 'w' && id === 'lostboy' && i < 20 } });
      for (const f of g.fighters) for (const k of ['x', 'y', 'vx', 'vy', 'percent']) if (!Number.isFinite(f[k])) throw new Error(`NaN ${id} ${key} ${k}`);
    }
    if (!(id === 'lostboy' && key === 'w')) { expect(started).toBe(true); if (key === 'r') expect(a.stats.ults).toBe(1); else expect(a.cds[key]).toBeGreaterThan(-1); }
    expect(['idle', 'dead', 'hit', 'out', 'shield', 'stun']).toContain(a.state === 'special' ? 'STUCK' : a.state);
  }
});
test('kit abilities do real things (damage / status / projectiles)', () => {
  const run = (id, key, setup = () => {}, ticks = 70, aim = { ax: 1, ay: 0 }, dist = 90) => {
    const g = mk(2, {}, [id, 'demigod']); settle(g, 150); const [a, b] = g.fighters; near(g, a, b, dist); b.state = 'idle'; setup(a, b, g);
    a.meter = METER.max; tick(g, { 1: { [key]: true, ...aim } });
    let seenEnt = false; for (let i = 0; i < ticks; i++) { tick(g, { 1: aim }); if (g.ents.length) seenEnt = true; }
    return { g, a, b, seenEnt };
  };
  expect(run('outlaw', 'q').seenEnt).toBe(true);
  expect(run('thief', 'e', () => {}, 30).seenEnt).toBe(true);                       // sand zone
  expect(run('sea', 'q').seenEnt).toBe(true);
  expect(run('alice', 'r', () => {}, 120).g.fighters[1].percent).toBeGreaterThan(0);     // stampede hits
  expect(run('wooden', 'r').a.sizeMode).toBe('big');
  const t = run('thief', 'w', (a, b) => { b.item = 'pie'; }, 30, { ax: 1, ay: 0 }, 55); expect(t.a.item === 'pie' || t.b.percent > 0).toBe(true);
  expect(run('warrior', 'r', () => {}, 70).b.percent).toBeGreaterThan(0);
  expect(run('lostboy', 'r', () => {}, 60).b.percent).toBeGreaterThan(0);
  expect(run('demigod', 'w').a.armorT).toBeGreaterThan(0);
});
test('bots use their abilities (all 8 fighters, all difficulties)', () => {
  const used = {}, ults = { n: 0 };
  for (let m = 0; m < 3; m++) {
    const diffs = ['easy', 'normal', 'hard'];
    const g = createGame({ players: CHAR_IDS.map((c, i) => ({ id: i + 1, name: c, char: c, bot: true, diff: diffs[(i + m) % 3] })), opts: { items: false, flutter: false, stocks: 5 }, seed: 40 + m });
    for (let i = 0; i < 3600 && !g.over; i++) {
      tick(g, {});
      for (const f of g.fighters) { if (f.state === 'special' && f.sub && f.sub !== 'ult') (used[f.char] ||= new Set()).add(f.sub); if (f.state === 'counter') (used[f.char] ||= new Set()).add('counter'); }
    }
    ults.n += g.fighters.reduce((s, f) => s + f.stats.ults, 0);
  }
  for (const c of CHAR_IDS) { expect(used[c]?.size || 0).toBeGreaterThan(0); }
  expect(ults.n).toBeGreaterThan(0);
  console.log('bot ability use:', Object.fromEntries(Object.entries(used).map(([k, v]) => [k, [...v].join('/')])), 'ults', ults.n);
});
