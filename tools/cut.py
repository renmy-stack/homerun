"""
ChatGPT のドット絵シートをポーズごとの PNG に切り分ける（全ポーズ同じ倍率）。

  python tools/cut.py <sheet.png> <cols> <rows> <anchor> name1 name2 ...
    anchor = feet   … 足元（内容の下端）と脚の中心を基準に、同じ大きさの箱で切る（主人公）
    anchor = center … 内容の中心を基準に切る（ダミー）
白背景のシートは外周から続く白を透明にする。出力は img/<name>.png、縦 256px に縮小（ニアレスト）。
"""
import sys
from collections import deque
import numpy as np
from PIL import Image

OUT_H = 256


def to_alpha(im):
    im = im.convert('RGBA')
    a = np.array(im)
    if a[:, :, 3].min() < 250:
        return a
    rgb = a[:, :, :3].astype(int)
    white = rgb.min(axis=2) >= 225
    h, w = white.shape
    seen = np.zeros_like(white)
    q = deque([(y, x) for x in range(w) for y in (0, h - 1) if white[y, x]] + [(y, x) for y in range(h) for x in (0, w - 1) if white[y, x]])
    for y, x in q: seen[y, x] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    a[:, :, 3][seen] = 0
    return a


def assign(a, cols, rows, f=4, gap=3):
    """塊（縮小して近いものはつなげる）ごとに、重心のあるセル番号を画素へ割り当てる。-1 はどこでもない"""
    H, W = a.shape[:2]
    m = a[:, :, 3] > 40
    sh, sw = (H + f - 1) // f, (W + f - 1) // f
    small = np.zeros((sh, sw), dtype=bool)
    for dy in range(f):
        for dx in range(f):
            sub = m[dy::f, dx::f]; small[:sub.shape[0], :sub.shape[1]] |= sub
    lab = -np.ones((sh, sw), dtype=int); comps = []
    for y0 in range(sh):
        for x0 in range(sw):
            if not small[y0, x0] or lab[y0, x0] >= 0: continue
            k = len(comps); lab[y0, x0] = k; q = deque([(y0, x0)]); pts = []
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for ny in range(max(0, y - gap), min(sh, y + gap + 1)):
                    for nx in range(max(0, x - gap), min(sw, x + gap + 1)):
                        if small[ny, nx] and lab[ny, nx] < 0: lab[ny, nx] = k; q.append((ny, nx))
            comps.append(pts)
    cell_of = []
    for pts in comps:
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        c = min(cols - 1, int(xs.mean() * f / (W / cols))); r = min(rows - 1, int(ys.mean() * f / (H / rows)))
        cell_of.append(r * cols + c if len(pts) > 6 else -1)
    big = np.repeat(np.repeat(lab, f, axis=0), f, axis=1)[:H, :W]
    owner = np.where(big >= 0, np.array(cell_of + [-1])[big], -1)
    return owner


def main():
    path, cols, rows, anchor, *names = sys.argv[1:]
    cols, rows = int(cols), int(rows)
    a = to_alpha(Image.open(path))
    H, W = a.shape[:2]
    cw, ch = W / cols, H / rows
    owner = assign(a, cols, rows)
    cells = []
    for i, name in enumerate(names):
        # 絵がセルの境目をはみ出すことがあるので、つながった塊ごとに「中心が入っているセル」へ割り当てる
        cell = a.copy(); cell[:, :, 3] = np.where(owner == i, cell[:, :, 3], 0)
        m = cell[:, :, 3] > 40
        # 小さなゴミ（隣のセルのはみ出し・点）を無視するため、行・列の画素数でしきい値
        ys = np.where(m.sum(axis=1) > 2)[0]; xs = np.where(m.sum(axis=0) > 2)[0]
        top, bot, left, right = ys[0], ys[-1], xs[0], xs[-1]
        if anchor == 'feet':
            band = m[max(top, bot - int((bot - top) * 0.2)):bot + 1]
            bx = np.where(band.any(axis=0))[0]
            ax, ay = (bx[0] + bx[-1]) / 2, bot
        else:
            ax, ay = (left + right) / 2, (top + bot) / 2
        cells.append((name, cell, ax, ay, top, bot, left, right))
    # 共通の箱: 基準点からの上下左右の最大はみ出し
    if anchor == 'feet':
        up = max(ay - top for _, _, ax, ay, top, bot, l, r in cells) + 4
        down = 4
    else:
        up = down = max(max(ay - top, bot - ay) for _, _, ax, ay, top, bot, l, r in cells) + 4
    half = max(max(ax - l, r - ax) for _, _, ax, ay, top, bot, l, r in cells) + 4
    bw, bh = int(half * 2), int(up + down)
    scale = OUT_H / bh
    for name, cell, ax, ay, *_ in cells:
        box = np.zeros((bh, bw, 4), dtype=np.uint8)
        ox, oy = int(round(ax - half)), int(round(ay - up))
        sy0, sx0 = max(0, oy), max(0, ox)
        sy1, sx1 = min(cell.shape[0], oy + bh), min(cell.shape[1], ox + bw)
        box[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox] = cell[sy0:sy1, sx0:sx1]
        im = Image.fromarray(box).resize((max(1, int(bw * scale)), OUT_H), Image.NEAREST)
        im.save(f'img/{name}.png', optimize=True)
        print(name, im.size)
    print('box', bw, bh, 'anchor-from-top', up, 'of', bh)


main()
