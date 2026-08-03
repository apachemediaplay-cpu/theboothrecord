#!/usr/bin/env python3
"""
THE BOOTH — brand reel

Renders the Booth mark, the name, the gate copy and the GUILTY sign-off
as a timed sequence. Rendered BY the app in a browser so the colour
tokens and fonts are the real ones.

USAGE
    # terminal 1
    booth
    npx vite --port 8080 --host 127.0.0.1

    # terminal 2
    booth
    source .venv/bin/activate
    python make_booth_reel.py

Writes to outputs/:
    booth_reel.mp4   10.0s  full sequence — standalone post
    booth_tail.mp4    1.6s  sign-off only — end of confession reels
    booth_loop.mp4    2.8s  mark + name, seamless — Story loop

EVERY FRAME IS SET EXPLICITLY.
Nothing is recorded while animating. For each frame the glow phase, the
revealed characters and the fade opacities are computed in Python and
written into the page, then screenshotted. The loop is therefore exact,
not approximate, and a re-run is byte-identical.

REQUIRES
    playwright, ffmpeg, booth_reel_audio.py
"""

import argparse, json, math, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# ─────────────────────────────────────────────────────────────
# LOCKED GRID  (1080 x 1920)
# ─────────────────────────────────────────────────────────────
W, H, FPS = 1080, 1920, 30

MARK_PX, MARK_TOP = 400, 480
NAME_TRACK = "0.10em"      # caps want a touch more air than mixed case
NAME_TEXT = "THE BOOTH"
NAME_SZ, NAME_TOP = 58, 936   # caps run wider; 58 keeps it inside the mark
LINE_SZ, LINE_TOP, LINE_STEP = 44, 1078, 74
WM_W, WM_BOTTOM = 265, 1480

# Glow. One breath, matching the app's listen-glow.
CYCLE_S = 2.8
GLOW = [(2, 3, 0.85, 0.97), (6, 10, 0.45, 0.68), (14, 26, 0.25, 0.47)]

# The glow's sonic twin — a neon sign. The mark IS a glowing tube, so
# the sound of the object is a transformer hum, not an abstract sub.
#
#   50Hz Australian mains, with the harmonic stack that makes a buzz
#   instead of a note. Weight sits on the 2nd, 4th, 6th and 8th — these
#   are octaves and fifths, so it stays warm. The 7th, 9th and 11th are
#   dissonant and are what make a hum sound sour; they're kept low.
#   200-600Hz carries about 40% of the energy, which is both the warmth
#   and the band small speakers actually reproduce. A pure 41Hz sine
#   lost 70dB through a phone. This loses 16.
#
#   The filter OPENS as it swells, so the pulse is a change in tone and
#   not only in level. Real neon gets brighter and buzzier together.
NEON_HZ      = 50.0
NEON_GAIN    = 1.00
NEON_FLOOR   = 0.08     # level at the trough — a 22dB swing
NEON_SHAPE   = 1.55     # >1 sits low longer, then rises. Reads as a pulse.
NEON_LP_DARK = 320      # cutoff at the trough
NEON_LP_LIT  = 900      # cutoff at the peak
NEON_IN      = 0.70     # fade in, seconds
NEON_DUCK    = 0.18     # level while the copy is typing
NEON_SLEW    = 0.55     # seconds to move between the two
NEON_PARTIALS = [(1,1.00),(2,0.78),(3,0.62),(4,0.66),(5,0.40),
                 (6,0.48),(7,0.16),(8,0.30),(9,0.08),(10,0.14)]

# Copy. Typed at the gate's real cadence.
L1, L2 = "Confessions. Anonymous.", "Unfiltered. Judged."
L3 = "One verdict. No appeal."
MS_WHITE, MS_GREEN = 50, 60

# The cursor follows whichever line is being typed, then stays on the
# last one and blinks until the copy clears. A trailing bar reads as
# being-typed; text that simply appears reads as a slide.
CURSOR      = "|"
BLINK_S     = 1.0
BLINK_ON    = 0.6

# ── Sequence, in seconds ─────────────────────────────────────
T_NAME_IN   = 1.30
T_NAME_DUR  = 0.50
T_L1        = 2.20
T_GAP12     = 0.20
T_GAP23     = 0.50
T_HOLD      = 1.00      # after the green line finishes
T_FADE      = 0.50
T_TAIL_HOLD = 1.60
TAIL_S, LOOP_S = 1.60, CYCLE_S

