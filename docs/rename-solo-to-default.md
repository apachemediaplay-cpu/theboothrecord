# Live rename: prompt mode `solo` → `default`

**Status: prepared and verified against the LIVE stack — nothing applied yet.
Apply the three artifacts in the order below.**

## Why

`solo` only meant something next to `round`, and the round is shelved. The name
should say what it is — the prompt every confession gets unless a venue says
otherwise. The console already uses the word ("blank headline → default prompt").

## Findings — the live state (verified)

Confirmed in the Supabase dashboard and independently via anon REST probes:

- **prompt_modes** is live, seeded `solo → 52`, `round → 52` (versions are the
  bare OpenAI numbers — "52", not "v52").
- **confessions.mode** is live. The `ALTER ... NOT NULL DEFAULT 'solo'`
  **backfilled every pre-existing row** — the entire confession history is
  stamped `'solo'`, not just new writes.
- **create_confession** has exactly ONE signature —
  `(text, text, text, text, boolean, text, text)` with
  `p_mode text DEFAULT 'solo'` as the 7th parameter. The orphaned 5-parameter
  overload is gone.
- **The edge function** is the merged version, deployed and reading the table:
  its log shows `[generate-verdict] mode=solo prompt=52 source=table`.
- **The client** is deployed; the console's Prompt modes editor is live.

The mode name appears in four places that must agree — the table row, the
database defaults (column + `p_mode`), the edge function's resolver literals,
and the client's marker/sort literals. All four are covered by the artifacts
below. **Existing rows keep `mode='solo'` — deliberately never rewritten:**
rewriting history to match a naming decision loses the fact those rows were
written under the old name.

## Order of operations, and the degradation window

**1. Migration → 2. Edge paste → 3. Client deploy.**

The only window is between steps 1 and 2: the deployed resolver requests
`'solo'`, misses the renamed row, misses its `'solo'` fallback-row lookup, and
lands on the hardcoded `"52"` floor — `source=fallback` in the logs. **Verdicts
keep working on the same version throughout** (the floor equals the live
version); the table just isn't read, and rows written inside the window still
stamp `'solo'` (harmless, and consistent with the keep-history rule). Two
precisions: the window lasts until the edge paste (not a fixed minute), and
warm instances may serve the cached `'solo'` row for up to 60s after the
migration — a smoother tail, not a sharper edge. After the paste, logs flip
back to `source=table` and new rows stamp `'default'`.

There is no catastrophic ordering: `p_mode` is already live, so no sequence
can stop confessions persisting. Step 3 is cosmetic (console-only) and can
land any time after step 2.

**Marker decision (settled):** BOTH `'default'` and `'solo'` render unmarked
in the console; only a mode that is neither — a venue mode, an experiment,
anything genuinely different — gets the quiet badge. Reason: the backfill
stamped every historical row `'solo'`, so marking non-default would badge the
entire queue — inverting "the norm is unmarked" for the bulk of what you're
looking at, and telling you nothing, because those rows predate modes
entirely. The column keeps the distinction for queries; the badge exists only
to catch the unusual. The condition is deliberately two comparisons — recorded
in the code so it isn't "simplified" later.

---

## Artifact 1 — the migration (paste FIRST)

Repo path: `supabase/migrations/20260808100000_rename_prompt_mode_default.sql`

Renames the table row and the column default, and rewrites
`create_confession`'s defaults **in place from the live definition** — the DO
block reads `pg_get_functiondef` itself, so nothing is hand-copied and it
cannot drift from the deployed body. `CREATE OR REPLACE` on the identical
signature cannot create an overload and preserves grants. Guards refuse to run
against an unexpected state.

