// UI + game loop glue. Local play first; online is host-authoritative on top of the same simulation.
import { CHARS, CHAR_IDS, DEFAULT_OPTS, normalizeOpts, SNAP_EVERY, MAX_PLAYERS, PLAYER_COLORS, DIFFICULTIES } from './config.js';
import { createGame, tick, removeFighter } from './sim.js';
import { encodeSnapshot, decodeSnapshot, lerpView } from './snapshot.js';
import { computeAwards } from './awards.js';
import { createRenderer } from './render.js';
import { createInput, encodeInput, decodeInput } from './input.js';
import { hostRoom, joinRoom, peerAvailable } from './net.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const input = createInput();
const renderer = createRenderer($('cv'));
addEventListener('resize', () => renderer.resize());
renderer.resize();

const S = {
  screen: 'title', role: null, net: null, name: 'Player', myId: 1, room: '',
  seats: [], opts: { ...DEFAULT_OPTS }, more: false,
  game: null, roster: {}, snaps: [], view: null, fxTick: 0, lastEvTick: 0, remoteIn: {}, lastSeen: {}, overAt: 0,
  result: null, lastSnapAt: 0, lastSend: 0, lastIn: '', acc: 0, last: 0, phase: 'menu',
};
const seatId = (i) => i + 1;

// ---------- screens ----------
function show(name) {
  S.screen = name;
  for (const id of ['title', 'play', 'select', 'results']) $(id).classList.toggle('show', id === name);
  $('matchBar').classList.toggle('show', name === 'match');
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 2500); }
const isHostLike = () => S.role === 'local' || S.role === 'host';

