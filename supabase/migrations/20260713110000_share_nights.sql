-- Per-night share counts for the /moderate Metrics panel "By night" section.
-- Data layer only. Does NOT touch generate-verdict, the verdict prompt, the gatekeeper,
-- create_confession, stamp_venue, the topic classifier, confessions RLS, or moderation
-- write paths. Read-only aggregate, admin-gated exactly like admin_share_counts.
--
-- Run in the Supabase SQL editor; this file is repo parity/history.

-- Shares grouped by NIGHT + source. "Night" uses a 4am cutoff so a 1am tap counts toward
-- the previous evening (subtract 4h, then take the date). _tz is the caller's IANA timezone
-- (the moderator's browser zone) so the grouping matches the confessions bucketed client-side
-- in the same zone. Test-session taps excluded the same way as admin_share_counts (share_events
-- has no is_test; a session is "test" iff it produced a confession flagged is_test).
create or replace function public.admin_share_nights(_tz text default 'UTC')
returns table (night date, source text, shares bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select ((e.created_at at time zone _tz) - interval '4 hours')::date,
           coalesce(nullif(btrim(e.source), ''), 'direct'),
           count(*)::bigint
    from public.share_events e
    where e.session_id is null
       or e.session_id not in (
            select c.session_id
            from public.confessions c
            where c.is_test = true and c.session_id is not null
          )
    group by 1, 2;
end;
$$;

revoke all on function public.admin_share_nights(text) from public, anon;
grant execute on function public.admin_share_nights(text) to authenticated;