```sql
-- LIVE RENAME: prompt mode 'solo' → 'default'. This runs against a LIVE
-- stack: prompt_modes seeded (solo→52, round→52), confessions.mode live with
-- every existing row stamped 'solo', create_confession live with p_mode
-- DEFAULT 'solo' as its 7th parameter, and the edge function reading the
-- table (source=table in its logs).
--
-- WHY: 'solo' only meant something next to 'round', and the round is
-- shelved. 'default' says what it is — the prompt every confession gets
-- unless something says otherwise.
--
-- EXISTING ROWS KEEP mode='solo' — deliberately NOT rewritten. Rewriting
-- history to match a naming decision loses the fact those rows were written
-- under the old name. Only the three DEFAULTS change; rows born after this
-- are 'default'.
--
-- ORDER: paste this FIRST, then the edge function, then deploy the client.
-- Window while only this has landed: the deployed edge resolver looks up
-- 'solo', misses, and falls to its hardcoded "52" floor (source=fallback in
-- the logs) — verdicts keep working on the same version; the table just
-- isn't read, and rows written in the window still stamp 'solo'. The edge
-- paste closes the window (plus up to 60s of warm-instance cache tail).

-- 1. The table row. 'round' stays untouched — dormant, but it's the example
--    that shows the pattern.
update public.prompt_modes
   set mode = 'default', updated_at = now()
 where mode = 'solo';

-- 2. The column default — new rows only; existing rows keep their value.
alter table public.confessions
  alter column mode set default 'default';

-- 3. create_confession's p_mode DEFAULT (and any 'solo' fallback inside its
--    body), rewritten IN PLACE from the LIVE definition. The DO block reads
--    pg_get_functiondef itself, so this migration cannot drift from the
--    deployed body — no hand-copied source involved. CREATE OR REPLACE with
--    the identical signature replaces in place (no overload possible) and
--    PRESERVES the existing grants. Guards: exactly one create_confession
--    must exist, and its definition must still contain a 'solo' literal
--    (otherwise this already ran — refuse rather than guess).
do $$
declare
  _defs text[];
  _def  text;
begin
  select array_agg(pg_get_functiondef(p.oid))
    into _defs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_confession';

  if _defs is null or array_length(_defs, 1) <> 1 then
    raise exception 'expected exactly ONE create_confession, found % — resolve overloads first',
      coalesce(array_length(_defs, 1), 0);
  end if;

  _def := _defs[1];
  if position('''solo''' in _def) = 0 then
    raise exception 'create_confession has no ''solo'' literal — rename already applied?';
  end if;

  _def := replace(_def, '''solo''', '''default''');
  execute _def;
end $$;
```

## Artifact 2 — the edge function (paste SECOND, whole file)

Repo path: `supabase/functions/generate-verdict-DASHBOARD.ts` — the dashboard
master copy; never deployed from the repo. Already renamed (`'default'` in the
resolver's requested-mode default, the fallback-row lookup, and the fallback
return), so it is exactly the post-migration function.

