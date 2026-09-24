// ぶっとばしダミー — 画面・入力・進行（試合の中身は sim.js）
'use strict';
const H = window.Homerun;
const { FPS, FIGHT_F, HW, CEIL, BAT_Y, MOVES, UNITS } = H;
const SITE_URL = 'https://renmy-stack.github.io/homerun/';
const VERSION = '6';   // version.txt と合わせる。更新したら index.html の ?v= も上げる

const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d');
let W = 0, Hh = 0, DPR = 1;

// ---------- 絵（ChatGPT のドット絵。読み込めなければ仮の図形で描く） ----------
const SPR = {};
const DUMMY_H = 68;   // ダミーの絵の高さ（ワールド単位）
function loadSprite(key, src) { const im = new Image(); im.onload = () => { SPR[key] = im; }; im.src = src; }
const HERO_POSES = ['idle', 'jab', 'side', 'up', 'down', 'batready', 'batswing', 'win'];
const DUMMY_POSES = ['idle', 'hit', 'fly', 'down'];
for (const p of HERO_POSES) loadSprite('hero_' + p, 'img/hero_' + p + '.png?v=1');
for (const p of DUMMY_POSES) loadSprite('dummy_' + p, 'img/dummy_' + p + '.png?v=1');
loadSprite('stage', 'img/stage.jpg?v=1');

