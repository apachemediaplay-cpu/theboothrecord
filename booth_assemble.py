#!/usr/bin/env python3
"""
THE BOOTH — STAGE 2: ASSEMBLE

Builds one version of the reel from an existing capture.
Never touches the browser. Never re-captures.

USAGE
    python booth_assemble.py captures/tiles versions/reach.json
    python booth_assemble.py captures/tiles versions/anchor.json

    # one-off tweaks, no new config file
    python booth_assemble.py captures/tiles versions/reach.json \
        --override verdict_hold=4500 --override confess_type=0.6
    python booth_assemble.py captures/tiles versions/anchor.json \
        --drop gate_logo

WHY THE AUDIO IS REBUILT EVERY TIME
    The church-wood mix is generated against this version's keystroke
    times and this version's verdict-land moment. You cannot trim a
    finished mp4 — the clicks end up in the wrong places.

REQUIRES
    ffmpeg, and booth_reel_audio.py in this folder or in scripts/.
"""

import argparse, json, shutil, subprocess, sys
from pathlib import Path

# The neon hum belongs wherever the Booth mark is on screen. In a
# confession reel that is the tail card only — the confess, receiving
# and verdict screens don't show it. Values match make_booth_reel.py.
NEON_HZ    = 50.0
NEON_GAIN  = 1.00
NEON_FLOOR = 0.08
NEON_SHAPE = 1.55
NEON_CYCLE = 2.8
NEON_PHASE = 0.22      # a 1.6s tail can't hold a full 2.8s breath, so
                       # start part-way up and let it swell through
NEON_IN    = 0.35
NEON_LP_DARK, NEON_LP_LIT = 320, 900
NEON_PARTIALS = [(1,1.00),(2,0.78),(3,0.62),(4,0.66),(5,0.40),
                 (6,0.48),(7,0.16),(8,0.30),(9,0.08),(10,0.14)]

ENCODE = [
    "-c:v", "libx264", "-profile:v", "high", "-crf", "14",
    "-pix_fmt", "yuv420p", "-maxrate", "14M", "-bufsize", "28M",
    "-movflags", "+faststart",
]
AUDIO_ENCODE = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

# ─────────────────────────────────────────────────────────────


def parse_overrides(pairs, sections):
    """
    --override strings into {section_id: value}.

    The unit is inferred from the section kind, so there's nothing to
    remember:
        hold section  ->  milliseconds
        type section  ->  speed multiplier (lower is faster)
    """
    out = {}
    for pair in pairs or []:
        if "=" not in pair:
            sys.exit(f"bad override '{pair}' — use section=number")
        sid, raw = pair.split("=", 1)
        sid = sid.strip()
        if sid not in sections:
            sys.exit(f"override '{sid}' is not a section.\n"
                     f"available: {', '.join(sections)}")
        try:
            out[sid] = float(raw)
        except ValueError:
            sys.exit(f"override '{pair}' — '{raw}' is not a number")
    return out


def build_timeline(manifest, version, overrides=None, drops=None):
    """
    Expand the version's section list into a flat timeline.

    Returns timeline, keystroke_ms, reply_ms, verdict_land_ms, duration_ms.
    """
    root = Path(manifest["_root"])
    sections = manifest["sections"]
    overrides, drops = overrides or {}, set(drops or [])

    timeline, keystrokes, replies = [], [], []
    verdict_land_ms = None
    t = 0.0

    for step in version["sections"]:
        sid = step["id"]
        if sid in drops:
            continue
        if sid not in sections:
            sys.exit(f"section '{sid}' is not in this capture.\n"
                     f"available: {', '.join(sections)}")

        sec = sections[sid]
        frames = [root / f for f in sec["frames"]]
        if not frames:
            continue

        if sid == "verdict_land" and verdict_land_ms is None:
            verdict_land_ms = t

        if sec["kind"] == "hold":
            ms = float(overrides.get(sid, step.get("ms", sec.get("real_ms", 1000))))
            timeline.append((frames[-1], t, t + ms))
            t += ms

        elif sec["kind"] == "type":
            # Per-key durations captured from the real typing, scaled.
            # speed 0.80 is the locked cadence for the confession.
            speed = float(overrides.get(sid, step.get("speed", 1.0)))
            durs = sec.get("durations_ms") or [55.0] * len(frames)
            click = sec.get("click", False)
            for f, d in zip(frames, durs):
                if click is True:
                    keystrokes.append(t)
                elif click == "reply":
                    replies.append(t)
                dd = float(d) * speed
                timeline.append((f, t, t + dd))
                t += dd
        else:
            sys.exit(f"unknown section kind: {sec['kind']}")

    return timeline, keystrokes, replies, verdict_land_ms, t


