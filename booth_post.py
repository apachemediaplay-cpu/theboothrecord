#!/usr/bin/env python3
"""
THE BOOTH — one confession in, one finished post out.

Runs capture, assemble, cover renders and writes the caption and first
comment into a single folder you can post from.

USAGE
    # terminal 1
    booth
    npx vite --port 8080 --host 127.0.0.1

    # terminal 2
    booth
    python booth_post.py \
      --confession "i get dressed for the train to work" \
      --verdict "Put on a whole outfit for the train and let work come along for the ride." \
      --type vote \
      --needle "who on that train were you dressing for?"

Writes posts/<slug>/ containing:
    reel.mp4          the finished reel
    cover_01..NN.png  ranked cover options, full size
    CHOOSE.png        contact sheet at grid size — pick a number
    post.md           caption, first comment, story instructions, checklist

WHAT THIS DOES NOT DO
    The verdict must come from the live Booth. Never write one yourself
    and never let a model write one — simulated verdicts outperform the
    real engine and give false signals about what works.

    The needle is a judgement call and stays yours. Omit it and post.md
    carries a TODO instead of a bad guess.
"""

import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent
POSTS = REPO / "posts"
COUNTER = REPO / ".subject_counter"

# ── cover geometry, locked ───────────────────────────────────
W, H = 1080, 1920
MARGIN, TEXT_TOP = 90, 460
MARK_H, MARK_BOTTOM = 78, 1619
TEXT_CEIL = MARK_BOTTOM - MARK_H - 80
LABEL_SZ, MAX_CONF, MIN_CONF = 58, 132, 104

# Words that promise something after them — cutting here leaves a gap.
STRONG = {"than","because","until","but","so","unless","though","while",
          "before","after","since","whether","instead","when","like"}
BAD = {"the","a","an","my","your","his","her","their","our","its","i","he",
       "she","they","we","it","is","was","were","are","be","been","of","in",
       "on","at","by","as","to","for","and","with"}

COVER_HTML = """
<div style="position:fixed;inset:0;background:hsl(var(--background));">
  <div id="blk" style="position:absolute;left:%(m)dpx;right:%(m)dpx;top:600px;">
    <h1 class="font-control font-bold text-foreground"
        style="font-size:%(lab)dpx;line-height:1;letter-spacing:-0.01em;margin:0 0 40px 0;">%(label)s</h1>
    <p class="text-ritual font-mono-light"
       style="font-size:%(conf)dpx;line-height:1.25;letter-spacing:-0.015em;margin:0;">%(text)s<span>|</span></p>
  </div>
  <img id="mark" src="/covermark/wordmark-reverse.svg"
       onerror="this.src='/src/assets/Guilty_Wordmark_RGB_Orange.svg';this.style.filter='grayscale(1) brightness(3)';"
       style="position:absolute;left:50%%;transform:translateX(-50%%);
              top:%(mt)dpx;height:%(mh)dpx;width:auto;opacity:0.9;" />
</div>
"""


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "", text.lower())[:14] or "confession"


def next_subject():
    n = int(COUNTER.read_text().strip()) if COUNTER.exists() else 900
    COUNTER.write_text(str(n + 1))
    return n


def cut_options(text, limit=3):
    """
    Rank places to stop so the reader is left with a question.

    Only proposes cuts that land after a forward-leaning word with real
    content still to come. A confession whose loaded word is the last
    word gets no cuts — trimming it would delete the hook, not delay it.
    """
    words = text.split()
    out = []
    for n in range(3, len(words)):
        last = re.sub(r"[^a-z']", "", words[n - 1].lower())
        s = 10 if last in STRONG else (-8 if last in BAD else 2)
        frac = n / len(words)
        s += 3 if 0.55 <= frac <= 0.85 else (-4 if frac < 0.4 else 0)
        if words[n - 1].endswith(","):
            s -= 3
        if s > 0:
            out.append((s, " ".join(words[:n])))
    out.sort(key=lambda x: -x[0])
    seen, res = set(), []
    for _, cut in out:
        if cut not in seen:
            seen.add(cut); res.append(cut)
        if len(res) >= limit:
            break
    return res


