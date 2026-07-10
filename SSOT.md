# THE BOOTH — SINGLE SOURCE OF TRUTH

**GUILTY / House of Guilty · theboothrecord.com · 2026-07-10**

Strategy/flow/design layer authored with Claude; **all code-level facts below are filled from the actual repo** (paths, RPC signatures, migration IDs, function URLs, tokens) — not from memory. This file lives in the repo root so it updates in commits alongside the code (supersedes `The_Booth_SSOT.pdf`).

---

## ⚠️ Corrections applied vs the PDF (2026-07-10)

These were factually wrong (or ambiguous) in `The_Booth_SSOT.pdf`; fixed here against the real build:

1. **Green mono is `#00FF1E`, not `#3fb950`.** The `--ritual-green` token is `hsl(127 100% 50%)` = `rgb(0,255,30)` = **`#00FF1E`** (a pure/acid green), not the GitHub-ish `#3fb950` in the PDF. (`src/index.css:66`, `functions/src/card.mjs:32`.)
2. **The GUILTY ™ is present on BOTH renders — not dropped on the Satori server render.** The server card rasterises the *same* wordmark SVG (`GUILTY™`) the client PNG uses, so the ™ shows on both. The PDF's "TM dropped on the Satori server render" is wrong.
3. **Edge function name vs RPC (disambiguation).** The verdict edge function is **`generate-verdict`** (Supabase, dashboard-managed — *not* in the repo). **`create_confession`** is the Postgres RPC that function writes through (it *is* in the repo). The PDF listed them together as if interchangeable.
4. **Confession echo is mono, not sans.** On the verdict card the confession is drawn in **Söhne Mono** (grey), and the confess-screen input is mono too. The PDF's aesthetic line "sans for confession body" is inaccurate (its own verdict-card line correctly says "mono").
5. **Functions runtime is `nodejs20`** (relevant history: this caused the supabase-js realtime-WebSocket crash that was fixed by dropping supabase-js — see §7).
6. **Repo-truth flag:** the entire share-links feature + its fixes are **deployed live but not pushed** — `HEAD = 3d22a0a`, `origin/main = 38e8e42`, **4 unpushed commits**. Live functions are ahead of `origin`. (Housekeeping, §9.)

---

## 1 · What The Booth Is (purpose)

The Booth is a **B2B proof engine wearing a consumer costume**. A venue customer scans a QR, confesses a small transgression, and receives a deadpan AI "verdict" card branded GUILTY and stamped with the venue's name. **The confessor is not the customer — the venue is.**

**Canonical definition** (supersedes earlier "acquisition funnel" framing): The Booth is a **REACH / EXPERIENCE** play. The shareable verdict card **IS** the product. There is **NO capture, NO nurture** — email/contact capture was built, tested, and deliberately shelved (nobody enters an email mid-confession at a venue). Not a gap; do not reopen. *(Repo: the flag `ENABLE_EMAIL_CAPTURE = false` in `src/pages/Verdict.tsx`; the dormant `email` column persists but is never written.)*

Firewall retired **27 Jun 2026** — GUILTY may appear on the Booth. The moderation layer (approve/reject before the public wall) is load-bearing since then (`src/pages/Moderate.tsx`).

---

## 2 · Marketing purpose & the two benefits

Two independent venue benefits — one provable, one not:

- **In-venue experience (provable):** each completed confession is a distinctive in-room moment a plain soda can't create. **Measurable — the primary metric.**
- **Branded reach (soft):** shared verdict cards carry the venue name beyond the room. Real but **unmeasurable** — share *intent* (tap) can be counted; actual reach cannot.

**Pitch primacy:** lead with engagement + branded content. Place a reorder alongside as the commercial fact. **Never claim causation** — two true facts side by side; let the operator connect them.

---

## 3 · The proof-engine loop