// ---------- 記録 ----------
const KEY = 'homerun.';
function lsGet(k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) {} }
try { if (lsGet('simv') !== String(H.SIM_VERSION)) { localStorage.removeItem(KEY + 'best'); localStorage.removeItem(KEY + 'bestrun'); lsSet('simv', String(H.SIM_VERSION)); } } catch (e) {}
function loadBest() { const v = lsGet('best'); return v ? +v : null; }
// ともだちの記録（シェア URL の #r=メートル×10）
let rival = null;
{ const m = /[#&]r=(\d+)/.exec(location.hash); if (m) rival = +m[1] / 10; }

// ---------- 状態 ----------
let S = null;                 // sim
let mode = 'title';           // title | play | result
let frameDt = 0, acc = 0, lastTs = 0, hitstop = 0, shake = 0, fast = false, doneWait = 0;
let parts = [], texts = [], flash = 0;
let cam = { x: 0, z: 0 };
let resultShown = false, isRecord = false;

function resize() {
  DPR = Math.min(3, window.devicePixelRatio || 1);
  W = window.innerWidth; Hh = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(Hh * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

function showTitle() {
  mode = 'title';
  $('title').hidden = false; $('result').hidden = true; $('hud').hidden = true;
  const best = loadBest();
  $('tbest').textContent = best != null ? 'じこベスト ' + best.toFixed(1) + ' m' : '';
  if (rival != null) { $('rival').hidden = false; $('rival').textContent = '🏁 ともだちの きろく ' + rival.toFixed(1) + ' m に ちょうせん！'; }
  S = H.makeSim(); S.phase = 'title';
}
function startGame() {
  S = H.makeSim(); mode = 'play'; resultShown = false; fast = false; doneWait = 0;
  parts = []; texts = []; hitstop = 0; shake = 0; flash = 0; cam = { x: 0, z: 0 };
  $('title').hidden = true; $('result').hidden = true; $('hud').hidden = false;
  updateHud();
}

// ---------- 入力: タップ = ジャブ、スワイプ = 向きで技。バットの場面は触れた瞬間に振る ----------
const SWIPE = 26;
let touch = null;
function send(a, dir) {
  if (mode !== 'play' || !S) return;
  if (S.phase === 'fly') { fast = true; return; }
  H.input(S, a, dir);
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (mode !== 'play') return;
  if (S.phase === 'bat' || S.phase === 'fly') { send('jab', 0); touch = null; return; }
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
});
cv.addEventListener('pointermove', e => {
  if (!touch || touch.id !== e.pointerId || touch.used) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (dx * dx + dy * dy < SWIPE * SWIPE) return;
  touch.used = true;
  if (Math.abs(dy) > Math.abs(dx)) send(dy < 0 ? 'up' : 'down', 0);
  else send('side', dx > 0 ? 1 : -1);
});
const endTouch = e => {
  if (!touch || touch.id !== e.pointerId) return;
  if (!touch.used) send('jab', 0);
  touch = null;
};
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', () => { touch = null; });
window.addEventListener('keydown', e => {
  const k = e.key;
  if (mode === 'title' && (k === ' ' || k === 'Enter')) { startGame(); return; }
  if (mode === 'result' && (k === ' ' || k === 'Enter')) { startGame(); return; }
  if (k === ' ' || k === 'z') send('jab', 0);
  else if (k === 'ArrowUp') send('up', 0);
  else if (k === 'ArrowDown') send('down', 0);
  else if (k === 'ArrowLeft') send('side', -1);
  else if (k === 'ArrowRight') send('side', 1);
  else return;
  e.preventDefault();
});
function onTap(el, fn) { el.addEventListener('click', e => { e.preventDefault(); fn(); }); }
onTap($('play'), startGame);
onTap($('again'), startGame);
onTap($('share'), shareResult);
onTap($('closeshare'), () => { $('sharebox').hidden = true; });
onTap($('copy'), () => {
  const ta = $('sharetext'); ta.select();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).catch(() => {});
  else document.execCommand('copy');
  $('copy').textContent = 'コピーしました';
  setTimeout(() => { $('copy').textContent = '文をコピー'; }, 1500);
});

// ---------- 進行 ----------
function tick() {
  if (mode !== 'play') return;
  if (hitstop > 0) { hitstop--; return; }
  H.step(S);
  for (const e of S.fx) onFx(e);
  S.fx.length = 0;
  if (S.phase === 'done' && !resultShown && ++doneWait > 45) showResult();
}
function onFx(e) {
  if (e.t === 'hit') {
    const big = e.kb > 9;
    hitstop = big ? 6 : 3; shake = Math.min(14, e.kb * 0.9);
    burst(e.x, e.y, big ? 16 : 9, big ? '#ffcc33' : '#ffffff');
    texts.push({ x: e.x, y: e.y + 26, s: '+' + e.add.toFixed(1) + '%', life: 40, c: e.combo >= 2 ? '#ffcc33' : '#fff' });
    const el = $('dmg'); el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 90);
  } else if (e.t === 'wall') { shake = Math.max(shake, 4); burst(e.x, e.y + 10, 5, '#9fe0ff'); }
  else if (e.t === 'bounce') burst(e.x, 4, 6, '#d9c7a0');
  else if (e.t === 'toss') { burst(e.x, e.y + 20, 12, '#ffffff'); shake = 6; }
  else if (e.t === 'bat') {
    if (e.result === 'miss' || e.result === 'late') { texts.push({ x: 0, y: 150, s: 'からぶり…', life: 80, c: '#9fb3ff', big: true }); }
    else {
      hitstop = e.result === 'just' ? 22 : 12; shake = e.result === 'just' ? 22 : 12; flash = e.result === 'just' ? 1 : 0.5;
      burst(S.bat.x, BAT_Y + 30, 28, '#ffcc33');
      texts.push({ x: 0, y: 170, s: e.result === 'just' ? 'ジャスト！！' : e.result === 'good' ? 'ナイス！' : 'あたり', life: 70, c: e.result === 'just' ? '#ffcc33' : '#fff', big: true });
    }
  }
}
function burst(x, y, n, c) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 18 + Math.random() * 14, c });
  }
}
function updateHud() {
  if (!S) return;
  $('hud').hidden = mode !== 'play' || S.phase === 'fly' || S.phase === 'done';
  const left = S.phase === 'count' ? FIGHT_F : S.phase === 'fight' ? FIGHT_F - S.pf : 0;
  const t = $('timer'); t.textContent = (left / FPS).toFixed(2); t.classList.toggle('low', left < 180 && left > 0);
  $('dmgnum').textContent = S.dmg.toFixed(1);
  $('combo').textContent = S.combo >= 2 && (S.phase === 'fight' || S.phase === 'timeup') ? S.combo + ' コンボ！' : '';
}