def render_covers(texts, outdir, label, port):
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageDraw, ImageFont
    paths = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        pg = b.new_context(viewport={"width": W, "height": H},
                           device_scale_factor=1).new_page()
        pg.goto(f"http://127.0.0.1:{port}/", wait_until="domcontentloaded")
        pg.wait_for_timeout(2500)
        pg.evaluate("() => document.fonts.ready")
        _chk = "() => document.fonts.check('700 58px ' + String.fromCharCode(34) + 'Control Upright' + String.fromCharCode(34))"
        if not pg.evaluate(_chk):
            print("  ! Control Upright did not load — is the dev server up?")

        for i, txt in enumerate(texts, 1):
            size = MAX_CONF
            while True:
                pg.evaluate("(h)=>{document.body.innerHTML=h;}", COVER_HTML % dict(
                    m=MARGIN, lab=LABEL_SZ, label=label, conf=size, text=txt,
                    mt=MARK_BOTTOM - MARK_H, mh=MARK_H))
                pg.wait_for_timeout(90)
                h = pg.evaluate("()=>document.querySelector('#blk').getBoundingClientRect().height")
                if h <= TEXT_CEIL - TEXT_TOP or size <= MIN_CONF:
                    break
                size -= 4
            pg.evaluate("""(a)=>{const b=document.querySelector('#blk');
                const h=b.getBoundingClientRect().height;
                b.style.top=Math.round(a[0]+(a[1]-a[0]-h)/2)+'px';}""",
                [TEXT_TOP, TEXT_CEIL])
            pg.wait_for_timeout(110)
            p = outdir / f"cover_{i:02d}.png"
            pg.screenshot(path=str(p))
            paths.append((p, size, txt))
            print(f"  cover {i}  {size}px  {txt}")
        b.close()

    # contact sheet at the size the grid actually shows
    T, PAD, HDR = 210, 12, 30
    TH = int(T * 1.25)
    cols = min(4, len(paths))
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols*(T+PAD)+PAD, rows*(TH+HDR+PAD)+PAD), (18,18,18))
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype(str(REPO / "So_hneMono-Kra_ftig.otf"), 16)
    except Exception:
        f = ImageFont.load_default()
    for i, (p, sz, _) in enumerate(paths):
        x = PAD + (i % cols)*(T+PAD); y = PAD + (i//cols)*(TH+HDR+PAD)
        sheet.paste(Image.open(p).crop((0,285,1080,1635)).resize((T,TH)), (x,y))
        d.text((x, y+TH+6), f"{i+1}", font=f, fill=(230,230,230))
    sheet.save(outdir / "CHOOSE.png")
    return paths


def post_md(slug, confession, verdict, subject, kind, needle, covers, built):
    if kind:
        ask_block = ("```\nthe booth lays the charge.\n\n"
                     + ("guilty or not guilty?" if kind == "vote"
                        else "send this to the one it's about.") + "\n```")
    else:
        ask_block = ("Pick one. **Send** only if the confession names a second person\n"
                     "the viewer could picture — otherwise **vote**.\n\n"
                     "```\nthe booth lays the charge.\n\nguilty or not guilty?\n```\n\n"
                     "```\nthe booth lays the charge.\n\nsend this to the one it's about.\n```")
    needle_txt = needle or "TODO"
    opts = "\n".join(f"{i+1}. {t}" for i, (_, _, t) in enumerate(covers))
    built_list = ", ".join(f"`reel_{b}.mp4`" for b in built)
    return f"""# {slug} · subject #{subject}

**Confession** — {confession}
**Verdict** — {verdict}

---

## Caption

{ask_block}

## First comment — from @houseofguilty, within a minute

```
{needle_txt}

—

think you're innocent? comment "confess" and the booth will decide.
```

The needle is a **question**. It assumes the crime and asks only the
missing detail. It keeps the confession's most specific noun. It points
at the behaviour or the instrument, never the person's body. The brand
never votes guilty itself.

## Which file

**`reel_reach.mp4` is the one you post.** That is the frozen standard —
don't swap between versions post to post, or the numbers you record stop
comparing to anything.

`reel_anchor.mp4` is the long cut: the full process including the gate,
with the deliberation typed out rather than settled. Its job is
explaining what The Booth is to someone already on the profile. Pin it,
don't feed it.

Built: {built_list}

## Cover

Open `CHOOSE.png`, pick a number, AirDrop that `cover_NN.png` to your phone.
On the cover screen use **add from camera roll** — never scrub the video.

{opts}

Cut after the loaded word. If the loaded word is the last word, take the
full version — trimming there deletes the hook instead of delaying it.

## Story — two hours after posting

Share arrow → **Add to story**. Never re-upload the mp4.
One sticker: {"a poll, `guilty or not guilty?`, answers changed to `guilty` and `not guilty`." if kind == "vote" else "a poll, `guilty or not guilty?`, answers changed to `guilty` and `not guilty`."}

## Checklist

- [ ] posted, cover from camera roll
- [ ] first comment within a minute
- [ ] story reshared at +2h
- [ ] **non-follower views written down at +48h** → ______
- [ ] removed from profile grid at +72h (Manage → remove from profile grid)
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--confession", required=True)
    ap.add_argument("--verdict", required=True, help="from the LIVE Booth only")
    ap.add_argument("--slug")
    ap.add_argument("--subject", type=int)
    ap.add_argument("--type", choices=["vote", "send"])
    ap.add_argument("--needle")
    ap.add_argument("--cut", help="exact cover text, skips the proposals")
    ap.add_argument("--port", default="8080")
    ap.add_argument("--tail", default="tail_card.png")
    ap.add_argument("--versions", nargs="+",
                    default=["versions/reach.json", "versions/anchor.json"],
                    help="capture once, assemble each of these")
    ap.add_argument("--label", default="No one is innocent.")
    args = ap.parse_args()

    slug = args.slug or slugify(args.confession)
    subject = args.subject or next_subject()
    out = POSTS / slug
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)

    print(f"\n{slug} · subject #{subject}\n")

    print("capturing...")
    subprocess.run([sys.executable, "booth_capture.py", "--slug", slug,
                    "--confession", args.confession, "--verdict", args.verdict,
                    "--subject", str(subject)], cwd=REPO, check=True)

    built = []
    for vpath in args.versions:
        name = Path(vpath).stem
        print(f"\nassembling {name}...")
        subprocess.run([sys.executable, "booth_assemble.py", f"captures/{slug}",
                        vpath, "--tail", args.tail,
                        "--out", str(out / f"reel_{name}.mp4")],
                       cwd=REPO, check=True)
        built.append(name)

    print("\ncovers...")
    texts = [args.cut] if args.cut else [args.confession] + cut_options(args.confession)
    covers = render_covers(texts, out, args.label, args.port)

    (out / "post.md").write_text(
        post_md(slug, args.confession, args.verdict, subject, args.type,
                args.needle, covers, built))

    print(f"\n-> {out}")
    if not args.needle:
        print("   needle: yours to write, post.md has the rules")
    subprocess.run(["open", str(out)])


if __name__ == "__main__":
    main()
