#!/usr/bin/env python3
"""
像素搭子 · 主题曲生成器 v2（十二生肖、十二星座）
================================================
和 gen-themes.py（随机生成旋律）不同，这里每首的主旋律都是**用简谱手写**的（见 songs_zodiac.py / songs_stars.py），
程序只负责：按旋律自动配和声 → 编曲（伴奏型、低音、铺底、打击乐）→ 原声音色合成 → 混音 → 无缝循环。

- 十二生肖：只用中国乐器音色（古筝、扬琴、琵琶、二胡、笛子、箫、笙、中阮、堂鼓、木鱼、碰铃）
- 十二星座：只用西洋原声乐器音色（钢琴、竖琴、长笛、单簧管、小提琴、大提琴、吉他、钢片琴、马林巴、颤音琴、低音提琴、鼓刷、沙锤、三角铁）
- 不用方波/锯齿波等电子合成音色。

简谱写法（每个记号默认一个八分音符）：
    1~7 音级；后缀 , 低八度、' 高八度（可叠加）；0 休止；- 延长一个八分音符
    后缀 _ 表示十六分音符，后缀 . 表示附点八分音符；前缀 ~ 加一个上方倚音
    | 分小节，每小节的时值必须写满（4/4 = 8 个八分、3/4 与 6/8 = 6 个八分），否则报错

用法：
    python3 tools/gen-songs.py <输出目录> [曲目ID ...]
    python3 tools/gen-songs.py --check          # 只检查旋律：时值、彼此相似度
"""
import importlib.util
import os
import sys

import numpy as np

_here = os.path.dirname(os.path.abspath(__file__))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_here, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gt = _load('gen_themes', 'gen-themes.py')
gm = gt.gm
SR = gm.SR
tvec, fade, lp, hp, rms = gm.tvec, gm.fade, gm.lp, gm.hp, gm.rms
TARGET_SECONDS = float(os.environ.get('PB_TARGET_SECONDS', 161.75))  # 环境变量可缩短曲长（小游戏包体预算）
R = np.random.default_rng(0)

# ================================================================== 音色：通用
def _partials(f, n, amps, taus, inharm=0.0, detune=0.0, vib=None):
    t = tvec(n)
    x = np.zeros(n)
    for k, (a, tau) in enumerate(zip(amps, taus), 1):
        fk = k * f * np.sqrt(1 + inharm * k * k)
        if fk > SR * 0.45:
            break
        ph = 2 * np.pi * (np.cumsum(fk * (1 + vib)) / SR if vib is not None else fk * t) + R.random() * 6.283
        s = np.sin(ph)
        if detune:
            s = 0.5 * (s + np.sin(ph * (1 + detune)))
        x += a * s * (np.exp(-t / tau) if tau else 1.0)
    return x


def _vibrato(n, rate, depth, delay):
    t = tvec(n)
    return depth * np.sin(2 * np.pi * rate * t) * np.clip((t - delay) / 0.15, 0, 1)


def _env(n, attack, dur, rel):
    t = tvec(n)
    return np.minimum(1, t / max(attack, 1e-4)) * gm.release_env(n, dur, rel)


# ---------------------------------------------------------------- 西洋乐器
def piano(f, dur, vel):
    n = int((min(dur, 4) + 1.2) * SR)
    k = np.arange(1, 15)
    x = _partials(f, n, 1 / k ** 1.2, (2.6 / (1 + 0.45 * (k - 1))) * (261 / f) ** 0.4, inharm=0.0004, detune=0.0007)
    t = tvec(n)
    x += lp(R.standard_normal(n), 2500) * np.exp(-t / 0.008) * 0.08
    return fade(x * _env(n, 0.002, dur, 0.3) * vel * 0.42)


def harp(f, dur, vel):
    n = int((dur + 1.8) * SR)
    k = np.arange(1, 9)
    x = _partials(f, n, 1 / k ** 1.8, (1.7 / k ** 0.6) * (261 / f) ** 0.3)
    return fade(x * _env(n, 0.003, max(dur, 0.9), 0.6) * vel * 0.6, a=0.001)


