// Canvas renderer: all shapes drawn in code. Browser only. Takes a "view" (sim state or decoded snapshot).
import { CHARS, STAGE, platsFor, PLAYER_COLORS } from './config.js';

const TAU = Math.PI * 2;
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 640, y: 300, w: 1280 };
  const parts = [];
  const lastX = new Map();
  let shake = 0, clock = 0;
  let W = 1280, H = 720, dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  function burst(x, y, color, n, spd, life = 30, size = 4) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = spd * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * (0.5 + Math.random()) }); }
  }
  function fx(events, roster) {
    for (const e of events) {
      const [, type, x, y, v] = e;
      if (type === 'hit') { burst(x, y, '#fff6d0', 6 + Math.min(14, v), 3 + v * 0.3, 20, 4); shake = Math.max(shake, Math.min(10, v * 0.5)); }
      else if (type === 'ko') { const c = (roster[v] && PLAYER_COLORS[roster[v].color]) || '#fff'; burst(x, y, c, 40, 10, 50, 7); shake = 14; }
      else if (type === 'splat') burst(x, y, '#f6e3b4', 12, 4, 25, 5);
      else if (type === 'pop') burst(x, y, '#9fe3ff', 10, 3, 20, 4);
      else if (type === 'wish') burst(x, y - 30, '#ffd23f', 40, 9, 40, 5);
      else if (type === 'heal') burst(x, y, '#6bff95', 12, 2, 40, 5);
      else if (type === 'jump' || type === 'dj') burst(x, y, '#ffffff55', 5, 2, 15, 3);
      else if (type === 'flutter') for (let i = 0; i < 30; i++) parts.push({ x: 200 + Math.random() * 900, y: 100 + Math.random() * 200, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 2, life: 60, max: 60, color: '#f3e7c9', size: 6 });
      else if (type === 'counter') burst(x, y, '#ffffff', 20, 8, 20, 4);
    }
  }

  function updateCamera(view) {
    const live = view.fighters.filter((f) => f.state !== 'dead' && f.state !== 'out');
    let minx = 340, maxx = 940, miny = 200, maxy = 470;
    for (const f of live) { minx = Math.min(minx, f.x); maxx = Math.max(maxx, f.x); miny = Math.min(miny, f.y - 80); maxy = Math.max(maxy, f.y + 20); }
    const aspect = W / H;
    let w = Math.max(1000, maxx - minx + 360);
    w = Math.max(w, (maxy - miny + 260) * aspect);
    w = Math.min(w, 2300);
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2 - 20;
    cam.w += (w - cam.w) * 0.08; cam.x += (cx - cam.x) * 0.08; cam.y += (cy - cam.y) * 0.08;
  }

  function draw(view, info) {
    clock++;
    const { roster, myId } = info;
    if (!W) resize();
    updateCamera(view);
    const s = W / cam.w;
    const gold = view.fighters.filter((f) => f.stocks > 0).length > 1 && view.fighters.filter((f) => f.stocks > 0).every((f) => f.stocks === 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, gold ? '#3a2c0c' : '#0e0f1c'); bg.addColorStop(1, gold ? '#1d1604' : '#1c1732');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // drifting ink dots
    ctx.fillStyle = gold ? '#ffd23f22' : '#ffffff10';
    for (let i = 0; i < 40; i++) { const x = ((i * 197 + clock * 0.1 * (1 + (i % 3))) % (W + 40)), y = (i * 89) % H; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, TAU); ctx.fill(); }

    const sh = shake > 0.3 ? shake : 0; shake *= 0.85;
    ctx.save();
    ctx.translate(W / 2 + (sh ? (Math.random() - 0.5) * sh : 0), H / 2 + (sh ? (Math.random() - 0.5) * sh : 0));
    ctx.scale(s, s); ctx.translate(-cam.x, -cam.y);

    // blast zone
    const B = STAGE.blast;
    ctx.strokeStyle = '#ff5a5f33'; ctx.lineWidth = 4; ctx.setLineDash([24, 18]); ctx.strokeRect(B.l, B.t, B.r - B.l, B.b - B.t); ctx.setLineDash([]);

    drawStage(ctx, platsFor(view.layout), gold);
    for (const it of view.items) drawItem(ctx, it.kind, it.x, it.y, clock);
    for (const e of view.ents) drawEnt(ctx, e, clock);
    for (const f of view.fighters) {
      if (f.state === 'dead' || f.state === 'out') continue;
      const r = roster[f.id] || { color: 0, name: '?' };
      const sp = (f.x - (lastX.get(f.id) ?? f.x)); lastX.set(f.id, f.x);
      drawFighter(ctx, f, PLAYER_COLORS[r.color % 8], sp, clock);
    }
    for (const f of view.fighters) {
      if (f.state === 'dead' || f.state === 'out') continue;
      const r = roster[f.id] || { color: 0, name: '?' };
      drawTag(ctx, f, r, PLAYER_COLORS[r.color % 8], f.id === myId);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.vx *= 0.97; p.life--;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // screen-space overlays
    const me = view.fighters.find((f) => f.id === myId);
    if (me && me.blind > 0) { ctx.fillStyle = `rgba(246,227,180,${Math.min(1, me.blind / 25)})`; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#d9b97a'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(W * (0.2 + 0.08 * i), H * (0.3 + 0.07 * ((i * 5) % 7)), 40 + i * 6, 0, TAU); ctx.fill(); } }
    drawHud(ctx, view, roster, W, H);
  }

  return { draw, fx, resize };
}

