// node combo_probe.js — コンボのつながりやすさ（ボット別の最大コンボ・平均コンボ長・ダメージ）
'use strict';
const H = require('./sim.js');
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
// 人っぽいボット: 反応に 6〜14 フレームの遅れ。浮いていたら ↑ か ↓、地面なら ↓ で浮かせる、たまにスマッシュ
const BOTS = {
  casual: (s, r) => { const d = s.d; if (d.y < 4) return r() < 0.6 ? 'down' : 'jab'; return ['up', 'up', 'down', 'side', 'jab'][Math.floor(r() * 5)]; },
  juggler: (s, r) => { const d = s.d, last = s.stale[s.stale.length - 1]; if (d.y < 4) return 'down'; if (d.y > 20) return last === 'up' && r() < 0.5 ? 'down' : 'up'; return 'side'; },
  random: (s, r) => ['jab', 'side', 'up', 'down'][Math.floor(r() * 4)],
};
for (const bot of Object.keys(BOTS)) {
  let dm = 0, mc = 0, chains = [], N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const r = rng(seed), s = H.makeSim(); let next = 0, cur = 0;
    while (s.phase !== 'timeup' && s.f < 5000) {
      if (s.phase === 'fight' && s.f >= next && !s.p.buf) { const a = BOTS[bot](s, r); if (a) { H.input(s, a, s.d.x >= s.p.x ? 1 : -1); next = s.f + 6 + Math.floor(r() * 9); } }
      H.step(s);
      for (const e of s.fx) if (e.t === 'hit') { if (e.combo === 0 && cur > 0) { chains.push(cur); cur = 0; } if (e.combo > 0) cur = e.combo; }
      s.fx.length = 0;
    }
    if (cur) chains.push(cur);
    dm += s.dmg; mc += s.maxCombo;
  }
  const avgChain = chains.length ? chains.reduce((a, b) => a + b, 0) / chains.length : 0;
  console.log(bot.padEnd(8), 'dmg', (dm / N).toFixed(1).padStart(6), ' maxCombo', (mc / N).toFixed(1).padStart(5), ' avgChain', avgChain.toFixed(2));
}
