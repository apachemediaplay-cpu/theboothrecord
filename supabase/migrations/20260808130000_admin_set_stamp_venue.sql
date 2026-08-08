-- Venue-tag toggle: admin-gated write of confessions.stamp_venue — whether
-- the share card / share page may name the venue for this row. NULL counts
-- as ON client-side; the console writes an explicit true/false.
--
-- ALREADY RUN BY HAND in the Supabase dashboard — this file is repo
-- parity/history only, not a pending paste.
--
-- Same security model and grant posture as set_homepage_featured
-- (20260717000000): SECURITY DEFINER behind the exact is_admin() gate; anon
-- can't call it, authenticated can but the body rejects non-admins.

create or replace function public.admin_set_stamp_venue(target_id uuid, value boolean)
returns public.confessions
language plpgsql
security definer
set search_path = public
as $$
declare _row public.confessions;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.confessions set stamp_venue = value where id = target_id
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_set_stamp_venue(uuid, boolean) from public, anon;
grant execute on function public.admin_set_stamp_venue(uuid, boolean) to authenticated;
