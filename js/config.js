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

// Ability kit: q/w/e = 3 abilities (cooldown), r = ultimate (needs full meter).
// type: shrink grow shadow nose glide counter flurry melee dash proj zone wave buff blast ult
// rng = [min,max] distance hint for bots; rec = usable as recovery.
export const CHARS = {
  alice: C({ name: 'Alice', blurb: 'Shrinks, grows, and sends in the card soldiers.',
    skin: '#f2c9a0', hair: '#ff8a3d', accent: '#e8398f', accent2: '#2b2d42', speed: 5.4, lightO: { dmg: 4.6 },
    kit: {
      q: { name: 'Shrink', desc: 'Toggle small: fast and light, hits softer.', type: 'shrink', cd: 60 },
      w: { name: 'Grow Slam', desc: 'Swell up and smash the ground around you.', type: 'grow', cd: 150, rng: [0, 150] },
      e: { name: 'Drink Me', desc: 'Dash toward the cursor, then stay small for 2 s.', type: 'dash', cd: 110, frames: 12, speed: 10, dmg: 5, base: 4, scale: 0.09, w: 60, h: 50, size: 'small', sizeT: 120, rec: true, rng: [60, 240] },
      r: { name: 'Off With Their Heads!', desc: 'A card-soldier stampede charges across the page.', type: 'ult', id: 'stampede', rng: [0, 800] },
    } }),
  wooden: C({ name: 'The Wooden Boy', blurb: 'Pokes with a nose that grows every time he taunts.',
    skin: '#d9a066', hair: '#8a5a2b', accent: '#b5651d', accent2: '#3d2b1f', weight: 1.1, speed: 5.0, jump: 11.2, dj: 10.2,
    lightO: { dmg: 4.5, recover: 10 }, heavyO: { startup: 7, recover: 22, dmg: 12, scale: 0.13 },
    kit: {
      q: { name: 'Nose Poke', desc: 'Long poke toward the cursor. Taunt (T) grows the nose.', type: 'nose', cd: 20, rng: [40, 260] },
      w: { name: 'Wooden Spin', desc: 'Spin like a top; knocks everyone nearby up.', type: 'blast', cd: 90, startup: 6, active: 6, recover: 14, dmg: 7, base: 5, scale: 0.11, w: 140, h: 90, ang: 62, rng: [0, 90] },
      e: { name: 'Timber!', desc: 'Swing a log overhead. Slow, huge.', type: 'melee', cd: 130, startup: 14, active: 5, recover: 18, dmg: 13, base: 7, scale: 0.14, w: 80, h: 90, lunge: 3, rng: [0, 100] },
      r: { name: 'Real Boy!', desc: 'Become a giant, armored, healthier boy for 7 s.', type: 'ult', id: 'realboy', rng: [0, 9999] },
    } }),
  lostboy: C({ name: 'The Lost Boy', blurb: 'Glides, flits, and never grows up. Neither do his shadows.',
    skin: '#e8b98f', hair: '#1f3d2b', accent: '#c9a227', accent2: '#4a3b2a', weight: 0.85, speed: 5.8, jump: 11.8, dj: 10.8,
    lightO: { startup: 3, recover: 8, dmg: 3.5, w: 40, h: 30 },
    kit: {
      q: { name: 'Shadow Poke', desc: 'A shadow clone lunges in front and pokes.', type: 'shadow', cd: 70, rng: [60, 200] },
      w: { name: 'Glide', desc: 'Hold in the air to glide.', type: 'glide', cd: 0, rec: true },
      e: { name: 'Flit', desc: 'Quick dash toward the cursor, brief invulnerability.', type: 'dash', cd: 90, frames: 10, speed: 11, dmg: 0, invuln: 10, rec: true, rng: [0, 0] },
      r: { name: 'Shadow Swarm', desc: 'A shadow pops up beside every rival and pokes.', type: 'ult', id: 'swarm', rng: [0, 900] },
    } }),
  outlaw: C({ name: 'Sherwood Outlaw', blurb: 'Archer who steals your pie. Hits steal held items.',
    skin: '#e6b995', hair: '#2d3a2e', accent: '#2f6f5e', accent2: '#5b3a1e', weight: 0.95,
    kit: {
      q: { name: 'Arrow Volley', desc: 'Three arrows in a fan toward the cursor.', type: 'proj', kind: 'arrow', n: 3, spread: 0.14, speed: 13, grav: 0.04, life: 60, dmg: 3, base: 3.2, scale: 0.07, r: 14, at: 8, end: 26, cd: 80, rng: [120, 420] },
      w: { name: 'Pinning Shot', desc: 'One fast, hard-hitting arrow.', type: 'proj', kind: 'arrow', n: 1, spread: 0, speed: 19, grav: 0.02, life: 60, dmg: 10, base: 6, scale: 0.1, r: 14, at: 10, end: 26, cd: 120, rng: [120, 500] },
      e: { name: 'Rope Leap', desc: 'Swing yourself toward the cursor. Great recovery.', type: 'dash', cd: 100, frames: 12, speed: 9, dmg: 0, rec: true, rng: [0, 0] },
      r: { name: 'Merry Barrage', desc: 'Arrows rain across the whole page.', type: 'ult', id: 'rain', rng: [0, 900] },
    } }),
  thief: C({ name: 'The Street Thief', blurb: 'Quick hands, flying carpet, and a very lucky lamp.',
    skin: '#c68a5a', hair: '#1b1b2f', accent: '#e07a1f', accent2: '#0e7c86', weight: 0.9, speed: 5.6, jump: 11.6, dj: 10.6,
    lightO: { startup: 3, recover: 8, dmg: 3.5, w: 40, h: 30 },
    kit: {
      q: { name: 'Carpet Dash', desc: 'Ride the carpet toward the cursor (once per airtime).', type: 'dash', carpet: true, cd: 50, frames: 14, speed: 8, dmg: 0, rec: true, rng: [0, 0] },
      w: { name: 'Pickpocket', desc: 'Quick grab: steals a held item and some ult meter.', type: 'melee', cd: 100, startup: 3, active: 5, recover: 12, dmg: 4, base: 3, scale: 0.06, w: 60, h: 44, steal: true, rng: [0, 80] },
      e: { name: 'Sand Cloud', desc: 'Toss a cloud of sand that blinds and slows.', type: 'zone', style: 'sand', cd: 140, at: 6, w: 170, h: 110, life: 100, ahead: 90, rng: [40, 220] },
      r: { name: 'Three Wishes', desc: 'The lamp grants one of three wishes at random.', type: 'ult', id: 'wishes', rng: [0, 700] },
    } }),
  demigod: C({ name: 'The Demigod', blurb: 'A strongman who is, frankly, mostly armor.',
    skin: '#e0a878', hair: '#caa24b', accent: '#e8e1cf', accent2: '#7a4b2a', weight: 1.4, speed: 4.8, jump: 11.4, dj: 10.8,
    lightO: { startup: 5, recover: 11, dmg: 5.5, w: 50, h: 40, base: 4, scale: 0.09 },
    heavyO: { startup: 8, active: 6, recover: 24, dmg: 14, base: 7, scale: 0.15, ang: 40, w: 74, h: 58 },
    kit: {
      q: { name: 'Shoulder Charge', desc: 'Armored bull rush forward.', type: 'dash', horizontal: true, armor: true, cd: 80, frames: 30, speed: 9, dmg: 8, base: 5, scale: 0.11, w: 56, h: 56, ang: 30, rng: [90, 260] },
      w: { name: 'Nemean Cloak', desc: 'Armor for 2.5 s: take damage, no flinch.', type: 'buff', cd: 280, armor: 100, rng: [0, 160] },
      e: { name: 'Discus Throw', desc: 'Hurl a heavy discus toward the cursor.', type: 'proj', kind: 'disc', n: 1, spread: 0, speed: 14, grav: 0.02, life: 70, dmg: 8, base: 6, scale: 0.11, r: 18, at: 8, end: 26, cd: 110, rng: [100, 420] },
      r: { name: 'Titan Slam', desc: 'Leap to the heavens, dive back down. Shockwaves.', type: 'ult', id: 'titan', rng: [0, 900] },
    } }),
  warrior: C({ name: 'Warrior Daughter', blurb: 'Fast, precise, and does not need your approval.',
    skin: '#f0cfa8', hair: '#14141c', accent: '#b7132b', accent2: '#c9a227', weight: 0.95, speed: 5.6, jump: 11.6, dj: 10.6,
    lightO: { startup: 3, recover: 8, dmg: 3.8, w: 46, h: 30 },
    kit: {
      q: { name: 'Twin Blades', desc: 'Two dashing slashes.', type: 'flurry', cd: 70, rng: [60, 200] },
      w: { name: 'Counter Stance', desc: 'Get hit in the stance and strike back.', type: 'counter', cd: 60, rng: [0, 80] },
      e: { name: 'Crescent Wind', desc: 'Throw a crescent of wind toward the cursor.', type: 'proj', kind: 'crescent', n: 1, spread: 0, speed: 11, grav: 0, life: 50, dmg: 6.5, base: 4.5, scale: 0.1, r: 20, at: 8, end: 22, cd: 80, rng: [100, 400] },
      r: { name: 'Hundred Blades', desc: 'Whirl toward the nearest rival, invulnerable, slashing.', type: 'ult', id: 'whirl', rng: [0, 600] },
    } }),
  sea: C({ name: 'Sea Princess', blurb: 'Traps people in bubbles and floats away from consequences.',
    skin: '#f4d6c0', hair: '#2a4d8f', accent: '#27b3b0', accent2: '#e8d5a2', weight: 0.95, speed: 5.5, jump: 11.4, dj: 11.0,
    lightO: { dmg: 5, startup: 3 }, heavyO: { dmg: 12.5, base: 6.5 },
    kit: {
      q: { name: 'Tide Bubble', desc: 'A bubble that traps and floats the first rival it touches.', type: 'proj', kind: 'bubble', n: 1, spread: 0, speed: 3.2, grav: -0.004, life: 150, dmg: 0, base: 0, scale: 0, r: 34, at: 8, end: 22, cd: 90, rng: [100, 300] },
      w: { name: 'Whirlpool', desc: 'A swirl that drags rivals toward its centre.', type: 'zone', style: 'whirl', cd: 160, at: 6, w: 220, h: 170, life: 110, ahead: 120, rng: [60, 260] },
      e: { name: 'Tidal Wave', desc: 'A wave rolls along the page and shoves everyone.', type: 'wave', cd: 140, rng: [100, 500] },
      r: { name: 'Bubble Parade', desc: 'Every rival nearby gets a bubble and a long float.', type: 'ult', id: 'parade', rng: [0, 700] },
    } }),
};
export const CHAR_IDS = Object.keys(CHARS);

export const STATES = ['idle', 'light', 'charge', 'heavy', 'special', 'shield', 'dodge', 'hit', 'stun', 'dead', 'out', 'taunt', 'throw', 'counter'];
export const EVENTS = ['hit', 'ko', 'jump', 'dj', 'shieldbreak', 'throw', 'splat', 'pick', 'shoot', 'respawn', 'win', 'wish', 'carpet', 'spawnitem', 'flutter', 'counter', 'heal', 'pop', 'ult', 'wishfx'];
export const ITEM_KINDS = ['pie', 'tea', 'ginger'];
export const ENT_KINDS = ['arrow', 'pie', 'shadow', 'bubble', 'spark', 'card', 'zone', 'disc', 'crescent'];
