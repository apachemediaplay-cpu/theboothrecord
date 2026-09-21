# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before you start — always

Run this first and read the output:

```sh
git fetch origin && git status -sb && git log --oneline -1 origin/main
```

- Behind `origin/main` → `git pull` before touching anything.
- Ahead, or uncommitted changes to tracked files → say so and stop. Don't build on top of
  work you can't account for.

This repo lives at `~/Desktop/The Booth/new confessional/guiltyconfess`. Duplicate copies
have existed elsewhere and caused real confusion. If `git remote -v` doesn't say
`theboothrecord.git`, you are in the wrong folder — stop and say so.

## Before you finish — always

A commit ships nothing. `npm run deploy:prod` is a separate manual step, and three of the
four deploy targets are out of band entirely (see Architecture). When you hand work back,
say plainly what is live and what is only committed.

If you changed a version pin, a prompt, a deploy step, or anything hand-applied, update
this file in the same commit. It has been wrong before — it said the gatekeeper was pinned
to v14 for four days after production moved to v16. A stale map here is worse than none,
because everything downstream trusts it.

## Commands

```sh
npm i                   # install
npm run dev             # Vite dev server on http://localhost:8080 (host "::")
npm run lint            # eslint
npm run typecheck       # tsc -b (incremental; writes *.tsbuildinfo, gitignored)
npm run build           # production build to dist/
npm run deploy:prod     # build --mode production + firebase deploy (project theboothrecord)
npm run deploy:dev      # build --mode development + firebase deploy (same project)
```

There is no automated test suite. `@playwright/test` is a leftover dependency; the
Playwright that is actually used is the **Python** one in `.venv`, driving the reel
capture pipeline (see below). Verification here means `npm run typecheck && npm run lint`
plus exercising the flow in the browser.

The dev server allows `*.trycloudflare.com` hosts so a quick tunnel can serve the app over
HTTPS to a real phone — the only way to test the camera, share sheet and wake-lock paths.

## What this is

"The Booth" (theboothrecord.com) is a confession app and the customer-acquisition front
end for the drinks brand GUILTY. Someone confesses, an LLM returns a one-line deadpan
"verdict", and approved confessions appear on a public wall. It runs in two shapes from
the same code: a **phone** (QR scanned at a venue) and a **kiosk** (a tablet in the booth
itself, running one long browser session all night).

## Architecture

Four deploy targets, three of them out of band with `npm run deploy`:

| Piece | Lives in | How it ships |
|---|---|---|
| React SPA | `src/` | `npm run deploy:prod` → Firebase Hosting |
| Share/OG Cloud Functions | `functions/` | same deploy (Gen 2, nodejs20, us-central1) |
| `generate-verdict` edge function | `supabase/functions/generate-verdict/index.ts` | **paste into the Supabase dashboard by hand** |
| Postgres schema | `supabase/migrations/*.sql` | **run by hand in the Supabase SQL editor** |

`supabase/schema.sql` is empty — the migrations are the record. Migrations are additive
and hand-applied, so a repo file existing does not mean it is live.

### The confession path

`Index` (gate) → `Confess` → `Receiving` → `Verdict`, with `Blocked` and `Held` as the
two non-verdict exits. The client never calls OpenAI. `Confess` invokes the
`generate-verdict` edge function, which:

1. rate-limits by IP (5/min, in-memory per instance);
2. runs the **gatekeeper** prompt (pinned to v16 as of 17 Sep 2026, never mode-routed) —
   unparseable after one retry returns `held` and stores nothing. v15 added the
   named-person defamation rule; v16 fixed a missing-enum bug where `minor_safety`,
   `named_person` and `drug_supply` could never be returned. The version pin lives in the
   edge function and must be bumped there, by hand, when the prompt changes;
3. on a block returns `blocked` and **stores nothing at all** (`STORE_BLOCKED = false`).
   This is deliberate: the gate mislabelled minor-safety content once, so no label-based
   retention rule is considered safe. Do not "improve" this into selective storage;
4. otherwise runs the verdict prompt plus an illegality classifier and a topic
   classifier in parallel, then writes the row via the `create_confession` RPC with
   `status = 'pending'`.

The client only ever tags the row afterwards (`tag_confession`) — it never inserts.

