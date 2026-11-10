// Folio Fracas - shared constants. Original game; characters from public-domain stories, drawn in our own style.
export const TICK_HZ = 60;
export const SNAP_EVERY = 2;          // host snapshot every 2 ticks (30 Hz)
export const MAX_PLAYERS = 8;
export const DEFAULT_SLOTS = 4;       // tuned for 4; 8 supported
export const PLAYER_COLORS = ['#ff5a5f', '#3ea6ff', '#ffd23f', '#3ddc97', '#c77dff', '#ff9f1c', '#2ec4b6', '#f15bb5'];
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export const DEFAULT_OPTS = {
  stocks: 3, minutes: 7, items: true, itemEvery: 540, flutter: true, flutterEvery: 3600,
  slots: DEFAULT_SLOTS,
};
export function normalizeOpts(o) {
  const r = { ...DEFAULT_OPTS, ...(o || {}) };
  r.slots = Math.max(2, Math.min(MAX_PLAYERS, r.slots | 0));
  return r;
}

export const PHYS = { gravity: 0.45, maxFall: 11, fastFall: 15, hitDrag: 0.972, hitGravMul: 0.7 };

// y grows downward. Main page top y=470 (solid sides irrelevant: top-only). Three thin pass-through pages.
// Layout 0: two low side pages + one high centre page. Layout 1 (after a flutter): swapped heights.
export const MAIN = { x1: 340, x2: 940, y: 470, thin: false };
export const LAYOUTS = [
  [{ x1: 355, x2: 505, y: 335, thin: true }, { x1: 775, x2: 925, y: 335, thin: true }, { x1: 565, x2: 715, y: 225, thin: true }],
  [{ x1: 330, x2: 480, y: 235, thin: true }, { x1: 800, x2: 950, y: 235, thin: true }, { x1: 565, x2: 715, y: 340, thin: true }],
];
export const platsFor = (layout) => [MAIN, ...LAYOUTS[layout & 1]];
export const STAGE = { blast: { l: -220, r: 1500, t: -380, b: 1000 }, centerX: 640 };

const L0 = { startup: 4, active: 4, recover: 9, dmg: 4, base: 3.5, scale: 0.08, ang: 40, w: 44, h: 34 };
const H0 = { startup: 6, active: 5, recover: 20, dmg: 11, base: 6, scale: 0.13, ang: 42, w: 64, h: 50, chargeMax: 50, chargeMul: 0.8 };
const C = (o) => ({ weight: 1, speed: 5.4, jump: 11.5, dj: 10.5, ...o, light: { ...L0, ...(o.lightO || {}) }, heavy: { ...H0, ...(o.heavyO || {}) } });

export const CHARS = {
  alice: C({ name: 'Alice', special: 'sizeshift', blurb: 'Special = shrink (small, fast). Down+Special = giant slam.',
    skin: '#f2c9a0', hair: '#ff8a3d', accent: '#e8398f', accent2: '#2b2d42', speed: 5.4, lightO: { dmg: 4.6 } }),
  wooden: C({ name: 'The Wooden Boy', special: 'nose', blurb: 'Special = nose poke. Taunt (T) grows the nose.',
    skin: '#d9a066', hair: '#8a5a2b', accent: '#b5651d', accent2: '#3d2b1f', weight: 1.1, speed: 5.0, jump: 11.2, dj: 10.2,
    lightO: { dmg: 4.5, recover: 10 }, heavyO: { startup: 7, recover: 22, dmg: 12, scale: 0.13 } }),
  lostboy: C({ name: 'The Lost Boy', special: 'shadow', blurb: 'Hold Special in air to glide. Ground Special = shadow clone poke.',
    skin: '#e8b98f', hair: '#1f3d2b', accent: '#c9a227', accent2: '#4a3b2a', weight: 0.85, speed: 5.8, jump: 11.8, dj: 10.8,
    lightO: { startup: 3, recover: 8, dmg: 3.5, w: 40, h: 30 } }),
  outlaw: C({ name: 'Sherwood Outlaw', special: 'volley', blurb: 'Special = 3-arrow volley. Hits steal held items.',
    skin: '#e6b995', hair: '#2d3a2e', accent: '#2f6f5e', accent2: '#5b3a1e', weight: 0.95 }),
  thief: C({ name: 'The Street Thief', special: 'carpet', blurb: 'Air Special = carpet recovery. 3 hits charge Three Wishes (ground Special).',
    skin: '#c68a5a', hair: '#1b1b2f', accent: '#e07a1f', accent2: '#0e7c86', weight: 0.9, speed: 5.6, jump: 11.6, dj: 10.6,
    lightO: { startup: 3, recover: 8, dmg: 3.5, w: 40, h: 30 } }),
  demigod: C({ name: 'The Demigod', special: 'charge', blurb: 'Twelve Labors: armor on heavy hits and shoulder charge. Slow, heavy.',
    skin: '#e0a878', hair: '#caa24b', accent: '#e8e1cf', accent2: '#7a4b2a', weight: 1.4, speed: 4.8, jump: 11.4, dj: 10.8,
    lightO: { startup: 5, recover: 11, dmg: 5.5, w: 50, h: 40, base: 4, scale: 0.09 },
    heavyO: { startup: 8, active: 6, recover: 24, dmg: 14, base: 7, scale: 0.15, ang: 40, w: 74, h: 58 } }),
  warrior: C({ name: 'Warrior Daughter', special: 'flurry', blurb: 'Special = twin blade dance. Down+Special = counter stance.',
    skin: '#f0cfa8', hair: '#14141c', accent: '#b7132b', accent2: '#c9a227', weight: 0.95, speed: 5.6, jump: 11.6, dj: 10.6,
    lightO: { startup: 3, recover: 8, dmg: 3.8, w: 46, h: 30 } }),
  sea: C({ name: 'Sea Princess', special: 'bubble', blurb: 'Special = tide bubble: traps and floats foes. Floaty jumps.',
    skin: '#f4d6c0', hair: '#2a4d8f', accent: '#27b3b0', accent2: '#e8d5a2', weight: 0.95, speed: 5.5, jump: 11.4, dj: 11.0,
    lightO: { dmg: 5, startup: 3 }, heavyO: { dmg: 12.5, base: 6.5 } }),
};
export const CHAR_IDS = Object.keys(CHARS);

export const STATES = ['idle', 'light', 'charge', 'heavy', 'special', 'shield', 'dodge', 'hit', 'stun', 'dead', 'out', 'taunt', 'throw', 'counter'];
export const EVENTS = ['hit', 'ko', 'jump', 'dj', 'shieldbreak', 'throw', 'splat', 'pick', 'shoot', 'respawn', 'win', 'wish', 'carpet', 'spawnitem', 'flutter', 'counter', 'heal', 'pop'];
export const ITEM_KINDS = ['pie', 'tea', 'ginger'];
export const ENT_KINDS = ['arrow', 'pie', 'shadow', 'bubble', 'spark'];
