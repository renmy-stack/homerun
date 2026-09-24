# ぶっとばしダミー

10 秒でダミーをなぐってダメージ%を溜め、最後にバットでかっとばして飛距離を競うミニゲーム。
https://renmy-stack.github.io/homerun/

- 操作: タップ=ジャブ / ↑=アッパー / ←→=スマッシュ / ↓=たたきつけ（地面ならうきあげ）。最後はダミーが線に重なった瞬間にタップ
- `sim.js` … 試合と物理（DOM 非依存・決定的）。数値を変えたら `SIM_VERSION` を上げる
- `game.js` … 描画・入力・シェア（`#r=メートル×10` で友達の記録に挑戦）
- `node test_sim.js` … ボット別のダメージ%・飛距離、リプレイ一致 / `node beam.js` … 上手い人の上限
- `python tools/cut.py` … ChatGPT のドット絵シートをポーズごとに切り出す（元絵は `src/`）
- 更新時は index.html の `?v=`・game.js の `VERSION`・`version.txt` を一緒に上げる
