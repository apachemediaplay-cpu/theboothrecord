import { supabase } from "@/integrations/supabase/client";

// Rotating /confess placeholder sets, one per venue register (venues.register in
// Supabase). Register drives ONLY this placeholder content — never the headline
// (getPrompt), the verdict, or the share card.
//
// DTC is the default AND the fail-safe: no source, unknown source, unknown register,
// or a failed venues lookup all resolve to DTC. Never an error, never an empty set.

export type Register = "social" | "intimate" | "edgy";

const DTC: string[] = [
  "left before the second round",
  "think about someone else to finish",
  "only nice to people who want something",
  "check my sleep score before i feel tired",
  "finish quicker when i want them gone",
  "keep his coffee order, not his name",
];

const SOCIAL: string[] = [
  "ordered for the table so i'd get the last piece",
  "said i was full two plates ago",
  "picked this place so he'd think i was interesting",
  "keep topping everyone up so i drink faster",
  "loudest one here, quietest one in the car home",
  "already know who i'm gossiping about after",
];

const INTIMATE: string[] = [
  "ordered the wine i can't pronounce so he'd think i knew",
  "laugh, then check if he's looking",
  "opened the good bottle so tonight would count",
  "said i wasn't hungry so he'd share",
  "already rehearsing how i'll tell this",
  "here with him, texting her under the table",
];

const EDGY: string[] = [
  "came out to not go home with who i came with",
  "wore this for a photo, not for him",
  "only interesting three drinks in",
  "came for a night i can blame on the room",
  "know this ends badly, ordered another",
  "here for the me that doesn't text back",
];

const SETS: Record<Register, string[]> = {
  social: SOCIAL,
  intimate: INTIMATE,
  edgy: EDGY,
};

// null / undefined / anything unrecognised → DTC. The one resolution path every
// caller goes through, so the fail-safe can't be bypassed.
export function getPlaceholderLines(register?: string | null): string[] {
  const r = (register || "").trim().toLowerCase();
  return SETS[r as Register] ?? DTC;
}

// venues isn't in the generated Database types (forward-only table, same situation as
// the admin_* RPCs in Moderate.tsx) — cast narrowly at the one call site.
type VenuesRow = {
  register: string | null;
  headline: string | null;
  guidance: string | null;
};
type VenuesQuery = {
  select(cols: string): {
    eq(
      col: string,
      val: string,
    ): {
      maybeSingle(): Promise<{ data: VenuesRow | null; error: unknown }>;
    };
  };
};

// The per-venue confess-screen config held in public.venues: register (placeholder
// set) + headline/guidance (the greeting, moved out of venues.json). One row, one
// fetch — the confess screen resolves everything venue-driven in a single lookup.
export type VenueConfig = VenuesRow;

const NO_CONFIG: VenueConfig = { register: null, headline: null, guidance: null };

// Resolve source slug → config from public.venues (public read policy; anon key).
// EVERY failure path returns all-nulls → register lands on DTC and the greeting
// lands on DEFAULT_PROMPT: no source, unknown source, network/RLS error, or a
// rejected promise. Never throws.
export async function fetchVenueConfig(source?: string | null): Promise<VenueConfig> {
  const s = (source || "").trim().toLowerCase();
  if (!s) return NO_CONFIG;
  try {
    const from = supabase.from.bind(supabase) as unknown as (table: string) => VenuesQuery;
    const { data, error } = await from("venues")
      .select("register,headline,guidance")
      .eq("source", s)
      .maybeSingle();
    if (error || !data) return NO_CONFIG;
    return {
      register: data.register ?? null,
      headline: data.headline ?? null,
      guidance: data.guidance ?? null,
    };
  } catch {
    return NO_CONFIG;
  }
}

// Register-only view of the config, kept for callers that don't need the greeting
// (Moderate's report card). Same fail-safe: every failure path is null → DTC.
export async function fetchVenueRegister(source?: string | null): Promise<string | null> {
  const cfg = await fetchVenueConfig(source);
  return cfg.register;
}
