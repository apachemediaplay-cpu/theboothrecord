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

import argparse, json, math, re, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# ── THE BOOTH MARK, READ FROM THE APP ────────────────────────
# NOT retyped here. It was, and it went stale: this file kept the pre-2026
# mark (240-box, 12.9% stroke, square ends, a base bar, a 7.9% dot) for long
# enough that the reel was shipping a logo the app had stopped drawing. A
# hand-copied path has no way to know it is out of date.
#
# So the geometry is parsed out of src/components/BoothMark.tsx — the single
# definition every screen already renders. Change the mark there and the reel
# follows on its next run. If the parse fails the script STOPS rather than
# falling back to a copy: a wrong mark that renders is worse than no render,
# because nobody checks a logo they have already seen a hundred times.
BOOTH_MARK_TSX = Path(__file__).resolve().parent / "src" / "components" / "BoothMark.tsx"


def booth_mark():
    """(viewBox, aspect, svg_children) lifted from the app's BoothMark."""
    try:
        src = BOOTH_MARK_TSX.read_text()
    except OSError as e:
        sys.exit(f"! cannot read {BOOTH_MARK_TSX}: {e}")

    def grab(pattern, what):
        m = re.search(pattern, src)
        if not m:
            sys.exit(f"! {BOOTH_MARK_TSX.name}: could not find {what}.\n"
                     f"  The mark's markup changed shape — update booth_mark() to match.")
        return m.group(1)

    view_box = grab(r'viewBox="([^"]+)"', "the viewBox")
    d        = grab(r'booth-mark-arch"\s*\n\s*d="([^"]+)"', "the arch path (d=)")
    width    = grab(r'strokeWidth="([^"]+)"', "strokeWidth")
    cap      = grab(r'strokeLinecap="([^"]+)"', "strokeLinecap")
    cx       = grab(r'booth-mark-dot"\s+cx="([^"]+)"', "the dot's cx")
    cy       = grab(r'cx="[^"]+"\s+cy="([^"]+)"', "the dot's cy")
    r        = grab(r'cy="[^"]+"\s+r="([^"]+)"', "the dot's r")

    vb = [float(n) for n in view_box.replace(",", " ").split()]
    aspect = vb[3] / vb[2]      # height per unit width — 117/100 today
    green = "hsl(var(--ritual-green))"
    children = (f'<path d="{d}" fill="none" stroke="{green}" '
                f'stroke-width="{width}" stroke-linecap="{cap}"/>'
                f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{green}"/>')
    return view_box, aspect, children


MARK_VIEWBOX, MARK_ASPECT, MARK_CHILDREN = booth_mark()

# ─────────────────────────────────────────────────────────────
# LOCKED GRID  (1080 x 1920)
# ─────────────────────────────────────────────────────────────
W, H, FPS = 1080, 1920, 30

# MARK_PX is the mark's WIDTH; the height follows the viewBox (117 per 100
# wide), so the box is 400 x 468 rather than the old square 400 x 400.
#
# The ink runs to the very bottom of that box (the arch's round cap ends at
# y=117 of 117) where the old mark stopped at 228 of 240, so the name's gap is
# measured from MARK_INK_BOTTOM below rather than from a typed number.
MARK_PX = 400
MARK_H = round(MARK_PX * MARK_ASPECT)

# THE LOCKUP IS CENTRED, NOT PLACED. It used to be pinned to a hardcoded ink
# bottom of 860, chosen when the GUILTY wordmark sat at 1392 and held the
# bottom of the frame. With the wordmark gone the card is mark + name and
# nothing else, and that pinning left ~700px of dead space beneath them: the
# card read as unfinished rather than composed.
#
# So the block is centred on the 1920 grid and then LIFTED. A block centred
# arithmetically reads low, because the eye puts the centre of a frame above
# its true middle; 4% of the frame is the standard correction and it lands the
# lockup where it looks settled. Everything below follows from MARK_TOP, so
# changing MARK_PX or the name size re-centres the card instead of breaking it.
NAME_SZ = 58                   # caps run wider; 58 keeps it inside the mark
NAME_GAP = 76                  # mark ink bottom → name top
COPY_GAP = 84                  # name bottom → first copy line
LOCKUP_H = MARK_H + NAME_GAP + NAME_SZ
LOCKUP_LIFT = round(H * 0.04)  # optical centre sits above the true middle

MARK_TOP = (H - LOCKUP_H) // 2 - LOCKUP_LIFT
MARK_INK_BOTTOM = MARK_TOP + MARK_H
NAME_TRACK = "0.10em"      # caps want a touch more air than mixed case
NAME_TEXT = "THE BOOTH"
NAME_TOP = MARK_INK_BOTTOM + NAME_GAP
LINE_SZ, LINE_STEP = 44, 74
LINE_TOP = NAME_TOP + NAME_SZ + COPY_GAP

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
# THE END HOLD. Was the wordmark's 0.50 fade-in plus a 1.60 hold beneath it.
# With nothing left to fade in the two fold into ONE hold on mark + name, which
# keeps the file at the same 9.98s — the copy still clears at 7.88 and the card
# is simply held from there instead of being handed to a logo.
T_END_HOLD = 0.50 + 1.60
TAIL_S, LOOP_S = 1.60, CYCLE_S

# ─────────────────────────────────────────────────────────────


PAGE = """
<div id="stage" style="position:fixed;inset:0;background:hsl(var(--background));overflow:hidden;">
  <!-- Geometry from src/components/BoothMark.tsx — see booth_mark(). Nothing
       about the shape is written here. overflow:visible because an <svg> is
       overflow:hidden by UA default, which clips the glow into a hard
       rectangle the shape of the viewBox; the app's component sets the same. -->
  <svg id="mark" viewBox="%(mvb)s" xmlns="http://www.w3.org/2000/svg"
       style="position:absolute;left:%(mx)dpx;top:%(mt)dpx;width:%(mw)dpx;height:%(mh)dpx;overflow:visible;">
    %(mark)s
  </svg>

  <div id="name" class="font-control font-bold text-foreground"
       style="position:absolute;left:0;right:0;top:%(nt)dpx;text-align:center;
              font-size:%(ns)dpx;line-height:1;letter-spacing:%(ntr)s;opacity:0;"></div>

  <div id="copy" style="position:absolute;left:0;right:0;top:%(lt)dpx;text-align:center;opacity:1;">
    <div id="l1" class="font-mono-light text-foreground" style="font-size:%(ls)dpx;height:%(lh)dpx;line-height:%(lh)dpx;white-space:pre;"></div>
    <div id="l2" class="font-mono-light text-foreground" style="font-size:%(ls)dpx;height:%(lh)dpx;line-height:%(lh)dpx;white-space:pre;"></div>
    <div id="l3" class="font-mono-light text-ritual"     style="font-size:%(ls)dpx;height:%(lh)dpx;line-height:%(lh)dpx;white-space:pre;"></div>
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
    # The copy has fully cleared here and the card is mark + name. It used to
    # be the wordmark's cue; it is now just the top of the hold.
    t_settled = t_out + T_FADE
    dur = t_settled + T_END_HOLD

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
            "nametext": NAME_TEXT,
        })
    return states, keys, reply, t_l3, dur


def still_states(n, name=1.0, copy=0.0, l3=""):
    """A held frame with the glow still breathing. Used for tail and loop."""
    return [{
        "glow": glow_css((i / FPS / CYCLE_S) % 1.0),
        "l3glow": glow_css((i / FPS / CYCLE_S) % 1.0, scale=0.35),
        "name": name, "copy": copy, "l1": "", "l2": "", "l3": l3,
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
        mx=(W - MARK_PX)//2, mt=MARK_TOP, mw=MARK_PX, mh=MARK_H,
        mvb=MARK_VIEWBOX, mark=MARK_CHILDREN,
        nt=NAME_TOP, ns=NAME_SZ, ntr=NAME_TRACK,
        lt=LINE_TOP, ls=LINE_SZ, lh=LINE_STEP)

    seq_states, keys, reply, verdict_s, dur = timeline()

    jobs = []
    if args.only in (None, "reel"):
        # copy starts at T_L1 and clears over T_FADE after the last hold
        t_out = verdict_s + len(L3) * MS_GREEN / 1000 + T_HOLD
        # KEYPOINT KEPT, NOT DELETED. The neon ducks under the typing and comes
        # back up when the copy clears; that release used to coincide with the
        # wordmark's fade-in. Dropping the keypoint with the wordmark would
        # leave the hum ducked through the whole hold — the last two seconds
        # would sound like the reel had stalled rather than landed.
        t_settled = t_out + T_FADE
        k = NEON_SLEW
        neon_gate = [(0, 1.0), (T_L1 - k, 1.0), (T_L1, NEON_DUCK),
                     (t_out, NEON_DUCK), (t_settled, 1.0), (dur, 1.0)]
        jobs.append(("booth_reel", seq_states, dur, keys, reply, verdict_s, neon_gate))
    if args.only in (None, "tail"):
        n = int(round(TAIL_S * FPS))
        jobs.append(("booth_tail", still_states(n), TAIL_S, (), (), None, None))
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
        for el in ("name",):
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