def guitar(f, dur, vel, bright=0.4):
    gt.R = R
    return lp(gt.pluck(f, dur, vel * 0.8, bright), 5500)


def clarinet(f, dur, vel):
    n = int((dur + 0.25) * SR)
    amps = [1, 0.02, 0.45, 0.02, 0.22, 0.02, 0.1, 0.01, 0.05]
    x = _partials(f, n, amps, [0] * 9, vib=_vibrato(n, 5, 0.0035, 0.3))
    return fade(lp(x, 3000) * _env(n, 0.05, dur, 0.1) * vel * 0.4)


def violin(f, dur, vel):
    n = int((dur + 0.3) * SR)
    k = np.arange(1, 13)
    x = _partials(f, n, 1 / k ** 1.05, [0] * 12, vib=_vibrato(n, 5.5, 0.005, 0.15))
    return fade(lp(x, 5000) * _env(n, 0.1, dur, 0.22) * vel * 0.28)


def cello(f, dur, vel):
    n = int((dur + 0.35) * SR)
    k = np.arange(1, 11)
    x = _partials(f, n, 1 / k ** 1.15, [0] * 10, vib=_vibrato(n, 5, 0.004, 0.2))
    return fade(lp(x, 2200) * _env(n, 0.14, dur, 0.3) * vel * 0.32)


def upright(f, dur, vel):
    n = int((min(dur, 1.5) + 0.3) * SR)
    x = _partials(f, n, [1, 0.5, 0.25, 0.12], [0.9, 0.5, 0.3, 0.2])
    return fade(x * _env(n, 0.005, dur, 0.1) * vel * 0.8)


def celesta(f, dur, vel):
    return gm.musicbox(f, dur, vel * 0.7)


def glock(f, dur, vel):
    return gm.bell(f, dur, vel * 0.55)


def vibes(f, dur, vel):
    return gm.vibe(f, dur, vel * 0.5)


def marimba(f, dur, vel):
    return gt.marimba(f, dur, vel * 0.7)


def flute(f, dur, vel):
    gt.R = R
    return gt.flute(f, dur, vel * 0.42)


def strings_pad(freqs, dur, vel):
    n = int((dur + 1.0) * SR)
    x = np.zeros(n)
    for f in freqs:
        k = np.arange(1, 9)
        x += _partials(f, n, 1 / k ** 1.3, [0] * 8, vib=_vibrato(n, 4.5, 0.003, 0.0)) / len(freqs)
    return fade(lp(x, 1800) * _env(n, 0.6, dur, 0.8) * vel * 0.35)


# ---------------------------------------------------------------- 中国乐器
def zheng(f, dur, vel):
    """古筝：拨弦，长音带揉弦"""
    n = int((dur + 1.3) * SR)
    k = np.arange(1, 15)
    vib = _vibrato(n, 5.5, 0.004, 0.28) if dur > 0.45 else None
    x = _partials(f, n, 1 / k ** 1.05, (1.3 / k ** 0.5) * (261 / f) ** 0.3, vib=vib)
    return fade(x * _env(n, 0.002, max(dur, 0.6), 0.5) * vel * 0.45, a=0.001)


def yangqin(f, dur, vel):
    """扬琴：竹槌击弦，双弦微微失谐"""
    n = int((dur + 1.0) * SR)
    k = np.arange(1, 13)
    x = _partials(f, n, 1 / k ** 1.2, 0.95 / k ** 0.45, detune=0.0016)
    return fade(x * _env(n, 0.001, max(dur, 0.5), 0.4) * vel * 0.5, a=0.0008)


def pipa(f, dur, vel):
    """琵琶：清脆拨弦；长音用轮指"""
    def one(v, d):
        m = int((d + 0.6) * SR)
        k = np.arange(1, 13)
        return _partials(f, m, 1 / k ** 0.95, 0.45 / k ** 0.4) * _env(m, 0.001, d, 0.15) * v
    if dur < 0.45:
        return fade(one(vel * 0.5, dur), a=0.0008)
    n = int((dur + 0.6) * SR)
    x = np.zeros(n)
    step = int(0.07 * SR)
    for i, s in enumerate(range(0, int(dur * SR), step)):
        y = one(vel * (0.42 if i % 2 else 0.36), 0.09)
        e = min(n, s + len(y))
        x[s:e] += y[:e - s]
    return fade(x)


