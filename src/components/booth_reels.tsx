// Console → reels.
//
// Puts a JSON payload on the clipboard. booth_watch.py, running on the
// Mac since login, reads it, checks the shape and builds each reel.
// Nothing that leaves this file is ever run as a command.
//
// Works on any tab — approval is not required. The checkbox and the
// Approve button are independent.

import { useState } from "react";
import { Button } from "@/components/ui/button";

const REEL_MARKER = "BOOTH_REEL ";

// Matches the confessions row. The verdict column is verdict_text; the
// confession column name varies, so read whichever is present rather
// than guessing wrong and shipping empty reels.
export type ReelRow = {
  id: string | number;
  verdict_text: string | null;
  subject_number?: number | null;
  text?: string | null;
  confession?: string | null;
  confession_text?: string | null;
};

const confessionOf = (r: ReelRow) =>
  (r.text ?? r.confession ?? r.confession_text ?? "").trim();

/** Copies the payload. Rows without a verdict are skipped — there is
 *  nothing to put on screen, and a reel with no verdict is not a reel.
 *
 *  Return value distinguishes the three outcomes so the buttons can't
 *  lie: n = queued, 0 = no usable rows (nothing to build), null = the
 *  CLIPBOARD WRITE FAILED. The write used to be un-caught: a throw was
 *  swallowed by the caller's `if (await buildReels(...))` and the button
 *  still showed "Queued" over an empty clipboard. */
export async function buildReels(rows: ReelRow[]): Promise<number | null> {
  const usable = rows.filter(
    (r) => r.verdict_text && r.verdict_text.trim() && confessionOf(r)
  );
  if (!usable.length) return 0;
  const payload = usable.map((r) => ({
    confession: confessionOf(r),
    verdict: (r.verdict_text as string).trim(),
    ...(r.subject_number ? { subject: r.subject_number } : {}),
  }));
  try {
    await navigator.clipboard.writeText(REEL_MARKER + JSON.stringify(payload));
  } catch (e) {
    // Surface the real browser error (permissions, insecure context, focus)
    // so the next failure is diagnosable instead of costing twenty minutes.
    console.error("Reel clipboard write failed:", e);
    return null;
  }
  return usable.length;
}

// ── per row, beside ☆ Feature ────────────────────────────────

// Transient button states. "Queued" only ever shows on a CONFIRMED write;
// the two zero-ish outcomes get their own copy — a failed clipboard write
// ("Copy failed") is a different problem from rows with nothing usable in
// them ("Nothing to build"), and both must be visible, not silent.
type ReelStatus = "idle" | "queued" | "failed" | "empty";

const statusOf = (result: number | null): ReelStatus =>
  result === null ? "failed" : result === 0 ? "empty" : "queued";

export function ReelAction({ row }: { row: ReelRow }) {
  const [status, setStatus] = useState<ReelStatus>("idle");
  if (!row.verdict_text) return null;

  const go = async () => {
    const next = statusOf(await buildReels([row]));
    setStatus(next);
    setTimeout(() => setStatus("idle"), 2500);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={go}
      disabled={status !== "idle"}
      className={
        "text-[11px] " +
        (status === "queued"
          ? "text-ritual"
          : status === "idle"
            ? "text-muted-foreground"
            : "text-destructive")
      }
    >
      {status === "queued"
        ? "Queued"
        : status === "failed"
          ? "Copy failed"
          : status === "empty"
            ? "Nothing to build"
            : "▸ Reel"}
    </Button>
  );
}

// ── bulk, beside Approve all / Reject all ────────────────────

export function ReelBulkAction({ rows }: { rows: ReelRow[] }) {
  const [status, setStatus] = useState<ReelStatus>("idle");
  const n = rows.filter((r) => r.verdict_text && r.verdict_text.trim()).length;
  if (!n) return null;

  const go = async () => {
    const next = statusOf(await buildReels(rows));
    setStatus(next);
    setTimeout(() => setStatus("idle"), 4000);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={go}
      disabled={status !== "idle"}
      className={
        status === "failed" || status === "empty"
          ? "border-destructive text-destructive hover:bg-transparent"
          : "border-ritual text-ritual hover:bg-ritual/10"
      }
    >
      {status === "queued"
        ? "Queued — watch the terminal"
        : status === "failed"
          ? "Copy failed"
          : status === "empty"
            ? "Nothing to build"
            : `Build ${n} ${n === 1 ? "reel" : "reels"}`}
    </Button>
  );
}

// ── wiring ───────────────────────────────────────────────────
//
// Per row, next to the Feature button:
//
//   <ReelAction row={row} />
//
// In the bulk bar, next to Approve all / Reject all, where selectedRows
// is whatever your existing checkbox selection already gives you:
//
//   <ReelBulkAction rows={selectedRows} />
//
// navigator.clipboard needs a click and a secure context. localhost and
// https both qualify; plain http fails silently.
