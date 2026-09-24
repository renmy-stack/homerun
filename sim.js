// ぶっとばしダミー — 試合の進行と物理（DOM 非依存。Node でも動く）
// 決定的: 1 フレーム = 1/60 秒の固定ステップ、入力は「何フレーム目に何をしたか」だけ。Math.sin/cos は使わない
'use strict';
(function (root) {

const SIM_VERSION = 1;          // 物理・技の数値を変えたら上げる（古い記録は捨てる）
const FPS = 60;
const COUNT_F = 90;             // 3・2・1
const FIGHT_F = 600;            // 10 秒
const TIMEUP_F = 50;            // タイムアップの間
const HW = 120;                 // ステージの半幅（見えない壁）
const CEIL = 340;               // 天井
const PG = 0.6;                 // 主人公の重力
const DG = 0.42;                // ダミーの重力
const WALK = 2.6;               // 主人公の自動移動
const LUNGE = 7;                // 技の出だしで寄る速さ

// 技: 出だし s・当たる a・全体 t（フレーム）、当たり判定 [前0, 前1, 下, 上]（主人公の向き基準）、ダメージ・ふっとび（固定 + ダメージ比例）・方向
const MOVES = {
  jab:  { name: 'ジャブ',     s: 3, a: 3, t: 13, box: [4, 36, 0, 42],     dmg: 3,  base: 3.0, grow: 0.030, dir: [0.90, 0.44] },
  side: { name: 'スマッシュ', s: 9, a: 4, t: 36, box: [6, 46, 0, 46],     dmg: 10, base: 5.5, grow: 0.085, dir: [0.77, 0.64] },
  up:   { name: 'アッパー',   s: 4, a: 7, t: 26, box: [-16, 28, 16, 78],  dmg: 6,  base: 5.2, grow: 0.050, dir: [0.12, 0.99] },
  down: { name: 'たたきつけ', s: 6, a: 5, t: 27, box: [-12, 36, -26, 34], dmg: 7,  base: 4.5, grow: 0.045, dir: [0.20, -0.98], gdir: [0.22, 0.97], gbase: 7.6, ggrow: 0.020 },
};
const STALE_N = 6, STALE_K = 0.1;    // 直近 6 回に同じ技があると 1 回ごとに 10% 弱く
const COMBO_K = 0.2, COMBO_MAX = 5;  // 浮いている間に当てると 1 段ごとに +20%（最大 +100%）

// バット: ダミーがゆっくり落ちてくる。バットの高さを通る瞬間に振る
const BAT_Y = 60, BAT_DROP_Y = 300, BAT_G = 0.035;
const BAT_PERFECT = 8, BAT_WINDOW = 60;     // ずれ（ワールド単位）がこれ以下ならジャスト / これを超えると空振り
// 飛行（メートル・フレーム）
const FG = 0.02, FDRAG = 0.9992, BOUNCE = 0.35, ROLL = 0.965;
const DEG = Math.PI / 180;
function dsin(x) {   // 決定的な sin（テイラー展開）。|x| <= π/2 で使う
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))));
}
function dcos(x) { return dsin(Math.PI / 2 - x); }

function makeSim() {
  return {
    f: 0, phase: 'count', pf: 0,
    p: { x: -40, y: 0, vy: 0, face: 1, act: null, buf: null },
    d: { x: 30, y: 0, vx: 0, vy: 0, stun: 0, spin: 0, air: false },
    dmg: 0, combo: 0, maxCombo: 0, hits: 0, stale: [],
    bat: null, fly: null, dist: 0,
    inputs: [], fx: [],
  };
}

// 入力: a = 'jab' | 'side' | 'up' | 'down'、dir = 横スワイプの向き（±1）。バットの場面ではどれでも振る
function input(s, a, dir) {
  if (!accepts(s)) return false;
  s.inputs.push([s.f, a, dir || 0]);
  applyInput(s, a, dir || 0);
  return true;
}
function accepts(s) { return s.phase === 'fight' || (s.phase === 'bat' && !s.bat.swung); }
function applyInput(s, a, dir) {
  if (s.phase === 'fight') { s.p.buf = { a, dir, age: 0 }; return; }
  if (s.phase === 'bat' && !s.bat.swung) swing(s);
}

function grounded(o) { return o.y <= 0.001; }

