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
  }
  // no params → fall back to stored (both kept as-is)

  return sessionStorage.getItem("source");
}

// Single slug-keyed venue table — the ONE source of truth for both the share-card
// display name AND the on-screen /confess prompt. Slugs MUST match the QR and the DB
// `source` column exactly. Live approved rows use `seoultiger1988` / `frenchiecbdb`;
// the old bare "seoultiger"/"frenchie" keys were a slug mismatch (never in the DB) and
// have been renamed/replaced here so source-only links resolve instead of falling through.
export type Venue = { displayName: string; headline: string; guidance?: string };

const VENUES: Record<string, Venue> = {
  seoultiger1988: {
    displayName: "Seoul Tiger 1988",
    headline: "Confess your most guilty order.",
    guidance: "The one you'd never admit to.",
  },
  frenchiecbda: {
    displayName: "Frenchie",
    headline: "Everyone here is guilty.",
    guidance: "Yours first.",
  },
  frenchiecbdb: {
    displayName: "Frenchie",
    headline: "We already know.",
    guidance: "Say it anyway.",
  },
  frenchiecbd: {
    displayName: "Frenchie",
    headline: "Everyone here is guilty.",
    guidance: "Yours first.",
  },
};

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

// Resolve the share-card display name in strict priority order:
//   1. an explicit venue= captured from the URL → use it directly.
//   2. else, frozen table lookup on the source slug.
//   3. else (unknown slug, or direct/empty) → "" → caller renders LOCATION WITHHELD.
// NEVER returns a raw uppercased slug.
export function venueDisplayName(
  venueParam: string | null | undefined,
  source: string | null | undefined,
): string {
  const v = (venueParam || "").trim();
  if (v) return v; // priority 1

  const s = (source || "").trim().toLowerCase();
  if (s && s !== "direct" && VENUES[s]) return VENUES[s].displayName; // priority 2

  return ""; // priority 3 → LOCATION WITHHELD (never the raw slug)
}