def erhu(f, dur, vel):
    """二胡：拉弦，滑音进入，中段揉弦，鼻音较重的泛音"""
    n = int((dur + 0.25) * SR)
    t = tvec(n)
    slide = -0.055 * np.exp(-t / 0.03)  # 从约一个半音下方滑上来
    vib = slide + _vibrato(n, 6, 0.007, 0.12)
    amps = [0.6, 1, 0.8, 0.55, 0.35, 0.25, 0.15, 0.1, 0.06, 0.04]
    x = _partials(f, n, amps, [0] * 10, vib=vib)
    return fade(lp(x, 5000) * _env(n, 0.06, dur, 0.15) * vel * 0.24)


def dizi(f, dur, vel):
    """笛子：明亮带气声"""
    gt.R = R
    return gt.flute(f, dur, vel * 0.42)


def xiao(f, dur, vel):
    """箫：低沉柔和，气声更多"""
    gt.R = R
    return lp(gt.flute(f, dur, vel * 0.5), 2400)


def sheng_pad(freqs, dur, vel):
    """笙：簧片持续和音"""
    n = int((dur + 0.8) * SR)
    x = np.zeros(n)
    for f in freqs:
        x += _partials(f, n, [1, 0.55, 0.5, 0.3, 0.2, 0.12], [0] * 6) / len(freqs)
    t = tvec(n)
    return fade(lp(x, 2500) * _env(n, 0.3, dur, 0.5) * (1 + 0.05 * np.sin(2 * np.pi * 4 * t)) * vel * 0.3)


def ruan(f, dur, vel):
    """中阮：温暖的低音拨弦"""
    n = int((min(dur, 1.5) + 0.5) * SR)
    x = _partials(f, n, [1, 0.6, 0.35, 0.2, 0.1], [0.8, 0.5, 0.3, 0.2, 0.15])
    return fade(x * _env(n, 0.002, dur, 0.12) * vel * 0.75)


# ---------------------------------------------------------------- 打击乐
def tanggu(vel):
    n = int(0.5 * SR)
    t = tvec(n)
    ph = 2 * np.pi * np.cumsum(70 + 45 * np.exp(-t / 0.04)) / SR
    x = np.sin(ph) * np.exp(-t / 0.28) + lp(R.standard_normal(n), 1200) * np.exp(-t / 0.015) * 0.25
    return fade(x * vel)


def muyu(vel):
    n = int(0.12 * SR)
    t = tvec(n)
    return fade((np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.025) + 0.4 * np.sin(2 * np.pi * 1240 * t) * np.exp(-t / 0.015)) * vel, a=0.0005)


def pengling(vel):
    n = int(1.2 * SR)
    t = tvec(n)
    return fade((np.sin(2 * np.pi * 2350 * t) + 0.35 * np.sin(2 * np.pi * 5400 * t) * np.exp(-t / 0.2)) * np.exp(-t / 0.7) * vel * 0.25, a=0.0005)


def triangle(vel):
    n = int(1.0 * SR)
    t = tvec(n)
    return fade((np.sin(2 * np.pi * 4200 * t) + 0.4 * np.sin(2 * np.pi * 6100 * t)) * np.exp(-t / 0.6) * vel * 0.06, a=0.0005)