function showResult() {
  resultShown = true; mode = 'result';
  const dist = S.dist, best = loadBest();
  isRecord = dist > 0 && (best == null || dist > best);
  if (isRecord) { lsSet('best', String(dist)); lsSet('bestrun', JSON.stringify(S.inputs)); }
  $('rtitle').textContent = S.bat.result === 'miss' ? 'からぶり…' : S.bat.result === 'just' ? 'ジャストミート！' : 'きろく';
  $('rdist').textContent = dist.toFixed(1);
  $('rsub').textContent = 'ダメージ ' + S.dmg.toFixed(1) + '%　最大 ' + S.maxCombo + ' コンボ';
  const rb = $('rbest');
  rb.className = 'rbest' + (isRecord ? ' new' : '');
  let msg = isRecord ? '🎉 じこベスト こうしん！' : best != null ? 'じこベスト ' + best.toFixed(1) + ' m' : '';
  if (rival != null) msg += (msg ? '\n' : '') + (dist > rival ? '🏆 ともだち（' + rival.toFixed(1) + ' m）に かった！' : 'ともだち ' + rival.toFixed(1) + ' m まで あと ' + (rival - dist).toFixed(1) + ' m');
  rb.textContent = msg; rb.style.whiteSpace = 'pre-line';
  $('result').hidden = false;
}

// ---------- 描画 ----------
// ステージもバット後の飛行も同じ夜の景色。カメラ（cam.x = 画面の中心のワールド座標、cam.z = 1 単位あたりの px）が
// ダミーを追って横に流れ、高く飛ぶほど引く。地面の高さ（画面の oy）は動かさない
function baseView() {
  const k = Math.min(W / (HW * 2 + 30), (Hh * 0.72 - 80) / (CEIL + 20));
  return { k, oy: Math.min(Hh * 0.74, 90 + (CEIL + 20) * k) };
}
function flying() { return S.fly && (S.phase === 'fly' || S.phase === 'done'); }
function flyPos() {   // 飛行中のダミーのワールド座標（sim の飛行はメートル）
  const o = S.fly; return { x: S.bat.x + o.x * UNITS, y: o.y * UNITS };
}
function updateCamera(k, oy) {
  let tx = 0, tz = k, follow = 0.12;
  if (flying()) {
    const f = flyPos();
    tz = Math.min(k, (oy - 130) / (f.y + DUMMY_H + 30));
    tx = Math.max(S.bat.x, f.x + W * 0.1 / Math.max(cam.z, 0.01));
    follow = 1;   // 横は遅れずに追う（速いので遅れると画面から消える）
  } else if (S.phase === 'toss' || S.phase === 'bat') {
    tx = S.bat ? S.bat.x : S.d.x - 12; follow = 0.06;
  }
  if (!cam.z) { cam.z = k; cam.x = tx; }
  cam.x += (tx - cam.x) * follow;
  cam.z += (tz - cam.z) * 0.08;
}
function render() {
  const { k, oy } = baseView();
  updateCamera(k, oy);
  ctx.save();
  if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; } else shake = 0;
  drawScene(k, oy);
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash + ')'; ctx.fillRect(0, 0, W, Hh); flash = Math.max(0, flash - frameDt * 3); }
}

// 背景の絵を横に並べる（継ぎ目が目立たないよう 1 枚おきに左右反転）
function tileImage(im, sy, sh, dy, dh, s, off) {
  const tw = im.width * s;
  let i = Math.floor(off / tw);
  for (let x = i * tw - off; x < W; x += tw, i++) {
    ctx.save();
    if (i & 1) { ctx.translate(x + tw, 0); ctx.scale(-1, 1); ctx.drawImage(im, 0, sy, im.width, sh, 0, dy, tw, dh); }
    else ctx.drawImage(im, 0, sy, im.width, sh, x, dy, tw, dh);
    ctx.restore();
  }
}