def render_frames(timeline, duration_ms, fps, workdir, tail=None, tail_ms=1600):
    """
    Sample the timeline at the target frame rate.

    Sampling from a time-based timeline rather than counting frames per
    section avoids drift — a 50ms state at 30fps is 1.5 frames, and
    rounding each section independently accumulates error.
    """
    workdir.mkdir(parents=True, exist_ok=True)
    step_ms = 1000.0 / fps
    total_ms = duration_ms + (tail_ms if tail else 0)
    n = int(round(total_ms / step_ms))

    cursor = 0
    for i in range(n):
        t = i * step_ms
        if t >= duration_ms and tail:
            src = Path(tail)
        else:
            while cursor < len(timeline) - 1 and t >= timeline[cursor][2]:
                cursor += 1
            src = timeline[cursor][0]
        dst = workdir / f"{i + 1:06d}.png"
        try:
            dst.symlink_to(Path(src).resolve())
        except (OSError, NotImplementedError):
            shutil.copy(src, dst)
    return n, total_ms


def make_audio(out_wav, duration_s, keystrokes_s, replies_s, land_s):
    """
    Calls the locked church-wood module.

    IMPORTANT: booth_reel_audio expects reply_clicks as offsets FROM
    verdict_at, not absolute times. It adds verdict_at itself:
        click(verdict_at + t, ...)
    """
    here = Path(__file__).resolve().parent
    for p in (here, here / "scripts", Path.cwd()):
        sys.path.insert(0, str(p))
    try:
        import booth_reel_audio
    except ImportError:
        print("  ! booth_reel_audio.py not found — building silent video")
        return False

    if land_s is None:
        land_s = 0.0
        replies_s = []

    booth_reel_audio.build_audio(
        str(out_wav), duration_s,
        keystrokes_s,
        [r - land_s for r in replies_s],     # relative to verdict_at
        land_s,
    )
    return True