INSTR = {
    'piano': piano, 'harp': harp, 'guitar': guitar, 'steel': lambda f, d, v: guitar(f, d, v, 0.55),
    'clarinet': clarinet, 'violin': violin, 'cello': cello, 'upright': upright, 'celesta': celesta,
    'glock': glock, 'vibes': vibes, 'marimba': marimba, 'flute': flute,
    'zheng': zheng, 'yangqin': yangqin, 'pipa': pipa, 'erhu': erhu, 'dizi': dizi, 'xiao': xiao, 'ruan': ruan,
}
CHINESE = {'zheng', 'yangqin', 'pipa', 'erhu', 'dizi', 'xiao', 'ruan', 'sheng', 'tanggu', 'muyu', 'pengling'}  # 笙 = sheng
WESTERN = {'piano', 'harp', 'guitar', 'steel', 'clarinet', 'violin', 'cello', 'upright', 'celesta', 'glock', 'vibes',
           'marimba', 'flute', 'strings', 'brush', 'shaker', 'triangle', 'kick'}
# 旋律乐器的八度偏移（箫、大提琴低八度）
OCTAVE = {'xiao': -12, 'cello': -12}

# ================================================================== 乐理
MODES = {
    'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10],
    'mixo': [0, 2, 4, 5, 7, 9, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11],
}
PREF = {
    'major': {0: .6, 3: .45, 4: .45, 5: .35, 1: .25, 2: .1, 6: -2},
    'minor': {0: .6, 3: .4, 4: .2, 5: .35, 6: .35, 2: .3, 1: -2},
    'dorian': {0: .6, 3: .45, 6: .35, 1: .25, 4: .2, 2: .1, 5: -2},
    'mixo': {0: .6, 6: .45, 3: .4, 4: .15, 1: .2, 5: .25, 2: -2},
    'lydian': {0: .6, 1: .5, 4: .35, 5: .3, 2: .2, 3: -2, 6: -1},
}
DOMINANT = {'major': [4], 'minor': [4, 6], 'dorian': [6, 4], 'mixo': [6, 4], 'lydian': [1, 4]}
KEYS = {'C': 60, 'Db': 61, 'D': 62, 'Eb': 63, 'E': 64, 'F': 65, 'Gb': 66, 'G': 67, 'Ab': 68, 'A': 69, 'Bb': 70, 'B': 59}
UNITS = {'4/4': 8, '3/4': 6, '6/8': 6}


def parse(jp, meter):
    """简谱 → [[(起点八分, 音级|None, 时值八分, 倚音), ...], ...]（每小节一个列表）"""
    per = UNITS[meter]
    bars = []
    for bi, raw in enumerate(b for b in jp.split('|') if b.strip()):
        notes, pos = [], 0.0
        for tok in raw.split():
            if tok == '-':
                if not notes:
                    raise ValueError(f'第 {bi + 1} 小节以 - 开头：{raw}')
                s, d, du, g = notes[-1]
                notes[-1] = (s, d, du + 1, g)
                pos += 1
                continue
            grace = tok.startswith('~')
            tok = tok.lstrip('~')
            du = 1.0
            if tok.endswith('_'):
                du, tok = 0.5, tok[:-1]
            elif tok.endswith('.'):
                du, tok = 1.5, tok[:-1]
            digit, marks = tok[0], tok[1:]
            if digit not in '01234567' or any(m not in ",'" for m in marks):
                raise ValueError(f'看不懂的记号 {tok!r}（第 {bi + 1} 小节）')
            deg = None if digit == '0' else int(digit) - 1 + 7 * (marks.count("'") - marks.count(','))
            notes.append((pos, deg, du, grace))
            pos += du
        if abs(pos - per) > 1e-6:
            raise ValueError(f'第 {bi + 1} 小节时值为 {pos} 个八分，应为 {per}：{raw.strip()}')
        bars.append(notes)
    return bars