function drawScene(k, oy) {
  const z = cam.z, X = x => W / 2 + (x - cam.x) * z, Y = y => oy - y * z;
  // 背景: 空と街は遠いのでゆっくり、床は地面と一緒に動く
  if (SPR.stage) {
    const im = SPR.stage, FL = 0.76, s = Math.max(W / im.width, oy / (FL * im.height), (Hh - oy) / ((1 - FL) * im.height));
    const base = (im.width * s - W) / 2;
    tileImage(im, 0, FL * im.height, oy - FL * im.height * s, FL * im.height * s, s, base + cam.x * k * 0.18);
    tileImage(im, FL * im.height, (1 - FL) * im.height, oy, (1 - FL) * im.height * s, s, base + cam.x * z);
  } else {
    ctx.fillStyle = '#1b1d3a'; ctx.fillRect(0, 0, W, Hh);
    ctx.fillStyle = '#3a3a4a'; ctx.fillRect(0, oy, W, Hh - oy);
  }
  // 見えない壁（戦っている間だけ、うっすら）
  if (S.phase === 'count' || S.phase === 'fight' || S.phase === 'timeup' || S.phase === 'title') {
    ctx.strokeStyle = 'rgba(140,210,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(X(-HW), Y(0)); ctx.lineTo(X(-HW), Y(CEIL)); ctx.lineTo(X(HW), Y(CEIL)); ctx.lineTo(X(HW), Y(0)); ctx.stroke();
    ctx.setLineDash([]);
  }
  // 打つ場所からの距離の目盛り・旗
  if (S.bat) {
    const bx = S.bat.x, stepM = z * UNITS > 30 ? 10 : z * UNITS > 12 ? 25 : 50;
    const mFrom = Math.max(0, Math.floor(((cam.x - W / 2 / z) - bx) / UNITS / stepM) * stepM);
    ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif';
    for (let m = mFrom; bx + m * UNITS < cam.x + W / 2 / z + 40; m += stepM) {
      const sx = X(bx + m * UNITS);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(sx - 1, oy, 2, 12);
      if (m > 0) { ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(m + 'm', sx, oy + 30); ctx.fillStyle = '#fff'; ctx.fillText(m + 'm', sx, oy + 30); }
    }
    const best = loadBest();
    if (best) flag(X(bx + best * UNITS), oy, '#ffcc33', 'ベスト');
    if (rival != null) flag(X(bx + rival * UNITS), oy, '#ff4d4d', 'ともだち');
  }
  // バットの線
  if (S.phase === 'bat' && !S.bat.swung) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
    const LY = BAT_Y + DUMMY_H / 2;   // ダミーの真ん中が線に重なった瞬間 = ジャスト
    ctx.strokeStyle = 'rgba(255,204,51,' + (0.6 + 0.4 * pulse) + ')'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(X(S.bat.x - 90), Y(LY)); ctx.lineTo(X(S.bat.x + 90), Y(LY)); ctx.stroke();
    outlined('線に かさなったら タップ！', W / 2, Y(LY) - 50, 20, '#ffcc33');
  }
  // キャラ
  const d = S.d, p = S.p;
  drawHero(X(p.x), Y(p.y), z, p);
  if (flying()) {
    const f = flyPos();
    drawDummy(X(f.x), Y(f.y), Math.max(z, k * 0.45), d, S.phase === 'fly' ? S.fly.spin * 0.2 : 0);
  } else drawDummy(X(d.x), Y(d.y), z, d);
  // 粒・文字
  for (const q of parts) { ctx.fillStyle = q.c; ctx.globalAlpha = Math.min(1, q.life / 12); ctx.fillRect(X(q.x) - 2, Y(q.y) - 2, 4, 4); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.life / 15);
    ctx.font = (t.big ? 'bold 34px' : 'bold 18px') + ' sans-serif';
    const tx = t.big ? W / 2 : X(t.x), ty = t.big ? Hh * 0.3 : Y(t.y);
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(t.s, tx, ty);
    ctx.fillStyle = t.c; ctx.fillText(t.s, tx, ty);
  }
  ctx.globalAlpha = 1;
  // 大きな文字
  if (S.phase === 'count') {
    const n = 3 - Math.floor(S.pf / 30);
    bigText(n > 0 ? String(n) : 'GO!', Hh * 0.38, '#fff');
    const hy = Math.min(Hh - 60, oy + 56);
    outlined('タップ ジャブ ／ ↑ アッパー', W / 2, hy, 18, '#fff');
    outlined('←→ スマッシュ ／ ↓ たたきつけ', W / 2, hy + 28, 18, '#fff');
  } else if (S.phase === 'fight' && S.pf < 30) bigText('GO!', Hh * 0.38, '#ffcc33');
  else if (S.phase === 'timeup') bigText('タイムアップ！', Hh * 0.38, '#ff4d4d');
  else if (S.phase === 'toss') bigText('ラスト！', Hh * 0.38, '#ffcc33');
  // 飛行中の距離
  if (flying()) {
    const dist = S.phase === 'done' ? S.dist : Math.max(0, S.fly.x);
    ctx.textAlign = 'center'; ctx.font = 'bold 48px sans-serif'; ctx.lineWidth = 8; ctx.strokeStyle = '#000';
    ctx.strokeText(dist.toFixed(1) + ' m', W / 2, 110); ctx.fillStyle = '#fff'; ctx.fillText(dist.toFixed(1) + ' m', W / 2, 110);
    if (S.phase === 'fly' && !fast) { ctx.font = 'bold 14px sans-serif'; ctx.lineWidth = 4; ctx.strokeText('タップで はやおくり', W / 2, 138); ctx.fillText('タップで はやおくり', W / 2, 138); }
  }
}
// 画面の幅（左右 16px の余白）に収まるまで文字を小さくする
function fitFont(s, size, maxW) {
  maxW = maxW || W - 32;
  ctx.font = 'bold ' + size + 'px sans-serif';
  const w = ctx.measureText(s).width;
  if (w > maxW) { size = Math.floor(size * maxW / w); ctx.font = 'bold ' + size + 'px sans-serif'; }
  return size;
}
function outlined(s, x, y, size, c) {
  ctx.textAlign = 'center'; const sz = fitFont(s, size);
  ctx.lineWidth = Math.max(3, sz / 4); ctx.strokeStyle = '#000'; ctx.strokeText(s, x, y);
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}
function bigText(s, y, c) {
  ctx.textAlign = 'center'; fitFont(s, 64);
  ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(s, W / 2, y);
  ctx.fillStyle = c; ctx.fillText(s, W / 2, y);
}

