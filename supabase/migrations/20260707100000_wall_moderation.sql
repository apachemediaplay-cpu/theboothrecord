-- Wall moderation tool: admin-gated read/write over public.confessions.
--
-- Security model (see booth-wall-moderation-plan-2026-07-07):
--   * A hidden /moderate URL is NOT auth. Security lives at the data layer.
--   * All privileged reads/writes go through SECURITY DEFINER RPCs that verify the
--     caller is in public.admins. An unauthenticated or non-admin caller — even one
--     calling the RPC directly with the anon key — gets nothing and writes nothing.
--
-- This migration deliberately does NOT touch public.confessions RLS. It adds NO anon
-- write policy and leaves the "public reads approved only" policy (20260707090000)
-- intact. The moderation-bypass fix stays in place. service_role is not used.
-- confessions.id is uuid; admin_set_status takes uuid accordingly.

-- 1. admins table + is_admin() helper -----------------------------------------
create table if not exists public.admins (
  uid       uuid primary key references auth.users(id) on delete cascade,
  email     text,
  added_at  timestamptz default now()
);

-- RLS on, no policies: no anon/authenticated direct access. Only the SECURITY
-- DEFINER functions below (which run as owner and bypass RLS) can read it.
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where uid = auth.uid());
$$;

-- 2. Read RPC — return rows of a given status to admins only ------------------
create or replace function public.admin_list_confessions(_status text default 'pending')
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
    where (_status is null or status = _status)
    order by created_at desc;
end;
$$;

-- 3. Write RPC — set status, admins only -------------------------------------
-- Allowed set is approve/reject/pending only. 'blocked' is deliberately excluded:
-- it belongs to the gatekeeper's automated block path, not human moderation.
create or replace function public.admin_set_status(_id uuid, _status text)
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
  if _status not in ('approved', 'rejected', 'pending') then
    raise exception 'invalid status: %', _status;
  end if;
  update public.confessions set status = _status where id = _id
  returning * into _row;
  return _row;
end;
$$;

-- 4. Grants (least privilege) -------------------------------------------------
-- anon cannot even call these. authenticated can call, but the body rejects any
-- caller not in public.admins.
revoke all on function public.admin_list_confessions(text) from public, anon;
revoke all on function public.admin_set_status(uuid, text) from public, anon;
grant execute on function public.admin_list_confessions(text) to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