def deg_semi(d, mode):
    sc = MODES[mode]
    return sc[d % 7] + 12 * (d // 7)


def harmonize(bars, mode, meter, end='tonic', half=None):
    """为每小节选一个顺阶三和弦（返回根音级 0..6）。end: 'tonic' 结束在主和弦 / 'dominant' 结束在属功能。"""
    per = UNITS[meter]
    strong2 = 4 if meter == '4/4' else 3
    out, prev = [], None
    for i, bar in enumerate(bars):
        w = {}
        for s, d, du, _ in bar:
            if d is None:
                continue
            pc = deg_semi(d, mode) % 12
            mult = 2.0 if s == 0 else 1.4 if s == strong2 else 1.0
            w[pc] = w.get(pc, 0) + du * mult
        best, bs = 0, -1e9
        for r in range(7):
            tones = {deg_semi(r + k, mode) % 12 for k in (0, 2, 4)}
            sc = sum(v if pc in tones else -0.4 * v for pc, v in w.items()) / per * 4
            sc += PREF[mode][r]
            if prev is not None:
                sc += -0.3 if r == prev else 0.15 if (r - prev) % 7 in (3, 4) else 0
            if i == 0 and r == 0:
                sc += 0.4
            if half is not None and i == half and r in DOMINANT[mode]:
                sc += 0.8
            if i == len(bars) - 1:
                if end == 'tonic':
                    sc += 5 if r == 0 else 0
                elif r in DOMINANT[mode]:
                    sc += 1.0
            if sc > bs:
                best, bs = r, sc
        out.append(best)
        prev = best
    return out


# ================================================================== 编曲
class Arr:
    def __init__(self, song, spec):
        self.s = song
        self.sp = spec
        self.mode = spec['mode']
        self.meter = spec['meter']
        self.per = UNITS[self.meter]
        self.tonic = KEYS[spec['key']]

    def beat(self, unit):
        return unit * 0.5

    def chord(self, r, seventh=False):
        rel = [deg_semi(r + k, self.mode) - deg_semi(r, self.mode) for k in ((0, 2, 4, 6) if seventh else (0, 2, 4))]
        root = self.tonic - 12 + deg_semi(r, self.mode)
        while root < 48:
            root += 12
        while root >= 60:
            root -= 12
        return root, rel

    def put(self, bus, unit, sig, human=0.004):
        self.s.put(bus, self.beat(unit), sig, swing=self.sp.get('swing'), human=human)

    def melody(self, bus, bars, bar0, inst, vel=0.9, shift=0, aug=1, grace=True):
        fn = INSTR[inst]
        oc = OCTAVE.get(inst, 0) + shift
        spu = self.s.spb * 0.5
        for bi, bar in enumerate(bars):
            for st, d, du, g in bar:
                if d is None:
                    continue
                u = (bar0 * self.per) + (bi * self.per + st) * aug
                m = self.tonic + deg_semi(d, self.mode) + oc
                accent = 1.0 if st == 0 else 0.9
                v = vel * accent * R.uniform(0.9, 1.0)
                self.put(bus, u, fn(gm.hz(m), du * aug * spu * 0.95, v))
                if g and grace:
                    gmid = self.tonic + deg_semi(d + 1, self.mode) + oc
                    self.s.put(bus, self.beat(u), fn(gm.hz(gmid), 0.06, v * 0.5), human=0, dt=-0.07)

    def harmony(self, bus, bars, bar0, inst, vel=0.5):
        lowered = [[(s, None if d is None else d - 2, du, False) for s, d, du, _ in bar] for bar in bars]
        self.melody(bus, lowered, bar0, inst, vel)

    def accompany(self, bar_unit, r, nbars=1, quiet=False):
        sp, per, spu = self.sp, self.per, self.s.spb * 0.5
        comp = sp['comp']
        root, rel = self.chord(r, sp.get('seventh', False))
        third, fifth = rel[1], rel[2]
        ladder = [root, root + fifth, root + 12, root + 12 + third, root + 12 + fifth, root + 24]
        vq = 0.75 if quiet else 1.0
        total = per * nbars
        kind, inst = comp['kind'], comp['inst']
        fn = INSTR[inst]
        if kind in ('arp', 'arp16'):
            step = 0.5 if kind == 'arp16' else 1
            pat = comp.get('pattern', [0, 1, 2, 3, 2, 1])
            for i in range(int(total / step)):
                m = ladder[pat[i % len(pat)] % len(ladder)]
                self.put('comp', bar_unit + i * step, fn(gm.hz(m), step * spu * 1.6, comp.get('vel', 0.45) * vq * R.uniform(0.85, 1.0)))
        elif kind == 'block':
            hits = comp['hits'][self.meter]
            for b in range(nbars):
                for k, h in enumerate(hits):
                    nxt = hits[k + 1] if k + 1 < len(hits) else per
                    for j, m in enumerate([root + x for x in rel] + [root + 12]):
                        self.s.put('comp', self.beat(bar_unit + b * per + h), fn(gm.hz(m + 12), (nxt - h) * spu * 0.9, comp.get('vel', 0.35) * vq),
                                   swing=sp.get('swing'), dt=j * 0.012)
        elif kind == 'oompah':
            for b in range(nbars):
                u0 = bar_unit + b * per
                self.put('comp', u0, fn(gm.hz(root - 12), 2 * spu, comp.get('vel', 0.45) * vq))
                for h in (range(2, per, 2) if self.meter != '6/8' else (3,)):
                    for j, m in enumerate([root + 12 + x for x in rel]):
                        self.s.put('comp', self.beat(u0 + h), fn(gm.hz(m), 1.6 * spu, comp.get('vel', 0.45) * 0.6 * vq), dt=j * 0.008)
        elif kind == 'strum':
            pat = comp.get('hits', {'4/4': [0, 2, 3, 5, 6], '3/4': [0, 2, 4], '6/8': [0, 3, 5]})[self.meter]
            for b in range(nbars):
                for k, h in enumerate(pat):
                    down = k % 2 == 0
                    notes = [root, root + fifth, root + 12, root + 12 + third, root + 12 + fifth]
                    notes = notes if down else notes[::-1][:3]
                    for j, m in enumerate(notes):
                        self.s.put('comp', self.beat(bar_unit + b * per + h), fn(gm.hz(m), 1.4 * spu, comp.get('vel', 0.35) * (1 if down else 0.7) * vq),
                                   swing=sp.get('swing'), dt=j * 0.013)
        # 低音
        bass = sp.get('bass')
        if bass:
            bfn = INSTR[bass]
            for b in range(nbars):
                u0 = bar_unit + b * per
                if sp.get('walk') and self.meter == '4/4':
                    line = [root - 12, root - 12 + third, root - 12 + fifth, root - 12 + (12 if b % 2 else fifth + 2)]
                    for q, m in enumerate(line):
                        self.put('bass', u0 + q * 2, bfn(gm.hz(m), 1.8 * spu, 0.55 * vq))
                else:
                    self.put('bass', u0, bfn(gm.hz(root - 12), per * 0.5 * spu, 0.6 * vq))
                    if self.meter == '4/4':
                        self.put('bass', u0 + 4, bfn(gm.hz(root - 12 + fifth), 3 * spu, 0.45 * vq))
        # 铺底
        pad = sp.get('pad')
        if pad and (quiet or sp.get('pad_always')):
            pfn = sheng_pad if pad == 'sheng' else strings_pad
            self.s.put('pad', self.beat(bar_unit), pfn([gm.hz(root + x) for x in rel], total * spu, 0.6), human=0)

    def percussion(self, bar_unit, bar_idx, light=False):
        kinds = self.sp.get('perc', [])
        per = self.per
        v = 0.6 if light else 1.0
        for kind in kinds:
            if kind == 'tanggu':
                hits = {'4/4': [(0, .8), (3, .45), (4, .6)], '3/4': [(0, .7)], '6/8': [(0, .7), (3, .45)]}[self.meter]
                for h, vv in hits:
                    self.put('perc', bar_unit + h, tanggu(vv * v))
            elif kind == 'muyu':
                for h in range(1, per, 2):
                    self.put('perc', bar_unit + h, muyu(0.18 * v))
            elif kind == 'pengling' and bar_idx % 2 == 0:
                self.put('perc', bar_unit, pengling(0.6 * v))
            elif kind == 'brush':
                for h in ({'4/4': [2, 6], '3/4': [2, 4], '6/8': [3]}[self.meter]):
                    self.put('perc', bar_unit + h, gm.snare(0.28 * v, brush=True))
                self.put('perc', bar_unit, gm.kick(0.4 * v, soft=True))
            elif kind == 'shaker':
                for h in range(per):
                    self.put('perc', bar_unit + h, gt.shaker(0.08 if h % 2 else 0.12))
            elif kind == 'triangle' and bar_idx % 2 == 0:
                self.put('perc', bar_unit, triangle(0.7 * v))
            elif kind == 'kick':
                self.put('perc', bar_unit, gm.kick(0.45 * v, soft=True))


def render(sp, target=TARGET_SECONDS):
    global R
    R = np.random.default_rng(sp['seed'])
    gt.R = R
    gm.rng = np.random.default_rng(sp['seed'] + 7)
    meter = sp['meter']
    per = UNITS[meter]
    bar_beats = per / 2
    q_bpm = sp['bpm'] * (1.5 if meter == '6/8' else 1)
    bar_s = bar_beats * 60 / q_bpm
    k = max(int(os.environ.get('PB_MIN_SECTIONS', 4)), round((target / bar_s - 8) / 8))
    bars_total = 8 + 8 * k
    if os.environ.get('PB_KEEP_TEMPO') == '1':  # 保持原速：曲长由乐段数决定，不再为凑目标时长而改速度
        target = bars_total * bar_s
    q_bpm = bars_total * bar_beats * 60 / target
    s = gm.Song(q_bpm, bars_total * bar_beats, tail=4.0)
    A = parse(sp['A'], meter)
    B = parse(sp['B'], meter)
    assert len(A) == 8 and len(B) == 4, f"{sp['id']}: A 要 8 小节、B 要 4 小节"
    mode = sp['mode']
    chA = harmonize(A, mode, meter, end='tonic', half=3)
    chB = harmonize(B, mode, meter, end='dominant')
    ar = Arr(s, sp)
    cycle = ['A', 'B', 'A2', 'C', 'A3', 'B2']
    secs = [cycle[i % len(cycle)] for i in range(k)]
    if secs[-1] not in ('A', 'A2', 'A3'):
        secs[-1] = 'A3'
    plan = [('intro', 4)] + [(x, 8) for x in secs] + [('outro', 4)]
    bar = 0
    lead, lead2 = sp['lead'], sp['lead2']
    counter, harm_inst = sp.get('counter', lead2), sp.get('harm', lead2)
    for name, nb in plan:
        u0 = bar * per
        if name == 'intro':
            for i in range(4):
                ar.accompany(u0 + i * per, chA[i], quiet=True)
        elif name in ('A', 'A2', 'A3'):
            for i in range(8):
                ar.accompany(u0 + i * per, chA[i])
                ar.percussion(u0 + i * per, i, light=name == 'A')
            up = 12 if name == 'A3' and max(d for b in A for _, d, _, _ in b if d is not None) <= 7 and OCTAVE.get(lead, 0) <= 0 and lead not in ('cello', 'xiao') else 0
            ar.melody('lead', A, bar, lead, shift=up)
            if name == 'A2':
                ar.harmony('lead2', A, bar, harm_inst)
        elif name in ('B', 'B2'):
            for rep in range(2):
                for i in range(4):
                    ar.accompany(u0 + (rep * 4 + i) * per, chB[i])
                    ar.percussion(u0 + (rep * 4 + i) * per, i)
                ar.melody('lead2', B, bar + rep * 4, lead2)
                if rep == 1:
                    ar.harmony('lead', B, bar + 4, harm_inst, vel=0.4)
        elif name == 'C':
            for i in range(4):
                ar.accompany(u0 + i * 2 * per, chA[i], nbars=2, quiet=True)
            ar.melody('lead2', A[:4], bar, counter, vel=0.75, aug=2)
        elif name == 'outro':
            for i in range(4):
                ar.accompany(u0 + i * per, chA[4 + i], quiet=True)
            ar.melody('lead2', A[6:], bar + 2, counter, vel=0.6)
        bar += nb

    big = sp.get('space', 1.2)
    for b in ('lead', 'lead2', 'comp'):
        if b in s.buses:
            s.buses[b] = gm.reverb(s.buses[b], 0.32, size=big, damp=7500)
    if 'pad' in s.buses:
        s.buses['pad'] = gm.reverb(s.buses['pad'], 0.4, size=big)
    if 'perc' in s.buses:
        s.buses['perc'] = lp(s.buses['perc'], 6000)
    levels = {'lead': 0.85, 'lead2': 0.6, 'comp': 0.55, 'bass': 0.45, 'pad': 0.28, 'perc': 0.32}
    # 只有沙锤/三角铁/碰铃/木鱼这类点缀时，打击乐轨道整体放轻（混音会按轨道响度归一，不能只靠单件音量）
    if not set(sp.get('perc', [])) & {'kick', 'tanggu', 'brush'}:
        levels['perc'] = 0.1
    levels.update(sp.get('levels', {}))
    x = s.mix({kk: v for kk, v in levels.items() if kk in s.buses})
    x = lp(x, 12000)
    loop_s = s.L / SR
    amb = sp.get('amb')
    if amb == 'birds':
        x = x + gt.amb_birds(len(x)) * rms(x) * 5
    elif amb == 'waves':
        x = x + gt.amb_waves(len(x), loop_s) * rms(x) * 4
    elif amb == 'rain':
        x = x + gt.amb_rain(len(x)) * rms(x) * 3
    return s.finish(x, target_rms=0.12), q_bpm


# ================================================================== 检查
def melody_signature(sp):
    """旋律指纹：(音程, 时值) 三元组集合，用来比较两首歌的旋律是否相似"""
    seq = []
    for jp in (sp['A'], sp['B']):
        prev = None
        for bar in parse(jp, sp['meter']):
            for _, d, du, _ in bar:
                if d is None:
                    continue
                m = deg_semi(d, sp['mode'])
                if prev is not None:
                    seq.append((m - prev, du))
                prev = m
    return {tuple(seq[i:i + 3]) for i in range(len(seq) - 2)}


def check(songs):
    ok = True
    for sp in songs:
        parse(sp['A'], sp['meter'])
        parse(sp['B'], sp['meter'])
        used = {sp['lead'], sp['lead2'], sp.get('counter', sp['lead2']), sp.get('harm', sp['lead2']), sp['comp']['inst'],
                sp.get('bass'), sp.get('pad')} - {None}
        used |= set(sp.get('perc', []))
        allowed = CHINESE if sp['id'].startswith('zodiac_') else WESTERN
        if used - allowed:
            print(f"✖ {sp['id']} 用了不该用的乐器：{sorted(used - allowed)}")
            ok = False
    sigs = [(sp['id'], melody_signature(sp)) for sp in songs]
    worst = []
    for i in range(len(sigs)):
        for j in range(i + 1, len(sigs)):
            a, b = sigs[i][1], sigs[j][1]
            jac = len(a & b) / max(1, len(a | b))
            worst.append((jac, sigs[i][0], sigs[j][0]))
    worst.sort(reverse=True)
    print('旋律最相似的 5 对（Jaccard，越低越不同）：')
    for jac, a, b in worst[:5]:
        print(f'  {jac:.2f}  {a} ↔ {b}')
    if worst and worst[0][0] > 0.2:
        print('✖ 有两首旋律太像了')
        ok = False
    return ok


def all_songs():
    z = _load('songs_zodiac', 'songs_zodiac.py').SONGS
    s = _load('songs_stars', 'songs_stars.py').SONGS
    return z + s


if __name__ == '__main__':
    songs = all_songs()
    if sys.argv[1:2] == ['--check']:
        sys.exit(0 if check(songs) else 1)
    out = sys.argv[1] if len(sys.argv) > 1 else 'music-out'
    only = sys.argv[2:]
    if not check(songs):
        sys.exit(1)
    os.makedirs(out, exist_ok=True)
    for sp in songs:
        if only and sp['id'] not in only:
            continue
        y, bpm = render(sp)
        lufs = gt.export(y, os.path.join(out, f"theme_{sp['id']}"))
        print(f"theme_{sp['id']} {sp['title']}: {len(y) / SR:.1f}s  ♩={bpm:.1f}  raw={lufs:.1f} LUFS → -16")