function heroPose(p) {
  if (S.phase === 'toss') return p.act ? 'up' : S.tossed ? 'batready' : 'idle';
  if (S.bat) return S.bat.swung ? (S.phase === 'done' && S.bat.result !== 'miss' ? 'win' : 'batswing') : 'batready';
  if (!p.act) return 'idle';
  const m = MOVES[p.act.a];
  return p.act.f < m.s ? 'idle' : p.act.a;
}
function drawHero(x, y, k, p) {
  const pose = heroPose(p), im = SPR['hero_' + pose], h = 96 * k;   // 絵の箱の高さ（体はその 3/4 ほど）
  ctx.save(); ctx.translate(x, y); if (p.face < 0) ctx.scale(-1, 1);
  if (im) { const w = h * im.width / im.height; ctx.drawImage(im, -w / 2, -h, w, h); }
  else {
    const u = k * 2;   // 仮の図形（ドット風）
    ctx.fillStyle = '#2a64d6'; ctx.fillRect(-6 * u, -18 * u, 12 * u, 12 * u);     // からだ
    ctx.fillStyle = '#ffd7a8'; ctx.fillRect(-5 * u, -28 * u, 10 * u, 10 * u);     // あたま
    ctx.fillStyle = '#e03a3a'; ctx.fillRect(-6 * u, -30 * u, 12 * u, 4 * u);      // ぼうし
    ctx.fillStyle = '#222'; ctx.fillRect(1 * u, -25 * u, 2 * u, 2 * u);
    ctx.fillStyle = '#333'; ctx.fillRect(-5 * u, -6 * u, 4 * u, 6 * u); ctx.fillRect(1 * u, -6 * u, 4 * u, 6 * u);
    ctx.fillStyle = '#ffd7a8';
    if (pose === 'jab') ctx.fillRect(5 * u, -16 * u, 10 * u, 4 * u);
    else if (pose === 'side') ctx.fillRect(5 * u, -17 * u, 16 * u, 6 * u);
    else if (pose === 'up') ctx.fillRect(2 * u, -40 * u, 5 * u, 14 * u);
    else if (pose === 'down') ctx.fillRect(3 * u, -8 * u, 12 * u, 5 * u);
    else if (pose === 'batready') { ctx.fillStyle = '#b07a3a'; ctx.save(); ctx.translate(-4 * u, -18 * u); ctx.rotate(-2.3); ctx.fillRect(0, -2 * u, 22 * u, 4 * u); ctx.restore(); }
    else if (pose === 'batswing') { ctx.fillStyle = '#b07a3a'; ctx.fillRect(4 * u, -16 * u, 24 * u, 5 * u); }
    else ctx.fillRect(4 * u, -15 * u, 4 * u, 4 * u);
  }
  ctx.restore();
}
function dummyPose(d) {
  if (S.phase === 'fly') return 'fly';
  if (S.phase === 'done' && S.fly) return 'down';
  if (S.phase === 'bat') return S.bat.swung ? 'hit' : 'fly';
  if (d.stun > 0 && d.y > 0.5) return 'fly';
  if (d.stun > 0) return 'hit';
  return 'idle';
}
function drawDummy(x, y, k, d, rot) {
  const pose = dummyPose(d), im = SPR['dummy_' + pose], h = DUMMY_H * k;
  ctx.save(); ctx.translate(x, y - (pose === 'down' ? h * 0.3 : h / 2));
  if (pose === 'hit' && d.vx < 0) ctx.scale(-1, 1);
  const r = rot != null ? rot : pose === 'fly' ? d.spin : 0;
  ctx.rotate(r);
  if (im) { const w = h * im.width / im.height; ctx.drawImage(im, -w / 2, -h / 2, w, h); }
  else {
    const u = k * 2;
    ctx.fillStyle = '#d9b27a'; ctx.fillRect(-9 * u, -15 * u, 18 * u, 30 * u);
    ctx.fillStyle = '#b8894e'; ctx.fillRect(-9 * u, -2 * u, 18 * u, 3 * u);
    ctx.fillStyle = '#222';
    if (pose === 'idle') { ctx.fillRect(-4 * u, -10 * u, 2 * u, 2 * u); ctx.fillRect(3 * u, -10 * u, 2 * u, 2 * u); ctx.fillRect(-3 * u, -6 * u, 6 * u, 1 * u); }
    else { ctx.fillRect(-5 * u, -11 * u, 3 * u, 1 * u); ctx.fillRect(3 * u, -11 * u, 3 * u, 1 * u); ctx.fillRect(-2 * u, -7 * u, 4 * u, 3 * u); }
  }
  ctx.restore();
}

