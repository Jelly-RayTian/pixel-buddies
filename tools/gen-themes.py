#!/usr/bin/env python3
"""
像素搭子 · 12 张作品主题曲生成器
================================
每张内置作品一首原创主题曲（约 2:40，无缝循环），全部由代码合成，版权归项目所有。

结构：前奏(4) → A(8) → B(8) → A'(8，加和声) → 桥段(8，抽掉鼓和旋律) → A''(8) → … → 尾声(4)
旋律由“动机 + 模进”算法生成：每段先生成 1 小节动机，后面按和弦平移重复，强拍落在和弦音上，乐句结尾回到主音。
速度会微调，让每首都落在目标时长（默认与 Pink Haze 相同，161.75 秒）附近。

用法：
    python3 tools/gen-themes.py [输出目录] [作品ID ...]

依赖：numpy、scipy、ffmpeg；复用 gen-music.py 里的音色与效果。
"""
import importlib.util
import os
import subprocess
import sys

import numpy as np

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('gen_music', os.path.join(_here, 'gen-music.py'))
gm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gm)

SR = gm.SR
TARGET_SECONDS = float(os.environ.get('PB_TARGET_SECONDS', 161.75))  # 环境变量可缩短曲长（小游戏包体预算）
tvec, fade, lp, hp, rms = gm.tvec, gm.fade, gm.lp, gm.hp, gm.rms

# ------------------------------------------------------------------ 新音色
R = None  # 每首歌的随机源


def marimba(f, dur, vel):
    n = int(1.3 * SR)
    t = tvec(n)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.4)
         + 0.25 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.06)
         + 0.08 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.015))
    return fade(x * vel, a=0.001)


def pluck(f, dur, vel, bright=0.5):
    """拨弦（简化 Karplus-Strong）"""
    D = max(2, int(round(SR / f)))
    n = int((min(dur, 1.6) + 0.5) * SR)
    t = tvec(n)
    x = np.zeros(n)
    x[:D] = lp(R.standard_normal(D), 1500 + 5000 * bright)
    y = gm.comb(x, D, 0.994)
    y = lp(y, 2500 + 3500 * bright)
    y /= max(np.max(np.abs(y[:D * 6])), 1e-9)
    env = np.exp(-t / 0.9) * gm.release_env(n, dur, 0.08)
    return fade(y * env * vel, a=0.001)


def flute(f, dur, vel):
    n = int((dur + 0.3) * SR)
    t = tvec(n)
    vib = 0.004 * np.sin(2 * np.pi * 5 * t) * np.clip((t - 0.25) / 0.2, 0, 1)
    ph = np.cumsum(f * (1 + vib)) / SR
    x = np.sin(2 * np.pi * ph) + 0.15 * np.sin(4 * np.pi * ph) + 0.04 * np.sin(6 * np.pi * ph)
    breath = lp(hp(R.standard_normal(n), 1500), 6000) * (0.06 * np.exp(-t / 0.12) + 0.012)
    env = np.minimum(1, t / 0.06) * gm.release_env(n, dur, 0.12)
    return fade((x + breath) * env * vel)


def shaker(vel):
    n = int(0.09 * SR)
    t = tvec(n)
    return fade(hp(R.standard_normal(n), 5000) * np.minimum(1, t / 0.01) * np.exp(-t / 0.025) * vel)


def rim(vel):
    n = int(0.06 * SR)
    t = tvec(n)
    x = np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012) + 0.4 * hp(R.standard_normal(n), 2500) * np.exp(-t / 0.006)
    return fade(x * vel, a=0.0005)


# ------------------------------------------------------------------ 环境声
def amb_rain(n):
    x = lp(hp(R.standard_normal(n), 400), 6000) * 0.02
    drops = np.zeros(n)
    for p in R.integers(0, n - 400, int(n / SR * 25)):
        m = 300
        f = R.uniform(1500, 4000)
        drops[p:p + m] += np.sin(2 * np.pi * f * np.arange(m) / SR) * np.exp(-np.arange(m) / 40) * R.uniform(0.01, 0.05)
    return x + drops


def amb_waves(n, loop_s):
    t = tvec(n)
    period = loop_s / max(1, round(loop_s / 8.0))
    swell = (0.5 + 0.5 * np.sin(2 * np.pi * t / period)) ** 2
    return lp(R.standard_normal(n), 900) * 0.05 * (0.15 + swell)