Cans in → in-venue confessions + branded cards out → proof → next venue → more cans in. Each venue closed makes the next cheaper. **Seoul Tiger = the lab** (debug the mechanism, first number, first on/off causal test). **Frenchie = the showroom** (high-social; quotable number). The $3 Frenchie price is bought by the Booth being live + content, not given as a discount.

---

## 4 · Metrics

| Metric | Proves | Source / rule |
|---|---|---|
| **Completed confessions / venue** (PRIMARY) | In-venue engagement + branded cards. The pitch number. | Rows with non-null `verdict_text`, by exact `source` slug, excluding `direct` and `is_test`. |
| Completion rate (diagnostic) | Experience quality (finishers ÷ scans) | **Deferred** — needs scan-arrival logging; not pitch-critical. |
| Share-tap count (soft) | Card was good enough to want to share (NOT reach) | `public.share_events` table; tap only, no dedup, no destination. |
| Reorder (commercial) | Cans sold — the only number that pays the bills | Order history; placed alongside engagement, causation never claimed. |

**Metric query** (real column names):
```sql
select source, count(*) as completed_confessions
from public.confessions
where verdict_text is not null and source <> 'direct' and is_test is not true
group by source;
```

**Causation:** one venue's scans + reorders = correlation only. The only causal route is an **on/off test** (Booth on 2 wks → off 2 wks → watch reorders) at Seoul Tiger. The Booth is deliberately separated from the till (no capture), so it cannot directly attribute a sale to a scan.

---

## 5 · Flow logic (guest journey)

Order is fixed. A QR scan enters at the top (consent gate), never mid-flow.

1. **Consent gate** (`src/pages/Index.tsx`) — "Once you begin, you can't take it back." 18+ tick + ENTER. **Required on every entry path including QR scans** — `src/pages/Confess.tsx` redirects to the gate if `sessionStorage.consent !== "1"` (attribution already captured, so it survives the redirect). Consent is per-session (re-gates on a fresh visit; not on same-session repeat). `source` + `?test=1` persist through the gate.
2. **Confess screen** (`src/pages/Confess.tsx`) — venue-tailored prompt (`headline` + optional `guidance`) keyed on the stored `source` via `getPrompt()`. Free-text confession + Web Speech voice input; 18+/Terms line.
3. **Loading** (`src/pages/Receiving.tsx`) — three-beat green-mono sequence ("Your sin is being received." → "The booth is deciding." → "Your verdict is coming.") with a thin blinking `--ritual-green` caret trailing each beat. Generation is **non-streaming**.
4. **Verdict card** (`src/pages/Verdict.tsx`) — "THE BOOTH NOTICED." + confession + verdict + GUILTY oval + "AS CHARGED / AT [venue]" (or LOCATION WITHHELD).
5. **Share (ON RECORD)** — **PRIMARY:** single link `https://theboothrecord.com/v/{uuid}`, shared with generic CTA text *"You've been summoned. You know what you did."*, unfurling to a per-verdict OG card. **SECONDARY:** SAVE IMAGE (client PNG, for Stories). CONFESS AGAIN + THE PUBLIC RECORD also present.
6. **Public wall** (`/thewall`, `src/pages/TheWall.tsx`) — moderated; only `status = 'approved'` shown; carries the GUILTY wordmark.

---

## 6 · Visual / brand design

**Booth app aesthetic.** Dark ground (`#171513`), warm cream/off-white body (`#F4F0EA`), **green mono `#00FF1E`** (`--ritual-green` = `hsl(127 100% 50%)`) for system/booth-voice lines, **GUILTY orange `#FF4800`** for the oval mark. Söhne Mono for labels/system text + confession echo; **Control Upright Bold** for verdict headlines.