# ─────────────────────────────────────────────────────────────

WORDMARK = '''<g> <path  d="M235.4,193.2h30v12.4c-5.1,2.8-11.5,3.9-20.1,3.9-20.9,0-33.6-14.2-33.6-37.1s15.4-38.9,40.9-38.9,39.3,8.7,48.8,19.1v-40.3c-13.6-7.9-28.4-12.8-49.4-12.8-48.8,0-79.2,29-79.2,72.7s28,71.5,71.9,71.5,46.6-9.3,58-22.3v-60.4h-67.3v32.2Z"/> <path  d="M398.1,119.8v65.1c0,13.8-7.7,23.5-22.7,23.5s-22.9-9.7-22.9-23.5v-82.3h-37.3v83.5c0,36.3,21.7,57.6,60.2,57.6s60-21.3,60-57.6v-83.5h-37.3v17.2Z"/> <polygon  points="449.8 119.8 449.8 223.6 449.8 240.8 487.1 240.8 487.1 223.6 487.1 119.8 487.1 102.6 449.8 102.6 449.8 119.8"/> <polygon  points="541.1 205.7 541.1 119.8 541.1 102.6 503.8 102.6 503.8 119.8 503.8 223.6 503.8 240.8 592.3 240.8 592.3 205.7 557.9 205.7 541.1 205.7"/> <polygon  points="793.1 102.6 751 102.6 739.8 122.4 725.2 147.8 711.9 124.7 699.3 102.6 688 102.6 657 102.6 567.2 102.6 567.2 137.2 594.1 137.2 608.9 137.2 608.9 221.5 608.9 240.8 646.2 240.8 646.2 223.6 646.2 137.2 661 137.2 677.5 137.2 706.4 185.9 706.4 221.5 706.4 240.8 743.7 240.8 743.7 223.6 743.7 185.9 781 122.9 788 111.2 794.6 111.2 798.2 111.2 798.2 132.2 798.2 137.1 807.5 137.1 807.5 132.8 807.5 111.2 811.2 111.2 818 111.2 818 102.6 793.1 102.6 793.1 102.6"/> <polygon  points="851.5 102.6 841 117.9 830.4 102.6 822.2 102.6 822.2 106.9 822.2 132.8 822.2 137.1 830.9 137.1 830.9 132.8 830.9 117.8 841 132.9 850.9 117.7 850.9 132.2 850.9 137.1 859.7 137.1 859.7 132.8 859.7 106.9 859.7 102.6 851.5 102.6"/> </g> <path  d="M500,335.5c-130.4,0-253.2-15.8-345.8-44.5C53.3,259.8,0,217.2,0,167.8S53.3,75.7,154.2,44.5C246.8,15.8,369.6,0,500,0s253.2,15.8,345.8,44.5c100.9,31.2,154.2,73.9,154.2,123.3s-53.3,92.1-154.2,123.3c-92.6,28.7-215.5,44.5-345.8,44.5ZM500,37.6c-126.7,0-245.6,15.2-334.7,42.8-41.6,12.9-75.3,28.3-97.6,44.6-13.7,10.1-30.1,25.6-30.1,42.8s16.4,32.8,30.1,42.8c22.2,16.3,56,31.7,97.6,44.6,89.1,27.6,208,42.8,334.7,42.8s245.6-15.2,334.7-42.8c41.6-12.9,75.3-28.3,97.6-44.6,13.7-10.1,30.1-25.6,30.1-42.8s-16.4-32.8-30.1-42.8c-22.2-16.3-56-31.7-97.6-44.6-89.1-27.6-208-42.8-334.7-42.8Z"/>'''