**Verdict version resolution** is table-driven: `public.prompt_modes` (console-editable)
is the source of truth, `PROMPT_VERSION_FLOOR = "52"` in the edge function is the
fallback when that read fails or times out (2s ceiling, 60s cache). A version string is
normalised from `v53` to `53` because the OpenAI Responses API wants the bare number.

`supabase/functions/generate-verdict-DASHBOARD.ts` is a byte-identical copy of
`index.ts`. Keep them in sync, and remember that editing either changes nothing live
until someone pastes it into the dashboard.

### Database access

Everything privileged goes through `SECURITY DEFINER` RPCs; RLS on `confessions` is
"public reads approved only". Two RPC families:

- **anon** — `create_confession`, `tag_confession`, `log_share`, `log_booth_event`,
  `resolve_share_id`, `get_share_verdict`, `recover_verdict`, `get_confess_config`.
- **authenticated + `is_admin()`** — everything prefixed `admin_`, used only by the
  console. Their `raise` messages are surfaced verbatim in console toasts, so the
  guard text is user-facing copy.

There are **two Supabase clients and they must stay separate**:
`src/integrations/supabase/client.ts` (public flow, `detectSessionInUrl: false`) and
`src/integrations/supabase/moderation-client.ts` (admin, own `storageKey`, the only one
that consumes the magic-link token). An admin JWT attaching to the public client breaks
the anon-granted confession path.

Several RPCs and tables are absent from the generated `types.ts` (it cannot be
regenerated without DB access), so call sites cast narrowly rather than widening the
generated types.

### Session storage is the flow's state

`src/lib/source.ts` owns it. Four independent keys latch on arrival and persist across
repeat confessions, whose URLs carry no params:

- `source` — the machine slug written to the DB. Only ever set from `?source=`.
- `venueName` — display name from `?venue=`, and the *only* signal for
  `isPhysicalScan()`. It is deliberately **never** used to render a venue name: the name
  is resolved from the slug through `src/data/venues.json` so that file is a real kill
  switch. Reintroducing `?venue=` into display resolution reopens a spoofing hole.
- `kiosk` — from `?kiosk=1`. Every kiosk difference in the app gates on
  `isKioskSession()` and nothing else, so a phone session stays byte-identical.
- `is_test` — from `?test=1`, excluded from every console count.

`src/lib/reset.ts` hands the kiosk to the next person: it wipes the person's keys,
rotates the session id, and deliberately **keeps** the device's keys (source, venueName,
is_test, promptMode, kiosk). It refuses to run while a share-uuid resolve is in flight,
and it is only ever called on the way out to the gate — never on screen mount, because
mount-clearing once destroyed unshared verdicts.

### Venue configuration, split by purpose

- `src/data/venues.json` is slug → `displayName`, **nothing else**. The client imports
  it; `functions/venues.json` is a generated copy (a deployed Cloud Function can only
  read files inside its own bundle). Never hand-sync a second map.
- Everything else per-venue — greeting headline and guidance, register, placeholder
  lines, prompt mode — lives in `public.venues` / `public.registers` and is edited in the
  console. `src/lib/registers.ts` and `resolvePrompt()` in `source.ts` map it.
- Console-added venues that are not in `venues.json` resolve their name from the DB, but
  only when the row is `active = true`. Every name-resolution path fails closed to `""`,
  which renders LOCATION WITHHELD, never a raw slug.

### Share cards — two renderers that drift

`src/lib/shareCard.ts` draws the confessor's 1080×1920 PNG in the browser (canvas, pure,
optionally with a photo). `functions/src/card.mjs` draws a *different* card server-side
with Satori for link unfurls. They have diverged twice. Change one, check the other.
The no-photo client card's SHA-256 is the regression test for touching `shareCard.ts`.

Share links are keyed on the confession's unguessable UUID, never the sequential
`subject_number`, so nothing is enumerable. `functions/index.mjs` reads through
`get_share_verdict` with plain `fetch` — not supabase-js, whose realtime WebSocket
crashes on the nodejs20 runtime.

### Deploy hazards encoded in the config

