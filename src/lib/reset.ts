import { clearRound } from "@/lib/round";

// ── BOOTH RESET — hand the device to the next person ────────────────────────
// The kiosk runs one long browser session for a whole night, so "a new person"
// has to be made explicit: rotate the session identity, wipe the last
// confession, keep the things that describe the DEVICE rather than the person.
//
// ONLY called on the way OUT to the gate:
//   * the idle timeout on /confess and /verdict
//   * Held's Close and Blocked's Close
// NEVER on Verdict mount. The comment in Confess.handleSubmit records why the
// verdict keys are cleared at submit and not on mount: mount-clearing destroyed
// an unshared verdict two taps into the main flow. The same rule applies here —
// arriving at a screen must never cost someone their record.

// A share-uuid resolve in flight owns the CURRENT session id: resolveShareId is
// gated on it, so rotating mid-resolve would orphan the lookup and the kiosk's
// QR would point at nothing. Verdict marks the window; reset refuses inside it.
let shareResolvesInFlight = 0;

export function beginShareResolve(): void {
  shareResolvesInFlight += 1;
}

export function endShareResolve(): void {
  shareResolvesInFlight = Math.max(0, shareResolvesInFlight - 1);
}

export function shareResolveInFlight(): boolean {
  return shareResolvesInFlight > 0;
}

// KEPT, deliberately — these describe the device and its venue, not the person:
//   source, venueName  the booth's own venue (captureSourceFromUrl owns them)
//   is_test            a test booth stays a test booth all night
//   promptMode         the venue's verdict prompt routing
//   kiosk              the flag that makes this a booth at all — wiping it
//                      would turn the kiosk into a phone mid-night
const WIPE_KEYS = [
  "confession",
  "verdictResponse",
  "subjectNumber",
  "verdictSource",
  "stampVenue",
  "filedAt",
  "consent",
];

// ROTATED — a fresh identity for the next person. booth_session_id is minted
// eagerly (not just removed) so anything that logs immediately after the reset
// lands on the NEW id; the three *_logged flags are per-session guards, and
// dropping them lets the next session record its own scan and wall events.
const ROTATE_KEYS = ["booth_scan_logged", "booth_wall_logged", "booth_wall_engaged"];

export function resetBoothSession(): boolean {
  if (shareResolveInFlight()) return false;
  try {
    for (const k of WIPE_KEYS) sessionStorage.removeItem(k);
    for (const k of ROTATE_KEYS) sessionStorage.removeItem(k);
    sessionStorage.setItem(
      "booth_session_id",
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    );
    clearRound();
  } catch {
    // sessionStorage can throw in locked-down webviews; a failed reset must
    // never block the navigation home that follows it.
  }
  return true;
}