function startMove(s, a, dir) {
  const p = s.p, d = s.d;
  if (a === 'side' && dir) p.face = dir;
  else p.face = d.x >= p.x ? 1 : -1;
  p.act = { a, f: 0, hit: false };
  if (a === 'up' && grounded(p)) {
    // ダミーが上にいればそこまで跳ぶ（届く高さまで）
    const h = Math.max(0, Math.min(170, d.y - 18));
    p.vy = Math.sqrt(2 * PG * h) + (h > 0 ? 1.2 : 0);
  }
}

function stepFight(s, canAct) {
  const p = s.p, d = s.d;
  // 入力の先行: 技が終わったら次の技を出す（10 フレームまで覚えておく）
  if (canAct && p.buf) { if (!p.act) { startMove(s, p.buf.a, p.buf.dir); p.buf = null; } else if (++p.buf.age > 10) p.buf = null; }
  // 主人公の位置: 技の出だしはダミーの手前へ寄る、それ以外はゆっくりついていく
  if (p.act) {
    const m = MOVES[p.act.a];
    if (p.act.f < m.s) {
      const off = p.act.a === 'up' ? 4 : p.act.a === 'down' ? 12 : 22;
      const tx = d.x - p.face * off;
      p.x += Math.max(-LUNGE, Math.min(LUNGE, tx - p.x));
    }
  } else {
    const face = d.x >= p.x ? 1 : -1, tx = d.x - face * 26;
    p.x += Math.max(-WALK, Math.min(WALK, tx - p.x));
    if (Math.abs(d.x - p.x) > 4) p.face = face;
  }
  p.x = Math.max(-HW + 12, Math.min(HW - 12, p.x));
  if (!grounded(p) || p.vy > 0) { p.y += p.vy; p.vy -= PG; if (p.y <= 0) { p.y = 0; p.vy = 0; } }

  // 技の当たり
  if (p.act) {
    const m = MOVES[p.act.a], k = p.act.f;
    if (!p.act.hit && k >= m.s && k < m.s + m.a) {
      const rx = (d.x - p.x) * p.face, ry = d.y - p.y;
      const [x0, x1, y0, y1] = m.box;
      if (rx >= x0 - 12 && rx <= x1 + 12 && ry + 40 >= y0 && ry <= y1) { p.act.hit = true; hit(s, p.act.a, m); }
    }
    if (++p.act.f >= m.t) p.act = null;
  }

  // ダミーの物理
  if (d.stun > 0) d.stun--;
  d.vy -= DG; d.vx *= 0.992;
  d.x += d.vx; d.y += d.vy;
  d.spin += d.vx * 0.04;
  if (d.x < -HW + 10) { d.x = -HW + 10; d.vx = -d.vx * 0.7; s.fx.push({ t: 'wall', x: d.x, y: d.y }); }
  if (d.x > HW - 10) { d.x = HW - 10; d.vx = -d.vx * 0.7; s.fx.push({ t: 'wall', x: d.x, y: d.y }); }
  if (d.y > CEIL) { d.y = CEIL; d.vy = -Math.abs(d.vy) * 0.6; }
  if (d.y <= 0) {
    d.y = 0;
    if (d.vy < -3) { d.vy = -d.vy * 0.55; s.fx.push({ t: 'bounce', x: d.x, y: 0 }); }
    else { d.vy = 0; d.vx *= 0.82; d.spin *= 0.8; }
    // 地面に着いたらコンボは切れる（たたきつけのバウンドだけはつながる）
    if (d.air && !d.spiked) { d.air = false; s.combo = 0; }
    d.spiked = false;
  }
}

function hit(s, a, m) {
  const d = s.d;
  const air = d.air;   // 前の当たりで浮いてから、まだ地面に着いていない
  const count = s.stale.filter(x => x === a).length;
  const staleMul = 1 - STALE_K * count;
  if (air) { s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); } else s.combo = 0;
  const comboMul = 1 + COMBO_K * Math.min(s.combo, COMBO_MAX);
  const add = Math.round(m.dmg * staleMul * comboMul * 10) / 10;
  s.dmg = Math.round((s.dmg + add) * 10) / 10;
  s.stale.push(a); if (s.stale.length > STALE_N) s.stale.shift();
  s.hits++;
  let dir = m.dir, base = m.base, grow = m.grow;
  if (a === 'down' && grounded(d)) { dir = m.gdir; base = m.gbase; grow = m.ggrow; }
  const kb = (base + grow * s.dmg) * (0.85 + 0.15 * staleMul);
  d.vx = dir[0] * kb * s.p.face; d.vy = dir[1] * kb;
  d.stun = Math.round(12 + kb * 2.2);
  d.air = true; d.spiked = a === 'down' && !grounded(d);
  s.fx.push({ t: 'hit', a, x: d.x, y: d.y + 20, add, combo: s.combo, kb });
}

