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
 *  nothing to put on screen, and a reel with no verdict is not a reel. */
export async function buildReels(rows: ReelRow[]): Promise<number> {
  const usable = rows.filter(
    (r) => r.verdict_text && r.verdict_text.trim() && confessionOf(r)
  );
  if (!usable.length) return 0;
  const payload = usable.map((r) => ({
    confession: confessionOf(r),
    verdict: (r.verdict_text as string).trim(),
    ...(r.subject_number ? { subject: r.subject_number } : {}),
  }));
  await navigator.clipboard.writeText(REEL_MARKER + JSON.stringify(payload));
  return usable.length;
}

// ── per row, beside ☆ Feature ────────────────────────────────

export function ReelAction({ row }: { row: ReelRow }) {
  const [sent, setSent] = useState(false);
  if (!row.verdict_text) return null;

  const go = async () => {
    if (await buildReels([row])) {
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={go}
      disabled={sent}
      className={"text-[11px] " + (sent ? "text-ritual" : "text-muted-foreground")}
    >
      {sent ? "Queued" : "▸ Reel"}
    </Button>
  );
}

// ── bulk, beside Approve all / Reject all ────────────────────

export function ReelBulkAction({ rows }: { rows: ReelRow[] }) {
  const [sent, setSent] = useState(false);
  const n = rows.filter((r) => r.verdict_text && r.verdict_text.trim()).length;
  if (!n) return null;

  const go = async () => {
    if (await buildReels(rows)) {
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={go}
      disabled={sent}
      className="border-ritual text-ritual hover:bg-ritual/10"
    >
      {sent ? "Queued — watch the terminal" : `Build ${n} ${n === 1 ? "reel" : "reels"}`}
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
