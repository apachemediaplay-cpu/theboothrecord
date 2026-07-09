// Booth metrics wiring — post-insert row tagging + share-tap logging.
//
// These call the SECURITY DEFINER RPCs (tag_confession / log_share) added in the
// booth_metrics migration. The confession INSERT itself stays in the generate-verdict
// Edge Function (via create_confession) — untouched. Every call here is fire-and-forget:
// a failure must NEVER block the confess/verdict/share flow; it just leaves a soft metric
// unrecorded.
import { supabase } from "@/integrations/supabase/client";
import { getSessionId, isTestSession } from "@/lib/source";

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
    }),
  );
}

// Log a share-button tap — share INTENT only, never destination or reach. Called when
// the ON RECORD button is tapped on the verdict card.
export function logShare(source: string | null | undefined): void {
  fireAndForget(
    rpc("log_share", {
      _source: source ?? "",
      _session_id: getSessionId(),
    }),
  );
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