def add_tail_neon(wav_path, duration_s, tail_start_s):
    """Pulsing neon hum over the tail card, where the mark appears."""
    import numpy as np, wave as W
    from scipy import signal
    SR = 48000
    with W.open(str(wav_path)) as f:
        a = np.frombuffer(f.readframes(f.getnframes()),
                          dtype=np.int16).astype(np.float64) / 32768.0
    a = a.reshape(-1, 2)
    n = len(a)
    t = np.arange(n) / SR

    rel = t - tail_start_s
    e = (1 - np.cos(2*np.pi*(rel/NEON_CYCLE + NEON_PHASE))) / 2.0
    env = NEON_FLOOR + (1 - NEON_FLOOR) * (e ** NEON_SHAPE)
    env *= np.clip(rel / NEON_IN, 0, 1)                  # in with the card
    env *= np.clip((duration_s - t) / 0.3, 0, 1)         # out at the end

    wob = (1 + 0.0016*np.sin(2*np.pi*0.31*t) + 0.0011*np.sin(2*np.pi*0.17*t))
    ph = 2*np.pi*np.cumsum(NEON_HZ*wob)/SR
    tone = np.zeros(n)
    for k, g in NEON_PARTIALS:
        tone += g*np.sin(k*ph)
    lp = lambda x, f: signal.sosfilt(
        signal.butter(3, f, "lp", fs=SR, output="sos"), x)
    lit = np.clip(e, 0, 1)
    tone = lp(tone, NEON_LP_DARK)*(1-lit) + lp(tone, NEON_LP_LIT)*lit
    hum = tone/np.abs(tone).max() * env * NEON_GAIN

    mix = a + hum[:, None]
    peak = np.abs(mix).max()
    if peak > 0.97:
        mix = np.tanh(mix/peak*1.2) * 0.97/np.tanh(1.2)
    with W.open(str(wav_path), "w") as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((mix.reshape(-1)*32767).astype(np.int16).tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("capture", help="e.g. captures/tiles")
    ap.add_argument("version", help="e.g. versions/reach.json")
    ap.add_argument("--out", default=None)
    ap.add_argument("--tail", default=None, help="tail card PNG, 1080x1920")
    ap.add_argument("--tail-ms", type=int, default=1600)
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--override", action="append", metavar="SECTION=N",
                    help="one-off change. hold=ms, type=speed. repeatable.")
    ap.add_argument("--drop", action="append", metavar="SECTION",
                    help="leave a section out of this build. repeatable.")
    args = ap.parse_args()

    cap_dir = Path(args.capture)
    manifest = json.loads((cap_dir / "manifest.json").read_text())
    manifest["_root"] = str(cap_dir)
    version = json.loads(Path(args.version).read_text())

    overrides = parse_overrides(args.override, manifest["sections"])
    drops = args.drop or []
    one_off = bool(overrides or drops)

    fps = manifest["fps"]
    out = Path(args.out) if args.out else Path(
        f"outputs/{manifest['slug']}_{version['name']}"
        f"{'_oneoff' if one_off else ''}.mp4")
    out.parent.mkdir(parents=True, exist_ok=True)

    timeline, ks, replies, land_ms, dur_ms = build_timeline(
        manifest, version, overrides, drops)

    print(f"\n{manifest['slug']} / {version['name']}"
          + ("  [ONE-OFF]" if one_off else ""))
    for sid, val in overrides.items():
        unit = "ms" if manifest["sections"][sid]["kind"] == "hold" else "x speed"
        print(f"  override     {sid} = {val:g} {unit}")
    for sid in drops:
        print(f"  dropped      {sid}")
    print(f"  states       {len(timeline)}")
    print(f"  keystrokes   {len(ks)}")
    print("  verdict at   " + (f"{land_ms/1000:.2f}s" if land_ms is not None
                               else "(no verdict_land section)"))

    work = Path(f".frames_{manifest['slug']}_{version['name']}")
    shutil.rmtree(work, ignore_errors=True)
    n_frames, total_ms = render_frames(
        timeline, dur_ms, fps, work, tail=args.tail, tail_ms=args.tail_ms)
    print(f"  duration     {total_ms/1000:.2f}s  ({n_frames} frames @ {fps}fps)")

    wav = work.parent / f".{manifest['slug']}_{version['name']}.wav"
    have_audio = make_audio(
        wav, total_ms / 1000.0,
        [x / 1000.0 for x in ks],
        [x / 1000.0 for x in replies],
        land_ms / 1000.0 if land_ms is not None else None)
    if have_audio and args.tail and NEON_GAIN > 0:
        add_tail_neon(wav, total_ms/1000.0, dur_ms/1000.0)
        print(f"  neon hum     over the tail card from {dur_ms/1000:.2f}s")

    cmd = ["ffmpeg", "-v", "error", "-y",
           "-framerate", str(fps), "-i", str(work / "%06d.png")]
    if have_audio:
        cmd += ["-i", str(wav)]
    cmd += ENCODE + (AUDIO_ENCODE if have_audio else ["-an"])
    cmd += ["-shortest", str(out)]

    print("  encoding...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2500:])
        sys.exit("ffmpeg failed")

    if not args.keep:
        shutil.rmtree(work, ignore_errors=True)
        wav.unlink(missing_ok=True)

    print(f"  -> {out}  ({out.stat().st_size/1_000_000:.1f} MB)\n")

    if version.get("target_max_s") and total_ms / 1000 > version["target_max_s"]:
        print(f"  ! {total_ms/1000:.1f}s is over this version's "
              f"{version['target_max_s']}s target")
    if version.get("target_land_s") and land_ms is not None:
        if abs(land_ms / 1000 - version["target_land_s"]) > 1.0:
            print(f"  ! verdict lands at {land_ms/1000:.1f}s, "
                  f"target is {version['target_land_s']}s")


if __name__ == "__main__":
    main()
