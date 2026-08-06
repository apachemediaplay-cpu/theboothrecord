# Console → reel

Tick confessions in the console, press build, walk away. Folders appear
with the reels, the covers and the notes.

Everything lives in `~/Desktop/new confessional/guiltyconfess`.

---

## Install, once

**1. The scripts**

```bash
cd "$HOME/Desktop/new confessional/guiltyconfess"
cp ~/Downloads/booth_post.py ~/Downloads/booth_watch.py .
cp ~/Downloads/booth_reels.tsx src/components/
```

Check they landed:

```bash
grep -c "^def add_tail_neon" booth_assemble.py   # want 1
grep "^NEON_GAIN" make_booth_reel.py             # want 1.00
grep -c "^MARKER" booth_watch.py                 # want 1
```

**2. The console**

In `Moderate.tsx`:

```tsx
import { ReelAction, ReelBulkAction } from "@/components/booth_reels";
```

Per row, beside the Feature button:

```tsx
<ReelAction row={row} />
```

In the bulk bar, beside Approve all and Reject all:

```tsx
<ReelBulkAction rows={selectedRows} />
```

`selectedRows` is whatever your existing checkbox selection already
gives you. Nothing new to track.

**3. The watcher, on login**

```bash
cp ~/Downloads/com.guilty.boothwatch.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.guilty.boothwatch.plist
launchctl list | grep boothwatch
```

That last line should print a row. From now on the watcher starts with
your Mac.

---

## Using it

Tick confessions on any tab — **approval is not required**. The checkbox
and the Approve button are independent.

Press **Build N reels**. Two minutes each, unattended.

Each confession gets `posts/<slug>/`:

```
reel_reach.mp4     11s — the one you post
reel_anchor.mp4    16s — full process, for pinning
cover_01..NN.png   cover options, full size
CHOOSE.png         the same covers at grid size, numbered
post.md            captions, needle rules, checklist
```

---

## What stays manual, and why

**The verdict** comes from the live Booth, never from a model. A model
writes better-sounding verdicts than your engine, which would tell you
nothing true about what works.

**The cover** is a judgement — cut after the loaded word, unless the
loaded word is the last one. `CHOOSE.png` shows the options at the size
the grid actually renders them.

**Vote or send** — send only if the confession names a second person the
viewer could picture. `post.md` carries both captions.

**The needle** — the one question in the first comment. A templated one
would be a weak one.

---

## When it doesn't work

**Nothing happens on press.** The watcher isn't running, or macOS is
blocking clipboard access:

```bash
tail -f .watch.log
```

The payload stays on the clipboard, so starting the watcher afterwards
still picks it up.

**"could not find the reply line"** — the verdict screen changed. Update
`REPLY_LINE` at the top of `booth_capture.py`.

**Capture times out on a button** — the gate changed. Check
`GATE_BEGIN_TEXT`, also at the top of `booth_capture.py`.

**Silent video** — `booth_reel_audio.py` isn't in the folder. It cannot
be rebuilt from scratch. Keep a copy.

---

## Turning it off

```bash
launchctl unload ~/Library/LaunchAgents/com.guilty.boothwatch.plist
```

---

## The standing note

The build was never the constraint. There are thirty-odd reels made and
none posted.

This makes the next one cheaper. It doesn't make it seen.
