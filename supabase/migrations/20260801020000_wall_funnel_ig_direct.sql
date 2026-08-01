-- Wall funnel v2: expose the attribution dimensions collected in wall_events.
-- Adds, per 7-night window:
--   wall_ig_direct        — visits with source='instagram' AND arrival='direct'
--                           (landed on the wall COLD from an IG link; NOT
--                           confessors who came through the booth)
--   wall_returning        — visits where is_returning = true (this browser had
--                           seen the wall in an earlier session)
--   wall_direct           — visits whose FIRST site touch was the wall
--   wall_internal         — visits that passed the consent gate first
--   wall_engaged_direct   — of wall_direct, how many stayed 15s+
--   wall_engaged_internal — of wall_internal, how many stayed 15s+
-- Percentages are computed client-side. Rows from before the attribution
-- migration have arrival = null: counted in wall_views, in neither arrival bucket.
--
-- Return-type change requires DROP + CREATE (create or replace can't alter the
-- row shape). Grants restated identically. Supersedes the earlier single-column
-- wall_ig_direct version of this file — safe to run whether or not that ran.

drop function if exists public.admin_wall_funnel(text);

create or replace function public.admin_wall_funnel(_tz text default 'UTC')
returns table (
  period                text,
  scans                 bigint,
  confessions           bigint,
  shares                bigint,
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
    w.v_views, w.v_engaged, w.v_ig_direct, w.v_returning,
    w.v_direct, w.v_internal, w.v_engaged_direct, w.v_engaged_internal
  from bounds b
  cross join lateral (
    select
      count(*)::bigint                                                        as v_views,
      (count(*) filter (where we.engaged))::bigint                            as v_engaged,
      (count(*) filter (where we.source = 'instagram'
                          and we.arrival = 'direct'))::bigint                 as v_ig_direct,
      (count(*) filter (where we.is_returning))::bigint                       as v_returning,
      (count(*) filter (where we.arrival = 'direct'))::bigint                 as v_direct,
      (count(*) filter (where we.arrival = 'internal'))::bigint               as v_internal,
      (count(*) filter (where we.engaged and we.arrival = 'direct'))::bigint  as v_engaged_direct,
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
