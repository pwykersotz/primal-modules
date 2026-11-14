#!/usr/bin/env python3
"""Synthesises the short sound cues in sounds/ (Ogg Vorbis, mono). Every sound is generated here from
scratch (no samples), so the module's sounds are its own.

    python3 tools/make-sounds.py            # writes sounds/*.ogg (needs numpy, scipy and ffmpeg)
"""
import os, subprocess, tempfile, wave
import numpy as np
from scipy import signal

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "sounds")
rng = np.random.default_rng(7)


def t_axis(seconds):
    return np.arange(int(SR * seconds)) / SR


def env_exp(n, attack, decay):
    """Quick attack, exponential decay (decay = seconds to fall to ~1/e)."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def env_swell(n, rise, fall):
    t = np.arange(n) / SR
    total = n / SR
    up = np.clip(t / rise, 0, 1)
    down = np.clip((total - t) / fall, 0, 1)
    return np.sin(up * np.pi / 2) ** 2 * np.sin(down * np.pi / 2) ** 2


def noise(n):
    return rng.standard_normal(n)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x, f, order=2):
    sos = signal.butter(order, f, btype="lowpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def highpass(x, f, order=2):
    sos = signal.butter(order, f, btype="highpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep_tone(f0, f1, seconds, shape="exp"):
    t = t_axis(seconds)
    if shape == "exp":
        f = f0 * (f1 / f0) ** (t / seconds)
    else:
        f = f0 + (f1 - f0) * (t / seconds)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def faded(x, ms=12):
    """Ease the last few milliseconds (and the first one) to silence, so nothing ends in a click."""
    x = np.array(x, dtype=np.float64)
    n = min(len(x), int(SR * ms / 1000))
    if n > 1:
        x[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    m = min(len(x), int(SR * 0.001))
    if m > 1:
        x[:m] *= np.linspace(0, 1, m)
    return x


def place(buf, x, at):
    x = faded(x)
    i = int(at * SR)
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]
    return buf


def room(x, amount=0.18, length=0.6):
    """A small, soft room: convolve with decaying filtered noise."""
    x = faded(x)
    n = int(SR * length)
    ir = lowpass(noise(n), 5000) * np.exp(-np.arange(n) / SR / (length / 5))
    ir[0] = 0
    ir /= np.max(np.abs(ir)) + 1e-9
    wet = signal.fftconvolve(x, ir)[: len(x) + n]
    out = np.zeros(len(wet))
    out[: len(x)] += x
    return out + amount * wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(x))


def bell(freq, seconds, ratios=(1, 2.76, 5.4, 8.93), decays=(1.0, 0.55, 0.3, 0.18), gains=(1, 0.5, 0.25, 0.12)):
    t = t_axis(seconds)
    x = np.zeros_like(t)
    for r, d, g in zip(ratios, decays, gains):
        x += g * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (d * seconds / 2.2))
    return x * np.clip(t / 0.003, 0, 1)


# ---------- the cues ----------

def chime():          # charmed, hasted, Mighty Guard: a bright two-note bell
    buf = np.zeros(int(SR * 1.3))
    place(buf, bell(1318.5, 1.1), 0.0)
    place(buf, 0.8 * bell(1975.5, 1.0), 0.09)
    place(buf, 0.35 * bell(2637.0, 0.8), 0.18)
    return room(buf, 0.25)


def zap():            # paralyzed, stunned: a crackling electric snap
    n = int(SR * 0.6)
    t = np.arange(n) / SR
    buzz = signal.sawtooth(2 * np.pi * 118 * t) * 0.35 + signal.sawtooth(2 * np.pi * 177 * t) * 0.2
    gate = (rng.random(n // 220 + 1) < 0.55).repeat(220)[:n].astype(float)
    gate = lowpass(gate, 900)
    crackle = bandpass(noise(n), 1800, 7000) * gate
    x = (crackle * 0.9 + lowpass(buzz, 2500) * 0.6) * env_exp(n, 0.004, 0.18)
    snap = bandpass(noise(int(SR * 0.03)), 2500, 9000) * env_exp(int(SR * 0.03), 0.0005, 0.008)
    place(x, 1.4 * snap, 0.0)
    return room(x, 0.12, 0.4)


def whoosh():         # invisible, ethereal, dodging: air rushing past
    n = int(SR * 0.85)
    x = noise(n)
    out = np.zeros(n)
    block = 512
    for i in range(0, n, block):
        p = i / n
        centre = 350 + 2600 * np.sin(np.pi * p) ** 1.5
        seg = x[max(0, i - 2048): i + block]
        y = bandpass(seg, centre * 0.6, min(centre * 1.6, SR / 2 - 100))
        out[i: i + block] = y[-len(out[i: i + block]):]
    return room(out * env_swell(n, 0.35, 0.45), 0.1)


def flame():          # burning: a rush of fire with crackles
    n = int(SR * 1.0)
    rumble = lowpass(noise(n), 420) * 2.2 + bandpass(noise(n), 500, 1800) * 0.35
    x = rumble * env_swell(n, 0.18, 0.6)
    for _ in range(14):
        at = rng.uniform(0.05, 0.85)
        m = int(SR * rng.uniform(0.004, 0.012))
        c = highpass(noise(m), 1500) * env_exp(m, 0.0004, m / SR / 3)
        place(x, c * rng.uniform(0.4, 1.0), at)
    return room(x, 0.08)


def splat():          # bleeding, bloodied: a wet splash and a drip
    n = int(SR * 0.5)
    t = np.arange(n) / SR
    body = lowpass(noise(n), 900) * env_exp(n, 0.002, 0.05) * 1.6
    gurgle = np.sin(2 * np.pi * np.cumsum(260 * np.exp(-t * 9) + 90) / SR) * env_exp(n, 0.002, 0.06) * 0.6
    x = body + gurgle
    drip = sweep_tone(1400, 520, 0.07) * env_exp(int(SR * 0.07), 0.001, 0.025)
    place(x, 0.5 * drip, 0.28)
    return room(x, 0.15, 0.35)


def bubble():         # poisoned, diseased: thick bubbles rising and popping
    buf = np.zeros(int(SR * 0.8))
    for at, f0, d in [(0.0, 260, 0.07), (0.12, 340, 0.06), (0.21, 300, 0.08), (0.36, 420, 0.05), (0.47, 380, 0.07), (0.6, 480, 0.05)]:
        m = int(SR * d)
        b = sweep_tone(f0, f0 * 2.6, d) * env_exp(m, 0.003, d / 2.5)
        place(buf, b * rng.uniform(0.6, 1.0), at)
    return room(lowpass(buf, 3000), 0.2, 0.4)


def stone():          # petrified: grinding, cracking stone
    n = int(SR * 0.9)
    brown = np.cumsum(noise(n)); brown -= signal.savgol_filter(brown, 2001, 2); brown /= np.max(np.abs(brown)) + 1e-9
    grind = lowpass(brown, 700) * 2 + bandpass(noise(n), 300, 1400) * 0.25
    gate = lowpass((rng.random(n // 300 + 1) < 0.4).repeat(300)[:n].astype(float), 200)
    x = grind * (0.4 + 0.6 * gate) * env_swell(n, 0.06, 0.4)
    thump = sweep_tone(110, 50, 0.2) * env_exp(int(SR * 0.2), 0.002, 0.06)
    place(x, 0.9 * thump, 0.0)
    for _ in range(6):
        m = int(SR * 0.01)
        place(x, highpass(noise(m), 2000) * env_exp(m, 0.0003, 0.003) * 0.6, rng.uniform(0.1, 0.7))
    return room(x, 0.1)


def drone():          # frightened, cursed, slowed: a dark, uneasy swell
    n = int(SR * 1.3)
    t = np.arange(n) / SR
    x = signal.sawtooth(2 * np.pi * 55 * t) + signal.sawtooth(2 * np.pi * 58.3 * t) + 0.5 * signal.sawtooth(2 * np.pi * 82.4 * t * (1 - 0.03 * t))
    x = lowpass(x, 480, 4) * env_swell(n, 0.35, 0.7)
    air = bandpass(noise(n), 200, 900) * 0.15 * env_swell(n, 0.5, 0.6)
    return room(x + air, 0.2)


def sleep():          # unconscious, sleeping, incapacitated: a soft falling lull
    buf = np.zeros(int(SR * 1.5))
    for at, f in [(0.0, 523.25), (0.28, 440.0), (0.56, 349.23)]:
        m = int(SR * 0.7)
        tt = np.arange(m) / SR
        tone = np.sin(2 * np.pi * f * tt + 0.15 * np.sin(2 * np.pi * 5 * tt)) + 0.2 * np.sin(2 * np.pi * 2 * f * tt)
        place(buf, tone * env_exp(m, 0.04, 0.22) * 0.6, at)
    return room(buf, 0.3)


def thud():           # prone, grappled, restrained: a dull thump
    n = int(SR * 0.4)
    x = sweep_tone(95, 42, 0.4) * env_exp(n, 0.002, 0.08) * 1.2
    x += lowpass(noise(n), 300) * env_exp(n, 0.001, 0.03) * 0.8
    return room(x, 0.08, 0.3)


def toll():           # dead: one deep bell
    x = bell(98.0, 2.4, ratios=(1, 2.0, 2.4, 3.0, 4.2), decays=(1.0, 0.8, 0.5, 0.4, 0.25), gains=(1, 0.6, 0.45, 0.25, 0.15))
    return room(x * 1.2, 0.3, 0.9)


def heartbeat():      # dying (0 HP): two slow heartbeats
    buf = np.zeros(int(SR * 1.7))
    def beat(gain):
        m = int(SR * 0.16)
        return sweep_tone(70, 38, 0.16) * env_exp(m, 0.004, 0.045) * gain
    for at in (0.0, 0.85):
        place(buf, beat(1.0), at)
        place(buf, beat(0.65), at + 0.22)
    return room(lowpass(buf, 400), 0.1, 0.3)


def ping():           # marked: a target lock
    buf = np.zeros(int(SR * 0.5))
    for at, f in [(0.0, 1760), (0.09, 2349)]:
        m = int(SR * 0.12)
        place(buf, np.sin(2 * np.pi * f * np.arange(m) / SR) * env_exp(m, 0.002, 0.03) * 0.7, at)
    return room(buf, 0.3, 0.4)


CUES = [chime, zap, whoosh, flame, splat, bubble, stone, drone, sleep, thud, toll, heartbeat, ping]


def write(name, x, peak=0.7):
    x = np.asarray(x, dtype=np.float64)
    fade = min(len(x), int(SR * 0.02))
    x[-fade:] *= np.linspace(1, 0, fade)
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    pcm = (x * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, f"{name}.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        dest = os.path.join(OUT, f"{name}.ogg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", "3", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", dest], check=True)
    return dest


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for cue in CUES:
        path = write(cue.__name__, cue())
        print(f"{os.path.relpath(path, ROOT)}  {os.path.getsize(path) // 1024} KB")