`firebase.json`'s `predeploy` runs `scripts/copy-venues.mjs` and
`scripts/copy-index-html.mjs`. The latter **fails the deploy** if `dist/index.html` is
missing or older than the newest file in `src/`, because the `/v/` share function serves
the shell it bundled at deploy time and a stale one points at a deleted bundle. So:
always `npm run build` before deploying functions. `index.html` is served `no-store`;
`/assets/**` is immutable.

### The round — shelved, not dead

`src/lib/round.ts` and the five `Round*` pages are reachable by URL only; the entry link
was removed. They are kept deliberately. More importantly, the **mode plumbing** they
introduced (`confessions.mode`, `create_confession`'s `p_mode`, and the `prompt_modes`
lookup in the edge function) is a general prompt-routing layer used by live venue prompts
and experiments. Do not clean any of it up as dead round code.

### The console

`src/pages/Moderate.tsx` at `/console` is ~5200 lines and holds four tabs (moderate,
venues, stats, wall) — the moderation queue, venue and register editing, prompt-mode
version editing, QR generation, and analytics. Admin state changes are **not
optimistic**: a version change decides which prompt answers live confessions, so local
state updates only after the server confirms.

## The reel pipeline (Python, separate from the app)

`booth_capture.py` → `booth_assemble.py` → `booth_post.py`, orchestrated by
`booth_watch.py`, a clipboard watcher triggered from the console's reel buttons
(`src/components/booth_reels.tsx`). It drives the *real* app in a browser via Python
Playwright so the fonts and colour tokens are genuine, screenshots every state, then
assembles video with an audio bed from `booth_reel_audio.py`. Requires
`source .venv/bin/activate` and a dev server on port 8080. Read `CONSOLE_REELS.md`
before touching any of it; its paths still reference an older folder name.

Finished reels land in `posts/<slug>/`, one folder per confession —
`reel_reach.mp4` (the one to post, 1080x1920), `reel_anchor.mp4`,
`cover_01`–`cover_04.png`, `CHOOSE.png` (the four covers side by side)
and `post.md` (the caption). `outputs/` holds the assembled cuts that
`booth_post.py` copies into `posts/`, plus the brand reels from
`make_booth_reel.py` (`booth_reel.mp4`, `booth_tail.mp4`, `booth_loop.mp4`).
`captures/<slug>/` holds the screenshots `booth_assemble.py` reads, and
`versions/reach.json` / `versions/anchor.json` are the cut specs
`booth_post.py` uses by default — the pipeline cannot assemble without
them. `captures/`, `outputs/` and `posts/` are gitignored; `versions/` is
tracked, because those two specs used to exist only on one machine.

`booth_watch.py` runs as a macOS LaunchAgent, `com.guilty.boothwatch`,
not from `.zshrc`. It logs to /tmp/booth_watch.log and
/tmp/booth_watch.err. The plist must set an explicit PATH that includes
/usr/local/bin: launchd does not inherit the shell PATH, so without it
`npx` is not found and the dev server silently never starts.

The venv cannot be moved. It hardcodes its own absolute path, so
relocating the repo breaks every script inside it — rebuild with
`python3 -m venv .venv --clear` and `pip install -r requirements.txt`.

## Conventions

**The comments are the design record.** Files here carry long headers explaining why a
thing is the way it is, which bug it fixes, and what was deliberately rejected — several
say outright "do not reopen this". Read the header before changing a file, and when you
change behaviour that a comment describes, update the comment in the same edit. New code
should match that density rather than the sparse norm.

**Fail closed and fail silent.** Metric writes are fire-and-forget and must never surface
to the user or block the flow. Name and stamp resolution defaults to withheld. Missing
config falls through documented chains (venue greeting → `site_copy.default_prompt` →
the hardcoded `DEFAULT_PROMPT`), where headline and guidance always travel together from
the same level.

`@/` aliases `src/`. UI is shadcn/ui in `src/components/ui/` (49 generated components,
edited rarely) over Tailwind; brand tokens live in `src/index.css` and
`tailwind.config.ts` and are mirrored by hand in `functions/src/card.mjs`.

`SSOT.md` is a useful narrative of the product and its metrics, but its technical section
has drifted — it still claims the edge function is not in the repo and that `venues.json`
carries prompt copy. Trust the code over it. `docs/` holds per-change design notes,
`prompts/` holds the prompt texts and the live version pins as of August 2026.
