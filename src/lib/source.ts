import venuesData from "@/data/venues.json";

// Venue attribution + display-name resolution (single source of truth).
//
// Capture rule: the ?source= / ?venue= URL params ALWAYS overwrite stored attribution
// on every load; fall back to stored only when neither param is present.
//   - source  → the attribution slug written to the DB `source` column.
//   - venue   → an explicit human display name for the share card (primary display path).
//
// Returns the effective source (or null if none has ever been set).
export function captureSourceFromUrl(search: string = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const sourceParam = (params.get("source") || "").trim();
  const venueParam = (params.get("venue") || "").trim();
  const testParam = (params.get("test") || "").trim();
  const isTestLink = testParam === "1" || testParam.toLowerCase() === "true";

  // source and venue are FULLY INDEPENDENT — venue= can NEVER write to the source key.
  if (sourceParam || venueParam) {
    // source: ONLY ever the clean source= machine key (DB grouping / counting). A venue-only
    // link leaves source empty → the confession counts as "venue unknown", never the display string.
    if (sourceParam) {
      sessionStorage.setItem("source", sourceParam.slice(0, 100));
    } else {
      sessionStorage.removeItem("source");
    }

    // venue: display name only, from venue=. Cleared on a source-only link (no leakage).
    if (venueParam) {
      sessionStorage.setItem("venueName", venueParam.slice(0, 100));
    } else {
      sessionStorage.removeItem("venueName");
    }

    // test flag: append ?test=1 to a venue QR to mark a test scan. A fresh scan link
    // decides it; a plain (non-test) scan link clears it. Repeat confessions ("go
    // deeper") load a param-less URL and skip this whole block, so is_test STICKS
    // across repeats — the same persistence guarantee as source.
    if (isTestLink) {
      sessionStorage.setItem("is_test", "1");
    } else {
      sessionStorage.removeItem("is_test");
    }
  }
  // no params → fall back to stored (source, venueName, is_test all kept as-is)

  return sessionStorage.getItem("source");
}

// Stable per-session id: survives client-side nav within the session, resets on a new
// tab/session. Written to every confession row (via tag_confession) so we can later see
// confessions-per-session without inflating any venue count.
export function getSessionId(): string {
  let id = sessionStorage.getItem("booth_session_id");
  if (!id) {
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("booth_session_id", id);
  }
  return id;
}

// True when this session arrived via a ?test=1 scan link (see captureSourceFromUrl).
// Persists across repeat confessions exactly like source.
export function isTestSession(): boolean {
  return sessionStorage.getItem("is_test") === "1";
}

// Venue config — the ONE source of truth for both the share-card display name AND the
// on-screen /confess prompt, per slug. Slugs MUST match the QR and the DB `source` column.
//
// SINGLE SOURCE: the data lives in src/data/venues.json. This client imports it directly
// (bundled at build → prompt resolution stays synchronous). The share-card OG function
// (functions/index.mjs) reads the SAME file via a copy (functions/venues.json), because a
// deployed Cloud Function can only read files inside its own bundle — the copy is made by
// functions/prep.mjs and the deploy predeploy hook. Add a venue in venues.json ONLY.
export type Venue = { displayName: string; headline: string; guidance?: string };

const VENUES = venuesData as Record<string, Venue>;

// Confess-page prompt resolution. Unknown or absent source → headline only, no guidance.
type Prompt = { headline: string; guidance?: string };
const DEFAULT_PROMPT: Prompt = { headline: "Confess something." };

export function getPrompt(source?: string | null): Prompt {
  // Lowercase to match venueDisplayName()'s lookup casing — slugs are canonically
  // lowercase, so a mixed-case source still resolves to the same venue.
  const s = (source || "").trim().toLowerCase();
  if (!s) return DEFAULT_PROMPT;
  return VENUES[s] ?? DEFAULT_PROMPT;
}

// Resolve the display name from the SOURCE SLUG ONLY — venues.json is the single source
// of truth for venue names.
//
// SECURITY: the ?venue= URL param is deliberately NOT consulted. It used to be trusted
// verbatim and take priority, which meant (a) any crafted URL could print any venue's name
// onto a share card, and (b) deleting a venue from venues.json did NOT stop its name
// printing, because physical cards carry ?venue= (this is why "Rye High Society" kept
// appearing after the venue was removed). Resolving from the slug alone makes venues.json
// a real kill switch. ?venue= is still captured by captureSourceFromUrl because
// isPhysicalScan() depends on it — it just never reaches a rendered card.
//
// NOTE: the first parameter is retained and IGNORED so the existing call sites keep
// compiling unchanged. Do not reintroduce it into the resolution — that is the vulnerability.
//
// Unknown / absent / "direct" slug → "" → caller renders LOCATION WITHHELD (never a raw slug).
export function venueDisplayName(
  _venueParamIgnored: string | null | undefined,
  source: string | null | undefined,
): string {
  const s = (source || "").trim().toLowerCase();
  if (s && s !== "direct" && VENUES[s]) return VENUES[s].displayName;

  return ""; // → LOCATION WITHHELD (never the raw slug, never the URL param)
}

// Fail closed: ONLY an explicit true permits stamping a venue name onto a card. undefined,
// null, a missing column, or a failed fetch all mean "do not stamp". Used by every read site
// (save-image card, /v/:id page, OG image, og:title) so the default is never to stamp.
export const mayStampVenue = (v: unknown): boolean => v === true;

// True when this session arrived via a printed venue card. Physical cards ALWAYS carry
// ?venue= (print spec); share-through and IG links carry ?source= only. captureSourceFromUrl
// stores venueName from ?venue= and clears it on a source-only link, so a non-empty venueName
// is exactly "arrived via a physical card" — the signal separating an in-room scan from remote
// share-through traffic that carries the same venue source.
export function isPhysicalScan(): boolean {
  return !!(sessionStorage.getItem("venueName") || "").trim();
}