// ---------- stage ----------
function drawStage(ctx, plats, gold) {
  const [m, ...thin] = plats;
  const cream = gold ? '#ffe9a0' : '#f3e7c9', cream2 = gold ? '#f7d774' : '#e6d7b0';
  // cover underneath
  ctx.fillStyle = '#4a2f24'; rr(ctx, m.x1 - 24, m.y + 30, m.x2 - m.x1 + 48, 26, 8); ctx.fill();
  ctx.fillStyle = '#6b4333'; rr(ctx, m.x1 - 24, m.y + 30, m.x2 - m.x1 + 48, 8, 4); ctx.fill();
  // two pages
  const mid = (m.x1 + m.x2) / 2;
  ctx.fillStyle = cream; ctx.beginPath(); ctx.moveTo(m.x1, m.y); ctx.lineTo(mid - 4, m.y + 4); ctx.lineTo(mid - 4, m.y + 34); ctx.lineTo(m.x1, m.y + 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cream2; ctx.beginPath(); ctx.moveTo(m.x2, m.y); ctx.lineTo(mid + 4, m.y + 4); ctx.lineTo(mid + 4, m.y + 34); ctx.lineTo(m.x2, m.y + 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b79d6b'; ctx.fillRect(mid - 4, m.y + 2, 8, 34);
  ctx.strokeStyle = '#00000025'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(m.x1 + 20, m.y + 10 + i * 8); ctx.lineTo(mid - 24, m.y + 12 + i * 8); ctx.moveTo(mid + 24, m.y + 12 + i * 8); ctx.lineTo(m.x2 - 20, m.y + 10 + i * 8); ctx.stroke(); }
  ctx.fillStyle = '#c0392b88'; ctx.font = 'bold 22px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('Once upon a time', (m.x1 + mid) / 2, m.y + 28 - 3); ctx.textAlign = 'left';
  // thin pages
  for (const p of thin) {
    ctx.fillStyle = cream; rr(ctx, p.x1, p.y, p.x2 - p.x1, 12, 3); ctx.fill();
    ctx.fillStyle = '#00000022'; ctx.fillRect(p.x1 + 8, p.y + 5, p.x2 - p.x1 - 16, 2);
    ctx.fillStyle = cream2; ctx.beginPath(); ctx.moveTo(p.x2, p.y); ctx.lineTo(p.x2 + 10, p.y + 12); ctx.lineTo(p.x2, p.y + 12); ctx.fill();
  }
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------- items & entities ----------
function drawItem(ctx, kind, x, y, clock) {
  ctx.save(); ctx.translate(x, y - 12 + Math.sin(clock * 0.1 + x) * 2);
  if (kind === 'pie') { ctx.fillStyle = '#c98a3b'; ctx.beginPath(); ctx.ellipse(0, 4, 15, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#f6e3b4'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8544f'; ctx.beginPath(); ctx.arc(0, -2, 3, 0, TAU); ctx.fill(); }
  else if (kind === 'tea') { ctx.fillStyle = '#f5f0e6'; rr(ctx, -10, -8, 20, 16, 5); ctx.fill(); ctx.strokeStyle = '#f5f0e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(12, 0, 5, -1.5, 1.5); ctx.stroke(); ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-8, -8, 16, 4); ctx.fillStyle = '#6bff95'; ctx.fillRect(-2, -20, 4, 8); ctx.fillRect(-4, -18, 8, 4); }
  else { ctx.fillStyle = '#b5651d'; ctx.beginPath(); ctx.arc(0, -10, 8, 0, TAU); ctx.fill(); ctx.fillRect(-12, -4, 24, 8); ctx.fillRect(-10, 4, 7, 11); ctx.fillRect(3, 4, 7, 11); ctx.fillStyle = '#fff'; ctx.fillRect(-12, -2, 24, 2); ctx.fillStyle = '#e8544f'; ctx.fillRect(-1, -2, 3, 3); }
  ctx.restore();
}
function drawEnt(ctx, e, clock) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.k === 'arrow') { ctx.scale(e.face || 1, 1); ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(12, 0); ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(12, -4); ctx.lineTo(20, 0); ctx.lineTo(12, 4); ctx.fill(); ctx.fillStyle = '#2f6f5e'; ctx.fillRect(-16, -3, 6, 6); }
  else if (e.k === 'pie') { ctx.rotate(clock * 0.3); ctx.fillStyle = '#f6e3b4'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c98a3b'; ctx.fillRect(-14, 2, 28, 3); }
  else if (e.k === 'spark') { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 5 : 13, a = i * Math.PI / 4 + clock * 0.2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); }
  else if (e.k === 'bubble') { ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 3; ctx.fillStyle = '#9fe3ff33'; ctx.beginPath(); ctx.arc(0, 0, 32 + Math.sin(clock * 0.2) * 2, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, -10, 5, 0, TAU); ctx.fill(); }
  else if (e.k === 'shadow') {
    const a = e.t < 10 ? e.t / 10 : e.t < 20 ? 1 : Math.max(0, 1 - (e.t - 20) / 8);
    ctx.globalAlpha = 0.65 * a; ctx.scale(e.face || 1, 1); ctx.fillStyle = '#0a0a14';
    ctx.beginPath(); ctx.ellipse(0, -30, 12, 26, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -58, 12, 0, TAU); ctx.fill();
    if (e.t >= 10 && e.t < 20) { ctx.fillRect(10, -40, 54, 7); }
  }
  ctx.restore();
}

// ---------- fighters ----------
function drawFighter(ctx, f, color, speed, clock) {
  const C = CHARS[f.char] || CHARS.alice;
  const sc = f.scale;
  ctx.save(); ctx.translate(f.x, f.y);
  // ground ring in player colour
  ctx.fillStyle = color + '55'; ctx.beginPath(); ctx.ellipse(0, 2, 24 * sc, 6 * sc, 0, 0, TAU); ctx.fill();
  if (f.invuln > 0 && Math.floor(clock / 4) % 2) ctx.globalAlpha = 0.45;
  if (f.state === 'dodge') ctx.globalAlpha = 0.4;
  ctx.scale(sc * f.face, sc);
  if (f.state === 'hit' || f.state === 'stun') { ctx.translate(0, -30); ctx.rotate(Math.sin(f.t * 0.6) * (f.state === 'hit' ? 0.5 : 0.15)); ctx.translate(0, 30); }
  const run = Math.min(1, Math.abs(speed) / 4);
  const swing = Math.sin(clock * 0.45) * 7 * run;
  const attacking = f.state === 'light' || f.state === 'heavy' || f.state === 'special' || f.state === 'throw';
  const mv = f.state === 'heavy' ? C.heavy : C.light;
  const armored = f.char === 'demigod' && (f.state === 'charge' || f.state === 'heavy' || f.sub === 'charge');
  if (armored) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.globalAlpha *= 0.8; ctx.beginPath(); ctx.arc(0, -34, 40, 0, TAU); ctx.stroke(); ctx.globalAlpha = f.invuln > 0 ? 0.45 : 1; }

  drawBack(ctx, f, C, color, clock);
  // legs / tail
  if (f.char === 'sea') {
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-11, -22); ctx.quadraticCurveTo(-12, -6, -4 + swing * 0.4, 0); ctx.lineTo(4 + swing * 0.4, 0); ctx.quadraticCurveTo(12, -6, 11, -22); ctx.fill();
    ctx.fillStyle = C.accent2; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-16 + swing, -10); ctx.lineTo(-14 + swing, 2); ctx.lineTo(0, 0); ctx.lineTo(14 - swing, 2); ctx.lineTo(16 - swing, -10); ctx.lineTo(3, -2); ctx.fill();
  } else {
    const legCol = f.char === 'alice' ? null : f.char === 'thief' ? C.accent2 : '#2b2b3a';
    for (const [lx, sw] of [[-6, swing], [6, -swing]]) {
      ctx.save(); ctx.translate(lx, -20); ctx.rotate(sw * 0.05);
      if (f.char === 'alice') { for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#fff' : C.accent; ctx.fillRect(-3.5, i * 5, 7, 5); } }
      else { ctx.fillStyle = legCol; const wide = f.char === 'thief' ? 4.5 : f.char === 'demigod' ? 5 : 3.5; ctx.fillRect(-wide, 0, wide * 2, 20); }
      ctx.fillStyle = f.char === 'lostboy' || f.char === 'jungle' ? C.skin : '#1a1a22'; ctx.fillRect(-4, 17, 9, 4);
      ctx.restore();
    }
  }
  // torso
  const bw = f.char === 'demigod' ? 17 : 12;
  ctx.fillStyle = color; rr(ctx, -bw, -48, bw * 2, 29, 6); ctx.fill();
  ctx.strokeStyle = '#00000055'; ctx.lineWidth = 2; ctx.stroke();
  drawBody(ctx, f, C, color, bw, clock);
  // head
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(0, -57, 12, 0, TAU); ctx.fill(); ctx.stroke();
  if (f.char === 'wooden') { ctx.strokeStyle = '#8a5a2b88'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-4, -57, 4 + i * 3, -1, 1); ctx.stroke(); } }
  drawHead(ctx, f, C, color, clock);
  // eyes
  const blindFace = f.blind > 0;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -59, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(6.3, -59, 1.8, 0, TAU); ctx.fill();
  if (f.state === 'hit' || f.state === 'stun') { ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, -62); ctx.lineTo(8, -57); ctx.moveTo(8, -62); ctx.lineTo(2, -57); ctx.stroke(); }
  if (blindFace) { ctx.fillStyle = '#f6e3b4'; ctx.beginPath(); ctx.ellipse(2, -57, 12, 10, 0, 0, TAU); ctx.fill(); }
  // arms / attack
  drawArms(ctx, f, C, color, attacking, mv, clock);
  ctx.restore();

  // shield bubble
  if (f.state === 'shield') { ctx.save(); ctx.translate(f.x, f.y - 34 * sc); ctx.globalAlpha = 0.25 + 0.2 * (f.shieldHP / 100); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, (22 + 26 * f.shieldHP / 100) * sc, 0, TAU); ctx.fill(); ctx.restore(); }
  if (f.state === 'counter') { ctx.save(); ctx.translate(f.x, f.y - 34 * sc); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.lineWidth = 4; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(0, 0, 40 * sc, clock * 0.1, clock * 0.1 + TAU); ctx.stroke(); ctx.restore(); }
  if (f.floatT > 0) { ctx.save(); ctx.translate(f.x, f.y - 34 * sc); ctx.strokeStyle = '#bfefff'; ctx.fillStyle = '#9fe3ff44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 46 * sc, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
  if (f.state === 'stun') { ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 3; i++) { const a = clock * 0.2 + i * 2.1; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 18, f.y - 80 * sc + Math.sin(a) * 5, 3, 0, TAU); ctx.fill(); } }
  if (f.state === 'charge' || (f.state === 'heavy' && f.t < 6)) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.3 + f.charge * 0.7; ctx.lineWidth = 2 + f.charge * 5; ctx.beginPath(); ctx.arc(f.x, f.y - 34 * sc, (30 + f.charge * 20) * sc, 0, TAU); ctx.stroke(); ctx.restore(); }
  if (f.item) { ctx.save(); ctx.translate(f.x, f.y - 90 * sc); drawItem(ctx, f.item, 0, 0, clock); ctx.restore(); }
  if (f.char === 'thief' && f.wishes > 0) { ctx.fillStyle = '#ffd23f'; for (let i = 0; i < f.wishes; i++) { ctx.beginPath(); ctx.arc(f.x - 12 + i * 12, f.y + 14, 4, 0, TAU); ctx.fill(); } }
}

