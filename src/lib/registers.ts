import { supabase } from "@/integrations/supabase/client";

// Rotating /confess placeholder sets, one per venue register (venues.register in
// Supabase). Register drives ONLY this placeholder content — never the headline
// (getPrompt), the verdict, or the share card.
//
// DTC is the default AND the fail-safe: no source, unknown source, unknown register,
// or a failed venues lookup all resolve to DTC. Never an error, never an empty set.

export type Register = "social" | "intimate" | "edgy";

const DTC: string[] = [
  "still havent left",
  "said next round then didnt",
  "keep leaving before it costs me",
  "told them i was nearly there",
  "finish faster when i want them out",
  "saved his number under a fake name",
];

const SOCIAL: string[] = [
  "took the last piece i offered around",
  "said im full still eating",
  "picked the place i look best in",
  "topping everyone up but me",
  "loud all night quiet the whole way home",
  "already know who im telling",
];

const INTIMATE: string[] = [
  "ordered the one i cant pronounce",
  "laughed before i heard it",
  "opened the good one on a tuesday",
  "said im not hungry then took his",
  "already telling it in my head",
  "texting someone else under the table",
];

const EDGY: string[] = [
  "didnt come home with who i came with",
  "dressed for the photo not the night",
  "better company three drinks in",
  "blaming the room already",
  "know how this ends ordered another",
  "here for the version that doesnt reply",
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
