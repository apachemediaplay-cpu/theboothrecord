// Booth metrics wiring — post-insert row tagging + share-tap logging.
//
// These call the SECURITY DEFINER RPCs (tag_confession / log_share) added in the
// booth_metrics migration. The confession INSERT itself stays in the generate-verdict
// Edge Function (via create_confession) — untouched. Every call here is fire-and-forget:
// a failure must NEVER block the confess/verdict/share flow; it just leaves a soft metric
// unrecorded.
import { supabase } from "@/integrations/supabase/client";
import { getSessionId, isTestSession, isPhysicalScan } from "@/lib/source";

// These RPCs aren't in the generated types (Functions is empty and can't be regenerated
// without DB access), so cast narrowly here.
type RpcCall = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCall;

// Swallow both resolution and rejection — a metric write must never surface to the user.
function fireAndForget(p: PromiseLike<{ error: unknown }>): void {
  Promise.resolve(p).then(
    () => {},
    () => {},
  );
}

// Tag the just-created confession row (by its subject_number) with this session's id
// and test flag. Called after a successful verdict in Receiving.
export function tagConfession(subjectNumber: number): void {
  fireAndForget(
    rpc("tag_confession", {
      _subject_number: subjectNumber,
      _session_id: getSessionId(),
      _is_test: isTestSession(),
      _physical: isPhysicalScan(),
    }),
  );
}

// Log a share-button tap — share INTENT only, never destination or reach. Called when
// the SHARE VERDICT button is tapped on the verdict card. The logged event is the
// log_share RPC keyed on venue source + session — the button label is never recorded,
// so renaming the button does not affect metric continuity.
export function logShare(source: string | null | undefined): void {
  fireAndForget(
    rpc("log_share", {
      _source: source ?? "",
      _session_id: getSessionId(),
    }),
  );
}

// Log a FIRST OFFENCE ($55) link tap — the app's only commercial signal. logShare's
// shape (source + session) with log_scan's flags (is_test + physical) so venue
// traffic separates from the operator's. Fire-and-forget: the anchor's navigation
// is already in flight and must never be delayed or blocked.
export function logOffenceTap(source: string | null | undefined): void {
  fireAndForget(
    rpc("log_offence_tap", {
      _source: source ?? "",
      _session_id: getSessionId(),
      _is_test: isTestSession(),
      _physical: isPhysicalScan(),
    }),
  );
}

// Log a Booth arrival ("scan") — ONCE per session. Called when someone lands on the
// consent gate. Guarded by a sessionStorage marker keyed on the session id: a refresh or
// back-navigation within the same tab session finds the marker and skips, so one scan is
// counted per session, never per page-load. A new tab / session logs a fresh scan.
//
// The marker is set BEFORE the RPC fires (optimistic) so a fast refresh mid-request can't
// slip a second insert through. Fully fire-and-forget: a failure must NEVER block or delay
// the user entering the Booth. source defaults to 'direct'; is_test carries the ?test=1 flag.
export function logScan(source: string | null | undefined): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const sessionId = getSessionId();
    if (sessionStorage.getItem("booth_scan_logged") === sessionId) return;
    sessionStorage.setItem("booth_scan_logged", sessionId);
    fireAndForget(
      rpc("log_scan", {
        _source: source ?? "direct",
        _session_id: sessionId,
        _is_test: isTestSession(),
        _physical: isPhysicalScan(),
      }),
    );
  } catch {
    /* never block entry on a metric */
  }
}

// ── Wall analytics (wall_events) ─────────────────────────────────────────────

// First-seen marker for anonymous returning/new classification. localStorage holds
// ONLY a first-seen timestamp — no identifier — and the server receives ONLY the
// derived boolean. "Returning" therefore means: this browser had seen the wall in
// an earlier session. localStorage unavailable (private mode) → counts as new.
const SEEN_KEY = "booth_seen";

