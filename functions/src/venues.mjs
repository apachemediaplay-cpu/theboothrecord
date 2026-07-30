// Venue display-name resolution for the share endpoints (ogImage + share).
//
// Resolution order — mirrors the client's resolveVenueDisplayName (src/lib/source.ts):
//   1. venues.json (PRIMARY, unchanged): functions/venues.json, the copy of
//      src/data/venues.json made by prep.mjs + the deploy predeploy hook. A slug found
//      here returns immediately — the DB is NEVER consulted for existing venues.
//   2. ONLY for slugs the file doesn't know (console-added venues): public.venues over
//      PostgREST with the anon key — same public read path the app uses, plain fetch,
//      no supabase-js (its client constructor breaks on this runtime; see fetchVerdict).
//      The name is used ONLY if the row exists AND active === true — the console
//      kill-switch. Deliberately UNCACHED so toggling a venue inactive takes effect on
//      the next render, not the next cold start (the PNG's own CDN caching is a
//      pre-existing, separate matter).
//   3. Everything else FAILS CLOSED to "": unknown slug, inactive row, non-200,
//      network error, or the 1.5s timeout — the card renders LOCATION WITHHELD and the
//      render can never hang on this lookup.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// Lazily read + memoized (the file is immutable for the life of the deploy).
let _venueMap = null;
async function loadVenues() {
  if (!_venueMap) {
    try {
      const data = JSON.parse(await readFile(join(__dir, "..", "venues.json"), "utf8"));
      _venueMap = Object.fromEntries(
        Object.entries(data).map(([slug, v]) => [slug.toLowerCase(), v]),
      );
    } catch {
      _venueMap = {};
    }
  }
  return _venueMap;
}

async function dbVenueFor(slug) {
  try {
    const key = process.env.SUPABASE_ANON_KEY;
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/venues?select=display_name,active&source=eq.${encodeURIComponent(slug)}&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!r.ok) return "";
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row || row.active !== true) return "";
    return String(row.display_name || "").trim();
  } catch {
    return "";
  }
}

export async function venueFor(source) {
  const m = await loadVenues();
  const slug = (source || "").toLowerCase();
  const fromJson = m[slug]?.displayName || "";
  if (fromJson) return fromJson; // PRIMARY path — DB never consulted
  if (!slug || slug === "direct") return "";
  return dbVenueFor(slug);
}