function flag(x, gy, c, label) {
  if (x < -40 || x > W + 40) return;
  ctx.fillStyle = '#1b1d3a'; ctx.fillRect(x - 1, gy - 60, 3, 60);
  ctx.fillStyle = c; ctx.fillRect(x + 2, gy - 60, 40, 22);
  ctx.fillStyle = '#1b1d3a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, x + 5, gy - 44);
}

function stepEffects() {
  for (const q of parts) { q.x += q.vx; q.y += q.vy; q.vy -= 0.15; q.life--; }
  parts = parts.filter(q => q.life > 0);
  for (const t of texts) { t.y += 0.5; t.life--; }
  texts = texts.filter(t => t.life > 0);
}

function frame(ts) {
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts; frameDt = dt;
  acc += dt;
  const stepDt = 1 / FPS;
  let n = 0;
  while (acc >= stepDt && n < 8) {
    const reps = S && S.phase === 'fly' && fast ? 6 : 1;
    for (let i = 0; i < reps; i++) tick();
    stepEffects(); acc -= stepDt; n++;
  }
  if (n >= 8) acc = 0;
  if (S) { updateHud(); render(); }
  requestAnimationFrame(frame);
}

// ---------- シェア ----------
function shareResult() {
  const w = 720, h = 480, c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#3a7bd5'); sky.addColorStop(1, '#bfe6ff');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#5aa02c'; g.fillRect(0, 400, w, 80); g.fillStyle = '#8fd14f'; g.fillRect(0, 400, w, 8);
  g.textAlign = 'center'; g.fillStyle = '#1b1d3a';
  g.font = 'bold 36px sans-serif'; g.fillText('ぶっとばしダミー', w / 2, 62);
  g.font = 'bold 96px sans-serif'; g.lineWidth = 10; g.strokeStyle = '#1b1d3a';
  g.strokeText(S.dist.toFixed(1) + ' m', w / 2, 200); g.fillStyle = '#fff'; g.fillText(S.dist.toFixed(1) + ' m', w / 2, 200);
  g.fillStyle = '#1b1d3a'; g.font = 'bold 24px sans-serif';
  g.fillText('ダメージ ' + S.dmg.toFixed(1) + '%　' + S.maxCombo + ' コンボ' + (isRecord ? '　じこベスト！' : ''), w / 2, 250);
  g.font = '18px sans-serif'; g.fillText(SITE_URL, w / 2, h - 24);
  const dataUrl = c.toDataURL('image/png');
  const url = SITE_URL + '#r=' + Math.round(S.dist * 10);
  const text = 'ぶっとばしダミー ' + S.dist.toFixed(1) + 'm（ダメージ ' + S.dmg.toFixed(1) + '%）\nこの記録をこえられる？\n' + url;
  const bin = atob(dataUrl.split(',')[1]), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const file = new File([buf], 'homerun.png', { type: 'image/png' });
  const fallback = err => { if (!err || err.name !== 'AbortError') showShareBox(dataUrl, text); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text }).catch(fallback);
  else if (navigator.share) navigator.share({ text }).catch(fallback);
  else showShareBox(dataUrl, text);
}
function showShareBox(dataUrl, text) { $('shareimg').src = dataUrl; $('sharetext').value = text; $('sharebox').hidden = false; }