function drawBack(ctx, f, C, color, clock) {
  if (f.char === 'outlaw') { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-8, -46); ctx.lineTo(-30 - Math.sin(clock * 0.2) * 3, -8); ctx.lineTo(-6, -22); ctx.fill(); ctx.fillStyle = C.accent2; ctx.fillRect(-16, -52, 7, 26); ctx.fillStyle = '#ddd'; ctx.fillRect(-15, -58, 1.5, 8); ctx.fillRect(-12, -58, 1.5, 8); }
  if (f.char === 'alice') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(-3, -55, 16, 0, TAU); ctx.fill(); }
  if (f.char === 'sea') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.moveTo(-6, -66); ctx.quadraticCurveTo(-34, -50, -26 + Math.sin(clock * 0.15) * 4, -14); ctx.lineTo(-8, -40); ctx.fill(); }
  if (f.char === 'warrior') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.moveTo(-6, -64); ctx.quadraticCurveTo(-32, -58, -28 + Math.sin(clock * 0.25) * 5, -30); ctx.lineTo(-6, -56); ctx.fill(); }
  if (f.char === 'thief') { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-8, -64); ctx.lineTo(-28 + Math.sin(clock * 0.3) * 3, -52); ctx.lineTo(-8, -56); ctx.fill(); }
  if (f.char === 'lostboy' && f.gliding) { ctx.fillStyle = '#3d7a4a99'; ctx.beginPath(); ctx.moveTo(-4, -44); ctx.lineTo(-52, -70); ctx.lineTo(-40, -30); ctx.fill(); ctx.beginPath(); ctx.moveTo(4, -44); ctx.lineTo(52, -70); ctx.lineTo(40, -30); ctx.fill(); }
  if (f.char === 'thief' && f.state === 'special' && f.sub === 'carpet') { ctx.fillStyle = C.accent2; rr(ctx, -34, 2, 68, 8, 3); ctx.fill(); ctx.fillStyle = C.accent; ctx.fillRect(-34, 4, 68, 2); ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 6; i++) ctx.fillRect(-34 + i * 12, 10, 3, 6); }
}
function drawBody(ctx, f, C, color, bw, clock) {
  if (f.char === 'alice') { ctx.fillStyle = C.accent2; ctx.beginPath(); ctx.moveTo(-bw, -26); ctx.lineTo(bw, -26); ctx.lineTo(bw + 6, -17); ctx.lineTo(-bw - 6, -17); ctx.fill(); }
  if (f.char === 'wooden') { ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(0, -40 + i * 10, 2.5, 0, TAU); ctx.fill(); } ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(-bw, -44, 3.5, 0, TAU); ctx.arc(bw, -44, 3.5, 0, TAU); ctx.fill(); }
  if (f.char === 'lostboy') { ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(-bw + i * (bw / 3), -20 + (i % 2 ? 7 : 0)); ctx.fill(); ctx.fillStyle = C.accent; ctx.fillRect(-bw, -30, bw * 2, 3); }
  if (f.char === 'outlaw') { ctx.fillStyle = C.accent2; ctx.fillRect(-bw, -29, bw * 2, 4); ctx.fillStyle = '#ffd23f'; ctx.fillRect(-2, -30, 4, 6); }
  if (f.char === 'thief') { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-bw, -48); ctx.lineTo(-bw + 8, -48); ctx.lineTo(bw, -24); ctx.lineTo(bw - 8, -24); ctx.fill(); }
  if (f.char === 'demigod') { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-bw, -48); ctx.lineTo(0, -48); ctx.lineTo(bw, -24); ctx.lineTo(bw, -19); ctx.lineTo(-bw, -19); ctx.fill(); ctx.fillStyle = C.accent2; ctx.fillRect(-bw, -28, bw * 2, 4); }
  if (f.char === 'warrior') { ctx.fillStyle = C.accent2; ctx.fillRect(-bw, -48, bw * 2, 3); ctx.fillStyle = '#14141c'; ctx.fillRect(-bw, -29, bw * 2, 5); }
  if (f.char === 'sea') { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(-6, -38, 5, Math.PI, TAU); ctx.arc(6, -38, 5, Math.PI, TAU); ctx.fill(); ctx.fillStyle = C.accent2; ctx.fillRect(-bw, -26, bw * 2, 3); }
}
function drawHead(ctx, f, C, color, clock) {
  ctx.lineWidth = 2;
  if (f.char === 'alice') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0, -61, 12, Math.PI, TAU); ctx.fill(); ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-1, -72); ctx.lineTo(-13, -80); ctx.lineTo(-13, -66); ctx.fill(); ctx.beginPath(); ctx.moveTo(-1, -72); ctx.lineTo(11, -80); ctx.lineTo(11, -66); ctx.fill(); }
  if (f.char === 'wooden') { ctx.fillStyle = C.hair; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-8 + i * 6, -67); ctx.lineTo(-5 + i * 6, -76); ctx.lineTo(-2 + i * 6, -67); ctx.fill(); } const poke = f.state === 'special' && f.sub === 'nose' && f.t >= 8 && f.t < 22 ? 50 : 0; const len = 8 + f.noseLen + poke; ctx.strokeStyle = C.accent; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10, -56); ctx.lineTo(10 + len, -56 - Math.min(10, len * 0.05)); ctx.stroke(); ctx.lineCap = 'butt'; }
  if (f.char === 'lostboy') { ctx.fillStyle = C.hair; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-11 + i * 6, -64); ctx.lineTo(-8 + i * 6, -78 + (i % 2) * 4); ctx.lineTo(-3 + i * 6, -64); ctx.fill(); } }
  if (f.char === 'outlaw') { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(-14, -52); ctx.lineTo(-3, -80); ctx.lineTo(14, -56); ctx.lineTo(14, -62); ctx.lineTo(0, -60); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(-2, -62, 15, 5); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -59.5, 2.5, 0, TAU); ctx.fill(); }
  if (f.char === 'thief') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0, -60, 12.5, Math.PI, TAU); ctx.fill(); ctx.fillStyle = C.accent; ctx.fillRect(-12, -65, 24, 5); }
  if (f.char === 'demigod') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0, -61, 12.5, Math.PI * 0.95, TAU * 1.02); ctx.fill(); ctx.strokeStyle = '#6ea35b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -60, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  if (f.char === 'warrior') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0, -61, 12.5, Math.PI, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-2, -75, 6, 0, TAU); ctx.fill(); ctx.fillStyle = C.accent; ctx.fillRect(-12, -64, 24, 3); }
  if (f.char === 'sea') { ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0, -61, 12.5, Math.PI * 0.9, TAU * 1.05); ctx.fill(); ctx.fillStyle = C.accent; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 6, -72); ctx.lineTo(-3 + i * 6, -80); ctx.lineTo(0 + i * 6, -72); ctx.fill(); } }
}
function drawArms(ctx, f, C, color, attacking, mv, clock) {
  const act = attacking && f.t >= 0;
  let reach = 8, y = -38;
  if (f.state === 'light' || f.state === 'heavy') {
    const a = f.t >= mv.startup && f.t < mv.startup + mv.active;
    reach = a ? 30 + (f.state === 'heavy' ? 14 : 0) : f.state === 'heavy' ? -4 : 10;
    if (a) { ctx.save(); ctx.globalAlpha *= 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(28 + mv.w * 0.25, -34, mv.w * 0.55, mv.h * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    if (f.mvO === 'ginger') { ctx.fillStyle = '#b5651d'; ctx.save(); ctx.translate(18, -40); ctx.rotate(a ? 0.6 : -1); ctx.fillRect(-6, -34, 12, 40); ctx.beginPath(); ctx.arc(0, -40, 9, 0, TAU); ctx.fill(); ctx.restore(); }
  } else if (f.state === 'special') {
    if (f.sub === 'volley' || f.sub === 'spark' || f.sub === 'bubble') reach = 24;
    if (f.sub === 'charge') reach = 20;
    if (f.sub === 'flurry' || f.sub === 'counterstrike') { reach = 34; ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -36); ctx.lineTo(54, -48); ctx.stroke(); }
    if (f.sub === 'grow') { reach = f.t > 18 ? 26 : 0; }
    if (f.sub === 'wish') { ctx.fillStyle = '#ffd23f88'; ctx.beginPath(); ctx.arc(0, -40, 20 + f.t * 4, 0, TAU); ctx.fill(); }
  } else if (f.state === 'taunt') { y = -50 - Math.sin(f.t * 0.6) * 6; reach = 14; }
  else if (f.state === 'throw') reach = 24;
  if (f.char === 'outlaw' && (f.sub === 'volley')) { ctx.strokeStyle = '#8c5a2b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(20, -38, 16, -1.2, 1.2); ctx.stroke(); }
  ctx.fillStyle = f.char === 'demigod' ? C.skin : color; ctx.strokeStyle = '#00000055'; ctx.lineWidth = 1.5;
  rr(ctx, 4, y - 4, Math.max(6, reach), 8, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(4 + Math.max(6, reach), y, f.char === 'demigod' ? 6 : 4.5, 0, TAU); ctx.fill();
}

// ---------- tag + HUD ----------
function drawTag(ctx, f, r, color, mine) {
  const y = f.y - 84 * f.scale - (f.item ? 22 : 0) - 8;
  ctx.save(); ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center';
  const tw = ctx.measureText(r.name).width + 14;
  ctx.fillStyle = '#0b0c16cc'; rr(ctx, f.x - tw / 2, y - 15, tw, 20, 6); ctx.fill();
  ctx.fillStyle = color; ctx.fillRect(f.x - tw / 2, y + 3, tw, 2);
  ctx.fillText(r.name, f.x, y);
  if (mine) { ctx.beginPath(); ctx.moveTo(f.x - 6, y - 22); ctx.lineTo(f.x + 6, y - 22); ctx.lineTo(f.x, y - 15); ctx.fill(); }
  ctx.restore();
}
function drawHud(ctx, view, roster, W, H) {
  const fs = view.fighters;
  const n = Math.max(1, fs.length), cw = Math.min(230, (W - 24) / n - 10), ch = 70;
  const x0 = (W - (cw + 10) * n + 10) / 2, y0 = H - ch - 12;
  ctx.textAlign = 'left';
  fs.forEach((f, i) => {
    const r = roster[f.id] || { color: i, name: '?' }, col = PLAYER_COLORS[r.color % 8];
    const x = x0 + i * (cw + 10);
    ctx.globalAlpha = f.state === 'out' ? 0.4 : 1;
    ctx.fillStyle = '#0b0c16dd'; rr(ctx, x, y0, cw, ch, 10); ctx.fill();
    ctx.fillStyle = col; rr(ctx, x, y0, cw, 6, 3); ctx.fill();
    ctx.fillStyle = '#e9e9f2'; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(r.name + (r.bot ? ' · Bot ' + (r.diff || '') : ''), x + 10, y0 + 24, cw - 20);
    const p = Math.round(f.percent), red = Math.min(1, Math.max(0, (p - 60) / 100));
    ctx.fillStyle = `rgb(255,${Math.round(255 - red * 170)},${Math.round(255 - red * 175)})`; ctx.font = `bold ${cw < 150 ? 26 : 34}px system-ui, sans-serif`;
    ctx.fillText(f.state === 'out' ? 'OUT' : p + '%', x + 10, y0 + 58);
    ctx.fillStyle = col;
    for (let k = 0; k < Math.max(0, f.stocks); k++) { ctx.beginPath(); ctx.arc(x + cw - 18 - k * 18, y0 + 50, 6, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  });
  // timer / sudden death
  ctx.textAlign = 'center'; ctx.font = 'bold 18px system-ui, sans-serif';
  if (view.sudden) { ctx.fillStyle = (Math.floor(Date.now() / 400) % 2) ? '#ff5a5f' : '#ffd23f'; ctx.fillText('SUDDEN DEATH', W / 2, 28); }
  else if (view.timeLeft > 0) { const sec = Math.ceil(view.timeLeft / 60); ctx.fillStyle = '#e9e9f2aa'; ctx.fillText(Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), W / 2, 28); }
  ctx.textAlign = 'left';
}