```ts
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DASHBOARD MASTER COPY — NEVER DEPLOYED FROM THIS REPO.               ║
// ║  The real generate-verdict lives ONLY in the Supabase dashboard;      ║
// ║  "deploying" this file means pasting its entire contents there.       ║
// ║  This copy exists so the source is version-controlled and mergeable.  ║
// ║                                                                       ║
// ║  PASTE ORDER — both migrations MUST be live before this is pasted:    ║
// ║   1. the corrective create_confession migration (adds p_mode as the   ║
// ║      7th parameter) — without it the save() call below FAILS and      ║
// ║      confessions stop persisting;                                     ║
// ║   2. 20260807110000_prompt_modes.sql (the table this reads).          ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── IP rate-limiting — PRESERVED VERBATIM from the existing function ──
const hits = new Map<string, { count: number; ts: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.ts > WINDOW_MS) {
    hits.set(ip, { count: 1, ts: now });
    return false;
  }
  rec.count++;
  return rec.count > MAX_PER_WINDOW;
}

const CORS = {
  "Access-Control-Allow-Origin": "https://theboothrecord.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stored OpenAI prompts — referenced by ID. The GATEKEEPER stays pinned to
// v14 below and is NOT mode-routed. The VERDICT version now comes from the
// prompt_modes table (see PROMPT-MODE ROUTING), with the hardcoded floor.
const GATEKEEPER_PROMPT_ID = "pmpt_69e59effe6948197b33b6786606b433707b5865dd86e8a61";
const VERDICT_PROMPT_ID = "pmpt_69e55770a784819598a20db245907c11059b3c8048e22598";

// ── PROMPT-MODE ROUTING (table-driven) ─────────────────────────────────
// RULE CHANGE — deliberate, and anyone reading this needs to know it:
// the settled rule was that the verdict version pin lives as a string
// literal in the callPrompt call and is the single source of truth for
// what's live. THAT RULE IS CHANGED HERE. The console-editable
// public.prompt_modes table is now the source of truth; the literal below
// is a FLOOR, used only when the table is unreachable, slow, or empty.
// If the database is down, verdicts still generate on the floor version.
// General routing layer, NOT round code: venue prompts, experiments,
// seasonal variants all use it. The (shelved) round was to be the first
// caller, not the reason. Do not delete as dead round code.
//
// VERSION FORMAT: OpenAI's Responses API takes the bare number ("52") —
// the old "v52" shorthand would make every call fail. normalizeVersion
// strips a leading v so a console entry of "v53" still works.
const PROMPT_VERSION_FLOOR = "52"; // stays in this function forever

const normalizeVersion = (v: string) => v.trim().replace(/^v/i, "");

// 60-second module-scope cache: fast enough that a console change feels
// immediate, long enough that the read is negligible against an OpenAI
// call. The read gets its own 2s timeout so a slow database can never add
// latency to a confession — on timeout, fall to the floor and carry on.
let _promptModesCache: { at: number; rows: Map<string, string> } | null = null;

// prompt_modes is NOT anon-readable (RLS, admin-only policy) — this read
// needs the SERVICE-ROLE client. The anon client used for create_confession
// below stays exactly as it was.
async function readPromptModes(): Promise<Map<string, string> | null> {
  if (_promptModesCache && Date.now() - _promptModesCache.at < 60_000) {
    return _promptModesCache.rows;
  }
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const res = await Promise.race([
      admin.from("prompt_modes").select("mode,version"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("prompt_modes read timeout")), 2_000),
      ),
    ]);
    const { data, error } = res as {
      data: { mode: string; version: string }[] | null;
      error: unknown;
    };
    if (error || !data || data.length === 0) return null; // empty table → floor
    const rows = new Map(data.map((r) => [r.mode, normalizeVersion(r.version)]));
    _promptModesCache = { at: Date.now(), rows };
    return rows;
  } catch (_) {
    return null; // unreachable or timed out → caller falls to the floor
  }
}

// The fallback chain, in order:
//   table read ok, mode present        → that version
//   table read ok, mode absent         → the table's 'default' row
//   table unreachable/slow/empty,
//   or 'default' row somehow missing   → the hardcoded floor
// The returned mode is the one whose prompt actually answered — an
// unrecognised requested mode records as 'default' on the row.
// ('default' was renamed from 'solo' before anything shipped — the name says
// what it is: the prompt every confession gets unless something says
// otherwise. The name must agree with the prompt_modes seed row and
// create_confession's p_mode default.)
async function resolvePrompt(
  body: unknown,
): Promise<{ mode: string; version: string; from: "table" | "fallback" }> {
  const raw = (body as { mode?: unknown } | null)?.mode;
  const requested =
    typeof raw === "string" && raw.trim() !== ""
      ? raw.trim().toLowerCase().slice(0, 40)
      : "default";
  const rows = await readPromptModes();
  if (rows) {
    const hit = rows.get(requested);
    if (hit !== undefined) return { mode: requested, version: hit, from: "table" };
    const fallbackRow = rows.get("default");
    if (fallbackRow !== undefined) return { mode: "default", version: fallbackRow, from: "table" };
  }
  return { mode: "default", version: PROMPT_VERSION_FLOOR, from: "fallback" };
}
// ── end PROMPT-MODE ROUTING ────────────────────────────────────────────

// Privacy / safety: DO NOT retain blocked confessions at all.
// The gatekeeper cannot be trusted to label the reason correctly (it mislabelled
// minor-safety content as self_harm on 4 Jul), so no label-based storage rule is safe.
// STORE_BLOCKED=false means NO blocked confession of ANY category is written to the DB.
// This removes the entire mislabel failure class. Trade-off: no crisis-review pile for
// gate tuning. Revisit only after a lawyer confirms retention policy + a second engineer
// reviews the gate. STORABLE_REASONS is retained only for reference; it is inert while false.
const STORE_BLOCKED = false;
const STORABLE_REASONS = ["self_harm", "eating_disorder", "abuse", "violence", "medical", "drug_supply"];

// Pull the assistant text out of an OpenAI Responses API object.
// (Path: output[].content[].text / output_text.)
function extractOutputText(resp: unknown): string {
  const r = resp as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (typeof r?.output_text === "string" && r.output_text) return r.output_text;
  for (const item of r?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") return c.text;
    }
  }
  return "";
}

async function callPrompt(key: string, id: string, version: string, confession: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: { id, version, variables: { confession } } }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return extractOutputText(await res.json());
}
async function classifyIllegal(key: string, confession: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: 'You are a stamp-safety classifier. Return ONLY {"illegal": true|false}. Set illegal=true if the confession references illegal activity — including personal illegal drug use (e.g. "did a line", "we split a gram", "took pills"), drug dealing/sourcing, theft, or violence. Set illegal=false for legal-but-messy content: getting drunk, drinking, hangovers, hookups, embarrassing confessions. Alcohol intoxication is legal. When unsure whether a substance is illegal drugs vs legal drinking, lean illegal=true.' },
          { role: "user", content: confession },
        ],
      }),
    });
    if (!res.ok) return true;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text);
    return parsed?.illegal === true;
  } catch {
    return true;
  }
}
async function classifyTopic(key: string, confession: string): Promise<string> {
  const TOPICS = ["wellness","work","dating_sex","friendship","family","money","food_drink","social_performance","vanity","substances","petty","other"];
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: 'You are a topic classifier for anonymous confessions. Pick the ONE best-fitting topic. Return ONLY {"topic": "<value>"} where <value> is exactly one of: wellness, work, dating_sex, friendship, family, money, food_drink, social_performance, vanity, substances, petty, other. Definitions: wellness = self-optimisation, health rituals, detoxes, fitness. work = jobs, colleagues, career. dating_sex = romance, hookups, sex, fidelity. friendship = friends, social obligations, loyalty. family = parents, siblings, children. money = spending, purchases, debt, consumption. food_drink = eating, drinking, alcohol, hangovers. social_performance = pretending, image, fitting in. vanity = appearance, photos, self-image. substances = drugs. petty = small lies, re-gifting, minor deceits. other = fits none of these. Output only the JSON.' },
          { role: "user", content: confession },
        ],
      }),
    });
    if (!res.ok) return "other";
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text);
    const t = typeof parsed?.topic === "string" ? parsed.topic.trim().toLowerCase() : "";
    return TOPICS.includes(t) ? t : "other";
  } catch {
    return "other";
  }
}
// Hardened block detection — tolerant of field-name / value-type variants, as a safety
// layer on top of the gatekeeper's documented { block, reason } shape.
function detectBlock(o: Record<string, unknown>): { block: boolean; reason: string } {
  const truthy = (v: unknown) =>
    v === true || v === 1 ||
    (typeof v === "string" && /^(true|yes|1|block|blocked|unsafe|crisis)$/i.test(v.trim()));
  const block =
    truthy(o?.block) || truthy(o?.blocked) || truthy(o?.is_block) || truthy(o?.is_crisis) ||
    truthy(o?.crisis) || truthy(o?.flag) || truthy(o?.flagged) || truthy(o?.unsafe) ||
    (typeof o?.decision === "string" && /block|unsafe|crisis|hold/i.test(o.decision)) ||
    (typeof o?.action === "string" && /block|hold/i.test(o.action));
  const reason = typeof o?.reason === "string" ? o.reason : (typeof o?.category === "string" ? o.category : "");
  return { block, reason };
}

function parseGate(text: string): { block: boolean; reason: string } {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) t = m[0];
  }
  return detectBlock(JSON.parse(t));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (rateLimited(ip)) return json({ status: "error", error: "Too many confessions. Slow down." }, 429);

    const body = await req.json().catch(() => ({}));
    const confession = typeof body?.confession === "string" ? body.confession.trim() : "";
    if (!confession || confession.length > 1000) {
      return json({ status: "error", error: "Invalid confession." }, 400);
    }
    const source = (typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "direct").slice(0, 100);

    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({ status: "error", error: "Server not configured." }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

    // PROMPT-MODE ROUTING: kicked off IN PARALLEL with the gatekeeper so the
    // table read (cached 60s, 2s ceiling) adds zero latency; awaited only
    // where the mode/version are first needed.
    const promptP = resolvePrompt(body);

    // EVERY save goes through the SECURITY DEFINER rpc (bypasses RLS, clamps status to
    // pending/blocked, returns subject_number). Errors are LOGGED, never swallowed.
    // p_mode records which prompt answered (requires the 7-param create_confession).
    const save = async (status: "pending" | "blocked", verdict: string | null, stampVenue = true, topic: string | null = null) => {
      const { mode } = await promptP;
      const { data, error } = await supabase.rpc("create_confession", {
        p_confession: confession,
        p_verdict: verdict,
        p_source: source,
        p_status: status,
        p_stamp_venue: stampVenue,
        p_topic: topic,
        p_mode: mode,
      });
      if (error) {
        console.error(`[generate-verdict] create_confession failed (status=${status}):`, JSON.stringify(error));
      }
      return { subjectNumber: (data as number | null) ?? null, error };
    };

    // 1–2. GATEKEEPER (retry once). Fail toward silence.
    // NOT mode-routed — the gate stays pinned to v14 regardless of mode.
    let gate: { block: boolean; reason: string } | null = null;
    for (let i = 0; i < 2 && !gate; i++) {
      try {
        gate = parseGate(await callPrompt(key, GATEKEEPER_PROMPT_ID, "14", confession));
      } catch {
        gate = null;
      }
    }
    if (!gate) {
      // Gate failed/unparseable after retry → neutral hold, never a verdict.
      // FAIL-SAFE: unparseable means we don't know the category, so we DO NOT store the text.
      return json({ status: "held" });
    }

    // 3. BLOCK (harmful content caught)
    if (gate.block) {
      // NOTHING blocked is stored (STORE_BLOCKED=false). No row written for any blocked
      // category. This is what guarantees mislabelled minor content can never be retained.
      if (STORE_BLOCKED) await save("blocked", null);
      return json({ status: "blocked", reason: gate.reason });
    }

    // 4. SAFE → verdict + stamp-safety + topic, all IN PARALLEL (hidden in the verdict wait)
    // The verdict version comes from the mode routing (table → floor chain).
    const { mode, version: promptVersion, from: promptFrom } = await promptP;
    // `source=` here distinguishes a working console change from a silently
    // failing table read — without it a broken read looks like a slow rollout.
    console.log(`[generate-verdict] mode=${mode} prompt=${promptVersion} source=${promptFrom}`);
    let verdict = "";
    let illegal = true;
    let topic: string | null = null;
    try {
      const [verdictText, illegalResult, topicResult] = await Promise.all([
        callPrompt(key, VERDICT_PROMPT_ID, promptVersion, confession).then((t) => t.trim()),
        classifyIllegal(key, confession),
        classifyTopic(key, confession),
      ]);
      verdict = verdictText;
      illegal = illegalResult;
      topic = topicResult;
    } catch {
      verdict = "";
    }
    if (!verdict) {
      await save("pending", null);
      return json({ status: "error" });
    }

    const { subjectNumber } = await save("pending", verdict, !illegal, topic);
    return json({ status: "ok", verdict, subject_number: subjectNumber, source, stamp_venue: !illegal });
  } catch (e) {
    return json({ status: "error", error: "Unexpected error.", detail: String(e) }, 500);
  }
});
```