PAGE = """
<div id="stage" style="position:fixed;inset:0;background:hsl(var(--background));overflow:hidden;">
  <svg id="mark" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"
       style="position:absolute;left:%(mx)dpx;top:%(mt)dpx;width:%(mw)dpx;height:%(mw)dpx;">
    <path d="M58.5 210 L58.5 109 A61.5 61.5 0 0 1 181.5 109 L181.5 210"
          fill="none" stroke="hsl(var(--ritual-green))" stroke-width="31"/>
    <rect x="32" y="210" width="176" height="18" fill="hsl(var(--ritual-green))"/>
    <circle cx="120" cy="161" r="19" fill="hsl(var(--ritual-green))"/>
  </svg>

  <div id="name" class="font-control font-bold text-foreground"
       style="position:absolute;left:0;right:0;top:%(nt)dpx;text-align:center;
              font-size:%(ns)dpx;line-height:1;letter-spacing:%(ntr)s;opacity:0;"></div>

  <div id="copy" style="position:absolute;left:0;right:0;top:%(lt)dpx;text-align:center;opacity:1;">
    <div id="l1" class="font-mono-light text-foreground" style="font-size:%(ls)dpx;height:%(lh)dpx;line-height:%(lh)dpx;white-space:pre;"></div>
    <div id="l2" class="font-mono-light text-foreground" style="font-size:%(ls)dpx;height:%(lh)dpx;line-height:%(lh)dpx;white-space:pre;"></div>
    <div id="l3" class="font-mono-light text-ritual"     style="font-size:%(ls)dpx;height:%(lh)dpx;line-height:%(lh)dpx;white-space:pre;"></div>
  </div>

  <div id="wm" style="position:absolute;left:0;right:0;top:%(wt)dpx;text-align:center;opacity:0;">
    <svg viewBox="0 0 1000 335.5" style="display:block;margin:0 auto;width:%(ww)dpx;height:auto;" fill="hsl(var(--foreground))">%(word)s</svg>
  </div>
</div>
"""

SET_STATE = """(s) => {
  const mark = document.getElementById('mark');
  mark.style.filter = s.glow;
  document.getElementById('name').style.opacity = s.name;
  document.getElementById('name').textContent = s.nametext;
  document.getElementById('copy').style.opacity = s.copy;
  document.getElementById('l1').textContent = s.l1;
  document.getElementById('l2').textContent = s.l2;
  document.getElementById('l3').textContent = s.l3;
  document.getElementById('l3').style.filter = s.l3glow;
  document.getElementById('wm').style.opacity = s.wm;
}"""


def glow_css(phase, scale=1.0):
    """Three drop-shadow layers interpolated across one breath."""
    e = (1 - math.cos(2 * math.pi * phase)) / 2.0
    parts = []
    for b0, b1, a0, a1 in GLOW:
        b = (b0 + (b1 - b0) * e) * scale
        a = a0 + (a1 - a0) * e
        parts.append(f"drop-shadow(0 0 {b:.2f}px rgba(0,255,30,{a:.3f}))")
    return " ".join(parts)


def timeline():
    """
    Returns (states, keystrokes_s, reply_s, verdict_s, duration_s).

    Every timing is derived here so the audio and the picture cannot
    drift apart — they are built from the same numbers.
    """
    t_l1_end = T_L1 + len(L1) * MS_WHITE / 1000
    t_l2 = t_l1_end + T_GAP12
    t_l2_end = t_l2 + len(L2) * MS_WHITE / 1000
    t_l3 = t_l2_end + T_GAP23
    t_l3_end = t_l3 + len(L3) * MS_GREEN / 1000
    t_out = t_l3_end + T_HOLD
    t_wm = t_out + T_FADE
    dur = t_wm + T_FADE + T_TAIL_HOLD

    keys = [T_L1 + i * MS_WHITE / 1000 for i in range(len(L1))]
    keys += [t_l2 + i * MS_WHITE / 1000 for i in range(len(L2))]
    reply = [i * MS_GREEN / 1000 for i in range(len(L3))]

    n = int(round(dur * FPS))
    states = []
    for i in range(n):
        t = i / FPS
        rev = lambda start, text, ms: text[:max(0, min(len(text),
                                     int((t - start) * 1000 / ms) + 1))] if t >= start else ""
        fade = lambda a, b: max(0.0, min(1.0, (t - a) / (b - a))) if b > a else 0.0
        l1 = rev(T_L1, L1, MS_WHITE)
        l2 = rev(t_l2, L2, MS_WHITE)
        l3 = rev(t_l3, L3, MS_GREEN)

        # which line owns the cursor right now
        cur = None
        if T_L1 <= t < t_l2:
            cur = 1
        elif t_l2 <= t < t_l3:
            cur = 2
        elif t >= t_l3:
            cur = 3
        if cur == 3 and t >= t_l3_end:
            # finished — blink rather than sit solid
            if ((t - t_l3_end) % BLINK_S) > BLINK_ON:
                cur = None
        if cur == 1: l1 += CURSOR
        elif cur == 2: l2 += CURSOR
        elif cur == 3: l3 += CURSOR

        states.append({
            "glow":   glow_css((t / CYCLE_S) % 1.0),
            "l3glow": glow_css((t / CYCLE_S) % 1.0, scale=0.35),
            "name":   round(fade(T_NAME_IN, T_NAME_IN + T_NAME_DUR), 4),
            "copy":   round(1 - fade(t_out, t_out + T_FADE), 4),
            "l1": l1, "l2": l2, "l3": l3,
            "wm":     round(fade(t_wm, t_wm + T_FADE), 4),
            "nametext": NAME_TEXT,
        })
    return states, keys, reply, t_l3, dur


