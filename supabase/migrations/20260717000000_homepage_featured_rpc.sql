-- Homepage feature toggle: admin-gated write of confessions.homepage_featured.
--
-- The homepage_featured column and get_homepage_verdicts() already exist. This
-- migration ONLY adds the write RPC. Same security model as wall_moderation
-- (20260707100000): a SECURITY DEFINER function running the EXACT is_admin() gate
-- used by admin_set_status / admin_list_confessions. No new/weakened RLS policy;
-- anon cannot call it. service_role is not used.

create or replace function public.set_homepage_featured(target_id uuid, value boolean)
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
  update public.confessions set homepage_featured = value where id = target_id
  returning * into _row;
  return _row;
end;
$$;

-- Grants (least privilege) — identical posture to admin_set_status: anon can't even
-- call it; authenticated can call, but the body rejects any caller not in public.admins.
revoke all on function public.set_homepage_featured(uuid, boolean) from public, anon;
grant execute on function public.set_homepage_featured(uuid, boolean) to authenticated;