## Artifact 3 — the client diff (deploy THIRD)

Already in the working tree; these are the rename hunks.

`src/pages/Moderate.tsx` — the Confession type comment:

```diff
-  // row. 'solo' is the norm; anything else gets a quiet marker on the row.
+  // row. 'default' is the norm; anything else gets a quiet marker on the row.
```

`src/pages/Moderate.tsx` — the row marker (the literal that would mis-mark
every future row if missed):

```diff
-                        {/* Prompt-mode marker — NON-solo only: solo is the norm
-                            and marking it would be noise. Same quiet register
-                            as the rest of this metadata line. */}
-                        {row.mode && row.mode !== "solo" ? (
+                        {/* Prompt-mode marker — only for a mode that is NEITHER
+                            'default' NOR 'solo': a venue mode, an experiment,
+                            anything genuinely different. 'solo' is unmarked BY
+                            DECISION (7 Aug 2026), not oversight — the mode
+                            backfill stamped every historical row 'solo', so
+                            marking non-default would badge the entire queue,
+                            inverting "the norm is unmarked" while telling you
+                            nothing (those rows predate modes entirely). The
+                            column keeps the distinction for queries; the badge
+                            exists only to catch the unusual. Do NOT "simplify"
+                            this condition to a single comparison. */}
+                        {row.mode && row.mode !== "default" && row.mode !== "solo" ? (
                           <span className="uppercase tracking-wide">{row.mode}</span>
                         ) : null}
```

