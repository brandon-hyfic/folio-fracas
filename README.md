# Folio Fracas

A goofy storybook party platform-fighter. Original game: characters are drawn from public-domain stories
(Alice 1865, Pinocchio 1883, Peter Pan 1911, Robin Hood ballads, 1001 Nights, Greek myth, Ballad of Mulan,
Andersen's Little Mermaid 1837) in our own shape-art style. Built for 4 players (up to 8 possible), bots fill empty seats.
(The working title "Storybook Brawl" is already an existing commercial game, so this is named Folio Fracas.)

## Run locally
```
cd ~/aleah/games/storybook-brawl
python3 -m http.server 8080        # or: bun --bun x serve
# open http://localhost:8080
```
Plain JS ES modules + canvas, no build step. Local vs bots needs no network (PeerJS is only needed for online).

## Tests
```
~/.local/bin/bun test
```
Pure logic (knockback, physics, stocks/respawn, sudden death, items, specials, snapshot round trip, awards),
cursor-aim math, charge timing, ultimate meter, every fighter's Q/W/E/R headless, bots using their abilities, a headless 30 s / 8-bot smoke (no NaN, KOs happen), a 4-bot full match, and a mock-canvas render test of every fighter/state.

## Play
Title > Play > Local vs bots / Host online / Join (room code + nickname) > Fighter select (4 seats: You / Bot / Off,
tick "Up to 8 seats" for more; bots have easy/normal/hard) > Match > Results (winner + silly awards, Rematch / Change fighters).

- Last one with stocks wins (default 3 stocks). A 7-minute cap triggers sudden death (everyone 1 stock at 300%); no timer win.
- "Items & hazards" toggle: pie (splat blinds 1s), tea cup (heal 15%), giant gingerbread (one big swing); pages flutter every 60 s and swap platform heights.
- Stage "The Open Storybook": solid main page, 3 thin pass-through pages (Down to drop through), blast zones all around, auto-zoom camera.

### Controls
| Action | Keyboard + mouse | Gamepad |
|---|---|---|
| Move | A / D (arrows also work) | stick / d-pad |
| Jump, double jump | Space | A |
| Fast-fall, drop through a page | S | stick down |
| Attack, aimed at the cursor (works in the air) | Left click: tap = light, hold and release = charged heavy toward the cursor | X (aim with right stick, else you face) |
| Abilities 1 / 2 / 3 (aimed at the cursor where it makes sense) | Q / W / E | Y / B / LB |
| Ultimate (needs a full meter) | R | RB |
| Shield (hold), dodge (Shift + direction) | Shift | LT / RT |
| Taunt | T | Back |
| Right mouse | unbound (hook: `input.hooks.onRightClick` in `js/main.js`) | |
| Mute / leave match | M / Esc | |

The system cursor is hidden during matches and a crosshair is drawn. Aim priority: gamepad right stick, then mouse cursor, then facing.
Charge timing: release within 10 frames = light; after that the heavy charges for 40 more frames (auto-fires at full).
Ultimate meter: fills from damage dealt (0.5 per %) and taken (0.4 per %), roughly once per stock; shown on each HUD card, gold glow and "ULT READY" when full. Your own Q/W/E/R show above your card with cooldowns.

### Ability kits
| Fighter | Q | W | E | R (ultimate) |
|---|---|---|---|---|
| Alice | Shrink (toggle small, fast) | Grow Slam (swell and smash) | Drink Me (dash at cursor, stay small 2 s) | Off With Their Heads! (card-soldier stampede) |
| The Wooden Boy | Nose Poke (aimed; taunt T grows the nose) | Wooden Spin (radial knock-up) | Timber! (huge slow log swing) | Real Boy! (giant, armored, heals 25%, 7 s) |
| The Lost Boy | Shadow Poke (clone lunges ahead) | Glide (hold in air) | Flit (dash at cursor, brief invulnerable) | Shadow Swarm (a shadow pokes beside every rival) |
| Sherwood Outlaw | Arrow Volley (3-arrow fan) | Pinning Shot (one fast heavy arrow) | Rope Leap (dash at cursor, recovery) | Merry Barrage (arrows rain over the page) |
| The Street Thief | Carpet Dash (once per airtime, recovery) | Pickpocket (steals item + 25 meter) | Sand Cloud (blind + slow zone) | Three Wishes (random: big blast / heal 35% + invuln / pies rain on rivals) |
| The Demigod | Shoulder Charge (armored bull rush) | Nemean Cloak (armor 1.7 s) | Discus Throw (heavy aimed disc) | Titan Slam (leap, dive, shockwaves) |
| Warrior Daughter | Twin Blades (two dash slashes) | Counter Stance (hit it and strike back) | Crescent Wind (aimed projectile) | Hundred Blades (invulnerable whirl at the nearest rival) |
| Sea Princess | Tide Bubble (traps and floats the first rival hit) | Whirlpool (zone that drags rivals in) | Tidal Wave (wave along the page) | Bubble Parade (every nearby rival floats in a bubble) |

Heavy attacks: Demigod has armor while charging/swinging. Outlaw hits steal held items.

## Online (host-authoritative)
Host runs the simulation at 60 Hz and sends snapshots at 30 Hz; clients send inputs and interpolate (100 ms delay).
Host clicks "Host online", shares the 5-character room code; others click Join with the code and a nickname and pick a fighter.
Star topology, up to 8. A disconnected player's fighter is removed and the match continues; the seat becomes a bot.
Joining mid-match is refused.

Limits / caveats:
- Signaling uses the free public PeerJS broker (0.peerjs.com), a third-party service that can be down or rate-limited.
- No TURN server is configured. Some networks (strict NAT, corporate, some mobile) cannot make a WebRTC connection; same-LAN or typical home networks usually work.
- No client-side prediction: your own fighter is shown from host snapshots, so input lag is roughly your ping plus ~130 ms (aim is sent as one byte per input message).
- PeerJS is pinned to 1.5.4 from cdn.jsdelivr.net.

## Layout
`js/config.js` constants and roster, `sim.js` pure simulation, `bot.js` AI, `snapshot.js` net encoding + interpolation,
`awards.js`, `render.js` canvas art, `input.js`, `audio.js` (synthesized blips), `net.js` PeerJS wrapper, `main.js` UI/loop.
