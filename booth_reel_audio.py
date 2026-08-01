#!/usr/bin/env python3
"""
BOOTH REEL AUDIO — "church wood"  (locked standard, 23 Jul 2026)

Default sound bed for every Booth reel. Do not change without a reason.

Usage
-----
from booth_reel_audio import build_audio

build_audio(
    out_path      = "audio.wav",
    duration      = 12.70,          # seconds, must match the video exactly
    keystrokes    = [0.00, 0.08,],  # confession typing, seconds from start
    reply_clicks  = [0.00, 0.06,],  # booth reply typing, seconds from verdict_at
    verdict_at    = 6.43,           # frame the verdict appears
)

Requires: numpy, scipy
"""
import numpy as np
import wave
from scipy import signal

SR = 48000

# ---------------------------------------------------------------- locked values
HUSH_LEVEL   = 0.012    # room tone level. 0.030 was too loud, competed with clicks
TAIL_SECONDS = 0.35     # wooden box decay on each click
TAIL_WET     = 0.16     # how much of that box you hear
CLICK_GAIN   = 0.80     # confession typing
REPLY_GAIN   = 0.46     # booth reply typing, lighter
CLICK_BODY   = 180      # Hz, confession click
REPLY_BODY   = 252      # Hz, booth reply click


def _clicks_and_thud(n, keystrokes, reply_clicks, verdict_at, seed=5):
    """Pete's original synthesis — unchanged."""
    out = np.zeros(n)
    rng = np.random.default_rng(seed)

    def click(t, g=1.0, body=190):
        i = int(t * SR); L = int(0.036 * SR)
        if i < 0 or i + L > n:
            return
        e = np.exp(-np.linspace(0, 1, L) * 32)
        out[i:i + L] += (
            rng.normal(0, 1, L) * e * 0.48
            + np.sin(2 * np.pi * body * np.linspace(0, L / SR, L))
              * np.exp(-np.linspace(0, 1, L) * 22) * 0.44
        ) * g

    def thud(t, g=1.0):
        i = int(t * SR); L = int(0.62 * SR)
        if i + L > n:
            return
        tt = np.linspace(0, L / SR, L)
        f = np.linspace(92, 42, L)
        out[i:i + L] += (
            np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6.2) * 0.9
            + rng.normal(0, 1, L) * np.exp(-tt * 45) * 0.22
        ) * g

    for t in keystrokes:
        click(t, g=CLICK_GAIN + rng.normal(0, 0.09), body=CLICK_BODY + rng.normal(0, 20))
    for t in reply_clicks:
        click(verdict_at + t, g=REPLY_GAIN + rng.normal(0, 0.06), body=REPLY_BODY + rng.normal(0, 24))
    thud(verdict_at + 0.02, g=1.0)

    out /= max(1e-9, np.abs(out).max())
    return out * 0.90


def _wooden_tail(a, seed=9):
    """0.35s dark box decay. This is what puts the clicks INSIDE the booth."""
    rng = np.random.default_rng(seed)
    L = int(TAIL_SECONDS * SR)
    ir = rng.normal(0, 1, L) * np.exp(-np.linspace(0, 1, L) * 9)
    ir = signal.sosfilt(signal.butter(4, 900, "lp", fs=SR, output="sos"), ir)
    ir[int(0.011 * SR)] += 0.55      # panel slap
    ir[int(0.019 * SR)] += 0.38
    ir /= np.abs(ir).max()
    wet = signal.fftconvolve(a, ir)[:len(a)]
    wet /= (np.abs(wet).max() + 1e-9)
    out = a * 0.90 + wet * TAIL_WET
    out /= (np.abs(out).max() + 1e-9)
    return out * 0.90


def _church_hush(n, seed=21):
    """
    Confession booth inside a stone church.
    Three layers, and one deliberate removal.
    """
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR

    def lp(x, f, o=4): return signal.sosfilt(signal.butter(o, f, "lp", fs=SR, output="sos"), x)
    def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, "hp", fs=SR, output="sos"), x)
    def peak(x, f0, Q, g):
        b, a = signal.iirpeak(f0, Q, fs=SR)
        return x + g * signal.lfilter(b, a, x)

    # the building — large stone volume
    sub = lp(rng.normal(0, 1, n), 55, 6)
    sub *= (0.80 + 0.20 * np.sin(2 * np.pi * 0.055 * t))
    sub /= sub.std()

    # the booth — small dark wooden box with timber modes
    box = lp(rng.normal(0, 1, n), 420, 4)
    box = peak(box, 118, 7, 0.90)     # box depth
    box = peak(box, 187, 9, 0.60)     # panel
    box = peak(box, 268, 11, 0.35)    # bench / lattice
    box = hp(box, 45, 2)
    box /= box.std()

    # air through the screen — barely there
    air = lp(hp(rng.normal(0, 1, n), 3500, 2), 9000, 2)
    air /= air.std()

    mix = sub * 0.62 + box * 0.42 + air * 0.05
    mix = lp(mix, 6000, 2)            # nothing bright survives stone
    mix *= (0.88 + 0.12 * np.sin(2 * np.pi * 0.033 * t + 1.1))   # room breathing
    mix /= (np.abs(mix).std() + 1e-9)
    return mix * HUSH_LEVEL


def _compress(a):
    """Gentle compression on the CLICKS ONLY. Hush is added afterwards."""
    out = np.zeros_like(a)
    env = 0.0
    th, ratio = 0.02, 5.0
    atk = np.exp(-1.0 / (0.008 * SR))
    rel = np.exp(-1.0 / (0.300 * SR))
    for i, x in enumerate(a):
        ax = abs(x)
        env = (atk if ax > env else rel) * env + (1 - (atk if ax > env else rel)) * ax
        g = 1.0 if env <= th else (th + (env - th) / ratio) / env
        out[i] = x * g
    out *= 10 ** (10.6 / 20.0)   # tuned to match the approved ffmpeg chain
    return np.clip(out, -0.88, 0.88)


def build_audio(out_path, duration, keystrokes, reply_clicks, verdict_at):
    n = int(SR * duration)
    clicks = _clicks_and_thud(n, keystrokes, reply_clicks, verdict_at)
    clicks = _wooden_tail(clicks)
    clicks = _compress(clicks)
    hush = _church_hush(n)                    # added AFTER compression — never ducks
    mix = np.clip(clicks + hush, -0.95, 0.95)
    st = np.stack([mix, mix], 1).reshape(-1)
    with wave.open(out_path, "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())
    return out_path


# ---------------------------------------------------------------- notes
#
# WHY THE HUSH IS ADDED LAST
#   Compressing the whole mix made the hush duck after every click and swell
#   back over 300ms. It pumped through the typing, then went still. Adding the
#   hush after compression keeps it dead flat.
#
# WHY THE PRESENCE BAND IS REMOVED
#   Hiss lives at 1-4kHz. That band is what makes noise sound like a bad
#   recording instead of a place. Cutting it is what turns static into a room.
#
# WHY 0.012 AND NOT LOUDER
#   At 0.030 the tone competed with the clicks. At 0.012 the clicks sit about
#   33dB clear. Enough to know you are in a room, not enough to notice.
#
# THE TRADE
#   This sits around -27dB, quieter than Instagram wants. Louder versions were
#   tried and sounded wrong. Quiet and correct beat loud and off-brand.