`src/pages/Moderate.tsx` — both prompt-mode list sorts (fetch effect and add
handler, identical expression in each):

```diff
-            a.mode === "solo" ? -1 : b.mode === "solo" ? 1 : a.mode.localeCompare(b.mode),
+            a.mode === "default" ? -1 : b.mode === "default" ? 1 : a.mode.localeCompare(b.mode),
```

`src/pages/Receiving.tsx` — the deliberate-absence comment above the
generate-verdict invoke:

```diff
-        // No `mode` field — DELIBERATE, not an omission. Solo is the default
-        // at every layer (the edge function's PROMPT_BY_MODE hard-defaults
-        // missing/unrecognised modes to 'solo'; create_confession defaults
-        // p_mode the same way), so the solo path sends nothing and can never
-        // drift from the norm. Non-solo callers (see round.ts) pass it
-        // explicitly.
+        // No `mode` field — DELIBERATE, not an omission. 'default' is the
+        // mode at every layer when none is sent (the edge function's resolver
+        // hard-defaults missing/unrecognised modes to 'default';
+        // create_confession defaults p_mode the same way), so this path sends
+        // nothing and can never drift from the norm. Non-default callers
+        // (see round.ts) pass a mode explicitly.
```

`src/lib/round.ts` — the module-header note (the round still sends
`mode: "round"`, unchanged):