def still_states(n, name=1.0, copy=0.0, wm=0.0, l3=""):
    """A held frame with the glow still breathing. Used for tail and loop."""
    return [{
        "glow": glow_css((i / FPS / CYCLE_S) % 1.0),
        "l3glow": glow_css((i / FPS / CYCLE_S) % 1.0, scale=0.35),
        "name": name, "copy": copy, "l1": "", "l2": "", "l3": l3, "wm": wm,
        "nametext": NAME_TEXT,
    } for i in range(n)]


def shoot(page, states, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    for i, s in enumerate(states):
        page.evaluate(SET_STATE, s)
        page.screenshot(path=str(outdir / f"{i+1:05d}.png"))
        if (i + 1) % 30 == 0:
            print(f"    {i+1}/{len(states)}")
    return len(states)


def audio(path, dur, keys=(), reply=(), verdict=None):
    here = Path(__file__).resolve().parent
    for p in (here, here / "scripts", Path.cwd()):
        sys.path.insert(0, str(p))
    try:
        import booth_reel_audio
    except ImportError:
        print("  ! booth_reel_audio.py not found — silent")
        return False
    # verdict past the end means the thud never fits and is skipped,
    # which is how the tail and loop end up as pure room tone.
    booth_reel_audio.build_audio(str(path), dur, list(keys), list(reply),
                                 verdict if verdict is not None else dur + 10)
    return True


def add_neon_hum(wav_path, duration, gate=None):
    """
    Mixes the pulsing neon hum into an existing wav.

    Written here rather than in booth_reel_audio.py — that module is the
    locked church-wood standard and stays untouched.
    """
    import numpy as np, wave as W
    from scipy import signal
    SR = 48000
    with W.open(str(wav_path)) as f:
        a = np.frombuffer(f.readframes(f.getnframes()),
                          dtype=np.int16).astype(np.float64) / 32768.0
    a = a.reshape(-1, 2)
    n = len(a)
    t = np.arange(n) / SR

    # same curve that drives the glow, curved so it reads as a pulse
    e = (1 - np.cos(2 * np.pi * t / CYCLE_S)) / 2.0
    env = NEON_FLOOR + (1 - NEON_FLOOR) * (e ** NEON_SHAPE)
    env *= np.clip(t / NEON_IN, 0, 1)
    env *= np.clip((duration - t) / 0.5, 0, 1)

    # The hum belongs to the mark on its own. While words are being typed
    # it steps back — it shares 200-600Hz with the click bodies, so it
    # would blunt them — then returns for the sign-off.
    if gate:
        gt = np.array([g[0] for g in gate])
        gv = np.array([g[1] for g in gate])
        env *= np.interp(t, gt, gv)

    # mains drifts; a perfectly stable hum sounds synthetic
    wob = (1 + 0.0016 * np.sin(2 * np.pi * 0.31 * t)
             + 0.0011 * np.sin(2 * np.pi * 0.17 * t))
    ph = 2 * np.pi * np.cumsum(NEON_HZ * wob) / SR
    tone = np.zeros(n)
    for k, g in NEON_PARTIALS:
        tone += g * np.sin(k * ph)

    def lp(x, f):
        return signal.sosfilt(signal.butter(3, f, "lp", fs=SR, output="sos"), x)

    # crossfade dark to bright with the swell
    lit = (1 - np.cos(2 * np.pi * t / CYCLE_S)) / 2.0
    tone = lp(tone, NEON_LP_DARK) * (1 - lit) + lp(tone, NEON_LP_LIT) * lit
    hum = tone / np.abs(tone).max() * env * NEON_GAIN

    mix = a + hum[:, None]
    peak = np.abs(mix).max()
    if peak > 0.97:
        mix = np.tanh(mix / peak * 1.2) * 0.97 / np.tanh(1.2)
    with W.open(str(wav_path), "w") as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((mix.reshape(-1) * 32767).astype(np.int16).tobytes())


def encode(seq, wav, out, fps=None):
    fps = fps or FPS
    cmd = ["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
           "-i", str(seq / "%05d.png")]
    if wav:
        cmd += ["-i", str(wav)]
    cmd += ["-c:v", "libx264", "-profile:v", "high", "-crf", "14",
            "-pix_fmt", "yuv420p", "-colorspace", "bt709",
            "-color_primaries", "bt709", "-color_trc", "bt709",
            "-movflags", "+faststart"]
    cmd += (["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
            if wav else ["-an"])
    cmd += ["-shortest", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2000:]); sys.exit("ffmpeg failed")


def main():
    global FPS
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8080")
    ap.add_argument("--out", default="outputs")
    ap.add_argument("--only", choices=["reel", "tail", "loop"])
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()

    FPS = args.fps
    if abs(CYCLE_S * FPS - round(CYCLE_S * FPS)) > 1e-9:
        print(f"  ! {CYCLE_S}s breath at {FPS}fps is "
              f"{CYCLE_S*FPS:.1f} frames, not a whole number.\n"
              f"    The Story loop will not join cleanly. 30fps gives exactly 84.")
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    work = Path(".frames_brand"); shutil.rmtree(work, ignore_errors=True)

    html = PAGE % dict(
        mx=(W - MARK_PX)//2, mt=MARK_TOP, mw=MARK_PX,
        nt=NAME_TOP, ns=NAME_SZ, ntr=NAME_TRACK,
        lt=LINE_TOP, ls=LINE_SZ, lh=LINE_STEP,
        wt=WM_BOTTOM - int(WM_W*335.5/1000), ww=WM_W,
        word=WORDMARK)

    seq_states, keys, reply, verdict_s, dur = timeline()

    jobs = []
    if args.only in (None, "reel"):
        # copy starts at T_L1 and clears over T_FADE after the last hold
        t_out = verdict_s + len(L3) * MS_GREEN / 1000 + T_HOLD
        t_wm = t_out + T_FADE
        k = NEON_SLEW
        neon_gate = [(0, 1.0), (T_L1 - k, 1.0), (T_L1, NEON_DUCK),
                     (t_out, NEON_DUCK), (t_wm, 1.0), (dur, 1.0)]
        jobs.append(("booth_reel", seq_states, dur, keys, reply, verdict_s, neon_gate))
    if args.only in (None, "tail"):
        n = int(round(TAIL_S * FPS))
        jobs.append(("booth_tail", still_states(n, wm=1.0), TAIL_S, (), (), None, None))
    if args.only in (None, "loop"):
        n = int(round(LOOP_S * FPS))
        jobs.append(("booth_loop", still_states(n), LOOP_S, (), (), None, None))

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        page = ctx.new_page()
        page.goto(args.url, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        page.evaluate("() => document.fonts.ready")
        page.evaluate("(h) => { document.body.innerHTML = h; }", html)
        page.wait_for_timeout(400)

        green = page.evaluate(
            "() => getComputedStyle(document.getElementById('l3')).color")
        print(f"  ritual green -> {green}")
        if "0, 255, 30" not in green:
            print("  ! green token did not resolve. Is the dev server up?")
        if not page.evaluate("() => document.fonts.check('700 68px \"Control Upright\"')"):
            print("  ! Control Upright did not load")

        # Tailwind sets svg{display:block}, which silently defeats
        # text-align:center. Assert both centred elements really are.
        for el in ("name", "wm"):
            box = page.evaluate(
                "(id) => { const r = document.getElementById(id)"
                ".getBoundingClientRect(); return [r.left, r.right]; }", el)
            off = (box[0] + box[1]) / 2 - W / 2
            print(f"  #{el} centre offset {off:+.1f}px")
            if abs(off) > 2:
                print(f"  ! #{el} is not centred")

        for name, states, d, k, r, v, gate in jobs:
            print(f"  {name} — {len(states)} frames, {d:.2f}s")
            seq = work / name
            shoot(page, states, seq)
            wav = work / f"{name}.wav"
            has = audio(wav, d, k, r, v)
            if has and NEON_GAIN > 0:
                add_neon_hum(wav, d, gate)
            encode(seq, wav if has else None, out / f"{name}.mp4")
            print(f"    -> {out / (name + '.mp4')}")
        b.close()

    if not args.keep:
        shutil.rmtree(work, ignore_errors=True)
    print()


if __name__ == "__main__":
    main()
