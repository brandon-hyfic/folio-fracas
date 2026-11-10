// Snapshot encode/decode (host -> clients) and interpolation. Pure, no DOM.
import { STATES, EVENTS, ITEM_KINDS, ENT_KINDS } from './config.js';
export const SUBS = ['', 'shrink', 'grow', 'shadow', 'nose', 'melee', 'dash', 'proj', 'zone', 'buff', 'blast', 'counterstrike', 'flurry', 'wave', 'ult', 'whirl', 'titan', 'titanland', 'wishblast'];
export const STYS = ['', 'sand', 'whirl', 'wave', 'card'];
const SIZES = ['', 'small', 'big'];
const ITEMS = ['', ...ITEM_KINDS];
const idx = (arr, v) => Math.max(0, arr.indexOf(v));
const r = Math.round;

export function encodeSnapshot(g, sinceTick = 0) {
  return {
    k: 's', n: g.tick, l: g.layout, tl: g.timeLeft, ov: g.over ? 1 : 0, sd: g.sudden ? 1 : 0, w: g.winner || 0,
    f: g.fighters.map((f) => [
      f.id, r(f.x * 2) / 2, r(f.y * 2) / 2, f.face > 0 ? 1 : 0, idx(STATES, f.state), f.t, r(f.percent * 10) / 10, f.stocks,
      r(f.scale * 100), f.invuln, r(f.shieldHP), r(f.charge * 100), f.noseLen, idx(ITEMS, f.item), f.gliding ? 1 : 0,
      idx(SIZES, f.sizeMode), f.blind, f.stats.kos, r(f.meter), idx(SUBS, f.sub), f.mvO === 'ginger' ? 1 : 0, f.floatT > 0 ? 1 : 0, f.armorT > 0 ? 1 : 0, r(f.aim.x * 100), r(f.aim.y * 100), f.stocks > 0 ? f.cds.q : 0, f.cds.w, f.cds.e,
    ]),
    e: g.ents.map((e) => [idx(ENT_KINDS, e.k), e.id, r(e.x), r(e.y), e.face ? e.face : e.vx >= 0 ? 1 : -1, e.t, r(e.w || 0), r(e.h || 0), idx(STYS, e.sty || ''), r((e.vx || 0) * 10), r((e.vy || 0) * 10)]),
    i: g.items.map((i) => [i.id, idx(ITEM_KINDS, i.kind), r(i.x), r(i.y)]),
    ev: g.events.filter((e) => e[0] > sinceTick).map((e) => [e[0], idx(EVENTS, e[1]), e[2], e[3], e[4]]),
  };
}
export function decodeSnapshot(s) {
  return {
    tick: s.n, layout: s.l, timeLeft: s.tl, over: !!s.ov, sudden: !!s.sd, winner: s.w || null,
    fighters: s.f.map((a) => ({
      id: a[0], x: a[1], y: a[2], face: a[3] ? 1 : -1, state: STATES[a[4]], t: a[5], percent: a[6], stocks: a[7],
      scale: a[8] / 100, invuln: a[9], shieldHP: a[10], charge: a[11] / 100, noseLen: a[12], item: ITEMS[a[13]], gliding: !!a[14],
      sizeMode: SIZES[a[15]], blind: a[16], kos: a[17], meter: a[18], sub: SUBS[a[19]], mvO: a[20] ? 'ginger' : '', floatT: a[21], armor: !!a[22], aim: { x: a[23] / 100, y: a[24] / 100 }, cds: { q: a[25], w: a[26], e: a[27] },
    })),
    ents: s.e.map((a) => ({ k: ENT_KINDS[a[0]], id: a[1], x: a[2], y: a[3], face: a[4], t: a[5], w: a[6], h: a[7], sty: STYS[a[8]], vx: a[9] / 10, vy: a[10] / 10 })),
    items: s.i.map((a) => ({ id: a[0], kind: ITEM_KINDS[a[1]], x: a[2], y: a[3] })),
    events: s.ev.map((a) => [a[0], EVENTS[a[1]], a[2], a[3], a[4]]),
  };
}
// Interpolate between two decoded snapshots. t in [0,1]. Teleports (respawn, KO) snap to b.
export function lerpView(a, b, t) {
  if (!a) return b;
  const byId = new Map(a.fighters.map((f) => [f.id, f]));
  const L = (p, q) => p + (q - p) * t;
  const fighters = b.fighters.map((fb) => {
    const fa = byId.get(fb.id);
    if (!fa || fa.state === 'dead' || fb.state === 'dead' || Math.abs(fb.x - fa.x) > 250 || Math.abs(fb.y - fa.y) > 250) return fb;
    return { ...fb, x: L(fa.x, fb.x), y: L(fa.y, fb.y), scale: L(fa.scale, fb.scale) };
  });
  const ea = new Map(a.ents.map((e) => [e.id, e]));
  const ents = b.ents.map((e) => { const p = ea.get(e.id); return p ? { ...e, x: L(p.x, e.x), y: L(p.y, e.y) } : e; });
  return { ...b, fighters, ents };
}
