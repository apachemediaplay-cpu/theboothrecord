#!/usr/bin/env python3
"""
THE BOOTH — STAGE 1: CAPTURE

Runs the real Booth app once and screenshots every visual state.
Writes PNG frames + manifest.json. Builds no video.

Run ONCE per confession. Every version of the reel is then built from
these frames by booth_assemble.py, which never re-captures.

USAGE
    # terminal 1
    cd ~/Desktop/new\\ confessional/guiltyconfess
    npx vite --port 8080 --host 127.0.0.1

    # terminal 2
    source .venv/bin/activate
    python booth_capture.py \
        --slug tiles \
        --confession "i know how many tiles are on my bedroom ceiling" \
        --verdict "Charged with turning your ceiling tiles into a to-do list." \
        --subject 887

NOTHING REACHES THE DATABASE.
Supabase REST calls are answered with an empty array; the verdict edge
function is left to hang. That hang is what lets the three receiving
beats play out on their real timers — exactly what the app does on a
slow network.
"""

import argparse, json, random, shutil, time
from pathlib import Path
from playwright.sync_api import sync_playwright

# ─────────────────────────────────────────────────────────────
# CONFIG — the guessable bits. Fix these first if it breaks.
# ─────────────────────────────────────────────────────────────

BASE_URL = "http://127.0.0.1:8080"
SOURCE   = "instagram"          # drives headline + placeholder register

VIEWPORT = {"width": 432, "height": 768}    # x DSF 2.5 = 1080 x 1920
DSF      = 2.5

# ── The merged gate (2 Aug 2026) ──────────────────────────────
# /confidentiality is gone — it now redirects to /. There is no
# checkbox: consent is the BEGIN tap itself.
GATE_BEGIN_TEXT = "BEGIN"

# Splash holds 2200ms, fades 500ms, content appears at 2700ms.
SPLASH_MS = 2700

# Then two lines type themselves:
#   "Confessions. Anonymous. Unfiltered. Judged."   43 chars @ 50ms
#   400ms pause
#   "One verdict. No appeal."                       23 chars @ 60ms
# ≈ 3.9s of typing. Sampled, not timed — duplicate frames extend the
# previous state's duration, so the 400ms pause survives intact.
GATE_SAMPLE_MS, GATE_SAMPLE_STEP = 6000, 40

CONFESS_INPUT = "textarea"

# The line the Booth types on the verdict screen. Captured by replaying
# it into the DOM rather than racing the real animation — screenshots
# take 50-150ms each, so sampling a 60ms/char animation drops states.
REPLY_LINE    = "The booth noticed."
REPLY_MS_CHAR = 60

# Receiving beat holds, from the reference doc. The verdict request is
# blocked, so these play in full.
RECEIVING_BEATS_MS = [3400, 4700, 3000]
RECEIVING_STEP = 40      # sample interval while the beats type themselves

# Typing cadence at capture time. Humanised, then re-timed in assembly.
TYPE_MEAN_MS, TYPE_SD_MS, TYPE_MIN_MS = 105, 26, 45

FPS = 30

# ─────────────────────────────────────────────────────────────


class Capture:
    def __init__(self, page, outdir):
        self.page, self.outdir, self.n = page, outdir, 0

    def shot(self, tag):
        self.n += 1
        p = self.outdir / f"{self.n:05d}_{tag}.png"
        self.page.screenshot(path=str(p))
        return p

    def sample(self, tag, total_ms, step_ms):
        """
        Sample a self-animating screen.

        A repeated frame doesn't get stored again — it extends the
        previous state's duration instead. That's what preserves the
        400ms pause between the gate's two lines, which a plain dedupe
        would flatten out.

        Returns (frames, durations_ms).
        """
        frames, durs, seen, t0 = [], [], None, time.time()
        while (time.time() - t0) * 1000 < total_ms:
            p = self.shot(tag)
            b = p.read_bytes()
            if b == seen and durs:
                p.unlink(); self.n -= 1
                durs[-1] += step_ms
            else:
                frames.append(p); durs.append(float(step_ms)); seen = b
            self.page.wait_for_timeout(step_ms)
        return frames, durs
    def keystrokes(self, tag, selector, text, rng):
        """Type one character at a time. Returns frames + per-key durations."""
        el = self.page.locator(selector).first
        el.click()
        self.page.wait_for_timeout(500)
        frames, durs = [], []
        for ch in text:
            self.page.keyboard.type(ch)
            frames.append(self.shot(tag))
            durs.append(max(TYPE_MIN_MS, rng.gauss(TYPE_MEAN_MS, TYPE_SD_MS)))
        got = el.input_value()
        if got != text:
            raise SystemExit(f"typing mismatch.\n  wanted: {text}\n  got:    {got}")
        return frames, durs


