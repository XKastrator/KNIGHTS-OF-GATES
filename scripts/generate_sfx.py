"""
Procedural SFX for Knights of Gates -> public/assets/sfx/*.wav

Synthesized placeholders in a consistent "steel & fanfare" family; swap the
WAVs for designed audio anytime — the SoundManager only cares about filenames.

Usage: pip install numpy && python3 scripts/generate_sfx.py
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44_100
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "sfx"

rng = np.random.default_rng(7)


def t(dur: float) -> np.ndarray:
    return np.arange(int(SR * dur)) / SR


def env(n: int, attack: float, decay: float, curve: float = 3.0) -> np.ndarray:
    """attack/decay as fractions of length; exponential-ish decay."""
    a = max(1, int(n * attack))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    d = n - a
    e[a:] = np.exp(-curve * np.linspace(0, 1, d))
    return e


def onepole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    k = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - k) * v + k * acc
        y[i] = acc
    return y


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - onepole_lp(x, cutoff)


def normalize(x: np.ndarray, peak: float = 0.9) -> np.ndarray:
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def write(name: str, x: np.ndarray) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(OUT / name), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(data.tobytes())
    print(f"{name}: {len(x) / SR:.2f}s")


def metallic(dur: float, partials: list[float], decay: float) -> np.ndarray:
    """Inharmonic partial stack — the 'ring' of struck steel."""
    tt = t(dur)
    x = np.zeros_like(tt)
    for i, f in enumerate(partials):
        x += np.sin(2 * np.pi * f * tt + rng.uniform(0, 6.28)) * np.exp(-decay * (1 + i * 0.35) * tt)
    return x / len(partials)


def saw_note(freq: float, dur: float, detune: float = 0.004) -> np.ndarray:
    """Detuned saw pair with mellowing lowpass — brass-ish."""
    tt = t(dur)
    x = np.zeros_like(tt)
    for d in (1 - detune, 1 + detune):
        ph = (freq * d * tt) % 1.0
        x += 2 * ph - 1
    return onepole_lp(x / 2, freq * 5)


# ---- spin.wav — soft whoosh on spin start
n = t(0.32)
whoosh = highpass(onepole_lp(rng.normal(0, 1, len(n)), 1400), 250)
write("spin.wav", normalize(whoosh * env(len(n), 0.25, 0.75, 4), 0.5))

# ---- stop.wav — reel thock
tt = t(0.13)
freq = np.linspace(170, 88, len(tt))
thock = np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(len(tt), 0.01, 0.99, 7)
click = highpass(rng.normal(0, 1, len(tt)), 2500) * env(len(tt), 0.002, 0.998, 30) * 0.5
write("stop.wav", normalize(thock + click, 0.75))

# ---- riser.wav — tension sweep before the clash
tt = t(0.55)
noise = rng.normal(0, 1, len(tt))
sweep = np.array([])
cut = np.linspace(300, 5200, 12)
seg = np.array_split(noise, 12)
sweep = np.concatenate([onepole_lp(s, c) for s, c in zip(seg, cut)])
roll = np.sin(2 * np.pi * 55 * tt) * np.sin(2 * np.pi * 13 * tt) ** 2
lin = np.linspace(0.15, 1.0, len(tt)) ** 2
write("riser.wav", normalize((highpass(sweep, 180) * 0.8 + roll * 0.55) * lin, 0.72))

# ---- clash.wav — swords hit: transient + steel ring + low thump
dur = 0.75
tt = t(dur)
ring = metallic(dur, [2680, 3170, 3960, 5230, 6410, 7830], 9)
trans = highpass(rng.normal(0, 1, len(tt)), 1800) * env(len(tt), 0.001, 0.999, 26)
fr = np.linspace(120, 52, len(tt))
thump = np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(len(tt), 0.002, 0.998, 12)
write("clash.wav", normalize(ring * 0.85 + trans * 0.9 + thump * 0.8, 0.95))

# ---- victory.wav — two-note sting + shimmer (blue knight wins)
a = saw_note(440.0, 0.22) * env(int(SR * 0.22), 0.05, 0.95, 2.5)
b = saw_note(587.33, 0.75) * env(int(SR * 0.75), 0.04, 0.96, 2.2)
b5 = saw_note(880.0, 0.75) * env(int(SR * 0.75), 0.04, 0.96, 2.6) * 0.4
shimmer = highpass(rng.normal(0, 1, int(SR * 0.75)), 6000) * env(int(SR * 0.75), 0.1, 0.9, 5) * 0.14
vic = np.concatenate([a, b + b5 + shimmer])
write("victory.wav", normalize(vic, 0.85))

# ---- win.wav — coin plink arpeggio
notes = [659.26, 783.99, 987.77, 1174.66, 1318.51]
step = int(SR * 0.085)
total = step * len(notes) + int(SR * 0.35)
xw = np.zeros(total)
for i, f in enumerate(notes):
    seg_t = t(0.4)
    plink = (np.sin(2 * np.pi * f * seg_t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * seg_t)) * env(len(seg_t), 0.004, 0.996, 8)
    s = i * step
    xw[s : s + len(plink)] += plink * (0.75 + 0.05 * i)
write("win.wav", normalize(xw, 0.7))

# ---- bigwin.wav — fanfare: arpeggio + held chord + shimmer
seq = [(392.0, 0.14), (523.25, 0.14), (659.26, 0.14), (783.99, 0.62)]
parts = []
for f, d in seq:
    parts.append(saw_note(f, d) * env(int(SR * d), 0.06, 0.94, 2.0))
chord_dur = 0.62
chord = sum(saw_note(f, chord_dur) for f in (523.25, 659.26, 783.99, 1046.5)) / 4
chord = chord * env(int(SR * chord_dur), 0.03, 0.97, 1.8)
shimmer = highpass(rng.normal(0, 1, int(SR * chord_dur)), 5500) * env(int(SR * chord_dur), 0.15, 0.85, 4) * 0.12
big = np.concatenate([np.concatenate(parts[:-1]), parts[-1] * 0.6 + chord + shimmer])
write("bigwin.wav", normalize(big, 0.85))

# ---- megawin.wav — grander: three rising chords + bells + cymbal wash
def chord_hit(freqs, dur, sustain=2.0):
    x = sum(saw_note(f, dur) for f in freqs) / len(freqs)
    return x * env(int(SR * dur), 0.04, 0.96, sustain)

mega = np.concatenate(
    [
        chord_hit((392.0, 493.88, 587.33), 0.30, 3.0),
        chord_hit((440.0, 554.37, 659.26), 0.30, 3.0),
        chord_hit((523.25, 659.26, 783.99, 1046.5), 1.15, 1.6),
    ]
)
bells = np.zeros_like(mega)
for i, f in enumerate((1567.98, 2093.0, 2637.02, 3135.96)):
    start = int(SR * (0.62 + i * 0.12))
    seg = t(0.7)
    b = np.sin(2 * np.pi * f * seg) * env(len(seg), 0.005, 0.995, 6) * 0.22
    bells[start : start + len(b)] += b[: max(0, len(bells) - start)]
cym = highpass(rng.normal(0, 1, len(mega)), 6000) * env(len(mega), 0.02, 0.98, 2.5) * 0.16
write("megawin.wav", normalize(mega + bells + cym, 0.9))

# ---- reel_loop.wav — seamless mechanical whirr (played while reels spin)
dur = 1.2
n = int(SR * dur)
base_noise = onepole_lp(rng.normal(0, 1, n), 900)
# rhythmic ticking of symbols passing the payline (~22 per second)
ticks = np.zeros(n)
period = int(SR / 22)
for s in range(0, n - 40, period):
    ticks[s : s + 40] += np.hanning(40) * 0.7
tick_noise = highpass(rng.normal(0, 1, n), 2500) * ticks
loop = base_noise * 0.5 + tick_noise * 0.35
# crossfade tail into head for a seamless loop
xf = int(SR * 0.05)
fade = np.linspace(0, 1, xf)
loop[:xf] = loop[:xf] * fade + loop[-xf:] * (1 - fade)
loop = loop[: n - xf]
write("reel_loop.wav", normalize(loop, 0.4))

# ---- rollup_tick.wav / rollup_end.wav — win meter counting
seg = t(0.045)
tick = np.sin(2 * np.pi * 1245 * seg) * env(len(seg), 0.02, 0.98, 9)
tick += np.sin(2 * np.pi * 1868 * seg) * env(len(seg), 0.02, 0.98, 12) * 0.4
write("rollup_tick.wav", normalize(tick, 0.5))

seg = t(0.5)
ding = (np.sin(2 * np.pi * 1318.5 * seg) + 0.5 * np.sin(2 * np.pi * 1975.5 * seg)) * env(len(seg), 0.005, 0.995, 5)
write("rollup_end.wav", normalize(ding, 0.6))

# ---- click.wav — soft UI button press
seg = t(0.05)
click = highpass(rng.normal(0, 1, len(seg)), 1800) * env(len(seg), 0.01, 0.99, 18)
click += np.sin(2 * np.pi * 620 * seg) * env(len(seg), 0.005, 0.995, 16) * 0.5
write("click.wav", normalize(click, 0.45))

# ---- anticipation.wav — rising shimmer while the last reels crawl
dur = 1.6
n = int(SR * dur)
tt = t(dur)
trem = np.sin(2 * np.pi * (6 + 8 * tt / dur) * tt) ** 2
tone = np.sin(2 * np.pi * (220 + 160 * (tt / dur) ** 2) * tt) * 0.5
shimmer2 = highpass(rng.normal(0, 1, n), 4000) * trem * 0.35
grow = np.linspace(0.25, 1.0, n) ** 1.5
write("anticipation.wav", normalize((tone + shimmer2) * grow, 0.6))

# ---- ambience.wav — castle courtyard: wind + torch crackle (quiet loop)
dur = 4.0
n = int(SR * dur)
wind = onepole_lp(rng.normal(0, 1, n), 240)
sway = 0.5 + 0.5 * np.sin(2 * np.pi * 0.21 * t(dur))
crackle = np.zeros(n)
for _ in range(90):
    s = rng.integers(0, n - 500)
    ln = rng.integers(80, 420)
    crackle[s : s + ln] += highpass(rng.normal(0, 1, ln), 3000) * np.exp(-6 * np.linspace(0, 1, ln)) * rng.uniform(0.2, 0.7)
amb = wind * sway * 0.6 + crackle * 0.25
xf = int(SR * 0.25)
fade = np.linspace(0, 1, xf)
amb[:xf] = amb[:xf] * fade + amb[-xf:] * (1 - fade)
amb = amb[: n - xf]
write("ambience.wav", normalize(amb, 0.32))

print("done ->", OUT)
