-- booth_events whitelist: + see_guilty — a SEE THE GUILTY tap (currently logged
-- only from VerdictShare, meta {from:'share'}; Verdict's quiet exit is unlogged).
-- No existing type fits: the share_* family is share taps, and wall_events'
-- log_wall_view records ARRIVALS on the wall, not which link sent them.
-- Same body as 20260801090000 otherwise; same signature, so create-or-replace.
create or replace function public.log_booth_event(
  _event_type text,
  _source     text,
  _session_id text,
  _is_test    boolean default false,
  _physical   boolean default false,
  _meta       jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _event_type not in (
    'share_link', 'share_card', 'confess_again', 'verdict_timeout',
    'verdict_recovery', 'see_guilty'
  ) then
    raise exception 'unknown booth event type: %', coalesce(_event_type, '(null)');
  end if;
  insert into public.booth_events (event_type, source, session_id, is_test, physical, meta)
  values (
    _event_type,
    coalesce(nullif(btrim(_source), ''), 'direct'),
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false),
    coalesce(_physical, false),
    _meta
  );
end;
$$;

revoke all on function public.log_booth_event(text, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.log_booth_event(text, text, text, boolean, boolean, jsonb) to anon;
