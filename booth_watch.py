#!/usr/bin/env python3
"""
THE BOOTH — clipboard watcher.

Leave this running in a third terminal. Press the Reel button in the
console and the reel builds itself.

USAGE
    # terminal 1
    booth
    npx vite --port 8080 --host 127.0.0.1

    # terminal 2
    booth
    python booth_watch.py

    # then just press the button in the console

WHY DATA AND NOT A COMMAND
    The clipboard carries a JSON payload, never a shell string, and this
    script parses it rather than executing it. Arguments go to
    subprocess as a list with no shell involved, so nothing copied from
    a browser can run anything it wasn't meant to.

    It only reacts to a payload starting with the exact marker below,
    and clears the clipboard afterwards so it can't fire twice.

VENUE REELS
    The console sends each confession's own source, stamp_venue and
    is_test. A reel is stamped (booth_post --venue <slug>) only when ALL
    of these hold, and every "no" is logged with its reason:
      - source is a real venue slug (not empty, direct or instagram);
      - stamp_venue is exactly true — the row's own flag, which is
        stamp_venue AND physical since 20260817100000, so it already means
        "the app prints this venue on the confessor's card": a printed-card
        scan, not flagged by the classifier, not hidden in the console. A
        reel never names a venue the confession's own card wouldn't;
      - is_test is not true — a test confession is staff at the venue, and
        a stamped reel of it would claim a real customer said it there.
        It still gets a reel, unstamped;
      - the slug is in src/data/venues.json. booth_capture --venue refuses
        any other slug, so a console-added venue that never made it into
        the file gets an unstamped reel here instead of a failure.
    Anything else falls through to exactly today's unstamped reel.

VERSION SKEW
    The console is deployed; this runs on one Mac. They drift. So every
    venue field is optional (an old console sends none of them → no venue,
    today's reel), and keys this build doesn't know are dropped with a log
    line rather than rejecting the payload, so a newer console can't stop
    an older watcher from building. The only keys ever used are the ones
    named in ALLOWED, and they still go to subprocess as a list.
    One case this can't fix retroactively: watchers from before this
    change REJECT unknown keys. The running watcher must be restarted on
    this code before a console that sends source is deployed.
"""

import json, re, socket, subprocess, sys, time, hashlib
from pathlib import Path

REPO = Path(__file__).resolve().parent
MARKER = "BOOTH_REEL "
POLL_S = 1.0

ALLOWED = {"confession", "verdict", "type", "subject", "slug", "needle",
           "source", "stamp_venue", "is_test"}
VENUES_JSON = REPO / "src" / "data" / "venues.json"
# Sources that are traffic, not a room. Never stamped.
NOT_A_VENUE = {"", "direct", "instagram"}
SLUG_RE = re.compile(r"^[a-z0-9_-]{1,100}$")
PORT = 8080
_vite = None