// Log a wall view — ONCE per session, same optimistic-marker dedup as logScan:
// the marker is set BEFORE the RPC fires so a fast refresh can't double-insert.
// Fully fire-and-forget; a failure never blocks or delays the wall rendering.
export function logWallView(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const sessionId = getSessionId();
    if (sessionStorage.getItem("booth_wall_logged") === sessionId) return;
    sessionStorage.setItem("booth_wall_logged", sessionId);
    let isReturning = false;
    try {
      isReturning = localStorage.getItem(SEEN_KEY) !== null;
      if (!isReturning) localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* localStorage blocked → counts as new, marker simply never persists */
    }
    fireAndForget(
      rpc("log_wall_view", {
        _session_id: sessionId,
        _is_test: isTestSession(),
        _returning: isReturning,
        // Who sent them (session slug, 'direct' when absent) …
        _source: sessionStorage.getItem("source") ?? "direct",
        // … and how they got HERE: a session that passed the consent gate
        // (booth_scan_logged) reached the wall by internal navigation; one that
        // didn't landed on the wall cold (IG wall link, shared URL, bookmark).
        // Marker-derived, so stripping URL params can't fake an external landing.
        _arrival:
          sessionStorage.getItem("booth_scan_logged") === sessionId ? "internal" : "direct",
      }),
    );
  } catch {
    /* never block the wall on a metric */
  }
}

// Mark this session's wall visit engaged after 15s of CUMULATIVE VISIBLE time.
// The clock only runs while the tab is visible (visibilitychange pauses it), so
// backgrounding can't overcount; closing before 15s simply never fires — a bounce
// writes nothing, which is what makes the metric trustworthy. Fires at most once
// per session (sessionStorage marker). Returns a cleanup fn for the mount effect.
export function trackWallEngagement(): () => void {
  try {
    if (typeof document === "undefined" || typeof sessionStorage === "undefined") {
      return () => {};
    }
    const sessionId = getSessionId();
    if (sessionStorage.getItem("booth_wall_engaged") === sessionId) return () => {};

    const THRESHOLD_MS = 15_000;
    let elapsed = 0; // visible ms accumulated across hide/show cycles
    let visibleSince: number | null =
      document.visibilityState === "visible" ? Date.now() : null;
    let timer: number | undefined;
    let done = false;

    const cleanup = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };

    const fire = () => {
      if (done) return;
      done = true;
      sessionStorage.setItem("booth_wall_engaged", sessionId);
      fireAndForget(rpc("mark_wall_engaged", { _session_id: sessionId }));
      cleanup();
    };

    // (Re)arm the countdown for the REMAINING visible time; disarm while hidden.
    const schedule = () => {
      window.clearTimeout(timer);
      if (visibleSince !== null && !done) {
        timer = window.setTimeout(fire, Math.max(0, THRESHOLD_MS - elapsed));
      }
    };

    const onVisibility = () => {
      if (done) return;
      if (document.visibilityState === "visible") {
        visibleSince = Date.now();
      } else {
        if (visibleSince !== null) elapsed += Date.now() - visibleSince;
        visibleSince = null;
      }
      schedule();
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return cleanup;
  } catch {
    return () => {};
  }
}

// Resolve THIS confession's uuid share id. Owner-gated server-side (session id + verdict),
// so it can't be used to map a sequential subject_number to a uuid. Returns the uuid
// string for the share link, or null if ownership wasn't proven / on error.
export async function resolveShareId(subjectNumber: number, verdict: string): Promise<string | null> {
  try {
    const { data, error } = await rpc("resolve_share_id", {
      _subject_number: subjectNumber,
      _session_id: getSessionId(),
      _verdict: verdict,
    });
    if (error) return null;
    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}

// Fetch a shared verdict by its uuid, for the public /v/:id page. Keyed only by the
// unguessable uuid (get_share_verdict) — returns null for an unknown/invalid id.
export type SharedVerdict = {
  subject_number: number;
  confession_text: string;
  verdict_text: string;
  source: string;
  // From get_share_verdict. false = suppress the venue name (show the withheld fallback);
  // absent/true = show the venue as normal.
  stamp_venue?: boolean;
};
export async function fetchSharedVerdict(id: string | undefined): Promise<SharedVerdict | null> {
  if (!id) return null;
  try {
    const { data, error } = await rpc("get_share_verdict", { _id: id });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data[0] as SharedVerdict;
  } catch {
    return null;
  }
}
