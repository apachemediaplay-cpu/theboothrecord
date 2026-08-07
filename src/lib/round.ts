// The round — several people confess in turn, verdicts reveal at the end.
//
// STATUS: SHELVED, NOT DELETED. The gate's PASS IT ROUND link was removed —
// passing a phone is effort the payoff doesn't justify — so the /round/*
// routes are reachable by URL only. This module and the five Round* screens
// stay in the codebase deliberately; do not clean them up as dead code.
//
// THE MODE PLUMBING STAYS TOO — it will look like round code and it is not.
// The mode plumbing (confessions.mode + create_confession's p_mode, the mode
// field on the generate-verdict body sent below, PROMPT_BY_MODE in the
// dashboard-managed edge function) is a GENERAL ROUTING LAYER: it routes any
// subset of confessions through a different pinned prompt — venue-specific
// prompts, experiments, seasonal variants. The round was to be the FIRST
// CALLER, not the reason. It stays regardless of whether the round is ever
// used. Solo deliberately sends NO mode — absence hard-defaults to 'solo' at
// every layer (edge map, create_confession), so a missing or malformed mode
// can never change the prompt for everyone.
//
// THE CRITICAL MECHANIC: generation runs in the BACKGROUND. Solo waits on
// /receiving for 12–25s; a round fires generate-verdict at submit and goes
// straight to Pass-the-phone, so verdicts accumulate while the next person
// types. By the last confession the earlier ones are already back.
//
// WHY A MODULE, not context or a route param: the in-flight promises are the
// state that must survive navigation, and promises can't live in sessionStorage
// or a URL. A module outlives every component tree — screens unmount, the
// invoke keeps running, and its .then() writes into this store. React context
// would just re-expose this module behind a provider while adding a remount
// hazard; a route param can hold neither promises nor N confessions (and URL
// params are untrusted, never rendered). sessionStorage MIRRORS the settled
// slots only, purely for the same-session-return mitigation below.
//
// ABANDONED ROUNDS EVAPORATE — by design. The confessions are already rows in
// the database (same create path as solo); the round wrapper is disposable.
// No persistence, no resumption, no expiry. The one mitigation: returning to
// /round/* in the same session after a RELOAD rehydrates settled verdicts from
// the sessionStorage mirror, and slots whose invoke died with the old page get
// one recover_verdict attempt (the row exists — only the response was lost,
// exactly the solo timeout situation). In-flight calls survive CLIENT-SIDE
// navigation untouched; the rehydrate path only matters after a real reload.
//
// Every confession here writes to the DB exactly as a solo one: the same
// generate-verdict function (which runs create_confession), the same source
// from sessionStorage, and the same tagConfession call stamping session_id +
// is_test + physical — the round is a browser-side wrapper, not a new kind of
// confession, and rows land in the same moderation queue.
import { supabase } from "@/integrations/supabase/client";
import { tagConfession, recoverVerdict } from "@/lib/metrics";

export type RoundSlotStatus = "pending" | "done" | "failed";

export type RoundSlot = {
  confession: string;
  status: RoundSlotStatus;
  verdict: string | null;
  subjectNumber: number | null;
};

export type RoundState = {
  size: number; // 2–5
  slots: RoundSlot[]; // one per SUBMITTED confession, in order
  // True once the STRIP has been reached — the round's real end. A round is
  // UNFINISHED (and every screen honours it) from the first number tap until
  // the strip, GO AGAIN, or the tab closing. Filing the last confession does
  // NOT end it: the bug this field fixes was roundActive() treating full
  // slots as "no round", so browser-back from Deliberating dropped /confess
  // into solo mode mid-reveal. Missing on old mirrors → falsy → unfinished.
  revealed?: boolean;
};

// Same ceiling as the solo /receiving screen — see its VERDICT_TIMEOUT_MS.
const ROUND_VERDICT_TIMEOUT_MS = 35_000;
const STORAGE_KEY = "booth_round";
const TIMED_OUT = Symbol("round-verdict-timeout");

let round: RoundState | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

// Mirror SETTLED data only — promises are unserialisable and stay in-module.
const persist = () => {
  try {
    if (round) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(round));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage full/blocked — the mirror is best-effort only */
  }
};

export function subscribeRound(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function startRound(size: number): void {
  round = { size: Math.min(5, Math.max(2, size)), slots: [], revealed: false };
  persist();
  notify();
}

// The strip marks the round revealed on mount — reaching it IS the round
// ending. After this, /confess is solo again and /round shows a fresh picker
// (which is how GO AGAIN works without clearing anything: the store survives
// for the strip's own back/forward, but no flow screen claims it any more).
export function markRevealed(): void {
  if (!round || round.revealed) return;
  round.revealed = true;
  persist();
  notify();
}

// "Running and unfinished" — THE predicate every flow screen honours (the
// rule: a round in progress survives any navigation; back, forward, reload).
// True from the first number tap until the strip. Distinct from
// roundActive(), which is only the COLLECTING phase (drives the confess
// counter and submit branch); conflating the two was the back-button bug.
export function roundInFlight(): boolean {
  const r = getRound();
  return !!r && !r.revealed;
}

export function clearRound(): void {
  round = null;
  persist();
  notify();
}

// Rehydrate after a reload: settled slots come back verbatim; slots that were
// still pending lost their invoke with the old page, so each gets ONE
// recover_verdict attempt (row exists; response lost) and otherwise fails —
// "show whatever verdicts have come back rather than nothing".
export function getRound(): RoundState | null {
  if (round) return round;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoundState;
    if (!parsed || typeof parsed.size !== "number" || !Array.isArray(parsed.slots)) return null;
    round = parsed;
    round.slots.forEach((slot, i) => {
      if (slot.status === "pending") recoverSlot(i);
    });
    return round;
  } catch {
    return null;
  }
}