def dev_server_up(port=PORT):
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def ensure_dev_server():
    """
    Start vite if nothing is answering. Lets this run as a login agent
    without a second terminal — the capture needs a live app, and a
    watcher that fires into a dead port is worse than no watcher.
    """
    global _vite
    if dev_server_up():
        return True
    print("  starting dev server...")
    _vite = subprocess.Popen(
        ["npx", "vite", "--port", str(PORT), "--host", "127.0.0.1"],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        time.sleep(0.5)
        if dev_server_up():
            print("  dev server up")
            return True
    print("  ! dev server did not start")
    return False


def clipboard():
    try:
        return subprocess.run(["pbpaste"], capture_output=True,
                              text=True, timeout=5).stdout
    except Exception:
        return ""


def clear_clipboard():
    subprocess.run(["pbcopy"], input="", text=True)


def validate_one(data):
    if not isinstance(data, dict):
        raise ValueError("entry is not an object")
    extra = set(data) - ALLOWED
    if extra:
        # Newer console than watcher. Drop, don't reject — see VERSION SKEW.
        print(f"  (ignoring keys this watcher doesn't know: {', '.join(sorted(extra))})")
        data = {k: v for k, v in data.items() if k in ALLOWED}
    for k in ("confession", "verdict"):
        if not isinstance(data.get(k), str) or not data[k].strip():
            raise ValueError(f"missing or empty '{k}'")
        if len(data[k]) > 400:
            raise ValueError(f"'{k}' is implausibly long")
    if data.get("type", "vote") not in ("vote", "send"):
        raise ValueError("type must be vote or send")
    if "subject" in data and not isinstance(data["subject"], int):
        raise ValueError("subject must be a whole number")
    return data


def validate(raw):
    """
    Accepts one confession or a list of them. Rejects anything that
    isn't the exact shape we expect, before anything is run.
    """
    parsed = json.loads(raw)
    items = parsed if isinstance(parsed, list) else [parsed]
    if not items:
        raise ValueError("empty queue")
    if len(items) > 20:
        raise ValueError("more than 20 in one go")
    return [validate_one(d) for d in items]


def venue_for(data):
    """
    The slug to stamp, or None. Always returns a reason for the log.
    Never raises: a malformed venue field means an unstamped reel, not a
    lost one.
    """
    src = data.get("source")
    if src is None:
        return None, "no source in payload (older console?) — unstamped"
    if not isinstance(src, str) or not SLUG_RE.match(src.strip().lower()):
        return None, f"source {src!r} is not a slug — unstamped"
    src = src.strip().lower()
    if src in NOT_A_VENUE:
        return None, f"source '{src}' is not a venue — unstamped"
    if data.get("is_test") is True:
        return None, f"test confession at '{src}' — unstamped"
    if data.get("stamp_venue") is not True:
        return None, (f"'{src}' but stamp_venue is {data.get('stamp_venue')!r} "
                      "(not a printed-card scan, or hidden) — unstamped")
    try:
        venues = json.loads(VENUES_JSON.read_text())
    except Exception as e:
        return None, f"couldn't read venues.json ({e}) — unstamped"
    if src not in venues:
        return None, f"'{src}' is not in venues.json — unstamped"
    return src, f"stamped: {venues[src]['displayName']} ({src})"


def run(data):
    venue, why = venue_for(data)
    print(f"      venue: {why}")
    cmd = [sys.executable, "booth_post.py",
           "--confession", data["confession"],
           "--verdict", data["verdict"],
           "--type", data.get("type", "vote")]
    for flag in ("subject", "slug", "needle"):
        if data.get(flag):
            cmd += [f"--{flag}", str(data[flag])]
    if venue:
        cmd += ["--venue", venue]
    # list args, no shell — nothing here can be interpreted as a command
    return subprocess.run(cmd, cwd=REPO).returncode


def main():
    # Under launchd stdout is a file, so Python block-buffers it and these
    # lines reached /tmp/booth_watch.log late — after booth_post's own
    # output, or not until exit. Line-buffer so the venue decision lands
    # in the log above the build it explains.
    sys.stdout.reconfigure(line_buffering=True)
    print("watching the clipboard. press BUILD in the console.")
    print("the dev server starts itself when needed. ctrl-c to stop.\n")
    seen = None
    while True:
        raw = clipboard()
        if raw.startswith(MARKER):
            payload = raw[len(MARKER):].strip()
            fingerprint = hashlib.md5(payload.encode()).hexdigest()
            if fingerprint != seen:
                seen = fingerprint
                try:
                    data = validate(payload)
                except Exception as e:
                    print(f"  ignored — {e}\n")
                    time.sleep(POLL_S); continue
                clear_clipboard()
                if not ensure_dev_server():
                    print("  nothing built\n"); continue
                n = len(data)
                print(f"  {n} in the queue\n")
                ok = 0
                for i, item in enumerate(data, 1):
                    print(f"  [{i}/{n}] {item['confession'][:56]}")
                    if run(item) == 0:
                        ok += 1
                    else:
                        print(f"  [{i}/{n}] FAILED — carrying on")
                print(f"\n  {ok}/{n} built\n")
                print("watching...\n")
        time.sleep(POLL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        if _vite:
            _vite.terminate()
