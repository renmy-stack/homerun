// node test_sim.js — いろいろな遊び方のボットでダメージ%と飛距離を測る。最後にリプレイの完全一致を確認
'use strict';
const H = require('./sim.js');

// 疑似乱数（決定的）
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

const clone = s => JSON.parse(JSON.stringify(s));
// 先読み: 各技を試して、当たってダメージが一番増え、浮いたままになるものを選ぶ（上手い人の上限の目安）
function expert(s) {
  let best = null, bestV = 0.5;
  for (const [a, dir] of [['jab', 0], ['side', 1], ['side', -1], ['up', 0], ['down', 0]]) {
    const c = clone(s); c.fx = []; H.input(c, a, dir);
    for (let k = 0; k < 40 && c.phase === 'fight' && (c.p.act || c.p.buf || k < 2); k++) H.step(c);
    let v = c.dmg - s.dmg;
    if (v > 0 && c.d.y > 8 && c.d.stun > 0) v += 4;
    if (v > bestV) { bestV = v; best = [a, dir]; }
  }
  return best;
}
const BOTS = {
  expert: s => expert(s),
  // でたらめにスワイプ（人が適当に触る）
  random: (s, r) => ['jab', 'side', 'up', 'down'][Math.floor(r() * 4)],
  jab: () => 'jab',
  side: () => 'side',
  // 浮かせてアッパー、落ちてきたら横、地面ならたたきつけで浮かせる
  juggle: (s, r) => {
    const d = s.d, p = s.p;
    if (d.y < 4) return 'down';
    if (d.y > 30 && d.y < 190 && d.vy < 2) return 'up';
    if (d.y > 30) return null;
    return 'side';
  },
  // 技を混ぜる（同じ技が続かないように）
  mix: (s, r) => {
    const d = s.d, last = s.stale[s.stale.length - 1];
    const opts = d.y < 4 ? ['down', 'jab', 'side'] : d.y > 30 && d.y < 190 ? ['up', 'down', 'side'] : ['side', 'jab', 'up'];
    const c = opts.filter(o => o !== last);
    return c[Math.floor(r() * c.length)];
  },
};

function play(bot, seed, gap, batErrF) {
  const r = rng(seed), s = H.makeSim();
  let next = 0, batAt = -1;
  while (s.phase !== 'done' && s.f < 20000) {
    if (s.phase === 'fight' && s.f >= next && !s.p.act) {
      let a = BOTS[bot](s, r), dir = 0;
      if (Array.isArray(a)) [a, dir] = a; else if (a === 'side') dir = s.d.x >= s.p.x ? 1 : -1;
      if (a) { H.input(s, a, dir); next = s.f + gap; }
    }
    if (s.phase === 'bat' && !s.bat.swung) {
      if (batAt < 0 && s.d.y <= H.BAT_Y + (-s.d.vy) * batErrF) batAt = s.f;
      if (batAt >= 0) H.input(s, 'jab', 0);
    }
    H.step(s); s.fx.length = 0;
  }
  return s;
}

const rows = [];
for (const bot of Object.keys(BOTS)) for (const gap of [0, 10]) {
  const ds = [], ms = [];
  for (let seed = 1; seed <= (bot === 'expert' ? 3 : 20); seed++) { const s = play(bot, seed, gap, 0); ds.push(s.dmg); ms.push(s.dist); }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length);
  rows.push([bot, gap, avg(ds).toFixed(1), Math.min(...ds).toFixed(0) + '-' + Math.max(...ds).toFixed(0), avg(ms).toFixed(1), Math.max(...ms).toFixed(1)]);
}
console.log('bot     gap  dmg%avg  range     dist avg  max');
for (const r of rows) console.log(r[0].padEnd(8), String(r[1]).padStart(3), r[2].padStart(8), r[3].padStart(9), r[4].padStart(9), r[5].padStart(6));

// バットのずれ（フレーム）ごとの飛距離（mix ボット seed 1 のダメージで）
console.log('\nbat timing (frames early +) -> dist');
for (const e of [-6, -4, -2, -1, 0, 1, 2, 4, 6, 10]) { const s = play('mix', 1, 8, e); console.log(String(e).padStart(3), s.bat.result.padEnd(5), s.dmg.toFixed(1) + '%', s.dist.toFixed(1) + 'm', (s.bat.angle || 0).toFixed(0) + '°'); }

// リプレイの一致
let bad = 0;
for (let seed = 1; seed <= 30; seed++) { const s = play('mix', seed, 7, 0); const r = H.replay(s.inputs); if (r.dist !== s.dist || r.dmg !== s.dmg) { bad++; console.log('replay mismatch', seed, s.dist, r.dist); } }
console.log(bad ? 'REPLAY NG ' + bad : 'replay OK (30)');
