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
