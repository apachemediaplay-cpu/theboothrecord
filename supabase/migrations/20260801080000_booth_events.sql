-- Unified event log: public.booth_events — ONE table for new event kinds, not a
-- table per event (scan/share/wall/offence_events already exist; they stay as-is,
-- migrating them is a separate job).
--
-- First three event types:
--   share_link    — SHARE VERDICT tapped (the tappable /v/ link)
--   share_card    — POST TO STORY tapped (the PNG card, a dead end)
--   confess_again — CONFESS AGAIN tapped (button ships next batch; logging ready)
--
-- share_link/share_card run ALONGSIDE the existing log_share writes — share_events
-- remains the unbroken historical share series and nothing that reads it changes.
--
-- Pattern follows offence_events exactly: insert-only, RLS on with NO policies,
-- SECURITY DEFINER writer, own is_test + physical flags set on EVERY write (the
-- scan_events miss on is_test is still causing problems — not repeated here).

-- 1. Table. ----------------------------------------------------------------------
create table if not exists public.booth_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  source     text not null default 'direct',
  session_id text,
  is_test    boolean not null default false,
  physical   boolean not null default false,
  meta       jsonb
);

alter table public.booth_events enable row level security;

-- 2. Anon-callable insert. The event_type whitelist lives HERE so a client typo
-- can never silently write garbage — extend the list when a new event ships.
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
  if _event_type not in ('share_link', 'share_card', 'confess_again') then
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
