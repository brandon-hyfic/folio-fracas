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
a headless 30 s / 8-bot smoke (no NaN, KOs happen), a 4-bot full match, and a mock-canvas render test of every fighter/state.

## Play
Title > Play > Local vs bots / Host online / Join (room code + nickname) > Fighter select (4 seats: You / Bot / Off,
tick "Up to 8 seats" for more; bots have easy/normal/hard) > Match > Results (winner + silly awards, Rematch / Change fighters).

- Last one with stocks wins (default 3 stocks). A 7-minute cap triggers sudden death (everyone 1 stock at 300%); no timer win.
- "Items & hazards" toggle: pie (splat blinds 1s), tea cup (heal 15%), giant gingerbread (one big swing); pages flutter every 60 s and swap platform heights.
- Stage "The Open Storybook": solid main page, 3 thin pass-through pages (Down to drop through), blast zones all around, auto-zoom camera.

### Controls
| Action | Keyboard | Gamepad |
|---|---|---|
| Move | A/D or arrows | stick / d-pad |
| Jump (x2) | W, Up, Space | A |
| Light attack (throws held pie / swings gingerbread) | J or Z | X |
| Heavy (hold to charge, release) | K or X | Y |
| Special (Down+Special = alt for Alice, Warrior) | L or C | B |
| Shield / dodge (shield + direction) | Shift, I, V | bumpers/triggers |
| Taunt | T | Back |
| Drop through page | Down | stick down |
| Mute / leave | M / Esc | |

### Roster
Alice (shrink / giant slam), The Wooden Boy (nose poke, taunt grows it), The Lost Boy (glide, shadow clone poke),
Sherwood Outlaw (arrow volley, steals held items), The Street Thief (carpet recovery, 3 hits charge Three Wishes),
The Demigod (armor on heavy hits, shoulder charge), Warrior Daughter (twin blade dance, counter stance), Sea Princess (tide bubble traps and floats foes).

## Online (host-authoritative)
Host runs the simulation at 60 Hz and sends snapshots at 30 Hz; clients send inputs and interpolate (100 ms delay).
Host clicks "Host online", shares the 5-character room code; others click Join with the code and a nickname and pick a fighter.
Star topology, up to 8. A disconnected player's fighter is removed and the match continues; the seat becomes a bot.
Joining mid-match is refused.

Limits / caveats:
- Signaling uses the free public PeerJS broker (0.peerjs.com), a third-party service that can be down or rate-limited.
- No TURN server is configured. Some networks (strict NAT, corporate, some mobile) cannot make a WebRTC connection; same-LAN or typical home networks usually work.
- No client-side prediction: your own fighter is shown from host snapshots, so input lag is roughly your ping plus ~130 ms.
- PeerJS is pinned to 1.5.4 from cdn.jsdelivr.net.

## Layout
`js/config.js` constants and roster, `sim.js` pure simulation, `bot.js` AI, `snapshot.js` net encoding + interpolation,
`awards.js`, `render.js` canvas art, `input.js`, `audio.js` (synthesized blips), `net.js` PeerJS wrapper, `main.js` UI/loop.
