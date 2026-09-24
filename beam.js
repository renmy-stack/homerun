// node beam.js — ビームサーチで「最高にうまい人」のダメージ%の上限を探す（バランス調整用）
'use strict';
const H = require('./sim.js');
const clone = s => JSON.parse(JSON.stringify(s));
const ACTS = [['jab', 0], ['side', 1], ['side', -1], ['up', 0], ['down', 0], ['wait', 0]];
const W = +(process.argv[2] || 40);
let beam = [H.makeSim()];
while (beam[0].phase === 'count') H.step(beam[0]);
const done = [];
while (beam.length) {
  const next = [];
  for (const s of beam) for (const [a, dir] of ACTS) {
    const c = clone(s); c.fx = [];
    if (a !== 'wait') H.input(c, a, dir);
    const lim = a === 'wait' ? 6 : 60;
    for (let k = 0; k < lim && c.phase === 'fight' && (a === 'wait' || c.p.act || c.p.buf || k < 1); k++) { H.step(c); c.fx.length = 0; }
    if (c.phase !== 'fight') done.push(c); else next.push(c);
  }
  const score = c => c.dmg + (c.d.air ? 3 + c.combo : 0) + c.f * 0.0;
  next.sort((a, b) => score(b) - score(a));
  // 同じフレーム・同じダメージの重複を減らす
  const seen = new Set(); beam = [];
  for (const c of next) { const k = c.f + ':' + c.dmg + ':' + Math.round(c.d.x) + ':' + Math.round(c.d.y); if (seen.has(k)) continue; seen.add(k); beam.push(c); if (beam.length >= W) break; }
}
done.sort((a, b) => b.dmg - a.dmg);
const b = done[0];
console.log('best dmg', b.dmg, 'hits', b.hits, 'maxCombo', b.maxCombo);
console.log(b.inputs.map(x => x[1][0] + (x[2] > 0 ? '>' : x[2] < 0 ? '<' : '')).join(' '));
