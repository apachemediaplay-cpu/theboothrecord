-- Wall attribution: WHO sent the visitor (source) and HOW they reached the wall
-- (arrival). Follow-up to 20260801000000_wall_analytics — collection only; the
-- admin_wall_funnel read and the console display are unchanged.
--
--   source  — the session's venue/campaign slug (same value scan_events stores;
--             'direct' when absent). Names the traffic: instagram, highballcbr, …
--   arrival — 'internal' = this session passed the consent gate before seeing the
--             wall (verdict → SEE THE GUILTY, or wandering back); 'direct' = the
--             wall was the session's FIRST touch of the site (an Instagram wall
--             link, a shared URL, a bookmark). Derived client-side from the
--             booth_scan_logged session marker — no URL param involved, so it
--             can't be stripped or gamed.
--
-- The cross of the two answers "did the Instagram post move people":
--   source=instagram + arrival=direct  → IG post → wall, landed cold.
--   source=instagram + arrival=internal → IG → gate → confessed → wall.
--
-- Existing rows keep null in both columns (pre-attribution data).

alter table public.wall_events
  add column if not exists source  text,
  add column if not exists arrival text;

-- Recreate log_wall_view with the two new parameters. The old 3-arg signature is
-- dropped in the same migration; the new defaults keep any not-yet-redeployed
-- client working (PostgREST matches its 3 named args against the 5-arg function).
drop function if exists public.log_wall_view(text, boolean, boolean);

create or replace function public.log_wall_view(
  _session_id text,
  _is_test    boolean default false,
  _returning  boolean default false,
  _source     text default null,
  _arrival    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wall_events (session_id, is_test, is_returning, source, arrival)
  values (
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false),
    coalesce(_returning, false),
    coalesce(nullif(btrim(_source), ''), 'direct'),
    -- Clamp rather than reject: a bad value degrades to null, never an error —
    -- a metric write must never fail the caller (fire-and-forget contract).
    case when _arrival in ('internal', 'direct') then _arrival else null end
  );
end;
$$;

revoke all on function public.log_wall_view(text, boolean, boolean, text, text) from public, anon;
grant execute on function public.log_wall_view(text, boolean, boolean, text, text) to anon;