function swing(s) {
  const b = s.bat, d = s.d;
  b.swung = true; b.at = s.pf;
  const err = d.y - BAT_Y;                       // + は早い（まだ上）/ - は遅い
  const ae = Math.abs(err);
  b.err = err;
  if (ae > BAT_WINDOW) { b.result = 'miss'; s.fx.push({ t: 'bat', result: 'miss' }); return; }
  const q = ae <= BAT_PERFECT ? 1 : 1 - (ae - BAT_PERFECT) / (BAT_WINDOW - BAT_PERFECT) * 0.8;
  const ang = Math.max(6, Math.min(78, 38 + err * 0.5)) * DEG;
  const v = (0.35 + 0.016 * s.dmg) * (0.25 + 0.75 * q);
  b.result = ae <= BAT_PERFECT ? 'just' : q > 0.6 ? 'good' : 'weak';
  b.q = q; b.angle = ang / DEG; b.v = v;
  s.fly = { x: 0, y: 1.5, vx: v * dcos(ang), vy: v * dsin(ang), spin: 0, landed: false, maxY: 1.5, t: 0 };
  s.fx.push({ t: 'bat', result: b.result });
}

function step(s) {
  s.f++; s.pf++;
  if (s.phase === 'count') { if (s.pf >= COUNT_F) { s.phase = 'fight'; s.pf = 0; } return; }
  if (s.phase === 'fight') { stepFight(s, true); if (s.pf >= FIGHT_F) { s.phase = 'timeup'; s.pf = 0; s.p.buf = null; } return; }
  if (s.phase === 'timeup') {
    stepFight(s, false);   // 出ている技とダミーの動きはそのまま見せる
    if (s.pf >= TIMEUP_F) {
      s.phase = 'bat'; s.pf = 0;
      s.p.x = -22; s.p.y = 0; s.p.vy = 0; s.p.face = 1; s.p.act = null;
      s.d.x = 0; s.d.y = BAT_DROP_Y; s.d.vx = 0; s.d.vy = 0; s.d.spin = 0;
      s.bat = { swung: false, at: -1, result: null };
    }
    return;
  }
  if (s.phase === 'bat') {
    const b = s.bat, d = s.d;
    if (!b.swung || b.result === 'miss') {
      if (d.y > 0) { d.vy -= BAT_G; d.y += d.vy; }
      if (d.y <= 0) {
        d.y = 0;
        if (!b.swung) { b.swung = true; b.at = s.pf; b.result = 'miss'; s.fx.push({ t: 'bat', result: 'late' }); }
        if (s.pf - b.at > 50) { s.phase = 'done'; s.pf = 0; s.dist = 0; }
      }
    } else if (s.pf - b.at >= 8) { s.phase = 'fly'; s.pf = 0; }
    return;
  }
  if (s.phase === 'fly') {
    const o = s.fly; o.t++;
    o.vy -= FG; o.vx *= FDRAG; o.vy *= FDRAG;
    o.x += o.vx; o.y += o.vy; o.spin += o.vx * 0.3;
    o.maxY = Math.max(o.maxY, o.y);
    if (o.y <= 0) {
      o.y = 0;
      if (o.vy < -0.08) { o.vy = -o.vy * BOUNCE; o.vx *= 0.75; o.landed = true; s.fx.push({ t: 'land', x: o.x }); }
      else { o.vy = 0; o.vx *= ROLL; o.landed = true; }
      if (o.vy === 0 && o.vx < 0.004) { s.dist = Math.round(o.x * 10) / 10; s.phase = 'done'; s.pf = 0; }
    }
    return;
  }
}

// 入力列から最後まで再生する（検証・リプレイ用）
function replay(inputs) {
  const s = makeSim(); let i = 0;
  while (s.phase !== 'done' && s.f < 20000) {
    while (i < inputs.length && inputs[i][0] === s.f) { input(s, inputs[i][1], inputs[i][2]); i++; }
    step(s); s.fx.length = 0;
  }
  return s;
}

const api = { SIM_VERSION, FPS, COUNT_F, FIGHT_F, TIMEUP_F, HW, CEIL, BAT_Y, BAT_DROP_Y, BAT_PERFECT, BAT_WINDOW, MOVES, makeSim, input, accepts, step, replay };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Homerun = api;
})(this);
