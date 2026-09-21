# Console → reel

Tick confessions in the console, press build, walk away. Folders appear
with the reels, the covers and the notes.

Everything lives in `~/Desktop/The Booth/new confessional/guiltyconfess`.
Moving the repo breaks the venv and the LaunchAgent, which both hardcode
that path.

---

## Install, once

**1. The scripts and the console buttons are already in the repo.**
`booth_capture.py`, `booth_assemble.py`, `booth_post.py`, `booth_watch.py`,
`booth_reel_audio.py`, `make_booth_reel.py`, the cut specs in `versions/`,
and `src/components/booth_reels.tsx`, already wired into `Moderate.tsx`
(`ReelAction` per row, `ReelBulkAction` in the bulk bar). Nothing to copy
in. Sanity check:

```bash
grep -c "^def add_tail_neon" booth_assemble.py   # want 1
grep "^NEON_GAIN" make_booth_reel.py             # want 1.00
grep -c "^MARKER" booth_watch.py                 # want 1
```

**2. The venv**

```bash
cd "$HOME/Desktop/The Booth/new confessional/guiltyconfess"
python3 -m venv .venv --clear
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

**3. The watcher, on login**

The LaunchAgent plist is not in the repo. It lives at
`~/Library/LaunchAgents/com.guilty.boothwatch.plist`. If it's missing,
recreate it with these values:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.guilty.boothwatch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/nara/Desktop/The Booth/new confessional/guiltyconfess/.venv/bin/python</string>
    <string>booth_watch.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/nara/Desktop/The Booth/new confessional/guiltyconfess</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/nara/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>/Users/nara</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/tmp/booth_watch.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/booth_watch.err</string>
</dict>
</plist>
```

The explicit PATH is required: launchd doesn't inherit the shell's PATH,
and without `/usr/local/bin` the watcher can't find `npx`, so the dev
server silently never starts. Then:

```bash
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
tail -f /tmp/booth_watch.log /tmp/booth_watch.err
```

The payload stays on the clipboard, so starting the watcher afterwards
still picks it up.

**"could not find the reply line"** — the verdict screen changed. Update
`REPLY_LINE` at the top of `booth_capture.py`.

**Capture times out on a button** — the gate changed. Check
`GATE_BEGIN_TEXT`, also at the top of `booth_capture.py`.

**Silent video** — `booth_reel_audio.py` is missing or broken. It's
tracked in the repo; restore it with `git checkout booth_reel_audio.py`.

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