**Verdict card** (`functions/src/card.mjs` server render; `generateShareCard()` in `src/pages/Verdict.tsx` client PNG): header "THE BOOTH NOTICED." (green mono) · confession echo (Söhne Mono, grey `rgb(135,130,120)`) · verdict (Control Upright Bold, dynamic sizing — **70px ≤200 chars, 58px ≤290, 46px beyond**, so long roasts don't clip) · GUILTY orange oval **with ™ on both client PNG and Satori server render** (same wordmark asset) · "AS CHARGED / AT [VENUE]" or "LOCATION WITHHELD" · SUBJECT #n · @houseofguilty.

**Venue table cards** (per-venue, co-branded). Type = who's speaking (GUILTY fonts). Colour = whose house you're in (venue palette). Print: 55 × 90mm portrait, single-face, 3mm bleed, CMYK, fonts embedded, square-cut, 300gsm silk. QR error-correction Q, baked white quiet-zone, always test-scan before a batch.

| Venue | Palette | Table-card headline / prompt |
|---|---|---|
| Seoul Tiger 1988 | Bone `#EFE7D6` / espresso `#2E211A` / gold `#C8912F` | "CONFESS YOUR MOST GUILTY ORDER." → prompt "Confess your most guilty order." / "The one you'd never admit to." |
| Frenchie (A) | Terracotta `#A8402E` / cream | "EVERYONE HERE IS GUILTY." → "Everyone here is guilty." / "Yours first." |
| Frenchie (B) | Terracotta / cream | "WE ALREADY KNOW." → "We already know." / "Say it anyway." |

**[STILL FROM PHYSICAL ASSETS — not in repo]** Exact hex from real venue assets (Seoul Tiger colours approximated from screenshots); Seoul Tiger's real wordmark (card currently uses a stand-in serif).

---

## 7 · Technical architecture

**Stack.** React/Vite client on Firebase Hosting · Supabase (Postgres) backend · Firebase Cloud Functions (Blaze, **Gen 2, `nodejs20`, us-central1**) for share OG rendering · OpenAI verdict generation via a Supabase edge function.

### Verdict pipeline (PINNED — DO NOT REOPEN)
Gatekeeper **v14** (blocks drug supply, crisis, minor-safety; deliberately allows personal-use transgression) → verdict engine **v45** (deadpan, plain-language). Non-streaming.
- **Edge function name / location:** **`generate-verdict`** — Supabase edge function, **dashboard-managed, NOT in this repo** (repo `supabase/functions/` contains only `send-contact-email`). Because it's not in the repo, the pinned versions and prompt IDs are **not repo-verifiable** — they live in the dashboard. Last-known (dashboard): gatekeeper prompt `pmpt_69e59eff…` **@ v14**, verdict prompt `pmpt_69e55770…` **@ v45**. *(Locators/versions only — prompt text not reproduced here.)*
- **Write path (in repo):** `generate-verdict` persists via the `create_confession` RPC (below). It does **not** self-publish (`status` clamped to `pending`/`blocked`).

### Per-venue prompts (Layer 1 only)  ·  data: `src/data/venues.json`
**Single source of truth for venues:** `src/data/venues.json` — one record per slug `{ displayName, headline, guidance? }`, used for **both** the confess prompt and the share-card venue stamp. The client (`src/lib/source.ts`) imports it directly (bundled at build → prompt stays synchronous). The share-card OG function reads the **same** data via a build-time copy (`functions/venues.json`, generated by `functions/prep.mjs` + a `firebase.json` deploy predeploy hook) because a deployed Cloud Function can only read files inside its own bundle. **Add a venue in `src/data/venues.json` only** — nothing is hand-synced.
`getPrompt(source)` returns the record's `{ headline, guidance? }`; unknown/missing source → `DEFAULT_PROMPT` (`"Confess something."`, no guidance). Tailored *input* → tailored *output*; the verdict engine is **not** given venue context (Layer 2 deliberately not built). Live slugs: `seoultiger1988`, `frenchiecbda`, `frenchiecbdb`, `frenchiecbd`, `highballcbr`.

> **Resolved (2026-07-10) — the venue-#3 stamp bug.** Venue names previously lived in **two** hand-synced maps (client `VENUES` + a duplicate `VENUE` in `functions/index.mjs`). Adding Highball (venue #3) to only the client meant the shared OG card stamped "LOCATION WITHHELD" while the client card showed "AS CHARGED AT HIGHBALL." Collapsing both onto `src/data/venues.json` removes the duplication so this class of drift can't recur.

### Metrics wiring  ·  `src/lib/metrics.ts` + migration `20260709000000_booth_metrics.sql`
`session_id` + `is_test` columns on `confessions`; `tag_confession()` tags the row after a successful verdict (`src/pages/Receiving.tsx`); `log_share()` + `share_events` table log share taps (fired on ON RECORD in `src/pages/Verdict.tsx`). `?test=1` is captured in `captureSourceFromUrl()`, **persists across repeat confessions, and clears on a fresh real scan**. Per-session id via `getSessionId()`.

### Share links & privacy (enumeration-proof)  ·  migration `20260709010000_share_by_uuid.sql`
Share URL is keyed on the confession's **unguessable UUID** (`public.confessions.id`), **never** the sequential `subject_number`. No new column — reuses the existing `id`.
- `resolve_share_id(subject_number, session_id, verdict)` — ownership-gated; hands the confessor their own UUID; can't be used as a `subject_number → uuid` oracle.
- `get_share_verdict(uuid)` — uuid-only read; a non-uuid (`'1'`, `'354'`) matches nothing → 404. **Verified live.**
- Firebase functions `ogImage` + `share` serve per-verdict OG tags/image; **bad/missing id → clean 404 (not 500)**; real UUID → `200 image/png`. *(The 500-on-bad-id bug was a supabase-js realtime WebSocket crash on `nodejs20`; fixed by dropping supabase-js and calling PostgREST with plain `fetch` — `functions/index.mjs`.)*
- Public wall stays approved-only; a confessor sharing their **own** verdict is **not** gated on moderation (their content, not us publishing it).

### 🔧 Repo reference (filled from code)

**File paths**
| Thing | Path |
|---|---|
| Consent gate | `src/pages/Index.tsx` |
| Confess screen | `src/pages/Confess.tsx` |
| Loading (3-beat) | `src/pages/Receiving.tsx` |
| Verdict card + share button | `src/pages/Verdict.tsx` |
| **Share landing page** | `src/pages/VerdictShare.tsx` (route `/v/:id` in `src/App.tsx`) |
| Public wall | `src/pages/TheWall.tsx` |
| Moderation tool | `src/pages/Moderate.tsx` |
| **Venue data (single source)** | `src/data/venues.json` (client imports it; function reads a copy `functions/venues.json`) |
| Attribution + prompt/display resolution + session/test helpers | `src/lib/source.ts` |
| **Metrics lib** | `src/lib/metrics.ts` |
| **Functions entry** | `functions/index.mjs` (`ogImage`, `share`) |
| **Card renderer** (Satori) | `functions/src/card.mjs` (`renderCardPng`) |
| Font/asset prep for the card | `functions/prep.mjs` |
| Hosting rewrites | `firebase.json` |

**RPC signatures (exact, as defined in the migrations)** — all `security definer`, `search_path=public`, granted to `anon`:
```sql
-- 20260628093000_create_confession_rpc.sql  (edge function's write path)
create_confession(p_confession text, p_verdict text, p_source text, p_status text) returns bigint

-- 20260709000000_booth_metrics.sql
tag_confession(_subject_number bigint, _session_id text, _is_test boolean) returns void
log_share(_source text, _session_id text) returns void

-- 20260709010000_share_by_uuid.sql
resolve_share_id(_subject_number bigint, _session_id text, _verdict text) returns text
get_share_verdict(_id text)
  returns table (subject_number bigint, confession_text text, verdict_text text, source text)  -- stable
```

**Migration IDs / filenames** (`supabase/migrations/`, applied via the Supabase dashboard):
| ID | File | Adds |
|---|---|---|
| 20260325075148 | `…_9f0b0c34-….sql` | legacy `contact_submissions` (orphaned) |
| 20260628093000 | `_create_confession_rpc.sql` | `create_confession` RPC |
| 20260628100000 | `_fix_status_check_constraint.sql` | `status` CHECK (`pending/approved/rejected/blocked`) |
| 20260707090000 | `_confessions_rls.sql` | RLS "public reads approved only" |
| 20260707100000 | `_wall_moderation.sql` | `admins`, `is_admin()`, `admin_list_confessions`, `admin_set_status` |
| **20260709000000** | **`_booth_metrics.sql`** | `session_id`+`is_test` cols, `tag_confession`, `log_share`, `share_events` |
| **20260709010000** | **`_share_by_uuid.sql`** | `resolve_share_id`, `get_share_verdict` |

**Deployed functions** (Firebase Cloud Functions Gen 2, `us-central1`, `nodejs20`) — accessed via hosting rewrites in `firebase.json`:
| Function | Memory | Public URL (canonical, via rewrite) |
|---|---|---|
| `ogImage` | 512 MiB | `https://theboothrecord.com/og/{uuid}.png` |
| `share` | 256 MiB | `https://theboothrecord.com/v/{uuid}` |

*(These are Gen-2 functions backed by Cloud Run in `us-central1`; the underlying `*.run.app` service URLs exist but are internal — the rewrites above are the intended access path. `functions/.env` supplies `SUPABASE_URL` / `SUPABASE_ANON_KEY`, gitignored.)*

**Brand tokens (exact)** — `src/index.css`, `tailwind.config.ts`, `functions/src/card.mjs`:
`--ritual-green` = `hsl(127 100% 50%)` = `#00FF1E` · GUILTY orange `#FF4800` · card ground `#171513` · verdict cream `#F4F0EA` · confession grey `rgb(135,130,120)`.

---

## 8 · Canonical QR / URL format (LOCKED)

```
https://theboothrecord.com/confess?source=<SLUG>&venue=<URL-encoded display name>
```
- `source` = per-venue slug — **BOTH** the attribution key AND the personalization key. Must be identical across QR, Supabase, and every A/B variant, or counts fragment.
- `venue` = URL-encoded display name (spaces = `%20`).
- **Locked slug registry** (matches `VENUES` in `src/lib/source.ts`): Frenchie = `frenchiecbd` (A/B: `frenchiecbda` / `frenchiecbdb`); Seoul Tiger 1988 = `seoultiger1988`.
- Print QR: error-correction Q, white quiet-zone baked in, cream/white panel. Always test-scan before a batch (confirm `%20` decodes and venue stamps correctly).
- Adding `?test=1` to a QR marks a test scan (`is_test = true`), excluded from the metric.

---

## 9 · Open items / roadmap

- **Test data:** everything through subject #477 is Pete's own testing. From launch, all test scans use `?test=1`. Consider a clean wipe so the count starts at true zero. Old bare-slug rows (`seoultiger`, `frenchie`) are dead test data (the slugs were renamed to the `…cbd*` / `…1988` registry).
- **🔴 Push local commits:** 4 commits are **deployed live but unpushed** (`origin/main = 38e8e42`, `HEAD = 3d22a0a`): `28a4e3d` share links, `60eadd3`/`ae7b29c`/`3d22a0a` the deploy fixes. `git push origin main` to resync. *(Also: commits carry an auto-detected git author `nara@…local` rather than a configured identity.)*
- **Client PNG long-verdict overflow:** known bug — the client card (`generateShareCard()`) clips on very long verdicts; the Satori server render (`card.mjs`) fixed this independently with dynamic sizing. Consider porting the buckets to the client card.
- **Streaming verdict:** considered, rejected for now — architecture change + stutter risk on venue wifi outweigh the gain.
- **Layer-2 verdict context:** parked — only if real data shows verdicts aren't landing venue-appropriately.
- **SSOT → data:** once enough venues, move the venue config to a Supabase `venues` table (slug, display name, palette, prompt).

> **The only number that pays the bills is CANS SOLD.** Everything the Booth measures is instrumentation in service of that — never the goal.
