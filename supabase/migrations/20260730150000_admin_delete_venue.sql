-- Delete-venue RPC: for MISTAKES AND TEST VENUES ONLY — real venues get deactivated
-- (venues.active = false), never deleted.
--
-- Security model: identical to the other admin_* venue RPCs — SECURITY DEFINER gated
-- by is_admin(), revoked from anon/public; no direct delete policy exists on venues,
-- so this RPC is the only delete path.
--
-- CRITICAL GUARD: refuses to delete a venue that has real confessions. "Real" means
-- coalesce(is_test, false) = false — a NULL is_test counts as REAL (conservative:
-- rows of unknown provenance block deletion). Zero confessions, or only ?test=1
-- rows, may be deleted. This prevents orphaning real data or nuking a live venue.

create or replace function public.admin_delete_venue(_source text)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.venues;
  _real_confessions bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  select count(*) into _real_confessions
    from public.confessions
   where source = _source
     and coalesce(is_test, false) = false;
  if _real_confessions > 0 then
    raise exception 'venue has % confessions, deactivate instead', _real_confessions;
  end if;
  delete from public.venues where source = _source
  returning * into _row;
  if _row.source is null then
    raise exception 'unknown venue: %', _source;
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_delete_venue(text) from public, anon;
grant execute on function public.admin_delete_venue(text) to authenticated;