```diff
-// used. Solo deliberately sends NO mode — absence hard-defaults to 'solo' at
-// every layer (edge map, create_confession), so a missing or malformed mode
-// can never change the prompt for everyone.
+// used. The solo flow deliberately sends NO mode — absence hard-defaults to
+// 'default' at every layer (edge resolver, create_confession seed), so a
+// missing or malformed mode can never change the prompt for everyone.
+// ('default' was renamed from 'solo'-the-mode-name before anything shipped;
+// "solo" in prose here still means the one-person flow.)
```

Prose uses of "solo" meaning the one-person *flow* (across the round screens
and comments) are deliberately untouched — the rename covers the mode name
only. A repo-wide sweep confirms no `'solo'` mode-name literals remain outside
the deliberate history comments; build and typecheck are clean.

## Repo parity notes

The two earlier migration files were corrected to record what actually ran —
`20260807110000_prompt_modes.sql` keeps its `'solo'` seeds (what was pasted;
the rename happens in 20260808100000), and
`20260807100000_confession_mode.sql` is marked APPLIED, completed in the
dashboard with `p_mode DEFAULT 'solo'`. Neither is a template to re-run.

**Sharing note:** the embedded edge function includes the OpenAI prompt IDs
and the gatekeeper/classifier setup — fine for teammates, not for anywhere
public.
