-- booth_events whitelist: + kiosk_qr, kiosk_timeout. The event_type whitelist
-- lives in the RPC (see 20260801080000_booth_events.sql), so a new client event
-- type is inert until this lands — logBoothEvent is fire-and-forget, so an
-- unlisted type fails silently and the kiosk keeps working; it just records
-- nothing.
--
--   kiosk_qr       the handoff QR actually RENDERED on the booth screen. The
--                  kiosk's equivalent of a share — the only signal that the
--                  record left the booth. Fired on render, not on resolve, so
--                  a failed uuid lookup never counts as a handoff.
--   kiosk_timeout  a person walked away and the idle timer reset the booth.
--                  DELIBERATELY SEPARATE from verdict_timeout, which means the
--                  machine failed to answer in time. Merging them would make
--                  the verdict-recovery numbers lie.
--
-- Same body and signature as 20260801100000 otherwise; create-or-replace, and
-- pasting this last always yields the correct final whitelist.
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
    'verdict_recovery', 'see_guilty', 'kiosk_qr', 'kiosk_timeout'
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
