-- FIRST OFFENCE ($55) tap tracking — the app's only commercial signal, previously
-- unmeasured. The link renders on Verdict (post-share) and VerdictShare.
--
-- NEW table rather than reuse: share_events lacks is_test/physical and all its
-- readers aggregate it as "share taps" — mixing event kinds would pollute every
-- share metric. Pattern matches scan_events exactly: insert-only, RLS with no
-- policies, SECURITY DEFINER writer, own is_test + physical flags so venue
-- traffic separates from the operator's.

-- 1. Table. ----------------------------------------------------------------------
create table if not exists public.offence_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source     text not null default 'direct',
  session_id text,
  is_test    boolean not null default false,
  physical   boolean not null default false
);

alter table public.offence_events enable row level security;

-- 2. Anon-callable insert, mirroring log_scan's shape (source, session, flags). --
create or replace function public.log_offence_tap(
  _source     text,
  _session_id text,
  _is_test    boolean default false,
  _physical   boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.offence_events (source, session_id, is_test, physical)
  values (
    coalesce(nullif(btrim(_source), ''), 'direct'),
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false),
    coalesce(_physical, false)
  );
end;
$$;

revoke all on function public.log_offence_tap(text, text, boolean, boolean) from public, anon;
grant execute on function public.log_offence_tap(text, text, boolean, boolean) to anon;

-- 3. Funnel v3: v2's columns + offence_taps (own is_test filter, like scans/wall).
-- Return-type change requires DROP + CREATE; grants restated identically.
drop function if exists public.admin_wall_funnel(text);

create or replace function public.admin_wall_funnel(_tz text default 'UTC')
returns table (
  period                text,
  scans                 bigint,
  confessions           bigint,
  shares                bigint,
  offence_taps          bigint,
  wall_views            bigint,
  wall_engaged          bigint,
  wall_ig_direct        bigint,
  wall_returning        bigint,
  wall_direct           bigint,
  wall_internal         bigint,
  wall_engaged_direct   bigint,
  wall_engaged_internal bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  _tonight date := ((now() at time zone _tz) - interval '4 hours')::date;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
  with bounds as (
    select 'current'::text as period, _tonight - 6 as lo, _tonight as hi
    union all
    select 'previous', _tonight - 13, _tonight - 7
  ),
  test_sessions as (
    select c.session_id
    from public.confessions c
    where c.is_test = true and c.session_id is not null
  )
  select
    b.period,
    (select count(*) from public.scan_events s
      where s.is_test = false
        and ((s.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi)::bigint,
    (select count(*) from public.confessions c
      where c.is_test = false
        and ((c.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi)::bigint,
    (select count(*) from public.share_events e
      where (e.session_id is null
             or e.session_id not in (select ts.session_id from test_sessions ts))
        and ((e.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi)::bigint,
    (select count(*) from public.offence_events o
      where o.is_test = false
        and ((o.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi)::bigint,
    w.v_views, w.v_engaged, w.v_ig_direct, w.v_returning,
    w.v_direct, w.v_internal, w.v_engaged_direct, w.v_engaged_internal
  from bounds b
  cross join lateral (
    select
      count(*)::bigint                                                         as v_views,
      (count(*) filter (where we.engaged))::bigint                             as v_engaged,
      (count(*) filter (where we.source = 'instagram'
                          and we.arrival = 'direct'))::bigint                  as v_ig_direct,
      (count(*) filter (where we.is_returning))::bigint                        as v_returning,
      (count(*) filter (where we.arrival = 'direct'))::bigint                  as v_direct,
      (count(*) filter (where we.arrival = 'internal'))::bigint                as v_internal,
      (count(*) filter (where we.engaged and we.arrival = 'direct'))::bigint   as v_engaged_direct,
      (count(*) filter (where we.engaged and we.arrival = 'internal'))::bigint as v_engaged_internal
    from public.wall_events we
    where we.is_test = false
      and ((we.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi
  ) w
  order by b.period; -- 'current' sorts before 'previous'
end;
$$;

revoke all on function public.admin_wall_funnel(text) from public, anon;
grant execute on function public.admin_wall_funnel(text) to authenticated;
