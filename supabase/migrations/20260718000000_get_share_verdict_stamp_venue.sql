-- get_share_verdict must return stamp_venue.
--
-- WHY: every client read path (save-image card, /v/:id page, the OG image and og:title Cloud
-- Functions) decides whether to stamp the venue from confessions.stamp_venue — but this RPC
-- never selected the column, so `row.stamp_venue` was always undefined and every check
-- (`=== false`) evaluated false. Result: confessions the classifier flagged as illegal
-- (stamp_venue = false) were still rendered WITH the venue name. Subject #800 was the
-- reported case; the fault affected every venue, not just one.
--
-- The clients are now FAIL CLOSED (only an explicit true stamps), so this RPC MUST return the
-- column or no card anywhere will show a venue.
--
-- PARITY NOTE: this function is dashboard-managed (like generate-verdict). This file records
-- the definition that was applied in the Supabase SQL editor so the repo does not misrepresent
-- the live schema. Applying it via the CLI is not the intended path.
--
-- GOTCHAS captured here so this is repeatable:
--   * Adding a column CHANGES THE RETURN TYPE → `create or replace` fails with
--     "cannot change return type of existing function". The drop is mandatory.
--   * Grants do NOT survive the drop and must be re-applied, or anon loses execute and every
--     share page / OG image breaks.
--   * `security definer` + `set search_path = public` must both be preserved. Dropping
--     search_path pinning on a SECURITY DEFINER function reintroduces search_path hijacking.
--   * Recreate as the SAME owner — a SECURITY DEFINER function executes with its owner's
--     privileges, so a different owner silently changes its effective rights. Verify with:
--       select proname, pg_get_userbyid(proowner) from pg_proc where proname = 'get_share_verdict';
--   * Wrapped in a transaction so there is no window where the function does not exist.
--
-- Exposure note: stamp_venue is a moderation signal (was this confession classified illegal).
-- It is now readable by anon for anyone holding the unguessable share uuid. Accepted
-- deliberately — it is a single boolean behind an unguessable id.

begin;

drop function if exists public.get_share_verdict(text);

create function public.get_share_verdict(_id text)
returns table (
  subject_number  bigint,
  confession_text text,
  verdict_text    text,
  source          text,
  stamp_venue     boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select subject_number, confession_text, verdict_text, source, stamp_venue
    from public.confessions
   where id::text = _id
   limit 1;
$$;

-- Re-apply grants destroyed by the drop (mirrors 20260709010000_share_by_uuid.sql).
revoke all on function public.get_share_verdict(text) from public, anon;
grant execute on function public.get_share_verdict(text) to anon;

commit;
