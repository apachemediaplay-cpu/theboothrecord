-- Wall analytics: is the wall actually read, or do people land and leave?
-- Data layer only. Does NOT touch generate-verdict, create_confession, confessions RLS,
-- moderation, or any existing metric table/RPC. Mirrors scan_tracking exactly:
-- insert-only event table behind SECURITY DEFINER RPCs, admin-gated aggregate read.
--
-- Client contract (src/lib/metrics.ts):
--   * log_wall_view    — once per session on wall mount (sessionStorage-deduped
--     client-side, same marker trick as log_scan). `returning` is a BOOLEAN derived
--     from a local first-seen marker; no identifier is ever transmitted.
--   * mark_wall_engaged — fired only after 15s of cumulative VISIBLE time on the
--     wall (visibility-aware timer). No row update = the visit was a bounce; there
--     is no way to overcount because nothing is written at leave time.

-- 1. Wall views: one row per session that landed on the wall. ------------------
create table if not exists public.wall_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  is_test    boolean not null default false,
  is_returning boolean not null default false,
  engaged    boolean not null default false
);

-- RLS on, NO policies: anon can neither read nor write directly. Same as scan_events.
alter table public.wall_events enable row level security;

-- 2. Anon-callable insert, mirroring log_scan. ---------------------------------
create or replace function public.log_wall_view(
  _session_id text,
  _is_test    boolean default false,
  _returning  boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wall_events (session_id, is_test, is_returning)
  values (
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false),
    coalesce(_returning, false)
  );
end;
$$;

revoke all on function public.log_wall_view(text, boolean, boolean) from public, anon;
grant execute on function public.log_wall_view(text, boolean, boolean) to anon;

-- 3. Engagement flip: the session crossed 15s of visible reading time. ---------
-- Keyed by session_id only (the client never holds a row id). Idempotent; a
-- missing/blank session id is a no-op. Restricted to recent rows so a stale
-- session id replayed much later can't flip an old visit.
create or replace function public.mark_wall_engaged(_session_id text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wall_events
     set engaged = true
   where session_id = nullif(btrim(_session_id), '')
     and engaged = false
     and created_at > now() - interval '1 day';
end;
$$;

revoke all on function public.mark_wall_engaged(text) from public, anon;
grant execute on function public.mark_wall_engaged(text) to anon;

-- 4. Admin-only funnel read for the console's Wall tab. ------------------------
-- Two fixed 7-NIGHT windows (current = tonight-6..tonight, previous = the 7 before),
-- night-bucketed exactly like the existing range RPCs: bucket = (created_at at tz) − 4h,
-- cast to date. Test exclusions match the existing readers: scan/wall/confession rows
-- by their own is_test; share taps by test-session membership (share_events has no
-- is_test column). Confessions count ALL non-test rows regardless of status — a
-- blocked confession was still a confession attempt in the funnel sense.
create or replace function public.admin_wall_funnel(_tz text default 'UTC')
returns table (
  period       text,
  scans        bigint,
  confessions  bigint,
  shares       bigint,
  wall_views   bigint,
  wall_engaged bigint
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
    (select count(*) from public.wall_events w
      where w.is_test = false
        and ((w.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi)::bigint,
    (select count(*) from public.wall_events w
      where w.is_test = false and w.engaged = true
        and ((w.created_at at time zone _tz) - interval '4 hours')::date between b.lo and b.hi)::bigint
  from bounds b
  order by b.period; -- 'current' sorts before 'previous'
end;
$$;

revoke all on function public.admin_wall_funnel(text) from public, anon;
grant execute on function public.admin_wall_funnel(text) to authenticated;