def rel(paths, root):
    return [str(p.relative_to(root)) for p in paths]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--confession", required=True)
    ap.add_argument("--verdict", required=True)
    ap.add_argument("--subject", type=int, default=1)
    ap.add_argument("--out", default="captures")
    args = ap.parse_args()

    root = Path(args.out) / args.slug
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)

    rng = random.Random(hash(args.slug) % 10_000)
    sections = {}

    def block(page):
        # Empty array, not an abort — the app handles a null result
        # gracefully but can throw on a dead socket.
        page.route("**/rest/v1/**", lambda r: r.fulfill(
            status=200, content_type="application/json", body="[]",
            headers={"access-control-allow-origin": "*"}))
        # Left hanging on purpose. This is what plays the receiving beats.
        page.route("**/functions/v1/generate-verdict", lambda r: None)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(
            viewport=VIEWPORT, device_scale_factor=DSF,
            is_mobile=True, has_touch=True,
        )
        page = ctx.new_page()
        block(page)
        cap = Capture(page, root)

        # ── GATE (merged, 2 Aug 2026) ──────────────────────────
        # /confess without consent bounces to /. Landing there with
        # ?source= keeps the register attached through the flow.
        print("gate...")
        page.goto(f"{BASE_URL}/confess?source={SOURCE}", wait_until="domcontentloaded")
        page.wait_for_timeout(300)

        sections["gate_splash"] = {
            "kind": "hold", "frames": rel([cap.shot("gate_splash")], root),
            "real_ms": SPLASH_MS,
        }

        # Wait out the splash, then sample the two lines typing.
        page.wait_for_timeout(SPLASH_MS - 200)
        typed, typed_durs = cap.sample("gate_type", GATE_SAMPLE_MS, GATE_SAMPLE_STEP)
        sections["gate_type"] = {
            "kind": "type", "frames": rel(typed, root),
            "durations_ms": typed_durs, "click": False,
        }

        page.wait_for_timeout(600)
        sections["gate_ready"] = {
            "kind": "hold", "frames": rel([cap.shot("gate_ready")], root),
            "real_ms": 1400,
        }

        # No checkbox. Consent IS the BEGIN tap.
        begin = page.locator(f"button:has-text('{GATE_BEGIN_TEXT}')").first
        if begin.count() == 0:
            raise SystemExit(
                f"no '{GATE_BEGIN_TEXT}' button on the gate. "
                "Update GATE_BEGIN_TEXT at the top of this file.")
        begin.click()

        # ── CONFESS ────────────────────────────────────────────
        # BEGIN goes straight here now — /confidentiality is a redirect.
        print("confess...")
        page.wait_for_timeout(1500)
        sections["confess_empty"] = {
            "kind": "hold", "frames": rel([cap.shot("confess_empty")], root),
            "real_ms": 800,
        }
        ks_frames, ks_durs = cap.keystrokes(
            "confess_type", CONFESS_INPUT, args.confession, rng)
        sections["confess_type"] = {
            "kind": "type", "frames": rel(ks_frames, root),
            "durations_ms": ks_durs, "click": True,
        }
        sections["confess_settle"] = {
            "kind": "hold", "frames": rel([cap.shot("confess_settle")], root),
            "real_ms": 550,
        }

        # ── RECEIVING ──────────────────────────────────────────
        # Confession into session, land on /receiving, let the blocked
        # verdict call hang while the three beats run.
        print("receiving...")
        page.evaluate("c => sessionStorage.setItem('confession', c)", args.confession)
        page.goto(f"{BASE_URL}/receiving", wait_until="domcontentloaded")

        # These lines TYPE themselves. A single screenshot per beat lands
        # mid-word and then freezes there. Sample continuously across all
        # three and bucket by elapsed time instead.
        bounds, run = [], 0.0
        for hold in RECEIVING_BEATS_MS:
            run += hold
            bounds.append(run)
        total = bounds[-1]

        buckets = [[] for _ in RECEIVING_BEATS_MS]
        durs    = [[] for _ in RECEIVING_BEATS_MS]
        seen, t0 = None, time.time()
        while True:
            ms = (time.time() - t0) * 1000
            if ms >= total:
                break
            b = next(i for i, edge in enumerate(bounds) if ms < edge)
            p = cap.shot(f"receiving_{b+1}")
            raw = p.read_bytes()
            if raw == seen and durs[b]:
                p.unlink(); cap.n -= 1
                durs[b][-1] += RECEIVING_STEP
            else:
                buckets[b].append(p); durs[b].append(float(RECEIVING_STEP)); seen = raw
            page.wait_for_timeout(RECEIVING_STEP)

        for i, (frames, dd) in enumerate(zip(buckets, durs), start=1):
            if not frames:
                raise SystemExit(f"captured no frames for receiving beat {i}")
            # the typed-out sequence, for versions that want to watch it
            sections[f"receiving_{i}_type"] = {
                "kind": "type", "frames": rel(frames, root),
                "durations_ms": dd, "click": False,
            }
            # the settled line, complete. This is what the reach cut uses —
            # the words are the point, not watching them arrive.
            sections[f"receiving_{i}"] = {
                "kind": "hold", "frames": rel(frames[-1:], root),
                "real_ms": RECEIVING_BEATS_MS[i-1],
            }

        page.close()

        # ── VERDICT ────────────────────────────────────────────
        # Fresh page so the session keys are set before first paint.
        print("verdict...")
        init = (
            "sessionStorage.setItem('consent','1');"
            f"sessionStorage.setItem('confession',{args.confession!r});"
            f"sessionStorage.setItem('verdictResponse',{args.verdict!r});"
            f"sessionStorage.setItem('subjectNumber','{args.subject}');"
            f"sessionStorage.setItem('verdictSource','{SOURCE}');"
            "sessionStorage.setItem('stampVenue','false');"
        )
        ctx.add_init_script(init)
        page = ctx.new_page()
        block(page)
        cap.page = page

        page.goto(f"{BASE_URL}/verdict", wait_until="domcontentloaded")
        page.wait_for_timeout(2500)     # let the real typing finish

        sections["verdict_land"] = {
            "kind": "hold", "frames": rel([cap.shot("verdict_land")], root),
            "real_ms": 400,
        }

        # Replay the reply line into the DOM, one character per frame.
        inject = """(txt) => {
            for (const el of document.querySelectorAll('*')) {
                if (el.children.length === 0) {
                    const t = (el.textContent || '').trim();
                    if (t.length > 0 && '%s'.startsWith(t)) {
                        el.textContent = txt; return true;
                    }
                }
            }
            return false;
        }""" % REPLY_LINE

        if not page.evaluate(inject, REPLY_LINE[:1]):
            raise SystemExit(
                f"could not find the reply line '{REPLY_LINE}' on /verdict.\n"
                "It has been renamed or moved. Update REPLY_LINE at the top "
                "of this file, or drop the verdict_type section."
            )

        rframes = []
        for i in range(1, len(REPLY_LINE) + 1):
            page.evaluate(inject, REPLY_LINE[:i])
            rframes.append(cap.shot("verdict_type"))

        sections["verdict_type"] = {
            "kind": "type", "frames": rel(rframes, root),
            "durations_ms": [REPLY_MS_CHAR] * len(rframes), "click": "reply",
        }
        sections["verdict_hold"] = {
            "kind": "hold", "frames": rel(rframes[-1:], root), "real_ms": 3000,
        }

        browser.close()

    manifest = {
        "slug": args.slug, "confession": args.confession,
        "verdict": args.verdict, "subject_number": args.subject,
        "source": SOURCE, "fps": FPS, "viewport": VIEWPORT, "dsf": DSF,
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "sections": sections,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2))

    total = sum(len(s["frames"]) for s in sections.values())
    print(f"\ncaptured {total} frames -> {root}\n")
    for k, v in sections.items():
        print(f"  {k:16s} {v['kind']:5s} {len(v['frames']):4d}")


if __name__ == "__main__":
    main()