// ---------- 開発用: ff(秒) で早送り ----------
window.ff = sec => { const n = Math.round(sec * FPS); for (let i = 0; i < n && mode === 'play'; i++) { if (S.phase === 'done' && resultShown) break; hitstop = 0; tick(); } return S.phase + ' dmg=' + S.dmg + ' dist=' + S.dist; };
window.sim = () => S;
window.settle = () => { flash = 0; texts = []; parts = []; for (let i = 0; i < 90; i++) render(); return 'cam ' + cam.x.toFixed(0) + ' z ' + cam.z.toFixed(2); };   // テスト用: カメラを落ち着かせて描く

// ---------- 自動更新: Safari が古いページを開き続けるので、新しい版があれば読み直す ----------
async function checkVersion() {
  try {
    const r = await fetch('version.txt?ts=' + Date.now(), { cache: 'no-store' });
    const v = (await r.text()).trim();
    if (v && v !== VERSION && mode !== 'play') {
      let tried = ''; try { tried = sessionStorage.getItem(KEY + 'reloadFor') || ''; } catch (e) {}
      if (tried === v) return;
      try { sessionStorage.setItem(KEY + 'reloadFor', v); } catch (e) {}
      location.reload();
    }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
window.addEventListener('pageshow', e => { if (e.persisted) checkVersion(); });
checkVersion();

showTitle();
requestAnimationFrame(frame);