// True while a round is mid-collection — the flag Confess branches on. A full
// round (all confessions submitted) is no longer "active" for Confess purposes.
export function roundActive(): boolean {
  const r = getRound();
  return !!r && r.slots.length < r.size;
}

// 0-based index of the NEXT confession — display as {index+1} OF {size}.
export function roundIndex(): number {
  return getRound()?.slots.length ?? 0;
}

export function roundSettled(): boolean {
  const r = getRound();
  return !!r && r.slots.length >= r.size && r.slots.every((s) => s.status !== "pending");
}

const setSlot = (index: number, patch: Partial<RoundSlot>) => {
  if (!round || !round.slots[index]) return;
  round.slots[index] = { ...round.slots[index], ...patch };
  persist();
  notify();
};

const recoverSlot = (index: number) => {
  const slot = round?.slots[index];
  if (!slot) return;
  const source = sessionStorage.getItem("source") || "direct";
  recoverVerdict(slot.confession, source).then((result) => {
    if (result.status === "found") {
      setSlot(index, {
        status: "done",
        verdict: result.row.verdict_text,
        subjectNumber: result.row.subject_number ?? null,
      });
      return;
    }
    setSlot(index, { status: "failed" });
  });
};

// Fire generation and RETURN IMMEDIATELY — the caller navigates to
// Pass-the-phone while this runs. The promise belongs to this module, so it
// survives every navigation; resolution writes into the slot and notifies.
// Failure shape: blocked / held / error / timeout all mark the slot failed and
// the round CONTINUES — one failure must not kill the round.
//
// HELD AND BLOCKED COLLAPSE TO THE NEUTRAL FAILED SLOT — DELIBERATE, SETTLED,
// do not "fix" this by surfacing the solo screens in a round. The reasoning:
// solo, a held confession gets a private screen with support on it, seen by
// the person who wrote it, ALONE. In a round that screen would appear at
// REVEAL — minutes later, on a phone being passed around, with three friends
// watching. It would out someone at the worst possible moment. The exposure
// harm is certain; the help a crisis screen provides at a table is not,
// because the person can't act on it with people watching. So in a round:
// the same neutral copy as any failed slot ("Nothing on record."), NEXT
// advances, nothing is signalled to the table. The permanent support link on
// the consent screens exists BECAUSE of this — reachable without being
// triggered, so needing it never shows.
// Detection and storage are UNCHANGED: the confession still writes and still
// flags in moderation exactly as it would solo (the edge function decides
// status server-side before we see it) — only what the screen shows differs.
// The solo flow keeps its dedicated /held and /blocked screens untouched.
//
// A timeout gets the same single recovery attempt the solo path gets.
export function submitRoundConfession(confession: string): void {
  const r = getRound();
  if (!r || r.slots.length >= r.size) return;
  const index = r.slots.length;
  r.slots.push({ confession, status: "pending", verdict: null, subjectNumber: null });
  persist();
  notify();

  const source = sessionStorage.getItem("source") || "direct";
  Promise.race([
    // mode: "round" — the prompt-mode routing layer (see the module header).
    // The edge function resolves it against PROMPT_BY_MODE and records it on
    // the row via create_confession; solo callers omit the field entirely.
    supabase.functions.invoke("generate-verdict", { body: { confession, source, mode: "round" } }),
    new Promise<never>((_, reject) => setTimeout(() => reject(TIMED_OUT), ROUND_VERDICT_TIMEOUT_MS)),
  ])
    .then((res) => {
      const { data, error } = res as { data: Record<string, unknown> | null; error: unknown };
      if (error || !data || data.status !== "ok" || typeof data.verdict !== "string") {
        setSlot(index, { status: "failed" });
        return;
      }
      const subjectNumber = data.subject_number != null ? Number(data.subject_number) : null;
      // Same session/is_test/physical stamp as the solo path's applyVerdict.
      if (subjectNumber != null) tagConfession(subjectNumber);
      setSlot(index, { status: "done", verdict: data.verdict, subjectNumber });
    })
    .catch((e) => {
      if (e === TIMED_OUT) {
        recoverSlot(index);
        return;
      }
      setSlot(index, { status: "failed" });
    });
}

// Number words for the deliberating/strip headlines ("Four on record.").
export const ROUND_WORDS: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
};
