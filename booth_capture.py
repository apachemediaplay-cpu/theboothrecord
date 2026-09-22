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

    # stamped with a venue instead of the instagram register
    python booth_capture.py --slug tiles ... --venue gigiprahran

--venue <slug>
    Captures as that venue, as if from its printed card:
      ?source=<slug>&venue=<name> on the gate URL, so the gate shows
      "AT <NAME>" (BoothHeader);
      stampVenue 'true' AND venueName on the verdict page. venueName is
      what isPhysicalScan() reads, and the share card only prints the
      venue for a physical scan. It has to be set in the verdict page's
      init script, not just carried from the gate URL: the verdict page is
      a new tab, and sessionStorage does not cross tabs;
      then, after verdict_hold, it taps POST TO STORY -> skip and saves the
      real share card as share_card.png, a 2s hold section (share_card)
      that the cut specs place before the tail card.
    The slug must be in src/data/venues.json. The app resolves names from
    that file only (the DB fallback is blocked here, see below), and an
    unknown slug fails closed to no name at all, so this refuses it rather
    than capturing a silently unstamped reel. The capture also fails if
    the card's canvas didn't draw "AT <NAME>".
    No flag = the instagram register with the stamp off, byte-identical to
    before: no ?venue=, no tap, no share_card section.

THE SHARE CARD IS A DOWNLOAD, NOT A SCREENSHOT.
    On the skip path the app never shows the card. It renders the PNG and
    hands it to navigator.share, or downloads it where files can't be
    shared. canShare is forced false so it always downloads, and the
    download IS the card: 1080x1920, the exact bytes a confessor posts.

NOTHING REACHES THE DATABASE.
Supabase REST calls are answered with an empty array; the verdict edge
function is left to hang. That hang is what lets the three receiving
beats play out on their real timers — exactly what the app does on a
slow network.

The POST TO STORY tap adds no new endpoint. resolve_share_id,
get_share_verdict, log_share and log_booth_event are all supabase-js RPCs
under /rest/v1/rpc/, so the same block answers them (resolve_share_id gets
[] -> no uuid -> the card's link falls back to the homepage, which the PNG
doesn't show). On the --venue path a catch-all route also aborts any
request to a host that isn't the dev server or Google Fonts, and lists
what it stopped, so a new call site can't reach production unnoticed.
"""

import argparse, json, random, shutil, time
from pathlib import Path
from playwright.sync_api import sync_playwright

# ─────────────────────────────────────────────────────────────
# CONFIG — the guessable bits. Fix these first if it breaks.
# ─────────────────────────────────────────────────────────────

BASE_URL = "http://127.0.0.1:8080"
SOURCE   = "instagram"          # default source; --venue <slug> replaces it
VENUES_JSON = Path(__file__).parent / "src" / "data" / "venues.json"

# --venue only. The card holds long enough to read AS CHARGED AT <VENUE>.
SHARE_CARD_MS  = 2000
STORY_TEXT     = "POST TO STORY"
STORY_SKIP     = "skip"
ALLOWED_HOSTS  = {"127.0.0.1", "localhost",
                  "fonts.googleapis.com", "fonts.gstatic.com"}

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
    ap.add_argument("--venue", metavar="SLUG",
                    help="capture as this venue (a slug in src/data/venues.json), stamp on")
    args = ap.parse_args()

    # No --venue → exactly the old behaviour: instagram, stamp off.
    source, stamp, venue_name = SOURCE, "false", None
    if args.venue:
        venues = json.loads(VENUES_JSON.read_text())
        if args.venue not in venues:
            raise SystemExit(
                f"--venue {args.venue!r} is not in {VENUES_JSON.relative_to(Path(__file__).parent)}; "
                f"it would render no venue name.\n  known: {', '.join(sorted(venues))}")
        source, stamp = args.venue, "true"
        venue_name = venues[args.venue]["displayName"]

    root = Path(args.out) / args.slug
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)

    rng = random.Random(hash(args.slug) % 10_000)
    sections = {}

    stopped = []    # --venue only: off-list requests the catch-all aborted

    def guard(route):
        from urllib.parse import urlparse
        if urlparse(route.request.url).hostname in ALLOWED_HOSTS:
            route.fallback()
        else:
            stopped.append(route.request.url)
            route.abort()

    def block(page):
        # --venue: catch-all FIRST. Playwright runs matching routes newest
        # first, so the two specific blocks below still answer Supabase and
        # this only sees what they don't.
        if args.venue:
            page.route("**/*", guard)
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
        url = f"{BASE_URL}/confess?source={source}"
        if venue_name:
            from urllib.parse import quote
            url += f"&venue={quote(venue_name)}"
        page.goto(url, wait_until="domcontentloaded")
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
            f"sessionStorage.setItem('verdictSource','{source}');"
            f"sessionStorage.setItem('stampVenue','{stamp}');"
        )
        if venue_name:
            init += (
                f"sessionStorage.setItem('venueName',{json.dumps(venue_name)});"
                # Always the download path — see the docstring.
                "Object.defineProperty(navigator,'canShare',"
                "{value:()=>false,configurable:true});"
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

        # ── SHARE CARD (--venue only) ──────────────────────────
        if venue_name:
            print("share card...")
            # Record every string drawn on a canvas, so the stamp can be
            # checked in the text itself rather than trusted from the pixels.
            page.evaluate("""() => {
                window.__drawn = [];
                const f = CanvasRenderingContext2D.prototype.fillText;
                CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
                    window.__drawn.push(String(t)); return f.call(this, t, ...a);
                };
            }""")
            story = page.locator(f"button:has-text('{STORY_TEXT}'):visible").first
            if story.count() == 0:
                raise SystemExit(f"no '{STORY_TEXT}' button on /verdict. "
                                 "Update STORY_TEXT at the top of this file.")
            story.click()
            skip = page.get_by_role("button", name=STORY_SKIP, exact=True)
            skip.wait_for(state="visible", timeout=5000)
            with page.expect_download(timeout=15000) as dl:
                skip.click()
            card = root / "share_card.png"
            dl.value.save_as(str(card))

            drawn = page.evaluate("() => window.__drawn")
            # The stamp line carries the FULL name (only the photo card's
            # bottom bar cuts at the comma) — see chargeLine2 in shareCard.ts.
            want = f"AT {venue_name.upper()}"
            if want not in drawn:
                raise SystemExit(
                    f"share card did not draw '{want}'.\n  drew: {drawn}")
            if any("WITHHELD" in t for t in drawn):
                raise SystemExit(f"share card drew LOCATION WITHHELD.\n  drew: {drawn}")
            print(f"  card drew {want!r}")

            sections["share_card"] = {
                "kind": "hold", "frames": rel([card], root),
                "real_ms": SHARE_CARD_MS,
            }

        browser.close()

    if stopped:
        print("\n  ! aborted off-list requests (nothing reached them):")
        for u in stopped:
            print(f"    {u}")

    manifest = {
        "slug": args.slug, "confession": args.confession,
        "verdict": args.verdict, "subject_number": args.subject,
        "source": source, "fps": FPS, "viewport": VIEWPORT, "dsf": DSF,
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
