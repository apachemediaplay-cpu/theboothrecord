-- HARD delete for confessions: the row is removed from Postgres PERMANENTLY.
-- Not a soft delete, not a flag — deliberate and understood. One row per call;
-- there is deliberately NO bulk path.
--
-- Reference audit (2026-08-06, done before writing this): NOTHING in the
-- database stores a reference to a confession row, so a hard delete strands
-- nothing.
--   * No table carries confession_id or subject_number. share_events,
--     scan_events, wall_events, offence_events and booth_events carry only
--     source / session_id / flags / timestamps.
--   * The /v/{uuid} share link is the confessions row's OWN id —
--     get_share_verdict selects from confessions by id; there is no join
--     table. Deleting the row makes the link resolve to nothing → the
--     notfound screen.
--   * Verdict recovery "claims" a row by stamping session_id on the
--     confessions row itself (recover_verdict) — there is no claims table.
-- Everything else reads confessions at query time and simply reflects the
-- deletion: get_share_verdict / resolve_share_id / recover_verdict return
-- nothing, the wall's client select and the get_wall_funnel counts drop, and
-- get_homepage_verdicts stops returning a deleted featured row.
-- ONE interaction to know about: admin_share_counts and the share-nights RPCs
-- classify a SESSION as test via its is_test confession rows — deleting a
-- test confession can promote that session's share_events back to "real" in
-- the console stats.
--
-- Security model: same shape as admin_delete_venue — SECURITY DEFINER gated
-- by is_admin(), revoked from public/anon, granted to authenticated (the body
-- rejects any authenticated caller not in public.admins). confessions has no
-- delete policy, so this RPC is the only delete path.

create or replace function public.admin_delete_confession(_id uuid)
returns public.confessions
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.confessions;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  delete from public.confessions where id = _id
  returning * into _row;
  if _row.id is null then
    raise exception 'unknown confession: %', _id;
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_delete_confession(uuid) from public, anon;
grant execute on function public.admin_delete_confession(uuid) to authenticated;