def amb_birds(n):
    x = np.zeros(n)
    for p in R.integers(0, n - SR, int(n / SR * 0.5)):
        for k in range(R.integers(2, 5)):
            m = int(0.07 * SR)
            tt = np.arange(m) / SR
            f0 = R.uniform(2800, 4200)
            f = f0 + 900 * np.sin(2 * np.pi * 18 * tt) - 1500 * tt / 0.07
            s = int(p + k * 0.11 * SR)
            x[s:s + m] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.07) * R.uniform(0.01, 0.03)
    return x


# ------------------------------------------------------------------ 乐理
MAJOR = [0, 2, 4, 5, 7, 9, 11]
ROMAN = {'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6}
KEYS = {'C': 60, 'Db': 61, 'D': 62, 'Eb': 63, 'E': 64, 'F': 65, 'Gb': 66, 'G': 67, 'Ab': 68, 'A': 69, 'Bb': 70, 'B': 71}


def chord_semis(sym):
    seventh = sym.endswith('7')
    base = sym[:-1] if seventh else sym
    if base == 'iv':
        return [5, 8, 12]
    if base == 'bVII':
        return [10, 14, 17]
    d = ROMAN[base.upper()]
    degs = [d, d + 2, d + 4] + ([d + 6] if seventh else [])
    return [MAJOR[x % 7] + 12 * (x // 7) for x in degs]


PENTA = [0, 2, 4, 7, 9]  # 五声音阶（宫商角徵羽），生肖系列用
SCALE = MAJOR  # 旋律用的音阶；render_theme 按主题切换


def deg_semi(d):
    n = len(SCALE)
    return SCALE[d % n] + 12 * (d // n)


R44 = [[2, 2, 2, 2], [3, 1, 2, 2], [2, 1, 1, 4], [1, 1, 2, 4], [4, 2, 2], [2, 2, 4], [3, 3, 2],
       [1, 1, 1, 1, 2, 2], [2, 2, 2, -2], [3, 1, -2, 2], [-2, 2, 2, 2], [2, 4, 2]]
R44_SLOW = [[4, 4], [8], [6, 2], [4, 2, 2], [2, 6], [4, -2, 2]]
R34 = [[2, 2, 2], [3, 1, 2], [4, 2], [2, 4], [1, 1, 2, 2], [2, 1, 1, 2]]
R34_SLOW = [[6], [4, 2], [2, 4]]


class Prog:
    """把每小节的和弦记号展开成可按拍查询的时间表"""

    def __init__(self, bars, meter):
        self.meter = meter
        self.items = []  # (beat, semis)
        for b, bar in enumerate(bars):
            syms = bar.split()
            for k, s in enumerate(syms):
                self.items.append((b * meter + k * meter / len(syms), chord_semis(s)))
        self.len = len(bars)

    def at(self, beat):
        cur = self.items[0][1]
        for bt, semis in self.items:
            if bt <= beat + 1e-6:
                cur = semis
        return cur


def nearest_chord_deg(d, pcs, lo, hi):
    for k in (0, -1, 1, -2, 2, -3, 3, -4, 4):
        c = d + k
        if lo <= c <= hi and deg_semi(c) % 12 in pcs:
            return c
    return max(lo, min(hi, d))


def gen_melody(prog, rng, lo, hi, lib, start):
    meter = prog.meter
    nb = prog.len
    picks = rng.choice(len(lib), 3, replace=False)
    rA, rB, rC = (lib[i] for i in picks)
    rEnd = [meter * 2] if rng.random() < 0.5 else ([4, 4] if meter == 4 else [4, 2])
    plan = [rA, rB, rA, rC, rA, rB, rA, rEnd] if nb == 8 else [rA, rB, rA, rEnd]
    notes = []
    d = start
    motif = None
    for b in range(nb):
        r = plan[b]
        pos = 0
        rel, first = [], None
        repeat = r is rA and b > 0 and motif is not None
        idx = 0
        for dur8 in r:
            rest = dur8 < 0
            dur8 = abs(dur8)
            beat = b * meter + pos * 0.5
            if not rest:
                pcs = {s % 12 for s in prog.at(beat)}
                if repeat and idx < len(motif):
                    d = nearest_chord_deg(d, pcs, lo, hi) if idx == 0 else first + motif[idx]
                    if not lo <= d <= hi:
                        d = nearest_chord_deg(max(lo, min(hi, d)), pcs, lo, hi)
                elif idx == 0 or dur8 >= 4:
                    d = nearest_chord_deg(d + int(rng.choice([-2, -1, 0, 1, 2])), pcs, lo, hi)
                else:
                    mid = (lo + hi) / 2
                    step = int(rng.choice([-1, 1, -2, 2, -1, 1]))
                    if (d > mid + 2 and step > 0) or (d < mid - 2 and step < 0):
                        step = -step
                    d = max(lo, min(hi, d + step))
                if idx == 0:
                    first = d
                rel.append(d - first)
                notes.append([beat, d, dur8 * 0.5])
                idx += 1
            pos += dur8
        if b == 0:
            motif = rel
    # 乐句结尾回到主音
    if notes:
        last = notes[-1]
        best = min((c for c in range(lo, hi + 1) if c % len(SCALE) == 0), key=lambda c: abs(c - last[1]))
        last[1] = best
    return notes


# ------------------------------------------------------------------ 主题定义
THEMES = [
    # 可爱动物
    dict(id='cat_orange', title='午后打盹', key='F', bpm=86, meter=4, style='lofi', leadA='vibe', leadB='ep', swing=0.62,
         A=['I7', 'vi7', 'ii7', 'V7', 'I7', 'vi7', 'ii7', 'V7'], B=['IV7', 'iii7', 'ii7', 'V7', 'IV7', 'V7', 'iii7', 'vi7'],
         C=['IV7', 'IV7', 'iii7', 'vi7', 'ii7', 'ii7', 'V7', 'V7'], amb=None, seed=101),
    dict(id='shiba', title='元气满满', key='G', bpm=120, meter=4, style='chip', leadA='pulse', leadB='pulse_thin',
         A=['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'V'], B=['IV', 'V', 'iii', 'vi', 'IV', 'V', 'I', 'I'],
         C=['vi', 'vi', 'IV', 'IV', 'ii', 'ii', 'V', 'V'], amb=None, seed=102),
    dict(id='cat_white', title='毛线球圆舞曲', key='Eb', bpm=96, meter=3, style='musicbox', leadA='musicbox', leadB='bell',
         A=['I', 'vi', 'IV', 'V', 'I', 'vi', 'ii', 'V'], B=['IV', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'I'],
         C=['vi', 'vi', 'IV', 'IV', 'ii', 'ii', 'V', 'V'], amb=None, seed=103),
    dict(id='bunny', title='跳跳胡萝卜', key='C', bpm=112, meter=4, style='marimba', leadA='marimba', leadB='flute',
         A=['I', 'IV', 'V', 'I', 'vi', 'IV', 'V', 'I'], B=['IV', 'I', 'V', 'vi', 'IV', 'I', 'ii', 'V'],
         C=['vi', 'iii', 'IV', 'I', 'ii', 'ii', 'V', 'V'], amb='birds', seed=104),
    # 甜品派对
    dict(id='strawberry_cake', title='第一颗草莓', key='D', bpm=116, meter=4, style='chip', leadA='pulse', leadB='pulse_thin',
         A=['I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'V'], B=['IV', 'I', 'V', 'vi', 'IV', 'I', 'ii', 'V'],
         C=['vi', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'V'], amb=None, seed=201),
    dict(id='milk_tea', title='三分糖', key='A', bpm=82, meter=4, style='bossa', leadA='flute', leadB='vibe', swing=0.56,
         A=['I7', 'vi7', 'ii7', 'V7', 'I7', 'vi7', 'ii7', 'V7'], B=['IV7', 'iii7', 'vi7', 'ii7', 'IV7', 'iii7', 'ii7', 'V7'],
         C=['IV7', 'IV7', 'iii7', 'iii7', 'ii7', 'ii7', 'V7', 'V7'], amb=None, seed=202),
    dict(id='macarons', title='七彩圆舞曲', key='Bb', bpm=104, meter=3, style='musicbox', leadA='bell', leadB='musicbox',
         A=['I', 'IV', 'V', 'I', 'vi', 'ii', 'V', 'I'], B=['vi', 'iii', 'IV', 'I', 'ii', 'V', 'I', 'V'],
         C=['IV', 'IV', 'I', 'I', 'ii', 'ii', 'V', 'V'], amb=None, seed=203),
    dict(id='ice_cream', title='叠叠乐', key='E', bpm=128, meter=4, style='chip', leadA='pulse_thin', leadB='pulse',
         A=['I', 'IV', 'vi', 'V', 'I', 'IV', 'V', 'I'], B=['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V'],
         C=['IV', 'V', 'iii', 'vi', 'ii', 'ii', 'V', 'V'], amb=None, seed=204),
    # 温馨日常
    dict(id='cozy_bedroom', title='台灯下', key='C', bpm=70, meter=4, style='lofi', leadA='ep', leadB='bell', swing=0.6,
         A=['I7', 'iii7', 'vi7', 'IV7', 'I7', 'iii7', 'ii7', 'V7'], B=['IV7', 'I7', 'ii7', 'iii7', 'IV7', 'iv', 'I7', 'V7'],
         C=['vi7', 'vi7', 'IV7', 'IV7', 'ii7', 'ii7', 'V7', 'V7'], amb='rain', seed=301),
    dict(id='flower_garden', title='蝴蝶来访', key='G', bpm=96, meter=4, style='folk', leadA='flute', leadB='marimba',
         A=['I', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'I'], B=['IV', 'V', 'iii', 'vi', 'IV', 'V', 'I', 'I'],
         C=['vi', 'vi', 'IV', 'IV', 'ii', 'ii', 'V', 'V'], amb='birds', seed=302),
    dict(id='starry_night', title='第一百颗星', key='D', bpm=66, meter=4, style='ambient', leadA='musicbox', leadB='bell',
         A=['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV', 'V'], B=['vi', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'V'],
         C=['IV', 'IV', 'I', 'I', 'IV', 'IV', 'V', 'V'], amb=None, seed=303),
    dict(id='beach_sunset', title='落日口袋', key='A', bpm=76, meter=4, style='lofi', leadA='vibe', leadB='flute', swing=0.6,
         A=['I7', 'IV7', 'vi7', 'V7', 'I7', 'IV7', 'ii7', 'V7'], B=['vi7', 'IV7', 'I7', 'V7', 'vi7', 'IV7', 'bVII', 'V7'],
         C=['IV7', 'IV7', 'I7', 'I7', 'ii7', 'ii7', 'V7', 'V7'], amb='waves', seed=304),
]


# ------------------------------------------------------------------ 编曲
def lead_note(kind, f, dur, vel):
    if kind == 'vibe':
        return gm.vibe(f, dur, vel * 0.55)
    if kind == 'ep':
        return gm.ep(f, dur, vel * 0.5)
    if kind == 'bell':
        return gm.bell(f, dur, vel * 0.5)
    if kind == 'musicbox':
        return gm.musicbox(f, dur, vel * 0.8)
    if kind == 'marimba':
        return marimba(f, dur, vel * 0.7)
    if kind == 'flute':
        return flute(f, dur, vel * 0.45)
    if kind == 'pulse':
        return gm.pulse(f, dur, vel * 0.45, 0.25)
    if kind == 'pulse_thin':
        return gm.pulse(f, dur, vel * 0.4, 0.125)
    raise ValueError(kind)


def voicing(semis, tonic):
    root = tonic - 12 + semis[0]
    while root < 50:
        root += 12
    while root >= 62:
        root -= 12
    return [root + s - semis[0] for s in semis]


def render_theme(th, target=TARGET_SECONDS):
    global R, SCALE
    R = np.random.default_rng(th['seed'])
    SCALE = PENTA if th.get('scale') == 'penta' else MAJOR
    gm.rng = np.random.default_rng(th['seed'] + 7)
    meter, style = th['meter'], th['style']
    tonic = KEYS[th['key']]
    slow = style in ('ambient',)
    # 段落：前奏 4 + 8×k + 尾声 4，k 取最接近目标时长的值，再微调速度
    bar_s = meter * 60 / th['bpm']
    k = max(int(os.environ.get('PB_MIN_SECTIONS', 4)), round((target / bar_s - 8) / 8))
    bars_total = 8 + 8 * k
    if os.environ.get('PB_KEEP_TEMPO') == '1':  # 保持原速：曲长由乐段数决定，不再为凑目标时长而改速度
        target = bars_total * bar_s
    bpm = bars_total * meter * 60 / target
    cycle = ['A', 'B', 'A2', 'C', 'A3', 'B2']
    secs = [cycle[i % len(cycle)] for i in range(k)]
    if secs[-1] not in ('A', 'A2', 'A3'):
        secs[-1] = 'A3'
    plan = [('intro', 4)] + [(s, 8) for s in secs] + [('outro', 4)]

    s = gm.Song(bpm, bars_total * meter, tail=4.0)
    sw = th.get('swing')
    progs = {'A': Prog(th['A'], meter), 'B': Prog(th['B'], meter), 'C': Prog(th['C'], meter),
             'intro': Prog(th['A'][:4], meter), 'outro': Prog(['IV', 'V', 'I', 'I'] if meter == 4 else ['IV', 'V', 'I', 'I'], meter)}
    lib = (R34_SLOW if slow else R34) if meter == 3 else (R44_SLOW if slow else R44)
    lo, hi = (0, 9) if style != 'chip' else (2, 11)
    if SCALE is PENTA:  # 五声音阶一个八度只有 5 个音，范围相应收窄
        lo, hi = (0, 7) if style != 'chip' else (2, 9)
    melA = gen_melody(progs['A'], R, lo, hi, lib, start=4)
    melB = gen_melody(progs['B'], R, lo + 1, hi + 1, lib, start=6)

    def deg_midi(d, octave_shift=0):
        return tonic + deg_semi(d) + 12 * octave_shift

    bar0 = 0
    for name, nbars in plan:
        key = 'A' if name.startswith('A') else ('B' if name.startswith('B') else name)
        prog = progs[key]
        start_beat = bar0 * meter
        drums = name not in ('intro', 'C', 'outro') or (name == 'outro' and style == 'chip')
        lead = None
        if name in ('A', 'A2', 'A3'):
            lead = (melA, th['leadA'] if name != 'A3' else th['leadB'] if style in ('chip',) else th['leadA'])
        elif name in ('B', 'B2'):
            lead = (melB, th['leadB'])
        # ---------------- 旋律
        if lead:
            mel, kind = lead
            up = 1 if (name == 'A3' and style not in ('chip',)) and max(n[1] for n in mel) < len(SCALE) else 0
            for bt, d, du in mel:
                f = gm.hz(deg_midi(d, up))
                s.put('lead', start_beat + bt, lead_note(kind, f, du * s.spb * 0.9, R.uniform(0.85, 1.0)),
                      swing=sw, human=0.004)
                if name == 'A2':  # 三度和声
                    f2 = gm.hz(deg_midi(d - 2, up))
                    s.put('lead2', start_beat + bt, lead_note(kind, f2, du * s.spb * 0.9, 0.5), swing=sw, human=0.004)
        # ---------------- 伴奏、贝斯、鼓（逐小节）
        for b in range(nbars):
            gb = start_beat + b * meter
            chords = [(bt - b * meter, sm) for bt, sm in prog.items if b * meter - 1e-6 <= bt < (b + 1) * meter - 1e-6]
            for ci, (cb, semis) in enumerate(chords):
                clen = (chords[ci + 1][0] if ci + 1 < len(chords) else meter) - cb
                vc = voicing(semis, tonic)
                root = vc[0] - 12
                while root > 52:
                    root -= 12
                while root < 40:
                    root += 12
                accompany(s, style, name, gb + cb, clen, vc, root, sw, b)
            if drums:
                drum_bar(s, style, gb, meter, sw, b, name)
        bar0 += nbars

    # ---------------- 混音
    for b in ('keys', 'lead', 'lead2', 'arp'):
        if b in s.buses:
            s.buses[b] = gm.reverb(s.buses[b], 0.3 if style != 'chip' else 0.15, size=1.3 if style in ('ambient', 'musicbox') else 1.0)
    if style == 'chip' and 'lead' in s.buses:
        s.buses['lead'] = gm.echo(s.buses['lead'], 0.75 * s.spb, 0.28, 0.3)
    if 'drums' in s.buses:
        s.buses['drums'] = lp(s.buses['drums'], 9000 if style == 'chip' else 5500)
    levels = {'keys': 0.8, 'pad': 0.35, 'bass': 0.6, 'drums': 0.45, 'lead': 0.8, 'lead2': 0.3, 'arp': 0.4}
    if style == 'chip':
        levels.update(keys=0.0, arp=0.3, drums=0.45)
    if style in ('musicbox', 'ambient'):
        levels.update(bass=0.3, pad=0.4, arp=0.5)
    x = s.mix({k: v for k, v in levels.items() if k in s.buses and v > 0})
    loop_s = s.L / SR
    if style in ('lofi', 'bossa'):
        x = gm.wow(x, 1.2, round(0.5 * loop_s) / loop_s)
        x = lp(x, 6500) + gm.vinyl(len(x)) * rms(x) * 5
    else:
        x = lp(x, 9500)
    amb = th.get('amb')
    if amb == 'rain':
        x = x + amb_rain(len(x)) * rms(x) * 3
    elif amb == 'waves':
        x = x + amb_waves(len(x), loop_s) * rms(x) * 5
    elif amb == 'birds':
        x = x + amb_birds(len(x)) * rms(x) * 6
    return s.finish(x, target_rms=0.12), bpm


def accompany(s, style, sec, beat, clen, vc, root, sw, bar):
    spb = s.spb
    quiet = sec in ('intro', 'outro')
    if style in ('lofi', 'bossa') and style == 'lofi':
        hits = [(0, min(clen, 2.2), 0.5), (2.5, 1.2, 0.32)] if clen >= 4 else [(0, clen * 0.9, 0.45)]
        for hb, d, v in hits:
            for k, m in enumerate(vc):
                s.put('keys', beat + hb, gm.ep(gm.hz(m), d * spb, v * R.uniform(0.85, 1.05) * (0.8 if quiet else 1)), swing=sw, dt=k * 0.014)
        s.put('bass', beat, gm.bass(gm.hz(root), min(clen, 2) * 0.9 * spb, 0.75))
        if clen >= 4:
            s.put('bass', beat + 2.5, gm.bass(gm.hz(root + 7), 1.2 * spb, 0.5), swing=sw)
        if sec == 'C':
            s.put('pad', beat, gm.pad(vc, clen * spb, 0.5), human=0)
    elif style == 'bossa':
        for hb in ([0, 1.5, 3] if clen >= 4 else [0, 1]):
            for k, m in enumerate(vc[1:] + [vc[0] + 12]):
                s.put('keys', beat + hb, pluck(gm.hz(m), 0.9 * spb, 0.35 * R.uniform(0.85, 1.05), 0.4), dt=k * 0.01)
        s.put('bass', beat, gm.bass(gm.hz(root), 1.4 * spb, 0.7))
        if clen >= 4:
            s.put('bass', beat + 2, gm.bass(gm.hz(root + 7), 1.4 * spb, 0.55))
        if sec == 'C':
            s.put('pad', beat, gm.pad(vc, clen * spb, 0.5), human=0)
    elif style == 'chip':
        r = root + 12
        third = vc[1] - vc[0]
        for e in range(int(clen * 2)):
            s.put('bass', beat + e * 0.5, gm.triwave(gm.hz(r + [0, 12, 7, 12][e % 4] - 12), 0.45 * spb, 0.8), human=0.001)
        if not quiet or sec == 'outro':
            for e in range(int(clen * 4)):
                s.put('arp', beat + e * 0.25, gm.pulse(gm.hz(r + [12, 12 + third, 19, 24][e % 4]), 0.22 * spb, 0.3, 0.125), human=0.001)
        else:
            for e in range(int(clen * 2)):
                s.put('arp', beat + e * 0.5, gm.pulse(gm.hz(r + [12, 12 + third, 19, 24][e % 4]), 0.4 * spb, 0.25, 0.125), human=0.001)
    elif style in ('musicbox', 'ambient'):
        tones = [vc[0], vc[0] + 7, vc[1] + 12, vc[2] + 12] if style == 'musicbox' else [vc[0] + 12, vc[1] + 12, vc[2] + 12, vc[0] + 24]
        step = 0.5 if style == 'musicbox' else 1.0
        pat = [0, 1, 2, 3, 2, 1]
        for e in range(int(clen / step)):
            m = tones[pat[e % len(pat)]]
            s.put('arp', beat + e * step, gm.musicbox(gm.hz(m), step * spb, (0.32 if style == 'musicbox' else 0.28) * R.uniform(0.85, 1.05)), human=0.006)
        s.put('pad', beat, gm.pad(vc, clen * spb, 0.5), human=0)
        s.put('bass', beat, gm.bass(gm.hz(root), min(clen, 3) * spb * 0.9, 0.4), human=0)
    elif style == 'marimba':
        for hb in [x * 0.5 for x in range(int(clen * 2)) if x % 2 == 1]:
            for k, m in enumerate(vc[1:]):
                s.put('keys', beat + hb, pluck(gm.hz(m + 12), 0.4 * spb, 0.28, 0.7), dt=k * 0.006)
        s.put('bass', beat, gm.bass(gm.hz(root), 0.9 * spb, 0.75))
        if clen >= 4:
            s.put('bass', beat + 2, gm.bass(gm.hz(root + 7), 0.9 * spb, 0.6))
        if sec == 'C':
            s.put('pad', beat, gm.pad(vc, clen * spb, 0.5), human=0)
    elif style == 'folk':
        pat = [vc[0], vc[2], vc[1] + 12, vc[2]]
        for e in range(int(clen * 2)):
            s.put('keys', beat + e * 0.5, pluck(gm.hz(pat[e % 4]), 0.9 * spb, 0.33 * R.uniform(0.85, 1.05), 0.5))
        s.put('bass', beat, gm.bass(gm.hz(root), min(clen, 2) * 0.9 * spb, 0.6))
        if sec == 'C':
            s.put('pad', beat, gm.pad(vc, clen * spb, 0.5), human=0)


def drum_bar(s, style, beat, meter, sw, bar, sec):
    if style == 'lofi':
        s.put('drums', beat, gm.kick(0.85))
        s.put('drums', beat + 2.5, gm.kick(0.55), swing=sw)
        for sb in (1, 3):
            s.put('drums', beat + sb, gm.snare(0.5))
        for e in range(8):
            s.put('drums', beat + e * 0.5, gm.hat(0.3 if e % 2 == 0 else 0.18), swing=sw)
    elif style == 'bossa':
        s.put('drums', beat, gm.kick(0.6, soft=True))
        s.put('drums', beat + 2.5, gm.kick(0.45, soft=True), swing=sw)
        clave = [0, 1.5, 3] if bar % 2 == 0 else [1, 2]
        for cb in clave:
            s.put('drums', beat + cb, rim(0.35))
        for e in range(8):
            s.put('drums', beat + e * 0.5, shaker(0.25 if e % 2 else 0.35), swing=sw)
    elif style == 'chip':
        for kb in ((0, 2) if bar % 2 == 0 else (0, 2, 2.5)):
            s.put('drums', beat + kb, gm.chip_kick(0.9), human=0)
        for sb in (1, 3):
            s.put('drums', beat + sb, gm.chip_noise(0.5, 0.16, 0.06, 1000), human=0)
        for e in range(8):
            s.put('drums', beat + e * 0.5, gm.chip_noise(0.22 if e % 2 else 0.3, 0.05, 0.012, 6000), human=0)
    elif style in ('marimba', 'folk'):
        s.put('drums', beat, gm.kick(0.6, soft=True))
        if style == 'marimba':
            s.put('drums', beat + 2, gm.kick(0.5, soft=True))
            for sb in (1, 3):
                s.put('drums', beat + sb, gm.snare(0.35, brush=True))
        for e in range(8):
            s.put('drums', beat + e * 0.5, shaker(0.3 if e % 2 else 0.2))
    elif style == 'musicbox':
        s.put('drums', beat, gm.kick(0.35, soft=True))


def export(y, path_noext, kbps=40):
    from scipy.io import wavfile
    wav = path_noext + '.wav'
    wavfile.write(wav, SR, (y * 32767).astype(np.int16))
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    lufs = float([ln for ln in out.splitlines() if ln.strip().startswith('I:')][-1].split()[1])
    gain = -16.0 - lufs
    for _ in range(3):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af',
                        f'volume={gain:.2f}dB,alimiter=limit=0.78:attack=3:release=80:level=false',
                        '-ac', '1', '-b:a', f'{kbps}k', path_noext + '.mp3'], check=True)
        # 方波在 mp3 编码后会有过冲：解码检查峰值，超过 -1 dBFS 就降一点再编码
        chk = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path_noext + '.mp3', '-af', 'ebur128=peak=sample', '-f', 'null', '-'],
                             capture_output=True, text=True).stderr
        peak = float([ln for ln in chk.splitlines() if ln.strip().startswith('Peak:')][-1].split()[1])
        if peak <= -1.0:
            break
        gain -= peak + 1.2
    os.remove(wav)
    return lufs


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'music-out'
    only = sys.argv[2:]
    os.makedirs(out, exist_ok=True)
    for th in THEMES:
        if only and th['id'] not in only:
            continue
        y, bpm = render_theme(th)
        lufs = export(y, os.path.join(out, f"theme_{th['id']}"))
        print(f"theme_{th['id']} {th['title']}: {len(y) / SR:.1f}s  bpm={bpm:.1f}  raw={lufs:.1f} LUFS → -16")
