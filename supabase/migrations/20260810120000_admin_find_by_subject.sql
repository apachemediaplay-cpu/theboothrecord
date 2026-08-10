-- Exact subject-number lookup for the console search box. The wall's most
-- prominent identifier is #1461, and admin_list_confessions' _q is a text
-- search — so the workflow "read the wall, spot a bad verdict, pull it in
-- the console" had no direct route.
--
-- ADDITIVE, deliberately: a new function rather than a change to the
-- deployed admin_list_confessions — that function is dashboard-managed and
-- on the hot path of every console list load; a tiny exact-match lookup
-- beside it risks nothing. The client calls this only when the query is all
-- digits (with or without a leading #) and applies the tab/venue filters
-- client-side, so search semantics stay per-tab exactly like text search.
--
-- Same security posture as the other admin_* reads: SECURITY DEFINER behind
-- is_admin(), revoked from anon.

create or replace function public.admin_find_by_subject(_subject_number bigint)
returns setof public.confessions
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select * from public.confessions
    where subject_number = _subject_number;
end;
$$;

revoke all on function public.admin_find_by_subject(bigint) from public, anon;
grant execute on function public.admin_find_by_subject(bigint) to authenticated;