// ---------- seats ----------
function randomChar(used) { const free = CHAR_IDS.filter((c) => !used.includes(c)); const pool = free.length ? free : CHAR_IDS; return pool[Math.floor(Math.random() * pool.length)]; }
function initSeats() {
  S.seats = [{ kind: 'player', pid: null, name: S.name, char: 'alice', diff: 'normal' }];
  for (let i = 1; i < MAX_PLAYERS; i++) S.seats.push({ kind: i < 4 ? 'bot' : 'off', pid: null, name: '', char: randomChar(S.seats.map((s) => s.char)), diff: 'normal' });
  S.more = false;
}
const seatName = (s, i) => (s.kind === 'bot' ? `Bot ${i + 1}` : s.name || `P${i + 1}`);
const visibleSeats = () => S.seats.slice(0, S.more || S.seats.slice(4).some((s) => s.kind !== 'off') ? 8 : 4);
function publicSeats() { return S.seats.map((s, i) => ({ kind: s.kind, name: seatName(s, i), char: s.char, diff: s.diff })); }
function broadcastLobby() {
  if (S.role !== 'host' || !S.net) return;
  S.seats.forEach((s, i) => { if (s.kind === 'player' && s.pid) S.net.send(s.pid, { t: 'lobby', seats: publicSeats(), opts: S.opts, you: seatId(i), room: S.room }); });
}
function canEdit(i) {
  if (isHostLike()) return S.seats[i].kind !== 'player' || i === 0;
  return seatId(i) === S.myId;
}
function renderSelect() {
  const box = $('seats'); box.innerHTML = '';
  const seats = isHostLike() ? visibleSeats() : S.seats;
  seats.forEach((s, i) => {
    const C = CHARS[s.char], ed = canEdit(i), mine = seatId(i) === S.myId;
    const el = document.createElement('div');
    el.className = 'seat' + (s.kind === 'off' ? ' off' : ''); el.style.setProperty('--c', PLAYER_COLORS[i]);
    const label = s.kind === 'player' ? (mine ? 'You' : s.name) : s.kind === 'bot' ? 'Bot' : 'Off';
    let who = `<span>${esc(label)}${mine && s.kind === 'player' ? '' : ''}</span>`;
    if (isHostLike() && i > 0) {
      if (s.kind === 'player') who += `<button class="sm" data-a="kick" data-i="${i}">Kick</button>`;
      else who += `<button class="sm" data-a="kind" data-i="${i}">${s.kind === 'bot' ? 'Set Off' : 'Set Bot'}</button>`;
    }
    el.innerHTML = `<div class="who">${who}</div>` + (s.kind === 'off' ? '<div class="blurb">Empty seat</div>' :
      `<div class="char"><button class="sm" data-a="prev" data-i="${i}" ${ed ? '' : 'disabled'}>&lt;</button><b>${esc(C.name)}</b><button class="sm" data-a="next" data-i="${i}" ${ed ? '' : 'disabled'}>&gt;</button></div>
       <div class="blurb">${esc(C.blurb)}</div>` +
      (s.kind === 'bot' ? `<button class="sm" data-a="diff" data-i="${i}" ${isHostLike() ? '' : 'disabled'}>Difficulty: ${s.diff}</button>` : ''));
    box.appendChild(el);
  });
  const o = S.opts, host = isHostLike();
  $('settings').innerHTML = `
    <label>Stocks <select id="oStocks" ${host ? '' : 'disabled'}>${[1, 2, 3, 4, 5].map((n) => `<option ${n === o.stocks ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label><input type="checkbox" id="oItems" ${o.items ? 'checked' : ''} ${host ? '' : 'disabled'}> Items &amp; hazards</label>
    ${host ? `<label><input type="checkbox" id="oMore" ${S.more ? 'checked' : ''}> Up to 8 seats</label>` : ''}
    <span>Last one standing wins. 7-minute cap triggers sudden death.</span>`;
  $('btnStart').style.display = host ? '' : 'none';
  $('roomInfo').innerHTML = S.role === 'host' ? `Room code <b>${esc(S.room || '...')}</b>` : S.role === 'client' ? `Room <b>${esc(S.room)}</b> (host starts the match)` : '';
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('seats').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const i = +b.dataset.i, s = S.seats[i], a = b.dataset.a;
  if (a === 'prev' || a === 'next') {
    if (!isHostLike() && seatId(i) === S.myId) { // client choosing own fighter
      const idx = (CHAR_IDS.indexOf(s.char) + (a === 'next' ? 1 : CHAR_IDS.length - 1)) % CHAR_IDS.length;
      s.char = CHAR_IDS[idx]; S.net.send({ t: 'pick', char: s.char }); renderSelect(); return;
    }
    s.char = CHAR_IDS[(CHAR_IDS.indexOf(s.char) + (a === 'next' ? 1 : CHAR_IDS.length - 1)) % CHAR_IDS.length];
  } else if (a === 'kind') s.kind = s.kind === 'bot' ? 'off' : 'bot';
  else if (a === 'diff') s.diff = DIFFICULTIES[(DIFFICULTIES.indexOf(s.diff) + 1) % 3];
  else if (a === 'kick' && S.net) { S.net.kick(s.pid); }
  renderSelect(); broadcastLobby();
});
$('settings').addEventListener('change', (e) => {
  if (!isHostLike()) return;
  if (e.target.id === 'oStocks') S.opts.stocks = +e.target.value;
  if (e.target.id === 'oItems') { S.opts.items = e.target.checked; S.opts.flutter = e.target.checked; }
  if (e.target.id === 'oMore') {
    S.more = e.target.checked;
    for (let i = 4; i < 8; i++) S.seats[i].kind = S.more ? (S.seats[i].kind === 'off' ? 'bot' : S.seats[i].kind) : (S.seats[i].kind === 'bot' ? 'off' : S.seats[i].kind);
    renderSelect();
  }
  broadcastLobby();
});

// ---------- menu wiring ----------
$('btnPlay').onclick = () => { audio.unlock(); show('play'); };
$('btnPlayBack').onclick = () => show('title');
$('peerNote').textContent = peerAvailable() ? 'Online play uses the free public PeerJS broker (third-party; can be down). Some networks block WebRTC.' : 'PeerJS did not load (offline?). Local play still works.';
$('btnHost').disabled = $('btnJoin').disabled = !peerAvailable();
try { $('nick').value = localStorage.getItem('ff.nick') || ''; } catch {}
const getName = () => { const n = ($('nick').value || 'Player').trim().slice(0, 12) || 'Player'; try { localStorage.setItem('ff.nick', n); } catch {} return n; };

$('btnLocal').onclick = () => { audio.unlock(); S.name = getName(); S.role = 'local'; S.myId = 1; initSeats(); show('select'); renderSelect(); };
$('btnHost').onclick = () => {
  audio.unlock(); S.name = getName(); S.role = 'host'; S.myId = 1; S.room = ''; initSeats(); show('select'); renderSelect();
  $('selMsg').textContent = 'Opening room...';
  S.net = hostRoom({
    onOpen: (code) => { S.room = code; $('selMsg').textContent = ''; renderSelect(); },
    onError: (m) => { $('selMsg').textContent = m + ' You can still start a local match.'; },
    onJoin: () => {},
    onMessage: hostMessage,
    onLeave: hostLeave,
  });
};
$('btnJoin').onclick = () => {
  audio.unlock(); S.name = getName();
  const code = $('code').value.trim().toUpperCase();
  if (code.length < 4) { $('playMsg').textContent = 'Enter the room code.'; return; }
  $('playMsg').textContent = 'Connecting...';
  S.role = 'client'; S.room = code; S.myId = 0; S.seats = [];
  S.net = joinRoom(code, {
    onOpen: () => S.net.send({ t: 'hello', name: S.name }),
    onMessage: clientMessage,
    onClose: () => { if (S.role === 'client') { toast('Lost connection to host'); leaveToTitle(); } },
    onError: (m) => { $('playMsg').textContent = m; if (S.net) S.net.close(); S.net = null; S.role = null; },
  });
};
$('btnSelBack').onclick = leaveToTitle;
$('btnLeave').onclick = () => { if (isHostLike()) { endMatchToSelect(); } else leaveToTitle(); };
$('btnMute').onclick = () => { audio.setMuted(!audio.isMuted()); $('btnMute').textContent = 'Sound: ' + (audio.isMuted() ? 'off' : 'on'); };
addEventListener('keydown', (e) => { if (e.code === 'KeyM' && e.target.tagName !== 'INPUT') $('btnMute').click(); if (e.code === 'Escape' && S.screen === 'match') $('btnLeave').click(); });
function leaveToTitle() {
  if (S.net) { try { S.net.close(); } catch {} }
  S.net = null; S.role = null; S.game = null; S.view = null; S.snaps = []; S.phase = 'menu'; $('playMsg').textContent = ''; show('title');
}

// ---------- host networking ----------
function hostMessage(from, m) {
  S.lastSeen[from] = performance.now();
  const i = S.seats.findIndex((s) => s.pid === from);
  if (m.t === 'hello') {
    if (S.phase === 'match') { S.net.send(from, { t: 'denied', why: 'Match in progress. Try again after it ends.' }); return; }
    let k = S.seats.findIndex((s, j) => j > 0 && s.kind === 'bot' && j < (S.more ? 8 : 4));
    if (k < 0) k = S.seats.findIndex((s, j) => j > 0 && s.kind === 'off' && j < (S.more ? 8 : 4));
    if (k < 0) { S.net.send(from, { t: 'denied', why: 'Room is full.' }); return; }
    const taken = S.seats.map((s) => s.name);
    let nm = String(m.name || 'Guest').slice(0, 12), n = 2; while (taken.includes(nm)) nm = String(m.name).slice(0, 10) + n++;
    Object.assign(S.seats[k], { kind: 'player', pid: from, name: nm });
    S.net.send(from, { t: 'welcome', you: seatId(k) });
    renderSelect(); broadcastLobby();
  } else if (m.t === 'pick' && i > 0 && CHARS[m.char]) { S.seats[i].char = m.char; renderSelect(); broadcastLobby(); }
  else if (m.t === 'in' && i > 0) S.remoteIn[seatId(i)] = decodeInput(m);
}
function hostLeave(pid) {
  const i = S.seats.findIndex((s) => s.pid === pid);
  if (i < 0) return;
  toast(`${S.seats[i].name} left`);
  if (S.phase === 'match' && S.game) removeFighter(S.game, seatId(i));
  Object.assign(S.seats[i], { kind: 'bot', pid: null, name: '' }); delete S.remoteIn[seatId(i)];
  if (S.screen === 'select') renderSelect();
  if (S.phase !== 'match') broadcastLobby();
}

// ---------- client networking ----------
function clientMessage(m) {
  if (m.t === 'denied') { $('playMsg').textContent = m.why; toast(m.why); const n = S.net; S.net = null; S.role = null; n && n.close(); show('play'); return; }
  if (m.t === 'welcome') { S.myId = m.you; return; }
  if (m.t === 'toselect') { S.phase = 'lobby'; show('select'); renderSelect(); return; }
  if (m.t === 'lobby') {
    if (S.phase === 'match' || S.phase === 'results') return;
    S.myId = m.you; S.seats = m.seats; S.opts = m.opts; S.phase = 'lobby';
    if (S.screen !== 'select') { show('select'); }
    renderSelect(); return;
  }
  if (m.t === 'start') {
    S.roster = m.roster; S.opts = m.opts; S.snaps = []; S.fxTick = 0; S.phase = 'match'; S.lastSnapAt = performance.now(); S.view = null; $('btnLeave').textContent = 'Leave';
    show('match'); return;
  }
  if (m.t === 's') {
    const d = decodeSnapshot(m); S.lastSnapAt = performance.now();
    S.snaps.push({ at: performance.now(), d }); if (S.snaps.length > 12) S.snaps.shift();
    const evs = d.events.filter((e) => e[0] > S.fxTick); if (evs.length) { S.fxTick = d.tick; fxEvents(evs); }
    return;
  }
  if (m.t === 'result') { showResults(m); return; }
}

// ---------- match ----------
function buildMatch() {
  const players = [];
  S.roster = {};
  S.seats.forEach((s, i) => {
    if (s.kind === 'off') return;
    const id = seatId(i), bot = s.kind === 'bot';
    players.push({ id, name: seatName(s, i), char: s.char, bot, diff: s.diff });
    S.roster[id] = { name: seatName(s, i), color: i, char: s.char, bot, diff: s.diff };
  });
  return players;
}
$('btnStart').onclick = () => {
  if (S.seats.filter((s) => s.kind !== 'off').length < 2) { $('selMsg').textContent = 'Need at least 2 fighters (add a bot).'; return; }
  $('selMsg').textContent = ''; startMatch();
};
function startMatch() {
  const players = buildMatch();
  S.opts = normalizeOpts(S.opts);
  S.game = createGame({ players, opts: S.opts, seed: (Date.now() & 0xffffff) + 1 });
  S.phase = 'match'; S.fxTick = 0; S.lastEvTick = 0; S.overAt = 0; S.acc = 0; S.last = performance.now(); S.result = null;
  if (S.role === 'host') S.net.broadcast({ t: 'start', roster: S.roster, opts: S.opts });
  show('match'); $('btnLeave').textContent = 'End match';
}
function endMatchToSelect() {
  S.game = null; S.phase = 'lobby'; show('select'); renderSelect();
  if (S.role === 'host') { S.net.broadcast({ t: 'toselect' }); broadcastLobby(); }
}
$('btnRematch').onclick = () => { if (isHostLike()) startMatch(); };
$('btnChange').onclick = () => { if (isHostLike()) endMatchToSelect(); };
function showResults(r) {
  S.phase = 'results';
  const w = r.winner ? S.roster[r.winner] : null;
  $('winner').textContent = w ? `${w.name} wins!` : 'Nobody wins. Impressive.';
  const players = r.stats.map((s) => ({ id: s.id, name: S.roster[s.id]?.name || '?', stats: s.stats }));
  const aw = computeAwards(players);
  $('awards').innerHTML = aw.length ? aw.map((a) => `<div class="award" style="--c:${PLAYER_COLORS[S.roster[a.id]?.color ?? 0]}"><b>${esc(a.title)}</b>: ${esc(a.name)} (${esc(a.line)})</div>`).join('') : '<div class="award">A suspiciously polite match. No awards.</div>';
  const host = isHostLike();
  $('btnRematch').style.display = $('btnChange').style.display = host ? '' : 'none';
  $('resMsg').textContent = host ? '' : 'Waiting for the host to start a rematch...';
  show('results');
}
function fxEvents(evs) {
  renderer.fx(evs, S.roster);
  for (const e of evs) audio.sfx(e[1], e[4]);
}
if (!window.__FF_TEST) {
  addEventListener('beforeunload', () => { if (S.net) try { S.net.close(); } catch {} });
}

// ---------- main loop ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - (S.last || now)); S.last = now;
  if (S.screen !== 'match' && S.screen !== 'results' && S.screen !== 'select' && S.screen !== 'title' && S.screen !== 'play') return;
  const inMatch = S.screen === 'match';
  const inp = input.read();

  if (isHostLike() && S.game) {
    const g = S.game;
    if (inMatch) {
      S.acc += dt;
      let steps = 0;
      while (S.acc >= 1000 / 60 && steps < 5) {
        S.acc -= 1000 / 60; steps++;
        const inputs = { ...S.remoteIn, [S.myId]: inp };
        tick(g, inputs);
        if (S.role === 'host' && g.tick % SNAP_EVERY === 0) { S.net.broadcast(encodeSnapshot(g, S.lastEvTick)); S.lastEvTick = g.tick; }
        const evs = g.events.filter((e) => e[0] > S.fxTick); if (evs.length) { S.fxTick = g.tick; fxEvents(evs); }
        if (g.over && !S.overAt) { S.overAt = performance.now(); if (S.role === 'host') S.net.broadcast(encodeSnapshot(g, S.lastEvTick)); }
      }
      if (steps === 5) S.acc = 0;
      if (S.role === 'host') { // drop silent clients
        for (const s of S.seats) if (s.pid && performance.now() - (S.lastSeen[s.pid] || performance.now()) > 10000) S.net.kick(s.pid);
      }
      if (g.over && performance.now() - S.overAt > 2200) {
        const stats = g.fighters.map((f) => ({ id: f.id, stats: f.stats }));
        const res = { t: 'result', winner: g.winner, reason: g.reason, stats };
        if (S.role === 'host') S.net.broadcast(res);
        showResults(res);
      }
    }
    if (S.screen === 'match' || S.screen === 'results') S.view = g;
    $('matchNote').textContent = '';
  } else if (S.role === 'client' && inMatch) {
    // send input at ~60 Hz when changed, heartbeat every 150 ms
    const enc = encodeInput(inp), key = enc.b + ',' + enc.x + ',' + enc.y;
    if (key !== S.lastIn || now - S.lastSend > 150) { S.net.send({ t: 'in', ...enc }); S.lastIn = key; S.lastSend = now; }
    const sn = S.snaps;
    if (sn.length) {
      const rt = now - 100; // interpolation delay
      let a = null, b = sn[sn.length - 1];
      for (let i = sn.length - 1; i > 0; i--) if (sn[i - 1].at <= rt) { a = sn[i - 1]; b = sn[i]; break; }
      if (a && b.at > a.at) S.view = lerpView(a.d, b.d, Math.max(0, Math.min(1, (rt - a.at) / (b.at - a.at))));
      else S.view = sn[0].d === b.d ? b.d : sn[0].d;
    }
    if (now - S.lastSnapAt > 8000) { toast('Lost connection to host'); leaveToTitle(); }
  }

  const showView = S.view && (S.screen === 'match' || S.screen === 'results');
  if (showView) renderer.draw(S.view, { roster: S.roster, myId: S.myId });
  else renderer.draw(idleView, { roster: {}, myId: 0 });
}
const idleView = { fighters: [], ents: [], items: [], layout: 0, timeLeft: 0, sudden: false };
requestAnimationFrame(frame);
show('title');
// ?demo=1: watch 4 bots fight straight away (testing and screenshots). Doesn't touch online play.
if (new URLSearchParams(location.search).get('demo')) {
  S.role = 'local'; initSeats(); S.seats[0].kind = 'bot';
  S.seats.forEach((s, i) => { if (i < 4) s.char = CHAR_IDS[(i * 2) % CHAR_IDS.length]; });
  startMatch();
}
